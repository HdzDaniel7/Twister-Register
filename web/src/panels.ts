/* ---------------------------------------------------------------- paneles --
   No hay framework ni estado en el DOM: cada panel se reconstruye entero a
   partir de ST. Consecuencia: un renderRight() mientras alguien escribe le
   quita el foco, por eso los inputs de tabla usan el evento `change` (dispara
   al salir del campo), no `input`.

   Los controles se cablean por delegación con atributos data-* (ver bind()
   en app.ts). Para agregar un botón basta con darle el atributo correcto.   */
/* Este archivo es solo un barril: reexporta `panels/*.ts`, partido por
   responsabilidad (formato y atajos compartidos, armazón, panel izquierdo,
   el foco a través del render, y un archivo por pestaña/bloque del lateral
   derecho y de abajo). Quien importa `./panels.ts` no nota el reparto. Como
   en `scene.ts`, aquí NO se usa `export *`: `fmt.ts` exporta helpers internos
   (oriTag, sgn) que varios paneles necesitan pero que nunca fueron API
   pública de este archivo, así que la reexportación es explícita y nombre
   por nombre. */
export {
  TABS, fx, nx, nfield, esc, cls,
} from './panels/fmt.ts';
export { renderShell } from './panels/shell.ts';
export { renderLeft } from './panels/left.ts';
export { cellKey, updateModelDerived, markRejected } from './panels/focus.ts';
export { paneFixture } from './panels/fixture.ts';
export { renderSide, renderRight, renderPanels } from './panels/render.ts';
export { renderStatus } from './panels/status.ts';
