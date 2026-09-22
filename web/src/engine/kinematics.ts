/* =========================================================================
   CINEMÁTICA — fk/ik, la convención LRA y las longitudes por doblez.

   EXCEPCIÓN CONSCIENTE A LA REGLA DE LAS 400 LÍNEAS (decidida 2026-09-08).
   Este archivo va en ~510 y se queda así. Los otros dos que pasaban del límite
   —i18n.ts y types.ts— eran TABLAS DE DATOS y se partieron por el corte
   natural, idioma y dominio, sin riesgo. Aquí no hay corte natural: fk, ik,
   bendDecomp y las longitudes comparten la convención, y separarlos deja la
   convención escrita en dos sitios, que es exactamente el fallo que
   `SCHEMA_LEGACY` documenta tres veces. Un refactor aquí no gana nada
   funcional y arriesga los números que van a la máquina. Si algún día se
   parte, se parte por lo que YA salió solo: feasible.ts se llevó lo que la
   máquina no puede hacer, y ese es el patrón a repetir.

   Convenciones cerradas:
     · milímetros y grados en el modelo; radianes solo aquí dentro
     · sistema derecho, regla de la mano derecha
     · marco local: x = eje de la barra · y = espesor · z = ancho
     · bends[0].feed es la recta de entrada, no un avance entre dobleces
     · tail es la recta de salida tras el último doblez
     · fk() devuelve n+2 puntos: P0 + n PIs + extremo libre
     · la cadena es  T <- T · Trans(feed,0,0) · Ry(rot) · Rz(angle) · Rx(twist)

   DOS DOBLECES POR ESTACIÓN, NO UN GIRO Y UN DOBLEZ
   -------------------------------------------------
   Convención LRA, la de las dobladoras (esquema barcomp/2.3):

       T  <-  T · Trans(feed,0,0) · Rot(n(rot), angle) · Rx(twist)

       n(rot) = Rx(rot) · (0,0,-1)      el EJE del arco, inclinado por `rot`

   equivalente a  Rx(rot) · Rz(-angle) · Rx(-rot):  se inclina el plano, se
   dobla, y se devuelve la sección a su sitio.

   `rot` (R) INCLINA EL EJE DE DOBLADO. No rueda la barra: la sección sale del
   doblez con la misma cara arriba con la que entró.
   `angle` es el doblez entero, en el plano que eligió `rot`.
   `twist` es lo ÚNICO que rueda la barra, repartido a lo largo de la recta
   siguiente.

       rot = 0    ->  dobla contra la cara plana (el espesor, `y`)
       rot = ±90  ->  dobla contra el canto      (el ancho,   `z`)

   `rot` ES UN INCREMENTO Y EL EJE SE QUEDA DONDE ESTÁ
   ---------------------------------------------------
   El proceso es SECUENCIAL: la máquina gira el eje de doblado, dobla, y el eje
   se queda ahí hasta que una fila diga otra cosa. Por eso `rot` no es la
   posición del eje sino CUÁNTO GIRA respecto a la estación anterior, y el eje
   absoluto de la estación `i` es la suma de los `rot` hasta ella
   (`axisAngles()`).

       rot:   90     0      0     -90
       eje:   90    90     90       0
              gira  mantiene       vuelve

   Un 0 significa «no toques el eje», que es lo que se teclea la mayoría de las
   veces: una lista de ceros es una pieza que se dobla siempre contra la misma
   cara.

   Ojo con la confusión fácil: el eje ACUMULA, pero la sección sigue sin rodar.
   `Rx(eje)·Rz(-angle)·Rx(-eje)` inclina el plano, dobla y devuelve la sección a
   su sitio, así que la cara que mira arriba no cambia por doblar. `twist` sigue
   siendo lo único que rueda la barra.

   EL EJE MANDA MÓDULO 180, Y EL SIGNO DEL ÁNGULO VOLTEA EL DOBLEZ
   ---------------------------------------------------------------
   Un eje a 180° y un ángulo positivo doblan exactamente al mismo sitio que un
   eje a 0° y el ángulo negativo: `Rot(-n, θ) = Rot(n, -θ)`. Escribir la
   dirección de las dos maneras a la vez es lo que hacía ilegible la tabla —dos
   filas con el mismo ángulo doblaban a lados distintos y nada en la columna lo
   decía—, así que la forma canónica es:

       eje absoluto  ∈ (-90, 90]      el PLANO en el que se dobla
       angle          con signo       hacia qué lado dentro de ese plano

   Así el rodado solo gira cuartos de vuelta —cambia de plano— y el signo del
   ángulo es lo único que voltea el doblez. `canonRot()` es quien lo impone.

   El signo de `angle` va al revés que en barcomp/1.0: un `angle` positivo
   desvía hacia `-y`.

   Un PI es UN vértice y por lo tanto UN arco: `radius` es el radio de esa
   herramienta circular, y el arco es siempre uno solo — ver bendDecomp().
   ========================================================================= */
import { Matrix4, Vector3 } from 'three';
import type { Bend, Model, Orientation, RowLength, PathSample } from '../types.ts';
import { D2R, R2D, clamp, wrapTurn, wrap180, eye, trans, rotX, rotAxis, posOf, basisOf } from './math.ts';
import { newBend, bendFrom } from './bend.ts';

/* --------------------------------------------------------------- cinemática */
/** Ángulo ABSOLUTO del eje de doblado en cada estación, en grados.
 *
 *  `rot` es lo que gira el eje en esa estación; el eje real es la suma de los
 *  giros hasta ahí, porque la máquina no lo devuelve solo. Se envuelve a
 *  (-180, 180]: cuatro cuartos de vuelta dejan el eje donde estaba, y media
 *  vuelta se escribe 180 —como en la máquina— y no -180.
 */
/** Sentido de giro del ángulo: +1 dobla como el motor lo hacía histórico, -1 al
 *  revés. Lo consumen bendDecomp() —o sea toda la cinemática— e ik(), que es su
 *  inversa; cambiarlo aquí voltea la pieza entera sin tocar ni un dato. */
export const ANG_DIR = -1;

/** Sentido de giro del EJE DE DOBLADO, la misma idea para el rodado: con -1, un
 *  `rot` de 90 inclina el eje hacia donde antes lo llevaba un -90.
 *
 *  Los dos sentidos son independientes a propósito: el ángulo dice hacia qué
 *  lado se dobla dentro del plano y el rodado qué plano se elige, y una máquina
 *  puede tener cada eje montado al revés que la otra. Cambiar la constante no
 *  toca ni un dato: los mismos números giran al otro lado. */
export const ROT_DIR = -1;

/** Lleva un par (eje, ángulo) a la forma canónica: el eje al plano que le toca
 *  —dentro de (-90, 90]— y el signo del doblez al ángulo. La geometría no
 *  cambia: girar el eje media vuelta es lo mismo que doblar al revés. */
export function canonRot(rot: number, angle: number): { rot: number; angle: number } {
  let r = wrapTurn(rot), a = angle;
  if (r > 90 || r <= -90) { r = wrapTurn(r + 180); a = -a; }
  /* wrapTurn devuelve +180 para media vuelta, así que un eje que venía de 180
     cae en 0 en la primera pasada; -90 se queda, que es un plano legítimo. */
  return { rot: r, angle: a };
}

export function axisAngles(model: Model): number[] {
  let a = 0;
  return model.bends.map(b => (a = wrapTurn(a + (b.rot || 0))));
}

/** Los mismos ejes absolutos, a partir de una lista de dobleces suelta. */
export function axisAnglesOf(bends: Bend[]): number[] {
  let a = 0;
  return bends.map(b => (a = wrapTurn(a + (b.rot || 0))));
}

/** Reescribe una pieza MEDIDA en la misma rama que el nominal, sin moverla.
 *
 *  El problema que resuelve: un eje absoluto de 90 —una estación de canto, que
 *  es la mitad de las de esta pieza— está justo en la frontera de canonRot().
 *  Con 90.35 medidos, la forma canónica devuelve -89.65 con el ángulo negado.
 *  Es la MISMA geometría: `Rot(-n, θ) = Rot(n, -θ)`. Pero deviations() compara
 *  fila contra fila, así que lee un abismo donde no hay nada:
 *
 *      dev.rot = -179.65    dev.angle = -49.60      (con 0.35 de sesgo real)
 *
 *  y compensate() responde a ese abismo con un comando destructivo — medido en
 *  la auditoría: 62.20 donde el nominal pide 25, y 170.8 donde pedía 68.4.
 *
 *  La corrección es elegir, de las dos escrituras equivalentes, la que cae del
 *  mismo lado que el nominal. Se trabaja sobre el eje ABSOLUTO porque ahí vive
 *  la ambigüedad; los giros relativos se recomponen al final, y por eso voltear
 *  un doblez no descoloca al siguiente.
 *
 *  No mueve la pieza: `fk()` del resultado da los mismos PI. Es un cambio de
 *  escritura, no de geometría.
 */
export function alignBranch(meas: Bend[], nom: Bend[]): Bend[] {
  if (!meas.length) return meas.map(b => bendFrom(b));
  const aN = axisAnglesOf(nom);
  const aM = axisAnglesOf(meas);
  const out = meas.map(b => bendFrom(b));
  for (let i = 0; i < out.length; i++) {
    /* Más allá del nominal no hay contra qué comparar: se deja como está. */
    if (i >= aN.length) continue;
    if (Math.abs(wrap180(aM[i] - aN[i])) > 90) {
      aM[i] = wrapTurn(aM[i] + 180);
      out[i].angle = -out[i].angle;
    }
  }
  /* Los giros relativos se recomponen desde los ejes absolutos ya corregidos:
     el eje arranca en 0 y cada fila guarda CUÁNTO GIRA, no dónde está. */
  let prev = 0;
  for (let i = 0; i < out.length; i++) {
    out[i].rot = wrapTurn(aM[i] - prev);
    prev = aM[i];
  }
  return out;
}

/** `alignBranch` sobre un modelo entero. */
export function alignModelBranch(meas: Model, nom: Model): Model {
  return { ...meas, bends: alignBranch(meas.bends, nom.bends) };
}

/** Cinemática directa -> n+2 puntos PI y los marcos de cada doblez. */
export function fk(model: Model): { pis: Vector3[]; frames: Matrix4[]; end: Matrix4 } {
  let T = eye();
  const pis = [posOf(T)], frames = [T.clone()];
  const ejes = axisAngles(model);
  for (let i = 0; i < model.bends.length; i++) {
    const b = model.bends[i];
    T = T.multiply(trans(b.feed));
    pis.push(posOf(T));
    const { axis, theta } = bendDecomp({ rot: ejes[i], angle: b.angle });
    T = T.multiply(rotAxis(axis, theta));
    if (b.twist) T = T.multiply(rotX(b.twist * D2R));
    frames.push(T.clone());
  }
  T = T.multiply(trans(model.tail));
  pis.push(posOf(T));
  return { pis, frames, end: T.clone() };
}

/** Cinemática inversa: puntos PI -> parámetros. Inversa exacta de fk.
 *
 *  Con dos dobleces perpendiculares la inversa sale en forma cerrada y no hace
 *  falta arrastrar normales entre estaciones: la dirección de salida, escrita
 *  en el marco de entrada, es
 *
 *      d = Ry(rot)·Rz(angle)·x = (cos angle·cos rot, sin angle, -cos angle·sin rot)
 *
 *  de donde  angle = asin(d_y)  y  rot = atan2(-d_z, d_x).
 */
/* El umbral de eje no observable —por debajo de qué desvío el eje de un doblez
   MEDIDO es puro ruido— ya no vive aquí: es `lims.axisMin`, se teclea en la
   pestaña «Límites» y viaja en el JSON. `ik()` lo recibe por parámetro, que es
   como tiene que ser: en un modelo TECLEADO un doblez de 0.2° es deliberado y
   su eje es exacto, así que ahí el umbral se queda en 0. */

export function ik(
  points: Vector3[],
  radii: (number | undefined)[] | null | undefined,
  /** desvío mínimo (grados) para creerle al eje; 0 = confiar siempre */
  minBendDeg = 0,
  /** la torsión que YA se sabe de cada estación, °; sin ella se cuenta dos veces */
  twists?: (number | undefined)[] | null,
): { bends: Bend[]; tail: number; unobservable: number[] } {
  const P = points, n = P.length - 2, bends: Bend[] = [];
  /** índices cuyo eje no se pudo leer y heredó el de la estación anterior */
  const unobservable: number[] = [];
  /* `prevRot` es el eje ABSOLUTO de la estación anterior: lo que se guarda en
     cada doblez es la DIFERENCIA, porque el eje se queda donde está. */
  let F = eye(), prevRot = 0;
  for (let i = 1; i <= n; i++) {
    const fe = P[i].distanceTo(P[i - 1]);
    const w = P[i + 1].clone().sub(P[i]);
    const nw = w.length();
    if (nw) w.divideScalar(nw);
    const R = new Matrix4().extractRotation(F);      // marco de entrada
    const d = w.clone().applyMatrix4(new Matrix4().copy(R).transpose());
    /* d = Rx(rot)·Rz(-angle)·x̂ = (cos a, -sin a·cos rot, -sin a·sin rot).
       Forma canónica: el desvío nunca es negativo y el rodado elige hacia
       dónde, que es como se programa una dobladora. */
    const lat = Math.hypot(d.y, d.z);
    const ang = Math.atan2(lat, clamp(d.x, -1, 1)) * R2D;
    /* El eje que se lee de la geometría está en la convención de la ESCENA; lo
       que se guarda va en la del modelo, que puede tener el sentido cambiado
       (ROT_DIR). Sin desvío el eje no se puede leer, y lo que corresponde es
       no moverlo: se repite el anterior, ya en convención de modelo. */
    const legible = lat >= 1e-12 && ang >= minBendDeg;
    if (!legible) unobservable.push(i - 1);
    const crudo = legible
      ? ROT_DIR * Math.atan2(-d.z, -d.y) * R2D
      : prevRot;
    /* forma canónica: el eje al plano (-90, 90] y el signo del doblez al
       ángulo, para no escribir la dirección dos veces. El ángulo sale con el
       SENTIDO del modelo (ANG_DIR), que es el que bendDecomp() va a leer. */
    const c = canonRot(crudo, ANG_DIR * ang);
    const rot = c.rot;
    bends.push(newBend({
      feed: fe, rot: wrapTurn(rot - prevRot), angle: c.angle,
      radius: (radii && radii[i - 1] !== undefined) ? +radii[i - 1]! : 30,
    }));
    const nx = bendDecomp({ rot, angle: c.angle });
    F = F.multiply(rotAxis(nx.axis, nx.theta));
    /* La MISMA `Rx(twist)` que pone fk(), y por el mismo motivo: si el marco no
       rueda aquí, el rodado de la estación siguiente se lee girado y se queda
       con la torsión encima. Ver el comentario de la torsión, arriba. */
    const tw = twists && twists[i - 1] ? +twists[i - 1]! : 0;
    if (tw) F = F.multiply(rotX(tw * D2R));
    prevRot = rot;
  }
  return { bends, tail: P[n + 1].distanceTo(P[n]), unobservable };
}

/** Componente DOMINANTE de cada doblez: 'T' plano · 'W' de canto.
 *
 *  Ya no se acumula nada: cada doblez lleva sus dos componentes a la vez
 *  (`angle` de plano y `rot` de canto) y esto solo dice cuál manda, para
 *  etiquetar la tabla y elegir la ganancia del avance. El resorte y las
 *  ganancias de ángulo se aplican por componente, no por doblez.
 */
/** W = de canto (contra el ancho) · T = de plano (contra el espesor).
 *
 *  Lo dice el eje ABSOLUTO de la estación, no el `rot` de la fila: el eje se
 *  queda donde lo dejó la fila anterior, así que un `rot` de 0 después de un 90
 *  sigue doblando de canto. Confundir uno con otro etiquetaba media tabla al
 *  revés y elegía la ganancia equivocada.
 *
 *  El corte va en 45°, donde deja de haber una cara dominante.
 *
 *  Y EN UNA REDONDA NO HAY CARA. `Iz = Iy` y la fibra es la misma, así que el
 *  eje absoluto sigue diciendo hacia dónde se dobla pero ya no dice CONTRA QUÉ:
 *  doblar una barra redonda «de canto» y «de plano» es la misma operación. Esta
 *  letra no es un rótulo: `compensate.ts` elige con ella el retorno elástico
 *  (`proc.sbW`/`sbT`), el reparto del lote y la ganancia del lazo. Repartiendo
 *  por una distinción que la sección ya no tiene, media pieza se compensaba con
 *  el retorno de la otra mitad — y las dos constantes describen lo MISMO.
 *
 *  Así que en una redonda salen todas iguales y el motor consulta un solo
 *  número. La `T` no quiere decir «de plano» ahí: quiere decir «el único». Que
 *  eso no se lea mal es cosa de la pantalla, y por eso `oriTag()` pinta `Ø` en
 *  vez de la letra y los paneles enseñan UN campo en lugar de dos. */
export const orientations = (model: Model): Orientation[] =>
  (model.section?.kind === 'round'
    ? model.bends.map(() => 'T' as Orientation)
    : axisAngles(model).map(a => (Math.abs(Math.sin(a * D2R)) > Math.SQRT1_2 ? 'W' : 'T')));

/** Parte el doblez en {axis, theta}: el doblez es SIEMPRE un solo arco.
 *
 *      Rot(axis, theta)  ==  Rx(rot) · Rz(-angle) · Rx(-rot)
 *
 *  · axis   eje del arco, inclinado `rot` alrededor del eje de la barra. Girar
 *           alrededor de él desvía la barra SIN rodar la sección: es la
 *           diferencia entre inclinar el plano de doblado y retorcer la pieza.
 *  · theta  desvío total, siempre >= 0; el que se inscribe con `radius`, o sea
 *           el que ve la herramienta.
 *  · psi    0 siempre. Se conserva en la firma porque varias funciones lo
 *           desestructuran; con un solo arco no queda rodado residual.
 */
/** Lo mínimo que bendDecomp() necesita leer de un doblez: se llama tanto con
 *  un Bend completo como con el objeto suelto {rot, angle} que arma ik(). */
type BendAngle = { rot?: number; angle?: number };

/* Matriz de trabajo de bendDecomp(): se llama varias veces por doblez en cada
   trayectoria —las longitudes piden el trim de cada uno dos veces— y el amarre
   construye cientos de trayectorias por edición. Rellenarla da los mismos
   números que crear una nueva; solo se ahorra la basura. */
const BD_RX = new Matrix4();

export function bendDecomp(b: BendAngle): { axis: Vector3; theta: number; psi: number } {
  /* ANG_DIR es el SENTIDO DE GIRO del ángulo, y vive aquí porque es lo único
     que decide hacia dónde se dobla un ángulo positivo. Está en -1 porque el
     taller teclea sus ángulos con el signo contrario al que usaba el motor:
     los datos no se tocan y la pieza sale al lado bueno. */
  /* Se ENVUELVE a (-180, 180]. No es un recorte: el doblez es un giro alrededor
     de un eje fijo, y girar 200° es girar -160° — la MISMA pieza. Sin envolver,
     un ángulo de 181° daba theta = 181, tan(90.5°) sale NEGATIVO y el trim se
     volvía negativo: la recta crecía al doblar más. Un 200° daba trim negativo
     también, y era indistinguible de un modelo sano.
     `wrapTurn` y no `wrap180` porque media vuelta es 180, no -180: da igual
     para theta —se toma el valor absoluto— pero deja el eje del lado que le
     corresponde en vez de invertirlo. */
  const a = wrapTurn(ANG_DIR * (b.angle || 0)) * D2R;
  /* Rz(-angle): un `angle` positivo desvía hacia -y, así que el eje del arco
     parte de -z. Con el ángulo negativo se invierte y theta vuelve a ser >= 0. */
  const axis = new Vector3(0, 0, a < 0 ? 1 : -1)
    .applyMatrix4(BD_RX.makeRotationX(ROT_DIR * (b.rot || 0) * D2R)).normalize();
  return { axis, theta: Math.abs(a), psi: 0 };
}

/** Ángulo total de desvío del doblez, en grados. Es lo que ve la herramienta:
 *  con una sola componente coincide con |angle| o con |rot|. */
export const bendTheta = (b: BendAngle): number => bendDecomp(b).theta * R2D;

/** Tope de desvío por doblez. `trim = radio · tan(θ/2)` tiene una ASÍNTOTA en
 *  θ = 180: a 179° un radio de 30 ya pide 3438 mm de trim, y a 180 clavados
 *  sale 4.9e17, que se propaga a `developedLength` como -9.8e17 y de ahí a la
 *  cinta y a la escena. Ningún aviso, ningún NaN: un número enorme con signo.
 *
 *  Y no es un caso inventado — `ik()` produce `angle = -180` con una poligonal
 *  doblada sobre sí misma, que es exactamente lo que devuelve una nube de
 *  puntos con dos PI intercambiados o un escaneo que se saltó un tramo.
 *
 *  170° es el tope FÍSICO, no el numérico: doblar más de eso cierra la pieza
 *  sobre el herramental. Por encima, el trim se calcula CON el tope y el
 *  doblez sale listado por `overBent()`, para que se vea que el número está
 *  topado en vez de creerse una geometría imposible. */
export const BEND_MAX_DEG = 170;

export const trimOf = (b: Bend): number =>
  (b.radius || 0) * Math.tan(Math.min(bendDecomp(b).theta, BEND_MAX_DEG * D2R) / 2);

/* ------------------------------------------------- longitudes por doblez ---
   UN SOLO SITIO PARA LA CUENTA DE LA RECTA. Antes vivía copiada en cuatro
   funciones (machineFeeds, twistSpanOf, buildPath, bendStations) y era
   cuestión de tiempo que divergieran.

     recta(i) = feed(i) − trim(i) − trim(i−1)      con trim(−1) = 0
     arco(i)  = radius(i) · θ(i)                   θ de bendDecomp
     cum(i)   = cum(i−1) + recta(i) + arco(i)

   `feed` es PI a PI y es el estado que se guarda en el JSON; la recta es
   tangencia a tangencia y es lo que consume la máquina. Se teclean las dos:
   la vuelta la da feedForStraight(). */

/** trim(i), con 0 fuera de rango — así trim(−1) no necesita un caso aparte. */
const trimAt = (B: Bend[], i: number): number => (i >= 0 && i < B.length) ? trimOf(B[i]) : 0;

/** Recta tangencia a tangencia que PRECEDE al doblez i. */
export const straightOf = (model: Model, i: number): number =>
  model.bends[i].feed - trimAt(model.bends, i) - trimAt(model.bends, i - 1);

/** `feed` (PI a PI) que produce una recta dada en el doblez i. Inversa exacta
 *  de straightOf(): es lo que se escribe al teclear la columna «Recta». */
export const feedForStraight = (model: Model, i: number, straight: number): number =>
  straight + trimAt(model.bends, i) + trimAt(model.bends, i - 1);

/** Recta de salida: la cola, descontado el trim del último doblez. */
export const tailStraight = (model: Model): number =>
  model.tail - trimAt(model.bends, model.bends.length - 1);

/** `tail` (PI a PI) que produce una recta de salida dada. Inversa exacta de
 *  tailStraight(), y la gemela de feedForStraight() para la cola: es lo que se
 *  escribe al teclear la cola en el pie de la tabla.
 *
 *  Hasta el 2026-09-22 la cola era el ÚNICO sitio donde se tecleaba un PI a PI
 *  mientras todo lo demás se tecleaba de tangencia a tangencia, y la palabra
 *  «Cola» nombraba dos números distintos: el campo decía 160.00 y el pie
 *  154.66, que es 160 menos el trim del último doblez. Quien sumaba a mano el
 *  último Σ L más la cola del campo se iba 5.34 mm por encima de la longitud
 *  desarrollada, sin que nada estuviera mal calculado. */
export const tailForStraight = (model: Model, straight: number): number =>
  straight + trimAt(model.bends, model.bends.length - 1);

/* --- el Δ de una RECTA -----------------------------------------------------
   La recta NO es un campo guardado: sale del avance menos los dos trims, y el
   trim se mueve con el ángulo y con el radio. Así que un Δ de ÁNGULO mueve dos
   rectas —la suya y la de al lado— sin tocar ni un avance, y la columna del Δ,
   si enseñara el Δ del AVANCE, marcaría cero mientras la pieza cambia de largo.

   Medido en la demo con un Δ de 1.5° en B5: la recta de B5 y la de B6 se
   acortan 0.869 mm cada una, y Σ L subía 0.869 menos de lo que sumaban la
   recta y la L de esa fila. Por eso la columna enseña y teclea el Δ de la
   RECTA: base + Δ es la pieza en las cuatro columnas por igual. El avance
   sigue siendo el estado que se guarda y lo que se manda a la máquina, igual
   que arriba se teclea una recta y se guarda un avance.

   Tecleando el ángulo en la BASE esto no pasaba: `editBend()` recoloca los
   avances para dejar las rectas quietas. El camino del Δ no hace eso a
   propósito —un Δ es una corrección del lazo y no puede ir moviendo avances
   que nadie pidió— así que la diferencia se ENSEÑA en vez de taparse. */

/** Δ de la RECTA del doblez i: lo que los Δ le hacen de verdad al tramo recto. */
export const straightDelta = (base: Model, eff: Model, i: number): number =>
  straightOf(eff, i) - straightOf(base, i);

/** Δ del AVANCE que produce un Δ de RECTA dado. Inversa exacta de
 *  straightDelta(): los trims no dependen del avance, así que basta una pasada
 *  y no hay nada que resolver. */
export const feedDeltaForStraightDelta = (
  base: Model, eff: Model, i: number, dStraight: number,
): number =>
  dStraight + (trimAt(eff.bends, i) - trimAt(base.bends, i))
            + (trimAt(eff.bends, i - 1) - trimAt(base.bends, i - 1));

/** Δ de la recta de SALIDA. La cola no tiene Δ que teclear —el lazo no la
 *  corrige— pero un Δ de ángulo en el último doblez se la come igual, y el pie
 *  tiene que decirlo o la resta de la longitud desarrollada no cierra. */
export const tailStraightDelta = (base: Model, eff: Model): number =>
  tailStraight(eff) - tailStraight(base);

/** Por doblez: la recta que lo precede, el arco que genera y el acumulado. */
export function rowLengths(model: Model): RowLength[] {
  let cum = 0;
  return model.bends.map((b, i) => {
    const straight = straightOf(model, i);
    const arc = (b.radius || 0) * bendDecomp(b).theta;
    cum += straight + arc;
    return { straight, arc, cum };
  });
}

/** Longitud desarrollada total: cum del último doblez más la cola. */
export function developedLength(model: Model): number {
  const rows = rowLengths(model);
  return (rows.length ? rows[rows.length - 1].cum : 0) + tailStraight(model);
}

/** Avance tangente-a-tangente. Negativo o < 25 mm = los herramentales chocan. */
export const machineFeeds = (model: Model): number[] => model.bends.map((_, i) => straightOf(model, i));

/** Recta disponible (tangencia a tangencia) para repartir la torsión de i.
 *  Es la recta que SALE del doblez i, o sea la que precede al i+1. */
export function twistSpanOf(model: Model, i: number): number {
  const B = model.bends;
  if (i < 0 || i >= B.length) return 0;
  return i < B.length - 1 ? straightOf(model, i + 1) : tailStraight(model);
}
export function twistZone(len: number, twLen: number): number {
  if (!(len > 0)) return 0;
  return (twLen > 0 && twLen < len) ? twLen : len;
}
/** Reparte una torsión sobre un tramo recto.
 *
 *  Devuelve [[Δlongitud, Δtwist_rad], ...]; la zona de `twLen` mm queda
 *  CENTRADA en la recta y el resto sale sin torsión. twLen<=0 o >=len = toda la
 *  recta. La suma vale siempre [len, tw]: el marco final coincide con el de
 *  fk() pase lo que pase, porque Rx conmuta con Trans(x).
 */
export function twistSpans(len: number, twDeg: number, twLen: number): [number, number][] {
  const tw = (twDeg || 0) * D2R;
  if (!tw || !(len > 1e-9)) return [[len, tw]];
  const z = twistZone(len, twLen), lead = (len - z) / 2;
  const n = clamp(Math.ceil(Math.abs(twDeg) / 5), 8, 72);
  const out: [number, number][] = [];
  if (lead > 1e-9) out.push([lead, 0]);
  for (let k = 0; k < n; k++) out.push([z / n, tw / n]);
  if (lead > 1e-9) out.push([lead, 0]);
  return out;
}

/** Trayectoria muestreada del eje neutro: rectas + arcos + torsión repartida.
 *  samples[i] = {p, x, y, z, s} */
/* Matrices y vector de trabajo de buildPath(). El amarre construye una
   trayectoria por incógnita y por iteración —cientos por edición, y una edición
   con seis modelos sujetos las multiplica por seis— y cada muestra creaba entre
   tres y cinco matrices que se tiraban en la línea siguiente. Medido el
   2026-09-14, la basura se llevaba más tiempo que las cuentas.
   Se RELLENAN con los mismos métodos de three y en el mismo orden que hacían
   `clone()`, `trans()`, `rotX()` y `rotAxis()`, así que los números salen
   idénticos bit a bit: la prueba se hizo contra 128 formas sujetas y cargadas.
   Compartidas entre llamadas y sin problema, porque buildPath() no se llama a
   sí misma ni guarda ninguna: lo que va a la salida son vectores nuevos. */
const BP_G = new Matrix4(), BP_T = new Matrix4(), BP_RX = new Matrix4();
const BP_RA = new Matrix4(), BP_ROT = new Matrix4();
const BP_V = new Vector3(), BP_X = new Vector3(1, 0, 0);

/** SEGMENTOS POR ARCO, y uno solo para todo el programa.
 *
 *  Hubo dos: la pantalla dibujaba y medía con 12 y los solventes resolvían con
 *  8. Son dos polilíneas distintas de la misma curva, y la diferencia entre
 *  ellas —25 µm sobre la demo— es enorme donde importa: el muelle de contacto
 *  vale 6 N por MICRA, así que un fixture sembrado a hueco cero contra la
 *  polilínea de la pantalla nacía con hasta 150 N de desajuste contra la del
 *  solver. En la demo eso salía al revés —los siete apoyos abriendo hueco y
 *  llevando 0.01 N de una pieza de 23.7— y nadie lo veía, porque cada mitad
 *  del programa era coherente consigo misma.
 *
 *  Se queda en 12, que es el fino de los dos: bajar la pantalla a 8 para
 *  ahorrar en el solver sería pagar en lo que se ve. Lo que cuesta está
 *  medido: el amarre de seis modelos pasa de 84 a 98 ms sobre un presupuesto
 *  de 250. */
export const PATH_SEG = 12;

export function buildPath(model: Model, arcSeg = PATH_SEG): { samples: PathSample[]; total: number } {
  const S: PathSample[] = [];
  const F = eye();
  let s = 0;
  const push = (M: Matrix4, sv: number) => {
    const [x, y, z] = basisOf(M);
    S.push({ p: posOf(M), x, y, z, s: sv });
  };
  push(F, 0);
  const B = model.bends, LEN = rowLengths(model);
  /* el eje de doblado ABSOLUTO de cada estación: `rot` solo dice cuánto gira */
  const ejes = axisAngles(model);

  const runStraight = (len: number, twDeg: number, twLen: number, s0: number) => {
    let acc = 0, twAcc = 0;
    for (const [dl, dt] of twistSpans(len, twDeg, twLen)) {
      acc += dl; twAcc += dt;
      push(BP_G.copy(F).multiply(BP_T.makeTranslation(acc, 0, 0))
        .multiply(BP_RX.makeRotationX(twAcc)), s0 + acc);
    }
    F.multiply(BP_T.makeTranslation(len, 0, 0)).multiply(BP_RX.makeRotationX((twDeg || 0) * D2R));
  };
  /* el centro del arco menos el radio girado con `M`: dónde queda el eje */
  const onArc = (M: Matrix4, ctr: Vector3, chat: Vector3, R: number): Matrix4 => {
    BP_V.copy(chat).applyMatrix4(BP_ROT.extractRotation(M)).multiplyScalar(R);
    return M.setPosition(ctr.x - BP_V.x, ctr.y - BP_V.y, ctr.z - BP_V.z);
  };

  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    const { axis, theta: th } = bendDecomp({ rot: ejes[i], angle: b.angle });
    const R = b.radius || 0;
    const straight = LEN[i].straight;
    runStraight(straight, i ? (B[i - 1].twist || 0) : 0,
                i ? (B[i - 1].twistLen || 0) : 0, s);
    s += straight;
    /* dirección de deflexión: hacia donde barre el eje de la barra. El centro
       del arco está a `radius` por ahí, y girar alrededor de `axis` no rueda la
       sección — que es justo lo que se busca. */
    const chat = axis.clone().cross(BP_X);
    const ctr = posOf(F).add(BP_V.copy(chat).applyMatrix4(BP_ROT.extractRotation(F)).multiplyScalar(R));
    for (let k = 1; k <= arcSeg; k++) {
      const u = th * k / arcSeg;
      push(onArc(BP_G.copy(F).multiply(BP_RA.makeRotationAxis(axis, u)), ctr, chat, R), s + R * u);
    }
    s += R * th;
    onArc(F.multiply(BP_RA.makeRotationAxis(axis, th)), ctr, chat, R);
  }

  const tailLen = tailStraight(model);
  const last = B.length ? B[B.length - 1] : null;
  runStraight(tailLen, last ? (last.twist || 0) : 0,
              last ? (last.twistLen || 0) : 0, s);
  s += tailLen;
  return { samples: S, total: s };
}

/** Longitud desarrollada (mm) del centro del arco de cada doblez. Es la abscisa
 *  que usa la cinta inferior para colocar cada columna. */
export function bendStations(model: Model): number[] {
  /* cum(i) ya trae la recta y el arco enteros: el centro del arco es medio
     arco antes del final de la fila. */
  return rowLengths(model).map(r => r.cum - r.arc / 2);
}
