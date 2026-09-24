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
  desarrollada acumulada), las dos de solo lectura, y en el pie la cola —que se
  teclea ahí, en la misma columna y en la misma unidad— y el total. El `Avance`
  de PI a PI sigue siendo lo que se guarda y lo que se manda a la máquina, pero
  se calcula por debajo: cambiar un radio o un ángulo **deja las rectas quietas
  y recoloca los avances**, que es como se piensa en el taller.
- **La tabla cuadra hacia abajo.** Cada columna editable va sobre la base con su
  `Δ` al lado, y la suma de las dos es la pieza que se dibuja. Con la `Recta`
  eso obliga a que su `Δ` esté en **milímetros de recta y no de avance**: la
  recta no es un campo guardado, sale del avance menos los dos trims. Un `Δ`
  de ángulo o de radio no la mueve: recoloca el `Δ` del avance para dejarla
  donde estaba, lo mismo si se teclea en la columna del `Δ` que en la base,
  porque el avance es lo que se guarda y lo que va a la máquina.
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
  que separa un doblez sistemáticamente fuera de uno con mala puntería. Y
  **«Aplicar» pide al menos tres piezas en el lazo** (`LOOP_MIN_N`): con menos,
  el botón está apagado y la pantalla dice cuántas hay y cuántas hacen falta.
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
- **La carga**: la pieza pesa, y se cae hacia donde tira la gravedad hasta que
  algo la para. Los apoyos EMPUJAN pero no TIRAN, así que si un doblez separa la
  pieza de un pin, se separa — y si el peso la devuelve a él, vuelve. Cada apoyo
  dice con cuántos newton está trabajando, y dos cifras contestan la pregunta
  que importa: cuánto del peso llevan los apoyos y cuánto se queda aguantando la
  mordaza. Si es lo segundo, lo que se está mirando es un voladizo y faltan
  pedestales. Se puede apuntar la carga a donde se quiera —o añadir un empuje en
  la punta— para probar si un amarre concreto aguanta. Un apoyo se modela como
  un muelle que solo empuja, y **lo que ese muelle deja hundirse está
  contrastado contra un caso resoluble a mano** —viga con muelle rígido, un
  grado de libertad—: la penetración residual es `R/κ`, sale a cinco cifras, y
  con la rigidez de fábrica son 0.19 µm. `npm run demo:carga`.
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
- **Reporte del modelo**, imprimible y guardable: el nombre en grande, la ficha de
  la referencia, tres vistas (ISO, planta y frente) y luego **la misma tabla tres
  veces** — el modelo sin compensar, solo las compensaciones, y la suma de las dos.
  Cada una acaba en una fila TOTAL, así que la de la primera más la de la segunda
  tiene que dar la de la tercera; y cada modelo encendido se lleva su bloque de
  columnas, de modo que dos modelos se leen lado a lado en las tres. Cuando todos
  pintan lo mismo —lo normal en la primera, porque las variantes son Δ sobre una
  base común— esa tabla colapsa a un solo bloque en vez de repetir la misma
  columna una vez por modelo. Se abre a pantalla completa SOBRE la aplicación, no
  en una ventana nueva: en un teléfono el navegador bloquea la emergente y no
  quedaba forma de ver el reporte. Se lee igual en un teléfono que en el PC, y su
  barra —que se queda pegada arriba— cierra, manda a la impresora o a «Guardar
  como PDF», y guarda el HTML con las fotos dentro, que es como se lleva a otra
  parte desde el móvil. No habla de máquina ni de la pieza medida: el comando sale
  por su botón, en CSV, que es lo que come la dobladora.
- Exportar CSV de puntos, y todo en **español, inglés y alemán**. La paridad de los
  tres idiomas es un error de compilación, no una prueba en tiempo de ejecución.

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

**En un teléfono se apila.** Por debajo de 760 px de ancho los tres modos se
reparten igual: cabecera, 3D, el panel del modo y la barra de estado, cada uno a
todo el ancho. La cinta se esconde —en 390 px son cuatro píxeles por doblez— y
con ella los dos tiradores, que se arrastran con el ratón. La barra de vista y
la de estado pasan a un renglón que se desliza con el dedo, y los cuatro menús,
el tema y el idioma se van detrás de un **☰** a un cajón a todo el ancho, con su
botón de volver. Los controles suben a 34 px de alto, que es el mínimo con el
que un dedo no falla.

**Y el teclado no se lleva la pantalla por delante.** Al abrirse, el teclado de un
teléfono no encoge la página: la tapa y el navegador panea hasta el campo enfocado, con
lo que la cabecera con la barra de menús se iba por arriba en cuanto tocabas una celda.
El `<meta name="viewport">` lleva `interactive-widget=resizes-content` y `#app` mide
`var(--appH,100dvh)`, con `--appH` puesto desde el `visualViewport` donde esa bandera no
se entiende: la página cabe en lo que deja el teclado y no hay nada que panear. Y como
el teclado de cifras no trae signo menos —sin él no hay compensación negativa, que es la
mitad del oficio—, sobre un campo que admita negativo sale una tecla **±** que le cambia
el signo.

Lo decide `ST.phone`, que pone un `matchMedia('(max-width:760px)')`, y no una
`@media` del CSS: lo que cambia no es solo el reparto sino lo que se pinta —los
menús pasan a un cajón—, y una consulta de medios no se puede forzar desde
dentro de la página, así que el diseño de teléfono se quedaría entero fuera del
banco. Colgado de la bandera, el banco lo enciende y lo mide.

### Los archivos

Todo es **TypeScript con `strict`**, y `tsc` solo comprueba: quien empaqueta es
esbuild y quien corre las pruebas es Node, que borra los tipos por su cuenta.
Los cuatro barriles —`engine.ts`, `scene.ts`, `panels.ts` y `app.ts`— reexportan
su carpeta, así que quien los importa no nota el reparto.

```
web/
  src/engine.ts     EL MOTOR, barril de engine/. Sin DOM. 165 exports.
    engine/math.ts        matrices, wrap, PRNG
    engine/bend.ts        el doblez y su normalización
    engine/kinematics.ts  fk · ik · bendDecomp · buildPath · rowLengths
    engine/model.ts       variantes, deltas, edición de puntos PI
    engine/feasible.ts    lo que la máquina NO puede hacer aunque cierre la geometría
    engine/lims.ts        los umbrales que juzgan un dato, y por qué son provisionales
    engine/fitting.ts     Kabsch, anclaje entre modelos, colocación y el marco de una estación
    engine/compensate.ts  pieza simulada, lazo, desviaciones, lote, resorte
    engine/expr.ts        la celda de compensación (parser propio, sin eval)
    engine/machine.ts     el comando que sale a la dobladora: columnas, unidades, signos
    engine/doc.ts         esquema barcomp/2.5, migración de archivos anteriores
    engine/csv.ts         la nube de PI: lectura tolerante y escritura
    engine/section.ts     LO QUE LA SECCIÓN SABE DE SÍ MISMA: área, inercias, cuánto
                          asoma, la fibra del esfuerzo. Un solo sitio, y es donde
                          entrarán el tubo y el redondo
    engine/fixture.ts     los pedestales: dónde apoyan, qué hueco dejan, qué vano queda
    engine/pins.ts        EL AMARRE: la forma que toma la barra sujeta y lo que le cuesta
    engine/load.ts        la carga: el peso propio contra apoyos que empujan pero no tiran
    engine/sag.ts         la flecha por gravedad entre apoyos
    engine/step.ts        el archivo STEP: el sólido, más el eje y los PI de referencia
    engine/brep.ts        LA PIEZA COMO SÓLIDO: planos, cilindros y toros escritos a
                          mano, sin núcleo geométrico. Es lo que lee cualquier CAD
    engine/path.ts        mirar la barra donde NO hay muestra: sampleAt, nearestOnPath
    engine/contact.ts     distancia entre segmentos
  src/app.ts        arranque y cableado; el resto en app/
    app/render.ts · app/theme.ts · app/actions.ts · app/files.ts · app/history.ts
    app/events/{click,change,keyboard,grips}.ts
  src/scene.ts      three.js, barril de scene/
    scene/stage.ts · geometry.ts · layers.ts · build.ts · view.ts
  src/panels.ts     la interfaz, barril de panels/ (cadenas de plantilla)
    panels/{fmt,shell,left,focus,model,points,meas,comp,status,render}.ts
    panels/{fixture,pins,lims,mach,section}.ts   las cinco pestañas de Modelar
                                        section.ts dibuja la cara de la barra
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
  test_motor.js     773 pruebas del motor y del i18n, en Node y sin navegador
  tools/            banco de interfaz por CDP y las sondas de medición
index.html          SALIDA GENERADA — no se edita a mano
```

El refactor v4 dejó todos los archivos por debajo de 400 líneas y las funciones
por debajo de 60: `rebuildScene()` eran 248 líneas y ahora son diez capas con
nombre; `bind()` eran 286 y ahora es una lista de llamadas. **Hoy ese límite ya no
se cumple** y conviene no creerse lo contrario: a 2026-09-15 lo pasan
`engine/load.ts` (776), `engine/pins.ts` (760), `state.ts` (629),
`engine/kinematics.ts` (508), `scene/layers.ts` (471), `app/events/change.ts` (436)
y `app/actions.ts` (424), además del banco `tools/probe_ui.js`. En los dos
solvers la mayor parte es la explicación de la física, que no se recorta para
cumplir una cifra; lo que sí se parte es lo que mezcla trabajos, como
`settle()` en `solveContacts()`, `touches()`, `equilibrium()` y `reactions()`.

---

## Desarrollo

```bash
cd web
npm install          # una sola vez: three + esbuild
npm run check        # typecheck -> pruebas -> build -> banco de interfaz
npm run typecheck    # tsc --noEmit, con strict
npm test             # 773 pruebas del motor y del i18n
npm run build        # regenera index.html (y web/barcomp_viewer.html en local)
npm run test:ui      # 309 pasos de interfaz en Edge headless, por CDP
npm run demo:amarre  # cinco escenarios del amarre, con las cifras a la vista
npm run demo:carga   # el muelle de contacto contra una solución exacta, y el codo
                     # del hueco que impide cerrar FIS-10b
npm run demo:escala  # cuántos dobleces aguanta el solver de la carga
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
está hecho el bundle. Hoy: `rebuildScene()` 0.70 ms con 15 dobleces y 2.00 ms
con 60 (antes de que los puntos PI compartieran una esfera y de reescribir la
soldadura de aristas del alambre sin cadenas de texto, el 2026-09-22: 2.70 y
9.30 ms), sin fugas de geometría —diez piezas medidas en pantalla usan 14
geometrías en GPU, antes 200, aunque las llamadas de dibujo siguen en 200—,
cero cuadros dibujados en reposo, y un paso de deshacer cuesta 6 µs y 5.3 KB.

**`index.html` es un artefacto compilado de ~872 KB con three.js empotrado, que es
lo que sirve Pages. Nunca se edita a mano: el siguiente build borra el cambio.**
Se edita `web/src/`.

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
trim(i)    = radius(i) · tan(θ(i)/2)              θ de bendDecomp(), sobre el CENTRO
Recta(i)   = el tramo recto, tangencia a tangencia   ← se teclea
R_fibra(i) = radius(i) − (0.5 − K)·t_ef(i)           el radio de la FIBRA NEUTRA
L(i)       = R_fibra(i) · θ(i)                       ← el arco, sobre la fibra
Σ L(i)     = Σ L(i−1) + Recta(i) + L(i)
feed(i)    = Recta(i) + trim(i) + trim(i−1)          ← por debajo, no en la tabla

Cola     = tail − trim(último)                     ← se teclea, en el pie
Σ L final = Σ L(último) + Cola                     ← la longitud desarrollada
```

`Recta` es el material que de verdad sale recto y es lo único que se teclea de
las longitudes. `L` es el material que sale curvo, contado sobre la FIBRA
NEUTRA y no sobre el centro de la sección —ver más abajo—. `Σ L` los va
sumando —recta, arco, recta, arco— y al final, con la cola, da la longitud de
corte: el trozo de barra que hay que cortar.

El **avance** de PI a PI ya no está en la tabla. Es la geometría del CAD —donde
se cruzarían las rectas si el doblez fuera una esquina viva— y el doblez le come
un `trim` por cada lado; de ahí que no coincida con la recta.

La **cola** se teclea en el pie, bajo `Recta`, y también de tangencia a
tangencia. Hasta el 2026-09-22 se tecleaba en la cabecera y de PI a PI, así que
la palabra «Cola» nombraba dos números: el campo decía `160.00` y el pie
`154.66`, que es la misma cola menos el `trim` del último doblez. Quien sumaba a
mano el último `Σ L` más la cola del campo se iba **5.34 mm** por encima de la
longitud desarrollada, sin que nada estuviera mal calculado.

Y la columna del `Δ` de la `Recta` lleva **milímetros de recta**, no de avance,
porque la recta no se guarda: sale del avance menos los dos trims. Hasta el
2026-09-22 por la tarde eso significaba que un `Δ` de ángulo movía **dos**
rectas —la suya y la de al lado— sin tocar ni un avance: con el `Δ` del avance
en esa columna, un `Δ` de 1.5° en B5 dejaba la columna en cero mientras las
rectas de B5 y B6 se acortaban **0.869 mm** cada una, y `Σ L` subía 0.869 menos
de lo que sumaban la recta y la `L` de esa fila. Pedido del taller, literal:
«mi tabla se debería de conservar con los ajustes que yo dé». Ahora un `Δ` de
un parámetro de trim —ángulo, radio— CONSERVA las rectas y recoloca el `Δ` del
avance para absorber el cambio, lo mismo si se teclea en la columna del `Δ`
que en la **base**. Con ese mismo `Δ` de 1.5° en B5 las rectas de B5 y B6 quedan
quietas al 1e-9 y el precio son 0.869 mm de `Δ` de avance en cada una de esas
dos filas; ninguna fila ajena toca su avance, y la barra de corte —que antes,
con las rectas comiéndose el trim, MENGUABA 0.560 mm— ahora CRECE 1.178 mm,
que es el doblez más grande llevándose más barra. Se teclea el `Δ` de la recta
y se guarda el `Δ` del avance, igual que arriba se teclea una recta y se
guarda un avance. Una clave que no mueve el trim —`twist`, `twistLen`— entra
por el camino corto y no recoloca ningún avance.

### `L` y `Σ L` van sobre la FIBRA NEUTRA

Desde el 2026-09-22, `L` y `Σ L` —y con ellas la longitud del pie y las
columnas `arc`/`cum` del CSV de máquina— ya no se cuentan sobre el centro de
la sección: se cuentan sobre la fibra neutra. Al doblar, la cara de fuera se
estira y la de dentro se recalca; la fibra que ni se estira ni se recalca se
corre **hacia dentro** del doblez, así que cortar por el centro —que es como
se mide `radius`, el CLR con el que se calan las matrices— es cortar de más.
Hasta ahora el programa trabajaba con K = 0.5 clavado, sin decirlo.

```
R_fibra(i) = R_int(i) + K·t_ef(i) = radius(i) − (0.5 − K)·t_ef(i)
arco(i)    = R_fibra(i) · θ(i)
```

`t_ef` es cuánto mide la sección **en el plano en que se dobla**: de plano
manda el espesor, de canto el ancho. La contesta `sectionDepth()`
(`engine/section.ts`).

De dónde sale `K`: lo guarda la sección, en `kMode` y `kFactor`.

| modo | `K` | para qué |
|---|---|---|
| `center` | 0.5, fijo | la fibra en el centro. Es el valor de partida, así que ningún archivo anterior cambia un número al abrirse |
| `din` | DIN 6935 por fila: `k = 0.65 + 0.5·log₁₀(r/t)`, topado en [0.65, 1], `K = k/2` | cambia fila a fila, que es lo que pide una pieza con radios distintos |
| `fixed` | la `K` tecleada, la misma para toda la pieza | la casilla donde entra lo que se MIDA en el taller |

Cifras medidas sobre DEMO-1700 (15 dobleces, pletina 40×12, radios 30 de plano
y 45 de canto):

| K | Σ L final | Δ contra el centro |
|---|---|---|
| centro (lo de antes) | 1861.867 mm | — |
| fibra con K = 0.45 | 1849.894 mm | −11.97 mm |
| fibra con K = 0.40 | 1837.921 mm | −23.95 mm |
| fibra por DIN 6935 | 1825.431 mm | −36.44 mm (−1.96 %) |

36 mm de barra por pieza. Las cuatro estaciones de canto aportan 29 de esos
36 mm, y son justo las que caen fuera del rango donde la DIN vale (r/t = 0.63,
por debajo del 0.65 donde acaba la norma): la pantalla lo avisa con un cuadro
rojo que dice cuántas filas son.

Dos avisos que hay que tener presentes. La **DIN 6935 es de chapa en
plegadora**, no de curvado por estirado: es una primera aproximación, algo
mejor que suponer K = 0.5, pero no el número de esta máquina — por eso existe
`fixed`, para meter lo que se mida en el taller. Y la **longitud de corte no
es la longitud de una curva**: es conservación de material. La fórmula de la
fibra neutra es el ajuste empírico con el que la industria la aproxima, y `K`
es la casilla donde entra lo que no se sabe.

**Lo que esto no toca.** Ni un PI se mueve: `fk()`, `ik()` y `compensate()` no
se enteran de que la fibra existe, porque la fibra cuenta barra y no coloca
puntos. Las **rectas** dan el mismo número en las dos cuentas —sin doblez no
hay estiramiento, y ahí la fibra ES el centro— y la **cola** tampoco cambia,
porque no lleva arco. El `trim` sigue siendo la tangente del **centro**: dónde
empieza el arco lo manda el herramental, no por dónde pase la fibra.

**Desde este cambio hay DOS longitudes en pantalla, y son distintas a
propósito.** La cinta de abajo, los pedestales, las marcas y los tramos del
STEP siguen midiendo por el centro, porque miden sobre la pieza ya doblada y
dibujada: la de la tabla es la barra que se corta y la de la cinta es la
abscisa sobre la pieza. Por el mismo motivo el volumen esperado que se escribe
en el STEP se queda en la desarrollada **geométrica**, y no es un descuido: el
sólido que se escribe barre una sección constante a lo largo del centro, así
que su volumen es Pappus sobre el centro, exacto; la barra de verdad se
adelgaza en el doblez y por eso conserva material con la fibra neutra. Las dos
cuentas son ciertas y miden cosas distintas — poner ahí la de corte haría
fallar `tools/check_step_freecad.py`.

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
cara de abajo (**Hueco**), la distancia al pedestal anterior a lo largo de la
barra (**Vano**) y la **Flecha** que ese vano deja colgar. Con la carga puesta se
añade la **Reacción** en newton de cada apoyo. Arriba se repiten el vano mayor y
la peor flecha, y la flecha se pinta en rojo si pasa de la tolerancia de punto.

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

**El alto sembrado no se redondea, y eso no es una manía.** Con la carga puesta,
un apoyo se modela como un muelle que vale unos 6 000 N/mm sobre esta pieza: cada
**micra** de interferencia son **6 N** sobre una barra que pesa 24. Redondear el
alto a centésimas sembraba hasta ±5 µm de precarga, o sea ±31 N que nadie puso, y
de ahí salían siete apoyos sumando 47 N sobre una pieza de 23.7 N. La otra cara
de la misma cifra: **la reacción de un pedestal suelto no es un número que un
fixture medido con flexómetro pueda dar** — y tampoco su suma, que es lo que este
párrafo decía hasta el 2026-09-19 antes de medirlo: subir UN pedestal 0.05 mm
junto a la mordaza lleva el total de los apoyos de 26.8 N a 333.5, porque ahí la
barra no puede ceder y ese medio pelo entra entero en el muelle. Lo que sí
sobrevive a un flexómetro es el **peso** de la pieza y **si el fixture la toca o
no**, que es geometría y no fuerza. `npm run demo:carga`, escenario 6.

La mesa está en `z = TABLE_Z` (−260 mm), fija por ahora: mientras no haya un fixture
real medido, una mesa configurable es un campo más que nadie puede rellenar con un
valor de verdad.

La flecha necesita el módulo elástico y la densidad, que hoy son de catálogo y están
marcados como provisionales: sin ellos la columna dice que falta el dato en vez de
inventar un número. Y **sigue sin contrastarse contra nada físico** — eso pide el
escaneo de una barra recta certificada montada en el fixture.

## Formato de archivo

Esquema `barcomp/2.6`, un JSON con el modelo, los comandos de máquina, las
ganancias, los parámetros del simulador, las piezas medidas y los modelos
comparados. Las claves `variants`, `ref`, `anchor`, `place`, `marks`, `fixture` y
`tweak` son opcionales: los archivos viejos siguen abriendo.

Los archivos de piezas reales **no se versionan**: el repo es público y un
`.json` lleva la geometría del cliente. La carpeta `piezas/` está apartada en
`.gitignore` para tener dónde dejarlos sin que se cuelen en un commit; su
`README.md` explica la convención.

### Archivos de versiones anteriores

Han existido cinco esquemas. En los cuatro primeros los mismos números describen
otra pieza en cada uno:

| esquema | qué era `rot` |
|---|---|
| `barcomp/1.0` | un doblez de canto, y `angle` tenía el signo contrario |
| `barcomp/2.0` | un rodado de verdad: la sección salía girada del doblez |
| `barcomp/2.1` | la posición ABSOLUTA del eje del arco, declarada en cada fila |
| `barcomp/2.2` | **cuánto GIRA** ese eje; el eje se sostiene entre estaciones |
| `barcomp/2.3` | igual que 2.2, pero el ángulo y el rodado doblan al otro lado |
| `barcomp/2.4` | lo mismo; lo que cambia es que la sección ya puede ser hueca y redonda |
| `barcomp/2.5` | lo mismo; lo que cambia es que la cuna de un pedestal guarda su RUMBO |
| `barcomp/2.6` | lo mismo; lo que cambia es que `L`, `Σ L` y la cola se cuentan sobre la FIBRA NEUTRA |

Un `barcomp/2.6` tampoco **dice nada nuevo de la forma de la pieza**, y aquí no se
mueve ni un signo ni una fórmula ni un PI: del 2.5 al 2.6 la sección gana dos
campos, `kMode` y `kFactor`, y un archivo anterior se abre como `kMode: 'center'`
—K = 0.5, la fibra en el centro—, que es exactamente lo que ese archivo quiso
decir. El sentido que obliga a subir el número es el otro, y aquí muerde más que
en los casos anteriores porque lo que se pierde es **material**: un 2.6 guardado
con la fibra por DIN, abierto por una copia anterior, se leería como si la fibra
estuviera en el centro y la barra saldría **36.44 mm** más larga sin que nadie
avisara. `barcomp/2.5` entra en `SCHEMA_COMPAT`.

Un `barcomp/2.5` **no dice nada nuevo de la forma de la pieza** tampoco: del 2.4 al
2.5 lo único que aparece es `yaw` en cada pedestal, el rumbo en planta al que mira
la cuna. Hasta el 2.5 ese rumbo no existía como dato —la chapa se apuntaba sola a
la barra en cada repintado— así que un archivo anterior **se abre apuntando cada
cuna una vez** contra la pieza que trae y a partir de ahí se queda quieta: el
archivo se ve igual que cuando se guardó y el dato pasa a estar escrito. El número
sube por el otro sentido, que es el que muerde: un 2.5 con una cuna puesta a mano,
abierto por una copia anterior, se leería con la cuna reapuntada a la barra —o sea,
apoyando— y no avisaría nadie.

Un `barcomp/2.4` **no dice nada nuevo de la forma de la pieza**: del 2.3 al 2.4
no cambió ni un signo ni una fórmula, y un 2.3 se abre tal cual, sin convertir y
sin avisar. Lo que cambió es lo que el archivo PUEDE decir: la sección ya no es
forzosamente un rectángulo macizo. El número sube por el otro sentido de la
compatibilidad, que es el que muerde: un archivo con un tubo abierto por una
copia anterior del programa se leería como barra maciza —más peso, más rigidez—
y no avisaría nadie. Con el número subido, esa copia se para y lo dice.

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
teclea. Lo mismo con la cola: se teclea su recta y se guarda `tail`, de PI a PI.
Y lo mismo con el `Δ` de la `Recta`: se teclea un `Δ` de recta y se guarda el `Δ`
de `feed`, que es el que viaja en `deltas`. **Nada de esto cambió el esquema**: la
primera pasada del 2026-09-22 arregló lo que se pinta y en qué unidad se teclea,
no lo que se guarda. Lo que sí sube el esquema, en la segunda pasada del mismo
día, es otra cosa: de dónde sale `K` para contar `L` sobre la fibra neutra. Eso
**sí** se guarda, en `section.kMode` y `section.kFactor`.

```jsonc
{
  "schema": "barcomp/2.6",
  "model": {
    "name": "...",
    "section": { "kind": "rect", "width": 40, "thickness": 12, "wall": 0, "chamfer": 1.2, "endLen": 20, "kMode": "center", "kFactor": 0.5 },
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
4. **Contrastar contra una pieza real** la flecha por gravedad, el amarre y la
   carga. Los tres están modelados y coherentes por dentro —estática,
   invariantes, orden de magnitud— pero **ninguno se ha comparado con una barra
   medida**. Los tres esperan el mismo dato: un escaneo con el fixture puesto, y
   el certificado del material.
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

El estado tarea a tarea —lo abierto, lo que espera una respuesta del taller o de
metrología, y lo que se decidió no hacer— está en
[`.auditoria/plan-fases.md`](.auditoria/plan-fases.md).

**Hallazgo de la validación:** corrigiendo solo ángulos, los ángulos convergen a
0.15° pero la desviación de la punta libre se estanca en ~5 mm, porque el sesgo
de rotación se acumula a lo largo de la cadena. Activando también rotación y
avance, la punta baja a 0.17 mm. Ganancia recomendada 0.6–0.8, nunca 1.0: al
100 % el lazo oscila con el ruido de medición.
