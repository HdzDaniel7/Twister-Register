/* -------------------------------------------------------------------- E/S --
   Todo local: descarga por Blob y lectura por <input type=file>. Nada de
   fetch(), CDNs ni almacenamiento del navegador — el visor tiene que correr
   bajo file:// en un taller sin red.

   La lectura va por `File.text()` y no por FileReader: devuelve una promesa,
   así que un archivo ilegible RECHAZA en vez de quedarse callado. Con
   FileReader había que acordarse de poner `onerror`, y no estaba: un archivo
   que el sistema no dejaba leer —movido, bloqueado por otro programa, un
   permiso denegado— dejaba el contador del lote sin llegar a cero y el
   callback no se llamaba nunca. El lote entero se colgaba sin decir nada.  */
/** Guarda un archivo. Donde el navegador lo permite (Chrome/Edge de escritorio)
 *  abre el diálogo «Guardar como» para elegir carpeta y nombre; si no existe,
 *  o falla por otro motivo que no sea cancelar, cae a la descarga normal. */
type SaveHandle = { createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> };
type Picker = (o: { suggestedName: string; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<SaveHandle>;

function plainDownload(name: string, blob: Blob): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function download(name: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime });
  const pick = (window as unknown as { showSaveFilePicker?: Picker }).showSaveFilePicker;
  if (!pick) { plainDownload(name, blob); return; }
  const ext = /\.[A-Za-z0-9]+$/.exec(name);
  const opts = { suggestedName: name,
    types: ext ? [{ description: name, accept: { [mime]: [ext[0]] } }] : undefined };
  void pick.call(window, opts).then(async h => {
    const w = await h.createWritable();
    await w.write(blob);
    await w.close();
  }).catch((e: unknown) => {
    if (e instanceof DOMException && e.name === 'AbortError') return;   /* canceló */
    plainDownload(name, blob);
  });
}

/** Un archivo. `onFail` recibe el nombre y el motivo si no se pudo leer; sin
 *  él, un archivo ilegible se pierde en silencio, que es justo lo que se está
 *  arreglando. */
export function pickFile(accept: string,
                         cb: (text: string, name: string) => void,
                         onFail?: (name: string, err: Error) => void): void {
  const i = document.createElement('input');
  i.type = 'file';
  i.accept = accept;
  i.onchange = () => {
    const f = i.files?.[0];
    if (!f) return;
    f.text().then(t => cb(t, f.name), (e: unknown) => onFail?.(f.name, asError(e)));
  };
  i.click();
}

/** Varios archivos de una vez, y el callback se llama UNA sola vez con todos.
 *  Es lo que hace falta para importar un lote: la variacion entre piezas no se
 *  ve con una sola, y repintar la interfaz por archivo seria absurdo.
 *
 *  `allSettled` y no `all`: un archivo ilegible NO cancela el lote. Los que se
 *  leyeron llegan en `fs` y los que no, en `bad`, para que quien llame diga
 *  cuál falló y siga con el resto. */
export function pickFiles(accept: string,
                          cb: (fs: { text: string; name: string }[],
                               bad: { name: string; err: Error }[]) => void): void {
  const i = document.createElement('input');
  i.type = 'file';
  i.accept = accept;
  i.multiple = true;
  i.onchange = () => {
    const list = [...(i.files || [])];
    if (!list.length) return;
    void Promise.allSettled(list.map(f => f.text())).then(res => {
      const out: { text: string; name: string }[] = [];
      const bad: { name: string; err: Error }[] = [];
      res.forEach((r, k) => {
        if (r.status === 'fulfilled') out.push({ text: r.value, name: list[k].name });
        else bad.push({ name: list[k].name, err: asError(r.reason) });
      });
      cb(out, bad);
    });
  };
  i.click();
}

/** Lo que rechaza una promesa no tiene por qué ser un Error. */
const asError = (e: unknown): Error => e instanceof Error ? e : new Error(String(e));

export const safeName = (s: unknown): string => String(s || 'barcomp').replace(/\W+/g, '_');
