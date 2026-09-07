/* --------------------------------------------------- teclado y rueda -------
   La tabla se recorre como una hoja de calculo. Tab / Shift+Tab los resuelve
   el navegador —las celdas calculadas no son campos, asi que ya se saltan
   solas—; aqui van los movimientos verticales, el descarte con Escape, la
   seleccion al enfocar y el incremento que las flechas cedieron al navegar. */
import { cellKey, nx } from '../../panels.ts';
import { $ } from '../dom.ts';

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

export function bindKeyboard(): void {
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
