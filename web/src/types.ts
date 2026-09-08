/**
 * Tipos compartidos de BARCOMP.
 *
 * Este archivo no genera ni una línea de código: son puros `type`, así que
 * Node los borra al importarlos y esbuild no emite nada por ellos. Existe para
 * que mover una función de un archivo a otro no pueda cambiarle la firma sin
 * que `tsc --noEmit` se queje.
 *
 * Unidades, siempre: milímetros y GRADOS. Los radianes viven solo dentro de
 * las funciones del motor, nunca en estas estructuras ni en el JSON.
 */

/* ------------------------------------------------------------------ modelo */

/** Un doblez: una estación de la máquina. Ver README, «convención LRA». */
export type Bend = {
  /** avance de un PI al siguiente, mm. `bends[0].feed` es la recta de entrada */
  feed: number;
  /** rodado: inclina el EJE del arco, °. No rueda la barra y no se acumula */
  rot: number;
  /** el doblez entero, en el plano que eligió `rot`, °. Nunca negativo tras ik() */
  angle: number;
  /** radio del herramental, mm */
  radius: number;
  /** torsión total aplicada tras el doblez, °. Lo ÚNICO que rueda la barra */
  twist: number;
  /** tramo recto sobre el que se reparte esa torsión, mm. 0 = toda la recta */
  twistLen: number;
};

/** Clave de doblez que admite un Δ pendiente. */
export type DeltaKey = keyof Bend;

/** Columna de correcciones de una fila: base + delta = valor efectivo. */
export type Delta = Record<DeltaKey, number>;

/** Sección rectangular de la barra, mm. */
export type Section = {
  width: number;
  thickness: number;
  chamfer: number;
  /** longitud del tocho de extremo que se dibuja en los cabos */
  endLen: number;
};

/** Tolerancias de aceptación. Ángulos en °, longitudes en mm. */
export type Tol = {
  angle: number;
  rot: number;
  feed: number;
  point: number;
};

/**
 * Un modelo de pieza. `normalizeModel()` conserva las claves que no conoce,
 * de ahí el índice: un archivo de una versión futura no pierde datos al pasar
 * por aquí.
 */
export type Model = {
  name: string;
  section: Section;
  tol: Tol;
  /** recta de salida después del último doblez, mm */
  tail: number;
  bends: Bend[];
  [extra: string]: unknown;
};

/* --------------------------------------------------------------- variantes */

/**
 * Un modelo comparable. La cinemática NUNCA ve esto: ve `effectiveModel(v)`,
 * que es base + deltas.
 */
export type Variant = {
  /** cadena, siempre: 'v1', 'v2'... Se compara con === */
  id: string;
  name: string;
  /** color de la variante en la escena y en la leyenda, '#RRGGBB' */
  color: string;
  visible: boolean;
  base: Model;
  /** una columna de Δ por doblez; `syncDeltas()` la mantiene del mismo largo */
  deltas: Delta[];
  tailDelta: number;
};

/* ------------------------------------------------------------- cinemática */

/**
 * Componente dominante de un doblez. `'W'` = de canto (contra el ancho),
 * `'T'` = de plano (contra el espesor). Solo etiqueta la tabla y elige la
 * ganancia; no se acumula nada.
 */
export type Orientation = 'W' | 'T';

/** Extremo que queda fijo al comparar variantes entre sí. */
export type AnchorMode = 'start' | 'end' | 'best';

/** Alineación de una pieza MEDIDA contra su nominal. Distinto de AnchorMode. */
export type DatumMode = 'start' | 'best';

/** Longitudes de una fila de la tabla, mm. La cuenta vive en `rowLengths()`. */
export type RowLength = {
  /** el tramo recto que precede al doblez, de tangencia a tangencia */
  straight: number;
  /** el material que sale curvo: radius · θ */
  arc: number;
  /** longitud desarrollada acumulada hasta el final de este arco */
  cum: number;
};

/** Una muestra de la trayectoria del eje neutro. */
export type PathSample = {
  /** posición en el espacio */
  p: import('three').Vector3;
  /** eje de la barra */
  x: import('three').Vector3;
  /** dirección del espesor */
  y: import('three').Vector3;
  /** dirección del ancho */
  z: import('three').Vector3;
  /** longitud desarrollada en esta muestra, mm */
  s: number;
};

/* ------------------------------------------------------ proceso y corrección */

/** Parámetros de la PIEZA VIRTUAL. Se van cuando lleguen datos reales de GOM. */
export type Proc = {
  /** recuperación elástica doblando de canto, % */
  sbW: number;
  /** recuperación elástica doblando de plano, % */
  sbT: number;
  /** deslizamiento del avance, % */
  slip: number;
  /** sesgo sistemático del eje C, ° */
  biasRot: number;
  noiseA: number;
  noiseF: number;
  noiseR: number;
  seed: number;
};

/** Ajustes del lazo: nuevo = actual + ganancia × (nominal − medido). */
export type Comp = {
  /** Consumir la MEDIANA de las piezas medidas visibles en vez de la activa.
   *  Opcional: los archivos anteriores no la traen y siguen abriendo con el
   *  comportamiento de siempre, que es compensar contra una sola pieza. */
  batch?: boolean;
  gainW: number;
  gainT: number;
  doAngle: boolean;
  doRot: boolean;
  doFeed: boolean;
  /** Ganancias propias del rodado y del avance. Antes el rodado se corregía
   *  entero (ganancia 1.0, justo lo que se prohíbe para el ángulo) y el avance
   *  usaba `gainW`/`gainT`, que son constantes de recuperación elástica y no
   *  tienen nada que ver con el deslizamiento. Opcionales: un archivo anterior
   *  abre con los valores por defecto. */
  gainR?: number;
  gainF?: number;
  /** BANDA MUERTA, en grados y mm. Por debajo de esto la diferencia contra el
   *  nominal es ruido de medición, y corregirla es perseguirlo. 0 = apagada. */
  dead?: number;
  deadFeed?: number;
  /** Tope de corrección por ciclo, en grados y mm. Un salto mayor que esto no
   *  es una desviación de proceso: es un dato malo o un doblez que cruzó de
   *  rama. Se recorta y se sigue, en vez de mandarlo a la máquina. 0 = sin
   *  tope. */
  maxStep?: number;
  maxStepFeed?: number;
};

/** Lo que devuelve `deviations()`: una pieza medida contra su nominal. */
export type Deviations = {
  /** los PI de la medida, ya alineados según el datum */
  pis: import('three').Vector3[];
  /** distancia PI a PI, mm */
  point: number[];
  angle: number[];
  rot: number[];
  feed: number[];
  /** desviación del DESVÍO TOTAL del doblez, °. El número honesto */
  theta: number[];
  rms: number;
  maxA: number;
  /** desviación del extremo libre, mm */
  tip: number;
  /** cuántos dobleces tienen alguna componente fuera de tolerancia */
  out: number;
};

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
  pis: import('three').Vector3[];
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

/** El resorte estimado de una orientación: la muestra resumida, más la recta
 *  que dice si depende del ángulo comandado. `slope` en %/° y `r` la
 *  correlación: con |r| alto, una constante única no describe el proceso. */
export type SbFit = { stat: Stat; slope: number; r: number };

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
  /** piezas medidas: solo lo que hace falta para reconstruirlas, sin `dev` */
  datasets: { name: string; color: string; src: string; bends: Bend[]; tail: number;
              cmd?: Bend[] }[];
  ref?: string | null;
  anchor?: AnchorMode;
  variants?: Variant[];
  place?: Place;
  /** sin `id`: se reasigna al abrir, ver fromDoc() */
  marks?: { name: string; color: string; visible: boolean; x: number; y: number; z: number }[];
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
  datasets: { name: string; color: string; src: string; bends: Bend[]; tail: number;
              cmd?: Bend[] }[];
  anchor: AnchorMode;
  variants: Variant[];
  ref: string | null;
  place: Place;
  marks: Mark[];
  tweak: Tweak[];
  /** null = el archivo no dijo nada: no se pisa la preferencia actual */
  ui: { theme: string | null; lang: string | null; mode: string | null } | null;
};

/* ------------------------------------------------------------ estado global */

/** Una entrada de la paleta de capas: si está prendida y de qué color se dibuja. */
export type LayerState = {
  on: boolean;
  color: string;
};

/**
 * El estado entero de la aplicación — `ST` en `state.ts`. Vive todo en un solo
 * objeto mutable; nada de localStorage ni sessionStorage.
 *
 * `model` es SOLO una caché del modelo efectivo (base + deltas) de la variante
 * activa: todo el código que dibuja y mide lee de ahí, y hay que llamar
 * `syncModel()` tras tocar una variante o la caché miente. `active`, `ref` y
 * `dsActive` son ids de CADENA ('v1', 'ds1'...), nunca índices: se comparan
 * con `===`. `sel` es el doblez seleccionado en la tabla; `-1` cuando no hay
 * ninguno.
 */
export type State = {
  /** modelos comparables cargados */
  variants: Variant[];
  /** id de la variante que se edita */
  active: string | null;
  /** id de la variante contra la que se ancla y se mide */
  ref: string | null;
  /** extremo fijo al comparar variantes entre sí */
  anchor: AnchorMode;
  /** caché del modelo efectivo (base + deltas) de la variante activa */
  model: Model | null;
  /** comando de máquina: lo que calcula el lazo, sin el ajuste manual (`tweak`) */
  command: Bend[];
  /** piezas medidas */
  datasets: Dataset[];
  /** id del dataset activo */
  dsActive: string | null;
  /** doblez seleccionado en la tabla de comandos; -1 si no hay ninguno */
  sel: number;
  comp: Comp;
  proc: Proc;
  /** una entrada por capa dibujable, indexada por su clave ('nom', 'meas'...) */
  layers: Record<string, LayerState>;
  view: { exag: number; cmode: 'solid' | 'dev' };
  /** alineación de la pieza MEDIDA contra su nominal */
  datum: DatumMode;
  /** pestaña activa del panel derecho ('model' | 'points' | 'comp', ver TABS) */
  /** el trabajo que se está haciendo: manda sobre TODA la distribución */
  mode: Mode;
  /** el 3D a pantalla completa: se pliega lo demás sin perder el modo ni el
   *  sitio en la tabla. Estado de pantalla, no del documento. */
  solo: boolean;
  /** cajón abierto ('file', 'models', 'view', 'pieces') o null.
   *  Es estado de pantalla, no del documento: no viaja en el JSON ni entra en
   *  el deshacer, igual que la selección o la cámara. */
  drawer: string | null;
  /** sub-pestaña dentro de Modelar: 'model' (la tabla LRA) o 'points' */
  tab: string;
  /** predicción de la 2.ª pieza tras aplicar la compensación; null si no se corrió */
  pred: Model | null;
  /** 'system' | 'light' | 'dark'. Sin localStorage: viaja en el JSON */
  theme: 'system' | 'light' | 'dark';
  /** colocación: dónde y en qué ángulo se para la pieza. Solo presentación */
  place: Place;
  /** puntos de referencia sueltos: cotas contra el fixture o un datum */
  marks: Mark[];
  /** ajuste manual sobre lo que calcula el lazo, por doblez */
  tweak: Tweak[];
};
