/* -------------------------------------------------------------- refrescos --
   Los caminos de repintado, del mas barato al mas caro. Acciones y eventos
   llaman a uno de estos y no a los render* sueltos, para que el camino de una
   edicion este escrito en un solo sitio.                                   */
import { ST, recomputeAll } from '../state.ts';
import { rebuildScene } from '../scene.ts';
import { drawRibbon } from '../ribbon.ts';
import {
  renderShell, renderLeft, renderSide, renderRight, renderStatus, renderPanels,
  updateModelDerived,
} from '../panels.ts';

export function renderAll(): void { renderShell(); renderPanels(); rebuildScene(); drawRibbon(); }
export function refresh(): void { recomputeAll(); renderPanels(); rebuildScene(); drawRibbon(); }
export function selectBend(i: number): void { ST.sel = i; renderPanels(); rebuildScene(); drawRibbon(); }

/** Confirmación de una celda de la tabla de modelo. Recalcula todo pero NO
 *  reconstruye el panel derecho: reescribe solo las celdas derivadas, así el
 *  <input> que tiene el foco sobrevive y recorrer la tabla con el teclado no
 *  va a tirones. Si la tabla no está montada, cae al render de siempre. */
export function refreshTable(): void {
  recomputeAll();
  if (!updateModelDerived()) renderRight();
  renderLeft(); renderSide(); renderStatus(); rebuildScene(); drawRibbon();
}
