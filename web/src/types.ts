/**
 * Tipos compartidos de BARCOMP — barril.
 *
 * Este archivo no genera ni una linea de codigo: son puros `type`, asi que
 * Node los borra al importarlos y esbuild no emite nada por ellos. Existe para
 * que mover una funcion de un archivo a otro no pueda cambiarle la firma sin
 * que `tsc --noEmit` se queje.
 *
 * Unidades, siempre: milimetros y GRADOS. Los radianes viven solo dentro de
 * las funciones del motor, nunca en estas estructuras ni en el JSON.
 *
 * Estaba en 411 lineas, sobre el limite de 400. Partido por DOMINIO, que es
 * como ya estaba separado por comentarios de seccion, y en un orden que no
 * admite ciclos: la pieza no sabe del proceso, el proceso no sabe del
 * documento, y el estado los conoce a los tres. Quien importa `./types.ts` no
 * nota el reparto.
 */
export type * from './types/model.ts';
export type * from './types/process.ts';
export type * from './types/doc.ts';
export type * from './types/state.ts';
