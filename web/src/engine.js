/* =========================================================================
   BARCOMP — motor JavaScript.

   Es el MISMO motor que python/barcomp/core.py, con el mismo esquema JSON
   `barcomp/1.0`, así que los archivos van y vienen entre las dos
   implementaciones. Los nombres son camelCase de este lado y snake_case del
   lado Python (fk, ik, orientations, machineFeeds, buildPath, twistSpans,
   simulate, compensate, kabsch).

   Convenciones cerradas (idénticas al motor Python):
     · milímetros y grados en el modelo y en el JSON; radianes solo aquí dentro
     · sistema derecho, regla de la mano derecha
     · marco local: x = eje de la barra · y = espesor · z = ancho
     · bends[0].feed es la recta de entrada, no un avance entre dobleces
     · tail es la recta de salida tras el último doblez
     · fk() devuelve n+2 puntos: P0 + n PIs + extremo libre
     · la cadena es  T <- T · Trans(feed,0,0) · Ry(rot) · Rz(angle) · Rx(twist)

   DOS DOBLECES POR ESTACIÓN, NO UN GIRO Y UN DOBLEZ
   -------------------------------------------------
   `rot` (R) NO rueda la barra: es el doblez de CANTO. Gira alrededor de `y`
   (el espesor) y desvía la barra a lo largo de `z` (el ancho).
   `angle` es el doblez de PLANO: gira alrededor de `z` (el ancho) y desvía la
   barra a lo largo de `y` (el espesor).
   `twist` sigue siendo la única torsión sobre el eje de la barra.

   Esto se aparta de la convención LRA/YBC de la industria (donde el segundo
   parámetro es el rodado de la pieza entre dobleces) y fue decisión explícita
   del usuario.

   Un PI es UN vértice y por lo tanto UN arco: `radius` es el radio de esa
   herramienta circular. Cuando el doblez lleva las dos componentes, el arco se
   inscribe en el plano compuesto — ver bendDecomp().
   ========================================================================= */
import { Matrix4, Vector3, Quaternion } from 'three';

export const SCHEMA = 'barcomp/1.0';
export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;

/* --------------------------------------------------------------- utilidades */
export const wrap180 = a => ((a + 180) % 360 + 360) % 360 - 180;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const wrapPi = a => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

/** PRNG portado exacto en los dos motores: misma semilla, misma pieza virtual. */
export function mulberry32(a) {
  a |= 0;
  return function () {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function gauss(rnd) {
  let u = 0, v = 0;
  while (!u) u = rnd();
  while (!v) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* -------------------------------------------------------------- matrices 4x4 */
export const eye = () => new Matrix4();
export const trans = (x, y = 0, z = 0) => new Matrix4().makeTranslation(x, y, z);
export const rotX = a => new Matrix4().makeRotationX(a);
export const rotY = a => new Matrix4().makeRotationY(a);
export const rotZ = a => new Matrix4().makeRotationZ(a);
export const rotAxis = (axis, a) => new Matrix4().makeRotationAxis(axis, a);
export const posOf = M => new Vector3().setFromMatrixPosition(M);
export function basisOf(M) {
  const x = new Vector3(), y = new Vector3(), z = new Vector3();
  M.extractBasis(x, y, z);
  return [x, y, z];
}
/** Aplica una transformación rígida a una lista de puntos (copia). */
export const applyMat = (M, pts) => pts.map(p => p.clone().applyMatrix4(M));

/* ------------------------------------------------------------------ modelo */
export const BEND_DEFAULT = Object.freeze({
  feed: 100, rot: 0, angle: 30, radius: 30, twist: 0, twistLen: 0,
});
const BEND_KEYS = Object.keys(BEND_DEFAULT);

export function newBend(o = {}) {
  const b = { ...BEND_DEFAULT };
  for (const k of BEND_KEYS) if (o[k] !== undefined && o[k] !== null) b[k] = +o[k];
  return b;
}
export const bendFrom = o => newBend(o || {});

/** Rellena defaults de un modelo venido de JSON (quizá sin twistLen). */
export function normalizeModel(m) {
  const o = m || {};
  return {
    ...o,
    name: o.name ?? 'MODELO',
    section: { width: 40, thickness: 12, chamfer: 1.2, endLen: 20, ...(o.section || {}) },
    tol: { angle: .3, rot: .5, feed: .5, point: 1.0, ...(o.tol || {}) },
    tail: o.tail ?? 150,
    bends: (o.bends || []).map(bendFrom),
  };
}
export const cloneModel = m => normalizeModel(JSON.parse(JSON.stringify(m)));

export function emptyModel() {
  return normalizeModel({
    name: 'MODELO-01',
    section: { width: 40, thickness: 12, chamfer: 1.2, endLen: 20 },
    tol: { angle: .3, rot: .5, feed: .5, point: 1.0 },
    tail: 150,
    bends: [newBend({ feed: 150, rot: 0, angle: 30, radius: 30 }),
            newBend({ feed: 120, rot: 40, angle: 0, radius: 45 })],
  });
}

/** Réplica bit a bit de demo_model() de core.py (mismo PRNG, misma semilla). */
export function demoModel() {
  const r = mulberry32(20240822);
  // 1 de cada 3 estaciones va de canto (R) y el resto de plano (angle);
  // ninguna lleva las dos, que es como trabaja una dobladora real.
  const sign = [1, -1, -1, 1, 1, -1, 1, 1, -1, -1, 1, -1, 1, 1, -1];
  const bends = [];
  for (let i = 0; i < 15; i++) {
    const canto = (i % 3 === 1);
    const ang = Math.round((16 + r() * 54) * 10) / 10 * sign[i];
    bends.push(newBend({
      feed: i === 0 ? 140 : Math.round(80 + r() * 70),
      rot: canto ? ang : 0,
      angle: canto ? 0 : ang,
      // doblar de canto pide herramental más grande
      radius: canto ? 45 : 30,
      twist: 0,
    }));
  }
  return normalizeModel({
    name: 'DEMO-1700 · barra 15 dobleces',
    section: { width: 40, thickness: 12, chamfer: 1.2, endLen: 20 },
    tol: { angle: .3, rot: .5, feed: .5, point: 1.0 },
    tail: 160, bends,
  });
}

/* --------------------------------------------------------------- cinemática */
/** Cinemática directa -> n+2 puntos PI y los marcos de cada doblez. */
export function fk(model) {
  let T = eye();
  const pis = [posOf(T)], frames = [T.clone()];
  for (const b of model.bends) {
    T = T.multiply(trans(b.feed));
    pis.push(posOf(T));
    T = T.multiply(rotY(b.rot * D2R)).multiply(rotZ(b.angle * D2R));
    if (b.twist) T = T.multiply(rotX(b.twist * D2R));
    frames.push(T.clone());
  }
  T = T.multiply(trans(model.tail));
  pis.push(posOf(T));
  return { pis, frames, end: T.clone() };
}

/** Cinemática inversa: puntos PI -> parámetros. Inversa exacta de fk.
 *
 *  Con dos dobleces perpendiculares la inversa sale en forma cerrada y no hace
 *  falta arrastrar normales entre estaciones: la dirección de salida, escrita
 *  en el marco de entrada, es
 *
 *      d = Ry(rot)·Rz(angle)·x = (cos angle·cos rot, sin angle, -cos angle·sin rot)
 *
 *  de donde  angle = asin(d_y)  y  rot = atan2(-d_z, d_x).
 */
export function ik(points, radii) {
  const P = points, n = P.length - 2, bends = [];
  let F = eye(), prevRot = 0;
  for (let i = 1; i <= n; i++) {
    const fe = P[i].distanceTo(P[i - 1]);
    const w = P[i + 1].clone().sub(P[i]);
    const nw = w.length();
    if (nw) w.divideScalar(nw);
    const R = new Matrix4().extractRotation(F);      // marco de entrada
    const d = w.clone().applyMatrix4(new Matrix4().copy(R).transpose());
    const ang = Math.asin(clamp(d.y, -1, 1)) * R2D;
    const rot = Math.abs(Math.cos(ang * D2R)) < 1e-9   // singularidad: angle = ±90°
      ? prevRot
      : Math.atan2(-d.z, d.x) * R2D;
    bends.push(newBend({
      feed: fe, rot, angle: ang,
      radius: (radii && radii[i - 1] !== undefined) ? +radii[i - 1] : 30,
    }));
    F = F.multiply(rotY(rot * D2R)).multiply(rotZ(ang * D2R));
    prevRot = rot;
  }
  return { bends, tail: P[n + 1].distanceTo(P[n]) };
}

/** Componente DOMINANTE de cada doblez: 'T' plano · 'W' de canto.
 *
 *  Ya no se acumula nada: cada doblez lleva sus dos componentes a la vez
 *  (`angle` de plano y `rot` de canto) y esto solo dice cuál manda, para
 *  etiquetar la tabla y elegir la ganancia del avance. El resorte y las
 *  ganancias de ángulo se aplican por componente, no por doblez.
 */
export const orientations = model =>
  model.bends.map(b => (Math.abs(b.rot) > Math.abs(b.angle) ? 'W' : 'T'));

/** Parte el doblez compuesto en {axis, theta, psi}.
 *
 *  Un PI es un vértice y una estación es una herramienta: por eso el par
 *  Ry(rot)·Rz(angle) se traza como UN arco, no como dos. El arco gira alrededor
 *  de su propio eje `n` (perpendicular al eje de la barra), que es lo único que
 *  NO rueda la sección:
 *
 *      Ry(rot)·Rz(angle)  ==  Rot(n, theta) · Rx(psi)
 *
 *  · axis   vector unitario del arco, en el marco local de entrada
 *  · theta  ángulo total de desvío, siempre >= 0; es el que se inscribe con
 *           `radius`, o sea el que ve la herramienta
 *  · psi    rodado residual, que solo aparece cuando el doblez lleva las dos
 *           componentes a la vez. Con una sola componente vale 0 exacto — que
 *           es el caso normal, y por eso la sección no se voltea en pantalla.
 */
export function bendDecomp(b) {
  const Rb = rotY(b.rot * D2R).multiply(rotZ(b.angle * D2R));
  const e = Rb.elements;                               // column-major
  const d = new Vector3(e[0], e[1], e[2]);             // primera columna = eje x
  const lat = Math.hypot(d.y, d.z);
  if (lat < 1e-12) {                    // sin desvío: solo puede quedar rodado
    // Rb[2][1] = e[6], Rb[1][1] = e[5]
    return { axis: new Vector3(0, 0, 1), theta: 0, psi: Math.atan2(e[6], e[5]) };
  }
  const theta = Math.atan2(lat, clamp(d.x, -1, 1));
  const axis = new Vector3(0, -d.z, d.y).divideScalar(lat);
  const B = rotAxis(axis, theta);
  const Mres = new Matrix4().extractRotation(B).transpose()
    .multiply(new Matrix4().extractRotation(Rb));
  const m = Mres.elements;
  return { axis, theta, psi: Math.atan2(m[6], m[5]) };
}

/** Ángulo total de desvío del doblez, en grados. Es lo que ve la herramienta:
 *  con una sola componente coincide con |angle| o con |rot|. */
export const bendTheta = b => bendDecomp(b).theta * R2D;

export const trimOf = b => (b.radius || 0) * Math.tan(bendDecomp(b).theta / 2);

/** Avance tangente-a-tangente. Negativo o < 25 mm = los herramentales chocan. */
export const machineFeeds = model =>
  model.bends.map((b, i) => b.feed - trimOf(b) - (i ? trimOf(model.bends[i - 1]) : 0));

/** Recta disponible (tangencia a tangencia) para repartir la torsión de i. */
export function twistSpanOf(model, i) {
  const B = model.bends;
  if (i < 0 || i >= B.length) return 0;
  return i < B.length - 1
    ? B[i + 1].feed - trimOf(B[i + 1]) - trimOf(B[i])
    : model.tail - trimOf(B[i]);
}
export function twistZone(len, twLen) {
  if (!(len > 0)) return 0;
  return (twLen > 0 && twLen < len) ? twLen : len;
}
/** Reparte una torsión sobre un tramo recto.
 *
 *  Devuelve [[Δlongitud, Δtwist_rad], ...]; la zona de `twLen` mm queda
 *  CENTRADA en la recta y el resto sale sin torsión. twLen<=0 o >=len = toda la
 *  recta. La suma vale siempre [len, tw]: el marco final coincide con el de
 *  fk() pase lo que pase, porque Rx conmuta con Trans(x).
 */
export function twistSpans(len, twDeg, twLen) {
  const tw = (twDeg || 0) * D2R;
  if (!tw || !(len > 1e-9)) return [[len, tw]];
  const z = twistZone(len, twLen), lead = (len - z) / 2;
  const n = clamp(Math.ceil(Math.abs(twDeg) / 5), 8, 72);
  const out = [];
  if (lead > 1e-9) out.push([lead, 0]);
  for (let k = 0; k < n; k++) out.push([z / n, tw / n]);
  if (lead > 1e-9) out.push([lead, 0]);
  return out;
}

/** Trayectoria muestreada del eje neutro: rectas + arcos + torsión repartida.
 *  samples[i] = {p, x, y, z, s} */
export function buildPath(model, arcSeg = 12) {
  const S = [];
  let F = eye(), s = 0;
  const push = (M, sv) => {
    const [x, y, z] = basisOf(M);
    S.push({ p: posOf(M), x, y, z, s: sv });
  };
  push(F, 0);
  const B = model.bends;

  const runStraight = (len, twDeg, twLen, s0) => {
    let acc = 0, twAcc = 0;
    for (const [dl, dt] of twistSpans(len, twDeg, twLen)) {
      acc += dl; twAcc += dt;
      push(F.clone().multiply(trans(acc)).multiply(rotX(twAcc)), s0 + acc);
    }
    F = F.multiply(trans(len)).multiply(rotX((twDeg || 0) * D2R));
  };

  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    const { axis, theta: th, psi } = bendDecomp(b);
    const R = b.radius || 0;
    const straight = b.feed - trimOf(b) - (i ? trimOf(B[i - 1]) : 0);
    runStraight(straight, i ? (B[i - 1].twist || 0) : 0,
                i ? (B[i - 1].twistLen || 0) : 0, s);
    s += straight;
    /* dirección de deflexión: hacia donde barre el eje de la barra. El centro
       del arco está a `radius` por ahí, y girar alrededor de `axis` no rueda la
       sección — que es justo lo que se busca. */
    const chat = axis.clone().cross(new Vector3(1, 0, 0));
    const rotF = new Matrix4().extractRotation(F);
    const ctr = posOf(F).add(chat.clone().applyMatrix4(rotF).multiplyScalar(R));
    for (let k = 1; k <= arcSeg; k++) {
      const u = th * k / arcSeg;
      const G = F.clone().multiply(rotAxis(axis, u));
      const rg = new Matrix4().extractRotation(G);
      G.setPosition(ctr.clone().sub(chat.clone().applyMatrix4(rg).multiplyScalar(R)));
      push(G, s + R * u);
    }
    s += R * th;
    F = F.multiply(rotAxis(axis, th));
    const rf = new Matrix4().extractRotation(F);
    F.setPosition(ctr.clone().sub(chat.clone().applyMatrix4(rf).multiplyScalar(R)));
    if (psi) F = F.multiply(rotX(psi));   // rodado residual del doblez compuesto
  }

  const tailLen = model.tail - (B.length ? trimOf(B[B.length - 1]) : 0);
  const last = B.length ? B[B.length - 1] : null;
  runStraight(tailLen, last ? (last.twist || 0) : 0,
              last ? (last.twistLen || 0) : 0, s);
  s += tailLen;
  return { samples: S, total: s };
}

/** Longitud desarrollada (mm) del centro del arco de cada doblez. Es la abscisa
 *  que usa la cinta inferior para colocar cada columna. */
export function bendStations(model) {
  let s = 0;
  const out = [], B = model.bends;
  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    s += b.feed - trimOf(b) - (i ? trimOf(B[i - 1]) : 0);
    const R = b.radius || 0, th = bendDecomp(b).theta;
    out.push(s + R * th / 2);
    s += R * th;
  }
  return out;
}

/* --------------------------------------------------------------- alineación */
/* Jacobi para matrices simétricas n×n — sin numpy de este lado. */
function jacobi(Ain, n) {
  const A = Ain.map(r => r.slice());
  const Vv = [...Array(n)].map((_, i) => [...Array(n)].map((_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-20) break;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-18) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - s * b; A[k][q] = s * a + c * b; }
      for (let k = 0; k < n; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - s * b; A[q][k] = s * a + c * b; }
      for (let k = 0; k < n; k++) { const a = Vv[k][p], b = Vv[k][q]; Vv[k][p] = c * a - s * b; Vv[k][q] = s * a + c * b; }
    }
  }
  return { vals: A.map((r, i) => r[i]), vecs: Vv };
}

/** Transformación rígida 4x4 que lleva P (medido) sobre Q (nominal).
 *  Cuaterniones (Horn) + Jacobi 4×4: el equivalente del SVD de numpy. */
export function kabsch(P, Q) {
  const n = Math.min(P.length, Q.length);
  const pc = new Vector3(), qc = new Vector3();
  for (let i = 0; i < n; i++) { pc.add(P[i]); qc.add(Q[i]); }
  pc.divideScalar(n || 1); qc.divideScalar(n || 1);
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) {
    const p = [P[i].x - pc.x, P[i].y - pc.y, P[i].z - pc.z];
    const q = [Q[i].x - qc.x, Q[i].y - qc.y, Q[i].z - qc.z];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) S[a][b] += p[a] * q[b];
  }
  const [Sxx, Sxy, Sxz] = S[0], [Syx, Syy, Syz] = S[1], [Szx, Szy, Szz] = S[2];
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz]];
  const { vals, vecs } = jacobi(N, 4);
  let mi = 0;
  for (let i = 1; i < 4; i++) if (vals[i] > vals[mi]) mi = i;
  const q = new Quaternion(vecs[1][mi], vecs[2][mi], vecs[3][mi], vecs[0][mi]).normalize();
  const M = new Matrix4().makeRotationFromQuaternion(q);
  M.setPosition(qc.clone().sub(pc.clone().applyMatrix4(M)));
  return M;
}

/* ---------------------------------------------------------- proceso simulado */
export const PROC_DEFAULT = Object.freeze({
  sbW: 1.6, sbT: 1.0, slip: .12, biasRot: .35,
  noiseA: .04, noiseF: .06, noiseR: .04, seed: 7,
});

/** PIEZA VIRTUAL. Es el único bloque que inventa números: hay que reemplazarlo
 *  por datos reales de GOM en cuanto los haya. */
export function simulate(cmd, proc, ori, noise = true) {
  const rnd = mulberry32(proc.seed | 0);
  return cmd.map(b => {
    const n = noise ? 1 : 0;
    /* el resorte va POR COMPONENTE: doblar de canto y de plano tienen
       constantes elásticas distintas y ahora ambas viven en el mismo doblez */
    return newBend({
      feed: b.feed * (1 - proc.slip / 100) + n * gauss(rnd) * proc.noiseF,
      rot: b.rot * (1 - proc.sbW / 100) + proc.biasRot + n * gauss(rnd) * proc.noiseR,
      angle: b.angle * (1 - proc.sbT / 100) + n * gauss(rnd) * proc.noiseA,
      radius: b.radius,
      twist: b.twist || 0,
      twistLen: b.twistLen || 0,
    });
  });
}

/* ------------------------------------------------------------- compensación */
export const COMP_DEFAULT = Object.freeze({
  gainW: .75, gainT: .75, doAngle: true, doRot: false, doFeed: false,
});

/** nuevo_comando = comando_actual + ganancia × (nominal − medido).
 *
 *  No se calcula el arrastre entre dobleces: se regenera la cadena entera, con
 *  lo cual el arrastre queda contenido en el modelo.
 */
export function compensate(cmd, nom, meas, comp, ori) {
  return cmd.map((b, i) => {
    const o = bendFrom(b);
    if (i >= nom.length || i >= meas.length) return o;   // sin medición: no se toca
    /* ganancia por COMPONENTE: gainT corrige el doblez de plano (`angle`) y
       gainW el de canto (`rot`), sin importar cuál domine. */
    if (comp.doAngle) o.angle = b.angle + comp.gainT * (nom[i].angle - meas[i].angle);
    if (comp.doRot) o.rot = b.rot + comp.gainW * (nom[i].rot - meas[i].rot);
    if (comp.doFeed) {
      const g = (i < ori.length && ori[i] === 'W') ? comp.gainW : comp.gainT;
      o.feed = b.feed + g * (nom[i].feed - meas[i].feed);
    }
    return o;
  });
}

/* ------------------------------------------------------------ desviaciones */
/** Compara una pieza medida contra el nominal. datum: 'start' | 'best'. */
export function deviations(model, measModel, datum = 'start') {
  const nom = fk(model).pis;
  let P = fk(measModel).pis.map(p => p.clone());
  if (datum === 'best') P = applyMat(kabsch(P, nom), P);
  const m = Math.min(P.length, nom.length);
  const point = [];
  for (let i = 0; i < m; i++) point.push(P[i].distanceTo(nom[i]));
  /* Una pieza medida puede tener menos dobleces que el nominal (p. ej. si se
     agregó un doblez después de medir). Se compara lo que existe en ambos. */
  const n = Math.min(model.bends.length, measModel.bends.length);
  const angle = [], rot = [], feed = [], theta = [];
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

const GRN = [.247, .839, .549], AMB = [1, .773, .239], RED = [1, .302, .369];
/** verde -> ámbar -> rojo. tol = 1x · 2·tol = rojo pleno. */
export function devColor(d, tol) {
  const r = clamp(Math.abs(d) / (tol || 1), 0, 2);
  const [a, b, f] = r < 1 ? [GRN, AMB, r] : [AMB, RED, r - 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
/** Desviación interpolada a lo largo de la longitud desarrollada. */
export function devAt(pointDev, s, total) {
  const n = pointDev.length;
  if (!n || !(total > 0)) return 0;
  const f = clamp(s / total, 0, 1) * (n - 1);
  const i = Math.floor(f), t = f - i;
  return pointDev[i] * (1 - t) + pointDev[Math.min(i + 1, n - 1)] * t;
}

/* ===================================================================
   VARIANTES — varios modelos comparables sobre la misma referencia
   ===================================================================
   Una variante = valores BASE + una columna de DELTAS por parámetro. El modelo
   efectivo es base + delta, y es lo único que ve la cinemática. Separarlos
   permite escribir la compensación al lado del dato sin perder el valor
   original, y volver a cero con un clic.                                    */
export const DELTA_KEYS = ['feed', 'rot', 'angle', 'radius', 'twist', 'twistLen'];

export const zeroDelta = () => Object.fromEntries(DELTA_KEYS.map(k => [k, 0]));
export const zeroDeltas = n => [...Array(Math.max(0, n | 0))].map(zeroDelta);

export function newVariant(model, name, color = '#3FA9F5', vid = 'v1') {
  const m = normalizeModel(model);
  return {
    id: vid, name: name || m.name || 'MODELO', color, visible: true,
    base: m, deltas: zeroDeltas(m.bends.length), tailDelta: 0,
  };
}
/** Copia independiente: base y deltas se duplican, nada queda compartido. */
export function cloneVariant(v, name, color, vid) {
  const w = JSON.parse(JSON.stringify(v));
  w.id = vid || (v.id + 'c');
  w.name = name || (v.name + ' (copia)');
  if (color) w.color = color;
  return w;
}
/** Ajusta la lista de deltas al número de dobleces de la base. */
export function syncDeltas(v) {
  const n = v.base.bends.length;
  const d = (v.deltas || []).slice(0, n);
  while (d.length < n) d.push(zeroDelta());
  v.deltas = d.map(x => Object.fromEntries(DELTA_KEYS.map(k => [k, +(x?.[k] || 0)])));
  return v;
}
/** base + deltas. Es el modelo que se dibuja y se mide. */
export function effectiveModel(v) {
  syncDeltas(v);
  const m = cloneModel(v.base);
  m.bends.forEach((b, i) => {
    const d = v.deltas[i];
    for (const k of DELTA_KEYS) b[k] = +b[k] + (+d[k] || 0);
  });
  m.tail = +m.tail + (+v.tailDelta || 0);
  m.name = v.name ?? m.name;
  return m;
}
/** Funde los deltas en la base y los deja en cero. Sin vuelta atrás. */
export function bakeDeltas(v) {
  const m = effectiveModel(v);
  v.base = m;
  v.deltas = zeroDeltas(m.bends.length);
  v.tailDelta = 0;
  return v;
}
export const hasDeltas = v =>
  (v.deltas || []).some(d => DELTA_KEYS.some(k => d[k])) || !!v.tailDelta;

/* ------------------------------------------------------------------ anclaje */
/** Transformación rígida que fija UN extremo común entre variantes.
 *
 *  'start'  el extremo de amarre (P0) ya es común: fk() arranca todas en el
 *           origen con el mismo marco, así que no hace falta mover nada.
 *  'end'    el extremo LIBRE queda común: se lleva el marco final de `model`
 *           sobre el de `ref`, con lo cual la punta maquinada coincide en
 *           posición Y orientación y la divergencia se ve acumulándose hacia el
 *           amarre. Es el anclaje útil cuando el criterio de aceptación es la
 *           posición del extremo maquinado.
 *  'best'   mejor ajuste global de los PI (Kabsch). Reparte el error.
 */
export function anchorTransform(model, ref, mode = 'start') {
  if (mode === 'end') {
    return new Matrix4().multiplyMatrices(fk(ref).end, fk(model).end.clone().invert());
  }
  if (mode === 'best') return kabsch(fk(model).pis, fk(ref).pis);
  return eye();
}
export const anchoredPis = (model, ref, mode = 'start') =>
  applyMat(anchorTransform(model, ref, mode), fk(model).pis);

/** Cuánto se movió cada PI respecto a la referencia, ya anclado.
 *
 *  Devuelve un vector de distancias de largo min(len(a), len(b)); si las
 *  variantes no tienen el mismo número de dobleces se compara lo que existe en
 *  ambas, contando desde el extremo anclado.
 */
export function piShift(model, ref, mode = 'start') {
  let a = anchoredPis(model, ref, mode);
  let b = fk(ref).pis;
  const n = Math.min(a.length, b.length);
  if (mode === 'end') { a = a.slice(a.length - n); b = b.slice(b.length - n); }
  else { a = a.slice(0, n); b = b.slice(0, n); }
  return a.map((p, i) => p.distanceTo(b[i]));
}

/* --------------------------------------------- edición directa de puntos PI */
/** Reconstruye el modelo desde sus PI conservando radio/twist por índice.
 *
 *  `ik()` recupera avance, rotación y ángulo exactos, pero el radio y la
 *  torsión no viven en los puntos: hay que arrastrarlos de `keep`, la lista de
 *  dobleces que corresponde uno a uno con los PI nuevos.
 */
function modelFromPoints(model, P, keep) {
  const r = ik(P, keep.map(b => b.radius));
  const bends = r.bends.map((b, j) => {
    const src = keep[j] || BEND_DEFAULT;
    const nb = bendFrom(b);
    nb.radius = +(src.radius ?? 30);
    nb.twist = +(src.twist ?? 0);
    nb.twistLen = +(src.twistLen ?? 0);
    return nb;
  });
  const out = cloneModel(model);
  out.bends = bends;
  out.tail = r.tail;
  return out;
}

/** Mueve el PI `i` y regenera la cadena entera desde los puntos.
 *
 *  No se calcula el arrastre hacia los dobleces siguientes: se recalcula todo,
 *  que es la misma idea que sostiene la compensación.
 */
export function movePi(model, i, xyz) {
  const P = fk(model).pis;
  if (!(i >= 0 && i < P.length)) return model;
  P[i] = new Vector3(xyz[0], xyz[1], xyz[2]);
  return modelFromPoints(model, P, model.bends);
}

/** Elimina el PI `i` (1..n). P0 y el extremo libre no se pueden borrar. */
export function deletePi(model, i) {
  const B = model.bends;
  if (!(i >= 1 && i <= B.length) || B.length <= 1) return model;
  const P = fk(model).pis;
  P.splice(i, 1);
  const keep = B.slice(0, i - 1).concat(B.slice(i));
  return modelFromPoints(model, P, keep);
}

/** Inserta un PI intermedio en el tramo P[i] -> P[i+1].
 *
 *  Nace colineal, o sea con ángulo 0: es un punto de control listo para
 *  moverse, no un doblez real todavía. El radio se hereda del vecino.
 */
export function insertPi(model, i, t = 0.5) {
  const P = fk(model).pis;
  if (!(i >= 0 && i < P.length - 1)) return model;
  t = clamp(+t, 0.02, 0.98);
  P.splice(i + 1, 0, P[i].clone().lerp(P[i + 1], t));
  const B = model.bends;
  const ref = B.length ? B[Math.min(i, B.length - 1)] : BEND_DEFAULT;
  const fresh = newBend({ radius: +(ref.radius ?? 30), angle: 0 });
  const keep = B.slice(0, i).concat([fresh], B.slice(i));
  return modelFromPoints(model, P, keep);
}

/* ==================================================================
   COLOCACIÓN — dónde y cómo se para la pieza en el espacio
   ==================================================================
   Es puramente de presentación: no toca `feed`, `rot`, `angle` ni ningún PI
   relativo. Sirve para acomodar la barra en el ángulo que uno quiere verla,
   girándola alrededor del PI que se elija como origen. Como se aplica a TODA
   la escena por igual, la comparación entre modelos no cambia.               */
export const PLACE_DEFAULT = Object.freeze({
  pivot: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0,
});

/** Transformación de colocación alrededor de `pivotPoint` (Vector3).
 *
 *      Trans(d) · Trans(p) · Rz·Ry·Rx · Trans(-p)
 *
 *  Con todo en cero devuelve la identidad, así que un archivo sin `place` se ve
 *  exactamente igual que antes.
 */
export function placeTransform(place, pivotPoint) {
  const q = { ...PLACE_DEFAULT, ...(place || {}) };
  const p = pivotPoint || new Vector3();
  const R = rotZ(q.rz * D2R).multiply(rotY(q.ry * D2R)).multiply(rotX(q.rx * D2R));
  return trans(q.x + p.x, q.y + p.y, q.z + p.z)
    .multiply(R)
    .multiply(trans(-p.x, -p.y, -p.z));
}
export const isPlaced = place => {
  const q = { ...PLACE_DEFAULT, ...(place || {}) };
  return !!(q.x || q.y || q.z || q.rx || q.ry || q.rz);
};

/* ==================================================================
   PUNTOS DE REFERENCIA — cotas sueltas en el espacio
   ==================================================================
   Puntos que uno pone a mano (o importa) para acotar la pieza contra algo que
   no es otro modelo: un apoyo del fixture, un datum de taller, el punto al que
   tiene que llegar la punta. No tienen cinemática: son coordenadas.          */
export const MARK_DEFAULT = Object.freeze({ x: 0, y: 0, z: 0 });

/** PI más cercano a un punto: {i, d}. Con `pts` vacío devuelve d = Infinity. */
export function nearestPoint(pts, q) {
  let i = -1, d = Infinity;
  for (let k = 0; k < pts.length; k++) {
    const e = pts[k].distanceTo(q);
    if (e < d) { d = e; i = k; }
  }
  return { i, d };
}

/* ==================================================================
   EXPRESIONES EN LAS CELDAS DE COMPENSACIÓN
   ==================================================================
   La celda de compensación acepta un número suelto (lo reemplaza) o una cuenta
   sobre el valor que calculó el lazo, que se escribe `c`:

       2          ->  la compensación pasa a valer 2
       +2         ->  c + 2      (atajo: si empieza por un operador, va sobre c)
       c + 2      ->  lo mismo, explícito
       c*1.1      ->  un 10 % más de lo que sugiere el lazo
       (c+1)/2

   Se evalúa con un parser propio (patio de maniobras). NO se usa eval(): esto
   corre bajo file:// y no hay ninguna razón para ejecutar texto arbitrario.  */
const PREC = { '+': 1, '-': 1, '*': 2, '/': 2 };

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let j = i;
      while (j < src.length && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) j++;
      const v = parseFloat(src.slice(i, j));
      if (!isFinite(v)) return null;
      out.push({ t: 'num', v });
      i = j;
      continue;
    }
    if (ch === 'c') { out.push({ t: 'var' }); i++; continue; }
    if (ch === '(' || ch === ')') { out.push({ t: ch }); i++; continue; }
    if (PREC[ch]) { out.push({ t: 'op', v: ch }); i++; continue; }
    return null;                      // cualquier otra cosa: expresión inválida
  }
  return out;
}

/** Evalúa la expresión de una celda. `calc` es el valor de `c`.
 *  Devuelve null si el texto no es una expresión válida — el que llama decide
 *  qué hacer (normalmente: no tocar nada). */
export function evalCell(text, calc = 0) {
  let src = String(text ?? '').trim().replace(/,/g, '.').toLowerCase();
  if (!src) return null;
  /* Atajo: `+2`, `*1.1`, `/2` son cuentas sobre el valor calculado. `-3` NO:
     un signo menos al principio es un número negativo, que es lo que uno
     espera al teclear una compensación a mano. Para restar sobre el calculado
     está `c-3`. */
  if (/^[+*/]/.test(src)) src = 'c' + src;
  const toks = tokenize(src);
  if (!toks || !toks.length) return null;

  const vals = [], ops = [];
  const apply = () => {
    const op = ops.pop();
    if (op === 'u-') {
      const a = vals.pop();
      if (a === undefined) return false;
      vals.push(-a);
      return true;
    }
    const b = vals.pop(), a = vals.pop();
    if (a === undefined || b === undefined) return false;
    vals.push(op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b);
    return true;
  };
  let prev = null;
  for (const tk of toks) {
    if (tk.t === 'num') vals.push(tk.v);
    else if (tk.t === 'var') vals.push(+calc || 0);
    else if (tk.t === '(') ops.push('(');
    else if (tk.t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') if (!apply()) return null;
      if (!ops.length) return null;
      ops.pop();
    } else {
      // unario: al principio, tras otro operador, o tras un paréntesis que abre
      const unary = tk.v === '-' && (prev === null || prev.t === 'op' || prev.t === '(');
      if (unary) ops.push('u-');
      else {
        while (ops.length && ops[ops.length - 1] !== '(' &&
               (ops[ops.length - 1] === 'u-' || PREC[ops[ops.length - 1]] >= PREC[tk.v])) {
          if (!apply()) return null;
        }
        ops.push(tk.v);
      }
    }
    prev = tk;
  }
  while (ops.length) {
    if (ops[ops.length - 1] === '(') return null;
    if (!apply()) return null;
  }
  if (vals.length !== 1 || !isFinite(vals[0])) return null;
  return vals[0];
}

/* ---------------------------------------------------------------------- E/S */
export function toDoc(model, command, comp, proc, datasets = [], variants = [],
                      ref = null, anchor = 'start', extra = {}) {
  return {
    schema: SCHEMA,
    saved: new Date().toISOString(),
    model,
    command: command || model.bends,
    comp: comp || { ...COMP_DEFAULT },
    proc: proc || { ...PROC_DEFAULT },
    datasets: datasets.map(d => ({
      name: d.name, color: d.color, src: d.src || '',
      bends: d.model.bends, tail: d.model.tail,
    })),
    // claves opcionales: los archivos viejos siguen abriendo sin ellas
    ref, anchor,
    variants: variants.map(v => ({
      id: v.id, name: v.name, color: v.color, visible: !!v.visible,
      base: v.base, deltas: v.deltas || [], tailDelta: +(v.tailDelta || 0),
    })),
    place: { ...PLACE_DEFAULT, ...(extra.place || {}) },
    marks: (extra.marks || []).map(m => ({
      name: m.name, color: m.color, visible: m.visible !== false,
      x: +m.x || 0, y: +m.y || 0, z: +m.z || 0,
    })),
    tweak: (extra.tweak || []).map(t => ({
      angle: +t.angle || 0, rot: +t.rot || 0, feed: +t.feed || 0,
    })),
  };
}

/** Normaliza un documento leído de JSON. Gemelo de load_json() de core.py. */
export function fromDoc(d) {
  const model = normalizeModel(d.model);
  const variants = (d.variants || []).map((v, i) => syncDeltas({
    id: v.id || `v${i + 1}`,
    name: v.name ?? 'MODELO',
    color: v.color || '#3FA9F5',
    visible: v.visible !== false,
    base: normalizeModel(v.base),
    deltas: v.deltas || [],
    tailDelta: +(v.tailDelta || 0),
  }));
  return {
    model,
    command: (d.command || model.bends).map(bendFrom),
    comp: { ...COMP_DEFAULT, ...(d.comp || {}) },
    proc: { ...PROC_DEFAULT, ...(d.proc || {}) },
    datasets: d.datasets || [],
    anchor: d.anchor || 'start',
    variants,
    ref: d.ref || (variants.length ? variants[0].id : null),
    // claves opcionales: un archivo sin ellas abre igual que siempre
    place: { ...PLACE_DEFAULT, ...(d.place || {}) },
    marks: (d.marks || []).map((m, i) => ({
      id: `mk${i + 1}`,
      name: m.name || `P${i + 1}`,
      color: m.color || '#57C8D6',
      visible: m.visible !== false,
      x: +m.x || 0, y: +m.y || 0, z: +m.z || 0,
    })),
    tweak: (d.tweak || []).map(t => ({
      angle: +t.angle || 0, rot: +t.rot || 0, feed: +t.feed || 0,
    })),
  };
}

/** Toma las 3 últimas columnas numéricas de cada línea. */
export function readPointsCsv(txt) {
  const P = [];
  for (const line of String(txt).split(/\r?\n/)) {
    const nums = line.trim().split(/[,;\t ]+/).map(Number).filter(n => isFinite(n));
    if (nums.length >= 3) P.push(new Vector3(...nums.slice(-3)));
  }
  return P;
}
export const writePointsCsv = pts =>
  'idx,x,y,z\n' + pts.map((p, i) =>
    `${i},${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`).join('\n');
