/* =========================================================================
   MEDIR POR ÁNGULOS — una pieza medida que no viene de puntos.

   Un informe de CMM o de brazo no siempre trae la nube: muchas veces trae solo
   el ÁNGULO INTERNO entre las dos rectas de cada doblez. Con eso no se puede
   reconstruir la pieza entera —faltan las rectas y los planos—, pero sí lo que
   el lazo necesita: cuánto dobló cada estación. Así que la pieza medida se arma
   como el TABLERO con el que se dobló, con solo los ángulos cambiados, y se
   compara contra el PLANO (los internos del CAD). Las tres cifras —tablero,
   plano, reporte— y por qué no son la misma: ver `Plan` en types/doc.ts.

   La convención, y por qué es esta. El doblez es un solo arco —ver
   `bendDecomp()`— y su desvío total es `θ = |wrapTurn(angle)|`, sin importar el
   rodado: el rodado inclina el EJE del arco, no cambia cuánto se desvía la
   barra. Las dos rectas forman entonces

       interno = 180 − θ          90° de doblez → 90 interno · 30° → 150

   que es lo que mide un calibre de ángulo apoyado en las dos rectas. El SIGNO
   del ángulo —el lado al que dobla, o la rama que elige `alignBranch()` en una
   estación de canto— no lo ve el informe ni el plano, y por eso la vuelta lo
   toma del tablero: medir no cambia hacia dónde dobla la pieza, solo cuánto.

   Es puro: no toca ST ni el DOM. La pieza se da de alta en state.ts.
   ========================================================================= */
import type { AngleRow, AngleSummary, Comp, MeasMethod, Model, Orientation, Plan } from '../types.ts';
import { wrapTurn } from './math.ts';
import { cloneModel } from './bend.ts';
import { compensate } from './compensate.ts';

/** Los métodos de medida que conoce el programa, en el orden en que se
 *  ofrecen. `label` es la clave de i18n del nombre. Un método nuevo se añade
 *  aquí y en `MeasMethod`; el resto del programa pregunta por `method`. */
export const MEAS_METHODS: readonly { id: MeasMethod; label: string }[] = Object.freeze([
  { id: 'cloud', label: 'measCloud' },
  { id: 'angles', label: 'measAngles' },
]);

/** ¿Hay lectura? `null`, `undefined`, NaN e infinito son «no se midió»: una
 *  celda vacía no es un cero, que sería una recta doblada al revés. */
const hasReading = (x: number | null | undefined): x is number =>
  typeof x === 'number' && isFinite(x);

/** Ángulo interno de cada doblez, °: `180 − θ`. Ver la cabecera. */
export function internalAngles(M: Model): number[] {
  return M.bends.map(b => 180 - Math.abs(wrapTurn(b.angle || 0)));
}

/** Inversa de `internalAngles()` para UN doblez: el ángulo de doblez que da
 *  ese interno, en la rama y la vuelta del nominal.
 *
 *  El signo sale de `wrapTurn(nomAngle)` —recto se toma positivo— y el
 *  resultado se escribe como INCREMENTO sobre el nominal y no como `±θ`
 *  suelto. La diferencia solo se ve con un nominal fuera de (−180, 180]: un 200
 *  es un −160, y devolver −160 haría que `compensate()`, que resta fila contra
 *  fila, leyera 360° de error donde no hay ninguno.
 *
 *  El interno se topa a [0, 180]: más de 180 sería doblar al otro lado, y eso
 *  no lo puede decir un informe que no ve el lado. Validar lo tecleado es cosa
 *  de la pantalla; aquí solo se impide que un dato roto voltee la pieza. */
export function bendFromInternal(internal: number, nomAngle: number): number {
  const n = wrapTurn(nomAngle || 0);
  const s = n < 0 ? -1 : 1;
  const theta = 180 - Math.min(180, Math.max(0, internal));
  return (nomAngle || 0) + s * (theta - Math.abs(n));
}

/** Un modelo —el tablero con el que se dobló, o el que sea— con los internos
 *  dados puestos: una copia, y SOLO `angle` cambia, y solo donde hay lectura.
 *  Rectas, rodados, radios, torsiones, cola, sección y tolerancias son los de
 *  `M`, porque ni el informe ni el plano dicen nada de ellos — y por eso la
 *  comparación PI a PI de esta pieza mide el efecto de los ángulos y nada más.
 *  Sirve igual para la pieza medida (internos del reporte) que para la del
 *  plano (internos del CAD): ver `planModel()`. */
export function modelFromInternal(M: Model, reported: (number | null)[]): Model {
  const out = cloneModel(M);
  out.bends.forEach((b, i) => {
    const r = reported[i];
    if (hasReading(r)) b.angle = bendFromInternal(r, b.angle);
  });
  return out;
}

/** El PLANO puesto sobre un tablero: una copia del tablero con el ángulo de
 *  cada doblez cambiado al que da el interno del CAD, donde el plano lo da.
 *  Es la geometría de la pieza del dibujo en lo que toca a ángulos —rectas,
 *  rodados y radios siguen siendo los del tablero, porque el plano que se
 *  teclea aquí no dice nada de ellos— y por eso es la referencia contra la que
 *  se colorea una pieza medida por ángulos. La rama y el lado salen del
 *  tablero, igual que en `modelFromInternal()`, que es lo que hace esto. */
export function planModel(board: Model, plan: Plan): Model {
  return modelFromInternal(board, plan.nominal || []);
}

/** Las lecturas de un doblez en varios reportes, sin las celdas vacías. */
const column = (list: (number | null)[][], i: number): number[] =>
  list.map(r => (r ? r[i] : null)).filter(hasReading);
const longest = (list: (number | null)[][]): number =>
  list.reduce((m, r) => Math.max(m, r ? r.length : 0), 0);

/** MEDIA por doblez de varios reportes, ignorando las celdas sin lectura.
 *  El largo es el del más largo; un doblez que ningún reporte midió sale
 *  `null`. Es lo que se compara contra el plano y de donde sale la
 *  compensación cuando una pieza junta varios reportes: lo sistemático —el
 *  resorte— queda, la dispersión de una lectura suelta se reparte. Un reporte
 *  atípico no se amortigua aquí: se desmarca (`MeasReport.use`). */
export function meanReported(list: (number | null)[][]): (number | null)[] {
  return Array.from({ length: longest(list) }, (_, i) => {
    const v = column(list, i);
    return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null;
  });
}

/** DISPERSIÓN por doblez de varios reportes: máx − mín de las lecturas, °.
 *  `null` donde hay menos de dos: con una sola no hay dispersión que medir. */
export function spreadReported(list: (number | null)[][]): (number | null)[] {
  return Array.from({ length: longest(list) }, (_, i) => {
    const v = column(list, i);
    return v.length > 1 ? Math.max(...v) - Math.min(...v) : null;
  });
}

/** El informe por doblez y la recomendación para el TABLERO siguiente.
 *
 *  Tres juegos de cifras (ver `Plan` en types/doc.ts): `board` es el tablero
 *  con el que se dobló la pieza, `plan` el CAD y `reported` lo medido. La
 *  desviación es REPORTE − PLANO; donde el plano no da el ángulo se cae al
 *  tablero (`fromBoard`), que es lo único que hay, y el resumen lo cuenta en
 *  `planMissing` para que la pantalla lo diga.
 *
 *  La recomendación es `compensate()` tal cual —ganancia por orientación,
 *  banda muerta, tope por paso— con el tablero como «comando», el plano como
 *  «nominal» y la pieza como «medida», y SOLO sobre el ángulo: el informe no
 *  trae rodado ni rectas, así que `doAngle` se fuerza y `doRot`/`doFeed` se
 *  apagan, sea cual sea la configuración del lazo. El signo sale solo: el
 *  doblez es `180 − interno` en la rama del tablero, así que una pieza que se
 *  quedó corta (interno medido > plano) tiene menos |doblez| que el plano, la
 *  diferencia plano − medida tiene el signo de la rama, y la corrección
 *  AUMENTA |doblez|. Una pasada de doblez, al revés. El banco lo comprueba en
 *  las dos ramas.
 *
 *  Un doblez sin lectura sale con `measInt`, `dev` y `ok` a null y
 *  `rec = board`: donde no se midió no hay nada que corregir. El resumen
 *  cuenta solo los medidos; `reports` sale a 1 y `spread` a null: los pone
 *  quien promedia varios reportes (`angleSummary()` en state.ts). */
export function angleReport(board: Model, plan: Plan, reported: (number | null)[], comp: Comp,
                            ori: Orientation[]): AngleSummary {
  const boardInt = internalAngles(board);
  const nominal = plan.nominal || [], names = plan.names || [];
  const target = planModel(board, plan).bends;
  const meas = modelFromInternal(board, reported).bends;
  const rec = compensate(board.bends, target, meas,
                         { ...comp, doAngle: true, doRot: false, doFeed: false }, ori);
  const rows: AngleRow[] = board.bends.map((b, i) => {
    const p = nominal[i];
    const planInt = hasReading(p) ? p : null;
    const refInt = planInt ?? boardInt[i];
    const head = { i, name: names[i] || '', planInt, refInt, fromBoard: planInt === null,
                   boardInt: boardInt[i], board: b.angle };
    const r = reported[i];
    if (!hasReading(r)) {
      return { ...head, measInt: null, dev: null, ok: null, rec: b.angle, recDelta: 0, spread: null };
    }
    const dev = r - refInt;
    const a = rec[i].angle;
    return { ...head, measInt: r, dev, ok: Math.abs(dev) <= board.tol.angle,
             rec: a, recDelta: a - b.angle, spread: null };
  });
  const medidas = rows.filter(x => x.dev !== null);
  const devs = medidas.map(x => x.dev as number);
  const n = devs.length;
  return {
    rows, n,
    maxAbs: devs.reduce((m, d) => Math.max(m, Math.abs(d)), 0),
    rms: n ? Math.sqrt(devs.reduce((a, d) => a + d * d, 0) / n) : 0,
    mean: n ? devs.reduce((a, d) => a + d, 0) / n : 0,
    out: rows.filter(x => x.ok === false).length,
    planMissing: medidas.filter(x => x.fromBoard).length,
    reports: 1,
  };
}
