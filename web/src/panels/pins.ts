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
import { ST, shownPath, heldResult } from '../state.ts';
import { fx, esc, cls, nfield, reacCell } from './fmt.ts';

/** Una fila de pin. Aparte, como `pedRow()`, porque con las columnas derivadas
 *  el bucle dentro del panel se pasa de las 60 líneas de la regla. */
function pinRow(M: Model, i: number, f: E.PinFit | null, sujeta: boolean,
                reac: number, ciego: boolean): string {
  const p = ST.pins[i];
  const num = (k: 'x' | 'y' | 'h' | 'dia' | 'tilt' | 'yaw', fmt = '1') =>
    `<td>${nfield(fmt, `data-pn="${p.id}" data-k="${k}"`, p[k])}</td>`;
  /* Sin barra que mirar, las columnas derivadas dicen «—» y no «0»: un cero se
     lee como «tocando justo», que es lo contrario de «no se sabe». */
  const der = !f
    ? `<td class="v-dim" colspan="4">—</td>`
    : `<td class="v-dim">${fx(f.s, 0)}</td>
       <td class="v-dim">${fx(f.dist, 1)}</td>
       <td class="${cls(f.gap, Math.max(M.tol.point, ST.restraint.tol))}">${fx(f.gap, 2)}</td>
       <td class="${f.reach ? 'v-dim' : 'v-bad'}" title="${esc(T('pinReachTip'))}">${
         f.reach ? T('pinYes') : T('pinNo')}</td>`;
  return `<tr class="ped">
    <td><input type="checkbox" data-pnv="${p.id}" ${p.visible ? 'checked' : ''}></td>
    <td><input type="checkbox" data-pnh="${p.id}" ${p.hold ? 'checked' : ''}
      title="${esc(T('pinHoldTip'))}"></td>
    <td><input type="text" data-pn="${p.id}" data-k="name" value="${esc(p.name)}"
      style="min-width:64px"></td>
    ${num('x')}${num('y')}${num('h')}${num('dia', '1')}${num('tilt', '5')}${num('yaw', '15')}
    <td><select data-pns="${p.id}" title="${esc(T('pinSideTip'))}">
      <option value="0" ${!p.side ? 'selected' : ''}>${T('pinSideAuto')}</option>
      <option value="1" ${p.side > 0 ? 'selected' : ''}>+</option>
      <option value="-1" ${p.side < 0 ? 'selected' : ''}>−</option>
    </select></td>
    ${der}
    <td class="${sujeta ? 'v-ok' : 'v-dim'}">${sujeta ? T('pinHolding') : '—'}</td>
    ${ST.load.on ? reacCell(reac, ciego) : ''}
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
  /* Sin carga los contactos son BILATERALES —el amarre trae la barra de vuelta
     al pin— y cualquier hueco que sobre es un contacto sin cerrar. Con la carga
     puesta dejan de serlo: que la pieza se separe de un pin es una respuesta
     legítima, porque un poste no tiene imán, y contarla aquí pintaba de rojo un
     fixture correcto. Lo que sigue siendo un problema es el signo contrario, el
     pin metido dentro de la barra. Es un signo, y decide el color. */
  const sinCerrar = ST.load.on
    ? R.res.filter(v => v < -ST.restraint.tol).length
    : R.res.filter(v => Math.abs(v) > ST.restraint.tol).length;
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

/** LA CARGA — el peso propio de la pieza y el empuje con el que se la prueba.
 *
 *  Va en esta pestaña y no en la del fixture porque contesta a la misma
 *  pregunta que los pines: ¿dónde acaba de verdad la barra? Los pines dicen a
 *  dónde no la dejan ir; la carga dice hacia dónde se cae sola.
 *
 *  Lo que hay que leer aquí son DOS cifras, y no las de la tabla: cuánto de la
 *  pieza llevan los apoyos y cuánto se queda aguantando la mordaza. Si la
 *  segunda se lleva casi todo, lo que se está mirando es una pieza en voladizo,
 *  y eso es una respuesta —«hacen falta más pedestales»— y no un error. */
function carga(M: Model): string {
  const on = ST.load.on;
  const R = heldResult();
  const num = (k: 'g' | 'tip' | 'dx' | 'dy' | 'dz', step: string) =>
    nfield(step, `data-ld="${k}"`, ST.load[k]);
  /* ¿Llegó a correr el solver de la carga? Son exactamente las cuatro salidas
     tempranas de `settle()`: sin carga, sin material, sin peso ni empuje, y sin
     estaciones que ceder. Importa distinguirlo porque en esos cuatro casos `ok`
     todavía es el del AMARRE —el que dice si los contactos cerraron— y leerlo
     como si fuera el de la carga sería enseñar un aviso que no viene a cuento. */
  const resuelto = on && !R.noMat && !R.noDof && R.weight > 0;
  /* Y si corrió, si llegó a alguna parte. Un mínimo no alcanzado no es un
     número peor: es que no hay número, y hasta hoy se pintaba igual que uno
     bueno. Ver `ok` en engine/load.ts. */
  const rendido = resuelto && !R.ok;
  /* Con la mitad del peso o más colgando de la mordaza, la pieza no está
     apoyada: está en voladizo. Se avisa con un número, no con un adjetivo.
     Sin estaciones no se puede afirmar: ahí todo el peso sale en la raíz por
     construcción, no porque la pieza esté en voladizo. */
  const colgando = resuelto && !rendido && R.root > 0.5 * R.weight;
  return `<div class="grp">
    <div class="eyebrow">${T('load')}</div><div class="body">
    <div class="row">
      <label class="layer" title="${esc(T('loadOnTip'))}">
        <input type="checkbox" data-ld="on" ${on ? 'checked' : ''}>
        <span class="nm"><b>${T('loadOn')}</b></span></label>
    </div>
    ${on ? `<div class="fgrid pair mt6">
      <label title="${esc(T('loadGTip'))}">${T('loadG')}</label>${num('g', '.25')}
      <label title="${esc(T('loadTipTip'))}">${T('loadTipF')} (N)</label>${num('tip', '5')}
      <label title="${esc(T('loadDirTip'))}">${T('loadDir')} X</label>${num('dx', '.25')}
      <label title="${esc(T('loadDirTip'))}">${T('loadDir')} Y</label>${num('dy', '.25')}
      <label title="${esc(T('loadDirTip'))}">${T('loadDir')} Z</label>${num('dz', '.25')}
    </div>
    ${R.noMat ? `<div class="warnbox mt6">${T('loadNoMat')}</div>`
      /* Sin estaciones el peso SÍ se sabe —densidad por sección por largo— y lo
         que no se sabe es cómo se reparte. Se enseña lo primero y se dice lo
         segundo, en vez de las cinco cifras a cero que había antes. */
      : R.noDof ? `<div class="row mt6">
      <span class="chip" title="${esc(T('loadWeightTip'))}">${T('loadWeight')}: ${
        fx(R.weight, 1)} N</span>
    </div>
    <div class="warnbox mt6">${T('loadNoDof')}</div>`
      : `<div class="row mt6">
      ${rendido ? `<span class="chip bad" title="${esc(T('loadStuckTip'))}">${
        T('loadStuck')}</span>` : ''}
      <span class="chip" title="${esc(T('loadWeightTip'))}">${T('loadWeight')}: ${
        fx(R.weight, 1)} N</span>
      <span class="chip ${rendido ? 'dim' : colgando ? '' : 'ok'}" title="${esc(T('loadCarriedTip'))}">${
        T('loadCarried')}: ${fx(R.carried, 1)} N</span>
      <span class="chip ${rendido ? 'dim' : colgando ? 'bad' : ''}" title="${esc(T('loadRootTip'))}">${
        T('loadRoot')}: ${fx(R.root, 1)} N</span>
      <span class="chip ${rendido ? 'dim' : R.drop > M.tol.point ? 'bad' : ''}" title="${esc(T('loadDropTip'))}">${
        T('loadDrop')}: ${fx(R.drop, 2)} mm${R.dropAt >= 0 ? ` · PI${R.dropAt + 1}` : ''}</span>
      <span class="chip ${!rendido && R.pene > ST.restraint.tol ? 'bad' : 'dim'}"
        title="${esc(T('loadPeneTip'))}">${T('loadPene')}: ${fx(R.pene, 4)} mm</span>
    </div>
    ${rendido ? `<div class="warnbox mt6">${
      T('loadStuckWarn').replace('{n}', String(R.iters))}</div>` : ''}
    ${colgando ? `<div class="warnbox mt6">${T('loadHang')}</div>` : ''}`}` : ''}
    <div class="hintline">${T('loadNote')}</div>
  </div></div>`;
}

export function panePins(M: Model): string {
  /* Contra la pieza que HAY, no contra la libre: con el amarre puesto el hueco
     de un pin que sujeta es ~0 porque el solver lo cerró, y eso es la respuesta
     —lo que quedó sin cerrar ya se dice aparte, en `res` y en el chip de pines
     abiertos—. Medirlo contra la libre era contar el hueco que el amarre acaba
     de quitar. Ver `shownPath()`. */
  const path = ST.pins.length ? shownPath() : [];
  const fits = ST.pins.map(p => (path.length ? E.pinFit(path, M.section, p) : null));
  const R = heldResult();
  const rows = ST.pins.map((_, i) =>
    pinRow(M, i, fits[i], ST.restraint.on && R.held.includes(i),
           R.pinN[i] || 0, !!R.pinBlind[i])).join('');
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
    ${on ? `<div class="row mt6"><span class="tag" title="${esc(T('pinRefTip'))}">${T('pinRef')}</span>
      <div class="seg" title="${esc(T('pinRefTip'))}">
        <button data-rh="0" class="${ST.restraint.refHeld ? '' : 'on'}">${T('pinShowFree')}</button>
        <button data-rh="1" class="${ST.restraint.refHeld ? 'on' : ''}">${T('pinShowHeld')}</button>
      </div></div>` : ''}
    ${on ? `<div class="row mt6"><span class="tag">${T('pinShow')}</span>
      <div class="seg" title="${esc(T('pinShowTip'))}">
        <button data-hv="free" class="${ST.layers.nom.on && !ST.layers.held.on ? 'on' : ''}">${T('pinShowFree')}</button>
        <button data-hv="held" class="${!ST.layers.nom.on && !ST.layers.var.on && ST.layers.held.on ? 'on' : ''}">${T('pinShowHeld')}</button>
        <button data-hv="both" class="${ST.layers.nom.on && ST.layers.held.on ? 'on' : ''}">${T('pinShowBoth')}</button>
      </div></div>` : ''}
    <div class="fgrid pair mt6">
      <label title="${esc(T('pinTolTip'))}">${T('pinTol')} (mm)</label>
      ${nfield('.01', 'data-rs="tol"', ST.restraint.tol)}
      <label title="${esc(T('pinDampTip'))}">${T('pinDamp')}</label>
      ${nfield('.05', 'data-rs="damp"', ST.restraint.damp)}
      <label title="${esc(T('matTip'))}">${T('matE')} (MPa)</label>
      ${nfield('1000', 'data-mt="E"', ST.mat.E)}
      <label title="${esc(T('matTip'))}">${T('matYield')} (MPa)</label>
      ${nfield('10', 'data-mt="yield"', ST.mat.yield)}
      <label title="${esc(T('matRhoTip'))}">${T('matRho')} (kg/m³)</label>
      ${nfield('50', 'data-mt="rho"', ST.mat.rho ?? 0)}
    </div>
    <div class="hintline">${T('matProv')}</div>
    ${ST.pins.length ? `<div class="tw mt6"><table class="marks"><thead><tr>
      <th></th><th title="${esc(T('pinHoldTip'))}">${T('pinHold')}</th><th>${T('name')}</th>
      <th>${T('x')}</th><th>${T('y')}</th><th>${T('pedH')}</th><th>${T('pinDia')}</th>
      <th title="${esc(T('pinTiltTip'))}">${T('pinTilt')}</th>
      <th title="${esc(T('pinYawTip'))}">${T('pinYaw')}</th>
      <th title="${esc(T('pinSideTip'))}">${T('pinSide')}</th>
      <th>${T('pedS')}</th><th title="${esc(T('pinDistTip'))}">${T('pinDist')}</th><th>${T('pinGap')}</th>
      <th>${T('pinReach')}</th><th>${T('pinState')}</th>
      ${ST.load.on ? `<th title="${esc(T('loadNTip'))}">${T('loadN')}</th>` : ''}
      <th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`
    : `<div class="hintline">${T('pinEmpty')}</div>`}
    <div class="row mt6"><button class="btn sm" data-a="addpin">${T('addPin')}</button>
      <button class="btn sm" data-a="seedpin">${T('seedPin')}</button>
      <span class="grow"></span>
      ${ST.pins.length ? `<button class="btn sm" data-a="clearpin">${T('clearPin')}</button>` : ''}
    </div>
    ${costo(M)}
    <div class="hintline">${T('pinNote')}</div>
  </div></div>${carga(M)}</div>`;
}
