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
import { ST, anchoredShownPis, placeMatrix, shownBasis } from '../state.ts';
import { T } from '../i18n.ts';
import { esc, safeColor } from '../safe.ts';
import { $ } from '../dom.ts';
import { edgesGeometry } from './geometry.ts';
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
/* Exportado, y el banco lo usa: contar lo que cuelga de UNA capa es la única
   forma de comprobar desde fuera que esa capa dibujó algo. */
export const groups: Record<string, Group> = {};
let labelHost: HTMLElement | null, gizmoHost: HTMLElement | null, dirty = true;
export const extraLabels: ExtraLabel[] = [];
export const clearLabels = (): void => { extraLabels.length = 0; };
let onPick: PickHandler = () => {};
export const setOnPick = (fn: PickHandler): void => { onPick = fn; };
export const markDirty = (): void => { dirty = true; };

/* --------------------------------------------------------------- avisos --
   Una sola franja sobre el 3D para lo que el programa no puede arreglar solo:
   la gráfica que suelta el contexto y un fallo inesperado. Sobre el 3D y no en
   un alert(), porque ninguno de los dos pide una decisión: pide saberlo, y un
   diálogo modal a mitad de una comparación estorba más que el propio fallo. */
let noteHost: HTMLElement | null = null, noteKind: 'gl' | 'err' | null = null, glLost = false;

export function setNote(text: string | null, kind: 'gl' | 'err' = 'err'): void {
  noteKind = text ? kind : null;
  if (!noteHost) return;
  noteHost.hidden = !text;
  const close = esc(T('faultClose'));
  noteHost.innerHTML = text
    ? `<span>${esc(text)}</span><button type="button" class="xbtn" aria-label="${close}" title="${close}">✕</button>`
    : '';
}

/** Un fallo que no debería haber pasado: se dice en pantalla y NO se traga.
 *  `reportError()` lo entrega a `window.onerror` igual que si nadie lo hubiera
 *  atrapado, así que la consola lo enseña con su pila y el banco de pruebas lo
 *  sigue contando como fallo. Lo único que cambia es que el resto del programa
 *  sigue funcionando. */
export function fault(err: unknown): void {
  showFault(err);
  if (typeof reportError === 'function') reportError(err);
  else setTimeout(() => { throw err; });
}

/** Solo el aviso, sin volver a lanzar: es lo que usa el manejador global de
 *  `window`, que ya está recibiendo el fallo y lo relanzaría en bucle. */
export function showFault(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  setNote(T('faultMsg').replace('{e}', msg));
}


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
  /* SIN preserveDrawingBuffer. Pedía al navegador conservar cada fotograma
     entero hasta el siguiente, y en una gráfica integrada eso se paga en TODOS
     los fotogramas para servir a una sola función, la captura del reporte. Que
     no lo necesita: `captureViews()` dibuja y lee el lienzo en la misma tarea,
     antes de que el navegador componga y borre el búfer. Lo vigila el banco. */
  renderer = new WebGLRenderer({ canvas: cv, antialias: true });
  /* Tope en 1.5 y no en 2. Con antialias, una pantalla escalada al 200 % pedía
     cuatro veces los píxeles de una normal, y el portátil del taller es justo el
     que no los tiene; a 1.5 son 2.25 veces. Se pierde algo de nitidez en las
     líneas finas a cambio de que girar la pieza no vaya a saltos. En pantallas
     normales (escala 100 % o 150 %) no cambia nada. */
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
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
  noteHost = $('#vpnote');
  noteHost?.addEventListener('click', e => {
    if ((e.target as HTMLElement).closest('button')) setNote(null);
  });
  /* La gráfica puede SOLTAR el contexto WebGL: al suspender el portátil, al
     cambiar de monitor o cuando el controlador se reinicia, que en las gráficas
     integradas pasa. Sin esto el 3D se quedaba negro sin decir nada y parecía
     que se había perdido la pieza. three se recupera solo cuando el navegador
     devuelve el contexto —vuelve a subir geometrías y materiales en el
     siguiente dibujo—; lo que faltaba era no dibujar mientras tanto, y decirlo. */
  cv.addEventListener('webglcontextlost', e => {
    /* sin preventDefault el navegador no devuelve el contexto nunca. three ya
       lo llama en su propia escucha; se repite aquí para no depender de eso */
    e.preventDefault();
    glLost = true;
    setNote(T('glLost'), 'gl');
  });
  cv.addEventListener('webglcontextrestored', () => {
    glLost = false;
    if (noteKind === 'gl') setNote(null);
    dirty = true;
  });
  onResize();
  addEventListener('resize', onResize);
  cv.addEventListener('pointerdown', pick);
  (function loop() {
    requestAnimationFrame(loop);
    if (glLost) return;
    /* Un fallo al dibujar no puede repetirse sesenta veces por segundo: `dirty`
       se baja ANTES de dibujar, así que el siguiente intento es el del siguiente
       cambio, y el fallo se dice una vez. */
    try {
      if (controls.update()) dirty = true;
      if (dirty) { dirty = false; renderer.render(scene, camera); drawLabels(); drawGizmo(); }
    } catch (err) { fault(err); }
  })();
}

let onResizeExtra: () => void = () => {};
export const setOnResize = (fn: () => void): void => { onResizeExtra = fn; };
export function onResize(): void {
  /* #vpwrap es el contenedor fijo del viewport; existe siempre que hay canvas. */
  const w = $('#vpwrap')!.clientWidth, h = $('#vpwrap')!.clientHeight;
  /* Un contenedor de 0 px no es un tamaño, es una banda escondida: en un
     teléfono con el teclado abierto el 3D se quita de en medio y #vpwrap
     queda en 0×0. Seguir adelante ahí hace daño y no arregla nada — medido:
     el lienzo pasa de 390×338 a 0×0, `camera.aspect` se queda en NaN y la
     matriz de proyección sale ENTERA en NaN, que es la que usan las
     etiquetas y el gizmo para proyectar. Se recupera al volver, pero entre
     medias el búfer de dibujo se tira y se reasigna en cada celda que se
     toca. Con la guarda, la cámara conserva el último tamaño bueno y al
     reaparecer la banda el observador la vuelve a medir. */
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dirty = true;
  onResizeExtra();
}

/* --- lo que NO se tira al vaciar un grupo -------------------------------
   Doscientos puntos PI son doscientas veces la MISMA esfera, y hasta aquí cada
   uno se llevaba su propia copia: una geometría y un material por punto, todos
   construidos, subidos a la GPU y destruidos en cada reconstrucción — y una
   reconstrucción es cada tecla que se pulsa en la tabla.

   Peor todavía por cómo clona three: `SphereGeometry.clone()` llama al
   constructor PARAMÉTRICO sin argumentos, así que teselaba una esfera de 32×16
   entera —561 vértices— solo para pisarla acto seguido con la copia. Medido con
   30 dobleces, 4 modelos y 3 piezas: el 24 % del tiempo de reconstrucción se
   iba ahí dentro.

   La esfera es la misma para todos, así que se construye UNA y se comparte. Lo
   que cambia por punto —posición, escala y color— vive en la malla y en el
   material, no en la geometría. Lo mismo con los rombos de choque, de cota y de
   diferencia.

   El precio es que `clearGroup()` ya no puede tirar a ciegas: lo compartido se
   apunta aquí y se salta. No es una fuga —son unas pocas geometrías fijas que
   duran lo que la pestaña— y la sonda de medición lo vigila contando
   `renderer.info.memory.geometries` a lo largo de diez reconstrucciones: lo que
   no puede pasar es que el número CREZCA.

   El MATERIAL sigue siendo uno por malla y se sigue tirando: ahí va el color,
   que es distinto en cada punto, y compartirlo pedía un material por color.
   Medido: los materiales eran el 0.2 % del tiempo, así que no vale el enredo. */
const compartidas = new Map<string, BufferGeometry>();
const esCompartida = new Set<BufferGeometry>();

/** Una geometría que se reparte entre muchas mallas. `make` solo corre la
 *  primera vez; a partir de ahí es una búsqueda en un mapa. */
export function sharedGeometry(key: string, make: () => BufferGeometry): BufferGeometry {
  let g = compartidas.get(key);
  if (!g) { g = make(); compartidas.set(key, g); esCompartida.add(g); }
  return g;
}

export function clearGroup(g: Group): void {
  while (g.children.length) {
    /* el bucle exige children.length > 0: pop() siempre da un elemento aquí. */
    const c: Object3D & Partial<Disposable> = g.children.pop()!;
    if (c.geometry && !esCompartida.has(c.geometry)) c.geometry.dispose();
    c.material && c.material.dispose();
    g.remove(c);
  }
}

export const solidMat = (): MeshStandardMaterial => new MeshStandardMaterial({
  vertexColors: true, roughness: .55, metalness: .3,
});
export function ghost(g: BufferGeometry, color: string, opacity = .75): LineSegments {
  const e = edgesGeometry(g, 28);
  return new LineSegments(e, new LineBasicMaterial({
    color, transparent: true, opacity, depthWrite: false,
  }));
}

/** Las aristas TAL COMO LAS SACA THREE, solo para que el banco pueda comparar.
 *
 *  `edgesGeometry()` reescribe a mano el algoritmo de `EdgesGeometry` para
 *  quitarle las cadenas de texto, y una reimplementación a mano de algo que ya
 *  trae la librería no se sostiene sin la original al lado con que compararla:
 *  el banco fantasmea la escena entera y exige las dos salidas vértice a
 *  vértice, con desvío exactamente 0. Lo que cuesta es la clase en el paquete,
 *  que se mide en el commit. */
export const edgesRef = (g: BufferGeometry): BufferGeometry => new EdgesGeometry(g, 28);

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
   Indicador de orientación en la esquina. Gira con la cámara Y con la pieza,
   así que dice hacia dónde apunta cada eje de la SECCIÓN: `x` la dirección de
   la barra, `y` el espesor, `z` el ancho.

   DE QUÉ ESTACIÓN, que es la corrección del 2026-09-21: del doblez
   seleccionado, y del amarre cuando no hay ninguno. Hasta entonces pintaba los
   ejes del MODELO —el marco de la estación 0— mientras prometía esos tres
   nombres, y esos tres nombres solo valen a la vez en la recta de entrada: en
   la demo el eje de la barra en la punta forma **175.5°** con el `x` del
   modelo, así que la flecha llamada «eje de la barra» apuntaba casi justo al
   revés que la barra. Reportado desde el taller como «los ejes no me coinciden
   con la pieza», y era literal.

   Y lleva las DOS matrices de la pieza dibujada, no solo la colocación: ver
   `shownBasis()` en state.ts.

   Los colores no son los rojo/verde/azul de costumbre: en este programa el rojo
   ya significa fuera de tolerancia. Se reusan los de las insignias W/T, así que
   el eje del espesor se lee del mismo color que un doblez de plano y el del
   ancho del mismo color que uno de canto. */
const GIZMO_AXES: [GizmoArm['k'], string][] = [
  ['x', '--txt'], ['y', '--oriT'], ['z', '--oriW'],
];

export function drawGizmo() {
  if (!gizmoHost || !camera || !ST.model) return;
  /* solo la rotación de la cámara: es un widget de tamaño fijo, sin
     perspectiva ni traslación. La de la pieza ya viene dentro del marco. */
  const M = new Matrix4().extractRotation(camera.matrixWorldInverse);
  const base = shownBasis();
  const c = 34, len = 23;
  const arms = GIZMO_AXES.map(([k, tok], i) => {
    const d = base[i].clone().applyMatrix4(M);   // en vista: +x derecha, +y arriba
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
  /* El rótulo dice DE DÓNDE es el marco. Sin él el widget vuelve a prometer
     tres nombres sin decir dónde valen, que es el fallo que se acaba de
     arreglar. */
  const est = ST.sel >= 0 && ST.sel < ST.model.bends.length
    ? T('gizmoBend').replace('%b', String(ST.sel + 1)) : T('gizmoClamp');
  const html = `<svg width="68" height="68" viewBox="0 0 68 68"
      role="img" aria-label="${esc(est)}"><title>${esc(est)}</title>${arms.map(arm).join('')}</svg>`;
  /* se dibuja en cada fotograma que cambia algo: si los ejes no se han movido
     —se ha tocado una capa, no la cámara— no hay SVG que rehacer */
  if (html !== gizmoHtml) { gizmoHost.innerHTML = html; gizmoHtml = html; }
}
let gizmoHtml = '';

/* -------------------------------------------------------------- etiquetas */
/* Las etiquetas se REUTILIZAN: un nodo por etiqueta visible, que se mueve de
   sitio en cada fotograma y solo se reescribe si cambia su texto. Hasta el
   2026-09-14 se rehacía el innerHTML entero en cada fotograma de giro —destruir
   y crear todos los nodos sesenta veces por segundo— y en un PC modesto eso se
   notaba más que el propio WebGL. Los que sobran se QUITAN, no se esconden: el
   banco lee `#labels` como texto y una etiqueta escondida seguiría ahí. */
const lblPool: HTMLDivElement[] = [], lblHtml: string[] = [];

export function drawLabels() {
  if (!ST.model || !labelHost) return;
  const host = labelHost;
  let n = 0;
  const w = host.clientWidth, h = host.clientHeight;
  const W = placeMatrix();
  const put = (p: Vector3, html: string, cls = '') => {
    const v = p.clone().applyMatrix4(W).project(camera);
    if (v.z > 1) return;
    const x = (v.x * .5 + .5) * w, y = (-v.y * .5 + .5) * h;
    if (x < -60 || y < -20 || x > w + 60 || y > h + 20) return;
    let el = lblPool[n];
    if (!el) { el = document.createElement('div'); lblPool.push(el); lblHtml.push(''); host.appendChild(el); }
    const c = cls ? 'lbl ' + cls : 'lbl';
    if (el.className !== c) el.className = c;
    if (lblHtml[n] !== html) { el.innerHTML = html; lblHtml[n] = html; }
    el.style.left = x.toFixed(0) + 'px';
    el.style.top = (y - 16).toFixed(0) + 'px';
    n++;
  };
  if (ST.layers.lbl.on) {
    /* Sobre la barra que se muestra, igual que las esferas de los PI: con la
       sujeta en pantalla, «B3» flotando donde estaría la libre señala un doblez
       que no está ahí. Y anclada contra la referencia LIBRE, que es como se
       coloca todo: anclarla contra la elegida la movía al tocar un pedestal. */
    const P = anchoredShownPis();
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
  while (lblPool.length > n) { lblPool.pop()!.remove(); lblHtml.pop(); }
}
