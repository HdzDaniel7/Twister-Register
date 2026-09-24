/* -------------------------------------------------------------- teléfono --
   La aplicación se escribió para un monitor: la rejilla de MODELAR pide
   320 px de 3D MÁS 760 px de tabla, y en un teléfono de 390 px la tabla
   arrancaba en x = 320 con 760 px de ancho. No es que se viera apretada: el
   documento no desplaza en X —`#app` es una rejilla de alto 100vh— así que
   690 px de tabla quedaban FUERA DE ALCANCE. Ni tocándola se llegaba.

   La bandera vive en ST y no en una `@media` a propósito. Lo que cambia en un
   teléfono no es solo el reparto: los cuatro menús de la cabecera no caben al
   lado de los modos, y pasan a un cajón. Eso es lo que se PINTA, no cómo se
   ve, y desde dentro de la página una consulta de medios no se puede forzar —
   con el diseño colgado de una `@media`, el banco no podría probar nada de
   esto. Colgado de `ST.phone`, el banco lo enciende y mide.                */
import { ST } from '../state.ts';
import { onResize, fitView } from '../scene.ts';
import { renderAll } from './render.ts';

/** El umbral. 760 px y no 480: a 760 ya no caben el 3D y la tabla lado a
 *  lado, que es la razón entera del cambio, y ahí entra también una tableta
 *  en vertical. Casa con el `max-width` del reporte, que se eligió midiendo
 *  lo mismo. */
export const PHONE_MQ = '(max-width:760px)';

/** Si la pantalla de AHORA es de teléfono. `matchMedia` puede no existir en
 *  un entorno de prueba sin ventana; ahí se mide el ancho a mano. */
export function detectPhone(): boolean {
  const w = window as { matchMedia?: typeof matchMedia };
  return w.matchMedia ? matchMedia(PHONE_MQ).matches : innerWidth <= 760;
}

/** Engancha el umbral. Solo repinta al CRUZARLO: un `resize` de escritorio
 *  —arrastrar el borde de la ventana— no puede costar un `renderAll()` por
 *  fotograma. El lienzo WebGL ya se entera solo, por el ResizeObserver de
 *  grips.ts; aquí hace falta además `fitView()`, porque el 3D pasa de media
 *  pantalla a una banda ancha y baja y la pieza se queda descentrada. */
export function bindPhone(): void {
  ST.phone = detectPhone();
  const w = window as { matchMedia?: typeof matchMedia };
  if (!w.matchMedia) return;
  const mq = matchMedia(PHONE_MQ);
  const onCross = (): void => {
    const v = mq.matches;
    if (v === ST.phone) return;
    ST.phone = v;
    renderAll();
    onResize();
    fitView();
  };
  if (mq.addEventListener) mq.addEventListener('change', onCross);
  else if (mq.addListener) mq.addListener(onCross);
}
