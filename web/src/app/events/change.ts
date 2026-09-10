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
import { $ } from '../../dom.ts';
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
/* De PED_DEFAULT y no a mano: ver por qué en engine/fixture.ts. `visible` sale
   porque es una casilla y no pasa por setNum(). */
const PED_NUM = new Set(Object.keys(E.PED_DEFAULT).filter(k => k !== 'visible'));
const PED_KEYS = new Set(['name', ...PED_NUM]);
const ANCHORS = new Set(['start', 'end', 'best']);
/* Los umbrales: la lista sale de LIMS_DEFAULT, como las demas. */
const LIMS_KEYS = new Set<string>(E.LIMS_KEYS);
/* El perfil de maquina: las columnas por un lado —son una lista— y el resto de
   campos por otro. Las dos listas salen de lo congelado en engine/machine.ts. */
const MACH_COLS = new Set<string>(E.MACHINE_COLS);
/* Pines, amarre y material: las tres listas salen de lo congelado en
   engine/pins.ts, como PED_NUM sale de PED_DEFAULT. */
const PIN_NUM = new Set(Object.keys(E.PIN_DEFAULT).filter(k => k !== 'visible' && k !== 'hold'));
const PIN_KEYS = new Set(['name', ...PIN_NUM]);
const RS_NUM = new Set(Object.keys(E.RESTRAINT_DEFAULT).filter(k => k !== 'on' && k !== 'doRot'));
const MAT_KEYS = new Set(Object.keys(E.MAT_DEFAULT));
const MACH_KEYS = new Set(Object.keys(E.MACHINE_DEFAULT).filter(k => k !== 'cols'));

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
        || onPlacement(t, d) || onMark(t, d) || onPedestal(t, d) || onTweak(t, d));
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
  if (d.pn !== undefined || d.pnv !== undefined || d.pnh !== undefined
      || d.pns !== undefined || d.rs !== undefined || d.mt !== undefined) return onPin(t, d);
  if (d.mc !== undefined || d.mf !== undefined) return onMachine(t, d);
  if (d.lm !== undefined) {
    if (!LIMS_KEYS.has(d.lm)) return true;
    const n = num(t.value);
    if (n === null) return true;
    /* Recortado a su rango AQUI, no solo al abrir un archivo: un umbral
       tecleado fuera de rango es el mismo fallo que uno leido fuera de rango, y
       limOf() es el unico sitio donde vive esa decision. Se repinta siempre,
       tambien cuando el recorte devuelve otro numero del que se tecleo: si no,
       la celda se queda enseñando un valor que el programa no esta usando. */
    ST.lims[d.lm as keyof typeof ST.lims] = E.limOf(d.lm as keyof typeof ST.lims, n);
    /* La escena no: ningun umbral mueve un PI. Lo que cambia es la tabla —que
       recta se pinta corta— y el aviso de fabricacion. */
    renderRight();
    return true;
  }
  return false;
}

/* --- los pines laterales, el amarre y el material -------------------------
   Todo esto puede cambiar la FORMA de la pieza —con el amarre puesto, mover un
   pin la deforma— así que después de escribir se repinta y se reconstruye la
   escena, igual que al mover un pedestal. La cuenta en sí no se dispara aquí:
   `heldResult()` la hace cuando alguien pregunta, y con caché. */
function onPin(t: HTMLInputElement, d: DOMStringMap): boolean {
  /* La barra de ESTADO también: lleva el aviso de que la pieza está sujeta y
     el peor esfuerzo. Sin esto, apagar el amarre dejaba el aviso puesto —lo
     cazó el banco— y un aviso que se queda cuando ya no toca deja de leerse. */
  const pintar = () => { renderShell(); renderRight(); renderStatus(); rebuildScene(); };
  if (d.pn !== undefined) {
    const p = ST.pins.find(x => x.id === d.pn);
    if (!p || !d.k || !PIN_KEYS.has(d.k)) return true;
    if (d.k === 'name') p.name = t.value;
    else if (!setNum(p, PIN_NUM, d.k, t.value)) return true;
    pintar();
    return true;
  }
  if (d.pnv !== undefined) {
    const p = ST.pins.find(x => x.id === d.pnv);
    if (p) { p.visible = t.checked; rebuildScene(); }
    return true;
  }
  if (d.pns !== undefined) {
    const p = ST.pins.find(x => x.id === d.pns);
    /* El lado es del FIXTURE, no de la forma: cambiarlo puede cambiar por qué
       cara se cierra el contacto, así que se repinta todo. */
    if (p) { p.side = t.value === '1' ? 1 : t.value === '-1' ? -1 : 0; pintar(); }
    return true;
  }
  if (d.pnh !== undefined) {
    const p = ST.pins.find(x => x.id === d.pnh);
    /* quitar el «sujeta» de un pin cambia la forma sujeta: hay que repintar la
       tabla del costo, no solo la escena */
    if (p) { p.hold = t.checked; pintar(); }
    return true;
  }
  if (d.rs !== undefined) {
    if (d.rs === 'on' || d.rs === 'doRot') {
      (ST.restraint as unknown as Record<string, boolean>)[d.rs] = t.checked;
      /* encender el amarre enciende sus dos capas: si no, se activa y en el 3D
         no cambia nada visible, que se lee como que no funcionó */
      if (d.rs === 'on' && t.checked) {
        ST.layers.pins.on = true;
        ST.layers.held.on = true;
      }
    } else if (!setNum(ST.restraint, RS_NUM, d.rs, t.value)) return true;
    pintar();
    return true;
  }
  if (d.mt !== undefined) {
    /* El material NO mueve un PI —ver engine/pins.ts— así que aquí basta con
       repintar la tabla: reconstruir la escena no cambiaría un píxel. */
    if (setNum(ST.mat, MAT_KEYS, d.mt, t.value)) renderRight();
    return true;
  }
  return false;
}

/* --- el perfil de exportación a la máquina -------------------------------
   Todo lo de aquí cambia el ARCHIVO, no la pieza: la vista previa se rehace y
   la escena ni se entera. Los valores llegan como cadenas de un <select>, así
   que se validan contra las listas congeladas y lo que no encaje se descarta —
   normMachineFmt() los volvería a sanear al guardar, pero para entonces el
   panel ya estaría enseñando algo que el motor no usa. */
function onMachine(t: HTMLInputElement, d: DOMStringMap): boolean {
  if (d.mc !== undefined) {
    if (!MACH_COLS.has(d.mc)) return true;
    const col = d.mc as (typeof E.MACHINE_COLS)[number];
    const on = t.checked;
    const cols = ST.mach.cols.filter(c => c !== col);
    /* La ULTIMA columna no se puede quitar. Sin ninguna no hay archivo que
       escribir, y machineCsv() volveria al perfil de fabrica: el panel
       ensenaria cero columnas marcadas y el archivo saldria con cinco, que es
       justo el fallo que este panel existe para no tener. La casilla vuelve a
       marcarse sola al repintar. */
    if (!on && !cols.length) { renderRight(); return true; }
    /* El orden del archivo es el de MACHINE_COLS, no el de marcado: reordenar
       a mano pediría arrastrar, y el panel se reconstruye entero. */
    ST.mach.cols = on ? E.MACHINE_COLS.filter(c => c === col || cols.includes(c)) : cols;
    renderRight();
    return true;
  }
  const k = d.mf;
  if (k === undefined || !MACH_KEYS.has(k)) return true;
  const M = ST.mach as unknown as Record<string, unknown>;
  if (t.type === 'checkbox') M[k] = t.checked;
  else if (k === 'decimals') { const n = num(t.value); if (n === null) return true; M[k] = n; }
  else if (k === 'signAngle' || k === 'signRot') M[k] = t.value === '-1' ? -1 : 1;
  else M[k] = t.value;
  /* Saneado en el acto, con la misma función que sanea un archivo: un perfil a
     medias tiene que dar un archivo válido, y el sitio donde vive esa decisión
     es uno solo. */
  Object.assign(ST.mach, E.normMachineFmt(ST.mach));
  renderRight();
  return true;
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

/* --- el fixture: los pedestales ------------------------------------------ */
function onPedestal(t: HTMLInputElement, d: DOMStringMap): boolean {
  if (d.pd !== undefined) {
    const p = ST.fixture.find(x => x.id === d.pd);
    if (!p || !d.k || !PED_KEYS.has(d.k)) return true;
    if (d.k === 'name') p.name = t.value;
    else if (!setNum(p, PED_NUM, d.k, t.value)) return true;
    /* La escena también: mover un pedestal cambia de color al que deja de
       sostener la barra, y ese es el aviso que se ve sin leer la tabla. */
    renderRight(); rebuildScene();
    return true;
  }
  if (d.pv !== undefined) {
    const p = ST.fixture.find(x => x.id === d.pv);
    if (p) { p.visible = t.checked; rebuildScene(); }
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
