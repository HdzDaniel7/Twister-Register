/* -------------------------------------------------------------- refrescos --
   Los caminos de repintado, del mas barato al mas caro. Acciones y eventos
   llaman a uno de estos y no a los render* sueltos, para que el camino de una
   edicion este escrito en un solo sitio.                                   */
import { ST, recomputeAll } from '../state.ts';
import type { Mode } from '../types.ts';
import { rebuildScene, onResize, fitView } from '../scene.ts';
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

/** Cambia de modo de trabajo.
 *
 *  El modo reparte la pantalla entera, así que el lienzo WebGL cambia de
 *  tamaño: sin onResize() se queda con los píxeles del modo anterior y se monta
 *  encima del panel de al lado. Y se reencuadra, porque el 3D pasa de una
 *  columna estrecha a media pantalla o a una banda baja: lo que se veía
 *  centrado dejaría de verse. */
export function setMode(m: Mode): void {
  if (ST.mode === m) return;
  ST.mode = m;
  renderAll();
  onResize();
  fitView();
}
