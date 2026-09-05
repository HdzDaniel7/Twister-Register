/* -------------------------------------------------------------- escena 3D --
   Three.js. Render BAJO DEMANDA: el bucle solo dibuja cuando `dirty` es true.
   Si cambias algo visual y no se ve, probablemente falta un markDirty().

   rebuildScene() destruye y reconstruye TODA la geometría. Cada objeto va
   dentro de un grupo de `groups{}` y se hace dispose() de geometrías y
   materiales: si agregas objetos fuera de un grupo, filtras memoria.        */
import {
  WebGLRenderer, Scene, Fog, PerspectiveCamera, Group, AmbientLight,
  DirectionalLight, GridHelper, BoxGeometry, SphereGeometry, OctahedronGeometry,
  BufferGeometry, Float32BufferAttribute, EdgesGeometry, LineSegments,
  LineBasicMaterial, LineDashedMaterial, Mesh, MeshStandardMaterial,
  MeshBasicMaterial, Box3,
  Color, Vector2, Vector3, Matrix4, Raycaster, SRGBColorSpace,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as E from './engine.js';
import { ST, refModel, placeMatrix } from './state.js';

export let renderer, scene, camera, controls;
/* Todo lo dibujado cuelga de `root`, cuya matriz es la COLOCACIÓN. Así girar o
   mover la pieza en el espacio no toca ni un dato del modelo: es una sola
   matriz sobre la escena entera, y la comparación entre modelos no cambia. */
let root;
const groups = {};
let labelHost, dirty = true, extraLabels = [];
let onPick = () => {};
export const setOnPick = fn => { onPick = fn; };
export const markDirty = () => { dirty = true; };

const $ = s => document.querySelector(s);
const V3 = (x, y, z) => new Vector3(x, y, z);
/** Lee un token de color de :root. Ni el 3D ni la cinta llevan colores
 *  propios: los toman del CSS en tiempo de ejecución, así que el tema claro se
 *  define UNA vez, en app.css, y aquí no hay una segunda paleta que mantener. */
export const cssVar = (n, fb = '#000') =>
  (getComputedStyle(document.documentElement).getPropertyValue(n) || '').trim() || fb;

/* devColor() habla en sRGB; three trabaja en linear-sRGB desde r152, así que
   hay que declarar el espacio o la escala verde->ámbar->rojo sale apagada. */
export const devThreeColor = (d, tol) =>
  new Color().setRGB(...E.devColor(d, tol), SRGBColorSpace);
export const devCssColor = (d, tol) => '#' + devThreeColor(d, tol).getHexString();

/* --------- geometría barrida de sección rectangular con chaflanes ------ */
export function barGeometry(path, sec, devFn) {
  const S = path.samples, L = path.total, N = S.length;
  const pos = [], col = [], idx = [];
  const hw = sec.width / 2, ht = sec.thickness / 2, ch = sec.chamfer || 0, el = sec.endLen || 0;
  const shrink = s => {                    // extremo maquinado + rampa del chaflán
    if (el <= 0 || ch <= 0) return 0;
    const d = Math.min(s, L - s);
    if (d >= el) return 0;
    if (d >= el - ch) return ch * (el - d) / ch;
    return ch;
  };
  for (let i = 0; i < N; i++) {
    const q = S[i], k = shrink(q.s);
    const w = Math.max(hw - k, .2), t = Math.max(ht - k, .2);
    const c = devFn ? devFn(q, i) : [.55, .62, .72];
    /* y = espesor, z = ancho: el doblez de plano gira alrededor del ancho y
       desvía la barra a lo largo del espesor. */
    for (const [a, b] of [[+1, +1], [-1, +1], [-1, -1], [+1, -1]]) {
      const p = q.p.clone().addScaledVector(q.y, a * t).addScaledVector(q.z, b * w);
      pos.push(p.x, p.y, p.z); col.push(c[0], c[1], c[2]);
    }
  }
  for (let i = 0; i < N - 1; i++) {
    const o = i * 4, o2 = (i + 1) * 4;
    for (let f = 0; f < 4; f++) {
      const a = o + f, b = o + (f + 1) % 4, c = o2 + (f + 1) % 4, d = o2 + f;
      idx.push(a, b, c, a, c, d);
    }
  }
  const last = (N - 1) * 4;
  idx.push(0, 2, 1, 0, 3, 2, last, last + 1, last + 2, last, last + 2, last + 3);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Vuelve a leer del CSS lo que no cuelga de un material: fondo y niebla. La
 *  rejilla y los pedestales se recogen solos en el siguiente rebuildScene(),
 *  que es lo que hace el cambio de tema. */
export function applyTheme() {
  if (!renderer) return;
  const bg = cssVar('--vpbg', '#080A0E');
  renderer.setClearColor(bg, 1);
  if (scene && scene.fog) scene.fog.color.set(bg);
  markDirty();
}

/* ------------------------------------------------------------- arranque -- */
export function initScene() {
  const cv = $('#vp');
  /* preserveDrawingBuffer hace falta para que el reporte capture toDataURL(). */
  renderer = new WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(cssVar('--vpbg', '#080A0E'), 1);
  scene = new Scene();
  scene.fog = new Fog(cssVar('--vpbg', '#080A0E'), 3000, 9000);
  camera = new PerspectiveCamera(38, 1, 5, 20000);
  camera.up.set(0, 0, 1);
  camera.position.set(1400, -1500, 900);
  controls = new OrbitControls(camera, cv);
  controls.enableDamping = true;
  controls.dampingFactor = .12;
  controls.addEventListener('change', markDirty);
  scene.add(new AmbientLight(0xffffff, 1.7));
  const d1 = new DirectionalLight(0xffffff, 2.6); d1.position.set(1, -1.4, 2); scene.add(d1);
  const d2 = new DirectionalLight(0x7fb0ff, 1.1); d2.position.set(-1.5, 1, -.6); scene.add(d2);
  root = new Group();
  root.matrixAutoUpdate = false;
  scene.add(root);
  for (const k of ['grid', 'fix', 'nom', 'var', 'meas', 'pred', 'diff', 'dev', 'marks', 'pts']) {
    groups[k] = new Group();
    root.add(groups[k]);
  }
  labelHost = $('#labels');
  onResize();
  addEventListener('resize', onResize);
  cv.addEventListener('pointerdown', pick);
  (function loop() {
    requestAnimationFrame(loop);
    if (controls.update()) dirty = true;
    if (dirty) { renderer.render(scene, camera); drawLabels(); dirty = false; }
  })();
}

let onResizeExtra = () => {};
export const setOnResize = fn => { onResizeExtra = fn; };
export function onResize() {
  const w = $('#vpwrap').clientWidth, h = $('#vpwrap').clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dirty = true;
  onResizeExtra();
}

function clearGroup(g) {
  while (g.children.length) {
    const c = g.children.pop();
    c.geometry && c.geometry.dispose();
    c.material && c.material.dispose();
    g.remove(c);
  }
}

const solidMat = () => new MeshStandardMaterial({
  vertexColors: true, roughness: .55, metalness: .3,
});
function ghost(g, color, opacity = .75) {
  const e = new EdgesGeometry(g, 28);
  return new LineSegments(e, new LineBasicMaterial({
    color, transparent: true, opacity, depthWrite: false,
  }));
}

/* --------------------------------------------------------- reconstrucción */
export function rebuildScene() {
  const M = ST.model;
  if (!M) return;
  const L = ST.layers;
  for (const k in groups) clearGroup(groups[k]);
  extraLabels = [];
  root.matrix.copy(placeMatrix());
  root.updateMatrixWorld(true);

  const ref = refModel(), anchor = ST.anchor;
  const hasMeas = ST.datasets.some(d => d.visible);

  /* --- todas las variantes visibles, ancladas al extremo elegido -------- */
  const shown = [];
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

  /* --- rejilla y pedestales -------------------------------------------- */
  if (L.grid.on) {
    const g = new GridHelper(4000, 40, cssVar('--grid1', '#2A3546'), cssVar('--grid2', '#1A212C'));
    g.rotation.x = Math.PI / 2; g.position.z = -260;
    groups.grid.add(g);
  }
  if (L.fix.on) {
    const mat = new MeshStandardMaterial({ color: cssVar('--fixture', '#3A4658'), roughness: .9, metalness: .1 });
    for (let i = 0; i < nomPis.length; i += 3) {
      const p = nomPis[i], hgt = p.z + 260;
      if (hgt <= 1) continue;
      const m = new Mesh(new BoxGeometry(28, 28, hgt), mat.clone());
      m.position.set(p.x, p.y, -260 + hgt / 2);
      groups.fix.add(m);
    }
  }

  /* --- modelo activo: sólido, es el que se está editando ---------------- */
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

  /* --- los demás modelos: alambrado en su color ------------------------- */
  if (L.var.on) {
    for (const e of shown) {
      if (e === act) continue;
      const g = barGeometry(e.path, e.m.section, null);
      const w = ghost(g, e.v.color, .85);
      w.applyMatrix4(e.A); groups.var.add(w);
      g.dispose();
    }
  }

  /* --- barras medidas --------------------------------------------------- */
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

  /* --- predicción corregida -------------------------------------------- */
  if (L.pred.on && ST.pred) {
    const p3 = E.buildPath(ST.pred);
    const g = barGeometry(p3, M.section, null);
    const w = ghost(g, L.pred.color, .85);
    w.applyMatrix4(Axf); groups.pred.add(w);
    g.dispose();
  }

  /* --- desplazamiento entre modelos ------------------------------------ */
  /* Es la lectura principal al comparar diseños: con un extremo fijo, cada PI
     de una variante se une con el PI homólogo de la referencia y el color dice
     cuánto se movió. La escala es relativa al MAYOR desplazamiento del cuadro,
     no a la tolerancia: aquí se comparan diseños, no piezas contra tolerancia. */
  if (L.diff.on && shown.length > 1) {
    const rp = (shown.find(e => e.v.id === ST.ref) || {}).pis
      || E.anchoredPis(ref, ref, anchor);
    const segs = [], mags = [];
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
      const pos = [], col = [];
      segs.forEach(([p, q], i) => {
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
    const rq = rp.at(k);
    const dia = new OctahedronGeometry(11);
    for (const e of shown) {
      const q = e.pis.at(k);
      const m = new Mesh(dia.clone(), new MeshBasicMaterial({ color: e.v.color }));
      m.position.copy(q);
      groups.diff.add(m);
      const d = q.distanceTo(rq);
      if (d > .01) extraLabels.push({ p: q.clone(), txt: d.toFixed(1) + ' mm', color: e.v.color });
    }
    dia.dispose();
  }

  /* --- puntos de referencia -------------------------------------------- */
  /* Cotas sueltas: cada punto se une con el PI más cercano del modelo activo
     y la cifra dice a cuánto quedó. Sirve para acotar contra el fixture o un
     datum de taller, no contra otro modelo. */
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

  /* --- puntos PI -------------------------------------------------------- */
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

  /* --- vectores de desviación (piezas medidas) -------------------------- */
  if (L.dev.on && ST.datasets.length) {
    const pos = [], col = [];
    for (const ds of ST.datasets) {
      if (!ds.visible) continue;
      const Q = E.applyMat(Axf, ds.pis);
      for (let i = 0; i < Math.min(Q.length, nomPis.length); i++) {
        const a = nomPis[i], d = Q[i].clone().sub(a);
        const e2 = a.clone().addScaledVector(d, ST.view.exag);
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
  dirty = true;
}

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
  if (!any) E.fk(ST.model).pis.forEach(p => box.expandByPoint(p.clone().applyMatrix4(W)));
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
  controls.update(); dirty = true;
}
export function setView(v) {
  if (!ST.model) return;
  const box = modelBox();
  const c = box.getCenter(V3()), r = box.getSize(V3()).length() / 2 || 500, d = r * 2.6;
  const dirs = { iso: [.75, -.85, .55], top: [0, -.001, 1], front: [0, -1, 0], side: [1, 0, 0] };
  const u = new Vector3(...dirs[v]).normalize();
  controls.target.copy(c);
  camera.position.copy(c).addScaledVector(u, d);
  controls.update(); dirty = true;
}

/* --------------------------------------------------------------- picking */
const ray = new Raycaster(), mouse = new Vector2();
function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(groups.pts.children, false)[0];
  if (hit && hit.object.userData.pi !== undefined) onPick(hit.object.userData.pi - 1);
}

/* -------------------------------------------------------------- etiquetas */
export function drawLabels() {
  if (!ST.model || !labelHost) return;
  const out = [];
  const w = labelHost.clientWidth, h = labelHost.clientHeight;
  const W = placeMatrix();
  const put = (p, html) => {
    const v = p.clone().applyMatrix4(W).project(camera);
    if (v.z > 1) return;
    const x = (v.x * .5 + .5) * w, y = (-v.y * .5 + .5) * h;
    if (x < -60 || y < -20 || x > w + 60 || y > h + 20) return;
    out.push(`<div class="lbl" style="left:${x.toFixed(0)}px;top:${(y - 16).toFixed(0)}px">${html}</div>`);
  };
  if (ST.layers.lbl.on) {
    const act = ST.variants.find(v => v.id === ST.active);
    const P = act
      ? E.anchoredPis(E.effectiveModel(act), refModel(), ST.anchor)
      : E.fk(ST.model).pis;
    for (let i = 1; i < P.length - 1; i++) {
      put(P[i], `<span style="color:${i - 1 === ST.sel ? '#fff' : 'var(--dim)'}">B${i}</span>`);
    }
  }
  for (const l of extraLabels) put(l.p, `<span style="color:${l.color}">${l.txt}</span>`);
  labelHost.innerHTML = out.join('');
}

/** Captura las 4 vistas como PNG para el reporte. Deja la cámara como estaba. */
export function captureViews() {
  const keep = { pos: camera.position.clone(), tgt: controls.target.clone() };
  const shots = [];
  for (const v of ['iso', 'top', 'front', 'side']) {
    setView(v);
    renderer.render(scene, camera);
    shots.push([v, renderer.domElement.toDataURL('image/png')]);
  }
  camera.position.copy(keep.pos);
  controls.target.copy(keep.tgt);
  controls.update();
  dirty = true;
  return shots;
}
