/* =========================================================================
   PESTAÑA COMPENSACIÓN — ganancias del lazo, qué parámetros corregir, y la
   tabla de comando donde lo ÚNICO editable es la Δ aplicada (acepta cuentas
   sobre lo que calculó el lazo, ver evalCell en engine.js).
   ========================================================================= */
import * as E from '../engine.ts';
import { T } from '../i18n.ts';
import type { Model } from '../types.ts';
import { ST, activeDataset, syncTweak } from '../state.ts';
import { fx, cls, nfield, oriTag, sgn } from './fmt.ts';
import type { I18nKey } from './fmt.ts';

/* --- pestaña COMPENSACIÓN ----------------------------------------------- */
/* Las medidas son fijas: en esta tabla lo ÚNICO editable es la Δ aplicada, y
   acepta cuentas sobre lo que calculó el lazo (ver evalCell en engine.js).   */
export function paneComp(M: Model): string {
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
  const cols: { k: 'angle' | 'rot' | 'feed'; lab: string; u: string; d: number }[] = [];
  if (C.doAngle) cols.push({ k: 'angle', lab: T('ang'), u: '°', d: 3 });
  if (C.doRot) cols.push({ k: 'rot', lab: T('rot'), u: '°', d: 3 });
  if (C.doFeed) cols.push({ k: 'feed', lab: T('feed'), u: 'mm', d: 2 });

  const head = cols.map(c => `<th>${c.lab} ${T('cNow')}</th>
    <th>${T('cCalc')}</th><th class="dcol">${T('cAdj')}</th><th>${T('cNew')} ${c.u}</th>`).join('');

  const rows: string[] = [];
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
      `<label class="row" style="gap:4px"><input type="checkbox" data-c="${k}" ${C[k as 'doAngle' | 'doRot' | 'doFeed'] ? 'checked' : ''}>${T(l as I18nKey)}</label>`).join('')}</div>
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
        <div class="v ${cls(pred._maxA as number, M.tol.angle)}">${fx(pred._maxA as number, 3)}<span class="u">°</span></div></div>
      <div class="stat"><div class="k">${T('statTip')}</div>
        <div class="v ${cls(pred._tip as number, M.tol.point)}">${fx(pred._tip as number, 2)}<span class="u">mm</span></div></div></div>` : ''}
    <button class="btn mt6" style="width:100%" data-a="verify">${T('verify')}</button>
  </div></div></div>`;
}
