/* =========================================================================
   PESTAÑA LÍMITES — los umbrales con los que este programa decide que un dato
   no se puede creer, y las guardas del lazo.

   Estaban compilados dentro del HTML: para mover uno había que recompilar y
   volver a repartir el archivo. Aquí se teclean, viajan en el JSON de la pieza
   y quedan escritos con ella, que es lo que hace falta para volver a explicar
   un rechazo meses después.

   Los cuatro de arriba son de `ST.lims` (ver engine/lims.ts). Los cuatro de
   abajo viven en `ST.comp` desde la Fase 0 y nunca tuvieron dónde tocarse: la
   banda muerta y el tope por ciclo decidían el comando de máquina desde un
   valor por defecto que nadie eligió.
   ========================================================================= */
import * as E from '../engine.ts';
import { T } from '../i18n.ts';
import type { Model, Lims } from '../types.ts';
import { ST } from '../state.ts';
import { esc, nfield } from './fmt.ts';
import type { I18nKey } from './fmt.ts';

/** Una fila: qué es, cuánto vale, en qué unidad, cuánto trae de fábrica y qué
 *  se espera para dejar de llamarlo provisional. */
type Row = {
  /** el `data-*` que lo escribe: `lm` para ST.lims, `c` para el lazo */
  attr: string;
  lab: I18nKey;
  tip: I18nKey;
  unit: string;
  val: number;
  def: number;
  step: string;
  /** '' = no espera nada; si no, el punto de `.auditoria/solicitud-datos.md`
   *  que hace falta para dejar de llamarlo provisional */
  wait: string;
};

const UNIT: Record<keyof Lims, string> = {
  axisMin: '°', piMin: 'mm', scaleMin: '×', straightMin: 'mm',
};

const limRows = (): Row[] => E.LIMS_KEYS.map(k => ({
  attr: `data-lm="${k}"`,
  lab: `lim_${k}` as I18nKey,
  tip: `lim_${k}Tip` as I18nKey,
  unit: UNIT[k],
  val: ST.lims[k],
  def: E.LIMS_DEFAULT[k],
  step: E.LIMS_STEP[k] >= 2 ? '.05' : '1',
  wait: E.LIMS_PENDING[k],
}));

/** Las guardas del lazo. Viven en `ST.comp` y no en `ST.lims` a propósito: son
 *  parte de cómo corrige el lazo y ya viajaban en el documento desde la Fase 0.
 *  Lo que faltaba era la pantalla. */
const LOOP: { k: 'dead' | 'deadFeed' | 'maxStep' | 'maxStepFeed';
              unit: string; step: string; wait: string }[] = [
  { k: 'dead', unit: '°', step: '.01', wait: 'A.6' },
  { k: 'deadFeed', unit: 'mm', step: '.01', wait: 'A.6' },
  { k: 'maxStep', unit: '°', step: '.5', wait: '' },
  { k: 'maxStepFeed', unit: 'mm', step: '.5', wait: '' },
];

const loopRows = (): Row[] => LOOP.map(x => ({
  attr: `data-c="${x.k}"`,
  lab: `lim_${x.k}` as I18nKey,
  tip: `lim_${x.k}Tip` as I18nKey,
  unit: x.unit,
  val: ST.comp[x.k] ?? (E.COMP_DEFAULT[x.k] as number),
  def: E.COMP_DEFAULT[x.k] as number,
  step: x.step,
  wait: x.wait,
}));

function row(r: Row): string {
  const tocado = r.val !== r.def;
  const tip = esc(T(r.tip));
  return `<tr>
    <td title="${tip}">${T(r.lab)}</td>
    <td>${nfield(r.step, `${r.attr} title="${tip}"`, r.val)}</td>
    <td class="v-dim">${r.unit}</td>
    <td class="v-dim">${r.def}</td>
    <td class="${tocado ? 'v-warn' : 'v-dim'}">${tocado ? T('limTouched') : T('limFactory')}</td>
    <td class="v-dim">${r.wait ? T('limProv').replace('{p}', r.wait) : '—'}</td>
  </tr>`;
}

const table = (head: string, rows: Row[]): string => `<div class="eyebrow">${head}</div>
  <div class="tw"><table class="marks"><thead><tr>
    <th>${T('limWhat')}</th><th>${T('limVal')}</th><th></th>
    <th>${T('limDef')}</th><th>${T('limState')}</th><th>${T('limWait')}</th>
  </tr></thead><tbody>${rows.map(row).join('')}</tbody></table></div>`;

/** Qué está apagando o encendiendo el umbral en ESTA pieza, ahora mismo.
 *
 *  Un umbral sin consecuencia visible se teclea a ciegas: se sube hasta que
 *  algo deja de quejarse, y nadie sabe qué se apagó. `straightMin` es el único
 *  de los cuatro que juzga el modelo que está en pantalla —los otros tres
 *  juzgan un archivo que se importa— así que es el único que puede decirlo
 *  aquí; los demás lo dicen al importar, nombrando el archivo. */
function effect(M: Model): string {
  const f = E.feasibility(M, ST.lims);
  const cortos = f.short.length + (f.tailShort ? 1 : 0);
  return `<div class="row mt6"><span class="chip ${cortos ? 'bad' : ''}">${
    T('limHitStraight').replace('{n}', String(cortos))}</span></div>`;
}

export function paneLims(M: Model): string {
  const puros = E.limsAreDefault(ST.lims);
  return `<div class="pane on"><div class="grp"><div class="body">
    ${table(T('limRead'), limRows())}
    ${effect(M)}
    <div class="mt10">${table(T('limLoop'), loopRows())}</div>
    <div class="row mt6">
      <button class="btn sm" data-a="limsdef" ${puros ? 'disabled' : ''}>${T('limReset')}</button>
      <span class="grow"></span>
    </div>
    <div class="hintline">${T('limNote')}</div>
  </div></div></div>`;
}
