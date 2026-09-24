/* =========================================================================
   ARMAZÓN — cabecera con acciones globales, tema e idioma, la barra del
   viewport (vistas, exageración, modo de color), la leyenda y las pestañas
   de abajo. Todo lo que envuelve el resto de paneles.
   ========================================================================= */
import { T, LANG, LANGS } from '../i18n.ts';
import { ST, V, REF } from '../state.ts';
import { $, MODES, TABS_OF, fx, esc } from './fmt.ts';
import type { I18nKey } from './fmt.ts';
import type { Mode } from '../types.ts';

/* Las etiquetas del selector de modo, escritas una por una a propósito: con
   `T(('mode' + m) as I18nKey)` el tipo dejaría de comprobar que la clave
   existe, que es justo la red que hace que falte una traducción sea un error
   de compilación y no un hueco en pantalla. */
/* Los menús. Lo que abren son cajones (ver DRAWERS en left.ts): la
   columna fija de 250 px se pagaba siempre, y casi todo lo que había ahí
   —capas, colocación, extremo fijo— se toca una vez y se olvida. */
export const MENUS: [string, I18nKey][] = [
  ['file', 'mnFile'], ['models', 'mnModel'],
  ['view', 'mnView'], ['pieces', 'mnPieces'],
];

/* Tema e idioma se pintan DOS veces: en la cabecera de escritorio y dentro
   del cajón de menú del teléfono, donde la cabecera ya no tiene sitio. Salen
   de aquí y no copiados a mano en los dos, porque son dos listas de las que
   una se olvidaría al añadir un idioma. */
export function themeSeg(): string {
  return `<div class="seg thseg">${
    ([['system', '◐', 'thSys'], ['light', '☀', 'thLight'], ['dark', '☾', 'thDark']] as const).map(
      ([k, glifo, lab]) => `<button data-th="${k}" title="${T(lab)}" aria-label="${T(lab)}"
        class="${ST.theme === k ? 'on' : ''}">${glifo}</button>`).join('')}</div>`;
}
export function langSeg(): string {
  return `<div class="seg langseg">${
    LANGS.map(l => `<button data-l="${l}" class="${LANG.cur === l ? 'on' : ''}">${l.toUpperCase()}</button>`)
      .join('')}</div>`;
}

const MODE_LAB: Record<Mode, I18nKey> = {
  model: 'modeModel', meas: 'modeMeas', comp: 'modeComp',
};
const MODE_TIP: Record<Mode, I18nKey> = {
  model: 'modeModelTip', meas: 'modeMeasTip', comp: 'modeCompTip',
};

/* ============================================================== armazón == */
export function renderShell(): void {
  $('#hd')!.innerHTML = `
   <div class="brand"><b>BARCOMP</b><span class="v">α</span><span class="sub">${T('sub')}</span></div>
   <div class="seg modes" style="margin-left:14px">
     ${MODES.map(m => `<button data-md="${m}" title="${T(MODE_TIP[m])}"
       class="${ST.mode === m ? 'on' : ''}">${T(MODE_LAB[m])}</button>`).join('')}</div>
   <div class="hspace"></div>
   <div class="menubar">
     ${MENUS.map(([k, lab]) => `<button class="mn ${ST.drawer === k ? 'on' : ''}"
       data-dr="${k}" aria-expanded="${ST.drawer === k}">${T(lab)}</button>`).join('')}
   </div>
   <!-- En el teléfono los cuatro menús no caben al lado de los modos, y tema e
        idioma tampoco: se van los tres a un cajón detrás de este botón. El CSS
        decide cuál de los dos se ve, la barra o el botón; los dos se pintan
        siempre para que cambiar de tamaño no tenga que reconstruir nada. -->
   <button class="mn burger ${ST.drawer === 'menu' ? 'on' : ''}" data-dr="menu"
     aria-expanded="${ST.drawer === 'menu'}" title="${esc(T('mnMenu'))}"
     aria-label="${esc(T('mnMenu'))}">☰</button>
   ${themeSeg()}
   ${langSeg()}`;

  /* los dos tiradores viven en el HTML estático: sus tooltips se ponen aquí,
     que es lo único que se vuelve a correr al cambiar de idioma */
  const grip = (id: string, k: I18nKey): void => { const el = $(id); if (el) el.title = T(k); };
  grip('#rtgrip', 'gripW');
  grip('#btgrip', 'gripH');

  $('#vptool')!.innerHTML = `
    <span class="tag">${T('view')}</span>
    ${['iso', 'top', 'front', 'side'].map(v =>
      `<button class="btn sm" data-v="${v}">${T(('v' + v[0].toUpperCase() + v.slice(1)) as I18nKey)}</button>`).join('')}
    <button class="btn sm" data-v="fit">${T('vFit')}</button>
    <button class="btn sm ${ST.solo ? 'pri' : ''}" data-a="solo"
      title="${T('soloTip')}">${T(ST.solo ? 'soloOff' : 'soloOn')}</button>
    <span class="tag" style="margin-left:6px">${T('exag')}</span>
    <input type="range" id="exag" min="0" max="120" step="1" value="${ST.view.exag}" style="width:80px">
    <span id="exagv" style="width:30px;text-align:right;color:var(--nominal)">${ST.view.exag}×</span>
    <span class="tag" style="margin-left:6px">${T('cmode')}</span>
    <div class="seg"><button data-cm="solid" class="${ST.view.cmode === 'solid' ? 'on' : ''}">${T('cSolid')}</button>
    <button data-cm="dev" class="${ST.view.cmode === 'dev' ? 'on' : ''}">${T('cDev')}</button></div>`;

  const tol = ST.model ? ST.model.tol.point : 1;
  const act = V(), ref = REF();
  $('#vplegend')!.innerHTML = `
    <div class="tag" style="margin-bottom:4px">${T('legend')}</div>
    <div class="row"><span class="dot" style="background:${act ? act.color : '#3FA9F5'}"></span>${esc(act ? act.name : '')}</div>
    ${ref && ref.id !== act.id ? `<div class="row"><span class="dot" style="background:${ref.color}"></span>${esc(ref.name)} · ${T('isRef')}</div>` : ''}
    <div class="row"><span class="dot" style="background:${ST.layers.meas.color}"></span>${T('lMeas')}</div>
    <div class="row"><span class="dot" style="background:${ST.layers.pred.color}"></span>${T('lPred')}</div>
    <div class="scalebar"><div class="tag">${T('devscale')}</div><div class="grad"></div>
      <div class="ends"><span>0</span><span>${fx(tol, 2)}</span><span>${fx(tol * 2, 2)} mm</span></div></div>`;

  $('#hint')!.textContent = T('hint');
  /* La clase del #app es la que reparte la pantalla: una rejilla por modo. */
  const app = $('#app');
  if (app) {
    app.className = 'm-' + ST.mode + (ST.solo ? ' solo' : '') + (ST.phone ? ' phone' : '');
  }

  /* Sub-pestañas solo donde hay más de una tabla que enseñar: en Medir y en
     Compensar la fila de pestañas sería una etiqueta de una sola opción. */
  const tabs = TABS_OF[ST.mode] || [];
  const bar = $('#tabs');
  if (bar) {
    bar.style.display = tabs.length > 1 ? '' : 'none';
    bar.innerHTML = tabs.map(t =>
      `<button data-t="${t}" class="${ST.tab === t ? 'on' : ''}">${T(t as I18nKey)}</button>`).join('');
  }
}
