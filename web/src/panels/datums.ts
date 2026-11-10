/* =========================================================================
   VARIOS PUNTOS DE COINCIDENCIA — la lista editable del anclaje 'datums'
   (esquema 3-2-1 de fixture). Ver engine/datums.ts para qué es cada cosa.

   Vive bajo los radios del anclaje, en el cajón Modelos, y solo se pinta con
   ese modo elegido. Cada punto es una tarjeta de dos líneas y no una fila de
   tabla: el cajón es estrecho y un punto lleva nueve datos (nombre, activo, tipo,
   índice, fracción, tres ejes, peso, residuo).

   Los eventos van por dos atributos nuevos y no por uno por campo:
     · `data-dd="<id>"` + `data-df="<campo>"` en cada control del punto; lo
       escucha `onDatum()` en app/events/change.ts;
     · `data-dtb="<acción>[:<id>[:<valor>]]"` en cada botón; lo escucha
       click.ts. Los botones de la lista no usan `data-a` para no mezclarse con
       el despachador general de acciones.
   El residuo sale de `datumResult()`, el MISMO ajuste que dibuja la escena y
   que coloca la pieza: lo escrito y lo pintado no pueden discrepar. ============ */
import { T } from '../i18n.ts';
import { ST, datumResult, datumRange } from '../state.ts';
import { piName } from '../pivotlabel.ts';
import * as E from '../engine.ts';
import { fx, esc, cls } from './fmt.ts';
import type { I18nKey } from './fmt.ts';

/** El nombre de cada índice según el tipo: P0..PE para un PI, B1..Bn para el
 *  arco del doblez, R1..Rn para la recta que PRECEDE a cada doblez y «cola» para
 *  la de salida. */
function idxLabel(at: E.DatumAt, i: number, n: number): string {
  if (at === 'pi') return piName(i, n);
  if (at === 'arc') return 'B' + (i + 1);
  return i === n - 1 ? T('dtTail') : 'R' + (i + 1);
}

const AXN = ['X', 'Y', 'Z'];

function card(d: E.Datum, res: E.DatumResid | undefined, tol: number): string {
  const n = datumRange(d.at);
  const attr = (k: string) => `data-dd="${esc(d.id)}" data-df="${k}"`;
  const opt = (v: string, lab: string, cur: boolean) =>
    `<option value="${v}" ${cur ? 'selected' : ''}>${esc(lab)}</option>`;
  const idx = [...Array(Math.max(n, 1))].map((_, i) =>
    opt(String(i), idxLabel(d.at, i, n), i === d.i)).join('');
  const fr = d.at === 'pi' ? '' : `
    <input type="number" step="any" min="0" max="1" class="dtf" ${attr('f')} value="${+d.f.toFixed(3)}"
      title="${esc(T('dtFrac'))}" aria-label="${esc(T('dtFrac'))}">
    ${d.at === 'arc' ? ([['0', 'dtEntry'], ['0.5', 'dtVertex'], ['1', 'dtExit']] as [string, I18nKey][])
      .map(([v, k]) => `<button class="btn sm dtq" data-dtb="f:${esc(d.id)}:${v}">${T(k)}</button>`).join('') : ''}`;
  const ax = [0, 1, 2].map(a => `<label class="dtax"><input type="checkbox" ${attr('ax' + a)}
      ${d.ax[a] ? 'checked' : ''}>${AXN[a]}</label>`).join('');
  let r = '<span class="v-dim">—</span>';
  if (res) {
    r = isFinite(res.n)
      ? `<b class="${cls(res.n, tol)}" title="${esc(T('dtRes'))}">${fx(res.n, 2)}</b>`
      : `<b class="v-bad" title="${esc(T('dtMissing'))}">n/d</b>`;
  }
  return `<div class="dtcard${d.on ? '' : ' off'}">
    <div class="dtl1">
      <input type="checkbox" ${attr('on')} ${d.on ? 'checked' : ''} title="${esc(T('dtOn'))}" aria-label="${esc(T('dtOn'))}">
      <input type="text" class="nm" ${attr('name')} value="${esc(d.name)}" maxlength="40" aria-label="${esc(T('dtName'))}">
      <select ${attr('at')} aria-label="${esc(T('dtAt'))}">
        ${opt('pi', T('dtPi'), d.at === 'pi')}${opt('arc', T('dtArc'), d.at === 'arc')}${opt('line', T('dtLine'), d.at === 'line')}
      </select>
      <select ${attr('i')} aria-label="${esc(T('dtIdx'))}">${idx}</select>
      <button class="xbtn" data-dtb="del:${esc(d.id)}" title="${esc(T('dtDel'))}" aria-label="${esc(T('dtDel'))}">✕</button>
    </div>
    <div class="dtl2">
      ${fr}${ax}
      <input type="number" step="any" min="0" class="dtw" ${attr('w')} value="${+d.w.toFixed(3)}"
        title="${esc(T('dtW'))}" aria-label="${esc(T('dtW'))}">
      <span class="dtr">${r}<span class="u"> mm</span></span>
    </div>
  </div>`;
}

export function datumsPane(): string {
  if (ST.anchor !== 'datums' || !ST.model) return '';
  const fit = datumResult();
  const tol = ST.model.tol.point;
  const rs = new Map((fit ? fit.resid : []).map(r => [r.id, r]));
  const cards = ST.datums.map(d => card(d, rs.get(d.id), tol)).join('');
  const any = ST.datums.some(d => d.on && d.ax.some(Boolean));
  const status = !fit || !any
    ? `<div class="hintline">${T('dtNone')}</div>`
    : `<div class="hintline dtstat" data-dtstat>${T('dtStatus').replace('{n}', String(fit.nCon)).replace('{f}', String(fit.free))}</div>
       <div class="hintline ${fit.free > 0 ? 'v-warn' : 'v-ok'}">${fit.free > 0
         ? T('dtFree').replace('{f}', String(fit.free)) : T('dtFixed')}</div>`;
  const hasPi = ST.datums.some(d => d.on && d.at === 'pi');
  return `<div class="dtpane" data-dtpane>
    ${cards || ''}
    <div class="row mt6">
      <button class="btn sm grow" data-dtb="add">${T('dtAdd')}</button>
      <button class="btn sm" data-dtb="321" title="${esc(T('dt321Tip'))}">${T('dt321')}</button>
      <button class="btn sm" data-dtb="fix" title="${esc(T('dtFromFixTip'))}">${T('dtFromFix')}</button>
      <button class="btn sm" data-dtb="clear">${T('dtClear')}</button>
    </div>
    ${status}
    ${hasPi ? `<div class="hintline">${T('dtPiNote')}</div>` : ''}
    <div class="hintline">${T('dtHint')}</div>
  </div>`;
}

/** El aviso de «desde fixture» sin nada de lo que sacar puntos. */
export const noFixtureMsg = (): string => T('dtNoFix');
