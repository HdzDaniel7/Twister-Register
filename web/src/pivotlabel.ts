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
  ST.anchor === 'best' ? T('aBest')
    : ST.anchor === 'datums' ? T('aDatums') : T('aPivot').replace('{p}', pivotName());

/** Cómo se llama la referencia de la medición (datum). */
export const datumLabel = (): string =>
  ST.datum === 'best' ? T('dBest') : T('dPivot').replace('{p}', pivotName());

/** ¿Es el PI `i` el punto de coincidencia? Con «mejor ajuste» no hay ninguno. */
export function isCoin(i: number, n: number): boolean {
  /* solo con el punto de coincidencia de siempre: con «mejor ajuste» o con
     varios puntos no hay UN PI fijo común */
  return (ST.anchor === 'pivot' || ST.anchor === 'start' || ST.anchor === 'end')
    && Math.min(Math.max(pivotK(), 0), n - 1) === i;
}

/** Botón ⊕ de una fila: marca el punto de coincidencia vigente y, en las demás
 *  filas, deja fijarlo con un clic. Lleva data-a/data-i y no data-r para que el
 *  clic NO seleccione la fila (el despachador toma el primer ancestro con data). */
export function coinBtn(i: number, n: number): string {
  const on = isCoin(i, n);
  const tip = (on ? T('coinTip') : T('coinSet')).replace(/"/g, '&quot;');
  return `<button class="coinbtn${on ? ' on' : ''}" data-a="setpiv" data-i="${i}" title="${tip}" aria-label="${tip}">⊕</button>`;
}
