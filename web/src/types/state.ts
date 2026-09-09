/**
 * EL ESTADO DE LA APLICACION — `ST`, en state.ts. Un solo objeto mutable, sin
 * localStorage ni sessionStorage.
 */
import type { Bend, Model, Variant, AnchorMode, DatumMode } from './model.ts';
import type { Comp, Proc } from './process.ts';
import type { Dataset, Place, Mark, Pedestal, Tweak, Mode } from './doc.ts';

/* ------------------------------------------------------------ estado global */

/** Una entrada de la paleta de capas: si está prendida y de qué color se dibuja. */
export type LayerState = {
  on: boolean;
  color: string;
};

/**
 * El estado entero de la aplicación — `ST` en `state.ts`. Vive todo en un solo
 * objeto mutable; nada de localStorage ni sessionStorage.
 *
 * `model` es SOLO una caché del modelo efectivo (base + deltas) de la variante
 * activa: todo el código que dibuja y mide lee de ahí, y hay que llamar
 * `syncModel()` tras tocar una variante o la caché miente. `active`, `ref` y
 * `dsActive` son ids de CADENA ('v1', 'ds1'...), nunca índices: se comparan
 * con `===`. `sel` es el doblez seleccionado en la tabla; `-1` cuando no hay
 * ninguno.
 */
export type State = {
  /** modelos comparables cargados */
  variants: Variant[];
  /** id de la variante que se edita */
  active: string | null;
  /** id de la variante contra la que se ancla y se mide */
  ref: string | null;
  /** extremo fijo al comparar variantes entre sí */
  anchor: AnchorMode;
  /** caché del modelo efectivo (base + deltas) de la variante activa */
  model: Model | null;
  /** comando de máquina: lo que calcula el lazo, sin el ajuste manual (`tweak`) */
  command: Bend[];
  /** piezas medidas */
  datasets: Dataset[];
  /** id del dataset activo */
  dsActive: string | null;
  /** doblez seleccionado en la tabla de comandos; -1 si no hay ninguno */
  sel: number;
  comp: Comp;
  proc: Proc;
  /** una entrada por capa dibujable, indexada por su clave ('nom', 'meas'...) */
  layers: Record<string, LayerState>;
  view: { exag: number; cmode: 'solid' | 'dev' };
  /** alineación de la pieza MEDIDA contra su nominal */
  datum: DatumMode;
  /** pestaña activa del panel derecho ('model' | 'points' | 'comp', ver TABS) */
  /** el trabajo que se está haciendo: manda sobre TODA la distribución */
  mode: Mode;
  /** el 3D a pantalla completa: se pliega lo demás sin perder el modo ni el
   *  sitio en la tabla. Estado de pantalla, no del documento. */
  solo: boolean;
  /** cajón abierto ('file', 'models', 'view', 'pieces') o null.
   *  Es estado de pantalla, no del documento: no viaja en el JSON ni entra en
   *  el deshacer, igual que la selección o la cámara. */
  drawer: string | null;
  /** sub-pestaña dentro de Modelar: 'model' (la tabla LRA) o 'points' */
  tab: string;
  /** cuántos pasos hay para atrás y para adelante.
   *
   *  Vive aquí para que el panel no tenga que importar `app/history.ts`: los
   *  paneles están por DEBAJO de app/ y un panel que importa de app invierte
   *  las capas. `history.ts` ya conoce ST y el panel también, así que el
   *  estado es el sitio donde los dos se encuentran sin que ninguno dependa
   *  del otro.
   *
   *  Es derivado y de PANTALLA: no entra en `toDoc()` y por tanto no gasta un
   *  paso de deshacer. La pila sigue siendo la única dueña de los números;
   *  esto es la copia que el panel lee. */
  hist: { undo: number; redo: number };
  /** predicción de la 2.ª pieza tras aplicar la compensación; null si no se corrió */
  pred: Model | null;
  /** 'system' | 'light' | 'dark'. Sin localStorage: viaja en el JSON */
  theme: 'system' | 'light' | 'dark';
  /** colocación: dónde y en qué ángulo se para la pieza. Solo presentación */
  place: Place;
  /** puntos de referencia sueltos: cotas contra el fixture o un datum */
  marks: Mark[];
  /** los pedestales sobre los que se apoya la barra. Ver engine/fixture.ts */
  fixture: Pedestal[];
  /** ajuste manual sobre lo que calcula el lazo, por doblez */
  tweak: Tweak[];
};
