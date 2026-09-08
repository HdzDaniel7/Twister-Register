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

Objetivo: que el programa deje de producir números que parecen correctos sin serlo, y que
se pueda saber qué versión produjo cada número. **Ninguna barra real se dobla con esto
abierto.**

- [ ] **[C7] Sello de versión en la página · [O]** — marcador `/*__VER__*/` en
      `src/shell.html`, sustituido en `build.mjs` por `git rev-parse --short HEAD` + fecha,
      pintado en la barra de estado. · S · Va primero: sin esto, ningún otro arreglo se
      puede rastrear hasta una copia concreta.
- [ ] **[C3] Congelar el comportamiento actual · [O]** — subir `SCHEMA` a `barcomp/2.3`
      (los signos cambiaron respecto de lo que otros archivos `2.2` pudieran contener) y
      crear `web/test/fixtures/` con un JSON y sus PI esperados escritos a mano, **tomados
      del comportamiento de hoy, que es el que funciona**. Aserción de coordenadas en
      `test_motor.js`. · M · Regla que queda escrita: tocar `ANG_DIR`/`ROT_DIR` obliga a
      subir `SCHEMA` y a regenerar el fixture a propósito, nunca por accidente.
- [ ] **[A5] Rechazar esquemas desconocidos · [S]** — `SCHEMA_LEGACY` existe y no se usa;
      hoy `barcomp/9.9` se lee como cinemática 1.0. Dos líneas y una clave i18n. · S
- [ ] **[C1 + A4] Alineación de rama y umbral físico del eje · [O]** — `alignBranch(meas,
      nom)` en `measuredModel()`, `deviations()`, `bendStats()` y `medianPart()`; en `ik()`,
      si el doblez es menor que el ruido lo declara "eje no observable" y hereda `prevRot`.
      Prueba que barre el eje de 85° a 95° con ruido. · M · **Es el hallazgo más grave de la
      auditoría** y van juntos: separarlos deja medio mecanismo en pie.
- [ ] **[C2 parcial] Blindar el CSV con lo que se sabe hoy · [O]** — sin el archivo real no
      se puede mapear por nombre, pero sí se puede **rechazar lo ambiguo**: exigir 3 o 4
      columnas numéricas por línea y rechazar la línea si el patrón se rompe (en vez de
      recortar por la derecha), detectar coma decimal, y verificar
      `pts.length - 2 === bends.length` avisando el desajuste. · M · El mapeo por cabecera
      llega en la Fase 2, cuando llegue el archivo.
- [ ] **[C5] SIM/MED visible en Compensar · [S]** — `srcTag()` en el encabezado de la tabla
      de comandos y en la barra de estado; `warnbox` si hay piezas simuladas en el lazo; la
      insignia también en el reporte impreso. · S · La función y las claves ya existen.
- [ ] **[C6] Marcar los dobleces sin medir · [O]** — guion en vez de `+0.000`, fila
      atenuada, celda no editable, contador "medidos 10/15". · M · Toca la lógica de
      `compensate()`, no solo la vista.
- [ ] **[C8] Aviso al cerrar con cambios sin guardar · [S]** — `beforeunload` con documento
      sucio. · S
- [ ] **[A1] Guardas del lazo · [O]** — banda muerta, tope de Δ por ciclo, ganancia máxima
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
- [ ] **[A2] `gainR` y `gainF` propios · [O]** — el rodado se corrige a ganancia 1.0 y el
      avance con la constante del resorte.
- [ ] **[M8] `esc()` en las etiquetas 3D y validar colores al cargar · [S]**
- [ ] **[M9] Guardas y lista blanca en `change.ts` · [S]**
- [ ] **[M10] Leer los tokens CSS una vez fuera del bucle de la cinta · [S]**
- [ ] **[A10] Banco de UI portable · [S]** — `EDGE` por variable de entorno, ruta relativa,
      `engines: node >=22.18`. Prerrequisito del CI.
- [ ] **[M14] Fijar exacto esbuild y typescript · [S]** — prerrequisito del CI, o el diff
      del artefacto da falsos positivos.
- [ ] **[M15] `LICENSE` y atribución de three.js · [S]**
- [ ] **[B2] Un solo `$()` · [S]** · **[B3] Validar el slice de `tokenize` · [S]** ·
      **[B4] Corregir los comentarios que contradicen al código · [O]** ·
      **[B5] Barrer los perfiles de Edge huérfanos · [S]**

**Criterio de cierre:** un lote con un archivo ilegible dice cuál falló y sigue con el
resto; deshacer una importación cuesta un Ctrl+Z; ningún error visible es una excepción de
JavaScript; `npm run check` corre en otra máquina.

---

## Fase 2 · Estructural — cuando lleguen los datos

Cada punto dice de qué respuesta depende. Hasta entonces, no se empieza.

- [ ] **[C2 completo] Mapeo de columnas por cabecera · [O]** — ⛔ depende de **A.1** (un
      export real). Con el archivo delante: leer encabezado, mapear por nombre, y un diálogo
      que muestre las columnas detectadas, los tres primeros puntos y el conteo antes de
      crear el dataset.
- [ ] **[C4] Prealineación de la nube al nominal · [O]** — ⛔ depende de **A.4** (qué
      alineación y qué datum). Si el export ya viene alineado al CAD, esto se reduce a
      verificar el residual; si viene en coordenadas de escáner, hay que llamar al
      `kabsch()` que ya existe y resolver el giro sobre x. Añadir `'end'` a `DatumMode`
      reutilizando `anchorTransform`.
- [ ] **[B1/B2] Exportación de comandos a la máquina · [O]** — ⛔ depende de **B.1 y B.2**.
      Hoy no existe ninguna y los números se pasan a mano. Si la máquina lee CSV, es una
      función de 30 líneas junto a `expts`; lo caro no es escribirla, es acertar con las
      unidades y los signos. **Alto valor por poco esfuerzo en cuanto llegue el formato.**
- [ ] **[A9 + A11] CI que verifica el artefacto · [S con revisión de O]** — workflow con
      `npm ci && typecheck && test && build && git diff --exit-code -- index.html`. Depende
      de M14 (Fase 1) y de decidir **D3** (¿`index.html` se versiona o se genera al
      desplegar?). El fixture congelado de C3 es lo que le da sentido.
- [ ] **[M6] Medir la flecha por gravedad · [—]** — ⛔ depende de **A.5** (un escaneo de
      barra recta en el fixture). **Cero código**: es una medición que se mete como offset
      del nominal. Probablemente explica el estancamiento a ~5 mm en la punta.
- [ ] **[M16 / D4] Dónde viven los JSON de piezas reales · [—]** — el repo es público. No
      es decisión técnica.

**Criterio de cierre:** un export real de ZEISS entra al visor sin retoque manual y las
desviaciones que muestra coinciden con las que calcula el informe de inspección; el comando
corregido sale en el formato que la máquina lee.

---

## Fase 3 · Cierre de beta 1.0

Lo mínimo para que la beta se pueda usar sin supervisión.

- [ ] **[M12] Pruebas de `history.ts` · [O]** — `snapshot(restore(s)) === s`, tope de 50
      pasos, importar+deshacer. Es donde vivirán los datos reales y hoy no lo cubre nada
      salvo el banco de Edge. Solo `history.ts`; `state.ts` puede esperar.
- [ ] **[M4] Resorte con n≥5 y dos niveles de ángulo · [O]** — hoy el aviso de dependencia
      dispara con `|r|>0.6` sin puerta de `n`, y con n=3 eso es ruido. Es la diferencia entre
      un `sbW` que significa algo y uno que no.
- [ ] **[M13 recortado] Tolerancia no solo por color · [S]** — un glifo o fondo en las
      celdas fuera de tolerancia. **Solo esto**: el resto de accesibilidad se difiere.
- [ ] **[A8 recortado] `rebuildGroup(k)` · [O]** — solo si con el número real de piezas la
      escena va a tirones. Medir antes de optimizar.
- [ ] **[B1] Invertir la dependencia `panels/left.ts` → `app/history.ts` · [S]**

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
- **Accesibilidad completa** (tamaños de 24 px, `tabindex` en las filas, navegación por
  teclado de la tabla de desviación). Se queda solo el glifo de fuera de tolerancia, que es
  el que evita un error de lectura.
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
- **Consolidar los dos motores en uno.** El riesgo real —que diverjan en silencio— lo cubre
  el fixture congelado de C3 por una fracción del costo.
- **Invertir los signos de ángulo o rodado.** Los actuales funcionan contra valores de
  máquina que no se pueden modificar. Se congelan, no se tocan.
- **Migrar `test_motor.js` a otro runner.** Funciona y las pruebas son honestas.
- **`noUncheckedIndexedAccess`.** El `tsconfig.json` ya explica por qué está apagada y el
  argumento sigue en pie.
