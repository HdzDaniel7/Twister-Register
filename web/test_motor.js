#!/usr/bin/env node
/**
 * Pruebas de regresión del motor de src/engine.js — sin navegador.
 *
 *     node test_motor.js          (o  npm test)
 *
 * Importa el motor como módulo ES: es exactamente el código que esbuild
 * empotra en barcomp_viewer.html, no una copia.
 * Sale con código 1 si alguna prueba falla.
 *
 * Correr esto DESPUÉS de cada cambio en src/ y ANTES de `node build.mjs`.
 */
import { Matrix4, Euler, Vector3 } from 'three';
import * as E from './src/engine.ts';
import { I18N, LANGS, LANG, setLang, T } from './src/i18n.ts';

let fails = 0;
function ok(name, cond, detail = '') {
  console.log(`${cond ? ' PASA' : 'FALLA'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!cond) fails++;
}
const maxAbs = a => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

/* ======================================================================== */
console.log('\n— cinemática —');

const M = E.demoModel();
const P = E.fk(M).pis;

ok('fk devuelve n+2 puntos', P.length === M.bends.length + 2, `${P.length} pts`);

const back = E.ik(P, M.bends.map(b => b.radius));
let e = 0;
back.bends.forEach((b, i) => {
  e = Math.max(e,
    Math.abs(b.feed - M.bends[i].feed),
    Math.abs(b.angle - M.bends[i].angle),
    Math.abs(E.wrap180(b.rot - M.bends[i].rot)));
});
ok('ida y vuelta FK -> IK exacta', e < 1e-9, `error máx ${e.toExponential(2)}`);
ok('cola preservada', Math.abs(back.tail - M.tail) < 1e-9);

/* longitud desarrollada = sum(rectas) + sum(arcos) */
const path_ = E.buildPath(M);
const rectas = M.bends.reduce((a, b, i) =>
  a + b.feed - E.trimOf(b) - (i ? E.trimOf(M.bends[i - 1]) : 0), 0);
const arcos = M.bends.reduce((a, b) => a + (b.radius || 0) * E.bendDecomp(b).theta, 0);
const colaL = M.tail - E.trimOf(M.bends[M.bends.length - 1]);
ok('longitud desarrollada coherente',
   Math.abs(path_.total - (rectas + arcos + colaL)) < 1e-6,
   `${path_.total.toFixed(1)} mm`);

const fin = path_.samples[path_.samples.length - 1].p;
ok('trayectoria termina en la punta libre', fin.distanceTo(P[P.length - 1]) < 1e-6);

const mf = E.machineFeeds(M);
ok('avances de máquina positivos', mf.every(v => v > 0), `mín ${Math.min(...mf).toFixed(1)} mm`);

const ori = E.orientations(M);
ok('orientaciones solo W o T', ori.every(o => o === 'W' || o === 'T'),
   `W=${ori.filter(o => o === 'W').length} T=${ori.filter(o => o === 'T').length}`);

/* ======================================================================== */
console.log('\n— longitudes por doblez —');
{
  const L = E.rowLengths(M);
  ok('rowLengths da una fila por doblez', L.length === M.bends.length);

  /* la recta de rowLengths ES el avance de máquina: si un día dejan de
     coincidir, algo se rompió */
  ok('recta(i) coincide con machineFeeds()[i]',
     maxAbs(L.map((r, i) => r.straight - mf[i])) < 1e-12);

  ok('arco(i) coincide con radius·θ',
     maxAbs(L.map((r, i) =>
       r.arc - (M.bends[i].radius || 0) * E.bendDecomp(M.bends[i]).theta)) < 1e-12);

  ok('cum(i) = cum(i−1) + recta(i) + arco(i)',
     maxAbs(L.map((r, i) =>
       r.cum - ((i ? L[i - 1].cum : 0) + r.straight + r.arc))) < 1e-12);

  ok('developedLength = cum del último + la cola',
     Math.abs(E.developedLength(M) - E.buildPath(M).total) < 1e-9,
     `${E.developedLength(M).toFixed(3)} mm`);

  ok('la cola descuenta el trim del último doblez',
     Math.abs(E.tailStraight(M) - (M.tail - E.trimOf(M.bends[M.bends.length - 1]))) < 1e-12);

  /* la estación de la cinta cae a medio arco */
  const st = E.bendStations(M);
  ok('bendStations[i] cae en cum(i−1) + recta(i) + arco(i)/2',
     maxAbs(st.map((v, i) =>
       v - ((i ? L[i - 1].cum : 0) + L[i].straight + L[i].arc / 2))) < 1e-12);

  /* un doblez recto no genera arco */
  {
    const M0 = E.normalizeModel({
      ...M, bends: M.bends.map((b, i) => i === 2 ? { ...b, rot: 0, angle: 0 } : b),
    });
    const L0 = E.rowLengths(M0);
    ok('con desvío 0 el arco vale 0', Math.abs(L0[2].arc) < 1e-12);
    ok('con desvío 0 cum solo suma la recta',
       Math.abs(L0[2].cum - (L0[1].cum + L0[2].straight)) < 1e-12);
    ok('con desvío 0 la recta es feed − trim(1) (trim propio nulo)',
       Math.abs(L0[2].straight - (M0.bends[2].feed - E.trimOf(M0.bends[1]))) < 1e-12);
  }

  /* escritura inversa de la columna «Recta» */
  {
    const i = 5, objetivo = 87.5;
    const M2 = E.normalizeModel({
      ...M, bends: M.bends.map((b, k) =>
        k === i ? { ...b, feed: E.feedForStraight(M, i, objetivo) } : b),
    });
    ok('feedForStraight deja la recta pedida',
       Math.abs(E.straightOf(M2, i) - objetivo) < 1e-9,
       `${E.straightOf(M2, i).toFixed(4)} mm`);
    ok('feedForStraight es la inversa exacta de straightOf',
       maxAbs(M.bends.map((_, k) =>
         E.feedForStraight(M, k, E.straightOf(M, k)) - M.bends[k].feed)) < 1e-12);
    ok('tocar un feed no mueve las rectas de los demás dobleces',
       maxAbs(M.bends.map((_, k) =>
         k === i ? 0 : E.straightOf(M2, k) - E.straightOf(M, k))) < 1e-12);
  }

  /* un modelo sin dobleces: solo cola */
  {
    const solo = E.normalizeModel({ ...M, bends: [], tail: 250 });
    ok('sin dobleces la longitud desarrollada es la cola',
       E.rowLengths(solo).length === 0 &&
       Math.abs(E.developedLength(solo) - 250) < 1e-12);
  }
}

/* Twist: reorienta la cadena AGUAS ABAJO (cambia el rodado de la barra, así que
   el mismo `rot` comandado apunta a otro lado), pero no altera ningún avance. */
const Mt = E.cloneModel(M);
const IT = 3;                                   // twist en el doblez 4
Mt.bends[IT].twist = 12;
const Pt = E.fk(Mt).pis;
const dist = pts => pts.slice(1).map((p, i) => p.distanceTo(pts[i]));
ok('el twist no toca la cadena aguas arriba',
   Pt.slice(0, IT + 2).every((p, i) => p.distanceTo(P[i]) < 1e-9));
ok('el twist reorienta la cadena aguas abajo',
   Pt.slice(IT + 2).some((p, i) => p.distanceTo(P[i + IT + 2]) > 1),
   `punta se mueve ${Pt[Pt.length - 1].distanceTo(P[P.length - 1]).toFixed(1)} mm`);
ok('el twist preserva todos los avances',
   dist(Pt).every((d, i) => Math.abs(d - dist(P)[i]) < 1e-9));

/* ---------------------------------------------------------------------- */
console.log('\n— doblez biaxial: `rot` dobla de canto, `angle` de plano —');

const EM = E.emptyModel();
/* Convención LRA: `rot` RUEDA la pieza y elige el plano, `angle` es el doblez
   entero. El mismo ángulo con distinto rodado dobla contra otra cara. */
const uno = (rot, angle) => E.normalizeModel({ ...EM, tail: 200,
  bends: [E.newBend({ feed: 200, rot, angle, radius: 30 })] });
const punta = m => { const P = E.fk(m).pis; return P[P.length - 1]; };
const Pl = uno(0, 40), Ca = uno(90, 40);
const ppE = punta(Pl), pcE = punta(Ca);

ok('con R=0 el doblez cae contra la cara plana (espesor, y)',
   Math.abs(ppE.z) < 1e-9 && Math.abs(ppE.y) > 10,
   `y=${ppE.y.toFixed(1)}  z=${ppE.z.toExponential(1)}`);
ok('con R=90 el mismo ángulo cae contra el canto (ancho, z)',
   Math.abs(pcE.y) < 1e-9 && Math.abs(pcE.z) > 10,
   `y=${pcE.y.toExponential(1)}  z=${pcE.z.toFixed(1)}`);
ok('rodar no cambia el tamaño del doblez, solo el plano',
   Math.abs(Math.abs(ppE.y) - Math.abs(pcE.z)) < 1e-9);
ok('un ángulo positivo desvía hacia -y (signo invertido respecto a 1.0)',
   ppE.y < -10, `y=${ppE.y.toFixed(1)}`);
ok('R=180 dobla lo mismo hacia el otro lado',
   Math.abs(punta(uno(180, 40)).y + ppE.y) < 1e-9);
ok('orientations lee el rodado, no el ángulo',
   E.orientations(Pl)[0] === 'T' && E.orientations(Ca)[0] === 'W' &&
   E.orientations(uno(-90, 40))[0] === 'W' && E.orientations(uno(180, 40))[0] === 'T');

const dp = E.bendDecomp(Pl.bends[0]), dc = E.bendDecomp(Ca.bends[0]);
ok('con R=0 el eje del arco es el ancho (z)',
   Math.abs(Math.abs(dp.axis.z) - 1) < 1e-12,
   `eje ${dp.axis.toArray().map(v => v.toFixed(3)).join(' ')}`);
ok('con R=90 el eje del arco pasa a ser el espesor (y)',
   Math.abs(Math.abs(dc.axis.y) - 1) < 1e-12,
   `eje ${dc.axis.toArray().map(v => v.toFixed(3)).join(' ')}`);
ok('el rodado inclina el EJE, no rueda la barra',
   Math.abs(dc.axis.z) < 1e-12);
ok('con un solo arco nunca queda rodado residual',
   Math.abs(dp.psi) < 1e-12 && Math.abs(dc.psi) < 1e-12);

/* LA prueba de este cambio: doblar de canto NO puede dejar la sección rodada,
   o el rodado estaría haciendo de twist. */
{
  const eyF = m => { const e = E.fk(m).end.elements; return [e[4], e[5], e[6]]; };
  const yc = eyF(Ca);
  ok('doblar de canto deja la sección sin rodar',
     Math.abs(yc[0]) < 1e-9 && Math.abs(yc[1] - 1) < 1e-9 && Math.abs(yc[2]) < 1e-9,
     `y del marco = (${yc.map(v => v.toFixed(3)).join(', ')})`);
  /* EL PROCESO ES SECUENCIAL: `rot` dice cuánto GIRA el eje de doblado y el eje
     se queda ahí. Dos dobleces de canto seguidos son «gira 90» y luego «no
     toques nada», no «90 y 90 otra vez». */
  const mk = (...rots) => E.normalizeModel({ ...EM, tail: 200,
    bends: rots.map(rt => E.newBend({ feed: 200, rot: rt, angle: 30, radius: 30 })) });

  ok('el eje de doblado acumula: 90, 0, 0, -90 -> 90, 90, 90, 0',
     E.axisAngles(mk(90, 0, 0, -90)).join(',') === '90,90,90,0');
  ok('dos dobleces de canto seguidos: se gira una vez y el eje se queda',
     E.orientations(mk(90, 0)).join('') === 'WW');
  ok('para volver de canto a plano hay que girar de vuelta',
     E.orientations(mk(90, -90)).join('') === 'WT');
  ok('una lista de ceros dobla siempre contra la misma cara',
     E.orientations(mk(0, 0, 0)).join('') === 'TTT');
  /* El acumulado se envuelve a (-180, 180]: media vuelta se escribe 180, que es
     como se teclea en la máquina, y no -180. La cuarta estación vuelve a 0, o
     sea al eje de partida. */
  ok('cuatro cuartos de vuelta dejan el eje donde estaba',
     E.axisAngles(mk(90, 90, 90, 90)).join(',') === '90,180,-90,0');
  ok('media vuelta se escribe 180, no -180',
     E.wrapTurn(180) === 180 && E.wrapTurn(-180) === 180 && E.wrapTurn(540) === 180 &&
     E.wrapTurn(-90) === -90 && E.wrapTurn(270) === -90);
  /* el eje que resulta de los giros del demo es EXACTAMENTE la columna que
     enseñaba la convención anterior, donde cada fila declaraba su eje */
  ok('los giros del demo reconstruyen los ejes de la convención anterior',
     E.axisAngles(E.demoModel()).join(',') ===
     '0,-90,180,0,90,180,0,90,180,180,90,180,0,90,180');

  /* La consecuencia geométrica, que es la que importa: con el eje sostenido,
     dos dobleces seguidos salen en el MISMO plano; con la convención anterior
     —donde cada fila declaraba su eje absoluto— hacían falta dos noventas. */
  const sostenido = mk(90, 0);
  const P2 = E.fk(sostenido).pis;
  const plano = P2.every(q => Math.abs(q.y) < 1e-9);
  ok('con el eje sostenido los dos dobleces salen en el mismo plano', plano,
     `y máx ${maxAbs(P2.map(q => q.y)).toExponential(1)}`);

  /* Y la inversa devuelve INCREMENTOS, no posiciones absolutas. */
  const vuelta = E.ik(P2, [30, 30]);
  ok('ik devuelve el rodado como incremento',
     Math.abs(vuelta.bends[0].rot - 90) < 1e-9 && Math.abs(vuelta.bends[1].rot) < 1e-9,
     `${vuelta.bends[0].rot.toFixed(3)}, ${vuelta.bends[1].rot.toFixed(3)}`);
}
ok('el desvío total es el ángulo, ruede lo que ruede',
   Math.abs(dp.theta * E.R2D - 40) < 1e-9 && Math.abs(dc.theta * E.R2D - 40) < 1e-9);
ok('el desvío nunca es negativo',
   E.bendDecomp(E.newBend({ rot: 0, angle: -40 })).theta * E.R2D - 40 < 1e-9 &&
   E.bendDecomp(E.newBend({ rot: 0, angle: -40 })).theta > 0);

const Cx = E.newBend({ rot: 30, angle: 40, radius: 30 });
ok('trimOf usa el ángulo del doblez y no depende del rodado',
   Math.abs(E.trimOf(Cx) - 30 * Math.tan(40 * E.D2R / 2)) < 1e-12 &&
   Math.abs(E.trimOf(Cx) - E.trimOf(E.newBend({ rot: 0, angle: 40, radius: 30 }))) < 1e-12);

/* la torsión sigue siendo lo ÚNICO que rueda la barra */
{
  const tw = E.normalizeModel({ ...EM, tail: 150,
    bends: [E.newBend({ feed: 100, rot: 0, angle: 30, twist: 90 }),
            E.newBend({ feed: 100, rot: 0, angle: 30 })] });
  const sin = E.normalizeModel({ ...EM, tail: 150,
    bends: [E.newBend({ feed: 100, rot: 0, angle: 30 }),
            E.newBend({ feed: 100, rot: 0, angle: 30 })] });
  const pt = m => { const P = E.fk(m).pis; return P[P.length - 1]; };
  ok('la torsión sí cambia la cadena aguas abajo',
     pt(tw).distanceTo(pt(sin)) > 10, `${pt(tw).distanceTo(pt(sin)).toFixed(1)} mm`);
  ok('la torsión rueda la sección y el eje juntos: la cara no cambia',
     E.orientations(tw).join('') === 'TT');
}

/* migración desde barcomp/1.0: cambia la convención, no la pieza */
{
  const viejo = E.normalizeModel({ ...EM, tail: 160,
    bends: [E.newBend({ feed: 140, rot: 0, angle: 30, radius: 30 }),
            E.newBend({ feed: 100, rot: -40, angle: 0, radius: 45 }),
            E.newBend({ feed: 120, rot: 0, angle: -25, radius: 30 })] });
  const antes = E.fkLegacy(viejo, 'barcomp/1.0').pis;
  const nuevo = E.migrateModel(viejo, 'barcomp/1.0');
  const desp = E.fk(nuevo).pis;
  ok('migrateModel conserva la forma exacta',
     maxAbs(antes.map((q, i) => q.distanceTo(desp[i]))) < 1e-9,
     `${maxAbs(antes.map((q, i) => q.distanceTo(desp[i]))).toExponential(2)} mm`);
  ok('migrateModel conserva la cola y los radios',
     Math.abs(nuevo.tail - viejo.tail) < 1e-9 &&
     nuevo.bends.every((b, i) => b.radius === viejo.bends[i].radius));
  ok('migrateModel deja los ángulos en forma canónica',
     nuevo.bends.every(b => b.angle >= -1e-12));
  ok('migrateModel conserva la orientación de cada doblez',
     E.orientations(nuevo).join('') === 'TWT');
  ok('isLegacyDoc distingue los esquemas anteriores',
     E.isLegacyDoc({ schema: 'barcomp/1.0' }) && E.isLegacyDoc({ schema: 'barcomp/2.0' }) &&
     !E.isLegacyDoc({ schema: E.SCHEMA }));

  /* también se convierte desde 2.0, donde `rot` sí rodaba la barra */
  const v20 = E.normalizeModel({ ...EM, tail: 160,
    bends: [E.newBend({ feed: 140, rot: 0, angle: 30, radius: 30 }),
            E.newBend({ feed: 100, rot: -40, angle: 20, radius: 45 }),
            E.newBend({ feed: 120, rot: 70, angle: -25, radius: 30 })] });
  const a20 = E.fkLegacy(v20, 'barcomp/2.0').pis;
  const d20 = E.fk(E.migrateModel(v20, 'barcomp/2.0')).pis;
  ok('migrateModel también convierte desde barcomp/2.0',
     maxAbs(a20.map((q, i) => q.distanceTo(d20[i]))) < 1e-9,
     `${maxAbs(a20.map((q, i) => q.distanceTo(d20[i]))).toExponential(2)} mm`);
}

/* El arco NO se traza como Rx(φ)·Rz(θ): eso da la posición correcta pero gira
   la sección a lo largo del arco y la endereza de un salto en el vértice. */
{
  const last = path_.samples[path_.samples.length - 1];
  const endB = E.fk(M).end.elements;
  const cols = [last.x, last.y, last.z];
  let d = 0;
  for (let c = 0; c < 3; c++) {
    d = Math.max(d, Math.abs(cols[c].x - endB[c * 4]),
                    Math.abs(cols[c].y - endB[c * 4 + 1]),
                    Math.abs(cols[c].z - endB[c * 4 + 2]));
  }
  ok('el marco de buildPath coincide con el de fk', d < 1e-9, `${d.toExponential(2)}`);
}

/* ---------------------------------------------------------------------- */
console.log('\n— torsión repartida a lo largo de una sección —');

/* La torsión se reparte sobre `twistLen` mm CENTRADOS en la recta siguiente.
   Como Rx conmuta con Trans(x), mover la zona no toca ningún PI ni el marco
   final: solo cambia DÓNDE ocurre físicamente el retorcido.                 */
{
  const spans = E.twistSpans(500, 90, 120);
  const dl = spans.reduce((a, x) => a + x[0], 0);
  const dt = spans.reduce((a, x) => a + x[1], 0) * E.R2D;
  ok('twistSpans conserva longitud y torsión totales',
     Math.abs(dl - 500) < 1e-9 && Math.abs(dt - 90) < 1e-9,
     `${dl.toFixed(6)} mm / ${dt.toFixed(6)}°`);
  ok('twistSpans deja recta sin torcer a ambos lados de la zona',
     Math.abs(spans[0][1]) < 1e-15 && Math.abs(spans[spans.length - 1][1]) < 1e-15 &&
     Math.abs(spans[0][0] - 190) < 1e-9,
     `guarda ${spans[0][0].toFixed(1)} mm`);
}

const Tw = E.normalizeModel({
  name: 'twist', tail: 500,
  bends: [E.newBend({ feed: 200, rot: 0, angle: 30, radius: 20, twist: 90, twistLen: 0 })],
});
const TwZ = E.cloneModel(Tw);
TwZ.bends[0].twistLen = 120;

ok('twistSpanOf mide la recta disponible',
   Math.abs(E.twistSpanOf(Tw, 0) - (Tw.tail - E.trimOf(Tw.bends[0]))) < 1e-9,
   `${E.twistSpanOf(Tw, 0).toFixed(2)} mm`);

const pA = E.fk(Tw).pis, pB = E.fk(TwZ).pis;
ok('twistLen no mueve ningún PI', pA.every((p, i) => p.distanceTo(pB[i]) < 1e-12));

const bpA = E.buildPath(Tw), bpB = E.buildPath(TwZ);
ok('twistLen no cambia la longitud desarrollada',
   Math.abs(bpA.total - bpB.total) < 1e-9, `${bpB.total.toFixed(3)} mm`);
ok('la trayectoria con zona acotada termina en la punta libre',
   bpB.samples[bpB.samples.length - 1].p.distanceTo(pB[pB.length - 1]) < 1e-6);

/* rodado del marco respecto al inicio de la cola, a una distancia dada */
const tailStart = bpB.total - (Tw.tail - E.trimOf(Tw.bends[0]));
const at = (bp, d) => {
  const s = tailStart + d;
  let best = bp.samples[0], bd = Infinity;
  for (const q of bp.samples) { const x = Math.abs(q.s - s); if (x < bd) { bd = x; best = q; } }
  return best;
};
const y0 = at(bpB, 0).y.clone();
const roll = (bp, d) => Math.acos(E.clamp(at(bp, d).y.dot(y0), -1, 1)) * E.R2D;

ok('fuera de la zona (antes) la barra no está torcida',
   roll(bpB, 100) < 0.5, `${roll(bpB, 100).toFixed(2)}° a 100 mm`);
ok('dentro de la zona la torsión es gradual, no un salto',
   roll(bpB, 250) > 30 && roll(bpB, 250) < 60, `${roll(bpB, 250).toFixed(2)}° a 250 mm`);
ok('fuera de la zona (después) la torsión ya está completa',
   Math.abs(roll(bpB, 420) - 90) < 0.5, `${roll(bpB, 420).toFixed(2)}° a 420 mm`);
ok('twistLen=0 reparte la torsión por toda la recta',
   roll(bpA, 100) > 10 && Math.abs(roll(bpA, 100) - roll(bpB, 100)) > 5,
   `${roll(bpA, 100).toFixed(2)}° vs ${roll(bpB, 100).toFixed(2)}° a 100 mm`);

/* ---------------------------------------------------------------------- */
console.log('\n— alineación —');

const Q = E.fk(M).pis;
const Rt = new Matrix4()
  .makeRotationFromEuler(new Euler(0.3, -0.2, 0.7)).setPosition(50, -30, 20);
const Pm = Q.map(p => p.clone().applyMatrix4(Rt));
const inv = E.kabsch(Pm, Q);
let ke = 0;
Pm.forEach((p, i) => { ke = Math.max(ke, p.clone().applyMatrix4(inv).distanceTo(Q[i])); });
ok('Kabsch recupera una transformación rígida', ke < 1e-8, `residual ${ke.toExponential(2)} mm`);

/* ---------------------------------------------------------------------- */
console.log('\n— lazo de compensación —');

const proc = { sbW: 1.6, sbT: 1.0, slip: .12, biasRot: .35,
               noiseA: .04, noiseF: .06, noiseR: .04, seed: 7 };
const comp = { gainW: .75, gainT: .75, doAngle: true, doRot: true, doFeed: true };
let cmd = M.bends.map(b => E.newBend(b));
const hist = [];
for (let it = 0; it < 4; it++) {
  proc.seed = 7 + it;
  const meas = E.simulate(cmd, proc, ori, true);
  const tip = E.fk({ ...M, bends: meas }).pis.slice(-1)[0].distanceTo(P[P.length - 1]);
  const maxA = Math.max(...meas.map((b, i) => Math.abs(b.angle - M.bends[i].angle)));
  hist.push({ it, maxA, tip });
  console.log(`       iter ${it}   Δang máx ${maxA.toFixed(4)}°   punta ${tip.toFixed(3)} mm`);
  cmd = E.compensate(cmd, M.bends, meas, comp, ori);
}
ok('el lazo reduce el error angular', hist[3].maxA < hist[0].maxA * 0.2);
ok('el lazo reduce la desviación de punta', hist[3].tip < hist[0].tip * 0.2);
ok('sin corregir nada, el comando no cambia',
   E.compensate(cmd, M.bends, M.bends,
     { gainW: .75, gainT: .75, doAngle: false, doRot: false, doFeed: false }, ori)
     .every((b, i) => Math.abs(b.angle - cmd[i].angle) < 1e-12));

/* el resorte actúa sobre el DOBLEZ; cuánto, según el plano en que se dio */
{
  const one = [E.newBend({ feed: 100, rot: 20, angle: 40, radius: 30 })];
  const sT = E.simulate(one, { ...E.PROC_DEFAULT, biasRot: 0 }, ['T'], false);
  const sW = E.simulate(one, { ...E.PROC_DEFAULT, biasRot: 0 }, ['W'], false);
  ok('simulate aplica el resorte de plano a un doblez de plano',
     Math.abs(sT[0].angle - 40 * (1 - E.PROC_DEFAULT.sbT / 100)) < 1e-12);
  ok('simulate aplica el de canto a uno de canto',
     Math.abs(sW[0].angle - 40 * (1 - E.PROC_DEFAULT.sbW / 100)) < 1e-12);
  ok('el rodado no tiene resorte: solo el sesgo del eje C',
     Math.abs(sT[0].rot - (20 + E.PROC_DEFAULT.biasRot * 0)) < 1e-12);
}
/* deviations: fuera si el doblez o el rodado se salen */
{
  const base = E.normalizeModel({ ...EM, tail: 150,
    bends: [E.newBend({ feed: 100, rot: 0, angle: 30 }),
            E.newBend({ feed: 100, rot: 90, angle: 30 })] });
  const bad = E.cloneModel(base);
  bad.bends[1].rot = 92;                       // el rodado, no el doblez
  const D = E.deviations(base, bad, 'start');
  ok('deviations marca fuera un rodado desviado', D.out === 1, `out=${D.out}`);
  ok('un rodado desviado no cambia el tamaño del doblez',
     Math.abs(D.angle[1]) < 1e-12 && Math.abs(D.rot[1] - 2) < 1e-9,
     `Δrot=${D.rot[1].toFixed(3)}°`);
  const bad2 = E.cloneModel(base);
  bad2.bends[1].angle = 32;                    // el doblez, no el rodado
  const D2 = E.deviations(base, bad2, 'start');
  ok('deviations mide la desviación del desvío TOTAL',
     Math.abs(D2.theta[1] - 2) < 1e-9, `Δθ=${D2.theta[1].toFixed(3)}°`);
}

/* ---------------------------------------------------------------------- */
console.log('\n— variantes, anclaje y edición de puntos —');

const V = E.newVariant(M, 'base', '#3FA9F5', 'v1');
const W = E.cloneVariant(V, 'variante', '#3FD68C', 'v2');
W.deltas[6].angle = 3.0;

ok('cloneVariant no comparte estado con el original',
   V.deltas[6].angle === 0 && W.deltas[6].angle === 3);

const Me = E.effectiveModel(W);
ok('effectiveModel suma el delta al valor base',
   Math.abs(Me.bends[6].angle - (M.bends[6].angle + 3)) < 1e-12);
ok('effectiveModel no toca los dobleces sin delta',
   M.bends.every((b, i) => i === 6 || Math.abs(Me.bends[i].angle - b.angle) < 1e-12));

const Vb = E.bakeDeltas(E.cloneVariant(W, 'baked', null, 'v3'));
ok('bakeDeltas funde y deja los deltas en cero',
   Math.abs(Vb.base.bends[6].angle - Me.bends[6].angle) < 1e-12 &&
   Vb.deltas.every(x => x.angle === 0));
ok('hasDeltas distingue una variante limpia de una con Δ',
   E.hasDeltas(W) && !E.hasDeltas(Vb));

/* --- anclaje --------------------------------------------------------- */
const shStart = E.piShift(Me, M, 'start');
const shEnd = E.piShift(Me, M, 'end');
ok('anclaje "start" deja quieto el extremo de amarre',
   shStart[0] < 1e-9 && shStart[shStart.length - 1] > 1,
   `punta se mueve ${shStart[shStart.length - 1].toFixed(2)} mm`);
ok('anclaje "end" deja quieto el extremo libre',
   shEnd[shEnd.length - 1] < 1e-9 && shEnd[0] > 1,
   `amarre se mueve ${shEnd[0].toFixed(2)} mm`);
{
  const A = E.anchoredPis(Me, M, 'end'), B = E.fk(Me).pis;
  ok('anclaje "end" conserva la forma (es rígido)',
     Math.abs(A[1].distanceTo(A[0]) - B[1].distanceTo(B[0])) < 1e-9);
  const Tend = E.anchorTransform(Me, M, 'end');
  ok('anchorTransform es una rotación pura + traslación',
     Math.abs(Tend.determinant() - 1) < 1e-9);
  const self = E.anchorTransform(M, M, 'end').elements;
  const idn = new Matrix4().elements;
  ok('un modelo anclado contra sí mismo no se mueve',
     maxAbs(self.map((v, i) => v - idn[i])) < 1e-9);
  const best = E.piShift(Me, M, 'best');
  ok('anclaje "best" reparte el error entre los dos extremos',
     Math.max(...best) < Math.max(...shStart),
     `máx ${Math.max(...best).toFixed(2)} vs ${Math.max(...shStart).toFixed(2)} mm`);
}

/* --- edición de puntos ------------------------------------------------ */
const Mi = E.insertPi(M, 3);
ok('insertPi agrega un doblez', Mi.bends.length === M.bends.length + 1);
ok('insertPi nace colineal (ángulo 0)', Math.abs(Mi.bends[3].angle) < 1e-9,
   `${Mi.bends[3].angle.toExponential(2)}°`);
ok('insertPi no mueve ningún punto existente',
   E.fk(Mi).pis.slice(-1)[0].distanceTo(E.fk(M).pis.slice(-1)[0]) < 1e-9);

const Md = E.deletePi(Mi, 4);
ok('deletePi deshace exactamente el insertPi',
   Md.bends.length === M.bends.length &&
   E.fk(Md).pis.every((p, i) => p.distanceTo(E.fk(M).pis[i]) < 1e-9));

const target = E.fk(M).pis[5].clone().add(new Vector3(0, 0, 25));
const Mm = E.movePi(M, 5, [target.x, target.y, target.z]);
ok('movePi mueve el punto pedido',
   Math.abs(E.fk(Mm).pis[5].distanceTo(E.fk(M).pis[5]) - 25) < 1e-9);
ok('movePi deja quietos los demás puntos (edición absoluta en XYZ)',
   E.fk(Mm).pis.every((p, i) => i === 5 || p.distanceTo(E.fk(M).pis[i]) < 1e-9));
ok('movePi conserva radio y twist por índice',
   Mm.bends.every((b, i) => Math.abs(b.radius - M.bends[i].radius) < 1e-12));
ok('movePi no puede borrar dobleces', Mm.bends.length === M.bends.length);
ok('deletePi se niega a dejar el modelo sin dobleces',
   E.deletePi(E.normalizeModel({ ...EM, bends: [E.newBend()] }), 1).bends.length === 1);

/* ---------------------------------------------------------------------- */
console.log('\n— importar una pieza medida —');

/* La regla del lector es la del motor de Python: de cada línea, las TRES
   ÚLTIMAS columnas numéricas. Todo lo demás se descarta solo. */
{
  const csv = E.writePointsCsv(E.fk(M).pis);
  const back = E.readPointsCsv(csv);
  ok('writePointsCsv -> readPointsCsv es ida y vuelta',
     back.length === P.length &&
     maxAbs(back.map((q, i) => q.distanceTo(P[i]))) < 1e-3,
     `${back.length} pts, error máx ${maxAbs(back.map((q, i) => q.distanceTo(P[i]))).toExponential(1)}`);

  ok('el encabezado no entra como punto',
     E.readPointsCsv('idx,x,y,z\n0,1,2,3').length === 1);
  ok('acepta punto y coma, tabulador y espacios',
     E.readPointsCsv('1;2;3\n4\t5\t6\n7 8 9').length === 3);
  ok('toma las TRES ÚLTIMAS columnas, no las primeras',
     E.readPointsCsv('7,1,2,3')[0].x === 1);
  ok('una línea con menos de tres números se descarta',
     E.readPointsCsv('nombre,unidad\n1,2\n1,2,3').length === 1);
  ok('un archivo vacío da cero puntos y no revienta',
     E.readPointsCsv('').length === 0 && E.readPointsCsv('   \n\n').length === 0);

  /* measuredModel: los puntos traen la forma; radio y torsión se arrastran del
     nominal por índice, porque no viven en los puntos. */
  const same = E.measuredModel(M, P);
  ok('measuredModel sobre los PI del nominal reproduce el nominal',
     same.bends.length === M.bends.length &&
     maxAbs(E.fk(same).pis.map((q, i) => q.distanceTo(P[i]))) < 1e-9);
  ok('measuredModel arrastra radio y torsión del nominal',
     same.bends.every((b, i) => Math.abs(b.radius - M.bends[i].radius) < 1e-12 &&
                                Math.abs(b.twist - M.bends[i].twist) < 1e-12));

  /* Una pieza escaneada puede llegar con un doblez de menos. Ya reventó una
     vez, así que aquí se comprueba que entra y que se puede medir contra el
     nominal sin salirse de rango. */
  const corta = E.measuredModel(M, P.slice(0, P.length - 1));
  ok('measuredModel acepta una pieza con menos PI que el nominal',
     corta.bends.length === M.bends.length - 1);
  const dev = E.deviations(M, corta, 'start');
  ok('deviations compara una pieza corta sin desbordar',
     dev.angle.length === corta.bends.length && dev.angle.every(v => isFinite(v)));

  /* Y la de verdad: una pieza deformada tiene que verse deformada. */
  const movidos = P.map((q, i) => (i === 6 ? q.clone().add(new Vector3(0, 0, 12)) : q.clone()));
  const torcida = E.measuredModel(M, movidos);
  const dev2 = E.deviations(M, torcida, 'start');
  ok('un PI movido 12 mm se ve en la desviación de punto',
     maxAbs(dev2.point) > 5, `punta máx ${maxAbs(dev2.point).toFixed(2)} mm`);
}

/* ---------------------------------------------------------------------- */
console.log('\n— varias piezas medidas —');

{
  ok('statOf de una muestra impar da la mediana de en medio',
     E.statOf([5, 1, 3]).med === 3);
  ok('statOf de una muestra par promedia las dos de en medio',
     E.statOf([1, 3, 5, 7]).med === 4);
  ok('statOf de una muestra vacía no revienta',
     E.statOf([]).n === 0 && E.statOf([]).med === 0);
  ok('statOf descarta los no finitos',
     E.statOf([1, NaN, 3, Infinity]).n === 2);

  /* Lo que de verdad importa: un valor absurdo —un PI mal extraído— no debe
     mover la mediana, y sí movería la media. */
  const limpio = [10, 10.1, 9.9, 10.05, 9.95];
  const conBasura = [...limpio, 400];
  const media = a => a.reduce((x, y) => x + y, 0) / a.length;
  ok('un valor absurdo mueve la media pero no la mediana',
     Math.abs(E.statOf(conBasura).med - E.statOf(limpio).med) < .1 &&
     Math.abs(media(conBasura) - media(limpio)) > 50,
     `mediana ${E.statOf(conBasura).med.toFixed(2)} vs media ${media(conBasura).toFixed(1)}`);

  ok('sigma es el MAD escalado 1.4826', (() => {
    const st = E.statOf([1, 2, 3, 4, 5]);   // MAD = 1
    return Math.abs(st.mad - 1) < 1e-12 && Math.abs(st.sigma - 1.4826) < 1e-9;
  })());
  ok('una muestra sin dispersión da sigma cero',
     E.statOf([7, 7, 7]).sigma === 0);

  /* Tres piezas simuladas con semillas distintas: el lote se parece al
     nominal más que cualquiera de las piezas sueltas, que es toda la razón de
     compensar contra la mediana. */
  const ori = E.orientations(M);
  const piezas = [3, 11, 29].map(seed =>
    E.simulate(M.bends, { ...E.PROC_DEFAULT, seed }, ori, true));
  const st = E.bendStats(piezas);
  ok('bendStats da una fila por doblez y cuenta las piezas',
     st.length === M.bends.length && st.every(x => x.n === 3));
  ok('bendStats reporta dispersión donde el simulador metió ruido',
     st.some(x => x.angle.sigma > 0));

  const med = E.medianPart(piezas);
  ok('medianPart devuelve una pieza completa', med.length === M.bends.length);
  ok('medianPart arrastra radio y torsión, que no se miden',
     med.every((b, i) => Math.abs(b.radius - piezas[0][i].radius) < 1e-12));
  ok('cada ángulo de la mediana es la mediana de los tres',
     med.every((b, i) => Math.abs(b.angle - E.statOf(piezas.map(p => p[i].angle)).med) < 1e-12));
  ok('la mediana cae entre la menor y la mayor de las piezas',
     med.every((b, i) => {
       const v = piezas.map(p => p[i].angle);
       return b.angle >= Math.min(...v) - 1e-12 && b.angle <= Math.max(...v) + 1e-12;
     }));

  /* Y la que justifica el cambio: la mediana del lote está más cerca del
     proceso real (sin ruido) que la pieza suelta más ruidosa. */
  const sinRuido = E.simulate(M.bends, { ...E.PROC_DEFAULT, seed: 3 }, ori, false);
  const err = bs => Math.max(...bs.map((b, i) => Math.abs(b.angle - sinRuido[i].angle)));
  ok('la mediana del lote se acerca al proceso más que la peor pieza suelta',
     err(med) < Math.max(...piezas.map(err)),
     `mediana ${err(med).toFixed(4)}° vs peor pieza ${Math.max(...piezas.map(err)).toFixed(4)}°`);

  /* Una pieza escaneada puede traer menos dobleces. */
  const cortas = [piezas[0], piezas[1].slice(0, 10), piezas[2]];
  const st2 = E.bendStats(cortas);
  ok('bendStats llega hasta la pieza más larga y baja n donde falta muestra',
     st2.length === M.bends.length && st2[0].n === 3 && st2[12].n === 2);
  ok('medianPart se detiene en la pieza más corta',
     E.medianPart(cortas).length === 10);
  ok('medianPart de una sola pieza es esa pieza',
     E.medianPart([piezas[0]]).every((b, i) => Math.abs(b.angle - piezas[0][i].angle) < 1e-12));
  ok('medianPart sin piezas devuelve nada', E.medianPart([]).length === 0);
}

/* ---------------------------------------------------------------------- */
console.log('\n— resorte medido —');

{
  const ori = E.orientations(M);
  const cmd = M.bends;

  /* Sin ruido, la estimación tiene que devolver EXACTAMENTE las constantes con
     las que el simulador fabricó la pieza: es la prueba de que la cuenta y su
     inversa son la misma. */
  const proc = { ...E.PROC_DEFAULT, sbW: 1.6, sbT: 1.0 };
  const limpia = E.simulate(cmd, proc, ori, false);
  const sb = E.springback([{ cmd, meas: limpia }], ori);
  ok('sin ruido el resorte estimado es el que usó el simulador',
     Math.abs(sb.W.stat.med - 1.6) < 1e-9 && Math.abs(sb.T.stat.med - 1.0) < 1e-9,
     `W ${sb.W.stat.med.toFixed(4)} % · T ${sb.T.stat.med.toFixed(4)} %`);
  ok('sin ruido la dispersión es cero',
     sb.W.stat.sigma < 1e-9 && sb.T.stat.sigma < 1e-9);
  ok('las dos orientaciones se estiman por separado',
     sb.W.stat.n > 0 && sb.T.stat.n > 0 && sb.W.stat.n + sb.T.stat.n <= cmd.length);

  /* Con ruido y varias piezas, la mediana sigue cayendo cerca. */
  const piezas = [3, 11, 29, 47].map(seed =>
    ({ cmd, meas: E.simulate(cmd, { ...proc, seed }, ori, true) }));
  const sbn = E.springback(piezas, ori);
  ok('con ruido la mediana sigue cerca del valor real',
     Math.abs(sbn.W.stat.med - 1.6) < .3 && Math.abs(sbn.T.stat.med - 1.0) < .3,
     `W ${sbn.W.stat.med.toFixed(3)} ± ${sbn.W.stat.sigma.toFixed(3)}`);
  ok('con ruido la dispersión deja de ser cero', sbn.W.stat.sigma > 0);
  ok('cuatro piezas dan cuatro veces la muestra de una',
     sbn.W.stat.n === 4 * sb.W.stat.n);

  /* Un doblez casi recto no entra: ahí la división amplifica el ruido hasta
     inventar un resorte. */
  const conRecto = E.normalizeModel({
    ...M, bends: [E.newBend({ feed: 100, rot: 0, angle: 0.3, radius: 30 }), ...M.bends],
  });
  const oriR = E.orientations(conRecto);
  const sbR = E.springback(
    [{ cmd: conRecto.bends, meas: E.simulate(conRecto.bends, proc, oriR, false) }], oriR);
  ok('un doblez de 0.3° no entra en la estimación',
     sbR.W.stat.n + sbR.T.stat.n === sb.W.stat.n + sb.T.stat.n,
     `${sbR.W.stat.n + sbR.T.stat.n} muestras`);

  /* Y la señal que evita el error de fondo: si el resorte depende del ángulo,
     una constante única miente y hay que decirlo. */
  const dep = cmd.map(b => E.newBend({
    ...b, angle: b.angle * (1 - (0.5 + 0.02 * Math.abs(b.angle)) / 100),
  }));
  const sbD = E.springback([{ cmd, meas: dep }], ori);
  ok('se detecta que el resorte depende del ángulo comandado',
     Math.abs(sbD.W.r) > .9 && sbD.W.slope > 0,
     `r ${sbD.W.r.toFixed(3)}, pendiente ${sbD.W.slope.toFixed(4)} %/°`);
  ok('con resorte constante no se señala dependencia', Math.abs(sb.W.r) < 1e-9);
  ok('sin piezas no revienta y devuelve n=0',
     E.springback([], ori).W.stat.n === 0);
}

/* ---------------------------------------------------------------------- */
console.log('\n— colocación en el espacio —');

/* La colocación es SOLO presentación: mueve y gira la escena entera alrededor
   de un PI, sin tocar un solo parámetro del modelo. */
{
  const P = E.fk(M).pis;
  const pivot = P[3];
  const I = E.placeTransform(E.PLACE_DEFAULT, pivot);
  ok('sin colocación la matriz es la identidad',
     maxAbs(I.elements.map((v, i) => v - new Matrix4().elements[i])) < 1e-12);
  ok('isPlaced distingue una colocación puesta', !E.isPlaced(E.PLACE_DEFAULT) &&
     E.isPlaced({ ...E.PLACE_DEFAULT, rz: 30 }));

  const W = E.placeTransform({ ...E.PLACE_DEFAULT, rz: 37, rx: -12, x: 500 }, pivot);
  const Q = E.applyMat(W, P);
  ok('el pivote solo se desplaza lo que se le pidió',
     Math.abs(Q[3].distanceTo(pivot) - 500) < 1e-9,
     `${Q[3].distanceTo(pivot).toFixed(3)} mm`);
  ok('la colocación es rígida: no deforma la pieza',
     P.every((p, i) => i === 0 ||
       Math.abs(Q[i].distanceTo(Q[i - 1]) - p.distanceTo(P[i - 1])) < 1e-9));
  ok('la colocación es una rotación pura + traslación',
     Math.abs(W.determinant() - 1) < 1e-9);
  ok('girar 0° alrededor de otro PI tampoco mueve nada',
     E.applyMat(E.placeTransform(E.PLACE_DEFAULT, P[7]), P)
      .every((q, i) => q.distanceTo(P[i]) < 1e-12));
}

/* ---------------------------------------------------------------------- */
console.log('\n— puntos de referencia —');
{
  const P = E.fk(M).pis;
  const q = P[5].clone().add(new Vector3(0, 0, 40));
  const near = E.nearestPoint(P, q);
  ok('nearestPoint encuentra el PI correcto y su distancia',
     near.i === 5 && Math.abs(near.d - 40) < 1e-9, `PI${near.i} a ${near.d.toFixed(2)} mm`);
  ok('nearestPoint con lista vacía no revienta',
     E.nearestPoint([], q).i === -1 && !isFinite(E.nearestPoint([], q).d));
}

/* ---------------------------------------------------------------------- */
console.log('\n— expresiones en la celda de compensación —');
{
  /* Con la celda sin ajuste, `v` y `c` valen lo mismo: es el caso de siempre. */
  const cases = [
    ['2', 1.5, 2], ['+2', 1.5, 3.5], ['c+2', 1.5, 3.5], ['c-0.5', 1.5, 1],
    ['c*1.1', 2, 2.2], ['*2', 1.5, 3], ['/2', 3, 1.5], ['(c+1)/2', 3, 2],
    ['1,5', 0, 1.5], ['  c  +  2  ', 1, 3],
  ];
  let bad = '';
  for (const [t, c, exp] of cases) {
    const g = E.evalCell(t, c);
    if (g === null || Math.abs(g - exp) > 1e-9) bad += ` ${JSON.stringify(t)}->${g}`;
  }
  ok('evalCell resuelve número, atajo y cuenta sobre c', !bad, bad);

  /* Lo que cambió: un operador al principio opera sobre lo MOSTRADO, que es
     como se comporta una hoja de cálculo. `c` sigue siendo el cálculo del
     lazo, y los dos se separan en la segunda edición de la misma celda. */
  const dos = [
    /* texto, calc, mostrado, esperado */
    ['+2', 1.5, 4.0, 6.0], ['-0.3', 1.5, 4.0, 3.7], ['*2', 1.5, 4.0, 8.0],
    ['c+2', 1.5, 4.0, 3.5], ['c', 1.5, 4.0, 1.5], ['v', 1.5, 4.0, 4.0],
    ['7', 1.5, 4.0, 7.0], ['=-3', 1.5, 4.0, -3], ['= 2.5', 1.5, 4.0, 2.5],
    ['v-c', 1.5, 4.0, 2.5],
  ];
  let bad2 = '';
  for (const [t, c, v, exp] of dos) {
    const g = E.evalCell(t, c, v);
    if (g === null || Math.abs(g - exp) > 1e-9) bad2 += ` ${JSON.stringify(t)}->${g}`;
  }
  ok('un operador al principio opera sobre lo MOSTRADO, y `c` sobre el cálculo',
     !bad2, bad2);

  /* La consecuencia práctica, que es la que hay que poder explicar: teclear
     «+2» dos veces en la misma celda suma dos veces. Antes la segunda no hacía
     nada, porque ambas se medían contra el mismo cálculo del lazo. */
  const calc = 0.163;
  const uno = E.evalCell('+2', calc, calc);
  const dosVeces = E.evalCell('+2', calc, uno);
  ok('teclear «+2» dos veces suma dos veces',
     Math.abs(uno - (calc + 2)) < 1e-9 && Math.abs(dosVeces - (calc + 4)) < 1e-9,
     `${uno.toFixed(3)} -> ${dosVeces.toFixed(3)}`);

  ok('un `-` al principio ya no es un número negativo suelto',
     E.evalCell('-3', 1.5, 1.5) === -1.5 && E.evalCell('=-3', 1.5, 1.5) === -3);
  ok('sin `shown`, `v` es el cálculo: una llamada de antes significa lo mismo',
     E.evalCell('v', 2.5) === 2.5 && E.evalCell('+1', 2.5) === 3.5);

  const malos = ['', '   ', 'abc', '2+', '(2', '2)', 'c c', '1/0*0', '=', '=  '];
  ok('evalCell rechaza lo que no es una expresión',
     malos.every(t => E.evalCell(t, 1) === null),
     malos.filter(t => E.evalCell(t, 1) !== null).join(' ') || 'todos rechazados');
  ok('un número suelto ignora el valor calculado',
     E.evalCell('7', 999) === 7);
}

/* ---------------------------------------------------------------------- */
console.log('\n— modelos y E/S —');
ok('emptyModel es válido', E.fk(EM).pis.length === EM.bends.length + 2);
ok('un modelo de 1 doblez funciona',
   E.fk({ ...EM, bends: [E.newBend({ feed: 100, rot: 0, angle: 90, radius: 30 })] }).pis.length === 3);
{
  const extra = {
    place: { pivot: 3, x: 100, y: 0, z: 0, rx: 0, ry: 0, rz: 45 },
    marks: [{ name: 'apoyo A', color: '#57C8D6', visible: true, x: 10, y: 20, z: 30 }],
    tweak: [{ angle: .25, rot: 0, feed: 0 }],
    ui: { theme: 'light', lang: 'en' },
  };
  const doc = E.toDoc(M, M.bends, { ...E.COMP_DEFAULT }, { ...E.PROC_DEFAULT }, [],
                      [V, W], 'v1', 'end', extra);
  ok('el documento lleva el esquema compartido', doc.schema === 'barcomp/2.2');

  /* MIGRACIÓN 2.1 -> 2.2. En 2.1 cada fila declaraba el eje ABSOLUTO; ahora
     declara cuánto gira. Un archivo anterior tiene que abrir con la MISMA
     pieza: la conversión pasa por los PI, así que no aproxima nada. */
  {
    const viejo = {
      schema: 'barcomp/2.1',
      model: { ...E.demoModel(), bends: [
        E.newBend({ feed: 200, rot: 90, angle: 30, radius: 30 }),
        E.newBend({ feed: 200, rot: 90, angle: 40, radius: 30 }),
        E.newBend({ feed: 200, rot: 0, angle: 25, radius: 30 })], tail: 150 },
      command: [], comp: {}, proc: {}, datasets: [],
    };
    /* la forma que describía ese archivo con la convención de 2.1 */
    const pisViejos = E.fkLegacy(E.normalizeModel(viejo.model), 'barcomp/2.1').pis;
    const abierto = E.fromDoc(JSON.parse(JSON.stringify(viejo)));
    const pisNuevos = E.fk(abierto.model).pis;
    ok('un archivo 2.1 abre con la misma pieza',
       pisNuevos.length === pisViejos.length &&
       maxAbs(pisNuevos.map((q, i) => q.distanceTo(pisViejos[i]))) < 1e-9,
       `error máx ${maxAbs(pisNuevos.map((q, i) => q.distanceTo(pisViejos[i]))).toExponential(1)} mm`);
    ok('y sus ejes absolutos son los que decía el archivo',
       E.axisAngles(abierto.model).map(v => Math.round(v)).join(',') === '90,90,0',
       E.axisAngles(abierto.model).map(v => v.toFixed(2)).join(','));
    ok('el segundo doblez pasa a ser «no muevas el eje»',
       Math.abs(abierto.model.bends[1].rot) < 1e-9,
       `rot = ${abierto.model.bends[1].rot.toFixed(4)}`);
  }
  const rt = E.fromDoc(JSON.parse(JSON.stringify(doc)));
  ok('el documento va y vuelve sin perder variantes',
     rt.variants.length === 2 && rt.ref === 'v1' && rt.anchor === 'end' &&
     Math.abs(rt.variants[1].deltas[6].angle - 3) < 1e-12);
  ok('el documento va y vuelve con colocación, cotas y ajuste manual',
     rt.place.rz === 45 && rt.place.pivot === 3 &&
     rt.marks.length === 1 && rt.marks[0].name === 'apoyo A' && rt.marks[0].z === 30 &&
     Math.abs(rt.tweak[0].angle - .25) < 1e-12);
  ok('el documento lleva tema e idioma',
     doc.ui.theme === 'light' && doc.ui.lang === 'en');
  ok('tema e idioma van y vuelven', rt.ui.theme === 'light' && rt.ui.lang === 'en');
  const viejo = E.fromDoc({ model: M, bends: [] });
  ok('un archivo sin colocación ni cotas abre igual que siempre',
     !E.isPlaced(viejo.place) && viejo.marks.length === 0 && viejo.tweak.length === 0);
  ok('un archivo sin `ui` no dice nada del tema ni del idioma', viejo.ui === null);
  ok('un modelo sin twistLen se normaliza sin romperse',
     E.normalizeModel({ bends: [{ feed: 100, rot: 0, angle: 20, radius: 10 }] })
      .bends[0].twistLen === 0);
}

/* ======================================================================== */
console.log('\n— idiomas —');
{
  /* Comprobar esto a mano es justo el error que se cuela: se agrega una cadena
     en dos idiomas y en el tercero sale la clave cruda en pantalla. */
  const keys = Object.fromEntries(LANGS.map(l => [l, Object.keys(I18N[l]).sort()]));
  ok('hay tres idiomas', LANGS.length === 3 && LANGS.every(l => I18N[l]));
  const base = keys.es;
  for (const l of LANGS) {
    if (l === 'es') continue;
    const falta = base.filter(k => !(k in I18N[l]));
    const sobra = keys[l].filter(k => !(k in I18N.es));
    ok(`I18N.${l} tiene exactamente las claves de I18N.es`,
       !falta.length && !sobra.length,
       falta.length || sobra.length ? `faltan [${falta}] sobran [${sobra}]` : `${base.length} claves`);
  }
  for (const l of LANGS) {
    const vacias = keys[l].filter(k => typeof I18N[l][k] !== 'string' || !I18N[l][k].trim());
    ok(`ninguna cadena vacía en I18N.${l}`, !vacias.length, `${vacias}`);
  }
  /* Símbolos, ejes y siglas coinciden en los tres idiomas a propósito. La
     exención es POR IDIOMA: en inglés «Datum» y «Twist» son la palabra buena,
     en alemán no —Datum significa fecha, y el bezug de medición es Bezug—, así
     que ahí siguen sin exención y la prueba los vigila. */
  const COMUNES = ['nBend', 'dcol', 'ori', 'x', 'y', 'z', 'arcL', 'cumL',
                   'isRef', 'vIso', 'cDelta', 'rad', 'name',
                   /* «SIM» es la misma sigla en los tres idiomas, como REF. La
                      medida sí cambia (MED/MEAS/MESS) y sigue vigilada. */
                   'srcSim', 'srcVerify',
                   /* «±σ» es notación, no idioma. Su tooltip sí está traducido. */
                   'spread'];
  const IGUALES = {
    en: new Set([...COMUNES, 'cmode', 'distPi', 'nearPi', 'stDatum', 'twist']),
    de: new Set(COMUNES),
  };
  for (const l of ['en', 'de']) {
    const sin = base.filter(k => !IGUALES[l].has(k) && I18N[l][k] === I18N.es[k]);
    ok(`I18N.${l} no arrastra cadenas del español`, !sin.length, `${sin}`);
  }

  const antes = LANG.cur;
  setLang('de');
  ok('setLang acepta el alemán',
     LANG.cur === 'de' && T('orW') === 'Hochkantbiegung (gegen die Breite)');
  setLang('zz');
  ok('un idioma desconocido cae en español', LANG.cur === 'es');
  setLang(antes);
}

console.log(`\n${fails ? fails + ' PRUEBA(S) FALLARON' : 'todas las pruebas pasaron'}\n`);
process.exit(fails ? 1 : 0);
