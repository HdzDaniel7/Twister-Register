/* =========================================================================
   PANEL IZQUIERDO — variantes, anclaje, colocación, capas y datasets. Es el
   panel de "qué modelo y cómo se ve", separado del bloque de abajo que es
   "qué contiene ese modelo".
   ========================================================================= */
import * as E from '../engine.ts';
import { T } from '../i18n.ts';
import type { Place, Variant } from '../types.ts';
import { ST, LAYER_DEF, refModel, heldOfVariant, heldOn } from '../state.ts';
import { $, fx, esc, cls, nfield, srcTag } from './fmt.ts';
import { saveFocus, restoreFocus, commitFocusIn } from './focus.ts';
import type { I18nKey } from './fmt.ts';

/* ---------------------------------------------------------------- ayudas -- */
/** Tarjeta de un modelo. La tarjeta entera lo activa: el guardia del `click`
 *  global ignora los campos, así que escribir el nombre no cambia de modelo
 *  por debajo. */
function vcard(v: Variant): string {
  const ref = refModel();
  const act = v.id === ST.active, isref = v.id === ST.ref;
  /* Con «comparar contra: sujeta», ESTA variante también se mide sujeta. Medir
     una libre contra otra sujeta mezcla dos cosas —la diferencia de diseño y lo
     que el fixture le hace a la barra— y el número resultante no contesta
     ninguna de las dos preguntas. */
  const vm = heldOn() && ST.restraint.refHeld
    ? heldOfVariant(v).model : E.effectiveModel(v);
  const nd = v.deltas.reduce((a, d) => a + E.DELTA_KEYS.filter(k => d[k]).length, 0);
  let shift = 0;
  if (!isref) {
    const sh = E.piShift(vm, ref, ST.anchor);
    shift = ST.anchor === 'end' ? sh[0] : sh[sh.length - 1];
  }
  return `<div class="ds ${act ? 'act' : ''}" data-vsel="${v.id}">
      <div class="top">
        <input type="checkbox" data-vv="${v.id}" ${v.visible ? 'checked' : ''}>
        <input type="color" class="sw" data-vc="${v.id}" value="${v.color}">
        <input type="text" class="nm" data-vn="${v.id}" value="${esc(v.name)}"
          title="${esc(v.name)}">
        ${isref ? `<span class="refbadge">${T('isRef')}</span>` : ''}
        <button class="xbtn" data-vd="${v.id}" title="${T('dupVar')}"
          aria-label="${esc(T('dupVar'))}">⧉</button>
        <button class="xbtn" data-vx="${v.id}" title="${T('del')}"
          aria-label="${esc(T('del'))}">✕</button></div>
      <div class="meta"><span>${vm.bends.length} ${T('dblz')}</span>
        <span>Δ<b>${nd}</b></span>
        <span>${T('dTip')} <b class="${shift > .01 ? '' : 'v-dim'}">${fx(shift, 2)}</b></span></div>
      ${choque(v)}
      ${isref ? '' : `<button class="linkbtn" data-vr="${v.id}">${T('setRef')}</button>`}
    </div>`;
}

/** Si el modelo no cabe en el fixture: contra qué apoyo choca y cuánto se mete.
 *
 *  En la tarjeta de CADA modelo y no en la tabla del amarre, que solo mide la
 *  activa: la pregunta llega comparando —«¿y este otro, entra?»— y se contesta
 *  sin tener que activarlo. Solo el peor: la lista entera está en el 3D, con un
 *  rombo en cada sitio. */
function choque(v: Variant): string {
  if (!heldOn()) return '';
  const c = heldOfVariant(v).clash[0];
  if (!c) return '';
  const quien = (c.pin ? ST.pins[c.k] : ST.fixture[c.k])?.name || '?';
  return `<div class="clash" title="${esc(T('clashTip'))}">${esc(
    T('clashCard').replace('{n}', quien).replace('{d}', fx(c.depth, 1)))}</div>`;
}

const ANCHORS: [string, I18nKey][] = [['start', 'aStart'], ['end', 'aEnd'], ['best', 'aBest']];

/** Opciones del pivote de la colocación: un PI del modelo de referencia. */
function pivotOptions(): string {
  const np = E.fk(refModel()).pis.length;
  return [...Array(np)].map((_, i) => {
    const nm = i === 0 ? 'P0' : (i === np - 1 ? 'PE' : 'PI' + i);
    return `<option value="${i}" ${ST.place.pivot === i ? 'selected' : ''}>${nm}</option>`;
  }).join('');
}

/* ========================================================= panel izquierdo */
export function renderLeft(): void {
  /* Un cajón por menú. Antes esto era una columna fija de 250 px con las
     cinco cosas apiladas, y el usuario pagaba ese ancho SIEMPRE aunque casi
     todo ahí dentro se toca una vez y se olvida: capas, colocación, extremo
     fijo. Ahora se abre sobre el 3D cuando se pide y se cierra al terminar. */
  const host = $('#lf');
  if (!host) return;
  /* Soltar el campo ANTES de reconstruir, como renderRight(), que es donde está
     escrito el porqué entero. El cajón tiene campos de verdad —la colocación, el
     nombre de cada modelo— y hasta el 2026-09-12 se reconstruía con ellos
     enfocados: su `change` saltaba desde dentro de la asignación de innerHTML,
     escribía el valor y el cajón quedaba pintado con la instantánea de antes.
     También al cerrarlo: vaciar el cajón arranca el campo igual que rellenarlo. */
  const f = saveFocus();
  commitFocusIn(host);
  if (!ST.drawer) { host.innerHTML = ''; host.hidden = true; return; }
  host.hidden = false;
  host.innerHTML = DRAWERS[ST.drawer] ? DRAWERS[ST.drawer]() : '';
  restoreFocus(f);
}

/** LA VENTANA DE LA SECCIÓN: qué forma tiene la barra y cuánto mide.
 *
 *  Es un cajón y no un bloque más de la pestaña «Modelo» por dos motivos. Uno:
 *  la forma no se toca por doblez ni por pieza, se elige una vez al empezar y
 *  se olvida, que es exactamente lo que vive en un cajón. Y dos: elegirla pide
 *  ver las consecuencias —lo que pesa, con qué resiste— y eso no cabe en la
 *  banda de la cabecera sin echar la tabla fuera de vista.
 *
 *  Los campos escriben en el MISMO sitio que los de la pestaña, con el mismo
 *  `data-s`: no hay dos copias del dato, hay dos vistas de una.
 *
 *  Las cifras de abajo no son decoración: son la única manera de que quien
 *  elige un tubo vea en el acto lo que acaba de hacer —un 30×2 pesa el 40 % de
 *  lo que pesaba y resiste el 73 %— sin tener que fabricarlo para enterarse. */
function secWin(): string {
  const M = ST.model!;
  const sec = M.section;
  const redonda = sec.kind === 'round';
  const I = E.sectionI(sec);
  const area = E.sectionArea(sec);
  /* kg por metro: el mismo camino que usa la flecha, pasado a lo que dice un
     catálogo. Si no hay material puesto no se inventa: se deja en blanco. */
  const kgm = ST.mat.rho ? E.lineLoad(sec, ST.mat) * 1000 / 9.81 : null;
  const opciones: [string, I18nKey][] = [['rect', 'secRect'], ['round', 'secRound']];
  return `
   <div class="grp"><div class="eyebrow">${T('section')}</div><div class="body">
     <div class="hintline">${T('secTip')}</div>
     <div class="seg mt6" role="group" aria-label="${esc(T('secKind'))}">
       ${opciones.map(([k, lab]) => `<button data-sk="${k}"
         class="${sec.kind === k ? 'on' : ''}"
         aria-pressed="${sec.kind === k}">${T(lab)}</button>`).join('')}</div>
     <div class="fgrid pair mt6">
       <label>${T(redonda ? 'dia' : 'width')} (mm)</label>${nfield('.1', 'data-s="width"', sec.width)}
       ${redonda ? '' : `<label>${T('thick')} (mm)</label>${nfield('.1', 'data-s="thickness"', sec.thickness)}`}
       <label>${T('wall')} (mm)</label>${nfield('.1', 'data-s="wall"', sec.wall)}
       <label>${T('chamfer')} (mm)</label>${nfield('.1', 'data-s="chamfer"', sec.chamfer)}
       <label>${T('endlen')} (mm)</label>${nfield('.5', 'data-s="endLen"', sec.endLen)}
     </div>
     <div class="hintline">${T('wallHint')}</div>
     <div class="row mt6"><span class="chip">${
       T(E.isHollow(sec) ? 'secHollow' : 'secSolid')}</span></div>
     <div class="fgrid pair mt6">
       <label>${T('secArea')}</label><b>${fx(area, 1)} mm²</b>
       <label>${T('secInertia')} Iz</label><b>${fx(I.Iz, 0)} mm⁴</b>
       <label>${T('secInertia')} Iy</label><b>${fx(I.Iy, 0)} mm⁴</b>
       <label>${T('secMass')}</label><b>${kgm === null ? '—' : `${fx(kgm, 3)} kg/m`}</b>
     </div>
     ${redonda ? `<div role="alert" class="warnbox mt6">${T('secRoundWarn')}</div>` : ''}
     ${E.isHollow(sec) ? `<div role="alert" class="warnbox mt6">${T('secHollowWarn')}</div>` : ''}
   </div></div>`;
}

/** Los cajones, uno por entrada de menú. La clave es la misma que va en
 *  `data-dr` y en ST.drawer. */
const DRAWERS: Record<string, () => string> = {
  section: secWin,

  file: () => `
   <div class="grp"><div class="eyebrow">${T('mnFile')}</div><div class="body">
     <div class="col">
       <button class="btn" data-a="demo">${T('bDemo')}</button>
       <button class="btn" data-a="new">${T('bNew')}</button>
       <button class="btn" data-a="open">${T('bOpen')}</button>
       <button class="btn" data-a="save">${T('bSave')}</button>
       <button class="btn pri" data-a="report">${T('bRep')}</button>
     </div>
     <div class="eyebrow" style="padding-left:0;margin-top:8px">${T('history')}</div>
     <div class="row">
       <button class="btn sm grow" data-a="undo" ${ST.hist.undo ? '' : 'disabled'}
         title="Ctrl+Z">${T('undo')} <b>${ST.hist.undo}</b></button>
       <button class="btn sm grow" data-a="redo" ${ST.hist.redo ? '' : 'disabled'}
         title="Ctrl+Y">${T('redo')} <b>${ST.hist.redo}</b></button>
     </div>
     <div class="hintline">${T('histNote')}</div>
     <div class="eyebrow" style="padding-left:0;margin-top:8px">CSV</div>
     <div class="col">
       <button class="btn sm" data-a="expts">${T('expPts')}</button>
       <button class="btn sm" data-a="impts" title="${T('impTip')}">${T('impCsv')}</button>
       <!-- El comando de máquina también se exporta desde aquí: el perfil se
            ajusta en la pestaña Máquina, pero exportar hace falta desde
            CUALQUIER modo, y Compensar no tiene pestañas. -->
       <button class="btn sm" data-a="expcmd" title="${esc(T('machNote'))}">${T('machExport')}</button>
     </div>
   </div></div>`,

  models: () => `
   <div class="grp"><div class="eyebrow">${T('variants')}<span class="n">${ST.variants.length}</span></div>
   <div class="body">
     ${ST.variants.map(vcard).join('')}
     <div class="row mt6">
       <button class="btn sm grow" data-a="varnew">${T('addVar')}</button>
       <button class="btn sm" data-a="vardup">${T('dupVar')}</button></div>
   </div></div>

   <div class="grp"><div class="eyebrow">${T('anchor')}</div><div class="body">
     ${ANCHORS.map(([k, lab]) => `<label class="layer">
       <input type="radio" name="anch" data-an="${k}" ${ST.anchor === k ? 'checked' : ''}>
       <span class="nm">${T(lab as I18nKey)}</span></label>`).join('')}
   </div></div>`,

  view: () => `
   <div class="grp"><div class="eyebrow">${T('layers')}</div><div class="body">
    ${LAYER_DEF.map(([k, lab]) => `<div class="layer">
      <input type="checkbox" data-ly="${k}" ${ST.layers[k].on ? 'checked' : ''}>
      <input type="color" class="sw" data-lc="${k}" value="${ST.layers[k].color}">
      <span class="nm">${T(lab as I18nKey)}</span></div>`).join('')}
   </div></div>

   <div class="grp"><div class="eyebrow">${T('place')}</div><div class="body">
     <div class="fgrid" style="grid-template-columns:1fr 96px">
       <label>${T('pivot')}</label>
       <select data-plp>${pivotOptions()}</select>
       ${[['x', 'plX'], ['y', 'plY'], ['z', 'plZ']].map(([k, lab]) =>
         `<label>${T(lab as I18nKey)} (mm)</label>
          ${nfield('10', `data-pl="${k}"`, ST.place[k as keyof Place])}`).join('')}
       ${[['rx', 'plRX'], ['ry', 'plRY'], ['rz', 'plRZ']].map(([k, lab]) =>
         `<label>${T(lab as I18nKey)} (°)</label>
          ${nfield('5', `data-pl="${k}"`, ST.place[k as keyof Place])}`).join('')}
     </div>
     <div class="row mt6"><button class="btn sm grow" data-a="placereset">${T('plReset')}</button></div>
     <div class="hintline">${T('plNote')}</div>
   </div></div>`,

  pieces: () => `
   <div class="grp"><div class="eyebrow">${T('datasets')}<span class="n">${ST.datasets.length}</span></div>
   <div class="body">
    ${ST.datasets.length ? ST.datasets.map(d => `
      <div class="ds ${d.id === ST.dsActive ? 'act' : ''}">
        <div class="top">
          <input type="checkbox" data-dv="${d.id}" ${d.visible ? 'checked' : ''}>
          <input type="color" class="sw" data-dc="${d.id}" value="${d.color}">
          <span class="nm" data-dsel="${d.id}">${esc(d.name)}</span>
          ${srcTag(d.src)}
          <button class="xbtn" data-dx="${d.id}" title="${T('del')}"
            aria-label="${esc(T('del'))}">✕</button></div>
        <div class="meta"><span>Δmax <b class="${cls(d.dev!.maxA, ST.model!.tol.angle)}">${fx(d.dev!.maxA, 3)}°</b></span>
        <span>RMS <b>${fx(d.dev!.rms, 3)}°</b></span>
        <span>${T('statTip').split(' ')[0]} <b class="${cls(d.dev!.tip, ST.model!.tol.point)}">${fx(d.dev!.tip, 2)}</b></span></div>
      </div>`).join('') : `<div class="emptynote">${T('dNone')}</div>`}
    <div class="row mt6">
      <button class="btn sm grow" data-a="sim">+ ${T('addSim')}</button>
      <button class="btn sm" data-a="impts" title="${T('impTip')}">${T('impCsv')}</button>
</div>
   </div></div>`,
};
