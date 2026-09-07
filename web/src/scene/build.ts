/* =========================================================================
   RECONSTRUCCIÓN — rebuildScene() arma el contexto que comparten las capas
   (SceneCtx) y llama a las diez capas en el mismo orden de siempre. Destruye
   y reconstruye TODA la geometría: cada objeto va dentro de un grupo de
   `groups{}` y se hace dispose() de geometrías y materiales al vaciarlo.
   ========================================================================= */
import { Matrix4 } from 'three';
import * as E from '../engine.ts';
import { ST, refModel, placeMatrix } from '../state.ts';
import { groups, root, clearGroup, clearLabels, markDirty } from './stage.ts';
import {
  layerGrid, layerFixtures, layerActive, layerVariants, layerMeasured,
  layerPredicted, layerDiff, layerMarks, layerPoints, layerDev,
} from './layers.ts';
import type { ShownEntry, SceneCtx } from './types.ts';

/* --------------------------------------------------------- reconstrucción */
export function rebuildScene(): void {
  const M = ST.model;
  if (!M) return;
  const L = ST.layers;
  for (const k in groups) clearGroup(groups[k]);
  clearLabels();
  root.matrix.copy(placeMatrix());
  root.updateMatrixWorld(true);

  const ref = refModel(), anchor = ST.anchor;
  const hasMeas = ST.datasets.some(d => d.visible);

  /* --- todas las variantes visibles, ancladas al extremo elegido -------- */
  const shown: ShownEntry[] = [];
  for (const v of ST.variants) {
    if (!v.visible) continue;
    const vm = E.effectiveModel(v);
    const A = E.anchorTransform(vm, ref, anchor);
    shown.push({ v, m: vm, A, path: E.buildPath(vm), pis: E.applyMat(A, E.fk(vm).pis) });
  }
  const act = shown.find(e => e.v.id === ST.active) || null;
  /* todo lo que se compara contra la ACTIVA (piezas medidas, predicción,
     vectores de desviación) viaja con su misma transformación de anclaje */
  const Axf = act ? act.A : new Matrix4();
  const nomPis = act ? act.pis : E.applyMat(Axf, E.fk(M).pis);

  const ctx: SceneCtx = { M, L, ref, anchor, shown, act, Axf, nomPis, hasMeas };
  layerGrid(ctx);
  layerFixtures(ctx);
  layerActive(ctx);
  layerVariants(ctx);
  layerMeasured(ctx);
  layerPredicted(ctx);
  layerDiff(ctx);
  layerMarks(ctx);
  layerPoints(ctx);
  layerDev(ctx);
  markDirty();
}
