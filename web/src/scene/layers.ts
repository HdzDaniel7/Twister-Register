/* =========================================================================
   CAPAS — una función por capa dibujable, sacadas tal cual de rebuildScene().
   Cada una lee su propio `L.<capa>.on` (la guardia se queda DENTRO de la
   función, como en el rebuildScene() de siempre) y añade su geometría al
   grupo homónimo de `groups`. `build.ts` las llama en orden fijo.
   ========================================================================= */
import {
  GridHelper, BoxGeometry, SphereGeometry, OctahedronGeometry,
  BufferGeometry, Float32BufferAttribute,
  LineSegments, LineBasicMaterial, LineDashedMaterial, Mesh, MeshStandardMaterial,
  MeshBasicMaterial,
  Color, Vector3,
} from 'three';
import * as E from '../engine.ts';
import { ST, placeMatrix } from '../state.ts';
import { groups, cssVar, devThreeColor, ghost, solidMat, extraLabels } from './stage.ts';
import { barGeometry } from './geometry.ts';
import type { SceneCtx } from './types.ts';

/* --- rejilla y pedestales: van en `world`, que la colocación no toca ---
   Los pedestales sí tienen que seguir a la pieza, pero apoyando en el suelo:
   por eso se levantan desde los PI YA COLOCADOS, no desde los del modelo. */
export function layerGrid(ctx: SceneCtx): void {
  const { L } = ctx;
  if (L.grid.on) {
    const g = new GridHelper(4000, 40, cssVar('--grid1', '#2A3546'), cssVar('--grid2', '#1A212C'));
    g.rotation.x = Math.PI / 2; g.position.z = -260;
    groups.grid.add(g);
  }
}

export function layerFixtures(ctx: SceneCtx): void {
  const { nomPis, L } = ctx;
  if (L.fix.on) {
    const mat = new MeshStandardMaterial({ color: cssVar('--fixture', '#3A4658'), roughness: .9, metalness: .1 });
    const placed = E.applyMat(placeMatrix(), nomPis);
    for (let i = 0; i < placed.length; i += 3) {
      const p = placed[i], hgt = p.z + 260;
      if (hgt <= 1) continue;
      const m = new Mesh(new BoxGeometry(28, 28, hgt), mat.clone());
      m.position.set(p.x, p.y, -260 + hgt / 2);
      groups.fix.add(m);
    }
  }
}

/* --- modelo activo: sólido, es el que se está editando ---------------- */
export function layerActive(ctx: SceneCtx): void {
  const { act, L, hasMeas } = ctx;
  if (L.nom.on && act) {
    const c = new Color(act.v.color);
    const g = barGeometry(act.path, act.m.section, () => [c.r * .55, c.g * .55, c.b * .55]);
    if (hasMeas) {
      /* con una pieza medida encima el activo pasa a alambrado: dos sólidos
         translúcidos superpuestos se leen sucios */
      const w = ghost(g, act.v.color, .7);
      w.applyMatrix4(act.A); groups.nom.add(w);
      g.dispose();
    } else {
      const m = new Mesh(g, solidMat());
      m.applyMatrix4(act.A); groups.nom.add(m);
      const w = ghost(g, act.v.color, .5);
      w.applyMatrix4(act.A); groups.nom.add(w);
    }
  }
}

/* --- los demás modelos: alambrado en su color ------------------------- */
export function layerVariants(ctx: SceneCtx): void {
  const { shown, act, L } = ctx;
  if (L.var.on) {
    for (const e of shown) {
      if (e === act) continue;
      const g = barGeometry(e.path, e.m.section, null);
      const w = ghost(g, e.v.color, .85);
      w.applyMatrix4(e.A); groups.var.add(w);
      g.dispose();
    }
  }
}

/* --- barras medidas --------------------------------------------------- */
export function layerMeasured(ctx: SceneCtx): void {
  const { M, Axf, L } = ctx;
  if (L.meas.on) {
    for (const ds of ST.datasets) {
      if (!ds.visible) continue;
      const p2 = E.buildPath(ds.model);
      const base = new Color(ds.color);
      const g = barGeometry(p2, M.section, q => {
        if (ST.view.cmode === 'dev' && ds.dev) {
          const c = devThreeColor(E.devAt(ds.dev.point, q.s, p2.total), M.tol.point);
          return [c.r, c.g, c.b];
        }
        return [base.r * .8, base.g * .8, base.b * .8];
      });
      const m = new Mesh(g, solidMat());
      m.applyMatrix4(Axf); groups.meas.add(m);
    }
  }
}

/* --- predicción corregida -------------------------------------------- */
export function layerPredicted(ctx: SceneCtx): void {
  const { M, Axf, L } = ctx;
  if (L.pred.on && ST.pred) {
    const p3 = E.buildPath(ST.pred);
    const g = barGeometry(p3, M.section, null);
    const w = ghost(g, L.pred.color, .85);
    w.applyMatrix4(Axf); groups.pred.add(w);
    g.dispose();
  }
}

/* --- desplazamiento entre modelos ------------------------------------ */
/* Es la lectura principal al comparar diseños: con un extremo fijo, cada PI
   de una variante se une con el PI homólogo de la referencia y el color dice
   cuánto se movió. La escala es relativa al MAYOR desplazamiento del cuadro,
   no a la tolerancia: aquí se comparan diseños, no piezas contra tolerancia. */
export function layerDiff(ctx: SceneCtx): void {
  const { shown, L, ref, anchor } = ctx;
  if (L.diff.on && shown.length > 1) {
    /* shown.find() puede no hallar coincidencia; el objeto de respaldo se
       afirma con `pis` opcional para tipar el `.pis` sin tocar su valor. */
    const rp = (shown.find(e => e.v.id === ST.ref) || {} as { pis?: Vector3[] }).pis
      || E.anchoredPis(ref, ref, anchor);
    const segs: [Vector3, Vector3][] = [], mags: number[] = [];
    for (const e of shown) {
      if (e.v.id === ST.ref) continue;
      let a = e.pis, b = rp;
      const n = Math.min(a.length, b.length);
      a = anchor === 'end' ? a.slice(a.length - n) : a.slice(0, n);
      b = anchor === 'end' ? b.slice(b.length - n) : b.slice(0, n);
      for (let i = 0; i < n; i++) {
        const d = a[i].distanceTo(b[i]);
        if (d < 1e-6) continue;
        segs.push([b[i], a[i]]); mags.push(d);
      }
    }
    if (segs.length) {
      const scale = Math.max(...mags) / 2 || 1;
      const pos: number[] = [], col: number[] = [];
      segs.forEach(([p, q]: [Vector3, Vector3], i: number) => {
        const c = devThreeColor(mags[i], scale);
        pos.push(p.x, p.y, p.z, q.x, q.y, q.z);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      });
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new Float32BufferAttribute(col, 3));
      groups.diff.add(new LineSegments(g, new LineBasicMaterial({ vertexColors: true })));
    }
    /* rombo + cifra en el extremo que SÍ se mueve (el opuesto al anclado) */
    const k = anchor === 'end' ? 0 : -1;
    /* `fk()` devuelve siempre n+2 puntos —amarre, los PI y el extremo libre—,
       así que el primero y el último existen y `at()` nunca da undefined. */
    const rq = rp.at(k)!;
    const dia = new OctahedronGeometry(11);
    for (const e of shown) {
      const q = e.pis.at(k)!;
      const m = new Mesh(dia.clone(), new MeshBasicMaterial({ color: e.v.color }));
      m.position.copy(q);
      groups.diff.add(m);
      const d = q.distanceTo(rq);
      if (d > .01) extraLabels.push({ p: q.clone(), txt: d.toFixed(1) + ' mm', color: e.v.color });
    }
    dia.dispose();
  }
}

/* --- puntos de referencia -------------------------------------------- */
/* Cotas sueltas: cada punto se une con el PI más cercano del modelo activo
   y la cifra dice a cuánto quedó. Sirve para acotar contra el fixture o un
   datum de taller, no contra otro modelo. */
export function layerMarks(ctx: SceneCtx): void {
  const { M, nomPis, L } = ctx;
  if (L.marks.on && ST.marks.length) {
    const oct = new OctahedronGeometry(9);
    const pos = [], col = [];
    for (const mk of ST.marks) {
      if (!mk.visible) continue;
      const q = new Vector3(mk.x, mk.y, mk.z);
      const m = new Mesh(oct.clone(), new MeshBasicMaterial({ color: mk.color }));
      m.position.copy(q);
      groups.marks.add(m);
      const near = E.nearestPoint(nomPis, q);
      if (near.i >= 0) {
        const a = nomPis[near.i], c = devThreeColor(near.d, M.tol.point);
        pos.push(a.x, a.y, a.z, q.x, q.y, q.z);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        extraLabels.push({
          p: q.clone(), color: mk.color,
          txt: `${mk.name} · ${near.d.toFixed(1)} mm`,
        });
      } else {
        extraLabels.push({ p: q.clone(), color: mk.color, txt: mk.name });
      }
    }
    if (pos.length) {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new Float32BufferAttribute(col, 3));
      const mat = new LineDashedMaterial({ vertexColors: true, dashSize: 12, gapSize: 8 });
      const ln = new LineSegments(g, mat);
      ln.computeLineDistances();
      groups.marks.add(ln);
    }
    oct.dispose();
  }
}

/* --- puntos PI -------------------------------------------------------- */
export function layerPoints(ctx: SceneCtx): void {
  const { M, shown, act, nomPis, Axf, L } = ctx;
  const sph = new SphereGeometry(6, 12, 10);
  if (L.pts.on) {
    for (let i = 0; i < nomPis.length; i++) {
      const m = new Mesh(sph.clone(), new MeshBasicMaterial({
        color: i === ST.sel + 1 ? 0xffffff : (act ? act.v.color : L.nom.color),
      }));
      m.position.copy(nomPis[i]);
      m.userData.pi = i;
      groups.pts.add(m);
    }
    for (const e of shown) {
      if (e === act) continue;
      for (const q of e.pis) {
        const m = new Mesh(sph.clone(), new MeshBasicMaterial({ color: e.v.color }));
        m.position.copy(q); m.scale.setScalar(.6);
        groups.pts.add(m);
      }
    }
    for (const ds of ST.datasets) {
      if (!ds.visible) continue;
      const Q = E.applyMat(Axf, ds.pis);
      for (let i = 0; i < Q.length; i++) {
        const dv = ds.dev ? ds.dev.point[i] : 0;
        const m = new Mesh(sph.clone(), new MeshBasicMaterial({
          color: ST.view.cmode === 'dev' ? devThreeColor(dv, M.tol.point) : new Color(ds.color),
        }));
        m.position.copy(Q[i]); m.scale.setScalar(.8);
        groups.pts.add(m);
      }
    }
  }
  sph.dispose();
}

/* --- vectores de desviación (piezas medidas) -------------------------- */
export function layerDev(ctx: SceneCtx): void {
  const { M, nomPis, Axf, L } = ctx;
  if (L.dev.on && ST.datasets.length) {
    /* TOPE de la exageración. El vector se dibuja ×exag para que una décima se
       vea, pero con una punta a 20 mm y ×25 salen barras de medio metro que
       tapan la pieza entera y ya no dicen nada. Se acota a un 6 % de la
       longitud desarrollada: la DIRECCIÓN se sigue leyendo, que es para lo que
       está la capa, y el tamaño real lo dan la tabla y el color. */
    const tope = .06 * E.developedLength(M);
    const pos = [], col = [];
    for (const ds of ST.datasets) {
      if (!ds.visible) continue;
      const Q = E.applyMat(Axf, ds.pis);
      for (let i = 0; i < Math.min(Q.length, nomPis.length); i++) {
        const a = nomPis[i], d = Q[i].clone().sub(a);
        const largo = Math.min(d.length() * ST.view.exag, tope);
        const e2 = d.length() > 1e-9
          ? a.clone().addScaledVector(d.clone().normalize(), largo)
          : a.clone();
        const c = devThreeColor(d.length(), M.tol.point);
        pos.push(a.x, a.y, a.z, e2.x, e2.y, e2.z);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    if (pos.length) {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new Float32BufferAttribute(col, 3));
      groups.dev.add(new LineSegments(g, new LineBasicMaterial({ vertexColors: true })));
    }
  }
}
