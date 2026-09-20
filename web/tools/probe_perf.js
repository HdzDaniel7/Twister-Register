/* Sonda de MEDICIÓN, no de conducta. Corre dentro de la página con el mismo
   lanzador que el banco:

     node tools/ui_test.mjs <página> tools/probe_perf.js

   Aviso que hay que tener presente al leer las cifras: Edge headless va por
   SwiftShader (GL por software), así que los milisegundos absolutos son un
   techo pesimista y no la máquina del usuario. Lo que sí vale es la
   COMPARACIÓN: 15 dobleces contra 60, antes contra después, y la parte de
   motor (CPU pura, sin GPU) contra el total.                               */
const out = [];
const say = (s) => out.push(s);
const B = window.BARCOMP;
const { ST, E } = B;

/* mediana, no media: una pausa del recolector de basura en una sola pasada
   arrastra la media entera y no dice nada del coste típico. */
const med = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};
const ms = (v) => v.toFixed(2).padStart(8) + ' ms';
/* `rep` es para lo barato: performance.now() en el navegador viene redondeado
   a ~0.1 ms, así que medir una llamada de 20 µs devuelve 0. Se cronometra un
   paquete de `rep` llamadas y se reparte. */
const timeIt = (fn, n, rep = 1) => {
  const t = [];
  for (let i = 0; i < n; i++) {
    const a = performance.now();
    for (let r = 0; r < rep; r++) fn();
    t.push((performance.now() - a) / rep);
  }
  return t;
};
/* espera a que el bucle de animación pinte de verdad un cuadro */
const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
const pisVivos = () => B.groups.pts.children.length;

/* Pone la variante activa a `n` dobleces repitiendo el patrón del demo. Hace a
   mano lo que hace syncModel(), que no está expuesto. */
function setBends(n) {
  const v = ST.variants.find(x => x.id === ST.active);
  const src = v.base.bends;
  const bends = [];
  for (let i = 0; i < n; i++) bends.push(E.bendFrom(src[i % src.length]));
  v.base.bends = bends;
  v.deltas = E.zeroDeltas(n);
  ST.model = E.effectiveModel(v);
  ST.command = ST.model.bends.map(b => E.bendFrom(b));
  ST.sel = -1;
}

async function block(n) {
  setBends(n);
  B.rebuildScene();                              // calentar: la primera compila shaders
  timeIt(() => B.rebuildScene(), 5);
  await frame();

  const t = timeIt(() => B.rebuildScene(), 30);

  /* FUGAS: info.memory solo cuenta lo que ya subió a la GPU, así que entre
     reconstrucciones sin cuadro de por medio siempre marca 0. Hay que pintar
     un cuadro después de cada reconstrucción para que la cuenta signifique
     algo: si dispose() no cerrara, aquí se vería crecer. */
  await frame();
  const geo0 = B.renderer.info.memory.geometries;
  for (let i = 0; i < 10; i++) { B.rebuildScene(); await frame(); }
  const geo1 = B.renderer.info.memory.geometries;

  /* la parte de motor, sin three: es lo que costaría en cualquier máquina */
  const tp = timeIt(() => E.buildPath(ST.model), 30, 5);
  const tf = timeIt(() => E.fk(ST.model), 30, 50);

  const path = E.buildPath(ST.model);
  say(`  ${String(n).padStart(3)} dobleces`);
  say(`    rebuildScene()       ${ms(med(t))}   (min ${med([Math.min(...t)]).toFixed(2)}, max ${Math.max(...t).toFixed(2)})`);
  say(`    de eso, E.buildPath()${ms(med(tp))}   ${(100 * med(tp) / med(t)).toFixed(0)} % del total`);
  say(`    de eso, E.fk()       ${ms(med(tf))}`);
  say(`    muestras de la traza ${String(path.samples.length).padStart(6)}`);
  say(`    geometrías en GPU    ${String(geo1).padStart(6)}   (antes de 10 reconstrucciones con cuadro: ${geo0})`);
  say(`    fuga por reconstrucción ${geo1 <= geo0 ? 'NO — dispose() cierra' : 'SÍ, ' + ((geo1 - geo0) / 10).toFixed(1) + ' geometrías/vez'}`);
  say('');
}

return (async () => {
say('== coste de la escena ==');
say('');
await block(15);
await block(60);

/* Arrastrar el deslizador de exageración dispara un rebuildScene() por evento
   `input`. Es el peor camino de la interfaz, y el que dice si arrastrar es
   fluido: 60 eventos seguidos es más o menos un segundo de arrastre real. */
setBends(15);
const drag = timeIt(() => { ST.view.exag = 1 + Math.random(); B.rebuildScene(); }, 60);
const tot = drag.reduce((a, b) => a + b, 0);
say('== arrastre del deslizador de exageración, 60 eventos ==');
say(`  por evento        ${ms(med(drag))}`);
say(`  total             ${ms(tot)}`);
say(`  techo de cuadros  ${(1000 / med(drag)).toFixed(0)} /s  (si el arrastre emitiera un evento por cuadro)`);
say(`  geometrías vivas al final ${B.renderer.info.memory.geometries}`);
say('');

/* ¿El bucle dibuja de balde? El render es bajo demanda: sin tocar nada, el
   contador de cuadros de three no debería moverse.

   NO SE METE NADA entre `f0` y el setTimeout. La ventana de reposo empieza en
   `f0`, así que cualquier código puesto ahí en medio se cuenta como si la
   aplicación hubiera dibujado sola. El 2026-09-19 un bloque insertado justo
   ahí hizo que esta medición diera 7 cuadros en vez de 0, tres veces de tres,
   y pareció una regresión del render bajo demanda: eran los suyos —seis
   `await frame()` en tres vueltas más la reconstrucción final—. */
ST.view.exag = 1;
B.rebuildScene();
await frame();
const f0 = B.renderer.info.render.frame;
await new Promise(res => setTimeout(() => {
  const df = B.renderer.info.render.frame - f0;
  say('== el paso de deshacer ==');
  const snap = () => JSON.stringify(E.toDoc(ST.model, ST.command, ST.comp, ST.proc,
    ST.datasets, ST.variants, ST.ref, ST.anchor,
    { place: ST.place, marks: ST.marks, tweak: ST.tweak }));
  const ts = timeIt(snap, 30, 50);
  say(`  serializar el documento ${(med(ts) * 1000).toFixed(0).padStart(6)} µs`.padEnd(34) + `  ${(snap().length / 1024).toFixed(1)} KB por paso`);
  say(`  50 pasos ocupan ${(50 * snap().length / 1024 / 1024).toFixed(2)} MB`);
  say('');
  say('== bucle de animación en reposo, 2 s sin tocar nada ==');
  say(`  cuadros dibujados ${df}   ${df <= 1 ? '(render bajo demanda: no gasta)' : '(GASTA cuadros de balde)'}`);
  /* `render.calls` lo pone three a cero en CADA render, así que no es un
     acumulado y restarle un valor de antes no significa nada: es el número de
     llamadas del ÚLTIMO cuadro que se dibujó, sea de cuándo sea. Se dice así. */
  say(`  llamadas de dibujo del último cuadro dibujado ${B.renderer.info.render.calls}`);
  say('');
  say('== memoria de la GPU al terminar ==');
  say(`  geometrías ${B.renderer.info.memory.geometries} · texturas ${B.renderer.info.memory.textures} · programas ${B.renderer.info.programs.length}`);
  res(null);
}, 2000));

/* --- coste por PIEZA MEDIDA en pantalla ---------------------------------
   Es la otra mitad del aplazamiento de `InstancedMesh`: los PI se dibujan con
   un Mesh y una esfera CLONADA por punto y por pieza visible (`layers.ts`,
   layerPts), así que el número de mallas es (dobleces+2) × piezas. El
   aplazamiento decía «primero medir con el número real de piezas», y ese
   número no lo sabe este repositorio — pero la CURVA sí se puede dar, para que
   la respuesta del taller se lea directamente de ella.

   Va EL ÚLTIMO, y ahora se sabe por qué. Al escribirlo quedó empalmado entre
   `const f0 = …` y el setTimeout de la medición de reposo, o sea DENTRO de la
   ventana ya abierta, y esa medición pasó de 0 a 7 cuadros. Pareció una
   regresión del render bajo demanda y no lo era: los 7 son los suyos —dos
   `await frame()` por cada una de las tres vueltas, más la reconstrucción que
   deja la escena limpia—, y las «cero llamadas de dibujo» eran la resta de un
   contador que three pone a cero en cada render. Reproducido 3 de 3 el
   2026-09-19 reinsertándolo ahí, y 0 de 8 con el bloque entero antes de `f0`.
   La aplicación no dibujó de balde en ningún momento. */
setBends(15);
ST.datasets.length = 0;
say('');
say('== coste por pieza medida en pantalla, 15 dobleces ==');
say('');
const dr = (sel) => { const e = document.querySelector(sel); if (!e) throw new Error('no existe ' + sel); e.click(); };
if (ST.drawer !== 'pieces') dr('[data-dr="pieces"]');
for (const piezas of [1, 3, 10]) {
  while (ST.datasets.length < piezas) dr('[data-a="sim"]');
  for (const d of ST.datasets) d.visible = true;
  B.rebuildScene();
  timeIt(() => B.rebuildScene(), 5);
  await frame();
  const t = timeIt(() => B.rebuildScene(), 20);
  await frame();
  const r = B.renderer.info;
  say(`  ${String(piezas).padStart(2)} piezas · ${String(pisVivos()).padStart(4)} mallas de PI`);
  say(`    rebuildScene()     ${ms(med(t))}`);
  say(`    geometrías en GPU  ${String(r.memory.geometries).padStart(6)} · llamadas de dibujo ${r.render.calls}`);
}
say('');
return out.join('\n');
})();
