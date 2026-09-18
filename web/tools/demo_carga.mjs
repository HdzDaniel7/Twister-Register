#!/usr/bin/env node
/**
 * BANCO DE LA CARGA — el muelle de contacto contra una solución EXACTA.
 *
 *     node tools/demo_carga.mjs
 *
 * Contesta la pregunta 7 del plan: `CONTACT_K = 1e5` ¿se validó contra algo, o
 * solo se contrasta consigo mismo vía `pene`? Hasta hoy era lo segundo: `pene`
 * dice cuánto se hundió un apoyo, pero no contra qué compararlo, así que no se
 * sabía si esa cifra era el precio conocido de la penalización o ruido del
 * solver disfrazado de física.
 *
 * El método es el mismo de la servilleta del amarre: un caso de UN grado de
 * libertad cuya respuesta se sabe antes de calcular. Una barra RECTA con una
 * estación a `a` del amarre, un pedestal a `d` más allá, y el peso propio. El
 * único movimiento posible es que la cola gire sobre la estación, así que:
 *
 *   · por estática de sólido rígido, el apoyo lleva   R∞ = w·(L−a)² / (2·d)
 *   · el muelle no es rígido: cede δ = R/κ, y eso descarga la estación, que se
 *     queda con K·u. De minimizar ½K·u² + Q·u + ½κ(J·u)² sale
 *
 *         u = −Q / (K + κJ²)     δ = |J·u|     R = κ·δ
 *
 *     con Q = −w(L−a)²/2 · D2R (el momento del peso, N·mm/grado), J = −d · D2R
 *     (cuánto baja el punto de apoyo por grado, mm/grado), K = E·I/span · D2R²
 *     (la rigidez de la estación) y κ el muelle de contacto.
 *
 * Las dos primeras cuentas se hacen AQUÍ, a mano, y no se le preguntan al
 * motor. Si el solver las reproduce, la penetración residual es una CIFRA
 * —R/κ— y no un artefacto; y de paso queda medido lo que κ le cuesta a la
 * reacción, que es el sesgo K/(K+κJ²).
 *
 * QUÉ PRUEBA ESTO Y QUÉ NO: prueba que el solver minimiza la energía que dice
 * minimizar y que el error de la penalización es el que la fórmula predice. NO
 * prueba que una barra de aluminio de verdad se comporte así — eso sigue
 * esperando el escaneo con el fixture puesto.
 */
import * as E from '../src/engine.ts';

const D2R = Math.PI / 180;
let malas = 0;
const ok = (cond, txt, detalle = '') => {
  console.log(`  ${cond ? 'SÍ ' : 'NO '} ${txt}${detalle ? '   ' + detalle : ''}`);
  if (!cond) malas++;
};
const tit = t => console.log(`\n${t}\n${'─'.repeat(t.length)}`);
const f = (v, n = 4) => (isFinite(v) ? v.toFixed(n) : '—');
const e = (v, n = 4) => (isFinite(v) ? v.toExponential(n) : '—');
const rel = (x, y) => Math.abs(x - y) / Math.max(1e-30, Math.abs(y));

/* ── el caso, montado una sola vez ──────────────────────────────────────────
   `rot: 90` no es decorativo: con el eje de doblado a 0 el codo movería la cola
   de LADO, la gravedad no lo notaría —el problema tendría gradiente cero y no
   habría nada que resolver— y el pedestal no se enteraría. Con el eje a 90 el
   codo la mueve ARRIBA y ABAJO, que es contra lo que empuja el apoyo. Y
   `angle: 0` deja la barra recta, que es lo que hace elemental la estática. */
const A = 500, TAIL = 600, TOT = A + TAIL;
const base = E.normalizeModel({
  name: 'UNA ESTACIÓN', tail: TAIL,
  bends: [E.newBend({ feed: A, rot: 90, angle: 0, radius: 30 })],
});
const SEC = base.section;
const PATH = E.buildPath(base, 8).samples;
const MAT = E.MAT_DEFAULT;
const OFF = { ...E.RESTRAINT_DEFAULT, on: false };   // sin pines: aquí solo pesa
const CARGA = { ...E.LOAD_DEFAULT, on: true };

const W = E.lineLoad(SEC, MAT);                      // N/mm
const SPAN = E.stationSpans(base)[0];
const IZ = E.sectionI(SEC).Iz;
const K = MAT.E * IZ / SPAN * D2R * D2R;             // N·mm/grado²
const KAP = E.CONTACT_K * MAT.E * IZ / TOT ** 3;     // N/mm

/** Un pedestal que toca la barra recta con hueco CERO, a `d` de la estación.
 *  Sin redondear el alto: los ±4 µm que deja `seedPedestals()` al redondear a
 *  centésimas valen ±24 N de precarga con un κ de este orden, y aquí lo que se
 *  mide es el muelle, no el sembrado. */
const pedAt = (d) => {
  const q = E.sampleAt(PATH, A + d);
  return {
    id: 'pd1', name: 'P1', visible: true, x: A + d, y: 0,
    h: q.p.z - E.sectionDrop(q, SEC) - E.TABLE_Z, tilt: 0, pad: 60,
  };
};

/** La servilleta, para un brazo `d`. Todo sale de aquí: al motor solo se le
 *  piden las constantes que él mismo publica. */
const mano = (d, g = 1, Emod = MAT.E) => {
  const k = K * (Emod / MAT.E), kp = KAP * (Emod / MAT.E);
  const Q = -W * g * (TOT - A) ** 2 / 2 * D2R;
  const J = -d * D2R;
  const u = -Q / (k + kp * J * J);
  const pene = Math.abs(J * u);
  return { Q, J, u, pene, R: kp * pene, Rinf: Math.abs(Q / J), kap: kp, K: k };
};

/** El κ de producción que dejaría este mismo κJ²/K, para poder leer el barrido
 *  en la unidad de la constante y no en la del brazo. */
const RHO0 = KAP * (400 * D2R) ** 2 / K;
const kapEquiv = (rho) => E.CONTACT_K * rho / RHO0;

/* ══════════════════════════════════════════════════════════════════════════
   1 · LA SERVILLETA — la respuesta se escribe antes de calcular.              */
tit('1 · Viga con muelle: lo que dice la mano y lo que da el solver');
{
  const d = 400;
  const h = mano(d);
  console.log(`  barra recta de ${TOT} mm · estación a ${A} · pedestal a ${A + d}`);
  console.log(`  w = ${e(W, 5)} N/mm   peso = ${f(W * TOT, 3)} N`);
  console.log(`  K = ${f(h.K, 2)} N·mm/grado²   κ = ${f(h.kap, 1)} N/mm   `
            + `J = ${f(h.J, 5)} mm/grado`);
  console.log('  ESCRITO ANTES DE CALCULAR:');
  console.log(`    reacción de sólido rígido   R∞ = w(L−a)²/2d = ${f(h.Rinf, 5)} N`);
  console.log(`    la estación cede            u  = ${e(h.u, 4)} °`);
  console.log(`    el apoyo se hunde           δ  = ${e(h.pene, 4)} mm`);
  console.log(`    y por tanto lleva           R  = κ·δ = ${f(h.R, 5)} N`);

  const S = E.settle(base, [], [pedAt(d)], SEC, OFF, MAT, CARGA);
  console.log(`  EL SOLVER:  pene ${e(S.pene, 4)} mm   R ${f(S.pedN[0], 5)} N   `
            + `ok=${S.ok}  ${S.iters} iteración(es)`);

  /* El residuo de ~6e-6 no es del muelle: es la AMORTIGUACIÓN. El hessiano lleva
     K·(1+damp) con damp = 0.15, así que el paso de Newton se queda corto en
     0.15·K/(κJ²) ≈ 1.1e-5, y la búsqueda para en cuanto el gradiente baja el
     1e-4 relativo de GRAD_TOL. Los dos números están a la vista y cuadran. */
  ok(rel(S.pene, h.pene) < 1e-3, 'la penetración es la que predice la fórmula',
     `error relativo ${e(rel(S.pene, h.pene), 2)}`);
  ok(rel(S.pedN[0], h.R) < 1e-4, 'y la reacción también',
     `error relativo ${e(rel(S.pedN[0], h.R), 2)} · del orden de 0.15·K/κJ² = `
     + `${e(0.15 * h.K / (h.kap * h.J ** 2), 1)}, que es la amortiguación`);
  ok(rel(S.pedN[0], h.Rinf) < 1e-3, 'que es la de la estática, menos lo que κ se cobra',
     `sesgo ${e(rel(S.pedN[0], h.Rinf), 2)} = K/(K+κJ²) = ${e(h.K / (h.K + h.kap * h.J ** 2), 2)}`);
  ok(Math.abs(S.carried + S.root - S.weight) < 1e-9 * S.weight,
     'y la suma de fuerzas cierra: apoyos + mordaza = peso',
     `${f(S.carried, 4)} + ${f(S.root, 4)} = ${f(S.weight, 4)} N`);

  console.log('\n  O sea: la penetración residual NO es ruido. Es R/κ, sale a cinco');
  console.log(`  cifras, y con κ = ${f(h.kap, 0)} N/mm son ${f(h.pene * 1000, 2)} µm — tres órdenes`);
  console.log('  de magnitud por debajo de la tolerancia de punto.');
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · EL BARRIDO — κ no se toca desde fuera, y no hace falta.

   Lo que decide cuánto se hunde un apoyo no es κ sino κJ²/K: cuántas veces más
   rígido es el muelle que la propia pieza en esa incógnita. J es el BRAZO, así
   que acercar el pedestal a la estación es exactamente lo mismo que bajar κ.
   Con d = 400 mm la razón es ~1.3e4; con d = 2 mm, 0.3. Cuatro décadas y media
   de κ equivalente sin tocar una constante ni un tipo.                        */
tit('2 · Barrido del κ efectivo: hasta dónde sigue valiendo la fórmula');
{
  console.log('   brazo      κJ²/K   κ equiv.    δ fórmula      δ solver     error'
            + '        R∞    R solver   ok');
  let peorOk = 0;
  for (const d of [400, 300, 200, 100, 50, 20, 10, 5, 2]) {
    const h = mano(d);
    const S = E.settle(base, [], [pedAt(d)], SEC, OFF, MAT, CARGA);
    const rho = h.kap * h.J ** 2 / h.K;
    const err = rel(S.pene, h.pene);
    if (rho >= 2 && err > peorOk) peorOk = err;
    console.log(`  ${String(d).padStart(4)} mm  ${f(rho, 1).padStart(9)}  `
      + `${e(kapEquiv(rho), 1).padStart(8)}  ${e(h.pene, 4)}  ${e(S.pene, 4)}  `
      + `${e(err, 1)}  ${f(h.Rinf, 2).padStart(9)}  ${f(S.pedN[0], 2).padStart(9)}  `
      + `${S.ok ? 'sí' : 'NO'}`);
  }
  ok(peorOk < 1e-2,
     'la fórmula sigue al solver mientras el muelle doble en rigidez a la pieza',
     `peor error ${e(peorOk, 2)}`);
  console.log('\n  Dónde dejan de coincidir: NO por κ. Lo primero que se rompe es que');
  console.log('  `gap` sea lineal en u —con el brazo de 2 mm el codo pasa del cuarto de');
  console.log('  grado y la cola ya no baja recta— y, antes que eso, la búsqueda deja de');
  console.log('  converger. Con el κ de producción las dos cosas quedan a cuatro décadas.');
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · DOS INVARIANCIAS que no se cumplen por casualidad.

   La fórmula dice δ = |QJ|/(K+κJ²) con Q ∝ ρ·g y con K y κ ∝ E. De ahí salen
   dos predicciones que un solver devolviendo ruido no acertaría: la reacción NO
   depende del módulo elástico —ni una milmillonésima— y todo es exactamente
   lineal en g.                                                                */
tit('3 · La reacción no depende de E, y todo es lineal en g');
{
  const d = 400;
  const Rs = [], ps = [];
  for (const Emod of [69000, 138000, 200000]) {
    const S = E.settle(base, [], [pedAt(d)], SEC, OFF, { ...MAT, E: Emod }, CARGA);
    Rs.push(S.pedN[0]); ps.push(S.pene * Emod);
    console.log(`  E = ${String(Emod).padStart(6)} MPa   pene ${e(S.pene, 4)} mm   `
              + `R ${f(S.pedN[0], 6)} N`);
  }
  ok(rel(Rs[1], Rs[0]) < 1e-6 && rel(Rs[2], Rs[0]) < 1e-6,
     'la reacción es la MISMA con aluminio y con acero, a siete cifras',
     `dispersión ${e(Math.max(rel(Rs[1], Rs[0]), rel(Rs[2], Rs[0])), 2)}`);
  ok(rel(ps[1], ps[0]) < 1e-6 && rel(ps[2], ps[0]) < 1e-6,
     'y la penetración va como 1/E, que es lo que dice la fórmula');

  const g1 = E.settle(base, [], [pedAt(d)], SEC, OFF, MAT, { ...CARGA, g: 1 });
  const g4 = E.settle(base, [], [pedAt(d)], SEC, OFF, MAT, { ...CARGA, g: 4 });
  console.log(`  g = 1 → pene ${e(g1.pene, 4)} mm   R ${f(g1.pedN[0], 4)} N`);
  console.log(`  g = 4 → pene ${e(g4.pene, 4)} mm   R ${f(g4.pedN[0], 4)} N`);
  ok(rel(g4.pene, 4 * g1.pene) < 1e-6 && rel(g4.pedN[0], 4 * g1.pedN[0]) < 1e-6,
     'cuadruplicar la gravedad cuadruplica las dos, sin término de más');
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · Y EN LA PIEZA DE VERDAD — de dónde salían los 47 N de FIS-10.

   El caso de una estación es exacto pero es de laboratorio. Esto es lo que se ve
   en pantalla: la demo con siete pedestales sembrados y el peso puesto, o sea el
   caso abierto de FIS-10 —«Sembrar 7» con la barra libre y después «La pieza
   pesa»—, donde los apoyos sumaban 47.4 N sobre una pieza de 23.7 N.

   La fórmula del escenario 1 dice de dónde salen: R = κ·δ, y con κ ≈ 6 160 N/mm
   cada MICRA de interferencia son 6.16 N. `seedPedestals()` redondeaba el alto
   corregido a centésimas, o sea sembraba con hasta ±5 µm de interferencia que
   nadie puso ahí: ±31 N. No era la búsqueda. Era el sembrado.                  */
tit('4 · La demo con siete pedestales: de dónde salían los 47 N');
{
  const M = E.demoModel();
  const p0 = E.buildPath(M, 8).samples;
  const L = p0[p0.length - 1].s;
  const kap = E.CONTACT_K * MAT.E * E.sectionI(M.section).Iz / L ** 3;
  const nombrar = (l) => l.map((p, i) => ({ ...p, id: `pd${i + 1}`, name: `P${i + 1}` }));
  const hoy = nombrar(E.seedPedestals(p0, M.section, 7));
  /* Lo de antes del 2026-09-16, reconstruido aquí: el MISMO sembrado con el alto
     redondeado a centésimas. Una línea de diferencia y dos físicas distintas. */
  const ayer = hoy.map(p => ({ ...p, h: +p.h.toFixed(2) }));
  const huecos = (l) => l.map(p => E.pedestalFit(p0, M.section, p).gap);

  console.log(`  largo ${f(L, 1)} mm   κ = ${f(kap, 0)} N/mm   `
            + `→  ${f(kap / 1000, 2)} N por MICRA de interferencia`);
  for (const [txt, peds] of [['alto redondeado a 0.01 (hasta el 2026-09-16)', ayer],
                             ['alto sin redondear (hoy)', hoy]]) {
    const g = huecos(peds);
    const S = E.settle(M, [], peds, M.section, OFF, MAT, CARGA);
    console.log(`\n  ${txt}`);
    console.log(`    interferencia sembrada: ${g.map(v => f(-v * 1000, 1).padStart(7)).join(' ')} µm`);
    console.log(`    reacciones:             ${S.pedN.map(v => f(v, 2).padStart(7)).join(' ')} N`);
    console.log(`    peso ${f(S.weight, 2)} N · apoyos ${f(S.carried, 2)} N · `
              + `mordaza ${f(S.root, 2)} N · pene ${f(S.pene * 1000, 2)} µm · ok=${S.ok}`);
  }

  const Sa = E.settle(M, [], ayer, M.section, OFF, MAT, CARGA);
  const Sh = E.settle(M, [], hoy, M.section, OFF, MAT, CARGA);
  ok(Math.max(...huecos(hoy).map(Math.abs)) < 1e-9,
     'sembrando sin redondear, la interferencia de partida es cero',
     `${e(Math.max(...huecos(hoy).map(Math.abs)), 2)} mm`);
  ok(Sh.carried <= Sh.weight && Sh.root >= 0,
     'y los apoyos ya no llevan más que la pieza entera',
     `${f(Sh.carried, 2)} N de ${f(Sh.weight, 2)} N · mordaza ${f(Sh.root, 2)} N`);
  ok(Sa.carried > Sa.weight,
     'con el redondeo sí lo hacían, y ese era el hallazgo FIS-10',
     `${f(Sa.carried, 2)} N de ${f(Sa.weight, 2)} N`);
  ok(rel(kap * Sh.pene, Math.max(...Sh.pedN)) < 1e-6,
     'κ·pene es exactamente la mayor de las reacciones: manda el muelle, no el azar',
     `${f(kap * Sh.pene, 3)} vs ${f(Math.max(...Sh.pedN), 3)} N`);

  console.log('\n  LO QUE QUEDA ABIERTO DE FIS-10, dicho sin adornos: el reparto ya es');
  console.log(`  creíble —${f(Sh.carried, 1)} N en los apoyos y ${f(Sh.root, 1)} N en la mordaza, que suman`);
  console.log(`  el peso— pero la búsqueda sigue diciendo ok=${Sh.ok}: se rinde cuando partir`);
  console.log('  el paso ocho veces no baja la energía, y la pantalla lo avisa con');
  console.log('  `loadStuck`. Eso es otra cosa y sigue abierto en .auditoria/plan-fases.md.');
  console.log('\n  Y la lectura que uno se lleva de aquí: con este modelo la reacción de UN');
  console.log(`  pedestal cambia ${f(kap / 1000, 1)} N por cada micra de alto. Un fixture medido con`);
  console.log('  flexómetro no puede dar reacciones apoyo por apoyo — lo que sí da, y es');
  console.log('  la pregunta del taller, es cuánto peso llevan los apoyos EN TOTAL y');
  console.log('  cuánto se queda la mordaza.');
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · POR QUÉ LA BÚSQUEDA SE RINDE — el hueco de un apoyo tiene un CODO.

   Esto es FIS-10b, y hasta el 2026-09-17 se le echaba la culpa al ruido de las
   diferencias finitas. No era eso. El hueco de un pedestal, como función de las
   incógnitas, se DOBLA a menos de una milésima de grado de donde el apoyo toca:
   junto al punto baja 13.3 mm por grado, y a 1e-3° ya baja 27.2 — el doble. El
   paso de Newton mide 1.4e-2°, o sea CATORCE VECES más que la distancia a la
   que la recta deja de valer, y Φ lleva ½κ·hueco²: la parábola que el método se
   cree no existe en el tramo que recorre. Por eso la búsqueda parte el paso
   ocho veces y ninguna baja la energía.

   De dónde sale el codo: `pedestalFit()` busca el punto de la barra más cercano
   al pedestal EN PLANTA (`nearestOnPath(samples, ped.x, ped.y)`) y mide ahí la
   cara de abajo. Con un tramo casi vertical la proyección en planta de la barra
   es casi un punto, así que ese mínimo está mal condicionado: mover el doblez
   una diezmilésima de grado corre el punto de contacto DÉCIMAS DE MILÍMETRO a
   lo largo de la barra, y la z de la barra cambia mucho a lo largo de s.

   O sea que FIS-10b y lo que quedó de FIS-08 son EL MISMO trabajo: mientras el
   apoyo se mida con una proyección en planta, el hueco de un tramo a plomo no
   es una función lisa y ningún criterio de parada lo va a arreglar.           */
tit('5 · El codo del hueco: por qué Newton no puede cerrar FIS-10');
{
  const M = E.demoModel();
  const p0 = E.buildPath(M, 8).samples;
  const peds = E.seedPedestals(p0, M.section, 7)
    .map((p, i) => ({ ...p, id: `pd${i + 1}`, name: `P${i + 1}` }));
  /* el pedestal empinado es el que lleva casi toda la carga (ver §11) */
  const kEmp = peds.reduce((a, p, i) => (Math.abs(p.tilt) > Math.abs(peds[a].tilt) ? i : a), 0);
  const hueco = (k, j, h) => {
    const m = { ...M, bends: M.bends.map((b, i) => (i === j ? { ...b, angle: b.angle + h } : b)) };
    return E.pedestalFit(E.buildPath(m, 8).samples, M.section, peds[k]).gap;
  };
  const pendientes = (k) => {
    const g0 = hueco(k, 0, 0);
    const H = 1e-4;
    return { atras: (g0 - hueco(k, 0, -H)) / H, alante: (hueco(k, 0, H) - g0) / H,
             lejos: (hueco(k, 0, 1e-3) - g0) / 1e-3 };
  };
  const emp = pendientes(kEmp);
  const llano = pendientes(1);
  console.log(`  pedestal empinado P${kEmp + 1}, cuna a ${f(peds[kEmp].tilt, 1)}°`);
  console.log(`    hueco: ${f(emp.atras, 2)} mm/grado aquí mismo (±1e-4°)`
            + ` · ${f(emp.lejos, 2)} a una milésima de grado: se dobla`);
  console.log(`  pedestal tendido P2, cuna a ${f(peds[1].tilt, 1)}°`);
  console.log(`    hueco: ${f(llano.atras, 2)} mm/grado por detrás · ${f(llano.alante, 2)} por delante`);

  ok(rel(llano.alante, llano.atras) < 1e-2,
     'donde la barra va tendida el hueco sí es liso: la misma pendiente por los dos lados',
     `${f(llano.atras, 3)} vs ${f(llano.alante, 3)} mm/grado`);
  /* TRIPWIRE, y está puesto del derecho a propósito: esta comprobación dice que
     el codo SIGUE AHÍ. El día que falle será porque el apoyo ya no se mide en
     planta —lo que pide FIS-08— y entonces FIS-10b se puede reabrir con
     esperanza, que hoy no la tiene. */
  ok(rel(emp.lejos, emp.atras) > 0.5,
     'y donde va a plomo se dobla antes de una milésima: el codo de FIS-10b sigue ahí',
     `${f(emp.atras, 2)} contra ${f(emp.lejos, 2)} mm/grado`);

  console.log('\n  PROBADO Y DESCARTADO el 2026-09-17, con las cifras, para que nadie lo');
  console.log('  vuelva a intentar (el reparto bueno es 9.78 N en los apoyos y 13.89 en');
  console.log('  la mordaza, sobre una pieza de 23.67 N):');
  console.log('   · test de razón sobre el paso —cortarlo donde el primer contacto cambia');
  console.log('     de estado—: el corte SÍ muerde (el paso se queda en el 1.6 % en la');
  console.log('     primera vuelta) y el resultado no se mueve ni una centésima: 9.78 /');
  console.log('     13.89 N y ok=false igual. El problema no es pasarse de largo.');
  console.log('   · perturbar más fino (H de 0.02° a 1e-4 … 1e-6): la búsqueda se cree la');
  console.log('     rama local del codo y se mete dentro de los apoyos: 60.29 N en los');
  console.log('     apoyos y −36.62 N en la mordaza, 7.1 µm de penetración. Peor, y sigue');
  console.log('     sin converger.');
  console.log('   · caída por coordenadas cuando Newton muere —probar una incógnita cada');
  console.log('     vez—: baja la energía, sí, pero no converge y el reparto vagabundea');
  console.log('     con el presupuesto de vueltas: 13.68 N con 6, 27.00 con 25, 14.84 con');
  console.log('     200, y de 16 ms se pasa a 1 916 ms.');
  console.log('  Lo que sí quedó medido: donde la búsqueda se rinde todavía hay bajada');
  console.log('  —mover UNA incógnita 1e-4° baja Φ 6.2e-3 N·mm—, o sea que `loadStuck` no');
  console.log('  miente: no es un mínimo. Pero la bajada no está en ninguna dirección que');
  console.log('  un método de segundo orden pueda construir con un hessiano que ahí no');
  console.log('  existe.');
}

console.log(`\n${malas ? `${malas} COMPROBACIÓN(ES) EN ROJO` : 'todo lo que se dijo, se cumplió'}\n`);
console.log('Esto valida el MUELLE: κ = 1e5 deja una penetración predecible y el sesgo');
console.log('que mete en la reacción está medido. No valida el MODELO contra una barra');
console.log('de verdad: eso sigue esperando el escaneo con el fixture puesto.\n');
process.exit(malas ? 1 : 0);
