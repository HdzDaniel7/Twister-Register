/* ------------------------------------------------------------------ safe --
   Lo que entra de FUERA y acaba dentro de un innerHTML o de un atributo: el
   nombre que alguien escribió en una cota, el color que traía un archivo. No
   importa nada, a propósito: lo usan el motor, el 3D y los paneles, y un
   módulo hoja no puede arrastrar una capa dentro de otra.

   Esto NO es paranoia de servidor. El programa corre bajo file://, y bajo
   file:// un `<img onerror>` que se cuele por el nombre de una cota se ejecuta
   con el mismo origen que el archivo, o sea con acceso al disco del taller. El
   archivo .json va y viene por correo y por USB entre la oficina de calidad y
   la máquina; que lo escriba un compañero no lo hace de fiar, lo hace
   simplemente de origen desconocido.                                        */

/** Texto libre que va a parar a un innerHTML. Escapa lo justo para que no se
 *  pueda cerrar una etiqueta ni un atributo entrecomillado. */
export const esc = (s: string): string => String(s).replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);

/** Color por defecto de cualquier cosa que no supimos leer. */
export const COLOR_FALLBACK = '#57C8D6';

/* Solo hexadecimal, que es lo ÚNICO que este programa escribe nunca: los
   colores salen todos de un <input type="color">, y ese siempre devuelve
   #rrggbb. Una lista blanca tan estrecha se puede comprobar de un vistazo, y
   deja fuera de un plumazo `url(...)`, las comillas que se salen del atributo
   y cualquier función de CSS. Un archivo escrito a mano con «red» pierde el
   rojo y se queda en el color por defecto: es el precio, y es barato. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Devuelve el color si es uno de los que sabemos escribir, y si no el de
 *  reserva. Nunca devuelve algo que pueda salirse de un atributo. */
export const safeColor = (c: unknown, fallback: string = COLOR_FALLBACK): string =>
  (typeof c === 'string' && HEX.test(c.trim()) ? c.trim() : fallback);
