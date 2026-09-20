/* =========================================================================
   EL SÓLIDO — la barra como B-rep, que es lo único que importa TODO CAD.

   Por qué existe, y es una corrección de lo que se dijo el 2026-09-20: un
   `geometric_curve_set` es mala mercancía. FreeCAD lo abre pero no deja
   barrerlo, y SolidWorks **ignora la geometría de curvas al importar STEP**. Un
   archivo de alambre es mirable y poco más. Lo que lee cualquier programa, sin
   diálogos y sin reconstruir nada, es un sólido.

   Y sí se puede escribir a mano, al revés de lo que se supuso al empezar. Una
   barra doblada no necesita núcleo geométrico: sus caras son PLANOS, CILINDROS,
   TOROS y superficies de revolución, todas analíticas y todas en la norma. Lo
   caro no son las superficies, es la topología.

   CÓMO SE PARTE, que es la decisión que hace esto escribible. Cada tramo del
   eje aporta **una cara por lado de la sección** —cuatro en un rectángulo,
   cuatro cuartos en una redonda—, y cada cara queda con un lazo de CUATRO
   aristas: dos secciones transversales en los extremos y dos «esquinas» a lo
   largo. Así no hay ni una superficie periódica cerrada sobre sí misma, y por
   tanto no hay costura, ni curva paramétrica, ni `seam_curve`, que es donde se
   atasca todo el que escribe un B-rep a mano.

   Que eso funcione se apoya en un hecho de la cinemática de aquí: a lo largo de
   un arco la sección NO rueda, así que un punto a un ángulo fijo de la sección
   describe una circunferencia alrededor del eje de doblado. Sea cual sea el
   `rot`. Por eso las «esquinas» son siempre rectas o circunferencias, nunca
   hélices, y por eso las caras de un arco son superficies de revolución.

   QUÉ NO ESTÁ, y lo dice el archivo en su encabezado:
     · la TORSIÓN, salvo en redonda, donde no cambia nada porque una
       circunferencia rodada sobre su eje es ella misma. En rectangular con
       torsión NO se emite sólido: se emitiría una barra que no es la pieza;
     · el CHAFLÁN y el tocho de los cabos. Son cosméticos y los cabos se cortan
       rectos.

   CÓMO SE SABE QUE ESTÁ BIEN. Pappus: el volumen de un barrido cuyo centroide
   va sobre la directriz es exactamente `área × longitud desarrollada`. Las dos
   cuentas ya viven en el motor —`sectionArea()` y `developedLength()`— y no
   saben nada de este archivo, así que comparar contra ellas es una prueba de
   verdad y no una tautología.
   ========================================================================= */
import { Vector3 } from 'three';
import type { Model, Section } from '../types.ts';
import { isHollow } from './section.ts';
import { straightOf, tailStraight } from './kinematics.ts';
import type { CentreSeg } from './step.ts';

/** Lo poco que este archivo necesita del escritor de STEP. Va por parámetro y
 *  no por import para que `step.ts` siga siendo el único que sabe numerar
 *  entidades: aquí solo se describe geometría. */
export type StepEmit = {
  put: (body: string) => number;
  pt: (p: Vector3) => number;
  dir: (v: Vector3) => number;
  num: (v: number, dec?: number) => string;
};

/** Por qué NO se puede emitir un sólido de esta pieza, o `null` si sí se puede.
 *
 *  Devuelve el motivo en vez de un booleano a propósito: quien llama lo escribe
 *  en el encabezado del archivo y en la pantalla. «No hay sólido» sin decir por
 *  qué es exactamente lo que deja a alguien mirando un archivo vacío. */
export function solidBlocker(model: Model): string | null {
  const sec = model.section;
  if (!(sec.width > 0)) return 'la seccion no tiene medidas';
  if (sec.kind !== 'round' && !(sec.thickness > 0)) return 'la seccion no tiene espesor';
  if (sec.kind !== 'round' && model.bends.some(b => !!b.twist)) {
    return 'la pieza lleva torsion y la seccion no es redonda: el solido seria'
      + ' otra barra. Sale solo la geometria de referencia';
  }
  /* Un doblez de radio cero es un PLIEGUE: el eje cambia de direccion sin arco,
     y el barrido no existe — no hay superficie que una las dos secciones. Se
     descarta el tramo al escribir las curvas, pero un casco al que le falta un
     trozo no cierra, y un solido que no cierra no es un solido. */
  if (model.bends.some(b => b.angle !== 0 && !(b.radius > 0))) {
    return 'hay un doblez de radio cero, o sea un pliegue: no hay superficie'
      + ' barrida que lo describa';
  }
  /* Una recta de longitud cero o negativa es un avance que se queda corto —lo
     avisa la pestana de modelo— y aqui deja dos secciones en el mismo sitio o
     una barra que se mete dentro de si misma. */
  const rectas = model.bends.map((_, i) => straightOf(model, i))
    .concat(tailStraight(model));
  if (rectas.some(v => !(v > 0))) {
    return 'hay una recta de longitud cero o negativa: el avance se queda corto';
  }
  return null;
}

/* --------------------------------------------------------- la sección ----
   El contorno que se barre, en coordenadas de la sección: `a` a lo largo del
   espesor y `b` a lo largo del ancho, igual que en el 3D.

   NO se usa `sectionOutline()`, y no es un descuido: aquel devuelve 24 lados
   para una redonda porque está dibujando, y aquí 24 lados serían 24 caras por
   tramo para nada — la redonda se describe con CUATRO cuartos y superficies
   exactas, sin aproximar. El rectángulo sí es el mismo contorno de siempre. */
type Cara = { pts: [number, number][]; redonda: boolean; r: number };

const contorno = (sec: Section, dentro: boolean): Cara => {
  const e = dentro ? (sec.wall || 0) : 0;
  if (sec.kind === 'round') {
    const r = sec.width / 2 - e;
    return {
      redonda: true, r,
      pts: [[r, 0], [0, r], [-r, 0], [0, -r]],
    };
  }
  const ht = sec.thickness / 2 - e, hw = sec.width / 2 - e;
  return {
    redonda: false, r: 0,
    pts: [[+ht, +hw], [-ht, +hw], [-ht, -hw], [+ht, -hw]],
  };
};

/* --------------------------------------------------- marcos sin rodado ----
   El marco de la sección en cada frontera entre tramos. Se construye aquí y no
   se saca de `centreSegments()` porque ESE marco lleva la torsión, y un marco
   que rueda entre dos anillos convertiría las esquinas en hélices. Para una
   redonda da igual —el anillo es el mismo conjunto de puntos— y para una
   rectangular con torsión no se llega hasta aquí: `solidBlocker()` lo para.

   La tangente sale del propio tramo, así que este marco nunca se despega de
   ella: en un arco los dos vectores giran con el MISMO giro del mundo que gira
   la tangente. */
type Marco = { p: Vector3; y: Vector3; z: Vector3 };

function marcos(segs: CentreSeg[]): Marco[] {
  const y = new Vector3(0, 1, 0), z = new Vector3(0, 0, 1);
  const out: Marco[] = [];
  for (const s of segs) {
    out.push({ p: s.p0.clone(), y: y.clone(), z: z.clone() });
    if (s.kind === 'arc' && s.radius > 0 && s.theta > 0) {
      y.applyAxisAngle(s.z, s.theta);
      z.applyAxisAngle(s.z, s.theta);
    }
  }
  const fin = segs[segs.length - 1];
  out.push({ p: fin.p1.clone(), y: y.clone(), z: z.clone() });
  return out;
}

/* ------------------------------------------------------------ el sólido --- */

/** Escribe la pieza como `MANIFOLD_SOLID_BREP` y devuelve su id.
 *
 *  `segs` tiene que venir ya SIN tramos degenerados: un tramo de longitud o
 *  radio nulo no aporta caras y dejaría el casco abierto. */
export function solidBrep(model: Model, segs: CentreSeg[], em: StepEmit): number {
  const { put, pt, dir, num } = em;
  const sec = model.section;
  const M = marcos(segs);
  const hueca = isHollow(sec);

  const A2 = (p: Vector3, z: Vector3, x: Vector3): number =>
    put(`AXIS2_PLACEMENT_3D('',#${pt(p)},#${dir(z)},#${dir(x)})`);
  const A1 = (p: Vector3, z: Vector3): number =>
    put(`AXIS1_PLACEMENT('',#${pt(p)},#${dir(z)})`);
  const recta = (p: Vector3, d: Vector3): number =>
    put(`LINE('',#${pt(p)},#${put(`VECTOR('',#${dir(d)},1.0)`)})`);
  const arista = (c: number, va: number, vb: number): number =>
    put(`EDGE_CURVE('',#${va},#${vb},#${c},.T.)`);
  const orient = (e: number, adelante: boolean): number =>
    put(`ORIENTED_EDGE('',*,*,#${e},${adelante ? '.T.' : '.F.'})`);
  const lazo = (oes: number[]): number =>
    put(`EDGE_LOOP('',(${oes.map(i => '#' + i).join(',')}))`);
  const cara = (surf: number, bounds: number[], mismo: boolean): number =>
    put(`ADVANCED_FACE('',(${bounds.map(i => '#' + i).join(',')}),#${surf},`
      + `${mismo ? '.T.' : '.F.'})`);

  /** Un casco: el de fuera, o el del hueco de un tubo. Devuelve las caras
   *  laterales y los anillos, que las tapas necesitan. */
  const casco = (dentro: boolean): { caras: number[]; anillos: number[][] } => {
    const C = contorno(sec, dentro);
    const K = C.pts.length;
    const mundo = (j: number, k: number): Vector3 =>
      M[j].p.clone()
        .addScaledVector(M[j].y, C.pts[k][0])
        .addScaledVector(M[j].z, C.pts[k][1]);

    /* Los vértices y las aristas de sección de cada frontera. Se construyen UNA
       vez y los dos tramos vecinos las comparten: es lo que cierra el casco. */
    const V: number[][] = [], ANILLO: number[][] = [];
    for (let j = 0; j < M.length; j++) {
      V.push(C.pts.map((_, k) => put(`VERTEX_POINT('',#${pt(mundo(j, k))})`)));
    }
    for (let j = 0; j < M.length; j++) {
      const tang = j < segs.length
        ? tangenteEn(segs[j], true)
        : tangenteEn(segs[segs.length - 1], false);
      const fila: number[] = [];
      for (let k = 0; k < K; k++) {
        const k2 = (k + 1) % K;
        const c = C.redonda
          /* la circunferencia de la sección: plano normal a la tangente */
          ? put(`CIRCLE('',#${A2(M[j].p, tang, M[j].y)},${num(C.r)})`)
          : recta(mundo(j, k), mundo(j, k2).sub(mundo(j, k)).normalize());
        fila.push(arista(c, V[j][k], V[j][k2]));
      }
      ANILLO.push(fila);
    }

    const caras: number[] = [];
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      /* las esquinas: el mismo punto de la sección a lo largo del tramo */
      const esq: number[] = [];
      for (let k = 0; k < K; k++) {
        const pa = mundo(i, k), pb = mundo(i + 1, k);
        const c = s.kind === 'line'
          ? recta(pa, pb.clone().sub(pa).normalize())
          : circAlrededor(pa, s.ctr, s.z);
        esq.push(arista(c, V[i][k], V[i + 1][k]));
      }
      for (let k = 0; k < K; k++) {
        const k2 = (k + 1) % K;
        const surf = superficie(s, M[i], C, k, k2);
        /* El lazo, en orden: sección de entrada k->k2, esquina k2 hacia
           adelante, sección de salida k2->k (al revés) y esquina k de vuelta.
           Ese orden deja la normal de la cara HACIA AFUERA.

           En el casco de dentro la cara mira al hueco, así que se invierten LAS
           DOS cosas: `same_sense` y el sentido de recorrido del lazo. Invertir
           solo la primera —que es lo que se hizo primero— deja un lazo que
           contradice a la normal. Un cilindro lo perdona; un TORO no: sin curvas
           paramétricas, el lector tiene que deducir qué trozo de la superficie
           es la cara, y con el lazo al revés escoge el complementario. Se vio en
           el tubo redondo, cuyas cuatro caras interiores de los codos salían
           cubriendo el 95 % del toro entero y daban 802868 mm³ donde tocaban
           120681. */
        const pasos: [number, boolean][] = [
          [ANILLO[i][k], true],
          [esq[k2], true],
          [ANILLO[i + 1][k], false],
          [esq[k], false],
        ];
        const l = lazo((dentro ? [...pasos].reverse() : pasos)
          .map(([e, a]) => orient(e, dentro ? !a : a)));
        caras.push(cara(surf, [put(`FACE_OUTER_BOUND('',#${l},.T.)`)], !dentro));
      }
    }
    return { caras, anillos: ANILLO };
  };

  /* ---- las superficies laterales, por tipo de tramo y de sección ---- */
  function superficie(s: CentreSeg, m: Marco, C: Cara, k: number, k2: number): number {
    const pa = m.p.clone().addScaledVector(m.y, C.pts[k][0]).addScaledVector(m.z, C.pts[k][1]);
    const pb = m.p.clone().addScaledVector(m.y, C.pts[k2][0]).addScaledVector(m.z, C.pts[k2][1]);

    if (s.kind === 'line') {
      const t = s.p1.clone().sub(s.p0).normalize();
      if (C.redonda) {
        return put(`CYLINDRICAL_SURFACE('',#${A2(s.p0, t, m.y)},${num(C.r)})`);
      }
      /* un lado recto barrido en línea recta es un PLANO */
      const d = pb.clone().sub(pa).normalize();
      const n = d.clone().cross(t).normalize();
      return put(`PLANE('',#${A2(pa, n, d)})`);
    }

    const eje = s.z;                                    // el eje de doblado
    if (C.redonda) {
      return put(`TOROIDAL_SURFACE('',#${A2(s.ctr, eje, s.ref)},`
        + `${num(s.radius)},${num(C.r)})`);
    }
    /* Un lado recto girado alrededor del eje da, según cómo esté puesto:
       PARALELO al eje -> un cilindro; RADIAL -> un plano; y si no, la superficie
       de revolución general. Se distinguen los dos primeros casos en vez de
       mandar siempre la general porque un cilindro y un plano los digiere
       cualquier lector, y una `surface_of_revolution` no siempre. */
    const d = pb.clone().sub(pa).normalize();
    const along = Math.abs(d.dot(eje));
    const rad = (p: Vector3): Vector3 => {
      const v = p.clone().sub(s.ctr);
      return v.addScaledVector(eje, -v.dot(eje));
    };
    const ra = rad(pa);
    if (along > 1 - 1e-9 && ra.length() > 1e-9) {
      return put(`CYLINDRICAL_SURFACE('',#${A2(s.ctr, eje, ra.clone().normalize())},`
        + `${num(ra.length())})`);
    }
    if (along < 1e-9 && ra.length() > 1e-9
        && Math.abs(ra.clone().normalize().dot(d)) > 1 - 1e-9) {
      /* el lado apunta al eje: al girar barre un disco, o sea un plano
         perpendicular al eje a la altura del lado */
      const h = pa.clone().sub(s.ctr).dot(eje);
      const org = s.ctr.clone().addScaledVector(eje, h);
      return put(`PLANE('',#${A2(org, eje, rad(pa).normalize())})`);
    }
    return put(`SURFACE_OF_REVOLUTION('',#${recta(pa, d)},#${A1(s.ctr, eje)})`);
  }

  function circAlrededor(p: Vector3, ctr: Vector3, eje: Vector3): number {
    const v = p.clone().sub(ctr);
    const h = v.dot(eje);
    const c = ctr.clone().addScaledVector(eje, h);
    const r = p.clone().sub(c);
    const rho = r.length();
    return put(`CIRCLE('',#${A2(c, eje, r.clone().normalize())},${num(rho)})`);
  }

  function tangenteEn(s: CentreSeg, inicio: boolean): Vector3 {
    if (s.kind === 'line') return s.p1.clone().sub(s.p0).normalize();
    const p = inicio ? s.p0 : s.p1;
    const v = p.clone().sub(s.ctr);
    const t = s.z.clone().cross(v);
    return t.normalize();
  }

  /* ---------------------------------------------------------- las tapas --- */
  const fuera = casco(false);
  const dentro = hueca ? casco(true) : null;

  const tapa = (j: number, haciaFuera: boolean): number => {
    const t = j === 0
      ? tangenteEn(segs[0], true)
      : tangenteEn(segs[segs.length - 1], false);
    const n = haciaFuera ? t.clone() : t.clone().negate();
    const surf = put(`PLANE('',#${A2(M[j].p, n, M[j].y)})`);
    const K = fuera.anillos[j].length;
    const orden = (fila: number[], adelante: boolean): number =>
      lazo(fila.map((_, k) => orient(fila[adelante ? k : K - 1 - k], adelante)));
    const bounds = [put(`FACE_OUTER_BOUND('',#${orden(fuera.anillos[j], haciaFuera)},.T.)`)];
    if (dentro) {
      bounds.push(put(`FACE_BOUND('',#${orden(dentro.anillos[j], !haciaFuera)},.T.)`));
    }
    return cara(surf, bounds, true);
  };

  const caras = [
    ...fuera.caras,
    ...(dentro ? dentro.caras : []),
    tapa(0, false),
    tapa(M.length - 1, true),
  ];

  const shell = put(`CLOSED_SHELL('',(${caras.map(i => '#' + i).join(',')}))`);
  return put(`MANIFOLD_SOLID_BREP('barra',#${shell})`);
}
