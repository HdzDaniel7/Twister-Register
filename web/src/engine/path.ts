/* =========================================================================
   MUESTREO DE LA TRAYECTORIA — mirar la barra en un punto que no es una
   muestra.

   `buildPath()` no reparte muestras por igual: mete varias dentro de cada arco
   —donde la dirección cambia— y **ninguna a lo largo de una recta**, donde no
   hace falta ninguna para dibujarla. En una pieza de 15 dobleces eso son unas
   130 muestras, pero entre dos de ellas puede haber 600 mm de barra recta.

   Ese reparto está bien para DIBUJAR y mal para PREGUNTAR. Quien pregunta
   «¿qué parte de la barra pasa por aquí?» —el fixture y los pines— tiene que
   mirar la barra, no la lista de muestras: un pedestal en mitad de una recta
   larga daba como punto más cercano el final de esa recta, a medio metro, y de
   ahí salía que no apoyaba. Lo cazó el banco del amarre con un caso de una sola
   recta, que es donde el fallo es del tamaño de la recta entera.

   Aquí están las dos funciones que arreglan eso, y viven aparte para que
   fixture.ts y pins.ts puedan usarlas sin importarse entre ellos.
   ========================================================================= */
import { Vector3 } from 'three';
import type { PathSample } from '../types.ts';

/** La muestra a una longitud desarrollada `s`, interpolando entre las dos
 *  vecinas.
 *
 *  El solver del amarre la necesita para mirar SIEMPRE el mismo punto de la
 *  barra mientras mueve los ángulos. Buscar en cada iteración la muestra más
 *  cercana haría que el residuo saltara de una muestra a otra, y un residuo a
 *  saltos no se puede derivar: el jacobiano saldría de ruido y el solver
 *  perseguiría su propia discretización.
 *
 *  Fuera del recorrido devuelve el extremo, no extrapola: más allá de la punta
 *  no hay barra, y fingir que la hay inventa contactos. */
export function sampleAt(samples: PathSample[], s: number): PathSample {
  const n = samples.length;
  if (!n) throw new Error('sampleAt sin muestras');
  if (s <= samples[0].s) return samples[0];
  if (s >= samples[n - 1].s) return samples[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].s <= s) lo = mid; else hi = mid;
  }
  const a = samples[lo], b = samples[hi];
  const t = (b.s - a.s) > 1e-9 ? (s - a.s) / (b.s - a.s) : 0;
  const mix = (u: Vector3, v: Vector3) => u.clone().lerp(v, t).normalize();
  return {
    p: a.p.clone().lerp(b.p, t),
    x: mix(a.x, b.x), y: mix(a.y, b.y), z: mix(a.z, b.z),
    s,
  };
}

/** El punto de la barra que pasa más cerca de `(x, y)` mirado EN PLANTA, y a
 *  qué distancia queda.
 *
 *  Sobre la POLILÍNEA, no sobre las muestras: se proyecta el punto en cada
 *  tramo y se conserva el mejor. Esa es toda la diferencia con la versión
 *  anterior, y en una recta larga esa diferencia es media recta.
 *
 *  En planta y no en el espacio porque tanto un pedestal como un pin se
 *  levantan a plomo desde la mesa: lo que decide a qué punto de la barra sirven
 *  es dónde cae su pie. Si la pieza dobla sobre sí misma puede haber dos tramos
 *  encima del mismo pie; se queda con el más cercano, y la distancia devuelta
 *  deja ver que ahí hay algo raro. */
export function nearestOnPath(samples: PathSample[], x: number, y: number): { s: number; d: number } {
  if (!samples.length) return { s: 0, d: Infinity };
  let bs = samples[0].s, bd = Math.hypot(samples[0].p.x - x, samples[0].p.y - y);
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1].p, b = samples[i].p;
    const vx = b.x - a.x, vy = b.y - a.y;
    const L2 = vx * vx + vy * vy;
    /* Un tramo que en planta mide cero —la barra subiendo a plomo— no puede
       proyectar nada: se mira su extremo y ya. */
    let t = L2 > 1e-12 ? ((x - a.x) * vx + (y - a.y) * vy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(a.x + vx * t - x, a.y + vy * t - y);
    if (d < bd) {
      bd = d;
      bs = samples[i - 1].s + (samples[i].s - samples[i - 1].s) * t;
    }
  }
  return { s: bs, d: bd };
}
