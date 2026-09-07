/* =========================================================================
   MATEMÁTICA DE BASE — ángulos, PRNG portado y matrices 4x4.

   No importa nada del motor: son las utilidades sobre las que se apoya todo
   lo demás (cinemática, ajuste, compensación...).
   ========================================================================= */
import { Matrix4, Vector3 } from 'three';

export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;

/* --------------------------------------------------------------- utilidades */
export const wrap180 = (a: number): number => ((a + 180) % 360 + 360) % 360 - 180;
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const wrapPi = (a: number): number => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

/** PRNG portado exacto en los dos motores: misma semilla, misma pieza virtual. */
export function mulberry32(a: number): () => number {
  a |= 0;
  return function () {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function gauss(rnd: () => number): number {
  let u = 0, v = 0;
  while (!u) u = rnd();
  while (!v) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* -------------------------------------------------------------- matrices 4x4 */
export const eye = (): Matrix4 => new Matrix4();
export const trans = (x: number, y = 0, z = 0): Matrix4 => new Matrix4().makeTranslation(x, y, z);
export const rotX = (a: number): Matrix4 => new Matrix4().makeRotationX(a);
export const rotY = (a: number): Matrix4 => new Matrix4().makeRotationY(a);
export const rotZ = (a: number): Matrix4 => new Matrix4().makeRotationZ(a);
export const rotAxis = (axis: Vector3, a: number): Matrix4 => new Matrix4().makeRotationAxis(axis, a);
export const posOf = (M: Matrix4): Vector3 => new Vector3().setFromMatrixPosition(M);
export function basisOf(M: Matrix4): [Vector3, Vector3, Vector3] {
  const x = new Vector3(), y = new Vector3(), z = new Vector3();
  M.extractBasis(x, y, z);
  return [x, y, z];
}
/** Aplica una transformación rígida a una lista de puntos (copia). */
export const applyMat = (M: Matrix4, pts: Vector3[]): Vector3[] => pts.map(p => p.clone().applyMatrix4(M));
