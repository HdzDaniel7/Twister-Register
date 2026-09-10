/* =========================================================================
   CONTACTO EN EL ESPACIO — la barra contra un poste que ya no tiene por qué
   estar a plomo.

   Mientras un pin era vertical bastaba con mirar la planta: la distancia entre
   dos rectas verticales es la misma a cualquier altura. En cuanto el pin se
   puede INCLINAR eso deja de valer —dos rectas cruzadas en el espacio se acercan
   en un punto y solo en uno— y hay que resolver la distancia entre segmentos de
   verdad.

   Aquí está esa cuenta, y la generalización de la media anchura de la sección:
   antes se medía sobre la normal horizontal, ahora sobre la dirección en la que
   de verdad se tocan. Las dos viven aparte de pins.ts porque son geometría sin
   opinión: no saben qué es un pin ni qué es un amarre.
   ========================================================================= */
import { Vector3 } from 'three';
import type { PathSample, Section } from '../types.ts';

/** Cuánto asoma la sección desde su eje neutro en la dirección `u`.
 *
 *  No es `width/2` sin más: con la barra de canto lo que asoma de lado es el
 *  espesor, y de plano es el ancho. Entre medias se reparten, así que se
 *  proyectan las dos direcciones de la sección sobre `u` y se suman en valor
 *  absoluto — la misma cuenta que `sectionDrop()` hace en vertical, y por el
 *  mismo motivo.
 *
 *  El chaflán no entra: quita material de las esquinas y solo puede hacer la
 *  sección MÁS pequeña, nunca mayor. Ignorarlo es el lado seguro, porque hace
 *  que el contacto se declare antes y no después. */
export const halfExtent = (q: PathSample, sec: Section, u: Vector3): number =>
  Math.abs((sec.thickness / 2) * q.y.dot(u)) + Math.abs((sec.width / 2) * q.z.dot(u));

/** El punto más cercano entre dos segmentos, `[a0,a1]` y `[b0,b1]`.
 *
 *  Devuelve los dos parámetros en [0,1] y la distancia. Es el caso general de
 *  la geometría de este archivo: dos segmentos en el espacio pueden cruzarse
 *  sin tocarse, ser paralelos, o acercarse por sus extremos, y las tres cosas
 *  pasan con un fixture real. El desarrollo es el clásico de Ericson: se
 *  resuelve el sistema de dos ecuaciones y se recorta a los extremos cuando la
 *  solución se sale.
 *
 *  Los paralelos entran por el caso degenerado `den = 0` y se resuelven en el
 *  extremo, que para lo que se usa aquí basta: un pin paralelo a la barra no
 *  sujeta nada de lado y lo que importa es que no devuelva `NaN`. */
export function segSegClosest(a0: Vector3, a1: Vector3, b0: Vector3, b1: Vector3):
{ ta: number; tb: number; d: number } {
  const d1 = a1.clone().sub(a0), d2 = b1.clone().sub(b0), r = a0.clone().sub(b0);
  const A = d1.dot(d1), E2 = d2.dot(d2), F = d2.dot(r);
  const EPS = 1e-12;
  let ta = 0, tb = 0;
  if (A <= EPS && E2 <= EPS) {
    /* los dos degenerados: dos puntos */
    return { ta: 0, tb: 0, d: a0.distanceTo(b0) };
  }
  if (A <= EPS) {
    tb = Math.min(1, Math.max(0, F / E2));
  } else {
    const C = d1.dot(r);
    if (E2 <= EPS) {
      ta = Math.min(1, Math.max(0, -C / A));
    } else {
      const B = d1.dot(d2);
      const den = A * E2 - B * B;
      ta = den > EPS ? Math.min(1, Math.max(0, (B * F - C * E2) / den)) : 0;
      tb = (B * ta + F) / E2;
      if (tb < 0) { tb = 0; ta = Math.min(1, Math.max(0, -C / A)); }
      else if (tb > 1) { tb = 1; ta = Math.min(1, Math.max(0, (B - C) / A)); }
    }
  }
  const pa = a0.clone().addScaledVector(d1, ta);
  const pb = b0.clone().addScaledVector(d2, tb);
  return { ta, tb, d: pa.distanceTo(pb) };
}

/** Dónde se acercan más la BARRA y un segmento cualquiera —el eje de un pin—.
 *
 *  Recorre la polilínea de la barra, no sus muestras: `buildPath()` no reparte
 *  ninguna muestra a lo largo de una recta, y sin esto un poste en mitad de una
 *  recta larga daría como punto más cercano el final de la recta. Ese fallo ya
 *  costó una tarde; ver engine/path.ts.
 *
 *  `s` es la longitud desarrollada del punto de la barra, y `t` la fracción del
 *  segmento del pin: `t` cerca de 1 significa que se tocan en la PUNTA del
 *  poste, o sea que la barra pasa por encima y ese pin no sujeta de lado. */
export function nearestToSegment(samples: PathSample[], b0: Vector3, b1: Vector3):
{ s: number; t: number; d: number } {
  if (!samples.length) return { s: 0, t: 0, d: Infinity };
  if (samples.length === 1) {
    const r = segSegClosest(samples[0].p, samples[0].p, b0, b1);
    return { s: samples[0].s, t: r.tb, d: r.d };
  }
  let best = { s: samples[0].s, t: 0, d: Infinity };
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const r = segSegClosest(a.p, b.p, b0, b1);
    if (r.d < best.d) {
      best = { s: a.s + (b.s - a.s) * r.ta, t: r.tb, d: r.d };
    }
  }
  return best;
}
