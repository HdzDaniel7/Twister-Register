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
export function download(name: string, text: string, mime = 'application/json'): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
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
