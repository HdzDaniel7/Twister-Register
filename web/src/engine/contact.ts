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
  closest(a0, a1, b0, b1);
  return { ta: CL.ta, tb: CL.tb, d: CL.d };
}

/** Lo que deja `closest()`. Un solo objeto reutilizado, y no uno por llamada:
 *  `nearestToSegment()` la llama una vez por tramo de barra, por pin, por
 *  residuo y por columna del jacobiano, y con quince dobleces eso eran cientos
 *  de miles de vectores por edición. Medido el 2026-09-14: la recolección de
 *  basura y la geometría de contacto se llevaban una cuarta parte del amarre. */
const CL = { ta: 0, tb: 0, d: 0 };

/** La cuenta de `segSegClosest()` en escalares, sin crear un solo vector.
 *
 *  Son las MISMAS operaciones en el mismo orden que hacían `clone()`, `sub()`,
 *  `dot()`, `addScaledVector()` y `distanceTo()` de three, y eso no es un
 *  detalle: con otro orden la suma redondea distinto en la última cifra, y el
 *  amarre —que itera sobre esto— podría acabar en otra forma por una
 *  millonésima. Así el resultado es idéntico bit a bit. */
function closest(a0: Vector3, a1: Vector3, b0: Vector3, b1: Vector3): void {
  const d1x = a1.x - a0.x, d1y = a1.y - a0.y, d1z = a1.z - a0.z;
  const d2x = b1.x - b0.x, d2y = b1.y - b0.y, d2z = b1.z - b0.z;
  const rx = a0.x - b0.x, ry = a0.y - b0.y, rz = a0.z - b0.z;
  const A = d1x * d1x + d1y * d1y + d1z * d1z;
  const E2 = d2x * d2x + d2y * d2y + d2z * d2z;
  const F = d2x * rx + d2y * ry + d2z * rz;
  const EPS = 1e-12;
  let ta = 0, tb = 0;
  if (A <= EPS && E2 <= EPS) {
    /* los dos degenerados: dos puntos */
    CL.ta = 0; CL.tb = 0; CL.d = Math.sqrt(rx * rx + ry * ry + rz * rz);
    return;
  }
  if (A <= EPS) {
    tb = Math.min(1, Math.max(0, F / E2));
  } else {
    const C = d1x * rx + d1y * ry + d1z * rz;
    if (E2 <= EPS) {
      ta = Math.min(1, Math.max(0, -C / A));
    } else {
      const B = d1x * d2x + d1y * d2y + d1z * d2z;
      const den = A * E2 - B * B;
      ta = den > EPS ? Math.min(1, Math.max(0, (B * F - C * E2) / den)) : 0;
      tb = (B * ta + F) / E2;
      if (tb < 0) { tb = 0; ta = Math.min(1, Math.max(0, -C / A)); }
      else if (tb > 1) { tb = 1; ta = Math.min(1, Math.max(0, (B - C) / A)); }
    }
  }
  const ex = (a0.x + d1x * ta) - (b0.x + d2x * tb);
  const ey = (a0.y + d1y * ta) - (b0.y + d2y * tb);
  const ez = (a0.z + d1z * ta) - (b0.z + d2z * tb);
  CL.ta = ta; CL.tb = tb; CL.d = Math.sqrt(ex * ex + ey * ey + ez * ez);
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
  let bs = samples[0].s, bt = 0, bd = Infinity;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    closest(a.p, b.p, b0, b1);
    if (CL.d < bd) {
      bs = a.s + (b.s - a.s) * CL.ta; bt = CL.tb; bd = CL.d;
    }
  }
  return { s: bs, t: bt, d: bd };
}
