/* =========================================================================
   PESTAÑA FIXTURE — los pedestales sobre los que se apoya la barra, y lo que
   la pieza dice de cada uno.

   Se teclean las cuatro cifras que alguien mide en el taller con un flexómetro
   —dónde está el pie, cuánto sube, cuánto largo tiene la cuna y con qué
   inclinación está puesta— y el resto son columnas de LECTURA que salen del
   modelo. Ver engine/fixture.ts para la geometría y para por qué importa.
   ========================================================================= */
import * as E from '../engine.ts';
import { T } from '../i18n.ts';
import type { Model } from '../types.ts';
import type { PedFit } from '../engine.ts';
import { ST, shownPath, shownModel, heldResult } from '../state.ts';
import { fx, esc, cls, nfield, reacCell } from './fmt.ts';

/** Una fila. Sale aparte porque la de un pedestal tiene trece columnas y
 *  `paneFixture` se pasaba de las 60 líneas de la regla con el bucle dentro. */
function pedRow(M: Model, i: number, f: PedFit | null, vano: number, flecha: number,
                reac: number, ciego: boolean): string {
  const p = ST.fixture[i];
  const num = (k: 'x' | 'y' | 'h' | 'pad' | 'tilt', fmt = '1') =>
    `<td>${nfield(fmt, `data-pd="${p.id}" data-k="${k}"`, p[k])}</td>`;
  /* Sin barra encima, las columnas derivadas no dicen «0»: dicen «—». Un cero
     se lee como «ajustado» y es justo lo contrario. */
  if (!f || !f.over) {
    return `<tr class="ped"><td><input type="checkbox" data-pv="${p.id}" ${p.visible ? 'checked' : ''}></td>
      <td><input type="text" data-pd="${p.id}" data-k="name" value="${esc(p.name)}" style="min-width:64px"></td>
      ${num('x')}${num('y')}${num('h')}${num('pad', '0')}${num('tilt', '2')}
      <td class="v-bad" colspan="5" title="${esc(T('pedOffTip'))}">${T('pedOff')}</td>
      <td class="v-dim">${isFinite(vano) ? fx(vano, 0) : '—'}</td>
      <td class="v-dim">—</td>
      ${ST.load.on ? '<td class="v-dim">—</td>' : ''}
      <td><button class="xbtn" data-px="${p.id}" title="${T('del')}"
        aria-label="${esc(T('del'))}">✕</button></td></tr>`;
  }
  return `<tr class="ped"><td><input type="checkbox" data-pv="${p.id}" ${p.visible ? 'checked' : ''}></td>
    <td><input type="text" data-pd="${p.id}" data-k="name" value="${esc(p.name)}" style="min-width:64px"></td>
    ${num('x')}${num('y')}${num('h')}${num('pad', '0')}${num('tilt', '2')}
    <td class="v-dim">${fx(f.want, 2)}</td>
    <td class="${cls(f.lift, M.tol.point)}" title="${esc(T('pedLiftTip').replace('{v}', fx(f.lift, 2)))}">${fx(f.dTilt, 2)}</td>
    <td class="v-dim">${fx(f.s, 0)}</td>
    <td class="v-dim">${fx(f.plan, 1)}</td>
    <td class="${cls(Math.abs(f.gap), M.tol.point)}">${fx(f.gap, 2)}</td>
    <td class="v-dim">${isFinite(vano) ? fx(vano, 0) : '—'}</td>
    <td class="${isFinite(flecha) ? cls(flecha, M.tol.point) : 'v-dim'}"
      title="${esc(T('sagTip'))}">${isFinite(flecha) ? fx(flecha, 3) : '—'}</td>
    ${ST.load.on ? reacCell(reac, ciego) : ''}
    <td><button class="xbtn" data-px="${p.id}" title="${T('del')}"
      aria-label="${esc(T('del'))}">✕</button></td></tr>`;
}

export function paneFixture(M: Model): string {
  /* La MISMA trayectoria colocada que usa la escena: si la tabla calculara la
     suya, un cambio de anclaje las separaría sin que nada avisara.
     Y la de la pieza QUE HAY —la sujeta, si algún interruptor está puesto— y no
     la libre: lo que esta tabla contesta es qué está haciendo cada pedestal
     contra la barra que se ve, no contra la que habría sin fixture. Para leer
     la libre se apagan los interruptores, igual que con «Se movió». */
  const path = ST.fixture.length ? shownPath() : [];
  const fits = ST.fixture.map(p => E.pedestalFit(path, M.section, p));
  const vanos = E.pedestalSpans(fits);
  /* La flecha por gravedad de cada tramo (M6). Se calcula con los pedestales
     que de verdad apoyan, no con los que hay en la lista, y sobre la misma
     pieza que la columna de la reacción de al lado: mientras una mirara la libre
     y la otra la sujeta, las dos columnas podían contradecirse —una decía que el
     pedestal apoya y la otra daba 0.0 N— y se pintaban juntas. */
  const SM = shownModel();
  const sag = E.gravitySag(SM, path, M.section, ST.fixture, ST.mat);
  const flechas = E.sagByPedestal(sag, path, M.section, ST.fixture);
  /* Con la pieza cargada, cada pedestal lleva una parte del peso: es la
     columna que dice cuáles están trabajando y cuáles solo están puestos. Con
     la carga quitada no hay fuerzas y la columna ni aparece. */
  const R = heldResult();
  const rows = ST.fixture.map((_, i) =>
    pedRow(M, i, fits[i], vanos[i], flechas[i], R.pedN[i] || 0, !!R.pedBlind[i])).join('');
  /* El vano más largo es el número que decide la flecha, así que va arriba y
     no escondido en una columna: es lo único de esta tabla que se mira sin
     tener que leerla entera. */
  const luz = vanos.filter(isFinite);
  const peor = luz.length ? Math.max(...luz) : NaN;
  const sinApoyo = fits.filter(f => !f || !f.over).length;

  return `<div class="pane on"><div class="grp">
    <div class="eyebrow">${T('fixture')}<span class="n">${ST.fixture.length}</span></div><div class="body">
    ${ST.fixture.length ? `<div class="tw"><table class="marks"><thead><tr>
      <th></th><th>${T('name')}</th><th>${T('x')}</th><th>${T('y')}</th>
      <th>${T('pedH')}</th><th>${T('pedPad')}</th><th>${T('pedTilt')}</th>
      <th>${T('pedWant')}</th><th>Δ</th><th>${T('pedS')}</th><th>${T('pedPlan')}</th>
      <th>${T('pedGap')}</th><th>${T('pedSpan')}</th>
      <th title="${esc(T('sagTip'))}">${T('sag')}</th>
      ${ST.load.on ? `<th title="${esc(T('loadNTip'))}">${T('loadN')}</th>` : ''}
      <th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="row mt6">
      <span class="chip ${isFinite(peor) ? '' : 'dim'}">${T('pedWorst')}: ${isFinite(peor) ? fx(peor, 0) + ' mm' : '—'}</span>
      ${sinApoyo ? `<span class="chip bad">${T('pedOffN').replace('{n}', String(sinApoyo))}</span>` : ''}
      ${sag.noMat
        ? `<span class="chip dim" title="${esc(T('sagNoMatTip'))}">${T('sagNoMat')}</span>`
        : `<span class="chip ${sag.worst > M.tol.point ? 'bad' : ''}" title="${esc(T('sagTip'))}">${
            T('sag')}: ${fx(sag.worst, 3)} mm</span>`}
    </div>
    ${!sag.noMat && sag.worst > M.tol.point ? `<div class="warnbox mt6">${T('sagBad')}</div>` : ''}
    <div class="hintline">${T('sagNote')}</div>` : `<div class="hintline">${T('fixEmpty')}</div>`}
    <div class="row mt6"><button class="btn sm" data-a="addped">${T('addPed')}</button>
      <button class="btn sm" data-a="seedped">${T('seedPed').replace('{n}', String(E.PEDESTALS_DEFAULT))}</button>
      <span class="grow"></span>
      ${ST.fixture.length ? `<button class="btn sm" data-a="clearped">${T('clearPed')}</button>` : ''}
    </div>
    <div class="hintline">${T('fixNote')}</div>
  </div></div></div>`;
}
