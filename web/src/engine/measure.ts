/* =========================================================================
   MEDIR POR ÁNGULOS — una pieza medida que no viene de puntos.

   Un informe de CMM o de brazo no siempre trae la nube: muchas veces trae solo
   el ÁNGULO INTERNO entre las dos rectas de cada doblez. Con eso no se puede
   reconstruir la pieza entera —faltan las rectas y los planos—, pero sí lo que
   el lazo necesita: cuánto dobló cada estación. Así que la pieza medida se arma
   como el NOMINAL con solo los ángulos cambiados, y se compensa sobre ellos.

   La convención, y por qué es esta. El doblez es un solo arco —ver
   `bendDecomp()`— y su desvío total es `θ = |wrapTurn(angle)|`, sin importar el
   rodado: el rodado inclina el EJE del arco, no cambia cuánto se desvía la
   barra. Las dos rectas forman entonces

       interno = 180 − θ          90° de doblez → 90 interno · 30° → 150

   que es lo que mide un calibre de ángulo apoyado en las dos rectas. El SIGNO
   del ángulo —el lado al que dobla, o la rama que elige `alignBranch()` en una
   estación de canto— no lo ve el informe, y por eso la vuelta lo toma del
   nominal: medir no cambia hacia dónde dobla la pieza, solo cuánto.

   Es puro: no toca ST ni el DOM. La pieza se da de alta en state.ts.
   ========================================================================= */
import type { AngleRow, AngleSummary, Bend, Comp, MeasMethod, Model, Orientation } from '../types.ts';
import { wrapTurn } from './math.ts';
import { bendFrom, cloneModel } from './bend.ts';
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

/** El nominal con los ángulos informados puestos: una copia, y SOLO `angle`
 *  cambia, y solo donde hay lectura. Rectas, rodados, radios, torsiones, cola,
 *  sección y tolerancias son los del nominal, porque el informe no dice nada de
 *  ellos — y por eso la comparación PI a PI de esta pieza mide el efecto de los
 *  ángulos y nada más. */
export function modelFromInternal(M: Model, reported: (number | null)[]): Model {
  const out = cloneModel(M);
  out.bends.forEach((b, i) => {
    const r = reported[i];
    if (hasReading(r)) b.angle = bendFromInternal(r, b.angle);
  });
  return out;
}

/** El informe por doblez y la recomendación de comando.
 *
 *  La recomendación es `compensate()` tal cual —ganancia por orientación,
 *  banda muerta, tope por paso— pero SOLO sobre el ángulo: el informe no trae
 *  rodado ni rectas, y compensarlos contra el nominal copiado sería corregir
 *  cero con ganancia. Por eso `doAngle` se fuerza y `doRot`/`doFeed` se
 *  apagan, sea cual sea la configuración del lazo.
 *
 *  `cmd` es el comando con el que se HIZO la pieza (lo que guarda
 *  `Dataset.cmd`): la corrección es un incremento sobre ese, no sobre el de
 *  ahora. Si viene más corto que el modelo, la fila que falta usa el nominal.
 *
 *  Un doblez sin lectura sale con `measInt`, `dev` y `ok` a null y `rec = cmd`:
 *  donde no se midió no hay nada que corregir. El resumen cuenta solo los
 *  medidos. */
export function angleReport(M: Model, cmd: Bend[], reported: (number | null)[], comp: Comp,
                            ori: Orientation[]): AngleSummary {
  const nomInt = internalAngles(M);
  const meas = modelFromInternal(M, reported).bends;
  const cmdB = M.bends.map((b, i) => bendFrom(cmd[i] || b));
  /* el nominal hace de medida donde no hay lectura: error cero, y aun así se
     enmascara abajo por si la banda muerta estuviera a 0 y el redondeo no */
  const rec = compensate(cmdB, M.bends, meas,
                         { ...comp, doAngle: true, doRot: false, doFeed: false }, ori);
  const rows: AngleRow[] = M.bends.map((_, i) => {
    const r = reported[i];
    const c = cmdB[i].angle;
    if (!hasReading(r)) {
      return { i, nomInt: nomInt[i], measInt: null, dev: null, ok: null, cmd: c, rec: c, recDelta: 0 };
    }
    const dev = r - nomInt[i];
    const a = rec[i].angle;
    return { i, nomInt: nomInt[i], measInt: r, dev, ok: Math.abs(dev) <= M.tol.angle,
             cmd: c, rec: a, recDelta: a - c };
  });
  const devs = rows.filter(x => x.dev !== null).map(x => x.dev as number);
  const n = devs.length;
  return {
    rows, n,
    maxAbs: devs.reduce((m, d) => Math.max(m, Math.abs(d)), 0),
    rms: n ? Math.sqrt(devs.reduce((a, d) => a + d * d, 0) / n) : 0,
    mean: n ? devs.reduce((a, d) => a + d, 0) / n : 0,
    out: rows.filter(x => x.ok === false).length,
  };
}
