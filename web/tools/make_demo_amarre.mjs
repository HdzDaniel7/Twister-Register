#!/usr/bin/env node
/**
 * Escribe los dos archivos de ejemplo del amarre, para poder VERLO sin tener
 * que montar la escena a mano cada vez.
 *
 *     node tools/make_demo_amarre.mjs      (npm run demo:archivos)
 *
 *   ejemplos/amarre-libre.json    la misma pieza con los pines puestos y el
 *                                 amarre APAGADO. Es el «antes».
 *   ejemplos/amarre-sujeta.json   los mismos pines, el amarre ENCENDIDO y un
 *                                 ángulo movido: la barra no puede irse y se
 *                                 deforma. Es el «después».
 *
 * Abrir los dos, uno detrás de otro, es la forma más corta de ver de qué se
 * está hablando: cambia UNA cosa entre ellos.
 *
 * Los archivos son SINTÉTICOS —salen de demoModel(), no de ninguna pieza del
 * cliente— y por eso sí se versionan, al contrario que todo lo que cae en
 * `piezas/`. Se regeneran con este guion; no se editan a mano.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../src/engine.ts';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = join(raiz, 'ejemplos');
mkdirSync(dir, { recursive: true });

/** La pieza, los pines sembrados sobre ella y el amarre a gusto. */
function armar({ nombre, on, delta }) {
  const M = E.demoModel();
  M.name = nombre;
  const pins = E.seedPins(E.buildPath(M).samples, M.section, 4)
    .map((p, i) => ({ ...p, id: `pn${i + 1}`, name: `Pin ${i + 1}` }));
  /* Los pedestales también, para que la escena se parezca al fixture de verdad
     y no a una barra flotando. */
  const peds = E.seedPedestals(E.buildPath(M).samples, M.section, 7)
    .map((p, i) => ({ ...p, id: `pd${i + 1}`, name: `Ped ${i + 1}` }));
  /* El ángulo movido va en la PIEZA, no en el comando: es lo que alguien
     acabaría de teclear en la tabla. */
  const bends = M.bends.map((b, i) => (i === 3 ? { ...b, angle: +(b.angle + delta).toFixed(3) } : b));
  const modelo = E.normalizeModel({ ...M, bends });
  const v = { id: 'v1', name: nombre, color: '#3FA9F5', visible: true,
              base: modelo, deltas: [], tailDelta: 0 };
  return E.toDoc(modelo, modelo.bends, null, null, [], [v], 'v1', 'start', {
    fixture: peds,
    pins,
    restraint: { ...E.RESTRAINT_DEFAULT, on },
    mat: { ...E.MAT_DEFAULT },
    ui: { theme: 'system', lang: 'es', mode: 'model' },
  });
}

const casos = [
  { archivo: 'amarre-libre.json', nombre: 'AMARRE — libre', on: false, delta: 3 },
  { archivo: 'amarre-sujeta.json', nombre: 'AMARRE — sujeta', on: true, delta: 3 },
];

for (const c of casos) {
  const doc = armar(c);
  const ruta = join(dir, c.archivo);
  writeFileSync(ruta, JSON.stringify(doc, null, 1));
  console.log(`${c.archivo}  ·  ${doc.pins.length} pines  ·  amarre ${doc.restraint.on ? 'ENCENDIDO' : 'apagado'}`);
}

/* Y el número que hay que ver en la pantalla, dicho aquí para poder
   contrastarlo: si el visor enseña otra cosa, uno de los dos miente. */
{
  const M = E.demoModel();
  const pins = E.seedPins(E.buildPath(M).samples, M.section, 4)
    .map((p, i) => ({ ...p, id: `pn${i + 1}`, name: `Pin ${i + 1}` }));
  const movido = E.normalizeModel({
    ...M, bends: M.bends.map((b, i) => (i === 3 ? { ...b, angle: +(b.angle + 3).toFixed(3) } : b)),
  });
  const R = E.restrain(movido, pins, M.section,
                       { ...E.RESTRAINT_DEFAULT, on: true }, E.MAT_DEFAULT);
  const libre = E.fk(movido).pis, suj = E.fk(R.model).pis;
  console.log('\nLo que tiene que salir en la pestaña Amarre al abrir «sujeta»:');
  console.log(`  pines sujetando : ${R.held.length}`);
  console.log(`  punta           : ${libre[libre.length - 1].distanceTo(suj[suj.length - 1]).toFixed(2)} mm`);
  console.log(`  peor codo       : B${R.kink.reduce((m, k, i) =>
    (E.kinkOf(k) > E.kinkOf(R.kink[m]) ? i : m), 0) + 1}`);
  console.log(`  esfuerzo        : ${(R.worst * 100).toFixed(0)}% del límite elástico\n`);
}
