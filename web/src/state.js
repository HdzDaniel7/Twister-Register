/* ----------------------------------------------------------------- estado --
   Todo el estado vive en ST. Nada de localStorage / sessionStorage.

   `variants` es la lista de modelos comparables; `active` la que se edita,
   `ref` la referencia contra la que se ancla y se mide, y `model` es SOLO una
   caché del modelo efectivo (base + deltas) de la activa: todo el código que
   dibuja y mide sigue leyendo de ahí. Después de tocar una variante hay que
   llamar syncModel() o la caché miente.                                     */
import * as E from './engine.js';

export const LAYER_DEF = [
  ['nom', 'lNom', '#3FA9F5'], ['var', 'lVar', '#8CD65A'], ['diff', 'lDiff', '#E15FA0'],
  ['meas', 'lMeas', '#F0A02E'], ['pred', 'lPred', '#3FD68C'], ['dev', 'lDev', '#FF4D5E'],
  ['pts', 'lPts', '#D8DFE9'], ['lbl', 'lLbl', '#7E8A9C'],
  ['grid', 'lGrid', '#232C3A'], ['fix', 'lFix', '#3A4658'],
];
/* Paleta de modelos. El primero es el azul nominal: la referencia arranca ahí. */
export const VAR_COLORS = ['#3FA9F5', '#3FD68C', '#F0A02E', '#A98BF5',
                           '#E15FA0', '#57C8D6', '#8CD65A', '#FF8A65'];
export const DS_COLORS = ['#F0A02E', '#E15FA0', '#8CD65A', '#A98BF5', '#57C8D6'];

const OFF_BY_DEFAULT = ['fix', 'pred'];

export const ST = {
  variants: [], active: null, ref: null, anchor: 'start',
  model: null, command: [], datasets: [], dsActive: null, sel: -1,
  comp: { ...E.COMP_DEFAULT }, proc: { ...E.PROC_DEFAULT },
  layers: Object.fromEntries(LAYER_DEF.map(([k, , c]) =>
    [k, { on: !OFF_BY_DEFAULT.includes(k), color: c }])),
  view: { exag: 25, cmode: 'dev' },
  datum: 'start', tab: 'model', pred: null,
};

let varSeq = 1, dsSeq = 0;

/* -------------------------------------------------------------- variantes */
export const V = () => ST.variants.find(v => v.id === ST.active) || ST.variants[0];
export const REF = () => ST.variants.find(v => v.id === ST.ref) || ST.variants[0];
export const refModel = () => E.effectiveModel(REF());

/** Refresca la caché tras cualquier edición de la variante activa. */
export function syncModel() {
  const v = V();
  E.syncDeltas(v);
  ST.model = E.effectiveModel(v);
  return ST.model;
}
export function newVid() { varSeq += 1; return `v${varSeq}`; }

/** Reemplaza el espacio de trabajo entero por un modelo (o un juego de
 *  variantes venido de un archivo). */
export function loadModel(model, variants, ref, anchor) {
  if (variants && variants.length) {
    ST.variants = variants;
    varSeq = Math.max(varSeq, variants.length);
  } else {
    varSeq = 1;
    ST.variants = [E.newVariant(model, model.name, VAR_COLORS[0], 'v1')];
  }
  const ids = ST.variants.map(v => v.id);
  ST.active = ids[0];
  ST.ref = ids.includes(ref) ? ref : ids[0];
  ST.anchor = anchor || 'start';
  ST.datasets = []; ST.dsActive = null; ST.pred = null; ST.sel = -1;
  dsSeq = 0;
  syncModel();
  ST.command = ST.model.bends.map(b => E.bendFrom(b));
}

/* --------------------------------------------------------------- datasets */
export const activeDataset = () => ST.datasets.find(d => d.id === ST.dsActive) || null;

export function computeDev(ds) {
  ds.dev = E.deviations(ST.model, ds.model, ST.datum);
  ds.pis = ds.dev.pis;
  return ds;
}
export const recomputeAll = () => { ST.datasets.forEach(computeDev); };

export function addDataset(model, name, src) {
  dsSeq += 1;
  const ds = {
    id: `ds${dsSeq}`, name, src,
    color: DS_COLORS[ST.datasets.length % DS_COLORS.length],
    visible: true, model, pis: [],
  };
  ST.datasets.push(ds);
  ST.dsActive = ds.id;
  computeDev(ds);
  return ds;
}

/* --------------------------------------------------------------- comandos */
export function syncCommand() {
  if (!ST.command || ST.command.length !== ST.model.bends.length) {
    ST.command = ST.model.bends.map(b => E.bendFrom(b));
  }
}
export const resetCommand = () => { ST.command = ST.model.bends.map(b => E.bendFrom(b)); };

/** Cuánto se movió el extremo LIBRE del modelo activo respecto a la
 *  referencia — o el de amarre, si lo anclado es la punta. */
export function activeShift() {
  if (ST.active === ST.ref) return 0;
  try {
    const sh = E.piShift(ST.model, refModel(), ST.anchor);
    return ST.anchor === 'end' ? sh[0] : sh[sh.length - 1];
  } catch { return 0; }
}
