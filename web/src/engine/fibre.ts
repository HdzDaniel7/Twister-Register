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
   sabe. Sale de la sección, que guarda de dónde tomarlo:

       center   K = 0.5, la fibra en el centro. Lo de siempre, y el valor de
                partida: ningún archivo existente cambia un número al abrirse
       din      K por DIN 6935 según el r/t de CADA doblez — una pieza con
                radios distintos no tiene una sola K
       fixed    la K tecleada, la misma para toda la pieza: la casilla donde
                entra lo que se mida en el taller

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
import type { Model, RowLength, Section } from '../types.ts';
import { developedLength, straightOf, tailStraight, axisAngles, bendDecomp } from './kinematics.ts';
import { sectionDepth } from './section.ts';

/** K por DIN 6935, a partir del radio INTERIOR y del espesor doblado.
 *
 *      k = 0.65 + 0.5 ·log₁₀ (r/t),  topado en [0.65, 1]
 *      K = k / 2
 *
 *  El `k` de la norma no es el factor de fibra: la norma pone la fibra en
 *  `r + (k/2)·t`, así que K es la mitad. Las tres esquinas que conviene tener
 *  en la cabeza: r/t ≥ 5 da K = 0.5 (la fibra vuelve al centro, que es lo que
 *  pasa con radios grandes), r/t = 2 da 0.400, y por debajo de r/t = 0.65 se
 *  topa en 0.325 y ahí se queda.
 *
 *  DOS AVISOS que no se pueden borrar de aquí:
 *
 *  · la DIN 6935 es de CHAPA EN PLEGADORA, no de curvado por estirado. Sirve
 *    como primera aproximación y como algo mejor que suponer K = 0.5, no como
 *    el número de esta máquina. Para eso está `fixed` y la medición de una
 *    pieza real — ver `.auditoria/solicitud-datos.md`;
 *  · por debajo de r/t = 0.65 la norma ya no vale y esto devuelve el tope. En
 *    DEMO-1700 las cuatro estaciones de canto caen ahí (r/t = 0.63), y son
 *    justo las que aportan 29 de los 36 mm. El aviso sale en la pantalla.
 *
 *  Un r/t que no sea un número positivo —un radio menor que media sección, o
 *  sea el herramental dentro de la barra— cae al tope en vez de dar `NaN`. */
export function kDin(rInt: number, t: number): number {
  const rt = t > 0 ? rInt / t : 0;
  if (!(rt > 0)) return 0.65 / 2;
  return Math.min(1, Math.max(0.65, 0.65 + 0.5 * Math.log10(rt))) / 2;
}

/** K del doblez `i`, según lo que guarde la sección. `radius` es el del CENTRO. */
export function kOf(sec: Section, radius: number, ejeDeg: number): number {
  if (sec.kMode === 'fixed') return sec.kFactor;
  if (sec.kMode !== 'din') return 0.5;
  const t = sectionDepth(sec, ejeDeg);
  return kDin(radius - t / 2, t);
}

/** Radio de la FIBRA NEUTRA del doblez `i`, mm.
 *
 *      R_fibra = R_int + K·t = radius − (0.5 − K)·t
 *
 *  Este es el úNICO sitio donde el radio del centro se convierte en el de la
 *  fibra. Con K = 0.5 sale `radius` tal cual, exacto y sin restos.
 *
 *  El suelo en cero es para una pieza imposible —herramental más pequeño que
 *  media sección— donde la fórmula daría un arco negativo. No se avisa desde
 *  aquí: esa pieza ya sale listada por la pestaña de modelo. */
export function fibreRadius(model: Model, i: number): number {
  const b = model.bends[i];
  if (!b) return 0;
  return fibreRadiusAt(model.section, b.radius || 0, axisAngles(model)[i]);
}

const fibreRadiusAt = (sec: Section, radius: number, ejeDeg: number): number =>
  Math.max(0, radius - (0.5 - kOf(sec, radius, ejeDeg)) * sectionDepth(sec, ejeDeg));

/** Lo que la fibra hace en cada fila, para la pantalla: el K que salió, el r/t
 *  con el que se calculó y cuánto mide la sección en ese plano. `rt` sale
 *  siempre, también en `center` y en `fixed`: es lo que deja ver que una fila
 *  está fuera del rango donde la DIN vale. */
export function fibreInfo(model: Model): { k: number; rt: number; depth: number }[] {
  const ejes = axisAngles(model), sec = model.section;
  return model.bends.map((b, i) => {
    const depth = sectionDepth(sec, ejes[i]);
    return {
      k: kOf(sec, b.radius || 0, ejes[i]),
      rt: depth > 0 ? ((b.radius || 0) - depth / 2) / depth : 0,
      depth,
    };
  });
}

/** Las longitudes de la tabla contadas en BARRA: la recta que precede a cada
 *  doblez, el arco de material que ese doblez consume, y el acumulado.
 *
 *  Misma forma que `rowLengths()` y a propósito: `straight` es el MISMO número
 *  en las dos —la fibra y el centro coinciden en los tramos rectos— así que
 *  quien pinta la tabla cambia de función y no de lógica. Lo único que cambia
 *  de manos es el ARCO, y con él el acumulado.
 *
 *  `θ` va SIN topar, igual que en `rowLengths()`: el tope de `BEND_MAX_DEG` es
 *  del `trim`, que tiene una asíntota en 180, y el arco no la tiene. */
export function fibreLengths(model: Model): RowLength[] {
  const ejes = axisAngles(model), sec = model.section;
  let cum = 0;
  return model.bends.map((b, i) => {
    const straight = straightOf(model, i);
    const arc = fibreRadiusAt(sec, b.radius || 0, ejes[i]) * bendDecomp(b).theta;
    cum += straight + arc;
    return { straight, arc, cum };
  });
}

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

/** Cuánta barra se ahorra la fibra frente al centro, mm. Negativo siempre que
 *  K < 0.5. Es la cifra que explica un corte que no cuadra con el de antes. */
export const fibreSaving = (model: Model): number =>
  cutLength(model) - developedLength(model);
