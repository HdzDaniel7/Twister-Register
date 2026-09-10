#!/usr/bin/env node
/**
 * BANCO DEL AMARRE — pone a prueba que los pines laterales hacen lo que dicen.
 *
 *     node tools/demo_amarre.mjs
 *
 * No es una prueba más de test_motor.js: aquella comprueba invariantes y esta
 * ENSEÑA NÚMEROS, uno al lado del otro, para poder discutirlos con alguien que
 * no va a leer el código. Cada escenario dice qué se espera ANTES de calcular,
 * y luego si salió.
 *
 * QUÉ PRUEBA ESTO Y QUÉ NO, dicho antes de que nadie lo enseñe en una junta:
 * prueba que el solver hace lo que el modelo dice —cierra los contactos, no
 * inventa deformación donde no la hay, y respeta el interruptor—. NO prueba que
 * el modelo describa a la barra de verdad. Eso pide una pieza escaneada CON el
 * fixture puesto y el certificado del material, y está pedido.
 */
import * as E from '../src/engine.ts';

let malas = 0;
const ok = (cond, txt, detalle = '') => {
  console.log(`  ${cond ? 'SÍ ' : 'NO '} ${txt}${detalle ? '   ' + detalle : ''}`);
  if (!cond) malas++;
};
const tit = t => console.log(`\n${t}\n${'─'.repeat(t.length)}`);
const f = (v, n = 3) => (isFinite(v) ? v.toFixed(n) : '—');

const ON = { ...E.RESTRAINT_DEFAULT, on: true };
const pinsDe = (lista) => lista.map((p, i) => ({ ...p, id: `pn${i + 1}`, name: `Pin ${i + 1}` }));

/* ══════════════════════════════════════════════════════════════════════════
   1 · LA PRUEBA DE LA SERVILLETA — un caso cuya respuesta se sabe de antemano.

   Una barra de UN doblez con UN pin apoyado contra la recta de salida. Se mueve
   ese ángulo δ grados: la cola se va del pin. Con el eje de doblado congelado
   (`doRot:false`) el solver tiene UNA incógnita y UN contacto que cerrar, así
   que solo hay una forma de volver a tocar el pin: deshacer el ángulo.

   Predicción, escrita antes de calcular:   codo ≈ −δ
   Si sale otra cosa, el solver no está resolviendo lo que dice resolver.       */
tit('1 · La prueba de la servilleta: el codo tiene que ser −δ');
{
  const base = E.normalizeModel({
    name: 'UN DOBLEZ', tail: 600,
    bends: [E.newBend({ feed: 500, rot: 0, angle: 30, radius: 30 })],
  });
  const path = E.buildPath(base).samples;
  /* el pin, tocando la cola a dos tercios de la pieza */
  const q = E.sampleAt(path, path[path.length - 1].s * 0.85);
  const n = E.planNormal(q);
  const d = 10 + E.planHalfWidth(q, base.section, n);
  const pins = pinsDe([{
    visible: true, hold: true, dia: 20,
    x: +(q.p.x + n.x * d).toFixed(3), y: +(q.p.y + n.y * d).toFixed(3),
    h: +(q.p.z - E.TABLE_Z + 30).toFixed(2),
    /* MONTADO de este lado. Guardarlo es lo que impide que, con un ángulo
       grande, el solver cierre el contacto por la cara de atrás —o sea, con la
       barra habiendo atravesado el poste—. Con `side: 0` se lee de la forma de
       cada momento y a partir de unos 2° la lectura se invierte. */
    side: 1,
  }]);
  ok(Math.abs(E.pinFit(path, base.section, pins[0]).gap) < 0.01,
     'el pin arranca tocando la barra',
     `hueco ${f(E.pinFit(path, base.section, pins[0]).gap)} mm`);

  const conDelta = (delta) => {
    const movido = E.normalizeModel({
      ...base, bends: [{ ...base.bends[0], angle: base.bends[0].angle + delta }],
    });
    return { movido, R: E.restrain(movido, pins, base.section, { ...ON, doRot: false }) };
  };

  /* Hacia el pin: la barra se mete donde está el poste, el poste no cede, y la
     única salida es deshacer el ángulo. */
  for (const delta of [0.5, 1.5, 3]) {
    const { R } = conDelta(delta);
    const codo = R.kink[0].angle;
    console.log(`  δ = +${delta}°  →  codo ${f(codo)}°  ` +
                `(se esperaba ${f(-delta)}°)   hueco final ${f(R.res[0], 4)} mm`);
    ok(Math.abs(codo + delta) < 0.05, '  el codo deshace el ángulo movido',
       `error ${f(Math.abs(codo + delta), 4)}°`);
  }

  /* Y al revés: UN PIN EMPUJA, NO TIRA. Si el ángulo se mueve hacia el otro
     lado, la barra se separa del poste y ahí no hay nada que sujete: la pieza
     queda libre. Que esto NO deforme nada es tan importante como que lo otro sí
     lo haga — un modelo que arrastrara la barra de vuelta estaría inventando
     una fuerza que el fixture no puede hacer. */
  {
    const { movido, R } = conDelta(-2);
    const hueco = E.pinFit(E.buildPath(movido).samples, base.section, pins[0]).gap;
    console.log(`  δ = -2°   →  la barra se SEPARA del pin: hueco ${f(hueco, 2)} mm`);
    ok(hueco > 0.5, '  el pin se queda con aire delante');
    ok(R.held.length === 0 && E.kinkOf(R.kink[0]) === 0,
       '  y no deforma nada: un pin empuja, no tira');
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · EL INTERRUPTOR — apagado tiene que ser IDÉNTICO, no parecido.            */
tit('2 · El interruptor: apagado, la pieza no se toca');
{
  const M = E.demoModel();
  const pins = pinsDe(E.seedPins(E.buildPath(M).samples, M.section, 4));
  const off = E.restrain(M, pins, M.section, { ...ON, on: false });
  ok(off.model === M, 'devuelve el MISMO objeto, no una copia parecida');
  const libre = E.fk(M).pis, apagado = E.fk(off.model).pis;
  const dif = libre.reduce((m, p, i) => Math.max(m, p.distanceTo(apagado[i])), 0);
  ok(dif === 0, 'los PI son bit a bit los mismos', `diferencia ${dif}`);
  ok(off.held.length === 0 && off.iters === 0, 'no hay pines sujetando ni iteraciones');
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · LA PIEZA COMPLETA — lo que se ve en la pestaña Amarre, en números.       */
tit('3 · Pieza de 15 dobleces: mover B4 dos grados con la barra sujeta');
{
  const M = E.demoModel();
  const pins = pinsDe(E.seedPins(E.buildPath(M).samples, M.section, 4));
  const movido = E.normalizeModel({
    ...M, bends: M.bends.map((b, i) => (i === 3 ? { ...b, angle: b.angle + 2 } : b)),
  });
  const antes = pins.map(p => E.pinFit(E.buildPath(movido).samples, M.section, p).gap);
  console.log(`  hueco en cada pin ANTES de resolver:  ${antes.map(v => f(v, 2)).join('  ')} mm`);
  console.log('  (negativo = el pin está metido dentro de donde iría la barra)');

  const R = E.restrain(movido, pins, M.section, ON, E.MAT_DEFAULT);
  const despues = pins.map(p => E.pinFit(E.buildPath(R.model).samples, M.section, p).gap);
  console.log(`  hueco DESPUÉS:                        ${despues.map(v => f(v, 2)).join('  ')} mm`);
  ok(R.held.every((k, i) => Math.abs(R.res[i]) < 0.1),
     'los contactos que había que cerrar quedan cerrados',
     `peor residuo ${f(Math.max(...R.res.map(Math.abs)), 4)} mm`);

  const pl = E.fk(movido).pis, ps = E.fk(R.model).pis;
  const punta = pl[pl.length - 1].distanceTo(ps[ps.length - 1]);
  console.log(`\n  La punta libre y la punta sujeta NO caen en el mismo sitio: ${f(punta, 2)} mm`);
  ok(punta > 1, 'la diferencia es visible y medible, no ruido');

  console.log('\n  Dónde se deforma la barra (codo por estación, °):');
  console.log('   ' + R.kink.map((k, i) => `B${i + 1}:${f(E.kinkOf(k), 2)}`).join('  '));
  console.log(`  Peor esfuerzo: ${f(R.stress[R.worstAt], 1)} MPa en B${R.worstAt + 1}` +
              `  =  ${f(R.worst * 100, 0)}% del límite elástico`);
  ok(R.kink.filter(k => E.kinkOf(k) > 0.01).length >= 2,
     'la deformación se reparte entre estaciones, no cae toda en una');
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · EL MATERIAL NO MUEVE LA BARRA — la propiedad que decide qué se afirma.   */
tit('4 · Cambiar el material NO cambia la forma, solo el esfuerzo');
{
  const M = E.demoModel();
  const pins = pinsDe(E.seedPins(E.buildPath(M).samples, M.section, 4));
  const movido = E.normalizeModel({
    ...M, bends: M.bends.map((b, i) => (i === 3 ? { ...b, angle: b.angle + 2 } : b)),
  });
  const alu = E.restrain(movido, pins, M.section, ON, { E: 69000, yield: 240 });
  const acero = E.restrain(movido, pins, M.section, ON, { E: 200000, yield: 500 });
  const a = E.fk(alu.model).pis, b = E.fk(acero.model).pis;
  const dif = a.reduce((m, p, i) => Math.max(m, p.distanceTo(b[i])), 0);
  console.log(`  aluminio E=69000 MPa  →  σ máx ${f(Math.max(...alu.stress), 1)} MPa`);
  console.log(`  acero    E=200000 MPa →  σ máx ${f(Math.max(...acero.stress), 1)} MPa`);
  ok(dif < 1e-9, 'los PI no se mueven ni una milmillonésima de milímetro',
     `diferencia ${dif.toExponential(2)} mm`);
  const razon = Math.max(...acero.stress) / Math.max(...alu.stress);
  ok(Math.abs(razon - 200000 / 69000) < 1e-6,
     'y el esfuerzo escala EXACTAMENTE con la razón de módulos',
     `${f(razon, 4)} vs ${f(200000 / 69000, 4)}`);
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · SE PUEDE FALSAR — si quitas el pin que empuja, la deformación se va.

   Una prueba que no puede fallar no prueba nada. Aquí se apaga el pin que está
   metido dentro de la barra: si el modelo fuera un adorno, el resultado no
   cambiaría.                                                                  */
tit('5 · Falsable: apagar el pin que empuja tiene que cambiar el resultado');
{
  const M = E.demoModel();
  const pins = pinsDe(E.seedPins(E.buildPath(M).samples, M.section, 4));
  const movido = E.normalizeModel({
    ...M, bends: M.bends.map((b, i) => (i === 3 ? { ...b, angle: b.angle + 2 } : b)),
  });
  const con = E.restrain(movido, pins, M.section, ON, E.MAT_DEFAULT);
  const culpable = con.held[0];
  const sin = E.restrain(movido, pins.map((p, i) =>
    (i === culpable ? { ...p, hold: false } : p)), M.section, ON, E.MAT_DEFAULT);
  const dCon = Math.max(...con.kink.map(E.kinkOf));
  const dSin = Math.max(...sin.kink.map(E.kinkOf));
  console.log(`  con el pin ${culpable + 1} sujetando:  peor codo ${f(dCon, 3)}°` +
              `  ·  ${con.held.length} contacto(s)`);
  console.log(`  con el pin ${culpable + 1} apagado:    peor codo ${f(dSin, 3)}°` +
              `  ·  ${sin.held.length} contacto(s)`);
  ok(sin.held.length < con.held.length, 'deja de contarse ese contacto');
  ok(Math.abs(dCon - dSin) > 1e-6 || dSin === 0,
     'y la deformación cambia: el modelo no es un adorno');

  /* Y un pin que no llega a la barra tampoco puede sujetarla, por bien puesto
     que esté: es el error de montaje más fácil de cometer. */
  const enanos = pins.map(p => ({ ...p, h: 5 }));
  ok(E.restrain(movido, enanos, M.section, ON).held.length === 0,
     'un pin más bajo que la barra no sujeta nada');
}

console.log(`\n${malas ? `${malas} COMPROBACIÓN(ES) EN ROJO` : 'todo lo que se dijo, se cumplió'}\n`);
console.log('Esto prueba que el solver hace lo que el modelo dice. NO prueba que el');
console.log('modelo describa a la barra de verdad: para eso hace falta una pieza');
console.log('escaneada CON el fixture puesto y el certificado del material.\n');
process.exit(malas ? 1 : 0);
