/* =========================================================================
   ESQUEMA Y DOCUMENTO — el esquema `barcomp/2.1`, la lectura/escritura del
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

export const SCHEMA = 'barcomp/2.1';
/** Esquemas anteriores, cada uno con su cinemática. Se convierten al abrirlos.
 *  · 1.0  `rot` era un doblez de canto y `angle` tenía el signo contrario
 *  · 2.0  `rot` rodaba la barra de verdad y la sección salía girada */
export const SCHEMA_LEGACY: string[] = ['barcomp/1.0', 'barcomp/2.0'];

/* ---------------------------------------------------------------------- E/S */
/** Una pieza medida, tal como la ve `toDoc()`: solo lo que hace falta para
 *  reconstruirla — `pis`/`dev` no se guardan, se recalculan al abrir. */
type ToDocDataset = { name: string; color: string; src?: string; model: Model };
/** Lo demás que lleva el documento: presentación y preferencias, nada de
 *  cinemática. Todo opcional porque toDoc() rellena cualquier falta. */
type ToDocExtra = {
  place?: Partial<Place>;
  marks?: Mark[];
  tweak?: Tweak[];
  ui?: { theme?: UiPrefs['theme']; lang?: UiPrefs['lang'] };
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
    T = schema === 'barcomp/2.0'
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

/** ¿El documento viene con una convención anterior? */
export const isLegacyDoc = (d: Doc | null | undefined): boolean => !!d && d.schema !== SCHEMA;

/** Normaliza un documento leído de JSON. Gemelo de load_json() de core.py. */
export function fromDoc(d: Doc): LoadedDoc {
  /* Un archivo anterior a barcomp/2.0 describe la misma pieza con otra
     convención: se convierte antes de tocar nada, o se abriría con la forma
     equivocada y en silencio. Quien llama se entera por `legacy`. */
  const legacy = isLegacyDoc(d);
  /* un archivo sin `schema` es de los primeros: 1.0 */
  const from = (d && d.schema) || 'barcomp/1.0';
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
    comp: { ...COMP_DEFAULT, ...(d.comp || {}) },
    proc: { ...PROC_DEFAULT, ...(d.proc || {}) },
    datasets: (d.datasets || []).map(x => (legacy
      ? { ...x, bends: migrateModel({ ...d.model, bends: x.bends || [], tail: x.tail ?? d.model.tail }, from).bends }
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
    ui: d.ui ? { theme: d.ui.theme || null, lang: d.ui.lang || null } : null,
  };
}

export const writePointsCsv = (pts: Vector3[]): string =>
  'idx,x,y,z\n' + pts.map((p, i) =>
    `${i},${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`).join('\n');
