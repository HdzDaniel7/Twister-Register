/* =========================================================================
   ENCUADRE — la caja que envuelve todo lo visible, las cuatro vistas fijas y
   la captura de esas cuatro vistas como PNG para el reporte.
   ========================================================================= */
import { Box3, Vector3 } from 'three';
import * as E from '../engine.ts';
import { ST, refModelFree, refHeldOn, heldOfVariant, placeMatrix } from '../state.ts';
import { renderer, scene, camera, controls, V3, markDirty } from './stage.ts';
import type { ViewName } from './types.ts';

/* ------------------------------------------------------------- encuadre -- */
function modelBox() {
  const box = new Box3();
  /* Contra la referencia LIBRE y con la forma que se MUESTRA, como la escena: si
     el encuadre anclara distinto, «encuadrar» centraba una barra que no está en
     pantalla. */
  const ref = refModelFree();
  const W = placeMatrix();
  let any = false;
  for (const v of ST.variants) {
    if (!v.visible) continue;
    const vm = E.effectiveModel(v);
    const forma = refHeldOn() ? heldOfVariant(v).model : vm;
    E.applyMat(E.anchorTransform(vm, ref, ST.anchor), E.fk(forma).pis)
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

/** Cómo se serializa una captura. Ver `captureViews()`. */
export type ShotOpts = {
  /** ancho máximo en px; 0 deja el lienzo tal cual */
  maxW?: number;
  /** 'image/png' o 'image/jpeg' */
  tipo?: string;
  /** calidad del JPEG, 0-1. El PNG la ignora */
  calidad?: number;
};

/** Captura vistas para el reporte. Deja la cámara como estaba.
 *
 *  `maxW` REESCALA antes de serializar, y no es un lujo: el lienzo va a la
 *  resolución de la ventana, así que en un monitor grande cada vista sale a
 *  2400 px. Se reescala aquí y no con CSS en el reporte porque el CSS solo
 *  cambia cómo se ve; los bytes del data URI siguen siendo los mismos.
 *
 *  Y por qué se puede pedir JPEG, que es la decisión rara en un dibujo técnico.
 *  Un render 3D NO es un diagrama: tiene degradado de fondo, sombreado y bordes
 *  suavizados, o sea miles de colores que el PNG no puede agrupar. Medido con
 *  el lienzo a 2400×1350 y la vista ISO del demo, reescalada a 1100 px:
 *
 *      PNG           498 KB
 *      JPEG q=0.92    92 KB     ← 5.4 veces menos
 *      JPEG q=0.88    72 KB
 *
 *  Y el reescalado EMPEORA el PNG en vez de mejorarlo —363 KB a 900 px contra
 *  294 KB sin tocar, medido en el lienzo chico del banco— porque el suavizado
 *  inventa colores intermedios donde antes había planos. Con tres vistas eso
 *  es un reporte de 1.5 MB contra uno de 280 KB, que es la diferencia entre un
 *  archivo que se manda por correo y uno que rebota. */
export function captureViews(vistas: ViewName[] = ['iso', 'top', 'front', 'side'],
                             opts: ShotOpts = {}): [ViewName, string][] {
  const { maxW = 0, tipo = 'image/png', calidad } = opts;
  const keep = { pos: camera.position.clone(), tgt: controls.target.clone() };
  const shots: [ViewName, string][] = [];
  const src = renderer.domElement;
  /* un solo lienzo de destino para todas las vistas: son del mismo tamaño */
  const cv = (maxW && src.width > maxW) ? document.createElement('canvas') : null;
  if (cv) {
    cv.width = maxW;
    cv.height = Math.max(1, Math.round(src.height * maxW / src.width));
  }
  for (const v of vistas) {
    setView(v);
    renderer.render(scene, camera);
    if (cv) {
      const g = cv.getContext('2d')!;
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      /* el JPEG no tiene canal alfa y rellena con NEGRO lo transparente. El
         lienzo del visor viene con fondo opaco, pero el de destino nace
         transparente, así que se pinta el fondo antes de dibujar encima. */
      if (tipo !== 'image/png') { g.fillStyle = '#080A0E'; g.fillRect(0, 0, cv.width, cv.height); }
      g.drawImage(src, 0, 0, cv.width, cv.height);
      shots.push([v, cv.toDataURL(tipo, calidad)]);
    } else {
      shots.push([v, src.toDataURL(tipo, calidad)]);
    }
  }
  camera.position.copy(keep.pos);
  controls.target.copy(keep.tgt);
  controls.update();
  markDirty();
  return shots;
}
