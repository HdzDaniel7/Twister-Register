/* =========================================================================
   RASTREADOR DE CERCANÍA — el grupo de controles de la pestaña Vista.

   Vive en Vista porque pinta la escena, como las capas, y no mide ni corrige
   nada del documento. El interruptor, los dos selectores de pieza y el de eje
   escriben en `proxUI` (proxstate.ts: borrador de interfaz); el resultado y su
   leyenda salen de `proxResult()`, la misma caché que usa la capa 3D.
   La leyenda enseña los umbrales EN MM con la tolerancia de punto del modelo:
   verde hasta 0.25·tol, amarillo a tol, color pleno a 2·tol.
   ========================================================================= */
import { T } from '../i18n.ts';
import { ST } from '../state.ts';
import { proxUI, proxResult } from '../proxstate.ts';
import { PROX_AXES } from '../engine/proximity.ts';
import { fx, esc } from './fmt.ts';
import type { I18nKey } from './fmt.ts';

const AX_KEY: Record<string, I18nKey> = {
  mag: 'prxMag', x: 'prxAxX', y: 'prxAxY', z: 'prxAxZ', thick: 'prxAxThick', width: 'prxAxWidth',
};

export function proxPane(): string {
  /* una opción por variante y por pieza medida; '' es el valor por omisión
     (modelo activo en A, referencia en B) */
  const sel = (attr: string, cur: string, first: string): string => {
    const o = (v: string, name: string) =>
      `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(name)}</option>`;
    return `<select ${attr}>${o('', first)}${ST.variants.map(v => o(v.id, v.name)).join('')}` +
      `${ST.datasets.map(d => o(d.id, d.name)).join('')}</select>`;
  };
  const axes = PROX_AXES.map(a =>
    `<option value="${a}" ${a === proxUI.axis ? 'selected' : ''}>${esc(T(AX_KEY[a]))}</option>`).join('');

  let body = '';
  if (proxUI.on) {
    const st = proxResult();
    if (!st) body = `<div class="emptynote">${T('prxMissing')}</div>`;
    else {
      const tol = st.tol, s = st.res.stats, signed = proxUI.axis !== 'mag';
      const sw = (c: string, lab: string) =>
        `<span class="prxlg"><i class="prxsw" style="background:${c}"></i>${lab}</span>`;
      const g = 'var(--ok,#3fd68c)', y = '#ffd933', r = '#ff4d5e', b = '#4a8cff';
      const legend = `<div class="prxleg" aria-label="${esc(T('prxLegend'))}">
        ${sw(g, `≤ ${fx(.25 * tol, 2)}`)}${sw(`linear-gradient(90deg,${g},${y})`, `≤ ${fx(tol, 2)}`)}
        ${sw(`linear-gradient(90deg,${y},${r})`, signed ? `+ ≤ ${fx(2 * tol, 2)}` : `> ${fx(tol, 2)}`)}
        ${signed ? sw(`linear-gradient(90deg,${y},${b})`, `− ≤ ${fx(2 * tol, 2)}`) : ''}
        ${sw('#80858f', T('prxNoPair'))} <span class="v-dim">mm</span></div>`;
      const stat = (k: string, v: string) =>
        `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`;
      const same = (proxUI.a || ST.active) === (proxUI.b || ST.ref) && !ST.datasets.some(d => d.id === proxUI.a);
      body = `${legend}
        <div class="prxstats">
          ${stat(T('prxMaxPos'), `${fx(s.maxPos, 2)}<span class="u">mm</span>`)}
          ${stat(T('prxMaxNeg'), `${fx(s.maxNeg, 2)}<span class="u">mm</span>`)}
          ${stat(T('prxAt'), s.nPaired ? fx(s.sAtMax, 0) + '<span class="u">mm</span>' : '—')}
          ${stat(T('prxWithin'), s.nPaired ? fx(100 * s.within, 0) + '<span class="u">%</span>' : '—')}
        </div>
        <div class="hintline">${esc(st.nameA)} → ${esc(st.nameB)} · ${s.nPaired}/${s.n}</div>
        ${same ? `<div class="hintline">${T('prxSame')}</div>` : ''}
        ${s.nPaired < s.n ? `<div class="hintline">${T('prxUnpaired')}</div>` : ''}`;
    }
  }
  return `<div class="grp"><div class="eyebrow">${T('prxTitle')}</div><div class="body">
    <label class="layer"><input type="checkbox" data-prxon ${proxUI.on ? 'checked' : ''}>
      <span class="nm">${T('prxOn')}</span></label>
    <div class="fgrid" style="grid-template-columns:1fr 1.4fr">
      <label>${T('prxA')}</label>${sel('data-prxa', proxUI.a, T('prxActive'))}
      <label>${T('prxB')}</label>${sel('data-prxb', proxUI.b, T('prxRef'))}
      <label>${T('prxAxis')}</label><select data-prxx>${axes}</select>
    </div>
    ${body}
    <div class="hintline">${T('prxHint')}</div>
  </div></div>`;
}
