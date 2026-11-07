/* Nombre del punto de coincidencia. Un solo sitio para el esquema P0/PIn/PE:
   la lista de Vista, la etiqueta del anclaje, la barra de estado y el reporte
   deben decir exactamente lo mismo, o el reporte contradice a la pantalla. */
import * as E from './engine.ts';
import { T } from './i18n.ts';
import { ST, refModel, pivotK } from './state.ts';

/** P0 (amarre), PE (punta) o PIn, para el PI `i` de una lista de `n` puntos. */
export const piName = (i: number, n: number): string =>
  i === 0 ? 'P0' : (i === n - 1 ? 'PE' : 'PI' + i);

/** Nombre del PI que hoy es el punto de coincidencia (fijado al rango válido). */
export function pivotName(): string {
  const n = E.fk(refModel()).pis.length;
  return piName(Math.min(Math.max(pivotK(), 0), n - 1), n);
}

/** Cómo se llama el anclaje activo: «Mejor ajuste» o «Coincidencia en PI11». */
export const anchorLabel = (): string =>
  ST.anchor === 'best' ? T('aBest') : T('aPivot').replace('{p}', pivotName());

/** Cómo se llama la referencia de la medición (datum). */
export const datumLabel = (): string =>
  ST.datum === 'best' ? T('dBest') : T('dPivot').replace('{p}', pivotName());
