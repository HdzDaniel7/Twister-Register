/* ------------------------------------------------------ cinta inferior ----
   Desenrolla la longitud desarrollada y pone una columna por doblez,
   coloreada por desviación, con la línea de tolerancia punteada. Deja ver de
   un vistazo cuál doblez está fuera. Es clicable.

   Cambia de significado sola: con pieza medida muestra la desviación del
   DESVÍO TOTAL del doblez (dev.theta, no solo `angle`: mirar únicamente el
   ángulo de plano daría por bueno un doblez de canto completamente fuera).
   Sin pieza medida, y con la activa distinta de la referencia, muestra el Δ
   desvío entre variantes.                                                   */
import * as E from './engine.ts';
import { ST, activeDataset, refModel } from './state.ts';
import { T } from './i18n.ts';
import { devCssColor, cssVar } from './scene.ts';
import { $ } from './dom.ts';

/* El lienzo se guarda a sí mismo dónde quedó cada columna, para que el clic
   pueda encontrar la más cercana sin recalcular la cinta entera. */
type RibbonCanvas = HTMLCanvasElement & {
  _pos?: number[];
  _X?: (s: number) => number;
};


const fx = (v: number | null | undefined, n = 2): string =>
  (v === null || v === undefined || !isFinite(v)) ? '—' : v.toFixed(n);
let onSelect: (i: number) => void = () => {};
export const setOnRibbonSelect = (fn: (i: number) => void): void => { onSelect = fn; };

/* Los tokens de color se leen UNA vez por repintado. cssVar() llama a
   getComputedStyle() sobre :root, que fuerza al navegador a recalcular estilo;
   dentro del bucle eran hasta cinco por doblez —setenta y cinco en una pieza de
   quince— y la cinta se repinta con cada tecla que se toca en la tabla. El
   color sigue viniendo del CSS, que es la regla del proyecto; lo que cambia es
   CUÁNTAS VECES se pregunta. */
type Tokens = Record<'line' | 'warn' | 'dim' | 'dim2' | 'txt' | 'panel3' | 'oriW' | 'oriT', string>;
const readTokens = (): Tokens => ({
  line: cssVar('--line', '#242C39'),
  warn: cssVar('--warn', '#FFC53D'),
  dim: cssVar('--dim', '#7E8A9C'),
  dim2: cssVar('--dim2', '#78849A'),
  txt: cssVar('--txt', '#D8DFE9'),
  panel3: cssVar('--panel3', '#1D2430'),
  oriW: cssVar('--oriWbd', '#6B4B9E'),
  oriT: cssVar('--oriTbd', '#3B7A6C'),
});

/** Lo que hace falta para colocar cualquier cosa en la cinta: dónde cae cada
 *  milímetro de longitud desarrollada y dónde están el suelo y el techo. */
type Frame = {
  w: number; h: number; pad: number; top: number; bot: number; mid: number;
  tol: number; maxR: number; X: (s: number) => number;
};

/** El armazón: el eje, la línea de tolerancia y sus dos rótulos. No depende de
 *  ningún doblez, así que se pinta una vez y no entra en el bucle. */
function drawFrame(g: CanvasRenderingContext2D, C: Tokens, F: Frame): void {
  g.strokeStyle = C.line; g.lineWidth = 1;
  g.beginPath(); g.moveTo(F.pad, F.mid + .5); g.lineTo(F.w - 14, F.mid + .5); g.stroke();

  const hTol = (F.bot - F.top) / F.maxR;
  g.setLineDash([3, 3]); g.strokeStyle = C.warn + '66';
  g.beginPath(); g.moveTo(F.pad, F.bot - hTol); g.lineTo(F.w - 14, F.bot - hTol); g.stroke();
  g.setLineDash([]);
  g.fillStyle = C.dim; g.font = '9px ui-monospace,monospace'; g.textAlign = 'right';
  g.fillText('tol ' + fx(F.tol, 2) + '°', F.pad - 4, F.bot - hTol + 3);
  g.fillText('0', F.pad - 4, F.mid + 3);
}

/** Una columna por doblez, coloreada por desviación, con su número debajo y la
 *  pastilla de orientación. `dev` trae null donde no hay nada que comparar: eso
 *  se pinta como un tocón apagado, que NO es lo mismo que una desviación cero. */
function drawColumns(g: CanvasRenderingContext2D, C: Tokens, F: Frame,
                     pos: number[], dev: (number | null)[], ori: string[]): void {
  const bw = Math.max(4, Math.min(20, (F.w - F.pad - 20) / (Math.max(1, pos.length) * 1.9)));
  for (let i = 0; i < pos.length; i++) {
    const x = F.X(pos[i]), d = dev[i];
    if (d === null || !isFinite(d)) {
      g.fillStyle = C.panel3; g.fillRect(x - bw / 2, F.mid - 8, bw, 8);
    } else {
      const hh = Math.min(Math.abs(d) / F.tol / F.maxR, 1) * (F.bot - F.top);
      g.fillStyle = devCssColor(d, F.tol);
      g.fillRect(x - bw / 2, F.mid - hh, bw, Math.max(hh, 1.5));
      if (i === ST.sel) {
        g.strokeStyle = C.txt; g.lineWidth = 1;
        g.strokeRect(x - bw / 2 - 1.5, F.mid - hh - 1.5, bw + 3, hh + 3);
      }
    }
    g.fillStyle = i === ST.sel ? C.txt : C.dim2;
    g.textAlign = 'center'; g.font = '9px ui-monospace,monospace';
    g.fillText(String(i + 1), x, F.h - 6);
    g.fillStyle = ori[i] === 'W' ? C.oriW : C.oriT;
    g.fillRect(x - bw / 2, F.mid + 2, bw, 2);
  }
}

export function drawRibbon(): void {
  const cv = $<RibbonCanvas>('#rbc');
  if (!cv || !ST.model) return;
  const dpr = Math.min(devicePixelRatio, 2), w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr; cv.height = h * dpr;
  /* el lienzo es #rbc de index.html: un 2d context siempre existe */
  const g = cv.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const M = ST.model, D = activeDataset();
  const L = E.buildPath(M).total, pad = 60;
  const F: Frame = {
    w, h, pad, top: 26, bot: h - 18, mid: h - 18,
    tol: M.tol.angle || 1, maxR: 2.5,
    X: (s: number): number => pad + (s / (L || 1)) * (w - pad - 14),
  };
  const C = readTokens();
  drawFrame(g, C, F);

  /* sin pieza medida, la cinta compara la activa contra la referencia: el
     mismo gesto sirve para inspección y para comparar variantes de diseño */
  const refB = (!D && ST.ref !== ST.active) ? refModel().bends : null;
  const pos = E.bendStations(M);
  /* computeDev() rellena `dev` al dar de alta la pieza medida. */
  const dev = pos.map((_, i) =>
    (D && i < D.dev!.theta.length) ? Math.abs(D.dev!.theta[i])
      : (refB && i < refB.length)
        ? Math.abs(E.bendTheta(M.bends[i]) - E.bendTheta(refB[i]))
        : null);
  drawColumns(g, C, F, pos, dev, E.orientations(M));

  cv._pos = pos; cv._X = F.X;
  const title = $('#rbtitle');
  if (title) title.textContent = refB ? T('vsRef') : T('ribbon');
}

export function bindRibbon(): void {
  const cv = $<RibbonCanvas>('#rbc');
  if (!cv) return;
  cv.addEventListener('click', (ev: MouseEvent) => {
    if (!cv._pos || !cv._pos.length) return;
    let best = -1, bd = Infinity;
    cv._pos.forEach((p: number, i: number) => {
      const dd = Math.abs(cv._X!(p) - ev.offsetX);
      if (dd < bd) { bd = dd; best = i; }
    });
    if (bd < 24) onSelect(best);
  });
}
