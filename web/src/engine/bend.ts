/* =========================================================================
   DOBLEZ Y MODELO — constructores y normalización, sin cinemática.

   Solo tipos y defaults: `ik()` (cinemática) llama a `newBend()`, y
   `movePi()`/`insertPi()` (modelo) llaman a `ik()` y `fk()`. Si estos
   constructores vivieran en model.ts habría un ciclo kinematics <-> model;
   al no importar nada de los otros archivos del motor, el grafo queda
   acíclico.
   ========================================================================= */
import type { Bend, Model } from '../types.ts';

/* ------------------------------------------------------------------ modelo */
export const BEND_DEFAULT: Bend = Object.freeze({
  feed: 100, rot: 0, angle: 30, radius: 30, twist: 0, twistLen: 0,
});
const BEND_KEYS = Object.keys(BEND_DEFAULT) as (keyof Bend)[];

/** Doblez tal como puede llegar de JSON crudo (archivo, formulario…): cualquier
 *  clave, cualquier tipo. `newBend()` solo lee las de BEND_KEYS y las fuerza a
 *  número con `+`, exactamente como antes — por eso el valor se tipa `any` en
 *  vez de `unknown`: así el `+` sigue aceptando cualquier cosa, igual que en
 *  JS suelto. */
type RawBend = Record<string, any>;
/** Modelo tal como puede llegar de un JSON de cualquier procedencia o versión:
 *  cualquier clave, cualquier tipo. `normalizeModel()` rellena los defaults y
 *  no valida nada más. Se exporta porque model.ts y doc.ts también la usan:
 *  este es el archivo más básico de los tres. */
export type RawModel = Record<string, any>;

export function newBend(o: RawBend = {}): Bend {
  const b: Bend = { ...BEND_DEFAULT };
  for (const k of BEND_KEYS) if (o[k] !== undefined && o[k] !== null) b[k] = +o[k];
  return b;
}
export const bendFrom = (o: RawBend | null | undefined): Bend => newBend(o || {});

/** Rellena defaults de un modelo venido de JSON (quizá sin twistLen). */
export function normalizeModel(m: RawModel | null | undefined): Model {
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
export const cloneModel = (m: Model): Model => normalizeModel(JSON.parse(JSON.stringify(m)));
