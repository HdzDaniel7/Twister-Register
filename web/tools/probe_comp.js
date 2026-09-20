/* Sonda de MEDICIÓN para M11: «Compensar reconstruye la tabla entera por
   celda». Mismo lanzador que el banco:

     node tools/ui_test.mjs <página> tools/probe_comp.js

   Lo que se cronometra es el camino REAL de un usuario: escribir en una celda
   Δ y confirmar. Eso dispara editTweak() -> compensate() -> renderRight() (que
   reconstruye #panes entero) + renderSide() + renderStatus(). No se mide
   paneComp() suelto porque no está expuesto, y medir la parte no diría si
   teclear es fluido.                                                        */
const out = [];
const say = (s) => out.push(s);
const B = window.BARCOMP;
const { ST, E } = B;

const med = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};
const ms = (v) => v.toFixed(2).padStart(8) + ' ms';
const timeIt = (fn, n, rep = 1) => {
  const t = [];
  for (let i = 0; i < n; i++) {
    const a = performance.now();
    for (let r = 0; r < rep; r++) fn();
    t.push((performance.now() - a) / rep);
  }
  return t;
};
const q = (s) => document.querySelector(s);
const click = (s) => { const e = q(s); if (!e) throw new Error('no existe ' + s); e.click(); };

/* igual que probe_perf: hace a mano lo que hace syncModel(), que no se expone */
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
  B.renderAll();
}

/* Una pieza medida tiene que existir o paneComp() devuelve el aviso `noMeas`
   y no habría tabla que reconstruir: se mediría la nada. */
function piezaMedida() {
  if (ST.drawer !== 'pieces') click('[data-dr="pieces"]');
  click('[data-a="sim"]');
}

function edita(i, k, texto) {
  const c = q(`[data-tw="${i}"][data-k="${k}"]`);
  if (!c) throw new Error(`no hay celda [data-tw="${i}"][data-k="${k}"]`);
  c.value = texto;
  c.dispatchEvent(new Event('change', { bubbles: true }));
}

function bloque(n, ancha) {
  setBends(n);
  ST.datasets.length = 0;
  piezaMedida();
  click('[data-md="comp"]');
  /* el peor caso de la tabla es con las TRES correcciones encendidas: de
     fábrica solo viene el ángulo, o sea una columna editable de tres */
  ST.comp.doRot = !!ancha; ST.comp.doFeed = !!ancha;
  B.renderAll();
  const filas = document.querySelectorAll('[data-tw]').length;
  if (!filas) throw new Error(`con ${n} dobleces la tabla de Compensar salió vacía`);

  /* calentar: la primera pasada compila plantillas y crea nodos */
  edita(0, 'angle', '+0.1');
  edita(0, 'angle', '0');

  /* la celda de ARRIBA y la de ABAJO: si el coste dependiera de dónde se
     escribe, reconstruir entero no sería el problema */
  const t0 = timeIt(() => edita(0, 'angle', '+0.01'), 20);
  const tN = timeIt(() => edita(n - 1, 'angle', '+0.01'), 20);

  /* cuánto de eso es motor y cuánto es pintar: compensate() es la cuenta que
     editTweak() hace ANTES de renderizar, y paneComp() vuelve a hacer */
  const D = ST.datasets[0];
  const tc = timeIt(() => E.compensate(ST.command, ST.model.bends, D.model.bends,
                                       ST.comp, E.orientations(ST.model)), 20, 50);

  const html = q('#panes').innerHTML.length;
  say(`  ${String(n).padStart(3)} dobleces · ${ancha ? 'las TRES correcciones' : 'solo el ángulo'} · ${filas} celdas Δ · #panes ${(html / 1024).toFixed(1)} KB`);
  say(`    escribir en la celda 0      ${ms(med(t0))}`);
  say(`    escribir en la última       ${ms(med(tN))}`);
  say(`    de eso, E.compensate()      ${ms(med(tc))}   ${(100 * med(tc) / med(t0)).toFixed(0)} % del total`);
  say(`    techo de pulsaciones        ${(1000 / med(t0)).toFixed(0)} /s`);
  say('');
}

say('== M11: coste de confirmar UNA celda Δ en Compensar ==');
say('');
bloque(15);
bloque(30);
bloque(60);
bloque(15, true);
bloque(60, true);
say('Presupuesto de la casa: 250 ms. Confirmar una celda es un `change`, o sea');
say('Enter o salir del campo — NO una pulsación de tecla: keyboard.ts mueve la');
say('selección sin reconstruir.');
return out.join('\n');
