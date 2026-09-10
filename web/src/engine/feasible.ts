/* ------------------------------------------------------- fabricabilidad --
   Lo que la MÁQUINA no puede hacer, aunque la geometría cierre.

   `fk()` acepta encantado un modelo con rectas negativas: la cadena de
   matrices se multiplica igual y sale una trayectoria "válida" que se cruza a
   sí misma. Verificado con avance 40 y radio 60: rectas de −20 y −80 mm, cola
   de −20, y una longitud desarrollada de 68.5 mm que parece un número normal.
   Nadie avisaba. En una barra real eso son dos herramentales ocupando el mismo
   sitio.

   Vive en su propio archivo y no en kinematics.ts por dos motivos: ese archivo
   ya pasa de las 400 líneas de la regla, y esto no es cinemática —es el juicio
   sobre lo que la cinemática produjo—. La dependencia va en un solo sentido.  */
import { bendTheta, straightOf, tailStraight, BEND_MAX_DEG } from './kinematics.ts';
import { LIMS_DEFAULT } from './lims.ts';
import type { Model, Lims } from '../types.ts';

/* La recta mínima entre tangencias es `lims.straightMin`: se teclea en la
   pestaña «Límites», viaja en el JSON y lo explica engine/lims.ts. Aquí solo se
   consume.

   Una recta NEGATIVA no es cuestión de umbral: es geometría imposible pase lo
   que pase, y por eso se lista aparte y no depende de ningún número. */

export type Feasibility = {
  /** dobleces cuya recta de ENTRADA no llega al mínimo (índice base 0) */
  short: number[];
  /** de esos, los que además la tienen negativa: el herramental se cruza */
  negative: number[];
  /** dobleces que piden más desvío del que se puede doblar (ver BEND_MAX_DEG) */
  overBent: number[];
  /** la recta de SALIDA tampoco llega */
  tailShort: boolean;
  /** ¿hay algo que impida fabricar la pieza tal como está? */
  ok: boolean;
};

/** Los dobleces cuyo desvío pasa del tope físico. Vacío en cualquier modelo
 *  sano; si trae algo, `trimOf` está devolviendo el trim DEL TOPE y no el del
 *  ángulo pedido, así que los largos de esa fila están topados. */
export const overBent = (model: Model): number[] =>
  model.bends.reduce<number[]>((out, b, i) =>
    (bendTheta(b) > BEND_MAX_DEG + 1e-9 ? (out.push(i), out) : out), []);

/** Qué le impide a esta pieza salir de la máquina. Todo en índices base 0; a
 *  quien lo pinta le toca sumar uno, que es como se numeran los dobleces en la
 *  tabla y en el taller. */
export function feasibility(model: Model, lims: Lims = LIMS_DEFAULT): Feasibility {
  const short: number[] = [], negative: number[] = [];
  model.bends.forEach((_, i) => {
    const s = straightOf(model, i);
    if (s < lims.straightMin) short.push(i);
    if (s < 0) negative.push(i);
  });
  const over = overBent(model);
  const tailShort = tailStraight(model) < lims.straightMin;
  return {
    short, negative, overBent: over, tailShort,
    ok: !short.length && !over.length && !tailShort,
  };
}
