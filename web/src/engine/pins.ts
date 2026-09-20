/* =========================================================================
   LOS PINES LATERALES — la barra deja de estar libre en el espacio.

   Un pedestal (engine/fixture.ts) sostiene la barra POR ABAJO y no le impide
   moverse. Un pin la sujeta DE LADO: es un poste vertical atornillado a la mesa
   contra el que la barra tiene que tocar, y mientras esté puesto la barra no
   puede irse a donde la mandaría la cinemática.

   QUÉ CAMBIA ESO, que es el motivo entero de este archivo: con la barra libre,
   mover un ángulo mueve todo lo que viene después y ya está. Con la barra
   sujeta, ese movimiento choca contra los pines: la pieza no llega a la forma
   que pide la tabla, se queda en una intermedia, y para quedarse ahí tiene que
   DEFORMARSE elásticamente. Esa deformación no está repartida por igual —se
   concentra donde los vanos entre apoyos son cortos— y si en algún punto pasa
   del límite elástico, la barra ya no vuelve al soltarla: la pieza que sale de
   la máquina no es la que dice el modelo.

   CÓMO SE RESUELVE, y por qué así. La corrección se busca **en el espacio de
   parámetros**, moviendo ángulos y rodados, y no desplazando puntos sueltos.
   Es la misma idea que sostiene la compensación (ver §1 del contexto): así la
   forma que sale es una pieza que la cadena cinemática puede describir, y no
   una nube de puntos que ya no corresponde a ningún comando.

   El reparto entre estaciones lo decide la RIGIDEZ: doblar un tramo corto
   cuesta más energía que doblar uno largo, así que la corrección se va sola a
   donde la barra es más flexible. La energía de una viga con un codo de Δθ
   repartido en una longitud L es `EI·Δθ²/(2L)`, o sea que el peso de cada
   estación es proporcional a `EI/L`.

   **Y aquí hay una propiedad que conviene entender antes de tocar nada: con
   sección constante, la FORMA no depende de E.** El módulo elástico multiplica
   todos los pesos por igual y se cancela en el reparto. E hace falta para pasar
   de ángulos a esfuerzos —momento y tensión— no para saber dónde queda la
   barra. Por eso la geometría se puede dar con confianza y el esfuerzo lleva
   escrito que el material está sin confirmar. Hay una prueba dedicada a esto:
   cambiar E no mueve un solo PI.

   LO QUE ESTO NO ES: no es un cálculo por elementos finitos. No hay contacto
   con fricción, ni pandeo, ni torsión inducida por el amarre, ni plastificación
   parcial de la sección. Es un modelo de vigas con codos elásticos en las
   estaciones que ya existen, que es lo que se puede sostener con los datos que
   hay. Cuando llegue el material confirmado y una pieza medida CON el fixture
   puesto, esto se contrasta contra ella.
   ========================================================================= */
import { Vector3 } from 'three';
import { clamp, solveDense, D2R, R2D } from './math.ts';
import { buildPath, rowLengths, tailStraight, PATH_SEG } from './kinematics.ts';
import { normalizeModel } from './bend.ts';
import { TABLE_Z, pedestalFit } from './fixture.ts';
import { sectionDrop, sectionHalf, sectionFibre } from './section.ts';
import { sampleAt } from './path.ts';
import { nearestToSegment } from './contact.ts';
import type { Model, PathSample, Section, Pin, Pedestal, Mat, Restraint } from '../types.ts';

/** Un pin recién nacido, y la lista blanca de sus campos escribibles. Mismo
 *  trato que `PED_DEFAULT`: la whitelist del `change` sale de aquí. */
export const PIN_DEFAULT: Readonly<Omit<Pin, 'id' | 'name'>> = Object.freeze({
  visible: true, hold: true, x: 0, y: 0, h: 120, dia: 20, tilt: 0, yaw: 0,
  /* 0 = «decídelo por la geometría la primera vez». Ver el tipo Pin. */
  side: 0,
  /* la base arranca EN la mesa, que es de donde salían todos los postes hasta
     que hizo falta poder levantarlos: así un pin escrito antes de que este
     campo existiera queda exactamente donde estaba. Ver `z` en el tipo Pin. */
  z: 0,
});

/** El material de la barra. **PROVISIONAL, y lo dice la pantalla.**
 *
 *  Los valores son los de un 6061-T6 de manual, no los de la colada que está en
 *  el taller: sirven para ver DÓNDE se concentra el esfuerzo y para que el
 *  aviso de límite elástico tenga un número contra el que comparar. Para decir
 *  «esta pieza se pasa por 12 MPa» hace falta el certificado del material.
 *
 *  Nada de esto entra en la forma: ver la cabecera. */
export const MAT_DEFAULT: Readonly<Mat> = Object.freeze({
  /** módulo elástico, MPa */
  E: 69000,
  /** límite elástico, MPa */
  yield: 240,
  /** densidad, kg/m³ — 6061-T6 de manual, provisional como los otros dos */
  rho: 2700,
});

/** Sanea un material venido de un archivo o tecleado. Mismo trato que
 *  `normLoad()`: lo que no se entienda vuelve al de fábrica.
 *
 *  Aquí no es higiene, es un VEREDICTO. El esfuerzo se compara con
 *  `mat.yield > 0 ? s / mat.yield : 0`, y con un `yield` ilegible esa
 *  comparación da `false` y el cociente sale 0: el programa decía «0 % del
 *  límite elástico» sobre una pieza con esfuerzo alto. Por eso `E` y `yield` no
 *  bajan de un mínimo físico —un cero en cualquiera de los dos convierte
 *  cualquier esfuerzo en «nada»— y un módulo de 1e15 se topa en el del
 *  diamante. `rho` sí puede ser cero: es como la flecha dice «falta el dato».
 *
 *  `Number.isFinite` y no el global: `isFinite(null)` es true, y un `null` en
 *  el JSON llegaría al solver como un cero. */
export function normMat(o: Partial<Record<keyof Mat, unknown>> | null | undefined): Mat {
  const n = (v: unknown, d: number, lo: number, hi: number): number => {
    const x = typeof v === 'string' ? parseFloat(v) : v;
    return typeof x === 'number' && Number.isFinite(x) ? clamp(x, lo, hi) : d;
  };
  const m = o || {};
  return {
    E: n(m.E, MAT_DEFAULT.E, 1000, 1e6),
    yield: n(m.yield, MAT_DEFAULT.yield, 1, 5000),
    rho: n(m.rho, MAT_DEFAULT.rho as number, 0, 25000),
  };
}

export const RESTRAINT_DEFAULT: Readonly<Restraint> = Object.freeze({
  /** apagado por defecto: con los pines quitados el programa se comporta
   *  EXACTAMENTE como antes de que existieran, y eso hay que poder demostrarlo */
  on: false,
  /** ¿el rodado también cede? Un pin lateral empuja en el plano de la mesa;
   *  dejar que el rodado ceda añade dos incógnitas por estación y suele repartir
   *  mejor, pero es una decisión física y por eso se elige */
  doRot: true,
  /** tolerancia de contacto, mm: por debajo de esto se considera que la barra
   *  toca el pin y no hay nada que cerrar */
  tol: 0.05,
  /** amortiguación del reparto. 0 = la corrección se va entera a la estación
   *  más flexible; subirla la reparte entre más estaciones. Es el mismo papel
   *  que la ganancia del lazo: al 100 % de agresividad, oscila */
  damp: 0.15,
  /** iteraciones del solver */
  iters: 6,
  /** CONTRA QUÉ BARRA se mide todo: la libre o la que de verdad queda sujeta.
   *
   *  Arranca en «sujeta» porque con el amarre o la carga puestos la barra que
   *  está encima del fixture ES la sujeta, y una tabla que midiera la otra
   *  estaría describiendo una pieza que no hay —que es justo lo que el taller
   *  reportó—. Elegir «libre» sigue siendo legítimo: es preguntar dónde estaría
   *  la pieza sin nada que la sujetara. Pero es una pregunta hipotética y hay
   *  que pedirla, no heredarla. Ver `refHeld` en types/process.ts. */
  refHeld: true,
});

/** Cuánto MÁS BLANDO es el rodado que el ángulo al repartir la corrección
 *  elástica. Lo usan los dos solvers: `restrain()` aquí abajo y la `K` de
 *  `settle()` en engine/load.ts.
 *
 *  Vive en un solo sitio porque los dos TIENEN que usar el mismo número: si el
 *  amarre repartiera con 0.5 y la carga con otro, las dos pantallas estarían
 *  describiendo dos barras distintas y ninguna de las dos lo diría. Hasta hoy
 *  era un `0.5` tecleado en cada archivo, cada uno con un comentario diciendo
 *  que el otro usaba lo mismo — o sea una promesa a mano. La respuesta de C.5
 *  va a cambiar este número, y ese día se cambia aquí.
 *
 *  **Es un factor de juicio, no la torsión de la sección.** La idea es que
 *  girar el eje mueve la sección de lado, que es donde la barra cede cuando la
 *  sujeta un pin lateral. La torsión de verdad sería `GJ/L`: para 40×12 da
 *  `GJ/EIz = 1.22` (J = 18 684 mm⁴ por la serie exacta del rectángulo,
 *  Iz = 5 760 mm⁴, ν = 0.33), o sea un muelle unas 2.4 veces MÁS rígido que
 *  este.
 *
 *  Cuánto se aparta, medido:
 *    · 2026-09-10, barra de 15 dobleces con solo la carga: la caída va de
 *      0.0117 a 0.0207 mm y el reparto de reacciones se mueve menos de un 5 %;
 *    · 2026-09-15, la demo con sus pedestales sembrados y tres pines: con solo
 *      los pines la punta sujeta se mueve 15.3 mm con 0.5 y 4.8 mm con 1.22, y
 *      el esfuerzo baja del 16 % al 5 % del límite.
 *
 *  O sea: con peso y apoyos casi no se nota, y con pines laterales manda. Se
 *  queda en 0.5 porque cambiarlo mueve formas sujetas sin una pieza medida que
 *  diga cuál acierta. **PROVISIONAL**, pedido en C.5, y es lo primero que hay
 *  que contrastar cuando llegue el escaneo con el fixture puesto.
 *
 *  NO se teclea en «Límites» y NO viaja en el JSON, a propósito: los umbrales
 *  de ahí no mueven un PI ni un ángulo, y este sí mueve la forma sujeta.
 *  Tocarlo es cambiar el modelo, no ajustar una tolerancia. */
export const ROT_STIFF_FAC = 0.5;

/** Lo que se deduce de un pin contra la barra. No se guarda: sale del modelo
 *  cada vez que se repinta, igual que `PedFit`. */
export type PinFit = {
  /** longitud desarrollada del punto de la barra que pasa más cerca, mm */
  s: number;
  /** distancia entre el EJE del pin y el eje de la barra en el punto donde más
   *  se acercan, mm. En el espacio, no en planta: desde que un pin se puede
   *  inclinar, la planta ya no dice la verdad */
  dist: number;
  /** lo que hace falta para que se toquen: radio del pin + lo que asoma la
   *  sección en la dirección en la que se tocan */
  need: number;
  /** `dist - need`. >0 la barra NO llega al pin (hay aire), <0 el pin está
   *  metido dentro de donde iría la barra y la empuja */
  gap: number;
  /** de qué lado de la barra cae el pin: +1 o −1 sobre la dirección de contacto */
  side: number;
  /** dónde se tocan a lo largo del PIN: 0 en la base, 1 en la punta */
  t: number;
  /** ¿se tocan por el CUERPO del poste? Si el punto más cercano cae en uno de
   *  los dos extremos, la barra pasa por fuera del poste —por encima de la punta
   *  o por debajo de la base— y ese pin no sujeta de lado, por bien puesto que
   *  esté. Los dos extremos y no solo la punta: desde que la base se puede
   *  levantar del suelo, un pin demasiado alto deja la barra pasando por debajo,
   *  que es el mismo fallo del derecho */
  reach: boolean;
  /** la dirección de contacto escrita en el marco de la SECCIÓN: `[a, b]` sobre
   *  (y, z). Va aquí porque es lo que el solver congela para que el residuo
   *  tenga signo estable mientras la barra se mueve */
  local: [number, number];
};

/** El eje del pin como segmento: de dónde sale y a dónde llega.
 *
 *  Un pin a plomo (`tilt` 0) sube en +z desde donde arranca su base, que es lo
 *  único que existía antes. Con `tilt` se tumba hacia el rumbo `yaw`, que se
 *  mide en planta desde +x igual que el rumbo de la barra en `pedestalFit()`.
 *
 *  DOS cifras y no una, y conviene no confundirlas: `z` es a qué ALTURA
 *  empieza el poste sobre la mesa y `h` es lo que MIDE de largo desde ahí. Con
 *  `z` a cero el poste sale de la mesa y las dos daban lo mismo, que es por lo
 *  que durante un tiempo bastó una. Dejaron de bastar en cuanto hizo falta un
 *  pin que empieza en el aire —montado sobre un dado, un suplemento o el propio
 *  cuerpo del fixture— para tocar una barra que pasa alta: subirlo alargando el
 *  poste lo hacía tocar también por abajo, donde no debía. Lo que sostiene el
 *  poste a esa altura no se modela: esto dice dónde está el cilindro, no de qué
 *  cuelga. */
export function pinAxis(pin: Pin): { base: Vector3; tip: Vector3; dir: Vector3 } {
  const t = (pin.tilt || 0) * D2R, y = (pin.yaw || 0) * D2R;
  const dir = new Vector3(Math.sin(t) * Math.cos(y), Math.sin(t) * Math.sin(y), Math.cos(t));
  const base = new Vector3(pin.x, pin.y, TABLE_Z + (pin.z || 0));
  return { base, tip: base.clone().addScaledVector(dir, pin.h), dir };
}

/** Media anchura de la sección medida EN PLANTA y perpendicular a la barra.
 *
 *  No es `width/2` sin más: con la barra de canto lo que asoma de lado es el
 *  espesor, y con la barra de plano es el ancho. Entre medias se reparten, así
 *  que se proyectan las dos direcciones de la sección sobre la normal
 *  horizontal y se suman en valor absoluto — la misma cuenta que
 *  `sectionDrop()` hace en vertical, y por el mismo motivo. */
export function planHalfWidth(q: PathSample, sec: Section, n: Vector3): number {
  return sectionHalf(q, sec, n);
}

/** La normal horizontal de la barra en esa muestra: perpendicular al eje,
 *  mirando de lado y contenida en el plano de la mesa. Con la barra vertical no
 *  hay normal horizontal definida y se devuelve `null`. */
export function planNormal(q: PathSample): Vector3 | null {
  const h = new Vector3(q.x.x, q.x.y, 0);
  if (h.lengthSq() < 1e-12) return null;
  h.normalize();
  return new Vector3(-h.y, h.x, 0);
}

/** Qué le pasa a un pin con la barra que tiene al lado.
 *
 *  `samples` viene YA colocada, como en `pedestalFit()`: el pin es físico y le
 *  importa dónde está la pieza de verdad. */
export function pinFit(samples: PathSample[], sec: Section, pin: Pin): PinFit | null {
  if (!samples.length) return null;
  /* Contra el SEGMENTO del pin y contra la POLILÍNEA de la barra. Las dos cosas
     tienen su motivo y las dos costaron un fallo:
       · la polilínea, porque buildPath() no pone ninguna muestra a lo largo de
         una recta y el punto más cercano salía a medio metro (engine/path.ts);
       · el segmento, porque desde que un pin puede inclinarse, dos rectas
         cruzadas se acercan en UN punto y la planta ya no lo dice. */
  const { base, tip } = pinAxis(pin);
  const { s: sc, t, d } = nearestToSegment(samples, base, tip);
  const q = sampleAt(samples, sc);
  /* La dirección en la que se tocan: del eje de la barra al eje del poste, sin
     la componente a lo largo de la barra —esa no separa nada—. Con el poste
     justo encima del eje no hay dirección definida y se cae a la normal
     horizontal, que es lo que había antes. */
  const pOn = base.clone().lerp(tip, t);
  const v = pOn.clone().sub(q.p);
  const u = v.clone().addScaledVector(q.x, -v.dot(q.x));
  if (u.lengthSq() < 1e-12) {
    const n = planNormal(q);
    if (n) u.copy(n); else u.copy(q.z);
  }
  u.normalize();
  /* EL LADO MONTADO MANDA SOBRE EL LEÍDO. La dirección de contacto sale de la
     forma que la barra tiene AHORA, y si un ángulo la ha llevado más allá del
     poste, esa lectura apunta al revés: el solver cerraría el contacto por la
     cara de atrás, o sea con la barra habiendo atravesado el pin. Con el lado
     guardado, la dirección se voltea y el residuo vuelve a decir la verdad.
     Ver el campo `side` del tipo Pin, y la prueba de los 3°. */
  const nrm = planNormal(q);
  const lado = nrm ? (u.dot(nrm) >= 0 ? 1 : -1) : 1;
  if (pin.side && nrm && lado !== pin.side) u.negate();
  const need = pin.dia / 2 + sectionHalf(q, sec, u);
  return {
    s: sc, t, dist: d, need, gap: d - need,
    side: pin.side || lado,
    /* Se tocan por el CUERPO del poste, no por uno de sus cabos. Con el pin a
       plomo y apoyado en la mesa esto es exactamente lo de antes —«el pin llega
       a la altura de la barra»— y con el pin tumbado o levantado sigue
       significando lo mismo sin tener que hablar de alturas. Se miran los DOS
       extremos porque desde que la base se levanta los dos son alcanzables: un
       poste demasiado alto deja la barra pasando por debajo y no sujeta más que
       uno demasiado corto. El margen evita que un contacto justo en el borde
       parpadee. */
    reach: t > 0.001 && t < 0.999,
    local: [u.dot(q.y), u.dot(q.z)],
  };
}

/** El hueco CON SIGNO en el punto de contacto congelado `s`. Es el residuo que
 *  el solver quiere llevar a cero.
 *
 *  El signo lo pone el LADO, congelado con `s` al empezar, y eso no es un
 *  adorno: con la distancia a secas —siempre positiva— el residuo también se
 *  anula con la barra CRUZADA al otro lado del pin, y el solver se va
 *  tranquilamente a esa solución, que es la barra atravesando el poste. Se cazó
 *  con el banco del amarre: un ángulo movido 3° salía «resuelto» con la pieza
 *  del otro lado. Con el lado dentro, cruzar hace el residuo cada vez MÁS
 *  negativo y el solver vuelve por donde vino.
 *
 *  Positivo = sobra aire · negativo = el pin está metido dentro de la barra. */
export function gapAt(samples: PathSample[], sec: Section, pin: Pin,
                      s: number, t: number, local: [number, number]): number {
  const q = sampleAt(samples, s);
  /* La dirección de contacto se reconstruye en el marco de la SECCIÓN, con las
     dos componentes congeladas: así gira con la barra —que es lo que hace de
     verdad— y su signo no depende de dónde haya quedado la pieza. */
  const u = q.y.clone().multiplyScalar(local[0]).addScaledVector(q.z, local[1]);
  if (u.lengthSq() < 1e-12) return 0;
  u.normalize();
  const { base, tip } = pinAxis(pin);
  const pOn = base.clone().lerp(tip, t);
  return pOn.clone().sub(q.p).dot(u) - (pin.dia / 2 + sectionHalf(q, sec, u));
}

/** El tramo libre asociado a cada estación, mm: la recta que entra más la que
 *  sale. Es la longitud sobre la que se reparte el codo elástico de esa
 *  estación, y por tanto lo que decide su rigidez. Nunca cero: una estación
 *  entre dos dobleces pegados es rígida, no infinitamente rígida. */
export function stationSpans(model: Model): number[] {
  const L = rowLengths(model);
  const tail = tailStraight(model);
  return model.bends.map((_, i) => {
    const inLen = L[i] ? L[i].straight : 0;
    const outLen = i + 1 < L.length ? L[i + 1].straight : tail;
    return Math.max(10, Math.abs(inLen) + Math.abs(outLen));
  });
}

/** Lo que devuelve `restrain()`. */
export type Restrained = {
  /** la pieza tal como queda sujeta por los pines */
  model: Model;
  /** cuánto cedió cada estación, ° */
  kink: { angle: number; rot: number }[];
  /** curvatura elástica inducida en cada estación, 1/mm */
  curv: number[];
  /** tensión de flexión en la superficie, MPa. Necesita el material */
  stress: number[];
  /** el peor `stress / yield`. >1 significa que la barra no vuelve al soltarla */
  worst: number;
  /** índice de la estación donde está ese peor caso, o −1 */
  worstAt: number;
  /** hueco que quedó sin cerrar en cada pin sujeto, mm */
  res: number[];
  /** ¿se cerraron todos los contactos dentro de la tolerancia? */
  ok: boolean;
  /** iteraciones gastadas */
  iters: number;
  /** los pines que de verdad sujetan, en el orden de `res` */
  held: number[];
};

/** Un resultado vacío: la pieza libre, sin nada que ceder. Es lo que se
 *  devuelve con el amarre apagado o sin pines que sujeten, y por eso `model` es
 *  el mismo objeto que entró — nadie tiene que preguntarse si esto clonó. */
export function restrainedFree(model: Model): Restrained {
  return {
    model,
    kink: model.bends.map(() => ({ angle: 0, rot: 0 })),
    curv: model.bends.map(() => 0),
    stress: model.bends.map(() => 0),
    worst: 0, worstAt: -1, res: [], ok: true, iters: 0, held: [],
  };
}

/** Lo que cede cada estación, leído del vector de incógnitas. Con `doRot` las
 *  incógnitas van por parejas —ángulo, rodado— y sin él solo hay ángulos: es el
 *  mismo orden que usa `withDelta()`, y por eso vive a su lado. */
export function kinksOf(u: number[], nb: number, doRot: boolean): { angle: number; rot: number }[] {
  return [...Array(nb)].map((_, i) => ({
    angle: u[doRot ? 2 * i : i],
    rot: doRot ? u[2 * i + 1] : 0,
  }));
}

/** De los codos elásticos al esfuerzo: curvatura, tensión y el peor caso.
 *
 *  Una sola función para el amarre y para la carga. Hasta el 2026-09-14 estaba
 *  escrita dos veces, idéntica, en `restrain()` y en `settle()`; y es justo la
 *  cuenta que da el veredicto de «esta pieza no vuelve al soltarla», así que
 *  corregirla en una copia dejaba a la otra pestaña diciendo otra cosa sobre la
 *  misma barra.
 *
 *  `E` se lee con `|| 0` porque la carga lo exige así —sin módulo no hay
 *  esfuerzo que decir— y en el amarre `normMat()` ya garantiza que no es cero,
 *  así que para él no cambia nada. */
export function elasticReport(kink: { angle: number; rot: number }[], span: number[],
                              sec: Section, mat: Mat
): Pick<Restrained, 'curv' | 'stress' | 'worst' | 'worstAt'> {
  /* La curvatura elástica de cada estación: el codo total repartido en su tramo
     libre. Ángulo y rodado se suman en cuadratura porque son dos flexiones en
     planos perpendiculares, no dos números que se puedan sumar. */
  const curv = kink.map((k, i) => Math.hypot(k.angle, k.rot) * D2R / span[i]);
  /* σ = E·c·κ. La fibra más lejana es media sección: con el codo de ángulo
     manda el espesor y con el de rodado manda el ancho, así que se toma la que
     de verdad trabaja en cada estación. No hace falta la inercia: se cancela
     entre el momento y el módulo resistente. */
  const cOf = (k: { angle: number; rot: number }): number =>
    sectionFibre(sec, Math.abs(k.rot) > Math.abs(k.angle));
  const stress = kink.map((k, i) => (mat.E || 0) * cOf(k) * curv[i]);
  let worst = 0, worstAt = -1;
  stress.forEach((s, i) => {
    const q = mat.yield > 0 ? s / mat.yield : 0;
    if (q > worst) { worst = q; worstAt = i; }
  });
  return { curv, stress, worst, worstAt };
}

/** Aplica los deltas de parámetros a una copia del modelo. Los deltas van en
 *  GRADOS, como todo lo que sale y entra del motor. */
export function withDelta(model: Model, du: number[], doRot: boolean): Model {
  const bends = model.bends.map((b, i) => ({
    ...b,
    angle: b.angle + du[doRot ? 2 * i : i],
    rot: doRot ? b.rot + du[2 * i + 1] : b.rot,
  }));
  return normalizeModel({ ...model, bends });
}

/** Cuántas veces, como mucho, se vuelven a leer los contactos sobre la forma
 *  que va saliendo.
 *
 *  Los dos solvers congelan DÓNDE toca cada apoyo antes de empezar —el punto de
 *  la barra, el lado, la dirección— porque sin eso el residuo no tiene signo
 *  estable. Con la pieza para la que se montó el fixture eso basta: se mueve
 *  décimas y el punto de contacto sigue siendo el mismo. Con OTRA pieza no
 *  basta, y esa es la comparación para la que existe el programa: un segundo
 *  modelo con un doblez 4° distinto cae decenas de milímetros, el punto
 *  congelado se queda atrás, y medido el 2026-09-14 la barra acababa 16 mm
 *  dentro de un pedestal con el solver diciendo que había terminado. Cada pasada
 *  vuelve a leer los contactos donde la barra está AHORA y sigue desde ahí;
 *  cuatro sobran para las piezas que se comparan, y el tope existe para que un
 *  caso patológico no congele la pantalla. */
export const CONTACT_PASSES = 4;

/** ¿Hay algún apoyo metido dentro de la barra que el solver no está viendo?
 *
 *  Se mide cada pin y cada pedestal contra la forma de AHORA, en su punto más
 *  cercano de verdad, y se compara con lo que dice su contacto congelado. Si el
 *  apoyo se mete más de `lim` y el congelado no lo sabe —porque no existía, o
 *  porque mira otro punto de la barra— hay que volver a leer.
 *
 *  `lim` es la tolerancia de punto del modelo: la misma con la que la tabla del
 *  fixture dice «apoya». Por debajo de eso la tabla no ve la diferencia, y
 *  perseguirla solo costaría pasadas.
 *
 *  @param frozen  el hueco que ve el contacto congelado de ese apoyo, `null` si
 *                 no hay ninguno, o `-Infinity` si no se puede juzgar (ciego)
 *  @param eps     cuánto tiene que meterse un apoyo que NO tiene contacto para
 *                 que cuente. Por defecto `lim`; la carga pasa casi cero, porque
 *                 ahí un apoyo que toca LLEVA peso —con κ de la demo, 0.6 µm son
 *                 5 N— y dejarlo fuera pinta la barra hundida en la cuna con la
 *                 reacción a cero, que es la contradicción que vigila el banco */
export function contactDrift(P: PathSample[], sec: Section, pins: Pin[], peds: Pedestal[],
                             frozen: (pin: boolean, k: number) => number | null,
                             lim: number, eps = lim): boolean {
  const cuenta = (gap: number, g: number | null): boolean =>
    (g === null ? gap < -eps : gap < -lim && g > gap + lim);
  for (let k = 0; k < pins.length; k++) {
    if (!pins[k].hold) continue;
    const f = pinFit(P, sec, pins[k]);
    if (f && f.reach && cuenta(f.gap, frozen(true, k))) return true;
  }
  for (let k = 0; k < peds.length; k++) {
    const f = pedestalFit(P, sec, peds[k]);
    if (f && f.over && cuenta(f.gap, frozen(false, k))) return true;
  }
  return false;
}

/** Lo que se mete dentro de la barra el apoyo que MÁS se mete, mm; 0 si ninguno.
 *
 *  Medido como la tabla: cada pin por el cuerpo del poste y cada pedestal sobre
 *  el tramo que le pasa por encima. Es la pregunta con la que se decide si una
 *  forma sujeta es aceptable o hay que insistir, y es la que el taller hace
 *  mirando la pantalla: ¿la barra atraviesa algo? */
export function worstPenetration(P: PathSample[], sec: Section, pins: Pin[],
                                 peds: Pedestal[]): number {
  let w = 0;
  for (const pin of pins) {
    if (!pin.hold) continue;
    const f = pinFit(P, sec, pin);
    if (f && f.reach && -f.gap > w) w = -f.gap;
  }
  for (const ped of peds) {
    const f = pedestalFit(P, sec, ped);
    /* `deep` Y `−gap`, no uno de los dos: `gap` mide el apoyo y se topa cuando
       la barra se mete más que su propio radio, que es justo cuando el choque
       empieza a ser grave. Ver `PedFit.deep`. */
    const d = f ? Math.max(-f.gap, f.deep) : 0;
    if (f && f.over && d > w) w = d;
  }
  return w;
}

/** Un apoyo que se ha quedado METIDO dentro de la barra: cuál, cuánto y dónde. */
export type Clash = {
  /** ¿es un pin? Si no, un pedestal */
  pin: boolean;
  /** su índice en la lista de pines o en la de pedestales */
  k: number;
  /** cuánto se mete, mm, siempre positivo */
  depth: number;
  /** el punto de la barra donde pasa, en coordenadas del TALLER */
  p: Vector3;
};

/** Los apoyos que se meten dentro de la barra más de `lim`, el peor primero.
 *
 *  Existe porque hay piezas que NO caben en un fixture, y eso es una respuesta,
 *  no un fallo del solver. Un modelo con un doblez 8° distinto del que el
 *  fixture sujeta puede quedar entero al otro lado de un pin: ninguna
 *  deformación elástica lo devuelve atravesándolo, y dibujar la forma «más
 *  cercana» sin decir nada es exactamente lo que el taller reportó —el segundo
 *  modelo atraviesa los pines—. Con esta lista la pantalla puede decir dónde
 *  choca y cuánto, que es lo que hay que saber antes de montar esa pieza. */
export function clashes(P: PathSample[], sec: Section, pins: Pin[], peds: Pedestal[],
                        lim: number): Clash[] {
  const out: Clash[] = [];
  pins.forEach((pin, k) => {
    if (!pin.hold) return;
    const f = pinFit(P, sec, pin);
    if (f && f.reach && -f.gap > lim) out.push({ pin: true, k, depth: -f.gap, p: sampleAt(P, f.s).p.clone() });
  });
  peds.forEach((ped, k) => {
    const f = pedestalFit(P, sec, ped);
    if (!f || !f.over) return;
    const d = Math.max(-f.gap, f.deep);      // ver `PedFit.deep`
    if (d > lim) out.push({ pin: false, k, depth: d, p: sampleAt(P, f.s).p.clone() });
  });
  return out.sort((a, b) => b.depth - a.depth);
}

/** Un apoyo que el amarre tiene que respetar: un pin, que se cierra por los dos
 *  lados, o un pedestal, que solo empuja. */
type Hold = { k: number; s: number; t: number; local: [number, number]; pin?: Pin; ped?: Pedestal };

/** Los apoyos que sujetan, leídos sobre una forma.
 *
 *  Solo sujetan los pines puestos, que llegan a la altura de la barra y que
 *  además tienen algo que cerrar: uno con hueco a favor no empuja nada. Un pin
 *  que no toca NO es un error —el fixture puede tener más pines de los que esta
 *  pieza usa— y por eso se ignora en silencio.
 *
 *  Los PEDESTALES entran solo si la barra se les mete dentro. Sin carga no
 *  sostienen nada, pero siguen siendo de acero: hasta el 2026-09-14 el amarre
 *  los ignoraba del todo, y un segundo modelo empujado por los pines atravesaba
 *  un pedestal 35 mm. Uno que la barra solo roza se deja fuera, y así la pieza
 *  para la que se sembró el fixture sale exactamente igual que antes.
 *
 *  @param keep  los que ya sujetaban en la pasada anterior: siguen contando
 *               aunque ahora los separe más que la tolerancia, porque un pin se
 *               cierra por los dos lados y soltarlo sería otra pieza */
function holdsAt(P: PathSample[], sec: Section, pins: Pin[], peds: Pedestal[],
                 tol: number, keep: Hold[]): Hold[] {
  const out: Hold[] = [];
  pins.forEach((pin, k) => {
    if (!pin.hold) return;
    const f = pinFit(P, sec, pin);
    if (!f || !f.reach) return;
    if (f.gap > tol && !keep.some(a => a.pin && a.k === k)) return;
    /* El lado MONTADO manda sobre el leído: ver el tipo Pin. Con `side` a 0
       —un pin recién puesto a mano, o un archivo anterior a este campo— se cae
       a la lectura, que es lo que había antes y sirve mientras la barra no
       rebase el poste. */
    out.push({ k, s: f.s, t: f.t, local: f.local, pin });
  });
  peds.forEach((ped, k) => {
    const f = pedestalFit(P, sec, ped);
    if (!f || !f.over) return;
    if (f.gap >= -tol && !keep.some(a => a.ped && a.k === k)) return;
    out.push({ k, s: f.s, t: 0, local: [0, 0], ped });
  });
  return out;
}

/** El residuo de un apoyo: el hueco con signo de un pin, o lo que la barra se
 *  mete en un pedestal —nada si le queda por encima, que un pedestal no tira—.
 *
 *  El pin en su punto congelado, por el lado (ver gapAt()); el pedestal sobre el
 *  trozo de barra que le pasa por encima AHORA, como en la tabla. Un poste
 *  vertical no tiene lado que congelar, y congelar el punto dejaba medir otro
 *  tramo en cuanto la barra se desplazaba de lado. Ver `gapOf` en settle(). */
const holdGap = (P: PathSample[], sec: Section, a: Hold): number =>
  a.pin ? gapAt(P, sec, a.pin, a.s, a.t, a.local)
    : Math.min(0, pedestalFit(P, sec, a.ped!)!.gap);

/** La pieza tal como la dejan los pines.
 *
 *  Devuelve la forma sujeta y lo que costó llegar a ella. Con `on` apagado, sin
 *  pines o sin contactos que cerrar, devuelve la pieza LIBRE sin tocar un
 *  número: esa igualdad es la que hace seguro el interruptor.
 *
 *  El bucle es un mínimos cuadrados amortiguado (Levenberg): jacobiano
 *  numérico, ecuaciones normales con un término de rigidez, y un paso por
 *  iteración. Con quince estaciones y diez pines el sistema tiene treinta
 *  incógnitas, así que se resuelve denso. Y por fuera, las pasadas que vuelven a
 *  leer los contactos: ver CONTACT_PASSES.
 *
 *  @param place  la transformación que coloca la pieza en la mesa. El fixture
 *                es físico: si la pieza está colocada, los pines la miran ahí.
 *  @param peds   los pedestales, que la barra no puede atravesar. Al final y
 *                opcional para que las llamadas de antes sigan valiendo. */
export function restrain(model: Model, pins: Pin[], sec: Section,
                         opt: Restraint = RESTRAINT_DEFAULT,
                         mat: Mat = MAT_DEFAULT,
                         place: (s: PathSample[]) => PathSample[] = s => s,
                         peds: Pedestal[] = []): Restrained {
  const free = restrainedFree(model);
  if (!opt.on || !model.bends.length) return free;

  const path0 = place(buildPath(model, PATH_SEG).samples);
  let act = holdsAt(path0, sec, pins, peds, opt.tol, []);
  if (!act.length) return free;

  const doRot = !!opt.doRot;
  const nb = model.bends.length;
  const nu = doRot ? 2 * nb : nb;
  /* Rigidez de cada incógnita: EI/L, con EI constante y por tanto irrelevante
     para el reparto (ver la cabecera). El rodado cede más que el ángulo por
     `ROT_STIFF_FAC`, que es el mismo número que usa la `K` de `settle()` en
     engine/load.ts; el porqué, las cifras y qué respuesta lo va a cambiar están
     junto a la constante. */
  const span = stationSpans(model);
  const stiff: number[] = [];
  for (let i = 0; i < nb; i++) {
    stiff.push(1 / span[i]);
    if (doRot) stiff.push(ROT_STIFF_FAC / span[i]);
  }

  const resid = (m: Model): number[] => {
    const p = place(buildPath(m, PATH_SEG).samples);
    return act.map(a => holdGap(p, sec, a));
  };

  const du = new Array<number>(nu).fill(0);
  let r = resid(model);
  let it = 0;
  const H = 0.02;                       // grados de perturbación del jacobiano
  const lim = Math.max(model.tol.point, opt.tol);
  for (let pass = 0; pass < CONTACT_PASSES; pass++) {
    let pit = 0;
    for (; pit < Math.max(1, opt.iters); pit++) {
      if (Math.max(...r.map(Math.abs)) <= opt.tol) break;
      /* Jacobiano numérico: una construcción de trayectoria por incógnita. Es lo
         caro de todo esto y el motivo de que las muestras vayan a 8 por arco. */
      const J: number[][] = [];
      for (let j = 0; j < nu; j++) {
        const dp = [...du];
        dp[j] += H;
        const rp = resid(withDelta(model, dp, doRot));
        J.push(rp.map((v, k) => (v - r[k]) / H));
      }
      /* Ecuaciones normales con el término de rigidez: (JᵀJ + λS) u = −Jᵀ r.
         El λ se escala con la magnitud de JᵀJ para que `damp` signifique lo mismo
         en una pieza de 1.7 m que en un cupón de 200 mm. */
      const A: number[][] = [];
      const b: number[] = [];
      let tr = 0;
      for (let i = 0; i < nu; i++) {
        const row: number[] = [];
        for (let j = 0; j < nu; j++) {
          let acc = 0;
          for (let k = 0; k < r.length; k++) acc += J[i][k] * J[j][k];
          row.push(acc);
        }
        tr += row[i];
        A.push(row);
        let g = 0;
        for (let k = 0; k < r.length; k++) g -= J[i][k] * r[k];
        b.push(g);
      }
      const lam = Math.max(1e-9, (tr / nu)) * Math.max(1e-3, opt.damp);
      for (let i = 0; i < nu; i++) A[i][i] += lam * stiff[i] / (stiff[0] || 1);
      const step = solveDense(A, b);
      if (!step) break;
      /* Paso topado: un salto de más de 5° por iteración no es elasticidad, es el
         solver saliéndose por una dirección mal condicionada. */
      const big = Math.max(...step.map(Math.abs));
      const f = big > 5 ? 5 / big : 1;
      for (let i = 0; i < nu; i++) du[i] += step[i] * f;
      const rn = resid(withDelta(model, du, doRot));
      /* Si el paso empeora, se deshace y se para: sin línea de búsqueda, insistir
         solo gasta iteraciones y se aleja. */
      if (Math.max(...rn.map(Math.abs)) > Math.max(...r.map(Math.abs))) {
        for (let i = 0; i < nu; i++) du[i] -= step[i] * f;
        break;
      }
      r = rn;
    }
    it += pit;
    if (pass + 1 >= CONTACT_PASSES) break;
    /* ¿Siguen siendo estos los contactos? Se miran sobre la forma a la que se
       llegó; si alguno se ha quedado atrás, se vuelven a leer desde ahí y el
       bucle sigue con lo que ya cedió cada estación, no desde cero. */
    const P = place(buildPath(withDelta(model, du, doRot), PATH_SEG).samples);
    const actual = act, rAct = r;
    const frozen = (pin: boolean, k: number): number | null => {
      const i = actual.findIndex(a => !!a.pin === pin && a.k === k);
      return i < 0 ? null : rAct[i];
    };
    if (!contactDrift(P, sec, pins, peds, frozen, lim)) break;
    act = holdsAt(P, sec, pins, peds, opt.tol, actual);
    r = resid(withDelta(model, du, doRot));
  }

  const held = withDelta(model, du, doRot);
  const kink = kinksOf(du, nb, doRot);
  /* `res` y `held` hablan solo de PINES, en el mismo orden, como siempre: la
     tabla del amarre los lee por índice. Lo que se metió en un pedestal entra en
     `ok`, que dice si la forma respeta TODO el fixture. */
  const pinIdx = act.map((a, i) => (a.pin ? i : -1)).filter(i => i >= 0);
  return {
    model: held, kink, ...elasticReport(kink, span, sec, mat),
    res: pinIdx.map(i => r[i]), ok: Math.max(0, ...r.map(Math.abs)) <= opt.tol, iters: it,
    held: pinIdx.map(i => act[i].k),
  };
}

/** Unos pines de partida: `n` repartidos a lo largo de la barra, tocando de
 *  lado y alternando de lado, que es como se sujeta una barra en un fixture
 *  real — todos del mismo lado la dejarían girar sobre ellos.
 *
 *  Como `seedPedestals()`, no es el fixture bueno: es algo que tocar. */
export function seedPins(samples: PathSample[], sec: Section, n = 4,
                         dia = 20): Omit<Pin, 'id' | 'name'>[] {
  if (!samples.length || n < 1) return [];
  const total = samples[samples.length - 1].s;
  const out: Omit<Pin, 'id' | 'name'>[] = [];
  for (let k = 0; k < n; k++) {
    const f = n === 1 ? 0.5 : 0.1 + 0.8 * k / (n - 1);
    const target = total * f;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const d = Math.abs(samples[i].s - target);
      if (d < bd) { bd = d; bi = i; }
    }
    const q = samples[bi];
    /* Un poste sale de la MESA hacia arriba: donde la barra pasa por debajo del
       plano de la mesa no hay pin que valga, y sembrar uno ahí solo produce una
       fila en rojo que alguien tiene que borrar. Se salta esa estación y salen
       menos pines, que es la respuesta honesta. */
    if (q.p.z <= TABLE_Z + 10) continue;
    const nrm = planNormal(q) || new Vector3(0, 1, 0);
    const side = k % 2 ? -1 : 1;
    const d = dia / 2 + planHalfWidth(q, sec, nrm);
    const cand = {
      /* EL SITIO EN PLANTA NO SE REDONDEA, desde el 2026-09-19 (FIS-10c), por el
         mismo motivo por el que no se redondea el alto de un pedestal: con la
         carga encendida el muelle de contacto vale κ ≈ 6.16 N por MICRA, y
         redondear a centésimas deja hasta ±5 µm de interferencia sembrada.
         Medido sobre la demo con cuatro pines y el peso puesto: el primer pin
         pasa de 8.83 N a 6.25 N, o sea que 2.58 N de los 8.83 —el 41 %— los
         ponía el redondeo y no la pieza.
         EL ALTO SÍ SE REDONDEA, y está medido: un pin a plomo toca a la barra
         por su CUERPO, así que mover su punta cinco micras a lo largo de su
         propio eje no mueve el hueco ni un bit (1e-14 mm con el alto redondeado
         y sin redondear, en los tres pines de la demo). Un alto con dos
         decimales es lo que se corta en el taller; una coordenada con doce es
         lo que hay que meter en el CAM. */
      x: q.p.x + nrm.x * d * side,
      y: q.p.y + nrm.y * d * side,
      /* La punta queda POR ENCIMA del eje de la barra, no a su altura: el
         contacto se resuelve entre segmentos, y un poste que termina justo
         donde pasa la barra la toca por su punta —que no sujeta de lado— en vez
         de por el cuerpo. */
      h: +clamp(q.p.z - TABLE_Z + 40, 40, 600).toFixed(2),
      /* el lado queda GUARDADO al sembrar: es el que se acaba de montar. Los
         pines sembrados nacen A PLOMO y APOYADOS EN LA MESA: inclinar un poste o
         levantar su base son decisiones del taller —hay un dado debajo, o no lo
         hay— y no algo que el programa deba adivinar. */
      dia, visible: true, hold: true, side, tilt: 0, yaw: 0, z: 0,
    };
    /* Corrección contra la barra de verdad, por el mismo motivo que en
       `seedPedestals()`: el pin se coloca a partir de una MUESTRA y el contacto
       se mide contra la polilínea, que en mitad de un arco pasa por dentro. Sin
       esto un pin sembrado nace con unas décimas de hueco y no sujeta hasta que
       alguien lo corrige a mano.

       Y NO BASTA UNA VUELTA. Mover el pin una micra en planta no cierra una
       micra de hueco: lo cierra en la dirección en la que se tocan, que no es
       la normal en planta salvo con la barra tendida, y además al moverlo
       cambia el punto de la polilínea que le queda más cerca. Con una sola
       pasada quedaban 4.5 µm en la demo; iterando, los tres pines bajan a 1e-13
       mm en DOS vueltas. El tope de 12 está para que un caso raro no se quede
       dando vueltas, y se guarda el mejor por si alguna se pasa de largo. */
    let mejor = { ...cand };
    let peor = Infinity;
    for (let it = 0; it < 12; it++) {
      const fit = pinFit(samples, sec, { id: '', name: '', ...cand });
      /* La corrección solo vale si el contacto sigue siendo el que se buscaba:
         si el punto más cercano se ha ido a otro tramo de la barra —pasa cuando
         la pieza dobla sobre sí misma— corregir por ese hueco mandaría el pin
         lejos en vez de acercarlo. */
      if (!fit || Math.abs(fit.s - q.s) >= 50) break;
      const g = Math.abs(fit.gap);
      if (g < peor) { peor = g; mejor = { ...cand }; }
      if (g < 1e-12) break;
      cand.x -= nrm.x * fit.gap * side;
      cand.y -= nrm.y * fit.gap * side;
    }
    out.push({ ...cand, x: mejor.x, y: mejor.y });
  }
  return out;
}

/** El ángulo total que cede una estación, °: es lo que se enseña en la tabla y
 *  lo que hay que comparar con la tolerancia de ángulo. */
export const kinkOf = (k: { angle: number; rot: number }): number =>
  Math.hypot(k.angle, k.rot);

/** Grados de un radián de curvatura por milímetro; solo para la tabla. */
export const curvDeg = (c: number): number => c * R2D;
