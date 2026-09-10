/* -------------------------------------------------------------- escena 3D --
   Three.js. Render BAJO DEMANDA: el bucle solo dibuja cuando `dirty` es true.
   Si cambias algo visual y no se ve, probablemente falta un markDirty().

   rebuildScene() destruye y reconstruye TODA la geometría. Cada objeto va
   dentro de un grupo de `groups{}` y se hace dispose() de geometrías y
   materiales: si agregas objetos fuera de un grupo, filtras memoria.        */
/* Este archivo es solo un barril: reexporta `scene/*.ts`, partido por
   responsabilidad (tipos locales, escenario y bucle de render, geometría
   barrida, capas, reconstrucción y encuadre). Quien importa `./scene.ts` no
   nota el reparto. A diferencia de `engine.ts`, aquí NO se usa `export *`:
   `stage.ts` exporta helpers internos (groups, clearGroup, ghost...) que las
   demás partes de `scene/` necesitan pero que nunca fueron API pública de
   este archivo, así que la reexportación es explícita y nombre por nombre. */
export type { ViewName } from './scene/types.ts';
export {
  renderer, scene, camera, controls,
  setOnPick, markDirty, cssVar, devThreeColor, devCssColor,
  groups, groupHost, applyTheme, initScene, setOnResize, onResize,
  drawGizmo, drawLabels,
} from './scene/stage.ts';
export { barGeometry } from './scene/geometry.ts';
export { rebuildScene } from './scene/build.ts';
export { fitView, setView, captureViews } from './scene/view.ts';
