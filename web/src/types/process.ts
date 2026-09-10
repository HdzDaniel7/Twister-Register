/**
 * EL PROCESO Y EL LAZO — lo que la maquina hace de mas o de menos (`Proc`), lo
 * que el lazo corrige y con que ganancias (`Comp`), y en que se aparta una
 * pieza medida de su nominal (`Deviations`).
 *
 * Unidades, siempre: milimetros y GRADOS. Los radianes viven solo dentro de
 * las funciones del motor, nunca en estas estructuras ni en el JSON.
 */
import type { Vector3 } from 'three';

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

/** LOS UMBRALES QUE JUZGAN. Ver `engine/lims.ts`: qué significa cada uno, de
 *  qué respuesta depende y entre qué valores se admite.
 *
 *  Van en el documento y no en el código para que el taller los ajuste cuando
 *  se mida σ, y para que un archivo guardado diga con qué umbrales se juzgó esa
 *  pieza. Ninguno toca la cinemática: deciden qué se rechaza y de qué dato se
 *  desconfía, no dónde cae un PI. */
export type Lims = {
  /** desvío mínimo (°) para creerle el eje a un doblez MEDIDO; 0 = creerle siempre */
  axisMin: number;
  /** distancia mínima (mm) entre dos PI de un archivo importado; 0 = no mirar */
  piMin: number;
  /** fracción mínima del paso nominal para aceptar la escala de una nube; 0 = no mirar */
  scaleMin: number;
  /** recta mínima (mm) entre tangencias para que quepan los herramentales */
  straightMin: number;
};

/** EL MATERIAL de la barra. Solo hace falta para pasar de deformación a
 *  ESFUERZO: la forma que toma una barra sujeta no depende de E (ver la
 *  cabecera de engine/pins.ts). PROVISIONAL hasta que llegue el certificado. */
export type Mat = {
  /** módulo elástico, MPa */
  E: number;
  /** límite elástico, MPa. Pasarlo significa que la pieza no vuelve al soltarla */
  yield: number;
  /** densidad, kg/m³. Solo la usa la flecha por gravedad: el peso propio de la
   *  barra. Opcional — un archivo anterior abre sin ella y la flecha dice que
   *  falta el dato en vez de inventarse un número. */
  rho?: number;
};

/** EL AMARRE: qué se hace con los pines laterales. Ver engine/pins.ts. */
export type Restraint = {
  /** ¿la barra está sujeta? Apagado, el programa se comporta exactamente como
   *  si los pines no existieran, y hay una prueba de que los PI son idénticos */
  on: boolean;
  /** ¿el rodado también cede, o solo el ángulo? */
  doRot: boolean;
  /** tolerancia de contacto, mm */
  tol: number;
  /** amortiguación del reparto entre estaciones: 0 lo concentra, 1 lo reparte */
  damp: number;
  /** iteraciones del solver */
  iters: number;
  /** ¿la REFERENCIA se compara sujeta o libre?
   *
   *  Comparar dos modelos pide decidir contra qué se comparan, y con el amarre
   *  puesto hay dos respuestas distintas y las dos son legítimas: contra la
   *  forma que el otro modelo tendría LIBRE —el diseño— o contra la que de
   *  verdad toma MONTADO en el fixture. La primera dice en qué se diferencian
   *  los diseños; la segunda, en qué se diferencian las piezas que van a salir.
   *
   *  Opcional y `false` por defecto: un archivo anterior compara contra la libre,
   *  que es como se comportaba cuando se guardó. */
  refHeld?: boolean;
};

/** Lo que devuelve `deviations()`: una pieza medida contra su nominal. */
export type Deviations = {
  /** los PI de la medida, ya alineados según el datum */
  pis: Vector3[];
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
