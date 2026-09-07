/* =========================================================================
   BARCOMP alpha — compensación de dobleces en barra rectangular de aluminio.

   Este archivo es el arranque y el cableado: monta la escena, engancha los
   grupos de eventos y pinta la primera vez. Lo que hacen esos eventos está al
   lado, en app/:

     app/dom.ts            el atajo $()
     app/render.ts         renderAll · refresh · refreshTable · selectBend
     app/theme.ts          useTheme · setTheme · el matchMedia del sistema
     app/actions.ts        editores, variantes, archivos y action()
     app/events/click.ts   pestañas y el despachador de clics por data-*
     app/events/change.ts  confirmación de celda (`change`) y deslizadores
     app/events/keyboard.ts  la tabla como hoja de cálculo, y la rueda
     app/events/grips.ts   los dos tiradores y el ResizeObserver

   El motor vive en engine.ts (gemelo de python/barcomp/core.py) y el resto
   está repartido en i18n · state · scene · ribbon · panels · report · io.

   Flujo de renderizado, de más barato a más caro (ver app/render.ts):

     drawRibbon()     solo la cinta inferior (canvas 2D)
     renderStatus()   barra de estado
     renderRight()    panel derecho (reconstruye #panes entero)
     renderLeft()     panel izquierdo
     renderPanels()   = left + right + status
     rebuildScene()   destruye y reconstruye TODA la geometría de three.js
     renderShell()    header, barra de vista, leyenda, pestañas
     renderAll()      = shell + panels + escena + cinta

   Llama lo más barato que sirva.
   ========================================================================= */
import * as E from './engine.ts';
import { I18N, LANG } from './i18n.ts';
import { ST, REF, loadModel } from './state.ts';
import {
  initScene, fitView, setOnPick, setOnResize, markDirty,
  drawGizmo, drawLabels, groupHost,
} from './scene.ts';
import { drawRibbon, bindRibbon, setOnRibbonSelect } from './ribbon.ts';
import { renderAll, refresh, selectBend } from './app/render.ts';
import { useTheme, bindScheme } from './app/theme.ts';
import { bindClick } from './app/events/click.ts';
import { bindChange } from './app/events/change.ts';
import { bindKeyboard } from './app/events/keyboard.ts';
import { bindGrips } from './app/events/grips.ts';

/* Todas las escuchas son por delegación sobre document.body, así que da igual
   cuántas veces se reconstruyan los paneles: se enganchan una sola vez, aquí,
   y siguen valiendo para los nodos que vengan después. */
function bind(): void {
  bindClick();
  bindChange();
  bindKeyboard();
  bindGrips();
  bindScheme();

  bindRibbon();
  setOnRibbonSelect(selectBend);
  setOnPick(i => selectBend(i));
  setOnResize(drawRibbon);
}

/* =============================================================== arranque */
function boot(): void {
  /* loadModel() también acepta variantes/ref/anchor de un archivo (ver
     openJson en app/actions.ts); aquí se arranca sin ninguno de los tres. */
  loadModel(E.demoModel());
  initScene();
  useTheme(ST.theme);
  bind();
  renderAll();
  fitView();
  markDirty();
}
document.addEventListener('DOMContentLoaded', boot);

/* expuesto para depurar desde la consola del navegador */
/** Forma del objeto de depuración: vive solo aquí, un cast puntual sobre
 *  `window` no necesita una declaración global nueva. */
type DebugExports = {
  ST: typeof ST; E: typeof E; I18N: typeof I18N; LANG: typeof LANG;
  renderAll: typeof renderAll; refresh: typeof refresh; REF: typeof REF;
  drawGizmo: typeof drawGizmo; drawLabels: typeof drawLabels; groupHost: typeof groupHost;
};
if (typeof window !== 'undefined') (window as unknown as { BARCOMP: DebugExports }).BARCOMP = { ST, E, I18N, LANG, renderAll, refresh, REF, drawGizmo, drawLabels, groupHost };
