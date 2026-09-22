/* =========================================================================
   PESTAÑA MODELO — la tabla de dobleces con sus columnas editables y las Δ,
   la cabecera de sección/tolerancias, y el pie con la recta de salida y la
   longitud desarrollada.
   ========================================================================= */
import * as E from '../engine.ts';
import { T } from '../i18n.ts';
import type { DeltaKey, Model } from '../types.ts';
import { ST, V } from '../state.ts';
import { fx, esc, nfield, oriTag } from './fmt.ts';

/** Lo que impide fabricar la pieza, dicho con palabras y con los dobleces
 *  nombrados. Cadena vacía si no hay nada que decir, que es el caso normal.
 *
 *  Los índices salen del motor en base 0 y aquí se suman uno: en la tabla y en
 *  el taller el primer doblez es B1.
 *
 *  La exporta `focus.ts`: editar una recta NO reconstruye el panel —ese es el
 *  camino dirigido que hace que teclear no vaya a tirones— así que el aviso se
 *  reescribe también desde allí, o solo aparecería al repintar por otro
 *  motivo. Por eso el hueco `#fabnote` se pinta siempre, aunque vaya vacío. */
export function feasNote(M: Model): string {
  const f = E.feasibility(M, ST.lims);
  if (f.ok) return '';
  const bs = (ix: number[]): string => ix.map(i => `B${i + 1}`).join(', ');
  const partes: string[] = [];
  /* La recta negativa va primero y aparte: no es un umbral que se pueda
     discutir, son dos herramentales en el mismo sitio. */
  if (f.negative.length) partes.push(T('fabNeg').replace('{b}', bs(f.negative)));
  const cortos = f.short.filter(i => !f.negative.includes(i));
  if (cortos.length) {
    partes.push(T('fabShort').replace('{b}', bs(cortos))
                             .replace('{n}', String(ST.lims.straightMin)));
  }
  if (f.tailShort) partes.push(T('fabTail').replace('{n}', String(ST.lims.straightMin)));
  if (f.overBent.length) {
    partes.push(T('fabOver').replace('{b}', bs(f.overBent))
                            .replace('{n}', String(E.BEND_MAX_DEG)));
  }
  /* El radio mínimo del tubo solo llega hasta aquí si alguien tecléó la cifra en
     Límites: sin ella `tightTube` sale vacío a propósito. Ver `LIMS_DEFAULT`. */
  if (f.tightTube.length) {
    partes.push(T('fabTube').replace('{b}', bs(f.tightTube))
                            .replace('{n}', String(ST.lims.tubeRfac))
                            .replace('{r}', (ST.lims.tubeRfac * M.section.width).toFixed(1)));
  }
  return `<div role="alert" class="warnbox mb6">${T('fabHead')} ${partes.join(' ')}</div>`;
}

/* --- pestaña MODELO ----------------------------------------------------- */
export function paneModel(M: Model): string {
  const v = V();
  E.syncDeltas(v);
  /* LAS COLUMNAS EDITABLES VAN SOBRE LA BASE Y SU Δ AL LADO, y la suma de las
     dos tiene que ser la pieza que se dibuja. Con `rot` y con el ángulo eso es
     trivial —son campos guardados— pero con la RECTA no: la recta sale del
     avance menos los dos trims, así que un Δ de ángulo la mueve sin tocar el
     avance. Por eso la columna del Δ de la recta enseña el Δ de la RECTA y no
     el del avance: ver `straightDelta()` en engine/kinematics.ts. */
  const base = v.base.bends, ori = E.orientations(M);
  const redonda = M.section.kind === 'round';
  /* El eje de doblado ABSOLUTO tras cada giro. La columna «Rodado» dice cuánto
     GIRA el eje, no dónde queda, así que una fila de ceros no significa «eje a
     cero» sino «no lo muevas»: la celda lleva el resultado en su tooltip. */
  const ejes = E.axisAngles(M);
  /* LAS LONGITUDES DE LA TABLA SE CUENTAN EN BARRA, no sobre el camino que
     recorre el eje: ver engine/fibre.ts. `straight` es el mismo número en las
     dos cuentas —la fibra y el centro coinciden en los tramos rectos— así que
     lo único que cambia de manos es el arco y su acumulado. */
  const LEN = E.fibreLengths(M), BASE = E.fibreLengths(v.base);
  /* La celda en rojo ya estaba, pero el rojo NO es un aviso: hay que estar
     mirando esa columna, y en una tabla de quince filas con desplazamiento
     lateral no se está. Esto lo dice con palabras y nombra los dobleces. */
  const fab = feasNote(M);
  /* EL PIE ES UNA FILA MÁS. La cola lleva su recta bajo «Recta» y su Δ bajo el
     Δ, igual que cualquier doblez; no lleva L porque una cola no tiene arco, y
     bajo Σ L va la longitud desarrollada. Así la última columna se lee entera
     de arriba abajo: Σ L del último doblez, más la recta de la cola con su Δ,
     da la desarrollada. Hasta el 2026-09-22 la recta de salida se pintaba bajo
     «L» —una recta en la columna del arco— y la cola se tecleaba arriba y en
     PI a PI, que son dos números distintos con el mismo nombre. */
  const num = (attr: string, i: number, k: DeltaKey, val: number, step: string): string =>
    nfield(step, `data-${attr}="${i}" data-k="${k}"`, val);
  /* un Δ en cero se apaga: la columna solo debe cantar cuando hay corrección */
  const dnum = (i: number, k: DeltaKey, step: string): string => {
    const d = v.deltas[i][k];
    return nfield(step, `class="${d ? '' : 'z'}" data-bd="${i}" data-k="${k}"`, d);
  };
  /** El Δ de la RECTA. `data-k="straight"` y no `"feed"` porque lo que se
   *  teclea aquí está en la unidad de la columna de al lado; el avance sigue
   *  siendo lo que se guarda. Se redondea a la milésima para la comparación
   *  con cero: un Δ de ángulo deja restos de 1e-13 en las rectas vecinas y sin
   *  esto la columna se encendería con un cero. */
  const dstr = (i: number): string => {
    const d = +E.straightDelta(v.base, M, i).toFixed(3);
    return nfield('.1', `class="${d ? '' : 'z'}" data-bd="${i}" data-k="straight"`, d);
  };

  const rows = M.bends.map((b, i) => {
    const span = E.twistSpanOf(M, i);
    const over = (b.twist || 0) && (b.twistLen || 0) > span;
    const hasD = E.DELTA_KEYS.some(k => v.deltas[i][k]);
    const bb = base[i];
    return `<tr class="clk ${i === ST.sel ? 'sel' : ''} ${hasD ? 'hasd' : ''}" data-r="${i}">
      <td>B${i + 1}</td><td>${oriTag(ori[i], redonda)}</td>
      ${/* El rojo mira la recta EFECTIVA, que es la que hay que fabricar y la
           misma que juzga feasNote(): con un Δ de ángulo la recta de la pieza
           se acorta y el campo sigue enseñando la de la base, así que el aviso
           de arriba y la celda tienen que estar de acuerdo. */''}
      <td>${nfield('.5', `data-st="${i}" class="${LEN[i].straight < ST.lims.straightMin ? 'v-bad' : ''}"`,
                   BASE[i].straight)}</td>
      <td class="dcol">${dstr(i)}</td>
      <td>${nfield('.1', `data-b="${i}" data-k="rot"
        title="${T('rotAxisTip').replace('%e', fx(ejes[i], 1))}"`, bb.rot)}</td>
      <td class="dcol">${dnum(i, 'rot', '.1')}</td>
      <td>${num('b', i, 'angle', bb.angle, '.1')}</td>
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
      ${/* Las medidas de la sección ya NO están aquí: viven en su pestaña, al
           lado del dibujo de la cara, y ahí se ven las consecuencias de cada
           una. Estuvieron en los dos sitios hasta el 2026-09-18, con el mismo
           `data-s` y el mismo dato detrás —dos vistas de uno, no dos copias—,
           pero obligaban a mirar en dos lados para entender una sección. Lo
           que sí se queda es el resumen.

           La COLA tampoco está ya aquí: se teclea en el pie de la tabla, en la
           columna «Recta» y de tangencia a tangencia como las demás. Aquí se
           tecleaba de PI a PI, así que el campo decía 160.00 y el pie 154.66 y
           las dos cosas se llamaban «Cola». */''}
      <div class="fgrid pair"><label>${T('secKind')}</label>
      <b>${T(M.section.kind === 'round' ? 'secRound' : 'secRect')}</b>
      <label>${T(M.section.kind === 'round' ? 'dia' : 'width')} (mm)</label>
      <b>${fx(M.section.width, 1)}</b>
      ${M.section.kind === 'round' ? ''
        : `<label>${T('thick')} (mm)</label><b>${fx(M.section.thickness, 1)}</b>`}
      </div></div>
    <div class="mcol"><div class="eyebrow">${T('tol')}</div>
      <div class="fgrid pair"><label>${T('tolA')} (°)</label>${nfield('.05', 'data-t="angle"', M.tol.angle)}
      <label>${T('tolR')} (°)</label>${nfield('.05', 'data-t="rot"', M.tol.rot)}
      <label>${T('tolF')} (mm)</label>${nfield('.05', 'data-t="feed"', M.tol.feed)}
      <label>${T('tolP')} (mm)</label>${nfield('.05', 'data-t="point"', M.tol.point)}</div></div>
  </div></div>
  <div class="grp"><div class="eyebrow">${T('bends')}<span class="n">${M.bends.length}</span></div><div class="body">
    <div id="fabnote">${fab}</div>
    <div class="tw"><table class="lra"><thead><tr>
      <th scope="col">${T('nBend')}</th><th scope="col">${T('ori')}</th>
      <th scope="col">${T('straight')}</th>
      <th scope="col" class="dcol" title="${esc(T('dStraightTip'))}">${d}</th>
      <th scope="col" title="${T('rotHeadTip')}">${T('rot')}</th><th scope="col" class="dcol">${d}</th>
      <th scope="col">${T('ang')}</th><th scope="col" class="dcol">${d}</th>
      <th scope="col">${T('rad')}</th><th scope="col">${T('twist')}</th><th scope="col">${T('twlen')}</th>
      <th scope="col">${T('arcL')}</th>
      <th scope="col" title="${esc(T('cutLenTip'))}">${T('cumL')}</th>
      </tr></thead><tbody>${rows}</tbody>
      <tfoot><tr class="foot"><td>${T('tailRow')}</td><td></td>
        <td data-cell="tstr">${nfield('.5',
          `data-m="tail" title="${esc(T('tailFootTip'))}"
           class="${E.tailStraight(M) < ST.lims.straightMin ? 'v-bad' : ''}"`,
          E.tailStraight(v.base))}</td>
        <td class="dcol" data-cell="tdlt">${(() => {
          const dt = +E.tailStraightDelta(v.base, M).toFixed(3);
          return `<span class="${dt ? '' : 'z'}">${fx(dt, 2)}</span>`;
        })()}</td>
        <td colspan="7"></td><td class="v-dim"></td>
        <td data-cell="dev" title="${esc(T('cutLenTip'))}">${fx(E.cutLength(M), 2)}</td></tr></tfoot>
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
