/* -------------------------------------------------------------------- E/S --
   Todo local: descarga por Blob y lectura por <input type=file>. Nada de
   fetch(), CDNs ni almacenamiento del navegador — el visor tiene que correr
   bajo file:// en un taller sin red.                                        */
export function download(name, text, mime = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function pickFile(accept, cb) {
  const i = document.createElement('input');
  i.type = 'file';
  i.accept = accept;
  i.onchange = () => {
    const f = i.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => cb(r.result, f.name);
    r.readAsText(f);
  };
  i.click();
}

export const safeName = s => String(s || 'barcomp').replace(/\W+/g, '_');
