/* ---------------------------------------------------------------- paneles --
   No hay framework ni estado en el DOM: cada panel se reconstruye entero a
   partir de ST. Consecuencia: un renderRight() mientras alguien escribe le
   quita el foco, por eso los inputs de tabla usan el evento `change` (dispara
   al salir del campo), no `input`.

   Los controles se cablean por delegación con atributos data-* (ver bind()
   en app.js). Para agregar un botón basta con darle el atributo correcto.   */
import * as E from './engine.js';
import { T, LANG } from './i18n.js';
import {
  ST, LAYER_DEF, V, REF, refModel, activeDataset, activeShift,
} from './state.js';

const $ = s => document.querySelector(s);
export const fx = (v, n = 2) =>
  (v === null || v === undefined || !isFinite(v)) ? '—' : v.toFixed(n);
export const esc = s => String(s).replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const cls = (v, t) => Math.abs(v) <= t ? 'v-ok' : Math.abs(v) <= 2 * t ? 'v-warn' : 'v-bad';
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
     <button data-l="es" class="${LANG.cur === 'es' ? 'on' : ''}">ES</button>
     <button data-l="en" class="${LANG.cur === 'en' ? 'on' : ''}">EN</button></div>`;

  $('#vptool').innerHTML = `
    <span class="tag">${T('legend') === 'Legend' ? 'View' : 'Vista'}</span>
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
  $('#tabs').innerHTML = ['model', 'points', 'meas', 'comp'].map(t =>
    `<button data-t="${t}" class="${ST.tab === t ? 'on' : ''}">${T(t)}</button>`).join('');
}

/* ========================================================= panel izquierdo */
export function renderLeft() {
  const L = ST.layers, ref = refModel();
  const anchors = [['start', 'aStart'], ['end', 'aEnd'], ['best', 'aBest']];

  const vcard = v => {
    const act = v.id === ST.active, isref = v.id === ST.ref;
    const vm = E.effectiveModel(v);
    const nd = v.deltas.reduce((a, d) => a + E.DELTA_KEYS.filter(k => d[k]).length, 0);
    let shift = 0;
    if (!isref) {
      const sh = E.piShift(vm, ref, ST.anchor);
      shift = ST.anchor === 'end' ? sh[0] : sh[sh.length - 1];
    }
    return `<div class="ds ${act ? 'act' : ''}">
      <div class="top">
        <input type="checkbox" data-vv="${v.id}" ${v.visible ? 'checked' : ''}>
        <input type="color" class="sw" data-vc="${v.id}" value="${v.color}">
        <span class="nm" data-vsel="${v.id}" title="${esc(v.name)}">${esc(v.name)}</span>
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
      <button class="btn sm" data-a="csv">${T('addCsv')}</button></div>
   </div></div>`;
}

/* =========================================================== panel derecho */
export function renderRight() {
  const M = ST.model, host = $('#rt'), keep = host ? host.scrollTop : 0;
  const pane = { model: paneModel, points: panePoints, meas: paneMeas, comp: paneComp }[ST.tab];
  $('#panes').innerHTML = pane(M);
  if (host) host.scrollTop = keep;
}

/* --- pestaña MODELO ----------------------------------------------------- */
function paneModel(M) {
  const v = V();
  E.syncDeltas(v);
  const base = v.base.bends, ori = E.orientations(M), mf = E.machineFeeds(M);
  const num = (attr, i, k, val, step) =>
    `<input type="number" step="${step}" data-${attr}="${i}" data-k="${k}" value="${val}">`;
  /* un Δ en cero se apaga: la columna solo debe cantar cuando hay corrección */
  const dnum = (i, k, step) => {
    const d = v.deltas[i][k];
    return `<input type="number" step="${step}" class="${d ? '' : 'z'}" data-bd="${i}"
      data-k="${k}" value="${fx(d, 2)}">`;
  };

  const rows = M.bends.map((b, i) => {
    const span = E.twistSpanOf(M, i);
    const over = (b.twist || 0) && (b.twistLen || 0) > span;
    const hasD = E.DELTA_KEYS.some(k => v.deltas[i][k]);
    const bb = base[i];
    return `<tr class="clk ${i === ST.sel ? 'sel' : ''} ${hasD ? 'hasd' : ''}" data-r="${i}">
      <td>B${i + 1}</td><td><span class="ori ${ori[i]}">${ori[i]}</span></td>
      <td>${num('b', i, 'feed', fx(bb.feed, 2), '.5')}</td>
      <td class="dcol">${dnum(i, 'feed', '.1')}</td>
      <td>${num('b', i, 'rot', fx(bb.rot, 2), '.1')}</td>
      <td class="dcol">${dnum(i, 'rot', '.1')}</td>
      <td>${num('b', i, 'angle', fx(bb.angle, 2), '.1')}</td>
      <td class="dcol">${dnum(i, 'angle', '.1')}</td>
      <td>${num('b', i, 'radius', fx(bb.radius, 2), '.5')}</td>
      <td>${num('b', i, 'twist', fx(bb.twist, 2), '.1')}</td>
      <td><input type="number" step="5" min="0" class="${over ? 'v-warn' : ''}"
        data-b="${i}" data-k="twistLen" title="0 = ${fx(span, 1)} mm"
        value="${fx(bb.twistLen, 1)}"></td>
      <td class="${mf[i] < 25 ? 'v-bad' : 'v-dim'}" title="tangente a tangente">${fx(mf[i], 2)}</td>
      </tr>`;
  }).join('');

  const d = T('dcol');
  return `<div class="pane on"><div class="grp"><div class="body" style="padding-top:8px">
    <div class="fgrid" style="grid-template-columns:1fr"><input type="text" data-m="name" value="${esc(M.name)}"></div>
    <div class="eyebrow" style="padding-left:0">${T('section')}</div>
    <div class="fgrid"><label>${T('width')} (mm)</label><input type="number" step=".1" data-s="width" value="${M.section.width}">
      <label>${T('thick')} (mm)</label><input type="number" step=".1" data-s="thickness" value="${M.section.thickness}">
      <label>${T('chamfer')} (mm)</label><input type="number" step=".1" data-s="chamfer" value="${M.section.chamfer}">
      <label>${T('endlen')} (mm)</label><input type="number" step=".5" data-s="endLen" value="${M.section.endLen}">
      <label>${T('tail')} (mm)</label><input type="number" step=".5" data-m="tail" value="${v.base.tail}"></div>
    <div class="eyebrow" style="padding-left:0">${T('tol')}</div>
    <div class="fgrid"><label>${T('tolA')} (°)</label><input type="number" step=".05" data-t="angle" value="${M.tol.angle}">
      <label>${T('tolR')} (°)</label><input type="number" step=".05" data-t="rot" value="${M.tol.rot}">
      <label>${T('tolF')} (mm)</label><input type="number" step=".05" data-t="feed" value="${M.tol.feed}">
      <label>${T('tolP')} (mm)</label><input type="number" step=".05" data-t="point" value="${M.tol.point}"></div>
  </div></div>
  <div class="grp"><div class="eyebrow">${T('bends')}<span class="n">${M.bends.length}</span></div><div class="body">
    <div class="tw"><table class="lra"><thead><tr>
      <th>${T('nBend')}</th><th>${T('ori')}</th>
      <th>${T('feed')}</th><th class="dcol">${d}</th>
      <th>${T('rot')}</th><th class="dcol">${d}</th>
      <th>${T('ang')}</th><th class="dcol">${d}</th>
      <th>${T('rad')}</th><th>${T('twist')}</th><th>${T('twlen')}</th><th>${T('mfeed')}</th>
      </tr></thead><tbody>${rows}</tbody></table></div>
    <div class="row mt6"><button class="btn sm" data-a="addb">+ ${T('addBend')}</button>
      ${ST.sel >= 0 ? `<button class="btn sm" data-a="delb">✕ B${ST.sel + 1}</button>` : ''}
      <span class="grow"></span>
      <button class="btn sm" data-a="bake">${T('bake')}</button>
      <button class="btn sm" data-a="zerod">${T('zeroD')}</button></div>
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
        `<td><input type="number" step=".1" data-p="${i}" data-k="${k}" value="${fx(p[k], 3)}"></td>`).join('')}
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
  </div></div></div>`;
}

/* --- pestaña MEDICIÓN --------------------------------------------------- */
function paneMeas(M) {
  const p = ST.proc, D = activeDataset(), ori = E.orientations(M);
  const rr = (k, lab, min, max, st, suf) => `<label>${lab}</label><div class="rangerow">
    <input type="range" data-pr="${k}" min="${min}" max="${max}" step="${st}" value="${p[k]}">
    <span class="val">${p[k]}${suf || ''}</span></div>`;
  return `<div class="pane on"><div class="grp"><div class="eyebrow">${T('proc')}</div><div class="body">
    <div class="fgrid" style="grid-template-columns:1fr 1fr;gap:4px 8px">
      ${rr('sbW', T('sbW'), 0, 4, .05, '%')}${rr('sbT', T('sbT'), 0, 4, .05, '%')}
      ${rr('slip', T('slip'), 0, 1, .01, '%')}${rr('biasRot', T('biasR'), -2, 2, .05, '°')}
      ${rr('noiseA', T('noise') + ' °', 0, .3, .01, '')}${rr('seed', T('seed'), 1, 99, 1, '')}</div>
    <button class="btn pri mt6" style="width:100%" data-a="sim">${T('simulate')}</button>
    <div class="hintline">${T('formula')}</div>
  </div></div>
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
        <td><span class="ori ${ori[i]}">${ori[i]}</span></td>
        <td class="${cls(D.dev.angle[i], M.tol.angle)}">${sgn(D.dev.angle[i], 3)}</td>
        <td class="${cls(D.dev.rot[i], M.tol.rot)}">${sgn(D.dev.rot[i], 3)}</td>
        <td class="${cls(D.dev.feed[i], M.tol.feed)}">${sgn(D.dev.feed[i], 2)}</td>
        <td class="${cls(D.dev.point[i + 1], M.tol.point)}">${fx(D.dev.point[i + 1], 2)}</td></tr>`).join('')}
    </tbody></table></div>
  </div></div>`}</div>`;
}

/* --- pestaña COMPENSACIÓN ----------------------------------------------- */
function paneComp(M) {
  const D = activeDataset(), C = ST.comp, ori = E.orientations(M);
  if (!D) return `<div class="pane on"><div class="grp"><div class="body">
    <div class="warnbox mt10">${T('noMeas')}</div></div></div></div>`;
  const cmd = ST.command;
  const nw = E.compensate(cmd, M.bends, D.model.bends, C, ori);
  const pred = ST.pred;
  const n = Math.min(M.bends.length, nw.length, cmd.length);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const d = nw[i].angle - cmd[i].angle;
    rows.push(`<tr class="clk ${i === ST.sel ? 'sel' : ''}" data-r="${i}"><td>B${i + 1}</td>
      <td><span class="ori ${ori[i]}">${ori[i]}</span></td>
      <td class="v-dim">${fx(cmd[i].angle, 3)}</td><td>${fx(nw[i].angle, 3)}</td>
      <td class="${Math.abs(d) > 1e-4 ? 'v-warn' : 'v-dim'}">${sgn(d, 3)}</td>
      <td class="v-dim">${fx(cmd[i].feed, 2)}</td><td>${fx(nw[i].feed, 2)}</td></tr>`);
  }
  return `<div class="pane on"><div class="grp"><div class="eyebrow">${T('gains')}</div><div class="body">
    <div class="fgrid"><label>${T('gainW')} <span class="ori W">W</span></label>
      <input type="number" step=".05" min="0" max="1.5" data-c="gainW" value="${C.gainW}">
      <label>${T('gainT')} <span class="ori T">T</span></label>
      <input type="number" step=".05" min="0" max="1.5" data-c="gainT" value="${C.gainT}"></div>
    <div class="eyebrow" style="padding-left:0">${T('what')}</div>
    <div class="row wrap">
      ${[['doAngle', 'cAng'], ['doRot', 'cRot'], ['doFeed', 'cFeed']].map(([k, l]) =>
      `<label class="row" style="gap:4px"><input type="checkbox" data-c="${k}" ${C[k] ? 'checked' : ''}>${T(l)}</label>`).join('')}</div>
    <div class="hintline">${T('formula')}</div>
    <div class="row mt6"><button class="btn pri grow" data-a="apply">${T('apply')}</button>
      <button class="btn" data-a="resetcmd">${T('reset')}</button></div>
  </div></div>
  <div class="grp"><div class="eyebrow">${T('cmdTbl')}</div><div class="body">
    <div class="tw"><table><thead><tr><th>${T('nBend')}</th><th>${T('ori')}</th>
      <th>${T('cNow')} °</th><th>${T('cNew')} °</th><th>${T('cDelta')} °</th>
      <th>${T('cNow')} mm</th><th>${T('cNew')} mm</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
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

export const renderPanels = () => { renderLeft(); renderRight(); renderStatus(); };
