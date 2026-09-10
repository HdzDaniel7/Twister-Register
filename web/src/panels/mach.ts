/* =========================================================================
   PESTAÑA MÁQUINA — el perfil con el que el comando sale a la dobladora, y la
   vista previa exacta de lo que se va a escribir.

   Lo que se enseña aquí no es una maqueta: `machineTable()` es la MISMA
   función que escribe el archivo, así que lo que se lee en la vista previa es
   carácter por carácter lo que va a leer la máquina. Una vista previa
   aproximada no sirve para lo único que hay que comprobar antes de doblar una
   barra: las unidades y los signos.

   El formato real está pedido (B.1/B.2) y no ha llegado. Ver engine/machine.ts
   para por qué se hace configurable en vez de adivinarlo.
   ========================================================================= */
import * as E from '../engine.ts';
import { T } from '../i18n.ts';
import type { Model } from '../types.ts';
import type { MachineCol } from '../engine.ts';
import { ST, commandModel } from '../state.ts';
import { esc, nfield } from './fmt.ts';
import type { I18nKey } from './fmt.ts';

/** El rótulo de cada columna. Los que ya existen se reusan: son las mismas
 *  magnitudes que la tabla de dobleces y llamarlas de otra manera aquí sería
 *  inventar un segundo vocabulario para lo mismo. */
const COL_LAB: Record<MachineCol, I18nKey> = {
  n: 'nBend', feed: 'feed', straight: 'straight', rot: 'rot', axis: 'machAxis',
  angle: 'ang', radius: 'rad', twist: 'twist', twistLen: 'twlen',
  arc: 'arcL', cum: 'cumL',
};

const sel = (attr: string, opts: [string, string][], cur: string): string =>
  `<select ${attr}>${opts.map(([v, lab]) =>
    `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>`;

/** Las once casillas de columna, en el orden fijo de MACHINE_COLS. El orden de
 *  las columnas del archivo es el de esta lista, no el orden en que se marcan:
 *  reordenar a mano pide arrastrar, y arrastrar en un panel que se reconstruye
 *  entero es otro problema. Si la máquina pide otro orden, se cambia aquí. */
function colBoxes(): string {
  return E.MACHINE_COLS.map(c => `<label class="layer">
    <input type="checkbox" data-mc="${c}" ${ST.mach.cols.includes(c) ? 'checked' : ''}>
    <span class="nm">${T(COL_LAB[c])}</span></label>`).join('');
}

function controls(): string {
  const M = ST.mach;
  return `<div class="fgrid pair">
    <label>${T('machSep')}</label>
    ${sel('data-mf="sep"', [[',', ', (coma)'], [';', '; (punto y coma)'], ['\t', 'TAB']], M.sep)}
    <label>${T('machDec')}</label>
    ${nfield('1', 'data-mf="decimals" min="0" max="6"', M.decimals)}
    <label>${T('machLen')}</label>
    ${sel('data-mf="lenUnit"', [['mm', 'mm'], ['in', 'in']], M.lenUnit)}
    <label>${T('machAng')}</label>
    ${sel('data-mf="angUnit"', [['deg', '°'], ['rad', 'rad']], M.angUnit)}
    <label title="${esc(T('machSignTip'))}">${T('machSignA')}</label>
    ${sel('data-mf="signAngle"', [['1', '+'], ['-1', '−']], String(M.signAngle))}
    <label title="${esc(T('machSignTip'))}">${T('machSignR')}</label>
    ${sel('data-mf="signRot"', [['1', '+'], ['-1', '−']], String(M.signRot))}
    <label title="${esc(T('machRotTip'))}">${T('machRot')}</label>
    ${sel('data-mf="rotMode"', [['delta', T('machRotDelta')], ['abs', T('machRotAbs')]], M.rotMode)}
  </div>
  <div class="row mt6">
    <label class="layer"><input type="checkbox" data-mf="header" ${M.header ? 'checked' : ''}>
      <span class="nm">${T('machHead')}</span></label>
    <label class="layer" title="${esc(T('machCrlfTip'))}">
      <input type="checkbox" data-mf="crlf" ${M.crlf ? 'checked' : ''}>
      <span class="nm">${T('machCrlf')}</span></label>
    <label class="layer" title="${esc(T('machTailTip'))}">
      <input type="checkbox" data-mf="tailRow" ${M.tailRow ? 'checked' : ''}>
      <span class="nm">${T('machTail')}</span></label>
  </div>`;
}

/** La vista previa, con la misma función que escribe el archivo. Se enseñan
 *  las primeras filas y se dice cuántas quedan: el punto es comprobar unidades
 *  y signos, y para eso sobran tres estaciones. */
function preview(): string {
  const tabla = E.machineTable(commandModel(), ST.mach);
  const head = ST.mach.header ? tabla[0] : null;
  const cuerpo = ST.mach.header ? tabla.slice(1) : tabla;
  const vistas = cuerpo.slice(0, 4);
  const restan = cuerpo.length - vistas.length;
  return `<div class="tw"><table class="marks"><thead><tr>
      ${(head || ST.mach.cols).map(h => `<th>${esc(h)}</th>`).join('')}
    </tr></thead><tbody>
      ${vistas.map(r => `<tr>${r.map(c => `<td class="v-dim">${esc(c)}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
    ${restan > 0 ? `<div class="hintline">${T('machMore').replace('{n}', String(restan))}</div>` : ''}`;
}

export function paneMach(_M: Model): string {
  /* Un ajuste manual escrito y sin aplicar NO está en `ST.command`, así que no
     saldría en el archivo. Decirlo aquí es barato; descubrirlo con la barra
     doblada, no. */
  const sucio = ST.tweak.some(t => t.angle || t.rot || t.feed);
  return `<div class="pane on"><div class="grp">
    <div class="eyebrow">${T('machTitle')}</div><div class="body">
    <div class="eyebrow" style="padding-left:0">${T('machCols')}</div>
    <div class="row wrap">${colBoxes()}</div>
    ${controls()}
    <div class="eyebrow mt10" style="padding-left:0">${T('machPrev')}</div>
    ${preview()}
    ${sucio ? `<div class="warnbox mt6">${T('machDirty')}</div>` : ''}
    <div class="row mt6">
      <button class="btn pri sm" data-a="expcmd">${T('machExport')}</button>
      <span class="grow"></span>
      <button class="btn sm" data-a="machdef">${T('limReset')}</button>
    </div>
    <div class="hintline">${T('machNote')}</div>
  </div></div></div>`;
}
