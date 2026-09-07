/* =========================================================================
   ORQUESTA EL RENDER — el lateral derecho (medición, fijo), el bloque de
   abajo (la pestaña activa, a todo ancho) y renderPanels() que dispara los
   cuatro renders de golpe.
   ========================================================================= */
import { ST } from '../state.ts';
import { $, TABS } from './fmt.ts';
import { saveFocus, restoreFocus } from './focus.ts';
import { paneModel } from './model.ts';
import { panePoints } from './points.ts';
import { paneMeas } from './meas.ts';
import { paneComp } from './comp.ts';
import { renderLeft } from './left.ts';
import { renderStatus } from './status.ts';

/* ====================================== lateral derecho: la desviación ==== */
/* No es una pestaña: es lo que hay que tener delante mientras se edita la
   tabla de abajo. Estadísticas, proceso simulado y desviación por doblez. */
export function renderSide(): void {
  const host = $('#rt'), keep = host ? host.scrollTop : 0;
  $('#side')!.innerHTML = paneMeas(ST.model!);
  if (host) host.scrollTop = keep;
}

/* ================================= bloque de abajo: la tabla a todo ancho = */
export function renderRight(): void {
  const M = ST.model, host = $('#panes'), keep = host ? host.scrollTop : 0;
  const f = saveFocus();
  if (!TABS.includes(ST.tab)) ST.tab = 'model';   // archivos guardados en 'meas'
  const pane = { model: paneModel, points: panePoints, comp: paneComp }[ST.tab as 'model' | 'points' | 'comp'];
  $('#panes')!.innerHTML = pane(M!);
  if (host) host.scrollTop = keep;
  restoreFocus(f);
}

export const renderPanels = (): void => { renderLeft(); renderSide(); renderRight(); renderStatus(); };
