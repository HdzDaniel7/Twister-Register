/* =========================================================================
   ESQUEMA Y DOCUMENTO — el esquema `barcomp/2.2`, la lectura/escritura del
   JSON y la migración de archivos de versiones anteriores.

   Es el MISMO esquema JSON que usa python/barcomp/core.py, así que los
   archivos van y vienen entre las dos implementaciones. Los nombres son
   camelCase de este lado y snake_case del lado Python.

   Los archivos anteriores se convierten al abrirlos — ver migrateModel():
   en barcomp/1.0 `rot` era un doblez de canto; en barcomp/2.0 era un rodado
   de verdad, que dejaba la sección girada.
   ========================================================================= */
import { Vector3 } from 'three';
import type {
  Bend, Model, Variant, AnchorMode, Place, Mark, Tweak, UiPrefs, Doc, LoadedDoc, Proc, Comp,
} from '../types.ts';
import { D2R, eye, trans, rotX, rotY, rotZ, posOf } from './math.ts';
import { bendFrom, normalizeModel } from './bend.ts';
import type { RawModel } from './bend.ts';
import { syncDeltas } from './model.ts';
import { ik } from './kinematics.ts';
import { PROC_DEFAULT, COMP_DEFAULT } from './compensate.ts';
import { PLACE_DEFAULT } from './fitting.ts';

export const SCHEMA = 'barcomp/2.3';
/** Esquemas anteriores, cada uno con su cinemática. Se convierten al abrirlos.
 *  · 1.0  `rot` era un doblez de canto y `angle` tenía el signo contrario
 *  · 2.0  `rot` rodaba la barra de verdad y la sección salía girada
 *  · 2.1  `rot` era el eje ABSOLUTO, no el incremento */
export const SCHEMA_LEGACY: string[] = ['barcomp/1.0', 'barcomp/2.0', 'barcomp/2.1'];

/** Esquemas que se leen TAL CUAL, sin tocar un número, pero cuya etiqueta no
 *  basta para saber con qué sentido se escribieron.
 *
 *  `barcomp/2.2` es el único caso. Después de fijarlo, `ANG_DIR` y `ROT_DIR`
 *  pasaron a −1: los mismos valores describen la pieza doblada al otro lado.
 *  Fue deliberado —los datos del taller ya venían con ese sentido y lo que se
 *  cambió fue el motor, no los archivos— así que **convertirlos deshría el
 *  cambio y aquí no se convierte nada**.
 *
 *  Lo que sí hace falta es que se note: un `2.2` puede haberse escrito antes o
 *  después del cambio, y el motor de Python puede seguir leyéndolo con la forma
 *  contraria. Se abre con la convención de hoy y se avisa. Los archivos que
 *  escribe esta versión salen ya como 2.3 y no son ambiguos. */
export const SCHEMA_AMBIGUOUS: string[] = ['barcomp/2.2'];

/* ---------------------------------------------------------------------- E/S */
/** Una pieza medida, tal como la ve `toDoc()`: solo lo que hace falta para
 *  reconstruirla — `pis`/`dev` no se guardan, se recalculan al abrir. */
type ToDocDataset = {
  name: string; color: string; src?: string; model: Model;
  /** el comando con el que se fabricó, si la pieza lo trae */
  cmd?: Bend[];
};
/** Lo demás que lleva el documento: presentación y preferencias, nada de
 *  cinemática. Todo opcional porque toDoc() rellena cualquier falta. */
type ToDocExtra = {
  place?: Partial<Place>;
  marks?: Mark[];
  tweak?: Tweak[];
  ui?: { theme?: UiPrefs['theme']; lang?: UiPrefs['lang']; mode?: UiPrefs['mode'] };
};

export function toDoc(
  model: Model,
  command: Bend[] | null | undefined,
  comp: Comp | null | undefined,
  proc: Proc | null | undefined,
  datasets: ToDocDataset[] = [],
  variants: Variant[] = [],
  ref: string | null = null,
  anchor: AnchorMode = 'start',
  extra: ToDocExtra = {},
): Doc {
  return {
    schema: SCHEMA,
    saved: new Date().toISOString(),
    model,
    command: command || model.bends,
    comp: comp || { ...COMP_DEFAULT },
    proc: proc || { ...PROC_DEFAULT },
    datasets: datasets.map(d => ({
      name: d.name, color: d.color, src: d.src || '',
      bends: d.model.bends, tail: d.model.tail,
      /* el comando con el que se fabricó: clave opcional, y sin ella no se
         puede estimar el resorte de una pieza abierta de un archivo */
      ...(d.cmd && d.cmd.length ? { cmd: d.cmd } : {}),
    })),
    // claves opcionales: los archivos viejos siguen abriendo sin ellas
    ref, anchor,
    variants: variants.map(v => ({
      id: v.id, name: v.name, color: v.color, visible: !!v.visible,
      base: v.base, deltas: v.deltas || [], tailDelta: +(v.tailDelta || 0),
    })),
    place: { ...PLACE_DEFAULT, ...(extra.place || {}) },
    marks: (extra.marks || []).map(m => ({
      name: m.name, color: m.color, visible: m.visible !== false,
      x: +m.x || 0, y: +m.y || 0, z: +m.z || 0,
    })),
    tweak: (extra.tweak || []).map(t => ({
      angle: +t.angle || 0, rot: +t.rot || 0, feed: +t.feed || 0,
    })),
    /* Preferencias de la interfaz. No hay localStorage en este proyecto, así
       que tema e idioma viajan con el documento. Clave opcional: un archivo
       sin `ui` no pisa lo que el usuario tenga puesto. */
    ui: {
      theme: (extra.ui && extra.ui.theme) || 'system',
      lang: (extra.ui && extra.ui.lang) || 'es',
      /* el modo de trabajo viaja igual que el tema: es cómo estaba puesta la
         pantalla, no un dato de la pieza */
      mode: (extra.ui && extra.ui.mode) || 'model',
    },
  };
}

/* ---------------------------------------------------------- migración ------
   Tres cinemáticas han existido. Los mismos números describen otra pieza en
   cada una, así que abrir un archivo viejo sin convertirlo daría la forma
   equivocada y en silencio.

     1.0   T <- T · Trans(feed) · Ry(rot) · Rz( angle) · Rx(twist)
           `rot` era un doblez de CANTO y `angle` tenía el signo contrario.
     2.0   T <- T · Trans(feed) · Rx(rot) · Rz(-angle) · Rx(twist)
           `rot` rodaba la barra de verdad: la sección salía girada del doblez.
     2.1   T <- T · Trans(feed) · Rot(n(rot), angle) · Rx(twist)
           `rot` solo inclina el eje del arco; la sección no se rueda.

   La conversión no aproxima nada: del modelo viejo se saca la FORMA real —sus
   PI en el espacio— y de ahí se replantea la cadena con ik(), que ya habla la
   convención de hoy. Es la ida y vuelta que test_motor.js verifica a 1e-9. */

/** Recorre la cadena con la cinemática de un esquema anterior y devuelve los
 *  PI. Es lo único que hace falta para convertir: la forma. */
export function fkLegacy(model: Model, schema = 'barcomp/1.0'): { pis: Vector3[] } {
  let T = eye();
  const pis = [posOf(T)];
  for (const b of model.bends) {
    T = T.multiply(trans(b.feed));
    pis.push(posOf(T));
    /* Tres convenciones han existido, y los mismos números describen otra
       pieza en cada una:
         1.0  Ry(rot)·Rz(angle)                 rot era el doblez de canto
         2.0  Rx(rot)·Rz(-angle)                rot rodaba la barra de verdad
         2.1  Rx(rot)·Rz(-angle)·Rx(-rot)       rot era el eje ABSOLUTO
       En 2.2 `rot` pasa a ser el INCREMENTO del eje, así que un archivo 2.1 se
       relee aquí con su eje absoluto y sale por ik() convertido a giros. */
    T = schema === 'barcomp/2.1'
      ? T.multiply(rotX(b.rot * D2R)).multiply(rotZ(-b.angle * D2R))
          .multiply(rotX(-b.rot * D2R))
      : schema === 'barcomp/2.0'
        ? T.multiply(rotX(b.rot * D2R)).multiply(rotZ(-b.angle * D2R))
        : T.multiply(rotY(b.rot * D2R)).multiply(rotZ(b.angle * D2R));
    if (b.twist) T = T.multiply(rotX(b.twist * D2R));
  }
  T = T.multiply(trans(model.tail));
  pis.push(posOf(T));
  return { pis };
}

/** Pasa un modelo de un esquema anterior a la convención de hoy, sin mover la
 *  pieza. `schema` dice de cuál viene. */
export function migrateModel(model: RawModel, schema = 'barcomp/1.0'): Model {
  const m = normalizeModel(model);
  if (!m.bends.length) return m;
  const out = ik(fkLegacy(m, schema).pis, m.bends.map(b => b.radius));
  /* la torsión no depende de la convención: viaja tal cual */
  out.bends.forEach((b, i) => {
    b.twist = m.bends[i].twist || 0;
    b.twistLen = m.bends[i].twistLen || 0;
  });
  return normalizeModel({ ...m, bends: out.bends, tail: out.tail });
}

/** Esquema declarado por el archivo. Sin `schema` es de los primeros: 1.0. */
const schemaOf = (d: Doc | null | undefined): string => (d && d.schema) || 'barcomp/1.0';

/** ¿El documento trae una cinemática anterior que hay que CONVERTIR? */
export const isLegacyDoc = (d: Doc | null | undefined): boolean =>
  !!d && SCHEMA_LEGACY.includes(schemaOf(d));

/** ¿El documento se lee tal cual pero su sentido de giro no es verificable? */
export const isAmbiguousDoc = (d: Doc | null | undefined): boolean =>
  !!d && SCHEMA_AMBIGUOUS.includes(schemaOf(d));

/** Se lanza al abrir un archivo cuyo esquema no conocemos. Antes caía al `else`
 *  de fkLegacy() y se reinterpretaba como cinemática 1.0 —o sea, un archivo del
 *  futuro, o del motor de Python desincronizado, se abría con la convención más
 *  vieja de todas y sin decir nada. */
export class UnknownSchemaError extends Error {
  readonly schema: string;
  constructor(schema: string) {
    super(`esquema desconocido: ${schema}`);
    this.name = 'UnknownSchemaError';
    this.schema = schema;
  }
}

/** Se lanza cuando el archivo es JSON válido pero no describe una pieza: le
 *  falta `model.bends`. Es una clase y no un `Error` suelto para que la capa de
 *  interfaz pueda distinguirla del resto y decir qué archivo hacía falta, en el
 *  idioma que toque. El motor no redacta mensajes para el usuario. */
export class NotADocError extends Error {
  constructor() {
    super('el archivo no tiene `model.bends`');
    this.name = 'NotADocError';
  }
}

/** Normaliza un documento leído de JSON. Gemelo de load_json() de core.py. */
export function fromDoc(d: Doc): LoadedDoc {
  /* Un archivo anterior a barcomp/2.0 describe la misma pieza con otra
     convención: se convierte antes de tocar nada, o se abriría con la forma
     equivocada y en silencio. Quien llama se entera por `legacy`. */
  const from = schemaOf(d);
  /* Un esquema que no conocemos NO se adivina. Antes caía a la cinemática 1.0
     y abría la pieza con la forma equivocada, en silencio. */
  if (from !== SCHEMA && !SCHEMA_LEGACY.includes(from) && !SCHEMA_AMBIGUOUS.includes(from)) {
    throw new UnknownSchemaError(from);
  }
  if (!d || !d.model || !Array.isArray(d.model.bends)) throw new NotADocError();
  const legacy = isLegacyDoc(d);
  const conv = (m: RawModel): Model => (legacy ? migrateModel(m, from) : normalizeModel(m));
  const model = conv(d.model);
  const variants = (d.variants || []).map((v, i) => syncDeltas({
    id: v.id || `v${i + 1}`,
    name: v.name ?? 'MODELO',
    color: v.color || '#3FA9F5',
    visible: v.visible !== false,
    base: conv(v.base),
    /* los Δ son incrementos sobre parámetros que cambiaron de significado: no
       hay conversión honesta, así que un archivo viejo llega con ellos en cero */
    deltas: legacy ? [] : (v.deltas || []),
    tailDelta: legacy ? 0 : +(v.tailDelta || 0),
  }));
  return {
    model,
    /* el comando de máquina también estaba en la convención vieja */
    command: legacy
      ? migrateModel({ ...d.model, bends: d.command || d.model.bends }, from).bends
      : (d.command || model.bends).map(bendFrom),
    legacy,
    ambiguous: isAmbiguousDoc(d),
    comp: { ...COMP_DEFAULT, ...(d.comp || {}) },
    proc: { ...PROC_DEFAULT, ...(d.proc || {}) },
    /* En un archivo anterior el `cmd` no existía, y si existiera estaría en la
       cinemática vieja: se descarta en vez de migrarlo a medias. */
    datasets: (d.datasets || []).map(x => (legacy
      ? { ...x, cmd: undefined, bends: migrateModel({ ...d.model, bends: x.bends || [], tail: x.tail ?? d.model.tail }, from).bends }
      : x)),
    anchor: d.anchor || 'start',
    variants,
    ref: d.ref || (variants.length ? variants[0].id : null),
    // claves opcionales: un archivo sin ellas abre igual que siempre
    place: { ...PLACE_DEFAULT, ...(d.place || {}) },
    marks: (d.marks || []).map((m, i) => ({
      id: `mk${i + 1}`,
      name: m.name || `P${i + 1}`,
      color: m.color || '#57C8D6',
      visible: m.visible !== false,
      x: +m.x || 0, y: +m.y || 0, z: +m.z || 0,
    })),
    tweak: (d.tweak || []).map(t => ({
      angle: +t.angle || 0, rot: +t.rot || 0, feed: +t.feed || 0,
    })),
    /* null = el archivo no dijo nada: no se pisa la preferencia actual */
    ui: d.ui ? { theme: d.ui.theme || null, lang: d.ui.lang || null,
                 mode: d.ui.mode || null } : null,
  };
}

/** Lee puntos de un CSV. Gemelo exacto de `read_points_csv()` del motor de
 *  Python, hasta la regla rara: de cada linea se toman **las tres ultimas
 *  columnas numericas**, y la linea que no tenga tres se descarta sola.
 *
 *  Suena laxo y es deliberado. Un volcado de GOM llega con encabezado, con una
 *  columna de indice o de nombre delante, separado por comas, por punto y coma
 *  o por tabuladores, y a veces con una linea de unidades. Con esta regla todo
 *  eso entra sin pedirle a nadie que limpie el archivo a mano, y lo que no son
 *  coordenadas no se cuela.
 *
 *  Lo que NO hace: adivinar el separador decimal. Un `1,5` europeo son dos
 *  columnas, no un numero y medio. */
export type CsvReason =
  /** entraron puntos */
  | 'ok'
  /** ninguna línea tenía tres números */
  | 'empty'
  /** decimales con coma: `1,5` son dos columnas, no un número y medio */
  | 'decimalComma'
  /** más de cuatro columnas numéricas: no se sabe cuáles son las coordenadas */
  | 'tooManyColumns'
  /** dos PI consecutivos prácticamente en el mismo sitio: ver PI_MIN_MM */
  | 'coincident';

export type CsvParse = {
  pts: Vector3[];
  reason: CsvReason;
  /** columnas numéricas que tenía la mayoría de las líneas de datos */
  cols: number;
  /** líneas con tres números o más que NO encajaban y se descartaron */
  skipped: number;
  /** índices del SEGUNDO punto de cada pareja demasiado junta. Vacío si no las
   *  hay; con algo dentro, `pts` viene vacío y `reason` es 'coincident'. */
  near: number[];
};

/** Distancia mínima entre dos PI consecutivos para creerle la dirección al
 *  segmento que los une.
 *
 *  `ik()` normaliza `w = P[i+1] - P[i]` y solo se protege de que el largo sea
 *  CERO exacto. Dos puntos a 0.3 mm pasan esa guarda y dan una dirección que es
 *  casi todo ruido de medición: de ahí sale un doblez inventado, y como lo que
 *  se guarda es el GIRO respecto de la estación anterior, la fila siguiente
 *  hereda la basura. Es el mismo mecanismo que AXIS_MIN_DEG, un escalón antes.
 *
 *  VALOR PROVISIONAL, por el mismo motivo que AXIS_MIN_DEG: la regla es `5σ` y
 *  σ no está medida (`.auditoria/solicitud-datos.md`, punto A.6). 1.0 mm es
 *  conservador y no puede rechazar una pieza sana: entre dos PI de verdad hay
 *  la recta más los dos trims —decenas de milímetros— y un PI a 1 mm del
 *  anterior implicaría una recta muy negativa, que es geometría imposible.
 *
 *  Se rechaza el archivo ENTERO en vez de fusionar los puntos: dos PI pegados
 *  significan que la extracción de la nube salió mal, y una pieza importada a
 *  medias es peor que ninguna —se compensa contra ella sin que nadie lo note. */
export const PI_MIN_MM = 1.0;

/** Lee puntos de un CSV, y dice qué encontró.
 *
 *  La regla anterior era «de cada línea, las TRES ÚLTIMAS columnas numéricas»,
 *  y se descartaba sola la línea que no tuviera tres. Suena laxo y era
 *  deliberado: así entraba un volcado con encabezado, con columna de índice o
 *  con cualquier separador, sin pedirle a nadie que limpiara el archivo.
 *
 *  El problema es que un informe de inspección de ZEISS/GOM **no termina en las
 *  coordenadas**: lleva el nominal, o la desviación, o las dos. Con la regla de
 *  «las tres últimas» ese archivo entraba entero e importaba desviaciones de
 *  0-5 mm creyéndolas coordenadas, y una nube de desviaciones parece una barra
 *  perfecta. Nada avisaba.
 *
 *  Ahora el archivo tiene que ser COHERENTE: se mira cuántas columnas numéricas
 *  tiene la mayoría de sus líneas de datos y solo se aceptan 3 (x,y,z) o 4
 *  (índice o nombre + x,y,z). Con más, no se adivina: se rechaza y se dice por
 *  qué. Las líneas que no encajan con la mayoría se cuentan aparte, porque una
 *  sola línea corrupta desplazaba las columnas del resto en silencio.
 *
 *  Sigue sin adivinar el separador decimal, pero ahora lo DETECTA y lo dice.
 *
 *  NOTA: `read_points_csv()` del motor de Python es el gemelo de esta función y
 *  todavía tiene la regla vieja. Hay que llevarle el mismo cambio.
 */
export function parsePointsCsv(txt: string): CsvParse {
  const lines = String(txt).split(/\r?\n/);
  const numsOf = (line: string): number[] => line.trim().split(/[,;\t ]+/)
    .filter(t => t !== '' && isFinite(Number(t)))
    .map(Number);

  /* Solo las líneas con tres números o más pueden ser puntos; el encabezado y
     las de unidades caen aquí sin hacer ruido, como siempre. */
  const datos = lines.map(numsOf).filter(n => n.length >= 3);
  if (!datos.length) return { pts: [], reason: 'empty', cols: 0, skipped: 0, near: [] };

  /* Cuántas columnas tiene la MAYORÍA. La moda, no el máximo: una línea
     corrupta no debe decidir cómo se lee el archivo entero. */
  const cuenta = new Map<number, number>();
  for (const n of datos) cuenta.set(n.length, (cuenta.get(n.length) || 0) + 1);
  let cols = 0, mejor = -1;
  for (const [c, k] of cuenta) if (k > mejor || (k === mejor && c < cols)) { cols = c; mejor = k; }

  if (cols > 4) {
    /* Un `1,5;2,5;3,5` europeo se parte en seis números y cae justo aquí. Vale
       la pena distinguirlo, porque la causa y el arreglo son otros. */
    const coma = lines.some(l => /\d[,]\d/.test(l) && /[;\t]/.test(l));
    return { pts: [], reason: coma ? 'decimalComma' : 'tooManyColumns',
             cols, skipped: datos.length, near: [] };
  }

  const pts: Vector3[] = [];
  let skipped = 0;
  for (const n of datos) {
    /* Una línea con otro número de columnas no se recorta por la derecha: se
       descarta y se cuenta. Recortarla era lo que desplazaba las coordenadas
       cuando una columna traía `NaN` o venía vacía. */
    if (n.length !== cols) { skipped++; continue; }
    const xyz = n.slice(-3);
    pts.push(new Vector3(xyz[0], xyz[1], xyz[2]));
  }
  /* Dos PI pegados dan una dirección de puro ruido y de ahí un doblez que no
     existe. Se mira aquí, en la frontera, y no dentro de ik(): editar un punto
     a mano puede pasar por un estado intermedio raro, pero un ARCHIVO con dos
     PI a décimas de milímetro está mal extraído y no hay nada que salvar. */
  const near: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].distanceTo(pts[i - 1]) < PI_MIN_MM) near.push(i);
  }
  if (near.length) return { pts: [], reason: 'coincident', cols, skipped, near };

  return { pts, reason: pts.length ? 'ok' : 'empty', cols, skipped, near };
}

/** Solo los puntos. Se mantiene porque es lo que consumen los sitios a los que
 *  no les toca decidir qué hacer con un archivo malo. */
export const readPointsCsv = (txt: string): Vector3[] => parsePointsCsv(txt).pts;

export const writePointsCsv = (pts: Vector3[]): string =>
  'idx,x,y,z\n' + pts.map((p, i) =>
    `${i},${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`).join('\n');
