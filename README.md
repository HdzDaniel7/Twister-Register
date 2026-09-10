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

- **Tres modos de trabajo** —Modelar, Medir, Compensar— y cada uno se queda la
  pantalla entera. No son pestañas de una tabla: el programa hace tres trabajos
  distintos y antes los tres se repartían el mismo hueco, así que la tabla de 13
  columnas enseñaba dos filas. En Modelar la tabla va a la derecha, de arriba
  abajo, con el 3D **al lado**; en Medir manda el modelo; en Compensar los
  comandos van a todo el ancho. La tecla **F** deja el 3D a pantalla completa
  sin perder el sitio en la tabla.
- **Modo taller**: entrar en Compensar deja fuera de pantalla todo lo que no sea
  compensación, así que no hace falta un interruptor de bloqueo aparte.
- **Deshacer y rehacer** con Ctrl+Z / Ctrl+Y, 50 pasos. Deshace lo que cambia la
  PIEZA —celdas, puntos, modelos, cotas, colocación, compensación aplicada— y no
  la cámara, el modo, las capas ni el idioma: se espera que devuelva datos, no
  la vista desde la que se estaban mirando.
- **Cinemática directa e inversa** sobre los PI (puntos de intersección) del eje
  neutro, con arcos inscritos y torsión repartida a lo largo de un tramo.
- **La tabla se teclea en rectas.** La primera columna es `Recta`, el tramo
  recto de tangencia a tangencia, que es lo que se mide en la barra. Al final
  van `L` (la longitud del arco que genera el doblez) y `Σ L` (la longitud
  desarrollada acumulada), las dos de solo lectura, y en el pie la cola y el
  total. El `Avance` de PI a PI sigue siendo lo que se guarda y lo que se manda
  a la máquina, pero se calcula por debajo: cambiar un radio o un ángulo **deja
  las rectas quietas y recoloca los avances**, que es como se piensa en el
  taller.
- **La tabla se recorre con el teclado como una hoja de cálculo**: Tab / ⇧Tab en
  horizontal, Enter y ↑ ↓ en vertical, Esc descarta la celda, y el valor sube o
  baja un paso con la rueda del ratón o con Ctrl+↑ ↓. El foco no se pierde al
  confirmar.
- **Varios modelos comparables a la vez**, cada uno con su color, con una columna
  **Δ** al lado de cada parámetro compensable (recta, rodado, ángulo): la
  corrección se escribe junto al dato sin perder el valor original.
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
- **Puntos de referencia**: cotas sueltas que pones a mano. Cada una se une con
  el PI más cercano del modelo activo y dice a cuánto quedó. Sirve para acotar
  contra el fixture o un datum de taller.
- **Importar piezas medidas por CSV, en lote**: un archivo por pieza, con los PI
  en columnas x,y,z. De cada línea se toman las tres últimas columnas numéricas,
  así que un volcado con encabezado, con columna de índice o separado por punto
  y coma entra sin limpiarlo a mano. Los radios y la torsión no están en la nube
  de puntos: se arrastran del nominal por índice.
- **Cada pieza dice de dónde salió**: `SIM` si la inventó el simulador, `MED` si
  se importó. Sin eso se podía compensar contra números que no existen.
- **Lazo de compensación**: `nuevo comando = comando actual + ganancia ×
  (nominal − medido)`, con ganancia separada para el doblez de canto y el de
  plano. No se calcula el arrastre entre dobleces: se regenera la cadena entera.
  Las medidas son fijas y **la compensación es lo único editable**: la celda
  `Δ aplicada` se comporta como la de una hoja de cálculo (ver más abajo).
- **El lazo puede leer la mediana del lote** en vez de la última pieza. Con
  piezas reales hay variación, y compensar desde una sola mueve el comando por
  lo que fue dispersión de esa pieza: la siguiente puede salir peor. Con dos
  piezas o más, la tabla de desviación añade una columna **±σ** —MAD escalado—
  que separa un doblez sistemáticamente fuera de uno con mala puntería.
- **El resorte se mide, no se teclea a ojo**: `sb = 1 − ángulo medido / ángulo
  comandado`, por orientación, con su dispersión y su `n`. Avisa si depende del
  ángulo comandado —ahí una constante única miente— y si las piezas visibles son
  simuladas, porque entonces la cuenta devuelve lo que ya está escrito en el
  simulador. Adoptarlo es un botón, nunca automático.
- **Los umbrales que juzgan un dato se teclean**, en la pestaña **Límites**: por
  debajo de qué desvío el eje de un doblez medido es ruido, qué separación entre
  PI hace creíble un archivo, a qué escala deja de ser la misma pieza, qué recta
  necesita el herramental, y las cuatro guardas del lazo —banda muerta y tope
  por ciclo— que hasta ahora decidían el comando desde un valor que nadie eligió.
  Viajan en el JSON, así que un archivo guardado dice con qué umbrales se juzgó
  esa pieza, y la pantalla marca cuáles siguen siendo **provisionales** y qué
  dato esperan. Ninguno mueve un PI: deciden qué se rechaza, no dónde cae la
  barra.
- **La barra puede estar SUJETA, no libre en el espacio.** Los pines laterales
  son postes atornillados a la mesa contra los que la barra tiene que tocar:
  con ellos puestos, mover un ángulo ya no mueve libremente lo que viene
  después, la pieza se queda donde la dejan los pines y se **deforma** para
  llegar ahí. La pestaña Amarre dice cuánto se mueve la punta respecto de la
  pieza libre, en qué estación está el peor codo y qué porcentaje del límite
  elástico se alcanza — pasado el 100 %, la barra no vuelve al soltarla y la
  pieza que sale no es la del modelo. Se enciende y se apaga con un
  interruptor, y apagado el programa se comporta exactamente como si los pines
  no existieran. Los postes se pueden **inclinar** en el espacio, y dos
  selectores deciden qué se ve y contra qué se compara: qué barra se dibuja —la
  libre, la sujeta o las dos superpuestas— y si la **referencia** con la que se
  comparan los demás modelos es la libre o la que de verdad queda sujeta. La FORMA que toma la barra sujeta no depende del módulo
  elástico: con sección constante se cancela, y el material solo hace falta
  para el esfuerzo.
- **La flecha por gravedad**, tramo a tramo: cuánto se cuelga la barra por su
  propio peso entre dos apoyos del fixture. Importa porque la pieza se MIDE
  montada, así que un vano largo mete en la medición un error que no es de
  doblado y que el lazo intentará corregir sin poder. Los voladizos de las
  puntas son lo que más se cuelga, y la orientación pesa más que el vano: de
  plano se cuelga once veces más que de canto con una sección de 40×12.
- **El comando sale a la máquina en un archivo**, con el formato a la vista:
  columnas y su orden, separador, decimales, mm o pulgadas, grados o radianes,
  el signo del ángulo y el del rodado, y el rodado como incremento o como eje
  absoluto. La vista previa la pinta la misma función que escribe el archivo, así
  que comprobar unidades y signos en pantalla vale para algo. El formato real que
  lee la dobladora está pedido y no ha llegado: por eso se deja configurable en
  vez de adivinarlo, y el perfil viaja en el JSON para poder regenerar meses
  después el mismo archivo.
- **Cinta inferior** que desenrolla la longitud desarrollada, una columna por
  doblez coloreada por desviación. Con pieza medida muestra la desviación del
  desvío total; sin ella, el Δ contra el modelo de referencia.
- **Tema claro y oscuro**, con un tercer estado que sigue la preferencia del
  sistema. El 3D y la cinta leen sus colores del CSS, así que cambian con el
  resto: no hay una segunda paleta escondida en el código.
- Reporte imprimible con las cuatro vistas, exportar CSV de puntos, y todo en
  **español, inglés y alemán**. La paridad de los tres idiomas es un error de
  compilación, no una prueba en tiempo de ejecución.

---

## Cómo está hecho

Un doblez es `{feed, rot, angle, radius, twist, twistLen}`, en mm y grados. La
cadena cinemática es

```
T  ←  T · Trans(feed,0,0) · Rot(n(rot), angle) · Rx(twist)

n(rot) = Rx(rot) · (0,0,−1)     el EJE del arco, inclinado por `rot`
```

equivalente a `Rx(rot) · Rz(−angle) · Rx(−rot)`: se inclina el plano, se dobla,
y se devuelve la sección a su sitio. Con el marco local `x` = eje de la barra ·
`y` = espesor · `z` = ancho.

Convención **LRA**, la de las dobladoras. `rot` **inclina el eje de doblado**;
no rueda la barra, así que la sección sale del doblez con la misma cara arriba
con la que entró. `angle` es el doblez entero, en el plano que eligió `rot`, y
un `angle` positivo desvía hacia **+y** — lo fija `ANG_DIR`, ver más abajo.

```
rot = 0    →  dobla contra la cara plana (el espesor, y)
rot = ±90  →  dobla contra el canto      (el ancho,   z)
```

**El proceso es secuencial, y el eje se queda donde lo dejaron.** La máquina
gira el eje de doblado, dobla, y no lo devuelve solo: por eso `rot` no es la
posición del eje sino **cuánto gira** respecto a la estación anterior. El eje
absoluto de una estación es la suma de los giros hasta ella.

```
rot:   90     0        0       -90
eje:   90    90       90         0
       gira  mantiene mantiene  vuelve
```

Un `0` significa «no toques el eje», que es lo que se teclea la mayoría de las
veces: una lista de ceros es una pieza que se dobla siempre contra la misma
cara. La columna `Or.` (W/T) mira el eje **absoluto**, no el giro de la fila.

**El eje elige el plano; el signo del ángulo elige el lado.** Un eje a 180° con
ángulo positivo dobla exactamente al mismo sitio que un eje a 0° con el ángulo
negativo —`Rot(−n, θ) = Rot(n, −θ)`—, así que escribir la dirección de las dos
maneras a la vez dejaba la tabla ilegible: dos filas con el mismo ángulo
doblaban a lados distintos y nada en la columna lo decía. La forma canónica de
`ik()` reparte los dos papeles:

```
eje absoluto  ∈ (−90, 90]   el PLANO: 0 de plano, ±90 de canto
angle          con signo    hacia qué lado se dobla dentro de ese plano
```

Por eso el rodado solo gira **cuartos de vuelta** y el signo del ángulo es lo
único que voltea el doblez.

Ojo con la confusión fácil: el eje acumula, pero **la sección sigue sin rodar**.
`twist` es lo único que rueda la barra. `ik()` deja la forma canónica con
`angle ≥ 0` y devuelve `rot` como giro, no como posición.

Un PI es un vértice y por lo tanto **un solo arco**: `bendDecomp()` parte el par
en `Rot(eje, θ) · Rx(ψ)`, donde el eje es perpendicular al eje de la barra —lo
único que no rueda la sección— y `ψ` es el rodado residual, cero exacto cuando
el doblez tiene una sola componente.

### La pantalla la reparte el MODO

Cada modo tiene su propia rejilla, y la clase de `#app` es quien manda:

| modo | qué ocupa la pantalla |
|---|---|
| **Modelar** | la tabla a la derecha de arriba abajo, el 3D al lado, la cinta bajo el 3D |
| **Medir** | el modelo grande, la cinta alta y el lateral con estadísticas, desviación por doblez y resorte medido |
| **Compensar** | las ganancias en una tira y los comandos a todo el ancho; el 3D como banda de comprobación |

Los paneles de modelos, vista y piezas no ocupan una columna fija: viven en
cajones que abre la barra de menús y **flotan sobre el 3D**, fuera de la
rejilla, para que abrir uno no reparta la pantalla otra vez. Se cierran con el
mismo menú, con Escape o con un clic fuera.

Los dos tiradores cambian de oficio con el modo: `#rtgrip` mueve el ancho de la
tabla en Modelar y el del lateral en Medir; `#btgrip`, el alto de la cinta, o el
de la banda 3D en Compensar. **F** pliega todo y deja el 3D solo.

### Los archivos

Todo es **TypeScript con `strict`**, y `tsc` solo comprueba: quien empaqueta es
esbuild y quien corre las pruebas es Node, que borra los tipos por su cuenta.
Los cuatro barriles —`engine.ts`, `scene.ts`, `panels.ts` y `app.ts`— reexportan
su carpeta, así que quien los importa no nota el reparto.

```
web/
  src/engine.ts     EL MOTOR, barril de engine/. Sin DOM. 83 exports.
    engine/math.ts        matrices, wrap, PRNG
    engine/bend.ts        el doblez y su normalización
    engine/kinematics.ts  fk · ik · bendDecomp · buildPath · rowLengths
    engine/model.ts       variantes, deltas, edición de puntos PI
    engine/feasible.ts    lo que la máquina NO puede hacer aunque cierre la geometría
    engine/fitting.ts     Kabsch, anclaje entre modelos, colocación
    engine/compensate.ts  pieza simulada, lazo, desviaciones, lote, resorte
    engine/expr.ts        la celda de compensación (parser propio, sin eval)
    engine/doc.ts         esquema barcomp/2.3, migración de archivos anteriores
    engine/csv.ts         la nube de PI: lectura tolerante y escritura
  src/app.ts        arranque y cableado; el resto en app/
    app/render.ts · app/theme.ts · app/actions.ts · app/files.ts · app/history.ts
    app/events/{click,change,keyboard,grips}.ts
  src/scene.ts      three.js, barril de scene/
    scene/stage.ts · geometry.ts · layers.ts · build.ts · view.ts
  src/panels.ts     la interfaz, barril de panels/ (cadenas de plantilla)
    panels/{fmt,shell,left,focus,model,points,meas,comp,status,render}.ts
  src/state.ts      ST: modelos, referencia, anclaje, capas, piezas medidas
  src/ribbon.ts     la cinta inferior (canvas 2D)
  src/report.ts     reporte imprimible · src/io.ts  archivos locales
  src/safe.ts       esc() y safeColor(): lo que entra de fuera y acaba en un innerHTML
  src/dom.ts        el atajo $(), una sola vez para las cuatro capas
  src/i18n.ts       barril de i18n/: keys.ts (la unión) + es.ts · en.ts · de.ts
                    todo texto visible pasa por T('clave'); la paridad es error de tsc
  src/types.ts      barril de types/: model · process · doc · state
  src/app.css       tokens de diseño y layout; la paleta de los DOS temas
  src/shell.html    esqueleto con los marcadores del build
  build.mjs         esbuild: src/ + three  ->  index.html
  test_motor.js     261 pruebas del motor y del i18n, en Node y sin navegador
  tools/            banco de interfaz por CDP y las sondas de medición
index.html          SALIDA GENERADA — no se edita a mano
```

Ningún archivo pasa de 400 líneas y ninguna función de 60. `rebuildScene()` eran
248 líneas y ahora son diez capas con nombre; `bind()` eran 286 y ahora es una
lista de llamadas.

---

## Desarrollo

```bash
cd web
npm install          # una sola vez: three + esbuild
npm run check        # typecheck -> pruebas -> build -> banco de interfaz
npm run typecheck    # tsc --noEmit, con strict
npm test             # 458 pruebas del motor y del i18n
npm run build        # regenera index.html (y web/barcomp_viewer.html en local)
npm run test:ui      # 223 pasos de interfaz en Edge headless, por CDP
npm run demo:amarre  # cinco escenarios del amarre, con las cifras a la vista
npm run demo:archivos # regenera ejemplos/amarre-{libre,sujeta}.json
```

Tres redes, y ninguna fase cierra con una en rojo: los tipos, las pruebas del
motor y el banco de interfaz. Hubo una cuarta —`compare_engines.py` contra un
motor gemelo en Python— hasta el **2026-09-08**, cuando ese motor se retiró del
alcance: ver «Estado».

Las mismas tres corren en **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml))
sobre Node 22.18 —el suelo declarado en `engines`— y 24, más dos comprobaciones que
solo tienen sentido allí: que `index.html` corresponde de verdad a `web/src/` (comparado
sin el sello de versión, que por construcción no puede coincidir) y que el artefacto
lleva la atribución de three.js.

**Regla de flujo:** los dos commits de un cambio —la fuente y el `build: regenerar
index.html`— se empujan JUNTOS. El CI evalúa la punta; si se empuja el de fuente solo, la
comprobación del artefacto falla, y falla con razón.

Hay dos sondas de medición, que no son pruebas: `tools/probe_perf.js` mide el
coste de la escena dentro del navegador y `tools/bundle_report.mjs` dice de qué
está hecho el bundle. Hoy: `rebuildScene()` 2.8 ms con 15 dobleces y 9.6 ms con
60, sin fugas de geometría, cero cuadros dibujados en reposo, y un paso de
deshacer cuesta 6 µs y 5.3 KB.

**`index.html` es un artefacto compilado de ~692 KB con three.js empotrado —192
KB comprimido, que es lo que sirve Pages. Nunca se edita a mano: el siguiente
build borra el cambio.** Se edita `web/src/`.

BARCOMP se publica bajo licencia **MIT** ([`LICENSE`](LICENSE)). `index.html` lleva three.js
dentro —también MIT—, así que cada copia del HTML es una redistribución: el aviso de
copyright viaja con ella y `build.mjs` **falla** si no está. Ver
[`THIRD-PARTY.md`](THIRD-PARTY.md).

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
- Ni `scene/` ni `ribbon.ts` llevan colores propios: los leen de `:root` con
  `cssVar()`. Un color nuevo se define en `app.css`, en los dos temas — y las
  etiquetas del 3D también, o pasa lo que pasaba: un `#fff` a pelo era blanco
  sobre blanco en tema claro.
- La escena tiene dos grupos: `world` (la cuadrícula del suelo y los pedestales,
  matriz identidad) y `root` (la pieza, con la colocación por matriz). Mover la
  colocación mueve **la pieza sobre un suelo quieto**, no la cámara.
- Nada de `localStorage` ni `sessionStorage`, nada de CDNs ni `fetch()`.
- Los paneles se reconstruyen enteros, así que los inputs de tabla usan el evento
  `change`, no `input`, o se pierde el foco al escribir. Al confirmar una celda
  de la tabla de modelo NO se reconstruye el panel: `updateModelDerived()`
  reescribe solo las celdas calculadas. Para todo lo demás hay una red de
  guardado y restauración del foco dentro de `renderRight()`.
- `ST.model` es solo una caché del modelo efectivo (base + Δ) del modelo activo:
  después de tocar un modelo hay que llamar `syncModel()`.
- El deshacer compara DOCUMENTOS serializados, así que la comparación tiene que
  ser estable: `saved` (la hora) se excluye y un ajuste manual todo a cero se
  canoniza como «sin ajuste». Si no, cualquier clic gastaría un paso.
- Lo que se carga desde un diálogo de archivo se apila al TERMINAR la carga: el
  diálogo es asíncrono y el `commit()` del clic ya pasó.
- El estado de PANTALLA —modo, cajón, 3D a pantalla completa, selección— no
  viaja en el documento ni entra en el deshacer. El modo sí se guarda en la
  clave `ui` del JSON, junto al tema y el idioma, para que la sesión vuelva
  como estaba.
- Si agregas objetos a la escena, mételos en un grupo de `groups{}` y haz
  `dispose()`, o filtras memoria.

---

## La compensación se puede corregir a mano

La tabla de comandos muestra, por doblez, el valor actual, lo que sugiere el
lazo (`Δ calc.`) y la **Δ aplicada**, que es la única celda editable. Ahí se
escribe un número o una cuenta sobre el cálculo:

La celda se comporta como la de una hoja de cálculo: **un operador al principio
opera sobre lo que se ve**, y lo demás es absoluto.

| escribes | resultado |
|---|---|
| `2` | la compensación pasa a valer 2 |
| `+2` | dos más de **lo que muestra la celda** |
| `-0.3` | tres décimas menos de lo que muestra |
| `*1.1` | un 10 % más de lo que muestra |
| `=2` | 2, absoluto — la salida para escribir un negativo suelto: `=-3` |
| `c` | lo que calculó el lazo |
| `c+2` | dos más de lo que calculó el lazo |
| `(c+1)/2` | lo que haga falta |

En una celda recién puesta a cero, `+2` y `c+2` dan lo mismo; se separan en la
**segunda edición de la misma celda**, que es justo cuando uno quiere seguir
empujando sobre lo que ve. Teclear `+2` dos veces suma dos veces.

> Esto cambió en la versión de los modos de trabajo. Antes `+2` significaba
> «dos más de lo que calculó el lazo» y `-3` era el número negativo −3, que ni
> siquiera era coherente consigo mismo.

Se guarda la **diferencia** contra el cálculo, no el valor absoluto: si después
cambias la ganancia o llega otra pieza medida, «dos décimas más de lo que
sugiera el lazo» sigue significando eso. Al aplicar la compensación el ajuste
queda dentro del comando y vuelve a cero.

Se evalúa con un parser propio; no se usa `eval()`.

---

## La tabla de dobleces

Trece columnas, en orden de proceso:

```
#  Or.  Recta Δ  Rodado Δ  Ángulo Δ  Radio  Twist  Long.tw.    L     Σ L
        └───────────── se teclean ─────────────────────────────┘  └── se leen ──┘
```

Cada fila son **dos tramos**: la recta que llega al doblez, y el doblez que
ocurre al final de esa recta. Uno sale recto y el otro sale curvo.

```
trim(i)  = radius(i) · tan(θ(i)/2)              θ de bendDecomp()
Recta(i) = el tramo recto, tangencia a tangencia   ← se teclea
L(i)     = radius(i) · θ(i)                        ← el arco
Σ L(i)   = Σ L(i−1) + Recta(i) + L(i)
feed(i)  = Recta(i) + trim(i) + trim(i−1)          ← por debajo, no en la tabla
```

`Recta` es el material que de verdad sale recto y es lo único que se teclea de
las longitudes. `L` es el material que sale curvo. `Σ L` los va sumando —recta,
arco, recta, arco— y al final, con la cola, da la longitud desarrollada: el
trozo de barra que hay que cortar.

El **avance** de PI a PI ya no está en la tabla. Es la geometría del CAD —donde
se cruzarían las rectas si el doblez fuera una esquina viva— y el doblez le come
un `trim` por cada lado; de ahí que no coincida con la recta.

**El sentido de giro del ángulo:** un `angle` positivo desvía hacia **+y**. Lo
decide una sola constante en el motor, `ANG_DIR` (`engine/kinematics.ts`), que
consumen `bendDecomp()` —o sea toda la cinemática— e `ik()`, su inversa.
Cambiarla voltea la pieza entera sin tocar un solo dato.

Está en `-1`, o sea al revés de lo que hacía el motor histórico, porque es el
sentido con el que llegan los datos del taller: **los mismos números doblan al
otro lado**, y en pantalla se leen tal como están en el archivo. La interfaz no
voltea nada.

**El sentido del rodado** tiene su propia constante, `ROT_DIR`, también en `-1`:
un `rot` de 90 inclina el eje hacia donde antes lo llevaba un −90. Los dos
sentidos son independientes a propósito —el ángulo dice hacia qué lado se dobla
dentro del plano y el rodado qué plano se elige, y una máquina puede tener cada
eje montado al revés que la otra—, y ninguna de las dos toca un solo dato: los
mismos números giran al otro lado.

**La regla de edición:** las rectas mandan. Cambiar un radio, un rodado o un
ángulo deja **todas las rectas donde estaban** y recoloca los avances
por debajo. Como el `trim` de un doblez muerde por los dos lados, tocar el radio
del doblez `i` mueve **dos** avances, el `i` y el `i+1`; con el del último se
ajusta la cola.

Nada de esto cambia el archivo. **El JSON sigue guardando `feed`**, de PI a PI,
que es lo que ve `command[]` y lo que se manda a la máquina; la recta es la
lectura de ese mismo estado y `feedForStraight()` da la vuelta. Por eso los
archivos anteriores abren igual.

La cuenta vive en un solo sitio, `rowLengths()` en `engine/kinematics.ts`; `machineFeeds()`,
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

### Los campos

- **Entrar en una celda selecciona su valor**, con el ratón o con el teclado:
  teclear reemplaza y no hay que borrar cifra por cifra.
- **Se admiten hasta tres decimales.** Los campos declaran `step="any"` y
  llevan su paso de incremento en `data-step`. Con un paso declarado en `step`
  el navegador marca inválido todo lo que no cae en su rejilla —con `step=".1"`
  un `17.905` es un error— y redondea al usar las flechas.
- **Vaciar una celda y salirse no escribe un `0`**: se devuelve el valor que
  había al entrar. Para poner un cero hay que teclearlo.
- Los valores se rellenan a dos decimales y muestran el tercero solo cuando lo
  hay, así que la columna sigue alineada.

## El fixture

La barra se dobla y se mide apoyada en pedestales. Eso no es decoración: **el vano
entre dos apoyos decide la flecha por gravedad**, y en 1.7 m de aluminio esa flecha
puede ser del orden de la tolerancia de punto. Una flecha que nadie modela entra en
la medición como si fuera error de doblado, el lazo de compensación intenta
corregirla, no puede, y ahí se queda.

La pestaña **Fixture**, dentro de Modelar, lleva la lista. Se teclean las cinco
cifras que se miden en el taller con un flexómetro:

| Campo | Qué es |
|---|---|
| **X**, **Y** | dónde se para el pie sobre la mesa, mm |
| **Alto** | de la mesa a la cuna, mm |
| **Cuna** | largo del apoyo a lo largo de la barra, mm |
| **Inclin.** | inclinación de la cuna, ° |

El resto de la tabla es de lectura y sale del modelo: en qué punto de la barra
toca (**Toca**), cuánto se desvía en planta (**Desvío**), qué inclinación pide la
barra ahí (**Pide**) y la diferencia (**Δ**), el aire que queda entre la cuna y la
cara de abajo (**Hueco**) y la distancia al pedestal anterior a lo largo de la
barra (**Vano**). Arriba se repite el vano mayor, que es el número que decide la
flecha.

**Los pedestales están atornillados a la mesa: no se mueven cuando la pieza se
recoloca.** Lo que cambia es si siguen apoyando. El que deja de hacerlo —porque le
falta altura, le sobra, o la barra ni siquiera le pasa por encima— se pone en rojo
en la tabla y en el 3D.

Δ no se juzga solo contra un número de grados: medio grado en una cuna de 20 mm no
levanta nada y en una de 300 mm levanta más que la tolerancia. Lo que se compara
contra `tol.point` es el **despegue** en la punta de la cuna, que es `cuna/2 · tan Δ`.

«Sembrar» reparte unos cuantos bajo la pieza con la altura y la inclinación que
pide en cada sitio. No es el fixture bueno —ese lo dicta el que está montado en el
taller— sino algo que corregir, y de paso enseña qué alturas pide esta pieza.

La mesa está en `z = TABLE_Z` (−260 mm), fija por ahora: mientras no haya un fixture
real medido, una mesa configurable es un campo más que nadie puede rellenar con un
valor de verdad.

Lo que esta herramienta **no** hace es calcular la flecha. Da la geometría de la que
sale; la flecha necesita el módulo elástico y la densidad del material, o un escaneo
de una barra recta certificada montada en el fixture.

## Formato de archivo

Esquema `barcomp/2.3`, un JSON con el modelo, los comandos de máquina, las
ganancias, los parámetros del simulador, las piezas medidas y los modelos
comparados. Las claves `variants`, `ref`, `anchor`, `place`, `marks`, `fixture` y
`tweak` son opcionales: los archivos viejos siguen abriendo.

Los archivos de piezas reales **no se versionan**: el repo es público y un
`.json` lleva la geometría del cliente. La carpeta `piezas/` está apartada en
`.gitignore` para tener dónde dejarlos sin que se cuelen en un commit; su
`README.md` explica la convención.

### Archivos de versiones anteriores

Han existido cuatro esquemas, y los mismos números describen otra pieza en
cada uno:

| esquema | qué era `rot` |
|---|---|
| `barcomp/1.0` | un doblez de canto, y `angle` tenía el signo contrario |
| `barcomp/2.0` | un rodado de verdad: la sección salía girada del doblez |
| `barcomp/2.1` | la posición ABSOLUTA del eje del arco, declarada en cada fila |
| `barcomp/2.2` | **cuánto GIRA** ese eje; el eje se sostiene entre estaciones |
| `barcomp/2.3` | igual que 2.2, pero el ángulo y el rodado doblan al otro lado |

Un `barcomp/2.2` **no se convierte**: se lee tal cual y se avisa. Del 2.2 al 2.3
no cambió ningún número, cambió el motor —`ANG_DIR` y `ROT_DIR` pasaron a −1
porque los datos del taller ya venían con ese sentido—, así que convertirlo
deshacía el cambio. Lo que no se puede saber mirando la etiqueta es si ese
archivo se escribió antes o después, y por eso se abre con la convención de hoy
y se dice. Los que escribe esta versión salen ya como 2.3.

Al abrir un archivo anterior se convierte solo, y la conversión no aproxima
nada: del modelo viejo se sacan sus PI en el espacio (la forma real) y de ahí se
replantea la cadena con `ik()`. Lo único que no viaja son los **Δ pendientes**,
que son incrementos sobre parámetros que cambiaron de significado: llegan en
cero.

`Recta`, `L` y `Σ L` **no se guardan**: son magnitudes derivadas de `feed`,
`radius` y los ángulos. El estado sigue siendo `feed`, de PI a PI, que es lo que
viaja en el JSON — aunque no aparezca en la tabla y sea la recta la que se
teclea.

```jsonc
{
  "schema": "barcomp/2.3",
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

Alfa: el visor ya acepta piezas medidas de verdad —se importan por CSV, se
distinguen de las simuladas y el resorte se estima de ellas—, pero nadie le ha
metido todavía una barra real. Lo que falta, en orden de impacto:

1. **Meterle piezas reales.** El camino está abierto: GOM → PI → CSV → importar
   en lote. Con eso, `sbW` y `sbT` dejan de ser dos números tecleados a ojo y
   pasan a salir de las piezas, con su dispersión a la vista.
2. **Extraer los PI desde la nube de puntos**: segmentar tramos rectos → ajustar
   rectas robustas (RANSAC) → intersectar ejes → PI. Hoy el visor recibe el CSV
   con los PI ya extraídos; quién los extraiga está sin decidir y espera la
   respuesta de metrología (si el plan de inspección puede darlos directamente,
   este paso no se escribe nunca).
3. **Confirmar qué parámetros acepta la dobladora.** Si solo toma ángulo,
   `doRot` y `doFeed` se quedan apagados y el sesgo de rotación hay que atacarlo
   por calibración del robot.
4. **Flexión por gravedad en el fixture**: en 1.7 m de aluminio puede ser del
   orden de las tolerancias, y hoy no se modela.
5. ~~Consolidar en un solo motor.~~ **Hecho el 2026-09-08**, por decisión del
   dueño del proyecto: el motor gemelo en Python y su visor Tkinter salen del
   alcance. El motor es uno solo, `web/src/engine.ts`, y el JSON deja de tener
   que ser legible por dos implementaciones. Lo que se pierde es la comparación
   cruzada de `compare_engines.py`; lo que la sustituye es el fixture congelado
   de `web/test/fixtures/`, que vigila lo mismo —que los números no se muevan en
   silencio— sin costar el doble por cada cambio de cinemática.

`simulate()` sigue ahí y se queda: es la única forma de contestar «con esta
dispersión de medición, ¿converge el lazo o se pone a oscilar?» antes de gastar
material. Lo que cambió es que ahora está etiquetado como lo que es.

**Hallazgo de la validación:** corrigiendo solo ángulos, los ángulos convergen a
0.15° pero la desviación de la punta libre se estanca en ~5 mm, porque el sesgo
de rotación se acumula a lo largo de la cadena. Activando también rotación y
avance, la punta baja a 0.17 mm. Ganancia recomendada 0.6–0.8, nunca 1.0: al
100 % el lazo oscila con el ruido de medición.
