# Ejemplos para ver el amarre

Dos archivos de la **misma pieza**, con los **mismos cuatro pines** y el **mismo
ángulo movido**. Entre uno y otro cambia UNA cosa: si la barra está sujeta.

| archivo | amarre | qué se ve |
|---|---|---|
| `amarre-libre.json` | apagado | la barra se va a donde la manda la tabla, como siempre |
| `amarre-sujeta.json` | encendido | la barra no puede irse: se queda donde la dejan los pines y se deforma |

Son **sintéticos** —salen de `demoModel()`, no de ninguna pieza real— y por eso
se versionan, al contrario que todo lo que cae en `piezas/`. Se regeneran con
`cd web && npm run demo:archivos`; no se editan a mano.

## Cómo verlo, en un minuto

1. Abre `index.html` (doble clic) o <https://hdzdaniel7.github.io/Twister-Register/>.
2. **Archivo → Abrir** → `ejemplos/amarre-libre.json`. Fíjate en dónde queda la
   punta de la barra. Gira la vista hasta mirar la mesa desde arriba (botón
   **Planta**): los cuatro postes se ven al lado de la barra.
3. **Archivo → Abrir** → `ejemplos/amarre-sujeta.json`.

Lo que aparece en el segundo y no en el primero:

- **Dos barras en el 3D.** La sólida es la que describe la tabla —la barra
  libre— y la de alambre rosa es **donde acaba de verdad al estar sujeta**. Los
  segmentos rosas unen cada punto con su sitio nuevo: ahí se ve *dónde* cedió.
- **La barra de estado**, arriba a la derecha del pie: `Barra sujeta por los
  pines · 2 · 20% del límite`.
- **La pestaña Amarre**, con las cifras:

| | valor que tiene que salir |
|---|---|
| pines sujetando | 2 de 4 |
| punta | ≈ 20.5 mm |
| peor codo | B6 |
| esfuerzo | ≈ 20 % del límite elástico |

Solo dos de los cuatro pines sujetan, y eso es correcto: **un pin empuja, no
tira**. Los otros dos se quedaron con aire delante cuando la barra se movió, y
un pin con hueco a favor no hace nada. La columna «Hueco» de la tabla lo dice.

## Qué tocar para convencerte de que no es un dibujo

- **Apaga el interruptor** «Barra sujeta por los pines». La barra de alambre
  desaparece y la pieza vuelve a ser exactamente la de antes. Vuelve a
  encenderlo.
- **Apaga la casilla «Sujeta»** de uno de los dos pines que están sujetando (los
  marcados en la columna «Estado»). El reparto de la deformación cambia y la
  punta se mueve. Si el amarre fuera un adorno, no cambiaría nada.
- **Baja la altura de un pin** a 5 mm. La columna «Llega» se pone en rojo y ese
  pin deja de sujetar: un poste más bajo que la barra no la toca por bien puesto
  que esté.
- **Cambia el módulo E** de 69000 a 200000 MPa. El esfuerzo casi se triplica y
  **la barra no se mueve ni un micrón**. Con sección constante el módulo se
  cancela en el reparto: hace falta para el esfuerzo, no para la forma.
- **Vete a la pestaña Modelo y sigue subiendo el ángulo de B4.** El porcentaje
  del límite elástico sube; pasado el 100 % aparece el aviso de que la barra ya
  no vuelve al soltarla.

## Lo que esto no dice

Que el programa hace lo que dice su modelo. **No** que el modelo describa a tu
barra: para eso hace falta escanear una pieza **con el fixture puesto** y el
certificado del material. Hasta entonces, el *dónde* se concentra el esfuerzo es
bueno y el *cuánto* en MPa lleva valores de manual de un 6061-T6.

Para la prueba de escritorio, sin abrir el navegador: `cd web && npm run
demo:amarre`.
