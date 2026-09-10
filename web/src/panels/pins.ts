/* =========================================================================
   PESTAÑA AMARRE — los pines laterales, el interruptor que decide si la barra
   está sujeta, y lo que eso le cuesta a la pieza.

   Un pedestal sostiene; un pin IMPIDE. Por eso esta pestaña no es la del
   fixture con dos columnas más: lo que se enseña aquí no es si la barra apoya,
   es cuánto se está deformando por no poder irse a donde la manda la tabla, y
   dónde. Ver engine/pins.ts para la física y para lo que este modelo NO es.

   El interruptor manda sobre todo lo demás: apagado, el programa se comporta
   exactamente como antes de que los pines existieran. Eso no es una promesa del
   comentario, hay una prueba que compara los PI uno a uno.
   ========================================================================= */
import * as E from '../engine.ts';
import { T } from '../i18n.ts';
import type { Model } from '../types.ts';
import { ST, placedPath, heldResult } from '../state.ts';
import { fx, esc, cls, nfield } from './fmt.ts';

/** Una fila de pin. Aparte, como `pedRow()`, porque con las columnas derivadas
 *  el bucle dentro del panel se pasa de las 60 líneas de la regla. */
function pinRow(M: Model, i: number, f: E.PinFit | null, sujeta: boolean): string {
  const p = ST.pins[i];
  const num = (k: 'x' | 'y' | 'h' | 'dia', fmt = '1') =>
    `<td>${nfield(fmt, `data-pn="${p.id}" data-k="${k}"`, p[k])}</td>`;
  /* Sin barra que mirar, las columnas derivadas dicen «—» y no «0»: un cero se
     lee como «tocando justo», que es lo contrario de «no se sabe». */
  const der = !f
    ? `<td class="v-dim" colspan="4">—</td>`
    : `<td class="v-dim">${fx(f.s, 0)}</td>
       <td class="v-dim">${fx(f.plan, 1)}</td>
       <td class="${cls(f.gap, Math.max(M.tol.point, ST.restraint.tol))}">${fx(f.gap, 2)}</td>
       <td class="${f.reach ? 'v-dim' : 'v-bad'}" title="${esc(T('pinReachTip'))}">${
         f.reach ? T('pinYes') : T('pinNo')}</td>`;
  return `<tr class="ped">
    <td><input type="checkbox" data-pnv="${p.id}" ${p.visible ? 'checked' : ''}></td>
    <td><input type="checkbox" data-pnh="${p.id}" ${p.hold ? 'checked' : ''}
      title="${esc(T('pinHoldTip'))}"></td>
    <td><input type="text" data-pn="${p.id}" data-k="name" value="${esc(p.name)}"
      style="min-width:64px"></td>
    ${num('x')}${num('y')}${num('h')}${num('dia', '1')}
    <td><select data-pns="${p.id}" title="${esc(T('pinSideTip'))}">
      <option value="0" ${!p.side ? 'selected' : ''}>${T('pinSideAuto')}</option>
      <option value="1" ${p.side > 0 ? 'selected' : ''}>+</option>
      <option value="-1" ${p.side < 0 ? 'selected' : ''}>−</option>
    </select></td>
    ${der}
    <td class="${sujeta ? 'v-ok' : 'v-dim'}">${sujeta ? T('pinHolding') : '—'}</td>
    <td><button class="xbtn" data-pnx="${p.id}" title="${T('del')}"
      aria-label="${esc(T('del'))}">✕</button></td></tr>`;
}

/** Lo que el amarre le está costando a la pieza: dónde cede, cuánto, y si en
 *  algún punto pasa del límite elástico.
 *
 *  Es la mitad que importa de esta pestaña. La tabla de pines dice dónde están
 *  los pines; esto dice qué le hacen a la barra, que es la pregunta. */
function costo(M: Model): string {
  const R = heldResult();
  if (!ST.restraint.on) return `<div class="hintline">${T('pinOffNote')}</div>`;
  if (!R.held.length) return `<div class="warnbox mt6">${T('pinNoneHold')}</div>`;
  const libre = E.fk(M).pis, sujeta = E.fk(R.model).pis;
  const punta = libre.length && sujeta.length
    ? libre[libre.length - 1].distanceTo(sujeta[sujeta.length - 1]) : 0;
  const peorK = R.kink.reduce((m, k, i) => (E.kinkOf(k) > E.kinkOf(R.kink[m]) ? i : m), 0);
  const sinCerrar = R.res.filter(v => Math.abs(v) > ST.restraint.tol).length;
  return `<div class="row mt6">
      <span class="chip">${T('pinHeldN').replace('{n}', String(R.held.length))}</span>
      <span class="chip ${punta > M.tol.point ? 'bad' : ''}"
        title="${esc(T('pinTipTip'))}">${T('pinTip')}: ${fx(punta, 2)} mm</span>
      <span class="chip">${T('pinWorstKink')}: B${peorK + 1} ${fx(E.kinkOf(R.kink[peorK]), 3)}°</span>
      <span class="chip ${R.worst >= 1 ? 'bad' : ''}" title="${esc(T('pinYieldTip'))}">${
        T('pinStress')}: ${fx(R.worst * 100, 0)}% ${T('pinOfYield')}</span>
      ${sinCerrar ? `<span class="chip bad" title="${esc(T('pinOpenTip'))}">${
        T('pinOpen').replace('{n}', String(sinCerrar))}</span>` : ''}
    </div>
    ${R.worst >= 1 ? `<div class="warnbox mt6">${T('pinYield')}</div>` : ''}
    <div class="tw mt6"><table class="marks"><thead><tr>
      <th>${T('nBend')}</th><th>${T('pinKink')}</th><th>${T('pinCurv')}</th>
      <th>${T('pinSigma')}</th><th>${T('pinOfYield')}</th></tr></thead><tbody>
      ${R.kink.map((k, i) => {
        const q = ST.mat.yield > 0 ? R.stress[i] / ST.mat.yield : 0;
        return `<tr class="${i === peorK ? 'sel' : ''}"><td>B${i + 1}</td>
          <td class="${cls(E.kinkOf(k), M.tol.angle)}">${fx(E.kinkOf(k), 3)}</td>
          <td class="v-dim">${fx(E.curvDeg(R.curv[i]) * 1000, 3)}</td>
          <td class="v-dim">${fx(R.stress[i], 1)}</td>
          <td class="${q >= 1 ? 'v-bad' : q >= .5 ? 'v-warn' : 'v-dim'}">${fx(q * 100, 0)}%</td></tr>`;
      }).join('')}
    </tbody></table></div>`;
}

export function panePins(M: Model): string {
  const path = ST.pins.length ? placedPath() : [];
  const fits = ST.pins.map(p => (path.length ? E.pinFit(path, M.section, p) : null));
  const R = heldResult();
  const rows = ST.pins.map((_, i) =>
    pinRow(M, i, fits[i], ST.restraint.on && R.held.includes(i))).join('');
  const on = ST.restraint.on;
  return `<div class="pane on"><div class="grp">
    <div class="eyebrow">${T('pins')}<span class="n">${ST.pins.length}</span></div><div class="body">
    <div class="row">
      <label class="layer" title="${esc(T('pinOnTip'))}">
        <input type="checkbox" data-rs="on" ${on ? 'checked' : ''}>
        <span class="nm"><b>${T('pinOn')}</b></span></label>
      <label class="layer" title="${esc(T('pinRotTip'))}">
        <input type="checkbox" data-rs="doRot" ${ST.restraint.doRot ? 'checked' : ''}>
        <span class="nm">${T('pinDoRot')}</span></label>
    </div>
    <div class="fgrid pair mt6">
      <label title="${esc(T('pinTolTip'))}">${T('pinTol')} (mm)</label>
      ${nfield('.01', 'data-rs="tol"', ST.restraint.tol)}
      <label title="${esc(T('pinDampTip'))}">${T('pinDamp')}</label>
      ${nfield('.05', 'data-rs="damp"', ST.restraint.damp)}
      <label title="${esc(T('matTip'))}">${T('matE')} (MPa)</label>
      ${nfield('1000', 'data-mt="E"', ST.mat.E)}
      <label title="${esc(T('matTip'))}">${T('matYield')} (MPa)</label>
      ${nfield('10', 'data-mt="yield"', ST.mat.yield)}
    </div>
    <div class="hintline">${T('matProv')}</div>
    ${ST.pins.length ? `<div class="tw mt6"><table class="marks"><thead><tr>
      <th></th><th title="${esc(T('pinHoldTip'))}">${T('pinHold')}</th><th>${T('name')}</th>
      <th>${T('x')}</th><th>${T('y')}</th><th>${T('pedH')}</th><th>${T('pinDia')}</th>
      <th title="${esc(T('pinSideTip'))}">${T('pinSide')}</th>
      <th>${T('pedS')}</th><th>${T('pedPlan')}</th><th>${T('pinGap')}</th>
      <th>${T('pinReach')}</th><th>${T('pinState')}</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`
    : `<div class="hintline">${T('pinEmpty')}</div>`}
    <div class="row mt6"><button class="btn sm" data-a="addpin">${T('addPin')}</button>
      <button class="btn sm" data-a="seedpin">${T('seedPin')}</button>
      <span class="grow"></span>
      ${ST.pins.length ? `<button class="btn sm" data-a="clearpin">${T('clearPin')}</button>` : ''}
    </div>
    ${costo(M)}
    <div class="hintline">${T('pinNote')}</div>
  </div></div></div>`;
}
