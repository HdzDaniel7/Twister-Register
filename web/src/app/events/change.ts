/* --------------------------------------------------------------- cambios --
   `change` es el evento de confirmacion de una celda (dispara al salir del
   campo) e `input` el de los deslizadores, que si quieren repintar mientras
   se arrastran. Los paneles se reconstruyen enteros, asi que usar `input`
   para una celda le quitaria el foco a quien esta escribiendo.

   TODO LO QUE ENTRA POR AQUI SE COMPRUEBA. El `data-*` sale del HTML que
   pinta este mismo programa, asi que en condiciones normales la clave es
   buena — pero «en condiciones normales» no es una garantia, es una
   suposicion, y el precio de equivocarse es escribir una clave que nadie
   declaro dentro de ST.comp o un NaN dentro de la geometria, que desde ahi se
   propaga a todos los numeros de la pantalla sin un solo error en la consola.
   Las listas blancas salen de los objetos *_DEFAULT congelados: asi no pueden
   quedarse atras cuando alguien agregue un campo.                          */
import * as E from '../../engine.ts';
import { ST, V, syncModel } from '../../state.ts';
import { rebuildScene } from '../../scene.ts';
import { renderShell, renderLeft, renderRight, renderStatus } from '../../panels.ts';
import type { AnchorMode, DeltaKey } from '../../types.ts';
import { safeColor } from '../../safe.ts';
import { $ } from '../dom.ts';
import { refresh } from '../render.ts';
import { commit } from '../history.ts';
import {
  variantById, editBend, editStraight, editDelta, editPoint, editTweak,
} from '../actions.ts';

/* --- listas blancas ------------------------------------------------------
   Derivadas de los objetos congelados que ya declaran la forma, no escritas a
   mano: una lista a mano se queda vieja el dia que se agrega un campo, y lo
   hace en silencio. Seccion y tolerancias no tienen objeto por defecto y van
   con sus cuatro claves literales, que llevan sin moverse desde el principio. */
const COMP_KEYS = new Set(Object.keys(E.COMP_DEFAULT));
const PROC_KEYS = new Set(Object.keys(E.PROC_DEFAULT));
const PLACE_KEYS = new Set(Object.keys(E.PLACE_DEFAULT));
const SECTION_KEYS = new Set(['width', 'thickness', 'chamfer', 'endLen']);
const TOL_KEYS = new Set(['angle', 'rot', 'feed', 'point']);
const DELTA_SET = new Set<string>(E.DELTA_KEYS);
const POINT_KEYS = new Set(['x', 'y', 'z']);
const TWEAK_KEYS = new Set(['angle', 'rot', 'feed']);
const MARK_KEYS = new Set(['name', 'x', 'y', 'z']);
const ANCHORS = new Set(['start', 'end', 'best']);

/** Un numero que se puede escribir en el modelo, o null.
 *
 *  `+t.value` devuelve NaN con cualquier texto que el campo deje pasar, y un
 *  NaN dentro de la geometria no rompe nada de golpe: se propaga a las
 *  longitudes, a los PI y a la desviacion, y la pantalla se llena de guiones
 *  sin decir de donde salio. Es mas barato no dejarlo entrar. */
const num = (v: string): number | null => {
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
};

/** Escribe `v` en `obj[k]` solo si `k` esta declarada y `v` es un numero. */
function setNum(obj: object, keys: Set<string>, k: string | undefined, v: string): boolean {
  const n = k !== undefined && keys.has(k) ? num(v) : null;
  if (n === null) return false;
  (obj as Record<string, number>)[k as string] = n;
  return true;
}

export function bindChange(): void {
  /* Un `change` confirmado es una edición del documento: se apila después, y
     commit() no hace nada si el documento no cambió (una casilla de capa, por
     ejemplo, no gasta un paso de deshacer). */
  document.body.addEventListener('change', e => { onChange(e); commit(); });
  bindInput();
}

/** Reparte el `change` entre los grupos. Cada grupo devuelve true si el evento
 *  era suyo, así que el primero que lo reconozca corta la cadena. */
function onChange(e: Event): void {
  const t = e.target as HTMLInputElement, d = t.dataset;
  /* Vaciar una celda y salirse NO debe escribir un 0 que nadie pidió: se
     devuelve lo que había al entrar. Con la selección automática al enfocar,
     teclear ya reemplaza el valor entero y borrar a mano deja de hacer falta. */
  if (t.tagName === 'INPUT' && t.type === 'number' && !String(t.value).trim()) {
    if (d.orig !== undefined) t.value = d.orig;
    return;
  }
  void (onScene(t, d) || onModelField(t, d) || onCell(t, d)
        || onPlacement(t, d) || onMark(t, d) || onTweak(t, d));
}

/* --- capas, modelos y piezas: lo que se ve y de qué color ---------------- */
function onScene(t: HTMLInputElement, d: DOMStringMap): boolean {
  if (d.ly !== undefined) {
    /* la capa tiene que EXISTIR: `ST.layers[k].on` sobre una clave que no está
       lanza, y lo hace dentro de un manejador de eventos, donde nadie lo ve */
    const L = ST.layers[d.ly as keyof typeof ST.layers];
    if (L) { L.on = t.checked; rebuildScene(); }
    return true;
  }
  if (d.lc !== undefined) {
    const L = ST.layers[d.lc as keyof typeof ST.layers];
    if (L) { L.color = safeColor(t.value, L.color); renderShell(); rebuildScene(); }
    return true;
  }
  if (d.an !== undefined) {
    if (!ANCHORS.has(d.an)) return true;
    ST.anchor = d.an as AnchorMode;
    renderLeft(); renderRight(); renderStatus(); rebuildScene();
    return true;
  }
  if (d.vv !== undefined) { const x = variantById(d.vv); if (x) { x.visible = t.checked; rebuildScene(); } return true; }
  if (d.vc !== undefined) {
    const x = variantById(d.vc);
    if (x) { x.color = safeColor(t.value, x.color); renderShell(); renderLeft(); rebuildScene(); }
    return true;
  }
  /* el nombre se edita en los dos sitios: aquí, en la tarjeta del modelo, y
     en la pestaña MODELO. No se repinta el panel izquierdo, que es donde
     está el campo que se acaba de escribir. */
  if (d.vn !== undefined) {
    const x = variantById(d.vn);
    if (x) {
      x.name = t.value;
      x.base.name = t.value;
      if (x.id === ST.active) syncModel();
      renderShell(); renderRight(); renderStatus();
    }
    return true;
  }
  if (d.dv !== undefined) { const x = ST.datasets.find(z => z.id === d.dv); if (x) { x.visible = t.checked; rebuildScene(); } return true; }
  if (d.dc !== undefined) {
    const x = ST.datasets.find(z => z.id === d.dc);
    if (x) { x.color = safeColor(t.value, x.color); rebuildScene(); }
    return true;
  }
  return false;
}

/* --- cabecera del modelo: nombre, cola, sección, tolerancias, lazo ------- */
function onModelField(t: HTMLInputElement, d: DOMStringMap): boolean {
  const v = V();
  if (d.m !== undefined) {
    if (d.m === 'name') {
      v.name = t.value; v.base.name = t.value;
      syncModel(); renderShell(); renderLeft(); renderStatus();
    } else if (d.m === 'tail') {
      const n = num(t.value);
      if (n !== null) { v.base.tail = n; syncModel(); refresh(); }
    }
    return true;
  }
  if (d.s !== undefined) {
    if (setNum(v.base.section, SECTION_KEYS, d.s, t.value)) { syncModel(); refresh(); }
    return true;
  }
  if (d.t !== undefined && t.type === 'number') {
    if (setNum(v.base.tol, TOL_KEYS, d.t, t.value)) { syncModel(); refresh(); }
    return true;
  }
  if (d.c !== undefined) {
    /* las casillas del lazo son booleanas y los campos numéricos no; la clave
       tiene que estar declarada en COMP_DEFAULT en los dos casos */
    if (!COMP_KEYS.has(d.c)) return true;
    if (t.type === 'checkbox') (ST.comp as unknown as Record<string, boolean>)[d.c] = t.checked;
    else if (!setNum(ST.comp, COMP_KEYS, d.c, t.value)) return true;
    renderRight();
    return true;
  }
  if (d.pr !== undefined) { setNum(ST.proc, PROC_KEYS, d.pr, t.value); return true; }
  return false;
}

/* --- celdas de las tablas: dobleces, rectas, Δ y puntos ------------------ */
function onCell(t: HTMLInputElement, d: DOMStringMap): boolean {
  const n = num(t.value);
  if (d.b !== undefined) {
    if (n !== null && d.k && DELTA_SET.has(d.k)) editBend(+d.b, d.k as DeltaKey, n);
    return true;
  }
  if (d.st !== undefined) { if (n !== null) editStraight(+d.st, n); return true; }
  if (d.bd !== undefined) {
    if (n !== null && d.k && DELTA_SET.has(d.k)) editDelta(+d.bd, d.k as DeltaKey, n);
    return true;
  }
  if (d.p !== undefined) {
    if (n !== null && d.k && POINT_KEYS.has(d.k)) editPoint(+d.p, d.k as 'x' | 'y' | 'z', n);
    return true;
  }
  return false;
}

/* --- colocación: solo presentación, no toca ningún dato del modelo ------- */
function onPlacement(t: HTMLInputElement, d: DOMStringMap): boolean {
  if (d.pl !== undefined) {
    if (setNum(ST.place, PLACE_KEYS, d.pl, t.value)) { renderStatus(); rebuildScene(); }
    return true;
  }
  if (d.plp !== undefined) {
    const n = num(t.value);
    if (n !== null) { ST.place.pivot = n | 0; rebuildScene(); }
    return true;
  }
  return false;
}

/* --- puntos de referencia ------------------------------------------------ */
function onMark(t: HTMLInputElement, d: DOMStringMap): boolean {
  if (d.mk !== undefined) {
    const mk = ST.marks.find(x => x.id === d.mk);
    if (!mk || !d.k || !MARK_KEYS.has(d.k)) return true;
    if (d.k === 'name') mk.name = t.value;
    else if (!setNum(mk, POINT_KEYS, d.k, t.value)) return true;
    renderRight(); rebuildScene();
    return true;
  }
  if (d.mv !== undefined) {
    const mk = ST.marks.find(x => x.id === d.mv);
    if (mk) { mk.visible = t.checked; rebuildScene(); }
    return true;
  }
  if (d.mc !== undefined) {
    const mk = ST.marks.find(x => x.id === d.mc);
    if (mk) { mk.color = safeColor(t.value, mk.color); renderRight(); rebuildScene(); }
    return true;
  }
  return false;
}

/* --- ajuste manual de la compensación ------------------------------------ */
/* La celda acepta cuentas sobre lo que calculó el lazo (`c`) y sobre lo que
   MUESTRA. Se guarda la DIFERENCIA contra el cálculo, no el valor absoluto: si
   después cambias la ganancia o llega otra pieza medida, el ajuste sigue
   significando lo mismo («dos décimas más de lo que sugiera el lazo»). */
function onTweak(t: HTMLInputElement, d: DOMStringMap): boolean {
  if (d.tw === undefined || !d.k || !TWEAK_KEYS.has(d.k)) return false;
  editTweak(+d.tw, d.k as 'angle' | 'rot' | 'feed', t.value);
  return true;
}

function bindInput(): void {
  document.body.addEventListener('input', e => {
    const t = e.target as HTMLInputElement, d = t.dataset;
    if (t.id === 'exag') {
      const n = num(t.value);
      if (n === null) return;
      ST.view.exag = n;
      $('#exagv')!.textContent = t.value + '×';
      rebuildScene();
    }
    if (d.pr !== undefined) {
      if (!setNum(ST.proc, PROC_KEYS, d.pr, t.value)) return;
      const val = t.parentElement!.querySelector('.val');
      if (val) {
        const suf = d.pr === 'biasRot' ? '°'
          : ['sbW', 'sbT', 'slip'].includes(d.pr) ? '%' : '';
        val.textContent = t.value + suf;
      }
    }
  });
}
