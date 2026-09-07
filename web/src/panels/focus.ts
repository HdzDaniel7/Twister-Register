/* =========================================================================
   EL FOCO A TRAVÉS DEL RENDER — renderRight() reconstruye #panes entero y con
   eso destruye el <input> que tuviera el foco. Dos capas contra eso:

     1. updateModelDerived() — actualización DIRIGIDA. Al confirmar una celda
        no se reconstruye nada: se reescriben solo las celdas derivadas y el
        campo enfocado no se toca. Es el camino normal y el que hace que
        recorrer la tabla con el teclado no vaya a tirones.
     2. saveFocus/restoreFocus — la red de seguridad para todos los demás
        caminos, que sí reconstruyen.
   ========================================================================= */
import * as E from '../engine.ts';
import { ST, V } from '../state.ts';
import { $, fx, nx } from './fmt.ts';

const CELL_ATTRS = ['b', 'bd', 'st', 'p', 'mk', 'tw', 'm', 's', 't', 'c', 'pr', 'pl', 'plp'];

/** Selector estable de una celda editable, o null si el nodo no lo es. */
export function cellKey(el: Element | null): string | null {
  if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'SELECT')) return null;
  /* ya se comprobó tagName INPUT/SELECT: ambos son HTMLElement con dataset */
  const d = (el as HTMLElement).dataset;
  for (const a of CELL_ATTRS) {
    if (d[a] !== undefined) {
      return `[data-${a}="${d[a]}"]` + (d.k ? `[data-k="${d.k}"]` : '');
    }
  }
  return null;
}

export function saveFocus(): { key: string; sel: (number | null)[] | null } | null {
  const el = document.activeElement;
  const key = cellKey(el);
  if (!key) return null;
  let sel: (number | null)[] | null = null;
  /* selectionStart lanza en <input type=number>: no todos los tipos lo tienen.
     El elemento activo, si dio una key, es el mismo <input>/<select> que
     comprobó cellKey(); si no soporta selectionStart cae al catch igual que
     antes. */
  try { sel = [(el as HTMLInputElement).selectionStart, (el as HTMLInputElement).selectionEnd]; } catch (_) { sel = null; }
  return { key, sel };
}

export function restoreFocus(f: ReturnType<typeof saveFocus>): void {
  if (!f) return;
  const el = $('#panes ' + f.key) || $(f.key);
  if (!el) return;
  el.focus();
  if (f.sel && f.sel[0] !== null && f.sel[0] !== undefined) {
    /* el nodo que devolvió cellKey() es un <input>/<select>: setSelectionRange
       solo existe en el primero, y el try/catch ya cubría eso antes */
    try { (el as HTMLInputElement).setSelectionRange(f.sel[0]!, f.sel[1]!); } catch (_) { /* nada */ }
  }
}

/** Reescribe SOLO las celdas derivadas de la tabla de modelo, sin tocar el
 *  innerHTML del panel ni el campo que tenga el foco. Devuelve false si la
 *  tabla no está montada y hace falta un renderRight() de verdad. */
export function updateModelDerived(): boolean {
  const M = ST.model;
  if (!M || ST.tab !== 'model') return false;
  const body = $<HTMLTableSectionElement>('#panes table.lra tbody');
  if (!body || body.rows.length !== M.bends.length) return false;

  const v = V();
  E.syncDeltas(v);
  const LEN = E.rowLengths(M), BASE = E.rowLengths(v.base);
  const ori = E.orientations(M);
  const act = document.activeElement;
  const put = (row: Element, cell: string, txt: string): void => {
    const el = row.querySelector(`[data-cell="${cell}"]`);
    if (el) el.textContent = txt;
  };

  M.bends.forEach((b, i) => {
    const row = body.rows[i];
    if (!row) return;

    const o = row.querySelector('.ori');
    if (o) { o.textContent = ori[i]; o.className = 'ori ' + ori[i]; }

    /* la recta se teclea, pero cambiar un radio o un ángulo la deja QUIETA a
       propósito: se recolocan los avances. Se reescribe igualmente por si el
       cambio vino de otro sitio (fundir Δ, abrir un archivo, deshacer). */
    const st = row.querySelector<HTMLInputElement>('input[data-st]');
    if (st) {
      if (st !== act) st.value = nx(BASE[i].straight);
      st.classList.toggle('v-bad', BASE[i].straight < 25);
    }

    put(row, 'arc', fx(LEN[i].arc, 2));
    put(row, 'cum', fx(LEN[i].cum, 2));

    const tl = row.querySelector<HTMLInputElement>('input[data-k="twistLen"]');
    if (tl) {
      const span = E.twistSpanOf(M, i);
      tl.title = '0 = ' + fx(span, 1) + ' mm';
      tl.classList.toggle('v-warn', !!((b.twist || 0) && (b.twistLen || 0) > span));
    }

    /* un Δ en cero se apaga; la clase se puede tocar aunque el campo tenga el
       foco, cambiar className no interrumpe lo que se está escribiendo */
    E.DELTA_KEYS.forEach(k => {
      const el = row.querySelector<HTMLInputElement>(`input[data-bd][data-k="${k}"]`);
      if (!el) return;
      el.classList.toggle('z', !v.deltas[i][k]);
      if (el !== act) el.value = nx(v.deltas[i][k]);
    });
    row.classList.toggle('hasd', E.DELTA_KEYS.some(k => v.deltas[i][k]));
  });

  const foot = $('#panes table.lra tfoot');
  if (foot) {
    put(foot, 'tstr', fx(E.tailStraight(M), 2));
    put(foot, 'dev', fx(E.developedLength(M), 2));
  }
  return true;
}
