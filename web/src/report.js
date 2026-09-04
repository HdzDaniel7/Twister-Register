/* ---------------------------------------------------------------- reporte --
   Imprimible: capturas de las 4 vistas + la cinta + la tabla por doblez.
   Se abre en una ventana nueva; las imágenes van empotradas como data URI,
   así que el archivo se puede guardar y llevar tal cual.                    */
import * as E from './engine.js';
import { T } from './i18n.js';
import { ST, activeDataset, REF } from './state.js';
import { captureViews, devCssColor } from './scene.js';
import { fx, esc } from './panels.js';

export function makeReport() {
  const M = ST.model, D = activeDataset(), ori = E.orientations(M);
  const shots = captureViews();
  const rb = document.querySelector('#rbc').toDataURL('image/png');
  const dv = D ? D.dev : null;

  const rows = M.bends.map((b, i) => {
    const has = dv && i < dv.angle.length;
    const col = has ? devCssColor(Math.abs(dv.theta[i]), M.tol.angle) : '#888';
    return `<tr><td>B${i + 1}</td><td>${ori[i]}</td>
      <td>${fx(E.bendTheta(b), 3)}</td>
      <td>${has ? fx(E.bendTheta(D.model.bends[i]), 3) : '—'}</td>
      <td style="color:${col}">${has ? (dv.theta[i] > 0 ? '+' : '') + fx(dv.theta[i], 3) : '—'}</td>
      <td>${ST.command[i] ? fx(ST.command[i].angle, 3) : '—'}</td>
      <td>${has ? fx(dv.point[i + 1], 2) : '—'}</td></tr>`;
  }).join('');

  const varRows = ST.variants.map(v => {
    const vm = E.effectiveModel(v);
    let shift = 0;
    if (v.id !== ST.ref) {
      const sh = E.piShift(vm, E.effectiveModel(REF()), ST.anchor);
      shift = ST.anchor === 'end' ? sh[0] : sh[sh.length - 1];
    }
    return `<tr><td>${esc(v.name)}${v.id === ST.ref ? ' · ' + T('isRef') : ''}</td>
      <td>${vm.bends.length}</td><td>${fx(E.buildPath(vm).total, 1)}</td>
      <td>${v.id === ST.ref ? '—' : fx(shift, 2)}</td></tr>`;
  }).join('');

  const anchorLab = { start: T('aStart'), end: T('aEnd'), best: T('aBest') }[ST.anchor];
  const html = `<!doctype html><meta charset="utf-8"><title>${T('repTitle')}</title>
  <style>body{font:12px ui-monospace,monospace;background:#fff;color:#111;margin:26px;max-width:1000px}
  h1{font:600 17px system-ui;letter-spacing:.04em;margin:0 0 2px}
  h2{font:600 10px system-ui;letter-spacing:.12em;text-transform:uppercase;color:#666;margin:16px 0 4px}
  .sub{color:#666;margin-bottom:16px;font-size:11px}
  .kv{display:flex;gap:22px;flex-wrap:wrap;border:1px solid #ddd;padding:9px 12px;border-radius:4px;margin-bottom:14px}
  .kv div span{color:#777}
  img{width:48%;border:1px solid #ddd;border-radius:4px;margin:0 1% 8px 0;background:#080A0E}
  img.wide{width:98%}
  table{border-collapse:collapse;width:100%;margin-top:4px;font-size:11px}
  th{background:#f2f4f7;text-align:right;padding:5px 6px;border:1px solid #ddd;font:600 9px system-ui;letter-spacing:.08em;text-transform:uppercase}
  td{text-align:right;padding:3px 6px;border:1px solid #e6e6e6}
  th:first-child,td:first-child{text-align:left}
  @media print{body{margin:0}}</style>
  <h1>${T('repTitle')}</h1>
  <div class="sub">BARCOMP α · ${esc(M.name)}</div>
  <div class="kv">
    <div><span>${T('repDate')}</span> ${new Date().toLocaleString()}</div>
    <div><span>${T('repPiece')}</span> ${D ? esc(D.name) : '—'}</div>
    <div><span>${T('stBends')}</span> ${M.bends.length}</div>
    <div><span>${T('stLen')}</span> ${fx(E.buildPath(M).total, 1)} mm</div>
    <div><span>${T('tolA')}</span> ±${M.tol.angle}°</div>
    <div><span>${T('anchor')}</span> ${anchorLab}</div>
    <div><span>${T('statMaxA')}</span> ${D ? fx(D.dev.maxA, 3) + '°' : '—'}</div>
    <div><span>${T('statTip')}</span> ${D ? fx(D.dev.tip, 2) + ' mm' : '—'}</div>
    <div><span>${T('statOut')}</span> ${D ? D.dev.out + '/' + M.bends.length : '—'}</div>
    <div><span>${T('engine')}</span> JavaScript · three.js</div></div>
  ${shots.map(([, u]) => `<img src="${u}">`).join('')}
  <img class="wide" src="${rb}">
  ${ST.variants.length > 1 ? `<h2>${T('variants')}</h2>
  <table><thead><tr><th>${T('name')}</th><th>${T('stBends')}</th>
  <th>${T('stLen')} mm</th><th>${T('dTip')} mm</th></tr></thead><tbody>${varRows}</tbody></table>` : ''}
  <h2>${T('bends')}</h2>
  <table><thead><tr><th>${T('nBend')}</th><th>${T('ori')}</th><th>Nom °</th><th>${T('meas')} °</th>
  <th>Δ °</th><th>${T('cNew')} °</th><th>${T('dP')} mm</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <p style="color:#666;font-size:10px;margin-top:14px">${T('formula')} · ${T('note')}</p>`;

  const w = window.open('', '_blank');
  if (!w) { alert(T('repTitle')); return; }
  w.document.write(html);
  w.document.close();
}
