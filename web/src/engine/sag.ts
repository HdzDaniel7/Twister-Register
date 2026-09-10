/* =========================================================================
   LA FLECHA POR GRAVEDAD — cuánto se cuelga la barra entre dos apoyos por su
   propio peso.

   ESTO ES M6, y llevaba abierto desde la auditoría. No estaba bloqueado por
   falta de fórmula: estaba bloqueado porque hacía falta el material, y meterle
   un módulo elástico inventado a un número que luego alguien resta del nominal
   es exactamente lo que este proyecto no hace. Ahora el material existe como
   dato editable y marcado provisional (ver engine/pins.ts), así que la flecha
   se puede dar con la misma disciplina: la geometría con confianza, la magnitud
   con el aviso puesto.

   POR QUÉ IMPORTA, que es lo que lo puso en la lista: la barra se MIDE montada
   en el fixture. En 1.7 m de aluminio la flecha entre dos apoyos separados
   puede ser del orden de la tolerancia de punto, así que un vano largo mete en
   la medición un error que NO es de doblado. El lazo de compensación intenta
   corregirlo, no puede —no es un error de doblado— y ahí se queda. Es la
   explicación más probable del estancamiento a ~5 mm en la punta que se vio en
   simulación.

   CÓMO SE CALCULA, y qué se está aceptando al hacerlo así:

   · Cada tramo entre dos apoyos se trata como una viga **biapoyada** con carga
     repartida: `δ = 5·w·L⁴/(384·E·I)`. El voladizo de cada punta, como
     **ménsula**: `δ = w·L⁴/(8·E·I)`.
   · Una viga CONTINUA sobre varios apoyos es más rígida que una cadena de
     tramos biapoyados sueltos —los momentos en los apoyos levantan el centro—
     así que esto **sobreestima** la flecha. Se elige a propósito: por el lado
     seguro, y porque la alternativa (resolver la viga continua entera) pide
     decidir qué apoyo es fijo y cuál deja deslizar, que es un dato del fixture
     que nadie ha medido.
   · `I` no es una constante de la barra: depende de CÓMO esté puesta la sección
     en cada tramo. De plano se cuelga (w/t)² veces más que de canto — con
     40×12 eso son once veces— así que la orientación manda más que el vano.
     `sagI()` lo resuelve proyectando la vertical sobre las dos direcciones
     principales de la sección.

   LO QUE ESTO NO ES: no es un modelo de la pieza doblada como estructura. Cada
   tramo se trata como recto; los dobleces dentro de un vano rigidizan o
   flexibilizan y eso no está. Tampoco hay torsión por el peso propio de un
   tramo de canto que además esté girado, ni el efecto de los pines laterales,
   que no sostienen nada en vertical. Cuando llegue el escaneo de una barra
   recta certificada montada en el fixture (punto A.5), esto se contrasta contra
   la flecha MEDIDA y deja de ser una estimación.
   ========================================================================= */
import type { Model, PathSample, Section, Mat, Pedestal } from '../types.ts';
import { sampleAt } from './path.ts';
import { pedestalFit } from './fixture.ts';

/** Aceleración de la gravedad, mm/s². Aquí y no en math.ts: es lo único de
 *  todo el motor que sabe que existe la Tierra. */
export const G = 9810;

/** Carga por unidad de longitud, N/mm, a partir de la densidad y la sección.
 *
 *  `rho` viaja en kg/m³ porque es como se lee en cualquier ficha de material;
 *  aquí se pasa a kg/mm³ (1e-9) y de ahí a newton (1 N = 1000 kg·mm/s²), que
 *  deja el resultado en N/mm y hace que `δ = k·w·L⁴/(E·I)` salga en milímetros
 *  con `E` en MPa y `I` en mm⁴. Sin esta cadena de unidades escrita, el número
 *  sale mil o mil millones de veces mayor y nadie lo nota. */
export const lineLoad = (sec: Section, mat: Mat): number =>
  (mat.rho || 0) * 1e-9 * (sec.width * sec.thickness) * G / 1000;

/** El momento de inercia que de verdad resiste el peso en esa muestra, mm⁴.
 *
 *  La carga es VERTICAL, pero la sección no tiene por qué estar ni de plano ni
 *  de canto: entre medias se reparte. Con ejes principales, cada componente de
 *  la carga flexiona con su propia inercia y las dos deflexiones se suman; la
 *  parte VERTICAL de esa suma es `w·L⁴/E · (cy²/Iz + cz²/Iy)`, o sea que se
 *  comporta como una inercia efectiva `1/(cy²/Iz + cz²/Iy)`.
 *
 *  Devuelve `Infinity` si la barra está a plomo en ese punto: una columna no se
 *  cuelga, y así el tramo da flecha cero en vez de dividir por cero. */
export function sagI(q: PathSample, sec: Section): number {
  const Iz = sec.width * sec.thickness ** 3 / 12;   // flexión que hunde en `y`
  const Iy = sec.thickness * sec.width ** 3 / 12;   // flexión que hunde en `z`
  /* La vertical vista desde la sección, quitándole lo que va a lo largo de la
     barra: esa componente no flexiona, solo tira en el eje. */
  const cy = q.y.z, cz = q.z.z;
  const den = cy * cy / Iz + cz * cz / Iy;
  return den > 1e-18 ? 1 / den : Infinity;
}

/** Un tramo de barra entre dos apoyos, o el voladizo de una punta. */
export type SagSpan = {
  /** longitud desarrollada donde empieza y acaba, mm */
  s0: number;
  s1: number;
  /** su longitud, mm */
  L: number;
  /** ¿es un voladizo de punta, en vez de un tramo entre dos apoyos? */
  free: boolean;
  /** inercia efectiva usada, mm⁴ */
  I: number;
  /** flecha estimada, mm. Positiva = se cuelga */
  sag: number;
};

export type SagResult = {
  spans: SagSpan[];
  /** la peor flecha de todas, mm */
  worst: number;
  /** en qué tramo está, o −1 */
  worstAt: number;
  /** ¿falta el material para poder decir un número? */
  noMat: boolean;
};

const EMPTY: SagResult = { spans: [], worst: 0, worstAt: -1, noMat: false };

/** La flecha de cada tramo de la barra montada en el fixture.
 *
 *  Los apoyos son los PEDESTALES que de verdad sostienen —los pines no sujetan
 *  nada en vertical— ordenados a lo largo de la barra. Los dos extremos entran
 *  como voladizo, que es donde la flecha se dispara: la cuarta potencia de la
 *  longitud no perdona, y una ménsula se cuelga casi siete veces más que un
 *  tramo biapoyado del mismo largo.
 *
 *  `samples` viene YA colocada, como en `pedestalFit()`. */
export function gravitySag(model: Model, samples: PathSample[], sec: Section,
                           peds: Pedestal[], mat: Mat): SagResult {
  if (!samples.length) return EMPTY;
  const w = lineLoad(sec, mat);
  const E0 = mat.E || 0;
  if (!(w > 0) || !(E0 > 0)) return { ...EMPTY, noMat: true };

  /* Solo los que apoyan de verdad: uno que no toca la barra no la sostiene, por
     bien puesto que esté en la tabla. Es la misma lectura que ya pinta en rojo
     la pestaña del fixture. */
  const apoyos = peds
    .map(p => pedestalFit(samples, sec, p))
    .filter((f): f is NonNullable<typeof f> => !!f && f.over && Math.abs(f.gap) <= model.tol.point)
    .map(f => f.s)
    .sort((a, b) => a - b);

  const total = samples[samples.length - 1].s;
  const spans: SagSpan[] = [];
  const push = (s0: number, s1: number, free: boolean) => {
    const L = s1 - s0;
    if (!(L > 1)) return;
    /* La inercia se mira en MITAD del tramo: es donde la flecha se hace, y
       tomarla en un extremo daría la orientación del doblez vecino en vez de la
       del tramo. */
    const I = sagI(sampleAt(samples, (s0 + s1) / 2), sec);
    const k = free ? 1 / 8 : 5 / 384;
    spans.push({ s0, s1, L, free, I, sag: isFinite(I) ? k * w * L ** 4 / (E0 * I) : 0 });
  };

  if (!apoyos.length) {
    /* Sin un solo apoyo no hay viga: la barra estaría en el aire. Se devuelve
       el tramo entero como voladizo, que es lo más parecido a la verdad y deja
       un número enorme, que es exactamente lo que hay que ver. */
    push(0, total, true);
  } else {
    push(0, apoyos[0], true);
    for (let i = 1; i < apoyos.length; i++) push(apoyos[i - 1], apoyos[i], false);
    push(apoyos[apoyos.length - 1], total, true);
  }

  let worst = 0, worstAt = -1;
  spans.forEach((s, i) => { if (s.sag > worst) { worst = s.sag; worstAt = i; } });
  return { spans, worst, worstAt, noMat: false };
}

/** El tramo cuya flecha le toca a cada pedestal: el que ACABA en él, que es el
 *  mismo criterio que sigue `pedestalSpans()` con el vano. Devuelve `NaN` donde
 *  no hay tramo, para que la tabla diga «—» y no «0». */
export function sagByPedestal(res: SagResult, samples: PathSample[], sec: Section,
                              peds: Pedestal[]): number[] {
  return peds.map(p => {
    const f = pedestalFit(samples, sec, p);
    if (!f) return NaN;
    const sp = res.spans.find(x => Math.abs(x.s1 - f.s) < 1e-6);
    return sp ? sp.sag : NaN;
  });
}
