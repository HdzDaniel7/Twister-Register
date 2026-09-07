/* =========================================================================
   ORQUESTA EL RENDER — el lateral derecho (medición, fijo), el bloque de
   abajo (la pestaña activa, a todo ancho) y renderPanels() que dispara los
   cuatro renders de golpe.
   ========================================================================= */
import { ST } from '../state.ts';
import { $, TABS_OF } from './fmt.ts';
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
  /* en Modelar y en Compensar el lateral no está en pantalla: reconstruir su
     HTML sería armar una tabla de desviación que nadie va a ver */
  if (ST.mode !== 'meas') return;
  const host = $('#rt'), keep = host ? host.scrollTop : 0;
  $('#side')!.innerHTML = paneMeas(ST.model!);
  if (host) host.scrollTop = keep;
}

/* ================================= bloque de abajo: la tabla a todo ancho = */
export function renderRight(): void {
  /* Medir no tiene bloque de abajo: lo suyo vive en el lateral. */
  if (ST.mode === 'meas') return;
  const M = ST.model, host = $('#panes'), keep = host ? host.scrollTop : 0;
  const f = saveFocus();
  /* la sub-pestaña tiene que existir DENTRO del modo: un archivo guardado en
     'meas', o en 'comp' mientras se modela, cae en la primera del modo */
  const tabs = TABS_OF[ST.mode];
  if (!tabs.includes(ST.tab)) ST.tab = tabs[0];
  const pane = { model: paneModel, points: panePoints, comp: paneComp }[ST.tab as 'model' | 'points' | 'comp'];
  $('#panes')!.innerHTML = pane(M!);
  if (host) host.scrollTop = keep;
  restoreFocus(f);
}

/* Los cuatro de golpe. renderSide() y renderRight() se saltan solos cuando su
   sitio no está en pantalla, así que esto no dibuja de balde. */
export const renderPanels = (): void => { renderLeft(); renderSide(); renderRight(); renderStatus(); };
