/* =========================================================================
   CSV DE PUNTOS — la lectura de una nube de PI y su vuelta a texto.

   Sale de doc.ts porque no comparte nada con el esquema: doc.ts habla de
   versiones del formato y de migraciones, y esto habla de separadores y de
   columnas. Juntos pasaban de las 400 lineas de la regla. La dependencia va en
   un solo sentido —este archivo no importa doc.ts— asi que no hay ciclo.
   ========================================================================= */
import { Vector3 } from 'three';
import type { Lims } from '../types.ts';
import { LIMS_DEFAULT } from './lims.ts';

/** Lee puntos de un CSV con una regla que suena rara: de cada linea se toman
 *  **las tres ultimas columnas numericas**, y la linea que no tenga tres se
 *  descarta sola.
 *
 *  Suena laxo y es deliberado. Un volcado de GOM llega con encabezado, con una
 *  columna de indice o de nombre delante, separado por comas, por punto y coma
 *  o por tabuladores, y a veces con una linea de unidades. Con esta regla todo
 *  eso entra sin pedirle a nadie que limpie el archivo a mano, y lo que no son
 *  coordenadas no se cuela.
 *
 *  Lo que NO hace: adivinar el separador decimal. Un `1,5` europeo son dos
 *  columnas, no un numero y medio. */
export type CsvReason =
  /** entraron puntos */
  | 'ok'
  /** ninguna línea tenía tres números */
  | 'empty'
  /** decimales con coma: `1,5` son dos columnas, no un número y medio */
  | 'decimalComma'
  /** más de cuatro columnas numéricas: no se sabe cuáles son las coordenadas */
  | 'tooManyColumns'
  /** dos PI consecutivos prácticamente en el mismo sitio: ver PI_MIN_MM */
  | 'coincident';

export type CsvParse = {
  pts: Vector3[];
  reason: CsvReason;
  /** columnas numéricas que tenía la mayoría de las líneas de datos */
  cols: number;
  /** líneas con tres números o más que NO encajaban y se descartaron */
  skipped: number;
  /** índices del SEGUNDO punto de cada pareja demasiado junta. Vacío si no las
   *  hay; con algo dentro, `pts` viene vacío y `reason` es 'coincident'. */
  near: number[];
};

/* La distancia mínima entre dos PI (`lims.piMin`) y la escala mínima de la
   nube (`lims.scaleMin`) se teclean en la pestaña «Límites» y viajan en el
   JSON: ver engine/lims.ts, que explica los dos.

   Lo que NO es configurable, porque no es un umbral sino una decisión: con dos
   PI pegados se rechaza el archivo ENTERO en vez de fusionar los puntos. Dos PI
   pegados significan que la extracción de la nube salió mal, y una pieza
   importada a medias es peor que ninguna — se compensa contra ella sin que
   nadie lo note. */

/** Lee puntos de un CSV, y dice qué encontró.
 *
 *  La regla anterior era «de cada línea, las TRES ÚLTIMAS columnas numéricas»,
 *  y se descartaba sola la línea que no tuviera tres. Suena laxo y era
 *  deliberado: así entraba un volcado con encabezado, con columna de índice o
 *  con cualquier separador, sin pedirle a nadie que limpiara el archivo.
 *
 *  El problema es que un informe de inspección de ZEISS/GOM **no termina en las
 *  coordenadas**: lleva el nominal, o la desviación, o las dos. Con la regla de
 *  «las tres últimas» ese archivo entraba entero e importaba desviaciones de
 *  0-5 mm creyéndolas coordenadas, y una nube de desviaciones parece una barra
 *  perfecta. Nada avisaba.
 *
 *  Ahora el archivo tiene que ser COHERENTE: se mira cuántas columnas numéricas
 *  tiene la mayoría de sus líneas de datos y solo se aceptan 3 (x,y,z) o 4
 *  (índice o nombre + x,y,z). Con más, no se adivina: se rechaza y se dice por
 *  qué. Las líneas que no encajan con la mayoría se cuentan aparte, porque una
 *  sola línea corrupta desplazaba las columnas del resto en silencio.
 *
 *  Sigue sin adivinar el separador decimal, pero ahora lo DETECTA y lo dice.
 *
 */
export function parsePointsCsv(txt: string, lims: Lims = LIMS_DEFAULT): CsvParse {
  const lines = String(txt).split(/\r?\n/);
  const numsOf = (line: string): number[] => line.trim().split(/[,;\t ]+/)
    .filter(t => t !== '' && isFinite(Number(t)))
    .map(Number);

  /* Solo las líneas con tres números o más pueden ser puntos; el encabezado y
     las de unidades caen aquí sin hacer ruido, como siempre. */
  const datos = lines.map(numsOf).filter(n => n.length >= 3);
  if (!datos.length) return { pts: [], reason: 'empty', cols: 0, skipped: 0, near: [] };

  /* Cuántas columnas tiene la MAYORÍA. La moda, no el máximo: una línea
     corrupta no debe decidir cómo se lee el archivo entero. */
  const cuenta = new Map<number, number>();
  for (const n of datos) cuenta.set(n.length, (cuenta.get(n.length) || 0) + 1);
  let cols = 0, mejor = -1;
  for (const [c, k] of cuenta) if (k > mejor || (k === mejor && c < cols)) { cols = c; mejor = k; }

  if (cols > 4) {
    /* Un `1,5;2,5;3,5` europeo se parte en seis números y cae justo aquí. Vale
       la pena distinguirlo, porque la causa y el arreglo son otros. */
    const coma = lines.some(l => /\d[,]\d/.test(l) && /[;\t]/.test(l));
    return { pts: [], reason: coma ? 'decimalComma' : 'tooManyColumns',
             cols, skipped: datos.length, near: [] };
  }

  const pts: Vector3[] = [];
  let skipped = 0;
  for (const n of datos) {
    /* Una línea con otro número de columnas no se recorta por la derecha: se
       descarta y se cuenta. Recortarla era lo que desplazaba las coordenadas
       cuando una columna traía `NaN` o venía vacía. */
    if (n.length !== cols) { skipped++; continue; }
    const xyz = n.slice(-3);
    pts.push(new Vector3(xyz[0], xyz[1], xyz[2]));
  }
  /* Dos PI pegados dan una dirección de puro ruido y de ahí un doblez que no
     existe. Se mira aquí, en la frontera, y no dentro de ik(): editar un punto
     a mano puede pasar por un estado intermedio raro, pero un ARCHIVO con dos
     PI a décimas de milímetro está mal extraído y no hay nada que salvar. */
  const near: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].distanceTo(pts[i - 1]) < lims.piMin) near.push(i);
  }
  if (near.length) return { pts: [], reason: 'coincident', cols, skipped, near };

  return { pts, reason: pts.length ? 'ok' : 'empty', cols, skipped, near };
}

/** Solo los puntos. Se mantiene porque es lo que consumen los sitios a los que
 *  no les toca decidir qué hacer con un archivo malo. */
export const readPointsCsv = (txt: string, lims: Lims = LIMS_DEFAULT): Vector3[] =>
  parsePointsCsv(txt, lims).pts;

export const writePointsCsv = (pts: Vector3[]): string =>
  'idx,x,y,z\n' + pts.map((p, i) =>
    `${i},${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`).join('\n');

/* `lims.scaleMin` — cuánto puede encogerse la nube importada respecto del
   nominal antes de que deje de ser creíble que sean la misma pieza.
 *
 *  NO es una tolerancia. La tolerancia de la pieza se mide en otro sitio y en
 *  milímetros; esto es un detector de error grosero, y por eso el margen es
 *  enorme a propósito: tiene que ser imposible que salte con un archivo bueno.
 *
 *  Lo que caza, que es justo el agujero que quedaba abierto: un export de
 *  ZEISS/GOM cuyas tres columnas finales son la DESVIACIÓN y no la coordenada.
 *  Ese archivo pasa todas las guardas anteriores —tres columnas numéricas,
 *  decimales con punto, ningún par de puntos pegado— y entra como una pieza
 *  perfecta, porque una nube de desviaciones de ±0.5 mm alrededor del cero es
 *  geométricamente una barra rectísima y diminuta. Nada avisaba.
 *
 *  De paso caza las unidades equivocadas, que es el mismo error con otra cara:
 *  metros (nube 1000× menor), pulgadas leídas como mm (25.4×), centímetros
 *  (10×). La peor de las tres, el centímetro, queda todavía a un factor 2.5 del
 *  umbral.
 *
 *  La comprobación es de UN SOLO LADO, y eso también es deliberado: un escaneo
 *  al que le faltan puntos intermedios funde dos tramos en uno y da un paso
 *  medio MAYOR que el nominal. Eso no es un archivo malo —es una pieza medida a
 *  medias, y ya lo dice el informe del lote— así que por arriba no se rechaza
 *  nada. */

/** El paso medio entre PI consecutivos. Media y no largo total: si al escaneo
 *  le faltan puntos, el largo total cae en proporción a lo que falta, pero la
 *  media apenas se mueve.
 *
 *  Exportada porque el aviso al operario dice las DOS medias, la del archivo y
 *  la del nominal. Un rechazo que solo dice «escala rara» manda a alguien a
 *  mirar el archivo a ojo; uno que dice «avanzan 0.4 mm y deberían 112 mm»
 *  nombra el problema. */
export const piStep = (p: Vector3[]): number => {
  if (p.length < 2) return 0;
  let d = 0;
  for (let i = 1; i < p.length; i++) d += p[i].distanceTo(p[i - 1]);
  return d / (p.length - 1);
};

/** ¿La nube importada está a la escala del nominal?
 *
 *  Con un nominal degenerado (sin dos puntos, o de largo cero) devuelve `true`:
 *  sin nada contra qué comparar, esta guarda no opina, y las otras siguen. */
export function csvScaleOk(pts: Vector3[], nominal: Vector3[],
                           lims: Lims = LIMS_DEFAULT): boolean {
  const nom = piStep(nominal);
  if (!(nom > 0)) return true;
  return piStep(pts) >= nom * lims.scaleMin;
}
