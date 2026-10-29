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
import { ST, V, activeDataset, angleSummary, angleLotSummary, syncPlan } from '../state.ts';
import { fx, esc, cls, sgn } from './fmt.ts';
import type { I18nKey } from './fmt.ts';

/** Estado de interfaz del método por ángulos (ver el encabezado). `lot` pide el
 *  resumen del LOTE (mediana de las piezas hechas con el mismo tablero) en vez
 *  del de la pieza; `note` es el aviso de la última acción (el tablero nuevo). */
export const angUI: { method: string; draft: (number | null)[]; name: string; lot: boolean; note: string } = {
  method: 'cloud', draft: [], name: '', lot: false, note: '',
};

/** Las piezas por ángulos visibles hechas con el MISMO tablero que la activa:
 *  si hay más de una, tiene sentido el resumen de lote. */
export const lotPieces = (): number => {
  const a = angleDs();
  if (!a || !a.board) return 0;
  return ST.datasets.filter(d => d.method === 'angles' && d.visible && d.board && d.board.vid === a.board!.vid).length;
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

/** Sin pieza todavía: el resumen en vivo de lo tecleado contra el tablero. */
const draftSummary = (M: Model): AngleSummary =>
  E.angleReport(M, ST.plan, angVals(M), ST.comp, E.orientations(M));

/** El resumen de lo que se mira: el de la pieza, o uno en vivo del borrador. */
export function angSummary(M: Model): AngleSummary {
  const ds = angleDs();
  const s = ds ? angleSummary(ds) : null;
  if (ds && angUI.lot && lotPieces() > 1) return angleLotSummary(ds) || s || draftSummary(M);
  return s || draftSummary(M);
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
    const nm = r.name || `B${i + 1}`;
    const lab = txt(cx, h - 5, esc(nm.length > 6 ? nm.slice(0, 5) + '…' : nm));
    if (r.dev === null) return lab;
    const y = Y(Math.max(r.dev, 0)), hh = Math.max(1, Math.abs(r.dev) * sc);
    return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}"
      rx="1.5" style="fill:${col(r.dev)}"><title>${esc(nm)}: ${sgn(r.dev, 3)}° (Δ ${esc(T('angVsPlan'))})</title></rect>${lab}`;
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

/** Un chip de la tira de leyenda: color del conjunto de valores y su nombre. */
const chip = (c: string, k: string, tip: string): string =>
  `<span class="angchip ${c}" title="${esc(T(tip as I18nKey))}">${T(k as I18nKey)}</span>`;

/** El bloque completo del método «Por ángulos».
 *  TRES conjuntos de valores de la MISMA pieza, y la interfaz los separa:
 *  PLANO (el CAD, lo que se quiere; se teclea aquí), REPORTE (lo que midió el
 *  escáner) y TABLERO (lo de Modelos, con lo que dobló la máquina; aquí solo
 *  se corrige). Δ = Reporte − Plano. */
export function angPane(M: Model): string {
  const ds = angleDs();
  const tol = M.tol.angle;
  syncPlan(M.bends.length);
  if (!ds) while (angUI.draft.length < M.bends.length) angUI.draft.push(null);
  const lotN = lotPieces(), lot = !!ds && angUI.lot && lotN > 1;
  const S = angSummary(M), vals = angVals(M);
  const nm = ds ? ds.name : (angUI.name || `${T('angDefName')} ${ST.datasets.length + 1}`);
  const boardName = ds && ds.board ? ds.board.name : V().name;
  const stat = (k: string, v: string, c = ''): string =>
    `<div class="stat"><div class="k">${k}</div><div class="v ${c}">${v}</div></div>`;
  const U = '<span class="u">°</span>';
  const body = S.rows.map((r, i) => {
    const pv = ST.plan.nominal[i];
    const bad = (x: number | null | undefined): string =>
      x !== null && x !== undefined && (x < 0 || x > 180) ? 'aria-invalid="true"' : '';
    return `<tr class="clk ${i === ST.sel ? 'sel' : ''}" data-r="${i}" ${i === ST.sel ? 'aria-current="true"' : ''}>
      <td><input type="text" class="angnm" data-apn="${i}" data-orig="${esc(ST.plan.names[i] || '')}" maxlength="24"
        value="${esc(ST.plan.names[i] || '')}" placeholder="B${i + 1}" aria-label="${esc(T('angNameOf').replace('{b}', 'B' + (i + 1)))}"></td>
      <td><input type="text" inputmode="decimal" class="angin plan" ${bad(pv)} data-apv="${i}" data-orig="${pv ?? ''}"
        value="${pv === null || pv === undefined ? '' : +(+pv).toFixed(3)}" placeholder="${fx(r.boardInt, 2)}"
        aria-label="${esc(T('angPlanOf').replace('{b}', 'B' + (i + 1)))}">${r.planInt === null
        ? `<span class="nopl" title="${esc(T('angNoPlanTip'))}">≈</span>` : ''}</td>
      <td><input type="text" inputmode="decimal" class="angin rep" ${bad(vals[i])} data-ai="${i}" data-orig="${vals[i] ?? ''}"
        value="${vals[i] === null || vals[i] === undefined ? '' : +(+vals[i]!).toFixed(3)}"
        aria-label="${esc(T('angMeasOf').replace('{b}', 'B' + (i + 1)))}"></td>
      <td class="${r.dev === null ? 'v-dim' : cls(r.dev, tol)}">${r.dev === null ? '—' : sgn(r.dev, 3)}${devBar(r.dev, tol)}</td>
      <td class="angrc" title="${esc(T('angBoardNow'))}: ${fx(r.board, 2)}°">${r.measInt === null
        ? `<span class="v-dim">${fx(r.board, 2)}</span>`
        : `${fx(r.rec, 2)}<span class="corr">${sgn(r.recDelta, 2)}</span>`}</td></tr>`;
  }).join('');
  const tog = lotN > 1 ? `<div class="seg angtog" role="group"><button data-a="angpiece" class="${lot ? '' : 'on'}"
      aria-pressed="${!lot}">${T('angPiece')}</button><button data-a="anglote" class="${lot ? 'on' : ''}"
      aria-pressed="${lot}" title="${esc(T('angLotTip'))}">${T('angLot').replace('{n}', String(lotN))}</button></div>` : '';
  return `<div class="grp"><div class="eyebrow">${T('angTitle')}</div><div class="body">
    <div class="angflow">${chip('plan', 'angPlan', 'angPlanTip')}<span>·</span>${chip('rep', 'angRep', 'angRepTip')}<span>→ Δ →</span>${chip('brd', 'angBoard', 'angBoardTip')}</div>
    <div class="hintline">${T('angFlowHint')}</div>
    <div class="hintline">${T('angBoardInfo').replace('{b}', `<b>${esc(boardName)}</b>`)}</div>
    <label class="tag" for="angname">${T('angName')}</label>
    <input type="text" id="angname" class="angname" data-ann="1" value="${esc(nm)}" maxlength="80">
    ${tog}
    <div class="tw mt6"><table class="angtab"><thead><tr><th scope="col">${T('nBend')}</th>
      <th scope="col" class="hplan" title="${esc(T('angPlanTip'))}">${T('angPlan')}</th>
      <th scope="col" class="hrep" title="${esc(T('angRepTip'))}">${T('angRep')}</th>
      <th scope="col" title="${esc(T('angDeltaTip'))}">Δ</th>
      <th scope="col" class="hbrd" title="${esc(T('angBoardTip'))}">${T('angBoardNew')}</th></tr></thead><tbody>${body}</tbody></table></div>
    ${S.planMissing > 0 ? `<div class="hintline v-warn">${T('angPlanMissing').replace('{n}', String(S.planMissing))}</div>` : ''}
    ${angUI.note ? `<div class="hintline v-ok" role="status">${esc(angUI.note)}</div>` : ''}
    <div class="row mt6"><button class="btn sm grow" data-a="angnew" ${countTyped(vals) ? '' : 'disabled'}>${T('angCreate')}</button>
      <button class="btn sm grow" data-a="angrec" ${ds && S.n ? '' : 'disabled'} title="${esc(T('angRecApplyTip'))}">${T('angApply')}</button>
      <button class="btn sm grow" data-a="report">${T('bRep')}</button></div>
    <div class="hintline v-warn">${T('angOneNote')}</div>
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
