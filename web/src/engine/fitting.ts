/* =========================================================================
   AJUSTE Y COLOCACIÓN — alineación rígida (Kabsch), anclaje entre variantes,
   colocación en el espacio y puntos de referencia sueltos.
   ========================================================================= */
import { Matrix4, Vector3, Quaternion } from 'three';
import type { Model, AnchorMode, Place } from '../types.ts';
import { D2R, eye, trans, rotX, rotY, rotZ, applyMat } from './math.ts';
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
export function anchorTransform(model: Model, ref: Model, mode: AnchorMode = 'start'): Matrix4 {
  if (mode === 'end') {
    return new Matrix4().multiplyMatrices(fk(ref).end, fk(model).end.clone().invert());
  }
  if (mode === 'best') return kabsch(fk(model).pis, fk(ref).pis);
  return eye();
}
export const anchoredPis = (model: Model, ref: Model, mode: AnchorMode = 'start'): Vector3[] =>
  applyMat(anchorTransform(model, ref, mode), fk(model).pis);

/** Cuánto se movió cada PI respecto a la referencia, ya anclado.
 *
 *  Devuelve un vector de distancias de largo min(len(a), len(b)); si las
 *  variantes no tienen el mismo número de dobleces se compara lo que existe en
 *  ambas, contando desde el extremo anclado.
 */
export function piShift(model: Model, ref: Model, mode: AnchorMode = 'start'): number[] {
  let a = anchoredPis(model, ref, mode);
  let b = fk(ref).pis;
  const n = Math.min(a.length, b.length);
  if (mode === 'end') { a = a.slice(a.length - n); b = b.slice(b.length - n); }
  else { a = a.slice(0, n); b = b.slice(0, n); }
  return a.map((p, i) => p.distanceTo(b[i]));
}

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
export const MARK_DEFAULT = Object.freeze({ x: 0, y: 0, z: 0 });

/** PI más cercano a un punto: {i, d}. Con `pts` vacío devuelve d = Infinity. */
export function nearestPoint(pts: Vector3[], q: Vector3): { i: number; d: number } {
  let i = -1, d = Infinity;
  for (let k = 0; k < pts.length; k++) {
    const e = pts[k].distanceTo(q);
    if (e < d) { d = e; i = k; }
  }
  return { i, d };
}
