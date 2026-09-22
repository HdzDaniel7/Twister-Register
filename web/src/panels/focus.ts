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
import { feasNote } from './model.ts';

/* Los atributos de las celdas cuyo foco hay que devolver después de repintar.
   Una tabla que no esté aquí pierde el cursor en cada confirmación: se va a
   BODY, y Ctrl+↑ da un paso y el segundo ya no llega a ninguna parte. Eso les
   pasaba a Fixture y Amarre, que se añadieron sin tocar esta lista.

   Lo que entró con ellas, y por qué:
     · `pd` y `pn` — los campos del pedestal y del pin, nombre y cifras. Llevan
       `data-k` como las cotas, y cellKey() ya lo compone.
     · `pns` — el lado del pin es un <select> en mitad de la fila, y cellBelow()
       lo recorre con las flechas igual que un número. moveCell() rebusca el
       destino por esta clave después del repintado; sin ella se quedaría con
       el nodo que acaba de arrancarse.
     · `rs`, `mt` y `ld` — los campos sueltos del amarre, el material y la
       carga. `data-rs="on"` y `data-ld="on"` son casillas con el mismo
       atributo; que recuperen el foco no estorba y no vale una regla aparte.
   Y lo que se quedó fuera:
     · `pv`, `pnv` y `pnh` — las casillas de visible y de sujeta. No se teclean,
       cellBelow() se las salta, y ninguna de las casillas que ya había (`mv`,
       `vv`, `dv`, `ly`) está en la lista. Meter solo estas haría que la tabla
       de pines se portara distinto de la de cotas; si las casillas han de
       conservar el foco, es para todas a la vez.
     · `px`, `pnx`, `rh` y `hv` — son botones, y cellKey() solo mira <input> y
       <select>: aquí no harían nada. */
const CELL_ATTRS = ['b', 'bd', 'st', 'p', 'mk', 'tw', 'm', 's', 't', 'c', 'pr', 'pl', 'plp',
                    'pd', 'pn', 'pns', 'rs', 'mt', 'ld'];

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

/** Suelta el campo enfocado si está DENTRO de `host`, antes de reconstruirlo.
 *
 *  Es el paso que curó renderRight() el 2026-09-10 y el porqué entero está
 *  escrito allí: soltarlo aquí hace que su `change` confirme el valor antes de
 *  armar el HTML, y no desde dentro de la asignación de innerHTML. Sale a este
 *  archivo porque los tres renders que reconstruyen con campos dentro lo
 *  necesitan, y se aplicó solo en el que se vio fallar. */
export function commitFocusIn(host: Element | null): void {
  const act = document.activeElement as HTMLElement | null;
  if (act && host && act !== host && host.contains(act)) act.blur();
}

/** Tira lo que se esté tecleando en el campo enfocado y lo suelta SIN
 *  confirmar: es Escape y salir, en un paso.
 *
 *  El `change` se corta en el propio campo y no se confía en que el navegador
 *  no lo dispare: devolver el valor por script debería dejar el campo limpio,
 *  pero si alguno lo dispara igual, llegaría al manejador con el valor de
 *  ENTRADA, que es el que enseñaba la celda redondeado a su formato y no
 *  necesariamente el que guarda el documento. Eso sería otro paso apilado. */
export function dropPendingEdit(): void {
  const t = document.activeElement as HTMLInputElement | null;
  if (!t || t.tagName !== 'INPUT' || t.dataset.orig === undefined) return;
  const quieto = (ev: Event): void => ev.stopPropagation();
  t.addEventListener('change', quieto);
  try {
    t.value = t.dataset.orig;
    t.blur();
  } finally {
    t.removeEventListener('change', quieto);
  }
}

/** Deja a la vista, en rojo, el texto que una celda NO entendió.
 *
 *  Se llama DESPUÉS de repintar: el panel se reconstruye entero, así que el
 *  texto rechazado ya no está en ninguna parte y hay que volver a escribirlo.
 *  Antes se descartaba en silencio y la celda volvía a su valor de siempre,
 *  que es exactamente lo que se ve cuando el ajuste SÍ se acepta y resulta que
 *  no cambia nada. Dos resultados opuestos con la misma pinta.
 *
 *  No roba el foco: el `change` salta al salir del campo, o sea que el usuario
 *  ya está en otro sitio y devolverle el cursor a la fuerza es peor. */
export function markRejected(key: string, text: string, why: string): void {
  const el = $<HTMLInputElement>('#panes ' + key);
  if (!el) return;
  el.value = text;
  el.classList.add('badcell');
  el.title = why;
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
      /* el rojo va sobre la recta EFECTIVA, que es la que se fabrica y la que
         juzga feasNote(); el campo enseña la de la base */
      st.classList.toggle('v-bad', LEN[i].straight < ST.lims.straightMin);
    }
    /* El Δ de la RECTA: se teclea en la unidad de la columna de al lado y se
       guarda como Δ de avance. Un Δ de ángulo lo mueve sin que nadie lo
       teclee, así que este campo se reescribe aunque no se haya tocado. */
    const dst = row.querySelector<HTMLInputElement>('input[data-bd][data-k="straight"]');
    if (dst) {
      const d = +E.straightDelta(v.base, M, i).toFixed(3);
      if (dst !== act) dst.value = nx(d);
      dst.classList.toggle('z', !d);
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
    /* la cola se TECLEA en el pie desde el 2026-09-22: no es un textContent */
    /* `input[data-m]` a secas y no `[data-m="tail"]`: en el pie no hay otro
       campo, y nombrar el valor haría que focus.ts figurara como EMISOR de
       `data-m` en la prueba de atributos compartidos (ARQ-02). */
    const tf = foot.querySelector<HTMLInputElement>('input[data-m]');
    if (tf) {
      if (tf !== act) tf.value = nx(E.tailStraight(v.base));
      tf.classList.toggle('v-bad', E.tailStraight(M) < ST.lims.straightMin);
    }
    const dt = +E.tailStraightDelta(v.base, M).toFixed(3);
    const dtc = foot.querySelector('[data-cell="tdlt"] span');
    if (dtc) { dtc.textContent = fx(dt, 2); dtc.className = dt ? '' : 'z'; }
    put(foot, 'dev', fx(E.developedLength(M), 2));
  }
  /* El aviso de fabricabilidad se recalcula aquí y no solo al reconstruir el
     panel: teclear una recta pasa SIEMPRE por este camino dirigido, y es justo
     tecleando cuando una recta se vuelve imposible. El hueco lo pinta
     paneModel() aunque vaya vacío, así que siempre hay dónde escribir. */
  const fab = $('#fabnote');
  if (fab) {
    const html = feasNote(M);
    if (fab.innerHTML !== html) fab.innerHTML = html;
  }
  return true;
}
