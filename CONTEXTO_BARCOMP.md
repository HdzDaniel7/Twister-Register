# CONTEXTO — BARCOMP α (visor HTML)

> Documento para pasarle a Claude (o a cualquiera) antes de modificar este programa.
> **Lee primero `README.md`** —qué hace, cómo se usa, el mapa de archivos y el formato del
> JSON—; esto es lo que no se ve desde los archivos: invariantes, trampas y decisiones que
> no se revisitan. Los dos juntos, sin repetirse.

---

## 0. Regla número uno

**El HTML compilado NUNCA se edita a mano.** El build escribe dos copias del mismo archivo:
`index.html` en la raíz (lo que publica GitHub Pages, y lo único que va al repo) y
`web/barcomp_viewer.html` para abrirlo en local con doble clic.

Son ~822 KB con three.js empotrado. Editarlo directamente significa leer y reescribir 800 KB por
cada cambio, y el siguiente build borra todo lo que hayas hecho.

```
cd web && npm install                (solo la primera vez: three + esbuild)

Editar  web/src/*.ts  y/o  web/src/app.css
   →   cd web && npm run check        (tipos → motor → build → banco, de una)
```

**El motor es UNO**, `web/src/engine.ts`. Hubo un gemelo en Python que se retiró del alcance
el 2026-09-08; vive fuera de este repo, en `../BARCOMP Python/`, y **no se sincroniza ni se
cita en comentarios nuevos** —se quedó en `barcomp/2.2` y su `load_json()` nunca miró el
esquema, así que abre un archivo de hoy sin avisar de nada—. Quien vigila que los números no
se muevan en silencio es el fixture congelado de `web/test/fixtures/`.

Si solo tienes el `.html` y no la carpeta `web/src/`, **detente y pídele al usuario los archivos
fuente.** No intentes reconstruirlos ni parchear el HTML.

`web/node_modules/` está en `.gitignore`: si falta, `npm install` lo repone. El build no descarga
nada en tiempo de ejecución; la red solo hace falta para ese `npm install`.

---

## 1. Qué hace el programa

Qué es y para quién, en `README.md`. Lo que hay que saber aquí cabe en dos frases:

**Ajustar un ángulo mueve todos los dobleces posteriores.** La solución no es calcular ese
arrastre, es **compensar en el espacio de parámetros y regenerar la cadena completa**, con lo
cual el arrastre queda contenido en el modelo. Es la misma idea que sostiene el amarre y la
carga (§12, §13).

**Tiene que correr offline, con doble clic, sin instalar nada.** Esa restricción es dura y es
la razón de media docena de decisiones de abajo.

---

## 2. Mapa de archivos

**El mapa está en `README.md` › «Los archivos».** Aquí solo lo que el mapa no dice:

- Todo el visor es **TypeScript con `strict`**. `tsc` solo comprueba (`--noEmit`); quien
  empaqueta es esbuild y quien corre las pruebas es Node, que borra los tipos por su cuenta.
- Cuatro archivos son **barriles** —`engine.ts`, `scene.ts`, `panels.ts`, `app.ts`— que
  reexportan su carpeta, así que quien los importa no nota el reparto.
- `engine/lims.ts` son **LOS UMBRALES QUE JUZGAN**: rangos, saneado y por qué cada uno sigue
  siendo provisional. Se pasan por parámetro, nunca por global —`feasibility(model, lims)`,
  `parsePointsCsv(txt, lims)`, `csvScaleOk(pts, nom, lims)`, `measuredModel(nom, pts, lims)`—
  para que el motor siga siendo puro y las pruebas puedan mover un umbral sin tocar estado
  compartido.
- `src/safe.ts` y `src/dom.ts` son **módulos hoja, sin dependencias**, a propósito: los usan
  el motor, el 3D y los paneles sin arrastrarse entre ellos.
- `engine/section.ts` es **lo que la sección sabe de sí misma**: área, las dos inercias,
  cuánto asoma en una dirección, cuánto baja la cara de abajo y la fibra del esfuerzo. Las
  cinco juntas porque son las cinco que cambian con la FORMA —tubo, redondo— y repartidas se
  olvida la que no se tocó: la barra pesaría como un tubo y se apoyaría como un macizo. Tres
  de ellas eran la misma cuenta escrita tres veces, con tres nombres, hasta el 2026-09-17.
- `barGeometry()` vive en `scene/geometry.ts` y **no** en el motor: devuelve una
  `BufferGeometry`, así que depende de three.
- Ningún archivo de `panels/` ni de `scene/` importa de `app/`. Los paneles están por DEBAJO;
  donde hacía falta encontrarse, el sitio es `ST` (así viven los contadores en `ST.hist`).
- `tools/` está versionado. `demo_amarre.mjs` es el banco del amarre con las cifras a la
  vista; `strip_diff.mjs`, `export_surface.mjs`, `probe_perf.js` y `bundle_report.mjs` son
  **evidencia, no pruebas**.

### Por qué esbuild, y un detalle de three.js

El requisito duro es que el HTML abra con doble clic, offline, bajo `file://`. Antes eso
obligaba a Three.js r140, la última con build UMD; hoy lo resuelve el empaquetador.
esbuild se eligió por ser **una sola dependencia sin configuración**. Lo que **no** se puede
hacer: cargar módulos en tiempo de ejecución, pedir recursos por red o depender de un
servidor. Si algún día hace falta un asset (una fuente, una textura), va empotrado como data
URI dentro del bundle.

Dos detalles de la actualización de three que cuestan una tarde si se olvidan: desde **r152**
trabaja en linear-sRGB, y los colores semánticos (`devColor()`) hablan en sRGB, así que se
convierten con `setRGB(..., SRGBColorSpace)` o la escala verde→ámbar→rojo sale apagada; y
desde **r155** las luces son físicas, o sea que las intensidades van multiplicadas por π
respecto a las de r140.

## 3. El modelo de datos

**La cinemática está explicada en `README.md` › «Cómo está hecho»**: la terna LRA, la cadena
`T · Trans(feed,0,0) · Rot(n(rot), angle) · Rx(twist)`, que `rot` inclina el EJE y no rueda la
barra, que el eje se sostiene entre estaciones y que el signo del ángulo elige el lado. No se
repite aquí. Lo que sigue es lo que hay que tener delante para no romperla.

**Cuidado con mezclar las dos cosas: que el EJE acumule no significa que la SECCIÓN ruede.**
Si te ves aplicando `Rx(rot)` al marco y dejándolo puesto, has vuelto a `2.0`, que es lo que
costó una versión entera arreglar (ver §7.0). `twist` es lo ÚNICO que rueda la barra.

**`ANG_DIR` y `ROT_DIR` son independientes a propósito**, y las dos están en `-1`. Una máquina
puede tener cada eje montado al revés que la otra. Las dos entran por `bendDecomp()` —o sea
toda la cinemática— y salen por `ik()`, que es su inversa: **si tocas una sin la otra, la ida
y vuelta deja de ser exacta y la prueba de `fk↔ik` lo canta al instante.** La interfaz no
voltea nada: enseña lo que hay.

**El acumulado se envuelve con `wrapTurn()`, no con `wrap180()`**: media vuelta se escribe
**180** como en la máquina, y no −180. Las diferencias de MEDIDA sí usan `wrap180()`, donde el
signo distingue de qué lado quedó la pieza. Y `orientations()` mira el eje **ABSOLUTO**, no el
`rot` de la fila: confundirlos etiqueta media tabla al revés y elige la ganancia equivocada.

Cuatro esquemas han existido, y los mismos números describen otra pieza en cada uno:

| esquema | qué era `rot` |
|---|---|
| `1.0` | un doblez de canto, y `angle` con el signo contrario |
| `2.0` | un rodado de verdad: la sección salía girada del doblez |
| `2.1` | la posición ABSOLUTA del eje, declarada en cada fila |
| `2.2` | cuánto GIRA el eje; se sostiene entre estaciones |
| `2.3` | igual que 2.2, pero el ángulo y el rodado doblan al otro lado |

Los archivos anteriores se convierten al abrirlos pasando por sus PI (`migrateModel` +
`fkLegacy`), así que **no se aproxima nada**: la pieza que sale es la misma que describía el
archivo. Los Δ pendientes llegan en cero, porque son incrementos sobre parámetros que
cambiaron de significado. El `2.2` es la excepción y no se convierte: ver §11.

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
  —`axisAngles()`—, no el `rot` de la fila, porque el eje se sostiene entre estaciones. Sirve para
  etiquetar la tabla y elegir la ganancia; el resorte se aplica por orientación.
- Un PI sigue siendo **un vértice y por lo tanto un arco**: `radius` es el radio de esa herramienta
  circular. Con doblez puro de canto es exactamente el radio de rotación contra R. Con las dos
  componentes, `bendDecomp()` calcula el eje y el desvío total del arco compuesto.
- `twistLen` es **puramente geométrico**: no entra en `fk()` ni mueve ningún PI. Ver §4.

---

## 4. Funciones del motor

Todas puras y todas en `web/src/engine.ts`, que no toca el DOM.

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
| `placePath(M,samples)` | → `PathSample[]` | la trayectoria movida; la base solo con la ROTACIÓN |
| `sectionDrop(q,sec)` | → `number` | cuánto baja la cara de abajo bajo el eje neutro, a plomo |
| `pedestalFit(path,sec,ped)` | → `PedFit` | qué le pasa a un pedestal con la barra encima |
| `pedestalSpans(fits)` | → `number[]` | el vano de cada uno, ordenando por la BARRA no por la tabla |
| `seedPedestals(path,sec,n)` | → `Pedestal[]` | un fixture de partida que ya apoya |
| `readPointsCsv(txt)` | → `Vector3[]` | las TRES ÚLTIMAS columnas numéricas de cada línea |
| `piStep(pts)` | → `number` | paso medio entre PI consecutivos; media, no largo total |
| `csvScaleOk(pts,nom)` | → `boolean` | ¿la nube está a la escala del nominal? caza columnas de desviación y unidades equivocadas |
| `measuredModel(nom,pts)` | → `model` | pieza medida desde sus PI; radio y torsión del nominal |
| `statOf(v)` | → `{med,mad,sigma,n}` | mediana y MAD; un PI mal extraído no mueve la mediana |
| `bendStats(piezas)` | → `[{angle,rot,feed,n}]` | dispersión por doblez; llega hasta la pieza más LARGA |
| `medianPart(piezas)` | → `bends[]` | la pieza mediana del lote; se detiene en la más CORTA |
| `springback(muestras,ori)` | → `{W,T}` | `sb = 1 − medido/comandado`, con pendiente y r |
| `evalCell(texto,c,v)` | → número \| null | la celda de compensación; parser propio, sin `eval` |
| `toDoc` / `fromDoc` | → `doc` / estado | esquema `barcomp/2.4`; migra los anteriores al abrir |

`barGeometry(path, sec, devFn)` vive en `scene/geometry.ts`, no en el motor: devuelve una `BufferGeometry` y
por lo tanto depende de three.

### Las longitudes por fila

```
recta(i)  = feed(i) − trim(i) − trim(i−1)      con trim(−1) = 0
arco(i)   = radius(i) · θ(i)                   θ de bendDecomp()
cum(i)    = cum(i−1) + recta(i) + arco(i)
```

`feed` es de PI a PI y es el **estado**: es lo que se guarda en el JSON, lo que va en `command[]`,
lo que mueve `doFeed` y lo que sale hacia la máquina. La recta es de tangencia a tangencia y es lo
que consume la máquina.

**En la tabla la recta es lo único que se teclea de las longitudes; el avance ni siquiera aparece**,
al revés de como está guardado. `feedForStraight()` da la vuelta. Las columnas de lectura son `L`
(el arco, `radius · θ`) y `Σ L`. La regla de edición es que **las rectas mandan**:
cambiar `radius`, `rot` o `angle` deja todas las rectas donde estaban y recoloca los avances. Como
`trim` muerde por los dos lados, tocar el radio del doblez `i` mueve `feed(i)` y `feed(i+1)` —o la
cola, si `i` es el último—. Está en `editBend()` (`app/actions.ts`), con `TRIM_KEYS` como lista.

Solo se recolocan esas dos filas, no las quince: `feedForStraight(straightOf(x))` no devuelve
exactamente `x` en coma flotante, y recalcularlas todas en cada edición arrastraría una deriva de
~1e-13 por pulsación.

`rowLengths()` es el único sitio donde vive la cuenta. Estuvo copiada a mano en cuatro funciones
—`machineFeeds()`, `twistSpanOf()`, `buildPath()` y `bendStations()`— y era cuestión de tiempo que
divergieran. `bendStations()` quedó en una línea: `rows.map(r => r.cum - r.arc / 2)`.

Ninguna de estas magnitudes es estado nuevo: el JSON no crece por tenerlas y el fixture congelado
sigue dando los mismos PI.

### El arco de un doblez compuesto

`Ry(rot)·Rz(angle)` se traza como **un solo arco**, no como dos: una estación es
una herramienta. `bendDecomp()` lo parte en `Rot(eje, θ) · Rx(ψ)`, donde el eje
es perpendicular al eje de la barra — que es lo único que **no rueda la sección**.
Con una sola componente `ψ = 0` exacto; con las dos, `ψ` es el rodado residual
real de un doblez compuesto y se aplica de golpe al salir del arco.

Trampa: no vuelvas a trazar el arco como `Rx(φ)·Rz(θ)`. Sale la misma posición
pero la sección aparece girada a lo largo de todo el arco y se endereza de un
salto en el vértice. Hay una prueba que compara el marco final de `buildPath()`
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

Todo el estado vive en `ST` (`src/state.ts`):

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

`refreshTable()` en `app/render.ts` es el camino de las ediciones de la tabla de modelo:
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

Qué ocupa la pantalla en cada modo lo cuenta el README. Lo que importa al tocar código:
**`ST.mode` es lo primero que hay que mirar.** La clase de `#app` sale de ahí (`m-model`,
`m-meas`, `m-comp`), cada modo esconde lo que no usa y **su render se salta solo**.

**Compensar ES el modo taller**: si en pantalla no queda nada que no sea compensación, el
bloqueo no necesita interruptor. Cada vez que se añada una salvaguarda hay que preguntarse si
sobrevive a ese modo, que es el único donde se decide sobre material — C5 fue exactamente eso.

Los cajones flotan sobre el 3D, **FUERA de la rejilla**, para que abrirlos no la reparta otra
vez ni obligue a un `onResize()`. `Escape` sale primero de pantalla completa y luego cierra el
cajón, salvo si el foco está en un campo, donde Escape ya significa «descarta lo que escribí».

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

`paneModel()`, `panePoints()`, `paneMeas()` y `paneComp()` (en `panels/`) devuelven cadenas HTML.
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

Las escuchas globales están en `bind()` (`app.ts`), repartidas en `app/events/`. Para agregar un control, dale el atributo
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
(manejador `wheel` en `app/events/`). **Dentro de una tabla las flechas navegan**, así que ahí el
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

**Ni `scene/` ni `ribbon.ts` llevan colores propios**: los leen de `:root` con `cssVar()` en
tiempo de ejecución —fondo, niebla, los dos colores del `GridHelper`, el material de los pedestales,
el eje y las etiquetas de la cinta—. Un color nuevo se define en `app.css`, en los dos temas.
`applyTheme()` recoloca fondo y niebla sin reconstruir; la rejilla y los pedestales llevan el color
dentro del material, así que cambiar de tema hace `rebuildScene()`. `devColor()` se queda en el
motor: es semántico, no decorativo.

Sin `localStorage`, el tema y el idioma viajan en la clave **opcional** `ui` del JSON. Un archivo
sin `ui` no pisa lo que el usuario tenga puesto.

La **cinta inferior** (`drawRibbon`, canvas 2D) es el elemento distintivo: desenrolla la longitud
desarrollada y pone una columna por doblez coloreada por desviación, con la línea de tolerancia
punteada. Deja ver de un vistazo cuál doblez está fuera. Es clicable.

---

## 7. Trampas conocidas

0. **El eje acumula; la sección no rueda.** Es la trampa que ha costado una versión entera,
   así que va primero. `SCHEMA` es `barcomp/2.4` y la cinemática es la de 2.2:

       2.0  Rx(rot) · Rz(-angle)              la sección salía RODADA   ← mal
       2.1  Rx(rot) · Rz(-angle) · Rx(-rot)   solo se inclina el eje    ← bien
       2.2  lo mismo, pero con el eje ACUMULADO: rot es un incremento

   (a) Inclinar el eje NO es rodar la barra. Si dejas el `Rx(rot)` puesto en el marco, `rot`
   hace de twist y la pieza se retuerce. `twist` es lo ÚNICO que rueda la barra.
   (b) El EJE sí se sostiene entre estaciones, porque el proceso es secuencial. El eje real
   sale de `axisAngles()`, y `orientations()` mira ese eje absoluto: si lo haces mirar el
   `rot` de la fila, media tabla queda etiquetada al revés.
   `fkLegacy()` lleva las TRES cinemáticas viejas, incluida la 2.1 con su eje absoluto.

1. **No uses `localStorage` ni `sessionStorage`.** Falla en artefactos y no aporta nada aquí.
2. **No agregues CDNs, `fetch()`, ni imports externos.** Todo tiene que correr bajo `file://` sin red.
3. **Los ids de dataset y de variante son cadenas** (`'ds1'`, `'v1'`), no números. `===` siempre.
4. Los ángulos siempre por `wrap180()` al restar, o los cruces por ±180° dan diferencias falsas.
5. `orientations()` devuelve un arreglo del largo de `bends`; alinéalo bien al indexar tablas.
6. `EdgesGeometry(g, 28)` sobre la barra nominal da el alambrado. Bajar el umbral llena la pantalla
   de líneas y tira los cuadros por segundo.
7. **NO pongas `preserveDrawingBuffer: true` en el renderer.** Lo llevó hasta PERF-03 para que
   el reporte pudiera capturar con `toDataURL()`, y el precio era pedirle al navegador que
   conservara CADA fotograma para servir a una captura que ocurre una vez. `captureViews()`
   dibuja y lee **en la misma tarea**, que es lo que lo hace innecesario. Si vuelve, el banco
   lo caza: hay un paso que compara los cuatro PNG contra el tamaño del lienzo vacío.
8. Una pieza medida puede tener **menos dobleces** que el nominal: compara siempre sobre
   `min(a.length, b.length)`. Ya reventó una vez.
9. Editar puntos sobre una variante con Δ pendientes los **funde primero** (`bakeGuard()`
    pregunta). Sin eso, guardar el resultado en la base perdería los Δ sin avisar.
10. `ST.model` es una caché. Si tocas `ST.variants[...]` y no llamas `syncModel()`, la pantalla
    dibuja el modelo anterior.
11. La **colocación** es solo presentación, y la escena tiene **dos** grupos:

    - `world` — el taller: la cuadrícula del suelo y los pedestales. Matriz identidad, no se
      mueve nunca.
    - `root` — la pieza y todo lo que se mide contra ella. Su matriz es `placeMatrix()`.

    Mover o girar la colocación mueve la PIEZA sobre un suelo quieto, con la cámara donde estaba.
    Lo que dibujes va a `root` salvo que sea referencia del taller, y todo lo que proyectes a mano
    (etiquetas, encuadre, el indicador de ejes) se multiplica por `placeMatrix()`. Los pedestales
    son la excepción que confirma la regla: viven en `world` pero se levantan desde los PI **ya
    colocados**, para seguir a la pieza sin despegarse del suelo. `groupHost(capa)` dice de cuál
    de los dos cuelga cada capa, y el banco de pruebas lo vigila.
12. Al arrastrar **cualquiera de los dos tiradores** hay que llamar `onResize()`: el lienzo WebGL
    conserva su tamaño en píxeles y se monta encima del panel derecho o de la cinta. El
    `overflow:hidden` de `#ct` y el `ResizeObserver` sobre `#vpwrap` son los otros dos frenos.
13. El ajuste manual de la compensación guarda la **diferencia** contra lo calculado, no el valor
    absoluto: así sigue significando lo mismo si cambia la ganancia o la pieza medida.
14. La cuenta de la recta (`feed - trim(i) - trim(i-1)`) estuvo copiada en **cuatro** funciones a la
    vez. Ahora vive solo en `straightOf()` / `rowLengths()`, y `machineFeeds()`, `twistSpanOf()`,
    `buildPath()` y `bendStations()` la consumen. No la vuelvas a escribir a mano.
15. `Recta` es lo único que se teclea; `Avance` es de solo lectura. Pero **el estado sigue siendo
    `feed`**: es lo que va al JSON y a `command[]`. Al cambiar un radio o un
    ángulo se conserva la RECTA y se mueve el avance, nunca al revés. Si inviertes esto, la tabla
    deja de hacer lo que el usuario pidió.
16. `Recta` y su Δ trabajan sobre la **base**, como el resto de columnas editables; `Avance` y
    `Σ L` se leen del modelo **efectivo**. Sumar un Δ a `feed` suma exactamente lo mismo a la
    recta, porque los trims no dependen del avance: por eso el Δ de la columna de recta es el
    mismo `data-bd` con `data-k="feed"` de siempre, y la compensación no cambió nada.
17. Los campos numéricos declaran `step="any"` y llevan el paso en **`data-step`**. Con un paso
    real en `step`, el navegador marca inválido todo lo que no cae en su rejilla —con `step=".1"`
    un `17.905` es un error— y redondea al usar las flechas. `stepField()` lee `data-step`, y
    `nfield()` (`panels/fmt.ts`) es quien emite los dos atributos: úsalo en vez de escribir el
    `<input>` a mano.
18. Los valores de campo editable van por **`nx()`**, no por `fx()`: rellena a dos decimales y
    muestra el tercero solo cuando lo hay, así repintar no se come lo que alguien tecleó. `fx()`
    se queda para las celdas de lectura, donde el ancho fijo alinea mejor.
19. Enfocar un campo **selecciona su valor** y vaciarlo no escribe un `0`: se devuelve lo que
    había. Las dos cosas están en `bind()`, en `focusin` y al principio de `change`. El
    `preventDefault()` sobre el `mouseup` siguiente es lo que impide que el clic deshaga la
    selección; sin él, seleccionar al enfocar no sirve de nada con el ratón.
20. Con el tema en `system`, el CSS sigue solo a la preferencia del sistema pero **el lienzo WebGL y
    la cinta no**: hay un `matchMedia` en `app/theme.ts` que les avisa. Si se te olvida, el 3D se
    queda con el fondo del tema anterior.
21. **Las etiquetas del 3D también leen sus colores del CSS.** Llevaban un `#fff` a pelo para la
    seleccionada y era blanco sobre blanco en tema claro. El estado va por clase (`.lbl.sel`) y el
    color por token (`--lblTxt`, `--lblSel`), definidos en las dos paletas. Y la cota lleva su color
    de identidad en un punto, no en el texto: un color elegido sobre fondo oscuro se lava sobre
    fondo claro.
22. **Los vectores de desviación están acotados** al 6 % de la longitud desarrollada. Se dibujan
    ×exag para que una décima se vea, pero con la punta a 20 mm y ×25 salían barras de medio metro
    que tapaban la escena. La dirección se sigue leyendo; la magnitud la dan la tabla y el color.
23. **La celda de compensación es de hoja de cálculo**: un operador al principio opera sobre lo
    MOSTRADO (`v`), `c` es el cálculo del lazo y `=` fuerza absoluto. Antes `+2` iba sobre `c` y
    `-3` era el número −3, que no era coherente. Es lo único de la interfaz que cambió de
    significado, y está en el README.
24. **El lazo puede leer la mediana del lote** (`comp.batch`). Compensar desde una sola pieza mueve
    el comando por la dispersión de esa pieza; con varias, la mediana deja pasar solo lo que se
    repite. La columna ±σ de la tabla de desviación es lo que separa un doblez fuera de sitio de
    uno con mala puntería.
25. **El id de una variante es el ÚNICO id que sobrevive al documento.** Los de cotas,
    pedestales, pines y piezas medidas se reasignan al abrir (`setMarks`, `setPedestals`,
    `setPins`) y por eso `toDoc()` ni los guarda; el de la variante sí se guarda y sí vuelve.
    O sea que el contador de `newVid()` no puede salir de CUÁNTAS variantes hay: tiene que
    salir del MAYOR de los ids que hay. Salía del número, y `loadModel()` lo bajaba a 1 con
    «Demo»/«Nuevo», así que un documento con `v2` y `v3` —lo que queda al borrar el modelo que
    no es la referencia y duplicar otro— paría la copia siguiente como `v3`: dos tarjetas con
    el mismo id, `ST.ref` apuntando a las dos —las dos con la chapa de REFERENCIA y ninguna
    con el botón de fijarla, o sea la referencia dejaba de poder elegirse— y `varDelete()`
    borrando las dos de una, que filtra por id. Arreglado el 2026-09-17; `newVid()` además
    salta cualquier id ocupado, porque la invariante es el id único y no el contador.
26. **La forma de la sección cambia seis cuentas y ninguna más**, y están todas en
    `engine/section.ts`: área, las dos inercias, cuánto asoma, cuánto baja y la fibra del
    esfuerzo, más el contorno que dibuja el 3D. Lo que hay que saber antes de tocar nada:
    **el hueco no toca el contacto**. La función soporte mira el perfil EXTERIOR, así que un
    tubo apoya donde apoyaría el macizo del mismo tamaño —hay prueba en las 360 posiciones— y
    ni FIS-08 ni FIS-10 se enteran de que existe. Lo que el hueco cambia es lo que pesa y lo
    que resiste. Y **una redonda no tiene rodado útil**: `Iz = Iy`, así que `rot` sigue
    diciendo hacia dónde se dobla pero ya no cambia con qué resiste, y el retorcido no se
    puede observar. Eso se avisa en su pestaña, al lado del dibujo de la cara. Lo que NO choca con nada es la guarda del eje
    no observable (C1+A4): medido el 2026-09-18, esa guarda mide el PLANO del doblez, y el
    plano se lee de la línea media, que una sección redonda no borra. Lo que una redonda borra
    es el retorcido —trampa 27— y el par T/W: `orientations()` sale toda igual en una
    redonda, así que `compensate.ts` lee UNA constante y no dos. Repartir por una cara que
    `Iz = Iy` ya no distingue movía los dobleces hasta **4.10°** sobre el demo con `sbT=2` y
    `sbW=6`. La `T` no quiere decir «de plano» ahí: quiere decir «la única», y por eso la
    tabla pinta `Ø` y Medir y Compensar enseñan un campo en lugar de dos.
27. **La torsión viaja DENTRO de los puntos PI, no al lado.** `Rx(twist)` rueda el marco, así
    que el rodado de la estación SIGUIENTE se lee ya girado: 12° de torsión en la estación *i*
    y 12° menos de rodado en la *i+1* dan los mismos PI **hasta 1.5e-13 mm**. De unos puntos
    sueltos, entonces, no se puede sacar cuál de las dos fue — por eso `measuredModel()` y
    `migrateModel()` arrastran la torsión del nominal en vez de leerla. Lo que estaba mal
    hasta el 2026-09-18: `ik()` leía el rodado con el marco SIN rodar, se tragaba la torsión
    dentro del rodado, y encima se le volvía a pegar la del nominal. Contada dos veces. La
    pieza reconstruida se separaba **137.8 mm** de los puntos de los que salió, un `barcomp/1.0`
    torcido se movía **63.7 mm** al abrirlo, y en el visor un PI reescrito con su propio valor
    movía la pieza **129.4 mm**. Ahora `ik()` recibe las torsiones que ya se saben y aplica la
    misma `Rx` que `fk()`: es su inversa exacta otra vez. En una barra RECTANGULAR las dos
    escrituras se distinguen mirando la pieza, porque la cara cambia (`orientations()`); en una
    REDONDA no se distinguen ni mirándola.

28. **Un apoyo es una CARA, y hay UNA sola polilínea.** Dos trampas que salieron juntas al
    cerrar FIS-10b el 2026-09-18, y las dos muerden en silencio.
    *La cara:* la cuna no es un punto ni una sombra en planta. Es un rectángulo de `pad` × 44
    con su rumbo y su inclinación, y el hueco es la distancia con signo de la sección a ese
    rectángulo. De ahí salen tres cosas que sorprenden si se espera lo de antes: subir el
    pedestal δ cierra **δ·cos(tilt)** de hueco y no δ; el brazo de la palanca llega hasta
    donde la cuna toca —bajo una barra que baja, media cuna más allá del pie—; y `gap` deja
    de mirar la barra en cuanto se mete más que el radio de su sección, porque eso ya no es
    apoyo, es choque, y lo contesta `deep`.
    *La polilínea:* `PATH_SEG` es uno para todo el programa. La pantalla usaba 12 segmentos
    por arco y los solventes 8 —dos curvas distintas de la misma pieza, **25 µm** de
    diferencia— y a 6.16 N por micra eso son 150 N. Nadie lo veía porque cada mitad del
    programa era coherente consigo misma; se vio cuando un fixture sembrado a hueco cero
    llevaba **0.01 N** de una pieza de 23.7. Si alguna vez hace falta bajar la resolución del
    solver por tiempo, no se hace con un número suelto en su llamada: se hace sabiendo que
    quien siembre contra otra tiene que sembrar contra la misma.
29. **Lo que se siembra no se redondea, y una vuelta de corrección no basta.** Vale para el
    alto de un pedestal (FIS-10a) y para el sitio en planta de un poste (FIS-10c): dos
    decimales parecen una cifra de taller y son una precarga, porque el muelle de contacto
    vale **6.16 N por micra** y el redondeo deja hasta ±5 µm. Con la carga apagada no se nota
    nada —`restrain()` resuelve geometría— y con ella encendida el primer pin de la demo
    llevaba 8.83 N donde la pieza pide 6.25. Lo que sí se redondea es lo que está medido que
    no mueve el hueco: la inclinación de una cuna y el alto de un poste, porque los dos tocan
    por donde no cambia. Y la corrección contra la polilínea se ITERA: mover un pin una micra
    en planta no cierra una micra de hueco —lo cierra en la dirección en la que se tocan, y
    además cambia el punto más cercano—, así que una sola pasada dejaba 4.5 µm.

---

## 8. Antes de dar por terminado un cambio

```bash
cd web && npm run check            # typecheck -> pruebas -> build -> banco, de una
cd web && npm run typecheck        # tsc --noEmit, con strict
cd web && node test_motor.js       # 600 pruebas; todas deben pasar
cd web && node build.mjs           # regenera index.html y barcomp_viewer.html
cd web && node tools/ui_test.mjs   # 284 pasos de interfaz en Edge headless
cd web && node tools/demo_carga.mjs # κ contra una solución exacta, y el codo del hueco
cd web && node tools/demo_escala.mjs # dónde el solver de la carga deja de caber
```

Dos herramientas más, que no son pruebas sino evidencia:

```bash
node tools/strip_diff.mjs src/x.ts   # ¿el puerto a TS fue SOLO anotaciones?
node tools/export_surface.mjs        # los 165 exports del motor, con tipo y aridad
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

El criterio de aceptación del motor es el **fixture congelado** (`web/test/fixtures/`, C3): los PI
que salen hoy tienen que seguir saliendo mañana, hasta el último decimal. Sustituye a lo que antes
hacía `compare_engines.py` contra el motor de Python, y vigila lo mismo por una fracción del costo.
Si el fixture cambia, o rompiste la cinemática o subiste `SCHEMA` a propósito: no hay tercer caso.

Y abrir el HTML y verificar a mano lo que las pruebas no cubren: gira la vista, cambia de idioma y
de tema, recorre la tabla entera solo con el teclado, arrastra los dos tiradores hasta los
extremos, simula una pieza, aplica compensación, duplica un modelo y cámbiale un ángulo, prueba
los tres anclajes, inserta y borra puntos, genera el reporte.

Si agregas una función al motor, agrégale una prueba. `test_motor.js` importa `src/engine.ts` como
módulo ES —el mismo archivo que esbuild empotra en el HTML—, así que no hay copia que se
desincronice ni contexto `vm` que preparar.

---

## 9. Variantes y edición de puntos

> Aquí vivía «La versión Python». El motor gemelo salió del alcance el 2026-09-08 y vive
> fuera del repo: ver §0 y §11. Lo que sigue son dos mecanismos del MOTOR, vivos en el visor.

### Variantes: varios modelos comparables sobre un extremo común

Una **variante** es `{base, deltas, tailDelta}`:
los valores base más una columna de corrección por parámetro. El **modelo
efectivo** = base + deltas es lo único que ve la cinemática; `effectiveModel()`
lo arma y `bakeDeltas()` funde los deltas en la base. Separarlos permite
escribir la compensación al lado del dato sin perder el valor original.

`ST["variants"]` es la lista, `ST["active"]` la que se edita, `ST["ref"]` la
referencia y `ST["model"]` **es solo una caché** del modelo efectivo de la
activa: todo el código de dibujo y medición sigue leyendo de ahí. Después de
tocar una variante hay que llamar `syncModel()` o
la caché miente.

`anchorTransform(model, ref, mode)` es lo que hace comparable a dos variantes:

| modo | qué queda fijo | para qué sirve |
|---|---|---|
| `start` | el amarre (P0) | ya es común: `fk()` arranca todas en el origen. Es el orden físico del proceso. |
| `end` | el extremo **libre** | lleva el marco final de la variante sobre el de la referencia, así que la punta maquinada coincide en posición Y orientación y la divergencia se ve acumulándose hacia el amarre. Es el anclaje útil si el criterio de aceptación es la posición del extremo maquinado. |
| `best` | nada, reparte el error | Kabsch sobre los PI. |

`piShift()` devuelve cuánto se movió cada PI ya anclado; cuando el anclaje es
`end` las listas se alinean **por el final**, no por el principio.

### Edición de puntos: absoluta, no paramétrica

`movePi`, `insertPi` y `deletePi` trabajan en el espacio de los PI y
reconstruyen la cadena con `ik()`. Consecuencia deliberada: **mover un punto deja
los demás donde están** — se recalculan los avances y ángulos vecinos, no se
arrastra la cadena. Es lo contrario de editar un ángulo en la tabla LRA, que sí
hace girar todo lo que va después. Las dos semánticas son útiles y conviven.

Un punto insertado nace **colineal** (ángulo 0): es un punto de control listo
para moverse, no un doblez todavía. `ik()` no puede recuperar radio ni torsión
de los puntos, así que `modelFromPoints()` los arrastra por índice.

Editar puntos sobre una variante con deltas pendientes los **funde** primero
(el visor pregunta antes): la geometría efectiva es la que se está
tocando, y guardar el resultado en la base sin fundir perdería los deltas sin
avisar.

---

## 10. Estado del proyecto y qué falta

**En `README.md` › «Estado».** Es un alfa de demostración: `simulate()` es el único bloque
que inventa números y sigue ahí a propósito —es la única forma de contestar «con esta
dispersión de medición, ¿converge el lazo o se pone a oscilar?» antes de gastar material—,
etiquetado como lo que es. Lo que falta y en qué orden, y qué espera cada cosa, está en
[`.auditoria/plan-fases.md`](.auditoria/plan-fases.md).

Dos cifras de esa sección que conviene tener presentes al decidir cualquier cosa del lazo,
porque son medidas y no opiniones: corrigiendo **solo ángulos** la punta se estanca en ~5 mm
—el sesgo de rotación de ±0.35° se acumula a lo largo de la cadena— y con rodado y avance baja
a 0.17 mm; y la ganancia va de **0.6 a 0.8, nunca 1.0**, porque al 100 % el lazo oscila con el
ruido de medición.

---

## 11. Lo medido, lo decidido y lo descartado

Dos auditorías (2026-09-07 y 2026-09-10) y el alcance nuevo que pidió el taller dejaron
cifras que costaron una medición y decisiones que siguen gobernando el código. **Esto no es
un diario**: el relato de cada cambio está en su mensaje de commit, y el estado de las
tareas en `.auditoria/plan-fases.md`. Aquí solo lo que hay que tener delante para tocar el
motor sin deshacer una decisión sin enterarse.

### Decisión que manda sobre todo lo demás

**Los signos de ángulo y rodado actuales NO se tocan.** Funcionan contra valores de máquina
reales que no se pueden modificar. La corrección no es invertirlos: es **congelarlos en un
fixture de pruebas** para que ningún cambio futuro los mueva en silencio. Tocar `ANG_DIR` o
`ROT_DIR` obliga a subir `SCHEMA` y a regenerar el fixture a propósito.

De ahí sale la otra mitad: **un `barcomp/2.2` no se migra.** Del 2.2 al 2.3 no cambió ningún
número, cambió el motor —`bb76bde` invirtió `ANG_DIR` porque los datos del taller ya venían
con ese sentido—, así que convertirlo deshacía el cambio. `2.2` entra en `SCHEMA_AMBIGUOUS`:
se lee tal cual, sin tocar un número, y se avisa de que hay que mirar la FORMA en el 3D.

### Cifras medidas

Ninguna de estas se vuelve a sacar leyendo el código.

| Qué | Cuánto | Dónde se midió |
|---|---|---|
| Camino crítico con la pieza real | **14.3 ms** contra 250 ms de presupuesto | auditoría 09-10 |
| … pero eso mide la ESCENA: el amarre y la carga llegaron después | ver las dos filas de abajo | 09-19 |
| `settle()` con la carga puesta, 15 dobleces / 30 / 34 / 60 | **49 / 134 / 954 / 16 083 ms** | `demo_escala` |
| … y es el NÚMERO de dobleces, no lo juntos que vayan | 30 fijos, avance de 35 a 150 mm: **141–222 ms** | `demo_escala` |
| Arranque en frío, peor caso (Edge headless sin GPU) | **234 ms** | auditoría 09-10 |
| `rebuildScene()` con 13 piezas medidas visibles | **~18 ms**, 270 objetos | A8, medido y descartado |
| `rebuildScene()` con 15 dobleces / con 60 | **2.8 ms / 9.6 ms** | `tools/probe_perf.js` |
| Un paso de deshacer | **6 µs, 5.3 KB** | `tools/probe_perf.js` |
| Clave de `heldCache` | **0.006 ms** contra 14–100 ms del solver | PERF, 09-10 |
| Solver del amarre, una pieza | **3–26 ms** | banco del amarre |
| Amarre con 6 modelos, antes → después de PERF-02 | Node **73 → 51 ms**; Edge **82 → 55 ms**; repintado **122 → 86 ms** | PERF-02 |
| Etiquetas 3D por fotograma (15 etiquetas) | **0.13 → 0.07 ms** | PERF-03 |
| Bundle: parte de three.js | **71.5 %**, sin grasa | `tools/bundle_report.mjs` |
| Ruido del lazo: σ=1.0° | el lazo **empeora** la pieza, 0.38° → 0.80°; con n=5 y mediana, 0.10° | validación |
| Corrigiendo solo ángulos | ángulos a 0.15°, punta estancada en **~5 mm**; con rodado y avance, **0.17 mm** | validación |
| Eje no observable: casos inventados | **170 de 200** pasaban sin la guarda, 0 con el umbral puesto | C1+A4 |
| `GJ/EIz` para 40×12 | **1.22** (J = 18 684 mm⁴ por la serie exacta, Iz = 5 760 mm⁴, ν = 0.33) | FIS-07 |
| Punta sujeta solo con pines: muelle 0.5 vs 1.22 | **15.3 mm vs 4.8 mm**; esfuerzo 16 % vs 5 % del límite | FIS-07 |
| Con peso y apoyos, muelle 0.5 vs 1.22 | caída 0.0117 → 0.0207 mm, reacciones <5 % | FIS-07 |
| Servilleta de la carga, una estación | **0.229° de cedida, 2.00 mm de punta**, reacción `w·a/2`, a la quinta cifra | `demo_amarre` |
| Servilleta del CONTACTO: κ contra la solución exacta | δ predicho **1.9158e-4 mm**, medido 1.9159e-4; R 5.7208 N contra 5.7212 de la estática | `demo_carga` |
| Lo que κ le quita a la reacción | **K/(K+κJ²) = 7.6e-5**, o sea siete cienmilésimas | `demo_carga` |
| Hasta dónde la fórmula del muelle sigue al solver | **κ equivalente ≈ 16**, cuatro décadas por debajo de 1e5, con error < 0.5 % | `demo_carga` |
| Demo sembrada + carga: κ·pene | **21.6 N**, que es exactamente la mayor reacción; se hunde 3.5 µm | `demo_carga` |
| La demo llega a | **80.8°** de inclinación; el pedestal más empinado nace con la cuna a **−57.5°** y es el que más carga lleva | FIS-08, cerrado |
| Palanca hecha a mano | R = w·a²/2d = **15.89 N** contra 15.88 N del motor, raíz −3.16 N | X-04 |
| Palanca sobre la demo, pedestal suelto | **51 N** sobre una pieza de 23.7 N, raíz **−27.7 N** | X-04 |
| Fixture sembrado + carga, medido en planta (hasta 09-18) | **9.8 N** apoyos + 13.9 mordaza, `ok=false` | FIS-10 |
| El MISMO, medido contra la cara de la cuna | **26.8 N** apoyos, **−3.2 N** mordaza, `ok=true` en 4 vueltas | FIS-10b, cerrado |
| Rigidez de contacto sobre la demo | κ = **6 158 N/mm**, o sea **6.16 N por MICRA** de interferencia | `demo_carga` |
| Tubo rectangular 40×12 con 2 de pared | pesa el **40 %** del macizo y resiste el **73 %** (Iz 4 224 contra 5 760 mm⁴) | formas, 09-17 |
| Tubo redondo de acero Ø30×2 | **1.381 kg/m**, contra 1.38 de catálogo | formas, 09-17 |
| Redonda maciza Ø30 | A = 706.86 mm², I = 39 760.8 mm⁴ **iguales las dos**: no hay «de plano» ni «de canto» | formas, 09-17 |
| El hueco del pedestal empinado, pendiente (en planta) | **13.27 mm/grado** junto al contacto y **27.23** a una milésima: se doblaba | FIS-10b, la causa |
| El mismo hueco, medido contra la cara de la cuna | **−8.09 mm/grado** por los dos lados: liso | FIS-10b, cerrado |
| Subir el pedestal δ sobre una rampa recta | el hueco responde **−δ·cos(tilt)** exacto a 3e-14 | FIS-10b, `test_motor` |
| Dos resoluciones de la misma curva (pantalla 12 / solver 8) | **25 µm**, o sea 150 N a 6.16 N/µm | `PATH_SEG`, 09-18 |
| Dos columnas de apoyo en desacuerdo | a **0.9 mm** una decía «apoya» y la de al lado 0.00 N | X-05 |
| Interferencia con varios modelos, antes → después de FIS-08 | **149 de 270 casos, peor 82 mm** → **19 de 270, peor 14 mm** | FIS-08 |
| El mismo barrido con el apoyo medido como cara | **3 de 135 no caben** —peor 82.3 mm— y los 3 salen en la lista de choques | FIS-08, 09-18 |
| Primer tramo con entrada recta de 700 mm | **dos** pedestales a 0.00 N, indeterminados | X-02 |
| Una recta de 1700 mm decía «Peso: 0.0 N» | pesa **21.6 N** | X-06 |
| `--dim2` antes de A13 | 3.1:1 en oscuro y 3.2:1 en claro, bajo el 4.5:1 de WCAG 1.4.3 | A13 |

**La flecha por gravedad, con la pieza de demostración y el material provisional:**

| apoyos | peor flecha |
|---|---|
| 7 | 0.002 mm |
| 5 | 0.007 mm |
| 3 | 0.125 mm |
| 2 | 0.046 mm |

Dos órdenes de magnitud por debajo de la tolerancia de punto y tres por debajo de los 5 mm
de la punta. **La flecha no explica ese estancamiento**, que era la hipótesis de la
auditoría —al menos con una pieza que va mayormente de canto—, y E y ρ del aluminio son
buenos a un ±5 %, no a un factor 50. Lo que sí puede dar flecha del orden de la tolerancia:
una pieza que vaya de PLANO en un vano largo —once veces más con 40×12— o un fixture con dos
apoyos mal repartidos. Por eso el número se enseña **por tramo** y no como total.

**La torsión contada dos veces (2026-09-18).** `ik()` leía el rodado con el marco sin rodar,
así que la torsión se le colaba dentro del rodado, y `measuredModel()`/`migrateModel()` le
volvían a pegar encima la del nominal. Con una sola estación torcida 12° sobre el demo:

| por dónde se toca | separación antes | después |
|---|---|---|
| `measuredModel()` sobre sus propios PI | 137.8 mm | 4.3e-13 mm |
| abrir un `barcomp/1.0` torcido | 63.7 mm | 2.8e-14 mm |
| reescribir un PI con su propio valor, en el visor | 129.4 mm | 0 |

Y la cifra que obliga a arrastrar la torsión en vez de leerla: **12° de torsión en la
estación *i* y 12° menos de rodado en la *i+1* dan los mismos PI hasta 1.5e-13 mm**. Los
puntos no pueden separarlas; la pieza sí, si la sección no es redonda. Ver la trampa 27.

**La cara que una redonda no tiene (2026-09-18).** `orientations()` repartía cada doblez en
`W`/`T` por el eje absoluto, y esa letra elige el retorno elástico, el reparto del lote y la
ganancia del lazo. En una redonda `Iz = Iy`: la distinción no existe y las dos constantes
describen lo mismo. Con `sbT = 2` y `sbW = 6` sobre el demo, los dobleces se movían hasta
**4.10°** según qué letra les tocara. Ahora salen todas iguales y el motor lee un solo
número; en una rectangular no cambia nada, y hay prueba de que el 4.10° sigue ahí para que
la de la redonda no sea vacía.

**El apoyo dejó de medirse en planta (2026-09-18) — FIS-10b y lo que quedaba de FIS-08.**
Eran el mismo defecto: `pedestalFit()` buscaba el punto de la barra más cercano al pedestal
**en planta** y medía ahí la cara de abajo. Con un tramo casi a plomo la proyección en planta
de la barra es casi un punto, ese mínimo está mal condicionado, y el hueco dejaba de ser una
función lisa de las incógnitas. Ahora un apoyo es una **cara** —el rectángulo de la cuna, con
su rumbo y su inclinación— y el hueco es la distancia con signo de la sección a esa cara.

| Qué | Antes (en planta) | Ahora (contra la cara) |
|---|---|---|
| Hueco del pedestal empinado: pendiente aquí / a 1e-3° | 13.27 / 27.23 mm/grado: se dobla | −8.09 / −8.09: liso |
| La demo sembrada, con el peso puesto | 9.78 N apoyos + 13.89 mordaza, `ok=false` | **26.84 + −3.17**, `ok=true` en 4 vueltas |
| Afinar el paso de perturbación `H` | 1e-4° metía la barra dentro: 60.29 / −36.62 N | 0.02° → 25.83/−2.15 sin converger; **2e-4° → 26.84/−3.17 y converge**; de 2e-4 a 2e-5 no se mueve |
| Redondear el alto sembrado a centésimas | decidía la respuesta: 47.4 N sobre 23.7 | mueve **0.33 N** (27.17 contra 26.84) |
| Barrido de 135 casos contra el fixture | 149 de 270 atravesaban, el peor 82 mm, sin decirlo | 4 no caben, el peor 82.3 mm, **y los 4 lo dicen** |
| Amarre de 6 modelos sujetos | 55 ms | **98 ms**, sobre un presupuesto de 250 |

Lo que costó, y hay que saberlo antes de tocarlo:

- **`PATH_SEG` es uno solo.** La pantalla construía la polilínea con 12 segmentos por arco y
  los solventes con 8: dos curvas distintas de la misma pieza, **25 µm** de diferencia. A 6.16 N
  por micra eso son 150 N, y se veía al revés —un fixture sembrado contra la polilínea de la
  pantalla llevaba **0.01 N** de una pieza de 23.7— porque cada mitad del programa era
  coherente consigo misma. Ver `engine/kinematics.ts`.
- **El brazo de la palanca llega hasta donde la cuna TOCA, no hasta el pie.** Una cuna es una
  chapa de `pad` milímetros y debajo de una barra que baja toca por su canto de abajo, media
  cuna más allá. Con el pie a 100 mm de la estación el brazo son 130 y la reacción baja de
  15.89 N a 12.22. Medido con tres largos de cuna, la reacción sigue `w·a²/2·brazo` al 0.07 %.
- **El signo del hueco por debajo de 1e-9 mm es ruido, no información.** Un fixture recién
  sembrado deja los huecos en ±1e-14; preguntando `gap <= 0`, cinco de los siete pedestales
  entraban como activos y dos no, repartidos por el último bit. Con ese arranque la búsqueda
  devolvía **cero iteraciones** y la pieza entera colgando de la mordaza.
- **`gap` y `deep` son dos preguntas.** `gap` mide el APOYO y deja de mirar la barra en cuanto
  se mete más que el radio de su sección —21 mm en la de 40×12—, porque un trozo de barra
  pasado de largo no está apoyado: sin ese tope los apoyos pasan a llevar 0.00 N. Pero eso
  dejaba ciego el aviso de CHOQUE, que es la pregunta del taller antes de montar: una pieza
  clavada 82 mm dentro de un pedestal salía como «no toca». `deep` la contesta aparte.
- **La cuna que dibuja el 3D es la que mide la física**, y hay prueba de la identidad en las
  dos. Se dibujaba con `Ry(+tilt)`, que deja el eje largo con el seno cambiado de signo: bajo
  un tramo empinado la chapa de la pantalla apuntaba a **79°** de donde la cuenta la ponía.

**Y lo que NO se cerró:** el reparto sigue diciendo que los apoyos llevan 26.8 N sobre una
pieza de 23.7, con la mordaza tirando hacia abajo 3.2. Eso no es una precarga —sembrar sin
peso encima da 0.00 N, y hay prueba— sino el reparto de una barra empotrada en la mordaza y
posada sobre siete apoyos, que es hiperestática. La pregunta «¿cuánto lleva cada apoyo?» no
la puede contestar un fixture medido con flexómetro: 6.16 N por micra de alto.

**Y el TOTAL tampoco (2026-09-19).** Este párrafo decía, hasta ese día, que «la que sí se
puede contestar es cuánto llevan los apoyos EN TOTAL». Se dijo sin medirlo y es falso.
Medido en `tools/demo_carga.mjs` §6 y clavado en tres pruebas de motor:

| Qué se hace | Qué llevan los apoyos EN TOTAL |
|---|---|
| nada: los siete altos exactos | 26.8 N (la pieza pesa 23.7) |
| subir **un** pedestal 0.01 mm junto a la mordaza | 87.1 N |
| subir ese mismo 0.05 mm —un flexómetro— | **333.5 N**, con la mordaza tirando −310 |
| subir 0.05 mm el de la punta | 27.4 N |
| medir los siete altos a ±0.001 mm, 20 sorteos | entre 3.5 y 32.3 N |

La ley detrás: junto a la mordaza la barra es mucho más rígida que el muelle de contacto, así
que un δ de más no la dobla —no hay a dónde ceder— y entra ENTERO en el muelle, κ·δ. Lejos de
la mordaza cede antes la barra y el mismo δ casi no se nota. O sea que el total no es una
propiedad de la pieza: es la pieza más lo que el fixture le esté metiendo. Lo que sí sobrevive
a un flexómetro es el PESO —geometría y densidad— y si el fixture toca o no, que es geometría
y no fuerza. Está dicho donde lo lee el taller: el tooltip de la columna Reacción. Y lo que
hace falta para poder dar newton de verdad —cómo se ponen y con qué se comprueban los altos—
está pedido desde el 2026-09-19 en `.auditoria/correo-c-taller.md`, punto 1, redactado para
que «se ponen a ojo» cuente como respuesta válida.

**El poste sembrado dejó de redondear su sitio (2026-09-19) — FIS-10c.** Era el hermano del
hallazgo FIS-10 y quedó abierto a propósito dos días: `seedPins()` redondeaba `x` e `y` a
centésimas por el mismo motivo por el que el fixture redondeaba el alto, y mover el sembrado
de pines cambia las cifras del amarre, así que era una medición aparte y no un arreglo de
paso. Sin carga no se nota —`restrain()` resuelve geometría, no fuerzas—; con carga, κ vale
6.16 N por micra y el redondeo deja hasta ±5 µm.

| Qué | Con el redondeo | Sin él |
|---|---|---|
| Peor hueco de un pin recién sembrado, demo de 4 pines | 4.50 µm | **3.9e-14 mm** |
| Lo que lleva el primer pin con el peso puesto | 8.83 N | **6.25 N** — 2.58 N, el 41 %, los ponía el redondeo |
| Los mismos pines con los 7 pedestales debajo | 4.60 N | **0.62 N** |
| Amarre de 7 modelos sujetos | 125–133 ms | 123–147 ms: dentro del ruido, presupuesto 250 |

Dos cosas más, medidas:

- **El alto del poste SÍ se sigue redondeando**, y no es una inconsistencia: un pin a plomo
  toca la barra por su CUERPO, así que correr su punta cinco micras a lo largo de su propio
  eje no mueve el hueco ni un bit —1e-14 mm con el alto redondeado y sin redondear, en los
  tres pines de la demo—. Un alto con dos decimales es lo que se corta en el taller; una
  coordenada con doce es lo que se mete en el CAM.
- **Una vuelta de corrección no basta**, y por eso quedaban 4.5 µm. Mover el pin una micra en
  planta no cierra una micra de hueco: lo cierra en la dirección en la que se tocan, que solo
  es la normal en planta con la barra tendida, y al moverlo cambia además el punto de la
  polilínea que le queda más cerca. Iterando, los tres pines bajan a 1e-13 mm en **dos**
  vueltas.

Efecto lateral que hay que saber: el barrido de 135 casos de FIS-08 pasa de 3 piezas que no
caben a **4**. No es un fallo nuevo — la pieza sujeta se posa unas micras distinta y una que
estaba justo en el borde cruzó. Las 4 se avisan.

**Hasta dónde llega el solver de la carga (2026-09-19) — y qué era PERF-01.** El plan
esperaba desde el 09-10 una respuesta del taller —«¿cuántos dobleces tiene la pieza más
grande? si no pasa de ~30, PERF-01 se cierra sin tocar código»— para cerrar un hallazgo que
**no está escrito en ninguna parte**. PERF-01 nace colgando en `8759820`: se cita en las
preguntas abiertas y no hay hallazgo con ese código, ni en ese informe ni en el del 09-07.
Nueve días esperando una respuesta para cerrar algo que nadie podía leer. Medido ahora, en
`tools/demo_escala.mjs`, lo que debería haber sido su cuerpo:

| Dobleces en una barra de ~1.8 m | `buildPath` | Amarre | Carga | Vueltas |
|---|---|---|---|---|
| 15 — la del demo | 0.02 ms | 0.12 ms | **49 ms** | 4 |
| 22 | 0.05 | 0.21 | 95 | 4 |
| 30 | 0.04 | 0.20 | **134 ms** — el borde | 3 |
| 34 | 0.04 | 0.25 | **954 ms**, 3.8 × el presupuesto | 17 |
| 45 | 0.06 | 0.31 | 1 647 ms | 17 |
| 60 | 0.08 | 136 | **16 083 ms** | 100 |

Lo que se dispara es el solver de la carga y nada más: la escena y el amarre no se enteran
—`buildPath` sigue en centésimas de milisegundo a 60 dobleces— y el presupuesto de la casa
son 250 ms. Y no se dispara el TAMAÑO del problema sino la CONVERGENCIA: de 3–4 vueltas a
17 y luego a 100, porque los contactos se encienden y se apagan durante la búsqueda y con
muchas estaciones eso deja de asentarse. Por encima de ~34 aparecen además casos con
`ok = false`, o sea que el visor lo dice en vez de enseñar una cifra inventada.

**La explicación cómoda es falsa, y por eso se midió el control.** «Los dobleces juntos son
caros» suena bien y no se sostiene: con el NÚMERO quieto en 30 y el avance medio de 35 a
150 mm —la barra pasa de 1.0 a 4.6 m— el coste se mueve entre 141 y 222 ms, o sea nada. Y
al revés: 45 dobleces con los avances del demo, en una barra de 5.3 m, siguen costando
551 ms. **Manda el número de dobleces, no lo apretados que vayan.**

Lo que esto cambia fuera del motor: la pregunta al taller deja de ser cuánto mide la pieza
más grande y pasa a ser cuántos dobleces tiene (C.6 en `.auditoria/solicitud-datos.md`), y
sube a 🔴, porque si la respuesta pasa de 30 el visor con la carga puesta no es lento: es
inusable. Y lo que sí se puede hacer sin esperar al taller ya está hecho: por encima de
`LOAD_SLOW_BENDS = 30` la pestaña Amarre lo avisa con el interruptor **apagado**, que es
cuando sirve. No es un límite —el resultado por encima es igual de bueno—: es que una pieza
grande con la carga puesta se veía igual que un programa colgado. El ~30 que alguien escribió a ojo el 09-10 estaba bien puesto, por un motivo que
entonces nadie había medido.


### Decisiones que siguen gobernando el código

- **La corrección se busca en el ESPACIO DE PARÁMETROS**, no desplazando puntos: así lo que
  sale es una pieza que la cinemática puede describir, no una nube que ya no corresponde a
  ningún comando. Vale para el lazo, para el amarre y para la carga.
- **Con sección constante, la FORMA sujeta no depende de E.** El módulo elástico multiplica
  todos los pesos por igual y se cancela en el reparto. E hace falta para pasar de ángulos a
  ESFUERZO, no para saber dónde queda la barra — por eso la geometría se da con confianza y
  el esfuerzo lleva escrito que el material está sin confirmar. Hay prueba: cambiar E de
  69 000 a 200 000 MPa no mueve un PI ni 1e-9 mm, y el esfuerzo cambia en la razón exacta.
  **Con una fuerza aplicada, E deja de cancelarse**, y esa es la diferencia con `load.ts`:
  media E es el doble de caída. Hay una prueba de cada cosa y siguen siendo compatibles.
- **Los interruptores son interruptores de verdad.** Apagado, `restrain()` devuelve el MISMO
  objeto que entró y `settle()` devuelve `restrain()` sin tocar un número. Lo comprueban una
  prueba de motor y un paso de banco que comparan los PI uno a uno exigiendo diferencia
  **CERO**, no «pequeña».
- **El fixture se monta contra el nominal.** El anclaje, el pivote de la colocación y las
  variantes dibujadas se miden siempre contra la referencia **LIBRE** (`refModelFree()`,
  `placeAt()`). Si salieran de la sujeta se cierra un lazo: mover un pedestal cambia la
  referencia, la referencia cambia el anclaje y la barra entera se recorre por la pantalla —
  o, con el pivote, el navegador contesta con un desbordamiento de pila. **Pasó las dos
  veces** (T-01, y otra vez en `scene/build.ts`). Es la misma regla con dos caras.
- **El solver congela sus contactos contra la barra libre.** Un contacto que dependiera de la
  respuesta se muerde la cola y el jacobiano sale de ruido. Lo que sí se relee, y por eso
  existe `CONTACT_PASSES`, es dónde está la barra después de caer decenas de milímetros.
- **Lo que se ve es lo que se mide.** Hay UN interruptor, `Ver: Libre · Sujeta · Las dos`,
  que escribe `restraint.refHeld`. De él cuelgan las dos tablas, las cotas, la flecha, los
  colores del 3D, dónde nacen los pedestales y los pines sembrados, los puntos, las etiquetas
  y el encuadre. Se decide en un solo sitio, `shownModel()` en `state.ts`. Arranca en
  **sujeta**: con algo puesto, la barra que hay encima del fixture ES la sujeta. Elegir
  «libre» sigue valiendo y las dos tablas lo AVISAN, porque es una pregunta hipotética.
  No se mueven a propósito: la colocación y los apoyos (atornillados a la mesa; lo que cambia
  es su color), las coordenadas tecleables de Puntos (son el diseño) y la desviación de
  piezas medidas (se calcula contra el diseño).
- **Un umbral corrupto no apaga la guarda.** `limOf()` recorta al rango y manda al valor de
  fábrica lo que no sea un número finito: un `NaN` ahí no rechazaría NUNCA nada —toda
  comparación con NaN es falsa— que es el fallo exacto que estas guardas existen para evitar.
  Se recorta al TECLEAR y al ABRIR, en el mismo sitio. Lo mismo hace `normMat()`: `E` y
  `yield` no bajan de un mínimo físico, porque un cero convierte cualquier esfuerzo en
  «0 %», el mismo veredicto falso que el `NaN`; `rho` sí admite cero, que es como la flecha
  dice «falta el dato». `Number.isFinite` y no el global: `isFinite(null)` es `true`.
- **Los umbrales viajan en el archivo**, también cuando son los de fábrica. Un `.json` sin la
  clave no dice «los de fábrica», dice «no se sabe».
- **Los signos de la máquina invierten el ARCHIVO, no el motor.** `signAngle`/`signRot` se
  aplican al escribir el CSV; `ANG_DIR` y `ROT_DIR` siguen congelados. Hay prueba de que
  invertirlos no mueve un solo PI. Por eso son seguros.
- **El comando sale del COMANDO, no del nominal** (`commandModel()` con `ST.command`): en
  cuanto el lazo corrige algo, las rectas del comando dejan de ser las del nominal, y esa
  diferencia es el trabajo entero del programa.
- **La fila de la cola deja vacías las columnas que no le tocan**, no en cero: un cero en la
  columna del ángulo es un doblez de cero grados, o sea una instrucción. Y **la última
  columna del perfil no se puede quitar**: sin ninguna, `machineCsv()` volvería al perfil de
  fábrica y el panel enseñaría cero columnas mientras el archivo sale con cinco.
- **Un apoyo activo aporta `½·κ·(gap₀ + J·Δ)²`: las dos mitades o ninguna.** Con un apoyo que
  todavía no toca fuera del hessiano, el paso de Newton sale como si no existiera —la pieza
  vuela dentro del pedestal y la búsqueda se rinde sin moverse—; metido en el hessiano SIN su
  mitad del gradiente, pasa lo contrario y avanza micras por iteración. Los dos fallos
  costaron encontrarlos y están anotados en `load.ts`.
- **`root` negativo no es un error**: es la barra haciendo palanca sobre un pedestal, que
  lleva más que la pieza entera mientras la mordaza tira hacia abajo lo que sobra. Con una
  mordaza que aguanta cualquier fuerza, la suma de fuerzas se cumple por construcción, así
  que el residuo no se enseña; lo que se enseña es el SIGNO, con aviso bajo el −1 % del peso.
- **El alto sembrado no se redondea, y la reacción de UN apoyo no es un número de taller.**
  Con la carga puesta un apoyo es un muelle de κ = `CONTACT_K·E·I/L³`, que sobre la pieza de
  demostración vale 6 158 N/mm: **6.16 N por cada MICRA** de interferencia. `seedPedestals()`
  redondeaba el alto corregido a centésimas —parecía una cifra de flexómetro— y con eso
  sembraba ±5 µm de precarga, ±31 N que nadie puso; de ahí salían los 47.4 N sobre una pieza
  de 23.7 N de FIS-10. Sin el redondeo, 9.8 N. La inclinación sí se redondea: está medido que
  no mueve el hueco ni una micra. Y la consecuencia que hay que decir en voz alta: con esta
  sensibilidad, **la reacción de un pedestal suelto no se puede leer de un fixture medido a
  mano** — y desde el 2026-09-19, medido, tampoco su SUMA: subir un solo pedestal 0.05 mm
  junto a la mordaza lleva el total de 26.8 N a 333.5. Lo que sobrevive a un flexómetro es el
  peso de la pieza y si el fixture la toca o no. Ver «Y el TOTAL tampoco» más abajo.
- **Un solo predicado de «apoya»**, `bears(f, tol, carrying?)` en `engine/fixture.ts`. Por
  geometría: le pasa por encima y la cuna la toca dentro de `tol.point`. Con la carga
  resuelta manda la reacción: apoya el que lleva peso, y un apoyo ciego cae a la geometría
  porque por fuerzas no se puede juzgar. Lo usan la flecha y el color del 3D, que lo tenían
  escrito a mano cada uno.
- **El resorte tiene tres puertas y no se apaga poniendo ceros.** `SB_MIN_N = 5`,
  `SB_MIN_SPAN_DEG = 10` y `SB_MIN_PER_SIDE = 2` —el punto de palanca: cuatro piezas a 30° y
  una a 60° cumplen las dos primeras y sin embargo la recta la decide esa única pieza—. El
  resultado va en `SbFit.trend` y la pantalla dice QUÉ FALTA. Con tres puntos, puro ruido
  cruza `|r| > 0.6` cerca de una de cada tres veces. La MEDIANA del resorte no pasa por la
  puerta: estimarlo con lo que haya está bien, afirmar que depende del ángulo no.
- **`kinematics.ts` pasa de 400 líneas como excepción consciente**, anotada en su cabecera.
  No tiene corte natural: `fk`, `ik`, `bendDecomp` y las longitudes comparten la convención,
  y separarlos la deja escrita en dos sitios, que es justo el fallo que `SCHEMA_LEGACY`
  documenta tres veces. Un refactor ahí no gana nada y arriesga los números que van a la
  máquina.
- **`index.html` se versiona, y el CI lo compara SIN el sello de versión.** El sello es
  `git rev-parse --short HEAD` al compilar, o sea el commit ANTERIOR al que lleva el
  artefacto: no puede coincidir por construcción. Todo lo demás sí, y con eso se pillan los
  dos fallos reales —editar `index.html` a mano y commitear fuente sin recompilar—. `sucio`
  **sí** se compara: un artefacto publicado con «+sucio» se compiló sobre cambios sin
  confirmar. **Regla de flujo:** los dos commits de un cambio —la fuente y el «build:
  regenerar»— se empujan JUNTOS; el disparador evalúa la punta.
- **`migrateModel()` no se toca** aunque el dueño avise de que ya no tiene archivos viejos.
  Cuesta cero mantenerlo y su ausencia se paga con geometría equivocada y sin aviso.

### Probado y descartado, con el motivo

Sin esto alguien lo reintenta.

- **`rebuildGroup(k)`** — partir la reconstrucción de la escena por capas. Medido: ~18 ms con
  13 piezas contra 250 ms de presupuesto, factor 14 de margen. Optimizar lo que no duele, y
  encima añade un camino donde una capa puede quedarse vieja. **La medición quedó como paso
  de banco**, que además vigila que la escena no CREZCA al reconstruirla.
- **Cambiar el mecanismo de clave de `heldCache`** — ARQ lo pidió por coste, PERF lo midió en
  0.02 % del total. Gana la medida. De ARQ-04 sobrevivió solo la fuga de ranuras.
- **El arranque en caliente del solver** — haría que el mismo estado diera cifras distintas
  según por dónde se llegó (al deshacer, por ejemplo). En un comparador eso es peor que la
  espera.
- **Un tope de TIEMPO en el solver** — ya está acotado por iteraciones y pasadas; un tope de
  reloj haría que la misma pieza diera otra forma en un PC más lento. Y **resolver en
  diferido** enseñaría un momento formas viejas con cifras nuevas; las ediciones son
  discretas (Enter, clic), no continuas.
- **Sellar el artefacto con hash del contenido** — hace el build determinista pero pierde la
  trazabilidad a un commit, que era el motivo entero de C7. Y **sacar `index.html` del repo**
  deja al taller sin un HTML listo para copiar a un USB.
- **Cuatro intentos contra FIS-10**, todos con cifra y ninguno en el código: cuatro contactos
  por esquina (no converge y rompe FIS-08 con 1.31 mm); probar el tanteo cuando el paso no
  baja (sin efecto); partir el paso 30 veces en vez de 8 (dos iteraciones más, 47.6 N);
  sembrar con 10/20/50 µm de aire (tampoco converge; con 50 µm un pedestal lleva 55 N).
  **Los cuatro perseguían el diagnóstico equivocado** —«el gradiente por diferencias finitas
  no deja bajar a `GRAD_TOL`»—: los 47 N eran κ multiplicando el redondeo del alto sembrado,
  6.16 N por micra, y se fueron quitando el `toFixed(2)` de `seedPedestals()`. Queda abierto
  lo otro, que la búsqueda se rinda cuando partir el paso ocho veces no baja la energía.
- **Tres intentos más contra lo que quedaba (FIS-10b), el 2026-09-17**, ninguno en el código
  y todos contra el reparto bueno, que es 9.78 N en los apoyos y 13.89 en la mordaza sobre
  una pieza de 23.67 N: **test de razón** sobre el paso —cortarlo donde el primer contacto
  cambia de estado— muerde de verdad (la primera vuelta se queda en el 1.6 % del paso) y no
  mueve el resultado ni una centésima; **perturbar más fino** (H de 0.02° a 1e-4…1e-6) hace
  que la búsqueda se crea la rama local del codo y se meta dentro de los apoyos: 60.29 N
  arriba y **−36.62 N** en la mordaza, 7.1 µm de penetración; **caída por coordenadas** cuando
  Newton muere baja la energía pero no converge y el reparto vagabundea con el presupuesto de
  vueltas —13.68 N con 6, 27.00 con 25, 14.84 con 200— y el tiempo pasa de 16 a **1 916 ms**.
  El diagnóstico bueno está en el escenario 5 de `demo_carga`: el hueco se dobla antes de una
  milésima de grado y Newton da pasos catorce veces más largos que eso.
- **Consolidar los dos motores en uno** — revocado el 2026-09-08 en el sentido contrario:
  el motor de Python sale del alcance entero. Fusionarlos era caro y arriesgado; retirar uno
  no cuesta nada. **Lo que se pierde, dicho a las claras:** la verificación cruzada entre dos
  implementaciones independientes, que es más fuerte que un fixture —un fixture congela lo
  que HOY sale, y si hoy está mal, congela el error—. Se acepta porque los signos ya están
  congelados a propósito y porque `core.py` llevaba desde antes de la Fase 0 sin actualizarse:
  la red cruzada ya solo cubría la cinemática, no las guardas.

---

## 12. El amarre: la barra sujeta por pines

Alcance nuevo, fuera de la auditoría. La barra deja de estar libre en el espacio.

Un pedestal SOSTIENE y no impide nada; un pin **IMPIDE**. Con pines puestos, mover un ángulo
ya no mueve libremente lo que viene después: la cadena choca contra ellos, la pieza se queda
en una forma intermedia, y para quedarse ahí tiene que deformarse. Esa deformación no se
reparte por igual —se concentra donde los vanos son cortos— y si en algún punto pasa del
límite elástico, la barra no vuelve al soltarla: **la pieza que sale de la máquina no es la
que dice la tabla.**

El reparto entre estaciones lo decide la rigidez `EI/L`: doblar un tramo corto cuesta más,
así que la deformación se va sola a donde la barra es más flexible. Mínimos cuadrados
amortiguados, jacobiano numérico, sistema denso —treinta incógnitas como mucho— con
`solveDense()` en `engine/math.ts`.

Lo que hay:

- `engine/pins.ts` — `pinFit()` (dónde toca, qué hueco queda, si el pin llega a la altura de
  la barra), `restrain()` (la forma sujeta, el codo de cada estación, la curvatura, la
  tensión y el peor caso contra el límite elástico), `seedPins()` (siembra alternando de
  lado: todos del mismo lado dejarían la barra girar sobre ellos) y `sampleAt()`.
- Pestaña **Amarre** en Modelar: el interruptor, los ajustes del solver, el material, la
  tabla de pines y —la mitad que importa— **lo que el amarre le cuesta a la pieza**.
- Dos capas nuevas en el 3D: los pines y **la barra sujeta** sobre la libre.
- `ST.pins`, `ST.restraint` y `ST.mat` viajan en el JSON y entran en el deshacer.
- `ST.held` es CACHÉ, con firma de todo lo que entra en la cuenta. El solver construye del
  orden de cien trayectorias, así que no se puede llamar en cada repintado. `heldFor(slot,…)`
  y no una caché única: con la referencia comparable sujeta hay DOS formas sujetas vivas a la
  vez y una sola caché las haría turnarse.

**Lo que esto NO es, dicho antes de que alguien lo confunda:** no hay elementos finitos, ni
contacto con fricción, ni pandeo, ni torsión inducida por el amarre, ni plastificación
parcial de la sección. Es un modelo de vigas con codos elásticos en las estaciones que ya
existen.

**Los pines se inclinan, y por eso el contacto es 3D.** Mientras un pin era vertical bastaba
la planta —dos rectas verticales guardan la misma distancia a cualquier altura—. Con `tilt` y
`yaw` dos rectas cruzadas se acercan en UN punto, así que el contacto se resuelve entre el
segmento del poste y la polilínea de la barra (`engine/contact.ts`), y lo que asoma de la
sección se mide en la dirección en la que de verdad se tocan. Un pin a plomo da exactamente
lo de antes.

**Y el poste tiene dos cifras: LARGO (`Pin.h`) y ALTURA (`Pin.z`).** El largo es lo que mide
el cilindro; la altura es dónde ARRANCA su base sobre la mesa. Con una sola, subir un pin
obligaba a alargarlo, y alargándolo tocaba también por abajo. Lo que sostiene el poste a esa
altura **no se modela, y está dicho**: la cifra dice dónde está el cilindro, no de qué
cuelga. Consecuencia en el motor: «Llega» mira los DOS extremos, porque desde que la base se
levanta la barra puede pasar por DEBAJO igual que por encima.

**El fixture sujeta a TODOS los modelos visibles, no solo al activo.** Enseñar una sujeta y
otra libre no compara nada. Lo que NO cabe se dice: `Settled.clash`, aviso rojo en la tarjeta
del modelo y un rombo con los mm en el 3D. Los 19 casos de 270 que quedan no son
convergencia: son piezas que no caben.

**Cómo se comprueba sin creerse el comentario.** `npm run demo:amarre` corre cinco
escenarios con las cifras a la vista: la prueba de la servilleta (`codo = −δ`, error de
0.001° a 0.004°), que un pin **empuja y no tira**, el interruptor con los PI a cero, que el
material no mueve la barra, y que es falsable —apagar el pin que empuja tiene que cambiar el
resultado—. `ejemplos/` trae la misma pieza dos veces con una sola diferencia, el
interruptor, y su `README.md` lleva las cifras que tienen que salir.

**Dos fallos que cazó ese banco y que ninguna prueba anterior habría cazado:**

- **El contacto se buscaba sobre las MUESTRAS.** `buildPath()` no reparte ninguna a lo largo
  de una recta, así que un pin —o un PEDESTAL, el mismo fallo— en mitad de una recta larga
  daba como punto más cercano el final de esa recta, a medio metro, y de ahí salía que no
  tocaba. Ahora se proyecta sobre la polilínea: `engine/path.ts`.
- **El lado del pin se leía de la forma deformada.** Con un ángulo movido 3° la barra rebasa
  el eje del poste, la lectura se invierte y el solver cierra el contacto por la cara de
  atrás: una pieza que atravesó el pin, dada por buena. El lado pasa a ser DATO del fixture
  (`Pin.side`, con `auto` para lo de antes).

**Lo que falta:** el lazo de compensación sigue comparando contra la pieza LIBRE. Con el
amarre puesto eso corrige hacia una forma que la barra sujeta no puede tomar. Hacerlo bien
pide decidir qué es el nominal cuando la barra está sujeta, y esa pregunta es del taller.

## 13. La flecha por gravedad y la carga

Son dos archivos distintos, **complementarios y NO aditivos**, y el solapamiento está
declarado.

### `engine/sag.ts` — la flecha entre apoyos (M6)

Cada tramo entre apoyos como viga **biapoyada** (`δ = 5wL⁴/384EI`) y cada voladizo de punta
como **ménsula** (`δ = wL⁴/8EI`). Una viga continua sobre varios apoyos es MÁS rígida que una
cadena de tramos sueltos, así que esto **sobreestima**: el lado seguro, y evita decidir qué
apoyo es fijo y cuál desliza, que es un dato del fixture que nadie ha medido.

**La orientación manda más que el vano.** `I` no es una constante de la barra: de plano se
cuelga `(ancho/espesor)²` veces más que de canto —con 40×12, once veces—. `sagI()` proyecta
la vertical sobre las dos direcciones principales de la sección; con la barra a plomo
devuelve infinito, porque una columna no se cuelga.

La cadena de unidades está escrita en `lineLoad()` y comprobada contra algo que se puede
hacer a mano: la barra de 1.7 m pesa 2.2 kg. Sin eso el resultado sale mil o mil millones de
veces mayor y nadie lo nota.

### `engine/load.ts` — la pieza pesa

Lo pidió el taller: «algunos dobleces alejan la pieza de mis amarres, pero por gravedad
tiende a irse hacia ellos, no a quedarse en el espacio». Eran dos agujeros distintos:

· **La pieza no pesaba.** El amarre resuelve un problema geométrico, y ahí no hay fuerzas.
· **Y los contactos TIRABAN.** El amarre cierra el contacto como una igualdad: si un doblez
  alejaba la pieza de un pin, el solver la traía de vuelta. Un poste no tiene imán. Eso no
  es una imprecisión, es el signo cambiado.

Se minimiza la energía potencial total —muelle de las estaciones, más el trabajo de la carga,
más un muelle de contacto que SOLO empuja— con las mismas incógnitas del amarre, así que lo
que sale sigue siendo una pieza que la cinemática sabe describir. Los pedestales entran en la
cuenta por primera vez: sin fuerzas no sostienen nada. Newton amortiguado; `settle()` plantea
el problema y junta el resultado, y `touches()`, `equilibrium()` y `reactions()` hacen los
tres trabajos sobre un `Problem` compartido.

**Las dos cifras que hay que leer** no están en la tabla de pines: son cuánto del peso llevan
los apoyos y cuánto se queda aguantando la mordaza. Si la segunda se lo lleva casi todo, lo
que hay en pantalla es un voladizo y no una pieza montada — que es la pregunta «¿me hacen
falta pedestales?» contestada con un número en newton en vez de con una opinión. La suma de
reacciones más lo que aguanta la raíz da el peso, siempre, y contra ese invariante hay prueba.

**El muelle de contacto está validado contra una solución exacta, no contra sí mismo.**
`CONTACT_K = 1e5` no es rígido: cede δ y con eso descarga la estación. De minimizar
`½K·u² + Q·u + ½κ(J·u)²` sale `u = −Q/(K+κJ²)`, `δ = |J·u|` y `R = κ·δ`, o sea que la
penetración residual es **una cifra predecible, no un artefacto**. `npm run demo:carga` monta
el caso de un grado de libertad —barra recta, una estación, un pedestal— cuya reacción sale
de la estática de sólido rígido (`R∞ = w(L−a)²/2d`) y compara: δ predicho 1.9158e-4 mm contra
1.9159e-4 del solver, y κ le quita a la reacción exactamente `K/(K+κJ²) = 7.6e-5`. Lo que
manda no es κ sino **κJ²/K** —cuántas veces más rígido es el muelle que la pieza en esa
incógnita—, y como J es el BRAZO, acercar el apoyo a la estación es bajar κ: así se barren
cuatro décadas sin tocar la constante. La fórmula sigue al solver con error < 0.5 % hasta un
κ equivalente de ~16; lo primero que se rompe no es el muelle sino que `gap` sea lineal en
`u`. Consecuencia para FIS-10: la penetración **no** es la causa de que los apoyos sumen el
doble del peso.

**El punto ciego, escrito antes de que alguien lea un cero:** las incógnitas son los codos de
las ESTACIONES, así que **una recta no se cuelga por el medio**; esa parte la da `sag.ts`,
aparte y al lado. Hay una prueba que lo afirma en positivo, para que la limitación sea un
hecho conocido y no un descubrimiento. Y la rigidez de una estación se toma como `EI/L`, que
para un voladizo es unas cuatro veces más blanda que la exacta: esto da el ORDEN y la
DIRECCIÓN, no una flecha certificada. **Un apoyo puesto en el primer tramo lee 0 N** —ese
tramo no se mueve y en este modelo lo que no se hunde no empuja—; también hay prueba.

## 14. Los tres hallazgos que hay que tener presentes al tocar el motor

1. **Frontera ±90° de `canonRot`** — las estaciones de canto tienen eje absoluto exactamente
   90; el ruido cruza la rama, `canonRot` devuelve −90 con el ángulo negado, y `deviations`
   compara fila contra fila. Verificado: comando de 62.20° donde el nominal pide 25.
2. **`ik()` supone la nube en el origen sobre +x** — `F = eye()`. Una pose rígida cualquiera
   hace que el primer doblez absorba toda la desalineación: 41.15° donde el nominal pide 17.9.
3. **El lazo amplifica el ruido** — error residual ≈ ganancia × ruido. Con σ=1.0° el lazo
   **empeora** la pieza (0.38° → 0.80°). Con n=5 y mediana baja a 0.10°.
