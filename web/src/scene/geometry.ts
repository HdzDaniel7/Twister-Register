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
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { sectionOutline } from '../engine.ts';
import type { Section } from '../types.ts';
import type { Path, DevFn } from './types.ts';

/* ------------- geometría barrida: el contorno, a lo largo del camino ---- */
export function barGeometry(path: Path, sec: Section, devFn: DevFn | null): BufferGeometry {
  const S = path.samples, L = path.total, N = S.length;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
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
  for (let i = 0; i < N; i++) {
    const q = S[i], k = shrink(q.s);
    const fa = ha > 0 ? Math.max(ha - k, .2) / ha : 1;
    const fb = hb > 0 ? Math.max(hb - k, .2) / hb : 1;
    const c = devFn ? devFn(q, i) : [.55, .62, .72];
    /* y = espesor, z = ancho: el doblez de plano gira alrededor del ancho y
       desvía la barra a lo largo del espesor. */
    for (const [a, b] of perfil) {
      const p = q.p.clone().addScaledVector(q.y, a * fa).addScaledVector(q.z, b * fb);
      pos.push(p.x, p.y, p.z); col.push(c[0], c[1], c[2]);
    }
  }
  for (let i = 0; i < N - 1; i++) {
    const o = i * V, o2 = (i + 1) * V;
    for (let f = 0; f < V; f++) {
      const a = o + f, b = o + (f + 1) % V, c = o2 + (f + 1) % V, d = o2 + f;
      idx.push(a, b, c, a, c, d);
    }
  }
  /* Las tapas, como abanico desde el primer vértice de cada anillo: con cuatro
     eran dos triángulos escritos a mano, con veinticuatro ya no. */
  const last = (N - 1) * V;
  for (let f = 1; f + 1 < V; f++) {
    idx.push(0, f + 1, f);
    idx.push(last, last + f, last + f + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
