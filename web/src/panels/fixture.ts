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
import { ST, shownPath, shownModel, heldResult, heldOn, refHeldOn } from '../state.ts';
import { fx, esc, cls, nfield, reacCell, th } from './fmt.ts';

/** El rótulo de cada campo tecleable, que es también el de su columna. */
const PED_LBL = { x: 'x', y: 'y', h: 'pedH', pad: 'pedPad', tilt: 'pedTilt' } as const;

/** Una fila. Sale aparte porque la de un pedestal tiene trece columnas y
 *  `paneFixture` se pasaba de las 60 líneas de la regla con el bucle dentro. */
function pedRow(M: Model, i: number, f: PedFit | null, vano: number, flecha: number,
                reac: number, ciego: boolean): string {
  const p = ST.fixture[i];
  /* Cada campo se anuncia con su fila Y su columna: «P3 · Alto». Con solo la
     columna, siete campos seguidos dicen «Alto» y no se sabe de qué pedestal. */
  const nombre = (col: string) => `aria-label="${esc(`${p.name} · ${col}`)}"`;
  const num = (k: 'x' | 'y' | 'h' | 'pad' | 'tilt', fmt = '1') =>
    `<td>${nfield(fmt, `data-pd="${p.id}" data-k="${k}" ${nombre(T(PED_LBL[k]))}`, p[k])}</td>`;
  const cabeza = `<tr class="ped"><td><input type="checkbox" data-pv="${p.id}" ${p.visible ? 'checked' : ''}
      ${nombre(T('colVis'))}></td>
    <td><input type="text" data-pd="${p.id}" data-k="name" value="${esc(p.name)}" style="min-width:64px"
      aria-label="${esc(`${T('fixture')} ${i + 1} · ${T('name')}`)}"></td>
    ${num('x')}${num('y')}${num('h')}${num('pad', '0')}${num('tilt', '2')}`;
  const cola = `<td><button class="xbtn" data-px="${p.id}" title="${T('del')}"
      ${nombre(T('del'))}>✕</button></td></tr>`;
  /* Sin barra encima, las columnas derivadas no dicen «0»: dicen «—». Un cero
     se lee como «ajustado» y es justo lo contrario. */
  if (!f || !f.over) {
    return `${cabeza}
      <td class="v-bad" colspan="5" title="${esc(T('pedOffTip'))}">${T('pedOff')}</td>
      <td class="v-dim">${isFinite(vano) ? fx(vano, 0) : '—'}</td>
      <td class="v-dim">—</td>
      ${ST.load.on ? '<td class="v-dim">—</td>' : ''}
      ${cola}`;
  }
  return `${cabeza}
    <td class="v-dim">${fx(f.want, 2)}</td>
    <td class="${cls(f.lift, M.tol.point)}" title="${esc(T('pedLiftTip').replace('{v}', fx(f.lift, 2)))}">${fx(f.dTilt, 2)}</td>
    <td class="v-dim">${fx(f.s, 0)}</td>
    <td class="v-dim">${fx(f.plan, 1)}</td>
    <td class="${cls(Math.abs(f.gap), M.tol.point)}">${fx(f.gap, 2)}</td>
    <td class="v-dim">${isFinite(vano) ? fx(vano, 0) : '—'}</td>
    <td class="${isFinite(flecha) ? cls(flecha, M.tol.point) : 'v-dim'}"
      title="${esc(T('sagTip'))}">${isFinite(flecha) ? fx(flecha, 3) : '—'}</td>
    ${ST.load.on ? reacCell(reac, ciego) : ''}
    ${cola}`;
}

/** Los encabezados, con la unidad de cada columna. La tabla mezcla milímetros,
 *  grados y newton, y la explicación vivía en un párrafo al pie: junto a la
 *  máquina se leían grados donde había milímetros. */
const pedHead = (): string => `<tr>
  ${th('', '', T('colVis'))}${th(T('name'))}
  ${th(T('x'), 'mm', T('xyTip'))}${th(T('y'), 'mm', T('xyTip'))}
  ${th(T('pedH'), 'mm', T('pedHTip'))}${th(T('pedPad'), 'mm', T('pedPadTip'))}
  ${th(T('pedTilt'), '°', T('pedTiltTip'))}${th(T('pedWant'), '°', T('pedWantTip'))}
  ${th(T('pedD'), '°', T('pedDTip'))}${th(T('pedS'), 'mm', T('pedSTip'))}
  ${th(T('pedPlan'), 'mm', T('pedPlanTip'))}${th(T('pedGap'), 'mm', T('pedGapTip'))}
  ${th(T('pedSpan'), 'mm', T('pedSpanTip'))}${th(T('sag'), 'mm', T('sagTip'))}
  ${ST.load.on ? th(T('loadN'), 'N', T('loadNTip')) : ''}
  ${th('', '', T('del'))}</tr>`;

export function paneFixture(M: Model): string {
  /* La MISMA trayectoria colocada que usa la escena: si la tabla calculara la
     suya, un cambio de anclaje las separaría sin que nada avisara.
     Y la de la pieza CONTRA LA QUE SE MIDE: lo que esta tabla contesta es qué
     está haciendo cada pedestal contra la barra que hay encima, y con el amarre
     puesto esa barra es la sujeta. Quien elige es el interruptor «Ver» de la
     pestaña Amarre — aquí solo se obedece. */
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
  /* La columna «Reacción» aparece y desaparece por un interruptor de OTRA
     pestaña, y esta no lo mencionaba en ningún sitio: una columna que va y viene
     sin que nada en pantalla lo explique se lee como un fallo. Se dice con
     palabras, y con el peso delante, que es lo que esa columna reparte. */
  const peso = ST.load.on ? T('fixLoadOn').replace('{w}', fx(R.weight, 1)) : T('fixLoadOff');

  return `<div class="pane on"><div class="grp">
    <div class="eyebrow">${T('fixture')}<span class="n">${ST.fixture.length}</span></div><div class="body">
    ${heldOn() && !refHeldOn() ? `<div role="alert" class="warnbox mt6">${T('pinMeasFree')}</div>` : ''}
    ${ST.fixture.length ? `<div class="tw"><table class="marks"><thead>${pedHead()}</thead>
      <tbody>${rows}</tbody></table></div>
    <div class="row mt6">
      <span class="chip ${isFinite(peor) ? '' : 'dim'}">${T('pedWorst')}: ${isFinite(peor) ? fx(peor, 0) + ' mm' : '—'}</span>
      ${sinApoyo ? `<span class="chip bad">${T('pedOffN').replace('{n}', String(sinApoyo))}</span>` : ''}
      ${sag.noMat
        ? `<span class="chip dim" title="${esc(T('sagNoMatTip'))}">${T('sagNoMat')}</span>`
        : `<span class="chip ${sag.worst > M.tol.point ? 'bad' : ''}" title="${esc(T('sagTip'))}">${
            T('sag')}: ${fx(sag.worst, 3)} mm</span>`}
    </div>
    ${!sag.noMat && sag.worst > M.tol.point ? `<div role="alert" class="warnbox mt6">${T('sagBad')}</div>` : ''}
    <div class="hintline">${T('sagNote')}</div>
    <div class="hintline">${peso}</div>` : `<div class="emptynote">${T('fixEmpty')}</div>`}
    <div class="row mt6"><button class="btn sm" data-a="addped">${T('addPed')}</button>
      <button class="btn sm" data-a="seedped">${T('seedPed').replace('{n}', String(E.PEDESTALS_DEFAULT))}</button>
      <span class="grow"></span>
      ${ST.fixture.length ? `<button class="btn sm" data-a="clearped">${T('clearPed')}</button>` : ''}
    </div>
    <div class="hintline">${T('fixNote')}</div>
  </div></div></div>`;
}
