# BARCOMP α — visor web

Compensación de dobleces para una barra rectangular de aluminio (~1.7 m, ~15
dobleces contra el ancho y contra el espesor) doblada por un robot contra una
rotary draw. Se escanea con GOM, se compara contra el CAD nominal y se decide
**cuánto mover cada ángulo comandado** para que la siguiente pieza salga dentro
de tolerancia.

**Abrir:** <https://hdzdaniel7.github.io/Twister-Register/>

También funciona sin red: `index.html` es un solo archivo con todo empotrado, así
que se descarga y se abre con doble clic. Es un requisito duro — el taller no
tiene internet.

> Alfa de demostración: `simulate()` inventa la pieza medida. Falta reemplazarlo
> por datos reales de GOM.

---

## Qué hace

- **Cinemática directa e inversa** sobre los PI (puntos de intersección) del eje
  neutro, con arcos inscritos y torsión repartida a lo largo de un tramo.
- **La tabla se teclea en rectas, no en avances.** La primera columna es
  `Recta`, el tramo recto de tangencia a tangencia, que es lo que se mide en la
  barra. El `Avance` de PI a PI queda al final, calculado y de solo lectura, y
  `Σ L` acumula la longitud desarrollada sobre el eje neutro; en el pie van la
  cola y la longitud total. Cambiar un radio o un ángulo **deja las rectas
  quietas y mueve los avances**, que es como se piensa en el taller.
- **La tabla se recorre con el teclado como una hoja de cálculo**: Tab / ⇧Tab en
  horizontal, Enter y ↑ ↓ en vertical, Esc descarta la celda, y el valor sube o
  baja un paso con la rueda del ratón o con Ctrl+↑ ↓. El foco no se pierde al
  confirmar.
- **Varios modelos comparables a la vez**, cada uno con su color, con una columna
  **Δ** al lado de cada parámetro compensable (avance, R de canto, ángulo de
  plano): la corrección se escribe junto al dato sin perder el valor original.
- **Extremo fijo común** entre modelos: amarre (P0), extremo libre, o mejor
  ajuste global (Kabsch). Con el extremo libre anclado, la divergencia se ve
  acumularse hacia el amarre — que es la lectura útil si el criterio de
  aceptación es la posición de la punta maquinada.
- **Edición de puntos PI** en XYZ, con insertar y eliminar. Es edición absoluta:
  mover un punto deja los demás donde están y la cadena se recalcula por inversa.
- **Colocación en el espacio**: elige un PI como origen y gira o mueve la pieza a
  su alrededor para verla en el ángulo que quieras. Es solo presentación — no
  toca ningún avance, ángulo ni radio, y se aplica a la escena entera, así que
  la comparación entre modelos no cambia.
- **Puntos de referencia**: cotas sueltas que pones a mano o importas por CSV.
  Cada una se une con el PI más cercano del modelo activo y dice a cuánto quedó.
  Sirve para acotar contra el fixture o un datum de taller.
- **Lazo de compensación**: `nuevo comando = comando actual + ganancia ×
  (nominal − medido)`, con ganancia separada para el doblez de canto y el de
  plano. No se calcula el arrastre entre dobleces: se regenera la cadena entera.
  Las medidas son fijas y **la compensación es lo único editable**: la celda
  `Δ aplicada` acepta cuentas sobre lo que calculó el lazo, escrito `c`.
- **Cinta inferior** que desenrolla la longitud desarrollada, una columna por
  doblez coloreada por desviación. Con pieza medida muestra la desviación del
  desvío total; sin ella, el Δ contra el modelo de referencia.
- **Tema claro y oscuro**, con un tercer estado que sigue la preferencia del
  sistema. El 3D y la cinta leen sus colores del CSS, así que cambian con el
  resto: no hay una segunda paleta escondida en el código.
- Reporte imprimible con las cuatro vistas, importar/exportar CSV de puntos, y
  todo en **español, inglés y alemán**.

---

## Cómo está hecho

Un doblez es `{feed, rot, angle, radius, twist, twistLen}`, en mm y grados. La
cadena cinemática es

```
T  ←  T · Trans(feed,0,0) · Ry(rot) · Rz(angle) · Rx(twist)
```

con el marco local `x` = eje de la barra · `y` = espesor · `z` = ancho. **Cada
estación lleva dos dobleces perpendiculares, no un giro y un doblez**: `angle`
dobla de plano (contra el espesor) y `rot` dobla de canto (contra el ancho).
Esto se aparta de la convención LRA/YBC de la industria, donde el segundo
parámetro rueda la pieza entre dobleces; fue una decisión de diseño explícita.

Un PI es un vértice y por lo tanto **un solo arco**: `bendDecomp()` parte el par
en `Rot(eje, θ) · Rx(ψ)`, donde el eje es perpendicular al eje de la barra —lo
único que no rueda la sección— y `ψ` es el rodado residual, cero exacto cuando
el doblez tiene una sola componente.

El espacio está repartido en tres bandas: arriba los paneles a los lados y el
3D en medio, con la desviación y las estadísticas en el lateral derecho; debajo
la cinta como banda fina; y al fondo la tabla a todo el ancho con sus pestañas.
Dos tiradores: `#rtgrip` mueve el ancho del lateral y `#btgrip` el alto de la
tabla.

```
web/
  src/engine.js     EL MOTOR: cinemática, variantes, anclaje, compensación. Sin DOM.
  src/app.js        orquestador: acciones, eventos por delegación, arranque
  src/state.js      ST: modelos, referencia, anclaje, capas, piezas medidas
  src/scene.js      three.js: barrido de la sección, capas, picking, capturas
  src/panels.js     paneles, las 3 pestañas y el lateral fijo (devuelven cadenas)
  src/ribbon.js     la cinta inferior (canvas 2D)
  src/report.js     reporte imprimible · src/io.js  archivos locales
  src/i18n.js       I18N.es / .en / .de — todo texto visible pasa por T('clave')
  src/app.css       tokens de diseño y layout; la paleta de los DOS temas
  src/shell.html    esqueleto con los marcadores del build
  build.mjs         esbuild: src/ + three  ->  index.html
  test_motor.js     104 pruebas del motor y del i18n, en Node y sin navegador
index.html          SALIDA GENERADA — no se edita a mano
```

---

## Desarrollo

```bash
cd web
npm install          # una sola vez: three + esbuild
npm test             # 104 pruebas del motor
npm run build        # regenera index.html (y web/barcomp_viewer.html en local)
```

**`index.html` es un artefacto compilado de ~643 KB con three.js empotrado.
Nunca se edita a mano: el siguiente build borra el cambio.** Se edita `web/src/`.

El empaquetador es **esbuild**: resuelve todos los `import` (three y
`OrbitControls` incluidos) y emite un IIFE que se empotra en un único `<script>`
inline. En el HTML final no queda ni un import, ni un `fetch()`, ni una CDN — por
eso sigue abriendo con doble clic sin servidor. La única vez que hace falta
internet es el `npm install`.

### Reglas que no son evidentes

- Milímetros y grados en la interfaz y en el JSON; radianes solo dentro de las
  funciones. Sistema derecho.
- Todo texto visible pasa por `T('clave')`, y la cadena va en `I18N.es`,
  `I18N.en` **y** `I18N.de`. `npm test` comprueba que los tres tengan
  exactamente el mismo juego de claves, que ninguna esté vacía y que ninguna
  arrastre el español sin traducir.
- Ni `scene.js` ni `ribbon.js` llevan colores propios: los leen de `:root` con
  `cssVar()`. Un color nuevo se define en `app.css`, en los dos temas.
- Nada de `localStorage` ni `sessionStorage`, nada de CDNs ni `fetch()`.
- Los paneles se reconstruyen enteros, así que los inputs de tabla usan el evento
  `change`, no `input`, o se pierde el foco al escribir. Al confirmar una celda
  de la tabla de modelo NO se reconstruye el panel: `updateModelDerived()`
  reescribe solo las celdas calculadas. Para todo lo demás hay una red de
  guardado y restauración del foco dentro de `renderRight()`.
- `ST.model` es solo una caché del modelo efectivo (base + Δ) del modelo activo:
  después de tocar un modelo hay que llamar `syncModel()`.
- Si agregas objetos a la escena, mételos en un grupo de `groups{}` y haz
  `dispose()`, o filtras memoria.

---

## La compensación se puede corregir a mano

La tabla de comandos muestra, por doblez, el valor actual, lo que sugiere el
lazo (`Δ calc.`) y la **Δ aplicada**, que es la única celda editable. Ahí se
escribe un número o una cuenta sobre el cálculo:

| escribes | resultado |
|---|---|
| `2` | la compensación pasa a valer 2 |
| `+2` | dos más de lo que calculó el lazo |
| `c+2` | lo mismo, explícito |
| `c*1.1` | un 10 % más de lo que calculó |
| `(c+1)/2` | lo que haga falta |

Se guarda la **diferencia** contra el cálculo, no el valor absoluto: si después
cambias la ganancia o llega otra pieza medida, «dos décimas más de lo que
sugiera el lazo» sigue significando eso. Al aplicar la compensación el ajuste
queda dentro del comando y vuelve a cero.

Se evalúa con un parser propio; no se usa `eval()`.

---

## La tabla de dobleces

Trece columnas, en orden de proceso:

```
#  Or.  Recta Δ  R canto Δ  Áng plano Δ  Radio  Twist  Long.tw.  Avance   Σ L
        └───────────── se teclean ─────────────────────────────┘  └── se leen ──┘
```

Cada fila son **dos tramos**: la recta que llega al doblez, y el doblez que
ocurre al final de esa recta.

```
trim(i)  = radius(i) · tan(θ(i)/2)              θ de bendDecomp()
Avance   = Recta(i) + trim(i) + trim(i−1)       ← calculado
Σ L(i)   = Σ L(i−1) + Recta(i) + radius(i)·θ(i)
```

`Recta` es de tangencia a tangencia: el material que de verdad sale recto, y lo
único que se teclea. `Avance` es la distancia de PI a PI —la geometría del CAD,
donde se cruzarían las rectas si el doblez fuera una esquina viva— y sale solo.
El doblez le come a la recta un `trim` **por cada lado**, y de ahí la diferencia.

**La regla de edición:** las rectas mandan. Cambiar un radio, un R de canto o un
ángulo de plano deja **todas las rectas donde estaban** y recoloca los avances.
Como el `trim` de un doblez muerde por los dos lados, tocar el radio del doblez
`i` mueve **dos** avances, el `i` y el `i+1`; con el del último se ajusta la
cola. La longitud del arco (`radius · θ`) ya no es una columna: sigue contando
por dentro, dentro de `Σ L`.

Nada de esto cambia el archivo. **El JSON sigue guardando `feed`**, de PI a PI,
que es lo que ve `command[]` y lo que ve el motor de Python; la recta es la
lectura de ese mismo estado y `feedForStraight()` da la vuelta. Por eso
`compare_engines.py` sigue en verde y los archivos anteriores abren igual.

La cuenta vive en un solo sitio, `rowLengths()` en `engine.js`; `machineFeeds()`,
`twistSpanOf()`, `buildPath()` y `bendStations()` la consumen en vez de
repetirla.

### Teclado

| tecla | qué hace |
|---|---|
| `Tab` / `⇧Tab` | celda siguiente / anterior, en horizontal |
| `Enter`, `↑`, `↓` | celda de arriba o de abajo, en la misma columna |
| `Esc` | descarta lo escrito en la celda |
| rueda del ratón | sube o baja el valor un paso |
| `Ctrl+↑` / `Ctrl+↓` | lo mismo, con el teclado |

Las columnas calculadas se saltan solas al navegar, porque no son campos. Al
confirmar una celda no se reconstruye el panel, así que el foco nunca salta.

## Formato de archivo

Esquema `barcomp/1.0`, un JSON con el modelo, los comandos de máquina, las
ganancias, los parámetros del simulador, las piezas medidas y los modelos
comparados. Las claves `variants`, `ref` y `anchor` son opcionales: los archivos
viejos siguen abriendo.

`Recta` y `Σ L` **no se guardan**: son magnitudes derivadas de `feed`, `radius`
y los ángulos. El estado sigue siendo `feed`, de PI a PI, que es lo que ve el
motor de Python — aunque en la tabla sea la columna calculada y la recta la que
se teclea.

```jsonc
{
  "schema": "barcomp/1.0",
  "model": {
    "name": "...",
    "section": { "width": 40, "thickness": 12, "chamfer": 1.2, "endLen": 20 },
    "tol":     { "angle": 0.3, "rot": 0.5, "feed": 0.5, "point": 1.0 },
    "tail": 160,
    "bends": [{ "feed":100, "rot":0, "angle":30, "radius":30, "twist":0, "twistLen":0 }]
  },
  "command": [ /* lo que se manda a la máquina */ ],
  "comp":    { "gainW":0.75, "gainT":0.75, "doAngle":true, "doRot":false, "doFeed":false },
  "proc":    { "sbW":1.6, "sbT":1.0, "slip":0.12, "biasRot":0.35, "seed":7 },
  "variants": [{ "id":"v1", "name":"", "color":"", "base": { }, "deltas": [] }],
  "place":  { "pivot":0, "x":0, "y":0, "z":0, "rx":0, "ry":0, "rz":0 },
  "marks":  [{ "name":"apoyo A", "color":"#57C8D6", "x":0, "y":0, "z":0 }],
  "tweak":  [{ "angle":0, "rot":0, "feed":0 }],
  "ui":     { "theme":"system", "lang":"es" }
}
```

`place`, `marks`, `tweak` y `ui` también son opcionales.

`ui` guarda el tema y el idioma. Es la única forma de que sobrevivan a una
recarga, porque el proyecto no usa `localStorage`. **Un archivo sin `ui` no pisa
lo que el usuario tenga puesto**; en frío arranca con el tema del sistema y en
español.

---

## Estado

Alfa sin datos reales. En orden de impacto:

1. Reemplazar `simulate()` por mediciones de GOM. Los valores de springback
   (`sbW`, `sbT`) hay que ajustarlos contra piezas reales y **separados por
   orientación**: doblar contra el ancho y contra el espesor, con el laminado a
   lo largo, tiene constantes elásticas distintas.
2. Extraer los PI desde la nube de puntos: segmentar tramos rectos → ajustar
   rectas robustas → intersectar ejes → PI.
3. Confirmar qué parámetros acepta la dobladora. Si solo toma ángulo, `doRot` y
   `doFeed` se quedan apagados.
4. Flexión por gravedad en el fixture: en 1.7 m de aluminio puede ser del orden
   de las tolerancias.

**Hallazgo de la validación:** corrigiendo solo ángulos, los ángulos convergen a
0.15° pero la desviación de la punta libre se estanca en ~5 mm, porque el sesgo
de rotación se acumula a lo largo de la cadena. Activando también rotación y
avance, la punta baja a 0.17 mm. Ganancia recomendada 0.6–0.8, nunca 1.0: al
100 % el lazo oscila con el ruido de medición.
