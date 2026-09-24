/* ---------------------------------------------------------------- reporte --
   EL MODELO, imprimible. Nombre grande arriba, la ficha de la REFERENCIA, tres
   vistas, y luego LA MISMA TABLA TRES VECES:

     1. el modelo tal como se diseñó, SIN compensar;
     2. solo las compensaciones —los Δ—, con su fila TOTAL;
     3. la suma de las dos, con su fila TOTAL.

   Que las tres tengan las mismas columnas y las mismas filas es el punto
   entero: quien lee puede sumar la fila TOTAL de la primera con la de la
   segunda y tiene que salirle la de la tercera. Por eso el Δ de cada celda se
   calcula como `total − base` y no por caminos distintos según la columna: si
   cada columna llegara por su lado, las tres tablas podrían dejar de cuadrar y
   nadie lo notaría. Para la recta eso da exactamente lo mismo que
   `straightDelta()`, que es lo que enseña la tabla de la aplicación.

   Cada modelo ENCENDIDO se lleva su bloque de columnas, así que dos modelos se
   leen lado a lado en las tres tablas —salvo cuando todos pintan lo MISMO, que
   es lo normal en la primera: las variantes son Δ sobre una base común, y
   repetir cuatro veces la misma columna es ancho gastado en decir lo mismo.
   Entonces se pinta un solo bloque rotulado «igual en todos», y la suma sigue
   cuadrando: base común + Δ del modelo = total del modelo.

   Lo que NO lleva, y es deliberado desde el 2026-09-24: el perfil de máquina y
   la pieza medida. El comando sale por su botón, en CSV, que es el formato que
   come la dobladora.

   Se pinta a pantalla completa SOBRE la aplicación, en un iframe: una ventana
   nueva la bloquea el navegador de un teléfono. Las imágenes van empotradas
   como data URI, así que el archivo que saca «Guardar HTML» se lleva tal cual
   y se abre en cualquier parte, y el de imprimir lo manda a la impresora o a
   «Guardar como PDF». Ver `makeReport()` al final.

   Las capturas se reescalan a `ANCHO_VISTA` y salen en JPEG. Suena mal en un
   dibujo técnico y por eso está medido: un render 3D lleva degradado, sombreado
   y bordes suavizados, así que el PNG no puede agrupar nada. Medido con el
   lienzo a 2400×1350 y la vista ISO del demo, reescalada a 1100 px, el PNG pesa
   498 KB y el JPEG a 0.92 pesa 92 KB. Con tres vistas eso es un reporte de
   1.5 MB contra uno de 280 KB. Ver `captureViews()` y CONTEXTO §11.          */
import * as E from './engine.ts';
import { T } from './i18n.ts';
import type { Model, Orientation, RowLength, Variant } from './types.ts';
import { ST, REF } from './state.ts';
import { captureViews } from './scene.ts';
import { fx, esc, buildTag } from './panels.ts';
import { download, safeName } from './io.ts';

/** Ancho al que se reescala cada captura, px. Llena una A4 a 300 ppp con
 *  margen de sobra y es donde la curva de bytes deja de pagar. */
const ANCHO_VISTA = 1100;
/** Calidad del JPEG. A 0.88 son 72 KB y a 0.92 son 92 KB: los 20 KB se pagan
 *  porque a 0.88 el alambre de las aristas empieza a repicar contra el fondo
 *  oscuro, y el alambre es justo lo que se mira en una vista de planta. */
const CALIDAD = .92;

/** La orientación como TEXTO PELADO, no como la insignia de la interfaz:
 *  `oriTag()` emite un `<span class="ori W">` que se colorea con la hoja de
 *  estilo de la aplicación, y esta ventana no la tiene. */
const orLabel = (o: Orientation, redonda: boolean): string => (redonda ? 'Ø' : o);

/** Un modelo encendido, con su base y su efectivo ya resueltos. Se calcula una
 *  vez y lo comen las tres tablas. */
type Encendido = {
  v: Variant;
  /** lo diseñado, sin Δ */
  base: Model;
  /** base + Δ, que es lo que se dibuja */
  eff: Model;
  BL: RowLength[];
  EL: RowLength[];
};

/** Cuál de las tres tablas se está pintando. */
type Modo = 'base' | 'delta' | 'total';

/** Las cifras de una fila. `rad` va aparte porque en la tabla de totales no se
 *  suma: sumar radios de herramental no significa nada. */
type Cifras = { ang: number; rot: number; tw: number; rad: number; str: number; cum: number };

/* Solo se llega aquí con un modelo cargado: por eso `ST.model` se da por
   existente. */
export function reportHtml(): string {
  /* LA CABECERA HABLA DE LA REFERENCIA, no del modelo activo. Es lo que ancla
     todo lo demás —el 3D, la columna «Δ punta», las celdas marcadas— y no
     cambia porque alguien pinche otra variante antes de imprimir. */
  const R = E.effectiveModel(REF());
  const redonda = R.section.kind === 'round';
  const shots = captureViews(['iso', 'top', 'front'],
                             { maxW: ANCHO_VISTA, tipo: 'image/jpeg', calidad: CALIDAD });
  const orient = E.orientations(R);

  /* LOS MODELOS ENCENDIDOS, en el orden del documento. Es la misma lista que
     decide qué se dibuja en el 3D —`visible`— así que lo que sale en las fotos
     y lo que sale en las tablas es la misma pieza. */
  const mods: Encendido[] = ST.variants.filter(x => x.visible).map(x => {
    const eff = E.effectiveModel(x);
    return { v: x, base: x.base, eff, BL: E.fibreLengths(x.base), EL: E.fibreLengths(eff) };
  });
  /* El número de dobleces puede diferir entre modelos —se agregan y se borran
     por variante— así que las tablas llegan hasta el MÁXIMO y la celda que no
     existe sale vacía, no a cero: un cero ahí sería un ángulo de cero grados,
     que es un doblez de verdad. */
  const nMax = mods.reduce((a, d) => Math.max(a, d.eff.bends.length), R.bends.length);

  /* La columna de TORSIÓN solo aparece si alguien la usa. Una columna de
     guiones en tres tablas seguidas no informa de nada y se lleva el ancho que
     necesitan las que sí. */
  const conTwist = mods.some(d =>
    d.base.bends.some(b => b.twist) || d.eff.bends.some(b => b.twist));

  const filaDe = (d: Encendido, i: number, modo: Modo): Cifras | null => {
    if (i >= d.base.bends.length || i >= d.eff.bends.length) return null;
    const b = d.base.bends[i], e = d.eff.bends[i], BL = d.BL[i], EL = d.EL[i];
    if (modo === 'base') {
      return { ang: b.angle, rot: b.rot, tw: b.twist, rad: b.radius, str: BL.straight, cum: BL.cum };
    }
    if (modo === 'total') {
      return { ang: e.angle, rot: e.rot, tw: e.twist, rad: e.radius, str: EL.straight, cum: EL.cum };
    }
    return {
      ang: e.angle - b.angle, rot: e.rot - b.rot, tw: (e.twist || 0) - (b.twist || 0),
      rad: e.radius - b.radius, str: EL.straight - BL.straight, cum: EL.cum - BL.cum,
    };
  };

  /** La cola: es una recta más y entra en la desarrollada, así que tiene fila
   *  propia en las tres tablas. No tiene arco, así que no lleva Σ L. */
  const colaDe = (d: Encendido, modo: Modo): number => {
    const b = E.tailStraight(d.base), e = E.tailStraight(d.eff);
    return modo === 'base' ? b : modo === 'total' ? e : e - b;
  };

  /** La fila TOTAL. `str` suma las rectas MÁS la cola, y `cum` es la
   *  desarrollada: así la última columna se lee de arriba abajo y el total de
   *  la tabla 1 más el de la 2 da el de la 3. */
  const totalDe = (d: Encendido, modo: Modo): Cifras => {
    const suma = (m: Model) => m.bends.reduce((a, b) => ({
      ang: a.ang + b.angle, rot: a.rot + b.rot, tw: a.tw + (b.twist || 0),
    }), { ang: 0, rot: 0, tw: 0 });
    const rect = (L: RowLength[], m: Model) =>
      L.reduce((a, r) => a + r.straight, 0) + E.tailStraight(m);
    const sb = suma(d.base), se = suma(d.eff);
    const cb = { ...sb, rad: 0, str: rect(d.BL, d.base), cum: E.developedLength(d.base) };
    const ce = { ...se, rad: 0, str: rect(d.EL, d.eff), cum: E.developedLength(d.eff) };
    if (modo === 'base') return cb;
    if (modo === 'total') return ce;
    return {
      ang: ce.ang - cb.ang, rot: ce.rot - cb.rot, tw: ce.tw - cb.tw, rad: 0,
      str: ce.str - cb.str, cum: ce.cum - cb.cum,
    };
  };

  /* --- una celda ------------------------------------------------------------
     En la tabla de Δ el cero se apaga y el resto lleva signo: la columna solo
     debe cantar donde hay corrección. En la de totales se marca lo que se
     separa de la REFERENCIA, y se compara el TEXTO ya redondeado y no el
     número: con el número crudo, dos celdas que imprimen 90.0 y 90.0 salían
     marcadas por un resto de 1e-13, que es una diferencia que nadie puede ver
     ni fabricar. */
  const celda = (v: number | null, n: number, modo: Modo, ref: number | null,
                 cls = ''): string => {
    if (v === null) return `<td class="${cls}z">—</td>`;
    if (modo === 'delta') {
      const z = +v.toFixed(n) === 0;
      return `<td class="${cls}${z ? 'z' : 'd'}">${z ? '—' : (v > 0 ? '+' : '') + fx(v, n)}</td>`;
    }
    const t = fx(v, n);
    return `<td class="${cls}${ref !== null && t !== fx(ref, n) ? 'd' : ''}">${t}</td>`;
  };

  /** El bloque de columnas de un modelo en una fila, o el hueco si no llega. */
  const bloque = (c: Cifras | null, r: Cifras | null, modo: Modo): string => {
    const g = 'grp ';
    if (!c) {
      return `<td class="${g}z">—</td><td class="z">—</td>${conTwist ? '<td class="z">—</td>' : ''}`
           + '<td class="z">—</td><td class="z">—</td><td class="z">—</td>';
    }
    return celda(c.ang, 1, modo, r && r.ang, g)
         + celda(c.rot, 1, modo, r && r.rot)
         + (conTwist ? celda(c.tw, 1, modo, r && r.tw) : '')
         + celda(c.rad, 1, modo, r && r.rad)
         + celda(c.str, 2, modo, r && r.str)
         + celda(c.cum, 2, modo, r && r.cum);
  };

  const anchoBloque = conTwist ? 6 : 5;

  /* --- UNA SOLA COLUMNA CUANDO TODOS PINTAN LO MISMO ------------------------
     Las variantes son Δ sobre una base común, así que lo normal es que la
     tabla 1 —el modelo SIN compensar— salga idéntica en todos los modelos
     encendidos, y repetirla cuatro veces es ancho gastado en decir lo mismo.
     Cuando eso pasa se pinta UN bloque y se rotula «igual en todos».

     La comparación se hace sobre las cifras TAL COMO SE IMPRIMEN y no sobre
     los números crudos: lo que se está preguntando es «¿estas dos columnas se
     ven iguales?», y con el número crudo un resto de 1e-13 mantendría dos
     columnas idénticas en pantalla. Se pregunta por tabla y no de una vez, así
     que la 1 puede colapsar mientras la 3 sigue abierta —que es justo el caso
     de siempre— y sigue cuadrando: base común + Δ del modelo = total del
     modelo. */
  const firma = (d: Encendido, modo: Modo): string => {
    const p: string[] = [];
    for (let i = 0; i < nMax; i++) {
      const c = filaDe(d, i, modo);
      p.push(c ? [fx(c.ang, 1), fx(c.rot, 1), fx(c.tw, 1),
                  fx(c.rad, 1), fx(c.str, 2), fx(c.cum, 2)].join('|') : '-');
    }
    const t = totalDe(d, modo);
    p.push(fx(colaDe(d, modo), 2));
    p.push([fx(t.ang, 1), fx(t.rot, 1), fx(t.tw, 1), fx(t.str, 2), fx(t.cum, 2)].join('|'));
    return p.join(';');
  };

  /** Una de las tres tablas. El modelo de REFERENCIA no se marca contra sí
   *  mismo, y en la tabla de Δ no se marca nada: ahí el resalte ya lo lleva
   *  tener un Δ distinto de cero. */
  const tabla = (modo: Modo): string => {
    const uno = mods.length > 1
      && mods.every(d => firma(d, modo) === firma(mods[0], modo));
    /* colapsada se enseña la de la REFERENCIA, que es la que ancla todo lo
       demás; si la referencia estuviera apagada, la primera encendida */
    const cols = uno ? [mods.find(d => d.v.id === ST.ref) || mods[0]] : mods;

    /* `data-mod` va solo cuando el bloque habla de UN modelo. Colapsado no hay
       a quién atribuirlo, y el banco cuenta modelos por las filas de la tabla
       de arriba (`data-mrow`), que están siempre. */
    const cab = uno
      ? `<th scope="col" colspan="${anchoBloque}" class="grp">${T('repSameAll')}</th>`
      : cols.map(({ v: x }) =>
          `<th scope="col" colspan="${anchoBloque}" class="grp" data-mod="${esc(x.id)}"
             style="border-bottom:3px solid ${esc(x.color)}">${esc(x.name)}</th>`).join('');
    const sub = cols.map(() =>
      `<th scope="col" class="grp">${T('ang')}</th><th scope="col">${T('rot')}</th>`
      + (conTwist ? `<th scope="col">${T('twist')}</th>` : '')
      + `<th scope="col">${T('rad')}</th><th scope="col">${T('straight')}</th>`
      + `<th scope="col">${T('cumL')}</th>`).join('');

    const iRef = cols.findIndex(d => d.v.id === ST.ref);
    /* colapsada no se marca nada: todas las columnas son la misma */
    const refFila = (i: number): Cifras | null =>
      (uno || modo === 'delta' || iRef < 0 ? null : filaDe(cols[iRef], i, modo));
    const filas = Array.from({ length: nMax }, (_, i) => {
      const cels = cols.map(d => bloque(filaDe(d, i, modo),
                                        d.v.id === ST.ref ? null : refFila(i), modo)).join('');
      const o = i < R.bends.length ? orLabel(orient[i], redonda) : '';
      return `<tr><td>B${i + 1}</td><td>${o}</td>${cels}</tr>`;
    }).join('');
    /* la cola y el TOTAL son filas, no un pie aparte: se tienen que poder
       sumar con la vista, que es para lo que están las tres tablas */
    const cola = cols.map(d => {
      const v = colaDe(d, modo);
      return `<td class="grp z">—</td><td class="z">—</td>${conTwist ? '<td class="z">—</td>' : ''}`
           + '<td class="z">—</td>'
           + celda(v, 2, modo, null) + '<td class="z">—</td>';
    }).join('');
    const tot = cols.map(d => {
      const c = totalDe(d, modo);
      return celda(c.ang, 1, modo, null, 'grp ')
           + celda(c.rot, 1, modo, null)
           + (conTwist ? celda(c.tw, 1, modo, null) : '')
           + '<td class="z">—</td>'
           + celda(c.str, 2, modo, null)
           + celda(c.cum, 2, modo, null);
    }).join('');
    return `<div class="tw"><table><thead>
      <tr><th scope="col" rowspan="2">${T('nBend')}</th>
          <th scope="col" rowspan="2">${T('ori')}</th>${cab}</tr>
      <tr>${sub}</tr></thead>
      <tbody>${filas}
        <tr class="foot"><td>${T('tailRow')}</td><td></td>${cola}</tr>
        <tr class="tot"><td>${T('repTotal')}</td><td></td>${tot}</tr>
      </tbody></table></div>`;
  };

  /* --- resumen por modelo: cuánto mide y cuánto se separa de la referencia -- */
  const resumen = mods.map(({ v: x, eff }) => {
    let shift = 0;
    if (x.id !== ST.ref) {
      const sh = E.piShift(eff, R, ST.anchor);
      shift = ST.anchor === 'end' ? sh[0] : sh[sh.length - 1];
    }
    /* `data-mrow` es el gancho del banco: esta tabla lista EXACTAMENTE los
       modelos encendidos, una fila cada uno, colapsen o no las de abajo. */
    return `<tr data-mrow="${esc(x.id)}"><td><span class="sw" style="background:${esc(x.color)}"></span>${esc(x.name)}${
      x.id === ST.ref ? ' · ' + T('isRef') : ''}</td>
      <td>${eff.bends.length}</td>
      <td>${fx(E.developedLength(eff), 1)}</td>
      <td>${x.id === ST.ref ? '—' : fx(shift, 2)}</td></tr>`;
  }).join('');

  const anchorLab = { start: T('aStart'), end: T('aEnd'), best: T('aBest') }[ST.anchor];
  const seccion = redonda
    ? `Ø ${fx(R.section.width, 1)}`
    : `${fx(R.section.width, 1)} × ${fx(R.section.thickness, 1)}`;
  const capt: Record<string, string> = { iso: T('vIso'), top: T('vTop'), front: T('vFront') };

  const html = `<!doctype html><html lang="${esc(document.documentElement.lang || 'es')}">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(R.name)}</title>
  <style>
  :root{--ln:#dcdfe4;--dim:#6b7280}
  *{box-sizing:border-box}
  body{font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;background:#fff;color:#111;
       margin:0 auto;padding:22px 18px 40px;max-width:1180px}
  h1{font:700 30px/1.15 system-ui,sans-serif;letter-spacing:-.01em;margin:0 0 3px;word-break:break-word}
  h2{font:600 10px system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;
     color:var(--dim);margin:22px 0 5px;border-top:1px solid var(--ln);padding-top:9px}
  .sub{color:var(--dim);font-size:11px;margin:0 0 14px}
  .kv{display:flex;gap:6px 20px;flex-wrap:wrap;border:1px solid var(--ln);
      padding:9px 12px;border-radius:5px;margin:0 0 16px}
  .kv span{color:var(--dim)}
  .shots{display:flex;flex-wrap:wrap;gap:8px}
  figure{margin:0;flex:1 1 300px}
  figure.wide{flex:1 1 100%}
  img{width:100%;display:block;border:1px solid var(--ln);border-radius:5px;background:#080A0E}
  figcaption{font:600 9px system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;
             color:var(--dim);padding-top:3px}
  .tw{overflow-x:auto}
  table{border-collapse:collapse;width:100%;font-size:11px}
  th{background:#f2f4f7;text-align:right;padding:5px 6px;border:1px solid var(--ln);
     font:600 9px system-ui,sans-serif;letter-spacing:.07em;text-transform:uppercase;white-space:nowrap}
  td{text-align:right;padding:3px 6px;border:1px solid #ebedf0;white-space:nowrap}
  th:first-child,td:first-child{text-align:left}
  tr.foot td{background:#fafbfc}
  tr.tot td{background:#eef1f5;font-weight:700;border-top:2px solid #b9c0ca}
  .grp{border-left:2px solid #c3c8d0}
  .z{color:#b6bcc6}
  .d{color:#8a4b00;font-weight:600}
  .sw{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px}
  /* La barra se queda PEGADA arriba. En un teléfono el reporte son varias
     pantallas de tabla, y si la barra se va con el scroll no queda salida:
     Escape no existe en un teclado que no está. Los márgenes negativos son
     los del padding del body, para que lo que pasa por debajo no asome por
     los lados. */
  .bar{display:flex;gap:10px;align-items:center;position:sticky;top:0;z-index:2;
       background:#fff;margin:0 -18px 14px;padding:10px 18px;border-bottom:1px solid var(--ln)}
  .bar button{white-space:nowrap}
  button{font:600 12px system-ui,sans-serif;padding:7px 14px;border:1px solid var(--ln);
         border-radius:5px;background:#f6f7f9;cursor:pointer}
  @media print{
    body{padding:0;max-width:none}
    .noprint{display:none}
    h2{break-after:avoid}
    table,figure{break-inside:avoid}
    @page{margin:12mm}
  }
  @media(max-width:560px){
    body{padding:14px 12px 30px}
    h1{font-size:23px}
    figure{flex:1 1 100%}
    /* los tres botones en UN renglón: partidos en dos líneas quedan de
       alturas distintas y el rótulo del documento sobra, que el nombre del
       modelo va en el h1 justo debajo */
    .bar{margin:0 -12px 12px;padding:8px 12px}
    .bar .sub{display:none}
    .bar button{min-height:34px}
  }
  </style>
  <div class="bar noprint"><button onclick="print()">${T('repPrint')}</button>
    <span class="sub" style="margin:0">${T('repModel')}</span></div>
  <h1>${esc(R.name)}</h1>
  <div class="sub">BARCOMP ${buildTag()} · ${new Date().toLocaleString()}</div>
  <div class="kv">
    <div><span>${T('stBends')}</span> ${R.bends.length}</div>
    <div><span>${T('stLen')}</span> ${fx(E.developedLength(R), 1)} mm</div>
    <div><span>${T('section')}</span> ${T(redonda ? 'secRound' : 'secRect')} ${seccion} mm</div>
    <div><span>${T('tolA')}</span> ±${R.tol.angle}°</div>
    <div><span>${T('tolP')}</span> ±${R.tol.point} mm</div>
    <div><span>${T('anchor')}</span> ${anchorLab}</div>
  </div>
  <div class="shots">${shots.map(([n, u], i) =>
    `<figure class="${i === 0 ? 'wide' : ''}"><img src="${u}" alt="${capt[n] || n}">
     <figcaption>${capt[n] || n}</figcaption></figure>`).join('')}</div>

  <h2>${T('variants')}</h2>
  <div class="tw"><table><thead><tr><th scope="col">${T('name')}</th>
    <th scope="col">${T('stBends')}</th><th scope="col">${T('stLen')} mm</th>
    <th scope="col">${T('dTip')} mm</th></tr></thead><tbody>${resumen}</tbody></table></div>

  <h2>1 · ${T('repBase')}</h2>
  ${tabla('base')}

  <h2>2 · ${T('repAdjust')}</h2>
  ${tabla('delta')}

  <h2>3 · ${T('repTotals')}</h2>
  ${tabla('total')}
  </html>`;

  return html;
}

/* ---------------------------------------------------------- la ventanilla --
   El reporte se pinta DENTRO de la página. Antes salía por `window.open()`, y
   eso en un teléfono se cae: el navegador bloquea la emergente, `w` queda en
   null y lo único que aparecía era un `alert` con «Reporte de modelo» —el
   rótulo del documento, no un mensaje— y ningún reporte. Medido con las
   emergentes bloqueadas: `window.open` llamado 1 vez, ese alert, cero reporte
   en la página.

   Va en un `<iframe>` y no en un `<div>` con el HTML dentro, porque el reporte
   trae su propia hoja de estilo con reglas sobre `body`, `table` y `button`:
   soltarla en el documento de la aplicación se llevaría la interfaz por
   delante. Medido: dentro del iframe el `body` sale blanco y el de la
   aplicación sigue en rgb(11,14,19).

   Se escribe con `document.write()` y no con `srcdoc` porque write es
   SÍNCRONO —al volver, el documento ya está parseado— y así el banco lo lee
   sin esperar ningún `load`. Bajo `file://` el iframe hereda el origen, de
   modo que el padre puede meterle sus dos botones en la barra que el reporte
   ya trae, en vez de pintarle otra barra encima: dos barras apiladas en la
   pantalla de un teléfono son 90 px gastados en decir lo mismo.             */

/** Cierra el reporte si está abierto. Idempotente: lo llaman el botón, la
 *  tecla y el propio `makeReport()` antes de abrir otro. */
export function closeReport(): void {
  document.getElementById('repov')?.remove();
  document.removeEventListener('keydown', onEsc, true);
}

/** Escape cierra. Va en captura y en LOS DOS documentos: con el foco dentro
 *  del iframe la tecla no burbujea al padre, así que un solo oyente dejaría el
 *  reporte sin salida por teclado justo cuando se está leyendo. */
function onEsc(ev: KeyboardEvent): void {
  if (ev.key !== 'Escape' || !document.getElementById('repov')) return;
  ev.stopPropagation();
  closeReport();
}

/** Un botón para la barra del reporte. El documento es el del iframe, así que
 *  el elemento se crea con SU `createElement` y no con el del padre. */
function barBtn(d: Document, k: string, lab: string, fn: () => void): HTMLButtonElement {
  const b = d.createElement('button');
  b.setAttribute('data-rep', k);
  b.textContent = lab;
  b.onclick = fn;
  return b;
}

/** El reporte, a pantalla completa sobre la aplicación. Es lo que cuelga del
 *  botón. */
export function makeReport(): void {
  closeReport();
  const html = reportHtml();
  const archivo = (): void => download(safeName(REF().name) + '.html', html, 'text/html');

  const ov = document.createElement('div');
  ov.id = 'repov';
  const fr = document.createElement('iframe');
  fr.id = 'repfr';
  fr.title = T('repModel');
  ov.appendChild(fr);
  document.body.appendChild(ov);

  const d = fr.contentDocument;
  /* Sin documento no hay dónde pintar, y un recuadro vacío es peor que nada:
     el reporte se entrega como archivo, que es para lo que sirve igual. */
  if (!d) { ov.remove(); archivo(); return; }
  d.open();
  d.write(html);
  d.close();

  /* Los dos botones van en la barra que el reporte ya trae, alrededor del de
     imprimir: cerrar primero, porque es la salida, y guardar al lado. El HTML
     que se guarda es el de antes de tocar nada, así que el archivo no se lleva
     un botón «Cerrar» que fuera de aquí no cierra nada. */
  const bar = d.querySelector('.bar');
  if (bar) {
    bar.insertBefore(barBtn(d, 'close', T('mnClose'), closeReport), bar.firstChild);
    bar.insertBefore(barBtn(d, 'save', T('repSave'), archivo), bar.querySelector('.sub'));
  }
  d.addEventListener('keydown', onEsc, true);
  document.addEventListener('keydown', onEsc, true);
  /* El foco al reporte: sin él, Ctrl+P manda a la impresora la aplicación que
     queda debajo. */
  fr.contentWindow?.focus();
}
