/* =========================================================================
   ESCENARIO — el renderer, la cámara, los dos grupos de la escena (`world` el
   taller, `root` la pieza), el bucle de render bajo demanda, el picking, el
   gizmo de ejes y las etiquetas flotantes. Todo lo que las capas y `build.ts`
   necesitan pero que no forma parte de una capa en sí.
   ========================================================================= */
import {
  WebGLRenderer, Scene, Fog, PerspectiveCamera, Group, AmbientLight,
  DirectionalLight,
  BufferGeometry, EdgesGeometry, LineSegments,
  LineBasicMaterial, MeshStandardMaterial,
  Color, Vector2, Vector3, Matrix4, Raycaster, SRGBColorSpace,
} from 'three';
import type { Object3D } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as E from '../engine.ts';
import { ST, refModel, placeMatrix } from '../state.ts';
import { T } from '../i18n.ts';
import { esc, safeColor } from '../safe.ts';
import { $ } from '../dom.ts';
import type { ExtraLabel, PickHandler, Disposable, GizmoArm } from './types.ts';

export let renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, controls: OrbitControls;
/* Hay DOS grupos en la escena y la diferencia importa:

     world   el taller. La cuadrícula del suelo y los pedestales. Matriz
             identidad: no se mueve nunca.
     root    la PIEZA y todo lo que se mide contra ella. Su matriz es la
             COLOCACIÓN, así que girar o mover la colocación gira y mueve la
             pieza sobre un suelo quieto, con la cámara donde estaba.

   Los pedestales se construyen desde los PI ya colocados, para que sigan
   apoyando en el suelo esté donde esté la pieza. */

/* Todo lo dibujado cuelga de `root`, cuya matriz es la COLOCACIÓN. Así girar o
   mover la pieza en el espacio no toca ni un dato del modelo: es una sola
   matriz sobre la escena entera, y la comparación entre modelos no cambia. */
export let root: Group, world: Group;
export const groups: Record<string, Group> = {};
let labelHost: HTMLElement | null, gizmoHost: HTMLElement | null, dirty = true;
export const extraLabels: ExtraLabel[] = [];
export const clearLabels = (): void => { extraLabels.length = 0; };
let onPick: PickHandler = () => {};
export const setOnPick = (fn: PickHandler): void => { onPick = fn; };
export const markDirty = (): void => { dirty = true; };


export const V3 = (x?: number, y?: number, z?: number): Vector3 => new Vector3(x, y, z);
/** Lee un token de color de :root. Ni el 3D ni la cinta llevan colores
 *  propios: los toman del CSS en tiempo de ejecución, así que el tema claro se
 *  define UNA vez, en app.css, y aquí no hay una segunda paleta que mantener. */
export const cssVar = (n: string, fb = '#000'): string =>
  (getComputedStyle(document.documentElement).getPropertyValue(n) || '').trim() || fb;

/* devColor() habla en sRGB; three trabaja en linear-sRGB desde r152, así que
   hay que declarar el espacio o la escala verde->ámbar->rojo sale apagada. */
/* devColor() devuelve number[] genérico aunque siempre entrega exactamente
   tres componentes RGB; de ahí la tupla. */
export const devThreeColor = (d: number, tol: number): Color =>
  new Color().setRGB(...E.devColor(d, tol) as [number, number, number], SRGBColorSpace);
export const devCssColor = (d: number, tol: number): string => '#' + devThreeColor(d, tol).getHexString();

/** ¿De cuál de los dos grupos cuelga una capa? El taller (`world`) no lo mueve
 *  la colocación; la pieza (`root`) sí. Existe para que el banco de pruebas
 *  pueda vigilar que la cuadrícula no se vaya a `root` en un descuido. */
export const groupHost = (k: string): 'world' | 'root' =>
  (groups[k] && groups[k].parent === world) ? 'world' : 'root';

/** Vuelve a leer del CSS lo que no cuelga de un material: fondo y niebla. La
 *  rejilla y los pedestales se recogen solos en el siguiente rebuildScene(),
 *  que es lo que hace el cambio de tema. */
export function applyTheme(): void {
  if (!renderer) return;
  const bg = cssVar('--vpbg', '#080A0E');
  renderer.setClearColor(bg, 1);
  if (scene && scene.fog) scene.fog.color.set(bg);
  markDirty();
}

/* ------------------------------------------------------------- arranque -- */
export function initScene(): void {
  /* #vp es el canvas fijo de index.html; initScene() se llama tras el DOM listo. */
  const cv = $<HTMLCanvasElement>('#vp')!;
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
  /* el taller: no lo toca la colocación */
  world = new Group();
  scene.add(world);
  /* la pieza: su matriz es la colocación */
  root = new Group();
  root.matrixAutoUpdate = false;
  scene.add(root);
  for (const k of ['nom', 'var', 'meas', 'pred', 'held', 'diff', 'dev', 'marks', 'pts']) {
    groups[k] = new Group();
    root.add(groups[k]);
  }
  /* Los pines están atornillados a la mesa igual que los pedestales: van en
     `world`, que la colocación de la pieza no toca. */
  for (const k of ['grid', 'fix', 'pins']) {
    groups[k] = new Group();
    world.add(groups[k]);
  }
  labelHost = $('#labels');
  gizmoHost = $('#gizmo');
  onResize();
  addEventListener('resize', onResize);
  cv.addEventListener('pointerdown', pick);
  (function loop() {
    requestAnimationFrame(loop);
    if (controls.update()) dirty = true;
    if (dirty) { renderer.render(scene, camera); drawLabels(); drawGizmo(); dirty = false; }
  })();
}

let onResizeExtra: () => void = () => {};
export const setOnResize = (fn: () => void): void => { onResizeExtra = fn; };
export function onResize(): void {
  /* #vpwrap es el contenedor fijo del viewport; existe siempre que hay canvas. */
  const w = $('#vpwrap')!.clientWidth, h = $('#vpwrap')!.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dirty = true;
  onResizeExtra();
}

export function clearGroup(g: Group): void {
  while (g.children.length) {
    /* el bucle exige children.length > 0: pop() siempre da un elemento aquí. */
    const c: Object3D & Partial<Disposable> = g.children.pop()!;
    c.geometry && c.geometry.dispose();
    c.material && c.material.dispose();
    g.remove(c);
  }
}

export const solidMat = (): MeshStandardMaterial => new MeshStandardMaterial({
  vertexColors: true, roughness: .55, metalness: .3,
});
export function ghost(g: BufferGeometry, color: string, opacity = .75): LineSegments {
  const e = new EdgesGeometry(g, 28);
  return new LineSegments(e, new LineBasicMaterial({
    color, transparent: true, opacity, depthWrite: false,
  }));
}

/* --------------------------------------------------------------- picking */
const ray = new Raycaster(), mouse = new Vector2();
function pick(ev: PointerEvent | MouseEvent) {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(groups.pts.children, false)[0];
  if (hit && hit.object.userData.pi !== undefined) onPick(hit.object.userData.pi - 1);
}

/* ------------------------------------------------------------------ ejes --
   Indicador de orientación en la esquina. Gira con la cámara Y con la
   colocación de la pieza, así que siempre dice hacia dónde apunta cada eje DEL
   MODELO: `x` el eje de la barra, `y` el espesor, `z` el ancho.

   Los colores no son los rojo/verde/azul de costumbre: en este programa el rojo
   ya significa fuera de tolerancia. Se reusan los de las insignias W/T, así que
   el eje del espesor se lee del mismo color que un doblez de plano y el del
   ancho del mismo color que uno de canto. */
const GIZMO_AXES: [GizmoArm['k'], Vector3, string][] = [
  ['x', new Vector3(1, 0, 0), '--txt'],
  ['y', new Vector3(0, 1, 0), '--oriT'],
  ['z', new Vector3(0, 0, 1), '--oriW'],
];

export function drawGizmo() {
  if (!gizmoHost || !camera) return;
  /* solo la rotación: es un widget de tamaño fijo, sin perspectiva ni traslación */
  const M = new Matrix4().extractRotation(camera.matrixWorldInverse)
    .multiply(new Matrix4().extractRotation(placeMatrix()));
  const c = 34, len = 23;
  const arms = GIZMO_AXES.map(([k, v, tok]) => {
    const d = v.clone().applyMatrix4(M);      // en vista: +x derecha, +y arriba
    return { k, tok, x: c + d.x * len, y: c - d.y * len, z: d.z };
  }).sort((a, b) => a.z - b.z);               // pintor: primero lo que queda atrás
  const arm = (a: GizmoArm) => {
    const col = cssVar(a.tok, '#8892A0');
    const op = a.z < -.15 ? '.4' : '1';       // apagado el que apunta hacia dentro
    const x = a.x.toFixed(1), y = a.y.toFixed(1);
    return `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}" stroke="${col}"
        stroke-width="1.6" stroke-linecap="round" opacity="${op}"/>
      <circle cx="${x}" cy="${y}" r="7.5" fill="${col}" opacity="${op}"/>
      <text x="${x}" y="${(a.y + 3.2).toFixed(1)}" text-anchor="middle" font-size="9"
        font-weight="600" fill="var(--bg)" opacity="${op}">${T(a.k)}</text>`;
  };
  gizmoHost.innerHTML =
    `<svg width="68" height="68" viewBox="0 0 68 68">${arms.map(arm).join('')}</svg>`;
}

/* -------------------------------------------------------------- etiquetas */
export function drawLabels() {
  if (!ST.model || !labelHost) return;
  const out: string[] = [];
  const w = labelHost.clientWidth, h = labelHost.clientHeight;
  const W = placeMatrix();
  const put = (p: Vector3, html: string, cls = '') => {
    const v = p.clone().applyMatrix4(W).project(camera);
    if (v.z > 1) return;
    const x = (v.x * .5 + .5) * w, y = (-v.y * .5 + .5) * h;
    if (x < -60 || y < -20 || x > w + 60 || y > h + 20) return;
    out.push(`<div class="lbl ${cls}" style="left:${x.toFixed(0)}px;top:${(y - 16).toFixed(0)}px">${html}</div>`);
  };
  if (ST.layers.lbl.on) {
    const act = ST.variants.find(v => v.id === ST.active);
    const P = act
      ? E.anchoredPis(E.effectiveModel(act), refModel(), ST.anchor)
      : E.fk(ST.model).pis;
    for (let i = 1; i < P.length - 1; i++) {
      /* el color va por CLASE, no por estilo: un #fff a pelo era blanco sobre
         blanco en tema claro, y la etiqueta del doblez seleccionado —justo la
         que hay que poder leer— desaparecía */
      put(P[i], `B${i}`, i - 1 === ST.sel ? 'sel' : '');
    }
  }
  /* Lo único de aquí que NO lo escribe el programa: el texto sale del nombre
     que alguien le puso a una cota y el color del que traía el archivo. Los dos
     acaban en un innerHTML —el texto como HTML y el color dentro de un atributo
     entrecomillado—, así que los dos pasan por el filtro. Bajo file:// un
     `<img onerror>` colado por el nombre de una cota corre con acceso al disco
     del taller, y el .json va y viene por USB. */
  for (const l of extraLabels) {
    put(l.p, `<span class="swatch" style="background:${safeColor(l.color)}"></span>${esc(l.txt)}`);
  }
  labelHost.innerHTML = out.join('');
}
