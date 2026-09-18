/* =========================================================================
   PESTAÑA SECCIÓN — la cara de la barra, dibujada a escala, con las medidas
   encima y los campos al lado.

   Fue un cajón del menú de arriba hasta el 2026-09-18, y el taller lo devolvió
   por un motivo bueno: la barra de menús se corta cuando la ventana no es
   ancha, así que el botón que abría la ventana podía no verse. Una pestaña no
   se corta —van en su propia fila y son las mismas que Modelo o Puntos— y
   además cabe el dibujo, que es lo que de verdad pedía el taller: ver lo que
   se está tecleando.

   Y de paso arregla un reparto que nunca estuvo bien: las medidas estaban en
   DOS sitios —la banda de la pestaña «Modelo» y la ventana— con el mismo
   `data-s`. Eran dos vistas de un dato, no dos copias, pero obligaban a mirar
   en dos lados para entender una sección. Ahora están aquí y solo aquí.

   EL DIBUJO. Se saca de `E.sectionOutline()`, que es EXACTAMENTE el contorno
   que barre el 3D y el que contestan las cuentas del contacto: dibujar aquí un
   cuadrado donde la física cuenta un círculo es la manera de que la pantalla y
   los números discrepen sin que nadie lo note. Las únicas dos cosas que el
   dibujo añade por su cuenta:

     · el HUECO, que el contorno no lleva porque a las seis cuentas les da
       igual por dónde va la pared —solo cambia el área y las inercias—, pero
       que es justo lo que uno quiere ver al teclear un tubo;
     · el CHAFLÁN, a trazos y dicho con todas las letras en la nota de abajo,
       porque no entra en ninguna cuenta. Verlo a trazos es la única forma de
       que no parezca un dato.

   El SVG va en unidades de milímetro y se estira con CSS: así la escala del
   dibujo ES la de la barra, un 40×12 se ve como un 40×12, y los trazos se
   mantienen finos con `vector-effect` en vez de con números mágicos.
   ========================================================================= */
import * as E from '../engine.ts';
import { T } from '../i18n.ts';
import type { Model, Section } from '../types.ts';
import { ST } from '../state.ts';
import { esc, nfield, fx } from './fmt.ts';
import type { I18nKey } from './fmt.ts';

/** Las medidas interiores que el dibujo necesita y las cuentas no. */
const dentro = (sec: Section): { w: number; t: number } | null => {
  if (!E.isHollow(sec)) return null;
  const e = sec.wall;
  return { w: sec.width - 2 * e, t: (sec.kind === 'round' ? sec.width : sec.thickness) - 2 * e };
};

/** Una cota: la línea con sus dos topes y el número encima.
 *
 *  Topes en diagonal y no puntas de flecha: una punta pide `<defs><marker>`,
 *  y un marcador dentro de un `innerHTML` que se reescribe en cada repintado
 *  es un id que se repite. La diagonal es lo que usa un plano de taller. */
function cota(
  x1: number, y1: number, x2: number, y2: number, txt: string, fs: number,
): string {
  const d = fs * 0.45;
  const tope = (x: number, y: number): string =>
    `<line x1="${x - d}" y1="${y + d}" x2="${x + d}" y2="${y - d}"/>`;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  /* el número siempre se lee horizontal o de abajo arriba, nunca del revés */
  const rot = x1 === x2 ? ` transform="rotate(-90 ${mx} ${my})"` : '';
  return `<g class="secdim">
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>${tope(x1, y1)}${tope(x2, y2)}
    <text x="${mx}" y="${my - fs * 0.35}" font-size="${fs}"${rot}>${esc(txt)}</text></g>`;
}

/** La pared, que es corta y no cabe con una cota normal.
 *
 *  Va en el eje vertical de arriba, que es donde hay material en las dos
 *  formas —en una redonda el borde del rectángulo envolvente NO es la pieza—,
 *  y el número sale disparado a un lado con su línea de guía, porque dos
 *  milímetros de pared no tienen sitio dentro para escribir «2.0». */
function cotaPared(yTop: number, wall: number, fs: number, fuera: number): string {
  const y2 = yTop + wall;
  const d = fs * 0.4;
  return `<g class="secdim">
    <line x1="0" y1="${yTop}" x2="0" y2="${y2}"/>
    <line x1="${-d}" y1="${yTop}" x2="${d}" y2="${yTop}"/>
    <line x1="${-d}" y1="${y2}" x2="${d}" y2="${y2}"/>
    <line x1="0" y1="${(yTop + y2) / 2}" x2="${fuera}" y2="${yTop - fs}"/>
    <text x="${fuera + fs * 1.4}" y="${yTop - fs * 0.7}"
      font-size="${fs}">${esc(fx(wall, 1))}</text></g>`;
}

/** La cara de la barra a escala, en milímetros, con sus cotas. */
export function sectionFigure(sec: Section): string {
  const redonda = sec.kind === 'round';
  const W = sec.width, TH = redonda ? sec.width : sec.thickness;
  const S = Math.max(W, TH);
  /* Márgenes proporcionales: las cotas van fuera de la pieza, y en una barra
     de 12 mm de espesor el hueco para la cota no puede medirse en milímetros
     fijos o el número tapa la pieza. */
  const fs = S / 11;
  const mL = S * 0.34 + fs, mB = S * 0.34 + fs, mT = fs * 2.6, mR = S * 0.30 + fs;
  const vb = `${-(W / 2 + mL)} ${-(TH / 2 + mT)} ${W + mL + mR} ${TH + mT + mB}`;

  /* El contorno EXTERIOR sale del motor, sin tocarlo: `sectionOutline` da
     pares [a,b] que multiplican a `y` (el espesor) y a `z` (el ancho), así que
     en pantalla el ancho va en x y el espesor en y, hacia abajo. */
  const pts = E.sectionOutline(sec, 72)
    .map(([a, b]) => `${b},${-a}`).join(' ');
  const hueco = dentro(sec);
  const pared = hueco
    ? (redonda
      ? `<circle class="sechole" cx="0" cy="0" r="${hueco.w / 2}"/>`
      : `<rect class="sechole" x="${-hueco.w / 2}" y="${-hueco.t / 2}"
           width="${hueco.w}" height="${hueco.t}"/>`)
    : '';
  /* El chaflán, a trazos: se dibuja y no cuenta. Ver la cabecera. */
  const ch = Math.min(sec.chamfer, Math.min(W, TH) / 2);
  const chaf = (!redonda && ch > 0)
    ? [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sy]) =>
      `<line x1="${sx * (W / 2 - ch)}" y1="${sy * TH / 2}"
             x2="${sx * W / 2}" y2="${sy * (TH / 2 - ch)}"/>`).join('')
    : '';

  const yBase = TH / 2 + mB * 0.62;
  const xBase = -(W / 2 + mL * 0.62);
  const cotas = redonda
    ? cota(-W / 2, 0, W / 2, 0, `Ø${fx(W, 1)}`, fs)
    : cota(-W / 2, yBase, W / 2, yBase, fx(W, 1), fs)
      + cota(xBase, -TH / 2, xBase, TH / 2, fx(TH, 1), fs);
  /* La pared se acota donde se ve: del borde de fuera al de dentro, arriba. */
  const cPared = hueco ? cotaPared(-TH / 2, sec.wall, fs * 0.85, W * 0.30) : '';

  return `<svg class="secsvg" viewBox="${vb}" role="img"
      aria-label="${esc(T('secFig'))}" preserveAspectRatio="xMidYMid meet">
    <polygon class="secout" points="${pts}"/>${pared}
    <g class="secchamfer">${chaf}</g>
    <line class="secaxis" x1="${-(W / 2 + mL * 0.22)}" y1="0" x2="${W / 2 + mR * 0.35}" y2="0"/>
    ${cotas}${cPared}</svg>`;
}

/* ================================================================ pestaña == */
export function paneSection(M: Model): string {
  const sec = M.section;
  const redonda = sec.kind === 'round';
  const I = E.sectionI(sec);
  const area = E.sectionArea(sec);
  /* kg por metro: el mismo camino que usa la flecha, pasado a lo que dice un
     catálogo. Si no hay material puesto no se inventa: se deja en blanco. */
  const kgm = ST.mat.rho ? E.lineLoad(sec, ST.mat) * 1000 / 9.81 : null;
  const opciones: [string, I18nKey][] = [['rect', 'secRect'], ['round', 'secRound']];
  return `<div class="pane on"><div class="grp">
    <div class="eyebrow">${T('section')}</div><div class="body">
    <div class="hintline">${T('secTip')}</div>
    <div class="secwrap mt6">
      <div class="secfig">${sectionFigure(sec)}
        <div class="hintline">${T(redonda ? 'secChamNone' : 'secChamNote')}</div></div>
      <div class="secfields">
        <div class="seg" role="group" aria-label="${esc(T('secKind'))}">
          ${opciones.map(([k, lab]) => `<button data-sk="${k}"
            class="${sec.kind === k ? 'on' : ''}"
            aria-pressed="${sec.kind === k}">${T(lab)}</button>`).join('')}</div>
        <div class="fgrid mt6">
          <label>${T(redonda ? 'dia' : 'width')} (mm)</label>${
            nfield('.1', 'data-s="width"', sec.width)}
          ${redonda ? '' : `<label>${T('thick')} (mm)</label>${
            nfield('.1', 'data-s="thickness"', sec.thickness)}`}
          <label>${T('wall')} (mm)</label>${nfield('.1', 'data-s="wall"', sec.wall)}
          <label>${T('chamfer')} (mm)</label>${nfield('.1', 'data-s="chamfer"', sec.chamfer)}
          <label>${T('endlen')} (mm)</label>${nfield('.5', 'data-s="endLen"', sec.endLen)}
        </div>
        <div class="hintline">${T('wallHint')}</div>
        <div class="row mt6"><span class="chip">${
          T(E.isHollow(sec) ? 'secHollow' : 'secSolid')}</span></div>
        <div class="fgrid mt6">
          <label>${T('secArea')}</label><b>${fx(area, 1)} mm²</b>
          <label>${T('secInertia')} Iz</label><b>${fx(I.Iz, 0)} mm⁴</b>
          <label>${T('secInertia')} Iy</label><b>${fx(I.Iy, 0)} mm⁴</b>
          <label>${T('secMass')}</label><b>${kgm === null ? '—' : `${fx(kgm, 3)} kg/m`}</b>
        </div>
      </div>
    </div>
    ${redonda ? `<div role="alert" class="warnbox mt6">${T('secRoundWarn')}</div>` : ''}
    ${E.isHollow(sec) ? `<div role="alert" class="warnbox mt6">${T('secHollowWarn')}</div>` : ''}
  </div></div></div>`;
}
