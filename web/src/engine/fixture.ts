/* =========================================================================
   EL FIXTURE — los pedestales sobre los que se apoya la barra.

   Antes de esto la escena dibujaba pedestales de mentira: una caja cada tres
   PI, de tamaño fijo, levantada hasta el suelo. Se veían bien y no significaban
   nada. Aquí hay un modelo de datos: cada pedestal está donde está, con su
   altura y su inclinación, y el programa dice si la barra apoya en él.

   POR QUÉ IMPORTA, y no es decoración: la barra se MIDE montada en el fixture.
   En 1.7 m de aluminio la flecha por gravedad entre dos apoyos puede ser del
   orden de la tolerancia de punto, así que un vano largo mete en la medición un
   error que no es de doblado. El lazo de compensación intenta corregirlo, no
   puede —no es un error de doblado— y ahí se queda. Es la explicación más
   probable del estancamiento a ~5 mm en la punta que se vio en simulación.
   Ver `.auditoria/solicitud-datos.md`, punto A.5.

   Este archivo NO calcula la flecha. Da la geometría de la que sale: dónde
   apoya cada pedestal y qué vano queda entre uno y el siguiente. La flecha
   necesita módulo elástico y densidad, que son datos del material y todavía no
   están confirmados.

   CONVENIO DE EJES, el mismo que la escena: +z es ARRIBA (`camera.up` es
   (0,0,1)) y la mesa es el plano z = TABLE_Z. El pedestal se para en (x, y) de
   la mesa y sube `h`. Ver scene/layers.ts.
   ========================================================================= */
import { Matrix4, Vector3 } from 'three';
import { clamp, R2D } from './math.ts';
import { sampleAt, nearestOnPath } from './path.ts';
import type { PathSample, Section, Pedestal } from '../types.ts';
import { sectionDrop } from './section.ts';

/** La cota de la mesa del fixture, mm.
 *
 *  Estaba escrita dos veces a mano en `scene/layers.ts` —la rejilla y las cajas
 *  de pedestal— y sin nombre. La altura de cada pedestal se mide DESDE aquí, o
 *  sea que el número deja de ser un detalle de dibujo y pasa a ser el cero de
 *  una cota que alguien va a mecanizar.
 *
 *  Sigue siendo fijo a propósito: mientras no haya un fixture real medido, una
 *  mesa configurable es un campo más que mantener y que nadie puede rellenar
 *  con un valor de verdad. Cuando llegue A.5, esto pasa a ser un campo. */
export const TABLE_Z = -260;

/** Cuántos pedestales siembra `seedPedestals()` si no se le dice otra cosa.
 *  El fixture real lleva «6 o 7»; se arranca por el lado que deja los vanos más
 *  cortos, que es el que mete menos flecha. */
export const PEDESTALS_DEFAULT = 7;

/** Un pedestal recién nacido, y la lista de sus campos escribibles.
 *
 *  Congelado y usado como whitelist, igual que `COMP_DEFAULT` y `PLACE_DEFAULT`:
 *  el manejador de `change` no se cree la clave que venga en el data-*, la
 *  contrasta contra esto. Añadir un campo al tipo y olvidarse de habilitarlo
 *  deja de ser posible, porque las dos cosas salen de aquí. */
export const PED_DEFAULT: Readonly<Omit<Pedestal, 'id' | 'name'>> = Object.freeze({
  visible: true, x: 0, y: 0, h: 0, tilt: 0, pad: 60,
});

/** Lo que se deduce de un pedestal contra la barra que tiene encima. Nada de
 *  esto se guarda: sale del modelo cada vez que se repinta. */
export type PedFit = {
  /** longitud desarrollada del punto de la barra que pasa más cerca, mm */
  s: number;
  /** distancia EN PLANTA del pie al eje de la barra, mm. Es lo que dice si el
   *  pedestal está debajo de la barra o al lado de ella */
  plan: number;
  /** cota de la cara de abajo de la barra sobre ese punto, mm */
  low: number;
  /** hueco entre la cuna y esa cara: >0 la barra vuela y no apoya, <0 el
   *  pedestal estorba y levantaría la pieza */
  gap: number;
  /** la inclinación que la barra TIENE ahí, °. Positiva si sube */
  want: number;
  /** lo que le sobra o le falta al pedestal: `tilt - want`, ° */
  dTilt: number;
  /** rumbo de la barra en planta sobre ese punto, °. Es por donde tiene que
   *  mirar la cuna para que la barra apoye a lo largo y no cruzada */
  head: number;
  /** cuánto se despega la barra en la punta de la cuna por culpa de `dTilt`, mm.
   *
   *  Es lo que convierte un desajuste angular en algo comparable con una
   *  tolerancia. Δ no se puede juzgar solo: medio grado en una cuna de 20 mm no
   *  levanta nada y en una de 300 mm levanta más que la tolerancia de punto. La
   *  cuna gira sobre su centro, así que el brazo es la mitad. */
  lift: number;
  /** ¿la barra pasa por encima de la cuna? */
  over: boolean;
};

/** La trayectoria movida al sitio donde de verdad está la pieza.
 *
 *  La posición va con la matriz entera y la base SOLO con su rotación: `x`, `y`
 *  y `z` son direcciones, y aplicarles la traslación las convertiría en puntos.
 *  De ese descuido salen inclinaciones que dependen de dónde esté colocada la
 *  pieza, que es justo lo que no puede pasar. */
export function placePath(M: Matrix4, samples: PathSample[]): PathSample[] {
  const R = new Matrix4().extractRotation(M);
  const m = M.elements, r = R.elements;
  /* Escrito a mano y no con `clone().applyMatrix4().normalize()`: son las
     mismas cuentas de three, en el mismo orden y con la misma división por `w`,
     así que sale idéntico bit a bit, pero sin el vector intermedio de cada
     clon. El amarre coloca la barra entera una vez por columna del jacobiano, y
     esos clones eran la mitad de la basura que dejaba cada edición. */
  const put = (e: ArrayLike<number>, v: Vector3, unit: boolean): Vector3 => {
    const w = 1 / (e[3] * v.x + e[7] * v.y + e[11] * v.z + e[15]);
    const o = new Vector3((e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12]) * w,
                          (e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13]) * w,
                          (e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14]) * w);
    return unit ? o.normalize() : o;
  };
  return samples.map(q => ({
    p: put(m, q.p, false),
    x: put(r, q.x, true),
    y: put(r, q.y, true),
    z: put(r, q.z, true),
    s: q.s,
  }));
}

/** Qué le pasa a un pedestal con la barra que tiene encima.
 *
 *  `samples` tiene que venir YA colocada (ver `placePath`): el fixture es
 *  físico y le importa dónde está la pieza de verdad, no dónde la dibujaría el
 *  modelo en el origen. */
export function pedestalFit(samples: PathSample[], sec: Section,
                            ped: Pedestal): PedFit | null {
  if (!samples.length) return null;
  /* Sobre la POLILÍNEA, no sobre las muestras: `buildPath()` no reparte
     ninguna a lo largo de una recta, así que un pedestal en mitad de una recta
     larga daba como punto más cercano el final de esa recta y salía como que la
     barra no le pasa por encima. Se cazó con el banco del amarre, y es el mismo
     fallo aquí. Ver engine/path.ts. */
  const { s: sc, d } = nearestOnPath(samples, ped.x, ped.y);
  const q = sampleAt(samples, sc);
  const low = q.p.z - sectionDrop(q, sec);
  /* `x.z` es el seno del ángulo que forma el eje de la barra con la horizontal:
     la base viene normalizada, así que el clamp es solo contra el ruido de
     coma flotante que puede sacarlo de [-1,1] por un epsilon. */
  const want = Math.asin(clamp(q.x.z, -1, 1)) * R2D;
  return {
    s: sc, plan: d, low,
    gap: low - (TABLE_Z + ped.h),
    want, dTilt: ped.tilt - want,
    head: Math.atan2(q.x.y, q.x.x) * R2D,
    lift: Math.abs(Math.tan((ped.tilt - want) / R2D)) * ped.pad / 2,
    /* media cuna más medio ancho: hasta ahí la barra todavía pisa algo */
    over: d <= ped.pad / 2 + sec.width / 2,
  };
}

/** ¿Apoya la barra en este pedestal? UN criterio para toda la pantalla.
 *
 *  Le pasa por encima y la cuna la toca dentro de `tol`, que es la tolerancia de
 *  punto: el taller dijo el 2026-09-15 que no hace falta una holgura de fixture
 *  aparte. Estaba escrito a mano en la flecha y en el color del 3D, y la
 *  columna de la reacción usaba otro —que empuje—; con dos criterios, un
 *  pedestal bajado 0.9 mm salía «apoya» en una columna y 0.00 N en la de al
 *  lado. Con la carga resuelta manda la reacción: ver `carrying`. */
export function bears(f: PedFit | null, tol: number,
                      carrying?: { n: number; blind: boolean }): boolean {
  if (!f || !f.over) return false;
  /* Si la carga se resolvió, la pregunta ya está contestada con fuerzas: apoya
     el que lleva peso. Un apoyo ciego no se puede juzgar así y cae a la
     geometría, que es lo único que se sabe de él. */
  if (carrying && !carrying.blind) return carrying.n > 0;
  return Math.abs(f.gap) <= tol;
}

/** El vano de cada pedestal contra el que le precede A LO LARGO DE LA BARRA,
 *  mm; `NaN` en el primero, que no tiene anterior.
 *
 *  El orden de la tabla es el que el usuario quiera, y no tiene por qué ser el
 *  de la barra: el vano se calcula ordenando por `s` y luego se devuelve en el
 *  orden de entrada. Con la cuenta hecha fila contra fila, mover un pedestal en
 *  la lista cambiaba unos vanos que son geometría y no deberían enterarse. */
export function pedestalSpans(fits: (PedFit | null)[]): number[] {
  const idx = fits.map((f, i) => ({ i, s: f ? f.s : NaN }))
    .filter(o => isFinite(o.s)).sort((a, b) => a.s - b.s);
  const out = fits.map(() => NaN);
  for (let k = 1; k < idx.length; k++) out[idx[k].i] = idx[k].s - idx[k - 1].s;
  return out;
}

/** Un fixture de partida: `n` pedestales repartidos bajo la barra, cada uno con
 *  la altura y la inclinación que la pieza pide en su sitio.
 *
 *  No es el fixture bueno —el bueno lo dicta el que ya está montado en el
 *  taller— sino algo que tocar. Sembrar y corregir cuesta menos que teclear
 *  siete filas desde cero, y de paso enseña qué alturas pide esta pieza.
 *
 *  Se meten hacia dentro un 5% por cada lado: un pedestal justo en la punta no
 *  se puede montar, y el voladizo que deja es el que menos flecha mete. */
export function seedPedestals(samples: PathSample[], sec: Section,
                              n: number = PEDESTALS_DEFAULT,
                              pad: number = 60): Omit<Pedestal, 'id' | 'name'>[] {
  if (!samples.length || n < 1) return [];
  const total = samples[samples.length - 1].s;
  const out: Omit<Pedestal, 'id' | 'name'>[] = [];
  for (let k = 0; k < n; k++) {
    const f = n === 1 ? 0.5 : 0.05 + 0.9 * k / (n - 1);
    const target = total * f;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const d = Math.abs(samples[i].s - target);
      if (d < bd) { bd = d; bi = i; }
    }
    const q = samples[bi];
    const cand = {
      x: +q.p.x.toFixed(2), y: +q.p.y.toFixed(2),
      h: +(q.p.z - sectionDrop(q, sec) - TABLE_Z).toFixed(2),
      tilt: +(Math.asin(clamp(q.x.z, -1, 1)) * R2D).toFixed(2),
      pad, visible: true,
    };
    /* Un paso de corrección contra la barra DE VERDAD, no contra la muestra.
       El pie se pone bajo una muestra, pero el punto de la barra que le queda
       encima es el de la polilínea, y en mitad de un arco esos dos no son el
       mismo: la cuerda pasa por dentro. Sin esto, un pedestal recién sembrado
       nacía con unas centésimas de hueco y con la inclinación de la muestra en
       vez de la que la barra pide en su sitio.

       Y EL ALTO CORREGIDO NO SE REDONDEA. Parecía una cifra de taller —un alto
       con dos decimales es lo que se lee con un flexómetro— y era una precarga:
       el muelle de contacto vale κ ≈ 6 000 N/mm sobre esta pieza, o sea 6 N por
       CADA MICRA de interferencia, y redondear a centésimas deja hasta ±5 µm.
       Medido sobre la demo con siete pedestales y el peso puesto: con el
       redondeo los apoyos suman 47.4 N sobre una pieza de 23.7 N —el hallazgo
       FIS-10— y sin él, 9.8 N. La interferencia de partida pasa de ±3.5 µm a
       1.4e-14 mm en una sola pasada.

       La INCLINACIÓN sí se redondea: está medido que no mueve el hueco ni una
       micra, porque el hueco se mide donde la cuna toca y no en su punta. */
    const fit = pedestalFit(samples, sec, { id: '', name: '', ...cand });
    if (fit) {
      cand.h += fit.gap;
      cand.tilt = +fit.want.toFixed(2);
    }
    out.push(cand);
  }
  return out;
}
