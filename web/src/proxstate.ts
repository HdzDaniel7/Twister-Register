/* =========================================================================
   RASTREADOR DE CERCANÍA — el estado de la pantalla y las dos piezas colocadas.

   El motor (engine/proximity.ts) es puro y compara dos listas de muestras que
   ya están en el mismo marco. Aquí se decide QUIÉN es cada una y DÓNDE está,
   y la respuesta tiene que ser la misma que da la escena —scene/build.ts— o
   el mapa de color se pintaría sobre una pieza que no es la que se ve:

     · una variante va con su `anchorTransform` contra la referencia LIBRE;
     · una pieza medida (nube) va con la matriz de ANCLAJE DE LA ACTIVA, y de la
       activa solo si está visible (en build.ts, `Axf = act ? act.A : identidad`);
     · encima de todo, la colocación `placeMatrix()`, que en la escena es la
       matriz del grupo `root`.

   Para dibujar se usan las muestras SIN colocación (el grupo `root` ya la
   pone); para medir, CON ella, porque los ejes X/Y/Z del rastreador son los del
   taller y no los del modelo. Las filas salen en el mismo orden que las
   muestras de A, así que una sirve de índice de la otra.

   Es borrador de interfaz, a nivel de módulo como ptstate.ts: no va en ST, no
   gasta pasos de deshacer ni viaja en el JSON.
   ========================================================================= */
import { Matrix4, Vector3 } from 'three';
import * as E from './engine.ts';
import type { Model, PathSample } from './types.ts';
import type { ProxAxis, ProxResult } from './engine/proximity.ts';
import { ST, V, REF, pivotK, refModelFree, placeMatrix } from './state.ts';

export type ProxUI = {
  /** ¿está activo el rastreador? */
  on: boolean;
  /** pieza A, la que se pinta: id de variante o de pieza medida; '' = el modelo activo */
  a: string;
  /** pieza B, contra la que se compara; '' = la referencia */
  b: string;
  axis: ProxAxis;
};
export const proxUI: ProxUI = { on: false, a: '', b: '', axis: 'mag' };

/** ¿Hay que dibujarlo? */
export const proxVisible = (): boolean => proxUI.on && !!ST.model && ST.variants.length > 0;

type Source = { model: Model; name: string; A: Matrix4 };

/** La pieza con ese id (variante o medida; '' = `fallback`) y su matriz de
 *  anclaje, la misma de build.ts. null si ya no existe. */
function source(id: string, fallback: () => { model: Model; name: string; id: string } | null): Source | null {
  const anchor = ST.anchor;
  const ref = refModelFree();
  const v = ST.variants.find(x => x.id === id);
  if (v) {
    const m = E.effectiveModel(v);
    return { model: m, name: v.name, A: E.anchorTransform(m, ref, anchor, pivotK(), ST.datums) };
  }
  const ds = ST.datasets.find(x => x.id === id);
  if (ds) {
    const act = ST.variants.find(x => x.id === ST.active && x.visible);
    const Axf = act ? E.anchorTransform(E.effectiveModel(act), ref, anchor, pivotK(), ST.datums) : new Matrix4();
    return { model: ds.model, name: ds.name, A: Axf };
  }
  if (id !== '') return null;
  const f = fallback();
  if (!f) return null;
  const m = f.model;
  return { model: m, name: f.name, A: E.anchorTransform(m, ref, anchor, pivotK(), ST.datums) };
}
const srcA = (): Source | null => source(proxUI.a, () => {
  const v = V(); return v ? { model: E.effectiveModel(v), name: v.name, id: v.id } : null;
});
const srcB = (): Source | null => source(proxUI.b, () => {
  const v = REF(); return v ? { model: E.effectiveModel(v), name: v.name, id: v.id } : null;
});

/** Muestras con la matriz aplicada (posición y direcciones; la matriz es un
 *  rígido, así que las direcciones siguen unitarias). */
export function placeSamples(S: PathSample[], M: Matrix4): PathSample[] {
  return S.map(q => ({
    p: q.p.clone().applyMatrix4(M),
    x: q.x.clone().transformDirection(M),
    y: q.y.clone().transformDirection(M),
    z: q.z.clone().transformDirection(M),
    s: q.s,
  }));
}

export type ProxState = {
  /** muestras de A como las dibuja la escena (grupo `root`, sin colocación) */
  samples: PathSample[];
  /** el modelo de A (para su sección) */
  model: Model;
  res: ProxResult;
  tol: number;
  nameA: string; nameB: string;
};

let memoKey = '';
let memo: ProxState | null = null;

/** El resultado con las dos piezas colocadas como la escena. null si falta
 *  alguna. Cacheado por todo lo que lo determina. */
export function proxResult(): ProxState | null {
  if (!ST.model) return null;
  const a = srcA(), b = srcB();
  if (!a || !b) return null;
  const tol = ST.model.tol?.point ?? 1;
  const P = placeMatrix();
  const key = JSON.stringify([a.model.bends, a.model.tail, a.model.section, b.model.bends, b.model.tail,
    a.A.elements, b.A.elements, P.elements, proxUI.axis, tol, ST.datums]);
  if (memo && key === memoKey) return memo;
  const sa = E.buildPath(a.model).samples, sb = E.buildPath(b.model).samples;
  const res = E.proximity(placeSamples(sa, P.clone().multiply(a.A)), placeSamples(sb, P.clone().multiply(b.A)),
                          proxUI.axis, tol);
  memo = { samples: placeSamples(sa, a.A), model: a.model, res, tol, nameA: a.name, nameB: b.name };
  memoKey = key;
  return memo;
}

/** Punto (escena sin colocar) de la muestra `i` de A. */
export const proxPoint = (st: ProxState, i: number): Vector3 => st.samples[i].p;
