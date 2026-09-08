/* =========================================================================
   PESTAÑA COMPENSACIÓN — ganancias del lazo, qué parámetros corregir, y la
   tabla de comando donde lo ÚNICO editable es la Δ aplicada (acepta cuentas
   sobre lo que calculó el lazo, ver evalCell en engine.js).
   ========================================================================= */
import * as E from '../engine.ts';
import { T } from '../i18n.ts';
import type { Model } from '../types.ts';
import { ST, activeDataset, syncTweak, loopPieces, loopMeasured } from '../state.ts';
import { fx, cls, nfield, oriTag, sgn, srcTag } from './fmt.ts';
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
  /* lo que consume el lazo: la pieza activa, o la mediana de las visibles */
  const piezas = loopPieces();
  /* la casilla cuenta las que ENTRARÍAN si se marca —las visibles—, no las que
     entran ahora: con la casilla apagada siempre sería «1» y no diría nada */
  const vis = ST.datasets.filter(d => d.visible);
  const meas = loopMeasured() || D.model.bends;
  const calc = E.compensate(cmd, M.bends, meas, C, ori);
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

  /* Hasta dónde llega la MEDIDA. Más allá, `compensate()` devuelve el comando
     sin tocar, y la tabla lo pintaba como «+0.000» — que se lee igual que un
     doblez que salió perfecto. Un CSV con 12 puntos sobre un modelo de 15
     dejaba B13, B14 y B15 dando por buenos unos dobleces que nadie midió. */
  const medidos = meas.length;

  /* DE DÓNDE SALEN ESTOS NÚMEROS.
     La insignia SIM/MED existía, pero solo se veía en el lateral `#rt` y en el
     cajón de piezas — y el modo Compensar oculta `#rt` a propósito («modo
     taller»). O sea que el único sitio donde se decide sobre material era el
     único donde no se veía si el medido era una pieza escaneada o una que
     inventó simulate(). */
  const usadas = C.batch && piezas.length > 1 ? piezas : [D];
  const simuladas = usadas.filter(d => d.src === 'sim' || d.src === 'verify');
  const fuente = C.batch && piezas.length > 1
    ? `<span class="srcbadge meas" title="${T('batchTip')}">${T('batchUse')} ${piezas.length}</span>`
      + (simuladas.length ? srcTag('sim') : srcTag(usadas[0].src))
    : srcTag(D.src);
  const avisoSim = simuladas.length
    ? `<div class="warnbox mb6">${T('compSim').replace('{n}', String(simuladas.length))}</div>` : '';
  /* Y cuántos dobleces sostienen de verdad la cuenta. */
  const avisoCorto = medidos < M.bends.length
    ? `<div class="warnbox mb6">${T('compShort')
        .replace('{a}', String(medidos)).replace('{b}', String(M.bends.length))}</div>` : '';

  const rows: string[] = [];
  for (let i = 0; i < n; i++) {
    const sinMedir = i >= medidos;
    const cells = cols.map(c => {
      const now = cmd[i][c.k];
      if (sinMedir) {
        /* Guion, no cero: no hay número que enseñar, y la celda de ajuste no se
           puede editar porque no hay cálculo sobre el que operar. */
        return `<td class="v-dim">${fx(now, c.d)}</td>
          <td class="v-dim nomeas">—</td>
          <td class="dcol v-dim nomeas">—</td>
          <td class="v-dim">${fx(now, c.d)}</td>`;
      }
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
    rows.push(`<tr class="clk ${i === ST.sel ? 'sel' : ''} ${dirty ? 'hasd' : ''} ${sinMedir ? 'nomeas' : ''}"
      title="${sinMedir ? T('rowNoMeas') : (dirty ? T('tweakOn') : '')}" data-r="${i}">
      <td>B${i + 1}</td><td>${oriTag(ori[i])}</td>${cells}</tr>`);
  }

  return `<div class="pane on"><div class="grp"><div class="eyebrow">${T('gains')}</div><div class="body">
    <div class="fgrid"><label>${T('gainW')} ${oriTag('W')}</label>
      ${nfield('.05', 'min="0" max="1" data-c="gainW"', C.gainW)}
      <label>${T('gainT')} ${oriTag('T')}</label>
      ${nfield('.05', 'min="0" max="1" data-c="gainT"', C.gainT)}</div>
    <div class="eyebrow" style="padding-left:0">${T('what')}</div>
    <div class="row wrap">
      ${[['doAngle', 'cAng'], ['doRot', 'cRot'], ['doFeed', 'cFeed']].map(([k, l]) =>
      `<label class="row" style="gap:4px"><input type="checkbox" data-c="${k}" ${C[k as 'doAngle' | 'doRot' | 'doFeed'] ? 'checked' : ''}>${T(l as I18nKey)}</label>`).join('')}</div>
    <label class="row" style="gap:4px;margin-top:4px" title="${T('batchTip')}">
      <input type="checkbox" data-c="batch" ${C.batch ? 'checked' : ''}>
      ${T('batchUse')} <b>${vis.length}</b></label>
    <div class="hintline">${T('formula')}</div>
    ${C.batch && piezas.length > 1
      ? `<div class="hintline">${T('batchOn').replace('%n', String(piezas.length))}</div>`
      : (ST.datasets.filter(d => d.visible).length > 1
         ? `<div class="hintline">${T('batchHint')}</div>` : '')}
    <div class="row mt6"><button class="btn pri grow" data-a="apply">${T('apply')}</button>
      <button class="btn" data-a="resetcmd">${T('reset')}</button></div>
  </div></div>
  <div class="grp"><div class="eyebrow">${T('cmdTbl')} ${fuente}</div><div class="body">
    ${avisoSim}${avisoCorto}
    ${cols.length ? `<div class="tw"><table class="cmd"
      style="min-width:${106 + cols.length * 174}px"><thead><tr>
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
