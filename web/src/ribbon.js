/* ------------------------------------------------------ cinta inferior ----
   Desenrolla la longitud desarrollada y pone una columna por doblez,
   coloreada por desviación, con la línea de tolerancia punteada. Deja ver de
   un vistazo cuál doblez está fuera. Es clicable.

   Cambia de significado sola: con pieza medida muestra la desviación del
   DESVÍO TOTAL del doblez (dev.theta, no solo `angle`: mirar únicamente el
   ángulo de plano daría por bueno un doblez de canto completamente fuera).
   Sin pieza medida, y con la activa distinta de la referencia, muestra el Δ
   desvío entre variantes.                                                   */
import * as E from './engine.js';
import { ST, activeDataset, refModel } from './state.js';
import { T } from './i18n.js';
import { devCssColor, cssVar } from './scene.js';

const $ = s => document.querySelector(s);
const fx = (v, n = 2) => (v === null || v === undefined || !isFinite(v)) ? '—' : v.toFixed(n);
let onSelect = () => {};
export const setOnRibbonSelect = fn => { onSelect = fn; };

export function drawRibbon() {
  const cv = $('#rbc');
  if (!cv || !ST.model) return;
  const dpr = Math.min(devicePixelRatio, 2), w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const M = ST.model, D = activeDataset();
  const L = E.buildPath(M).total;
  const pad = 60, top = 26, bot = h - 18, mid = bot;
  const X = s => pad + (s / (L || 1)) * (w - pad - 14);
  const tol = M.tol.angle || 1, maxR = 2.5;

  /* eje */
  g.strokeStyle = cssVar('--line', '#242C39'); g.lineWidth = 1;
  g.beginPath(); g.moveTo(pad, mid + .5); g.lineTo(w - 14, mid + .5); g.stroke();

  /* línea de tolerancia */
  const hTol = (bot - top) / maxR;
  g.setLineDash([3, 3]); g.strokeStyle = cssVar('--warn', '#FFC53D') + '66';
  g.beginPath(); g.moveTo(pad, bot - hTol); g.lineTo(w - 14, bot - hTol); g.stroke();
  g.setLineDash([]);
  g.fillStyle = cssVar('--dim', '#7E8A9C'); g.font = '9px ui-monospace,monospace'; g.textAlign = 'right';
  g.fillText('tol ' + fx(tol, 2) + '°', pad - 4, bot - hTol + 3);
  g.fillText('0', pad - 4, mid + 3);

  /* sin pieza medida, la cinta compara la activa contra la referencia: el
     mismo gesto sirve para inspección y para comparar variantes de diseño */
  const refB = (!D && ST.ref !== ST.active) ? refModel().bends : null;
  const pos = E.bendStations(M);
  const ori = E.orientations(M);
  const bw = Math.max(4, Math.min(20, (w - pad - 20) / (Math.max(1, pos.length) * 1.9)));

  for (let i = 0; i < pos.length; i++) {
    const x = X(pos[i]);
    let d = null;
    if (D && i < D.dev.theta.length) d = Math.abs(D.dev.theta[i]);
    else if (refB && i < refB.length) d = Math.abs(E.bendTheta(M.bends[i]) - E.bendTheta(refB[i]));
    if (d === null || !isFinite(d)) {
      g.fillStyle = cssVar('--panel3', '#1D2430'); g.fillRect(x - bw / 2, mid - 8, bw, 8);
    } else {
      const hh = Math.min(Math.abs(d) / tol / maxR, 1) * (bot - top);
      g.fillStyle = devCssColor(d, tol);
      g.fillRect(x - bw / 2, mid - hh, bw, Math.max(hh, 1.5));
      if (i === ST.sel) {
        g.strokeStyle = cssVar('--txt', '#fff'); g.lineWidth = 1;
        g.strokeRect(x - bw / 2 - 1.5, mid - hh - 1.5, bw + 3, hh + 3);
      }
    }
    g.fillStyle = i === ST.sel ? cssVar('--txt', '#D8DFE9') : cssVar('--dim2', '#5A6576');
    g.textAlign = 'center'; g.font = '9px ui-monospace,monospace';
    g.fillText(String(i + 1), x, h - 6);
    g.fillStyle = ori[i] === 'W' ? cssVar('--oriWbd', '#6B4B9E') : cssVar('--oriTbd', '#3B7A6C');
    g.fillRect(x - bw / 2, mid + 2, bw, 2);
  }
  cv._pos = pos; cv._X = X;
  const title = $('#rbtitle');
  if (title) title.textContent = refB ? T('vsRef') : T('ribbon');
}

export function bindRibbon() {
  const cv = $('#rbc');
  if (!cv) return;
  cv.addEventListener('click', ev => {
    if (!cv._pos || !cv._pos.length) return;
    let best = -1, bd = Infinity;
    cv._pos.forEach((p, i) => {
      const dd = Math.abs(cv._X(p) - ev.offsetX);
      if (dd < bd) { bd = dd; best = i; }
    });
    if (bd < 24) onSelect(best);
  });
}
