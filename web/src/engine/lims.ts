/* =========================================================================
   LOS UMBRALES QUE JUZGAN — los cuatro números con los que este programa
   decide que un dato no se puede creer.

   Estaban compilados dentro del HTML, cada uno en su archivo. Eso los volvía
   intocables desde el taller: el día que se mida la repetibilidad real del
   escaneo (σ, punto A.6 de `.auditoria/solicitud-datos.md`) hay que recalcular
   tres de ellos, y con el número dentro del bundle eso significa recompilar,
   volver a publicar y volver a copiar el HTML a cada USB. Aquí viven una sola
   vez, viajan en el JSON de la pieza y se teclean en la pestaña «Límites».

   **Que viajen en el archivo es la mitad del punto.** Un `.json` guardado dice
   con qué umbrales se juzgó esa pieza; sin eso, un rechazo de hace tres meses
   no se puede volver a explicar.

   Ninguno de estos números entra en la CINEMÁTICA: no mueven un PI ni un
   ángulo. Deciden qué se rechaza, qué se avisa y de qué dato se desconfía. Por
   eso se pueden tocar sin subir `SCHEMA` y sin regenerar el fixture congelado,
   al revés que `ANG_DIR` o `ROT_DIR`.
   ========================================================================= */
import type { Lims } from '../types.ts';

/** Los valores de partida. **Tres de los cuatro son PROVISIONALES** y lo dicen
 *  en la pantalla: se eligieron a falta de σ y se recalculan cuando llegue.
 *
 *  · `axisMin` — desvío mínimo (°) para creerle el EJE a un doblez medido. Un
 *    doblez casi recto no tiene plano legible: el ruido lo inventa, y como lo
 *    que se guarda es el giro respecto de la estación anterior, la fila
 *    siguiente hereda la basura. Por debajo del umbral se hereda el eje en vez
 *    de leerlo. La regla real es `atan(3σ/avance)`. PROVISIONAL.
 *    Solo se aplica al camino MEDIDO: en un modelo tecleado un doblez de 0.2°
 *    es deliberado y su eje es exacto.
 *
 *  · `piMin` — distancia mínima (mm) entre dos PI consecutivos de un archivo
 *    importado. `ik()` solo se protege del largo CERO; dos puntos a 0.3 mm
 *    pasan esa guarda y dan una dirección que es casi todo ruido. La regla real
 *    es `5σ`. PROVISIONAL, y conservador: entre dos PI de verdad hay la recta
 *    más los dos trims, o sea decenas de milímetros.
 *
 *  · `scaleMin` — fracción del paso nominal por debajo de la cual la nube
 *    importada no es la misma pieza. NO es una tolerancia: es un detector de
 *    error grosero —un export cuyas tres últimas columnas son la DESVIACIÓN y
 *    no la coordenada, o metros leídos como milímetros— y por eso el margen es
 *    enorme a propósito. De un solo lado: a un escaneo al que le faltan puntos
 *    intermedios el paso medio le SUBE, y eso no es un archivo malo.
 *
 *  · `straightMin` — recta mínima (mm) entre tangencias para que quepan los
 *    herramentales. Este NO depende de σ: es una cota de la MÁQUINA —mordaza
 *    más carrera del cabezal— y está pedida en el punto B.2. Sigue siendo
 *    provisional, pero lo despierta otra respuesta y otra persona.
 *    Una recta NEGATIVA no es cuestión de umbral y se lista aparte pase lo que
 *    pase: son dos herramentales en el mismo sitio. */
export const LIMS_DEFAULT: Lims = {
  axisMin: 1.0,
  piMin: 1.0,
  scaleMin: 0.25,
  straightMin: 25,
};

/** Qué se sigue esperando para dejar de llamar provisional a cada uno. Lo
 *  consume la pantalla: un umbral tecleado a ojo y uno medido se ven igual, y
 *  la diferencia importa cuando alguien discute un rechazo. */
export const LIMS_PENDING: Record<keyof Lims, string> = {
  axisMin: 'A.6', piMin: 'A.6', scaleMin: '', straightMin: 'B.2',
};

/** El rango admisible de cada uno: `[min, max]`, ambos incluidos.
 *
 *  No son gustos, son los bordes donde el número deja de significar lo que
 *  dice. Un `piMin` de 200 mm rechaza cualquier pieza real; un `scaleMin` por
 *  encima de 1 rechaza incluso la nube perfecta, porque exige que la medida
 *  avance MÁS que el nominal. El cero sí se admite en los tres primeros y
 *  significa «no vigiles esto»: es una decisión legítima con datos limpios, y
 *  esconderla detrás de un mínimo obligaría a editar el JSON a mano, que es
 *  peor. */
export const LIMS_RANGE: Record<keyof Lims, [number, number]> = {
  axisMin: [0, 15],
  piMin: [0, 50],
  scaleMin: [0, 1],
  straightMin: [0, 500],
};

export const LIMS_KEYS = Object.keys(LIMS_DEFAULT) as (keyof Lims)[];

/** Cuántos decimales tiene sentido teclear en cada uno. */
export const LIMS_STEP: Record<keyof Lims, number> = {
  axisMin: 2, piMin: 2, scaleMin: 2, straightMin: 1,
};

/** Un valor suelto, dejado dentro de su rango. `NaN`, `Infinity` y lo que no
 *  sea número caen al valor por defecto: un umbral que se lee como NaN no
 *  rechaza NUNCA —toda comparación con NaN es falsa— así que un archivo
 *  corrupto apagaría las guardas en silencio, que es el fallo exacto que estas
 *  guardas existen para evitar. */
export function limOf(k: keyof Lims, v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!isFinite(n)) return LIMS_DEFAULT[k];
  const [lo, hi] = LIMS_RANGE[k];
  return Math.min(hi, Math.max(lo, n));
}

/** Los cuatro, completos y dentro de rango, salga lo que salga del archivo.
 *  Un documento sin `lims` —todos los anteriores a hoy— sale con los valores
 *  por defecto, o sea con el comportamiento que ese archivo tenía. */
export function normLims(o: Partial<Lims> | null | undefined): Lims {
  const src = o || {};
  const out = { ...LIMS_DEFAULT };
  for (const k of LIMS_KEYS) if (src[k] !== undefined) out[k] = limOf(k, src[k]);
  return out;
}

/** ¿Este juego de umbrales es el de fábrica? Lo usa la pantalla para decir
 *  «tocados» y para apagar el botón de restaurar. */
export const limsAreDefault = (l: Lims): boolean =>
  LIMS_KEYS.every(k => l[k] === LIMS_DEFAULT[k]);
