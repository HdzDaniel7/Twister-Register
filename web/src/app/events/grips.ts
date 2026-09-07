/* ------------------------------------------------------------- tiradores --
   Los dos que reparten la pantalla: `#rtgrip` el ancho del lateral y
   `#btgrip` el alto del bloque de abajo. Al mover cualquiera hay que llamar
   onResize(), o el lienzo WebGL conserva su tamano en pixeles y se monta
   encima del panel o de la cinta. El ResizeObserver es el otro freno.      */
import * as E from '../../engine.ts';
import { onResize } from '../../scene.ts';
import { $ } from '../dom.ts';

const clamp = E.clamp;

export function bindGrips(): void {
  /* ancho del panel derecho: arrastrar el tirador */
  const grip = $('#rtgrip');
  if (grip) {
    grip.addEventListener('pointerdown', e => {
      e.preventDefault();
      grip.classList.add('drag');
      grip.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const w = clamp(innerWidth - ev.clientX, 260, Math.min(880, innerWidth - 420));
        document.documentElement.style.setProperty('--rtW', w + 'px');
        /* sin esto el lienzo WebGL conserva su tamaño en píxeles y se monta
           encima del panel derecho: la tabla queda detrás de la figura. */
        onResize();
      };
      const up = () => {
        grip.classList.remove('drag');
        grip.releasePointerCapture(e.pointerId);
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
  }

  /* alto de la tabla de abajo: arrastrar el tirador del borde de la cinta.
     Sube y baja el bloque entero (cinta + tabla), y el 3D nunca baja de 200 px
     porque esa fila del grid es minmax(200px,1fr). */
  const bgrip = $('#btgrip');
  if (bgrip) {
    bgrip.addEventListener('pointerdown', e => {
      e.preventDefault();
      bgrip.classList.add('drag');
      bgrip.setPointerCapture(e.pointerId);
      const cs = getComputedStyle(document.documentElement);
      const rib = parseFloat(cs.getPropertyValue('--ribbon')) || 74;
      const sth = parseFloat(cs.getPropertyValue('--statusH')) || 26;
      const hd = parseFloat(cs.getPropertyValue('--h')) || 44;
      const move = (ev: PointerEvent) => {
        /* debajo del tirador van la cinta, la tabla y la barra de estado */
        const h = clamp(innerHeight - ev.clientY - rib - sth,
                        120, Math.max(120, innerHeight - hd - rib - sth - 200));
        document.documentElement.style.setProperty('--btH', h + 'px');
        /* sin esto el lienzo WebGL conserva su tamaño en píxeles y se monta
           encima de la cinta y de la tabla. */
        onResize();
      };
      const up = () => {
        bgrip.classList.remove('drag');
        bgrip.releasePointerCapture(e.pointerId);
        bgrip.removeEventListener('pointermove', move);
        bgrip.removeEventListener('pointerup', up);
      };
      bgrip.addEventListener('pointermove', move);
      bgrip.addEventListener('pointerup', up);
    });
  }

  /* El lienzo tiene que seguir a su contenedor pase lo que pase: arrastrar
     cualquiera de los dos tiradores, cambiar el zoom del navegador o abrir las
     herramientas del IDE. */
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => onResize()).observe($('#vpwrap')!);
  }
}
