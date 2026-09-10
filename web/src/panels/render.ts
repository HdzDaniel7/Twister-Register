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
import { paneFixture } from './fixture.ts';
import { paneLims } from './lims.ts';
import { paneMach } from './mach.ts';
import { panePins } from './pins.ts';
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
  const host = $('#panes'), keep = host ? host.scrollTop : 0;
  const f = saveFocus();
  /* CONFIRMAR ANTES DE MIRAR EL MODELO, y esto no es una precaución: es una
   * corrección.
   *
   * Un campo con texto sin confirmar no ha escrito nada todavía —la tabla usa
   * `change`, que salta al SALIR de la celda— así que si aquí se pinta sin más,
   * se pinta con el valor de antes. Y peor: la asignación de `innerHTML`
   * arranca ese campo del documento, eso dispara su `blur`, el `blur` dispara
   * el `change`, el `change` escribe el valor y manda repintar... todo desde
   * DENTRO de la asignación que aún no ha terminado. El navegador lo dice tal
   * cual: «the node to be removed is no longer a child of this node. Perhaps it
   * was moved in a blur event handler?».
   *
   * Lo que se veía era esto: se escribía −0.7 en una casilla, la geometría
   * cambiaba y la casilla se quedaba en 0.00, porque el HTML que acababa de
   * instalarse se había armado ANTES de que el valor existiera. Había que
   * teclear el mismo número dos veces.
   *
   * Soltar el campo aquí ordena las tres cosas: se confirma, se pinta con el
   * dato ya escrito, y `restoreFocus()` devuelve el cursor donde estaba. La
   * llamada anidada que provoque ese `change` se completa entera antes de que
   * esta siga, porque para entonces ya no queda nada enfocado que soltar. */
  const act = document.activeElement as HTMLElement | null;
  if (act && host && act !== host && host.contains(act)) act.blur();
  const M = ST.model;
  /* la sub-pestaña tiene que existir DENTRO del modo: un archivo guardado en
     'meas', o en 'comp' mientras se modela, cae en la primera del modo */
  const tabs = TABS_OF[ST.mode];
  if (!tabs.includes(ST.tab)) ST.tab = tabs[0];
  const pane = { model: paneModel, points: panePoints, fixture: paneFixture,
                 pins: panePins, lims: paneLims, mach: paneMach, comp: paneComp
               }[ST.tab as 'model' | 'points' | 'fixture' | 'pins' | 'lims' | 'mach' | 'comp'];
  $('#panes')!.innerHTML = pane(M!);
  if (host) host.scrollTop = keep;
  restoreFocus(f);
}

/* Los cuatro de golpe. renderSide() y renderRight() se saltan solos cuando su
   sitio no está en pantalla, así que esto no dibuja de balde. */
export const renderPanels = (): void => { renderLeft(); renderSide(); renderRight(); renderStatus(); };
