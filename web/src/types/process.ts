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
