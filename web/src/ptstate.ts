/* =========================================================================
   MÉTODO «POR PUNTOS» — el estado de la pantalla y lo que da de alta.

   El motor (engine/ptfit.ts) es puro; esto le pone delante la barra elegida,
   lo tecleado y el punto de coincidencia de Vista, y guarda el resultado en
   una caché para que el panel, la escena y el estado no lo calculen tres veces
   por repintado.

   LO TECLEADO vive aquí, a nivel de módulo, y no en ST, igual que el borrador
   del método por ángulos: es un borrador de interfaz, no gasta pasos de
   deshacer ni viaja en el JSON. Lo que queda es lo que se da de alta: la BARRA
   OBJETIVO (una variante nueva) y la PIEZA MEDIDA (una pieza como cualquier
   nube). Cambiar de barra, o que cambie su número de PI, vacía el borrador:
   unas ediciones por índice no significan nada en otra pieza.
   ========================================================================= */
import { Matrix4, Vector3 } from 'three';
import * as E from './engine.ts';
import type { Model, Variant, Dataset } from './types.ts';
import type { PtAlign, PtResult, Xyz } from './engine/ptfit.ts';
import { ST, V, VAR_COLORS, newVid, pivotK, refModelFree, syncModel, syncCommand,
         recomputeAll, addDataset } from './state.ts';

export type PtUI = {
  /** id de la variante elegida como barra; '' = la activa */
  vid: string;
  /** edición por PI, mm, en el marco de coincidencia */
  edits: Xyz[];
  /** medida por PI, o null */
  meas: (Xyz | null)[];
  /** fracción del error medido que se corrige, 0..1 */
  gain: number;
  align: PtAlign;
  /** aviso de la última acción */
  note: string;
  /** nombre de la pieza medida que se va a crear */
  name: string;
  /** ¿se dibujan los objetivos y la barra resultante en la escena? */
  show: boolean;
  /** firma de la barra para la que valen `edits` y `meas` */
  sig: string;
  /** ¿está elegido el método «Por puntos» en Medición? Lo pone el selector de
   *  método; la escena lo mira para dibujar o no los objetivos */
  on: boolean;
};

export const ptUI: PtUI = {
  vid: '', edits: [], meas: [], gain: 1, align: 'pivot', note: '', name: '', show: true, sig: '', on: false,
};

/** ¿Se dibuja el método en la escena? */
export const ptVisible = (): boolean => ptUI.on && ptUI.show && ST.mode === 'meas' && !!ST.model && ST.variants.length > 0;

/** La variante elegida como barra (la activa si no hay o ya no existe). */
export function ptVariant(): Variant {
  return ST.variants.find(v => v.id === ptUI.vid) || V();
}
/** La barra elegida como modelo efectivo. */
export const ptBoard = (): Model => E.effectiveModel(ptVariant());

/** Deja el borrador del largo de la barra; si cambió de barra o de número de
 *  PI, lo vacía. Devuelve el número de PI. */
export function ptSync(): number {
  const v = ptVariant();
  const n = E.fk(E.effectiveModel(v)).pis.length;
  const sig = `${v.id}:${n}`;
  if (sig !== ptUI.sig) {
    ptUI.sig = sig;
    ptUI.edits = [];
    ptUI.meas = [];
    ptUI.note = '';
  }
  while (ptUI.edits.length < n) ptUI.edits.push([0, 0, 0]);
  while (ptUI.meas.length < n) ptUI.meas.push(null);
  ptUI.edits.length = n;
  ptUI.meas.length = n;
  return n;
}

let memoKey = '';
let memo: PtResult | null = null;

/** El resultado de lo tecleado sobre la barra elegida, con el anclaje y el
 *  punto de coincidencia de Vista. Cacheado por sus entradas. */
export function ptResult(): PtResult {
  ptSync();
  const B = ptBoard();
  const key = JSON.stringify([B.bends, B.tail, ST.anchor, pivotK(), ptUI.edits, ptUI.meas, ptUI.gain, ptUI.align]);
  if (memo && key === memoKey) return memo;
  memo = E.pointsSolve(B, { edits: ptUI.edits, meas: ptUI.meas, gain: ptUI.gain, align: ptUI.align },
                       ST.anchor, pivotK());
  memoKey = key;
  return memo;
}

/** Del marco de coincidencia de la barra elegida a la escena (antes de la
 *  colocación): la misma matriz con la que se dibuja esa variante. */
export function ptSceneMatrix(): Matrix4 {
  const B = ptBoard();
  const A = E.anchorTransform(B, refModelFree(), ST.anchor, pivotK());
  return A.multiply(E.ptFrame(B, ST.anchor, pivotK()));
}
export const ptToScene = (p: Xyz, M: Matrix4 = ptSceneMatrix()): Vector3 =>
  new Vector3(p[0], p[1], p[2]).applyMatrix4(M);

/** La barra resultante como la dibuja la escena: su matriz de superposición.
 *  Con punto de coincidencia, contra la referencia como cualquier variante;
 *  con mejor ajuste, sobre los puntos pedidos (ver `gotter()` en ptfit.ts). */
export function ptResultMatrix(): Matrix4 {
  const R = ptResult();
  const M = ptSceneMatrix();
  const P = E.fk(R.model).pis;
  const want = R.rows.map(r => new Vector3(r.got[0], r.got[1], r.got[2]));
  /* `got` ya está en el marco de coincidencia: el rígido que lleva los PI de
     la barra resultante sobre `got` es exactamente su colocación */
  return M.multiply(E.kabsch(P, want));
}

/* ------------------------------------------------------------ edición */
const ok = (v: number | null): v is number => typeof v === 'number' && isFinite(v);

/** Edición del PI `i` en el eje `ax` (0 X, 1 Y, 2 Z), mm. null = 0. */
export function setPtEdit(i: number, ax: number, v: number | null): void {
  ptSync();
  if (!ptUI.edits[i] || !(ax >= 0 && ax < 3)) return;
  ptUI.edits[i] = ptUI.edits[i].slice() as Xyz;
  ptUI.edits[i][ax] = ok(v) ? v : 0;
}
/** El OBJETIVO del PI `i` en el eje `ax`, absoluto: guarda la edición que lo
 *  da (objetivo − nominal). null vuelve al nominal. */
export function setPtTarget(i: number, ax: number, v: number | null): void {
  const R = ptResult();
  const row = R.rows[i];
  if (!row) return;
  setPtEdit(i, ax, ok(v) ? v - row.nom[ax] : 0);
}
/** Medida del PI `i` en el eje `ax`. Al teclear el primer eje de un PI sin
 *  medida, los otros dos arrancan en el nominal: medir uno y dejar los otros
 *  vacíos no puede ser un cero, que sería un punto en el origen. null en un
 *  eje borra la medida del PI entero. */
export function setPtMeas(i: number, ax: number, v: number | null): void {
  ptSync();
  if (i < 0 || i >= ptUI.meas.length || !(ax >= 0 && ax < 3)) return;
  if (!ok(v)) { ptUI.meas[i] = null; return; }
  const cur = ptUI.meas[i] || (ptResult().rows[i]?.nom.slice() as Xyz | undefined);
  if (!cur) return;
  const m = cur.slice() as Xyz;
  m[ax] = v;
  ptUI.meas[i] = m;
}
/** Borra todas las ediciones, o todas las medidas. */
export function clearPt(what: 'edits' | 'meas'): void {
  const n = ptSync();
  if (what === 'edits') ptUI.edits = Array.from({ length: n }, () => [0, 0, 0] as Xyz);
  else ptUI.meas = Array.from({ length: n }, () => null);
  ptUI.note = '';
}
/** Elige la barra. Vacía el borrador si cambia (ver `ptSync()`). */
export function setPtBoard(vid: string): void {
  ptUI.vid = vid;
  ptSync();
}

/* -------------------------------------------------------------- altas */
/** Da de alta la BARRA OBJETIVO como variante nueva, activa y visible, y
 *  devuelve su id ('' si no había nada que pedir). Es la barra resultante
 *  entera como base, sin Δ: lo que se tecleó son puntos, no correcciones de
 *  fila, y repartirlo en Δ por fila sería inventar cuál de ellas lo pidió.
 *  No apila el paso de deshacer: eso lo hace el `commit()` del clic. */
export function applyPointsTarget(): string {
  const R = ptResult();
  if (!R.changed) return '';
  const src = ptVariant();
  const base = src.name;
  let k = 1;
  while (ST.variants.some(v => v.name === `${base} · pts ${k}`)) k += 1;
  const n = ST.variants.length;
  const w = E.newVariant({ ...R.model, name: `${base} · pts ${k}` }, `${base} · pts ${k}`,
                         VAR_COLORS[n % VAR_COLORS.length], newVid());
  w.visible = true;
  ST.variants.push(w);
  ST.active = w.id; ST.sel = -1;
  syncModel(); syncCommand();
  recomputeAll();
  return w.id;
}

/** Da de alta la PIEZA MEDIDA (todos los PI medidos) como una nube más: se
 *  compara contra el modelo activo, entra al lazo y viaja en el JSON. null si
 *  falta algún PI. */
export function addPointsDataset(name: string): Dataset | null {
  ptSync();
  const m = E.measuredFromPoints(ptBoard(), ptUI.meas, ptUI.align, ST.anchor, pivotK());
  if (!m) return null;
  return addDataset(m, name, 'points', ptBoard().bends);
}

/** ¿Están medidos todos los PI? */
export const ptAllMeasured = (): boolean => {
  ptSync();
  return ptUI.meas.length > 0 && ptUI.meas.every(Boolean);
};
