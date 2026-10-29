/* =========================================================================
   MEDIR POR ÁNGULOS — la mitad de la pestaña MEDICIÓN que no tiene nube.
   Quien mide la pieza con un goniómetro, o recibe de un informe externo el
   ángulo INTERNO entre cada par de rectas consecutivas, no tiene puntos: tiene
   un número por doblez. Aquí se teclea ese número al lado del nominal, se ve el
   Δ con el mismo semáforo que la tabla de la nube y se pide la corrección del
   comando. El modelo medido lo fabrica el motor (`modelFromInternal`) y entra a
   la escena como cualquier otra pieza medida: este archivo solo pinta y guarda
   lo que se está tecleando.

   LO TECLEADO ANTES DE CREAR vive en `angUI.draft`, a nivel de módulo, y no en
   ST: es un borrador de interfaz, no parte del documento, y no debe gastar un
   paso de deshacer ni viajar en el JSON. Una vez creada la pieza los valores
   viven en `Dataset.reported` y las ediciones van directas a ella.
   ========================================================================= */
import * as E from '../engine.ts';
import { T } from '../i18n.ts';
import type { AngleSummary, Model } from '../types.ts';
import { ST, activeDataset, angleSummary } from '../state.ts';
import { fx, esc, cls, sgn } from './fmt.ts';

/** Estado de interfaz del método por ángulos (ver el encabezado). */
export const angUI: { method: string; draft: (number | null)[]; name: string } = {
  method: 'cloud', draft: [], name: '',
};

/** La pieza por ángulos ACTIVA, o null: es la que se edita en vivo. */
export const angleDs = () => {
  const D = activeDataset();
  return D && D.method === 'angles' ? D : null;
};

/** Cuántos valores hay tecleados (no nulos). */
export const countTyped = (v: (number | null)[]): number =>
  v.filter(x => x !== null && isFinite(x)).length;

/** Número de un campo de texto, con coma o con punto decimal; null si vacío o
 *  no numérico. Los campos de ángulo son de TEXTO a propósito: un
 *  `type=number` devuelve '' con «17,5» según el idioma del navegador, y el
 *  taller teclea con coma. */
export function parseDec(s: string): number | null {
  const t = String(s).trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
}

/** Los valores que se están mirando: los de la pieza activa o el borrador. */
export function angVals(M: Model): (number | null)[] {
  const ds = angleDs();
  const src = ds && ds.reported ? ds.reported : angUI.draft;
  return Array.from({ length: M.bends.length }, (_, i) => (src[i] === undefined ? null : src[i]));
}

/** El resumen de lo que se mira: el de la pieza, o uno en vivo del borrador. */
export function angSummary(M: Model): AngleSummary {
  const ds = angleDs();
  const s = ds ? angleSummary(ds) : null;
  return s || E.angleReport(M, ST.command, angVals(M), ST.comp, E.orientations(M));
}

/** Colores del gráfico. En la aplicación son los tokens del tema —así sigue al
 *  claro y al oscuro—; el reporte, que no tiene esa hoja, pasa los suyos. */
export type ChartPal = {
  ok: string; warn: string; bad: string; dim: string; line: string; band: string;
};
export const APP_PAL: ChartPal = {
  ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', dim: 'var(--dim)',
  line: 'var(--line2)', band: 'var(--ok)',
};

/** Δ por doblez como barras, con la banda ±tolerancia. Escala vertical: la
 *  banda más un margen, o el mayor |Δ| si la pasa, para que una barra fuera de
 *  rango se vea fuera y no se corte. Sin Δ (sin medir) no hay barra, solo la
 *  marca del doblez: un cero dibujado sería una medida que nadie tomó. */
export function angleChart(rows: AngleSummary['rows'], tol: number, pal: ChartPal, h = 130): string {
  const W = 340, padL = 34, padR = 8, padT = 8, padB = 18;
  const n = Math.max(1, rows.length);
  const mx = rows.reduce((a, r) => (r.dev === null ? a : Math.max(a, Math.abs(r.dev))), 0);
  const ymax = Math.max(tol * 2.2, mx * 1.15) || 1;
  const y0 = padT + (h - padT - padB) / 2, sc = (h - padT - padB) / 2 / ymax;
  const slot = (W - padL - padR) / n, bw = Math.min(26, slot * .6);
  const Y = (v: number): number => y0 - v * sc;
  const col = (d: number): string => {
    const a = Math.abs(d);
    return a <= tol ? pal.ok : a <= 2 * tol ? pal.warn : pal.bad;
  };
  const txt = (x: number, y: number, s: string, a = 'middle'): string =>
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${a}" style="fill:${pal.dim}" font-size="9">${s}</text>`;
  const bars = rows.map((r, i) => {
    const cx = padL + slot * (i + .5);
    const lab = txt(cx, h - 5, `B${i + 1}`);
    if (r.dev === null) return lab;
    const y = Y(Math.max(r.dev, 0)), hh = Math.max(1, Math.abs(r.dev) * sc);
    return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}"
      rx="1.5" style="fill:${col(r.dev)}"><title>B${i + 1}: ${sgn(r.dev, 3)}°</title></rect>${lab}`;
  }).join('');
  const guide = (v: number, dash: boolean): string =>
    `<line x1="${padL}" x2="${W - padR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"
      style="stroke:${dash ? pal.ok : pal.line}"${dash ? ' stroke-dasharray="3 3" opacity=".6"' : ''}/>`;
  return `<svg class="angchart" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(T('angChartTip'))}"
      preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block">
    <rect x="${padL}" y="${Y(tol).toFixed(1)}" width="${W - padL - padR}" height="${(2 * tol * sc).toFixed(1)}"
      style="fill:${pal.band}" opacity=".14"/>
    ${guide(tol, true)}${guide(-tol, true)}${guide(0, false)}
    ${txt(padL - 4, Y(tol) + 3, '+' + fx(tol, 2), 'end')}${txt(padL - 4, Y(-tol) + 3, '−' + fx(tol, 2), 'end')}
    ${txt(padL - 4, y0 + 3, '0', 'end')}${bars}</svg>`;
}

/** Barrita horizontal de una celda: centrada en 0, el extremo es ±2·tol (donde
 *  el semáforo pasa a rojo), y se recorta ahí. Es una ayuda para el ojo: la
 *  cifra manda. */
const devBar = (dev: number | null, tol: number): string => {
  if (dev === null) return '';
  const f = Math.max(-1, Math.min(1, dev / (2 * tol || 1))) * 50;
  const c = cls(dev, tol).replace('v-', '');
  return `<span class="abar" aria-hidden="true"><i class="${c}" style="${f >= 0
    ? `left:50%;width:${f.toFixed(1)}%` : `left:${(50 + f).toFixed(1)}%;width:${(-f).toFixed(1)}%`}"></i></span>`;
};

/** El bloque completo del método «Por ángulos». */
export function angPane(M: Model): string {
  const ds = angleDs();
  const tol = M.tol.angle;
  if (!ds) while (angUI.draft.length < M.bends.length) angUI.draft.push(null);
  const S = angSummary(M), vals = angVals(M);
  const nm = ds ? ds.name : (angUI.name || `${T('angDefName')} ${ST.datasets.length + 1}`);
  const stat = (k: string, v: string, c = ''): string =>
    `<div class="stat"><div class="k">${k}</div><div class="v ${c}">${v}</div></div>`;
  const U = '<span class="u">°</span>';
  const body = S.rows.map((r, i) => `<tr class="clk ${i === ST.sel ? 'sel' : ''}" data-r="${i}"
      ${i === ST.sel ? 'aria-current="true"' : ''}><td>B${i + 1}</td>
      <td>${fx(r.nomInt, 2)}</td>
      <td><input type="text" inputmode="decimal" class="angin" ${vals[i] !== null && vals[i] !== undefined && (vals[i]! < 0 || vals[i]! > 180) ? 'aria-invalid="true"' : ''} data-ai="${i}" data-orig="${vals[i] ?? ''}"
        value="${vals[i] === null || vals[i] === undefined ? '' : +(+vals[i]!).toFixed(3)}"
        aria-label="${esc(T('angMeasOf').replace('{b}', 'B' + (i + 1)))}"></td>
      <td class="${r.dev === null ? 'v-dim' : cls(r.dev, tol)}">${r.dev === null ? '—' : sgn(r.dev, 3)}${devBar(r.dev, tol)}</td>
      <td class="angrc" title="${esc(T('angCmd'))}: ${fx(r.cmd, 2)}°">${r.measInt === null
        ? `<span class="v-dim">${fx(r.cmd, 2)}</span>`
        : `${fx(r.rec, 2)}<span class="corr">${sgn(r.recDelta, 2)}</span>`}</td></tr>`).join('');
  return `<div class="grp"><div class="eyebrow">${T('angTitle')}</div><div class="body">
    <div class="hintline">${T('angHint')}</div>
    <div class="hintline v-warn">${T('angOneNote')}</div>
    <label class="tag" for="angname">${T('angName')}</label>
    <input type="text" id="angname" class="angname" data-ann="1" value="${esc(nm)}" maxlength="80">
    <div class="tw mt6"><table class="angtab"><thead><tr><th scope="col">${T('nBend')}</th>
      <th scope="col" title="${esc(T('angNomTip'))}">${T('angNom')}</th>
      <th scope="col" title="${esc(T('angMeasTip'))}">${T('angMeas')}</th>
      <th scope="col">Δ</th>
      <th scope="col" title="${esc(T('angRecTip'))}">${T('angRec')}</th></tr></thead><tbody>${body}</tbody></table></div>
    <div class="row mt6"><button class="btn sm grow" data-a="angnew" ${countTyped(vals) ? '' : 'disabled'}>${T('angCreate')}</button>
      <button class="btn sm grow" data-a="angrec" ${ds && S.n ? '' : 'disabled'} title="${esc(T('angRecApplyTip'))}">${T('angApply')}</button>
      <button class="btn sm grow" data-a="report">${T('bRep')}</button></div>
    <div class="stats">
      ${stat(T('angMaxAbs'), fx(S.maxAbs, 3) + U, S.n ? cls(S.maxAbs, tol) : '')}
      ${stat(T('statRms'), fx(S.rms, 3) + U)}
      ${stat(T('angMean'), (S.n ? sgn(S.mean, 3) : '—') + U)}
      ${stat(T('statOut'), `${S.n ? S.out : '—'}<span class="u">/${S.n}</span>`, S.n ? (S.out ? 'v-bad' : 'v-ok') : '')}
      ${stat(T('angN'), `${S.n}<span class="u">/${S.rows.length}</span>`)}
    </div>
    <div class="eyebrow" style="padding-left:0">${T('angChart')}</div>
    ${angleChart(S.rows, tol, APP_PAL)}
  </div></div>`;
}
