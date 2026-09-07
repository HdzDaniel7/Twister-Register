/* =========================================================================
   PESTAÑA MEDICIÓN (lateral derecho) — estadísticas del dataset activo, la
   tabla de desviación por doblez, y el simulador de proceso al final.
   ========================================================================= */
import * as E from '../engine.ts';
import { T } from '../i18n.ts';
import type { Model, Proc } from '../types.ts';
import { ST, activeDataset } from '../state.ts';
import { fx, esc, cls, oriTag, sgn } from './fmt.ts';

/* --- pestaña MEDICIÓN --------------------------------------------------- */
export function paneMeas(M: Model): string {
  const p = ST.proc, D = activeDataset(), ori = E.orientations(M);
  const rr = (k: keyof Proc, lab: string, min: number, max: number, st: number, suf: string): string => `<label>${lab}</label><div class="rangerow">
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
      <div class="stat"><div class="k">${T('statMaxA')}</div><div class="v ${cls(D.dev!.maxA, M.tol.angle)}">${fx(D.dev!.maxA, 3)}<span class="u">°</span></div></div>
      <div class="stat"><div class="k">${T('statRms')}</div><div class="v">${fx(D.dev!.rms, 3)}<span class="u">°</span></div></div>
      <div class="stat"><div class="k">${T('statTip')}</div><div class="v ${cls(D.dev!.tip, M.tol.point)}">${fx(D.dev!.tip, 2)}<span class="u">mm</span></div></div>
      <div class="stat"><div class="k">${T('statOut')}</div><div class="v ${D.dev!.out ? 'v-bad' : 'v-ok'}">${D.dev!.out}<span class="u">/${M.bends.length}</span></div></div></div>
    <div class="row mt6"><span class="tag">${T('stDatum')}</span>
      <div class="seg"><button data-dm="start" class="${ST.datum === 'start' ? 'on' : ''}">${T('dStart')}</button>
      <button data-dm="best" class="${ST.datum === 'best' ? 'on' : ''}">${T('dBest')}</button></div></div>
    <div class="eyebrow" style="padding-left:0">${T('deltas')}</div>
    <div class="tw"><table><thead><tr><th>${T('nBend')}</th><th>${T('ori')}</th><th>${T('dA')}</th>
      <th>${T('dR')}</th><th>${T('dF')}</th><th>${T('dP')}</th></tr></thead><tbody>
      ${M.bends.slice(0, D.dev!.angle.length).map((b, i) => `<tr class="clk ${i === ST.sel ? 'sel' : ''}" data-r="${i}"><td>B${i + 1}</td>
        <td>${oriTag(ori[i])}</td>
        <td class="${cls(D.dev!.angle[i], M.tol.angle)}">${sgn(D.dev!.angle[i], 3)}</td>
        <td class="${cls(D.dev!.rot[i], M.tol.rot)}">${sgn(D.dev!.rot[i], 3)}</td>
        <td class="${cls(D.dev!.feed[i], M.tol.feed)}">${sgn(D.dev!.feed[i], 2)}</td>
        <td class="${cls(D.dev!.point[i + 1], M.tol.point)}">${fx(D.dev!.point[i + 1], 2)}</td></tr>`).join('')}
    </tbody></table></div>
  </div></div>`}${proc}</div>`;
}
