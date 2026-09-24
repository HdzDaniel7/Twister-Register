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

/** El alto de la aplicación con el teclado del teléfono abierto.
 *
 *  Al abrirse el teclado, el viewport de DISEÑO no cambia: solo se encoge el
 *  VISIBLE, y el navegador panea hasta el campo enfocado. Medido a 390×844: el
 *  primer campo numérico de la tabla está en y=596 y el último en y=1323, así
 *  que con un teclado de 420 px el paneo va de 206 a 933 px. La cabecera mide
 *  44, o sea que se va con el primer toque en cualquier celda — que es
 *  exactamente lo que se reportó.
 *
 *  El arreglo de oficio es `interactive-widget=resizes-content` en el <meta>,
 *  y ahí este código no hace nada: el navegador ya encoge el contenido y
 *  `visualViewport.height` coincide con `innerHeight`. Esto es para los
 *  navegadores que no entienden esa bandera, donde la diferencia entre los dos
 *  altos ES el teclado: se le da a `--appH` la medida del visible, con lo que
 *  la página entera cabe en la banda que queda y no hay nada que panear.
 *
 *  El umbral de 80 px separa el teclado de las barras del navegador, que
 *  aparecen y desaparecen con el desplazamiento y mueven unas decenas. */
function syncAppH(): void {
  const el = document.documentElement;
  const vv = (window as { visualViewport?: VisualViewport }).visualViewport;
  if (!vv || !ST.phone || innerHeight - vv.height < 80) {
    el.style.removeProperty('--appH');
    return;
  }
  el.style.setProperty('--appH', Math.round(vv.height) + 'px');
  /* El paneo que el navegador ya hizo no se deshace solo: sin esto la página
     cabría entera pero seguiría enseñada por la mitad de abajo. */
  scrollTo(0, 0);
}

/** Si ese nodo es un campo de los que abren el teclado del teléfono. Las
 *  casillas, los colores y los botones no lo abren, y un `<select>` saca una
 *  rueda que no tapa lo mismo. */
function escribible(el: Element | null): boolean {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  const t = (el as HTMLInputElement).type;
  return t === 'text' || t === 'number';
}

/** La marca de «hay un teclado abierto», que es la que esconde la banda del
 *  3D (ver `#app.phone.kbd` en app.css).
 *
 *  La pone el FOCO y no una medida del alto, y eso no es un atajo: con
 *  `interactive-widget=resizes-content` el teclado encoge `innerHeight`, de
 *  modo que `visualViewport.height` y `innerHeight` vuelven a coincidir y
 *  comparar los dos viewports deja de distinguir nada. El foco en un campo es
 *  además la condición de verdad: es lo que abre el teclado.
 *
 *  Por qué se esconde el 3D: de los 424 px que deja un teclado de 420, la
 *  cabecera se lleva 44, la barra de estado 26 y el 3D 170, y a la tabla le
 *  quedaban 142 — cuatro filas. Y el 3D ahí no mira nadie: se está tecleando,
 *  y media pieza queda debajo del teclado. */
function syncKbd(): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.classList.toggle('kbd', ST.phone && escribible(document.activeElement));
}
/** Engancha el umbral. Solo repinta al CRUZARLO: un `resize` de escritorio
 *  —arrastrar el borde de la ventana— no puede costar un `renderAll()` por
 *  fotograma. El lienzo WebGL ya se entera solo, por el ResizeObserver de
 *  grips.ts; aquí hace falta además `fitView()`, porque el 3D pasa de media
 *  pantalla a una banda ancha y baja y la pieza se queda descentrada. */
export function bindPhone(): void {
  ST.phone = detectPhone();
  const vv = (window as { visualViewport?: VisualViewport }).visualViewport;
  if (vv) {
    /* `scroll` además de `resize`: en algún navegador el paneo llega después
       del cambio de alto, y sin el segundo oyente --appH se quedaría puesto
       con la página ya movida. */
    vv.addEventListener('resize', syncAppH);
    vv.addEventListener('scroll', syncAppH);
  }
  document.body.addEventListener('focusin', syncKbd);
  /* Un turno de espera al salirse: entre dos celdas el foco pasa por el body,
     y sin él la banda del 3D aparecería y desaparecería en cada salto. */
  document.body.addEventListener('focusout', () => setTimeout(syncKbd, 0));
  const w = window as { matchMedia?: typeof matchMedia };
  if (!w.matchMedia) return;
  const mq = matchMedia(PHONE_MQ);
  const onCross = (): void => {
    const v = mq.matches;
    if (v === ST.phone) return;
    ST.phone = v;
    syncAppH();
    syncKbd();
    renderAll();
    onResize();
    fitView();
  };
  if (mq.addEventListener) mq.addEventListener('change', onCross);
  else if (mq.addListener) mq.addListener(onCross);
}
