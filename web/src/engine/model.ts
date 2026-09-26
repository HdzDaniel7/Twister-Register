/* =========================================================================
   MODELO Y VARIANTES — piezas de ejemplo, variantes comparables y edición
   directa de los puntos PI.

   Una variante = valores BASE + una columna de DELTAS por parámetro. El modelo
   efectivo es base + delta, y es lo único que ve la cinemática. Separarlos
   permite escribir la compensación al lado del dato sin perder el valor
   original, y volver a cero con un clic.
   ========================================================================= */
import { Vector3 } from 'three';
import type { Bend, Model, Variant, DeltaKey, Delta, Lims } from '../types.ts';
import { clamp, wrapTurn, mulberry32 } from './math.ts';
import { BEND_DEFAULT, newBend, bendFrom, normalizeModel, cloneModel } from './bend.ts';
import type { RawModel } from './bend.ts';
import { fk, ik, canonRot, straightOf, feedForStraight,
         tailStraight, tailForStraight } from './kinematics.ts';
import { LIMS_DEFAULT } from './lims.ts';

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
/* --- LA TABLA DE AJUSTES NO SE MUEVE SOLA ---------------------------------
   La columna de Δ es la tabla de quien opera: lo que hay escrito ahí lo
   escribió alguien, y tiene que seguir diciendo lo mismo mañana. Pero la RECTA
   no es un campo guardado —sale del avance menos los dos trims— así que
   cualquier cosa que mueva el trim le come recta al doblez y al siguiente.
   Medido en DEMO-1700 con 1.5° en B5: las rectas de B5 y B6 pasan de 47.872 y
   80.930 a 47.003 y 80.061, 0.869 mm cada una, y hasta el 2026-09-22 por la
   tarde la columna del Δ de la Recta se encendía sola en dos filas que nadie
   había tocado.

   Desde entonces, quien mueve el trim RECOLOCA los avances para dejar las
   rectas donde estaban — las dos veces:

     · `editBend()` ya lo hacía desde el 2026-09-17 con las rectas de la BASE;
     · `setDelta()` lo hace con los Δ, y `holdStraights()` cierra la otra
       mitad: editar el ángulo en la base tampoco puede mover la recta de la
       PIEZA, que es base + Δ. Sin eso quedaba un residuo de 0.0026 mm en el
       banco, pequeño pero de la misma familia: un número que se movía solo.

   El avance sí se mueve, y tiene que moverse: si el doblez se lleva más barra
   y el avance no cambia, la siguiente estación cae en otro sitio de la barra.
   El avance de PI a PI es el estado que se guarda y lo que va a la máquina, así
   que es el sitio correcto donde absorberlo.

   Lo que se conserva es la recta EFECTIVA, no la de la base: un Δ de recta ya
   tecleado sigue valiendo lo tecleado después de corregir un ángulo.

   `rot` estuvo en la lista por simetría con `editBend()` y se fue el 2026-09-25,
   de los dos sitios a la vez: el trim no depende del rodado —`bendDecomp()` saca
   theta solo del ángulo— así que entrar por aquí con un Δ de rodado recalculaba
   el mismo avance. Medido antes de quitarlo: con un Δ de recta de 5 mm y otro de
   ángulo ya puestos —que es el caso en el que este camino REESCRIBE el Δ de
   avance en vez de dejarlo quieto—, poner el rodado a -90, 0, 33.3 y 180 deja el
   resto de los Δ y la cola exactamente donde estaban, las cuatro veces. */
const TRIM_DELTA_KEYS: DeltaKey[] = ['radius', 'angle'];

/* Por debajo de esto no hay recta que valga: es ruido de coma flotante, y
   escribirlo encendería la fila entera con un Δ que nadie tecleó. */
const CERO = 1e-9;
const snap = (x: number): number => Math.abs(x) < CERO ? 0 : x;

/** Las rectas de la PIEZA que el trim del doblez `i` puede mover: la suya, la
 *  del siguiente y la de la cola si `i` es el último. Se miran solo esas para
 *  no arrastrar el error de ida y vuelta por las quince filas a cada tecla. */
export function straightsAt(v: Variant, i: number): (number | null)[] {
  const m = effectiveModel(v), n = v.base.bends.length;
  return [
    straightOf(m, i),
    i + 1 < n ? straightOf(m, i + 1) : null,
    i === n - 1 ? tailStraight(m) : null,
  ];
}

/** Recoloca los Δ de avance para devolver esas rectas a donde estaban.
 *
 *  TRAMPA: `effectiveModel()` llama por dentro a `syncDeltas()`, que REEMPLAZA
 *  `v.deltas` por objetos nuevos, así que el efectivo se saca a una variable
 *  ANTES de escribir o la asignación aterriza en el array que se acaba de tirar
 *  y no pasa nada visible. Y basta UNA pasada: `feedForStraight()` solo lee
 *  trims, nunca avances, así que `eff` sigue valiendo después de escribir. */
export function holdStraights(v: Variant, i: number, prev: (number | null)[]): Variant {
  syncDeltas(v);
  const n = v.base.bends.length;
  if (!(i >= 0 && i < n)) return v;
  const eff = effectiveModel(v);
  const [rectaI, rectaSig, cola] = prev;
  if (rectaI !== null) {
    v.deltas[i].feed = snap(feedForStraight(eff, i, rectaI) - v.base.bends[i].feed);
  }
  if (rectaSig !== null && i + 1 < n) {
    v.deltas[i + 1].feed = snap(feedForStraight(eff, i + 1, rectaSig) - v.base.bends[i + 1].feed);
  }
  if (cola !== null) v.tailDelta = snap(tailForStraight(eff, cola) - v.base.tail);
  return v;
}

/** Escribe un Δ en la columna `key` del doblez `i` dejando quietas las rectas
 *  de la PIEZA. Devuelve la misma variante, ya sincronizada. */
export function setDelta(v: Variant, i: number, key: DeltaKey, val: number): Variant {
  syncDeltas(v);
  if (!(i >= 0 && i < v.base.bends.length)) return v;
  if (!TRIM_DELTA_KEYS.includes(key)) { v.deltas[i][key] = val; return v; }
  const prev = straightsAt(v, i);
  v.deltas[i][key] = val;
  return holdStraights(v, i, prev);
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
  const r = ik(P, keep.map(b => b.radius), minBendDeg, keep.map(b => b.twist));
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
 */
export function measuredModel(nominal: Model, pts: Vector3[],
                              lims: Lims = LIMS_DEFAULT): Model {
  const n = Math.max(0, pts.length - 2);
  const keep = nominal.bends.slice(0, n);
  /* Camino MEDIDO: los puntos traen ruido, así que un doblez casi recto no
     tiene eje legible y heredarlo es mejor que inventarlo. Ver lims.axisMin. */
  return modelFromPoints(nominal, pts.map(p => p.clone()), keep, lims.axisMin);
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
