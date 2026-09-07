/* ----------------------------------------------------------------- estado --
   Todo el estado vive en ST. Nada de localStorage / sessionStorage.

   `variants` es la lista de modelos comparables; `active` la que se edita,
   `ref` la referencia contra la que se ancla y se mide, y `model` es SOLO una
   caché del modelo efectivo (base + deltas) de la activa: todo el código que
   dibuja y mide sigue leyendo de ahí. Después de tocar una variante hay que
   llamar syncModel() o la caché miente.                                     */
import * as E from './engine.ts';
import type {
  AnchorMode, Bend, Comp, Dataset, DatumMode, Mark, Model, Place, Proc, State, Tweak, Variant,
 Springback,
} from './types.ts';
import type { Matrix4, Vector3 } from 'three';

export const LAYER_DEF = [
  ['nom', 'lNom', '#3FA9F5'], ['var', 'lVar', '#8CD65A'], ['diff', 'lDiff', '#E15FA0'],
  ['meas', 'lMeas', '#F0A02E'], ['pred', 'lPred', '#3FD68C'], ['dev', 'lDev', '#FF4D5E'],
  ['marks', 'lMarks', '#57C8D6'],
  ['pts', 'lPts', '#D8DFE9'], ['lbl', 'lLbl', '#7E8A9C'],
  ['grid', 'lGrid', '#232C3A'], ['fix', 'lFix', '#3A4658'],
];
/* Paleta de modelos. El primero es el azul nominal: la referencia arranca ahí. */
export const VAR_COLORS = ['#3FA9F5', '#3FD68C', '#F0A02E', '#A98BF5',
                           '#E15FA0', '#57C8D6', '#8CD65A', '#FF8A65'];
export const DS_COLORS = ['#F0A02E', '#E15FA0', '#8CD65A', '#A98BF5', '#57C8D6'];
export const MARK_COLORS = ['#57C8D6', '#FFD166', '#C792EA', '#7FD8C4', '#FF8A65'];

const OFF_BY_DEFAULT = ['fix', 'pred'];

export const ST: State = {
  variants: [], active: null, ref: null, anchor: 'start',
  model: null, command: [], datasets: [], dsActive: null, sel: -1,
  comp: { ...E.COMP_DEFAULT }, proc: { ...E.PROC_DEFAULT },
  layers: Object.fromEntries(LAYER_DEF.map(([k, , c]) =>
    [k, { on: !OFF_BY_DEFAULT.includes(k), color: c }])) as State['layers'],
  view: { exag: 25, cmode: 'dev' },
  datum: 'start', mode: 'model', tab: 'model', pred: null,
  /* 'system' | 'light' | 'dark'. Sin localStorage: viaja en el JSON. */
  theme: 'system',
  /* colocación: dónde y en qué ángulo se para la pieza. Solo presentación. */
  place: { ...E.PLACE_DEFAULT },
  /* puntos de referencia sueltos: cotas contra el fixture o un datum */
  marks: [],
  /* ajuste manual sobre lo que calcula el lazo, por doblez */
  tweak: [],
};

let varSeq = 1, dsSeq = 0, markSeq = 0;

/* -------------------------------------------------------------- variantes */
export const V = () => ST.variants.find(v => v.id === ST.active) || ST.variants[0];
export const REF = () => ST.variants.find(v => v.id === ST.ref) || ST.variants[0];
export const refModel = () => E.effectiveModel(REF());

/** Refresca la caché tras cualquier edición de la variante activa. */
export function syncModel(): Model {
  const v = V();
  E.syncDeltas(v);
  ST.model = E.effectiveModel(v);
  return ST.model;
}
export function newVid(): string { varSeq += 1; return `v${varSeq}`; }

/** Reemplaza el espacio de trabajo entero por un modelo (o un juego de
 *  variantes venido de un archivo). */
export function loadModel(
  model: Model, variants?: Variant[] | null,
  ref?: string | null, anchor?: AnchorMode | null,
): void {
  if (variants && variants.length) {
    ST.variants = variants;
    varSeq = Math.max(varSeq, variants.length);
  } else {
    varSeq = 1;
    ST.variants = [E.newVariant(model, model.name, VAR_COLORS[0], 'v1')];
  }
  const ids = ST.variants.map(v => v.id);
  ST.active = ids[0];
  ST.ref = ids.includes(ref as string) ? (ref as string) : ids[0];
  ST.anchor = anchor || 'start';
  ST.datasets = []; ST.dsActive = null; ST.pred = null; ST.sel = -1;
  dsSeq = 0; markSeq = 0;
  ST.marks = [];
  ST.place = { ...E.PLACE_DEFAULT };
  syncModel();
  ST.command = ST.model!.bends.map(b => E.bendFrom(b));
  zeroTweak();
}

/* ------------------------------------------------------------- colocación */
/** Punto sobre el que pivota la colocación: un PI del modelo de referencia. */
export function pivotPoint(): Vector3 {
  const P = E.fk(refModel()).pis;
  return P[E.clamp(ST.place.pivot | 0, 0, P.length - 1)];
}
/** Matriz que acomoda TODA la escena. Identidad si no se ha tocado nada. */
export const placeMatrix = (): Matrix4 => E.placeTransform(ST.place, pivotPoint());

/* ------------------------------------------- puntos de referencia (marks) */
export function addMark(x = 0, y = 0, z = 0, name?: string): Mark {
  markSeq += 1;
  const m: Mark = {
    id: `mk${markSeq}`,
    name: name || `P${ST.marks.length + 1}`,
    color: MARK_COLORS[ST.marks.length % MARK_COLORS.length],
    visible: true, x: +x || 0, y: +y || 0, z: +z || 0,
  };
  ST.marks.push(m);
  return m;
}
export function setMarks(list: Partial<Mark>[] | null | undefined): Mark[] {
  ST.marks = [];
  markSeq = 0;
  for (const m of list || []) {
    const n = addMark(m.x, m.y, m.z, m.name);
    if (m.color) n.color = m.color;
    n.visible = m.visible !== false;
  }
  return ST.marks;
}

/* ------------------------------------------------- ajuste de compensación */
export function syncTweak(n: number): Tweak[] {
  const t = (ST.tweak || []).slice(0, n);
  while (t.length < n) t.push({ angle: 0, rot: 0, feed: 0 });
  ST.tweak = t.map(x => ({ angle: +x.angle || 0, rot: +x.rot || 0, feed: +x.feed || 0 }));
  return ST.tweak;
}
export function zeroTweak(): Tweak[] {
  ST.tweak = [];
  return syncTweak(ST.model ? ST.model.bends.length : 0);
}
export const hasTweak = (): boolean => ST.tweak.some(t => t.angle || t.rot || t.feed);

/** Las piezas medidas que entran en el lazo.
 *
 *  Con `comp.batch` puesto y más de una pieza visible, entran todas; si no, la
 *  activa y nada más, que es el comportamiento de siempre. */
export function loopPieces(): Dataset[] {
  const vis = ST.datasets.filter(d => d.visible);
  if (ST.comp.batch && vis.length > 1) return vis;
  const a = activeDataset();
  return a ? [a] : [];
}

/** Los dobleces medidos que consume el lazo: la pieza sola, o la MEDIANA del
 *  lote. Compensar desde una sola pieza es perseguir la dispersión de esa
 *  pieza; con varias, la mediana separa lo sistemático de la mala puntería. */
export function loopMeasured(): Bend[] | null {
  const ps = loopPieces();
  if (!ps.length) return null;
  return ps.length === 1 ? ps[0].model.bends : E.medianPart(ps.map(d => d.model.bends));
}

/** El resorte MEDIDO de las piezas visibles.
 *
 *  Cada pieza se compara con el comando que la fabricó, no con el de ahora:
 *  aplicar una compensación cambia ST.command y la cuenta dejaría de tener
 *  sentido. Una pieza de un archivo anterior no trae ese comando; ahí se
 *  supone el actual, que es lo único que hay. */
export function measuredSpringback(): Springback | null {
  const vis = ST.datasets.filter(d => d.visible);
  if (!vis.length) return null;
  const M = ST.model!;
  return E.springback(
    vis.map(d => ({ cmd: d.cmd && d.cmd.length ? d.cmd : ST.command, meas: d.model.bends })),
    E.orientations(M));
}

/** Cuántas de las piezas visibles son inventadas. Estimar el resorte con
 *  piezas simuladas devuelve lo que ya está escrito en el simulador: es un
 *  ciclo cerrado, no una medida, y hay que decirlo. */
export const simCount = (): number =>
  ST.datasets.filter(d => d.visible && (d.src === 'sim' || d.src === 'verify')).length;

/** Comando compensado: lo que calcula el lazo MÁS el ajuste escrito a mano.
 *  Es lo único que se aplica y lo que muestra la tabla. */
export function compensatedCommand(meas: Bend[]): Bend[] {
  const M = ST.model!;
  syncTweak(M.bends.length);
  const base = E.compensate(ST.command, M.bends, meas, ST.comp, E.orientations(M));
  return base.map((b, i) => {
    const t = ST.tweak[i] || { angle: 0, rot: 0, feed: 0 };
    const o = E.bendFrom(b);
    if (ST.comp.doAngle) o.angle = b.angle + t.angle;
    if (ST.comp.doRot) o.rot = b.rot + t.rot;
    if (ST.comp.doFeed) o.feed = b.feed + t.feed;
    return o;
  });
}

/* --------------------------------------------------------------- datasets */
export const activeDataset = (): Dataset | null =>
  ST.datasets.find(d => d.id === ST.dsActive) || null;

export function computeDev(ds: Dataset): Dataset {
  ds.dev = E.deviations(ST.model!, ds.model, ST.datum);
  ds.pis = ds.dev.pis;
  return ds;
}
export const recomputeAll = (): void => { ST.datasets.forEach(computeDev); };

export function addDataset(model: Model, name: string, src: string, cmd?: Bend[]): Dataset {
  dsSeq += 1;
  /* `dev` lo rellena computeDev() en la línea de abajo, y por eso el tipo lo
     declara opcional: aquí no hay ningún null que el runtime llegue a ver. */
  const ds: Dataset = {
    id: `ds${dsSeq}`, name, src,
    color: DS_COLORS[ST.datasets.length % DS_COLORS.length],
    visible: true, model, pis: [],
    /* con qué comando se fabricó: hay que copiarlo AHORA, porque en cuanto se
       aplique una compensación ST.command deja de ser el de esta pieza */
    cmd: (cmd || ST.command || model.bends).map(b => E.bendFrom(b)),
  };
  ST.datasets.push(ds);
  ST.dsActive = ds.id;
  computeDev(ds);
  return ds;
}

/* --------------------------------------------------------------- comandos */
export function syncCommand(): void {
  if (!ST.command || ST.command.length !== ST.model!.bends.length) {
    ST.command = ST.model!.bends.map(b => E.bendFrom(b));
  }
  syncTweak(ST.model!.bends.length);
}
export const resetCommand = (): void => { ST.command = ST.model!.bends.map(b => E.bendFrom(b)); };

/** Cuánto se movió el extremo LIBRE del modelo activo respecto a la
 *  referencia — o el de amarre, si lo anclado es la punta. */
export function activeShift(): number {
  if (ST.active === ST.ref) return 0;
  try {
    const sh = E.piShift(ST.model!, refModel(), ST.anchor);
    return ST.anchor === 'end' ? sh[0] : sh[sh.length - 1];
  } catch { return 0; }
}
