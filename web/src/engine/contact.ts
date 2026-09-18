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
import { sectionHalf } from './section.ts';

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

/* ------------------------------------------------- la barra contra una caja --
   Un pedestal no es un punto en el suelo: su cuna es una CHAPA, con largo,
   ancho y grueso, y con la barra a plomo la cara que toca es el costado. Hasta
   el 2026-09-18 el hueco se medía buscando el punto de la barra más cercano EN
   PLANTA y midiendo ahí la cara de abajo, y eso tenía dos defectos que en
   realidad eran el mismo:

     · con un tramo casi vertical la proyección en planta de la barra es casi un
       punto, así que ese mínimo está MAL CONDICIONADO. Medido sobre el pedestal
       empinado de la demo —cuna a −78.3°—: el hueco bajaba 13.27 mm/grado junto
       al contacto y 27.23 a una milésima de grado. Φ lleva ½κ·hueco², así que
       ahí Φ no es derivable y el solver de la carga no podía converger (FIS-10b);
     · y medir la cara de ABAJO deja fuera el apoyo de costado, que es el único
       que hay cuando la barra va a plomo (lo que quedó de FIS-08).

   Los dos se cierran con la misma cuenta. */

/** Una caja orientada: centro, tres ejes ortonormales y sus medias medidas. */
export type OBB = {
  c: Vector3;
  e: [Vector3, Vector3, Vector3];
  h: [number, number, number];
};

/** Lo que le sobra a la sección en el eje `k` de la caja, en el punto `q`.
 *
 *  `|eje·(p − centro)| − medioLado − mediaSección(eje)`: positivo si ESE eje ya
 *  separa la barra de la caja, negativo si por ese eje se solapan. */
const ejeSep = (q: PathSample, sec: Section, box: OBB, k: number): number =>
  Math.abs(box.e[k].dot(q.p) - box.e[k].dot(box.c)) - box.h[k]
  - sectionHalf(q, sec, box.e[k]);

/** ¿La barra PISA la cuna? O sea: ¿hay algún punto de la barra cuya sombra
 *  sobre la cara de apoyo caiga dentro de la cuna?
 *
 *  Es una pregunta de HUELLA, y por eso no se puede contestar en el punto de
 *  contacto: se mira el largo y el ancho de la caja y se ignora la normal. Un
 *  pedestal bajado un metro sigue estando debajo de la barra, y uno puesto al
 *  lado no lo está por mucho que le sobre altura.
 *
 *  POR TRAMOS, NO POR MUESTRAS, y no es un refinamiento: `buildPath` no reparte
 *  las muestras a paso fijo —en un tramo recto pone las dos puntas y nada en
 *  medio—, así que preguntándoselo a las muestras una barra recta de 1.5 m no
 *  pisaba NINGUNA cuna: entre muestra y muestra había 470 mm y la cuna mide 60.
 *  Dentro de un tramo la sombra en cada eje es una función lineal de `t`, o sea
 *  que «cae dentro» es un intervalo con solución exacta; se cortan los dos
 *  intervalos y si queda algo, pisa. El marco de la sección se toma el de la
 *  punta de atrás, que es lo mismo que hace `nearestToBox()`.
 *
 *  El hueco, que sí es una cifra, se busca fino ahí abajo. */
export function overBox(samples: PathSample[], sec: Section, box: OBB): boolean {
  if (samples.length === 1) {
    const q = samples[0];
    return ejeSep(q, sec, box, 0) <= 0 && ejeSep(q, sec, box, 1) <= 0;
  }
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    let lo = 0, hi = 1;
    for (let k = 0; k < 2; k++) {
      const e = box.e[k];
      const H = box.h[k] + sectionHalf(a, sec, e), C = e.dot(box.c);
      const fa = e.dot(a.p) - C, d = e.dot(b.p) - C - fa;
      if (Math.abs(d) < 1e-12) {
        /* el tramo no se mueve en este eje: o está dentro entero o fuera */
        if (Math.abs(fa) > H) { lo = 1; hi = 0; }
        continue;
      }
      const t1 = (-H - fa) / d, t2 = (H - fa) / d;
      lo = Math.max(lo, Math.min(t1, t2));
      hi = Math.min(hi, Math.max(t1, t2));
    }
    if (lo <= hi) return true;
  }
  return false;
}

/** Cuánto ATRAVIESA la barra la cara de la cuna, mm; 0 si no la atraviesa.
 *
 *  Es la OTRA pregunta, y tiene que ser otra cuenta. `nearestToBox()` contesta
 *  «¿cuánto hueco queda para apoyar?» y para eso deja de mirar la barra en
 *  cuanto se mete más que su propio radio por debajo de la cara: un trozo de
 *  barra sesenta milímetros más abajo no está apoyado en la cuna, está pasado
 *  de largo, y alimentar el muelle de contacto con eso hace que el apoyo empuje
 *  por algo que no toca. Medido el 2026-09-18 sobre la demo con los siete
 *  pedestales: sin ese tope los apoyos pasan a llevar 0.00 N de una pieza de
 *  23.67 N, o sea que el muelle los separa a todos.
 *
 *  Pero el tope deja ciega la pregunta del CHOQUE, que es la que hace el taller
 *  antes de montar: ¿esta pieza atraviesa el fixture? Con la sección de 40×12
 *  el radio son 21 mm, así que una barra clavada 34 mm dentro de un pedestal
 *  salía como «no toca». Aquí se mide sin tope y solo dentro de la huella, que
 *  es donde está el pedestal de verdad.
 *
 *  SE MUESTREA, no se busca por terceros: el máximo de `max(0, −profundidad)`
 *  dentro de una huella no es convexo —tiene el escalón del borde— y una
 *  búsqueda unimodal se lo salta. Se poda por las sombras en los dos ejes de la
 *  huella, que es exacto, y de los tramos que sobreviven se muestrea a 2 mm. */
export function throughBox(samples: PathSample[], sec: Section, box: OBB): number {
  if (samples.length < 2) return 0;
  const [u, v, n] = box.e;
  const rSec = sec.kind === 'round'
    ? sec.width / 2
    : Math.sqrt((sec.width / 2) ** 2 + (sec.thickness / 2) ** 2);
  const D = new Vector3();
  const hondo = (q: PathSample): number => {
    D.copy(q.p).sub(box.c);
    if (Math.abs(u.dot(D)) > box.h[0] || Math.abs(v.dot(D)) > box.h[1]) return 0;
    return Math.max(0, sectionHalf(q, sec, n) - n.dot(D));
  };
  let peor = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    let fuera = false;
    for (let k = 0; k < 2 && !fuera; k++) {
      const e = box.e[k], C = e.dot(box.c), lim = box.h[k] + rSec;
      const fa = e.dot(a.p) - C, fb = e.dot(b.p) - C;
      fuera = (fa > lim && fb > lim) || (fa < -lim && fb < -lim);
    }
    if (fuera) continue;
    const L = a.p.distanceTo(b.p);
    const pasos = Math.max(1, Math.ceil(L / 2));
    const q: PathSample = { p: new Vector3(), x: a.x, y: a.y, z: a.z, s: a.s };
    for (let j = 0; j <= pasos; j++) {
      q.p.copy(a.p).lerp(b.p, j / pasos);
      const d = hondo(q);
      if (d > peor) peor = d;
    }
  }
  return peor;
}

/** El punto de la barra que menos hueco deja contra la CARA DE APOYO, y ese
 *  hueco, en mm.
 *
 *  · `gap > 0` la barra vuela sobre la cuna y no la toca
 *  · `gap < 0` la cuna estorba: habría que bajarla o la barra se levanta
 *
 *  UN APOYO ES UNA CARA, NO UNA CAJA, y eso no es una simplificación: es la
 *  diferencia entre que la cuenta sirva o no. Con el criterio de ejes
 *  separadores de una caja —que fue lo primero que se probó aquí el
 *  2026-09-18— el hueco SATURA en cuanto la barra entra más que medio grueso
 *  de chapa: con la cuna de 6 mm se quedaba clavado en −3.58 mm por mucho que
 *  se bajara el pedestal, o sea que bajar cinco milímetros y subirlos daba la
 *  misma cifra. Un muelle de contacto alimentado con eso no empuja.
 *
 *  Así que se mide contra el RECTÁNGULO de la cara:
 *
 *  · dentro de la huella —la sombra del punto cae sobre la cuna— el hueco es la
 *    altura sobre la cara, con signo, menos lo que asoma la sección en esa
 *    dirección. Lineal y sin saturar, que es lo que el muelle necesita;
 *  · fuera de la huella se mide la distancia al borde del rectángulo, que
 *    siempre es positiva: una cuna por la que la barra no pasa no la sostiene
 *    y tampoco la estorba.
 *
 *  Lo que esto NO modela, dicho para que no sorprenda: en el borde de la cuna,
 *  y solo si la barra va por DEBAJO de la cara, las dos ramas no empalman. Es
 *  la barra saliéndose de la cuna por la punta, que es un salto de verdad y no
 *  un defecto de la cuenta.
 *
 *  DENTRO DE CADA TRAMO se busca el mínimo por terceros: dentro de la huella la
 *  rama es lineal y fuera es convexa, así que el mínimo se encuentra de verdad y
 *  no se muestrea. El marco de la sección se toma constante en el tramo, que es
 *  lo mismo que hace el resto del motor con una muestra.
 *
 *  Y ANTES DE BUSCAR SE PODA: si la distancia del centro de la cara al tramo,
 *  menos el radio de la cuna y el de la sección, ya es peor que el mejor que
 *  llevamos, ese tramo no puede ganar. Sin la poda esto costaría veinte veces
 *  lo que costaba la proyección en planta; con ella cuesta lo mismo, porque de
 *  doscientos tramos sobreviven cuatro. */
export function nearestToBox(samples: PathSample[], sec: Section, box: OBB):
{ s: number; gap: number } {
  if (!samples.length) return { s: 0, gap: Infinity };
  const [u, v, n] = box.e;
  const rBox = Math.sqrt(box.h[0] ** 2 + box.h[1] ** 2);
  const rSec = sec.kind === 'round'
    ? sec.width / 2
    : Math.sqrt((sec.width / 2) ** 2 + (sec.thickness / 2) ** 2);
  const D = new Vector3();
  const hueco = (q: PathSample): number => {
    D.copy(q.p).sub(box.c);
    const a = u.dot(D), b = v.dot(D), c = n.dot(D);
    if (Math.abs(a) <= box.h[0] && Math.abs(b) <= box.h[1]) {
      /* Y SOLO SI LA SECCIÓN LLEGA. Pasado su propio radio por debajo de la
         cara, la barra ya no está apoyada en la cuna: está debajo de ella, y
         eso es un choque contra el pedestal, no un hueco de apoyo. Sin este
         tope el mínimo se lo llevaba un trozo de barra que bajaba SESENTA Y
         SEIS milímetros por debajo de la cuna a cincuenta de distancia, y el
         apoyo empujaba por algo que no estaba tocando. Quién avisa del choque
         es `clashes()`, que es otra pregunta. */
      return c < -rSec ? Infinity : c - sectionHalf(q, sec, n);
    }
    const ca = Math.max(-box.h[0], Math.min(box.h[0], a));
    const cb = Math.max(-box.h[1], Math.min(box.h[1], b));
    D.addScaledVector(u, -ca).addScaledVector(v, -cb);
    const L = D.length();
    if (!(L > 1e-12)) return -sectionHalf(q, sec, n);
    D.divideScalar(L);
    return L - sectionHalf(q, sec, D);
  };
  /* EL EMPATE SE ROMPE HACIA EL CENTRO DE LA CUNA, y hace falta: con la barra
     apoyada a ras sobre una cuna tendida, los SESENTA milímetros de cuna tocan
     exactamente igual y el mínimo no es un punto, es un intervalo. Devolviendo
     cualquiera de ellos, la estación del apoyo salía en el borde de la huella:
     dos pedestales puestos a 250 y 750 mm daban vanos de 220 y 780 en vez de
     250 y 750, y la flecha buscaba un voladizo de 250 mm que no encontraba.
     Físicamente el apoyo actúa en toda la huella, así que el representante
     bueno es el centro.

     Se rompe sumando `ε·|a|` —lo que el punto se aparta del centro a lo largo
     de la cuna— en vez de comparando a posteriori: así la función sigue siendo
     convexa y la búsqueda por terceros sigue valiendo. `ε` es 1e-12 por mm,
     que sobre media cuna son 3e-11 mm de sesgo en el hueco: el muelle de
     contacto vale 6 N por micra, o sea que eso son 2e-7 N. */
  const EPS_MED = 1e-12;
  const medida = (q: PathSample): number =>
    hueco(q) + EPS_MED * Math.abs(u.dot(q.p) - u.dot(box.c));
  let bs = samples[0].s, bm = Infinity, bg = Infinity;
  /* UNA PASADA BARATA POR LAS MUESTRAS ANTES DE BUSCAR FINO, y no es una
     optimización de adorno: la poda de abajo descarta un tramo comparándolo
     con el mejor que llevamos, y el mejor arranca en INFINITO. Sin una cota
     con la que empezar no se poda nada hasta dar con el primer candidato
     bueno, y como `hueco()` devuelve Infinito para la barra que se pasó de
     largo, en una pieza con tramos así no se podaba NUNCA: los 136 tramos de
     la demo entraban a la búsqueda por terceros, ochenta evaluaciones cada
     uno. Medido: 138 µs por pedestal, o sea 351 ms para resolver seis modelos
     sujetos contra un presupuesto de 250. Con la cota, 7 µs. */
  for (let i = 0; i < samples.length; i++) {
    const m = medida(samples[i]);
    if (m < bm) { bm = m; bg = hueco(samples[i]); bs = samples[i].s; }
  }
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    closest(a.p, b.p, box.c, box.c);
    if (CL.d - rBox - rSec >= bm) continue;
    const q: PathSample = { p: new Vector3(), x: a.x, y: a.y, z: a.z, s: a.s };
    const at = (t: number): number => {
      q.p.copy(a.p).lerp(b.p, t);
      return medida(q);
    };
    let lo = 0, hi = 1;
    for (let it = 0; it < 40; it++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      if (at(m1) <= at(m2)) hi = m2; else lo = m1;
    }
    for (const t of [(lo + hi) / 2]) {
      const m = at(t);
      if (m < bm) { bm = m; bg = hueco(q); bs = a.s + (b.s - a.s) * t; }
    }
  }
  return { s: bs, gap: bg };
}
