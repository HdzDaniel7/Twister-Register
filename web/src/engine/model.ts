/* =========================================================================
   MODELO Y VARIANTES — piezas de ejemplo, variantes comparables y edición
   directa de los puntos PI.

   Una variante = valores BASE + una columna de DELTAS por parámetro. El modelo
   efectivo es base + delta, y es lo único que ve la cinemática. Separarlos
   permite escribir la compensación al lado del dato sin perder el valor
   original, y volver a cero con un clic.
   ========================================================================= */
import { Vector3 } from 'three';
import type { Bend, Model, Variant, DeltaKey, Delta } from '../types.ts';
import { clamp, wrapTurn, mulberry32 } from './math.ts';
import { BEND_DEFAULT, newBend, bendFrom, normalizeModel, cloneModel } from './bend.ts';
import type { RawModel } from './bend.ts';
import { fk, ik, canonRot, AXIS_MIN_DEG } from './kinematics.ts';

/* ------------------------------------------------------------------ modelo */
export function emptyModel(): Model {
  return normalizeModel({
    name: 'MODELO-01',
    section: { width: 40, thickness: 12, chamfer: 1.2, endLen: 20 },
    tol: { angle: .3, rot: .5, feed: .5, point: 1.0 },
    tail: 150,
    bends: [newBend({ feed: 150, rot: 0, angle: 30, radius: 30 }),
            newBend({ feed: 120, rot: 40, angle: 0, radius: 45 })],
  });
}

/** Réplica bit a bit de demo_model() de core.py (mismo PRNG, misma semilla). */
export function demoModel(): Model {
  const r = mulberry32(20240822);
  /* 1 de cada 3 estaciones va de canto y el resto de plano. Lo dice el RODADO,
     que inclina el eje de doblado: 0 y 180 doblan contra la cara plana, ±90
     contra el canto. `angle` es el doblez entero y nunca es negativo. */
  const sign = [1, -1, -1, 1, 1, -1, 1, 1, -1, -1, 1, -1, 1, 1, -1];
  const bends: Bend[] = [];
  /* El eje de doblado se SOSTIENE entre estaciones, así que lo que se guarda es
     el giro: la diferencia contra el eje que dejó la fila anterior. La pieza es
     exactamente la misma que con la convención anterior. */
  let eje = 0;
  for (let i = 0; i < 15; i++) {
    const canto = (i % 3 === 1);
    const ang = Math.round((16 + r() * 54) * 10) / 10;
    /* Forma canónica: el eje elige el PLANO —0 de plano, ±90 de canto— y el
       signo del ángulo dice hacia qué lado se dobla dentro de ese plano. Antes
       esto se escribía con un eje a 180°, que es la misma pieza contada dos
       veces. */
    const crudo = canto ? 90 * sign[i] : (sign[i] > 0 ? 0 : 180);
    const c = canonRot(crudo, ang);
    const giro = wrapTurn(c.rot - eje);
    eje = c.rot;
    bends.push(newBend({
      feed: i === 0 ? 140 : Math.round(80 + r() * 70),
      rot: giro,
      angle: c.angle,
      // doblar de canto pide herramental más grande
      radius: canto ? 45 : 30,
      twist: 0,
    }));
  }
  return normalizeModel({
    name: 'DEMO-1700 · barra 15 dobleces',
    section: { width: 40, thickness: 12, chamfer: 1.2, endLen: 20 },
    tol: { angle: .3, rot: .5, feed: .5, point: 1.0 },
    tail: 160, bends,
  });
}

/* ===================================================================
   VARIANTES — varios modelos comparables sobre la misma referencia
   ===================================================================
   Una variante = valores BASE + una columna de DELTAS por parámetro. El modelo
   efectivo es base + delta, y es lo único que ve la cinemática. Separarlos
   permite escribir la compensación al lado del dato sin perder el valor
   original, y volver a cero con un clic.                                    */
export const DELTA_KEYS: DeltaKey[] = ['feed', 'rot', 'angle', 'radius', 'twist', 'twistLen'];

export const zeroDelta = (): Delta =>
  Object.fromEntries(DELTA_KEYS.map(k => [k, 0] as [DeltaKey, number])) as Delta;
export const zeroDeltas = (n: number): Delta[] => [...Array(Math.max(0, n | 0))].map(zeroDelta);

export function newVariant(model: RawModel, name?: string | null, color = '#3FA9F5', vid = 'v1'): Variant {
  const m = normalizeModel(model);
  return {
    id: vid, name: name || m.name || 'MODELO', color, visible: true,
    base: m, deltas: zeroDeltas(m.bends.length), tailDelta: 0,
  };
}
/** Copia independiente: base y deltas se duplican, nada queda compartido. */
export function cloneVariant(v: Variant, name?: string | null, color?: string | null, vid?: string | null): Variant {
  const w = JSON.parse(JSON.stringify(v));
  w.id = vid || (v.id + 'c');
  w.name = name || (v.name + ' (copia)');
  if (color) w.color = color;
  return w;
}
/** Ajusta la lista de deltas al número de dobleces de la base. */
export function syncDeltas(v: Variant): Variant {
  const n = v.base.bends.length;
  const d = (v.deltas || []).slice(0, n);
  while (d.length < n) d.push(zeroDelta());
  v.deltas = d.map(x => Object.fromEntries(DELTA_KEYS.map(k => [k, +(x?.[k] || 0)] as [DeltaKey, number])) as Delta);
  return v;
}
/** base + deltas. Es el modelo que se dibuja y se mide. */
export function effectiveModel(v: Variant): Model {
  syncDeltas(v);
  const m = cloneModel(v.base);
  m.bends.forEach((b, i) => {
    const d = v.deltas[i];
    for (const k of DELTA_KEYS) b[k] = +b[k] + (+d[k] || 0);
  });
  m.tail = +m.tail + (+v.tailDelta || 0);
  m.name = v.name ?? m.name;
  return m;
}
/** Funde los deltas en la base y los deja en cero. Sin vuelta atrás. */
export function bakeDeltas(v: Variant): Variant {
  const m = effectiveModel(v);
  v.base = m;
  v.deltas = zeroDeltas(m.bends.length);
  v.tailDelta = 0;
  return v;
}
export const hasDeltas = (v: Variant): boolean =>
  (v.deltas || []).some(d => DELTA_KEYS.some(k => d[k])) || !!v.tailDelta;

/* --------------------------------------------- edición directa de puntos PI */
/** Reconstruye el modelo desde sus PI conservando radio/twist por índice.
 *
 *  `ik()` recupera avance, rotación y ángulo exactos, pero el radio y la
 *  torsión no viven en los puntos: hay que arrastrarlos de `keep`, la lista de
 *  dobleces que corresponde uno a uno con los PI nuevos.
 */
function modelFromPoints(model: Model, P: Vector3[], keep: Bend[], minBendDeg = 0): Model {
  const r = ik(P, keep.map(b => b.radius), minBendDeg);
  const bends = r.bends.map((b, j) => {
    const src = keep[j] || BEND_DEFAULT;
    const nb = bendFrom(b);
    nb.radius = +(src.radius ?? 30);
    nb.twist = +(src.twist ?? 0);
    nb.twistLen = +(src.twistLen ?? 0);
    return nb;
  });
  const out = cloneModel(model);
  out.bends = bends;
  out.tail = r.tail;
  return out;
}

/** Modelo MEDIDO a partir de los PI que salieron del escaneo.
 *
 *  Los puntos traen la forma real de la pieza, pero no traen ni el radio del
 *  herramental ni la torsion: eso se arrastra del nominal por indice, que es
 *  exactamente lo que ya hace la edicion de puntos. Si la pieza medida trae
 *  MENOS puntos que el nominal --pasa, y ya revento una vez-- los dobleces que
 *  sobran del nominal se quedan fuera, y si trae mas, los que falten caen en
 *  BEND_DEFAULT.
 *
 *  Gemelo de `measured_model()` del motor de Python.
 */
export function measuredModel(nominal: Model, pts: Vector3[]): Model {
  const n = Math.max(0, pts.length - 2);
  const keep = nominal.bends.slice(0, n);
  /* Camino MEDIDO: los puntos traen ruido, así que un doblez casi recto no
     tiene eje legible y heredarlo es mejor que inventarlo. Ver AXIS_MIN_DEG. */
  return modelFromPoints(nominal, pts.map(p => p.clone()), keep, AXIS_MIN_DEG);
}

/** Mueve el PI `i` y regenera la cadena entera desde los puntos.
 *
 *  No se calcula el arrastre hacia los dobleces siguientes: se recalcula todo,
 *  que es la misma idea que sostiene la compensación.
 */
export function movePi(model: Model, i: number, xyz: number[]): Model {
  const P = fk(model).pis;
  if (!(i >= 0 && i < P.length)) return model;
  P[i] = new Vector3(xyz[0], xyz[1], xyz[2]);
  return modelFromPoints(model, P, model.bends);
}

/** Elimina el PI `i` (1..n). P0 y el extremo libre no se pueden borrar. */
export function deletePi(model: Model, i: number): Model {
  const B = model.bends;
  if (!(i >= 1 && i <= B.length) || B.length <= 1) return model;
  const P = fk(model).pis;
  P.splice(i, 1);
  const keep = B.slice(0, i - 1).concat(B.slice(i));
  return modelFromPoints(model, P, keep);
}

/** Inserta un PI intermedio en el tramo P[i] -> P[i+1].
 *
 *  Nace colineal, o sea con ángulo 0: es un punto de control listo para
 *  moverse, no un doblez real todavía. El radio se hereda del vecino.
 */
export function insertPi(model: Model, i: number, t = 0.5): Model {
  const P = fk(model).pis;
  if (!(i >= 0 && i < P.length - 1)) return model;
  t = clamp(+t, 0.02, 0.98);
  P.splice(i + 1, 0, P[i].clone().lerp(P[i + 1], t));
  const B = model.bends;
  const ref = B.length ? B[Math.min(i, B.length - 1)] : BEND_DEFAULT;
  const fresh = newBend({ radius: +(ref.radius ?? 30), angle: 0 });
  const keep = B.slice(0, i).concat([fresh], B.slice(i));
  return modelFromPoints(model, P, keep);
}
