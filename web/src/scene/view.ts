/* =========================================================================
   ENCUADRE — la caja que envuelve todo lo visible, las cuatro vistas fijas y
   la captura de esas cuatro vistas como PNG para el reporte.
   ========================================================================= */
import { Box3, Vector3 } from 'three';
import * as E from '../engine.ts';
import { ST, refModel, placeMatrix } from '../state.ts';
import { renderer, scene, camera, controls, V3, markDirty } from './stage.ts';
import type { ViewName } from './types.ts';

/* ------------------------------------------------------------- encuadre -- */
function modelBox() {
  const box = new Box3();
  const ref = refModel();
  const W = placeMatrix();
  let any = false;
  for (const v of ST.variants) {
    if (!v.visible) continue;
    const vm = E.effectiveModel(v);
    E.applyMat(E.anchorTransform(vm, ref, ST.anchor), E.fk(vm).pis)
      .forEach(p => { box.expandByPoint(p.applyMatrix4(W)); any = true; });
  }
  if (!any) E.fk(ST.model!).pis.forEach(p => box.expandByPoint(p.clone().applyMatrix4(W)));
  for (const mk of ST.marks) {
    if (mk.visible) box.expandByPoint(new Vector3(mk.x, mk.y, mk.z).applyMatrix4(W));
  }
  return box;
}
export function fitView() {
  if (!ST.model) return;
  const box = modelBox();
  const c = box.getCenter(V3()), r = box.getSize(V3()).length() / 2 || 500;
  controls.target.copy(c);
  const dir = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(c).addScaledVector(dir, r * 2.6);
  controls.update(); markDirty();
}
export function setView(v: ViewName) {
  if (!ST.model) return;
  const box = modelBox();
  const c = box.getCenter(V3()), r = box.getSize(V3()).length() / 2 || 500, d = r * 2.6;
  const dirs: Record<ViewName, [number, number, number]> =
    { iso: [.75, -.85, .55], top: [0, -.001, 1], front: [0, -1, 0], side: [1, 0, 0] };
  const u = new Vector3(...dirs[v]).normalize();
  controls.target.copy(c);
  camera.position.copy(c).addScaledVector(u, d);
  controls.update(); markDirty();
}

/** Captura las 4 vistas como PNG para el reporte. Deja la cámara como estaba. */
export function captureViews() {
  const keep = { pos: camera.position.clone(), tgt: controls.target.clone() };
  const shots = [];
  for (const v of ['iso', 'top', 'front', 'side'] as ViewName[]) {
    setView(v);
    renderer.render(scene, camera);
    shots.push([v, renderer.domElement.toDataURL('image/png')]);
  }
  camera.position.copy(keep.pos);
  controls.target.copy(keep.tgt);
  controls.update();
  markDirty();
  return shots;
}
