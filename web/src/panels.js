/* ---------------------------------------------------------------- paneles --
   No hay framework ni estado en el DOM: cada panel se reconstruye entero a
   partir de ST. Consecuencia: un renderRight() mientras alguien escribe le
   quita el foco, por eso los inputs de tabla usan el evento `change` (dispara
   al salir del campo), no `input`.

   Los controles se cablean por delegación con atributos data-* (ver bind()
   en app.js). Para agregar un botón basta con darle el atributo correcto.   */
import { Vector3 } from 'three';
import * as E from './engine.js';
import { T, LANG, LANGS } from './i18n.js';
import {
  ST, LAYER_DEF, V, REF, refModel, activeDataset, activeShift, syncTweak,
} from './state.js';

const $ = s => document.querySelector(s);

/* Las pestañas de abajo. La MEDICIÓN ya no es una pestaña: sus estadísticas y
   su tabla de desviación viven fijas en el lateral derecho, porque son lo que
   se mira MIENTRAS se toca la tabla. */
export const TABS = ['model', 'points', 'comp'];
export const fx = (v, n = 2) =>
  (v === null || v === undefined || !isFinite(v)) ? '—' : v.toFixed(n);
/** Valor para un campo EDITABLE. Al menos `min` decimales y hasta `max`, sin
 *  ceros de relleno de más: 30 se ve «30.00», 17.905 se ve entero. Es lo que
 *  impide que repintar la tabla se coma el tercer decimal que alguien tecleó.
 *
 *  fx() se queda para las celdas de LECTURA, donde el ancho fijo alinea mejor. */
export const nx = (v, min = 2, max = 3) => {
  if (v === null || v === undefined || !isFinite(v)) return '';
  const r = +(+v).toFixed(max);
  const dec = (String(r).split('.')[1] || '').length;
  return r.toFixed(Math.max(min, dec));
};

/** Campo numérico de tabla o de formulario.
 *
 *  `step="any"` a propósito: con un paso declarado el navegador marca inválido
 *  todo lo que no cae en la rejilla —con step=".1" un 17.905 es un error— y
 *  redondea al usar las flechas. El paso vive en `data-step`, que es lo que
 *  leen la rueda del ratón y Ctrl+flecha (ver stepField() en app.js). */
export const nfield = (step, attrs, val, extra = '') =>
  `<input type="number" step="any" data-step="${step}" ${attrs}
    value="${nx(val)}" ${extra}>`;

export const esc = s => String(s).replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const cls = (v, t) => Math.abs(v) <= t ? 'v-ok' : Math.abs(v) <= 2 * t ? 'v-warn' : 'v-bad';
/** Insignia W/T. La letra sola no dice nada a quien llega nuevo: el tooltip
 *  lleva la explicación larga, que ya estaba traducida en los tres idiomas. */
const oriTag = o => `<span class="ori ${o}" title="${T('or' + o)}">${o}</span>`;
const sgn = (v, n) => (v > 0 ? '+' : '') + fx(v, n);

/* ============================================================== armazón == */
export function renderShell() {
  $('#hd').innerHTML = `
   <div class="brand"><b>BARCOMP</b><span class="v">α</span><span class="sub">${T('sub')}</span></div>
   <div class="hspace"></div>
   <div class="hbtns">
     <button class="btn" data-a="demo">${T('bDemo')}</button>
     <button class="btn" data-a="new">${T('bNew')}</button>
     <button class="btn" data-a="open">${T('bOpen')}</button>
     <button class="btn" data-a="save">${T('bSave')}</button>
     <button class="btn pri" data-a="report">${T('bRep')}</button>
   </div>
   <div class="seg" style="margin-left:8px">
     ${[['system', '◐', 'thSys'], ['light', '☀', 'thLight'], ['dark', '☾', 'thDark']].map(
       ([k, glifo, lab]) => `<button data-th="${k}" title="${T(lab)}" aria-label="${T(lab)}"
         class="${ST.theme === k ? 'on' : ''}">${glifo}</button>`).join('')}</div>
   <div class="seg" style="margin-left:6px">
     ${LANGS.map(l => `<button data-l="${l}" class="${LANG.cur === l ? 'on' : ''}">${l.toUpperCase()}</button>`).join('')}</div>`;

  /* los dos tiradores viven en el HTML estático: sus tooltips se ponen aquí,
     que es lo único que se vuelve a correr al cambiar de idioma */
  const grip = (id, k) => { const el = $(id); if (el) el.title = T(k); };
  grip('#rtgrip', 'gripW');
  grip('#btgrip', 'gripH');

  $('#vptool').innerHTML = `
    <span class="tag">${T('view')}</span>
    ${['iso', 'top', 'front', 'side'].map(v =>
      `<button class="btn sm" data-v="${v}">${T('v' + v[0].toUpperCase() + v.slice(1))}</button>`).join('')}
    <button class="btn sm" data-v="fit">${T('vFit')}</button>
    <span class="tag" style="margin-left:6px">${T('exag')}</span>
    <input type="range" id="exag" min="0" max="120" step="1" value="${ST.view.exag}" style="width:80px">
    <span id="exagv" style="width:30px;text-align:right;color:var(--nominal)">${ST.view.exag}×</span>
    <span class="tag" style="margin-left:6px">${T('cmode')}</span>
    <div class="seg"><button data-cm="solid" class="${ST.view.cmode === 'solid' ? 'on' : ''}">${T('cSolid')}</button>
    <button data-cm="dev" class="${ST.view.cmode === 'dev' ? 'on' : ''}">${T('cDev')}</button></div>`;

  const tol = ST.model ? ST.model.tol.point : 1;
  const act = V(), ref = REF();
  $('#vplegend').innerHTML = `
    <div class="tag" style="margin-bottom:4px">${T('legend')}</div>
    <div class="row"><span class="dot" style="background:${act ? act.color : '#3FA9F5'}"></span>${esc(act ? act.name : '')}</div>
    ${ref && ref.id !== act.id ? `<div class="row"><span class="dot" style="background:${ref.color}"></span>${esc(ref.name)} · ${T('isRef')}</div>` : ''}
    <div class="row"><span class="dot" style="background:${ST.layers.meas.color}"></span>${T('lMeas')}</div>
    <div class="row"><span class="dot" style="background:${ST.layers.pred.color}"></span>${T('lPred')}</div>
    <div class="scalebar"><div class="tag">${T('devscale')}</div><div class="grad"></div>
      <div class="ends"><span>0</span><span>${fx(tol, 2)}</span><span>${fx(tol * 2, 2)} mm</span></div></div>`;

  $('#hint').textContent = T('hint');
  $('#tabs').innerHTML = TABS.map(t =>
    `<button data-t="${t}" class="${ST.tab === t ? 'on' : ''}">${T(t)}</button>`).join('');
}

/* ========================================================= panel izquierdo */
export function renderLeft() {
  const L = ST.layers, ref = refModel();
  const anchors = [['start', 'aStart'], ['end', 'aEnd'], ['best', 'aBest']];
  /* el pivote de la colocación es un PI del modelo de referencia */
  const np = E.fk(ref).pis.length;
  const pivots = [...Array(np)].map((_, i) => {
    const nm = i === 0 ? 'P0' : (i === np - 1 ? 'PE' : 'PI' + i);
    return `<option value="${i}" ${ST.place.pivot === i ? 'selected' : ''}>${nm}</option>`;
  }).join('');

  const vcard = v => {
    const act = v.id === ST.active, isref = v.id === ST.ref;
    const vm = E.effectiveModel(v);
    const nd = v.deltas.reduce((a, d) => a + E.DELTA_KEYS.filter(k => d[k]).length, 0);
    let shift = 0;
    if (!isref) {
      const sh = E.piShift(vm, ref, ST.anchor);
      shift = ST.anchor === 'end' ? sh[0] : sh[sh.length - 1];
    }
    /* La tarjeta entera activa el modelo: el guardia del `click` global ignora
       los campos, así que escribir el nombre no cambia de modelo por debajo. */
    return `<div class="ds ${act ? 'act' : ''}" data-vsel="${v.id}">
      <div class="top">
        <input type="checkbox" data-vv="${v.id}" ${v.visible ? 'checked' : ''}>
        <input type="color" class="sw" data-vc="${v.id}" value="${v.color}">
        <input type="text" class="nm" data-vn="${v.id}" value="${esc(v.name)}"
          title="${esc(v.name)}">
        ${isref ? `<span class="refbadge">${T('isRef')}</span>` : ''}
        <button class="xbtn" data-vd="${v.id}" title="${T('dupVar')}">⧉</button>
        <button class="xbtn" data-vx="${v.id}" title="${T('del')}">✕</button></div>
      <div class="meta"><span>${vm.bends.length} ${T('dblz')}</span>
        <span>Δ<b>${nd}</b></span>
        <span>${T('dTip')} <b class="${shift > .01 ? '' : 'v-dim'}">${fx(shift, 2)}</b></span></div>
      ${isref ? '' : `<button class="linkbtn" data-vr="${v.id}">${T('setRef')}</button>`}
    </div>`;
  };

  $('#lf').innerHTML = `
   <div class="grp"><div class="eyebrow">${T('variants')}<span class="n">${ST.variants.length}</span></div>
   <div class="body">
     ${ST.variants.map(vcard).join('')}
     <div class="row mt6">
       <button class="btn sm grow" data-a="varnew">${T('addVar')}</button>
       <button class="btn sm" data-a="vardup">${T('dupVar')}</button></div>
   </div></div>

   <div class="grp"><div class="eyebrow">${T('anchor')}</div><div class="body">
     ${anchors.map(([k, lab]) => `<label class="layer">
       <input type="radio" name="anch" data-an="${k}" ${ST.anchor === k ? 'checked' : ''}>
       <span class="nm">${T(lab)}</span></label>`).join('')}
   </div></div>

   <div class="grp"><div class="eyebrow">${T('place')}</div><div class="body">
     <div class="fgrid" style="grid-template-columns:1fr 96px">
       <label>${T('pivot')}</label>
       <select data-plp>${pivots}</select>
       ${[['x', 'plX'], ['y', 'plY'], ['z', 'plZ']].map(([k, lab]) =>
         `<label>${T(lab)} (mm)</label>
          ${nfield('10', `data-pl="${k}"`, ST.place[k])}`).join('')}
       ${[['rx', 'plRX'], ['ry', 'plRY'], ['rz', 'plRZ']].map(([k, lab]) =>
         `<label>${T(lab)} (°)</label>
          ${nfield('5', `data-pl="${k}"`, ST.place[k])}`).join('')}
     </div>
     <div class="row mt6"><button class="btn sm grow" data-a="placereset">${T('plReset')}</button></div>
     <div class="hintline">${T('plNote')}</div>
   </div></div>

   <div class="grp"><div class="eyebrow">${T('layers')}</div><div class="body">
    ${LAYER_DEF.map(([k, lab]) => `<div class="layer">
      <input type="checkbox" data-ly="${k}" ${L[k].on ? 'checked' : ''}>
      <input type="color" class="sw" data-lc="${k}" value="${L[k].color}">
      <span class="nm">${T(lab)}</span></div>`).join('')}
   </div></div>

   <div class="grp"><div class="eyebrow">${T('datasets')}<span class="n">${ST.datasets.length}</span></div>
   <div class="body">
    ${ST.datasets.length ? ST.datasets.map(d => `
      <div class="ds ${d.id === ST.dsActive ? 'act' : ''}">
        <div class="top">
          <input type="checkbox" data-dv="${d.id}" ${d.visible ? 'checked' : ''}>
          <input type="color" class="sw" data-dc="${d.id}" value="${d.color}">
          <span class="nm" data-dsel="${d.id}">${esc(d.name)}</span>
          <button class="xbtn" data-dx="${d.id}" title="${T('del')}">✕</button></div>
        <div class="meta"><span>Δmax <b class="${cls(d.dev.maxA, ST.model.tol.angle)}">${fx(d.dev.maxA, 3)}°</b></span>
        <span>RMS <b>${fx(d.dev.rms, 3)}°</b></span>
        <span>${T('statTip').split(' ')[0]} <b class="${cls(d.dev.tip, ST.model.tol.point)}">${fx(d.dev.tip, 2)}</b></span></div>
      </div>`).join('') : `<div class="hintline">${T('dNone')}</div>`}
    <div class="row mt6">
      <button class="btn sm grow" data-a="sim">+ ${T('addSim')}</button>
</div>
   </div></div>`;
}

/* ------------------------------------------------ el foco a través del render
   renderRight() reconstruye #panes entero y con eso destruye el <input> que
   tuviera el foco. Dos capas contra eso:

     1. updateModelDerived() — actualización DIRIGIDA. Al confirmar una celda no
        se reconstruye nada: se reescriben solo las celdas derivadas y el campo
        enfocado no se toca. Es el camino normal y el que hace que recorrer la
        tabla con el teclado no vaya a tirones.
     2. saveFocus/restoreFocus — la red de seguridad para todos los demás
        caminos, que sí reconstruyen.                                          */

const CELL_ATTRS = ['b', 'bd', 'st', 'p', 'mk', 'tw', 'm', 's', 't', 'c', 'pr', 'pl', 'plp'];

/** Selector estable de una celda editable, o null si el nodo no lo es. */
export function cellKey(el) {
  if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'SELECT')) return null;
  const d = el.dataset;
  for (const a of CELL_ATTRS) {
    if (d[a] !== undefined) {
      return `[data-${a}="${d[a]}"]` + (d.k ? `[data-k="${d.k}"]` : '');
    }
  }
  return null;
}

function saveFocus() {
  const el = document.activeElement;
  const key = cellKey(el);
  if (!key) return null;
  let sel = null;
  /* selectionStart lanza en <input type=number>: no todos los tipos lo tienen */
  try { sel = [el.selectionStart, el.selectionEnd]; } catch (_) { sel = null; }
  return { key, sel };
}

function restoreFocus(f) {
  if (!f) return;
  const el = $('#panes ' + f.key) || $(f.key);
  if (!el) return;
  el.focus();
  if (f.sel && f.sel[0] !== null && f.sel[0] !== undefined) {
    try { el.setSelectionRange(f.sel[0], f.sel[1]); } catch (_) { /* nada */ }
  }
}

/** Reescribe SOLO las celdas derivadas de la tabla de modelo, sin tocar el
 *  innerHTML del panel ni el campo que tenga el foco. Devuelve false si la
 *  tabla no está montada y hace falta un renderRight() de verdad. */
export function updateModelDerived() {
  const M = ST.model;
  if (!M || ST.tab !== 'model') return false;
  const body = $('#panes table.lra tbody');
  if (!body || body.rows.length !== M.bends.length) return false;

  const v = V();
  E.syncDeltas(v);
  const LEN = E.rowLengths(M), BASE = E.rowLengths(v.base);
  const ori = E.orientations(M);
  const act = document.activeElement;
  const put = (row, cell, txt) => {
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
    const st = row.querySelector('input[data-st]');
    if (st) {
      if (st !== act) st.value = nx(BASE[i].straight);
      st.classList.toggle('v-bad', BASE[i].straight < 25);
    }

    put(row, 'arc', fx(LEN[i].arc, 2));
    put(row, 'cum', fx(LEN[i].cum, 2));

    const tl = row.querySelector('input[data-k="twistLen"]');
    if (tl) {
      const span = E.twistSpanOf(M, i);
      tl.title = '0 = ' + fx(span, 1) + ' mm';
      tl.classList.toggle('v-warn', !!((b.twist || 0) && (b.twistLen || 0) > span));
    }

    /* un Δ en cero se apaga; la clase se puede tocar aunque el campo tenga el
       foco, cambiar className no interrumpe lo que se está escribiendo */
    E.DELTA_KEYS.forEach(k => {
      const el = row.querySelector(`input[data-bd][data-k="${k}"]`);
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

/* ====================================== lateral derecho: la desviación ==== */
/* No es una pestaña: es lo que hay que tener delante mientras se edita la
   tabla de abajo. Estadísticas, proceso simulado y desviación por doblez. */
export function renderSide() {
  const host = $('#rt'), keep = host ? host.scrollTop : 0;
  $('#side').innerHTML = paneMeas(ST.model);
  if (host) host.scrollTop = keep;
}

/* ================================= bloque de abajo: la tabla a todo ancho = */
export function renderRight() {
  const M = ST.model, host = $('#panes'), keep = host ? host.scrollTop : 0;
  const f = saveFocus();
  if (!TABS.includes(ST.tab)) ST.tab = 'model';   // archivos guardados en 'meas'
  const pane = { model: paneModel, points: panePoints, comp: paneComp }[ST.tab];
  $('#panes').innerHTML = pane(M);
  if (host) host.scrollTop = keep;
  restoreFocus(f);
}

/* --- pestaña MODELO ----------------------------------------------------- */
function paneModel(M) {
  const v = V();
  E.syncDeltas(v);
  /* La RECTA es lo que se teclea y va sobre la base, como el resto de columnas
     editables. El AVANCE es de solo lectura y se lee del modelo efectivo: es la
     consecuencia de la recta más lo que el doblez le come por los dos lados. */
  const base = v.base.bends, ori = E.orientations(M);
  const LEN = E.rowLengths(M), BASE = E.rowLengths(v.base);
  /* la cabecera del pie ocupa las 10 columnas de parámetros; la recta de salida
     va bajo L y la longitud desarrollada bajo Σ L */
  const num = (attr, i, k, val, step) =>
    nfield(step, `data-${attr}="${i}" data-k="${k}"`, val);
  /* un Δ en cero se apaga: la columna solo debe cantar cuando hay corrección */
  const dnum = (i, k, step) => {
    const d = v.deltas[i][k];
    return nfield(step, `class="${d ? '' : 'z'}" data-bd="${i}" data-k="${k}"`, d);
  };

  const rows = M.bends.map((b, i) => {
    const span = E.twistSpanOf(M, i);
    const over = (b.twist || 0) && (b.twistLen || 0) > span;
    const hasD = E.DELTA_KEYS.some(k => v.deltas[i][k]);
    const bb = base[i];
    return `<tr class="clk ${i === ST.sel ? 'sel' : ''} ${hasD ? 'hasd' : ''}" data-r="${i}">
      <td>B${i + 1}</td><td>${oriTag(ori[i])}</td>
      <td>${nfield('.5', `data-st="${i}" class="${BASE[i].straight < 25 ? 'v-bad' : ''}"`,
                   BASE[i].straight)}</td>
      <td class="dcol">${dnum(i, 'feed', '.1')}</td>
      <td>${num('b', i, 'rot', bb.rot, '.1')}</td>
      <td class="dcol">${dnum(i, 'rot', '.1')}</td>
      <td>${num('b', i, 'angle', bb.angle, '.1')}</td>
      <td class="dcol">${dnum(i, 'angle', '.1')}</td>
      <td>${num('b', i, 'radius', bb.radius, '.5')}</td>
      <td>${num('b', i, 'twist', bb.twist, '.1')}</td>
      <td>${nfield('5', `min="0" class="${over ? 'v-warn' : ''}" data-b="${i}"
        data-k="twistLen" title="0 = ${fx(span, 1)} mm"`, bb.twistLen)}</td>
      <td class="v-dim" data-cell="arc">${fx(LEN[i].arc, 2)}</td>
      <td data-cell="cum">${fx(LEN[i].cum, 2)}</td>
      </tr>`;
  }).join('');

  const d = T('dcol');
  /* la tabla ocupa todo el ancho, así que la cabecera del modelo va en banda
     horizontal: estirada a pantalla completa dejaba la tabla fuera de vista */
  return `<div class="pane on"><div class="grp"><div class="body mhead">
    <div class="mcol nm"><div class="eyebrow">${T('model')}</div>
      <input type="text" data-m="name" value="${esc(M.name)}"></div>
    <div class="mcol"><div class="eyebrow">${T('section')}</div>
      <div class="fgrid pair"><label>${T('width')} (mm)</label>${nfield('.1', 'data-s="width"', M.section.width)}
      <label>${T('thick')} (mm)</label>${nfield('.1', 'data-s="thickness"', M.section.thickness)}
      <label>${T('chamfer')} (mm)</label>${nfield('.1', 'data-s="chamfer"', M.section.chamfer)}
      <label>${T('endlen')} (mm)</label>${nfield('.5', 'data-s="endLen"', M.section.endLen)}
      <label>${T('tail')} (mm)</label>${nfield('.5', 'data-m="tail"', v.base.tail)}</div></div>
    <div class="mcol"><div class="eyebrow">${T('tol')}</div>
      <div class="fgrid pair"><label>${T('tolA')} (°)</label>${nfield('.05', 'data-t="angle"', M.tol.angle)}
      <label>${T('tolR')} (°)</label>${nfield('.05', 'data-t="rot"', M.tol.rot)}
      <label>${T('tolF')} (mm)</label>${nfield('.05', 'data-t="feed"', M.tol.feed)}
      <label>${T('tolP')} (mm)</label>${nfield('.05', 'data-t="point"', M.tol.point)}</div></div>
  </div></div>
  <div class="grp"><div class="eyebrow">${T('bends')}<span class="n">${M.bends.length}</span></div><div class="body">
    <div class="tw"><table class="lra"><thead><tr>
      <th>${T('nBend')}</th><th>${T('ori')}</th>
      <th>${T('straight')}</th><th class="dcol">${d}</th>
      <th>${T('rot')}</th><th class="dcol">${d}</th>
      <th>${T('ang')}</th><th class="dcol">${d}</th>
      <th>${T('rad')}</th><th>${T('twist')}</th><th>${T('twlen')}</th>
      <th>${T('arcL')}</th><th>${T('cumL')}</th>
      </tr></thead><tbody>${rows}</tbody>
      <tfoot><tr class="foot"><td>${T('tailRow')}</td><td colspan="10"></td>
        <td class="v-dim" data-cell="tstr">${fx(E.tailStraight(M), 2)}</td>
        <td data-cell="dev">${fx(E.developedLength(M), 2)}</td></tr></tfoot>
      </table></div>
    <div class="row mt6"><button class="btn sm" data-a="addb">+ ${T('addBend')}</button>
      ${ST.sel >= 0 ? `<button class="btn sm" data-a="delb">✕ B${ST.sel + 1}</button>` : ''}
      <span class="grow"></span>
      <button class="btn sm" data-a="bake">${T('bake')}</button>
      <button class="btn sm" data-a="zerod">${T('zeroD')}</button></div>
    <div class="hintline">${T('lenNote')}</div>
    <div class="hintline">${T('kbdNote')}</div>
    <div class="hintline">${T('note')}</div>
    <div class="hintline">${T('twnote')}</div>
  </div></div></div>`;
}

/* --- pestaña PUNTOS ----------------------------------------------------- */
function panePoints(M) {
  const ref = refModel();
  const P = E.fk(M).pis;
  let sh = [];
  try { sh = E.piShift(M, ref, ST.anchor); } catch { sh = []; }
  const n = P.length;
  /* con anclaje `end` piShift() alinea las listas POR EL FINAL, así que el
     desplazamiento del PI i vive desplazado en el arreglo. */
  const off = ST.anchor === 'end' ? n - sh.length : 0;
  const rows = P.map((p, i) => {
    const j = i - off;
    const dv = (j >= 0 && j < sh.length) ? sh[j] : 0;
    const nm = i === 0 ? 'P0' : (i === n - 1 ? 'PE' : 'PI' + i);
    return `<tr class="clk ${i - 1 === ST.sel ? 'sel' : ''}" data-r="${i - 1}">
      <td class="${i === 0 || i === n - 1 ? 'v-dim' : ''}">${nm}</td>
      ${['x', 'y', 'z'].map(k =>
        `<td>${nfield('.1', `data-p="${i}" data-k="${k}"`, p[k])}</td>`).join('')}
      <td class="${dv > .01 ? 'dv' : 'v-dim'}">${fx(dv, 2)}</td></tr>`;
  }).join('');
  return `<div class="pane on"><div class="grp">
    <div class="eyebrow">${T('points')}<span class="n">${n}</span></div><div class="body">
    <div class="tw"><table><thead><tr><th>PI</th><th>${T('x')}</th><th>${T('y')}</th>
      <th>${T('z')}</th><th>${T('dTip')}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="row mt6"><button class="btn sm" data-a="insp">${T('insPt')}</button>
      <button class="btn sm" data-a="delp">${T('delPt')}</button>
      <span class="grow"></span><button class="btn sm" data-a="expts">CSV ↓</button></div>
    <div class="hintline">${T('ptNote')}</div>
  </div></div>
  ${paneMarks(M)}</div>`;
}

/* --- puntos de referencia (dentro de la pestaña PUNTOS) ----------------- */
function paneMarks(M) {
  const ref = refModel();
  const P = E.anchoredPis(M, ref, ST.anchor);
  const rows = ST.marks.map(mk => {
    const q = new Vector3(mk.x, mk.y, mk.z);
    const near = E.nearestPoint(P, q);
    const nm = near.i < 0 ? '—'
      : (near.i === 0 ? 'P0' : (near.i === P.length - 1 ? 'PE' : 'PI' + near.i));
    return `<tr>
      <td><input type="checkbox" data-mv="${mk.id}" ${mk.visible ? 'checked' : ''}>
        <input type="color" class="sw" data-mc="${mk.id}" value="${mk.color}"></td>
      <td><input type="text" data-mk="${mk.id}" data-k="name" value="${esc(mk.name)}" style="min-width:70px"></td>
      ${['x', 'y', 'z'].map(k =>
        `<td>${nfield('1', `data-mk="${mk.id}" data-k="${k}"`, mk[k])}</td>`).join('')}
      <td class="v-dim">${nm}</td>
      <td class="${cls(near.d, M.tol.point)}">${fx(near.d, 2)}</td>
      <td><button class="xbtn" data-mx="${mk.id}" title="${T('del')}">✕</button></td></tr>`;
  }).join('');
  return `<div class="grp">
    <div class="eyebrow">${T('marks')}<span class="n">${ST.marks.length}</span></div><div class="body">
    ${ST.marks.length ? `<div class="tw"><table class="marks"><thead><tr>
      <th></th><th>${T('name')}</th><th>${T('x')}</th><th>${T('y')}</th><th>${T('z')}</th>
      <th>${T('nearPi')}</th><th>${T('distPi')}</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : ''}
    <div class="row mt6"><button class="btn sm grow" data-a="addmark">${T('addMark')}</button>
</div>
    <div class="hintline">${T('markNote')}</div>
  </div></div>`;
}

/* --- pestaña MEDICIÓN --------------------------------------------------- */
function paneMeas(M) {
  const p = ST.proc, D = activeDataset(), ori = E.orientations(M);
  const rr = (k, lab, min, max, st, suf) => `<label>${lab}</label><div class="rangerow">
    <input type="range" data-pr="${k}" min="${min}" max="${max}" step="${st}" value="${p[k]}">
    <span class="val">${p[k]}${suf || ''}</span></div>`;
  const proc = `<div class="grp"><div class="eyebrow">${T('proc')}</div><div class="body">
    <div class="fgrid" style="grid-template-columns:1fr 1fr;gap:4px 8px">
      ${rr('sbW', T('sbW'), 0, 4, .05, '%')}${rr('sbT', T('sbT'), 0, 4, .05, '%')}
      ${rr('slip', T('slip'), 0, 1, .01, '%')}${rr('biasRot', T('biasR'), -2, 2, .05, '°')}
      ${rr('noiseA', T('noise') + ' °', 0, .3, .01, '')}${rr('seed', T('seed'), 1, 99, 1, '')}</div>
    <button class="btn pri mt6" style="width:100%" data-a="sim">${T('simulate')}</button>
    <div class="hintline">${T('formula')}</div>
  </div></div>`;
  /* primero lo que se mira mientras se edita la tabla; el simulador, que se
     ajusta una vez y luego se olvida, va al final del lateral. */
  return `<div class="pane on">
  ${!D ? `<div class="grp"><div class="body"><div class="hintline">${T('dNone')}</div></div></div>` : `
  <div class="grp"><div class="eyebrow">${esc(D.name)}</div><div class="body">
    <div class="stats">
      <div class="stat"><div class="k">${T('statMaxA')}</div><div class="v ${cls(D.dev.maxA, M.tol.angle)}">${fx(D.dev.maxA, 3)}<span class="u">°</span></div></div>
      <div class="stat"><div class="k">${T('statRms')}</div><div class="v">${fx(D.dev.rms, 3)}<span class="u">°</span></div></div>
      <div class="stat"><div class="k">${T('statTip')}</div><div class="v ${cls(D.dev.tip, M.tol.point)}">${fx(D.dev.tip, 2)}<span class="u">mm</span></div></div>
      <div class="stat"><div class="k">${T('statOut')}</div><div class="v ${D.dev.out ? 'v-bad' : 'v-ok'}">${D.dev.out}<span class="u">/${M.bends.length}</span></div></div></div>
    <div class="row mt6"><span class="tag">${T('stDatum')}</span>
      <div class="seg"><button data-dm="start" class="${ST.datum === 'start' ? 'on' : ''}">${T('dStart')}</button>
      <button data-dm="best" class="${ST.datum === 'best' ? 'on' : ''}">${T('dBest')}</button></div></div>
    <div class="eyebrow" style="padding-left:0">${T('deltas')}</div>
    <div class="tw"><table><thead><tr><th>${T('nBend')}</th><th>${T('ori')}</th><th>${T('dA')}</th>
      <th>${T('dR')}</th><th>${T('dF')}</th><th>${T('dP')}</th></tr></thead><tbody>
      ${M.bends.slice(0, D.dev.angle.length).map((b, i) => `<tr class="clk ${i === ST.sel ? 'sel' : ''}" data-r="${i}"><td>B${i + 1}</td>
        <td>${oriTag(ori[i])}</td>
        <td class="${cls(D.dev.angle[i], M.tol.angle)}">${sgn(D.dev.angle[i], 3)}</td>
        <td class="${cls(D.dev.rot[i], M.tol.rot)}">${sgn(D.dev.rot[i], 3)}</td>
        <td class="${cls(D.dev.feed[i], M.tol.feed)}">${sgn(D.dev.feed[i], 2)}</td>
        <td class="${cls(D.dev.point[i + 1], M.tol.point)}">${fx(D.dev.point[i + 1], 2)}</td></tr>`).join('')}
    </tbody></table></div>
  </div></div>`}${proc}</div>`;
}

/* --- pestaña COMPENSACIÓN ----------------------------------------------- */
/* Las medidas son fijas: en esta tabla lo ÚNICO editable es la Δ aplicada, y
   acepta cuentas sobre lo que calculó el lazo (ver evalCell en engine.js).   */
function paneComp(M) {
  const D = activeDataset(), C = ST.comp, ori = E.orientations(M);
  if (!D) return `<div class="pane on"><div class="grp"><div class="body">
    <div class="warnbox mt10">${T('noMeas')}</div></div></div></div>`;
  const cmd = ST.command;
  syncTweak(M.bends.length);
  /* lo que sugiere el lazo, sin tocar */
  const calc = E.compensate(cmd, M.bends, D.model.bends, C, ori);
  const pred = ST.pred;
  const n = Math.min(M.bends.length, calc.length, cmd.length);

  /* una tríada de columnas por parámetro, y solo de los que se están
     corrigiendo: con doAngle solo, la tabla se queda en 6 columnas */
  const cols = [];
  if (C.doAngle) cols.push({ k: 'angle', lab: T('ang'), u: '°', d: 3 });
  if (C.doRot) cols.push({ k: 'rot', lab: T('rot'), u: '°', d: 3 });
  if (C.doFeed) cols.push({ k: 'feed', lab: T('feed'), u: 'mm', d: 2 });

  const head = cols.map(c => `<th>${c.lab} ${T('cNow')}</th>
    <th>${T('cCalc')}</th><th class="dcol">${T('cAdj')}</th><th>${T('cNew')} ${c.u}</th>`).join('');

  const rows = [];
  for (let i = 0; i < n; i++) {
    const cells = cols.map(c => {
      const now = cmd[i][c.k];
      const dCalc = calc[i][c.k] - now;
      const tw = ST.tweak[i][c.k];
      const dApp = dCalc + tw;
      return `<td class="v-dim">${fx(now, c.d)}</td>
        <td class="v-dim">${sgn(dCalc, c.d)}</td>
        <td class="dcol"><input type="text" data-tw="${i}" data-k="${c.k}"
          class="${tw ? '' : 'z'}" title="c = ${fx(dCalc, c.d)}" value="${sgn(dApp, c.d)}"></td>
        <td class="${Math.abs(dApp) > 1e-4 ? 'v-warn' : 'v-dim'}">${fx(now + dApp, c.d)}</td>`;
    }).join('');
    const dirty = ST.tweak[i].angle || ST.tweak[i].rot || ST.tweak[i].feed;
    rows.push(`<tr class="clk ${i === ST.sel ? 'sel' : ''} ${dirty ? 'hasd' : ''}"
      ${dirty ? `title="${T('tweakOn')}"` : ''} data-r="${i}">
      <td>B${i + 1}</td><td>${oriTag(ori[i])}</td>${cells}</tr>`);
  }

  return `<div class="pane on"><div class="grp"><div class="eyebrow">${T('gains')}</div><div class="body">
    <div class="fgrid"><label>${T('gainW')} ${oriTag('W')}</label>
      ${nfield('.05', 'min="0" max="1.5" data-c="gainW"', C.gainW)}
      <label>${T('gainT')} ${oriTag('T')}</label>
      ${nfield('.05', 'min="0" max="1.5" data-c="gainT"', C.gainT)}</div>
    <div class="eyebrow" style="padding-left:0">${T('what')}</div>
    <div class="row wrap">
      ${[['doAngle', 'cAng'], ['doRot', 'cRot'], ['doFeed', 'cFeed']].map(([k, l]) =>
      `<label class="row" style="gap:4px"><input type="checkbox" data-c="${k}" ${C[k] ? 'checked' : ''}>${T(l)}</label>`).join('')}</div>
    <div class="hintline">${T('formula')}</div>
    <div class="row mt6"><button class="btn pri grow" data-a="apply">${T('apply')}</button>
      <button class="btn" data-a="resetcmd">${T('reset')}</button></div>
  </div></div>
  <div class="grp"><div class="eyebrow">${T('cmdTbl')}</div><div class="body">
    ${cols.length ? `<div class="tw"><table class="cmd"
      style="min-width:${120 + cols.length * 230}px"><thead><tr>
      <th>${T('nBend')}</th><th>${T('ori')}</th>${head}</tr></thead>
      <tbody>${rows.join('')}</tbody></table></div>
    <div class="row mt6"><span class="grow"></span>
      <button class="btn sm" data-a="zerotw">${T('zeroTw')}</button></div>
    <div class="hintline">${T('cellNote')}</div>`
    : `<div class="warnbox mt10">${T('what')}: —</div>`}
    ${pred ? `<div class="eyebrow" style="padding-left:0">${T('predict')}</div>
      <div class="stats"><div class="stat"><div class="k">${T('statMaxA')}</div>
        <div class="v ${cls(pred._maxA, M.tol.angle)}">${fx(pred._maxA, 3)}<span class="u">°</span></div></div>
      <div class="stat"><div class="k">${T('statTip')}</div>
        <div class="v ${cls(pred._tip, M.tol.point)}">${fx(pred._tip, 2)}<span class="u">mm</span></div></div></div>` : ''}
    <button class="btn mt6" style="width:100%" data-a="verify">${T('verify')}</button>
  </div></div></div>`;
}

/* ============================================================ barra de estado */
export function renderStatus() {
  const M = ST.model, D = activeDataset();
  const path = E.buildPath(M);
  const anchorLab = { start: T('aStart'), end: T('aEnd'), best: T('aBest') }[ST.anchor];
  const shift = activeShift();
  $('#st').innerHTML = `
   <div class="c">${T('stLen')} <b>${fx(path.total, 1)} mm</b></div>
   <div class="c">${T('stBends')} <b>${M.bends.length}</b></div>
   <div class="c">${T('anchor')} <b>${anchorLab}</b></div>
   <div class="c">${T('dTip')} <b class="${shift > .01 ? '' : 'v-dim'}">${fx(shift, 2)} mm</b></div>
   <div class="c">${T('stDatum')} <b>${ST.datum === 'start' ? T('dStart') : T('dBest')}</b></div>
   <div class="c">${T('stMax')} <b class="${D ? cls(D.dev.maxA, M.tol.angle) : ''}">${D ? fx(D.dev.maxA, 3) + ' °' : '—'}</b></div>
   <div class="c">${T('stUnits')} <b>mm / °</b></div>
   <div class="c">${D ? `<span class="chip ${D.dev.out ? 'bad' : 'ok'}">${D.dev.out ? T('bad') : T('ok')}</span>` : ''}</div>`;
}

export const renderPanels = () => { renderLeft(); renderSide(); renderRight(); renderStatus(); };
