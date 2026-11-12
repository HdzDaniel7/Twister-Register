/* =========================================================================
   MEDIR Y CORREGIR POR PUNTOS — la barra que llega a unos PI objetivo.

   El tercer método de la pestaña MEDICIÓN. No se teclea un número por doblez,
   como en «Por ángulos», sino los PI de la barra en el espacio: se parte de
   los de una barra elegida (el TABLERO), se mueven contra los ejes y el motor
   devuelve la barra —avance, rodado y ángulo por doblez— que los alcanza.

   LAS CUATRO CIFRAS DE CADA PI, en el marco del punto de coincidencia:
     nom     el PI de la barra elegida, como está
     edit    lo que se le suma a mano, ΔX ΔY ΔZ: la EDICIÓN del objetivo
     target  nom + edit: dónde se quiere el PI
     meas    opcional: dónde quedó de verdad la pieza doblada con el tablero

   Y lo que sale:
     cmd     el punto que se le pide al motor:
               cmd = target + gain · (nom − meas)      con medida
               cmd = target                            sin medida
             Es la misma idea que el lazo de ángulos: el error que la máquina
             metió con este tablero se supone repetible, así que se pide de
             más lo que faltó. Sin medida se supone que la barra hace lo que se
             le pide.
     got     el PI que de verdad tiene la barra resultante, superpuesta como
             las demás variantes (punto de coincidencia o mejor ajuste)
     resid   |got − cmd|: lo que la barra NO puede alcanzar. No siempre es
             cero, y es a propósito: el tramo que sujeta el punto de
             coincidencia no se puede girar sin girar la pieza entera, y un PI
             movido en una dirección que el doblez no tiene se queda corto.

   EL MARCO. Las coordenadas son las del punto de coincidencia (`frameAtPi()`
   del PI `k`): origen en el PI, X por el tramo que llega desde el amarre. Es
   el marco del útil que sujeta la pieza, y el que mide un brazo apoyado en
   él. Con anclaje «mejor ajuste» no hay punto común y el marco es el de la
   máquina: P0 en el origen, X por la recta de entrada.

   Es puro: no toca ST ni el DOM.
   ========================================================================= */
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { AnchorMode, Bend, Model } from '../types.ts';
import { bendDelta, wrapTurn } from './math.ts';
import { fk, alignModelBranch } from './kinematics.ts';
import { modelFromPoints } from './model.ts';
import { anchorTransform, frameAtPi, kabsch } from './fitting.ts';

export type Xyz = [number, number, number];

/** Cómo se leen los puntos medidos.
 *  'pivot'  tal cual, en el marco del punto de coincidencia.
 *  'best'   se superponen antes por mejor ajuste sobre los nominales (hacen
 *           falta tres o más): para una medida tomada en un marco cualquiera. */
export type PtAlign = 'pivot' | 'best';

/** Qué puede mover el motor para llegar a los PI pedidos.
 *  'all'     avance, rodado y ángulo de cada doblez, y la cola (lo de siempre)
 *  'angles'  solo rodado y ángulo: avances y cola se quedan EXACTAMENTE los del
 *            tablero. Para cuando la máquina no deja tocar las rectas, o no se
 *            quiere: el residuo ya no tiene por qué ser cero (ver `solveAngles()`). */
export type PtDof = 'all' | 'angles';

export type PtInput = {
  /** una edición por PI (P0..PE). Lo que falta cuenta como 0 */
  edits: (Xyz | null | undefined)[];
  /** un punto medido por PI, o null donde no se midió */
  meas: (Xyz | null | undefined)[];
  /** fracción del error medido que se corrige, 0..1 (como la ganancia del lazo) */
  gain: number;
  align: PtAlign;
  /** qué se mueve; por defecto 'all' */
  dof?: PtDof;
  /** la pieza de DISEÑO (la base del tablero, sin sus Δ): contra ella se mide
   *  el error. Sin ella, o con otro número de PI, se mide contra el tablero,
   *  que es lo mismo mientras el tablero no lleve compensación */
  ref?: Model;
};

export type PtRow = {
  i: number;
  nom: Xyz; edit: Xyz; target: Xyz;
  meas: Xyz | null;
  /** meas − nom, después de alinear; null sin medida */
  err: Xyz | null;
  errN: number | null;
  cmd: Xyz; got: Xyz;
  resid: number;
};

export type PtBendRow = {
  i: number;
  board: Bend; res: Bend;
  /** Δ de avance, mm */
  dFeed: number;
  /** Δ de rodado, °, envuelto a (−180, 180] */
  dRot: number;
  /** Δ de ángulo EN SENTIDO DE DOBLEZ del tablero: + dobla más */
  dAngle: number;
};

export type PtResult = {
  rows: PtRow[];
  bends: PtBendRow[];
  /** la barra resultante, en la rama del tablero */
  model: Model;
  dTail: number;
  /** el mayor residuo, mm: si pasa la tolerancia de punto, el objetivo no se alcanza */
  maxResid: number;
  /** el mayor |meas − nom|, mm; 0 sin medida */
  maxErr: number;
  /** cuántos PI tienen medida */
  nMeas: number;
  /** cuántos PI tienen edición distinta de cero */
  nEdit: number;
  /** ¿hubo algo que pedir? Sin ediciones ni medidas el resultado es el tablero */
  changed: boolean;
};

const ZERO: Xyz = [0, 0, 0];
const v3 = (a: Xyz): Vector3 => new Vector3(a[0], a[1], a[2]);
const xyz = (v: Vector3): Xyz => [v.x, v.y, v.z];
const finite3 = (a: unknown): a is Xyz =>
  Array.isArray(a) && a.length === 3 && a.every(x => typeof x === 'number' && isFinite(x));
const isZero = (a: Xyz): boolean => !a[0] && !a[1] && !a[2];

/** ¿El anclaje es un AJUSTE (mejor ajuste o varios puntos) y no un marco
 *  fijo en un PI? En los dos casos las coordenadas van en el marco de la
 *  referencia y la barra resultante se superpone a los puntos pedidos. */
const isFit = (a: AnchorMode): boolean => a === 'best' || a === 'datums';

/** El marco de las coordenadas (ver la cabecera): el del PI `k` con anclaje
 *  por punto de coincidencia; identidad con mejor ajuste. */
export function ptFrame(board: Model, anchor: AnchorMode, k: number): Matrix4 {
  return isFit(anchor) ? new Matrix4() : frameAtPi(board, k);
}

/** Los PI de una barra en el marco del punto de coincidencia. */
export function ptNominal(board: Model, anchor: AnchorMode, k: number): Xyz[] {
  const inv = ptFrame(board, anchor, k).invert();
  return fk(board).pis.map(p => xyz(p.clone().applyMatrix4(inv)));
}

/** Lleva una cadena de puntos a la postura que pide `ik()`: P0 en el origen y
 *  la recta de entrada por +X. El giro es el MÍNIMO que lo consigue: el rollo
 *  alrededor de X no lo fija ningún punto, y el mínimo es el que deja la barra
 *  como estaba cuando la entrada no se tocó. */
function toMachine(P: Vector3[]): Vector3[] {
  const o = P[0].clone();
  const d = P[1].clone().sub(o);
  const q = d.lengthSq() > 1e-18
    ? new Quaternion().setFromUnitVectors(d.normalize(), new Vector3(1, 0, 0))
    : new Quaternion();
  return P.map(p => p.clone().sub(o).applyQuaternion(q));
}

/** EL ROLLO DE LA BARRA. Los puntos fijan P0 y la recta de entrada, pero no
 *  cuánto está girada la barra alrededor de esa recta: girar todos los PI
 *  alrededor de X da la misma forma con otro rodado en el primer doblez. Lo
 *  que lo decide es el útil: la barra resultante se superpone por el punto de
 *  coincidencia (posición Y orientación, sección incluida), y el rollo bueno es
 *  el que deja sus PI más cerca de los pedidos. Con el amarre en P0 sale 0;
 *  con el punto en la punta es el giro entero de la pieza.
 *
 *  Búsqueda en una variable: barrido de 5° y luego sección áurea en la celda
 *  ganadora. Cada evaluación es un ik() + fk() de una veintena de puntos. */
function solveRolled(board: Model, P: Vector3[], cmd: Xyz[], gotOf: (m: Model) => Xyz[], search = true): Model {
  const X = new Vector3(1, 0, 0);
  const build = (phi: number): Model => {
    const q = new Quaternion().setFromAxisAngle(X, phi * Math.PI / 180);
    return alignModelBranch(modelFromPoints(board, P.map(p => p.clone().applyQuaternion(q)), board.bends), board);
  };
  const cost = (phi: number): number => {
    const g = gotOf(build(phi));
    return cmd.reduce((a, c, i) => a + (g[i] ? v3(g[i]).distanceToSquared(v3(c)) : 0), 0);
  };
  if (!search) return build(0);
  let best = 0, bc = cost(0);
  if (bc < 1e-18) return build(0);
  for (let phi = -175; phi <= 180; phi += 5) {
    const c = cost(phi);
    if (c < bc) { bc = c; best = phi; }
  }
  let a = best - 5, b = best + 5;
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = b - g * (b - a), x2 = a + g * (b - a), f1 = cost(x1), f2 = cost(x2);
  for (let it = 0; it < 40 && b - a > 1e-7; it++) {
    if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = cost(x1); }
    else { a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = cost(x2); }
  }
  const phi = (a + b) / 2;
  return build(cost(phi) <= bc ? phi : best);
}

/** SOLO ÁNGULOS. Los avances y la cola se quedan los del tablero, bit a bit, y
 *  se buscan el rodado y el ángulo de cada doblez que dejan los PI lo más cerca
 *  posible de los pedidos: mínimos cuadrados de Σ|got_i − cmd_i|², con el MISMO
 *  `gotOf` que `solveRolled()`, así que punto de coincidencia, varios puntos y
 *  mejor ajuste se leen igual que con todos los grados de libertad.
 *
 *  EL ROLLO no hace falta buscarlo aparte: girar la barra entera alrededor de
 *  la recta de entrada es sumar el mismo giro a todos los ejes absolutos, y
 *  como los ejes acumulan, eso es sumarlo solo al rodado del primer doblez —que
 *  ya es una incógnita—.
 *
 *  Levenberg–Marquardt con jacobiano numérico (diferencias centradas) sobre las
 *  2n incógnitas [rot0, ang0, rot1, ang1, …], en grados. Se arranca del mejor
 *  (por coste) de los `starts`: la solución completa con las rectas devueltas
 *  al tablero suele estar cerca; el tablero mismo es la red. Un doblez recto
 *  deja su rodado sin efecto (columna nula): la amortiguación lo deja quieto.
 *  Al final se reescribe en la rama del tablero (`alignModelBranch`), que no
 *  mueve la pieza, y se reponen avances y cola por si la reescritura los tocara. */
function solveAngles(board: Model, starts: Model[], cmd: Xyz[], gotOf: (m: Model) => Xyz[]): Model {
  const n = board.bends.length;
  const make = (x: number[]): Model => ({
    ...board,
    bends: board.bends.map((b, i) => ({ ...b, rot: x[2 * i], angle: x[2 * i + 1] })),
  });
  const res = (x: number[]): number[] => {
    const g = gotOf(make(x));
    const r: number[] = [];
    cmd.forEach((c, i) => {
      const p = g[i];
      if (p) r.push(p[0] - c[0], p[1] - c[1], p[2] - c[2]); else r.push(0, 0, 0);
    });
    return r;
  };
  const ss = (r: number[]): number => r.reduce((a, v) => a + v * v, 0);

  /* el mejor arranque */
  let x: number[] = [], r: number[] = [], c = Infinity;
  for (const m of starts) {
    const x0 = board.bends.flatMap((b, i) => {
      const s = m.bends[i] || b;
      return [+s.rot || 0, +s.angle || 0];
    });
    const r0 = res(x0), c0 = ss(r0);
    if (c0 < c) { x = x0; r = r0; c = c0; }
  }

  const N = 2 * n, h = 1e-4;
  let lam = 1e-3;
  for (let it = 0; it < 50 && c > 1e-20 && N > 0; it++) {
    /* jacobiano por columnas, centrado */
    const J: number[][] = [];
    for (let j = 0; j < N; j++) {
      const xp = x.slice(), xm = x.slice();
      xp[j] += h; xm[j] -= h;
      const rp = res(xp), rm = res(xm);
      J.push(rp.map((v, k) => (v - rm[k]) / (2 * h)));
    }
    const A: number[][] = J.map(a => J.map(b => a.reduce((s, v, k) => s + v * b[k], 0)));
    const g: number[] = J.map(a => a.reduce((s, v, k) => s + v * r[k], 0));
    let accepted = false, step = 0;
    for (let tries = 0; tries < 10; tries++) {
      const M = A.map((row, i) => row.map((v, j) => (i === j ? v + lam * (v + 1e-6) : v)));
      const dx = solveLin(M, g.map(v => -v));
      const xn = x.map((v, i) => v + dx[i]);
      const rn = res(xn), cn = ss(rn);
      if (cn < c) {
        step = dx.reduce((a, v) => Math.max(a, Math.abs(v)), 0);
        const gain = c - cn;
        x = xn; r = rn; c = cn;
        lam = Math.max(lam / 3, 1e-12);
        accepted = true;
        if (gain < 1e-14 * (1 + c)) step = 0;      // ya no baja: parar
        break;
      }
      lam *= 4;
    }
    if (!accepted || step < 1e-9) break;
  }

  const out = alignModelBranch(make(x.map(v => wrapTurn(v))), board);
  out.bends.forEach((b, i) => { b.feed = board.bends[i].feed; });
  out.tail = board.tail;
  return out;
}

/** A·x = b por eliminación con pivote parcial. Un pivote nulo deja su
 *  incógnita en 0 (no la hay: dirección sin efecto). */
function solveLin(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-300) continue;
    for (let i = c + 1; i < n; i++) {
      const f = M[i][c] / M[c][c];
      if (f) for (let j = c; j <= n; j++) M[i][j] -= f * M[c][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(M[i][i]) < 1e-300) { x[i] = 0; continue; }
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

/** Con 'angles', la solución completa pasa a ser solo un arranque. */
function restrict(board: Model, full: Model, cmd: Xyz[], gotOf: (m: Model) => Xyz[], dof: PtDof): Model {
  if (dof !== 'angles') return full;
  const boardCopy: Model = { ...board, bends: board.bends.map(b => ({ ...b })) };
  return solveAngles(board, [full, boardCopy], cmd, gotOf);
}

/** Dónde quedan los PI de una barra, en el marco de coincidencia.
 *  Con punto de coincidencia: superpuesta al tablero como cualquier variante,
 *  que es lo que hace el útil. Con mejor ajuste: superpuesta a los puntos
 *  PEDIDOS, así el residuo mide solo la forma —contra el tablero repartiría
 *  también lo que se movió a propósito—. Y ahí el rollo no importa: el mejor
 *  ajuste ya absorbe cualquier giro rígido. */
function gotter(board: Model, want: Xyz[], anchor: AnchorMode, k: number): (m: Model) => Xyz[] {
  const inv = ptFrame(board, anchor, k).invert();
  return (m: Model): Xyz[] => {
    const P = fk(m).pis;
    if (isFit(anchor)) {
      const A = kabsch(P, want.map(v3));
      return P.map(p => xyz(p.clone().applyMatrix4(A)));
    }
    const A = anchorTransform(m, board, anchor, k);
    return P.map(p => xyz(p.clone().applyMatrix4(A).applyMatrix4(inv)));
  };
}

/** Los medidos alineados al marco de los nominales. Con 'best' y al menos tres
 *  medidos, mejor ajuste sobre los PI que tienen medida; si no, tal cual. */
function alignMeas(nom: Xyz[], meas: (Xyz | null)[], align: PtAlign): (Xyz | null)[] {
  const idx = meas.map((m, i) => (m ? i : -1)).filter(i => i >= 0);
  if (align !== 'best' || idx.length < 3) return meas;
  const T = kabsch(idx.map(i => v3(meas[i]!)), idx.map(i => v3(nom[i])));
  return meas.map(m => (m ? xyz(v3(m).applyMatrix4(T)) : null));
}

/** La barra que alcanza los PI objetivo. Ver la cabecera.
 *
 *  `board` es la barra elegida (el modelo efectivo de la variante). Los PI son
 *  los suyos: este método no añade ni quita dobleces. El radio y la torsión
 *  de cada doblez se arrastran del tablero, porque los puntos no los dicen. */
export function pointsSolve(board: Model, inp: PtInput, anchor: AnchorMode = 'pivot', k = 0): PtResult {
  const F = ptFrame(board, anchor, k);
  const nom = ptNominal(board, anchor, k);
  const gain = Math.min(1, Math.max(0, isFinite(+inp.gain) ? +inp.gain : 1));
  const edits = nom.map((_, i) => (finite3(inp.edits[i]) ? inp.edits[i] as Xyz : ZERO));
  const rawMeas = nom.map((_, i) => (finite3(inp.meas[i]) ? (inp.meas[i] as Xyz).slice() as Xyz : null));
  /* EL ERROR MEDIDO ES CONTRA EL DISEÑO, no contra el tablero: un tablero que
     ya lleva compensación no es donde debe caer la pieza, y medir contra él
     volvería a pedir lo que ya tiene puesto (auditoría 2026-11-12, PROC-01).
     La corrección se suma al tablero, que es lo que se manda. */
  const refNom = inp.ref ? ptNominal(inp.ref, anchor, k) : nom;
  const des = refNom.length === nom.length ? refNom : nom;
  const meas = alignMeas(des, rawMeas, inp.align);
  const target = nom.map((p, i) => xyz(v3(p).add(v3(edits[i]))));
  const cmd = target.map((t, i) => {
    const m = meas[i];
    return m ? xyz(v3(t).add(v3(des[i]).sub(v3(m)).multiplyScalar(gain))) : t;
  });
  const nMeas = meas.filter(Boolean).length;
  const nEdit = edits.filter(e => !isZero(e)).length;
  const changed = nMeas > 0 || nEdit > 0;

  /* Del marco de coincidencia al de la máquina, y la barra que pasa por ahí.
     Sin nada que pedir se devuelve el tablero tal cual: el ik() de sus propios
     puntos lo reproduce, pero con el redondeo de una ida y vuelta. */
  const gotOf = gotter(board, cmd, anchor, k);
  let model: Model;
  if (!changed) {
    model = { ...board, bends: board.bends.map(b => ({ ...b })) };
  } else {
    model = solveRolled(board, toMachine(cmd.map(c => v3(c).applyMatrix4(F))), cmd, gotOf, !isFit(anchor));
    model = restrict(board, model, cmd, gotOf, inp.dof === 'angles' ? 'angles' : 'all');
  }

  /* Lo que alcanza (ver `gotter()`). */
  const gotPts = gotOf(model);

  const rows: PtRow[] = nom.map((p, i) => {
    const m = meas[i];
    const err = m ? xyz(v3(m).sub(v3(des[i]))) : null;
    const got = gotPts[i] || p;
    return {
      i, nom: p, edit: edits[i], target: target[i], meas: m, err,
      errN: err ? v3(err).length() : null,
      cmd: cmd[i], got, resid: v3(got).distanceTo(v3(cmd[i])),
    };
  });
  const bends: PtBendRow[] = board.bends.map((b, i) => {
    const r = model.bends[i] || b;
    return {
      i, board: b, res: r,
      dFeed: r.feed - b.feed,
      dRot: wrapTurn(r.rot - b.rot),
      dAngle: bendDelta(b.angle, r.angle),
    };
  });
  return {
    rows, bends, model,
    dTail: model.tail - board.tail,
    maxResid: rows.reduce((a, r) => Math.max(a, r.resid), 0),
    maxErr: rows.reduce((a, r) => Math.max(a, r.errN ?? 0), 0),
    nMeas, nEdit, changed,
  };
}

/** La PIEZA MEDIDA como modelo, para darla de alta como cualquier nube: solo
 *  si se midieron TODOS los PI. Alineada igual que en `pointsSolve()` y de
 *  vuelta al marco de la máquina. `null` si falta alguno. Con `dof` 'angles'
 *  las rectas y la cola son las del tablero y solo se leen rodados y ángulos. */
export function measuredFromPoints(board: Model, meas: (Xyz | null | undefined)[], align: PtAlign,
                                   anchor: AnchorMode = 'pivot', k = 0, dof: PtDof = 'all'): Model | null {
  const nom = ptNominal(board, anchor, k);
  const raw = nom.map((_, i) => (finite3(meas[i]) ? meas[i] as Xyz : null));
  if (raw.some(m => !m)) return null;
  const F = ptFrame(board, anchor, k);
  const M = alignMeas(nom, raw, align) as Xyz[];
  const gotOf = gotter(board, M, anchor, k);
  const full = solveRolled(board, toMachine(M.map(m => v3(m).applyMatrix4(F))), M, gotOf, !isFit(anchor));
  return restrict(board, full, M, gotOf, dof);
}
