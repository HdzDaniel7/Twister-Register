/* ------------------------------------------------------------------ i18n --
   Todo texto visible pasa por T('clave'). Al agregar una cadena hay que
   ponerla en los TRES: i18n/es.ts, i18n/en.ts e i18n/de.ts, y la clave en
   i18n/keys.ts. Los tres diccionarios se anotan `Record<I18nKey, string>`, asi
   que olvidarse de uno es un error de compilacion; test_motor.js lo comprueba
   ademas en tiempo de ejecucion. Cambiar de idioma llama renderAll(), que
   reconstruye toda la interfaz: por eso no hay atributos data-i18n en el HTML
   estatico.

   Este archivo es solo el barril y el estado: las tablas viven en i18n/, una
   por idioma. Juntas pasaban de las 400 lineas de la regla, y ademas un
   diccionario es una TABLA DE DATOS: partirlo por idioma es el corte natural,
   y de paso un cambio en aleman deja de tocar el mismo archivo que uno en
   espanol.
   ========================================================================= */
import { es } from './i18n/es.ts';
import { en } from './i18n/en.ts';
import { de } from './i18n/de.ts';
import type { Lang, I18nKey } from './i18n/keys.ts';
export type { Lang, I18nKey } from './i18n/keys.ts';

export const I18N = { es, en, de } satisfies Record<Lang, Record<I18nKey, string>>;


export const LANGS: Lang[] = ['es', 'en', 'de'];
export const LANG: { cur: Lang } = { cur: 'es' };
export const setLang = (l: string): void => { LANG.cur = LANGS.includes(l as Lang) ? (l as Lang) : 'es'; };
export const T = (k: I18nKey): string => (I18N[LANG.cur][k] ?? k);
