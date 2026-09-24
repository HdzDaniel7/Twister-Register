/* ------------------------------------------------------ la tecla de signo --
   El teclado de un teléfono no trae signo menos. Los 140 campos numéricos de
   la aplicación son `<input type="number">`, y para esos el navegador saca un
   teclado de cifras: en muchos teléfonos ese teclado no tiene «-» por ninguna
   parte, así que una compensación negativa NO SE PUEDE TECLEAR. Y 125 de los
   140 campos no tienen tope inferior —entre ellos las tres columnas de Δ:
   ángulo, rotación y recta—, o sea que el negativo no es un caso raro sino la
   mitad del oficio.

   No se cambia el `type`. Un `type="text"` con `inputmode="decimal"` sacaría el
   mismo teclado sin menos en iOS, y de paso tiraría la validación, las flechas
   y el `valueAsNumber` de los que vive media aplicación. Lo que se añade es una
   tecla aparte: un botón flotante que cambia el signo del campo que tiene el
   foco. Solo en teléfono —en un teclado de verdad el menos ya está— y solo
   sobre un campo que ADMITA negativo, que enseñarla encima de un campo con
   `min="0"` es ofrecer algo que no va a pasar.

   El cuerpo es el de `stepField()` en keyboard.ts: escribir el valor y disparar
   un `change` que burbujee. Ese `change` es el que ya confirma cualquier celda,
   así que el signo entra por el mismo camino que teclear y se apila igual en el
   deshacer.                                                                 */
import { nx } from '../../panels.ts';
import { T } from '../../i18n.ts';

/** El campo enfocado, si es un numérico que admite negativo. Un `min` vacío es
 *  «sin tope», que es el caso de 125 de los 140 campos. */
function target(): HTMLInputElement | null {
  const el = document.activeElement as HTMLInputElement | null;
  if (!el || el.tagName !== 'INPUT' || el.type !== 'number') return null;
  if (el.min !== '' && +el.min >= 0) return null;
  return el;
}

/** Enseña o esconde la tecla según dónde esté el foco. La llaman `focusin` y
 *  `focusout`; fuera de teléfono la esconde el CSS, pero se calcula igual
 *  porque `ST.phone` puede cambiar sin que el foco se mueva. */
function sync(b: HTMLButtonElement): void {
  const t = target();
  b.hidden = !t;
  /* El rótulo se pone al enseñarla y no al crearla: el idioma se cambia en
     caliente, y este botón no cuelga de ningún render que lo repinte. */
  if (t) b.title = b.ariaLabel = T('signKey');
}

/** Cambia el signo del campo enfocado. Un campo vacío no tiene signo que
 *  cambiar, y un `max` por debajo de cero no es de ninguno de los campos de
 *  hoy, pero se respeta igual que hace `stepField()`. */
function flip(): void {
  const t = target();
  if (!t) return;
  const v = parseFloat(t.value);
  if (!isFinite(v)) return;
  let n = -v;
  if (t.max !== '' && isFinite(+t.max)) n = Math.min(+t.max, n);
  if (t.min !== '' && isFinite(+t.min)) n = Math.max(+t.min, n);
  t.value = nx(n);
  t.dispatchEvent(new Event('change', { bubbles: true }));
}

export function bindSignKey(): void {
  const b = document.createElement('button');
  b.id = 'signk';
  b.type = 'button';
  b.setAttribute('data-sign', '');
  b.textContent = '±';
  b.hidden = true;
  /* Dentro de #app y no en el body: así la regla que la pinta cuelga de
     `#app.phone`, como todo lo demás del teléfono, y el banco la enciende
     igual que el resto. Va `position:fixed`, o sea que no ocupa celda. */
  (document.getElementById('app') || document.body).appendChild(b);

  /* `pointerdown` con el efecto quitado: sin esto, tocar el botón saca el foco
     del campo, y entonces no hay a quién cambiarle el signo. */
  b.addEventListener('pointerdown', e => e.preventDefault());
  b.addEventListener('mousedown', e => e.preventDefault());
  b.addEventListener('click', flip);

  document.body.addEventListener('focusin', () => sync(b));
  document.body.addEventListener('focusout', () => {
    /* El foco pasa por el body entre dos campos: si se escondiera en el acto,
       la tecla parpadearía en cada salto de celda. Un turno de espera y se
       pregunta por el foco DE DESPUÉS. */
    setTimeout(() => sync(b), 0);
  });
}
