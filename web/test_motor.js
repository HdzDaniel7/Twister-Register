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
import { readFileSync } from 'node:fs';
import { Matrix4, Euler, Vector3 } from 'three';
import * as E from './src/engine.ts';
import { I18N, LANGS, LANG, setLang, T } from './src/i18n.ts';
import { esc, safeColor, COLOR_FALLBACK } from './src/safe.ts';

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
/* SENTIDO DE GIRO. Un ángulo positivo desvía hacia +y: es lo contrario de lo
   que hacía el motor histórico, y se cambió sin tocar un solo dato —los mismos
   números doblan al otro lado— porque es el sentido con el que llegan los
   datos del taller. Lo decide ANG_DIR, en el motor. */
ok('un ángulo positivo desvía hacia +y', ppE.y > 10, `y=${ppE.y.toFixed(1)}`);
ok('ANG_DIR es lo único que decide el sentido del ángulo', E.ANG_DIR === -1);
/* SENTIDO DEL RODADO. Un rot de +90 inclina el eje hacia donde antes lo
   llevaba un -90: los mismos números giran al otro lado, sin tocar un dato.
   Lo decide ROT_DIR, y es independiente del sentido del ángulo. */
ok('un rodado de +90 lleva el doblez a -z', pcE.z < -10, `z=${pcE.z.toFixed(1)}`);
ok('ROT_DIR es lo único que decide el sentido del rodado', E.ROT_DIR === -1);
ok('voltear el signo del rodado voltea el plano',
   Math.abs(punta(uno(-90, 40)).z + pcE.z) < 1e-9);
ok('voltear el signo del ángulo voltea el doblez',
   Math.abs(punta(uno(0, -40)).y + ppE.y) < 1e-9);
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
  /* FORMA CANÓNICA: el eje elige el PLANO —0 de plano, ±90 de canto— y nunca
     media vuelta, porque voltear el doblez es cosa del signo del ángulo. */
  {
    const D = E.demoModel();
    ok('el eje del demo solo usa planos, nunca media vuelta',
       E.axisAngles(D).every(a => Math.abs(a) <= 90 + 1e-9),
       E.axisAngles(D).join(','));
    ok('los giros del demo son cuartos de vuelta o nada',
       D.bends.every(b => [0, 90, -90].some(v => Math.abs(b.rot - v) < 1e-9)),
       D.bends.map(b => b.rot).join(','));
    ok('el signo del ángulo es lo que voltea el doblez',
       D.bends.some(b => b.angle < 0) && D.bends.some(b => b.angle > 0));
    /* y la pieza es la misma: los ejes de antes eran estos módulo 180 */
    const antes = [0, -90, 180, 0, 90, 180, 0, 90, 180, 180, 90, 180, 0, 90, 180];
    ok('la pieza no se movió: cada eje coincide con el anterior módulo 180',
       E.axisAngles(D).every((a, i) => {
         const d = Math.abs(E.wrap180(a - antes[i]));
         return d < 1e-9 || Math.abs(d - 180) < 1e-9;
       }));
  }

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
  ok('migrateModel deja el eje en su plano y el signo en el ángulo',
     E.axisAngles(nuevo).every(a => Math.abs(a) <= 90 + 1e-9),
     E.axisAngles(nuevo).map(a => a.toFixed(1)).join(','));
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

  /* --- El caso que motivó el cambio: un informe de inspección de ZEISS/GOM.
     Con la regla vieja («las tres últimas columnas numéricas») este archivo
     entraba entero e importaba la DESVIACIÓN como si fueran coordenadas: una
     nube de ~0 mm que parece una barra perfecta. */
  const gom = 'Punto,X,Y,Z,NomX,NomY,NomZ,Dev\n'
            + 'P1,10.1,20.2,30.3,10,20,30,0.37\n'
            + 'P2,110.4,21.1,29.8,110,21,30,0.45\n'
            + 'P3,210.9,20.7,30.2,211,21,30,0.31\n';
  const g = E.parsePointsCsv(gom);
  ok('un informe de inspección con nominal y desviación se RECHAZA',
     g.reason === 'tooManyColumns' && g.pts.length === 0, `${g.reason}, ${g.cols} columnas`);
  /* 7, no 8: `P1` no es un número y no cuenta como columna numérica. */
  ok('y dice cuántas columnas numéricas encontró', g.cols === 7, `${g.cols}`);

  /* Decimales con coma: `1,5` son dos columnas, no un número y medio. Antes
     `1,5;2,5;3,5` devolvía el punto (5, 3, 5), que parece perfectamente sano. */
  const euro = E.parsePointsCsv('1,5;2,5;3,5\n10,5;20,5;30,5');
  ok('los decimales con coma se detectan y se rechazan',
     euro.reason === 'decimalComma' && euro.pts.length === 0, `${euro.reason}`);

  /* Una línea corrupta ya no desplaza las columnas del resto: se descarta y se
     cuenta. Antes `0,NaN,20,30` devolvía el punto (0, 20, 30).
     Los puntos van separados 100 mm porque lo que se prueba aquí son las
     COLUMNAS, y tres PI idénticos los rechaza ahora la guarda de coincidencia
     (PI_MIN_MM) antes de llegar a la aserción. */
  const roto = E.parsePointsCsv('1,10,20,30\n2,NaN,20,30\n3,110,20,30\n4,210,20,30');
  ok('una línea corrupta se descarta en vez de recortarse',
     roto.pts.length === 3 && roto.skipped === 1, `${roto.pts.length} pts, ${roto.skipped} descartadas`);
  ok('y las que sí entraron conservan sus coordenadas',
     roto.pts[0].x === 10 && roto.pts[0].y === 20 && roto.pts[0].z === 30);

  /* Un archivo limpio de 3 columnas y otro de 4 siguen entrando sin ruido. */
  ok('tres columnas limpias entran sin descartes',
     E.parsePointsCsv('1,2,3\n4,5,6').skipped === 0);
  ok('cuatro columnas (índice + xyz) entran sin descartes',
     E.parsePointsCsv('0,1,2,3\n1,4,5,6').skipped === 0);

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

  /* parseFloat se para en el segundo punto: «1.2.3» daba 1.2, o sea la celda se
     quedaba con un valor que nadie escribió y sin decirlo. El trozo entero
     tiene que SER un número, no empezar por uno. */
  const dobles = ['1.2.3', '..5', '1..2', '3.4.', 'c+1.2.3'];
  ok('un número con dos puntos no se acepta a medias',
     dobles.every(t => E.evalCell(t, 1) === null),
     dobles.filter(t => E.evalCell(t, 1) !== null)
           .map(t => `${t} -> ${E.evalCell(t, 1)}`).join(' ') || 'todos rechazados');
  /* Y lo que SÍ es un número sigue entrando en sus tres formas. */
  ok('y las tres formas legítimas siguen entrando',
     E.evalCell('1.5', 0) === 1.5 && E.evalCell('.5', 0) === .5 && E.evalCell('2.', 0) === 2);
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
  ok('el documento lleva el esquema compartido', doc.schema === E.SCHEMA);
  ok('y el esquema vigente es 2.3', E.SCHEMA === 'barcomp/2.3');

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
    /* «fixture» y «pedestal» son las palabras del taller y se dicen igual en
       español que en inglés —así las escribe quien monta la pieza— pero NO en
       alemán, donde son Vorrichtung y Bock: ahí la prueba las sigue vigilando. */
    en: new Set([...COMUNES, 'cmode', 'distPi', 'nearPi', 'stDatum', 'twist',
                 'fixture', 'addPed']),
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

/* ======================================================================== */
console.log('\n— guardas del lazo: banda muerta, tope y ganancia —');
{
  const M = E.demoModel();
  const nom = M.bends;
  const ori = E.orientations(M);

  /* 1. BANDA MUERTA. Una diferencia por debajo del ruido de medición no es
        proceso: corregirla es perseguir ruido, y es lo que hacía que con
        σ=1.0° el lazo EMPEORARA la pieza (0.38° -> 0.80° en la auditoría). */
  const casiIgual = nom.map(b => E.newBend({ ...b, angle: b.angle + 0.02 }));
  const sinTocar = E.compensate(nom, nom, casiIgual, { ...E.COMP_DEFAULT }, ori);
  ok('una diferencia por debajo de la banda muerta no mueve el comando',
     sinTocar.every((b, i) => Math.abs(b.angle - nom[i].angle) < 1e-12));

  /* Pero una diferencia real sí se corrige: la banda no debe tapar señal. */
  const desviado = nom.map(b => E.newBend({ ...b, angle: b.angle + 2 }));
  const corregido = E.compensate(nom, nom, desviado, { ...E.COMP_DEFAULT }, ori);
  const mov = corregido.reduce((m, b, i) => Math.max(m, Math.abs(b.angle - nom[i].angle)), 0);
  ok('una desviación real sí se corrige', mov > 1, `mayor corrección ${mov.toFixed(3)}°`);

  /* 2. TOPE POR CICLO. Un salto enorme no es proceso: es un dato malo. Se
        recorta en vez de mandarlo a la máquina. */
  const absurdo = nom.map(b => E.newBend({ ...b, angle: b.angle + 90 }));
  const topado = E.compensate(nom, nom, absurdo, { ...E.COMP_DEFAULT }, ori);
  const salto = topado.reduce((m, b, i) => Math.max(m, Math.abs(b.angle - nom[i].angle)), 0);
  ok('una corrección absurda se recorta al tope',
     salto <= E.COMP_DEFAULT.maxStep + 1e-9, `mayor salto ${salto.toFixed(2)}° (tope ${E.COMP_DEFAULT.maxStep})`);

  /* 3. GANANCIA. Al 100 % el lazo oscila con el ruido: el motor no debe dejar
        pasar más, aunque el campo traiga un número mayor. */
  const g2 = E.compensate(nom, nom, desviado, { ...E.COMP_DEFAULT, gainW: 1.5, gainT: 1.5 }, ori);
  const g1 = E.compensate(nom, nom, desviado, { ...E.COMP_DEFAULT, gainW: 1.0, gainT: 1.0 }, ori);
  ok('una ganancia mayor que 1.0 se limita a 1.0',
     g2.every((b, i) => Math.abs(b.angle - g1[i].angle) < 1e-12));
  ok('GAIN_MAX es 1.0', E.GAIN_MAX === 1.0);

  /* 4. El rodado ya NO se corrige entero, y el avance ya no usa la constante
        del resorte. Son ganancias propias. */
  const rotado = nom.map(b => E.newBend({ ...b, rot: b.rot + 4 }));
  const cr = E.compensate(nom, nom, rotado, { ...E.COMP_DEFAULT, doRot: true }, ori);
  const dRot = Math.abs(E.wrap180(cr[0].rot - nom[0].rot));
  ok('el rodado se corrige a media ganancia, no entero',
     Math.abs(dRot - 4 * E.COMP_DEFAULT.gainR) < 1e-9, `${dRot.toFixed(3)}° de 4°`);
  ok('gainR y gainF existen y no son la ganancia del resorte',
     E.COMP_DEFAULT.gainR === .5 && E.COMP_DEFAULT.gainF === .5);

  /* 5. Un archivo anterior no trae las claves nuevas: tiene que abrir igual. */
  const viejo = { gainW: .75, gainT: .75, doAngle: true, doRot: false, doFeed: false };
  const conViejo = E.compensate(nom, nom, desviado, viejo, ori);
  ok('un Comp sin las claves nuevas usa los valores por defecto',
     conViejo.every((b, i) => Math.abs(b.angle - corregido[i].angle) < 1e-12));
}

/* ======================================================================== */
console.log('\n— frontera ±90: la rama del nominal —');
{
  /* El hallazgo más grave de la auditoría. Las estaciones de canto tienen eje
     absoluto exactamente 90, justo en la frontera de canonRot(). Con el sesgo
     de eje C que el propio simulador modela (+0.35), la forma canónica escribe
     -89.65 con el ángulo negado: MISMA geometría, otra rama. deviations()
     comparaba fila contra fila y leía 180 de desviación donde había 0.35, y
     compensate() respondía con un comando destructivo. */
  const M = E.demoModel();
  const nom = M.bends;

  /* Una pieza "medida" idéntica al nominal salvo un sesgo de eje pequeño. */
  const sesgo = 0.35;
  const medCrudo = nom.map(b => E.newBend({ ...b, rot: b.rot + (b.rot !== 0 ? sesgo : 0) }));

  /* Sin alinear, el eje absoluto de las estaciones de canto cruza la frontera
     al pasar por ik(). Se reconstruye por PI, que es el camino real. */
  const pisMed = E.fk({ ...M, bends: medCrudo }).pis;
  const crudo = E.ik(pisMed, medCrudo.map(b => b.radius)).bends;

  const alineado = E.alignBranch(crudo, nom);

  /* 1. Alinear NO mueve la pieza: los PI son los mismos. */
  let ePi = 0;
  const pa = E.fk({ ...M, bends: alineado }).pis;
  const pc = E.fk({ ...M, bends: crudo }).pis;
  pa.forEach((p, i) => { ePi = Math.max(ePi, p.distanceTo(pc[i])); });
  ok('alignBranch no mueve la pieza', ePi < 1e-9, `error máx ${ePi.toExponential(2)} mm`);

  /* 2. Y deja cada eje absoluto del mismo lado que el nominal. */
  const aN = E.axisAnglesOf(nom), aA = E.axisAnglesOf(alineado);
  const peor = aA.reduce((m, a, i) => Math.max(m, Math.abs(E.wrap180(a - aN[i]))), 0);
  ok('cada eje queda en la rama del nominal', peor <= 90 + 1e-9, `peor ${peor.toFixed(2)}°`);

  /* 3. Lo que importa: las desviaciones dejan de ser un abismo. */
  const dev = E.deviations(M, { ...M, bends: crudo }, 'start');
  const maxRot = dev.rot.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  const maxAng = dev.angle.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  ok('dev.rot ya no salta a 180', maxRot < 1, `máx ${maxRot.toFixed(3)}°`);
  ok('dev.angle ya no salta a decenas de grados', maxAng < 1, `máx ${maxAng.toFixed(3)}°`);

  /* 4. Y por lo tanto el comando compensado se queda cerca del nominal, en vez
        de irse a 62 donde el nominal pide 25. */
  const ori = E.orientations({ ...M, bends: nom });
  const cmd = E.compensate(nom, nom, dev ? E.alignBranch(crudo, nom) : crudo,
                           { ...E.COMP_DEFAULT, doRot: true }, ori);
  const salto = cmd.reduce((m, b, i) => Math.max(m, Math.abs(b.angle - nom[i].angle)), 0);
  ok('el comando compensado no se dispara', salto < 1, `mayor cambio ${salto.toFixed(3)}°`);

  /* 5. Alinear algo ya alineado no cambia nada (idempotente): deviations() lo
        llama defensivamente sobre piezas que ya pasaron por addDataset(). */
  const otraVez = E.alignBranch(alineado, nom);
  const eId = otraVez.reduce((m, b, i) => Math.max(m,
    Math.abs(b.angle - alineado[i].angle), Math.abs(E.wrap180(b.rot - alineado[i].rot))), 0);
  ok('alignBranch es idempotente', eId < 1e-12);

  /* 6. Una pieza con MENOS dobleces que el nominal no revienta. */
  const corta = E.alignBranch(crudo.slice(0, 3), nom);
  ok('acepta una pieza más corta que el nominal', corta.length === 3);
  /* Y una con más: los que sobran se dejan como están, sin nominal contra el
     que compararlos. */
  const larga = E.alignBranch([...crudo, E.newBend({ feed: 50, rot: 0, angle: 10 })], nom);
  ok('acepta una pieza más larga que el nominal', larga.length === crudo.length + 1);
}

/* ======================================================================== */
console.log('\n— eje no observable en dobleces casi rectos —');
{
  /* Un doblez de medio grado con ruido de medición no tiene eje: la dirección
     lateral es toda ruido. La guarda anterior era `lat < 1e-12`, que con datos
     reales no se cumple nunca. Y como lo que se guarda es el GIRO respecto de
     la estación anterior, un eje inventado envenena TAMBIÉN la fila siguiente. */
  const M = E.demoModel();
  const casi = [
    E.newBend({ feed: 120, rot: 0, angle: 25, radius: 30 }),
    E.newBend({ feed: 100, rot: 0, angle: 0.3, radius: 30 }),   // casi recto
    E.newBend({ feed: 110, rot: 0, angle: 30, radius: 30 }),
  ];
  const base = { ...M, bends: casi, tail: 100 };
  const pis = E.fk(base).pis;

  /* Se mete ruido de medición del orden de lo que da un escaneo. */
  const rnd = E.mulberry32(11);
  const sucios = pis.map(p => p.clone().set(
    p.x + E.gauss(rnd) * 0.5, p.y + E.gauss(rnd) * 0.5, p.z + E.gauss(rnd) * 0.5));

  const sinUmbral = E.ik(sucios, casi.map(b => b.radius), 0);
  const conUmbral = E.ik(sucios, casi.map(b => b.radius), E.AXIS_MIN_DEG);

  ok('el doblez casi recto se marca como no observable',
     conUmbral.unobservable.includes(1), `${conUmbral.unobservable}`);
  ok('y sin umbral no se marcaba nada', sinUmbral.unobservable.length === 0);

  /* El eje heredado deja el giro de esa fila en cero: «no toques el eje», que
     es lo honesto cuando no se puede leer. */
  ok('el doblez no observable hereda el eje anterior',
     Math.abs(conUmbral.bends[1].rot) < 1e-9, `rot = ${conUmbral.bends[1].rot.toFixed(4)}`);

  /* Lo que de verdad importa: el giro GUARDADO deja de ser basura, y con él la
     fila siguiente, que se calcula como diferencia contra el eje anterior.
     Se mide sobre muchas realizaciones de ruido, no sobre una: con una sola el
     resultado depende del seed y la prueba no diría nada.

     OJO: el umbral que se usa aquí (6°) está calibrado al ruido de ESTA prueba.
     `AXIS_MIN_DEG` sigue siendo provisional hasta que se mida la σ real del
     escaneo — ver A.6 en .auditoria/solicitud-datos.md. */
  const salvaje = bs => bs.slice(1, 3).some(b => Math.abs(b.rot) > 10);
  let malSin = 0, malCon = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = E.mulberry32(seed);
    const q = pis.map(p => p.clone().set(
      p.x + E.gauss(r) * 0.5, p.y + E.gauss(r) * 0.5, p.z + E.gauss(r) * 0.5));
    if (salvaje(E.ik(q, casi.map(b => b.radius), 0).bends)) malSin++;
    if (salvaje(E.ik(q, casi.map(b => b.radius), 6).bends)) malCon++;
  }
  ok('el umbral quita la mayoría de los ejes inventados',
     malCon * 4 < malSin, `${malSin}/200 sin umbral -> ${malCon}/200 con umbral`);

  /* El umbral es SOLO del camino medido: un modelo tecleado con un doblez de
     0.3° es deliberado y su eje es exacto. */
  const limpio = E.ik(pis, casi.map(b => b.radius), 0);
  ok('sin ruido y sin umbral, la ida y vuelta sigue siendo exacta',
     limpio.bends.every((b, i) => Math.abs(b.angle - casi[i].angle) < 1e-9));
}

/* ======================================================================== */
console.log('\n— el ángulo se envuelve y el trim no explota a 180° —');
{
  /* `trim = radio · tan(θ/2)` tiene una asíntota en θ = 180. Sin envolver ni
     topar, 180 clavados daba 4.9e17 y 181 daba trim NEGATIVO —la recta crecía
     al doblar más—, y todo eso se colaba en developedLength sin un solo NaN
     que delatara nada. */
  const con = a => E.newBend({ rot: 0, angle: a, radius: 30 });

  /* Envolver es exacto, no es un recorte: girar 200° alrededor de un eje es
     girar 160° alrededor del contrario, o sea la MISMA pieza. */
  ok('el ángulo se envuelve a (-180, 180]',
     Math.abs(E.bendTheta(con(200)) - 160) < 1e-9 &&
     Math.abs(E.bendTheta(con(-200)) - 160) < 1e-9 &&
     Math.abs(E.bendTheta(con(360))) < 1e-9 &&
     Math.abs(E.bendTheta(con(540)) - 180) < 1e-9,
     `200->${E.bendTheta(con(200)).toFixed(1)}  360->${E.bendTheta(con(360)).toFixed(1)}`);
  {
    const a200 = E.fk({ ...E.demoModel(), bends: [con(200)], tail: 100 }).pis;
    const b160 = E.fk({ ...E.demoModel(), bends: [con(-160)], tail: 100 }).pis;
    ok('envolver NO mueve la pieza: 200° y -160° son la misma vuelta',
       a200.every((p, i) => p.distanceTo(b160[i]) < 1e-9));
  }

  ok('el trim se topa en BEND_MAX_DEG y sigue siendo finito',
     isFinite(E.trimOf(con(180))) &&
     Math.abs(E.trimOf(con(180)) - 30 * Math.tan(E.BEND_MAX_DEG * E.D2R / 2)) < 1e-9,
     `${E.trimOf(con(180)).toFixed(2)} mm`);
  ok('el trim nunca sale negativo, doble lo que doble',
     [90, 170, 179, 180, 181, 200, 359, -180, -200].every(a => E.trimOf(con(a)) >= 0));

  const M = E.demoModel();
  M.bends[1].angle = 180;
  ok('developedLength con un doblez de 180° sigue siendo un largo real',
     isFinite(E.developedLength(M)) && E.developedLength(M) > 0,
     `${E.developedLength(M).toFixed(2)} mm`);
  ok('y el doblez imposible sale LISTADO, no disimulado',
     E.overBent(M).length === 1 && E.overBent(M)[0] === 1, `${E.overBent(M)}`);
  ok('un modelo sano no lista ninguno', !E.overBent(E.demoModel()).length);

  /* El tope no puede haberle movido el trim a una pieza normal. */
  ok('por debajo del tope el trim es el de siempre',
     Math.abs(E.trimOf(con(40)) - 30 * Math.tan(40 * E.D2R / 2)) < 1e-12);
}

/* ======================================================================== */
console.log('\n— fabricabilidad: rectas que no caben y dobleces imposibles —');
{
  /* `fk()` acepta un modelo con rectas negativas sin rechistar: multiplica las
     matrices igual y devuelve una trayectoria "válida" que se cruza a sí misma.
     El caso del informe: avance 40 con radio 60. */
  const M = E.demoModel();
  const malo = E.normalizeModel({ ...M, tail: 40, bends: [
    E.newBend({ feed: 40, rot: 0, angle: 90, radius: 60 }),
    E.newBend({ feed: 40, rot: 0, angle: 90, radius: 60 }),
  ] });

  ok('las rectas de máquina salen negativas y se puede comprobar',
     E.machineFeeds(malo).every(s => s < 0),
     E.machineFeeds(malo).map(s => s.toFixed(1)).join(', '));

  const f = E.feasibility(malo);
  ok('la pieza se declara no fabricable', !f.ok);
  ok('y dice QUÉ dobleces tienen la recta negativa',
     f.negative.length === 2 && f.negative[0] === 0 && f.negative[1] === 1, `${f.negative}`);
  ok('la recta de salida también se revisa', f.tailShort);

  ok('un modelo sano no dispara nada', E.feasibility(E.demoModel()).ok);

  /* Corto pero no negativo: es el caso del umbral, y va listado aparte del
     cruce de herramentales porque el umbral se puede discutir y el cruce no. */
  const justo = E.normalizeModel({ ...M, tail: 400, bends: [
    E.newBend({ feed: 200, rot: 0, angle: 20, radius: 30 }),
    E.newBend({ feed: 20 + 2 * E.trimOf(E.newBend({ angle: 20, radius: 30 })), rot: 0, angle: 20, radius: 30 }),
  ] });
  const g = E.feasibility(justo);
  ok('una recta corta pero positiva se lista como corta, no como negativa',
     g.short.includes(1) && !g.negative.includes(1),
     `short ${g.short} · negative ${g.negative}`);

  /* El doblez por encima del tope entra por la misma puerta. */
  const doblado = E.demoModel();
  doblado.bends[1].angle = 180;
  ok('un doblez de 180° también hace la pieza no fabricable',
     !E.feasibility(doblado).ok && E.feasibility(doblado).overBent[0] === 1);
}

/* ======================================================================== */
console.log('\n— PI coincidentes: dos puntos pegados inventan un doblez —');
{
  /* `ik()` normaliza P[i+1]-P[i] y solo se protegía del cero exacto. Dos PI a
     0.3 mm pasan esa guarda y dan una dirección de puro ruido: de ahí sale un
     doblez que no existe, y como se guarda el GIRO respecto de la anterior, la
     fila siguiente hereda la basura. Se ataja en la frontera, al leer. */
  const linea = pts => 'idx,x,y,z\n' +
    pts.map((p, i) => `${i},${p[0]},${p[1]},${p[2]}`).join('\n');

  const sano = E.parsePointsCsv(linea([[0, 0, 0], [100, 0, 0], [200, 30, 0], [300, 60, 0]]));
  ok('un archivo con PI separados entra como siempre',
     sano.reason === 'ok' && sano.pts.length === 4 && !sano.near.length);

  const pegado = E.parsePointsCsv(linea([[0, 0, 0], [100, 0, 0], [100.3, 0, 0], [300, 60, 0]]));
  ok('dos PI a 0.3 mm rechazan el archivo', pegado.reason === 'coincident');
  ok('y dice CUÁL punto, no solo que algo falla',
     pegado.near.length === 1 && pegado.near[0] === 2, `${pegado.near}`);
  ok('un archivo rechazado no deja puntos a medias', !pegado.pts.length);

  /* El umbral es provisional pero no puede rechazar geometría sana: entre dos
     PI de verdad hay la recta más los dos trims, decenas de milímetros. */
  const demo = E.fk(E.demoModel()).pis;
  const minDemo = demo.slice(1).reduce(
    (m, p, i) => Math.min(m, p.distanceTo(demo[i])), Infinity);
  ok('la demo está muy lejos del umbral', minDemo > 10 * E.PI_MIN_MM,
     `PI más juntos: ${minDemo.toFixed(1)} mm vs ${E.PI_MIN_MM} mm`);
}

/* ======================================================================== */
console.log('\n— escala de la nube: una columna de desviación no es una barra —');
{
  /* El agujero que quedaba abierto después de la Fase 0. Un export de
     inspección cuyas tres últimas columnas son la DESVIACIÓN pasa todas las
     guardas anteriores —tres columnas, decimales con punto, ningún par de PI
     pegado— y entra como una pieza perfecta, porque una nube de desviaciones
     de décimas de milímetro alrededor del cero es una barra rectísima y
     diminuta. Esta guarda no necesita saber el formato del archivo: compara
     contra el nominal, que el visor ya tiene cargado. */
  const nom = E.fk(E.demoModel()).pis;
  const paso = E.piStep(nom);

  ok('el nominal de la demo avanza decenas de mm por PI', paso > 20,
     `${paso.toFixed(1)} mm`);

  ok('la propia nube nominal pasa la guarda', E.csvScaleOk(nom, nom));

  /* Una pieza medida de verdad: el nominal movido unos milímetros. */
  const medida = nom.map(p => p.clone().add(new Vector3(0.4, -0.7, 0.2)));
  ok('una pieza medida real pasa la guarda', E.csvScaleOk(medida, nom));

  /* Lo que hay que cazar: la columna de desviación, ±0.5 mm sobre el cero. */
  const desv = nom.map((_, i) => new Vector3(
    Math.sin(i * 1.7) * 0.5, Math.cos(i * 2.3) * 0.5, Math.sin(i * 0.9) * 0.5));
  ok('una nube de desviaciones se rechaza', !E.csvScaleOk(desv, nom),
     `paso ${E.piStep(desv).toFixed(2)} mm vs ${paso.toFixed(1)} mm`);

  /* El mismo error con otra cara: unidades. La peor de las tres es el
     centímetro, y aun así queda a un factor 2.5 del umbral. */
  for (const [nombre, k] of [['metros', 1 / 1000], ['pulgadas', 1 / 25.4], ['centímetros', 1 / 10]]) {
    ok(`una nube en ${nombre} leída como mm se rechaza`,
       !E.csvScaleOk(nom.map(p => p.clone().multiplyScalar(k)), nom));
  }

  /* De un solo lado, a propósito: a un escaneo al que le faltan puntos
     intermedios se le funden dos tramos en uno y su paso medio SUBE. Eso no es
     un archivo malo, es una pieza medida a medias, y ya lo dice csvShort. */
  const huecos = nom.filter((_, i) => i % 2 === 0);
  ok('una pieza con puntos de menos NO se rechaza por escala',
     E.csvScaleOk(huecos, nom),
     `paso ${E.piStep(huecos).toFixed(1)} mm vs ${paso.toFixed(1)} mm`);

  /* Sin nada contra qué comparar, esta guarda no opina. */
  ok('con un nominal degenerado la guarda se calla',
     E.csvScaleOk(desv, []) && E.csvScaleOk(desv, [nom[0]]));

  /* El hueco de verdad, y el motivo de que esta guarda exista: con décimas de
     milímetro la nube de desviaciones ya la cazaba PI_MIN_MM, porque sus
     puntos caen unos encima de otros. Pero una pieza FUERA de tolerancia da
     desviaciones de varios milímetros, y esa nube pasa el guardia de PI
     pegados con holgura. Entre PI_MIN_MM y el paso nominal había una franja de
     dos órdenes de magnitud donde no miraba nadie. */
  const fuera = nom.map((_, i) => new Vector3(
    ((i % 3) - 1) * 4, i % 2 ? 3 : -3, ((i % 4) - 1.5) * 2.5));
  const minFuera = fuera.slice(1).reduce(
    (m, p, i) => Math.min(m, p.distanceTo(fuera[i])), Infinity);
  ok('una desviación de varios mm pasa el guardia de PI pegados',
     minFuera > E.PI_MIN_MM, `${minFuera.toFixed(1)} mm vs ${E.PI_MIN_MM} mm`);
  ok('y aun así se rechaza por escala', !E.csvScaleOk(fuera, nom),
     `paso ${E.piStep(fuera).toFixed(1)} mm vs ${paso.toFixed(1)} mm`);

  /* El umbral tiene que dejar sitio de sobra por arriba y por abajo. */
  ok('el umbral deja un factor 2.5 hasta el peor error de unidades real',
     E.SCALE_MIN_RATIO > 0.1 * 2 && E.SCALE_MIN_RATIO < 0.5,
     `${E.SCALE_MIN_RATIO}`);
}

/* ======================================================================== */
console.log('\n— el fixture: pedestales, apoyo y vanos —');
{
  const M = E.demoModel();
  const path = E.buildPath(M).samples;
  const ped = (o) => ({ id: 'pd1', name: 'Ped', visible: true, pad: 60, ...o });

  /* --- placePath: las direcciones no son puntos ------------------------ */
  {
    /* El error que esto vigila: aplicar la matriz ENTERA a la base convierte
       `x`, `y`, `z` en puntos y la inclinación empieza a depender de dónde
       esté colocada la pieza. Una traslación pura no puede tocar la base. */
    const T2 = new Matrix4().makeTranslation(1000, -400, 250);
    const movida = E.placePath(T2, path);
    const dBase = Math.max(...movida.map((q, i) =>
      Math.max(q.x.distanceTo(path[i].x), q.y.distanceTo(path[i].y), q.z.distanceTo(path[i].z))));
    ok('una traslación no toca la base de la trayectoria', dBase < 1e-9, `máx ${dBase.toExponential(2)}`);
    const dPos = movida[5].p.distanceTo(path[5].p.clone().add(new Vector3(1000, -400, 250)));
    ok('y sí mueve la posición', dPos < 1e-9);
    ok('la longitud desarrollada no se entera', movida[7].s === path[7].s);
    /* Con una rotación, la base gira y sigue siendo unitaria. */
    const R = new Matrix4().makeRotationZ(0.7);
    const girada = E.placePath(R, path);
    ok('con una rotación la base sigue siendo unitaria',
       girada.every(q => Math.abs(q.x.length() - 1) < 1e-9));
  }

  /* --- sectionDrop: cuánto baja la barra bajo su eje -------------------- */
  {
    const sec = { width: 40, thickness: 12, chamfer: 0, endLen: 0 };
    /* de plano: `y` (el espesor) apunta a plomo, así que manda el espesor */
    const plano = { p: new Vector3(), x: new Vector3(1, 0, 0), y: new Vector3(0, 0, 1),
                    z: new Vector3(0, 1, 0), s: 0 };
    ok('de plano baja medio espesor', Math.abs(E.sectionDrop(plano, sec) - 6) < 1e-9);
    /* de canto: el ancho es el que apunta a plomo */
    const canto = { p: new Vector3(), x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0),
                    z: new Vector3(0, 0, 1), s: 0 };
    ok('de canto baja medio ancho', Math.abs(E.sectionDrop(canto, sec) - 20) < 1e-9);
    /* A 45° se reparten y queda ENTRE los dos extremos, no por encima: el
       rincón más bajo está a 45° del eje pero no apunta a plomo. */
    const c = Math.SQRT1_2;
    const sesgo = { p: new Vector3(), x: new Vector3(1, 0, 0), y: new Vector3(0, c, c),
                    z: new Vector3(0, -c, c), s: 0 };
    const d45 = E.sectionDrop(sesgo, sec);
    ok('a 45° queda entre los dos extremos', d45 > 6 && d45 < 20, `${d45.toFixed(2)} mm`);
    /* El peor giro NO es el de 45°: es atan(espesor/ancho), y ahí lo que baja
       es la media diagonal de la sección. Vale la pena dejarlo escrito, porque
       es la cota que un fixture tiene que respetar en el peor caso. */
    let peor = 0;
    for (let g = 0; g <= 360; g += 0.25) {
      const a = g * Math.PI / 180;
      const q = { p: new Vector3(), x: new Vector3(1, 0, 0),
                  y: new Vector3(0, Math.cos(a), Math.sin(a)),
                  z: new Vector3(0, -Math.sin(a), Math.cos(a)), s: 0 };
      peor = Math.max(peor, E.sectionDrop(q, sec));
    }
    const diag = Math.hypot(sec.width / 2, sec.thickness / 2);
    ok('el peor giro baja la media diagonal', Math.abs(peor - diag) < 1e-3,
       `${peor.toFixed(3)} vs ${diag.toFixed(3)} mm`);
  }

  /* --- sembrar deja un fixture que ya apoya ----------------------------- */
  {
    const semilla = E.seedPedestals(path, M.section);
    ok('siembra los 7 por defecto',
       semilla.length === E.PEDESTALS_DEFAULT, `${semilla.length}`);
    const peds = semilla.map((p, i) => ({ ...p, id: `pd${i + 1}`, name: `Ped ${i + 1}` }));
    const fits = peds.map(p => E.pedestalFit(path, M.section, p));
    /* Es la propiedad que hace útil el botón: lo sembrado apoya. Si tocara
       corregir las siete filas a mano, sembrar no ahorraría nada. */
    const peorGap = Math.max(...fits.map(f => Math.abs(f.gap)));
    ok('lo sembrado apoya sin tocar nada', peorGap < 0.01, `peor hueco ${peorGap.toExponential(2)} mm`);
    const peorTilt = Math.max(...fits.map(f => Math.abs(f.dTilt)));
    ok('y con la inclinación que la barra pide', peorTilt < 0.01, `peor Δ ${peorTilt.toExponential(2)}°`);
    ok('todos quedan debajo de la barra', fits.every(f => f.over));
    ok('ninguno se sale de la pieza',
       fits.every(f => f.s >= 0 && f.s <= E.buildPath(M).total + 1e-6));

    /* Los vanos: ninguno vacío y la suma cubre casi toda la barra. */
    const vanos = E.pedestalSpans(fits).filter(isFinite);
    ok('seis vanos entre siete pedestales', vanos.length === E.PEDESTALS_DEFAULT - 1);
    ok('ningún vano sale negativo ni cero', vanos.every(v => v > 1), `${vanos.map(v => v.toFixed(0))}`);
  }

  /* --- el hueco responde a la altura ------------------------------------ */
  {
    const s0 = E.seedPedestals(path, M.section, 1)[0];
    /* La altura EXACTA que pide la barra ahí, sin pasar por el redondeo de la
       semilla: lo que se prueba aquí es la fórmula del hueco, no lo que la
       siembra escribe en la tabla. */
    const cero = E.pedestalFit(path, M.section, ped(s0));
    const exacta = { ...s0, h: cero.low - E.TABLE_Z };
    ok('a la altura justa, hueco cero',
       Math.abs(E.pedestalFit(path, M.section, ped(exacta)).gap) < 1e-9);
    /* Cinco milímetros MÁS de pedestal levantan la barra: el hueco se hace
       negativo, que es «el pedestal estorba». El signo importa: con el
       contrario, el aviso mandaría a subir el que ya sobra. */
    const alto = E.pedestalFit(path, M.section, ped({ ...exacta, h: exacta.h + 5 }));
    ok('cinco mm de más dan hueco −5', Math.abs(alto.gap + 5) < 1e-9, `${alto.gap}`);
    const bajo = E.pedestalFit(path, M.section, ped({ ...exacta, h: exacta.h - 5 }));
    ok('cinco mm de menos dan hueco +5', Math.abs(bajo.gap - 5) < 1e-9, `${bajo.gap}`);
    /* Y la siembra cumple lo que promete: dos decimales, o sea medio centésimo
       de milímetro en el peor caso. Se redondea a propósito —son cotas que
       alguien lee con un flexómetro— y aquí queda dicho cuánto cuesta. */
    ok('la siembra redondea a 2 decimales y no más', Math.abs(cero.gap) < 0.005,
       `${cero.gap.toExponential(2)} mm`);
  }

  /* --- un pedestal que no sostiene nada --------------------------------- */
  {
    const s0 = E.seedPedestals(path, M.section, 1)[0];
    const lejos = E.pedestalFit(path, M.section, ped({ ...s0, y: s0.y + 500 }));
    ok('medio metro al lado: la barra no le pasa por encima', !lejos.over);
    ok('y se dice a cuánto quedó', lejos.plan > 400, `${lejos.plan.toFixed(0)} mm`);
    /* Justo en el borde de la cuna sí sostiene: el criterio es media cuna más
       medio ancho de sección, no el centro exacto. */
    const borde = E.pedestalFit(path, M.section, ped({ ...s0, y: s0.y + 25 }));
    ok('a 25 mm todavía apoya', borde.over, `${borde.plan.toFixed(1)} mm`);
  }

  /* --- el vano no depende del orden de la tabla ------------------------- */
  {
    const peds = E.seedPedestals(path, M.section, 5)
      .map((p, i) => ({ ...p, id: `pd${i + 1}`, name: `Ped ${i + 1}` }));
    const fits = peds.map(p => E.pedestalFit(path, M.section, p));
    const enOrden = E.pedestalSpans(fits);
    /* Al revés: cada pedestal tiene que conservar SU vano. Con la cuenta hecha
       fila contra fila, mover uno en la lista cambiaba una geometría que no
       se había tocado. */
    const alReves = E.pedestalSpans(fits.slice().reverse()).reverse();
    const dif = Math.max(...enOrden.map((v, i) =>
      (isFinite(v) !== isFinite(alReves[i])) ? Infinity : (isFinite(v) ? Math.abs(v - alReves[i]) : 0)));
    ok('dar la vuelta a la tabla no cambia ningún vano', dif < 1e-9, `${dif}`);
    ok('el primero A LO LARGO DE LA BARRA es el que no tiene vano',
       enOrden.filter(v => !isFinite(v)).length === 1);
  }

  /* --- el despegue: lo que hace comparable un Δ con una tolerancia ------ */
  {
    const s0 = E.seedPedestals(path, M.section, 1)[0];
    /* Dos grados EXACTOS sobre lo que la barra pide, sin el redondeo de la
       siembra por medio. */
    const want = E.pedestalFit(path, M.section, ped(s0)).want;
    const f = E.pedestalFit(path, M.section, ped({ ...s0, tilt: want + 2, pad: 100 }));
    ok('2° de más se convierten en despegue', Math.abs(f.dTilt - 2) < 1e-9, `${f.dTilt}`);
    ok('y el despegue es medio largo de cuna por la tangente',
       Math.abs(f.lift - 50 * Math.tan(2 * Math.PI / 180)) < 1e-9, `${f.lift.toFixed(3)} mm`);
    /* La misma inclinación en una cuna corta levanta menos: es exactamente el
       motivo de que Δ solo no se pueda juzgar contra una tolerancia. */
    const corta = E.pedestalFit(path, M.section, ped({ ...s0, tilt: want + 2, pad: 20 }));
    ok('la misma desviación en una cuna corta levanta menos', corta.lift < f.lift / 4);
    /* Y el despegue no tiene signo: una cuña de aire por delante o por detrás
       despega lo mismo. El signo lo lleva Δ, que es el que dice hacia dónde. */
    const menos = E.pedestalFit(path, M.section, ped({ ...s0, tilt: want - 2, pad: 100 }));
    ok('despegar hacia el otro lado despega igual',
       Math.abs(menos.lift - f.lift) < 1e-9 && menos.dTilt < 0);
  }

  /* --- casos degenerados: la guarda no puede reventar ------------------- */
  {
    ok('sin trayectoria no hay ajuste', E.pedestalFit([], M.section, ped({ x: 0, y: 0, h: 0 })) === null);
    ok('sin trayectoria no se siembra nada', E.seedPedestals([], M.section).length === 0);
    ok('sembrar cero pedestales devuelve la lista vacía', E.seedPedestals(path, M.section, 0).length === 0);
    ok('sembrar uno lo pone a media barra', E.seedPedestals(path, M.section, 1).length === 1);
    ok('los vanos de una lista vacía son una lista vacía', E.pedestalSpans([]).length === 0);
  }

  /* --- ida y vuelta por el documento ------------------------------------ */
  {
    const fixture = E.seedPedestals(path, M.section, 3)
      .map((p, i) => ({ ...p, id: `pd${i + 1}`, name: `Apoyo ${i + 1}` }));
    fixture[1].visible = false;
    const doc = E.toDoc(M, null, null, null, [], [], null, 'start', { fixture });
    const back = E.fromDoc(JSON.parse(JSON.stringify(doc)));
    ok('el fixture viaja en el JSON', back.fixture.length === 3, `${back.fixture.length}`);
    ok('con sus nombres', back.fixture[2].name === 'Apoyo 3', back.fixture[2].name);
    ok('y con la casilla de visible', back.fixture[1].visible === false);
    const peor = Math.max(...back.fixture.map((p, i) =>
      Math.max(Math.abs(p.x - fixture[i].x), Math.abs(p.y - fixture[i].y),
               Math.abs(p.h - fixture[i].h), Math.abs(p.tilt - fixture[i].tilt),
               Math.abs(p.pad - fixture[i].pad))));
    ok('sin perder un decimal', peor < 1e-9, `error máx ${peor}`);
    /* El id NO se guarda: se reasigna al abrir, igual que en las cotas. */
    ok('el id se reasigna al abrir', back.fixture.map(p => p.id).join() === 'pd1,pd2,pd3');
    ok('un archivo sin fixture abre con la lista vacía',
       E.fromDoc(JSON.parse(JSON.stringify({ ...doc, fixture: undefined }))).fixture.length === 0);
  }
}

/* ======================================================================== */
console.log('\n— candado de convención (fixture congelado) —');
{
  /* El sentido de giro no vive en los datos, vive en dos constantes. Cambiar
     una voltea la pieza entera sin romper ninguna otra prueba. Este bloque
     compara contra PI escritos en disco: si el motor deja de producir la forma
     que produce hoy, falla aquí y no en la máquina.
     Ver test/fixtures/README.md antes de regenerar el archivo. */
  const FX = JSON.parse(readFileSync(new URL('./test/fixtures/demo-2.3.json', import.meta.url), 'utf8'));

  ok('el fixture es del esquema vigente', FX.schema === E.SCHEMA, `${FX.schema}`);
  ok('ANG_DIR no ha cambiado', E.ANG_DIR === FX.ANG_DIR, `${E.ANG_DIR}`);
  ok('ROT_DIR no ha cambiado', E.ROT_DIR === FX.ROT_DIR, `${E.ROT_DIR}`);

  /* Los dobleces del demo son la ENTRADA: si cambian, el fixture ya no compara
     lo mismo y hay que regenerarlo a propósito. */
  const dm = E.demoModel();
  const mismosBends = dm.bends.length === FX.bends.length && dm.bends.every((b, i) => {
    const f = FX.bends[i];
    return b.feed === f.feed && b.rot === f.rot && b.angle === f.angle && b.radius === f.radius;
  });
  ok('demoModel() sigue siendo el mismo modelo', mismosBends && dm.tail === FX.tail);

  /* Y esta es la comprobación que importa: las COORDENADAS. */
  const pis = E.fk(dm).pis;
  let ePi = 0;
  ok('fk() devuelve tantos PI como el fixture', pis.length === FX.pis.length,
     `${pis.length} vs ${FX.pis.length}`);
  pis.forEach((p, i) => {
    const f = FX.pis[i];
    if (f) ePi = Math.max(ePi, Math.abs(p.x - f[0]), Math.abs(p.y - f[1]), Math.abs(p.z - f[2]));
  });
  ok('los PI son los congelados: la pieza NO se ha volteado', ePi < 1e-6,
     `error máx ${ePi.toExponential(2)} mm`);

  let acc = 0;
  const ejes = dm.bends.map(b => +(acc += b.rot).toFixed(6));
  ok('los ejes absolutos son los congelados',
     ejes.every((a, i) => Math.abs(a - FX.ejesAbsolutos[i]) < 1e-9), `${ejes.join(',')}`);
}

/* ======================================================================== */
console.log('\n— esquemas: qué se convierte, qué se avisa y qué se rechaza —');
{
  const M = E.demoModel();
  const base = E.toDoc(M, M.bends, { ...E.COMP_DEFAULT }, { ...E.PROC_DEFAULT }, []);

  /* 2.3: el de hoy. Ni convierte ni avisa. */
  const hoy = E.fromDoc(JSON.parse(JSON.stringify(base)));
  ok('un archivo 2.3 no es legacy ni ambiguo', !hoy.legacy && !hoy.ambiguous);

  /* 2.2: MISMOS números, sentido no verificable. Se lee tal cual —convertirlo
     desharía el cambio de bb76bde, que fue deliberado— pero se marca. */
  const doc22 = { ...JSON.parse(JSON.stringify(base)), schema: 'barcomp/2.2' };
  const d22 = E.fromDoc(doc22);
  ok('un archivo 2.2 se marca ambiguo', d22.ambiguous === true);
  ok('y NO se convierte: no es legacy', d22.legacy === false);
  let e22 = 0;
  d22.model.bends.forEach((b, i) => {
    e22 = Math.max(e22, Math.abs(b.angle - M.bends[i].angle), Math.abs(b.feed - M.bends[i].feed),
                   Math.abs(E.wrap180(b.rot - M.bends[i].rot)));
  });
  ok('y sus números llegan intactos', e22 < 1e-9, `error máx ${e22.toExponential(2)}`);

  /* 2.1 y anteriores: cinemática distinta de verdad. Sí se convierten. */
  const d21 = E.fromDoc({ ...JSON.parse(JSON.stringify(base)), schema: 'barcomp/2.1' });
  ok('un archivo 2.1 sigue siendo legacy', d21.legacy === true && d21.ambiguous === false);

  /* Un esquema que no conocemos NO se adivina. Antes caía a cinemática 1.0. */
  let lanzo = null;
  try {
    E.fromDoc({ ...JSON.parse(JSON.stringify(base)), schema: 'barcomp/9.9' });
  } catch (err) { lanzo = err; }
  ok('un esquema desconocido se rechaza', lanzo instanceof E.UnknownSchemaError);
  ok('y el mensaje dice cuál era', !!lanzo && lanzo.schema === 'barcomp/9.9', `${lanzo && lanzo.schema}`);

  /* Un JSON que no es un documento da un mensaje, no un TypeError críptico. */
  let vacio = null;
  try { E.fromDoc({ schema: E.SCHEMA }); } catch (err) { vacio = err; }
  ok('un documento sin model.bends se rechaza con mensaje',
     !!vacio && /model\.bends/.test(vacio.message), `${vacio && vacio.message}`);
  /* Y con un TIPO propio, no con un Error suelto: la interfaz lo distingue del
     JSON roto para poder decir cuál era el archivo que hacía falta. El motor
     no redacta el texto que ve el usuario. */
  ok('y con un tipo que la interfaz puede distinguir', vacio instanceof E.NotADocError);

  /* --- lo que entra de fuera y acaba dentro de un innerHTML ------------- */
  /* El .json va y viene por correo y por USB, y el programa corre bajo file://,
     donde un `<img onerror>` colado por el nombre de una cota se ejecuta con
     acceso al disco. Que lo escriba un compañero no lo hace de fiar. */
  ok('esc() cierra las etiquetas y las comillas',
     esc('<img src=x onerror="alert(1)">') === '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
     esc('<img src=x onerror="alert(1)">'));
  ok('un color de verdad pasa tal cual', safeColor('#3FA9F5') === '#3FA9F5');
  ok('y en las cuatro formas de hexadecimal',
     ['#fff', '#ffff', '#3FA9F5', '#3FA9F580'].every(c => safeColor(c) === c));
  /* Lo que se cuela por un atributo `style="background:..."` o por un
     `value="..."`: la comilla es la que rompe, y `url()` la que llama fuera. */
  ok('una comilla que se sale del atributo NO pasa',
     safeColor('#fff" onmouseover="alert(1)') === COLOR_FALLBACK);
  ok('una url() tampoco', safeColor('url(http://x/a.png)') === COLOR_FALLBACK);
  ok('ni una expresión de CSS', safeColor('rgb(1,2,3);position:fixed') === COLOR_FALLBACK);
  /* `red` es un color legítimo de CSS, pero este programa NUNCA lo escribe:
     todos salen de un <input type="color">, que siempre da #rrggbb. La lista
     blanca estrecha se comprueba de un vistazo; el precio es este. */
  ok('un nombre de color se cambia por el de reserva, y se dice',
     safeColor('red') === COLOR_FALLBACK);
  ok('y algo que no es texto tampoco pasa',
     [null, undefined, 42, {}].every(c => safeColor(c) === COLOR_FALLBACK));

  /* El filtro está en fromDoc(), que es el ÚNICO sitio por donde pasan todos
     los documentos que se abren. */
  const sucio = E.fromDoc({
    ...JSON.parse(JSON.stringify(base)),
    variants: [{ id: 'v1', name: 'M', color: '#fff" onload="x', base: base.model }],
    datasets: [{ name: 'p1', color: 'javascript:alert(1)', bends: base.model.bends }],
    marks: [{ name: '<b>x</b>', color: '#0f0" onerror="y', x: 1, y: 2, z: 3 }],
  });
  ok('abrir un archivo limpia el color de un modelo',
     !sucio.variants[0].color.includes('"'), sucio.variants[0].color);
  ok('el de una pieza medida', !sucio.datasets[0].color.includes(':'), sucio.datasets[0].color);
  ok('y el de una cota', sucio.marks[0].color === COLOR_FALLBACK, sucio.marks[0].color);
  /* El NOMBRE sí se conserva tal cual: es texto del usuario y ahí no hay nada
     que decidir. Lo que no puede es llegar crudo a un innerHTML, y de eso se
     encarga esc() en el sitio donde se pinta. */
  ok('el nombre de la cota se conserva entero', sucio.marks[0].name === '<b>x</b>');

  /* Las tres causas de fallo al abrir son DISTINTAS entre sí: si dos cayeran en
     la misma rama, el mensaje volvería a ser el genérico de antes. */
  const clases = [new E.UnknownSchemaError('barcomp/9.9'), new SyntaxError('x'),
                  new E.NotADocError(), new TypeError('y')]
    .map(e => e instanceof E.UnknownSchemaError ? 'schema'
            : e instanceof SyntaxError ? 'nojson'
            : e instanceof E.NotADocError ? 'nodoc' : 'roto');
  ok('cada fallo al abrir cae en su propia rama',
     clases.join(',') === 'schema,nojson,nodoc,roto', clases.join(','));
}

console.log(`\n${fails ? fails + ' PRUEBA(S) FALLARON' : 'todas las pruebas pasaron'}\n`);
process.exit(fails ? 1 : 0);
