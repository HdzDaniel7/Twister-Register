/* =========================================================================
   LA FIBRA NEUTRA — cuánta BARRA se gasta, que no es lo mismo que cuánto
   CAMINO recorre el eje de la pieza.

   POR QUÉ ESTE ARCHIVO EXISTE, y conviene leerlo antes de mover nada aquí:
   hasta el 2026-09-22 `rowLengths()` servía a dos amos con un solo número.

     · **La geometría.** El eje que se dibuja, la abscisa de cada muestra, la
       cinta de abajo, los pedestales, las marcas y los tramos del STEP. Todo
       eso vive sobre el CENTRO de la sección, porque es donde pasa la curva
       que el herramental produce: `radius` es el radio del centro (CLR), que
       es como se miden las matrices. Eso NO se toca y sigue en
       `kinematics.ts`.

     · **El material.** Cuánta barra recta hay que cortar para que salga esa
       pieza. Eso NO se mide sobre el centro: al doblar, la cara de fuera se
       estira y la de dentro se recalca, y la fibra que ni se estira ni se
       recalca —la NEUTRA— se corre HACIA DENTRO del doblez. Cortar por el
       centro es cortar de más.

   Cuánto de más, medido sobre DEMO-1700 (15 dobleces, pletina 40×12, radios
   30 de plano y 45 de canto):

       centro (lo de hoy)        1861.867 mm
       fibra con K = 0.45        1849.894      −11.97
       fibra con K = 0.40        1837.921      −23.95
       fibra por DIN 6935        1825.431      −36.44      (−1.96 %)

   36 mm de barra por pieza. Cuarenta veces el desajuste de la columna que se
   corrigió el mismo día.

   LA CUENTA, y dónde vive lo que no sabemos:

       R_fibra(i) = R_int(i) + K·t_ef(i) = radius(i) − (0.5 − K)·t_ef(i)
       arco(i)    = R_fibra(i) · θ(i)

   `t_ef` es lo que mide la sección EN EL PLANO en que se dobla: de plano manda
   el espesor y de canto el ancho. En el demo eso no es un matiz — las cuatro
   estaciones de canto aportan 29 de los 36 mm.

   `K` es el factor de fibra neutra, y ahí está TODO lo que este archivo no
   sabe. Con K = 0.5 la fibra está en el centro y sale exactamente lo de
   siempre, que es por lo que ese es el valor de partida: ningún archivo
   existente cambia un número hasta que alguien lo decida.

   LO QUE NO SE TOCA DESDE AQUÍ, y por qué no es una omisión:

     · **el `trim`**, que es la tangente del centro y por tanto geometría del
       herramental: dónde empieza el arco no depende de por dónde pase la fibra;
     · **las RECTAS**, que son las mismas en las dos cuentas — sin doblez no hay
       estiramiento y la fibra neutra ES el centro;
     · **ni un PI**. `fk()`, `ik()` y `compensate()` no se enteran de que este
       archivo existe. La fibra cuenta barra, no coloca puntos.

   Y una honestidad que tiene que ir escrita, no supuesta: la longitud de corte
   NO es la longitud de una curva. Es conservación de material. La fórmula de
   la fibra neutra es el ajuste empírico con el que la industria la aproxima, y
   `K` es la casilla donde entra lo que se mida en el taller. Ver
   `.auditoria/solicitud-datos.md`.
   ========================================================================= */
import type { Model, RowLength } from '../types.ts';
import { rowLengths, tailStraight } from './kinematics.ts';

/** Radio de la FIBRA NEUTRA del doblez `i`, mm.
 *
 *  Hoy devuelve el radio del centro tal cual: K = 0.5 clavado, que es lo que
 *  este programa ha venido haciendo desde el principio sin decirlo. La K de
 *  verdad —fija o por DIN 6935, según lo que guarde la sección— entra en la
 *  fase siguiente, y entra AQUÍ: este es el único sitio donde el radio del
 *  centro se convierte en el de la fibra. */
export const fibreRadius = (model: Model, i: number): number =>
  (model.bends[i] ? (model.bends[i].radius || 0) : 0);

/** Las longitudes de la tabla contadas en BARRA: la recta que precede a cada
 *  doblez, el arco de material que ese doblez consume, y el acumulado.
 *
 *  Misma forma que `rowLengths()` y a propósito: `straight` es el MISMO número
 *  en las dos —la fibra y el centro coinciden en los tramos rectos— así que
 *  quien pinta la tabla cambia de función y no de lógica. Lo que se separa es
 *  quién pregunta: la geometría sigue con `rowLengths()` y el material viene
 *  aquí. */
export const fibreLengths = (model: Model): RowLength[] => rowLengths(model);

/** Longitud de CORTE: la barra recta que hay que meter en la máquina, mm.
 *
 *  Se llama distinto que `developedLength()` a propósito, porque desde el
 *  momento en que K deja de ser 0.5 son dos números distintos y la pantalla
 *  enseña los dos: esta es la de la tabla, y la otra es la abscisa de la cinta
 *  —dónde cae cada estación sobre la pieza ya doblada—, que se sigue midiendo
 *  sobre el centro porque es donde está dibujada. */
export function cutLength(model: Model): number {
  const rows = fibreLengths(model);
  /* la cola no lleva arco: es recta, y en una recta la fibra ES el centro, así
     que `tailStraight()` vale igual para las dos cuentas */
  return (rows.length ? rows[rows.length - 1].cum : 0) + tailStraight(model);
}
