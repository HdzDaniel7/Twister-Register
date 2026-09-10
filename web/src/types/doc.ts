/**
 * EL DOCUMENTO — lo que se guarda en el .json y lo que sale al leerlo, mas lo
 * que cuelga de el: colocacion, cotas sueltas, piezas medidas, estadistica del
 * resorte, ajuste manual y preferencias de pantalla.
 *
 * Unidades, siempre: milimetros y GRADOS. Los radianes viven solo dentro de
 * las funciones del motor, nunca en estas estructuras ni en el JSON.
 */
import type { Vector3 } from 'three';
import type { Bend, Model, Variant, AnchorMode } from './model.ts';
import type { Comp, Lims, Mat, Proc, Restraint, Deviations } from './process.ts';
import type { MachineFmt } from '../engine/machine.ts';

/* -------------------------------------------------------------- documento */

/** Colocación en el espacio. SOLO presentación: no toca ningún parámetro. */
export type Place = {
  /** índice del PI que hace de origen del giro */
  pivot: number;
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
};

/** Cota suelta: se une con el PI más cercano del modelo activo. */
export type Mark = {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  x: number;
  y: number;
  z: number;
};

/** Un pedestal del fixture: dónde se para en la mesa, cuánto sube y con qué
 *  inclinación tiene la cuna.
 *
 *  Se guarda SOLO lo que alguien mide con un flexómetro en el taller. Dónde
 *  toca la barra, qué hueco queda y qué inclinación pide la pieza son cosas
 *  derivadas —salen de `pedestalFit()` cada vez que se repinta— y guardarlas
 *  sería guardar una copia que envejece en cuanto se toca un doblez. */
export type Pedestal = {
  id: string;
  name: string;
  visible: boolean;
  /** posición del pie sobre la mesa, mm */
  x: number;
  y: number;
  /** alto desde la mesa (z = TABLE_Z) hasta la cuna, mm */
  h: number;
  /** inclinación de la cuna, °. Positiva si sube en el sentido de la barra */
  tilt: number;
  /** largo de la cuna a lo largo de la barra, mm. Un pedestal no apoya en un
   *  punto: apoya en un tramo, y ese tramo es lo que decide si la barra pisa
   *  el pedestal o pasa de largo por al lado */
  pad: number;
};

/** Un PIN LATERAL: un poste vertical atornillado a la mesa contra el que la
 *  barra tiene que tocar de lado.
 *
 *  A diferencia de un pedestal, que solo sostiene, un pin IMPIDE que la barra se
 *  vaya a donde la mandaría la cinemática: mientras esté puesto, cambiar un
 *  ángulo deforma la barra en vez de moverla libremente. Ver engine/pins.ts. */
export type Pin = {
  id: string;
  name: string;
  /** ¿se dibuja? Igual que en un pedestal, es cosa de la vista */
  visible: boolean;
  /** ¿SUJETA? Un pin puede estar montado y no tocar esta pieza; y se puede
   *  querer ver qué pasa sin él sin tener que borrarlo de la lista */
  hold: boolean;
  /** posición del eje del pin sobre la mesa, mm */
  x: number;
  y: number;
  /** alto desde la mesa (z = TABLE_Z), mm. Uno que no llegue a la barra no
   *  sujeta nada, y la tabla lo dice */
  h: number;
  /** diámetro del pin, mm: la barra toca su superficie, no su eje */
  dia: number;
  /** De qué LADO de la barra está montado: +1 o −1 sobre la normal en planta,
   *  y `0` = «decídelo por la geometría».
   *
   *  Es dato del fixture y no una lectura, y ahí está el motivo de que exista.
   *  Leerlo de la forma de cada momento funciona mientras la barra esté cerca
   *  del pin, pero en cuanto un ángulo la manda MÁS ALLÁ del eje del poste, la
   *  lectura sale invertida y el solver cierra el contacto por la cara
   *  equivocada: o sea, resuelve una pieza que atravesó el pin. Lo cazó el
   *  banco del amarre con un ángulo movido 3°. Guardado, el lado es el que
   *  alguien montó y no cambia porque la pieza se deforme. */
  side: number;
};

/** Una pieza medida. `model` son sus parámetros; `dev`, su comparación. */
export type Dataset = {
  /** cadena, siempre: 'ds1', 'ds2'... */
  id: string;
  name: string;
  color: string;
  visible: boolean;
  /** de dónde salió la pieza: 'sim', 'verify' o lo que dijera el archivo.
   *  Viaja en el JSON (ver Doc.datasets) y hoy nadie lo enseña; es lo único
   *  que distingue una pieza inventada por simulate() de una medida. */
  src: string;
  model: Model;
  pis: Vector3[];
  /** opcional a propósito: addDataset() crea la pieza sin `dev` y computeDev()
   *  la rellena en la línea siguiente. Todo lo que la lee después usa `dev!`. */
  dev?: Deviations | null;
  /** EL COMANDO CON EL QUE SE FABRICÓ esta pieza, copiado al darla de alta.
   *
   *  Sin esto no se puede estimar el resorte: `sb = 1 − medido/comandado`, y el
   *  comando de ahora ya no es el de entonces en cuanto se aplica una
   *  compensación. Opcional: los archivos anteriores no lo traen y ahí solo
   *  queda suponer el comando actual. */
  cmd?: Bend[];
};

/** Por qué se puede o no creer la recta de tendencia del resorte.
 *
 *  `'few'`   faltan piezas: con pocas, |r| alto es ruido y no dependencia.
 *  `'flat'`  todas se doblaron casi al mismo ángulo, o hay un solo punto
 *            lejos arrastrando la recta él solo. Sin dos niveles de ángulo
 *            poblados, la pendiente no se puede medir por definición.
 *  `'ok'`    hay con qué: la pendiente y r significan algo. */
export type SbTrend = 'ok' | 'few' | 'flat';

/** El resorte estimado de una orientación: la muestra resumida, más la recta
 *  que dice si depende del ángulo comandado. `slope` en %/° y `r` la
 *  correlación: con |r| alto, una constante única no describe el proceso.
 *
 *  `trend` es la puerta: `slope` y `r` SIEMPRE vienen calculados, pero solo
 *  se pueden creer con `trend === 'ok'`. Se separan a propósito en vez de
 *  poner ceros — así la pantalla puede decir qué FALTA para poder creerlos,
 *  que es lo accionable, en vez de callarse. */
export type SbFit = { stat: Stat; slope: number; r: number; trend: SbTrend };

/** El resorte medido, separado por orientación: de canto (W) y de plano (T)
 *  tienen constantes elásticas distintas y no se pueden mezclar. */
export type Springback = { W: SbFit; T: SbFit };

/** Resumen robusto de una muestra: mediana, MAD y el MAD escalado a sigma.
 *  Mediana y MAD porque un PI mal extraído produce un doblez absurdo y una
 *  media se lo traga entero. */
export type Stat = { med: number; mad: number; sigma: number; n: number };

/** Lo que dispersan varias piezas medidas en un mismo doblez. `n` es cuántas
 *  piezas llegaron a tener ese doblez: una pieza escaneada puede traer menos. */
export type BendStat = { angle: Stat; rot: Stat; feed: Stat; n: number };

/** Ajuste manual de la compensación, por doblez. Se guarda la DIFERENCIA. */
export type Tweak = {
  angle: number;
  rot: number;
  feed: number;
};

/** Tema e idioma. Sin localStorage, viajan en el JSON. */
export type UiPrefs = {
  theme: 'system' | 'light' | 'dark';
  lang: 'es' | 'en' | 'de';
  /** modo de trabajo; opcional, un archivo sin él abre en Modelar */
  mode?: Mode;
};

/** Los tres trabajos del programa. No son pestañas de una tabla: cada uno se
 *  queda la pantalla entera y deja de solo lectura lo que no le toca.
 *
 *  `comp` es además el modo taller: al no haber en pantalla nada que no sea
 *  compensación, no hace falta un interruptor de bloqueo aparte. */
export type Mode = 'model' | 'meas' | 'comp';

/**
 * Documento del esquema `barcomp/2.3`, tal como lo escribe `toDoc()`. Las
 * claves marcadas opcionales son las que el README declara opcionales:
 * `variants`, `ref`, `anchor`, `place`, `marks`, `tweak` y `ui`. Los archivos
 * guardados con versiones anteriores siguen abriendo sin ellas — es
 * `fromDoc()` quien decide el valor por defecto de cada una.
 *
 * `Recta`, `L` y `Σ L` no viven aquí: son derivadas de `feed`, `radius` y los
 * ángulos, y no se guardan.
 */
export type Doc = {
  schema: string;
  saved: string;
  model: Model;
  /** lo que se manda a la máquina */
  command: Bend[];
  comp: Comp;
  proc: Proc;
  /** los umbrales con los que se juzgó esta pieza. Clave opcional: un archivo
   *  sin ella abre con los de fábrica, o sea con el comportamiento que ese
   *  archivo tenía cuando se guardó. Ver engine/lims.ts */
  lims?: Lims;
  /** el perfil con el que se exporta el comando de máquina. Clave opcional:
   *  un archivo sin ella abre con el perfil de fábrica. Ver engine/machine.ts */
  mach?: MachineFmt;
  /** piezas medidas: solo lo que hace falta para reconstruirlas, sin `dev` */
  datasets: { name: string; color: string; src: string; bends: Bend[]; tail: number;
              cmd?: Bend[] }[];
  ref?: string | null;
  anchor?: AnchorMode;
  variants?: Variant[];
  place?: Place;
  /** sin `id`: se reasigna al abrir, ver fromDoc() */
  marks?: { name: string; color: string; visible: boolean; x: number; y: number; z: number }[];
  /** el fixture. Sin `id`: se reasigna al abrir, igual que en `marks` */
  fixture?: Omit<Pedestal, 'id'>[];
  /** los pines laterales. Sin `id`, por lo mismo */
  pins?: Omit<Pin, 'id'>[];
  /** el amarre: si la barra se considera sujeta y con qué ajustes */
  restraint?: Restraint;
  /** el material, para pasar de deformación a esfuerzo */
  mat?: Mat;
  tweak?: Tweak[];
  ui?: UiPrefs;
};

/**
 * Lo que devuelve `fromDoc()`: el documento ya normalizado a la convención
 * vigente (esquema 2.1), listo para volcarse en el estado de la aplicación.
 */
export type LoadedDoc = {
  model: Model;
  /** el comando de máquina, ya convertido si el archivo era de un esquema anterior */
  command: Bend[];
  /** true si el archivo venía de una cinemática anterior y se CONVIRTIÓ */
  legacy: boolean;
  /** true si el archivo es `barcomp/2.2`: se lee tal cual, sin tocar un número,
   *  pero pudo escribirse antes o después de que `ANG_DIR`/`ROT_DIR` pasaran a
   *  −1, así que la pieza puede salir doblada al otro lado. No se convierte —
   *  ver SCHEMA_AMBIGUOUS en engine/doc.ts— pero hay que avisarlo. */
  ambiguous: boolean;
  comp: Comp;
  proc: Proc;
  /** completos y dentro de rango, venga lo que venga del archivo */
  lims: Lims;
  /** el perfil de exportación, saneado */
  mach: MachineFmt;
  datasets: { name: string; color: string; src: string; bends: Bend[]; tail: number;
              cmd?: Bend[] }[];
  anchor: AnchorMode;
  variants: Variant[];
  ref: string | null;
  place: Place;
  marks: Mark[];
  fixture: Pedestal[];
  pins: Pin[];
  restraint: Restraint;
  mat: Mat;
  tweak: Tweak[];
  /** null = el archivo no dijo nada: no se pisa la preferencia actual */
  ui: { theme: string | null; lang: string | null; mode: string | null } | null;
};
