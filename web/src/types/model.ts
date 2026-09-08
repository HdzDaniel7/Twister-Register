/**
 * LA PIEZA — el doblez, la seccion, las tolerancias, el modelo, las variantes
 * comparables y lo que devuelve la cinematica.
 *
 * Unidades, siempre: milimetros y GRADOS. Los radianes viven solo dentro de
 * las funciones del motor, nunca en estas estructuras ni en el JSON.
 */
import type { Vector3 } from 'three';

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
  p: Vector3;
  /** eje de la barra */
  x: Vector3;
  /** dirección del espesor */
  y: Vector3;
  /** dirección del ancho */
  z: Vector3;
  /** longitud desarrollada en esta muestra, mm */
  s: number;
};
