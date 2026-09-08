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
import { Matrix4 } from 'three';
import { clamp, R2D } from './math.ts';
import type { PathSample, Section, Pedestal } from '../types.ts';

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
  return samples.map(q => ({
    p: q.p.clone().applyMatrix4(M),
    x: q.x.clone().applyMatrix4(R).normalize(),
    y: q.y.clone().applyMatrix4(R).normalize(),
    z: q.z.clone().applyMatrix4(R).normalize(),
    s: q.s,
  }));
}

/** Cuánto baja la cara de abajo de la barra respecto del eje neutro, en esa
 *  muestra y medido a plomo.
 *
 *  La sección es un rectángulo de `thickness` en la dirección `y` y `width` en
 *  la `z`, así que el punto más bajo de la caja es el que suma las dos
 *  proyecciones verticales. Con la barra de canto manda el ancho y con la barra
 *  de plano manda el espesor, y entre medias se reparten: por eso son las dos
 *  con valor absoluto y no un `if`.
 *
 *  El chaflán no entra: quita material de las esquinas y solo puede hacer la
 *  barra MÁS alta, nunca más baja. Ignorarlo es el lado seguro. */
export const sectionDrop = (q: PathSample, sec: Section): number =>
  Math.abs((sec.thickness / 2) * q.y.z) + Math.abs((sec.width / 2) * q.z.z);

/** La muestra de la barra que pasa más cerca del pie, mirada en planta.
 *
 *  En planta y no en el espacio: el pedestal sube a plomo, así que lo que
 *  decide a qué punto de la barra sirve es dónde cae su pie, no a qué distancia
 *  está la barra. Si la pieza dobla sobre sí misma puede haber dos tramos
 *  encima del mismo pie; se queda con el más cercano y la columna `plan` deja
 *  ver que ahí hay algo raro. */
function nearestInPlan(samples: PathSample[], x: number, y: number): { i: number; d: number } {
  let bi = -1, bd = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const d = Math.hypot(samples[i].p.x - x, samples[i].p.y - y);
    if (d < bd) { bd = d; bi = i; }
  }
  return { i: bi, d: bd };
}

/** Qué le pasa a un pedestal con la barra que tiene encima.
 *
 *  `samples` tiene que venir YA colocada (ver `placePath`): el fixture es
 *  físico y le importa dónde está la pieza de verdad, no dónde la dibujaría el
 *  modelo en el origen. */
export function pedestalFit(samples: PathSample[], sec: Section,
                            ped: Pedestal): PedFit | null {
  if (!samples.length) return null;
  const { i, d } = nearestInPlan(samples, ped.x, ped.y);
  const q = samples[i];
  const low = q.p.z - sectionDrop(q, sec);
  /* `x.z` es el seno del ángulo que forma el eje de la barra con la horizontal:
     la base viene normalizada, así que el clamp es solo contra el ruido de
     coma flotante que puede sacarlo de [-1,1] por un epsilon. */
  const want = Math.asin(clamp(q.x.z, -1, 1)) * R2D;
  return {
    s: q.s, plan: d, low,
    gap: low - (TABLE_Z + ped.h),
    want, dTilt: ped.tilt - want,
    head: Math.atan2(q.x.y, q.x.x) * R2D,
    lift: Math.abs(Math.tan((ped.tilt - want) / R2D)) * ped.pad / 2,
    /* media cuna más medio ancho: hasta ahí la barra todavía pisa algo */
    over: d <= ped.pad / 2 + sec.width / 2,
  };
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
    out.push({
      x: +q.p.x.toFixed(2), y: +q.p.y.toFixed(2),
      h: +(q.p.z - sectionDrop(q, sec) - TABLE_Z).toFixed(2),
      tilt: +(Math.asin(clamp(q.x.z, -1, 1)) * R2D).toFixed(2),
      pad, visible: true,
    });
  }
  return out;
}
