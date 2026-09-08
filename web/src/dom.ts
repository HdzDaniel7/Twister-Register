/* ------------------------------------------------------------------ dom --
   El atajo de siempre, UNA sola vez. Estaba copiado cuatro veces —en app/,
   en panels/, en la cinta y en el escenario— con la misma firma por
   casualidad, no por contrato: la vía corta a que una copia se quedara
   devolviendo `Element` mientras las otras devolvían `HTMLElement`, y a que
   nadie se enterara hasta topar con un `.value` que no existe.

   Va en la raíz de src/ y no dentro de una capa: lo piden las cuatro, y un
   módulo hoja sin dependencias no puede arrastrar ninguna dentro de otra.  */

/** Selector con el tipo del elemento esperado; por defecto HTMLElement, que
 *  es lo que necesitan .innerHTML/.textContent/.scrollTop/.title/.focus. */
export const $ = <T extends Element = HTMLElement>(s: string): T | null => document.querySelector<T>(s);
