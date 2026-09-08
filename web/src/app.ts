/* =========================================================================
   BARCOMP alpha — compensación de dobleces en barra rectangular de aluminio.

   Este archivo es el arranque y el cableado: monta la escena, engancha los
   grupos de eventos y pinta la primera vez. Lo que hacen esos eventos está al
   lado, en app/:

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
  initScene, fitView, setOnPick, setOnResize, markDirty, rebuildScene, renderer,
  drawGizmo, drawLabels, groupHost,
} from './scene.ts';
import { drawRibbon, bindRibbon, setOnRibbonSelect } from './ribbon.ts';
import { renderAll, refresh, selectBend } from './app/render.ts';
import { importCsvText, importCsvBatch, openError } from './app/files.ts';
import { initHistory, markSaved, isDirty } from './app/history.ts';
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
  /* la pila arranca con el estado inicial: sin esto el primer deshacer no
     tendría a dónde volver */
  initHistory();
  /* El estado de arranque es el modelo de demostración: no hay nada que
     perder todavía, así que cuenta como guardado. */
  markSaved();
  guardUnload();
}

/* Cerrar la pestaña con piezas medidas sin guardar las borra sin dejar rastro:
   no hay localStorage por regla dura y todo sale por «Guardar JSON». Una
   medición de GOM no se repite sin volver a montar la barra en el fixture.

   El navegador enseña su propio texto, no el nuestro —es así desde hace años,
   para que nadie use este aviso como cepo— pero el diálogo aparece, que es lo
   que hace falta. */
function guardUnload(): void {
  window.addEventListener('beforeunload', e => {
    if (!isDirty()) return;
    e.preventDefault();
    /* Chrome todavía mira el returnValue heredado; con los dos, funciona en
       todos los navegadores que este proyecto declara soportar. */
    e.returnValue = '';
  });
}
document.addEventListener('DOMContentLoaded', boot);

/* Expuesto para depurar desde la consola del navegador, y para que el banco
   pueda medir. `rebuildScene` y `renderer` están aquí por eso último: sin
   ellos, el coste de la escena solo se puede medir junto con el de los
   paneles, y las geometrías vivas (renderer.info) no se pueden contar. */
/** Forma del objeto de depuración: vive solo aquí, un cast puntual sobre
 *  `window` no necesita una declaración global nueva. */
type DebugExports = {
  ST: typeof ST; E: typeof E; I18N: typeof I18N; LANG: typeof LANG;
  renderAll: typeof renderAll; refresh: typeof refresh; REF: typeof REF;
  drawGizmo: typeof drawGizmo; drawLabels: typeof drawLabels; groupHost: typeof groupHost;
  rebuildScene: typeof rebuildScene; markDirty: typeof markDirty;
  get renderer(): typeof renderer;
  /* el banco no puede abrir un diálogo de archivo: entra por aquí, que es el
     mismo camino que recorre un CSV de verdad menos el diálogo. */
  importCsvText: typeof importCsvText;
  importCsvBatch: typeof importCsvBatch;
  /* tampoco puede provocar un archivo roto desde el disco: la clasificacion
     del fallo al abrir se ejercita llamando aqui con el error ya construido. */
  openError: typeof openError;
};
/* `renderer` se lee por getter porque initScene() lo asigna DESPUÉS de que
   este módulo se evalúe: copiarlo aquí guardaría el undefined de arranque. */
if (typeof window !== 'undefined') (window as unknown as { BARCOMP: DebugExports }).BARCOMP = {
  ST, E, I18N, LANG, renderAll, refresh, REF, drawGizmo, drawLabels, groupHost,
  rebuildScene, markDirty, importCsvText, importCsvBatch, openError,
  get renderer() { return renderer; },
};
