/* =========================================================================
   PANEL IZQUIERDO — variantes, anclaje, colocación, capas y datasets. Es el
   panel de "qué modelo y cómo se ve", separado del bloque de abajo que es
   "qué contiene ese modelo".
   ========================================================================= */
import * as E from '../engine.ts';
import { T } from '../i18n.ts';
import type { Place, Variant } from '../types.ts';
import { ST, LAYER_DEF, refModel } from '../state.ts';
import { $, fx, esc, cls, nfield, srcTag } from './fmt.ts';
import type { I18nKey } from './fmt.ts';

/* ========================================================= panel izquierdo */
export function renderLeft(): void {
  const L = ST.layers, ref = refModel();
  const anchors = [['start', 'aStart'], ['end', 'aEnd'], ['best', 'aBest']];
  /* el pivote de la colocación es un PI del modelo de referencia */
  const np = E.fk(ref).pis.length;
  const pivots = [...Array(np)].map((_, i) => {
    const nm = i === 0 ? 'P0' : (i === np - 1 ? 'PE' : 'PI' + i);
    return `<option value="${i}" ${ST.place.pivot === i ? 'selected' : ''}>${nm}</option>`;
  }).join('');

  const vcard = (v: Variant): string => {
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

  $('#lf')!.innerHTML = `
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
       <span class="nm">${T(lab as I18nKey)}</span></label>`).join('')}
   </div></div>

   <div class="grp"><div class="eyebrow">${T('place')}</div><div class="body">
     <div class="fgrid" style="grid-template-columns:1fr 96px">
       <label>${T('pivot')}</label>
       <select data-plp>${pivots}</select>
       ${[['x', 'plX'], ['y', 'plY'], ['z', 'plZ']].map(([k, lab]) =>
         `<label>${T(lab as I18nKey)} (mm)</label>
          ${nfield('10', `data-pl="${k}"`, ST.place[k as keyof Place])}`).join('')}
       ${[['rx', 'plRX'], ['ry', 'plRY'], ['rz', 'plRZ']].map(([k, lab]) =>
         `<label>${T(lab as I18nKey)} (°)</label>
          ${nfield('5', `data-pl="${k}"`, ST.place[k as keyof Place])}`).join('')}
     </div>
     <div class="row mt6"><button class="btn sm grow" data-a="placereset">${T('plReset')}</button></div>
     <div class="hintline">${T('plNote')}</div>
   </div></div>

   <div class="grp"><div class="eyebrow">${T('layers')}</div><div class="body">
    ${LAYER_DEF.map(([k, lab]) => `<div class="layer">
      <input type="checkbox" data-ly="${k}" ${L[k].on ? 'checked' : ''}>
      <input type="color" class="sw" data-lc="${k}" value="${L[k].color}">
      <span class="nm">${T(lab as I18nKey)}</span></div>`).join('')}
   </div></div>

   <div class="grp"><div class="eyebrow">${T('datasets')}<span class="n">${ST.datasets.length}</span></div>
   <div class="body">
    ${ST.datasets.length ? ST.datasets.map(d => `
      <div class="ds ${d.id === ST.dsActive ? 'act' : ''}">
        <div class="top">
          <input type="checkbox" data-dv="${d.id}" ${d.visible ? 'checked' : ''}>
          <input type="color" class="sw" data-dc="${d.id}" value="${d.color}">
          <span class="nm" data-dsel="${d.id}">${esc(d.name)}</span>
          ${srcTag(d.src)}
          <button class="xbtn" data-dx="${d.id}" title="${T('del')}">✕</button></div>
        <div class="meta"><span>Δmax <b class="${cls(d.dev!.maxA, ST.model!.tol.angle)}">${fx(d.dev!.maxA, 3)}°</b></span>
        <span>RMS <b>${fx(d.dev!.rms, 3)}°</b></span>
        <span>${T('statTip').split(' ')[0]} <b class="${cls(d.dev!.tip, ST.model!.tol.point)}">${fx(d.dev!.tip, 2)}</b></span></div>
      </div>`).join('') : `<div class="hintline">${T('dNone')}</div>`}
    <div class="row mt6">
      <button class="btn sm grow" data-a="sim">+ ${T('addSim')}</button>
      <button class="btn sm" data-a="impts" title="${T('impTip')}">${T('impCsv')}</button>
</div>
   </div></div>`;
}
