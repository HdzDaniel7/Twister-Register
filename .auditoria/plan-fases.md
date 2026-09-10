# Plan por fases — BARCOMP beta 1.0

Reescrito tras las respuestas del 2026-09-07. Tres decisiones cambian el plan original:

1. **El comportamiento actual se mantiene.** Los signos de ángulo y rodado que hay hoy
   funcionan contra valores de máquina reales que no se pueden modificar. **No se
   invierten.** Lo que se hace es congelarlos en pruebas para que ningún cambio futuro los
   mueva sin que nadie se entere. Esto abarata C3: era una migración, ahora es un candado.
2. **El export de ZEISS está por verificar.** Todo lo que dependa de conocer el archivo real
   queda esperando en `solicitud-datos.md`; lo que se puede blindar a ciegas se hace ahora.
3. **Alcance beta 1.0, no validación industrial.** Se recorta lo que cuesta mucho y aporta
   poco a esta versión. Lo recortado está abajo en "Diferido", con el motivo, para que la
   discusión no se repita.

Cada acción enlaza al ID del hallazgo en [`informe-2026-09-07.md`](informe-2026-09-07.md).

## Reparto de modelo

| Marca | Quién | Qué tipo de trabajo |
|---|---|---|
| **[O]** | Opus | Cinemática, decisiones de esquema, parser de datos externos, diseño del lazo, arquitectura. Cosas donde equivocarse cuesta caro y el contexto del dominio manda. |
| **[S]** | Sonnet | Ediciones mecánicas de alcance cerrado: CSS, i18n, aplicar `esc()`, deduplicar, rutas portables, guardas de existencia, comentarios, mensajes de error. Trabajo donde el criterio ya está tomado y solo hay que ejecutarlo bien. |

Regla práctica: si el arreglo se puede describir en una frase sin ambigüedad y no toca
números que van a la máquina, es de Sonnet. Si hay que decidir algo, es de Opus.

---

## Fase 0 · Contención — antes de la primera barra real

**CERRADA 2026-09-08.** Las casillas de abajo se quedaron sin marcar en su día; el detalle
de lo que cambió está en `CONTEXTO_BARCOMP.md` §11.

Objetivo: que el programa deje de producir números que parecen correctos sin serlo, y que
se pueda saber qué versión produjo cada número. **Ninguna barra real se dobla con esto
abierto.**

- [x] **[C7] Sello de versión en la página · [O]** — marcador `/*__VER__*/` en
      `src/shell.html`, sustituido en `build.mjs` por `git rev-parse --short HEAD` + fecha,
      pintado en la barra de estado. · S · Va primero: sin esto, ningún otro arreglo se
      puede rastrear hasta una copia concreta.
- [x] **[C3] Congelar el comportamiento actual · [O]** — subir `SCHEMA` a `barcomp/2.3`
      (los signos cambiaron respecto de lo que otros archivos `2.2` pudieran contener) y
      crear `web/test/fixtures/` con un JSON y sus PI esperados escritos a mano, **tomados
      del comportamiento de hoy, que es el que funciona**. Aserción de coordenadas en
      `test_motor.js`. · M · Regla que queda escrita: tocar `ANG_DIR`/`ROT_DIR` obliga a
      subir `SCHEMA` y a regenerar el fixture a propósito, nunca por accidente.
- [x] **[A5] Rechazar esquemas desconocidos · [S]** — `SCHEMA_LEGACY` existe y no se usa;
      hoy `barcomp/9.9` se lee como cinemática 1.0. Dos líneas y una clave i18n. · S
- [x] **[C1 + A4] Alineación de rama y umbral físico del eje · [O]** — `alignBranch(meas,
      nom)` en `measuredModel()`, `deviations()`, `bendStats()` y `medianPart()`; en `ik()`,
      si el doblez es menor que el ruido lo declara "eje no observable" y hereda `prevRot`.
      Prueba que barre el eje de 85° a 95° con ruido. · M · **Es el hallazgo más grave de la
      auditoría** y van juntos: separarlos deja medio mecanismo en pie.
- [x] **[C2 parcial] Blindar el CSV con lo que se sabe hoy · [O]** — sin el archivo real no
      se puede mapear por nombre, pero sí se puede **rechazar lo ambiguo**: exigir 3 o 4
      columnas numéricas por línea y rechazar la línea si el patrón se rompe (en vez de
      recortar por la derecha), detectar coma decimal, y verificar
      `pts.length - 2 === bends.length` avisando el desajuste. · M · El mapeo por cabecera
      llega en la Fase 2, cuando llegue el archivo.
- [x] **[C5] SIM/MED visible en Compensar · [S]** — `srcTag()` en el encabezado de la tabla
      de comandos y en la barra de estado; `warnbox` si hay piezas simuladas en el lazo; la
      insignia también en el reporte impreso. · S · La función y las claves ya existen.
- [x] **[C6] Marcar los dobleces sin medir · [O]** — guion en vez de `+0.000`, fila
      atenuada, celda no editable, contador "medidos 10/15". · M · Toca la lógica de
      `compensate()`, no solo la vista.
- [x] **[C8] Aviso al cerrar con cambios sin guardar · [S]** — `beforeunload` con documento
      sucio. · S
- [x] **[A1] Guardas del lazo · [O]** — banda muerta, tope de Δ por ciclo, ganancia máxima
      1.0, "Aplicar" deshabilitado con n<3. · S · Sin esto, con ruido alto el lazo empeora
      la pieza.

**Criterio de cierre:** un CSV con columnas de más se rechaza diciendo por qué; un CSV
corto avisa cuántos dobleces quedaron sin medir y esos salen marcados; Compensar dice SIM o
MED sin salir del modo; el pie muestra el SHA; `npm test` incluye el fixture congelado y el
barrido de eje, y sale en verde.

---

## Fase 1 · Ganancias rápidas

Todo de esfuerzo S, sin dependencias externas, y casi todo delegable.

- [x] **[A6] `File.text()` + `Promise.allSettled()` en `io.ts` · [S]** — hecho 2026-09-08.
      `pickFiles()` devuelve dos listas: lo que se leyó y lo que no, con el motivo. Lo
      ilegible entra al mismo informe que el CSV inservible. `pickFile()` tiene `onFail`
      y «Abrir JSON» lo usa. Clave nueva `fileUnread` en es/en/de.
- [x] **[A7] Sacar `commit()` de `importCsvText()` · [O]** — hecho 2026-09-08.
      `addCsvPiece()` hace el trabajo sin tocar el historial; `importCsvText()` (la entrada
      de una pieza y del banco) apila su paso, e `importCsvBatch()` apila UNO para el lote
      entero. El banco lo comprueba por comportamiento y no por el contador: `undoDepth()`
      ya está en su tope de 50 a esa altura, así que lo que se afirma es que **un** Ctrl+Z
      se lleva las tres piezas y **un** Ctrl+Y las repone.
      De paso: `actions.ts` pasaba de 400 líneas, así que el grupo que toca disco salió a
      `app/files.ts` (293 + 169).
- [x] **[A3] Guarda de θ en `trimOf` · [O]** — hecho 2026-09-08. Dos capas, y la
      distinción importa: `bendDecomp` **envuelve** el ángulo a (-180, 180], que es
      exacto y no un recorte —girar 200° alrededor de un eje es girar 160° alrededor
      del contrario, la misma pieza—; y `trimOf` **topa** θ en `BEND_MAX_DEG = 170`,
      que sí es una decisión: por encima el trim se calcula con el tope y el doblez
      sale listado por `overBent()` en vez de devolver 4.9e17.
- [x] **[M2] Enseñar `machineFeeds` · [O]** — hecho 2026-09-08. La celda en rojo ya
      existía (`straight < 25` en `model.ts` y `focus.ts`, el número escrito a mano en
      los dos), pero el rojo no es un aviso: hay que estar mirando esa columna.
      `engine/feasible.ts` nuevo con `STRAIGHT_MIN_MM` y `feasibility()`, y un
      `.warnbox` que nombra los dobleces y separa la recta CORTA (umbral discutible)
      de la NEGATIVA (dos herramentales en el mismo sitio, no hay umbral que valga).
      Se recalcula también en `updateModelDerived()`, porque teclear una recta no
      reconstruye el panel y es tecleando cuando se vuelve imposible.
- [x] **[M3] Rechazar PI coincidentes · [O]** — hecho 2026-09-08. Se ataja al LEER,
      en `parsePointsCsv`, y no dentro de `ik()`: editar un punto a mano puede pasar
      por un estado intermedio raro, pero un archivo con dos PI a décimas de milímetro
      está mal extraído y no hay nada que salvar. `PI_MIN_MM = 1.0` provisional,
      `reason: 'coincident'` y los índices en `near`, que el aviso del lote nombra.
- [x] **[A12] Feedback de celda inválida · [S]** — hecho 2026-09-08. El texto rechazado se
      queda A LA VISTA en rojo (`.badcell`) con el tooltip de qué se admite, en vez de
      volver al valor de antes: eso último es exactamente lo que se ve cuando el ajuste
      SÍ se acepta y no mueve nada. `markRejected()` vive en `panels/focus.ts`, que ya es
      el dueño de los retoques dirigidos posteriores al repintado. No roba el foco: el
      `change` salta al SALIR del campo, o sea que el cursor ya está en otro sitio.
- [x] **[A14] Reescribir `cellNote` en es/en/de · [S]** — hecho 2026-09-08. Decía que `+2`
      operaba sobre lo que calculó el lazo; desde el cambio del parser opera sobre lo
      MOSTRADO. Reescrito en los tres idiomas con los tres grupos separados y nombrados:
      relativo a lo que ves / relativo al lazo (`c`) / absoluto (`=`). De paso, los dos
      comentarios de `panels/comp.ts` que repetían la versión vieja y apuntaban a un
      `engine.js` que no existe (el parser está en `engine/expr.ts`).
- [x] **[A13] Tokenizar `.warnbox` y subir `--dim2` · [S]** — hecho 2026-09-08. El
      `.warnbox` ya estaba tokenizado; faltaba `--dim2`, que estaba a 3.1:1 en oscuro y
      3.2:1 en claro, bajo el 4.5:1 de WCAG 1.4.3, y no es decorativo: lo llevan la ayuda
      de las celdas, los rótulos de sección y las columnas de solo lectura de las tablas,
      que son datos, a 10 px. Sube en los dos temas medido contra `--panel2`, el fondo más
      apretado donde aparece. Consecuencia asumida: queda muy cerca de `--dim`, así que la
      jerarquía entre los dos la lleva ya el tamaño y la caja, no el color. El banco mide
      el contraste de verdad con `getComputedStyle`, así que el umbral no se puede perder
      sin que salte una prueba.
- [x] **[M1] Mensajes de error con causa y acción · [S]** — hecho 2026-09-08. Cuatro causas
      de fallo al abrir, cada una con su frase y con qué hacer: no es JSON (casi siempre
      es el CSV o el informe del escáner), es JSON pero no una pieza (`NotADocError`, tipo
      propio para que el motor no redacte texto de usuario), esquema desconocido, y roto
      por dentro —esta conserva la línea técnica, pero DETRÁS de la frase, no en su lugar.
- [x] **[A2] `gainR` y `gainF` propios · [O]** — hecho 2026-09-08. En el motor ya existían;
      lo que faltaba era DÓNDE tocarlas: el panel solo enseñaba «canto» y «plano», así que
      el 0.5 que nadie eligió era intocable desde el taller. Cada una aparece solo con su
      corrección encendida —dos mandos que no hacen nada son ruido— y el porqué va en el
      tooltip, no en una línea de ayuda: en COMPENSAR cada línea de texto arriba son filas
      de comando que se dejan de ver. La rejilla pasa a `fgrid pair` por lo mismo, y con eso
      el bloque ocupa MENOS que antes aun con las cuatro ganancias.
- [x] **[M8] `esc()` en las etiquetas 3D y validar colores al cargar · [S]** — hecho
      2026-09-08. Las etiquetas del 3D eran el único innerHTML por donde entraba texto que
      no escribe el programa: el nombre de una cota, que llega de un `.json`. El color iba
      además dentro de un `style="background:…"`, o sea que una comilla se salía del
      atributo. Nuevo `src/safe.ts` —módulo hoja, sin dependencias, para que las tres capas
      lo usen sin arrastrarse entre ellas— con `esc()` (la definición ahora es UNA,
      `panels/fmt.ts` la reexporta) y `safeColor()`, lista blanca de hexadecimal, que es lo
      único que este programa escribe: todos los colores salen de un `<input type="color">`.
      El filtro de carga está en `fromDoc()`, el único sitio por donde pasan todos los
      documentos que se abren. Bajo `file://` esto no es paranoia de servidor: un
      `<img onerror>` corre con acceso al disco del taller, y el `.json` va y viene por USB.
- [x] **[M9] Guardas y lista blanca en `change.ts` · [S]** — hecho 2026-09-08. Las claves
      de `data-*` las escribe este mismo programa, así que en marcha son buenas — pero eso
      era una SUPOSICIÓN, y el precio de equivocarse es una clave que nadie declaró dentro
      de `ST.comp` o un NaN dentro de la geometría, que se propaga a todos los números de
      la pantalla sin un solo error en la consola. Las listas blancas se derivan de los
      `*_DEFAULT` congelados, así que no pueden quedarse atrás cuando alguien agregue un
      campo. De paso, `onChange()` iba en 88 líneas, sobre el límite de 60: repartido en
      seis grupos que devuelven si el evento era suyo.
- [x] **[M10] Leer los tokens CSS una vez fuera del bucle de la cinta · [S]** — hecho
      2026-09-08. `cssVar()` llama a `getComputedStyle()` sobre `:root`, que fuerza
      recálculo de estilo; eran hasta cinco por doblez —setenta y cinco en una pieza de
      quince— y la cinta se repinta con cada tecla de la tabla. Se leen una vez por
      repintado. El color sigue viniendo del CSS, que es la regla; cambia CUÁNTAS VECES se
      pregunta. De paso `drawRibbon()` iba en 80 líneas, sobre el límite de 60: partido en
      `drawFrame()` (el armazón, que no depende de ningún doblez) y `drawColumns()`.
- [x] **[A10] Banco de UI portable · [S]** — hecho 2026-09-08. Los dos bancos tenían la
      ruta de UNA máquina escrita a mano, la del navegador y la de la página: solo corrían
      en el portátil donde se escribieron, y el CI no habría podido ejecutarlos nunca.
      Nuevo `tools/edge.mjs`: `EDGE` manda sobre todo, y si no está se busca Edge, Chrome o
      Chromium en las rutas de las tres plataformas y en el PATH; la página sale de la raíz
      del repo. Si no hay ninguno, el mensaje dice qué variable poner. `engines:
      node >=22.18` en `package.json`.
- [x] **[M14] Fijar exacto esbuild y typescript · [S]** — hecho 2026-09-08. Las cuatro
      dependencias sin `^`: `esbuild 0.28.2`, `typescript 7.0.2`, `three 0.185.1`,
      `@types/three 0.185.4`. Con el rango, dos `npm install` en fechas distintas daban dos
      artefactos distintos y el diff de `index.html` en el CI sería ruido permanente.
- [x] **[M15] `LICENSE` y atribución de three.js · [S]** — hecho 2026-09-08.
      Era lo urgente y era un incumplimiento real: el build compilaba con
      `legalComments: 'none'`, o sea que borraba el aviso de copyright de three.js del
      artefacto — y cada copia del HTML, la de Pages y la del USB, es una redistribución de
      three.js, cuya licencia MIT pide que el aviso viaje con ella. Ahora es `'eof'`, hay
      `THIRD-PARTY.md` con el texto completo, y **el build FALLA** si el aviso no quedó
      dentro: volver a `'none'` para ahorrar bytes rompe la compilación en vez de publicar.
      La licencia de BARCOMP la decidió el dueño el 2026-09-08: **MIT**, la misma que
      three.js, coherente con un repo público que ya redistribuye una dependencia MIT.
- [x] **[B2] Un solo `$()` · [S]** — hecho 2026-09-08. Había CUATRO copias —app, panels,
      la cinta y el escenario— con la misma firma por casualidad y no por contrato. Una
      sola, en `src/dom.ts`.
- [x] **[B3] Validar el slice de `tokenize` · [S]** — hecho 2026-09-08. `parseFloat` se para
      en el segundo punto: «1.2.3» daba 1.2 y la celda se quedaba con un valor que nadie
      escribió, sin decirlo. El trozo entero tiene que SER un número, no empezar por uno.
      Con A12, ahora además se ve en rojo en vez de tragárselo.
- [x] **[B4] Corregir los comentarios que contradicen al código · [O]** — hecho 2026-09-08.
      `stepField() en app.js` (está en `app/events/keyboard.ts`), `bind() en app.js` (en
      `app.ts`), `scene.js`/`ribbon.js` en el CSS, el esquema `2.2` en las cabeceras de
      `doc.ts`, `types.ts` y `kinematics.ts` cuando `SCHEMA` es 2.3, la cuenta de claves de
      i18n (decía 169, son 239) y las cifras del README (pruebas, pasos y tamaño).
- [x] **[B5] Barrer los perfiles de Edge huérfanos · [S]** — hecho 2026-09-08. El borrado
      del final falla cuando Edge todavía tiene un archivo tomado, así que quedaban
      directorios de cada corrida: había SEIS. Se barren al EMPEZAR, cuando ya no hay
      ningún Edge del banco vivo, en vez de insistir al terminar.

**Criterio de cierre:** un lote con un archivo ilegible dice cuál falló y sigue con el
resto; deshacer una importación cuesta un Ctrl+Z; ningún error visible es una excepción de
JavaScript; `npm run check` corre en otra máquina.

**FASE 1 CERRADA — 2026-09-08.** Los 20 arreglos hechos. Redes en verde: `tsc` limpio,
**261** pruebas de motor (eran 225 al abrir la fase), **162** pasos de interfaz (eran 145),
build reproducible con las cuatro dependencias fijadas.

Lo único que queda abierto de la fase es **la licencia de BARCOMP** (M15), y no es trabajo
pendiente: es una decisión del dueño del proyecto. La atribución de three.js, que era la
parte que se estaba incumpliendo, sí está hecha y con guardia en el build.

**Deuda estructural heredada, anterior a esta fase:** `i18n.ts` (518 líneas),
`kinematics.ts` (490) y `types.ts` (411) pasan del límite de 400 de la regla. Durante la
fase se sacaron `engine/feasible.ts`, `engine/csv.ts`, `app/files.ts`, `src/safe.ts` y
`src/dom.ts` para no engordar lo que ya estaba lleno, pero esos tres no se han tocado.
`i18n.ts` y `types.ts` son tablas de datos y se parten barato; la cinemática no. **No está
en ninguna fase: decidir si entra.**

**Valores PROVISIONALES en circulación**, cada uno en un solo sitio y con la respuesta que
espera anotada: `AXIS_MIN_DEG` y `COMP_DEFAULT.dead` (A.6), `PI_MIN_MM = 1.0` (A.6),
`STRAIGHT_MIN_MM = 25` (B.2).

---

## Fase 2 · Estructural — cuando lleguen los datos

**ARRANCADA 2026-09-08.** Los datos externos NO han llegado: no hay ningún export
de ZEISS ni ningún programa de máquina en el repo ni en `.auditoria/`.

**DECISIÓN 2026-09-08 (del cliente del proyecto):** todo lo que dependa de los
modelos CAD y de los archivos de inspección se **aplaza al final del proyecto**,
como actualización posterior a la beta 1.0. No es que dejen de importar: es que
llevan semanas parados esperando una respuesta que no llega, y el resto del
trabajo no depende de ellos. Lo aplazado está más abajo, en «Futuras
actualizaciones», con lo que hará falta para retomarlo.

Lo que se hizo, que es todo lo que no dependía de una respuesta:

- **Los dos correos, listos para enviar** — `.auditoria/correo-a-metrologia.md`
  y `.auditoria/correo-b-maquina.md`. El documento largo sigue siendo la fuente;
  esto es lo que se manda, cada uno a su destinatario, con la petición delante y
  el porqué detrás. A.1 y A.3 encabezan el de metrología; B.1 y B.2 el de la
  máquina. **Es el único trabajo que desbloquea lo aplazado, y no es trabajo de
  software.**
- **La guarda de ESCALA del CSV** — la mitad de C2 que no necesitaba A.1.
- **La herramienta de fixture** — ver abajo.
- **M16 / D4 resuelto** — ver abajo.

- [x] **[C2 parcial] Guarda de escala al importar · [O]** — hecho 2026-09-08.
      `csvScaleOk()` con `SCALE_MIN_RATIO = 0.25`. Tapa el agujero que quedaba
      después de la Fase 0 y que era el motivo entero de pedir A.1: un export
      cuyas tres últimas columnas son la DESVIACIÓN y no la coordenada pasa
      todas las guardas anteriores —tres columnas numéricas, decimales con
      punto, ningún PI pegado— y entra como una pieza perfecta, porque una nube
      de desviaciones es geométricamente una barra rectísima y diminuta. Ahora
      se compara el paso medio entre PI contra el del nominal, que el visor ya
      tiene cargado: no hace falta saber nada del formato del archivo.

      El hueco real estaba entre `PI_MIN_MM` y el paso nominal. Con desviaciones
      de décimas de milímetro la nube ya la cazaba el guardia de PI pegados; con
      las de varios milímetros de una pieza FUERA de tolerancia, no la cazaba
      nadie. Dos órdenes de magnitud sin vigilar. De paso caza las unidades
      equivocadas —metros, pulgadas, centímetros—, que es el mismo error con
      otra cara.

      De UN SOLO LADO a propósito: a un escaneo al que le faltan puntos
      intermedios se le funden dos tramos y su paso medio SUBE. Eso no es un
      archivo malo, es una pieza medida a medias, y ya lo dice `csvShort`.

- [x] **[NUEVO · A.5 parcial] Herramienta de fixture: los pedestales · [O]** —
      hecho 2026-09-08. Antes la escena dibujaba pedestales de MENTIRA: una caja
      cada tres PI, de tamaño fijo, levantada hasta el suelo. Se veían bien y no
      significaban nada. Ahora hay `engine/fixture.ts`, una pestaña propia
      dentro de Modelar y un modelo de datos que viaja en el JSON.

      **Se colocan por posición en la MESA**, no sobre la barra, porque el
      fixture es una cosa física que ya está montada: cada pedestal tiene su
      `x`, `y`, su alto, el largo de la cuna y su inclinación, que son las cinco
      cifras que alguien mide en el taller con un flexómetro. Lo demás son
      columnas de LECTURA que salen del modelo: en qué punto de la barra toca,
      cuánto se desvía en planta, qué hueco queda entre la cuna y la cara de
      abajo, qué inclinación pide la barra ahí, y el **vano** hasta el pedestal
      anterior a lo largo de la barra.

      La inclinación lleva **las dos columnas y la diferencia**: la del pedestal
      (que se teclea) y la que la pieza pide (que se calcula). Δ solo no se
      puede juzgar contra una tolerancia —medio grado en una cuna de 20 mm no
      levanta nada y en una de 300 mm levanta más que la tolerancia de punto—
      así que lo que se pinta en rojo es el **despegue** que ese Δ produce en la
      punta de la cuna, comparado contra `tol.point`.

      Que se coloquen en la mesa tiene una consecuencia que es justo la que
      hacía falta: **los pedestales NO se mueven cuando la pieza se recoloca.**
      Lo que cambia es si siguen apoyando, y el que deja de hacerlo se pone del
      color de fuera de tolerancia en la tabla y en el 3D. Hay una prueba de
      banco dedicada a eso.

      **Lo que esta herramienta NO hace: calcular la flecha.** Da la geometría
      de la que sale —dónde apoya cada uno y qué vano queda— pero la flecha
      necesita módulo elástico y densidad del material, que no están
      confirmados. Ver M6.

      De paso se le puso nombre al `-260` que estaba escrito dos veces a mano en
      `scene/layers.ts`: es `TABLE_Z`, y ahora es el cero de una cota que
      alguien va a mecanizar, no un detalle de dibujo.

- [x] **[B1/B2] Exportación de comandos a la máquina · [O]** — **hecho
      2026-09-08**, sin esperar el manual y sin inventarlo: `engine/machine.ts`
      escribe el comando con un perfil configurable (columnas y orden,
      separador, decimales, mm/pulgadas, grados/radianes, signo del ángulo y del
      rodado, rodado incremental o absoluto, encabezado, CRLF y fila de la cola)
      y la pestaña **Máquina** lo ajusta con una vista previa que es el archivo
      —la pinta `machineTable()`, la misma función que escribe el CSV—. El
      perfil viaja en el JSON de la pieza.

      **Lo que sigue dependiendo de B.1/B.2 es ACERTAR**, y eso no lo arregla
      ningún código: lo que cambia es quién decide y cuándo. Antes había que
      recompilar y repartir un HTML nuevo; ahora lo teclea quien tenga el manual
      delante, lo comprueba contra una pieza conocida en la vista previa, y
      queda escrito junto al comando que se exportó.

      Los signos invierten el ARCHIVO, no el motor: `ANG_DIR` y `ROT_DIR` siguen
      congelados, y hay prueba de que invertir el signo de escritura no mueve un
      solo PI.

      Texto anterior, para saber de dónde venía: ⛔ depende de **B.1 y B.2**.
      Hoy no existe ninguna y los números se pasan a mano. Si la máquina lee CSV, es una
      función de 30 líneas junto a `expts`; lo caro no es escribirla, es acertar con las
      unidades y los signos. **Alto valor por poco esfuerzo en cuanto llegue el formato.**

      **NO se aplaza** con lo del CAD: esto no depende del escáner ni del
      informe de inspección, sino del manual de la dobladora, que es otra
      persona y otro correo.
- [x] **[A9 + A11] CI que verifica el artefacto · [S con revisión de O]** — hecho
      2026-09-08, adelantado a la Fase 1 porque sus dos prerrequisitos (A10 y M14) cayeron
      allí. `.github/workflows/ci.yml` corre lo mismo que `npm run check` —tipos, motor,
      build, banco de interfaz— sobre Node **22.18**, el suelo declarado en `engines`, y
      sobre 24: probar solo lo que ya corre en el portátil no verifica nada de lo que
      promete el `package.json`. Añade dos comprobaciones que solo tienen sentido en CI:
      que el artefacto corresponde a la fuente, y que lleva la atribución de three.js
      —redundante con el guardia de `build.mjs`, y a propósito.

      **D3 RESUELTO:** `index.html` **se sigue versionando**, y el CI lo compara SIN el
      sello de versión. No es una concesión: el sello es `git rev-parse --short HEAD` en el
      momento de compilar, o sea el commit ANTERIOR al que lleva el artefacto, y no puede
      coincidir nunca por construcción. Lo que sí tiene que coincidir es todo lo demás, y
      con eso se pillan los dos fallos reales: que alguien edite `index.html` a mano y que
      se commitee fuente sin recompilar. `sucio` **sí** se compara, porque un artefacto
      publicado con «+sucio» se compiló sobre cambios sin confirmar.

      Se descartaron las otras dos: sellar con hash del contenido hace el build
      determinista pero pierde la trazabilidad a un commit, que era el motivo entero de C7;
      y sacar `index.html` del repo deja al taller sin un HTML listo para copiar a un USB.

      **Regla de flujo que esto impone**, escrita en el workflow y en el README: los dos
      commits de un cambio —la fuente y el «build: regenerar»— se empujan JUNTOS. El
      disparador de push evalúa la punta.
- [x] **[M6] Medir la flecha por gravedad · [O]** — **calculada el 2026-09-10**,
      por la segunda de las dos vías que este punto daba: el módulo elástico y la
      densidad, que llegaron con el bloque de material del amarre y están
      marcados provisionales. `engine/sag.ts`, columna por tramo en la pestaña
      del fixture.

      **Y el resultado desmiente la hipótesis de este mismo punto.** Con la
      pieza de demostración la peor flecha va de 0.002 mm (7 apoyos) a 0.125 mm
      (3 apoyos): dos órdenes por debajo de la tolerancia de punto y tres por
      debajo de los 5 mm de la punta. **La flecha no explica ese estancamiento**
      —al menos con una pieza que va mayormente de canto— y E y ρ del aluminio
      son buenos a un ±5 %, no a un factor 50, así que la conclusión aguanta
      aunque el certificado traiga otros números.

      Lo que sí puede dar flecha del orden de la tolerancia: una pieza que vaya
      de PLANO en un vano largo —once veces más con 40×12— o un fixture con dos
      apoyos mal repartidos. Por eso el número se enseña por tramo y no como
      total.

      **Sigue pendiente A.5** para contrastar: un escaneo de barra recta
      certificada montada en el fixture convierte la estimación en medida. Lo
      que ha cambiado es que ahora hay una predicción concreta que ese escaneo
      puede desmentir.
- [x] **[M16 / D4] Dónde viven los JSON de piezas reales · [—]** — resuelto
      2026-09-08. El repo es público y sirve `index.html` por Pages; un `.json`
      de BARCOMP lleva la geometría del cliente y las nubes medidas, y publicarlo
      por descuido no se deshace —queda en el historial y en los clones que ya
      se hicieran. `piezas/` existe para tener un sitio obvio donde dejarlos
      mientras se trabaja, y `.gitignore` aparta todo lo que caiga dentro salvo
      su `README.md`, que explica la convención de nombres y dice dónde viven de
      verdad: la unidad de red del taller, no el repo.

      Se eligió apartar la carpeta en vez de no crearla: sin un sitio obvio, los
      archivos acaban en la raíz, y ahí el `.gitignore` no los ve. Publicar una
      pieza de ejemplo sigue siendo posible con `git add -f`, que es un gesto
      deliberado y no un descuido.

### Aplazado a futuras actualizaciones (decisión 2026-09-08)

Lo que depende de los modelos CAD y de los archivos de inspección. **No está
descartado: está esperando.** Cada punto dice qué respuesta lo despierta.

- **[C2 completo] Mapeo de columnas por cabecera** — necesita **A.1**, un export
  real. Leer el encabezado, mapear por nombre, y un diálogo que muestre las
  columnas detectadas, los tres primeros puntos y el conteo antes de crear el
  dataset. Sin un archivo real, los nombres de columna que se mapearían serían
  inventados. Mientras tanto la guarda de escala tapa el fallo grave.
- **[C4] Prealineación de la nube al nominal** — necesita **A.4**, qué alineación
  y qué datum. Si el export ya viene alineado al CAD se reduce a verificar el
  residual; si viene en coordenadas de escáner hay que llamar al `kabsch()` que
  ya existe y resolver el giro sobre x, más añadir `'end'` a `DatumMode`. Cuál
  de los dos caminos es decide la forma entera del código, y construir los dos
  para tirar uno cuesta más que esperar.
- **[A.3] El extractor de nube en Python (RANSAC)** — necesita saber si el plan
  de inspección puede dar los puntos de intersección directamente. Si puede, no
  se escribe nunca. Sigue siendo la pregunta que más trabajo ahorra.
- **[A.7] Cotejar el nominal contra el CAD** — necesita el STEP/IGES o la tabla
  de dobleces con la que se generó.

**Criterio de cierre de la fase (recortado por el aplazamiento):** los pedestales
del fixture real están metidos en el visor y la tabla dice que la barra apoya en
todos; el comando corregido sale en el formato que la máquina lee. Lo del export
de ZEISS se juzga cuando se retome.

---

## Fase 3 · Cierre de beta 1.0

Lo mínimo para que la beta se pueda usar sin supervisión.

- [x] **[M12] Pruebas de `history.ts` · [O]** — hecho 2026-09-08. 33 pruebas, sin
      navegador: `history.ts` no toca el DOM —guarda documentos serializados y
      los vuelve a cargar por el mismo camino que abrir un archivo— así que se
      prueba en `test_motor.js` y no solo en el banco de Edge, que corre entero
      o no corre.

      La propiedad que sostiene todo lo demás es `snapshot(restore(s)) === s`, y
      se comprueba por la puerta de delante: después de deshacer, un `commit()`
      tiene que devolver `false`. Si restaurar produjera un documento aunque
      fuera un decimal distinto, la pila se llenaría sola de estados que nadie
      pidió.

      Lo demás que ahora está vigilado y antes solo estaba escrito: la lista de
      **«qué NO se deshace»** de la cabecera del archivo —vista, modo, cajón,
      tema, idioma, datum, capas, exageración, doblez seleccionado—, que si
      alguien mete en `toDoc()` hace que el primer Ctrl+Z se gaste en volver de
      pantalla; el tope de 50 pasos y que se caigan por el FONDO y no por
      arriba; que una acción nueva corte la rama de rehacer; que el ajuste todo
      a cero sea «sin ajuste» y mirar la pestaña de compensación no gaste un
      paso; que las cotas y los pedestales sobrevivan a la ida y vuelta con sus
      cifras; y que el aviso de cambios sin guardar compare por CONTENIDO —
      deshacer a mano hasta el estado guardado lo apaga.
- [x] **[M4] Resorte con n≥5 y dos niveles de ángulo · [O]** — hecho 2026-09-08.
      El aviso de «el resorte depende del ángulo» disparaba con `|r| > 0.6` y
      tres muestras. Con tres puntos, una muestra de PURO RUIDO cruza ese umbral
      cerca de una de cada tres veces: el aviso salta sin motivo y quien lo ve
      deja de hacerle caso.

      Tres puertas con nombre, y ninguna sobra porque cada una tapa una forma
      distinta de anunciar una dependencia que no existe:
      `SB_MIN_N = 5` (bastantes piezas), `SB_MIN_SPAN_DEG = 10` (los ángulos
      comandados tienen que separarse: una pendiente se mide entre dos puntos, y
      si todo se dobló a 30° r sale de dividir ruido entre ruido) y
      `SB_MIN_PER_SIDE = 2` (**el punto de palanca**: cuatro piezas a 30° y una
      a 60° cumplen las dos primeras y sin embargo la recta la decide esa única
      pieza; si salió mal, el programa anuncia una dependencia inventada).

      El resultado va en `SbFit.trend` —`'ok' | 'few' | 'flat'`— y **no** se
      apaga poniendo ceros: `slope` y `r` se siguen calculando, y la pantalla
      dice QUÉ FALTA en vez de callarse. La diferencia entre «no hay
      dependencia» y «no se puede saber todavía» es la que decide si alguien va
      a doblar cinco cupones más.

      La mediana del resorte **no** pasa por la puerta: estimarlo con lo que
      haya está bien, afirmar que depende del ángulo no. Son dos preguntas.
- [x] **[M13 recortado] Tolerancia no solo por color · [S]** — hecho 2026-09-08.
      Un signo detrás de la cifra: `!` pasada de tolerancia, `!!` más del doble.
      Es la MISMA escala que reparte `cls()`, así que no hay un criterio nuevo
      que mantener.

      WCAG 1.4.1, y aquí no es un trámite: una de cada doce personas no
      distingue el rojo del verde, y estas tablas además se fotocopian en blanco
      y negro para llevarlas a la máquina. Va por CSS (`::after` sobre las
      clases) y no por HTML, así que cubre de una vez todos los sitios donde se
      usa `cls()` —tabla de desviación, cotas, fixture, tarjetas de pieza,
      barra de estado— sin tocar ni un `<td>`.

      Dos exclusiones a propósito: el sello de versión, que usa `v-bad` para
      decir «compilado sobre cambios sin confirmar» y ya lo dice con la palabra
      «+sucio»; y los `<input>`, que no admiten `::after` porque son elementos
      reemplazados, y donde el canal que no es color pasa a ser el TRAZO del
      borde (discontinuo). Lo demás de accesibilidad sigue diferido.
- [x] **[A8 recortado] `rebuildGroup(k)` · [O]** — **medido y descartado**,
      2026-09-08. El plan decía «solo si con el número real de piezas la escena
      va a tirones. Medir antes de optimizar», y la medición no se había hecho
      nunca, aunque `app.ts` expone `rebuildScene` y `renderer` justo para eso.

      Con **13 piezas medidas visibles** —la secuencia de puesta en marcha del
      plan— la mediana de siete reconstrucciones da **~18 ms**, sobre 270
      objetos en la escena, y eso corriendo en un headless con SwiftShader, que
      es más lento que cualquier portátil con GPU. El presupuesto para que
      teclear una celda no se sienta pegajoso es 250 ms: hay un factor 14 de
      margen. Partir la reconstrucción por capas sería optimizar lo que no
      duele, y encima añadiría un camino donde una capa puede quedarse vieja.

      La medición **queda como paso de banco**, no como una nota: si algún día
      deja de cumplirse, el banco lo dice en vez de que alguien lo note
      tecleando. De paso vigila que la escena no CREZCA al reconstruirla —si el
      vaciado de un grupo se dejara algo, cada edición añadiría objetos hasta
      agotar la memoria.

      Se corrigió al escribirla: la primera versión leía `renderer.info.memory`,
      que cuenta lo SUBIDO a la GPU y en un paso síncrono da cero. Parecía que
      medía algo y no medía nada. Ahora cuenta los objetos de la escena, que es
      lo que sí se puede observar sin dibujar un fotograma.
- [x] **[B1] Invertir la dependencia `panels/left.ts` → `app/history.ts` · [S]**
      — hecho 2026-09-08. Los paneles están por DEBAJO de `app/`, y un panel que
      importa de `app/` invierte las capas. Los dos contadores pasan a
      `ST.hist`, que es donde `history.ts` y el panel se encuentran sin que
      ninguno dependa del otro: los dos ya conocían `ST`.

      Es derivado y de pantalla, así que no entra en `toDoc()` y no gasta un
      paso de deshacer —hay una prueba que lo comprueba, porque si entrara,
      deshacer restauraría un contador y la pila se perseguiría la cola. El
      riesgo del cambio es una llamada a `sync()` olvidada en alguna de las
      cuatro funciones que tocan las pilas: el botón se quedaría con el número
      de antes y diría que no hay nada que deshacer cuando sí lo hay. También
      hay prueba.

      Ya no queda ningún archivo de `panels/` ni de `scene/` que importe de
      `app/`.

**FASE 3 CERRADA — 2026-09-08.** Los cinco puntos hechos. `npm run check` en
verde: 367 pruebas de motor, 177 pasos de banco, tipos limpios y el artefacto
correspondiendo a la fuente.

**Criterio de cierre:** la beta 1.0 se puede entregar al taller sabiendo qué versión es,
qué datos entraron, cuáles no se midieron y de dónde salió cada número.

---

## Puesta en marcha con material

No es trabajo de software. La única dependencia: **no empezar sin la Fase 0 cerrada**, o se
estará midiendo el error del programa y llamándolo propiedad del aluminio (hallazgo cruzado
X6 del informe). Secuencia mínima, ~13 barras:

1. **1 barra recta escaneada en el fixture** → flecha por gravedad y ruido real σ.
2. **3 cupones de un solo doblez**, dos niveles de ángulo, por orientación → `sbW`/`sbT`
   con n≥6.
3. **3 piezas completas con el mismo comando** → dispersión por doblez.
4. **Primer ciclo de lazo** con ganancia 0.6 y mediana de 3.
5. **3 piezas de verificación.**

Se puede recortar a 7–8 barras juntando los pasos 2 y 3 si el material escasea, a costa de
mezclar la dispersión del proceso con la del resorte.

---

## Diferido a después de beta 1.0

Recortado a propósito. Cuesta mucho, aporta poco **a esta versión**:

- **Capacidad de proceso (Cp/Cpk) y cartas de control.** Necesita ≥20 piezas para significar
  algo, y la beta va a ver 13. Cuando haya producción real, se retoma.
- ~~**Accesibilidad completa**~~ (tamaños de 24 px, `tabindex` en las filas, navegación por
  teclado de la tabla de desviación). **Los tres, hechos el 2026-09-08** en la Fase 4: los
  botones de solo icono llegan a 24×24 con su `aria-label`, las filas de capa a 24 px de
  alto, y la tabla de desviación se enfoca y se recorre con Enter y las flechas. Se midió
  con el rectángulo real en el banco, no comprobando que el CSS diga 24.
  Sigue diferido lo que queda: revisar el resto de la interfaz con un lector de pantalla de
  verdad, que es otra clase de trabajo y pide a alguien que lo use a diario.
- **Reutilizar los nodos de las etiquetas 3D** y la ruta dirigida de `paneComp`. Son
  rendimiento percibido; hoy nadie se ha quejado y no hay medición que lo respalde.
- **`InstancedMesh` para los PI.** Optimizar contra una carga imaginaria. Primero medir con
  el número real de piezas.
- **Pruebas de `state.ts`.** `history.ts` sí, porque ahí se pierden datos; `state.ts` es
  mayormente cableado.
- **Extractor de nube en Python (RANSAC).** ⛔ No escribir una línea hasta responder **A.3**:
  si el plan de inspección de ZEISS puede dar los puntos de intersección directamente, este
  módulo entero sobra.

## Fuera de alcance, punto

- **Framework de UI o reescritura de los paneles.** El requisito de un solo HTML offline es
  duro y ningún hallazgo se resolvería mejor así.
- ~~**Consolidar los dos motores en uno.**~~ **Revocado el 2026-09-08 por el dueño del
  proyecto, y en el sentido contrario al que decía este punto:** el motor de Python y su
  visor Tkinter salen del alcance enteros. Lo que aquí se descartaba era el trabajo de
  FUSIONARLOS —caro y arriesgado—; retirar uno no cuesta nada y quita la mitad del
  mantenimiento. El riesgo que cubría el segundo motor —que la cinemática derive en
  silencio— lo sigue cubriendo el fixture congelado de C3, que fue el argumento original.
  Consecuencia asumida: se pierde numpy/scipy a la mano para el extractor RANSAC; si algún
  día se escribe, se decide entonces en qué lenguaje.
- **Invertir los signos de ángulo o rodado.** Los actuales funcionan contra valores de
  máquina que no se pueden modificar. Se congelan, no se tocan.
- **Migrar `test_motor.js` a otro runner.** Funciona y las pruebas son honestas.
- **`noUncheckedIndexedAccess`.** El `tsconfig.json` ya explica por qué está apagada y el
  argumento sigue en pie.

---

## Alcance NUEVO — el amarre por pines laterales (2026-09-09)

**No sale de la auditoría**: lo pidió el dueño del proyecto y se apunta aquí para
que el plan siga siendo el único sitio donde está todo. Detalle completo en
`CONTEXTO_BARCOMP.md`, «El amarre: la barra sujeta por pines».

- [x] **Modelo de datos y solver · [O]** — `engine/pins.ts`. La barra sujeta se
      resuelve en el espacio de parámetros, con el reparto pesado por `EI/L`.
      `solveDense()` nuevo en `engine/math.ts`.
- [x] **Interruptor, y que sea de verdad un interruptor · [O]** — apagado,
      `restrain()` devuelve el mismo objeto que entró. Prueba de motor y paso de
      banco exigiendo diferencia CERO en los PI.
- [x] **Pestaña Amarre, capas del 3D, JSON y deshacer · [O]**
- [ ] **Contrastar el modelo contra una pieza real · [—]** — ⛔ depende de un
      escaneo de una pieza medida **con el fixture puesto** y del certificado del
      material. Sin eso, el modelo dice DÓNDE se concentra el esfuerzo y cuánto
      se mueve la punta, pero la magnitud en MPa lleva un material de manual.
      Es el mismo dato que espera M6 (la flecha por gravedad), así que van en el
      mismo correo.
- [ ] **Decidir qué es el nominal con la barra sujeta · [—]** — ⛔ pregunta de
      taller, no de software: el lazo compara hoy contra la pieza LIBRE, y con
      el amarre puesto eso corrige hacia una forma que la barra sujeta no puede
      tomar. Hay dos respuestas posibles —la forma que se quiere AL SOLTARLA o la
      que se quiere MONTADA— y cada una cambia el código.

---

## Retirada del motor de Python — 2026-09-08

**Decisión del dueño del proyecto**, tomada después de cerrar la Fase 3: lo que importa es
que la página web funcione bien y correctamente; el motor gemelo en Python y su visor
Tkinter no los usa nadie para eso, y salen del alcance.

Lo que se hizo en el repo, que es todo lo que había aquí dentro:

- `web/engine_dump.js` borrado — su único consumidor era `compare_engines.py`. Sale también
  de `tsconfig.json` y de `.gitignore`.
- Los comentarios que declaraban a `engine.ts`, `doc.ts`, `csv.ts`, `model.ts`,
  `kinematics.ts`, `app.ts` y `actions.ts` «gemelos» de `core.py`, reescritos. Uno de ellos
  —`csv.ts:88`— era una **deuda pendiente**: pedía llevarle a Python un cambio del lector
  que nunca se llevó. Esa deuda deja de existir.
- `README.md` y `CONTEXTO_BARCOMP.md`: las cuatro redes pasan a tres, §9 deja de ser «La
  versión Python» y conserva lo que sí era del motor —variantes y edición de puntos—, ahora
  en camelCase.
- El criterio de aceptación del motor pasa a ser el **fixture congelado** de C3, escrito
  donde antes estaba `compare_engines.py`.

**Dónde acabó:** el 2026-09-09, por decisión del dueño del proyecto, la carpeta se movió de
`Twister Register Python/` a **`BARCOMP Python/`**, hermana de este repo y fuera de él. No se
borra: queda como un proyecto aparte que ya no se toca. El aviso sigue escrito en §9 del
contexto — está en `barcomp/2.2` y su `load_json()` nunca miró el esquema, así que no sirve
para abrir archivos de producción.

**Lo que se pierde, dicho a las claras:** la verificación cruzada entre dos implementaciones
independientes, que es más fuerte que un fixture —un fixture congela lo que HOY sale, y si
hoy está mal, congela el error. Se acepta porque los signos ya están congelados a propósito
(§11, «Decisión que manda sobre todo lo demás») y porque el segundo motor llevaba semanas
sin actualizarse: la Fase 0 y la Fase 1 no se replicaron nunca en `core.py`, así que la
red cruzada ya solo cubría la cinemática, no las guardas.
