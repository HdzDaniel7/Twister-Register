#!/usr/bin/env node
/**
 * BANCO DE LA ESCALA — cuántos dobleces aguanta el solver de la carga.
 *
 *     node tools/demo_escala.mjs           las tres medidas, ~15 s
 *     node tools/demo_escala.mjs --largo   añade 45 y 60 dobleces, ~25 s más
 *
 * POR QUÉ EXISTE ESTE ARCHIVO. El plan arrastraba desde el 2026-09-10 una
 * pregunta al taller —«¿cuántos dobleces tiene la pieza más grande que pasa de
 * verdad? si no supera ~30, PERF-01 se cierra sin tocar código»— y PERF-01 no
 * está escrito en ninguna parte. Nace ya colgando en `8759820`: se cita en la
 * lista de preguntas abiertas y no hay hallazgo con ese código, ni en ese
 * informe ni en el anterior. O sea que durante nueve días se estuvo esperando
 * una respuesta de taller para cerrar algo que nadie podía leer.
 *
 * Lo que sigue es la medida que debería haber sido su cuerpo. Y el umbral de
 * ~30 que alguien puso a ojo resulta estar bien puesto, por un motivo que no es
 * el que parecía.
 *
 * QUÉ SE MIDE Y CONTRA QUÉ. El presupuesto de esta casa es 250 ms de camino
 * crítico. La cifra que lo justificaba —14.3 ms con la pieza real— es de la
 * auditoría del 09-10 y mide la ESCENA: `buildPath` y el 3D. El amarre y la
 * carga llegaron después y no entran ahí. `settle()` resuelve un problema no
 * lineal con contactos que se encienden y se apagan durante la búsqueda, y su
 * coste no se parece en nada al de dibujar.
 *
 * QUÉ PRUEBA ESTO Y QUÉ NO: prueba dónde deja de caber el solver en el
 * presupuesto, y descarta que la culpa sea juntar mucho los dobleces. NO dice
 * que haya que optimizarlo: eso depende de la respuesta del taller, que sigue
 * sin llegar. Lo que sí hace es cambiar la pregunta que se le manda.
 */
import * as E from '../src/engine.ts';

const LARGO = process.argv.includes('--largo');
const MAT = E.MAT_DEFAULT;
const ON = { ...E.RESTRAINT_DEFAULT, on: true };
const CARGA = { ...E.LOAD_DEFAULT, on: true };
const PRESUPUESTO = 250;                                 // ms, el de la casa

let malas = 0;
const ok = (cond, txt, detalle = '') => {
  console.log(`  ${cond ? 'SÍ ' : 'NO '} ${txt}${detalle ? '   ' + detalle : ''}`);
  if (!cond) malas++;
};
const tit = t => console.log(`\n${t}\n${'─'.repeat(t.length)}`);
const f = (v, n = 1) => (isFinite(v) ? v.toFixed(n) : '—');
const pad = (v, w, n = 1) => f(v, n).padStart(w);

/* Mediana de pocas pasadas: una pausa del recolector arrastra la media y no
   dice nada del coste típico. Pocas, porque a 34 dobleces cada pasada es casi
   un segundo y este banco tiene que poder correrse. */
const med = a => {
  const s = [...a].sort((x, y) => x - y);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};
const timeIt = (fn, n = 3) => {
  const t = [];
  for (let i = 0; i < n; i++) {
    const a = process.hrtime.bigint();
    fn();
    t.push(Number(process.hrtime.bigint() - a) / 1e6);
  }
  return med(t);
};

/* La pieza de prueba: el patrón del demo repetido hasta `n` dobleces. `k`
   multiplica los avances, así que con `k` ajustado la barra mantiene su largo y
   con `k = 1` la barra crece con cada doblez. Que sean las dos cosas por
   separado es el punto entero de este archivo. */
function modelo(n, k) {
  const D = E.demoModel();
  const bends = [];
  for (let i = 0; i < n; i++) bends.push(E.bendFrom(D.bends[i % D.bends.length]));
  return E.normalizeModel({
    ...D, tail: D.tail * k,
    bends: bends.map(b => ({ ...b, feed: b.feed * k })),
  });
}
/** el `k` con el que `n` dobleces caben en el largo que tiene el demo */
function mismoLargo(n) {
  const D = E.demoModel();
  const objetivo = D.bends.reduce((a, b) => a + b.feed, 0) + D.tail;
  const crudo = modelo(n, 1);
  return objetivo / (crudo.bends.reduce((a, b) => a + b.feed, 0) + crudo.tail);
}

/** Monta el fixture sembrado sobre la pieza y cronometra lo que cuesta asentarla. */
function caso(n, k) {
  const M = modelo(n, k);
  const P0 = E.buildPath(M).samples;
  const pins = E.seedPins(P0, M.section, 4).map((p, i) => ({ ...p, id: `pn${i}`, name: `A${i}` }));
  const peds = E.seedPedestals(P0, M.section, 7).map((p, i) => ({ ...p, id: `pd${i}`, name: `P${i}` }));
  const S = E.settle(M, pins, peds, M.section, ON, MAT, CARGA);
  return {
    n, largo: P0[P0.length - 1].s,
    avance: M.bends.reduce((a, b) => a + b.feed, 0) / n,
    muestras: P0.length,
    tPath: timeIt(() => E.buildPath(M), 7),
    tAmarre: timeIt(() => E.restrain(M, pins, M.section, ON, MAT)),
    tCarga: timeIt(() => E.settle(M, pins, peds, M.section, ON, MAT, CARGA)),
    ok: S.ok, iters: S.iters,
  };
}
const cab = c1 => console.log(`   ${c1}  largo  muestras   buildPath   amarre     carga    ok  vueltas`);
const fila = (r, c1) => console.log(
  `   ${String(c1).padStart(5)} ${pad(r.largo, 6, 0)} ${String(r.muestras).padStart(9)}`
  + ` ${pad(r.tPath, 11, 2)} ${pad(r.tAmarre, 8, 2)} ${pad(r.tCarga, 9, 2)}`
  + `  ${r.ok ? 'sí' : 'NO'}  ${String(r.iters).padStart(6)}`);


/* ══════════════════════════════════════════════════════════════════════════
   1 · DÓNDE DEJA DE CABER, en una barra del largo de la de verdad.         */
tit('1 · Cuántos dobleces caben en el presupuesto');
console.log('  la misma barra de ~1.8 m, con más dobleces dentro. Milisegundos, mediana:\n');
const serie = [];
for (const n of LARGO ? [15, 22, 30, 34, 45, 60] : [15, 22, 30, 34]) {
  if (n === 15) cab('   n');
  const r = caso(n, mismoLargo(n));
  serie.push(r);
  fila(r, n);
}
const demo = serie[0];
const roto = serie.find(r => r.n === 34);
console.log('');
ok(demo.tCarga < PRESUPUESTO,
   'con los 15 dobleces del demo, asentar la pieza cabe en el presupuesto',
   `${f(demo.tCarga)} ms de ${PRESUPUESTO}`);
ok(roto.tCarga > PRESUPUESTO,
   'con 34 en la misma barra ya no cabe, y no por poco',
   `${f(roto.tCarga)} ms, ${f(roto.tCarga / PRESUPUESTO)} veces el presupuesto`);
ok(roto.iters > demo.iters * 2,
   'y lo que se dispara no es el tamaño del problema: es que deja de converger',
   `${demo.iters} vueltas con 15 dobleces, ${roto.iters} con 34`);
ok(demo.tPath < 1 && roto.tPath < 1,
   'la escena sigue siendo gratis en los dos casos, o sea que esto no es el 3D',
   `buildPath ${f(demo.tPath, 2)} y ${f(roto.tPath, 2)} ms`);

/* ══════════════════════════════════════════════════════════════════════════
   2 · ¿ES POR JUNTARLOS? El control: los mismos dobleces sin apretarlos.    */
tit('2 · El control: los mismos dobleces, sin apretarlos');
console.log('  `k = 1`, o sea el avance del demo tal cual: la barra crece con los dobleces.\n');
const libres = [];
for (const n of [15, 30, 45]) {
  if (n === 15) cab('   n');
  const r = caso(n, 1);
  libres.push(r);
  fila(r, n);
}
const l45 = libres[2];
console.log('');
ok(l45.tCarga > PRESUPUESTO,
   'estirar la barra no salva a los 45 dobleces: siguen fuera del presupuesto',
   `${f(l45.tCarga)} ms con ${f(l45.largo, 0)} mm de barra`);

/* ══════════════════════════════════════════════════════════════════════════
   3 · EL EXPERIMENTO QUE LO DECIDE: dobleces fijos, avance variable.        */
tit('3 · Dobleces FIJOS y avance variable: lo que separa las dos causas');
console.log('  30 dobleces en todas las filas; lo único que cambia es lo que se separan.\n');
cab('avance');
const dens = [];
for (const k of [0.30, 0.60, 1.00, 1.30]) {
  const r = caso(30, k);
  dens.push(r);
  fila(r, f(r.avance, 0));
}
const lo = Math.min(...dens.map(r => r.tCarga));
const hi = Math.max(...dens.map(r => r.tCarga));
console.log('');
ok(hi / lo < 3,
   'con el número de dobleces quieto, juntarlos cuatro veces más apenas se nota',
   `entre ${f(lo)} y ${f(hi)} ms, con el avance de ${f(dens[0].avance, 0)} a ${f(dens[3].avance, 0)} mm`);
ok(hi < PRESUPUESTO * 1.5,
   'y a 30 dobleces se sigue rondando el presupuesto por apretada que vaya la pieza',
   `el peor caso de la tabla, ${f(hi)} ms`);

console.log('\n  LO QUE ESTO OBLIGA A PREGUNTAR. Manda el NÚMERO de dobleces, no lo juntos');
console.log('  que vayan: la escena y el amarre no se enteran, y el que se dispara es el');
console.log('  solver de la carga, porque por encima de unos treinta deja de converger en');
console.log('  pocas vueltas. Así que la pregunta al taller no es cuánto mide la pieza más');
console.log('  grande: es cuántos dobleces tiene. Y el ~30 que se escribió a ojo el 09-10');
console.log('  está bien puesto por un motivo que entonces nadie había medido.');

console.log(`\n${malas ? `${malas} COMPROBACIÓN(ES) EN ROJO` : 'todo lo que se dijo, se cumplió'}\n`);
console.log('Los milisegundos son de esta máquina y no de la del taller: lo que vale es la');
console.log('COMPARACIÓN entre filas y el sitio donde se cruza el presupuesto. Lo que este');
console.log('banco NO mide es si alguna pieza real llega a 30 dobleces — eso sigue');
console.log('esperando al taller.\n');
process.exit(malas ? 1 : 0);
