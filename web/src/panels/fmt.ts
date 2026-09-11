/* =========================================================================
   FORMATO Y ATAJOS COMPARTIDOS — el selector $, la clave I18nKey derivada de
   T(), las pestañas visibles y los formateadores que usan todos los paneles:
   fx/nx para números, nfield para inputs de tabla, esc para texto libre, cls
   para el semáforo v-ok/v-warn/v-bad, y oriTag/sgn para las celdas con
   insignia W/T y con signo.
   ========================================================================= */
import { T } from '../i18n.ts';
/* `esc` se reexporta más abajo para los paneles, pero un reexport no la trae al
   ámbito de este archivo y aquí también se usa. */
import { esc } from '../safe.ts';
import type { Mode, Orientation } from '../types.ts';

/** i18n.ts no exporta `I18nKey`: se deriva aquí del propio parámetro de T()
 *  para no duplicar la lista de 388 claves y para que tsc siga comprobando
 *  contra la misma unión si esa lista cambia. */
export type I18nKey = Parameters<typeof T>[0];

/* El atajo se define en src/dom.ts y se reexporta: los paneles lo piden a fmt
   como siempre, pero la firma es UNA. */
export { $ } from '../dom.ts';

/* Las pestañas de abajo. La MEDICIÓN ya no es una pestaña: sus estadísticas y
   su tabla de desviación viven fijas en el lateral derecho, porque son lo que
   se mira MIENTRAS se toca la tabla. */
/** Las sub-pestañas de cada MODO. Modelar tiene dos tablas —la LRA y la de
 *  puntos—; Medir y Compensar tienen una sola cosa que enseñar y por eso no
 *  gastan una fila de pestañas en decirlo. */
export const MODES: Mode[] = ['model', 'meas', 'comp'];
/* «Límites» vive SOLO en Modelar, y no en Compensar aunque cuatro de sus ocho
   números sean del lazo: en Compensar no hay fila de pestañas —sería una
   etiqueta de una sola opción— y añadirla le come una fila de comando a la
   tabla, que es justo lo que ese modo existe para enseñar. Medido: con la barra
   de pestañas puesta se ven 4 filas donde antes se veían 5. Los umbrales se
   dejan puestos antes de doblar, no en mitad del lazo. */
export const TABS_OF: Record<Mode, string[]> = {
  model: ['model', 'points', 'fixture', 'pins', 'lims', 'mach'], meas: [], comp: ['comp'],
};
/** Compatibilidad: la lista plana que usaba renderRight() antes de los modos. */
export const TABS = ['model', 'points', 'fixture', 'pins', 'lims', 'mach', 'comp'];
export const fx = (v: number | null | undefined, n: number = 2): string =>
  (v === null || v === undefined || !isFinite(v)) ? '—' : v.toFixed(n);
/** Valor para un campo EDITABLE. Al menos `min` decimales y hasta `max`, sin
 *  ceros de relleno de más: 30 se ve «30.00», 17.905 se ve entero. Es lo que
 *  impide que repintar la tabla se coma el tercer decimal que alguien tecleó.
 *
 *  fx() se queda para las celdas de LECTURA, donde el ancho fijo alinea mejor. */
export const nx = (v: number | null | undefined, min: number = 2, max: number = 3): string => {
  if (v === null || v === undefined || !isFinite(v)) return '';
  const r = +(+v).toFixed(max);
  const dec = (String(r).split('.')[1] || '').length;
  return r.toFixed(Math.max(min, dec));
};

/** Campo numérico de tabla o de formulario.
 *
 *  `step="any"` a propósito: con un paso declarado el navegador marca inválido
 *  todo lo que no cae en la rejilla —con step=".1" un 17.905 es un error— y
 *  redondea al usar las flechas. El paso vive en `data-step`, que es lo que
 *  leen la rueda del ratón y Ctrl+flecha (ver stepField() en app/events/keyboard.ts). */
export const nfield = (
  step: string, attrs: string, val: number | null | undefined, extra: string = '',
): string =>
  `<input type="number" step="any" data-step="${step}" ${attrs}
    value="${nx(val)}" ${extra}>`;

/* `esc` se define en safe.ts y se reexporta aquí: los paneles lo piden a fmt
   como siempre, pero la definición es UNA, la misma que usa el 3D. Dos copias
   era la vía corta a que una se quedara sin una comilla. */
export { esc, safeColor } from '../safe.ts';
export const cls = (v: number, t: number): string => Math.abs(v) <= t ? 'v-ok' : Math.abs(v) <= 2 * t ? 'v-warn' : 'v-bad';
/** La casilla de la reacción de un apoyo, que tiene TRES estados y no dos.
 *
 *  Un número es una reacción. Un guion es «la pieza no lo está tocando», que es
 *  una respuesta legítima con apoyos que empujan pero no tiran. Y «n/d» es «ese
 *  apoyo cae en un tramo que el modelo no sabe doblar, así que aquí no se puede
 *  decir nada» — que no es lo mismo ni de lejos, y hasta hoy se pintaba como un
 *  0.0 en verde, o sea como «este apoyo sobra». Ver `pedBlind` en
 *  engine/load.ts. La usan la tabla del fixture y la de pines, y va aquí para
 *  que las dos no se separen. */
export const reacCell = (reac: number, ciego: boolean): string =>
  ciego
    ? `<td class="v-nd" title="${esc(T('loadNdTip'))}">${T('loadNd')}</td>`
    : `<td class="${reac > 0 ? 'v-ok' : 'v-dim'}" title="${esc(T('loadNTip'))}">${
        reac > 0 ? fx(reac, 1) : '—'}</td>`;
/** Insignia W/T. La letra sola no dice nada a quien llega nuevo: el tooltip
 *  lleva la explicación larga, que ya estaba traducida en los tres idiomas. */
export const oriTag = (o: Orientation): string => `<span class="ori ${o}" title="${T(('or' + o) as I18nKey)}">${o}</span>`;
export const sgn = (v: number, n: number): string => (v > 0 ? '+' : '') + fx(v, n);

/* El ángulo se enseña TAL CUAL lo guarda el modelo. Hubo una temporada en que
   la interfaz lo volteaba (angOut/angIn), pero eso dejaba la pantalla diciendo
   una cosa y el archivo otra. Lo que se voltea ahora es el SENTIDO DE GIRO, y
   vive en el motor: `ANG_DIR`, en engine/kinematics.ts. Los mismos números
   doblan al otro lado y en pantalla se ven como están en los datos. */
/** Insignia de PROCEDENCIA de una pieza. `src` viaja en el JSON desde siempre
 *  ('sim' cuando la inventó el simulador, 'verify' cuando es la verificación
 *  posterior a compensar) pero no se enseñaba en ninguna parte, así que una
 *  pieza inventada y una medida se veían igual — y con eso se puede compensar
 *  contra números que no existen. Un archivo anterior puede no traer nada:
 *  eso es 'S/D', no 'medida'. */
export const srcTag = (src: string | undefined): string => {
  const k = src === 'sim' ? ['sim', 'srcSim', 'srcSimTip']
    : src === 'verify' ? ['sim', 'srcVerify', 'srcVerifyTip']
    : src ? ['meas', 'srcMeas', 'srcMeasTip']
    : ['unk', 'srcUnk', 'srcUnkTip'];
  return `<span class="srcbadge ${k[0]}" title="${T(k[2] as I18nKey)}">${T(k[1] as I18nKey)}</span>`;
};
