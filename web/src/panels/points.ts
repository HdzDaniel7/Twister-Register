/* =========================================================================
   PESTAÑA PUNTOS — la tabla de PI editables con su desplazamiento respecto al
   modelo de referencia, y los puntos de referencia (marcas) con la distancia
   al PI más cercano.
   ========================================================================= */
import { Vector3 } from 'three';
import * as E from '../engine.ts';
import { T } from '../i18n.ts';
import type { Model } from '../types.ts';
import { ST, refModel } from '../state.ts';
import { fx, esc, cls, nfield } from './fmt.ts';

/* --- pestaña PUNTOS ----------------------------------------------------- */
export function panePoints(M: Model): string {
  const ref = refModel();
  const P = E.fk(M).pis;
  let sh: number[] = [];
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
        `<td>${nfield('.1', `data-p="${i}" data-k="${k}"`, p[k as 'x' | 'y' | 'z'])}</td>`).join('')}
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
export function paneMarks(M: Model): string {
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
        `<td>${nfield('1', `data-mk="${mk.id}" data-k="${k}"`, mk[k as 'x' | 'y' | 'z'])}</td>`).join('')}
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
