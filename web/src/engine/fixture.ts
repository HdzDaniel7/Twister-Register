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
import { clamp, D2R, R2D } from './math.ts';
import { sampleAt, nearestOnPath } from './path.ts';
import type { PathSample, Section, Pedestal } from '../types.ts';
import { sectionDrop } from './section.ts';
import { nearestToSegment, nearestToBox, overBox, throughBox } from './contact.ts';
import type { OBB } from './contact.ts';

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
  visible: true, x: 0, y: 0, h: 0, tilt: 0, yaw: 0, pad: 60,
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
   *  mirar la cuna para que la barra apoye a lo largo y no cruzada. Es a `yaw`
   *  lo que `want` es a `tilt`: lo que la pieza PIDE, no lo que hay puesto */
  head: number;
  /** lo que le sobra o le falta de rumbo a la cuna: `yaw - head`, ° y en
   *  (−90, 90], porque media vuelta de chapa es la misma chapa */
  dYaw: number;
  /** cuánto se va la barra del eje largo de la cuna en la punta de la chapa por
   *  culpa de `dYaw`, mm: `|sin(dYaw)| · pad/2`. Es a `dYaw` lo que `lift` es a
   *  `dTilt`, y se compara contra media anchura de cuna (`CRADLE_W / 2`): por
   *  encima de eso la barra se sale de la chapa por el costado */
  slip: number;
  /** cuánto se despega la barra en la punta de la cuna por culpa de `dTilt`, mm.
   *
   *  Es lo que convierte un desajuste angular en algo comparable con una
   *  tolerancia. Δ no se puede juzgar solo: medio grado en una cuna de 20 mm no
   *  levanta nada y en una de 300 mm levanta más que la tolerancia de punto. La
   *  cuna gira sobre su centro, así que el brazo es la mitad. */
  lift: number;
  /** ¿la barra pasa por encima de la cuna? */
  over: boolean;
  /** cuánto ATRAVIESA la barra la cara de la cuna, mm; 0 si no la atraviesa.
   *
   *  No es `−gap`, y tiene que ser otro número: `gap` es la medida del APOYO y
   *  deja de mirar la barra en cuanto se mete más que su propio radio por
   *  debajo de la cara, porque un trozo de barra pasado de largo no está
   *  apoyado en la cuna. Con la sección de 40×12 eso son 21 mm, así que una
   *  pieza clavada 34 mm dentro de un pedestal salía como «no toca» y el aviso
   *  de choque no la veía. Ver `throughBox()`. */
  deep: number;
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

/** El ANCHO de una cuna, mm. No es un campo del pedestal: es la medida con la
 *  que el 3D la dibuja desde siempre, y ahora también la que la física usa, que
 *  es lo que hace que el dibujo y la cifra digan lo mismo. El día que el taller
 *  quiera cunas de dos tamaños, esto sube al `Pedestal` y al esquema.
 *
 *  El GRUESO no está aquí porque la física no lo necesita: lo que sostiene es
 *  la CARA de arriba, y una cara no tiene grueso. Ver `nearestToBox()`. */
export const CRADLE_W = 44;

/** Un desajuste de rumbo de cuna, llevado a (−90, 90].
 *
 *  Y no a (−180, 180], que es lo que haría `wrap180()`: la cuna es una chapa
 *  simétrica, así que girarla media vuelta la deja igual. Con el envoltorio
 *  normal, una cuna perfectamente puesta bajo una barra que va hacia −x salía
 *  con 180° de desajuste y la columna gritaba por una diferencia que no existe. */
export function wrapCradle(deg: number): number {
  let d = ((deg % 180) + 270) % 180 - 90;
  if (d <= -90) d += 180;
  return d;
}

/** La cuna como CAJA: centro, ejes y medias medidas.
 *
 *  El rumbo sale de `ped.yaw`, que es un dato del fixture. **Hasta el
 *  2026-09-21 no se guardaba y esta función recibía el rumbo DE LA BARRA**, o
 *  sea que la cuna se apuntaba sola en cada repintado y era imposible que
 *  saliera cruzada. Lo reportó el taller: «que no se movieran para forzar que
 *  coincidan girando contra mi pieza». Una cuna que siempre casa no se puede
 *  usar para entender un fixture, porque el fixture es justo lo que no cede.
 *
 *  Los ejes salen de la MISMA rotación que usa el 3D (`ZYX`, primero el rumbo y
 *  luego la inclinación), así que la cuna que se dibuja y la que se mide son la
 *  misma: `u` a lo largo de la cuna, `v` a lo ancho y `n` la normal de la cara
 *  de apoyo. El centro ES el punto de apoyo, (x, y, TABLE_Z + h) —el mismo
 *  contra el que se medía antes— y la media medida en `n` es CERO: lo que
 *  sostiene es la cara, y una cara no tiene grueso. */
export function cradleBox(ped: Pedestal): OBB {
  const ch = Math.cos(ped.yaw * D2R), sh = Math.sin(ped.yaw * D2R);
  const ct = Math.cos(ped.tilt * D2R), st = Math.sin(ped.tilt * D2R);
  /* EL SIGNO DE `st` NO ES LIBRE, y costó encontrarlo: `tilt` es positivo si la
     cuna SUBE en el sentido de la barra, así que con `tilt = want` el eje largo
     de la cuna tiene que salir PARALELO a la tangente de la barra. Con el signo
     al revés salía a 86.7° de ella —casi perpendicular— y entonces la barra
     asomaba por la punta de la cuna en cuanto el tramo se empinaba. */
  const u = new Vector3(ct * ch, ct * sh, st);
  const n = new Vector3(-st * ch, -st * sh, ct);
  const v = n.clone().cross(u);
  const c = new Vector3(ped.x, ped.y, TABLE_Z + ped.h);
  return { c, e: [u, v, n], h: [ped.pad / 2, CRADLE_W / 2, 0] };
}

/** Qué le pasa a un pedestal con la barra que tiene encima.
 *
 *  `samples` tiene que venir YA colocada (ver `placePath`): el fixture es
 *  físico y le importa dónde está la pieza de verdad, no dónde la dibujaría el
 *  modelo en el origen.
 *
 *  LA CAJA SALE DEL PEDESTAL, no de la barra. Desde el 2026-09-21 la cuna
 *  guarda su rumbo (`yaw`), así que no hay círculo que romper: la caja se
 *  conoce antes de mirar la pieza. Lo que sigue saliendo de la barra son las
 *  dos cifras de LECTURA —`want` y `head`, lo que la pieza pide— y para eso
 *  hace falta un ancla que no dependa de cómo esté puesta la cuna: el punto de
 *  la barra más cercano al centro de la cara de apoyo EN EL ESPACIO, que es una
 *  distancia de verdad y no se degenera con la barra a plomo.
 *
 *  ANTES SE MEDÍA EN PLANTA, y eso era dos defectos con una sola causa: la
 *  proyección en planta de un tramo casi vertical es casi un punto, así que el
 *  punto de contacto estaba mal condicionado (FIS-10b), y medir la cara de
 *  ABAJO dejaba fuera el apoyo de costado, que es el único que hay con la barra
 *  a plomo (lo que quedó de FIS-08). Ver `nearestToBox()`. */
export function pedestalFit(samples: PathSample[], sec: Section,
                            ped: Pedestal): PedFit | null {
  if (!samples.length) return null;
  const apoyo = new Vector3(ped.x, ped.y, TABLE_Z + ped.h);
  const pre = nearestToSegment(samples, apoyo, apoyo);
  /* LA CUERDA QUE LA CUNA CUBRE, no la tangente de un punto, y por dos motivos
     distintos que apuntan al mismo sitio:

     · una cuna de 60 mm no toca en un punto, toca en sesenta milímetros de
       barra. Si la barra se curva ahí, la tangente del centro deja la chapa
       mordiendo por una punta. La cuerda es la recta que un montador pone
       debajo, y es la misma que elige `seedPedestals()`;
     · la tangente se tomaba EN EL PUNTO DE CONTACTO, que se mueve al girar la
       cuna. Entonces `want` dependía de `tilt` y `dTilt` dejaba de ser una
       medida del desajuste: subir la cuna 2° sobre lo que la barra pide salía
       como −1.55° de Δ.

     El ancla es `pre`, el punto de la barra más cercano al pie, que no sabe de
     `tilt`: así girar la cuna cambia el contacto pero no la referencia contra
     la que se la juzga. */
  const sMin = samples[0].s, sMax = samples[samples.length - 1].s;
  const a0 = sampleAt(samples, Math.max(sMin, pre.s - ped.pad / 2));
  const a1 = sampleAt(samples, Math.min(sMax, pre.s + ped.pad / 2));
  const cuerda = a1.p.clone().sub(a0.p);
  const cL = cuerda.length() || 1;
  const head = Math.atan2(cuerda.y, cuerda.x) * R2D;
  const want = Math.asin(clamp(cuerda.z / cL, -1, 1)) * R2D;
  const box = cradleBox(ped);
  const { s: sc, gap } = nearestToBox(samples, sec, box);
  const q = sampleAt(samples, sc);
  const low = q.p.z - sectionDrop(q, sec);
  return {
    s: sc, plan: nearestOnPath(samples, ped.x, ped.y).d, low,
    gap,
    want, dTilt: ped.tilt - want,
    head, dYaw: wrapCradle(ped.yaw - head),
    lift: Math.abs(Math.tan((ped.tilt - want) / R2D)) * ped.pad / 2,
    slip: Math.abs(Math.sin(wrapCradle(ped.yaw - head) * D2R)) * ped.pad / 2,
    /* PISA LA CUNA: una pregunta de HUELLA, no del punto de contacto. Ver
       `overBox()`: en el punto de tangencia los tres ejes se rozan y cualquier
       comparación local salía al revés por tres diezmilésimas. */
    over: overBox(samples, sec, box),
    deep: throughBox(samples, sec, box),
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
    /* LA INCLINACIÓN SALE DE LA CUERDA QUE CUBRE LA CUNA, no de la tangente en
       un punto, y es la diferencia entre una cuna que apoya y una que hace de
       cuchillo. Una cuna de 60 mm no toca en un punto: toca en sesenta
       milímetros de barra, y si la barra se curva ahí, la tangente del centro
       deja la chapa mordiendo por una punta. Con la tangente, tres de los siete
       pedestales de la demo tocaban a ochenta milímetros de su estación y uno
       quedaba CINCUENTA GRADOS cruzado respecto de la barra donde de verdad
       apoyaba. Con la cuerda, es la recta que un montador pone debajo. */
    const sMin = samples[0].s, sMax = samples[samples.length - 1].s;
    const a0 = sampleAt(samples, Math.max(sMin, q.s - pad / 2));
    const a1 = sampleAt(samples, Math.min(sMax, q.s + pad / 2));
    const cuerda = a1.p.clone().sub(a0.p);
    const cand = {
      x: +q.p.x.toFixed(2), y: +q.p.y.toFixed(2),
      h: +(q.p.z - sectionDrop(q, sec) - TABLE_Z).toFixed(2),
      tilt: +(Math.asin(clamp(cuerda.z / (cuerda.length() || 1), -1, 1)) * R2D).toFixed(2),
      /* El rumbo se siembra apuntando a la barra, que es lo que el sembrado
         hacía ya —solo que sin escribirlo en ningún sitio, porque la cuna se
         apuntaba sola en cada repintado—. La diferencia es que ahora SE QUEDA:
         sembrar es proponer un fixture, no prometer que se adapte. */
      yaw: +(Math.atan2(cuerda.y, cuerda.x) * R2D).toFixed(2),
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
       micra, porque el hueco se mide donde la cuna toca y no en su punta.

       EL PASO NO ES `h += gap`, y desde el 2026-09-18 tampoco lo aparenta.
       Subir el pedestal un milímetro no cierra un milímetro de hueco: lo cierra
       en la dirección de la NORMAL de la cuna, así que cierra `cos(tilt)`. Con
       la cuna tendida da igual —era la cuenta de antes— pero con la cuna
       empinada son varios milímetros por cada uno, y el pedestal nacía con la
       barra metida en la cuna.

       Y NO BASTA UNA VUELTA, por dos motivos que se retroalimentan: al mover el
       alto cambia el punto donde la barra toca, y en el punto nuevo la barra
       lleva otra inclinación, así que la cuna tiene que volver a girar. Fijando
       la inclinación en la primera vuelta —lo que se intentó primero— el
       pedestal más empinado de la demo OSCILABA entre −6.5 y +6.2 mm de hueco
       sin converger nunca, porque la cuna se quedaba 30° cruzada respecto de la
       barra. Girando la cuna en cada vuelta convergen los siete: la demo baja a
       1e-7 mm en once vueltas o menos.

       EL COSENO SE TOPA a 0.35. Cerca de la vertical `1/cos` se dispara y el
       paso se pasa de largo; el tope solo limita cuánto se amplifica, no hacia
       dónde se va, así que sigue convergiendo y deja de rebotar. */
    /* LA CUNA SÍ PERSIGUE A LA BARRA, desde el 2026-09-18, y ese día cambió el
       motivo por el que antes no podía. Se intentó al principio y no convergía:
       `want` se leía en el PUNTO DE CONTACTO, girar la cuna movía el contacto,
       el contacto pedía otro giro y tres de los siete pedestales de la demo
       entraban en ciclo —uno acababa a −36.7° bajo un tramo que sube 13.9°—.
       Ahora `want` es la cuerda que la cuna cubre anclada en el pie, que no sabe
       de `tilt`, así que el ciclo no existe y la cuna puede ir a por ella.

       Y hace falta: fijando la inclinación en la estación objetivo, el pedestal
       del tramo que va casi a plomo nacía con la cuna a −78.75° debajo de una
       barra que ahí pide −48.7°. TREINTA GRADOS cruzada, y no por un error de
       cuenta: con la barra a plomo el pie se pone bajo la planta de la estación,
       pero la barra que le queda encima es otro trozo, sesenta milímetros más
       adelante. Es el mismo mal condicionado de FIS-10b visto desde la siembra.

       EL ORDEN DE CADA VUELTA: primero la inclinación, redondeada, y luego se
       cierra el alto. Un `tilt` con dos decimales es una cifra de taller y se
       queda; lo que ya no se puede decir —lo decía este comentario hasta hoy—
       es que redondearlo no mueva el hueco. Con la cuna medida como sólido el
       brazo es media cuna, 30 mm, así que media centésima de grado son 2.6 µm...
       y el muelle de contacto vale 6 N por micra (FIS-10a). Redondeando al
       final, el sembrado se quedaba en 3.5e-4 mm y no bajaba de ahí.

       EL PASO NO ES `h += gap`: subir el pedestal un milímetro no cierra un
       milímetro de hueco, lo cierra en la dirección de la NORMAL de la cuna, o
       sea `cos(tilt)`. Con la cuna tendida da igual —era la cuenta de antes— y
       con la cuna empinada son varios milímetros por cada uno. El coseno SE
       TOPA a 0.35: cerca de la vertical `1/cos` se dispara y el paso se pasa de
       largo; el tope limita cuánto se amplifica, no hacia dónde se va. */
    const cierra = (t: number, fit: PedFit): void => {
      cand.h += fit.gap / Math.max(0.35, Math.abs(Math.cos(t * D2R)));
    };
    const mira = (): PedFit | null =>
      pedestalFit(samples, sec, { id: '', name: '', ...cand });
    /* FASE 1: la cuna busca su inclinación Y SU RUMBO, y el alto los sigue.
       El rumbo se persigue aquí por el mismo motivo que la inclinación y con la
       misma condición que lo hace posible: `head` sale de la cuerda anclada en
       el PIE, que no sabe de `yaw`, así que girar la cuna no mueve la
       referencia contra la que se la juzga y no hay ciclo. Antes esto no hacía
       falta porque la caja se orientaba sola; ahora que el rumbo es un dato, el
       sembrado tiene que dejarlo puesto o nacería cruzado. */
    for (let it = 0; it < 20; it++) {
      const fit = mira();
      if (!fit) break;
      const t = +fit.want.toFixed(2);
      const r = +fit.head.toFixed(2);
      const quieta = t === cand.tilt && r === cand.yaw;
      cand.tilt = t;
      cand.yaw = r;
      cierra(t, fit);
      if (quieta && Math.abs(fit.gap) < 1e-12) break;
    }
    /* FASE 2: LA INCLINACIÓN SE QUEDA QUIETA Y SOLO SE CIERRA EL ALTO, y las
       dos fases no son una por si acaso: con las dos cosas moviéndose a la vez
       hay pedestales que NO convergen nunca. El de la demo que va casi a plomo
       pide 57.3331° con un alto y 57.3351° con el siguiente, y esas dos cifras
       redondean a centésimas distintas, así que la cuna rebotaba entre −57.33 y
       −57.34 en un ciclo de tres que no se rompía solo: el sembrado se quedaba
       en 1.7e-3 mm de interferencia, que a 6 N por micra son DIEZ NEWTON de
       precarga sobre una pieza de 24. Congelada la inclinación, cerrar el alto
       es una recta y baja a 1e-13. Dos centésimas de grado de más en la cuna
       cuestan, sobre media cuna, cinco micras de despegue en la punta —y eso lo
       dice la columna Δ—; diez newton que nadie puso no los dice nadie. */
    for (let it = 0; it < 30; it++) {
      const fit = mira();
      if (!fit) break;
      cierra(cand.tilt, fit);
      if (Math.abs(fit.gap) < 1e-12) break;
    }
    out.push(cand);
  }
  return out;
}
