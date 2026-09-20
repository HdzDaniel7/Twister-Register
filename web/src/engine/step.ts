/* =========================================================================
   STEP — el eje de la pieza como geometría de referencia, para CAD.

   Lo que sale es un AP214 `geometric_curve_set`: puntos, rectas y ARCOS DE
   VERDAD. No es un sólido, y no puede serlo — un `manifold_solid_brep` con una
   cara tórica por doblez es trabajo de un núcleo geométrico, y aquí no hay
   núcleo ni lo va a haber bajo `file://`. Lo que sí es, y es lo que importa:
   **exacto**.

   Por qué no se exporta la malla del 3D. `barGeometry()` dibuja barriendo las
   muestras de `buildPath()`, y `buildPath()` parte cada arco en `PATH_SEG = 12`
   tramos. Eso es error de cuerda: un arco de 90° con R = 150 mm da una flecha
   por tramo de `R(1−cos(θ/24))` = 0.32 mm. Mandar triángulos y llamarlos «el
   nominal» regala esos 0.32 mm antes de que nadie mida nada — y la tolerancia
   de punto de fábrica es 1.0 mm, o sea que el error del DIBUJO se comería un
   tercio de la tolerancia de la PIEZA. Aquí se emiten `LINE` y `CIRCLE`
   recortadas, que no aproximan nada.

   Qué lleva de información, porque un archivo de geometría suelta no vale:
     · tres grupos con nombre —eje, perfil, PI—, cada uno su propia RAÍZ del
       archivo, así que el CAD los abre como tres objetos y no como un compuesto
       con todo mezclado. El eje es un hilo único y el perfil un hilo cerrado:
       eso es lo que hace que se puedan barrer en vez de solo mirar;
     · `PRODUCT` con el nombre de la pieza y el sello de compilación en
       `originating_system`: dos copias del mismo archivo hechas con versiones
       distintas del visor dejan de ser indistinguibles;
     · la tabla de dobleces entera como COMENTARIO STEP en la sección de datos.
       Un comentario no lo lee ningún CAD y no puede romper una importación; un
       humano que abra el .stp con un editor lo ve todo.

   Lo que NO lleva, dicho aquí para que nadie lo suponga:
     · la TORSIÓN. El perfil sale colocado en el arranque de la barra, y barrer
       ese perfil por el eje en el CAD da la pieza SIN retorcer. Donde haya
       `twist` distinto de cero el barrido es una mentira, y por eso el archivo
       lo avisa en su propio encabezado;
     · la pieza MEDIDA y la forma SUJETA. Sale el nominal comandado y nada más.
       Son tres formas distintas, y mezclarlas en un archivo sin decir cuál es
       cuál es peor que no exportar.
   ========================================================================= */
import { Matrix4, Vector3 } from 'three';
import type { Model } from '../types.ts';
import { D2R, eye, posOf, rotAxis, rotX, trans } from './math.ts';
import {
  axisAngles, bendDecomp, developedLength, fk, rowLengths, tailStraight,
} from './kinematics.ts';
import { sectionOutline } from './section.ts';

/* ------------------------------------------------------- el eje, exacto ---
   Una recta o un arco por tramo, con todo lo que hace falta para escribirlo en
   cualquier formato: el arco viene ya en la parametrización de un `CIRCLE` de
   STEP —centro, normal, dirección de referencia, radio y barrido— y no en
   muestras.

   Esto camina el modelo igual que `buildPath()`, y ese es el riesgo: dos
   recorridos que tienen que coincidir. No se refactoriza `buildPath()` para
   compartirlo porque muestrea con marcos y con torsión, y aquí no hace falta
   ninguna de las dos cosas. Lo que sujeta el acuerdo es una prueba en
   `test_motor.js`: cada muestra de `buildPath()` tiene que caer sobre alguno de
   estos tramos, y la suma de longitudes tiene que dar `developedLength()`. Si
   un día divergen, falla ahí. */

export type CentreSeg =
  /** recta tangencia a tangencia */
  | { kind: 'line'; p0: Vector3; p1: Vector3; len: number; bend: number }
  /** arco del herramental; `ref` es el radio inicial unitario, `z` la normal */
  | {
      kind: 'arc'; p0: Vector3; p1: Vector3;
      ctr: Vector3; z: Vector3; ref: Vector3; radius: number; theta: number; bend: number;
    };

const XHAT = new Vector3(1, 0, 0);

/** El eje de la pieza como tramos exactos. `bend` es el índice del doblez al
 *  que pertenece el tramo; la cola lleva `bends.length`.
 *
 *  Los tramos degenerados —recta de longitud cero o negativa, arco de radio o
 *  barrido nulo— SALEN igual. Filtrarlos aquí escondería un `feed` demasiado
 *  corto, que es un defecto de la pieza y ya lo avisa la pestaña de modelo;
 *  quien escriba un archivo los quita él, y dice cuántos quitó. */
export function centreSegments(model: Model): CentreSeg[] {
  const out: CentreSeg[] = [];
  const B = model.bends, LEN = rowLengths(model), ejes = axisAngles(model);
  const F = eye();

  /* La torsión no mueve el eje —gira la sección alrededor de él—, pero SÍ gira
     el marco en el que se lee el eje de doblado del tramo siguiente. Por eso se
     aplica aquí aunque `p0` y `p1` no la noten. */
  const recta = (len: number, twDeg: number, bend: number): void => {
    const p0 = posOf(F);
    F.multiply(trans(len)).multiply(rotX((twDeg || 0) * D2R));
    out.push({ kind: 'line', p0, p1: posOf(F), len, bend });
  };

  for (let i = 0; i < B.length; i++) {
    recta(LEN[i].straight, i ? B[i - 1].twist : 0, i);

    const b = B[i];
    const { axis, theta } = bendDecomp({ rot: ejes[i], angle: b.angle });
    const rad = b.radius || 0;
    /* `chat` es hacia dónde barre el eje de la barra: el centro del arco está a
       `radius` por ahí. Mismo cálculo que `buildPath()`. */
    const chat = axis.clone().cross(XHAT);
    const rot0 = new Matrix4().extractRotation(F);
    const p0 = posOf(F);
    const ctr = p0.clone().addScaledVector(chat.clone().applyMatrix4(rot0), rad);
    const z = axis.clone().applyMatrix4(rot0).normalize();

    F.multiply(rotAxis(axis, theta));
    const v = chat.clone().applyMatrix4(new Matrix4().extractRotation(F)).multiplyScalar(rad);
    F.setPosition(ctr.x - v.x, ctr.y - v.y, ctr.z - v.z);

    const ref = p0.clone().sub(ctr);
    if (ref.lengthSq() > 0) ref.normalize();
    out.push({ kind: 'arc', p0, p1: posOf(F), ctr, z, ref, radius: rad, theta, bend: i });
  }

  recta(tailStraight(model), B.length ? B[B.length - 1].twist : 0, B.length);
  return out;
}

/** Un punto del arco en la parametrización que se escribe en el archivo:
 *  `ctr + R(cos t·ref + sin t·(z × ref))`, con `t` en radianes desde `ref`.
 *
 *  Está aquí y no en la prueba a propósito: es LA definición de lo que va a
 *  leer el CAD, y la prueba la usa para contrastarla contra `buildPath()`. Si
 *  viviera solo en la prueba, la prueba se estaría comprobando a sí misma. */
export function arcPointAt(a: Extract<CentreSeg, { kind: 'arc' }>, t: number): Vector3 {
  const bi = a.z.clone().cross(a.ref);
  return a.ctr.clone()
    .addScaledVector(a.ref, a.radius * Math.cos(t))
    .addScaledVector(bi, a.radius * Math.sin(t));
}

/* ---------------------------------------------------------- texto STEP ---- */

/* Los recortes se declaran con `.CARTESIAN.` como representación MAESTRA aunque
   lleven también el parámetro. Con `.PARAMETER.`, que era lo natural, el lector
   calcula el extremo como `punto + u·dirección` en vez de usar el
   `CARTESIAN_POINT` que los dos tramos vecinos COMPARTEN, y el redondeo de la
   dirección y del parámetro lo aparta del punto: 6.87e-07 mm en la costura del
   perfil redondo, suficiente para que OCCT deje el hilo abierto y FreeCAD no
   pueda barrerlo. Con `.CARTESIAN.` los extremos son los puntos, y dos tramos
   que comparten entidad comparten vértice exacto. */

/** Un REAL de STEP lleva punto decimal SIEMPRE: `100` es un entero, y un lector
 *  estricto lo rechaza donde espera un real. */
function NUM(v: number, dec = 6): string {
  let x = isFinite(v) ? v : 0;
  if (Object.is(x, -0)) x = 0;
  let s = x.toFixed(dec);
  if (s.includes('.')) {
    s = s.replace(/0+$/, '');
    if (s.endsWith('.')) s += '0';
  } else s += '.0';
  return s === '-0.0' ? '0.0' : s;
}

/** Una cadena de STEP: comilla simple doblada, contrabarra doblada, y lo que no
 *  sea ASCII imprimible en `\X2\…\X0\`, que es como la norma escribe Unicode.
 *  Sin esto, una pieza llamada «Soporte nº3» rompe el archivo. */
function STR(t: string): string {
  let out = '', buf = '';
  const flush = (): void => { if (buf) { out += '\\X2\\' + buf + '\\X0\\'; buf = ''; } };
  for (const ch of String(t)) {
    const c = ch.codePointAt(0) as number;
    if (c >= 32 && c < 127) {
      flush();
      out += ch === "'" ? "''" : ch === '\\' ? '\\\\' : ch;
    } else if (c <= 0xFFFF) {
      buf += c.toString(16).toUpperCase().padStart(4, '0');
    } else { flush(); out += '?'; }
  }
  flush();
  return "'" + out + "'";
}

/** Texto para un COMENTARIO de STEP, que no es una cadena y no admite `\X2\`:
 *  se le quitan las tildes, y se parte cualquier cierre de comentario que
 *  viniera dentro del nombre de la pieza y acabaría el bloque antes de tiempo. */
const ASC = (t: string): string =>
  String(t).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '?').replace(/\*\//g, '* /');

export type StepMeta = {
  /** nombre de la pieza: va en `PRODUCT` y en el encabezado */
  name: string;
  /** sello de compilación (`buildTag()`), a `originating_system` */
  build: string;
  /** fecha ISO. Se inyecta en vez de leerla del reloj para que el archivo sea
   *  reproducible byte a byte y la prueba pueda fijarlo */
  date: string;
};

/** El modelo como archivo STEP AP214. Devuelve el texto entero. */
export function stepText(model: Model, meta: StepMeta): string {
  const segs = centreSegments(model);
  const B = model.bends;

  /* Los degenerados se quitan del archivo —un `CIRCLE` de radio cero no es
     geometría válida, y una recta de longitud negativa tampoco— y se cuentan
     para poder decirlo en el comentario. */
  const vivos = segs.filter(s =>
    s.kind === 'line' ? s.len > 1e-9 : (s.radius > 1e-9 && s.theta > 1e-9));
  const fuera = segs.length - vivos.length;
  const retorcido = B.some(b => !!b.twist);

  const lines: string[] = [];
  let next = 0;
  const put = (body: string): number => {
    const id = ++next;
    lines.push(`#${id}=${body};`);
    return id;
  };
  const pt = (p: Vector3, name = ''): number =>
    put(`CARTESIAN_POINT(${STR(name)},(${NUM(p.x)},${NUM(p.y)},${NUM(p.z)}))`);
  const dir = (v: Vector3): number =>
    put(`DIRECTION('',(${NUM(v.x, 9)},${NUM(v.y, 9)},${NUM(v.z, 9)}))`);

  /* Contexto y unidades: mm y radianes, DECLARADOS. Un STL no puede decir en
     qué unidad está, y por eso llega a media escala cada dos por tres. */
  const uLen = put('( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )');
  const uAng = put('( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )');
  const uSol = put('( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )');
  /* La incertidumbre con la que el lector decide si dos extremos son el MISMO
     punto. Estuvo en 1.E-07 mm —una décima de nanómetro— hasta que el perfil
     redondo salió ABIERTO por 6.87e-07 mm en la costura: por debajo de eso no
     hay nada que medir en una barra de aluminio, y por encima de la
     incertidumbre declarada OCCT no cose. Un micrómetro sigue siendo mil veces
     más fino que `tol.point`, y no tapa ningún error que importe. */
  const unc = put(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-06),#${uLen},`
    + "'distance_accuracy_value','confusion accuracy')");
  const ctx = put('( GEOMETRIC_REPRESENTATION_CONTEXT(3)'
    + ` GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${unc}))`
    + ` GLOBAL_UNIT_ASSIGNED_CONTEXT((#${uLen},#${uAng},#${uSol}))`
    + " REPRESENTATION_CONTEXT('','3D') )");

  /* --- el eje: una LINE o un CIRCLE recortados por tramo, ENCADENADOS ---

     Dos cosas que no son adorno, las dos aprendidas abriendo el archivo:

     · los tramos consecutivos COMPARTEN el punto de unión — el final de uno es
       la MISMA entidad `CARTESIAN_POINT` que el principio del siguiente, no otra
       con las mismas cifras. Así la continuidad es exacta y el lector no tiene
       que coserla por tolerancia;

     · la cadena sale como un `COMPOSITE_CURVE` y no como treinta y una curvas
       sueltas. Sueltas, OCCT entrega un compuesto de 31 aristas, y entonces en
       FreeCAD la trayectoria de un barrido hay que ir clicándola arista por
       arista. Con el hilo único es un clic.

     Si un tramo degenerado partiera la cadena —hoy no puede: un tramo de
     longitud o radio nulo tiene `p0 === p1`, así que al quitarlo los vecinos
     siguen tocándose— salen varios hilos en vez de uno, que es lo honesto: un
     `COMPOSITE_CURVE` con un hueco dentro no es una curva. */
  const cadenas: number[][] = [];
  let cadena: number[] = [];
  let finId = -1;
  let finPt: Vector3 | null = null;

  for (const s of vivos) {
    const sigue = finPt !== null && s.p0.distanceTo(finPt) < 1e-9;
    if (!sigue && cadena.length) { cadenas.push(cadena); cadena = []; }
    const i0 = sigue ? finId : pt(s.p0);
    const i1 = pt(s.p1);
    const nb = s.bend + 1;
    if (s.kind === 'line') {
      const nom = s.bend >= B.length ? 'cola' : `recta ${nb}`;
      const d = s.p1.clone().sub(s.p0).normalize();
      const vec = put(`VECTOR('',#${dir(d)},1.0)`);
      const ln = put(`LINE('',#${i0},#${vec})`);
      cadena.push(put(`TRIMMED_CURVE(${STR(nom)},#${ln},`
        + `(#${i0},PARAMETER_VALUE(0.0)),(#${i1},PARAMETER_VALUE(${NUM(s.len)})),`
        + '.T.,.CARTESIAN.)'));
    } else {
      const pl = put(`AXIS2_PLACEMENT_3D('',#${pt(s.ctr)},#${dir(s.z)},#${dir(s.ref)})`);
      const ci = put(`CIRCLE('',#${pl},${NUM(s.radius)})`);
      cadena.push(put(`TRIMMED_CURVE(${STR('arco ' + nb)},#${ci},`
        + `(#${i0},PARAMETER_VALUE(0.0)),(#${i1},PARAMETER_VALUE(${NUM(s.theta, 9)})),`
        + '.T.,.CARTESIAN.)'));
    }
    finId = i1; finPt = s.p1;
  }
  if (cadena.length) cadenas.push(cadena);

  /* Un `COMPOSITE_CURVE` abierto declara `.DISCONTINUOUS.` en su ÚLTIMO tramo y
     `.CONTINUOUS.` en los demás. No se usa `.CONT_SAME_GRADIENT.`, que sería más
     preciso donde recta y arco se tocan por tangencia, porque un pliegue de
     radio cero sí rompe la pendiente y entonces la declaración sería falsa. */
  const ejeItems = cadenas.map(c => {
    if (c.length === 1) return c[0];
    const segs = c.map((id, k) => put('COMPOSITE_CURVE_SEGMENT('
      + (k === c.length - 1 ? '.DISCONTINUOUS.' : '.CONTINUOUS.') + `,.T.,#${id})`));
    return put(`COMPOSITE_CURVE('eje',(${segs.map(i => '#' + i).join(',')}),.U.)`);
  });

  /* --- los PI: de lo que hablan la tabla y el CSV de puntos --- */
  const pis = fk(model).pis;
  const piItems = pis.map((p, i) =>
    pt(p, i === 0 ? 'inicio' : i === pis.length - 1 ? 'fin' : `PI ${i}`));

  /* --- el perfil, colocado en el arranque de la barra. El marco de arranque es
         la identidad: `y` es el espesor y `z` el ancho, igual que en el 3D.

     Sale como CADENA CERRADA de rectas y no como `POLYLINE`, que es lo que
     parecía natural. Motivo, medido: OCCT lee una `POLYLINE` como UNA arista
     suelta y no construye hilo con ella, y el diálogo de barrido de FreeCAD solo
     ofrece como perfil los objetos que TIENEN hilo. O sea que el perfil estaba
     ahí, se veía en pantalla, y no se podía seleccionar para nada. Con la cadena
     cerrada entra como hilo cerrado y aparece en la lista.

     Un `composite_curve` es cerrado justamente cuando su último tramo NO es
     `.DISCONTINUOUS.`, así que aquí van todos `.CONTINUOUS.` — al revés que el
     eje, que es abierto. --- */
  const cara = sectionOutline(model.section).map(([a, b]) => new Vector3(0, a, b));
  const perfilItems: number[] = [];
  /* Una sección degenerada daría tramos de longitud cero, que no son una recta.
     Antes que escribir geometría inválida, el perfil no sale: los grupos vacíos
     se caen solos más abajo y el archivo sigue siendo válido. */
  const caraOk = cara.length >= 3 && cara.every((p, i) =>
    p.distanceTo(cara[(i + 1) % cara.length]) > 1e-9);
  if (caraOk) {
    const ids = cara.map(p => pt(p));
    const segs = cara.map((p, i) => {
      const j = (i + 1) % cara.length;
      const d = cara[j].clone().sub(p);
      const vec = put(`VECTOR('',#${dir(d.clone().normalize())},1.0)`);
      const ln = put(`LINE('',#${ids[i]},#${vec})`);
      const tc = put(`TRIMMED_CURVE('',#${ln},(#${ids[i]},PARAMETER_VALUE(0.0)),`
        + `(#${ids[j]},PARAMETER_VALUE(${NUM(d.length())})),.T.,.CARTESIAN.)`);
      return put(`COMPOSITE_CURVE_SEGMENT(.CONTINUOUS.,.T.,#${tc})`);
    });
    perfilItems.push(put(`COMPOSITE_CURVE('perfil',(${segs.map(i => '#' + i).join(',')}),.U.)`));
  }

  /* --- productos y formas: UNO POR GRUPO ---

     Tres raíces y no una. Con una sola, OCCT entrega un ÚNICO compuesto con
     todo mezclado dentro, y eso deja el archivo mirable pero inservible: en
     FreeCAD no hay un objeto «perfil» que ofrecerle al diálogo de barrido ni una
     trayectoria que seleccionar. Es lo que pasó el 2026-09-20, y no se ve
     leyendo el texto — el archivo era correcto.

     Cada grupo con su `PRODUCT` y su `SHAPE_DEFINITION_REPRESENTATION` llega
     como un objeto aparte y con su nombre. No hay relaciones de ensamblaje, y no
     hacen falta: son tres cosas sueltas en el mismo archivo, que es justo lo que
     son. El orden importa poco salvo que el perfil va antes que los PI, porque
     es el que hay que encontrar para barrer. */
  const grupos: { nombre: string; items: number[] }[] = [
    { nombre: 'eje', items: ejeItems },
    { nombre: 'perfil', items: perfilItems },
    { nombre: 'PI', items: piItems },
  ].filter(g => g.items.length);

  const app = put("APPLICATION_CONTEXT('automotive design')");
  put(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${app})`);
  const pctx = put(`PRODUCT_CONTEXT('',#${app},'mechanical')`);
  const pdc = put(`PRODUCT_DEFINITION_CONTEXT('part definition',#${app},'design')`);
  const nom = STR(meta.name);
  const sello = STR('BARCOMP ' + meta.build);
  /* El nombre del PRODUCT es el del grupo, porque es lo que se lee en el árbol
     del CAD a la hora de elegir qué barrer. De qué pieza y de qué compilación
     salió va en la descripción, en el encabezado y en el comentario. */
  const proc = STR(meta.name + ' - BARCOMP ' + meta.build);

  for (const g of grupos) {
    const gn = STR(g.nombre);
    const gcs = put(`GEOMETRIC_CURVE_SET(${gn},(${g.items.map(i => '#' + i).join(',')}))`);
    const prod = put(`PRODUCT(${gn},${gn},${proc},(#${pctx}))`);
    put(`PRODUCT_RELATED_PRODUCT_CATEGORY('part','',(#${prod}))`);
    const pdf = put(`PRODUCT_DEFINITION_FORMATION('','',#${prod})`);
    const pd = put(`PRODUCT_DEFINITION('design','',#${pdf},#${pdc})`);
    const pds = put(`PRODUCT_DEFINITION_SHAPE('','',#${pd})`);
    /* `GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION`, con `SHAPE_` en
       medio. Es el nombre de la entidad en AP203 y AP214, y el 2026-09-20 salió
       sin él: el archivo era sintácticamente perfecto —toda referencia resuelta,
       ids sin hueco, las pruebas en verde— y FreeCAD 1.1 contestaba «No shapes
       found in file». OCCT no reconoce la representación, y entonces no hay nada
       colgando de `SHAPE_DEFINITION_REPRESENTATION`: se descarta el archivo
       ENTERO, geometría incluida, sin una sola queja de sintaxis. */
    const rep = put(`GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION(${gn},`
      + `(#${gcs}),#${ctx})`);
    put(`SHAPE_DEFINITION_REPRESENTATION(#${pds},#${rep})`);
  }

  /* --- el encabezado --- */
  const desc = [
    `eje nominal de ${B.length} dobleces, curvas exactas (LINE + CIRCLE), mm`,
    retorcido
      ? 'ATENCION: la pieza lleva torsion. El perfil sale colocado en el arranque,'
        + ' y barrerlo por el eje da la pieza SIN retorcer.'
      : 'sin torsion: barrer el perfil por el eje reproduce la pieza',
    'nominal comandado; NO es la pieza medida ni la forma sujeta',
  ];
  const head = [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION((${desc.map(STR).join(',')}),'2;1');`,
    `FILE_NAME(${nom},${STR(meta.date)},(''),(''),${sello},${sello},'');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
    'ENDSEC;',
    'DATA;',
  ];

  /* --- la tabla, como comentario: ningun CAD lo lee y ninguno puede romperse
         con el, y quien abra el archivo a mano lo tiene todo delante --- */
  const sec = model.section;
  const tabla = [
    '/* ' + ASC('BARCOMP ' + meta.build + ' - ' + meta.name),
    ASC(`   seccion ${sec.kind} ${sec.width} x ${sec.thickness} mm`
      + (sec.wall ? `, pared ${sec.wall} mm` : ', maciza')),
    ASC(`   longitud desarrollada ${developedLength(model).toFixed(3)} mm`
      + `, cola ${model.tail} mm`),
    ASC(`   tolerancias: angulo ${model.tol.angle} deg, rodado ${model.tol.rot} deg,`
      + ` avance ${model.tol.feed} mm, punto ${model.tol.point} mm`),
    fuera ? ASC(`   ${fuera} tramo(s) degenerado(s) omitido(s): longitud o radio nulos`) : '',
    '   n   feed(mm)    rot(deg)  angle(deg) radius(mm)  twist(deg) twistLen(mm)',
    ...B.map((b, i) => ASC('  ' + String(i + 1).padStart(2)
      + b.feed.toFixed(3).padStart(11) + b.rot.toFixed(3).padStart(12)
      + b.angle.toFixed(3).padStart(11) + b.radius.toFixed(3).padStart(11)
      + b.twist.toFixed(3).padStart(12) + b.twistLen.toFixed(3).padStart(12))),
    '*/',
  ].filter(l => l !== '');

  return [...head, ...tabla, ...lines, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n');
}
