/* =========================================================================
   LO QUE LA SECCIÓN SABE DE SÍ MISMA

   Un solo sitio para las cinco preguntas que el resto del motor le hace a la
   sección de la barra. Hasta el 2026-09-17 las cinco estaban escritas donde
   hacían falta, y la MISMA cuenta —cuánto asoma la sección en una dirección—
   estaba escrita tres veces, en `fixture.ts`, en `contact.ts` y en `pins.ts`,
   con tres nombres distintos y tres comentarios que decían lo mismo.

   Las cinco preguntas, y quién las hace:

     · `sectionArea`   cuánto pesa un milímetro de barra          `lineLoad`
     · `sectionI`      con qué se resiste la flexión              flecha, carga, amarre
     · `sectionHalf`   cuánto asoma en una dirección              fixture, contacto, pines
     · `sectionDrop`   lo mismo, en vertical: la cara de abajo    pedestales
     · `sectionFibre`  la fibra más lejana, para el esfuerzo      `restrain`

   POR QUÉ EXISTE ESTE ARCHIVO, y no es el gusto por ordenar: aquí entran las
   formas —tubo, redondo— y son cinco respuestas distintas por forma. Con las
   cuentas repartidas, una forma nueva se olvida en el sitio que no se tocó y la
   barra pesa como un tubo pero se apoya como un macizo. Esta pasada NO añade
   ninguna forma: mueve la del rectángulo macizo tal cual está, y hay prueba de
   que la superficie del motor y los números no se movieron.

   El chaflán no entra en ninguna de las cinco. Quita material de las esquinas,
   así que solo puede hacer la sección MÁS pequeña: ignorarlo declara el
   contacto antes y no después, que es el lado seguro. Se dibuja y ya.
   ========================================================================= */
import type { Vector3 } from 'three';
import type { PathSample, Section } from '../types.ts';

/** Área de la sección, mm². */
export const sectionArea = (sec: Section): number => sec.width * sec.thickness;

/** Los dos momentos de inercia principales, mm⁴.
 *
 *  `Iz` es el de la flexión que hunde en `y` —la que trabaja con el espesor, y
 *  la que produce el codo de ÁNGULO de una estación— e `Iy` el de la que hunde
 *  en `z`, con el ancho. Los dos juntos y no cada uno en su sitio: escritos dos
 *  veces, basta con cambiar la sección en uno para que la barra se cuelgue con
 *  una inercia y pese con otra. */
export function sectionI(sec: Section): { Iz: number; Iy: number } {
  return {
    Iz: sec.width * sec.thickness ** 3 / 12,
    Iy: sec.thickness * sec.width ** 3 / 12,
  };
}

/** Cuánto asoma la sección desde su eje neutro en la dirección `u`, mm.
 *
 *  No es `width/2` sin más: con la barra de canto lo que asoma de lado es el
 *  espesor, y de plano es el ancho. Entre medias se reparten, así que se
 *  proyectan las dos direcciones de la sección sobre `u` y se suman en valor
 *  absoluto — de ahí que sean dos valores absolutos y no un `if`.
 *
 *  `u` tiene que venir normalizado. Esto es la función soporte del rectángulo,
 *  y es lo único que el contacto y el fixture necesitan saber de la forma: por
 *  eso un tubo no cambiará ni un número de ahí —el perímetro exterior es el
 *  mismo— y sí cambiará el peso y la rigidez. */
export const sectionHalf = (q: PathSample, sec: Section, u: Vector3): number =>
  Math.abs((sec.thickness / 2) * q.y.dot(u)) + Math.abs((sec.width / 2) * q.z.dot(u));

/** Cuánto baja la cara de abajo de la barra por debajo del eje, mm.
 *
 *  `sectionHalf` contra la vertical del mundo, escrito sin construir el vector:
 *  la componente z de cada dirección de la sección ES su producto escalar con
 *  (0,0,1), y esto se llama por cada muestra de cada pedestal en cada vuelta
 *  del solver de la carga. */
export const sectionDrop = (q: PathSample, sec: Section): number =>
  Math.abs((sec.thickness / 2) * q.y.z) + Math.abs((sec.width / 2) * q.z.z);

/** La fibra más lejana del eje neutro, mm, para σ = E·c·κ.
 *
 *  Media sección, y cuál depende de contra qué se dobla: con el codo de ÁNGULO
 *  manda el espesor y con el de RODADO manda el ancho, así que se pide la que
 *  de verdad trabaja en esa estación. No hace falta la inercia: se cancela
 *  entre el momento y el módulo resistente. */
export const sectionFibre = (sec: Section, rotManda: boolean): number =>
  (rotManda ? sec.width : sec.thickness) / 2;
