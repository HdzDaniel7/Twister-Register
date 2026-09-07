/* -------------------------------------------------------------------- E/S --
   Todo local: descarga por Blob y lectura por <input type=file>. Nada de
   fetch(), CDNs ni almacenamiento del navegador — el visor tiene que correr
   bajo file:// en un taller sin red.                                        */
export function download(name: string, text: string, mime = 'application/json'): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function pickFile(accept: string, cb: (text: string, name: string) => void): void {
  const i = document.createElement('input');
  i.type = 'file';
  i.accept = accept;
  i.onchange = () => {
    const f = i.files![0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => cb(r.result as string, f.name);
    r.readAsText(f);
  };
  i.click();
}

/** Varios archivos de una vez, y el callback se llama UNA sola vez con todos.
 *  Es lo que hace falta para importar un lote: la variacion entre piezas no se
 *  ve con una sola, y repintar la interfaz por archivo seria absurdo. */
export function pickFiles(accept: string, cb: (fs: { text: string; name: string }[]) => void): void {
  const i = document.createElement('input');
  i.type = 'file';
  i.accept = accept;
  i.multiple = true;
  i.onchange = () => {
    const list = [...(i.files || [])];
    if (!list.length) return;
    let left = list.length;
    const out: { text: string; name: string }[] = new Array(list.length);
    list.forEach((f, k) => {
      const r = new FileReader();
      r.onload = () => {
        out[k] = { text: r.result as string, name: f.name };
        if (--left === 0) cb(out);
      };
      r.readAsText(f);
    });
  };
  i.click();
}

export const safeName = (s: unknown): string => String(s || 'barcomp').replace(/\W+/g, '_');
