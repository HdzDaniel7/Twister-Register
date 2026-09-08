/* --------------------------------------------------------------- archivos --
   Abrir y guardar el documento, y meter piezas MEDIDAS desde CSV. Sale de
   `actions.ts` por dos motivos: es el unico grupo que toca el disco, y cada
   entrada tiene una gemela SIN dialogo —`importCsvText`, `importCsvBatch`—
   que es por donde el banco de interfaz recorre el camino entero. Abrir un
   selector de archivos es lo unico que un navegador headless no puede hacer.

   Las dos gemelas existen ademas porque el dialogo es ASINCRONO: cuando su
   callback corre, el commit() del clic que abrio el dialogo ya paso, asi que
   el paso de deshacer se apila aqui dentro y no en el evento.              */
import * as E from '../engine.ts';
import { T, LANG, setLang } from '../i18n.ts';
import {
  ST, loadModel, addDataset, setMarks, syncTweak,
} from '../state.ts';
import { rebuildScene, fitView } from '../scene.ts';
import { drawRibbon } from '../ribbon.ts';
import { renderPanels } from '../panels.ts';
import { download, pickFile, pickFiles, safeName } from '../io.ts';
import { renderAll } from './render.ts';
import { useTheme } from './theme.ts';
import { commit, markSaved } from './history.ts';

export function saveJson(): void {
  const doc = E.toDoc(ST.model!, ST.command, ST.comp, ST.proc, ST.datasets,
                      ST.variants, ST.ref, ST.anchor,
                      { place: ST.place, marks: ST.marks, tweak: ST.tweak,
                        ui: { theme: ST.theme, lang: LANG.cur, mode: ST.mode } });
  download(safeName(ST.model!.name) + '.json', JSON.stringify(doc, null, 1));
  /* A partir de aquí el trabajo está en disco: el aviso al cerrar deja de
     saltar hasta que se vuelva a tocar algo. */
  markSaved();
}
export function openJson(): void {
  pickFile('.json', txt => {
    try {
      const d = E.fromDoc(JSON.parse(txt));
      loadModel(d.model, d.variants, d.ref, d.anchor);
      ST.command = d.command;
      Object.assign(ST.comp, d.comp);
      Object.assign(ST.proc, d.proc);
      ST.place = { ...E.PLACE_DEFAULT, ...(d.place || {}) };
      setMarks(d.marks);
      ST.tweak = d.tweak || [];
      syncTweak(ST.model!.bends.length);
      /* un archivo sin `ui` no pisa el tema ni el idioma que ya haya puestos */
      if (d.ui) {
        if (d.ui.lang) setLang(d.ui.lang);
        if (d.ui.theme) useTheme(d.ui.theme);
        if (d.ui.mode === 'model' || d.ui.mode === 'meas' || d.ui.mode === 'comp') {
          ST.mode = d.ui.mode;
        }
      }
      for (const x of d.datasets) {
        const ds = addDataset(
          { ...d.model, bends: (x.bends || []).map(E.bendFrom), tail: x.tail ?? d.model.tail },
          x.name || '?', x.src || '', x.cmd);
        ds.color = x.color || ds.color;
      }
      renderAll(); fitView();
      /* mismo caso que el CSV: el diálogo es asíncrono. Abrir un archivo es un
         paso más del historial, así que se puede deshacer y volver a lo que
         había antes de abrirlo. */
      commit();
      /* Se avisa DESPUÉS de pintar: el usuario ve la pieza y el aviso le dice
         qué mirar. Un 2.2 pudo escribirse con el sentido de giro contrario, así
         que lo que hay que comprobar es la FORMA, no los números. */
      if (d.ambiguous) alert(T('schemaAmbiguous'));
      else if (d.legacy) alert(T('schemaMigrated'));
    } catch (err) {
      alert(openError(err));
    }
  }, (name, err) => alert(`${name} — ${T('fileUnread')}\n\n${err.message}`));
}
/** Traduce lo que sea que se rompió al abrir un archivo a una frase con CAUSA
 *  y con lo que hay que hacer. Antes había un único texto genérico con el
 *  `message` crudo pegado detrás, así que a quien abría el archivo equivocado
 *  le salía un `TypeError: Cannot read properties of undefined` —cierto, pero
 *  no le dice ni qué archivo abrió ni cuál tenía que abrir.
 *
 *  Se exporta para que el banco de interfaz compruebe la clasificación sin
 *  tener que interceptar el alert(). */
export function openError(err: unknown): string {
  if (err instanceof E.UnknownSchemaError) return T('schemaUnknown').replace('{s}', err.schema);
  /* JSON.parse solo lanza SyntaxError, y solo por una razón: lo que se eligió
     no es JSON. Casi siempre es el CSV de puntos o el informe del escáner. */
  if (err instanceof SyntaxError) return T('jsonNotJson');
  if (err instanceof E.NotADocError) return T('jsonNotDoc');
  /* El resto: es un documento, pero algo de dentro está roto. La línea técnica
     se conserva —es lo único que sirve para arreglarlo— pero va detrás de la
     frase que dice qué hacer, no en su lugar. */
  return T('jsonBroken') + '\n\n' + (err instanceof Error ? err.message : String(err));
}

/** Mete una pieza MEDIDA desde el texto de un CSV.
 *
 *  Va separada del dialogo de archivo a proposito: asi el banco de interfaz
 *  puede ejercitar el camino entero sin abrir un dialogo, que es lo unico que
 *  un navegador headless no puede hacer.
 *
 *  Los puntos traen la forma real; el radio del herramental y la torsion se
 *  arrastran del nominal, porque no estan en la nube de puntos. Devuelve
 *  cuantos puntos entraron, 0 si el archivo no servia.
 */
export function importCsvText(txt: string, name: string): number {
  const n = addCsvPiece(txt, name);
  /* Apilar AQUÍ y no en el clic: entre el botón y este punto está el diálogo
     de archivo, que es asíncrono, así que el commit() del clic ya pasó. Sin
     esto la pieza importada no entraba en el historial y un deshacer se
     saltaba la importación entera. */
  if (n) commit();
  return n;
}

/** El trabajo puro, SIN tocar el historial. Existe para que el lote apile un
 *  solo paso: con el commit() dentro del bucle, importar 20 piezas gastaba 20
 *  pasos de deshacer —y serializaba el documento entero 20 veces— cuando lo
 *  que el usuario hizo fue UNA acción. Deshacer una importación tiene que
 *  costar un Ctrl+Z, no veinte. */
function addCsvPiece(txt: string, name: string): number {
  const M = ST.model!;
  const pts = E.readPointsCsv(txt);
  /* con menos de tres puntos no hay ni un doblez que medir */
  if (pts.length < 3) return 0;
  /* Ni con puntos a la escala equivocada: una columna de desviación entra por
     aquí como una barra perfecta y se compensa contra ella. Ver csvScaleOk. */
  if (!E.csvScaleOk(pts, E.fk(M).pis)) return 0;
  const ds = addDataset(E.measuredModel(M, pts), name, 'csv');
  return ds.model.bends.length + 2;
}

/** Mete un LOTE de piezas medidas: un archivo por pieza. Se repinta una sola
 *  vez al final, se apila UN solo paso de deshacer, y lo que no entró se dice
 *  de una vez en lugar de soltar un aviso por archivo.
 *
 *  Separada del diálogo por el mismo motivo que `importCsvText`: es el único
 *  trozo que un navegador headless no puede abrir, y el resto del camino sí
 *  se puede ejercitar. Devuelve el informe para que el banco lo compruebe sin
 *  tener que interceptar el alert().
 *
 *  @param files   lo que se pudo leer
 *  @param ilegibles  lo que el sistema no dejó leer, de `pickFiles` */
export function importCsvBatch(files: { text: string; name: string }[],
                               ilegibles: { name: string }[] = []
): { malos: string[]; cortos: string[] } {
  /* Lo que el sistema no dejó leer entra al mismo informe que lo que se leyó
     pero no servía: para quien importa el lote son el mismo problema —esta
     pieza no está— y lo que necesita es el nombre del archivo. */
  const malos: string[] = ilegibles.map(b => `${b.name} — ${T('fileUnread')}`);
  const cortos: string[] = [];
  /* Cuántos PI debería traer una pieza de este modelo: n dobleces + los dos
     extremos. Una pieza con menos NO es un error —puede que el escaneo no
     llegara al final— pero hay que decirlo, porque los dobleces que faltan
     se quedan sin medir y en la tabla se veían como «+0.000», idénticos a
     uno perfecto. */
  const esperados = ST.model!.bends.length + 2;
  for (const f of files) {
    const base = f.name.replace(/\.[^.]*$/, '');
    const n = addCsvPiece(f.text, base);
    if (!n) {
      /* Por qué falló, en vez de un «no se importó» a secas. */
      const p = E.parsePointsCsv(f.text);
      const causa = p.reason === 'decimalComma' ? T('csvComma')
        : p.reason === 'tooManyColumns' ? T('csvCols').replace('{n}', String(p.cols))
        /* los índices se dicen tal cual salen del archivo, empezando en 1, que
           es como los numera el informe de inspección */
        : p.reason === 'coincident' ? T('csvNear')
            .replace('{i}', p.near.map(i => i + 1).join(', '))
            .replace('{d}', String(E.PI_MIN_MM))
        /* Si el archivo se leyó bien y aun así no entró, lo que queda es la
           escala: el único rechazo que no decide parsePointsCsv. */
        : p.pts.length >= 3 ? T('csvScale')
            .replace('{n}', E.piStep(p.pts).toFixed(1))
            .replace('{m}', E.piStep(E.fk(ST.model!).pis).toFixed(1))
        : T('csvFew');
      malos.push(`${f.name} — ${causa}`);
    } else if (n !== esperados) {
      cortos.push(`${f.name} — ${n - 2}/${esperados - 2}`);
    }
  }
  renderPanels(); rebuildScene(); drawRibbon();
  /* UN commit para el lote entero: importar 20 piezas es una acción, no 20. */
  commit();
  return { malos, cortos };
}

export function importPieces(): void {
  pickFiles('.csv', (files, ilegibles) => {
    const { malos, cortos } = importCsvBatch(files, ilegibles);
    const avisos: string[] = [];
    if (malos.length) avisos.push(T('csvBad') + '\n' + malos.join('\n'));
    if (cortos.length) avisos.push(T('csvShort') + '\n' + cortos.join('\n'));
    if (avisos.length) alert(avisos.join('\n\n'));
  });
}

export function exportPoints(): void {
  download('puntos_' + safeName(ST.model!.name) + '.csv',
           E.writePointsCsv(E.fk(ST.model!).pis), 'text/csv');
}
