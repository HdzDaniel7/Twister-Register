/* =========================================================================
   PROCESO SIMULADO, COMPENSACIÓN Y DESVIACIONES — la pieza virtual, el lazo
   de corrección y la comparación de una pieza medida contra su nominal.
   ========================================================================= */
import type {
  Bend, Proc, Orientation, Comp, Model, DatumMode, Deviations, Stat, BendStat,
  SbFit, Springback,
} from '../types.ts';
import { clamp, mulberry32, gauss, wrap180, applyMat } from './math.ts';
import { bendFrom, newBend } from './bend.ts';
import { fk, bendTheta, alignModelBranch } from './kinematics.ts';
import { kabsch } from './fitting.ts';

/* ---------------------------------------------------------- proceso simulado */
export const PROC_DEFAULT: Proc = Object.freeze({
  sbW: 1.6, sbT: 1.0, slip: .12, biasRot: .35,
  noiseA: .04, noiseF: .06, noiseR: .04, seed: 7,
});

/** PIEZA VIRTUAL. Es el único bloque que inventa números: hay que reemplazarlo
 *  por datos reales de GOM en cuanto los haya. */
export function simulate(cmd: Bend[], proc: Proc, ori: Orientation[], noise = true): Bend[] {
  const rnd = mulberry32(proc.seed | 0);
  return cmd.map(b => {
    const n = noise ? 1 : 0;
    /* La recuperación elástica actúa sobre el DOBLEZ, y cuánto depende del
       plano en que se dio: de canto la sección es más rígida que de plano. Con
       la convención LRA eso lo dice el rodado, así que `ori` elige la
       constante y las dos se aplican al mismo `angle`.
       El rodado no dobla nada: no tiene resorte, solo el sesgo del eje C. */
    const i = cmd.indexOf(b);
    const sb = (i < ori.length && ori[i] === 'W') ? proc.sbW : proc.sbT;
    return newBend({
      feed: b.feed * (1 - proc.slip / 100) + n * gauss(rnd) * proc.noiseF,
      rot: b.rot + proc.biasRot + n * gauss(rnd) * proc.noiseR,
      angle: b.angle * (1 - sb / 100) + n * gauss(rnd) * proc.noiseA,
      radius: b.radius,
      twist: b.twist || 0,
      twistLen: b.twistLen || 0,
    });
  });
}

/* ------------------------------------------------- varias piezas medidas --
   Una sola pieza no distingue un doblez sistemáticamente fuera de uno que
   simplemente tuvo mala puntería. Compensar desde una pieza es perseguir
   ruido: se mueve el comando por una dispersión que no se repite y la
   siguiente sale peor. Es el mismo mecanismo por el que una ganancia de 1.0
   oscila.                                                                   */

/** Mediana y dispersión robusta de una muestra.
 *
 *  Mediana y MAD, no media y desviación: un PI mal extraído de la nube produce
 *  un doblez absurdo, y una media se lo traga entero. `sigma` es el MAD
 *  escalado por 1.4826, que sobre una normal estima la misma desviación
 *  estándar de siempre — así la cifra se lee como se espera sin heredar la
 *  fragilidad de la media. */
export function statOf(v: number[]): Stat {
  const a = v.filter(x => isFinite(x)).sort((p, q) => p - q);
  const n = a.length;
  if (!n) return { med: 0, mad: 0, sigma: 0, n: 0 };
  const mid = (b: number[]): number => {
    const h = b.length >> 1;
    return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2;
  };
  const med = mid(a);
  const mad = mid(a.map(x => Math.abs(x - med)).sort((p, q) => p - q));
  return { med, mad, sigma: 1.4826 * mad, n };
}

/** Estadística por doblez sobre varias piezas medidas.
 *
 *  Va hasta el doblez más largo que haya, no hasta el más corto: una pieza
 *  escaneada puede traer menos dobleces, y ahí lo que corresponde es decir que
 *  ese doblez tiene menos muestras (`n`), no tirar las que sí están. */
export function bendStats(pieces: Bend[][]): BendStat[] {
  const len = pieces.reduce((m, p) => Math.max(m, p.length), 0);
  const out: BendStat[] = [];
  for (let i = 0; i < len; i++) {
    const have = pieces.filter(p => i < p.length);
    out.push({
      angle: statOf(have.map(p => p[i].angle)),
      rot: statOf(have.map(p => p[i].rot)),
      feed: statOf(have.map(p => p[i].feed)),
      n: have.length,
    });
  }
  return out;
}

/** La pieza MEDIANA del lote, la que debería consumir el lazo.
 *
 *  Solo llega hasta el doblez más corto: más allá no hay pieza que sostenga la
 *  cuenta y inventar un doblez sería exactamente lo que este cambio evita. El
 *  radio y la torsión se toman de la primera pieza —no se miden, se arrastran—
 *  igual que en measuredModel(). */
export function medianPart(pieces: Bend[][]): Bend[] {
  if (!pieces.length) return [];
  if (pieces.length === 1) return pieces[0].map(b => bendFrom(b));
  const len = pieces.reduce((m, p) => Math.min(m, p.length), Infinity);
  const st = bendStats(pieces);
  const out: Bend[] = [];
  for (let i = 0; i < len; i++) {
    const src = pieces[0][i];
    out.push(newBend({
      feed: st[i].feed.med, rot: st[i].rot.med, angle: st[i].angle.med,
      radius: src.radius, twist: src.twist, twistLen: src.twistLen,
    }));
  }
  return out;
}

/* ------------------------------------------------------- resorte medido --
   `sbW` y `sbT` eran dos deslizadores que solo alimentaban la pieza virtual.
   Con piezas medidas de verdad, el resorte se ESTIMA:

     sb = 100 · (1 − ángulo medido / ángulo comandado)

   separado por orientación, porque doblar contra el ancho y contra el espesor
   no tiene la misma constante elástica.                                     */

/** Estima el resorte a partir de pares (comando, medida).
 *
 *  Devuelve mediana y dispersión por orientación, y además la recta `sb` vs
 *  `ángulo comandado`: si el resorte depende del ángulo, una constante única
 *  miente, y eso hay que decirlo en vez de ajustar en silencio.
 *
 *  Se descartan los dobleces casi rectos (|ángulo| < 1°): ahí la división
 *  amplifica el ruido de medición hasta convertirlo en un resorte inventado.
 */
export function springback(
  samples: { cmd: Bend[]; meas: Bend[] }[], ori: Orientation[],
): Springback {
  const bag: Record<Orientation, { sb: number[]; ang: number[] }> = {
    W: { sb: [], ang: [] }, T: { sb: [], ang: [] },
  };
  for (const s of samples) {
    const n = Math.min(s.cmd.length, s.meas.length, ori.length);
    for (let i = 0; i < n; i++) {
      const a = s.cmd[i].angle;
      if (Math.abs(a) < 1) continue;
      const sb = 100 * (1 - s.meas[i].angle / a);
      if (!isFinite(sb)) continue;
      const b = bag[ori[i] === 'W' ? 'W' : 'T'];
      b.sb.push(sb); b.ang.push(Math.abs(a));
    }
  }
  const fit = (b: { sb: number[]; ang: number[] }): SbFit => {
    const stat = statOf(b.sb);
    /* mínimos cuadrados sobre (ángulo, sb): la pendiente dice cuánto cambia el
       resorte por grado, y r si esa dependencia es real o es dispersión */
    const n = b.sb.length;
    if (n < 3) return { stat, slope: 0, r: 0 };
    const mx = b.ang.reduce((p, q) => p + q, 0) / n;
    const my = b.sb.reduce((p, q) => p + q, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      const dx = b.ang[i] - mx, dy = b.sb[i] - my;
      sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    const slope = sxx > 1e-12 ? sxy / sxx : 0;
    const r = sxx > 1e-12 && syy > 1e-12 ? sxy / Math.sqrt(sxx * syy) : 0;
    return { stat, slope, r };
  };
  return { W: fit(bag.W), T: fit(bag.T) };
}

/* ------------------------------------------------------------- compensación */
export const COMP_DEFAULT: Comp = Object.freeze({
  gainW: .75, gainT: .75, doAngle: true, doRot: false, doFeed: false,
  batch: false,
  /* El rodado no tiene resorte, pero corregirlo entero es deadbeat y oscila
     igual que una ganancia de 1.0 en el ángulo. El avance tampoco se corrige
     con la constante elástica: el deslizamiento es otro fenómeno. */
  gainR: .5, gainF: .5,
  /* Banda muerta y tope, en grados y mm. Los valores son PROVISIONALES: la
     banda debería ser ~1σ de medición y σ todavía no se ha medido (ver A.6 en
     .auditoria/solicitud-datos.md). Mientras tanto se elige por debajo de la
     tolerancia típica de ángulo (0.3°), para no tapar nada que importe. */
  dead: .05, deadFeed: .1,
  maxStep: 5, maxStepFeed: 10,
});

/** Ganancia máxima admisible. Al 100 % el lazo oscila con el ruido de medición
 *  —está medido y escrito en el README— así que el campo no debe dejar pasar
 *  más. No es una preferencia: es el límite de estabilidad. */
export const GAIN_MAX = 1.0;

/** Piezas mínimas para que compensar signifique algo. Con una sola se persigue
 *  la dispersión de esa pieza y la siguiente puede salir peor. */
export const LOOP_MIN_N = 3;

/** Aplica banda muerta y tope a una corrección. El orden importa: primero se
 *  descarta lo que es ruido, después se recorta lo que es demasiado grande para
 *  ser proceso. */
function guard(delta: number, dead: number, max: number): number {
  if (!isFinite(delta)) return 0;
  if (dead > 0 && Math.abs(delta) < dead) return 0;
  if (max > 0 && Math.abs(delta) > max) return Math.sign(delta) * max;
  return delta;
}

/** nuevo_comando = comando_actual + ganancia × (nominal − medido).
 *
 *  No se calcula el arrastre entre dobleces: se regenera la cadena entera, con
 *  lo cual el arrastre queda contenido en el modelo.
 */
export function compensate(cmd: Bend[], nom: Bend[], meas: Bend[], comp: Comp, ori: Orientation[]): Bend[] {
  return cmd.map((b, i) => {
    const o = bendFrom(b);
    if (i >= nom.length || i >= meas.length) return o;   // sin medición: no se toca
    /* El doblez y el rodado son cosas distintas y se corrigen distinto.
       `angle` es el doblez: la ganancia depende del plano en que se dio, que
       es lo que dice `ori`. `rot` es el rodado, un giro del eje C que no tiene
       resorte; se corrige uno a uno y hay que envolverlo a ±180. */
    const g = Math.min((i < ori.length && ori[i] === 'W') ? comp.gainW : comp.gainT, GAIN_MAX);
    const gR = Math.min(comp.gainR ?? COMP_DEFAULT.gainR!, GAIN_MAX);
    const gF = Math.min(comp.gainF ?? COMP_DEFAULT.gainF!, GAIN_MAX);
    const dA = comp.dead ?? COMP_DEFAULT.dead!;
    const dF = comp.deadFeed ?? COMP_DEFAULT.deadFeed!;
    const mA = comp.maxStep ?? COMP_DEFAULT.maxStep!;
    const mF = comp.maxStepFeed ?? COMP_DEFAULT.maxStepFeed!;
    /* La banda muerta se aplica al ERROR, no a la corrección: lo que se decide
       es si la diferencia contra el nominal es señal o ruido. El tope, en
       cambio, va sobre la corrección ya escalada, que es lo que sale hacia la
       máquina. */
    if (comp.doAngle) o.angle = b.angle + guard(g * guard(nom[i].angle - meas[i].angle, dA, 0), 0, mA);
    if (comp.doRot) {
      o.rot = wrap180(b.rot + guard(gR * guard(wrap180(nom[i].rot - meas[i].rot), dA, 0), 0, mA));
    }
    if (comp.doFeed) o.feed = b.feed + guard(gF * guard(nom[i].feed - meas[i].feed, dF, 0), 0, mF);
    return o;
  });
}

/* ------------------------------------------------------------ desviaciones */
/** Compara una pieza medida contra el nominal. datum: 'start' | 'best'. */
export function deviations(model: Model, measModel: Model, datum: DatumMode = 'start'): Deviations {
  /* La comparación es fila contra fila, así que las dos piezas tienen que estar
     escritas en la misma rama o un doblez de canto perfecto se lee como 180 de
     desviación. addDataset() ya lo impone al entrar; esto cubre lo que venga
     por otro camino —un archivo guardado antes de este arreglo— y no cuesta
     nada porque alinear lo ya alineado no cambia nada. Ver alignBranch(). */
  measModel = alignModelBranch(measModel, model);
  const nom = fk(model).pis;
  let P = fk(measModel).pis.map(p => p.clone());
  if (datum === 'best') P = applyMat(kabsch(P, nom), P);
  const m = Math.min(P.length, nom.length);
  const point: number[] = [];
  for (let i = 0; i < m; i++) point.push(P[i].distanceTo(nom[i]));
  /* Una pieza medida puede tener menos dobleces que el nominal (p. ej. si se
     agregó un doblez después de medir). Se compara lo que existe en ambos. */
  const n = Math.min(model.bends.length, measModel.bends.length);
  const angle: number[] = [], rot: number[] = [], feed: number[] = [], theta: number[] = [];
  for (let i = 0; i < n; i++) {
    angle.push(measModel.bends[i].angle - model.bends[i].angle);
    rot.push(wrap180(measModel.bends[i].rot - model.bends[i].rot));
    feed.push(measModel.bends[i].feed - model.bends[i].feed);
    /* `theta` es la desviación del DESVÍO TOTAL del doblez. Es el número
       honesto ahora que un doblez tiene dos componentes: mirar solo `angle`
       daría por bueno un doblez de canto completamente fuera. */
    theta.push(bendTheta(measModel.bends[i]) - bendTheta(model.bends[i]));
  }
  const rms = Math.sqrt(theta.reduce((a, x) => a + x * x, 0) / (n || 1));
  let out = 0;
  for (let i = 0; i < n; i++) {
    if (Math.abs(angle[i]) > model.tol.angle || Math.abs(rot[i]) > model.tol.rot) out++;
  }
  return {
    pis: P, point, angle, rot, feed, theta, rms,
    maxA: theta.reduce((a, x) => Math.max(a, Math.abs(x)), 0),
    tip: point.length ? point[point.length - 1] : 0,
    out,   // un doblez está fuera si CUALQUIERA de sus dos componentes lo está
  };
}

const GRN: number[] = [.247, .839, .549], AMB: number[] = [1, .773, .239], RED: number[] = [1, .302, .369];
/** verde -> ámbar -> rojo. tol = 1x · 2·tol = rojo pleno. */
export function devColor(d: number, tol: number): number[] {
  const r = clamp(Math.abs(d) / (tol || 1), 0, 2);
  const [a, b, f]: [number[], number[], number] = r < 1 ? [GRN, AMB, r] : [AMB, RED, r - 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
/** Desviación interpolada a lo largo de la longitud desarrollada. */
export function devAt(pointDev: number[], s: number, total: number): number {
  const n = pointDev.length;
  if (!n || !(total > 0)) return 0;
  const f = clamp(s / total, 0, 1) * (n - 1);
  const i = Math.floor(f), t = f - i;
  return pointDev[i] * (1 - t) + pointDev[Math.min(i + 1, n - 1)] * t;
}
