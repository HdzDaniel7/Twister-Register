/* =========================================================================
   RASTREADOR DE CERCANÍA — cuánto se separa una pieza de otra, a lo largo de
   su longitud, como un mapa de color.

   La tabla de desviaciones compara una pieza contra SU diseño, PI contra PI.
   Esto compara la GEOMETRÍA de dos piezas cualesquiera, ya colocadas en el
   mismo marco, sin importar cómo se hicieron: para cada muestra de la pieza A
   busca el punto más cercano en el espacio sobre la polilínea de la pieza B y
   dice cuánto y hacia dónde hay que ir para llegar a ella.

   TRES DECISIONES QUE CONVIENE LEER ANTES DE TOCAR NADA
   1. Solo cuenta la desviación TRANSVERSAL. El vector hacia el punto más
      cercano se descompone y se tira la parte que va a lo largo de la
      tangente de A: «B está 3 mm más adelante» no es una desviación de forma,
      es que las dos piezas están corridas, y pintarla de rojo taparía lo que
      sí importa (un doblez que se abre medio grado).
   2. Si lo más cercano de B es uno de sus EXTREMOS y además queda lejos a lo
      largo de la tangente, A sobresale de B: ahí no hay con qué comparar y
      esa muestra sale SIN PAR (gris), no con una distancia inventada.
   3. El valor lleva signo cuando se mira un eje: +Z es «B queda por encima de
      A». En magnitud no hay signo. Espesor y ancho son los ejes y y z de la
      sección de A en esa muestra (los mismos que dibuja `barGeometry()`; ver
      `stationBasis()` en fitting.ts), así que el signo sigue a la pieza
      cuando da vueltas.

   Es geometría pura: no sabe de variantes ni de pantalla. Quién es A y B, y en
   qué marco están, lo decide `proxstate.ts`.
   ========================================================================= */
import { Vector3 } from 'three';
import type { PathSample } from '../types.ts';

/** Qué se mide: la magnitud, un eje global del taller (+z arriba) o un eje de la
 *  sección de A (espesor = su y local, ancho = su z local). */
export type ProxAxis = 'mag' | 'x' | 'y' | 'z' | 'thick' | 'width';
export const PROX_AXES: readonly ProxAxis[] = ['mag', 'x', 'y', 'z', 'thick', 'width'];

/** Una muestra de A comparada. `d` va de A hacia B, sin la parte tangencial. */
export type ProxSample = { s: number; d: [number, number, number]; v: number; paired: boolean };
export type ProxStats = {
  /** mayor valor positivo y mayor negativo (≤ 0), entre las emparejadas */
  maxPos: number; maxNeg: number;
  /** mayor |v| y la longitud desarrollada de A donde ocurre */
  maxAbs: number; sAtMax: number;
  /** fracción 0..1 de las emparejadas con |d| ≤ tol (siempre sobre la magnitud) */
  within: number;
  /** muestras de A, y de ellas las emparejadas */
  n: number; nPaired: number;
};
export type ProxResult = { rows: ProxSample[]; stats: ProxStats };

/** Cuánto puede sobresalir A de un extremo de B antes de decir «sin par»:
 *  tres tolerancias, con un suelo de 1 mm para que una tol minúscula no deje
 *  sin par a dos piezas que acaban en el mismo sitio con ruido de muestreo. */
const unpairedAlong = (tol: number): number => Math.max(3 * tol, 1);

/** El punto de la polilínea `B` más cercano a `p`; `end` dice si cayó en uno de
 *  los dos extremos de la polilínea (proyección recortada). */
function nearestOnPolyline(B: PathSample[], p: Vector3, out: Vector3): { d: number; end: boolean } {
  const n = B.length;
  if (n === 1) { out.copy(B[0].p); return { d: p.distanceTo(out), end: true }; }
  let best = Infinity, bj = 0, bt = 0;
  for (let j = 0; j < n - 1; j++) {
    const a = B[j].p, b = B[j + 1].p;
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const L2 = abx * abx + aby * aby + abz * abz;
    let t = L2 > 1e-18 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = a.x + abx * t - p.x, dy = a.y + aby * t - p.y, dz = a.z + abz * t - p.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < best) { best = d2; bj = j; bt = t; }
  }
  const a = B[bj].p, b = B[bj + 1].p;
  out.set(a.x + (b.x - a.x) * bt, a.y + (b.y - a.y) * bt, a.z + (b.z - a.z) * bt);
  const end = (bj === 0 && bt <= 1e-9) || (bj === n - 2 && bt >= 1 - 1e-9);
  return { d: Math.sqrt(best), end };
}

/** Compara A contra B (YA en el mismo marco) y devuelve una fila por muestra de
 *  A más las estadísticas. `tol` es la tolerancia de punto del modelo, mm. */
export function proximity(A: PathSample[], B: PathSample[], axis: ProxAxis, tol: number): ProxResult {
  const rows: ProxSample[] = [];
  const stats: ProxStats = { maxPos: 0, maxNeg: 0, maxAbs: 0, sAtMax: 0, within: 0, n: A.length, nPaired: 0 };
  if (!A.length || !B.length) {
    for (const a of A) rows.push({ s: a.s, d: [0, 0, 0], v: 0, paired: false });
    return { rows, stats };
  }
  const q = new Vector3(), d = new Vector3(), t = new Vector3();
  const lim = unpairedAlong(tol);
  let inTol = 0;
  for (const a of A) {
    const near = nearestOnPolyline(B, a.p, q);
    d.subVectors(q, a.p);
    t.copy(a.x).normalize();
    const along = d.dot(t);
    if (near.end && Math.abs(along) > lim) {
      rows.push({ s: a.s, d: [0, 0, 0], v: 0, paired: false });
      continue;
    }
    d.addScaledVector(t, -along);
    const mag = d.length();
    const v = axis === 'mag' ? mag
      : axis === 'x' ? d.x : axis === 'y' ? d.y : axis === 'z' ? d.z
      : axis === 'thick' ? d.dot(a.y) : d.dot(a.z);
    rows.push({ s: a.s, d: [d.x, d.y, d.z], v, paired: true });
    stats.nPaired++;
    if (mag <= tol) inTol++;
    if (v > stats.maxPos) stats.maxPos = v;
    if (v < stats.maxNeg) stats.maxNeg = v;
    if (Math.abs(v) > stats.maxAbs) { stats.maxAbs = Math.abs(v); stats.sAtMax = a.s; }
  }
  stats.within = stats.nPaired ? inTol / stats.nPaired : 0;
  return { rows, stats };
}

/* ---- color: verde → amarillo → rojo (+) / azul (−) ---------------------- */
const GRN: number[] = [.247, .839, .549], YEL: number[] = [1, .85, .2];
const RED: number[] = [1, .302, .369], BLU: number[] = [.25, .55, 1];
/** Gris de «sin par» (sRGB). */
export const PROX_GRAY: number[] = [.5, .52, .56];
const mix = (a: number[], b: number[], f: number): number[] =>
  [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

/** Color sRGB 0..1 de un valor. |v| ≤ 0.25·tol verde; hasta tol, de verde a
 *  amarillo; de tol a 2·tol, de amarillo a rojo (v > 0) o azul (v < 0), pleno
 *  en 2·tol. Con `signed` falso (magnitud) todo lo que pasa de tol es rojo.
 *  `paired` falso: gris. */
export function proxColor(v: number, tol: number, signed: boolean, paired = true): number[] {
  if (!paired) return PROX_GRAY.slice();
  const t = Math.abs(v) / (tol > 0 ? tol : 1);
  if (t <= .25) return GRN.slice();
  if (t <= 1) return mix(GRN, YEL, (t - .25) / .75);
  const far = signed && v < 0 ? BLU : RED;
  return mix(YEL, far, Math.min(t - 1, 1));
}
