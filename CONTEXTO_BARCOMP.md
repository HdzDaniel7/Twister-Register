# CONTEXTO — BARCOMP α (visor HTML)

> Documento para pasarle a Claude (o a cualquiera) antes de modificar este programa.
> Léelo completo antes de tocar código. Contiene reglas que no son evidentes desde los archivos.

---

## 0. Regla número uno

**El HTML compilado NUNCA se edita a mano.** El build escribe dos copias del mismo archivo:
`index.html` en la raíz (lo que publica GitHub Pages, y lo único que va al repo) y
`web/barcomp_viewer.html` para abrirlo en local con doble clic.

Son ~643 KB con three.js empotrado. Editarlo directamente significa leer y reescribir 600 KB por
cada cambio, y el siguiente build borra todo lo que hayas hecho.

```
cd web && npm install                (solo la primera vez: three + esbuild)

Editar  web/src/*.js  y/o  web/src/app.css
   →   cd web && node test_motor.js        (120 pruebas · npm test)
   →   cd web && node build.mjs            (npm run build · python build.py hace lo mismo)
```

Del lado Python:

```
Editar  python/barcomp/core.py  y/o  python/barcomp/gui.py
   →   cd python && python test_core.py    (60 pruebas)
```

Y si el cambio tocó la cinemática o el esquema de datos, **en cualquiera de los dos lados**:

```
   →   python compare_engines.py           (los dos motores sobre el mismo modelo)
```

Si solo tienes el `.html` y no la carpeta `web/src/`, **detente y pídele al usuario los archivos
fuente.** No intentes reconstruirlos ni parchear el HTML.

`web/node_modules/` está en `.gitignore`: si falta, `npm install` lo repone. El build no descarga
nada en tiempo de ejecución; la red solo hace falta para ese `npm install`.

---

## 1. Qué hace el programa

Compensación de dobleces para una barra rectangular de aluminio (~1.7 m, ~15 dobleces contra el
ancho y contra el espesor) doblada por un robot contra una rotary draw, secuencialmente desde un
extremo. Se escanea con GOM, se compara contra el CAD nominal, y hay que decidir **cuánto mover
cada ángulo comandado** para que la siguiente pieza salga dentro de tolerancia.

El problema que resuelve: ajustar un ángulo mueve todos los dobleces posteriores. La solución no es
calcular ese arrastre, es **compensar en el espacio de parámetros y regenerar la cadena completa**,
con lo cual el arrastre queda contenido en el modelo.

Usuario: ingeniero de manufactura. Interfaz bilingüe ES/EN. Debe correr **offline, con doble clic**,
sin instalar nada. Esa restricción es dura y es la razón de varias decisiones de abajo.

---

## 2. Mapa de archivos

Los dos motores viven en carpetas separadas y se pueden correr y comparar por separado.

Todo el visor es **TypeScript con `strict`**. `tsc` solo comprueba (`--noEmit`);
quien empaqueta es esbuild y quien corre las pruebas es Node, que borra los tipos
por su cuenta. Cuatro archivos son **barriles** que reexportan su carpeta, así
que quien los importa no nota el reparto.

```
web/                        ← motor TypeScript + visor three.js
  src/engine.ts             ← EL MOTOR, barril. Gemelo de python/barcomp/core.py. Sin DOM.
    engine/math.ts             matrices, wrap, PRNG
    engine/bend.ts             el doblez y su normalización
    engine/kinematics.ts       fk · ik · bendDecomp · buildPath · rowLengths
    engine/model.ts            variantes, deltas, edición de puntos PI, measuredModel
    engine/feasible.ts         rectas que no caben y dobleces imposibles (STRAIGHT_MIN_MM)
    engine/fitting.ts          Kabsch, anclaje entre modelos, colocación
    engine/compensate.ts       simulate · compensate · deviations · lote · springback
    engine/expr.ts             la celda de compensación (parser propio, sin eval)
    engine/doc.ts              esquema barcomp/2.3, migración de archivos anteriores
    engine/csv.ts              la nube de PI: lectura tolerante (PI_MIN_MM) y escritura
  src/i18n.ts               ← barril de i18n/: keys.ts (la unión de 239 claves) + es · en · de.
                              T() y LANG. La paridad es error de COMPILACIÓN, no solo de prueba.
  src/state.ts              ← ST: variantes, referencia, anclaje, capas, piezas medidas.
  src/types.ts              ← barril de types/: model (la pieza) · process (el lazo) ·
                              doc (el .json) · state (ST). En ese orden, sin ciclos.
  src/scene.ts              ← three.js, barril de scene/ (stage · geometry · layers · build · view).
  src/panels.ts             ← la interfaz, barril de panels/ (un archivo por panel).
  src/ribbon.ts             ← la cinta inferior (canvas 2D).
  src/report.ts             ← reporte imprimible con las 4 vistas.
  src/safe.ts               ← esc() y safeColor(). Sin dependencias: lo usan motor, 3D y paneles.
  src/dom.ts                ← el atajo $(), UNA sola vez. Estaba copiado cuatro veces.
  src/io.ts                 ← Blob y <input type=file>, uno o varios. Nada de red.
  src/app.ts                ← arranque y cableado; lo demás en app/:
    app/render.ts              renderAll · refresh · refreshTable · setMode · openDrawer · solo
    app/theme.ts               tema y el matchMedia del sistema
    app/actions.ts             editores, variantes, action()
    app/files.ts               abrir/guardar JSON e importar CSV; las gemelas sin diálogo
    app/history.ts             deshacer/rehacer sobre documentos serializados
    app/events/{click,change,keyboard,grips}.ts
  src/app.css               ← tokens de diseño y layout. La paleta de los DOS temas.
  src/shell.html            ← esqueleto con /*__CSS__*/ y /*__APP__*/
  package.json              ← three + esbuild; typescript y @types/three de desarrollo.
  build.mjs                 ← esbuild: src/ + three  ->  ../index.html (Pages) + barcomp_viewer.html.
  test_motor.js             ← 163 pruebas del motor y del i18n, en Node sin navegador.
  engine_dump.js            ← vuelca el resultado del motor JS a JSON (lo usa compare_engines.py).
  barcomp_viewer.html       ← SALIDA. Generado. No editar.
  tools/                    ← banco de interfaz y sondas. AHORA SÍ versionado.
    ui_test.mjs                lanza Edge headless y corre probe_ui.js dentro de la página.
    probe_ui.js                140 pasos de interfaz, cada uno en su try/catch.
    ui_shot.mjs · setup_shot.js  captura PNG tras un guion de preparación.
    strip_diff.mjs             compara un .ts con los tipos borrados contra su versión en git.
    export_surface.mjs         vuelca los 83 exports del motor con tipo y aridad.
    probe_perf.js              mide la escena dentro del navegador.
    bundle_report.mjs          de qué está hecho el bundle.

python/                     ← motor numpy + visor Tkinter/matplotlib
  barcomp/core.py           ← el motor. Gemelo de engine.js, snake_case. Sin dependencias de interfaz.
  barcomp/gui.py            ← el visor. Reinterpretado para Python, no es un puerto pixel a pixel.
  run.py                    ← arranque del visor.
  test_core.py              ← 70 pruebas: los invariantes de test_motor.js + variantes y puntos.
  requirements.txt          ← numpy + matplotlib.

compare_engines.py          ← corre los DOS motores sobre el mismo modelo y reporta diferencias.
README.md                   ← cómo correr cada uno.
```

### Por qué esbuild y three.js actual

El requisito duro es que **el HTML abra con doble clic, offline, bajo `file://`**. Antes eso obligaba
a Three.js r140, la última versión con build UMD; hoy lo resuelve el empaquetador. `build.mjs` corre
esbuild sobre `src/app.js`, resuelve todos los `import` (three y `OrbitControls` incluidos) y emite
un IIFE que se empotra en un único `<script>` inline. En el archivo final no queda ni un `import`,
ni un `fetch()`, ni una CDN.

esbuild se eligió por ser **una sola dependencia sin configuración**. La interfaz sigue siendo
vanilla con delegación por atributos `data-*`: un framework no compraría nada para estas tablas y
costaría una reescritura completa.

Lo que **no** se puede hacer: cargar módulos en tiempo de ejecución, pedir recursos por red o
depender de un servidor. Si algún día hace falta un asset (una fuente, una textura), va empotrado
como data URI dentro del bundle.

Un detalle de la actualización: desde r152 three trabaja en linear-sRGB. Los colores semánticos
(`devColor()`) hablan en sRGB, así que se convierten con `setRGB(..., SRGBColorSpace)` o la escala
verde→ámbar→rojo sale apagada. Y desde r155 las luces son físicas: las intensidades van
multiplicadas por π respecto a las de r140.

---

## 3. El modelo de datos

Cada doblez es una terna **LRA**, la de las dobladoras:

| campo | significado | unidad |
|---|---|---|
| `feed` | avance de un PI al siguiente | mm |
| `rot` (R) | **inclina el EJE del doblado**; elige el plano en el que se dobla | ° |
| `angle` | el doblez entero, en el plano que eligió `rot` | ° |
| `radius` | radio del herramental | mm |
| `twist` | torsión total aplicada tras el doblez | ° |
| `twistLen` | tramo recto sobre el que se reparte esa torsión; `0` = toda la recta | mm |

La cadena cinemática, esquema `barcomp/2.2`:

```
T  ←  T · Trans(feed,0,0) · Rot(n(rot), angle) · Rx(twist)

n(rot) = Rx(rot) · (0,0,−1)     el EJE del arco, inclinado por `rot`
```

equivalente a `Rx(rot) · Rz(−angle) · Rx(−rot)`: se inclina el plano, se dobla,
y se devuelve la sección a su sitio.

```
rot = 0    →  dobla contra la cara plana (el espesor, y)
rot = ±90  →  dobla contra el canto      (el ancho,   z)
```

**`rot` inclina el eje, no rueda la barra.** La sección sale del doblez con la
misma cara arriba con la que entró. `twist` es lo ÚNICO que rueda la barra.

**Y el eje SE SOSTIENE entre estaciones** (esquema `2.2`): el proceso es
secuencial, la máquina gira el eje, dobla, y no lo devuelve sola. Por eso `rot`
es un INCREMENTO y el eje absoluto de la estación `i` es la suma de los giros
hasta ella — `axisAngles()` / `axis_angles()`:

```
rot:   90     0        0       -90
eje:   90    90       90         0
```

**El SENTIDO DE GIRO lo fija `ANG_DIR`** (`engine/kinematics.ts` y su gemelo en
`core.py`), y está en `-1`: un `angle` positivo desvía hacia **+y**, al revés
del motor histórico. Se cambió sin tocar un dato, porque es el sentido con el
que llegan los datos del taller — los mismos números doblan al otro lado. Lo
consumen `bendDecomp()`, o sea toda la cinemática, e `ik()`, que es su inversa;
si tocas uno sin el otro, la ida y vuelta deja de ser exacta y la prueba de
`fk↔ik` lo canta al instante. La interfaz NO voltea nada: enseña lo que hay.

**El sentido del RODADO lo fija `ROT_DIR`**, también en `-1`: un `rot` de 90
inclina el eje hacia donde antes lo llevaba un −90. Es independiente de
`ANG_DIR` a propósito, porque una máquina puede tener cada eje montado al revés
que la otra, y como aquella no toca ni un dato. Las dos entran por
`bendDecomp()` y salen por `ik()`; si tocas una sin la otra, la prueba de ida y
vuelta `fk↔ik` lo canta al instante.

**El eje elige el PLANO y el signo del ángulo elige el LADO** (`canonRot()` /
`canon_rot()`). Un eje a 180° con ángulo positivo dobla al mismo sitio que un
eje a 0° con ángulo negativo, así que la forma canónica deja el eje en
`(-90, 90]` —0 de plano, ±90 de canto— y le pasa el signo al ángulo. Sin eso la
dirección va escrita dos veces y la tabla no se puede leer: dos filas con el
mismo ángulo doblan a lados distintos.

Un `0` es «no toques el eje». El acumulado se envuelve a `(-180, 180]` con
`wrapTurn()` / `wrap_turn()`, no con `wrap180()`: media vuelta se escribe **180**
como en la máquina, y no −180. Las diferencias de MEDIDA siguen usando
`wrap180()`, donde el signo sí distingue de qué lado quedó la pieza. `orientations()` mira el eje ABSOLUTO, no el `rot`
de la fila: confundirlos etiqueta media tabla al revés y elige la ganancia
equivocada.

Cuidado con mezclar las dos cosas: que el EJE acumule no significa que la
SECCIÓN ruede. Si te ves aplicando `Rx(rot)` al marco y dejándolo puesto, has
vuelto a `2.0`, que es lo que costó una versión entera arreglar (ver §7.0).

> **Esta sección estuvo caducada** hasta el cierre del refactor: describía la
> cinemática de `barcomp/2.0` («dos dobleces perpendiculares») y contradecía a
> su propio §7 y al README. Hoy describe `2.2`, que es lo que corre.

| esquema | qué era `rot` |
|---|---|
| `1.0` | un doblez de canto, y `angle` con el signo contrario |
| `2.0` | un rodado de verdad: la sección salía girada del doblez |
| `2.1` | la posición ABSOLUTA del eje, declarada en cada fila |
| `2.2` | cuánto GIRA el eje; se sostiene entre estaciones |

Los archivos anteriores se convierten al abrirlos pasando por sus PI
(`migrateModel` + `fkLegacy`), así que no se aproxima nada: la pieza que sale es
la misma que describía el archivo.

Los **puntos críticos** son los **PI** (puntos de intersección) del eje neutro: los vértices del
polígono, no los puntos de tangencia. Los arcos se inscriben con `trim = radius · tan(angle/2)`.

### Convenciones cerradas — no las cambies

- Milímetros y grados en toda la interfaz y en el JSON. Radianes solo dentro de las funciones.
- Sistema derecho, regla de la mano derecha.
- Marco local: `x` = eje de la barra · `y` = dirección del **espesor** · `z` = dirección del
  **ancho**. El doblez (`Rz`) gira alrededor de `z`, o sea del ancho, y desvía la barra a lo
  largo de `y`, el espesor: con `rot = 0` la barra se dobla **de plano, contra el espesor**.
- `bends[0].feed` **es la recta de entrada** desde el extremo de amarre, no un avance entre dobleces.
- `tail` es la recta de salida después del último doblez.
- `fk()` devuelve **n+2 puntos**: P0 (amarre) + n PIs + extremo libre.
- Orientación **`T`** = plano · **`W`** = de canto. La dice el EJE ABSOLUTO de la estación
  —`axis_angles()`—, no el `rot` de la fila, porque el eje se sostiene entre estaciones. Sirve para
  etiquetar la tabla y elegir la ganancia; el resorte se aplica por orientación.
- Un PI sigue siendo **un vértice y por lo tanto un arco**: `radius` es el radio de esa herramienta
  circular. Con doblez puro de canto es exactamente el radio de rotación contra R. Con las dos
  componentes, `bend_decomp()` calcula el eje y el desvío total del arco compuesto.
- `twistLen` es **puramente geométrico**: no entra en `fk()` ni mueve ningún PI. Ver §4.

---

## 4. Funciones del motor

Todas puras y todas en `web/src/engine.js`, que no toca el DOM. Los mismos nombres existen en
`python/barcomp/core.py` en `snake_case`; la tabla usa el nombre JS.

| función | firma | invariante |
|---|---|---|
| `fk(model)` | → `{pis, frames, end}` | `pis.length === bends.length + 2` |
| `ik(points, radii)` | → `{bends, tail}` | inverso exacto de `fk` (verificado a 1e-9). Forma cerrada: `angle = asin(d_y)`, `rot = atan2(-d_z, d_x)` |
| `orientations(model)` | → `['W','T',...]` | componente dominante: `'W'` si `abs(rot) > abs(angle)`. Ya no acumula nada |
| `bendDecomp(b)` | → `{axis, theta, psi}` | eje del arco, desvío total ≥0 y rodado residual |
| `bendTheta(b)` | → ° | desvío total del doblez; con una sola componente es su ángulo |
| `trimOf(bend)` | → mm | `radius · tan(θ/2)` con θ del **desvío total**, no solo `angle` |
| `straightOf(model,i)` | → mm | **LA** cuenta de la recta: `feed(i) − trim(i) − trim(i−1)`. Todo lo demás la consume |
| `feedForStraight(model,i,mm)` | → mm | inversa exacta de `straightOf`: el `feed` que produce esa recta |
| `tailStraight(model)` | → mm | la cola, descontado el trim del último doblez |
| `rowLengths(model)` | → `[{straight,arc,cum}]` | por doblez: la recta que lo precede, su arco y el acumulado |
| `developedLength(model)` | → mm | `cum` del último más la cola; coincide con `buildPath().total` a 1e-9 |
| `machineFeeds(model)` | → `[mm]` | avance tangente-a-tangente; **negativo o <25 mm = herramentales chocan** |
| `bendStations(model)` | → `[mm]` | longitud desarrollada del centro del arco de cada doblez (la cinta) |
| `effectiveModel(v)` | → `model` | base + deltas; es lo único que ve la cinemática |
| `bakeDeltas(v)` / `hasDeltas(v)` | → `variant` / bool | funde los deltas en la base / dice si quedan pendientes |
| `anchorTransform(m,ref,mode)` | → `Matrix4` | fija un extremo común entre variantes |
| `piShift(m,ref,mode)` | → `[mm]` | cuánto se movió cada PI ya anclado; alinea por el final si `end` |
| `movePi` / `insertPi` / `deletePi` | → `model` | edición absoluta en el espacio de los PI |
| `twistSpanOf(model,i)` | → mm | recta disponible tras el doblez `i` para repartir su torsión |
| `twistSpans(len,tw,twLen)` | → `[[Δl,Δtw_rad]]` | suma exacta `[len, tw]`; zona centrada en la recta |
| `buildPath(model, arcSeg)` | → `{samples, total}` | `samples[i] = {p, x, y, z, s}` |
| `simulate(cmd, proc, ori, noise)` | → `bends[]` | **pieza virtual — reemplazar por datos reales** |
| `compensate(cmd, nom, meas, comp, ori)` | → `bends[]` | `nuevo = actual + ganancia × (nominal − medido)` |
| `deviations(model, meas, datum)` | → `{point, angle, rot, feed, theta, ...}` | `theta` = desviación del desvío total |
| `kabsch(P, Q)` | → `Matrix4` | ajuste rígido por cuaterniones (Horn) + Jacobi 4×4 |
| `placeTransform(place,pivot)` | → `Matrix4` | colocación en el espacio; identidad si no se tocó |
| `nearestPoint(pts,q)` | → `{i,d}` | PI más cercano a una cota suelta |
| `readPointsCsv(txt)` | → `Vector3[]` | las TRES ÚLTIMAS columnas numéricas de cada línea |
| `measuredModel(nom,pts)` | → `model` | pieza medida desde sus PI; radio y torsión del nominal |
| `statOf(v)` | → `{med,mad,sigma,n}` | mediana y MAD; un PI mal extraído no mueve la mediana |
| `bendStats(piezas)` | → `[{angle,rot,feed,n}]` | dispersión por doblez; llega hasta la pieza más LARGA |
| `medianPart(piezas)` | → `bends[]` | la pieza mediana del lote; se detiene en la más CORTA |
| `springback(muestras,ori)` | → `{W,T}` | `sb = 1 − medido/comandado`, con pendiente y r |
| `evalCell(texto,c,v)` | → número \| null | la celda de compensación; **solo del visor web**, no existe en `core.py` |
| `toDoc` / `fromDoc` | → `doc` / estado | esquema `barcomp/1.0`, compartido con Python |

`barGeometry(path, sec, devFn)` vive en `scene.js`, no en el motor: devuelve una `BufferGeometry` y
por lo tanto depende de three.

### Las longitudes por fila

```
recta(i)  = feed(i) − trim(i) − trim(i−1)      con trim(−1) = 0
arco(i)   = radius(i) · θ(i)                   θ de bendDecomp()
cum(i)    = cum(i−1) + recta(i) + arco(i)
```

`feed` es de PI a PI y es el **estado**: es lo que se guarda en el JSON, lo que va en `command[]`,
lo que mueve `doFeed` y lo que ve el motor de Python. La recta es de tangencia a tangencia y es lo
que consume la máquina.

**En la tabla la recta es lo único que se teclea de las longitudes; el avance ni siquiera aparece**,
al revés de como está guardado. `feedForStraight()` da la vuelta. Las columnas de lectura son `L`
(el arco, `radius · θ`) y `Σ L`. La regla de edición es que **las rectas mandan**:
cambiar `radius`, `rot` o `angle` deja todas las rectas donde estaban y recoloca los avances. Como
`trim` muerde por los dos lados, tocar el radio del doblez `i` mueve `feed(i)` y `feed(i+1)` —o la
cola, si `i` es el último—. Está en `editBend()` (`app.js`), con `TRIM_KEYS` como lista.

Solo se recolocan esas dos filas, no las quince: `feedForStraight(straightOf(x))` no devuelve
exactamente `x` en coma flotante, y recalcularlas todas en cada edición arrastraría una deriva de
~1e-13 por pulsación.

`rowLengths()` es el único sitio donde vive la cuenta. Estuvo copiada a mano en cuatro funciones
—`machineFeeds()`, `twistSpanOf()`, `buildPath()` y `bendStations()`— y era cuestión de tiempo que
divergieran. `bendStations()` quedó en una línea: `rows.map(r => r.cum - r.arc / 2)`.

Ninguna de estas magnitudes es estado nuevo, así que **el motor de Python no cambia** y
`compare_engines.py` tiene que seguir diciendo *"los dos motores coinciden"*.

### El arco de un doblez compuesto

`Ry(rot)·Rz(angle)` se traza como **un solo arco**, no como dos: una estación es
una herramienta. `bend_decomp()` lo parte en `Rot(eje, θ) · Rx(ψ)`, donde el eje
es perpendicular al eje de la barra — que es lo único que **no rueda la sección**.
Con una sola componente `ψ = 0` exacto; con las dos, `ψ` es el rodado residual
real de un doblez compuesto y se aplica de golpe al salir del arco.

Trampa: no vuelvas a trazar el arco como `Rx(φ)·Rz(θ)`. Sale la misma posición
pero la sección aparece girada a lo largo de todo el arco y se endereza de un
salto en el vértice. Hay una prueba que compara el marco final de `build_path()`
con el de `fk()` justo por esto.

**`fk` e `ik` son el corazón.** Si tocas una, corre `node test_motor.js` inmediatamente: hay una
prueba de ida y vuelta que falla al instante ante cualquier error de signo o de orden de rotaciones.

### El twist tiene un comportamiento deliberado

Un `twist` en el doblez *i* **no** mueve los puntos anteriores ni cambia ningún avance, pero **sí**
reorienta toda la cadena posterior — porque cambia el rodado de la barra, y entonces el mismo `rot`
comandado en el doblez *i+1* apunta a otro lado. Eso es físicamente correcto y está cubierto por
tres pruebas. Si "arreglas" esto haciendo que el twist no afecte nada, rompes el modelo.

Nota de implementación: `fk()` aplica el twist de golpe al final del doblez, mientras `buildPath()`
lo reparte a lo largo de la recta siguiente (para que se vea la torsión gradual). Ambos terminan en
el mismo marco, por eso los PI coinciden. Si modificas uno, modifica el otro.

### `twistLen`: la torsión ocurre a lo largo de una sección, no en un punto

`twist` dice **cuánto** se retuerce la barra; `twistLen` dice **sobre cuántos milímetros**. La zona
de torsión queda **centrada** en la recta siguiente al doblez y el resto de la recta sale sin torcer,
lo que deja longitud de agarre limpia a ambos lados. `twistLen = 0` (el default y el comportamiento
histórico) reparte la torsión sobre la recta completa. Si `twistLen` excede la recta disponible se
acota a ella, y la interfaz marca la celda en ámbar.

Esto **no cambia la cinemática**: `Rx` conmuta con `Trans(x)`, así que mover la zona de torsión no
altera ningún PI, ningún avance, ni el marco final. Es geometría de la trayectoria y nada más — por
eso `fk()` no lo toca y `compensate()` lo arrastra sin modificarlo. La densidad de muestreo escala
con el ángulo (`ceil(|tw|/5)`, acotada a 8..72 pasos) para que un twist de 180° no se vea facetado.

---

## 5. Estado y flujo de renderizado

Todo el estado vive en `ST` (`src/state.js`):

```js
ST = {
  variants[],   // los MODELOS comparables: {id, name, color, visible, base, deltas, tailDelta}
  active,       // id de la variante que se edita
  ref,          // id de la variante de REFERENCIA: contra ella se ancla y se compara
  anchor,       // 'start' | 'end' | 'best'  — qué extremo queda fijo entre variantes
  model,        // CACHÉ del modelo efectivo (base + deltas) de la activa
  command,      // lo que se manda a la máquina; ≠ model.bends cuando ya hay compensación
  datasets[],   // piezas medidas: {id, name, color, visible, model, pis, dev}
  dsActive,     // id del dataset activo
  sel,          // índice del doblez seleccionado (-1 = ninguno)
  comp,         // {gainW, gainT, doAngle, doRot, doFeed}
  proc,         // parámetros del simulador
  layers,       // {clave: {on, color}}
  view,         // {exag, cmode}
  datum,        // 'start' | 'best' — alineación de la pieza MEDIDA contra su nominal
  mode,         // 'model' | 'meas' | 'comp' — EL MODO manda sobre toda la distribución
  drawer,       // cajón de menú abierto, o null. Estado de pantalla.
  solo,         // el 3D a pantalla completa (tecla F). Estado de pantalla.
  place,        // {pivot,x,y,z,rx,ry,rz} — colocación en el espacio, SOLO presentación
  marks[],      // cotas sueltas: {id, name, color, visible, x, y, z}
  tweak[],      // ajuste manual de la compensación, por doblez
  theme,        // 'system' | 'light' | 'dark' — sin localStorage; viaja en el JSON
  tab, pred
}
```

`ST.mode` es lo primero que hay que mirar al tocar la interfaz: la clase de `#app` sale de ahí y
cada modo tiene su propia rejilla, esconde lo que no usa y se salta su render (ver `renderPanels()`
en `panels/render.ts`). `mode`, `drawer` y `solo` son estado de PANTALLA: no entran en el deshacer;
`mode` sí se guarda en la clave `ui` del JSON, junto al tema y el idioma.

`ST.model` **es solo una caché**: todo el código que dibuja y mide lee de ahí, pero la fuente de
verdad es la variante activa. Después de tocar una variante hay que llamar `syncModel()` o la caché
miente. `datum` y `anchor` son cosas distintas: `datum` alinea una pieza medida contra su nominal,
`anchor` alinea variantes entre sí.

Flujo, de más barato a más caro:

```
updateModelDerived()  reescribe las celdas calculadas de la tabla, SIN reconstruir
drawRibbon()          solo la cinta inferior (canvas 2D)
renderStatus()        barra de estado
renderSide()          lateral derecho de desviación (reconstruye #side)
renderRight()         bloque de abajo (reconstruye innerHTML de #panes)
renderLeft()          panel izquierdo
renderPanels()        = renderLeft + renderSide + renderRight + renderStatus
rebuildScene()        destruye y reconstruye TODA la geometría de three.js
renderShell()         header, barra de vista, leyenda, pestañas, tema, idioma
renderAll()           = renderShell + renderPanels + rebuildScene + drawRibbon
```

`refreshTable()` en `app.js` es el camino de las ediciones de la tabla de modelo:
`recomputeAll()` + `updateModelDerived()` (o `renderRight()` si no está montada) + `renderLeft()` +
`renderSide()` + `renderStatus()` + `rebuildScene()` + `drawRibbon()`. Lo que NO hace es
reconstruir `#panes`, y por eso el foco no salta al recorrer la tabla con el teclado.

Llama lo más barato que sirva. `rebuildScene()` hace `dispose()` de geometrías y materiales; si
agregas objetos a la escena, mételos en un grupo de `groups{}` o vas a filtrar memoria.

El render es **bajo demanda**: el bucle solo dibuja cuando `dirty === true`. Si cambias algo visual
y no se ve, probablemente te faltó `markDirty()` (`rebuildScene()` ya lo hace).

---

## 6. Interfaz: reglas que hay que respetar

### La pantalla la reparte el MODO, y los paneles viven en cajones

Tres modos, tres rejillas, y la clase de `#app` es quien manda (`m-model`,
`m-meas`, `m-comp`). Cada uno esconde lo que no usa y su render se salta solo.
Modelar pone la tabla a la derecha de arriba abajo con el 3D al lado; Medir da
la pantalla al modelo y llena el lateral; Compensar pone los comandos a todo el
ancho y el 3D como banda. **Compensar ES el modo taller**: si en pantalla no
queda nada que no sea compensación, el bloqueo no necesita interruptor.

Los paneles de modelos, vista y piezas **no son una columna fija**: son cajones
que abre la barra de menús y que flotan sobre el 3D, FUERA de la rejilla, para
que abrirlos no la reparta otra vez ni obligue a un `onResize()`. La tecla `F`
pliega todo y deja el 3D solo; `Escape` sale primero de ahí y luego cierra el
cajón, salvo si el foco está en un campo, donde Escape ya significa «descarta lo
que escribí».

Al cambiar de modo o de pantalla completa SÍ hay que llamar `onResize()` y
`fitView()`: la rejilla cambia, y el lienzo WebGL se queda con los píxeles de
antes.

### El deshacer compara documentos, así que la comparación tiene que ser estable

`app/history.ts` guarda documentos serializados con `toDoc()`. Tres cosas que
hay que respetar o el historial deja de servir:

- **`saved` no entra**: es la hora de guardado y cambia en cada llamada, así que
  dos documentos idénticos saldrían distintos y cualquier clic gastaría un paso.
- **Un ajuste manual todo a cero se canoniza como «sin ajuste»**: pintar la
  pestaña de compensación rellena `ST.tweak` de ceros y, sin esto, mirarla
  apilaba un paso.
- **Lo que llega por un diálogo de archivo se apila al terminar la carga**, no en
  el clic: el diálogo es asíncrono y el `commit()` del clic ya pasó.

`commit()` se llama después del despachador ENTERO de clics y del de `change`,
no dentro de una rama, porque cualquiera puede tocar el documento.

### Los paneles se reconstruyen enteros

`paneModel()`, `panePoints()`, `paneMeas()` y `paneComp()` (en `panels.js`) devuelven cadenas HTML.
No hay framework ni estado en el DOM. Consecuencia: **un `renderRight()` mientras alguien escribe le
quita el foco.** Por eso los inputs de tabla usan el evento `change` (dispara al salir del campo),
no `input`.

Contra eso hay **dos capas**, y conviene no confundirlas:

1. `updateModelDerived()` — la **actualización dirigida**, y el camino normal. Al confirmar una
   celda de la tabla de modelo no se reconstruye nada: se reescriben solo las celdas calculadas
   (`Or.`, `Recta`, `Avance`, `Sigma L`, los delta, el `title` de la torsion y el pie), saltando
   siempre el nodo que tiene el foco. Devuelve `false` si la tabla no esta montada.
   `editBend()`, `editStraight()` y `editDelta()` pasan por `refreshTable()`, no por `refresh()`.
2. `saveFocus()` / `restoreFocus()` dentro de `renderRight()` — la **red de seguridad** para todos
   los demas caminos, que si reconstruyen. Anota la celda activa por un selector estable
   (`cellKey()`) y la posicion del cursor, y las devuelve despues.

Si agregas una celda calculada a la tabla de modelo, dale un `data-cell="..."` y anadela a
`updateModelDerived()`, o se quedara con el valor viejo hasta el siguiente render completo.

### Eventos por delegación con atributos `data-*`

Las escuchas globales están en `bind()` (`app.js`). Para agregar un control, dale el atributo
correcto y ya:

| atributo | qué hace |
|---|---|
| `data-a="acción"` | despacha a `action()` — ahí se agregan botones nuevos |
| `data-v` | cambiar vista 3D (`iso`/`top`/`front`/`side`/`fit`) |
| `data-cm` | modo de color (`solid`/`dev`) |
| `data-md` | MODO de trabajo (`model`/`meas`/`comp`) — reparte la pantalla entera |
| `data-dr` | abre o cierra un cajón de menú (`file`/`models`/`view`/`pieces`) |
| `data-t` *(dentro de `#tabs`)* | sub-pestaña, solo en Modelar (`model`/`points`) |
| `data-mx` | borrar una cota — estuvo sin escuchar desde que se añadieron las cotas |
| `data-an` | extremo fijo entre variantes (`start`/`end`/`best`) |
| `data-dm` | datum de la pieza medida (`start`/`best`) |
| `data-l` | idioma (`es`/`en`/`de`) |
| `data-th` | tema (`system`/`light`/`dark`) |
| `data-r="i"` | seleccionar doblez `i` (filas de tabla) |
| `data-ly` / `data-lc` | capa: visibilidad / color |
| `data-vsel` / `data-vv` / `data-vc` / `data-vd` / `data-vx` / `data-vr` | variante: activar / visible / color / duplicar / borrar / marcar como referencia |
| `data-dv` / `data-dc` / `data-dx` / `data-dsel` | dataset: visible / color / borrar / activar |
| `data-m` / `data-s` / `data-t` | campo de modelo / sección / tolerancia |
| `data-pl` / `data-plp` | colocación: mover/girar / PI que hace de pivote |
| `data-mk` / `data-mv` / `data-mc` / `data-mx` | cota: editar / visible / color / borrar |
| `data-tw="i" data-k="campo"` | ajuste manual de la compensación (acepta cuentas) |
| `data-b="i" data-k="campo"` | editar el valor **base** del doblez `i` |
| `data-st="i"` | editar la **recta** del doblez `i` — la única columna de longitud que se teclea |
| `data-bd="i" data-k="campo"` | editar la columna **Δ** del doblez `i` |
| `data-p="i" data-k="x\|y\|z"` | editar coordenada del punto `i` (dispara `ik()`) |
| `data-c` | campo de compensación |
| `data-pr` | parámetro del simulador |

Hay un guardia al inicio del `click` global que ignora clics sobre `INPUT`/`SELECT`/`TEXTAREA`
(salvo checkbox, color y radio) para que seleccionar una fila no destruya el campo que estás
editando. **No lo quites.**

### i18n: obligatorio

Todo texto visible pasa por `T('clave')`. Al agregar una cadena hay que ponerla en **`I18N.es`,
`I18N.en` e `I18N.de`**, las tres. Cambiar de idioma llama `renderAll()`, que reconstruye toda la
interfaz — por eso no hay `data-i18n` en el HTML estático.

`test_motor.js` comprueba tres cosas: mismo juego de claves exacto en los tres idiomas, ninguna
cadena vacía, y ninguna cadena arrastrada del español sin traducir. La exención de coincidencias
legítimas es **por idioma**: en inglés `Datum`, `Twist`, `Color` y `Dist.` son la palabra buena; en
alemán no —`Datum` significa fecha y el datum de medición es **Bezug**— así que ahí siguen
vigiladas.

Términos de taller en alemán: doblez de canto = **Hochkantbiegung**, de plano = **Flachbiegung**,
springback = **Rückfederung**, PI = **Schnittpunkt**, longitud desarrollada = **Abwicklungslänge**.
Sin revisar por nadie del taller: `Auslauf` (cola), `Auflageböcke` (pedestales), `Drehversatz`
(sesgo de rotación), `Delta einrechnen` (fundir), `Platzierung` (colocación) y `Rechenkern` (motor).

Los números siguen con punto decimal en los tres idiomas. Cambiarlo tocaría `fx()`, el parser de la
celda de compensación y el CSV; no se hizo.

### Diseño

Está en `app.css` como variables CSS. Etiquetas en versalitas espaciadas (sans), **todos los datos
en monoespaciada con `tabular-nums`** — es un instrumento de medición, no un dashboard.

Los `input[type=number]` **no llevan flechas nativas**: robaban ancho y tapaban las cifras. Los
sustitutos son las teclas Flecha arriba / Flecha abajo y la rueda del ratón sobre el campo enfocado
(manejador `wheel` en `bind()`). **Dentro de una tabla las flechas navegan**, así que ahí el
incremento por teclado es `Ctrl+Flecha`; la rueda sigue sirviendo en los dos sitios y las dos rutas
comparten `stepField()`.

El espacio va en tres bandas (`#app`, rejilla de 5 filas): arriba `lf | ct | rt`, luego la cinta a
todo el ancho, luego la tabla a todo el ancho y el estado. La fila del 3D es `minmax(200px,1fr)`,
que es lo que garantiza el mínimo del 3D sin vigilarlo desde JS. `--rtW` (360 px) se arrastra con
`#rtgrip` y `--btH` (340 px) con `#btgrip`, el tirador del borde superior de la cinta. La tabla de
dobleces tiene `min-width:1000px` —son 13 columnas contando las Δ— y a todo el ancho ya no necesita
desplazarse en X.

La **medición no es una pestaña**: sus estadísticas y su tabla de desviación viven fijas en `#rt`
(`renderSide()`), porque son lo que hay que tener delante mientras se edita la tabla. Quedan tres
pestañas abajo. `renderRight()` reencamina a `model` si un archivo guardado traía `tab` en
`meas`.

Las columnas **Δ** van pegadas a su parámetro, con fondo propio (`.dcol`) y las cifras en verde
`--corrected`: la corrección se lee junto al dato, no en otra tabla. Una fila con Δ pendientes lleva
una barra verde a la izquierda. Los colores tienen significado semántico y no son decorativos:

`--nominal` azul · `--measured` ámbar · `--corrected` verde · escala de desviación verde→ámbar→rojo
en `devColor(d, tol)`, donde `tol` = 1× y `2·tol` = rojo pleno.

### Los dos temas

`app.css` define la paleta entera como tokens en `:root`. El tema claro los redefine dos veces: bajo
`:root[data-theme="light"]` (elección explícita) y bajo
`@media (prefers-color-scheme:light){ :root:not([data-theme="dark"]) }` (preferencia del sistema,
guardada para que elegir oscuro gane). El significado semántico no cambia con el tema: solo la
luminosidad.

**Ni `scene.js` ni `ribbon.js` llevan colores propios**: los leen de `:root` con `cssVar()` en
tiempo de ejecución —fondo, niebla, los dos colores del `GridHelper`, el material de los pedestales,
el eje y las etiquetas de la cinta—. Un color nuevo se define en `app.css`, en los dos temas.
`applyTheme()` recoloca fondo y niebla sin reconstruir; la rejilla y los pedestales llevan el color
dentro del material, así que cambiar de tema hace `rebuildScene()`. `devColor()` se queda en el
motor: es semántico y compartido con Python.

Sin `localStorage`, el tema y el idioma viajan en la clave **opcional** `ui` del JSON. Un archivo
sin `ui` no pisa lo que el usuario tenga puesto.

La **cinta inferior** (`drawRibbon`, canvas 2D) es el elemento distintivo: desenrolla la longitud
desarrollada y pone una columna por doblez coloreada por desviación, con la línea de tolerancia
punteada. Deja ver de un vistazo cuál doblez está fuera. Es clicable.

---

## 7. Trampas conocidas

0. **La convención es la LRA, esquema barcomp/2.2.** `rot` **gira el eje de
   doblado** y `angle` es el doblez entero; el signo de `angle` va al revés que
   en 1.0. Hay DOS distinciones aquí, y confundirlas cuesta versiones:

       2.0  Rx(rot) · Rz(-angle)              la sección salía RODADA   ← mal
       2.1  Rx(rot) · Rz(-angle) · Rx(-rot)   solo se inclina el eje    ← bien
       2.2  lo mismo, pero con el eje ACUMULADO: rot es un incremento

   (a) Inclinar el eje NO es rodar la barra. Si dejas el `Rx(rot)` puesto en el
   marco, `rot` hace de twist y la pieza se retuerce. `twist` es lo ÚNICO que
   rueda la barra, y eso no ha cambiado.

   (b) El EJE sí se sostiene entre estaciones, porque el proceso es secuencial:
   la máquina lo gira, dobla, y no lo devuelve sola. Por eso `rot` es un GIRO y
   el eje real sale de `axisAngles()`. `orientations()` mira ese eje absoluto;
   si lo hace mirar el `rot` de la fila, media tabla queda etiquetada al revés.

   Las dos cosas conviven: el eje acumula, la sección no rueda.

   Los archivos anteriores se convierten al abrirlos con `migrateModel(m,
   esquema)`, que pasa por los PI y no aproxima nada; `fkLegacy()` lleva las
   TRES cinemáticas viejas, incluida la 2.1 con su eje absoluto. Los Δ
   pendientes llegan en cero porque son incrementos sobre parámetros que
   cambiaron de significado.


1. **No uses `localStorage` ni `sessionStorage`.** Falla en artefactos y no aporta nada aquí.
2. **No agregues CDNs, `fetch()`, ni imports externos.** Todo tiene que correr bajo `file://` sin red.
3. **Los ids de dataset y de variante son cadenas** (`'ds1'`, `'v1'`), no números. `===` siempre.
4. Los ángulos siempre por `wrap180()` al restar, o los cruces por ±180° dan diferencias falsas.
5. `orientations()` devuelve un arreglo del largo de `bends`; alinéalo bien al indexar tablas.
6. `EdgesGeometry(g, 28)` sobre la barra nominal da el alambrado. Bajar el umbral llena la pantalla
   de líneas y tira los cuadros por segundo.
7. ~~Un `renderRight()` reinicia el desplazamiento del panel derecho.~~ Resuelto: `renderRight()`
   guarda y restaura `#rt.scrollTop`.
8. `preserveDrawingBuffer: true` en el renderer es necesario para que el reporte pueda capturar
   `toDataURL()`. No lo quites.
9. Una pieza medida puede tener **menos dobleces** que el nominal: compara siempre sobre
   `min(a.length, b.length)`. Ya reventó una vez.
10. Editar puntos sobre una variante con Δ pendientes los **funde primero** (`bakeGuard()`
    pregunta). Sin eso, guardar el resultado en la base perdería los Δ sin avisar.
11. `ST.model` es una caché. Si tocas `ST.variants[...]` y no llamas `syncModel()`, la pantalla
    dibuja el modelo anterior.
12. La **colocación** es solo presentación, y la escena tiene **dos** grupos:

    - `world` — el taller: la cuadrícula del suelo y los pedestales. Matriz identidad, no se
      mueve nunca.
    - `root` — la pieza y todo lo que se mide contra ella. Su matriz es `placeMatrix()`.

    Mover o girar la colocación mueve la PIEZA sobre un suelo quieto, con la cámara donde estaba.
    Lo que dibujes va a `root` salvo que sea referencia del taller, y todo lo que proyectes a mano
    (etiquetas, encuadre, el indicador de ejes) se multiplica por `placeMatrix()`. Los pedestales
    son la excepción que confirma la regla: viven en `world` pero se levantan desde los PI **ya
    colocados**, para seguir a la pieza sin despegarse del suelo. `groupHost(capa)` dice de cuál
    de los dos cuelga cada capa, y el banco de pruebas lo vigila.
13. Al arrastrar **cualquiera de los dos tiradores** hay que llamar `onResize()`: el lienzo WebGL
    conserva su tamaño en píxeles y se monta encima del panel derecho o de la cinta. El
    `overflow:hidden` de `#ct` y el `ResizeObserver` sobre `#vpwrap` son los otros dos frenos.
14. El ajuste manual de la compensación guarda la **diferencia** contra lo calculado, no el valor
    absoluto: así sigue significando lo mismo si cambia la ganancia o la pieza medida.
15. La cuenta de la recta (`feed - trim(i) - trim(i-1)`) estuvo copiada en **cuatro** funciones a la
    vez. Ahora vive solo en `straightOf()` / `rowLengths()`, y `machineFeeds()`, `twistSpanOf()`,
    `buildPath()` y `bendStations()` la consumen. No la vuelvas a escribir a mano.
16. `Recta` es lo único que se teclea; `Avance` es de solo lectura. Pero **el estado sigue siendo
    `feed`**: es lo que va al JSON, a `command[]` y al motor de Python. Al cambiar un radio o un
    ángulo se conserva la RECTA y se mueve el avance, nunca al revés. Si inviertes esto, la tabla
    deja de hacer lo que el usuario pidió.
17. `Recta` y su Δ trabajan sobre la **base**, como el resto de columnas editables; `Avance` y
    `Σ L` se leen del modelo **efectivo**. Sumar un Δ a `feed` suma exactamente lo mismo a la
    recta, porque los trims no dependen del avance: por eso el Δ de la columna de recta es el
    mismo `data-bd` con `data-k="feed"` de siempre, y la compensación no cambió nada.
18. Los campos numéricos declaran `step="any"` y llevan el paso en **`data-step`**. Con un paso
    real en `step`, el navegador marca inválido todo lo que no cae en su rejilla —con `step=".1"`
    un `17.905` es un error— y redondea al usar las flechas. `stepField()` lee `data-step`, y
    `nfield()` (`panels.js`) es quien emite los dos atributos: úsalo en vez de escribir el
    `<input>` a mano.
19. Los valores de campo editable van por **`nx()`**, no por `fx()`: rellena a dos decimales y
    muestra el tercero solo cuando lo hay, así repintar no se come lo que alguien tecleó. `fx()`
    se queda para las celdas de lectura, donde el ancho fijo alinea mejor.
20. Enfocar un campo **selecciona su valor** y vaciarlo no escribe un `0`: se devuelve lo que
    había. Las dos cosas están en `bind()`, en `focusin` y al principio de `change`. El
    `preventDefault()` sobre el `mouseup` siguiente es lo que impide que el clic deshaga la
    selección; sin él, seleccionar al enfocar no sirve de nada con el ratón.
21. Con el tema en `system`, el CSS sigue solo a la preferencia del sistema pero **el lienzo WebGL y
    la cinta no**: hay un `matchMedia` en `app/theme.ts` que les avisa. Si se te olvida, el 3D se
    queda con el fondo del tema anterior.
22. **Las etiquetas del 3D también leen sus colores del CSS.** Llevaban un `#fff` a pelo para la
    seleccionada y era blanco sobre blanco en tema claro. El estado va por clase (`.lbl.sel`) y el
    color por token (`--lblTxt`, `--lblSel`), definidos en las dos paletas. Y la cota lleva su color
    de identidad en un punto, no en el texto: un color elegido sobre fondo oscuro se lava sobre
    fondo claro.
23. **Los vectores de desviación están acotados** al 6 % de la longitud desarrollada. Se dibujan
    ×exag para que una décima se vea, pero con la punta a 20 mm y ×25 salían barras de medio metro
    que tapaban la escena. La dirección se sigue leyendo; la magnitud la dan la tabla y el color.
24. **La celda de compensación es de hoja de cálculo**: un operador al principio opera sobre lo
    MOSTRADO (`v`), `c` es el cálculo del lazo y `=` fuerza absoluto. Antes `+2` iba sobre `c` y
    `-3` era el número −3, que no era coherente. Es lo único de la interfaz que cambió de
    significado, y está en el README.
25. **El lazo puede leer la mediana del lote** (`comp.batch`). Compensar desde una sola pieza mueve
    el comando por la dispersión de esa pieza; con varias, la mediana deja pasar solo lo que se
    repite. La columna ±σ de la tabla de desviación es lo que separa un doblez fuera de sitio de
    uno con mala puntería.

---

## 8. Antes de dar por terminado un cambio

```bash
cd web && npm run check            # typecheck -> pruebas -> build -> banco, de una
cd web && npm run typecheck        # tsc --noEmit, con strict
cd web && node test_motor.js       # 163 pruebas; todas deben pasar
cd web && node build.mjs           # regenera index.html y barcomp_viewer.html
cd web && node tools/ui_test.mjs   # 140 pasos de interfaz en Edge headless

cd "..\Twister Register Python\python" && python test_core.py   # 100 pruebas
cd "..\Twister Register Python" && python compare_engines.py     # los DOS motores
```

Dos herramientas más, que no son pruebas sino evidencia:

```bash
node tools/strip_diff.mjs src/x.ts   # ¿el puerto a TS fue SOLO anotaciones?
node tools/export_surface.mjs        # los 83 exports del motor, con tipo y aridad
node tools/ui_test.mjs <pág> tools/probe_perf.js   # coste de la escena
node tools/bundle_report.mjs         # de qué está hecho el bundle
```

El banco de interfaz es la única red que cubre la interfaz —`test_motor.js` solo cubre el motor y
el i18n— y **hay que ampliarlo con cada cambio**. Dos cosas que hacen perder media hora: Edge
headless en Windows no siempre engancha stdout, por eso el banco habla por CDP y no por
`--dump-dom`; y Edge deja navegadores vivos aunque se mate el lanzador, así que si un puerto de
depuración se reutiliza se habla con el zombi. Si algo se atasca, matar los `msedge.exe` que
tengan `headless` en la línea de comandos.

Asignar `.value` por script NO marca el campo sucio, así que el navegador no dispara `change` al
desenfocar. Las pruebas que confirman un valor tecleado usan `execCommand('insertText')` sobre el
campo enfocado, que sí recorre el camino real.

`compare_engines.py` es el criterio de aceptación del motor: tiene que decir *"los dos motores
coinciden"*, con las diferencias en el ruido de redondeo IEEE (~1e-13).

Y abrir el HTML y verificar a mano lo que las pruebas no cubren: gira la vista, cambia de idioma y
de tema, recorre la tabla entera solo con el teclado, arrastra los dos tiradores hasta los
extremos, simula una pieza, aplica compensación, duplica un modelo y cámbiale un ángulo, prueba
los tres anclajes, inserta y borra puntos, genera el reporte.

Si agregas una función al motor, agrégale una prueba. `test_motor.js` importa `src/engine.js` como
módulo ES —el mismo archivo que esbuild empotra en el HTML—, así que no hay copia que se
desincronice ni contexto `vm` que preparar.

---

## 9. La versión Python

`python/barcomp/core.py` implementa el **mismo motor** con numpy y comparte el esquema JSON
`barcomp/1.0`, así que los archivos van y vienen entre las dos implementaciones. Existe para que el
usuario compare cuál le conviene. `python/barcomp/gui.py` es su visor: Tkinter + matplotlib.

**Si cambias la cinemática o el modelo de datos en `web/src/engine.js`, hay que replicarlo en
`python/barcomp/core.py`, y al revés.** Las funciones se llaman igual (`fk`, `ik`, `orientations`,
`machine_feeds`, `bend_decomp`, `build_path`, `twist_spans`, `simulate`, `compensate`, `kabsch`,
`effective_model`, `anchor_transform`, `move_pi`), en `snake_case` del lado Python.

Los dos motores implementan el mismo **doblez biaxial** y el mismo `demoModel()`, con el mismo PRNG
y la misma semilla. No hay divergencia permitida: si `compare_engines.py` no dice *"los dos motores
coinciden"*, algo se rompió.

La forma de verificar que siguen sincronizados no es leerlos en paralelo:

```bash
python compare_engines.py
```

Corre los dos sobre el mismo modelo y compara puntos PI, longitud desarrollada, trayectoria
muestreada, avances de máquina, la inversa, la pieza simulada y la compensación. Hoy todo queda en
~1e-13 y el simulador coincide **bit a bit**: `mulberry32` está portado exacto (con `jround()`,
porque `round()` de Python redondea a par y `Math.round` de JS no), así que la misma semilla produce
la misma pieza virtual en los dos motores. Si tocas el motor y esa comparación se rompe, no
sincronizaste bien.

### Variantes: varios modelos comparables sobre un extremo común

Está en los **dos** visores. Una **variante** es `{base, deltas, tailDelta}`:
los valores base más una columna de corrección por parámetro. El **modelo
efectivo** = base + deltas es lo único que ve la cinemática; `effective_model()`
lo arma y `bake_deltas()` funde los deltas en la base. Separarlos permite
escribir la compensación al lado del dato sin perder el valor original.

`ST["variants"]` es la lista, `ST["active"]` la que se edita, `ST["ref"]` la
referencia y `ST["model"]` **es solo una caché** del modelo efectivo de la
activa: todo el código de dibujo y medición sigue leyendo de ahí. Después de
tocar una variante hay que llamar `_sync_model()` (`syncModel()` del lado web) o
la caché miente.

`anchor_transform(model, ref, mode)` es lo que hace comparable a dos variantes:

| modo | qué queda fijo | para qué sirve |
|---|---|---|
| `start` | el amarre (P0) | ya es común: `fk()` arranca todas en el origen. Es el orden físico del proceso. |
| `end` | el extremo **libre** | lleva el marco final de la variante sobre el de la referencia, así que la punta maquinada coincide en posición Y orientación y la divergencia se ve acumulándose hacia el amarre. Es el anclaje útil si el criterio de aceptación es la posición del extremo maquinado. |
| `best` | nada, reparte el error | Kabsch sobre los PI. |

`pi_shift()` devuelve cuánto se movió cada PI ya anclado; cuando el anclaje es
`end` las listas se alinean **por el final**, no por el principio.

### Edición de puntos: absoluta, no paramétrica

`move_pi`, `insert_pi` y `delete_pi` trabajan en el espacio de los PI y
reconstruyen la cadena con `ik()`. Consecuencia deliberada: **mover un punto deja
los demás donde están** — se recalculan los avances y ángulos vecinos, no se
arrastra la cadena. Es lo contrario de editar un ángulo en la tabla LRA, que sí
hace girar todo lo que va después. Las dos semánticas son útiles y conviven.

Un punto insertado nace **colineal** (ángulo 0): es un punto de control listo
para moverse, no un doblez todavía. `ik()` no puede recuperar radio ni torsión
de los puntos, así que `_model_from_points()` los arrastra por índice.

Editar puntos sobre una variante con deltas pendientes los **funde** primero
(`_bake_guard()` pregunta antes): la geometría efectiva es la que se está
tocando, y guardar el resultado en la base sin fundir perdería los deltas sin
avisar.

### El visor Python NO es un puerto pixel a pixel

Es la misma herramienta reinterpretada con lo que Python hace bien, y así debe seguir:

- **Tablas nativas.** `EditTree` es un `ttk.Treeview` con edición en celda por doble clic: el Entry
  flotante hereda el ancho completo de la columna, con Enter/Flechas para saltar de fila.
- **El 3D es matplotlib, no Three.js.** La barra se dibuja como superficie: `_bar_surface()` arma
  4 caras por tramo con `Poly3DCollection` más tapas, y las sombrea a mano con un Lambert de una
  luz (`_shade()`), porque `Poly3DCollection` no ilumina nada por su cuenta. `_decim()` mantiene el
  muestreo cerca de 190 estaciones (~1500 polígonos) pase lo que pase: alcanza ~15 fps al rotar.
  Con una pieza medida encima, el nominal pasa a alambrado (`_bar_ghost()`); superficies
  translúcidas superpuestas se ven sucias en matplotlib.
- **Los ejes van apagados y el panel NO es cuadrado.** `Axes3D.apply_aspect()` recorta el eje a un
  cuadrado en cada dibujo: en un panel ancho eso deja media pantalla muerta y recorta la barra
  contra el borde. `_widen_axes3d()` anula `apply_aspect` y compensa la deformación resultante
  premultiplicando la matriz de `get_proj()` por una escala `alto/ancho` en X — verificado contra
  un cubo, la relación entre sus aristas vuelve a ser la del eje cuadrado. Si tocas esto, vuelve a
  verificarlo con un cubo o la torsión empezará a mentir.
- **`_equalize()` + `_autofit()`.** El primero pone límites y `set_box_aspect` proporcionales al
  volumen real (escala verdadera, sin el cubo de 1.7 m de lado que dejaba la barra como un hilo).
  El segundo mide en píxeles el alcance del modelo **desde el centro del eje** — no su ancho: el
  modelo casi nunca queda centrado en su caja, y medir el ancho hacía que el zoom creciera hasta
  salirse por arriba.
- La rejilla de piso se dibuja a mano al ras de `get_zlim()[0]`. La nativa de matplotlib solo
  existe con los ejes encendidos y arrastra paneles y etiquetas.
- **Todas las variantes visibles se dibujan a la vez**, cada una en su color y todas transformadas
  por su `anchor_transform`. La activa va como superficie sólida; las demás como alambrado. La capa
  `diff` une cada PI con su homólogo de la referencia y colorea por magnitud — con escala relativa
  al mayor desplazamiento del cuadro, no a la tolerancia: ahí se comparan diseños, no piezas contra
  tolerancia. El rombo con la cifra marca el extremo que **sí** se mueve, o sea el opuesto al anclado.
- La cinta inferior cambia de significado sola: con pieza medida muestra la desviación de
  inspección; sin ella, y con la activa distinta de la referencia, muestra el Δ ángulo por doblez
  **entre variantes**.
- Los campos numéricos (`NumField`) tampoco llevan spinbox, por la misma razón que en el visor web.

A largo plazo esta duplicación debe desaparecer: el motor se queda en un solo lenguaje y el JSON es
la frontera. Está duplicado a propósito en el alfa. Si el usuario ya decidió con cuál se queda,
propón consolidar — y `compare_engines.py` es lo que le da la evidencia para decidir.

El visor web ya cubre lo mismo que el de Python: varios modelos con columnas Δ, extremo fijo común,
capa de desplazamiento, edición de puntos PI y la cinta que cambia de significado sola. La
diferencia que queda es de herramientas, no de funciones: el lado Python tiene numpy/scipy a la mano
para lo que viene (RANSAC sobre nubes de GOM, ajuste de springback contra piezas reales).

---

## 10. Estado del proyecto y qué falta

Es un **alfa de demostración**, sin datos reales todavía. Lo que sigue, en orden de impacto:

1. **Reemplazar `simulate()` por datos reales.** Es el único bloque que inventa números. Los
   valores de springback (`sbW`, `sbT`) deben ajustarse contra piezas reales, y **separados por
   orientación**: doblar contra el ancho y contra el espesor, con el laminado a lo largo, tiene
   constantes elásticas distintas.
2. **Extraer los PI desde la nube de GOM.** Hoy el visor recibe puntos ya extraídos. Falta:
   segmentar tramos rectos → ajustar rectas robustas (RANSAC) → intersectar ejes → PI. Va del lado
   Python.
3. **Confirmar qué parámetros acepta la dobladora.** Si solo toma ángulo, `doRot` y `doFeed` se
   quedan apagados y el sesgo de rotación hay que atacarlo por calibración del robot.
4. Flexión por gravedad en el fixture: en 1.7 m de aluminio puede ser del orden de las tolerancias.
5. Trazabilidad histórica por lote (el esquema ya guarda varias piezas por archivo).
6. Consolidar en un solo motor. Los dos están sincronizados y `compare_engines.py` lo demuestra;
   mantener ambos cuesta el doble por cada cambio de cinemática.

### Hallazgo de la validación, importante para las decisiones de diseño

Corrigiendo **solo ángulos**, los ángulos convergen a 0.15° pero la desviación de la punta libre se
estanca en ~5 mm, porque el sesgo de rotación de ±0.35° se acumula a lo largo de la cadena.
Activando también rotación y avance, la punta baja a 0.17 mm. Si el criterio de aceptación es la
posición del extremo maquinado, corregir solo ángulos no basta.

Ganancia recomendada **0.6–0.8**, nunca 1.0: al 100 % el lazo oscila con el ruido de medición.

---

## 11. Auditoría 2026-09-07 y plan de beta 1.0

Un panel de siete auditores revisó el proyecto en paralelo. Informe completo, mapa y
solicitud de datos a metrología en `.auditoria/`. Aquí solo lo que hace falta para
trabajar por fases en sesiones siguientes.

**Veredicto en una frase:** como alfa de demostración está por encima de lo normal; como
programa a punto de recibir barras reales no está listo, porque **hoy nada distingue un
número correcto de uno que solo lo parece**.

### Decisión que manda sobre todo lo demás

**Los signos de ángulo y rodado actuales NO se tocan.** Funcionan contra valores de máquina
reales que no se pueden modificar. La corrección no es invertirlos: es **congelarlos en un
fixture de pruebas** para que ningún cambio futuro los mueva en silencio. Tocar `ANG_DIR` o
`ROT_DIR` obliga a subir `SCHEMA` y a regenerar el fixture a propósito.

### Reparto de modelo

**[O] Opus** — cinemática, esquema, parser de datos externos, diseño del lazo, arquitectura.
**[S] Sonnet** — ediciones de alcance cerrado: CSS, i18n, aplicar `esc()`, deduplicar, rutas
portables, guardas de existencia, mensajes de error.
Regla: si se describe en una frase sin ambigüedad y no toca números que van a la máquina,
es de Sonnet.

### ✔ Fase 0 · Contención — CERRADA (2026-09-08)

Las cuatro redes en verde: `tsc` limpio, 225 pruebas de motor, 145 pasos de
interfaz, build reproducible. Lo que sigue está hecho.

- [x] **C7 · Sello de versión** [O] — `/*__VER__*/` en `shell.html`, sustituido en
      `build.mjs` por SHA + fecha, pintado en la barra de estado. Va primero: sin esto
      ningún arreglo se rastrea hasta una copia concreta.
- [x] **C3 · Congelar el comportamiento actual** [O] — `SCHEMA` a `barcomp/2.3` +
      `web/test/fixtures/` con PI esperados tomados de lo que funciona hoy.
- [x] **A5 · Rechazar esquemas desconocidos** [S] — `SCHEMA_LEGACY` existe y no se usa;
      hoy `barcomp/9.9` se lee como cinemática 1.0.
- [x] **C1+A4 · Alineación de rama y eje no observable** [O] — el hallazgo más grave:
      con 0.1 mm de ruido `compensate()` reescribe 68.4° como 170.8°. `alignBranch()` en
      `measuredModel`, `deviations`, `bendStats`, `medianPart`.
- [x] **C2 parcial · Blindar el CSV** [O] — exigir 3 o 4 columnas numéricas y rechazar la
      línea ambigua en vez de recortar por la derecha; detectar coma decimal; verificar
      `pts.length - 2 === bends.length`.
- [x] **C5 · SIM/MED visible en Compensar** [S] — `#app.m-comp #rt{display:none}` oculta
      la insignia justo donde se decide sobre material.
- [x] **C6 · Marcar los dobleces sin medir** [O] — hoy se pintan `+0.000`, idénticos a
      uno perfecto.
- [x] **C8 · `beforeunload` con documento sucio** [S]
- [x] **A1 · Guardas del lazo** [O] — banda muerta, tope de Δ, ganancia máx. 1.0, n≥3.

**Lo que cambió respecto de lo que decía la auditoría.** QA-01 daba por hecho que
un archivo `2.2` abriendo espejado era corrupción. No lo es: `bb76bde` lo decidió a
propósito —los datos del taller ya traían el sentido contrario y se cambió el motor,
no los archivos— y convertirlos habría deshecho ese cambio. Así que **no se migra
nada**: `SCHEMA` sube a `barcomp/2.3` para que los archivos nuevos se identifiquen
solos, y `barcomp/2.2` entra en `SCHEMA_AMBIGUOUS`: se lee tal cual, sin tocar un
número, y se avisa de que hay que mirar la FORMA en el 3D.

**Lo que quedó a medias, dicho a las claras.** `AXIS_MIN_DEG` (el umbral de eje no
observable) vale 1.0 y es **provisional**: la regla es `atan(3σ/avance)` y σ no se ha
medido. Con ruido alto, el ángulo APARENTE de un doblez casi recto supera el umbral
y la guarda no dispara. El mecanismo está y probado (170/200 casos inventados → 0
con el umbral bien puesto); el número se recalcula cuando llegue A.6.
Lo mismo con la banda muerta del lazo (`dead: 0.05`), elegida por debajo de la
tolerancia típica a falta de σ real.

**Cierre de fase:** un CSV con columnas de más se rechaza diciendo por qué; un CSV corto
avisa cuántos dobleces quedaron sin medir; Compensar dice SIM o MED sin salir del modo; el
pie muestra el SHA; `npm test` incluye el fixture congelado y el barrido de eje, en verde.

### ✔ FASE 1 CERRADA — 2026-09-08 · Ganancias rápidas

Hechos (2026-09-08): **A6** y **A7**, los dos que dolían al importar un lote.

- **A6** — `io.ts` lee con `File.text()` y `Promise.allSettled()`. Antes, con `FileReader`
  y sin `onerror`, un archivo que el sistema no dejaba leer —movido, o abierto por otro
  programa— dejaba el contador del lote sin llegar a cero: el callback **no se llamaba
  nunca** y el lote se colgaba en silencio. Ahora `pickFiles()` entrega dos listas, lo
  leído y lo ilegible, y lo ilegible sale nombrado en el mismo aviso que el CSV que no
  servía. Clave nueva `fileUnread`.
- **A7** — el `commit()` salió del bucle: importar 20 piezas gastaba 20 pasos de deshacer
  y serializaba el documento 20 veces. `addCsvPiece()` no toca el historial;
  `importCsvText()` apila el paso de una pieza suelta e `importCsvBatch()` apila uno solo
  para el lote.
- El grupo que toca disco se mudó a **`app/files.ts`**: `actions.ts` pasaba de las 400
  líneas de la regla. Quedan en 293 y 169.

Hechos también: **A3**, **M2** y **M3**, los tres que dejaban pasar geometría imposible.

- **A3** — `trim = radio · tan(θ/2)` tiene una asíntota en θ=180: daba 4.9e17, y a 181°
  salía NEGATIVO (la recta crecía al doblar más). Dos capas, y la diferencia importa:
  `bendDecomp` **envuelve** a (-180, 180], que es exacto —girar 200° es girar −160°, la
  misma pieza—; `trimOf` **topa** en `BEND_MAX_DEG = 170`, que sí es una decisión, y el
  doblez topado sale listado en vez de disimulado.
- **M2** — la celda roja de `recta < 25` ya existía en `model.ts` y `focus.ts`, con el
  número escrito a mano en los dos. Ahora `engine/feasible.ts` tiene `STRAIGHT_MIN_MM` y
  `feasibility()`, y un `.warnbox` dice con palabras qué dobleces no caben, separando la
  recta CORTA (umbral discutible) de la NEGATIVA (herramentales cruzados, sin umbral que
  valga). Se recalcula en `updateModelDerived()` además de al repintar: teclear una recta
  no reconstruye el panel.
- **M3** — dos PI a 0.3 mm dan una dirección de puro ruido y de ahí un doblez inventado
  que además envenena la fila siguiente. Se rechaza al LEER (`parsePointsCsv`), no dentro
  de `ik()`: editar a mano puede pasar por estados raros, pero un ARCHIVO así está mal
  extraído. `PI_MIN_MM = 1.0`, provisional como los demás.

**Un tercer valor provisional**, además de AXIS_MIN_DEG y COMP_DEFAULT.dead:
`STRAIGHT_MIN_MM = 25` y `PI_MIN_MM = 1.0` en `engine/feasible.ts` y `engine/doc.ts`. El
primero es una cota de la MÁQUINA (mordaza + carrera) y espera B.2; el segundo es `5σ` y
espera A.6, igual que los otros dos.

Hechos también: **A12**, **A14**, **A13** y **M1**, los cuatro de «el programa no dice lo
que pasó».

- **A12** — un texto que la celda Δ no entiende ya no se esfuma. Se queda a la vista en
  rojo (`.badcell`) con el tooltip de qué se admite. Volver al valor de antes, que es lo
  que hacía, es EXACTAMENTE lo que se ve cuando el ajuste sí se acepta y no mueve nada:
  dos resultados opuestos con la misma pinta. `markRejected()` está en `panels/focus.ts`,
  que ya era el dueño de los retoques dirigidos posteriores al repintado, y **no roba el
  foco**: el `change` salta al SALIR del campo, el cursor ya está en otra celda.
- **A14** — `cellNote` decía que `+2` operaba sobre lo que calculó el lazo. Desde el
  cambio del parser opera sobre lo MOSTRADO. Reescrito en es/en/de con los tres grupos
  nombrados: relativo a lo que ves / relativo al lazo (`c`) / absoluto (`=`). Con él, los
  dos comentarios de `panels/comp.ts` que repetían la versión vieja y remitían a un
  `engine.js` inexistente (el parser vive en `engine/expr.ts`).
- **A13** — el `.warnbox` ya estaba tokenizado; lo que faltaba era `--dim2`, a 3.1:1 en
  oscuro y 3.2:1 en claro, bajo el 4.5:1 de WCAG 1.4.3. No es decorativo: lo llevan la
  ayuda de las celdas, los rótulos de sección y las columnas de solo lectura, que son
  DATOS, a 10 px. Sube en los dos temas medido contra `--panel2`, el fondo más apretado
  donde aparece. **Consecuencia asumida:** queda muy cerca de `--dim`, así que la
  jerarquía entre los dos la lleva ya el tamaño y la caja, no el color. El banco mide el
  contraste real con `getComputedStyle`, así que el umbral no se pierde en silencio.
- **M1** — cuatro causas de fallo al abrir, cada una con su frase y con qué hacer: no es
  JSON (casi siempre el CSV de puntos o el informe del escáner), es JSON pero no una pieza
  (`NotADocError`, tipo propio para que el motor no redacte texto de usuario), esquema
  desconocido, y roto por dentro —esta conserva la línea técnica, pero DETRÁS de la frase
  que dice qué pasó, no en su lugar. `openError()` se exporta y el banco comprueba que las
  cuatro dan textos distintos, y distintos en los tres idiomas.

Hechos también: **M8** y **M9**, los dos de entrada sin validar.

- **M8** — las etiquetas del 3D eran el ÚNICO innerHTML por donde entraba texto que no
  escribe el programa: el nombre de una cota, que llega de un `.json`. El color iba además
  dentro de un `style="background:…"`, o sea que una comilla se salía del atributo. Nuevo
  **`src/safe.ts`** —módulo hoja, sin dependencias, para que motor, 3D y paneles lo usen sin
  arrastrarse entre ellos— con `esc()` (la definición es UNA ahora; `panels/fmt.ts` la
  reexporta) y `safeColor()`, lista blanca de hexadecimal, que es lo único que este programa
  escribe nunca: todos los colores salen de un `<input type="color">`. El filtro de carga
  está en `fromDoc()`, el único sitio por donde pasan todos los documentos que se abren.
  **Bajo `file://` esto no es paranoia de servidor:** un `<img onerror>` colado por el
  nombre de una cota corre con acceso al disco del taller, y el `.json` va y viene por
  correo y por USB entre calidad y la máquina. Un `red` escrito a mano pierde el rojo y cae
  al color de reserva: es el precio de una lista blanca que se comprueba de un vistazo.
- **M9** — las claves de `data-*` las escribe este mismo programa, así que en marcha son
  buenas; el problema es que eso era una SUPOSICIÓN. El precio de equivocarse es una clave
  que nadie declaró dentro de `ST.comp`, o un NaN dentro de la geometría, que se propaga a
  las longitudes, a los PI y a la desviación sin un solo error en la consola. Las listas
  blancas se derivan de los `*_DEFAULT` congelados, no escritas a mano: una lista a mano se
  queda vieja el día que se agrega un campo, y lo hace en silencio. De paso, `onChange()`
  iba en **88 líneas**, sobre el límite de 60: repartido en seis grupos que devuelven si el
  evento era suyo.
- **`engine/csv.ts`** sale de `doc.ts`, que con M8 pasaba de las 400 líneas. No comparten
  nada: `doc.ts` habla de versiones del formato y de migraciones, el CSV habla de
  separadores y de columnas. Dependencia en un solo sentido, sin ciclo.

Y el último grupo: **M10**, **A2**, **A10**, **M14**, **M15**, **B2**, **B3**, **B4**, **B5**.

- **M10** — `cssVar()` llama a `getComputedStyle()` sobre `:root`, que fuerza recálculo de
  estilo. Dentro del bucle de la cinta eran hasta cinco por doblez —setenta y cinco en una
  pieza de quince— y la cinta se repinta con cada tecla que se toca en la tabla. Se leen una
  vez por repintado; el color sigue viniendo del CSS, que es la regla, y lo que cambia es
  CUÁNTAS VECES se pregunta. De paso `drawRibbon()` iba en 80 líneas: partido en
  `drawFrame()` (el armazón, que no depende de ningún doblez) y `drawColumns()`.
- **A2** — `gainR`/`gainF` existían en el motor desde el principio; lo que faltaba era DÓNDE
  tocarlas. El panel solo enseñaba «canto» y «plano», así que el 0.5 que nadie eligió era
  intocable desde el taller. Cada una aparece solo con su corrección encendida, y el porqué
  va en el tooltip y no en una línea de ayuda: en COMPENSAR cada línea de texto arriba son
  filas de comando que se dejan de ver. La rejilla pasa a `fgrid pair` por lo mismo, y con
  eso el bloque ocupa MENOS que antes aun con las cuatro ganancias.
- **A10 + B5** — los dos bancos llevaban la ruta de UNA máquina escrita a mano, la del
  navegador y la de la página: solo corrían en el portátil donde se escribieron, y el CI no
  habría podido ejecutarlos nunca. Nuevo `tools/edge.mjs`: `EDGE` manda sobre todo, y si no
  está se busca Edge, Chrome o Chromium en las rutas de las tres plataformas y en el PATH.
  De paso barre los perfiles huérfanos al EMPEZAR —había seis— en vez de insistir al
  terminar, que es cuando Edge todavía tiene archivos tomados.
- **M14** — las cuatro dependencias sin `^`. Con el rango, dos `npm install` en fechas
  distintas dan dos artefactos distintos y el diff de `index.html` en el CI sería ruido
  permanente. `engines: node >=22.18`.
- **M15** — el build compilaba con `legalComments: 'none'`, o sea que **borraba el aviso de
  copyright de three.js del artefacto**. Cada copia del HTML, la de Pages y la del USB, es
  una redistribución de three.js, y su licencia MIT pide que el aviso viaje con ella. Ahora
  es `'eof'`, hay `THIRD-PARTY.md` con el texto completo, y **el build FALLA** si el aviso
  no quedó dentro. **La licencia de BARCOMP sigue pendiente a propósito:** con qué licencia
  publica su trabajo el dueño del proyecto no es decisión de nadie más.
- **B2** — había CUATRO copias de `$()` con la misma firma por casualidad, no por contrato.
  Una sola, en `src/dom.ts`.
- **B3** — `parseFloat` se para en el segundo punto: «1.2.3» daba 1.2, o sea la celda se
  quedaba con un valor que nadie escribió. El trozo entero tiene que SER un número.
- **B4** — comentarios que remitían a `app.js`, `scene.js`, `ribbon.js` y `engine.js`;
  cabeceras que decían esquema `2.2` cuando `SCHEMA` es 2.3; la cuenta de claves de i18n
  (decía 169, son 239); las cifras del README.

**Deuda estructural: resuelta el 2026-09-08**, después de cerrar la fase. `i18n.ts` (518) y
`types.ts` (411) eran TABLAS DE DATOS y se partieron por su corte natural —idioma y
dominio— sin tocar una línea de lógica: `i18n/{keys,es,en,de}.ts` y
`types/{model,process,doc,state}.ts`, los dos con barril, así que nadie que importe nota el
reparto. De paso, los tres diccionarios se anotan ahora `Record<I18nKey, string>`: una clave
que falte en uno es un error de COMPILACIÓN, que era la promesa desde el principio y hasta
ahora solo la sostenía la prueba. Verificado quitando una clave a propósito.

`kinematics.ts` (490) **se queda, como excepción consciente y anotada en su cabecera.** No
tiene corte natural: `fk`, `ik`, `bendDecomp` y las longitudes comparten la convención, y
separarlos la deja escrita en dos sitios, que es justo el fallo que `SCHEMA_LEGACY`
documenta tres veces. Un refactor ahí no gana nada funcional y arriesga los números que van
a la máquina. Si algún día se parte, se parte como salió `feasible.ts`: por lo que ya se
está separando solo.

Redes al cerrar: `tsc` limpio, **261** pruebas de motor, **162** pasos de interfaz, build
reproducible con las cuatro dependencias fijadas.

### Fases siguientes (resumen)

- **Fase 1 · Ganancias rápidas** — 20 arreglos de esfuerzo S, casi todos [S]. Destacan:
  `File.text()`+`allSettled` en `io.ts` (hoy un CSV ilegible cuelga el lote sin avisar),
  sacar `commit()` del bucle de importación, guarda de θ en `trimOf`, enseñar
  `machineFeeds`, banco de UI portable, fijar exacto esbuild y typescript.
- **Fase 2 · Estructural** — ⛔ bloqueada hasta que lleguen los datos de
  `.auditoria/solicitud-datos.md`: mapeo de columnas del export real, prealineación al
  datum de ZEISS, **exportación de comandos a la máquina** (hoy no existe ninguna), CI que
  verifica el artefacto, medición de la flecha por gravedad.
- **Fase 3 · Cierre de beta** — pruebas de `history.ts`, resorte con n≥5 y dos niveles de
  ángulo, glifo de fuera de tolerancia.

### Diferido a después de beta 1.0

Cp/Cpk y cartas de control (necesitan ≥20 piezas, la beta verá 13), accesibilidad completa,
rendimiento de etiquetas 3D e `InstancedMesh` (medir antes de optimizar), pruebas de
`state.ts`, y **el extractor RANSAC de Python — no escribir una línea hasta saber si el
plan de inspección de ZEISS puede exportar los puntos de intersección directamente.**

### Los tres hallazgos que hay que tener presentes al tocar el motor

1. **Frontera ±90° de `canonRot`** — las estaciones de canto tienen eje absoluto exactamente
   90; el ruido cruza la rama, `canonRot` devuelve −90 con el ángulo negado, y `deviations`
   compara fila contra fila. Verificado: comando de 62.20° donde el nominal pide 25.
2. **`ik()` supone la nube en el origen sobre +x** — `F = eye()`. Una pose rígida cualquiera
   hace que el primer doblez absorba toda la desalineación: 41.15° donde el nominal pide 17.9.
3. **El lazo amplifica el ruido** — error residual ≈ ganancia × ruido. Con σ=1.0° el lazo
   **empeora** la pieza (0.38° → 0.80°). Con n=5 y mediana baja a 0.10°.
