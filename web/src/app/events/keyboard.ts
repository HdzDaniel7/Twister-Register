/* --------------------------------------------------- teclado y rueda -------
   La tabla se recorre como una hoja de calculo. Tab / Shift+Tab los resuelve
   el navegador —las celdas calculadas no son campos, asi que ya se saltan
   solas—; aqui van los movimientos verticales, el descarte con Escape, la
   seleccion al enfocar y el incremento que las flechas cedieron al navegar. */
import { cellKey, nx } from '../../panels.ts';
import { $ } from '../../dom.ts';
import { ST } from '../../state.ts';
import { openDrawer, toggleSolo } from '../render.ts';
import { action } from '../actions.ts';

/** Sube o baja un campo numérico un paso. Mismo cuerpo para la rueda y para
 *  Ctrl+↑ / Ctrl+↓, o los dos se separan en cuanto alguien toque uno.
 *
 *  El paso viene de `data-step`: el atributo `step` vale "any" a propósito, o
 *  el navegador marcaría inválido todo lo que no cae en su rejilla. No se
 *  redondea al paso, solo se limpia el ruido de coma flotante — así sumar un
 *  paso sobre 17.905 da 18.005 y no 18. */
function stepField(t: HTMLInputElement, dir: number): void {
  const st = parseFloat(t.dataset.step as string) || parseFloat(t.step) || 1;
  let v = (parseFloat(t.value) || 0) + dir * st;
  if (t.min !== '' && isFinite(+t.min)) v = Math.max(+t.min, v);
  if (t.max !== '' && isFinite(+t.max)) v = Math.min(+t.max, v);
  t.value = nx(v);
  t.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Campo editable de la MISMA columna, en la fila de arriba o de abajo. Salta
 *  las filas cuya celda de esa columna sea calculada. */
function cellBelow(t: HTMLInputElement | HTMLSelectElement, dRow: number): HTMLInputElement | HTMLSelectElement | null {
  const td = t.closest('td'), tr = td && (td.parentElement as HTMLTableRowElement | null);
  const body = tr && (tr.parentElement as HTMLTableSectionElement | null);
  if (!body || body.tagName !== 'TBODY') return null;
  const rows = [...body.rows], c = td!.cellIndex;
  for (let r = rows.indexOf(tr as HTMLTableRowElement) + dRow; r >= 0 && r < rows.length; r += dRow) {
    const cel = rows[r].cells[c];
    const el = cel && cel.querySelector<HTMLInputElement | HTMLSelectElement>(
      'input:not([type=checkbox]):not([type=color]),select');
    if (el) return el;
  }
  return null;
}

/** Mueve el foco confirmando antes el valor. El destino se vuelve a buscar por
 *  selector DESPUÉS del `change`: si algo forzó un renderRight(), el nodo de
 *  antes ya no está en el documento. */
function moveCell(from: HTMLInputElement | HTMLSelectElement, to: HTMLInputElement | HTMLSelectElement): void {
  const key = cellKey(to);
  from.blur();                        // dispara `change`: confirma el valor
  const live = ((key && ($<HTMLInputElement | HTMLSelectElement>('#panes ' + key)
    || $<HTMLInputElement | HTMLSelectElement>(key))) || to) as HTMLInputElement | HTMLSelectElement;
  if (!live.isConnected) return;
  live.focus();
  if ((live as HTMLInputElement).select) (live as HTMLInputElement).select();
}

/** La tabla de desviacion con el teclado.
 *
 *  Sus filas seleccionan un doblez al pulsarlas —eso ya estaba— pero solo con
 *  el raton: no habia forma de llegar a ellas tabulando, y quien no usa raton
 *  se quedaba sin la unica manera de saltar de la desviacion al doblez que la
 *  produjo. Ahora la fila es enfocable (`tabindex` en panels/meas.ts) y aqui
 *  van las teclas: Enter y Espacio la eligen, y las flechas suben y bajan sin
 *  salir de la tabla, que es lo que hace un `<select>` o cualquier lista.
 *
 *  El foco se vuelve a poner DESPUES del repintado, buscando la fila por su
 *  `data-r`: seleccionar reconstruye el panel entero y el nodo de antes ya no
 *  esta en el documento — el mismo motivo por el que moveCell() rebusca. */
function bindDevRows(): void {
  document.body.addEventListener('keydown', e => {
    const fila = (e.target as HTMLElement).closest('tr[data-r]') as HTMLTableRowElement | null;
    if (!fila) return;
    const i = +(fila.dataset.r as string);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fila.click();
      const vivo = $<HTMLElement>(`tr[data-r="${i}"]`);
      if (vivo) vivo.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const paso = e.key === 'ArrowDown' ? 1 : -1;
    const dest = $<HTMLElement>(`tr[data-r="${i + paso}"]`);
    if (dest) dest.focus();
  });
}

export function bindKeyboard(): void {
  bindDevRows();
  /* Escape cierra el cajón de menú, como en cualquier menú. Solo cuando el
     foco NO está en un campo: dentro de una celda, Escape ya significa
     «descarta lo que escribí», y esa es la que manda. */
  /* Ctrl+Z / Ctrl+Y, también dentro de una celda: lo que se deshace es la
     edición confirmada, no el texto que se está tecleando —para eso está
     Escape, que devuelve la celda a como estaba al entrar. */
  document.body.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    const esRehacer = k === 'y' || (k === 'z' && e.shiftKey);
    if (k !== 'z' && k !== 'y') return;
    e.preventDefault();
    action(esRehacer ? 'redo' : 'undo');
  });

  /* F pliega y despliega el 3D. Fuera de los campos, claro: dentro, la F es
     una letra. */
  document.body.addEventListener('keydown', e => {
    if (e.key !== 'f' && e.key !== 'F') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    e.preventDefault();
    toggleSolo();
  });

  document.body.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    /* Escape sale primero de pantalla completa y luego cierra el cajón */
    const t0 = e.target as HTMLElement;
    if (ST.solo && !/^(INPUT|SELECT|TEXTAREA)$/.test(t0.tagName)) { toggleSolo(); return; }
    if (!ST.drawer) return;
    const t = e.target as HTMLElement;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    openDrawer(null);
  });

  /* rueda del ratón sobre un campo numérico ENFOCADO = sube/baja un paso.
     Sustituye a las flechas nativas, que se ocultaron para no tapar cifras.
     Dentro de una tabla las flechas navegan (ver el manejador de teclado), así
     que ahí el incremento por teclado es Ctrl+↑ / Ctrl+↓. */
  document.body.addEventListener('wheel', e => {
    const t = e.target as HTMLInputElement;
    if (!t || t.tagName !== 'INPUT' || t.type !== 'number') return;
    if (document.activeElement !== t) return;
    e.preventDefault();
    stepField(t, e.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  /* Al entrar en un campo se guarda el valor de partida (Escape lo devuelve) y
     se selecciona entero: teclear reemplaza, que es lo que se espera de una
     tabla, y no hay que borrar a mano cifra por cifra. */
  document.body.addEventListener('focusin', e => {
    const t = e.target as HTMLInputElement;
    if (!t || t.tagName !== 'INPUT') return;
    t.dataset.orig = t.value;
    if (t.type !== 'number' && t.type !== 'text') return;
    try { t.select(); } catch (_) { return; }
    /* el `mouseup` que cierra un clic deshace la selección: se le quita el
       efecto una sola vez, o hacer clic en la celda la dejaría sin seleccionar */
    const keep = (ev: MouseEvent) => ev.preventDefault();
    t.addEventListener('mouseup', keep, { once: true });
    setTimeout(() => t.removeEventListener('mouseup', keep), 300);
  });

  /* ------------------------------------------- teclado tipo hoja de cálculo
     Tab / ⇧Tab los resuelve el navegador: las celdas calculadas no son campos,
     así que ya se saltan solas. Aquí van los movimientos verticales, el
     descarte y el incremento por teclado que las flechas cedieron al navegar. */
  document.body.addEventListener('keydown', e => {
    const t = e.target as HTMLInputElement;
    if (!t || t.tagName !== 'INPUT' || !t.closest('table')) return;
    if (t.type === 'checkbox' || t.type === 'color') return;

    if (e.key === 'Escape') {
      e.preventDefault();
      if (t.dataset.orig !== undefined) t.value = t.dataset.orig;
      if (t.select) t.select();
      return;
    }
    const up = e.key === 'ArrowUp';
    const down = e.key === 'ArrowDown' || e.key === 'Enter';
    if (!up && !down) return;
    e.preventDefault();

    /* Ctrl (o ⌘) devuelve a las flechas su oficio anterior */
    if ((e.ctrlKey || e.metaKey) && t.type === 'number' && e.key !== 'Enter') {
      stepField(t, up ? 1 : -1);
      return;
    }
    moveCell(t, cellBelow(t, up ? -1 : 1) || t);
  });
}
