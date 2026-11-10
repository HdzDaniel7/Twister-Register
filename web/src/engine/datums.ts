/* =========================================================================
   VARIOS PUNTOS DE COINCIDENCIA — superponer dos piezas sujetándolas por
   donde de verdad se sujetan, que casi nunca es un solo punto.

   El punto de coincidencia de siempre (`anchorTransform()` con 'pivot') fija
   UN marco entero: posición y orientación en un PI. El mejor ajuste ('best')
   reparte el error entre TODOS los PI. Un fixture no hace ninguna de las dos
   cosas: apoya la pieza en unos pocos sitios y cada apoyo restringe SOLO
   algunas direcciones. Una cuna sostiene en vertical y deja correr la barra a
   lo largo; un tope lateral empuja de costado y no sabe nada de la altura.

   ESTO ES EL ESQUEMA 3-2-1 de la metrología de piezas (referencias de
   posicionamiento): tres puntos en Z fijan la altura y los dos cabeceos, dos en
   Y fijan el lateral y el giro en planta, uno en X fija el largo. Seis
   restricciones, seis grados de libertad, nada sobrado. Con más se reparte por
   mínimos cuadrados, y con menos lo que no se fija se queda donde lo deja el
   mejor ajuste de todos los PI (ver `datumFit()`), y se dice cuántos grados
   quedaron así.

   DÓNDE PUEDE ESTAR UN PUNTO, y por qué no solo en los PI:

   · 'pi'   un PI. Matemáticamente cómodo, pero un PI es el CRUCE de dos
            rectas y no está sobre la barra: ningún fixture ni ningún palpador
            lo toca. Sirve para comparar como siempre se comparó.
   · 'arc'  sobre el arco del doblez `i`: f = 0 la tangencia de entrada, 0.5
            el vértice, 1 la de salida. Tocable.
   · 'line' sobre la recta `i` (la que PRECEDE al doblez i; i = nº de
            dobleces es la cola), en la fracción f de su largo. Tocable: es
            donde se pone una cuna.

   Los dos últimos se definen por DOBLEZ Y FRACCIÓN y no por longitud
   desarrollada, y es lo que deja comparar piezas distintas: el vértice del
   doblez 3 es el vértice del doblez 3 en las dos aunque una sea 4 mm más larga.

   LAS DIRECCIONES van en el marco de la REFERENCIA (el del dibujo antes de la
   colocación, que con la colocación a cero es el del taller). Es el marco en
   el que está atornillado el fixture.
   ========================================================================= */
import { Matrix4, Vector3 } from 'three';
import type { Model, PathSample } from '../types.ts';
import { clamp } from './math.ts';
import { fk, buildPath, rowLengths, tailStraight, PATH_SEG } from './kinematics.ts';
import { sampleAt } from './path.ts';
import { kabsch, pivotIndex } from './fitting.ts';

export type DatumAt = 'pi' | 'arc' | 'line';

export type Datum = {
  id: string;
  name: string;
  /** apagado = se queda en la lista pero no cuenta */
  on: boolean;
  at: DatumAt;
  /** índice del PI, del doblez o de la recta, según `at` */
  i: number;
  /** fracción 0..1 dentro del arco o de la recta; no se usa con 'pi' */
  f: number;
  /** qué direcciones restringe: X, Y, Z del marco de la referencia */
  ax: [boolean, boolean, boolean];
  /** peso relativo en el ajuste. 1 = normal */
  w: number;
};

export const DATUM_DEFAULT: Readonly<Omit<Datum, 'id' | 'name'>> = Object.freeze({
  on: true, at: 'line' as DatumAt, i: 0, f: 0.5, ax: [true, true, true] as [boolean, boolean, boolean], w: 1,
});

/** Sanea un punto venido de un archivo o de una celda. */
export function normDatum(d: Partial<Datum> | null | undefined, id = 'd1', name = 'D1'): Datum {
  const o = d || {};
  const at: DatumAt = o.at === 'pi' || o.at === 'arc' ? o.at : 'line';
  const ax = Array.isArray(o.ax) ? o.ax : DATUM_DEFAULT.ax;
  const w = typeof o.w === 'number' && isFinite(o.w) ? clamp(o.w, 0, 1000) : 1;
  return {
    id: typeof o.id === 'string' && o.id ? o.id : id,
    name: typeof o.name === 'string' && o.name ? o.name.slice(0, 40) : name,
    on: o.on !== false, at,
    i: Math.max(0, (o.i as number) | 0),
    f: typeof o.f === 'number' && isFinite(o.f) ? clamp(o.f, 0, 1) : 0.5,
    ax: [!!ax[0], !!ax[1], !!ax[2]], w,
  };
}

/** Longitud desarrollada del punto en ESTA pieza, mm, o null para un 'pi'
 *  (que no está sobre la barra) o un índice que la pieza no tiene. */
export function datumS(model: Model, d: Datum): number | null {
  if (d.at === 'pi') return null;
  const rows = rowLengths(model);
  const nb = rows.length;
  const f = clamp(d.f, 0, 1);
  if (d.at === 'arc') {
    if (d.i < 0 || d.i >= nb) return null;
    const r = rows[d.i];
    return r.cum - r.arc + f * r.arc;
  }
  if (d.i < 0 || d.i > nb) return null;
  const s0 = d.i === 0 ? 0 : rows[d.i - 1].cum;
  const len = d.i < nb ? rows[d.i].straight : tailStraight(model);
  return s0 + f * Math.max(0, len);
}

/** El punto en el espacio, en el marco propio de la pieza (fk desde el
 *  origen). `samples` se puede pasar para no reconstruir la trayectoria. */
export function datumPoint(model: Model, d: Datum, refPis?: number,
                           samples?: PathSample[]): Vector3 | null {
  if (d.at === 'pi') {
    const pis = fk(model).pis;
    if (!pis.length) return null;
    /* el índice se cuenta en la REFERENCIA, como el punto de coincidencia: el
       PE de la referencia es el PE de cualquiera */
    const k = refPis != null ? pivotIndex(d.i, refPis, pis.length) : clamp(d.i, 0, pis.length - 1);
    return pis[k].clone();
  }
  const s = datumS(model, d);
  if (s == null) return null;
  const S = samples || buildPath(model, PATH_SEG).samples;
  if (!S.length) return null;
  return sampleAt(S, s).p.clone();
}

/** Lo que queda de cada punto tras el ajuste. */
export type DatumResid = {
  id: string;
  /** vector entre el punto de la pieza ya colocada y el de la referencia, mm */
  d: [number, number, number];
  /** la parte que el punto RESTRINGE: norma sobre sus ejes marcados, mm */
  n: number;
};

export type DatumFit = {
  M: Matrix4;
  resid: DatumResid[];
  /** cuántos de los seis grados de libertad NO fijan los puntos: esos salen
   *  del mejor ajuste de todos los PI. 0 = el esquema fija la pieza entera */
  free: number;
  /** cuántas restricciones (punto × eje) cuentan */
  nCon: number;
};

/* Jacobi simétrico, aquí para no exportar el de fitting.ts: solo hace falta
   para contar cuántos grados de libertad quedan sin fijar. */
function eigSym(A: number[][]): number[] {
  const n = A.length, M = A.map(r => r.slice());
  for (let sweep = 0; sweep < 80; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += M[i][j] * M[i][j];
    if (off < 1e-24) break;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(M[p][q]) < 1e-30) continue;
      const th = (M[q][q] - M[p][p]) / (2 * M[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const a = M[k][p], b = M[k][q]; M[k][p] = c * a - s * b; M[k][q] = s * a + c * b; }
      for (let k = 0; k < n; k++) { const a = M[p][k], b = M[q][k]; M[p][k] = c * a - s * b; M[q][k] = s * a + c * b; }
    }
  }
  return M.map((r, i) => r[i]);
}

const AX = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];

/* Caché: la escena pide el mismo ajuste varias veces por repintado (cada
   variante, el indicador de ejes, las tarjetas). Clave por contenido. */
const CACHE = new Map<string, DatumFit>();
const CACHE_MAX = 32;

/** El rígido que lleva `model` sobre `ref` sujetándolo por los puntos.
 *
 *  Minimiza  Σ_d w_d · Σ_{a ∈ ax_d} ( e_a · (R·p_d + t − q_d) )²
 *  con Gauss-Newton sobre (giro, traslación), que con tres o más puntos en las
 *  tres direcciones es exactamente Kabsch ponderado, y con un 3-2-1 es el
 *  posicionado de taller.
 *
 *  ARRANCA DEL MEJOR AJUSTE DE TODOS LOS PI, y eso no es un detalle: lo que
 *  los puntos no fijan —dos puntos dejan libre el giro alrededor de la recta
 *  que los une; solo puntos en Z dejan libre la planta— no se mueve de donde
 *  arrancó, porque el paso de Gauss-Newton en una dirección sin restricción es
 *  cero (con la regularización mínima que se pone para poder invertir). Así un
 *  esquema incompleto da «lo que fijo, fijado; lo demás, repartido», que es lo
 *  que alguien espera, en vez de una pieza girada al azar. `free` dice cuántos
 *  grados quedaron así. */
export function datumFit(model: Model, ref: Model, datums: Datum[]): DatumFit {
  const act = datums.filter(d => d.on && d.w > 0 && (d.ax[0] || d.ax[1] || d.ax[2]));
  const key = JSON.stringify([model.bends, model.tail, ref.bends, ref.tail, act]);
  const hit = CACHE.get(key);
  if (hit) return { M: hit.M.clone(), resid: hit.resid, free: hit.free, nCon: hit.nCon };

  const pm = fk(model).pis, pr = fk(ref).pis;
  let M = kabsch(pm, pr);
  const Sm = buildPath(model, PATH_SEG).samples, Sr = buildPath(ref, PATH_SEG).samples;
  const pairs: { d: Datum; p: Vector3; q: Vector3 }[] = [];
  for (const d of act) {
    const p = datumPoint(model, d, pr.length, Sm);
    const q = datumPoint(ref, d, pr.length, Sr);
    if (p && q) pairs.push({ d, p, q });
  }
  const nCon = pairs.reduce((a, o) => a + o.d.ax.filter(Boolean).length, 0);

  /* Escala de longitud para que giros (rad) y traslaciones (mm) pesen parecido
     en la matriz normal: el tamaño de la pieza. */
  let L = 1;
  for (const p of pr) L = Math.max(L, p.length());

  let free = 6;
  if (pairs.length) {
    for (let it = 0; it < 30; it++) {
      const N = [...Array(6)].map(() => new Array<number>(6).fill(0));
      const b = new Array<number>(6).fill(0);
      for (const { d, p, q } of pairs) {
        const x = p.clone().applyMatrix4(M);
        const e3 = x.clone().sub(q);
        for (let a = 0; a < 3; a++) {
          if (!d.ax[a]) continue;
          const e = AX[a];
          /* r = e·(ω × x + t)  ⇒  ∂r/∂ω = x × e,  ∂r/∂t = e. La incógnita de
             giro es θ = ω·L, así que su columna es (x × e)/L, del orden de 1
             como la de la traslación. El giro es alrededor del ORIGEN del
             marco de la referencia. */
          const c = x.clone().cross(e).divideScalar(L);
          const J = [c.x, c.y, c.z, e.x, e.y, e.z];
          const r = e3.dot(e);
          for (let i = 0; i < 6; i++) {
            b[i] -= d.w * J[i] * r;
            for (let j = 0; j < 6; j++) N[i][j] += d.w * J[i] * J[j];
          }
        }
      }
      if (it === 0) {
        const ev = eigSym(N), big = Math.max(...ev.map(Math.abs), 1e-30);
        free = ev.filter(v => v < 1e-9 * big).length;
      }
      /* Regularización mínima: deja quietas las direcciones que nada restringe. */
      const tr = N.reduce((a, r, i) => a + r[i], 0) / 6 || 1;
      for (let i = 0; i < 6; i++) N[i][i] += 1e-10 * tr;
      const x = solve6(N, b);
      if (!x) break;
      const w = new Vector3(x[0], x[1], x[2]).divideScalar(L);
      const ang = w.length();
      const R = ang > 1e-15 ? new Matrix4().makeRotationAxis(w.clone().divideScalar(ang), ang) : new Matrix4();
      const T = new Matrix4().makeTranslation(x[3], x[4], x[5]);
      M = T.multiply(R).multiply(M);
      if (ang * L < 1e-10 && Math.hypot(x[3], x[4], x[5]) < 1e-10) break;
    }
  }

  const resid: DatumResid[] = act.map(d => {
    const o = pairs.find(pp => pp.d === d);
    if (!o) return { id: d.id, d: [NaN, NaN, NaN], n: NaN };
    const v = o.p.clone().applyMatrix4(M).sub(o.q);
    const dv: [number, number, number] = [v.x, v.y, v.z];
    const n = Math.sqrt(dv.reduce((a, c, k) => a + (d.ax[k] ? c * c : 0), 0));
    return { id: d.id, d: dv, n };
  });
  const out: DatumFit = { M, resid, free, nCon };
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value as string);
  CACHE.set(key, out);
  return { M: M.clone(), resid, free, nCon };
}

/* Eliminación de Gauss con pivoteo para el 6×6 de arriba. */
function solve6(A0: number[][], b0: number[]): number[] | null {
  const n = b0.length, A = A0.map((r, i) => [...r, b0[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-300) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((r, i) => r[n] / r[i]);
}

/** Convierte una longitud desarrollada en un punto sobre la barra: la recta o
 *  el arco que la contiene y la fracción. Es lo que deja crear un punto desde
 *  donde apoya un pedestal. */
export function datumAtS(model: Model, s: number): Pick<Datum, 'at' | 'i' | 'f'> {
  const rows = rowLengths(model);
  let s0 = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const a0 = r.cum - r.arc;
    if (s <= a0) return { at: 'line', i, f: r.straight > 1e-9 ? clamp((s - s0) / r.straight, 0, 1) : 0 };
    if (s <= r.cum) return { at: 'arc', i, f: r.arc > 1e-9 ? clamp((s - a0) / r.arc, 0, 1) : 0 };
    s0 = r.cum;
  }
  const tl = tailStraight(model);
  return { at: 'line', i: rows.length, f: tl > 1e-9 ? clamp((s - s0) / tl, 0, 1) : 0 };
}

/** Un 3-2-1 de partida sobre la referencia: tres puntos en Z repartidos a lo
 *  largo, dos en Y, uno en X. Todos sobre rectas (donde se pone un apoyo de
 *  verdad), en la recta más larga cerca de cada estación. Es algo que tocar,
 *  no el esquema bueno: el bueno lo dicta el fixture del taller. */
export function seed321(ref: Model): Omit<Datum, 'id' | 'name'>[] {
  const rows = rowLengths(ref);
  const nb = rows.length;
  const total = (nb ? rows[nb - 1].cum : 0) + tailStraight(ref);
  const at = (frac: number) => datumAtS(ref, total * frac);
  /* sobre una recta: si la fracción cae en un arco, se va a la recta siguiente */
  const onLine = (frac: number): Pick<Datum, 'at' | 'i' | 'f'> => {
    const p = at(frac);
    return p.at === 'line' ? p : { at: 'line', i: Math.min(p.i + 1, nb), f: 0.5 };
  };
  const mk = (p: Pick<Datum, 'at' | 'i' | 'f'>, ax: [boolean, boolean, boolean]) =>
    ({ ...DATUM_DEFAULT, ...p, ax });
  return [
    mk(onLine(0.1), [false, false, true]),
    mk(onLine(0.5), [false, false, true]),
    mk(onLine(0.9), [false, false, true]),
    mk(onLine(0.2), [false, true, false]),
    mk(onLine(0.8), [false, true, false]),
    mk(onLine(0.05), [true, false, false]),
  ];
}
