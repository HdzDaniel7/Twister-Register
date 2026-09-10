/* =========================================================================
   BARRA DE ESTADO — longitud total, número de dobleces, anclaje, desviación
   máxima y el chip ok/bad del dataset activo.
   ========================================================================= */
import * as E from '../engine.ts';
import { T } from '../i18n.ts';
import { ST, activeDataset, activeShift, heldResult, heldOn } from '../state.ts';
import { $, fx, cls, esc } from './fmt.ts';

/* ---------------------------------------------------------------- versión --
   El sello lo escribe build.mjs en <script id="ver">. Se lee UNA vez: no
   cambia durante la sesión. En desarrollo (src/ servido sin build) no existe,
   y entonces se dice «dev» en vez de mentir con un SHA inventado.            */
const BUILD: { sha: string; fecha: string; sucio: boolean } = (() => {
  const fallback = { sha: 'dev', fecha: '', sucio: false };
  try {
    const raw = document.getElementById('ver')?.textContent?.trim();
    if (!raw || raw.startsWith('/*')) return fallback;
    const v = JSON.parse(raw);
    return { sha: String(v.sha ?? 'dev'), fecha: String(v.fecha ?? ''), sucio: !!v.sucio };
  } catch {
    return fallback;
  }
})();

/** Qué copia del programa está corriendo. Con una copia en el taller y otra en
 *  Pages es la única forma de saber qué versión produjo un número. */
export const buildTag = (): string => BUILD.sha + (BUILD.sucio ? '+sucio' : '');

/** El amarre, si está puesto. En la barra de estado y no solo en su pestaña
 *  porque cambia LO QUE SE ESTÁ MIRANDO: con los pines sujetando, la pieza del
 *  3D ya no es la que describe la tabla. Nadie debería tener que acordarse de
 *  eso — y menos delante de una barra de aluminio y una dobladora.
 *
 *  Lleva el peor esfuerzo en el mismo chip: el número que decide si la pieza
 *  vuelve al soltarla o se queda deformada. */
function held(): string {
  if (!heldOn()) return '';
  const R = heldResult();
  const malo = R.worst >= 1;
  return `<div class="c"><span class="chip ${malo ? 'bad' : ''}"
    title="${esc(T('pinOnTip'))}">${T('pinOn')} · ${R.held.length} · ${
    fx(R.worst * 100, 0)}% ${T('pinOfYield')}</span></div>`;
}

/* ============================================================ barra de estado */
export function renderStatus(): void {
  const M = ST.model!, D = activeDataset();
  const path = E.buildPath(M);
  const anchorLab = { start: T('aStart'), end: T('aEnd'), best: T('aBest') }[ST.anchor];
  const shift = activeShift();
  $('#st')!.innerHTML = `
   <div class="c">${T('stLen')} <b>${fx(path.total, 1)} mm</b></div>
   <div class="c">${T('stBends')} <b>${M.bends.length}</b></div>
   <div class="c">${T('anchor')} <b>${anchorLab}</b></div>
   <div class="c">${T('dTip')} <b class="${shift > .01 ? '' : 'v-dim'}">${fx(shift, 2)} mm</b></div>
   <div class="c">${T('stDatum')} <b>${ST.datum === 'start' ? T('dStart') : T('dBest')}</b></div>
   <div class="c">${T('stMax')} <b class="${D ? cls(D.dev!.maxA, M.tol.angle) : ''}">${D ? fx(D.dev!.maxA, 3) + ' °' : '—'}</b></div>
   <div class="c">${T('stUnits')} <b>mm / °</b></div>
   ${held()}
   <div class="c">${D ? `<span class="chip ${D.dev!.out ? 'bad' : 'ok'}">${D.dev!.out ? T('bad') : T('ok')}</span>` : ''}</div>
   <div class="c ver${BUILD.sucio ? ' v-bad' : ''}" title="${esc(T('stVerTip') + (BUILD.fecha ? ' — ' + BUILD.fecha : ''))}">${T('stVer')} <b>${esc(buildTag())}</b></div>`;
}
