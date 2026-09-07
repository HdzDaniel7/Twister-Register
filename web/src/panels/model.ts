/* =========================================================================
   PESTAÑA MODELO — la tabla de dobleces con sus columnas editables y las Δ,
   la cabecera de sección/tolerancias, y el pie con la recta de salida y la
   longitud desarrollada.
   ========================================================================= */
import * as E from '../engine.ts';
import { T } from '../i18n.ts';
import type { DeltaKey, Model } from '../types.ts';
import { ST, V } from '../state.ts';
import { fx, esc, nfield, oriTag, angOut } from './fmt.ts';

/* --- pestaña MODELO ----------------------------------------------------- */
export function paneModel(M: Model): string {
  const v = V();
  E.syncDeltas(v);
  /* La RECTA es lo que se teclea y va sobre la base, como el resto de columnas
     editables. El AVANCE es de solo lectura y se lee del modelo efectivo: es la
     consecuencia de la recta más lo que el doblez le come por los dos lados. */
  const base = v.base.bends, ori = E.orientations(M);
  /* El eje de doblado ABSOLUTO tras cada giro. La columna «Rodado» dice cuánto
     GIRA el eje, no dónde queda, así que una fila de ceros no significa «eje a
     cero» sino «no lo muevas»: la celda lleva el resultado en su tooltip. */
  const ejes = E.axisAngles(M);
  const LEN = E.rowLengths(M), BASE = E.rowLengths(v.base);
  /* la cabecera del pie ocupa las 10 columnas de parámetros; la recta de salida
     va bajo L y la longitud desarrollada bajo Σ L */
  const num = (attr: string, i: number, k: DeltaKey, val: number, step: string): string =>
    nfield(step, `data-${attr}="${i}" data-k="${k}"`, val);
  /* un Δ en cero se apaga: la columna solo debe cantar cuando hay corrección */
  const dnum = (i: number, k: DeltaKey, step: string): string => {
    const d = v.deltas[i][k];
    /* el Δ del ángulo se enseña con el mismo signo que su columna */
    return nfield(step, `class="${d ? '' : 'z'}" data-bd="${i}" data-k="${k}"`,
                  k === 'angle' ? angOut(d) : d);
  };

  const rows = M.bends.map((b, i) => {
    const span = E.twistSpanOf(M, i);
    const over = (b.twist || 0) && (b.twistLen || 0) > span;
    const hasD = E.DELTA_KEYS.some(k => v.deltas[i][k]);
    const bb = base[i];
    return `<tr class="clk ${i === ST.sel ? 'sel' : ''} ${hasD ? 'hasd' : ''}" data-r="${i}">
      <td>B${i + 1}</td><td>${oriTag(ori[i])}</td>
      <td>${nfield('.5', `data-st="${i}" class="${BASE[i].straight < 25 ? 'v-bad' : ''}"`,
                   BASE[i].straight)}</td>
      <td class="dcol">${dnum(i, 'feed', '.1')}</td>
      <td>${nfield('.1', `data-b="${i}" data-k="rot"
        title="${T('rotAxisTip').replace('%e', fx(ejes[i], 1))}"`, bb.rot)}</td>
      <td class="dcol">${dnum(i, 'rot', '.1')}</td>
      <td>${num('b', i, 'angle', angOut(bb.angle), '.1')}</td>
      <td class="dcol">${dnum(i, 'angle', '.1')}</td>
      <td>${num('b', i, 'radius', bb.radius, '.5')}</td>
      <td>${num('b', i, 'twist', bb.twist, '.1')}</td>
      <td>${nfield('5', `min="0" class="${over ? 'v-warn' : ''}" data-b="${i}"
        data-k="twistLen" title="0 = ${fx(span, 1)} mm"`, bb.twistLen)}</td>
      <td class="v-dim" data-cell="arc">${fx(LEN[i].arc, 2)}</td>
      <td data-cell="cum">${fx(LEN[i].cum, 2)}</td>
      </tr>`;
  }).join('');

  const d = T('dcol');
  /* la tabla ocupa todo el ancho, así que la cabecera del modelo va en banda
     horizontal: estirada a pantalla completa dejaba la tabla fuera de vista */
  return `<div class="pane on"><div class="grp"><div class="body mhead">
    <div class="mcol nm"><div class="eyebrow">${T('model')}</div>
      <input type="text" data-m="name" value="${esc(M.name)}"></div>
    <div class="mcol"><div class="eyebrow">${T('section')}</div>
      <div class="fgrid pair"><label>${T('width')} (mm)</label>${nfield('.1', 'data-s="width"', M.section.width)}
      <label>${T('thick')} (mm)</label>${nfield('.1', 'data-s="thickness"', M.section.thickness)}
      <label>${T('chamfer')} (mm)</label>${nfield('.1', 'data-s="chamfer"', M.section.chamfer)}
      <label>${T('endlen')} (mm)</label>${nfield('.5', 'data-s="endLen"', M.section.endLen)}
      <label>${T('tail')} (mm)</label>${nfield('.5', 'data-m="tail"', v.base.tail)}</div></div>
    <div class="mcol"><div class="eyebrow">${T('tol')}</div>
      <div class="fgrid pair"><label>${T('tolA')} (°)</label>${nfield('.05', 'data-t="angle"', M.tol.angle)}
      <label>${T('tolR')} (°)</label>${nfield('.05', 'data-t="rot"', M.tol.rot)}
      <label>${T('tolF')} (mm)</label>${nfield('.05', 'data-t="feed"', M.tol.feed)}
      <label>${T('tolP')} (mm)</label>${nfield('.05', 'data-t="point"', M.tol.point)}</div></div>
  </div></div>
  <div class="grp"><div class="eyebrow">${T('bends')}<span class="n">${M.bends.length}</span></div><div class="body">
    <div class="tw"><table class="lra"><thead><tr>
      <th>${T('nBend')}</th><th>${T('ori')}</th>
      <th>${T('straight')}</th><th class="dcol">${d}</th>
      <th title="${T('rotHeadTip')}">${T('rot')}</th><th class="dcol">${d}</th>
      <th>${T('ang')}</th><th class="dcol">${d}</th>
      <th>${T('rad')}</th><th>${T('twist')}</th><th>${T('twlen')}</th>
      <th>${T('arcL')}</th><th>${T('cumL')}</th>
      </tr></thead><tbody>${rows}</tbody>
      <tfoot><tr class="foot"><td>${T('tailRow')}</td><td colspan="10"></td>
        <td class="v-dim" data-cell="tstr">${fx(E.tailStraight(M), 2)}</td>
        <td data-cell="dev">${fx(E.developedLength(M), 2)}</td></tr></tfoot>
      </table></div>
    <div class="row mt6"><button class="btn sm" data-a="addb">+ ${T('addBend')}</button>
      ${ST.sel >= 0 ? `<button class="btn sm" data-a="delb">✕ B${ST.sel + 1}</button>` : ''}
      <span class="grow"></span>
      <button class="btn sm" data-a="bake">${T('bake')}</button>
      <button class="btn sm" data-a="zerod">${T('zeroD')}</button></div>
    <div class="hintline">${T('lenNote')}</div>
    <div class="hintline">${T('kbdNote')}</div>
    <div class="hintline">${T('note')}</div>
    <div class="hintline">${T('twnote')}</div>
  </div></div></div>`;
}
