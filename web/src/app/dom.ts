/* ------------------------------------------------------------------ dom --
   El atajo de siempre, en un solo sitio: lo usan los cuatro archivos de
   eventos y el arranque. Duplicarlo era la via corta a que uno se quedara con
   otra firma.                                                              */
export const $ = <T extends Element = HTMLElement>(s: string): T | null => document.querySelector<T>(s);
