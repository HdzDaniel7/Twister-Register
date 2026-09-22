/* =========================================================================
   GEOMETRÍA BARRIDA — el contorno de la sección extrudido a lo largo de la
   trayectoria que muestrea E.buildPath().

   El contorno NO se decide aquí: lo da `sectionOutline()`, en el motor, que es
   el mismo sitio del que salen el área, las inercias y cuánto asoma. Dibujar un
   cuadrado donde la física cuenta un círculo es la manera de que la pantalla y
   los números discrepen sin que nadie lo note.

   El hueco de un tubo no se dibuja, y es a propósito: la silueta exterior es la
   que se compara con el fixture y con los pines, y un interior que solo se ve al
   cortar la barra no ayuda a nadie a decidir nada. Lo que el hueco cambia —el
   peso y la rigidez— sale en cifras, no en píxeles.
   ========================================================================= */
import { BufferGeometry, BufferAttribute, Float32BufferAttribute } from 'three';
import { sectionOutline } from '../engine.ts';
import type { Section } from '../types.ts';
import type { Path, DevFn } from './types.ts';

/* el gris de siempre cuando no hay función de color: uno, no uno por muestra */
const GRIS: readonly number[] = [.55, .62, .72];

/* ------------- geometría barrida: el contorno, a lo largo del camino ---- */
export function barGeometry(path: Path, sec: Section, devFn: DevFn | null): BufferGeometry {
  const S = path.samples, L = path.total, N = S.length;
  const ch = sec.chamfer || 0, el = sec.endLen || 0;
  /* El contorno se pide UNA vez: es el mismo en todas las muestras, y la redonda
     trae dos docenas de vértices. `V` es cuántos lleva cada anillo. */
  const perfil = sectionOutline(sec);
  const V = perfil.length;
  const shrink = (s: number): number => {                    // extremo maquinado + rampa del chaflán
    if (el <= 0 || ch <= 0) return 0;
    const d = Math.min(s, L - s);
    if (d >= el) return 0;
    if (d >= el - ch) return ch * (el - d) / ch;
    return ch;
  };
  /* El estrechado del cabo se aplica como factor POR EJE sobre el contorno, con
     el mismo suelo de 0.2 mm de siempre. Escrito así vale para cualquier forma
     —en la redonda los dos ejes miden lo mismo y el factor sale radial— y en el
     rectángulo da exactamente lo que daba la resta a mano: media medida menos el
     chaflán. */
  const ha = Math.max(...perfil.map(([a]) => Math.abs(a)));
  const hb = Math.max(...perfil.map(([, b]) => Math.abs(b)));
  /* Los vértices se escriben DIRECTAMENTE en el búfer que va a la tarjeta. La
     cuenta se sabe de antemano —N anillos de V vértices— y hasta aquí esto
     construía un `Vector3` nuevo por vértice (`q.p.clone()`), los empujaba a un
     array de números y three volvía a copiarlo todo a un Float32Array: tres
     pasadas y unos cuantos miles de objetos que el recolector tenía que barrer
     en CADA reconstrucción, o sea en cada tecla de la tabla. La aritmética es
     la misma, escrita a mano en vez de a través de Vector3. */
  const pos = new Float32Array(N * V * 3), col = new Float32Array(N * V * 3);
  let w = 0;
  for (let i = 0; i < N; i++) {
    const q = S[i], k = shrink(q.s);
    const fa = ha > 0 ? Math.max(ha - k, .2) / ha : 1;
    const fb = hb > 0 ? Math.max(hb - k, .2) / hb : 1;
    const c = devFn ? devFn(q, i) : GRIS;
    const px = q.p.x, py = q.p.y, pz = q.p.z;
    const yx = q.y.x, yy = q.y.y, yz = q.y.z;
    const zx = q.z.x, zy = q.z.y, zz = q.z.z;
    /* y = espesor, z = ancho: el doblez de plano gira alrededor del ancho y
       desvía la barra a lo largo del espesor. */
    for (let f = 0; f < V; f++) {
      const a = perfil[f][0] * fa, b = perfil[f][1] * fb;
      pos[w] = px + yx * a + zx * b; col[w] = c[0]; w++;
      pos[w] = py + yy * a + zy * b; col[w] = c[1]; w++;
      pos[w] = pz + yz * a + zz * b; col[w] = c[2]; w++;
    }
  }
  /* El índice también se dimensiona de antemano: dos triángulos por cara, más
     los dos abanicos de las tapas. Y en 16 bits mientras quepa, que es lo que
     elegía `setIndex()` con un array de números: en 32 ocuparía el doble en la
     tarjeta sin ganar nada. El límite es N × V: con el rectángulo (V = 8) hacen
     falta 8192 muestras de traza para pasarse, y con la redonda (V = 24) unas
     2730 — la barra de 60 dobleces del banco va por 782. */
  const nIdx = (N - 1) * V * 6 + (V - 2) * 6;
  const idx = N * V - 1 > 65535 ? new Uint32Array(nIdx) : new Uint16Array(nIdx);
  let e = 0;
  for (let i = 0; i < N - 1; i++) {
    const o = i * V, o2 = (i + 1) * V;
    for (let f = 0; f < V; f++) {
      const a = o + f, b = o + (f + 1) % V, c = o2 + (f + 1) % V, d = o2 + f;
      idx[e++] = a; idx[e++] = b; idx[e++] = c;
      idx[e++] = a; idx[e++] = c; idx[e++] = d;
    }
  }
  /* Las tapas, como abanico desde el primer vértice de cada anillo: con cuatro
     eran dos triángulos escritos a mano, con veinticuatro ya no. */
  const last = (N - 1) * V;
  for (let f = 1; f + 1 < V; f++) {
    idx[e++] = 0; idx[e++] = f + 1; idx[e++] = f;
    idx[e++] = last; idx[e++] = last + f; idx[e++] = last + f + 1;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

/* ------------- aristas: lo mismo que EdgesGeometry, sin las cadenas ----
   `EdgesGeometry` de three suelda los vértices por POSICIÓN, y para eso arma
   tres cadenas de texto por triángulo —«x,y,z» redondeado a cuatro decimales—
   y guarda las aristas en un objeto plano cuyas claves son esas cadenas
   pegadas de dos en dos. Con 30 dobleces, 4 modelos y 3 piezas eso era el 58 %
   del tiempo de reconstruir la escena, y una reconstrucción es cada tecla que
   se pulsa en la tabla.

   Aquí se hace lo MISMO con dos cambios que no tocan el resultado:

     · la soldadura se calcula UNA vez por vértice y no tres por triángulo.
       Como el hachís de three depende solo del índice del vértice, el de un
       índice dado sale siempre igual: precalcularlo es una identidad, y pasa
       de 3 × triángulos cadenas a una por vértice (6 veces menos en la barra);
     · la arista se indexa por un NÚMERO —`w0 * n + w1`, con `n` el número de
       vértices— en vez de por dos cadenas pegadas, y en un `Map` en vez de en
       un objeto usado como diccionario.

   Todo lo demás se copia al pie de la letra de EdgesGeometry, porque cualquier
   diferencia se ve en pantalla: el redondeo a cuatro decimales, saltarse los
   triángulos degenerados, comparar contra la arista INVERSA, emitir las
   posiciones del triángulo que la cierra —no las del que la abrió—, no pisar
   una clave ya vista aunque esté anulada, y soltar al final las aristas de
   borde que nadie emparejó, en orden de aparición. El banco compara las dos
   salidas vértice a vértice. */
export function edgesGeometry(geo: BufferGeometry, thresholdAngle: number): BufferGeometry {
  const pos = geo.getAttribute('position');
  const idxAttr = geo.getIndex();
  const n = pos.count;
  const px = new Float64Array(n), py = new Float64Array(n), pz = new Float64Array(n);
  for (let i = 0; i < n; i++) { px[i] = pos.getX(i); py[i] = pos.getY(i); pz[i] = pos.getZ(i); }

  /* soldadura por posición, con el mismo redondeo de cuatro decimales */
  const P = 1e4;
  const ids = new Int32Array(n);
  const porSitio = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(px[i] * P)},${Math.round(py[i] * P)},${Math.round(pz[i] * P)}`;
    let w = porSitio.get(k);
    if (w === undefined) { w = porSitio.size; porSitio.set(k, w); }
    ids[i] = w;
  }

  const cosLim = Math.cos(thresholdAngle * Math.PI / 180);
  const tri = idxAttr ? idxAttr.count : n;
  /* una ranura por arista abierta: los dos índices con que se abrió y su
     normal. `ranura` da -1 para la que ya se cerró, que es el `null` de three. */
  const ranura = new Map<number, number>();
  const ab: number[] = [], nx: number[] = [], ny: number[] = [], nz: number[] = [];
  const out: number[] = [];
  /* los dos de trabajo, fuera del bucle: son doce mil triángulos por barra y
     alojar dos arrays de tres en cada vuelta es basura que alguien barre */
  const I = [0, 0, 0], W = [0, 0, 0];
  for (let t = 0; t < tri; t += 3) {
    I[0] = idxAttr ? idxAttr.getX(t) : t;
    I[1] = idxAttr ? idxAttr.getX(t + 1) : t + 1;
    I[2] = idxAttr ? idxAttr.getX(t + 2) : t + 2;
    W[0] = ids[I[0]]; W[1] = ids[I[1]]; W[2] = ids[I[2]];
    if (W[0] === W[1] || W[1] === W[2] || W[2] === W[0]) continue;   // degenerado
    /* la normal del triángulo, como Triangle.getNormal(): (c−b) × (a−b) */
    const ax = px[I[0]], ay = py[I[0]], az = pz[I[0]];
    const bx = px[I[1]], by = py[I[1]], bz = pz[I[1]];
    const cx = px[I[2]], cy = py[I[2]], cz = pz[I[2]];
    let ux = cx - bx, uy = cy - by, uz = cz - bz;
    const vx = ax - bx, vy = ay - by, vz = az - bz;
    let mx = uy * vz - uz * vy, my = uz * vx - ux * vz, mz = ux * vy - uy * vx;
    const len = Math.sqrt(mx * mx + my * my + mz * mz);
    if (len > 0) { mx /= len; my /= len; mz /= len; } else { mx = my = mz = 0; }
    for (let j = 0; j < 3; j++) {
      const j2 = (j + 1) % 3;
      const clave = W[j] * n + W[j2], inversa = W[j2] * n + W[j];
      const r = ranura.get(inversa);
      if (r !== undefined && r >= 0) {
        if (mx * nx[r] + my * ny[r] + mz * nz[r] <= cosLim) {
          const a = I[j], b = I[j2];
          out.push(px[a], py[a], pz[a], px[b], py[b], pz[b]);
        }
        ranura.set(inversa, -1);
      } else if (!ranura.has(clave)) {
        ranura.set(clave, ab.length >> 1);
        ab.push(I[j], I[j2]);
        nx.push(mx); ny.push(my); nz.push(mz);
      }
    }
  }
  /* las que nadie emparejó: bordes abiertos, en orden de aparición */
  for (const r of ranura.values()) {
    if (r < 0) continue;
    const a = ab[r << 1], b = ab[(r << 1) + 1];
    out.push(px[a], py[a], pz[a], px[b], py[b], pz[b]);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(out, 3));
  return g;
}
