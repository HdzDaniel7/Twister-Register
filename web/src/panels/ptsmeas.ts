/* =========================================================================
   MEDIR Y CORREGIR POR PUNTOS — la tercera mitad de la pestaña MEDICIÓN.
   Aquí se mueven los PI de una barra (Edición), o se teclean donde quedaron
   de verdad (Medido), y el motor (engine/ptfit.ts) devuelve la barra —avance,
   rodado y ángulo por doblez— que alcanza el objetivo. Este archivo solo pinta;
   lo tecleado vive en ptstate.ts (borrador de interfaz, sin pasos de deshacer).
   ========================================================================= */
import { T } from '../i18n.ts';
import type { Model } from '../types.ts';
import { ST } from '../state.ts';
import { ptUI, ptSync, ptResult, ptVariant, ptAllMeasured } from '../ptstate.ts';
import { pivotName, piName, isCoin } from '../pivotlabel.ts';
import { fx, esc, cls, sgn } from './fmt.ts';
import type { I18nKey } from './fmt.ts';
import { safeColor } from '../safe.ts';

const AX = ['X', 'Y', 'Z'];

/** Valor de un campo: vacío si no hay, 3 decimales como mucho. */
const val = (x: number | null | undefined): string =>
  x === null || x === undefined || !isFinite(x) ? '' : String(+x.toFixed(3));

export function ptPane(M: Model): string {
  const n = ptSync();
  const R = ptResult();
  const tol = M.tol.point;
  const v = ptVariant();
  const stat = (k: string, x: string, c = ''): string =>
    `<div class="stat"><div class="k">${k}</div><div class="v ${c}">${x}</div></div>`;
  /* campos de TEXTO, como en ángulos: con coma decimal un type=number devuelve '' */
  const inp = (attr: string, value: string, ph: string, label: string, c2: string): string =>
    `<input type="text" inputmode="decimal" class="ptin ${c2}" ${attr} data-po="${esc(value)}"
      value="${esc(value)}" placeholder="${esc(ph)}" aria-label="${esc(label)}">`;
  const lab = (nm: string, k: I18nKey, a: number): string =>
    T('ptAxisOf').replace('{p}', nm).replace('{a}', T(k) + ' ' + AX[a]);

  const frame = ST.anchor !== 'pivot'          // 'best' y 'datums' ajustan, no fijan un PI
    ? T('ptFrameBest')
    : T('ptFrameHint').replace('{p}', `<b>${esc(pivotName())}</b>`);

  const opts = ST.variants.map(x =>
    `<option value="${esc(x.id)}" ${x.id === v.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  const swatch = `<span class="ptsw" style="background:${safeColor(v.color)}" aria-hidden="true"></span>`;

  const rows = R.rows.map(r => {
    const nm = piName(r.i, n);
    const mraw = ptUI.meas[r.i];
    return `<tr class="${isCoin(r.i, n) ? 'coin' : ''}">
      <td class="${r.i === 0 || r.i === n - 1 ? 'v-dim' : ''}">${nm}</td>
      ${r.nom.map(x => `<td class="v-dim ptnom">${fx(x, 2)}</td>`).join('')}
      ${[0, 1, 2].map(a => `<td>${inp(`data-pe="${r.i}:${a}"`, r.edit[a] ? val(r.edit[a]) : '', '0',
        T('ptAxisOf').replace('{p}', nm).replace('{a}', 'Δ' + AX[a]), 'ed')}</td>`).join('')}
      ${[0, 1, 2].map(a => `<td>${inp(`data-pt="${r.i}:${a}"`, val(r.target[a]), '', lab(nm, 'ptTarget', a), 'tg')}</td>`).join('')}
      ${[0, 1, 2].map(a => `<td>${inp(`data-pm="${r.i}:${a}"`, mraw ? val(mraw[a]) : '', fx(r.nom[a], 2),
        lab(nm, 'ptMeasured', a), 'ms')}</td>`).join('')}
      <td class="${r.errN === null ? 'v-dim' : cls(r.errN, tol)}">${r.errN === null ? '—' : fx(r.errN, 2)}</td>
      <td class="${cls(r.resid, tol)}">${fx(r.resid, 2)}</td></tr>`;
  }).join('');

  /* el valor de la barra resultante y, debajo, su Δ contra el tablero: la misma
     celda de dos líneas que la tabla de ángulos. Cero se pinta atenuado. */
  const dcell = (x: number, d: number): string => {
    const z = Math.abs(d) < 5e-4;
    return `<td class="angrc">${fx(x, 2)}<span class="corr ${z ? '' : 'v-warn'}">${z ? '·' : sgn(d, 2)}</span></td>`;
  };
  const brows = R.bends.map(b => {
    const hot = Math.abs(b.dFeed) >= 5e-4 || Math.abs(b.dRot) >= 5e-4 || Math.abs(b.dAngle) >= 5e-4;
    return `<tr class="${hot ? 'ptchg' : ''}"><td>B${b.i + 1}</td>
      ${dcell(b.res.feed, b.dFeed)}${dcell(b.res.rot, b.dRot)}${dcell(b.res.angle, b.dAngle)}</tr>`;
  }).join('');
  const tail = `<tr class="${Math.abs(R.dTail) >= 5e-4 ? 'ptchg' : ''}"><td>${T('ptTail')}</td>${dcell(R.model.tail, R.dTail)}<td></td><td></td></tr>`;

  const name = ptUI.name || `${T('ptDefName')} ${ST.datasets.length + 1}`;
  const hdr = (k: I18nKey, c: string): string => `<th scope="colgroup" colspan="3" class="ptg ${c}">${T(k)}</th>`;
  return `<div class="grp"><div class="eyebrow">${T('ptTitle')}</div><div class="body">
    <div class="hintline">${T('ptFlow')}</div>
    <label class="tag" for="ptboard">${T('ptBoard')}</label>
    <div class="row"><select id="ptboard" class="grow" data-pbd="1">${opts}</select>${swatch}</div>
    <div class="hintline">${frame}</div>
    <div class="row mt6"><span class="tag">${T('ptAlign')}</span>
      <div class="seg grow" role="group" aria-label="${esc(T('ptAlign'))}">
        <button data-pa="pivot" class="${ptUI.align === 'pivot' ? 'on' : ''}" aria-pressed="${ptUI.align === 'pivot'}"
          title="${esc(T('ptAlignPivotTip'))}">${T('ptAlignPivot')}</button>
        <button data-pa="best" class="${ptUI.align === 'best' ? 'on' : ''}" aria-pressed="${ptUI.align === 'best'}"
          title="${esc(T('ptAlignBestTip'))}">${T('ptAlignBest')}</button></div></div>
    <label class="tag" for="ptgain">${T('ptGain')}</label>
    <div class="rangerow"><input type="range" id="ptgain" data-pg="1" min="0" max="1" step="0.05" value="${ptUI.gain}">
      <span class="val">${fx(ptUI.gain, 2)}</span></div>
    <label class="row"><input type="checkbox" data-psh="1" ${ptUI.show ? 'checked' : ''}> ${T('ptShow')}</label>
    <div class="tw mt6"><table class="pttab"><thead>
      <tr><th></th>${hdr('ptNominal', 'nom')}${hdr('ptEdit', 'ed')}${hdr('ptTarget', 'tg')}${hdr('ptMeasured', 'ms')}<th colspan="2"></th></tr>
      <tr><th scope="col">PI</th>${[0, 1, 2, 3].map(() => AX.map(a => `<th scope="col">${a}</th>`).join('')).join('')}
      <th scope="col" title="${esc(T('ptErrTip'))}">${T('ptErr')}</th>
      <th scope="col" title="${esc(T('ptResidTip'))}">${T('ptResid')}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="eyebrow" style="padding-left:0">${T('ptResBar')}</div>
    <div class="tw"><table class="angtab pttab"><thead><tr><th scope="col">${T('nBend')}</th>
      <th scope="col">${T('ptFeed')}</th><th scope="col">${T('ptRot')}</th><th scope="col">${T('ptAngle')}</th></tr></thead>
      <tbody>${brows}${tail}</tbody></table></div>
    <div class="hintline">${T('ptResHint')}</div>
    ${R.changed && R.maxResid > tol ? `<div class="hintline v-warn">${T('ptUnreach')}</div>` : ''}
    <div class="stats">
      ${stat(T('ptStatResid'), fx(R.maxResid, 3) + '<span class="u">mm</span>', R.changed ? cls(R.maxResid, tol) : '')}
      ${stat(T('ptStatErr'), (R.nMeas ? fx(R.maxErr, 3) : '—') + '<span class="u">mm</span>', R.nMeas ? cls(R.maxErr, tol) : '')}
      ${stat(T('ptStatEdit'), `${R.nEdit}<span class="u">/${n}</span>`)}
      ${stat(T('ptStatMeas'), `${R.nMeas}<span class="u">/${n}</span>`)}
    </div>
    ${ptUI.note ? `<div class="hintline v-ok" role="status">${esc(ptUI.note)}</div>` : ''}
    <div class="row mt6"><button class="btn sm grow pri" data-a="ptapply" ${R.changed ? '' : 'disabled'}>${T('ptApply')}</button>
      <button class="btn sm grow" data-a="ptclredit" ${R.nEdit ? '' : 'disabled'}>${T('ptClrEdit')}</button>
      <button class="btn sm grow" data-a="ptclrmeas" ${R.nMeas ? '' : 'disabled'}>${T('ptClrMeas')}</button></div>
    <label class="tag" for="ptname">${T('angName')}</label>
    <input type="text" id="ptname" class="angname" data-pnm="1" value="${esc(name)}" maxlength="80">
    <div class="row mt6"><button class="btn sm grow" data-a="ptmeas" ${ptAllMeasured() ? '' : 'disabled'}
      title="${esc(T('ptMeasTip'))}">${T('ptCreateMeas')}</button></div>
  </div></div>`;
}
