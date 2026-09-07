/* =========================================================================
   CINEMÁTICA — fk/ik, la convención LRA y las longitudes por doblez.

   Convenciones cerradas (idénticas al motor Python):
     · milímetros y grados en el modelo; radianes solo aquí dentro
     · sistema derecho, regla de la mano derecha
     · marco local: x = eje de la barra · y = espesor · z = ancho
     · bends[0].feed es la recta de entrada, no un avance entre dobleces
     · tail es la recta de salida tras el último doblez
     · fk() devuelve n+2 puntos: P0 + n PIs + extremo libre
     · la cadena es  T <- T · Trans(feed,0,0) · Ry(rot) · Rz(angle) · Rx(twist)

   DOS DOBLECES POR ESTACIÓN, NO UN GIRO Y UN DOBLEZ
   -------------------------------------------------
   Convención LRA, la de las dobladoras (esquema barcomp/2.1):

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

   Como el rodado no queda en el marco, `rot` NO se acumula entre dobleces: el
   de cada fila se lee siempre desde la sección tal como llega.

   El signo de `angle` va al revés que en barcomp/1.0: un `angle` positivo
   desvía hacia `-y`. La forma canónica de ik() deja `angle >= 0` y usa `rot`
   para elegir la dirección, que es como se programa una dobladora.

   Un PI es UN vértice y por lo tanto UN arco: `radius` es el radio de esa
   herramienta circular, y el arco es siempre uno solo — ver bendDecomp().
   ========================================================================= */
import { Matrix4, Vector3 } from 'three';
import type { Bend, Model, Orientation, RowLength, PathSample } from '../types.ts';
import { D2R, R2D, clamp, eye, trans, rotX, rotAxis, posOf, basisOf } from './math.ts';
import { newBend } from './bend.ts';

/* --------------------------------------------------------------- cinemática */
/** Cinemática directa -> n+2 puntos PI y los marcos de cada doblez. */
export function fk(model: Model): { pis: Vector3[]; frames: Matrix4[]; end: Matrix4 } {
  let T = eye();
  const pis = [posOf(T)], frames = [T.clone()];
  for (const b of model.bends) {
    T = T.multiply(trans(b.feed));
    pis.push(posOf(T));
    const { axis, theta } = bendDecomp(b);
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
export function ik(points: Vector3[], radii: (number | undefined)[] | null | undefined): { bends: Bend[]; tail: number } {
  const P = points, n = P.length - 2, bends: Bend[] = [];
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
    const rot = lat < 1e-12          // sin desvío: el rodado no se puede leer
      ? prevRot
      : Math.atan2(-d.z, -d.y) * R2D;
    bends.push(newBend({
      feed: fe, rot, angle: ang,
      radius: (radii && radii[i - 1] !== undefined) ? +radii[i - 1]! : 30,
    }));
    const nx = bendDecomp({ rot, angle: ang });
    F = F.multiply(rotAxis(nx.axis, nx.theta));
    prevRot = rot;
  }
  return { bends, tail: P[n + 1].distanceTo(P[n]) };
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
 *  Lo dice el `rot` de la fila y nada más. `rot` inclina el eje de doblado sin
 *  rodar la barra, así que no se arrastra nada entre dobleces: la sección llega
 *  a cada estación como salió de la anterior, y el rodado se mide siempre desde
 *  ahí. La torsión sí rueda la barra, pero rueda la sección Y el eje juntos, de
 *  modo que tampoco cambia contra qué cara se dobla.
 *
 *  El corte va en 45°, donde deja de haber una cara dominante. */
export const orientations = (model: Model): Orientation[] =>
  model.bends.map(b => (Math.abs(Math.sin((b.rot || 0) * D2R)) > Math.SQRT1_2 ? 'W' : 'T'));

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

export function bendDecomp(b: BendAngle): { axis: Vector3; theta: number; psi: number } {
  const a = (b.angle || 0) * D2R;
  /* Rz(-angle): un `angle` positivo desvía hacia -y, así que el eje del arco
     parte de -z. Con el ángulo negativo se invierte y theta vuelve a ser >= 0. */
  const axis = new Vector3(0, 0, a < 0 ? 1 : -1)
    .applyMatrix4(rotX((b.rot || 0) * D2R)).normalize();
  return { axis, theta: Math.abs(a), psi: 0 };
}

/** Ángulo total de desvío del doblez, en grados. Es lo que ve la herramienta:
 *  con una sola componente coincide con |angle| o con |rot|. */
export const bendTheta = (b: BendAngle): number => bendDecomp(b).theta * R2D;

export const trimOf = (b: Bend): number => (b.radius || 0) * Math.tan(bendDecomp(b).theta / 2);

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
export function buildPath(model: Model, arcSeg = 12): { samples: PathSample[]; total: number } {
  const S: PathSample[] = [];
  let F = eye(), s = 0;
  const push = (M: Matrix4, sv: number) => {
    const [x, y, z] = basisOf(M);
    S.push({ p: posOf(M), x, y, z, s: sv });
  };
  push(F, 0);
  const B = model.bends, LEN = rowLengths(model);

  const runStraight = (len: number, twDeg: number, twLen: number, s0: number) => {
    let acc = 0, twAcc = 0;
    for (const [dl, dt] of twistSpans(len, twDeg, twLen)) {
      acc += dl; twAcc += dt;
      push(F.clone().multiply(trans(acc)).multiply(rotX(twAcc)), s0 + acc);
    }
    F = F.multiply(trans(len)).multiply(rotX((twDeg || 0) * D2R));
  };

  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    const { axis, theta: th } = bendDecomp(b);
    const R = b.radius || 0;
    const straight = LEN[i].straight;
    runStraight(straight, i ? (B[i - 1].twist || 0) : 0,
                i ? (B[i - 1].twistLen || 0) : 0, s);
    s += straight;
    /* dirección de deflexión: hacia donde barre el eje de la barra. El centro
       del arco está a `radius` por ahí, y girar alrededor de `axis` no rueda la
       sección — que es justo lo que se busca. */
    const chat = axis.clone().cross(new Vector3(1, 0, 0));
    const rotF = new Matrix4().extractRotation(F);
    const ctr = posOf(F).add(chat.clone().applyMatrix4(rotF).multiplyScalar(R));
    for (let k = 1; k <= arcSeg; k++) {
      const u = th * k / arcSeg;
      const G = F.clone().multiply(rotAxis(axis, u));
      const rg = new Matrix4().extractRotation(G);
      G.setPosition(ctr.clone().sub(chat.clone().applyMatrix4(rg).multiplyScalar(R)));
      push(G, s + R * u);
    }
    s += R * th;
    F = F.multiply(rotAxis(axis, th));
    const rf = new Matrix4().extractRotation(F);
    F.setPosition(ctr.clone().sub(chat.clone().applyMatrix4(rf).multiplyScalar(R)));
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
