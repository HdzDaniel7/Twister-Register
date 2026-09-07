/* =========================================================================
   GEOMETRÍA BARRIDA — la sección rectangular con chaflanes, extrudida a lo
   largo de la trayectoria muestreada por E.buildPath().
   ========================================================================= */
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { Section } from '../types.ts';
import type { Path, DevFn } from './types.ts';

/* --------- geometría barrida de sección rectangular con chaflanes ------ */
export function barGeometry(path: Path, sec: Section, devFn: DevFn | null): BufferGeometry {
  const S = path.samples, L = path.total, N = S.length;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const hw = sec.width / 2, ht = sec.thickness / 2, ch = sec.chamfer || 0, el = sec.endLen || 0;
  const shrink = (s: number): number => {                    // extremo maquinado + rampa del chaflán
    if (el <= 0 || ch <= 0) return 0;
    const d = Math.min(s, L - s);
    if (d >= el) return 0;
    if (d >= el - ch) return ch * (el - d) / ch;
    return ch;
  };
  for (let i = 0; i < N; i++) {
    const q = S[i], k = shrink(q.s);
    const w = Math.max(hw - k, .2), t = Math.max(ht - k, .2);
    const c = devFn ? devFn(q, i) : [.55, .62, .72];
    /* y = espesor, z = ancho: el doblez de plano gira alrededor del ancho y
       desvía la barra a lo largo del espesor. */
    for (const [a, b] of [[+1, +1], [-1, +1], [-1, -1], [+1, -1]]) {
      const p = q.p.clone().addScaledVector(q.y, a * t).addScaledVector(q.z, b * w);
      pos.push(p.x, p.y, p.z); col.push(c[0], c[1], c[2]);
    }
  }
  for (let i = 0; i < N - 1; i++) {
    const o = i * 4, o2 = (i + 1) * 4;
    for (let f = 0; f < 4; f++) {
      const a = o + f, b = o + (f + 1) % 4, c = o2 + (f + 1) % 4, d = o2 + f;
      idx.push(a, b, c, a, c, d);
    }
  }
  const last = (N - 1) * 4;
  idx.push(0, 2, 1, 0, 3, 2, last, last + 1, last + 2, last, last + 2, last + 3);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
