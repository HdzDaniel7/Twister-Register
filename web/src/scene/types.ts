/* =========================================================================
   TIPOS DE LA ESCENA — formas internas compartidas por stage/layers/build/view.
   Nada de esto vive en ../types.ts: son formas internas de la escena. Ver
   informe de la tarea para cuáles convendría compartir.
   ========================================================================= */
import type * as E from '../engine.ts';
import type { AnchorMode, Model, PathSample, Variant, State } from '../types.ts';
import type { Vector3, Matrix4, BufferGeometry, Material } from 'three';

/** Lo que devuelve E.buildPath(): muestreo del eje neutro + longitud total. */
export type Path = ReturnType<typeof E.buildPath>;
/** Colorea una muestra del barrido; null = color plano por defecto. */
export type DevFn = (q: PathSample, i: number) => number[];
/** Una variante ya anclada y con su trayectoria calculada, lista de dibujar. */
export type ShownEntry = { v: Variant; m: Model; A: Matrix4; path: Path; pis: Vector3[] };
/** Etiqueta HTML flotante anclada a un punto 3D (cifras de desviación). */
export type ExtraLabel = { p: Vector3; txt: string; color: string };
/** Callback de picking: índice de PI clicado (o -1). */
export type PickHandler = (pi: number) => void;
/** Vista mínima de un Mesh/LineSegments para poder liberar su GPU al vaciar un grupo. */
export type Disposable = { geometry?: BufferGeometry; material?: Material };
/** Las cuatro vistas fijas de la barra de arriba y del reporte. */
export type ViewName = 'iso' | 'top' | 'front' | 'side';
/** Un brazo ya proyectado del gizmo de ejes, listo para pintarse en SVG. */
export type GizmoArm = { k: 'x' | 'y' | 'z'; tok: string; x: number; y: number; z: number };

/** Lo que comparten las capas: el modelo activo ya anclado y las variantes
 *  visibles con su trayectoria. Se arma una vez por reconstrucción. */
export type SceneCtx = {
  M: Model; L: State['layers'];
  /* la referencia y el extremo fijo con los que se anclaron las variantes:
     van en el contexto porque la capa `diff` compara contra los MISMOS que
     usó la construcción de `shown`, no contra lo que diga ST más tarde. */
  ref: Model; anchor: AnchorMode;
  shown: ShownEntry[]; act: ShownEntry | null;
  /* Las mismas variantes visibles, pero con la forma que toman SUJETAS por los
     pines. Vacío con el amarre apagado o con su capa apagada: calcular la forma
     sujeta de cada variante cuesta, y no se hace para no dibujarla. */
  held: ShownEntry[];
  Axf: Matrix4; nomPis: Vector3[]; hasMeas: boolean;
};
