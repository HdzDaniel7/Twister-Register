/* =========================================================================
   CAPAS — una función por capa dibujable, sacadas tal cual de rebuildScene().
   Cada una lee su propio `L.<capa>.on` (la guardia se queda DENTRO de la
   función, como en el rebuildScene() de siempre) y añade su geometría al
   grupo homónimo de `groups`. `build.ts` las llama en orden fijo.
   ========================================================================= */
import {
  GridHelper, BoxGeometry, SphereGeometry, OctahedronGeometry, CylinderGeometry,
  BufferGeometry, Float32BufferAttribute,
  Line, LineSegments, LineBasicMaterial, LineDashedMaterial, Mesh, MeshStandardMaterial,
  MeshBasicMaterial,
  Color, Vector3,
} from 'three';
import * as E from '../engine.ts';
import { ST, placedPath, heldResult } from '../state.ts';
import { groups, cssVar, devThreeColor, ghost, solidMat, extraLabels } from './stage.ts';
import { barGeometry } from './geometry.ts';
import type { SceneCtx } from './types.ts';

/* --- rejilla y pedestales: van en `world`, que la colocación no toca ---
   El pedestal está atornillado a la mesa: no se mueve cuando la pieza se
   recoloca, y por eso sus coordenadas son las del taller y no las del modelo.
   Quien se mueve es la barra, y de ahí sale si sigue apoyando o no. */
export function layerGrid(ctx: SceneCtx): void {
  const { L } = ctx;
  if (L.grid.on) {
    const g = new GridHelper(4000, 40, cssVar('--grid1', '#2A3546'), cssVar('--grid2', '#1A212C'));
    g.rotation.x = Math.PI / 2; g.position.z = E.TABLE_Z;
    groups.grid.add(g);
  }
}

/** Los pedestales del fixture, tal como están declarados.
 *
 *  Antes esto ponía una caja cada tres PI, de tamaño fijo, levantada hasta el
 *  suelo. Se veía bien y no significaba nada: no había pedestales, había
 *  adorno. Ahora dibuja los que hay en `ST.fixture`, y el que no sostiene la
 *  barra —porque le falta altura, le sobra, o la barra ni siquiera le pasa por
 *  encima— sale en el color de fuera de tolerancia. Es la misma información
 *  que la tabla, pero en el sitio donde se ve de un vistazo cuál falla. */
export function layerFixtures(ctx: SceneCtx): void {
  const { M, L } = ctx;
  if (!L.fix.on || !ST.fixture.length) return;
  const ok = cssVar('--fixture', '#3A4658'), bad = cssVar('--bad', '#FF4D5E');
  const path = placedPath();
  for (const ped of ST.fixture) {
    if (!ped.visible || !(ped.h > 1)) continue;
    const f = E.pedestalFit(path, M.section, ped);
    /* «apoya» es lo mismo que pinta la tabla en rojo: la barra le pasa por
       encima Y la cuna la toca dentro de la tolerancia de punto. */
    const apoya = !!f && f.over && Math.abs(f.gap) <= M.tol.point;
    const mat = new MeshStandardMaterial({ color: apoya ? ok : bad, roughness: .9, metalness: .1 });
    const col = new Mesh(new BoxGeometry(28, 28, ped.h), mat);
    col.position.set(ped.x, ped.y, E.TABLE_Z + ped.h / 2);
    groups.fix.add(col);
    /* La cuna: mira por donde va la barra en planta, pero se inclina con SU
       propio `tilt` y no con el que la barra pide. Si no coinciden se ve la
       cuña de aire, que es la lectura que la columna Δ da en números. */
    const cuna = new Mesh(new BoxGeometry(Math.max(ped.pad, 8), 44, 6), mat.clone());
    cuna.position.set(ped.x, ped.y, E.TABLE_Z + ped.h + 3);
    cuna.rotation.set(0, ped.tilt * E.D2R, (f ? f.head : 0) * E.D2R, 'ZYX');
    groups.fix.add(cuna);
  }
}

/** Los pines laterales, y si de verdad están tocando la barra.
 *
 *  El color dice lo mismo que la tabla: el pin que sujeta va en su color y el
 *  que no —porque le falta altura o porque la barra le pasa lejos— sale en el
 *  color de fuera de tolerancia. Un pin que no toca no es un error: puede haber
 *  más pines montados que los que esta pieza usa. Lo que no puede pasar es
 *  creerse que sujeta uno que no llega.
 *
 *  Cilindro y no caja: un pin es redondo y la barra toca su superficie, no su
 *  eje. Esa diferencia son diez milímetros en un pin de 20, y es justo lo que
 *  decide si toca o no. */
export function layerPins(ctx: SceneCtx): void {
  const { M, L } = ctx;
  if (!L.pins || !L.pins.on || !ST.pins.length) return;
  const ok = cssVar('--pincol', '#57C8D6'), bad = cssVar('--bad', '#FF4D5E');
  const path = placedPath();
  for (const pin of ST.pins) {
    if (!pin.visible || !(pin.h > 1)) continue;
    const f = E.pinFit(path, M.section, pin);
    const toca = !!f && f.reach && Math.abs(f.gap) <= Math.max(M.tol.point, ST.restraint.tol);
    const mat = new MeshStandardMaterial({
      color: toca ? ok : bad, roughness: .55, metalness: .35,
      /* el que no sujeta se dibuja translúcido: está ahí, pero no cuenta */
      transparent: !pin.hold, opacity: pin.hold ? 1 : .45,
    });
    const col = new Mesh(new CylinderGeometry(pin.dia / 2, pin.dia / 2, pin.h, 16), mat);
    /* El cilindro de three nace con el eje en +y. Se lleva al eje REAL del pin,
       que ya no tiene por qué ser +z: desde que se pueden inclinar, la
       orientación sale de `pinAxis()` y no de una rotación fija. Con `tilt` a 0
       esto da exactamente la rotación de antes. */
    const ax = E.pinAxis(pin);
    col.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), ax.dir);
    col.position.copy(ax.base).addScaledVector(ax.dir, pin.h / 2);
    groups.pins.add(col);
  }
}

/** La pieza tal como la dejan los pines, encima de la libre.
 *
 *  Es la capa que hace visible el motivo entero del amarre: la barra sujeta NO
 *  está donde dice la tabla, y ver las dos formas a la vez es lo que convierte
 *  eso en algo que se puede juzgar. Va en alambre y no en sólido porque las dos
 *  se superponen casi por completo salvo en la punta, y dos sólidos pegados se
 *  ven sucios. */
export function layerHeld(ctx: SceneCtx): void {
  const { M, L, Axf } = ctx;
  if (!L.held || !L.held.on || !ST.restraint.on) return;
  const R = heldResult();
  if (!R.iters && !R.held.length) return;
  const col = cssVar('--held', '#F5A9E0');
  /* La BARRA sujeta, no su eje en una línea de un píxel: al lado de la pieza
     sólida una línea suelta no se ve, y lo que hay que poder juzgar de un
     vistazo es cuánto se separan las dos.
     · con la libre en pantalla, va en ALAMBRE — dos sólidos superpuestos se
       leen sucios, que es la misma razón por la que el nominal se vuelve
       alambre cuando hay una pieza medida encima;
     · con la libre apagada es la ÚNICA barra que queda, así que va SÓLIDA: un
       alambre solo en pantalla no se lee como una pieza. */
  const geo = barGeometry(E.buildPath(R.model), M.section, null);
  if (!L.nom.on) {
    const m = new Mesh(geo, solidMat());
    m.applyMatrix4(Axf);
    groups.held.add(m);
  }
  const alambre = ghost(geo, col, L.nom.on ? .9 : .5);
  alambre.applyMatrix4(Axf);
  groups.held.add(alambre);

  /* Y el desplazamiento de cada PI, de la forma libre a la sujeta. Es la
     lectura que convierte «se movió» en «se movió AQUÍ y tanto»: sin estos
     segmentos hay que adivinar a ojo qué parte de la barra cedió. */
  const libre = E.applyMat(Axf, E.fk(M).pis);
  const suj = E.applyMat(Axf, E.fk(R.model).pis);
  const n = Math.min(libre.length, suj.length);
  const pos: number[] = [];
  for (let i = 0; i < n; i++) {
    if (libre[i].distanceTo(suj[i]) < 1e-6) continue;
    pos.push(libre[i].x, libre[i].y, libre[i].z, suj[i].x, suj[i].y, suj[i].z);
  }
  if (pos.length) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    groups.held.add(new LineSegments(g, new LineBasicMaterial({ color: col })));
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
