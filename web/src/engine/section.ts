/* =========================================================================
   LO QUE LA SECCIÓN SABE DE SÍ MISMA

   Un solo sitio para las seis preguntas que el resto del programa le hace a la
   sección de la barra. Hasta el 2026-09-17 estaban escritas donde hacían falta,
   y la de «cuánto asoma» estaba TRES veces —`fixture.ts`, `contact.ts`,
   `pins.ts`— con tres nombres y tres comentarios que decían lo mismo.

     · `sectionArea`     cuánto pesa un milímetro de barra      `lineLoad`
     · `sectionI`        con qué resiste la flexión             flecha, carga, amarre
     · `sectionHalf`     cuánto asoma en una dirección          fixture, contacto, pines
     · `sectionDrop`     lo mismo en vertical: la cara de abajo pedestales
     · `sectionFibre`    la fibra más lejana, para el esfuerzo  `restrain`
     · `sectionOutline`  el contorno, para el 3D                `barGeometry`

   POR QUÉ JUNTAS: son exactamente las seis que cambian con la FORMA. Repartidas,
   una forma nueva se olvida en el sitio que no se tocó y la barra pesa como un
   tubo pero se apoya como un macizo.

   LAS FORMAS, y lo que hay que saber de cada una antes de fiarse de un número:

   · **Rectangular**, maciza o hueca. Es la de siempre. Poniendo ancho = espesor
     sale la cuadrada, y con pared, el tubo cuadrado.
   · **Redonda**, maciza o hueca. `Iz = Iy`, y eso NO es un detalle de la cuenta:
     una barra redonda no tiene «de plano» ni «de canto», así que el RODADO deja
     de cambiar con qué resiste y el TWIST de la pieza no se puede observar.
     Quien lea `rot` en una redonda está leyendo hacia dónde se dobla, no cómo.

   LO QUE EL HUECO **NO** TOCA, y es la mitad del trabajo que este archivo ahorra:
   el contacto, el fixture y la silueta dependen solo del perfil EXTERIOR. Un
   tubo toca el pedestal donde lo tocaría el macizo del mismo tamaño. El hueco
   cambia lo que pesa (`sectionArea`) y lo que resiste (`sectionI`), y nada más.

   LO QUE ESTO NO SABE TODAVÍA: el radio mínimo de un tubo lo manda la relación
   diámetro/pared y la ovalización al doblarlo, no el material. Los umbrales de
   `engine/lims.ts` siguen siendo los de una barra maciza. Está abierto en el
   plan, y hasta entonces un tubo se dobla en pantalla más fácil de lo que se
   dobla en la máquina.

   El chaflán no entra en ninguna de las seis cuentas: quita material de las
   esquinas, así que solo puede hacer la sección MÁS pequeña, e ignorarlo declara
   el contacto antes y no después. Se dibuja y ya.
   ========================================================================= */
import type { Vector3 } from 'three';
import type { PathSample, Section, SecKind } from '../types.ts';

/** Las formas que este motor sabe describir, en el orden en que se enseñan. */
export const SEC_KINDS: SecKind[] = ['rect', 'round'];

/** La sección de fábrica: la pletina de 40×12 con la que se montó todo. */
export const SECTION_DEFAULT: Readonly<Section> = Object.freeze({
  kind: 'rect' as SecKind, width: 40, thickness: 12, wall: 0, chamfer: 1.2, endLen: 20,
});

/** Sanea una sección venida de un archivo o de un campo de la pantalla.
 *
 *  Mismo trato que `normLims()` y `normLoad()`: lo que no se entienda vuelve al
 *  valor de fábrica en vez de envenenar el motor con un `NaN` que sale a
 *  trescientos sitios. Tres reglas, y las tres tienen motivo:
 *
 *  · una REDONDA tiene una sola medida exterior —`width` es el diámetro— y
 *    `thickness` no lo usa NADIE: ninguna de las seis cuentas lo mira. Se
 *    conserva tal cual, y esa es la decisión: igualarlo al diámetro perdía el
 *    espesor al pasar a redonda y volver, y ya no compra nada. Compraba que un
 *    lector que no supiera de formas leyera una caja envolvente, y desde que el
 *    esquema sube a 2.4 ese lector no abre el archivo, se para y lo dice;
 *  · la pared se topa a la mitad de la menor medida exterior. Una pared mayor
 *    que eso no es un tubo de paredes gruesas: es una barra maciza con el dato
 *    mal escrito, y así sale maciza en vez de con área negativa;
 *  · el chaflán se topa igual: más que eso se come la sección entera.
 */
export function normSection(o: Partial<Section> | null | undefined): Section {
  const s = o || {};
  const num = (v: unknown): number =>
    (typeof v === 'string' ? parseFloat(v) : (v as number));
  const pos = (v: unknown, d: number): number => {
    const x = num(v);
    return isFinite(x) && x > 0 ? x : d;
  };
  const kind: SecKind = s.kind === 'round' ? 'round' : 'rect';
  const width = pos(s.width, SECTION_DEFAULT.width);
  const thickness = pos(s.thickness, SECTION_DEFAULT.thickness);
  /* La pared y el chaflán se topan contra la medida que de verdad limita: en
     una redonda es el diámetro, y el espesor guardado no pinta nada. */
  const menor = kind === 'round' ? width : Math.min(width, thickness);
  /* CERO es un valor, no un hueco: «sin chaflán» y «sin tocho» se escriben así.
     Solo cuando la clave falta o no es un número se cae al de fábrica, que es lo
     que hacía el `{...defaults, ...section}` de antes. Confundir las dos cosas
     le ponía chaflán a quien había pedido que no lo hubiera. */
  const noNeg = (v: unknown, d: number): number => {
    const x = num(v);
    return isFinite(x) && x >= 0 ? x : d;
  };
  return {
    kind, width, thickness,
    wall: Math.min(noNeg(s.wall, 0), menor / 2),
    chamfer: Math.min(noNeg(s.chamfer, SECTION_DEFAULT.chamfer), menor / 2),
    endLen: noNeg(s.endLen, SECTION_DEFAULT.endLen),
  };
}

/** ¿Es hueca de verdad? Una pared topada a la mitad justa deja el hueco a cero,
 *  y eso ES maciza: la cuenta lo da sola, pero hay quien pregunta. */
export const isHollow = (sec: Section): boolean =>
  (sec.wall || 0) > 0 && sec.wall < Math.min(sec.width, sec.thickness) / 2;

/** Las medidas INTERIORES, mm. Cero las dos si es maciza. */
const hueco = (sec: Section): { w: number; t: number } => {
  const e = sec.wall || 0;
  if (!(e > 0)) return { w: 0, t: 0 };
  return { w: Math.max(0, sec.width - 2 * e), t: Math.max(0, sec.thickness - 2 * e) };
};

/** Área de la sección, mm². Lo de fuera menos lo de dentro, que es todo lo que
 *  hay que saber: un tubo pesa lo que su pared. */
export function sectionArea(sec: Section): number {
  const h = hueco(sec);
  if (sec.kind === 'round') return Math.PI / 4 * (sec.width ** 2 - h.w ** 2);
  return sec.width * sec.thickness - h.w * h.t;
}

/** Los dos momentos de inercia principales, mm⁴.
 *
 *  `Iz` es el de la flexión que hunde en `y` —la que trabaja con el espesor, y
 *  la que produce el codo de ÁNGULO de una estación— e `Iy` el de la que hunde
 *  en `z`, con el ancho. Los dos juntos y no cada uno en su sitio: escritos dos
 *  veces, basta con cambiar la sección en uno para que la barra se cuelgue con
 *  una inercia y pese con otra.
 *
 *  Hueca = lo de fuera menos lo de dentro, y eso vale porque las dos comparten
 *  centro. En una REDONDA los dos salen iguales, y esa igualdad no es un detalle
 *  de la cuenta: quiere decir que una barra redonda no tiene «de plano» ni «de
 *  canto», así que el RODADO deja de cambiar con qué resiste. Ver `sagI()`. */
export function sectionI(sec: Section): { Iz: number; Iy: number } {
  const h = hueco(sec);
  if (sec.kind === 'round') {
    const I = Math.PI / 64 * (sec.width ** 4 - h.w ** 4);
    return { Iz: I, Iy: I };
  }
  return {
    Iz: (sec.width * sec.thickness ** 3 - h.w * h.t ** 3) / 12,
    Iy: (sec.thickness * sec.width ** 3 - h.t * h.w ** 3) / 12,
  };
}

/** Cuánto asoma la sección desde su eje neutro en la dirección `u`, mm.
 *
 *  Es la función soporte del perfil EXTERIOR, y ahí está la mitad del trabajo
 *  que este archivo se ahorra: el contacto, el fixture y la silueta no se
 *  enteran de si la barra es hueca. Un tubo toca el pedestal donde lo tocaría el
 *  macizo del mismo tamaño; lo que cambia es lo que pesa y lo que resiste.
 *
 *  · REDONDA: el radio, mire uno por donde mire. Por eso una barra redonda apoya
 *    igual en cualquier posición y el rodado no mueve el fixture.
 *  · RECTANGULAR: con la barra de canto lo que asoma de lado es el espesor y de
 *    plano es el ancho, y entre medias se reparten — de ahí que sean dos valores
 *    absolutos y no un `if`.
 *
 *  `u` tiene que venir normalizado. El chaflán no entra en ninguno de los dos
 *  casos: quita material de las esquinas, así que solo puede hacer la sección
 *  MÁS pequeña. Ignorarlo declara el contacto antes y no después, que es el lado
 *  seguro. */
export const sectionHalf = (q: PathSample, sec: Section, u: Vector3): number =>
  (sec.kind === 'round'
    ? sec.width / 2
    : Math.abs((sec.thickness / 2) * q.y.dot(u)) + Math.abs((sec.width / 2) * q.z.dot(u)));

/** Cuánto baja la cara de abajo de la barra por debajo del eje, mm.
 *
 *  `sectionHalf` contra la vertical del mundo, escrito sin construir el vector:
 *  la componente z de cada dirección de la sección ES su producto escalar con
 *  (0,0,1), y esto se llama por cada muestra de cada pedestal en cada vuelta del
 *  solver de la carga. */
export const sectionDrop = (q: PathSample, sec: Section): number =>
  (sec.kind === 'round'
    ? sec.width / 2
    : Math.abs((sec.thickness / 2) * q.y.z) + Math.abs((sec.width / 2) * q.z.z));

/** La fibra más lejana del eje neutro, mm, para σ = E·c·κ.
 *
 *  Media sección, y cuál depende de contra qué se dobla: con el codo de ÁNGULO
 *  manda el espesor y con el de RODADO manda el ancho, así que se pide la que de
 *  verdad trabaja en esa estación. En una redonda son la misma. No hace falta la
 *  inercia: se cancela entre el momento y el módulo resistente.
 *
 *  Hueca o maciza da igual AQUÍ, y conviene entender por qué: la fibra es la
 *  distancia al borde, y el borde de un tubo está donde el del macizo. Lo que el
 *  hueco cambia es el momento que hace falta para curvarlo, no dónde duele. */
export const sectionFibre = (sec: Section, rotManda: boolean): number =>
  (sec.kind === 'round' ? sec.width / 2 : (rotManda ? sec.width : sec.thickness) / 2);

/** El contorno exterior de la sección en el plano `(y, z)` de la muestra, como
 *  pares `[a, b]` que multiplican a `y` y a `z`. Lo usa el 3D.
 *
 *  Sale de aquí y no de `scene/geometry.ts` porque es la MISMA forma que
 *  contestan las cinco cuentas de arriba: dibujar un cuadrado donde la física
 *  cuenta un círculo es la manera de que la pantalla y los números discrepen sin
 *  que nadie lo note. `n` solo lo usa la redonda. */
export function sectionOutline(sec: Section, n = 24): [number, number][] {
  if (sec.kind !== 'round') {
    const ht = sec.thickness / 2, hw = sec.width / 2;
    return [[+ht, +hw], [-ht, +hw], [-ht, -hw], [+ht, -hw]];
  }
  const r = sec.width / 2;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = 2 * Math.PI * i / n;
    out.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return out;
}
