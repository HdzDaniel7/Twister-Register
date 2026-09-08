/* =========================================================================
   DESHACER Y REHACER

   La pila guarda DOCUMENTOS serializados, no parches: `toDoc()` y `fromDoc()`
   ya existían y son la única frontera del estado, así que deshacer es volver a
   cargar el documento anterior. Cuesta memoria (unos 20 KB por paso, 50 pasos)
   y no cuesta ni una línea de lógica de deshacer por cada acción nueva: lo que
   entre en el JSON entra en el deshacer solo.

   QUÉ SE DESHACE — lo que viaja en toDoc():
     el modelo y sus variantes, los comandos de máquina, las ganancias, los
     parámetros del simulador, las piezas medidas, el extremo fijo, la
     colocación, las cotas y el ajuste manual de la compensación.

   QUÉ NO — lo que no está en el documento, y es deliberado:
     la cámara, el doblez seleccionado, el modo de trabajo, el cajón abierto,
     el 3D a pantalla completa, las capas, la exageración, el datum de la pieza
     medida, el tema y el idioma. Deshacer no debe mover la cámara ni cambiar
     de pantalla: se espera que devuelva DATOS, no la vista desde la que se
     estaban mirando.

   Cómo se llena: `commit()` se llama después de cada acción y de cada `change`
   confirmado, y compara con la cima de la pila. Si el documento no cambió, no
   apila nada — así un clic en una pestaña o un anclaje que no movió nada no
   gasta un paso de deshacer.
   ========================================================================= */
import * as E from '../engine.ts';
import { ST, loadModel, setMarks, syncTweak, addDataset } from '../state.ts';
import type { Doc } from '../types.ts';

/** 50 pasos: con ~20 KB por documento son 1 MB largo, y nadie deshace más de
 *  eso a mano. El más viejo se cae por el fondo. */
const MAX = 50;

const past: string[] = [];
const future: string[] = [];
/** Mientras se restaura, los renders disparan `change` y `commit()` volvería a
 *  apilar lo que se acaba de sacar. */
let restoring = false;

/** El documento de ahora mismo, en texto. Es exactamente lo que escribe
 *  «Guardar JSON» menos las preferencias de pantalla. */
function snapshot(): string {
  if (!ST.model) return '';
  /* SIN la clave `ui`, y esto importa: el tema, el idioma y el modo de trabajo
     viajan en el documento que se GUARDA, pero no son datos de la pieza. Si
     entraran aquí, cambiar de modo apilaría un paso y el primer Ctrl+Z se
     gastaría en volver de modo en vez de deshacer la última edición. */
  /* `tweak` se canoniza: pintar la pestaña de compensación lo rellena de ceros
     (syncTweak), y sin esto el simple hecho de mirarla apilaría un paso que
     luego se comía el primer Ctrl+Z. Un ajuste todo a cero ES «sin ajuste». */
  const hayAjuste = ST.tweak.some(t => t.angle || t.rot || t.feed);
  const doc = E.toDoc(ST.model, ST.command, ST.comp, ST.proc, ST.datasets,
                      ST.variants, ST.ref, ST.anchor,
                      { place: ST.place, marks: ST.marks,
                        tweak: hayAjuste ? ST.tweak : [] });
  /* `saved` es la hora de guardado, y cambia en cada llamada: si se queda, dos
     documentos idénticos salen distintos, la comparación de commit() no sirve
     de nada y CUALQUIER clic gasta un paso de deshacer. */
  const { saved, ...doc2 } = doc;
  void saved;
  return JSON.stringify(doc2);
}

/** Arranca la pila con el estado inicial. Sin esto, el primer deshacer no
 *  tendría a dónde volver. */
export function initHistory(): void {
  past.length = 0;
  future.length = 0;
  const s = snapshot();
  if (s) past.push(s);
}

/** Apila el estado de AHORA si cambió algo. Devuelve true si apiló. */
export function commit(): boolean {
  if (restoring) return false;
  const s = snapshot();
  if (!s || s === past[past.length - 1]) return false;
  past.push(s);
  if (past.length > MAX + 1) past.shift();
  /* una acción nueva corta la rama de rehacer, como en cualquier editor */
  future.length = 0;
  return true;
}

/* ------------------------------------------------------ cambios sin guardar
   El programa no usa localStorage por regla dura y todo sale por «Guardar
   JSON»: cerrar la pestaña con media hora de piezas medidas encima las borra
   sin dejar rastro, y una medición de GOM no se repite sin volver a montar la
   barra. `snapshot()` ya es la comparación exacta que hace falta —el mismo
   texto que decide si un cambio gasta un paso de deshacer— así que basta con
   recordar cuál era al guardar.                                             */
let savedMark = '';

/** Marca el estado de ahora como guardado. La llama quien escribe el archivo. */
export const markSaved = (): void => { savedMark = snapshot(); };

/** ¿Hay algo que se perdería al cerrar? */
export const isDirty = (): boolean => {
  const s = snapshot();
  return !!s && s !== savedMark;
};

export const canUndo = (): boolean => past.length > 1;
export const canRedo = (): boolean => future.length > 0;
export const undoDepth = (): number => Math.max(0, past.length - 1);
export const redoDepth = (): number => future.length;

/** Carga un documento serializado en ST. Es el mismo camino que abrir un
 *  archivo, menos el tema, el idioma y el modo: deshacer no cambia de
 *  pantalla. */
function restore(text: string): void {
  const d = E.fromDoc(JSON.parse(text) as Doc);
  restoring = true;
  try {
    loadModel(d.model, d.variants, d.ref, d.anchor);
    ST.command = d.command;
    Object.assign(ST.comp, d.comp);
    Object.assign(ST.proc, d.proc);
    ST.place = { ...E.PLACE_DEFAULT, ...(d.place || {}) };
    setMarks(d.marks);
    ST.tweak = d.tweak || [];
    syncTweak(ST.model!.bends.length);
    for (const x of d.datasets) {
      const ds = addDataset({ ...d.model, bends: (x.bends || []).map(E.bendFrom),
                              tail: x.tail ?? d.model.tail },
                            x.name || '?', x.src || '', x.cmd);
      ds.color = x.color || ds.color;
    }
  } finally {
    restoring = false;
  }
}

/** Deshace un paso. Devuelve false si no había a dónde volver. */
export function undo(): boolean {
  if (!canUndo()) return false;
  const actual = past.pop()!;
  future.push(actual);
  restore(past[past.length - 1]);
  return true;
}

/** Rehace el paso deshecho. */
export function redo(): boolean {
  if (!canRedo()) return false;
  const s = future.pop()!;
  past.push(s);
  restore(s);
  return true;
}
