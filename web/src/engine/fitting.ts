/* =========================================================================
   AJUSTE Y COLOCACIÓN — alineación rígida (Kabsch), anclaje entre variantes,
   colocación en el espacio y puntos de referencia sueltos.
   ========================================================================= */
import { Matrix4, Vector3, Quaternion } from 'three';
import type { Model, AnchorMode, Place } from '../types.ts';
import { D2R, basisOf, eye, trans, rotX, rotY, rotZ, applyMat, clamp } from './math.ts';
import { fk } from './kinematics.ts';

/* --------------------------------------------------------------- alineación */
/* Jacobi para matrices simétricas n×n — sin numpy de este lado. */
function jacobi(Ain: number[][], n: number): { vals: number[]; vecs: number[][] } {
  const A = Ain.map(r => r.slice());
  const Vv: number[][] = [...Array(n)].map((_, i) => [...Array(n)].map((_, j) => (i === j ? 1 : 0)));
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
export function kabsch(P: Vector3[], Q: Vector3[]): Matrix4 {
  const n = Math.min(P.length, Q.length);
  const pc = new Vector3(), qc = new Vector3();
  for (let i = 0; i < n; i++) { pc.add(P[i]); qc.add(Q[i]); }
  pc.divideScalar(n || 1); qc.divideScalar(n || 1);
  const S: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
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

/* ------------------------------------------------------------------ anclaje */
/** Lee un modo de anclaje de cualquier versión. 'start' y 'end' eran el
 *  amarre y la punta: hoy son dos casos del punto de coincidencia, y `end`
 *  dice que ese punto es el PE. */
export function normAnchor(a: unknown): { mode: 'pivot' | 'best'; end: boolean } {
  if (a === 'best') return { mode: 'best', end: false };
  return { mode: 'pivot', end: a === 'end' };
}

/** Índice del punto de coincidencia `k` (contado en la REFERENCIA, que tiene
 *  `nRef` puntos) dentro de un modelo con `nm` puntos.
 *
 *  Las variantes pueden no tener el mismo número de dobleces. El PE de la
 *  referencia es el PE de cualquiera —el extremo libre es el extremo libre—, y
 *  un PI intermedio se cuenta desde el amarre, topado a lo que exista. */
export function pivotIndex(k: number, nRef: number, nm: number): number {
  const kk = clamp(k | 0, 0, Math.max(0, nRef - 1));
  if (kk > 0 && kk >= nRef - 1) return nm - 1;
  return clamp(kk, 0, nm - 1);
}

/** Marco del punto `k` de una pieza: dónde está y hacia dónde va la barra.
 *
 *  P0 es el marco de amarre y PE el del extremo libre, los dos de siempre. En
 *  un PI intermedio la dirección de la barra no es una sola —ahí se dobla—: se
 *  toma la del tramo que LLEGA desde el amarre, con el origen en el PI. Es la
 *  misma convención que el PE, que también es el tramo que llega. */
export function frameAtPi(model: Model, k: number): Matrix4 {
  const { pis, frames, end } = fk(model);
  const last = pis.length - 1;
  const i = clamp(k | 0, 0, last);
  if (i === 0) return frames[0].clone();
  if (i === last) return end.clone();
  const F = frames[i - 1].clone();
  F.setPosition(pis[i]);
  return F;
}

/** Transformación rígida que superpone `model` sobre `ref`.
 *
 *  'pivot'  PUNTO DE COINCIDENCIA: el PI `k` de la referencia (el pivote de la
 *           colocación) queda común en posición Y orientación, y la
 *           divergencia se ve creciendo hacia los dos lados. k = 0 es el amarre
 *           —identidad: fk() ya arranca a todas en el origen con el mismo
 *           marco—; k = PE es el extremo libre, el anclaje útil cuando la
 *           aceptación es la posición de la punta maquinada. Sirve para
 *           comparar como de verdad se sujeta CADA pieza.
 *  'best'   mejor ajuste global de los PI (Kabsch). Reparte el error.
 *
 *  Los nombres viejos siguen valiendo: 'start' es P0 y 'end' es PE, sin
 *  mirar `k`.
 */
export function anchorTransform(model: Model, ref: Model, mode: AnchorMode = 'pivot', k = 0): Matrix4 {
  if (mode === 'best') return kabsch(fk(model).pis, fk(ref).pis);
  const nr = fk(ref).pis.length, nm = fk(model).pis.length;
  const kr = mode === 'end' ? nr - 1 : (mode === 'start' ? 0 : clamp(k | 0, 0, nr - 1));
  const km = mode === 'end' ? nm - 1 : pivotIndex(kr, nr, nm);
  if (kr === 0 && km === 0) return eye();
  return new Matrix4().multiplyMatrices(frameAtPi(ref, kr), frameAtPi(model, km).invert());
}
export const anchoredPis = (model: Model, ref: Model, mode: AnchorMode = 'pivot', k = 0): Vector3[] =>
  applyMat(anchorTransform(model, ref, mode, k), fk(model).pis);

/** ¿Las listas de PI se emparejan desde el final? Solo cuando lo común es el
 *  extremo libre: es ahí donde coinciden aunque a una le sobren dobleces. */
export function alignsFromEnd(ref: Model, mode: AnchorMode = 'pivot', k = 0): boolean {
  if (mode === 'end') return true;
  if (mode !== 'pivot') return false;
  return (k | 0) > 0 && (k | 0) >= fk(ref).pis.length - 1;
}

/** Cuánto se movió cada PI respecto a la referencia, ya anclado.
 *
 *  Devuelve un vector de distancias de largo min(len(a), len(b)); si las
 *  variantes no tienen el mismo número de dobleces se compara lo que existe en
 *  ambas, contando desde el extremo anclado (ver `alignsFromEnd()`).
 */
export function piShift(model: Model, ref: Model, mode: AnchorMode = 'pivot', k = 0): number[] {
  let a = anchoredPis(model, ref, mode, k);
  let b = fk(ref).pis;
  const n = Math.min(a.length, b.length);
  if (alignsFromEnd(ref, mode, k)) { a = a.slice(a.length - n); b = b.slice(b.length - n); }
  else { a = a.slice(0, n); b = b.slice(0, n); }
  return a.map((p, i) => p.distanceTo(b[i]));
}

/** El número de una tarjeta: cuánto se separa el extremo MÁS LEJANO.
 *
 *  Con el punto de coincidencia en un extremo el otro es el que se mueve; con
 *  él en medio se mueven los dos y manda el peor. Un solo número que vale para
 *  P0, PE y cualquier PI de en medio. */
export const farShift = (sh: number[]): number =>
  sh.length ? Math.max(sh[0], sh[sh.length - 1]) : 0;

/* ==================================================================
   COLOCACIÓN — dónde y cómo se para la pieza en el espacio
   ==================================================================
   Es puramente de presentación: no toca `feed`, `rot`, `angle` ni ningún PI
   relativo. Sirve para acomodar la barra en el ángulo que uno quiere verla,
   girándola alrededor del PI que se elija como origen. Como se aplica a TODA
   la escena por igual, la comparación entre modelos no cambia.               */
export const PLACE_DEFAULT: Place = Object.freeze({
  pivot: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0,
});

/** Transformación de colocación alrededor de `pivotPoint` (Vector3).
 *
 *      Trans(d) · Trans(p) · Rz·Ry·Rx · Trans(-p)
 *
 *  Con todo en cero devuelve la identidad, así que un archivo sin `place` se ve
 *  exactamente igual que antes.
 */
export function placeTransform(place: Partial<Place> | null | undefined, pivotPoint: Vector3 | null | undefined): Matrix4 {
  const q: Place = { ...PLACE_DEFAULT, ...(place || {}) };
  const p = pivotPoint || new Vector3();
  const R = rotZ(q.rz * D2R).multiply(rotY(q.ry * D2R)).multiply(rotX(q.rx * D2R));
  return trans(q.x + p.x, q.y + p.y, q.z + p.z)
    .multiply(R)
    .multiply(trans(-p.x, -p.y, -p.z));
}
/** Los tres ejes de la SECCIÓN en una estación, en coordenadas del taller.
 *
 *  `M` es la matriz que lleva la pieza a donde se ve —el anclaje más la
 *  colocación— y `F` el marco de esa estación, de los que devuelve `fk()`.
 *  Salen normalizados y en el orden de la convención: `x` la dirección de la
 *  barra AHÍ, `y` el espesor, `z` el ancho.
 *
 *  Existe porque el marco del ORIGEN no describe una barra doblada. El
 *  indicador de ejes prometía «x el eje de la barra, y el espesor, z el ancho»
 *  y enseñaba los ejes del MODELO, que son el marco de la estación 0: en la
 *  demo, el eje de la barra en la punta forma **175.5°** con el `x` del modelo,
 *  o sea que la flecha apuntaba casi justo al revés que la barra que se estaba
 *  mirando. Los tres nombres solo valen a la vez en la recta de entrada.
 */
export function stationBasis(M: Matrix4, F: Matrix4): [Vector3, Vector3, Vector3] {
  const [x, y, z] = basisOf(new Matrix4().extractRotation(M).multiply(F));
  return [x.normalize(), y.normalize(), z.normalize()];
}

export const isPlaced = (place: Partial<Place> | null | undefined): boolean => {
  const q: Place = { ...PLACE_DEFAULT, ...(place || {}) };
  return !!(q.x || q.y || q.z || q.rx || q.ry || q.rz);
};

/* ==================================================================
   PUNTOS DE REFERENCIA — cotas sueltas en el espacio
   ==================================================================
   Puntos que uno pone a mano (o importa) para acotar la pieza contra algo que
   no es otro modelo: un apoyo del fixture, un datum de taller, el punto al que
   tiene que llegar la punta. No tienen cinemática: son coordenadas.          */

/** PI más cercano a un punto: {i, d}. Con `pts` vacío devuelve d = Infinity. */
export function nearestPoint(pts: Vector3[], q: Vector3): { i: number; d: number } {
  let i = -1, d = Infinity;
  for (let k = 0; k < pts.length; k++) {
    const e = pts[k].distanceTo(q);
    if (e < d) { d = e; i = k; }
  }
  return { i, d };
}
