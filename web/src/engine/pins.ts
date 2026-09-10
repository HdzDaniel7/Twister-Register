/* =========================================================================
   LOS PINES LATERALES — la barra deja de estar libre en el espacio.

   Un pedestal (engine/fixture.ts) sostiene la barra POR ABAJO y no le impide
   moverse. Un pin la sujeta DE LADO: es un poste vertical atornillado a la mesa
   contra el que la barra tiene que tocar, y mientras esté puesto la barra no
   puede irse a donde la mandaría la cinemática.

   QUÉ CAMBIA ESO, que es el motivo entero de este archivo: con la barra libre,
   mover un ángulo mueve todo lo que viene después y ya está. Con la barra
   sujeta, ese movimiento choca contra los pines: la pieza no llega a la forma
   que pide la tabla, se queda en una intermedia, y para quedarse ahí tiene que
   DEFORMARSE elásticamente. Esa deformación no está repartida por igual —se
   concentra donde los vanos entre apoyos son cortos— y si en algún punto pasa
   del límite elástico, la barra ya no vuelve al soltarla: la pieza que sale de
   la máquina no es la que dice el modelo.

   CÓMO SE RESUELVE, y por qué así. La corrección se busca **en el espacio de
   parámetros**, moviendo ángulos y rodados, y no desplazando puntos sueltos.
   Es la misma idea que sostiene la compensación (ver §1 del contexto): así la
   forma que sale es una pieza que la cadena cinemática puede describir, y no
   una nube de puntos que ya no corresponde a ningún comando.

   El reparto entre estaciones lo decide la RIGIDEZ: doblar un tramo corto
   cuesta más energía que doblar uno largo, así que la corrección se va sola a
   donde la barra es más flexible. La energía de una viga con un codo de Δθ
   repartido en una longitud L es `EI·Δθ²/(2L)`, o sea que el peso de cada
   estación es proporcional a `EI/L`.

   **Y aquí hay una propiedad que conviene entender antes de tocar nada: con
   sección constante, la FORMA no depende de E.** El módulo elástico multiplica
   todos los pesos por igual y se cancela en el reparto. E hace falta para pasar
   de ángulos a esfuerzos —momento y tensión— no para saber dónde queda la
   barra. Por eso la geometría se puede dar con confianza y el esfuerzo lleva
   escrito que el material está sin confirmar. Hay una prueba dedicada a esto:
   cambiar E no mueve un solo PI.

   LO QUE ESTO NO ES: no es un cálculo por elementos finitos. No hay contacto
   con fricción, ni pandeo, ni torsión inducida por el amarre, ni plastificación
   parcial de la sección. Es un modelo de vigas con codos elásticos en las
   estaciones que ya existen, que es lo que se puede sostener con los datos que
   hay. Cuando llegue el material confirmado y una pieza medida CON el fixture
   puesto, esto se contrasta contra ella.
   ========================================================================= */
import { Vector3 } from 'three';
import { clamp, solveDense, D2R, R2D } from './math.ts';
import { buildPath, rowLengths, tailStraight } from './kinematics.ts';
import { normalizeModel } from './bend.ts';
import { TABLE_Z, sectionDrop } from './fixture.ts';
import type { Model, PathSample, Section, Pin, Mat, Restraint } from '../types.ts';

/** Un pin recién nacido, y la lista blanca de sus campos escribibles. Mismo
 *  trato que `PED_DEFAULT`: la whitelist del `change` sale de aquí. */
export const PIN_DEFAULT: Readonly<Omit<Pin, 'id' | 'name'>> = Object.freeze({
  visible: true, hold: true, x: 0, y: 0, h: 120, dia: 20,
});

/** El material de la barra. **PROVISIONAL, y lo dice la pantalla.**
 *
 *  Los valores son los de un 6061-T6 de manual, no los de la colada que está en
 *  el taller: sirven para ver DÓNDE se concentra el esfuerzo y para que el
 *  aviso de límite elástico tenga un número contra el que comparar. Para decir
 *  «esta pieza se pasa por 12 MPa» hace falta el certificado del material.
 *
 *  Nada de esto entra en la forma: ver la cabecera. */
export const MAT_DEFAULT: Readonly<Mat> = Object.freeze({
  /** módulo elástico, MPa */
  E: 69000,
  /** límite elástico, MPa */
  yield: 240,
});

export const RESTRAINT_DEFAULT: Readonly<Restraint> = Object.freeze({
  /** apagado por defecto: con los pines quitados el programa se comporta
   *  EXACTAMENTE como antes de que existieran, y eso hay que poder demostrarlo */
  on: false,
  /** ¿el rodado también cede? Un pin lateral empuja en el plano de la mesa;
   *  dejar que el rodado ceda añade dos incógnitas por estación y suele repartir
   *  mejor, pero es una decisión física y por eso se elige */
  doRot: true,
  /** tolerancia de contacto, mm: por debajo de esto se considera que la barra
   *  toca el pin y no hay nada que cerrar */
  tol: 0.05,
  /** amortiguación del reparto. 0 = la corrección se va entera a la estación
   *  más flexible; subirla la reparte entre más estaciones. Es el mismo papel
   *  que la ganancia del lazo: al 100 % de agresividad, oscila */
  damp: 0.15,
  /** iteraciones del solver */
  iters: 6,
});

/** Lo que se deduce de un pin contra la barra. No se guarda: sale del modelo
 *  cada vez que se repinta, igual que `PedFit`. */
export type PinFit = {
  /** longitud desarrollada del punto de la barra que pasa más cerca, mm */
  s: number;
  /** distancia EN PLANTA del eje del pin al eje de la barra, mm */
  plan: number;
  /** lo que hace falta para que se toquen: radio del pin + medio ancho de la
   *  sección visto en planta, mm */
  need: number;
  /** `plan - need`. >0 la barra NO llega al pin (hay aire), <0 el pin está
   *  metido dentro de donde iría la barra y la empuja */
  gap: number;
  /** de qué lado de la barra cae el pin: +1 o −1 sobre la normal en planta */
  side: number;
  /** ¿el pin llega a la altura de la barra? Uno demasiado bajo no sujeta nada */
  reach: boolean;
};

/** Media anchura de la sección medida EN PLANTA y perpendicular a la barra.
 *
 *  No es `width/2` sin más: con la barra de canto lo que asoma de lado es el
 *  espesor, y con la barra de plano es el ancho. Entre medias se reparten, así
 *  que se proyectan las dos direcciones de la sección sobre la normal
 *  horizontal y se suman en valor absoluto — la misma cuenta que
 *  `sectionDrop()` hace en vertical, y por el mismo motivo. */
export function planHalfWidth(q: PathSample, sec: Section, n: Vector3): number {
  return Math.abs((sec.thickness / 2) * q.y.dot(n)) + Math.abs((sec.width / 2) * q.z.dot(n));
}

/** La normal horizontal de la barra en esa muestra: perpendicular al eje,
 *  mirando de lado y contenida en el plano de la mesa. Con la barra vertical no
 *  hay normal horizontal definida y se devuelve `null`. */
export function planNormal(q: PathSample): Vector3 | null {
  const h = new Vector3(q.x.x, q.x.y, 0);
  if (h.lengthSq() < 1e-12) return null;
  h.normalize();
  return new Vector3(-h.y, h.x, 0);
}

/** La muestra a una longitud desarrollada `s`, interpolando entre las dos
 *  vecinas.
 *
 *  Existe porque el solver necesita mirar SIEMPRE el mismo punto de la barra
 *  mientras mueve los ángulos. Buscar cada vez la muestra más cercana al pin
 *  haría que el residuo saltara de una muestra a otra, y un residuo a saltos no
 *  se puede derivar: el jacobiano saldría de ruido y el solver perseguiría su
 *  propia discretización. */
export function sampleAt(samples: PathSample[], s: number): PathSample {
  const n = samples.length;
  if (!n) throw new Error('sampleAt sin muestras');
  if (s <= samples[0].s) return samples[0];
  if (s >= samples[n - 1].s) return samples[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].s <= s) lo = mid; else hi = mid;
  }
  const a = samples[lo], b = samples[hi];
  const t = (b.s - a.s) > 1e-9 ? (s - a.s) / (b.s - a.s) : 0;
  const mix = (u: Vector3, v: Vector3) => u.clone().lerp(v, t).normalize();
  return {
    p: a.p.clone().lerp(b.p, t),
    x: mix(a.x, b.x), y: mix(a.y, b.y), z: mix(a.z, b.z),
    s,
  };
}

/** Qué le pasa a un pin con la barra que tiene al lado.
 *
 *  `samples` viene YA colocada, como en `pedestalFit()`: el pin es físico y le
 *  importa dónde está la pieza de verdad. */
export function pinFit(samples: PathSample[], sec: Section, pin: Pin): PinFit | null {
  if (!samples.length) return null;
  let bi = -1, bd = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const d = Math.hypot(samples[i].p.x - pin.x, samples[i].p.y - pin.y);
    if (d < bd) { bd = d; bi = i; }
  }
  const q = samples[bi];
  const n = planNormal(q);
  const need = pin.dia / 2 + (n ? planHalfWidth(q, sec, n) : sec.width / 2);
  const off = n ? new Vector3(pin.x - q.p.x, pin.y - q.p.y, 0).dot(n) : 0;
  const low = q.p.z - sectionDrop(q, sec);
  return {
    s: q.s, plan: bd, need, gap: bd - need,
    side: off >= 0 ? 1 : -1,
    /* el pin tiene que llegar a la cara de abajo de la barra; por arriba no se
       exige nada, que un pin más alto de la cuenta sujeta igual */
    reach: TABLE_Z + pin.h >= low,
  };
}

/** El hueco en el punto de contacto CONGELADO `s`. Es el residuo que el solver
 *  quiere llevar a cero.
 *
 *  No lleva el lado dentro, y eso no es un olvido: la distancia en planta es
 *  siempre positiva, así que el residuo ya dice lo que hace falta —negativo, el
 *  pin está metido dentro de la barra y la empuja; positivo, sobra aire— sin
 *  que importe por qué lado esté el pin. El lado se guarda en el `PinFit` para
 *  enseñarlo, y para poder ver que un fixture imposible pone la barra al otro
 *  lado del pin: ahí este residuo pasa por cero por el sitio equivocado y se
 *  queda sin cerrar, que es exactamente lo que hay que ver.
 *
 *  Lo que sí se congela es `s`: ver `sampleAt()`. */
function gapAt(samples: PathSample[], sec: Section, pin: Pin, s: number): number {
  const q = sampleAt(samples, s);
  const n = planNormal(q);
  const need = pin.dia / 2 + (n ? planHalfWidth(q, sec, n) : sec.width / 2);
  return Math.hypot(q.p.x - pin.x, q.p.y - pin.y) - need;
}

/** El tramo libre asociado a cada estación, mm: la recta que entra más la que
 *  sale. Es la longitud sobre la que se reparte el codo elástico de esa
 *  estación, y por tanto lo que decide su rigidez. Nunca cero: una estación
 *  entre dos dobleces pegados es rígida, no infinitamente rígida. */
export function stationSpans(model: Model): number[] {
  const L = rowLengths(model);
  const tail = tailStraight(model);
  return model.bends.map((_, i) => {
    const inLen = L[i] ? L[i].straight : 0;
    const outLen = i + 1 < L.length ? L[i + 1].straight : tail;
    return Math.max(10, Math.abs(inLen) + Math.abs(outLen));
  });
}

/** Lo que devuelve `restrain()`. */
export type Restrained = {
  /** la pieza tal como queda sujeta por los pines */
  model: Model;
  /** cuánto cedió cada estación, ° */
  kink: { angle: number; rot: number }[];
  /** curvatura elástica inducida en cada estación, 1/mm */
  curv: number[];
  /** tensión de flexión en la superficie, MPa. Necesita el material */
  stress: number[];
  /** el peor `stress / yield`. >1 significa que la barra no vuelve al soltarla */
  worst: number;
  /** índice de la estación donde está ese peor caso, o −1 */
  worstAt: number;
  /** hueco que quedó sin cerrar en cada pin sujeto, mm */
  res: number[];
  /** ¿se cerraron todos los contactos dentro de la tolerancia? */
  ok: boolean;
  /** iteraciones gastadas */
  iters: number;
  /** los pines que de verdad sujetan, en el orden de `res` */
  held: number[];
};

/** Un resultado vacío: la pieza libre, sin nada que ceder. Es lo que se
 *  devuelve con el amarre apagado o sin pines que sujeten, y por eso `model` es
 *  el mismo objeto que entró — nadie tiene que preguntarse si esto clonó. */
export function restrainedFree(model: Model): Restrained {
  return {
    model,
    kink: model.bends.map(() => ({ angle: 0, rot: 0 })),
    curv: model.bends.map(() => 0),
    stress: model.bends.map(() => 0),
    worst: 0, worstAt: -1, res: [], ok: true, iters: 0, held: [],
  };
}

/** Aplica los deltas de parámetros a una copia del modelo. */
function withDelta(model: Model, du: number[], doRot: boolean): Model {
  const bends = model.bends.map((b, i) => ({
    ...b,
    angle: b.angle + du[doRot ? 2 * i : i],
    rot: doRot ? b.rot + du[2 * i + 1] : b.rot,
  }));
  return normalizeModel({ ...model, bends });
}

/** La pieza tal como la dejan los pines.
 *
 *  Devuelve la forma sujeta y lo que costó llegar a ella. Con `on` apagado, sin
 *  pines o sin contactos que cerrar, devuelve la pieza LIBRE sin tocar un
 *  número: esa igualdad es la que hace seguro el interruptor.
 *
 *  El bucle es un mínimos cuadrados amortiguado (Levenberg): jacobiano
 *  numérico, ecuaciones normales con un término de rigidez, y un paso por
 *  iteración. Con quince estaciones y diez pines el sistema tiene treinta
 *  incógnitas, así que se resuelve denso.
 *
 *  @param place  la transformación que coloca la pieza en la mesa. El fixture
 *                es físico: si la pieza está colocada, los pines la miran ahí. */
export function restrain(model: Model, pins: Pin[], sec: Section,
                         opt: Restraint = RESTRAINT_DEFAULT,
                         mat: Mat = MAT_DEFAULT,
                         place: (s: PathSample[]) => PathSample[] = s => s): Restrained {
  const free = restrainedFree(model);
  if (!opt.on || !model.bends.length) return free;

  const path0 = place(buildPath(model, 8).samples);
  /* Solo sujetan los pines puestos, que llegan a la altura de la barra y que
     además tienen algo que cerrar: uno con hueco a favor no empuja nada. Un pin
     que no toca NO es un error —el fixture puede tener más pines de los que
     esta pieza usa— y por eso se ignora en silencio. */
  const act: { k: number; s: number; side: number; pin: Pin }[] = [];
  pins.forEach((pin, k) => {
    if (!pin.hold) return;
    const f = pinFit(path0, sec, pin);
    if (!f || !f.reach) return;
    if (f.gap > opt.tol) return;
    act.push({ k, s: f.s, side: f.side, pin });
  });
  if (!act.length) return free;

  const doRot = !!opt.doRot;
  const nb = model.bends.length;
  const nu = doRot ? 2 * nb : nb;
  /* Rigidez de cada incógnita: EI/L, con EI constante y por tanto irrelevante
     para el reparto (ver la cabecera). El rodado se toma la mitad de rígido que
     el ángulo: girar el eje mueve la sección de lado, que es la dirección en la
     que la barra es más flexible cuando la sujeta un pin lateral. */
  const span = stationSpans(model);
  const stiff: number[] = [];
  for (let i = 0; i < nb; i++) {
    stiff.push(1 / span[i]);
    if (doRot) stiff.push(0.5 / span[i]);
  }

  const resid = (m: Model): number[] => {
    const p = place(buildPath(m, 8).samples);
    return act.map(a => gapAt(p, sec, a.pin, a.s));
  };

  const du = new Array<number>(nu).fill(0);
  let r = resid(model);
  let it = 0;
  const H = 0.02;                       // grados de perturbación del jacobiano
  for (; it < Math.max(1, opt.iters); it++) {
    if (Math.max(...r.map(Math.abs)) <= opt.tol) break;
    /* Jacobiano numérico: una construcción de trayectoria por incógnita. Es lo
       caro de todo esto y el motivo de que las muestras vayan a 8 por arco. */
    const J: number[][] = [];
    for (let j = 0; j < nu; j++) {
      const dp = [...du];
      dp[j] += H;
      const rp = resid(withDelta(model, dp, doRot));
      J.push(rp.map((v, k) => (v - r[k]) / H));
    }
    /* Ecuaciones normales con el término de rigidez: (JᵀJ + λS) u = −Jᵀ r.
       El λ se escala con la magnitud de JᵀJ para que `damp` signifique lo mismo
       en una pieza de 1.7 m que en un cupón de 200 mm. */
    const A: number[][] = [];
    const b: number[] = [];
    let tr = 0;
    for (let i = 0; i < nu; i++) {
      const row: number[] = [];
      for (let j = 0; j < nu; j++) {
        let acc = 0;
        for (let k = 0; k < r.length; k++) acc += J[i][k] * J[j][k];
        row.push(acc);
      }
      tr += row[i];
      A.push(row);
      let g = 0;
      for (let k = 0; k < r.length; k++) g -= J[i][k] * r[k];
      b.push(g);
    }
    const lam = Math.max(1e-9, (tr / nu)) * Math.max(1e-3, opt.damp);
    for (let i = 0; i < nu; i++) A[i][i] += lam * stiff[i] / (stiff[0] || 1);
    const step = solveDense(A, b);
    if (!step) break;
    /* Paso topado: un salto de más de 5° por iteración no es elasticidad, es el
       solver saliéndose por una dirección mal condicionada. */
    const big = Math.max(...step.map(Math.abs));
    const f = big > 5 ? 5 / big : 1;
    for (let i = 0; i < nu; i++) du[i] += step[i] * f;
    const rn = resid(withDelta(model, du, doRot));
    /* Si el paso empeora, se deshace y se para: sin línea de búsqueda, insistir
       solo gasta iteraciones y se aleja. */
    if (Math.max(...rn.map(Math.abs)) > Math.max(...r.map(Math.abs))) {
      for (let i = 0; i < nu; i++) du[i] -= step[i] * f;
      break;
    }
    r = rn;
  }

  const held = withDelta(model, du, doRot);
  const kink = model.bends.map((_, i) => ({
    angle: du[doRot ? 2 * i : i],
    rot: doRot ? du[2 * i + 1] : 0,
  }));
  /* La curvatura elástica de cada estación: el codo total repartido en su tramo
     libre. Ángulo y rodado se suman en cuadratura porque son dos flexiones en
     planos perpendiculares, no dos números que se puedan sumar. */
  const curv = kink.map((k, i) =>
    Math.hypot(k.angle, k.rot) * D2R / span[i]);
  /* σ = E·c·κ. La fibra más lejana es media sección: con el codo de ángulo
     manda el espesor y con el de rodado manda el ancho, así que se toma la que
     de verdad trabaja en cada estación. No hace falta la inercia: se cancela
     entre el momento y el módulo resistente. */
  const cOf = (k: { angle: number; rot: number }): number =>
    (Math.abs(k.rot) > Math.abs(k.angle) ? sec.width : sec.thickness) / 2;
  const stress = kink.map((k, i) => mat.E * cOf(k) * curv[i]);
  let worst = 0, worstAt = -1;
  stress.forEach((s, i) => {
    const q = mat.yield > 0 ? s / mat.yield : 0;
    if (q > worst) { worst = q; worstAt = i; }
  });
  return {
    model: held, kink, curv, stress, worst, worstAt,
    res: r, ok: Math.max(0, ...r.map(Math.abs)) <= opt.tol, iters: it,
    held: act.map(a => a.k),
  };
}

/** Unos pines de partida: `n` repartidos a lo largo de la barra, tocando de
 *  lado y alternando de lado, que es como se sujeta una barra en un fixture
 *  real — todos del mismo lado la dejarían girar sobre ellos.
 *
 *  Como `seedPedestals()`, no es el fixture bueno: es algo que tocar. */
export function seedPins(samples: PathSample[], sec: Section, n = 4,
                         dia = 20): Omit<Pin, 'id' | 'name'>[] {
  if (!samples.length || n < 1) return [];
  const total = samples[samples.length - 1].s;
  const out: Omit<Pin, 'id' | 'name'>[] = [];
  for (let k = 0; k < n; k++) {
    const f = n === 1 ? 0.5 : 0.1 + 0.8 * k / (n - 1);
    const target = total * f;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const d = Math.abs(samples[i].s - target);
      if (d < bd) { bd = d; bi = i; }
    }
    const q = samples[bi];
    const nrm = planNormal(q) || new Vector3(0, 1, 0);
    const side = k % 2 ? -1 : 1;
    const d = dia / 2 + planHalfWidth(q, sec, nrm);
    out.push({
      x: +(q.p.x + nrm.x * d * side).toFixed(2),
      y: +(q.p.y + nrm.y * d * side).toFixed(2),
      h: +clamp(q.p.z - TABLE_Z + 20, 20, 400).toFixed(2),
      dia, visible: true, hold: true,
    });
  }
  return out;
}

/** El ángulo total que cede una estación, °: es lo que se enseña en la tabla y
 *  lo que hay que comparar con la tolerancia de ángulo. */
export const kinkOf = (k: { angle: number; rot: number }): number =>
  Math.hypot(k.angle, k.rot);

/** Grados de un radián de curvatura por milímetro; solo para la tabla. */
export const curvDeg = (c: number): number => c * R2D;
