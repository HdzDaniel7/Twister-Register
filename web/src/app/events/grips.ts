/* ------------------------------------------------------------- tiradores --
   Los dos que reparten la pantalla. Qué mueve cada uno depende del MODO, que
   es quien decide la forma de la pantalla: ver GripJob más abajo.

   Al mover cualquiera hay que llamar onResize(), o el lienzo WebGL conserva su
   tamaño en píxeles y se monta encima del panel o de la cinta. El
   ResizeObserver sobre #vpwrap es el otro freno.                           */
import * as E from '../../engine.ts';
import { onResize } from '../../scene.ts';
import { ST } from '../../state.ts';
import { $ } from '../dom.ts';

const clamp = E.clamp;

/** Qué mueve cada tirador en cada modo, en píxeles y con sus topes.
 *
 *  El mismo tirador cambia de trabajo con el modo porque la pantalla cambia de
 *  forma: en MODELAR la columna de la derecha es la tabla, en MEDIR es el
 *  lateral de desviación, y en COMPENSAR no hay columna — ahí el tirador de
 *  abajo mueve la banda del 3D en vez del alto de la cinta.
 *
 *  `min` y `max` son duros: sin ellos se puede arrastrar la tabla hasta dejar
 *  el 3D en cero, y volver de eso es imposible con el ratón. */
type GripJob = { css: string; min: number; max: () => number; from: 'right' | 'bottom' };

function rightJob(): GripJob | null {
  if (ST.mode === 'model') {
    return { css: '--btW', min: 420, max: () => Math.min(1180, innerWidth - 520), from: 'right' };
  }
  if (ST.mode === 'meas') {
    return { css: '--rtW', min: 260, max: () => Math.min(880, innerWidth - 420), from: 'right' };
  }
  return null;                       // COMPENSAR no tiene columna a la derecha
}
function bottomJob(): GripJob {
  /* en Compensar el tirador levanta la banda del 3D; en los demás, la cinta */
  return ST.mode === 'comp'
    ? { css: '--compVP', min: 120, max: () => Math.max(160, innerHeight - 420), from: 'bottom' }
    : { css: '--ribbon', min: 56, max: () => Math.max(80, innerHeight - 480), from: 'bottom' };
}

/** Arrastre común de los dos tiradores. Lo que cambia entre ellos es de qué
 *  borde se mide y qué variable CSS se escribe; el resto —captura del puntero,
 *  clase `.drag`, y el onResize() sin el cual el lienzo WebGL se queda con los
 *  píxeles de antes y se monta encima del panel— es idéntico. */
function dragGrip(el: HTMLElement, job: () => GripJob | null): void {
  el.addEventListener('pointerdown', e => {
    const j = job();
    if (!j) return;
    e.preventDefault();
    el.classList.add('drag');
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent): void => {
      const raw = j.from === 'right' ? innerWidth - ev.clientX : innerHeight - ev.clientY;
      const v = clamp(raw, j.min, Math.max(j.min, j.max()));
      document.documentElement.style.setProperty(j.css, v + 'px');
      onResize();
    };
    const up = (): void => {
      el.classList.remove('drag');
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  });
}

export function bindGrips(): void {
  const grip = $('#rtgrip');
  if (grip) dragGrip(grip, rightJob);
  const bgrip = $('#btgrip');
  if (bgrip) dragGrip(bgrip, bottomJob);

  /* El lienzo tiene que seguir a su contenedor pase lo que pase: arrastrar
     cualquiera de los dos tiradores, cambiar el zoom del navegador o abrir las
     herramientas del IDE. */
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => onResize()).observe($('#vpwrap')!);
  }
}
