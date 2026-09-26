# Plan por fases — BARCOMP beta 1.0

Este documento es el **rastreador de tareas**: lo que está abierto, lo que espera una
respuesta y lo que se decidió no hacer. Lo cerrado se lista en una tabla con su commit.

**El porqué largo de cada cambio está en los mensajes de commit**, que en este repo son
ensayos con cifras. Las cifras medidas y las decisiones que siguen gobernando el código de
hoy están en `CONTEXTO_BARCOMP.md` §11, que es donde mira quien va a tocar el motor.

Los informes que originaron las fases están en [`historico/`](historico/): el del
[2026-09-07](historico/informe-2026-09-07.md) (hallazgos C·A·M·B), el del
[2026-09-10](historico/informe-2026-09-10.md) (hallazgos X·FIS·UX·ARQ·PERF·QA) y el
[mapa](historico/mapa.md) del proyecto a esa fecha.

## Reparto de modelo

| Marca | Quién | Qué tipo de trabajo |
|---|---|---|
| **[O]** | Opus | Cinemática, decisiones de esquema, parser de datos externos, diseño del lazo, arquitectura. Cosas donde equivocarse cuesta caro y el contexto del dominio manda. |
| **[S]** | Sonnet | Ediciones mecánicas de alcance cerrado: CSS, i18n, aplicar `esc()`, deduplicar, rutas portables, guardas de existencia, comentarios, mensajes de error. Trabajo donde el criterio ya está tomado y solo hay que ejecutarlo bien. |

Regla práctica: si el arreglo se puede describir en una frase sin ambigüedad y no toca
números que van a la máquina, es de Sonnet. Si hay que decidir algo, es de Opus.

**Decisión que manda sobre todo lo demás:** los signos de ángulo y rodado actuales **no se
tocan**. Funcionan contra valores de máquina reales que no se pueden modificar. Están
congelados en el fixture de pruebas; tocar `ANG_DIR` o `ROT_DIR` obliga a subir `SCHEMA` y a
regenerar el fixture a propósito.

---

# ABIERTO

## El amarre por pines laterales — lo que queda

Detalle del mecanismo en `CONTEXTO_BARCOMP.md`, «El amarre: la barra sujeta por pines».

- [ ] **Contrastar el modelo contra una pieza real · [—]** — ⛔ depende de un
      escaneo de una pieza medida **con el fixture puesto** y del certificado del
      material. Sin eso, el modelo dice DÓNDE se concentra el esfuerzo y cuánto
      se mueve la punta, pero la magnitud en MPa lleva un material de manual.
      Es el mismo dato que espera M6 (la flecha por gravedad), así que van en el
      mismo correo. El material se pide en **C.4**, contestada el 2026-09-21 con «no lo
      tengo a la mano»: sigue pendiente, no descartada, y `MAT_DEFAULT` sigue siendo de
      catálogo.
- [x] **Decidir qué es el nominal con la barra sujeta · [O]** — **decidido el 2026-09-21**
      con la respuesta a **C.3**: la forma que se quiere es la **MONTADA**, porque la pieza se
      compara contra el CAD dentro del fixture. De las dos respuestas posibles que llevaban
      desde el 09-09 sobre la mesa, esta. Y el taller añadió el criterio que la hace
      coherente: se ajusta hasta que la forma libre asiente perfecto, así que la libre no es
      un objetivo rival — es donde se comprueba que ya no se está forzando nada.
      La decisión está tomada; **lo que falta es aplicarla**, y es la tarea «Compensar tiene
      que corregir contra la forma ASENTADA», abajo.

## La carga — lo que queda

Detalle en `CONTEXTO_BARCOMP.md`, «La carga».

- [ ] **Contrastar contra una pieza real · [—]** — ⛔ mismo dato que espera el
      amarre y que espera M6: un escaneo con el fixture puesto. Va en el mismo
      correo. Lo que se puede contrastar hoy es la coherencia interna (estática,
      invariantes, orden de magnitud), no la pieza.
- [ ] **Lo que la reacción de un apoyo puede prometer · [—]** — medido el 2026-09-19, no es
      una tarea: es un límite que hay que citar antes de discutir cualquier newton de esta
      pantalla. Junto a la mordaza la barra es más rígida que el muelle de contacto, así que
      subir un pedestal δ mete κ·δ en la pieza —**6.16 N por micra**— y con 0.05 mm en UN
      apoyo el total pasa de 26.8 N a **333.5** sobre una pieza de 23.7. Lejos de la mordaza
      el mismo δ mueve 0.5 N. O sea que ni la reacción suelta ni su SUMA son propiedades de
      la pieza: son la pieza más lo que el fixture le esté metiendo. Lo que sí sobrevive a un
      flexómetro es el peso y si toca o no. Está en `tools/demo_carga.mjs` §6, en tres
      pruebas de motor y en el tooltip de la columna Reacción. ⛔ Para dar reacciones de
      verdad hace falta un fixture medido en MICRAS, que es otra petición al taller y va en
      el mismo correo que el escaneo. **C.1 contestada el 2026-09-21, y la respuesta es la que
      la pregunta no esperaba:** el fixture real **sí** está puesto en micras — lo que no hay
      son las medidas, así que aquí se teclean a ojo. O sea que el límite no se relaja ni un
      newton: el fixture es fino y este programa no sabe dónde está. Sigue esperando **A.5**,
      y ahora se sabe que el dato existe y es cuestión de que lo midan.

- [x] **[PERF-01] Cuántos dobleces aguanta el solver de la carga · [O]** — el hallazgo
      **nunca se escribió**: nace colgando en `8759820`, citado en las preguntas abiertas
      del informe del 09-10 y sin texto detrás, y con él se quedó esperando nueve días una
      respuesta de taller para cerrar algo ilegible. Medido el 2026-09-19 en
      `tools/demo_escala.mjs`: en una barra de ~1.8 m, `settle()` cuesta **49 ms con 15
      dobleces, 134 con 30, 954 con 34 y 16 s con 60**, contra un presupuesto de 250 ms. Lo
      que se dispara es la CONVERGENCIA —de 3–4 vueltas a 17 y a 100— y por encima de ~34
      aparecen casos con `ok = false`, que el visor sí dice. La escena y el amarre no se
      enteran: `buildPath` sigue en centésimas de milisegundo a 60 dobleces. Y no es por
      juntar los dobleces: con el número quieto en 30 y el avance de 35 a 150 mm el coste se
      mueve entre 141 y 222 ms. **Manda el número de dobleces.** Tres pruebas de motor lo
      clavan en VUELTAS y no en milisegundos, que no dependen de la máquina.
      **La mitad que no dependía del taller está hecha (2026-09-19):** por encima de
      `LOAD_SLOW_BENDS = 30` la pestaña Amarre avisa de lo que va a costar, con el
      interruptor apagado, que es cuando sirve para decidir.
      **C.6 contestada el 2026-09-21, y cierra ESTA tarea:** la pieza real ronda los 30
      dobleces, o sea 134 ms contra 250 de presupuesto. Una pieza cabe. Lo que la respuesta
      abre es la tarea de abajo, que es otra cosa y hay que medirla antes de opinar.

- [ ] **Cuántas BARRAS A LA VEZ aguanta el solver · [O]** — abierta el 2026-09-21 por la
      respuesta a **C.6**: «cerca de 30 [dobleces], pero pueden haber muchas barras a la vez,
      por lo que debe ser eficiente en recursos para tener un buen rendimiento». El número por
      pieza está medido; el de varias no. Lo único que hay es de refilón y con 15 dobleces
      —«el amarre de seis modelos pasa de 84 a 98 ms»— y ahí los seis no llevaban carga. A 30
      dobleces una sola pieza son 134 ms, así que **si el coste se suma, dos piezas se comen el
      presupuesto**. Que se sume o no es lo que hay que medir, y `heldCache` puede estar
      tapándolo. **No depende del taller: es una medición y va antes de cualquier
      optimización**, por la regla de esta casa —lo mismo que pasó con `paneComp` y con
      `InstancedMesh`, que se aplazaron confirmados con cifra—. Hasta que haya tabla, el
      aviso de `LOAD_SLOW_BENDS` cuenta dobleces de UNA pieza y no sabe cuántas hay.

- [ ] **Compensar tiene que corregir contra la forma ASENTADA · [O]** — abierta el 2026-09-21
      por **C.3**, que era la pregunta abierta desde el 09-09. Hoy Compensar corrige
      **siempre** contra la libre y desde el 2026-09-19 lo avisa; el taller mide en el fixture
      y contra el CAD en sitio, así que la referencia que toca es la asentada. Va **junta con
      C.7** —los interruptores no se exponen en Compensar— o las dos respuestas se
      contradicen: la idea es que Compensar use la referencia correcta sin que nadie se
      acuerde de encender nada. Toca `shownModel()` / `refHeldOn()`, que son el sitio único
      donde se decide esto, y **cambia lo que se manda a la máquina**, así que va con su
      medición y sin mezclarla con nada más.

- [ ] **Quitar el punto ciego de los tramos rectos · [—]** — hoy las incógnitas
      son los codos de las ESTACIONES, así que una recta no se cuelga por el
      medio y esa parte la da `engine/sag.ts` aparte. Cerrarlo pide incógnitas
      dentro de los tramos, que la cinemática LRA no sabe describir sin inventar
      dobleces que no existen. **No se hace mientras no haya una medida que lo
      exija**: el número que falta ya se está dando, en otra columna y con su
      nombre.
- [x] **El apoyo del pedestal solo mira de abajo arriba · [O]** — **cerrado el 2026-09-18**
      con FIS-10b, que era el mismo trabajo. Un apoyo es una CARA y el hueco es la distancia
      con signo de la sección a ella, así que la barra a plomo que roza el costado de la cuna
      ya entra en la cuenta. Lo que se movió detrás, que es lo que hacía que no se pudiera
      empezar a medias: `bears()`, la columna «Hueco», el brazo de la palanca, el aviso de
      choque, el dibujo 3D de la cuna —que se dibujaba con el seno cambiado de signo y bajo un
      tramo empinado apuntaba a 79° de donde la física la ponía—, la siembra de pedestales y
      el barrido de casos. Del barrido: **4 de 135 no caben, el peor se mete 82.3 mm, y las 4
      lo dicen** (eran 3 hasta FIS-10c, que movió unas micras dónde se posa la pieza sujeta);
      antes de `PedFit.deep` ese aviso era mudo por encima del radio de la sección.

- [x] **La tabla de longitudes no cuadraba hacia abajo · [O]** — **arreglado el 2026-09-22**,
      a raíz de «revisa las longitudes de la pestaña de L y sumatoria de L». El motor NO se
      equivocaba: `developedLength()` contra el camino 3D refinado da 1861.8670 contra
      1861.8670, y `dev − PIaPI` es exactamente `−Σ(2·trim − arco)`. Lo que no cuadraba era lo
      que se pintaba, en dos sitios:
      1. La **cola** se tecleaba de PI a PI en la cabecera y el pie la daba de tangencia a
         tangencia, las dos llamándose «Cola»: 160.00 arriba, 154.66 abajo. Sumar el último
         `Σ L` más el campo se iba **5.34 mm**, que es el `trim` del último doblez. Ahora se
         teclea en el PIE, bajo `Recta`, en la misma unidad que las demás.
      2. El `Δ` de la columna `Recta` enseñaba el `Δ` del **avance**. La recta no es un campo
         guardado —sale del avance menos los dos trims— así que un `Δ` de ángulo la mueve sin
         tocar ningún avance: 1.5° en B5 acorta **0.869 mm** la recta de B5 y otro tanto la de
         B6, y `Σ L` subía 0.869 menos de lo que sumaba la fila. Pasa a llevar `Δ` de RECTA.
      Y el rojo de la `Recta` pasa a juzgar la recta EFECTIVA, la misma que juzga
      `feasNote()`. **No sube el esquema**: no cambia ni un dato guardado.
      Lo que NO se tocó, porque no da un resultado incorrecto en ninguna pieza que el
      programa acepte: `trimOf()` topa θ en 170° —para no reventar en la asíntota de
      `tan(θ/2)`— y el arco usa θ sin topar; a 175° el trim se queda en 342.90 y el arco sigue
      creciendo hasta 91.63. Las dos mitades de la fila usan θ distinta, pero topar el arco
      sería dibujar un doblez de 170 donde el modelo dice 175, y esas piezas ya salen
      listadas por `overBent()`. Y `TRIM_KEYS` incluye `'rot'` aunque el trim no dependa del
      rodado —`bendDecomp()` saca θ solo del ángulo—: editar el rodado entra al camino de
      recolocar avances para nada, y sale el mismo avance. Creencia vieja de cuando `rot` era
      componente de doblez; se quita en una pasada que no cambie comportamiento.

- [x] **Las longitudes se cuentan sobre la FIBRA NEUTRA, no sobre el centro · [O]** —
      **hecho el 2026-09-22**, segunda pasada del mismo día que la entrada de arriba. `L`,
      `Σ L`, la longitud del pie y las columnas `arc`/`cum` del CSV de máquina dejan de
      contarse sobre el centro de la sección —el CLR con el que se calan las matrices— y
      pasan a contarse sobre la fibra neutra: al doblar la cara de fuera se estira y la de
      dentro se recalca, y la fibra que ni una cosa ni la otra se corre HACIA DENTRO del
      doblez, así que cortar por el centro es cortar de más. Hasta ahora el programa
      trabajaba con K = 0.5 clavado, sin decirlo. La cuenta: `R_fibra(i) = R_int(i) +
      K·t_ef(i) = radius(i) − (0.5 − K)·t_ef(i)`, `arco(i) = R_fibra(i) · θ(i)`, con `t_ef`
      lo que mide la sección EN EL PLANO del doblez —de plano el espesor, de canto el
      ancho—, que contesta `sectionDepth()`, la séptima pregunta de `engine/section.ts`. `K`
      la guarda la sección en `kMode`/`kFactor`: `center` (K = 0.5 fijo, el valor de
      partida, así que ningún archivo anterior mueve un número al abrirse), `din` (DIN 6935
      fila a fila: `k = 0.65 + 0.5·log₁₀(r/t)` topado en [0.65, 1], K = k/2 — pide una pieza
      con radios distintos) y `fixed` (la K tecleada, la misma para toda la pieza: la
      casilla para lo que se MIDA en el taller). Sobre DEMO-1700 (15 dobleces, 40×12, radios
      30 de plano y 45 de canto): centro **1861.867 mm**, K=0.45 → 1849.894 (−11.97 mm),
      K=0.40 → 1837.921 (−23.95 mm), fibra por DIN 6935 → **1825.431** (−36.44 mm, −1.96 %).
      De esos 36 mm, **29 los ponen las cuatro estaciones de canto**, que caen fuera del
      rango donde la DIN vale (r/t = 0.63, por debajo del 0.65 donde acaba la norma) y salen
      avisadas con un cuadro rojo que dice cuántas filas son. Dos avisos que quedan escritos:
      la DIN 6935 es de **chapa en plegadora**, no de curvado por estirado —una primera
      aproximación, algo mejor que suponer K = 0.5, no el número de esta máquina, por eso
      existe `fixed`—; y la longitud de corte no es la longitud de una curva, es
      **conservación de material** —la fórmula de la fibra neutra es el ajuste empírico con
      el que la industria la aproxima, y K es donde entra lo que no se sabe—. Sube el
      esquema a `barcomp/2.6`; `barcomp/2.5` entra en `SCHEMA_COMPAT` y se abre como
      `center`, sin mover un número — el sentido que obliga a subir es el otro: un 2.6
      guardado con la fibra por DIN, abierto por una copia anterior, se leería con la fibra
      en el centro y la barra saldría 36.44 mm más larga sin avisar. Lo que NO se tocó: ni
      un PI —`fk()`, `ik()` y `compensate()` no se enteran de que la fibra existe—; las
      RECTAS, que dan el mismo número en las dos cuentas; la **cola**, que no lleva arco; el
      `trim`, que sigue siendo la tangente del CENTRO porque dónde empieza el arco lo manda
      el herramental; y la cinta de abajo, los pedestales, las marcas, los tramos del STEP y
      el volumen que se escribe en el STEP, que siguen midiendo por el centro porque miden
      sobre la pieza ya doblada y dibujada —el volumen del STEP es Pappus sobre una sección
      CONSTANTE, exacto, y no la barra real, que se adelgaza al doblar; poner ahí la de
      corte haría fallar `tools/check_step_freecad.py`—. Dos pasadas: `refactor: la barra
      que se GASTA se separa del camino que recorre el eje` —nace `engine/fibre.ts`, sin
      mover un número— y esta. El fixture congelado pasa a
      `web/test/fixtures/demo-2.6.json`: al regenerarlo, el `pis` salió idéntico carácter
      por carácter. Detalle completo en `CONTEXTO_BARCOMP.md` §11.

  Lo que queda abierto, y es lo que falta por contestar:

  - [ ] **Despejar la K real de esta máquina · [—]** — ⛔ pide medir la longitud de corte de
        una pieza REAL y compararla contra lo que predice cada K: es lo único que vuelve
        cierto el número. Hoy K sale de una norma de chapa en plegadora (DIN 6935), no de
        curvado por estirado ni de esta máquina — por eso existe `fixed`, la casilla para el
        valor medido en el taller.
  - [ ] **Dónde se trazan las marcas del fixture · [O]** — sin decidir: sobre la barra RECTA
        antes de doblar (y entonces la cinta también tendría que contar en fibra, no en
        centro) o sobre la pieza YA DOBLADA (y entonces se queda exactamente como está,
        midiendo por el centro porque mide sobre la pieza dibujada). Mientras no se decida,
        la cinta sigue por el centro, que es lo único que hoy se sabe cierto.
  - [ ] **El r/t de las estaciones de canto del demo cae fuera de la DIN · [—]** — 0.63, por
        debajo del 0.65 donde acaba la norma, y además es un doblez severo que en la máquina
        pediría mandril. La pantalla lo avisa con un cuadro rojo; no hay norma que lo
        sustituya sin la K medida de la tarea de arriba.

- [x] **Un `Δ` de ángulo dejaba de conservar las rectas de al lado · [O]** — **arreglado el
      2026-09-22, por la tarde**, a raíz del pedido del taller: «Cuando modifico
      compensaciones de los ángulos me modifica compensaciones de distancias, no debería de
      hacer eso, mi tabla se debería de conservar con los ajustes que yo dé». La columna `Δ`
      de `Recta` no guardaba lo que se tecleaba, lo CALCULABA —`straightDelta =
      recta(pieza) − recta(base)`—, así que un `Δ` de ángulo le comía trim a su recta y a la
      de al lado y la celda se encendía sola en dos filas que nadie había tocado. Medido en
      DEMO-1700 con un `Δ` de 1.5° en B5: las rectas de B5 y B6 pasan de 47.872 y 80.930 a
      47.003 y 80.061, 0.869 mm cada una. Decisión: se CONSERVAN las rectas y se recoloca el
      `Δ` de AVANCE, igual que `editBend()` ya hace en la base desde el 2026-09-17 — el
      avance es el estado que se guarda y el que va a la máquina, así que es el sitio
      correcto donde absorber que el doblez se lleve más barra. Con ese `Δ` la barra de
      corte pasa de MENGUAR 0.560 mm a CRECER **1.178 mm**, y el `Δ` en el último doblez lo
      paga `tailDelta` (−0.404 mm). Dos mitades: `engine/model.ts` gana `straightsAt()`,
      `holdStraights()` y `setDelta()`; `app/actions.ts` hace pasar `editDelta()` por
      `E.setDelta()` y `editBend()` captura `E.straightsAt()` antes de tocar la base y llama
      `E.holdStraights()` después — sin esto quedaba un residuo de 0.0026 mm al editar el
      ángulo en la base, mismo defecto en miniatura. Suelo de 1e-9 al escribir los `Δ` de
      avance. **No sube el esquema.** Comprobado y limpio: la pestaña Compensar no tenía
      este cruce (`compensate()`, `web/src/engine/compensate.ts` líneas 275-279). Nets:
      `node test_motor.js` 755 → 773 pruebas, `node tools/ui_test.mjs` 306 → 309 pasos.
      Detalle completo en `CONTEXTO_BARCOMP.md` §11.

- [x] **`rebuildScene()` clonaba geometría y soldaba aristas por cadenas de texto · [S]** —
      **hecho el 2026-09-22, por la noche.** Pasada de RENDIMIENTO PURO, sin cambio de
      conducta: `rebuildScene()` corre con CADA tecla que se pulsa en la tabla del modelo, así
      que su coste es el tirón que se nota al recorrerla. Tres arreglos en `web/src/scene/`:
      cada punto PI dibujaba su propia `SphereGeometry` CLONADA —`clone()` teselaba una esfera
      32×16 entera (561 vértices) solo para pisarla con la copia, 24 % del tiempo— y ahora
      comparte UNA sola, con lo que cambia por punto viviendo en la malla y el material (igual
      con los rombos de choque, cota y diferencia); `EdgesGeometry` soldaba vértices con tres
      cadenas de texto por triángulo en un objeto-diccionario, 41 % del tiempo (58 % ya sin lo
      de las esferas), y se reescribe (`edgesGeometry()`, `web/src/scene/geometry.ts`) con la
      soldadura una vez por VÉRTICE y un `Map` numérico en vez de cadenas, MISMO resultado —la
      clase de three se queda en el paquete a propósito para que el banco compare vértice a
      vértice con desvío 0—; y `barGeometry()` escribe directo en búferes tipados en vez de
      un `Vector3` por vértice que three volvía a copiar. Medido en `tools/probe_perf.js`
      (Edge headless, SwiftShader): 15 dobleces 2.70 → **0.70 ms**, 60 dobleces 9.30 →
      **2.00 ms**, 10 piezas medidas 13.95 → **2.00 ms**, geometrías en GPU con 10 piezas
      200 → **14** (las llamadas de dibujo siguen en 200). Caso pesado —30 dobleces + 4
      modelos + 3 piezas + carga y amarre—: `rebuildScene()` 39.42 → **8.85 ms**, teclear un
      ángulo en la tabla 41.57 → **11.88 ms**. Artefacto +1 830 B (+0.2 %), de los que unos 1 360 B
      son la clase `EdgesGeometry` de three que se queda solo para el banco. Medido y
      descartado en la misma pasada: `computeVertexNormals()` sobre las barras fantasma
      (6.6 %, arriesga una malla sólida sin normales, que sale negra); compartir también los
      materiales (0.2 %, hay un color distinto por punto); `InstancedMesh` para los PI, que
      sigue aplazado y está actualizado arriba, en «Diferido a después de beta 1.0». Nets:
      `tsc --noEmit` limpio, `node test_motor.js` 773 pruebas sin cambios (el motor no se
      toca), `node tools/ui_test.mjs` 309 → 312 pasos. Detalle completo en
      `CONTEXTO_BARCOMP.md` §11.

- [x] **`'rot'` sigue en DOS listas de claves de trim · [S]** — **hecho el 2026-09-25**: fuera
      de `TRIM_KEYS` y de `TRIM_DELTA_KEYS` a la vez, con la medida delante — 135 casos, peor
      cambio de avance 0.000e+0 mm; el mismo doblez a seis rodados da un solo trim. Entra una
      guarda en el banco; ningún paso puede fallar antes, porque la pasada es neutra. El
      porqué original, que sigue valiendo: creencia vieja de cuando
      `rot` era componente de doblez; el trim no depende del rodado —`bendDecomp()` saca θ
      solo del ángulo—, así que editar `rot` entra al camino de recolocar avances para nada
      y sale el mismo avance de vuelta. Hasta el 2026-09-22 estaba solo en `TRIM_KEYS`
      (`web/src/app/actions.ts`); con `holdStraights()` la lista se duplicó en
      `TRIM_DELTA_KEYS` (`web/src/engine/model.ts`), así que ahora hay que quitarlo de las
      DOS a la vez, en una pasada que no cambie comportamiento.

- [x] **El pedestal no gira en Z, y el sembrado lo gira contra la pieza · [O]** — **hecho el
      2026-09-21.** `Pedestal.yaw`, esquema `barcomp/2.5`, y la cuna deja de apuntarse sola.
      Lo que queda de esta entrada es el porqué, que sigue valiendo — pedido por
      el taller el 2026-09-21, al contestar **C.1**: «me gustaría que los pedestales también
      se pudieran rotar en z y no solo en el ángulo de inclinación, y no se movieran para
      forzar que coincidan girando contra mi pieza». Son **dos** cosas y la segunda es la
      que muerde.
      1. Falta un campo: el pedestal tiene `tilt` —cuánto se tumba— y no tiene GIRO en planta,
         así que la cuna no se puede apuntar. Es un campo por pedestal, como `pad`, y sube
         `SCHEMA`.
      2. El sembrado **elige** la orientación por su cuenta: coge la cuerda de lo que la cuna
         cubre (ver la tarea de abajo). Con un campo tecleado eso pasa a ser un valor de
         partida y no una imposición, y hace falta poder decir «déjalo donde lo puse». Es lo
         que el taller está pidiendo: en la mesa real la cuna está donde está.
      Lo que la respuesta a **C.1** añade, y vale más que el campo: **los pedestales del
      fixture real sí están puestos en micras** —lo que no hay son las medidas, así que hoy
      se teclean a ojo—. O sea que el límite de 6.16 N por micra sigue en pie tal cual: no es
      que el fixture sea basto, es que aquí no se sabe dónde está. Sigue esperando **A.5**.
- [ ] **La cuna no bascula y no siempre puede casar con la barra · [—]** — abierto al cerrar
      FIS-08 el 2026-09-18. La cuna es una chapa recta de `pad` × 44, y sobre una pieza
      curvada la recta que mejor casa con lo que cubre depende del largo de la cuna: sobre un
      codo de la demo, pasar de 20 a 200 mm de cuna mueve la inclinación que la barra pide de
      −48.7° a −63.4°. Hoy la siembra elige la cuerda de lo que la cuna cubre y la columna Δ
      dice lo que queda de desajuste, con `lift` para poder compararlo con una tolerancia; en
      la demo eso deja Δ por debajo de 0.004°. **Se decidió avisar y no modelar más**: las
      otras dos salidas son cunas más cortas donde la barra se curva —`pad` ya es un campo
      por pedestal, así que no cuesta código— o una cuna en V o basculante, que es modelo
      nuevo y campo nuevo en el esquema. **C.2 contestada el 2026-09-21: «no estoy seguro».**
      No cierra nada, y con eso la salida deja de ser modelar más: es **dejar que se teclee**.
      Va junta con la tarea de arriba —el giro en Z del pedestal— porque son el mismo arreglo
      mirado dos veces: si no se sabe qué cuna hay montada, el programa no puede deducir su
      orientación, y lo único honesto es que la ponga quien la ve. **La mitad del RUMBO está
      hecha el 2026-09-21** (`Pedestal.yaw`): la cuna ya no se apunta sola y quien la ve la
      teclea. Lo que sigue abierto es lo de arriba, que es otra cosa: el LARGO de la cuna
      contra una barra curvada, que es `pad` y sigue sin saberse qué cunas hay.


## Aplazado a futuras actualizaciones (decisión 2026-09-08)

Lo que depende de los modelos CAD y de los archivos de inspección. **No está
descartado: está esperando.** Cada punto dice qué respuesta lo despierta. Las peticiones
están en [`solicitud-datos.md`](solicitud-datos.md) y en los **tres** correos listos para
enviar — [metrología](correo-a-metrologia.md), [máquina](correo-b-maquina.md) y, desde el
2026-09-19, [taller](correo-c-taller.md), que es el que lleva el fixture, el material y los
criterios de aceptación; **es el único trabajo que desbloquea todo esto, y no es trabajo de
software.**

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
  de dobleces con la que se generó. **Sigue bloqueado: el dato va del taller hacia aquí.**
  Lo que existe desde el 2026-09-20 va en el otro sentido —«Pieza a STEP», la pieza como
  SÓLIDO (`engine/brep.ts`) más el eje y los PI de referencia— y no sustituye nada de
  esto; lo que hace es que quien tenga el CAD pueda superponer los dos sin que nadie
  teclee una tabla a mano.
- **[A.5] El escaneo de la barra recta certificada en el fixture** — convierte en
  medida la flecha estimada (M6), el amarre y la carga. Los tres esperan el mismo dato.

## Preguntas para el taller (bloquean o cierran tareas de arriba)

Desde el 2026-09-19 las que siguen abiertas viajan escritas en
[`correo-c-taller.md`](correo-c-taller.md), con la cifra que hace falta para entenderlas.
Aquí se quedan con el número que citan los mensajes de commit.

**Contestadas de viva voz el 2026-09-21, las nueve.** Tres cierran —**C.6** (≈30 dobleces,
pero muchas barras), **C.7** (los interruptores no van en Compensar) y **C.8** («haz lo que
quieras», y por eso el umbral se queda en 0)—; **C.3** cierra y abre trabajo, que es lo que
tenía que pasar; **C.1** cierra la parte de software y pide dos cosas nuevas; y **C.2**,
**C.4**, **C.5** y **C.9** se quedan abiertas porque la respuesta fue «no lo sé» o «dame
consejo», que es una respuesta legítima y **cambia qué hay que hacer**: donde el taller no
puede deducirlo, el programa tampoco, así que deja de ser algo que modelar y pasa a ser algo
que se teclea. El consejo pedido en C.9 está escrito abajo, en el punto 10.

Lo que sigue esperando al taller después de esto es **un solo dato y no nueve preguntas**:
el escaneo de **A.5** —con el fixture puesto y sus pedestales medidos— más el certificado del
material. Eso solo cierra C.4, C.5, el amarre, la carga y M6.

1. ~~**¿El fixture real tiene mordaza en el primer extremo?**~~
   **Contestada el 2026-09-15: sí.** X-04 cerrado con eso.
2. ~~**¿Cuántos dobleces tiene la pieza más grande que pasa de verdad?**~~
   **Contestada el 2026-09-21: cerca de 30 — pero muchas barras a la vez.** La mitad que se
   esperaba está bien: una pieza de ~30 dobleces cuesta 134 ms contra 250 de presupuesto, así
   que **PERF-01 se cierra por el lado de UNA pieza**. Lo que la respuesta abre es otra cosa,
   y no estaba medida: el coste con VARIAS piezas sujetas a la vez. Lo único que hay del
   2026-09-19 es de refilón —«el amarre de seis modelos pasa de 84 a 98 ms» con 15 dobleces— y
   ahí los seis no llevaban carga. Con 30 dobleces por pieza el solver está en 134 ms cada
   una, así que **dos piezas ya se comen el presupuesto si el coste se suma**. Si se suma o no
   es justo lo que hay que medir, porque `heldCache` existe y puede estar tapándolo. Tarea
   nueva, abajo, y **no depende del taller**.
3. ~~**¿`tol.point` = 1 mm es la tolerancia para decidir si un pedestal apoya?**~~
   **Contestada el 2026-09-15: de momento basta.** Si algún día hace falta una holgura
   propia, se cambia en un solo sitio: `bears()`.
4. ~~**Con la carga puesta, ¿la desviación se compara contra la forma libre o contra la
   asentada?**~~ **Contestada el 2026-09-21: contra la ASENTADA.** La pieza entra en un
   fixture y se compara contra el CAD **en sitio**, así que la forma que se juzga es la que
   toma sujeta. Y viene con el criterio de taller detrás, que es lo que de verdad cierra la
   pregunta: **se ajusta hasta que la forma LIBRE asiente perfecto en el fixture**, y a partir
   de ahí da igual cuál se mire porque las dos coinciden. O sea que la libre no es el
   objetivo: es el sitio donde se comprueba que ya no hace falta forzar nada.
   Lo que cambia en el código: hoy Compensar corrige **siempre** contra la libre y solo avisa
   (2026-09-19). Con esta respuesta, la referencia por defecto con un interruptor puesto es la
   asentada, y el aviso deja de ser un aviso y pasa a ser lo que hace. Tarea abajo.
5. **¿Cuánto cede el rodado de verdad con los pines puestos?** **Contestada a medias el
   2026-09-21, y la media que falta es la que importa:** «no estoy seguro, depende de la
   geometría y posición de los pines, no tengo forma de confirmarlo». Las dos mitades sirven.
   La segunda dice que **no llega número**, así que `ROT_STIFF_FAC = 0.5` se queda
   provisional y sigue esperando **A.5**, el escaneo. La primera dice algo del MODELO y no del
   dato: si de verdad depende de la geometría y de dónde están los pines, entonces una
   constante global es la forma equivocada de escribirlo, y ponerle el número exacto no lo
   arreglaría. Queda anotado y **no se toca todavía**: cambiar la forma del modelo sin una
   medida contra la que contrastarlo es cambiar de opinión, no de modelo. · sigue en **C.5**
6. ~~**¿Compensar debe poder ver y apagar el amarre y la carga**?~~ **Contestada el
   2026-09-21: no hace falta.** «Compensar es la compensación para cambiar geometría al
   detalle.» Los interruptores no se exponen ahí. Ojo con leerlo como «Compensar ignora el
   amarre»: junto con **C.3** dice lo contrario — Compensar usa la referencia que toca, la
   asentada, sin que nadie tenga que acordarse de encender nada. Las dos respuestas se
   aplican de una vez o se contradicen. · **C.7**
7. ~~**¿`CONTACT_K = 1e5` se validó contra una solución exacta** —viga con muelle rígido— o
   solo se contrasta consigo mismo vía `pene`?~~
   **Contestada el 2026-09-16: es una cifra, no un artefacto.** `npm run demo:carga` monta
   el caso de un grado de libertad —barra recta, una estación, un pedestal— cuya reacción
   sale de la estática de sólido rígido, `R∞ = w(L−a)²/2d`. De minimizar
   `½K·u² + Q·u + ½κ(J·u)²` sale `δ = |J·u|` con `u = −Q/(K+κJ²)`: predicho **1.9158e-4 mm**,
   medido **1.9159e-4**, y la reacción 5.7208 N contra 5.7212 de la estática. El sesgo que κ
   mete es exactamente `K/(K+κJ²) = 7.6e-5`. Lo que manda no es κ sino **κJ²/K**, y como J es
   el brazo, acercar el apoyo a la estación barre cuatro décadas de κ equivalente sin tocar
   la constante: la fórmula sigue al solver con error < 0.5 % hasta κ ≈ 16, y lo primero que
   se rompe es la linealidad de `gap`, no el muelle. Queda clavado en tres pruebas de motor
   y en el banco.
8. *(la disyuntiva `theta` vs. fila se movió al punto 10, con el consejo pedido.)*
9. **¿Cuál es la norma de radio mínimo de tubo?** **Contestada el 2026-09-21: «haz lo que
   quieras con ella».** Y por eso `tubeRfac` **se queda en 0**, que es «no vigiles esto». No
   es pereza: es la regla que ya estaba escrita en `engine/lims.ts` desde que el campo nació.
   Una cifra elegida por mí tendría cara de dato y sería una opinión, y este campo decide
   qué pieza se RECHAZA. El aviso de la pestaña Sección seguirá diciendo con palabras que el
   programa no lo juzga, y el campo está ahí para quien traiga la norma. **Cerrada sin tocar
   código, y el motivo es el valor de la respuesta.** · **C.8**
10. **Cuando `dev.theta` y la desviación por fila discrepan, ¿cuál manda?** **El taller pide
   consejo el 2026-09-21.** Lo que se puede aconsejar con lo que hay, y el argumento sale de
   **C.3**: no compiten, contestan preguntas distintas y las dos hacen falta.
   - la **fila** dice QUÉ DOBLEZ arreglar. Es la que se mira para tocar la máquina, y es la
     que tiene que llevar la tolerancia de aceptación;
   - **`theta`** dice si la PIEZA sirve. Es global, y una pieza con todas las filas dentro
     puede acumular error y no entrar en el fixture.
   El consejo, entonces: **acepta por la fila, diagnostica por `theta`, y si `theta` se sale
   con todas las filas dentro, eso no es una discrepancia — es que el criterio de la fila es
   demasiado ancho para esta pieza.** Y como el taller mide EN EL FIXTURE (C.3), las dos se
   tienen que leer sobre la forma ASENTADA o no describen lo que se está mirando. Falta la
   cifra: la tolerancia de la fila. Esa sí es del taller. · sigue en **C.9**

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

## Valores PROVISIONALES en circulación

Cada uno en un solo sitio y con la respuesta que espera anotada. Los **umbrales** —los que
deciden qué se rechaza y de qué dato se desconfía— se teclean desde la Fase 4 en la pestaña
**Límites** y viajan en el JSON, así que un archivo dice con qué umbrales se juzgó esa pieza.
Los dos últimos NO: mueven la forma, no la juzgan. El material se teclea en su pestaña y
viaja en el archivo; la rigidez de rodado es una constante del motor, y tocarla es cambiar
el modelo, no ajustar una tolerancia.

| Valor | Sitio | Espera |
|---|---|---|
| `AXIS_MIN_DEG = 1.0` | `engine/lims.ts` | A.6 — la σ del escaneo; la regla es `atan(3σ/avance)` |
| `COMP_DEFAULT.dead = 0.05` | `engine/lims.ts` | A.6 — elegido por debajo de la tolerancia típica |
| `PI_MIN_MM = 1.0` | `engine/lims.ts` | A.6 — es `5σ` |
| `STRAIGHT_MIN_MM = 25` | `engine/lims.ts` | B.2 — es una cota de la MÁQUINA (mordaza + carrera) |
| `E`, `ρ`, `yield` del material | `engine/pins.ts` (`MAT_DEFAULT`) | el certificado; hoy son de catálogo |
| rigidez de rodado `ROT_STIFF_FAC = 0.5` | `engine/pins.ts` | C.5; la sección da 1.22. Estuvo tecleado a mano en `pins.ts` **y** en `load.ts`, que es donde el cambio se iba a quedar a medias: desde el 2026-09-19 es un solo número y hay prueba que lo clava |
| `tubeRfac = 0` (no vigilar) | `engine/lims.ts` | **C.8 cerrada 2026-09-21: «haz lo que quieras».** Se queda en 0 a propósito — una cifra mía sería una opinión con cara de dato, y este campo rechaza piezas |

---

# DIFERIDO Y FUERA DE ALCANCE

## Diferido a después de beta 1.0

Recortado a propósito. Cuesta mucho, aporta poco **a esta versión**:

- **Capacidad de proceso (Cp/Cpk) y cartas de control.** Necesita ≥20 piezas para significar
  algo, y la beta va a ver 13. Cuando haya producción real, se retoma.
- **Accesibilidad con lector de pantalla real.** Los blancos de clic, los `aria-label`, el
  recorrido por teclado, `scope` y `role="alert"` están hechos (Fase 4 y UX-07). Lo que queda
  es revisar la interfaz con alguien que use un lector a diario, que es otra clase de trabajo.
- **La ruta dirigida de `paneComp`** (M11): Compensar reconstruye la tabla entera por celda.
  Era «rendimiento percibido, sin medición que lo respalde» — la misma forma que tenía
  PERF-01. **Medido el 2026-09-19** en `tools/probe_comp.js`: confirmar una celda Δ cuesta
  **1.6 ms con 15 dobleces** y **8.7 ms en el peor caso que se puede armar** —60 dobleces con
  las tres correcciones encendidas, 180 celdas y 52.9 KB de `#panes`—, contra un presupuesto
  de 250 ms. Y el coste es del DOM: `compensate()`, que `editTweak()` hace y `paneComp()`
  repite, tarda **0.01 ms**, el 0.1 % del total, así que la ruta dirigida no atacaría lo que
  parecía caro. Da igual en qué celda se escriba. **Se aplaza confirmado, con cifra.**
- **`InstancedMesh` para los PI.** Era «optimizar contra una carga imaginaria; primero medir
  con el número real de piezas». El número real sigue siendo del taller, pero **la curva está
  medida (2026-09-19)** en `tools/probe_perf.js`, con 15 dobleces: **1 pieza visible 3.9 ms ·
  3 piezas 6.5 ms · 10 piezas 14.0 ms**, o sea ~1.1 ms por pieza añadida y 187 mallas de PI
  con diez. Diez piezas a la vez —más de las que va a ver la beta entera, que son 13 barras—
  caben en un cuadro de 60 Hz y están diecisiete veces por debajo del presupuesto de 250 ms.
  **Se aplaza confirmado**, y si el taller dice un número mayor se interpola de esa tabla.
  **Vuelto a medir el 2026-09-22, por la noche**, tras compartir la geometría de la esfera
  entre todos los PI (ver más abajo): con 10 piezas, `rebuildScene()` baja de 14.0 a **2.00
  ms** y las geometrías en GPU de 200 a **14**, pero las LLAMADAS DE DIBUJO siguen en 200 —
  seguían sin ser el cuello, el coste estaba en construir y destruir geometrías, y eso ya
  está resuelto por otra vía—. `InstancedMesh` bajaría las 200 llamadas a unas pocas, pero
  cambia el picking, que hoy lee `userData.pi` de cada malla. **Sigue aplazado**, ahora con
  menos margen de duda: lo que quedaba por explicar (las 200 llamadas) ya no es el gasto
  dominante.
- **Pruebas de `state.ts`.** `history.ts` sí, porque ahí se pierden datos; `state.ts` es
  mayormente cableado.
- **Extractor de nube en Python (RANSAC).** ⛔ No escribir una línea hasta responder **A.3**.

## Fuera de alcance, punto

- **Framework de UI o reescritura de los paneles.** El requisito de un solo HTML offline es
  duro y ningún hallazgo se resolvería mejor así.
- **El motor de Python.** Retirado del alcance el 2026-09-08 por decisión del dueño
  (`4945f6b`); la carpeta vive desde el 09-09 en `../BARCOMP Python/`, fuera de este repo, y
  no se toca. Lo que se pierde y por qué se acepta está en `CONTEXTO_BARCOMP.md` §11.
- **Invertir los signos de ángulo o rodado.** Los actuales funcionan contra valores de
  máquina que no se pueden modificar. Se congelan, no se tocan.
- **Migrar `test_motor.js` a otro runner.** Funciona y las pruebas son honestas.
- **`noUncheckedIndexedAccess`.** El `tsconfig.json` ya explica por qué está apagada y el
  argumento sigue en pie.
- **Optimizar el rendimiento del 3D.** Sigue fuera de alcance como BÚSQUEDA especulativa de
  velocidad, pero **matiz del 2026-09-22, por la noche**: no cubre desperdicio real ya
  medido. `rebuildScene()` corre con cada tecla en la tabla del modelo y clonaba una
  `SphereGeometry` completa (561 vértices) por cada punto PI para pisarla acto seguido, y
  soldaba las aristas del alambre armando cadenas de texto —era el 24 % y el 41 % del tiempo
  de reconstruir, respectivamente—. Arreglado sin cambiar la conducta: 15 dobleces baja de
  2.70 a **0.70 ms**, 60 dobleces de 9.30 a **2.00 ms**, 10 piezas medidas de 13.95 a
  **2.00 ms**, y el caso pesado (30 dobleces + 4 modelos + 3 piezas + carga y amarre) de
  39.42 a **8.85 ms**. Detalle y las tres cosas medidas y descartadas en la misma pasada
  —`computeVertexNormals()` en las barras fantasma (6.6 %, no vale el riesgo de una malla sin
  normales), compartir también los materiales (0.2 %, hay un color por punto) e
  `InstancedMesh` (sigue aplazado, ver arriba)— en `CONTEXTO_BARCOMP.md` §11. Sigue fuera de
  alcance ir a buscar MÁS margen sin una medida nueva que lo pida: esta entrada anterior
  seguía en pie —14.3 ms de camino crítico con la pieza real contra 250 ms de presupuesto,
  arranque en frío de 234 ms en el peor caso (Edge headless sin GPU), sin fugas de three.js,
  71.5 % del bundle en three.js sin grasa, los tres idiomas sin poder separarse sin romper la
  regla del archivo único— y lo que cambió fue quitar gasto de construir/destruir geometría
  que no debía estar ahí, no bajar ese presupuesto.
- **El mecanismo de clave de `heldCache`.** ARQ lo pidió, PERF lo midió en 0.02 % del coste.
  Gana la medida. Es la regla de esta casa: lo mismo pasó con `rebuildGroup(k)`.
- **Un tope de TIEMPO en el solver.** Ya está acotado por iteraciones y pasadas, y un tope de
  reloj haría que la misma pieza diera otra forma en un PC más lento.
- **El arranque en caliente del solver** (empezar desde la solución anterior). Haría que el
  mismo estado diera cifras distintas según por dónde se llegó —al deshacer, por ejemplo—, y
  en un comparador eso es peor que la espera.

---

# CERRADO

Una línea por tarea. El detalle está en el commit; las cifras que siguen mandando, en
`CONTEXTO_BARCOMP.md` §11.

## Fase 0 · Contención — CERRADA 2026-09-08

Criterio de cierre cumplido: un CSV con columnas de más se rechaza diciendo por qué; un CSV
corto avisa cuántos dobleces quedaron sin medir; Compensar dice SIM o MED sin salir del modo;
el pie muestra el SHA; `npm test` incluye el fixture congelado y el barrido de eje.
Redes al cerrar: `tsc` limpio, 225 pruebas de motor, 145 pasos de interfaz.

| ID | Qué se hizo | Commit |
|---|---|---|
| C7 | Sello de versión (`/*__VER__*/` → SHA + fecha) en la barra de estado | `d2c569f` |
| C3 | `SCHEMA` a `barcomp/2.3` y `web/test/fixtures/` con los PI congelados | `d2c569f` |
| A5 | Un esquema desconocido deja de leerse como cinemática 1.0 | `d2c569f` |
| C1+A4 | `alignBranch()` y el umbral de eje no observable, juntos | `d2c569f` |
| C2 (parcial) | El CSV rechaza lo ambiguo en vez de recortar por la derecha | `d2c569f` |
| C5 | SIM/MED visible dentro de Compensar | `d2c569f` |
| C6 | Los dobleces sin medir salen marcados, no como `+0.000` | `d2c569f` |
| C8 | Aviso al cerrar con cambios sin guardar | `d2c569f` |
| A1 | Guardas del lazo: banda muerta, tope de Δ, ganancia máxima 1.0 | `d2c569f` |

> La parte de A1 que decía «"Aplicar" deshabilitado con n<3» **no se hizo**. Ver Fase 5.7.

## Fase 1 · Ganancias rápidas — CERRADA 2026-09-08

Los 20 arreglos hechos. Redes al cerrar: `tsc` limpio, 261 pruebas de motor (eran 225),
162 pasos de interfaz (eran 145), build reproducible con las cuatro dependencias fijadas.

| ID | Qué se hizo | Commit |
|---|---|---|
| A6 | `File.text()` + `allSettled()`: un archivo ilegible ya no cuelga el lote | `d2c569f` |
| A7 | `commit()` fuera del bucle: un lote entero es UN paso de deshacer | `d2c569f` |
| A3 | Guarda de θ en `trimOf` (`BEND_MAX_DEG = 170`) y envoltura en `bendDecomp` | `e4ecb84` |
| M2 | `engine/feasible.ts`: las rectas que no caben se dicen con palabras | `e4ecb84` |
| M3 | PI coincidentes rechazados al LEER (`PI_MIN_MM`) | `e4ecb84` |
| A12 | El texto rechazado se queda a la vista en rojo (`.badcell`) | `03e2514` |
| A14 | `cellNote` reescrito en es/en/de con los tres grupos nombrados | `03e2514` |
| A13 | `--dim2` sube sobre el 4.5:1 de WCAG 1.4.3, medido por el banco | `03e2514` |
| M1 | Cuatro causas de fallo al abrir, cada una con su frase y con qué hacer | `03e2514` |
| M8 | `src/safe.ts`: `esc()` y `safeColor()`, y el filtro en `fromDoc()` | `6643350` |
| M9 | Listas blancas de `data-*` derivadas de los `*_DEFAULT` congelados | `6643350` |
| M10 | Los tokens CSS se leen una vez por repintado, no cinco por doblez | `23fe24b` |
| A2 | `gainR` y `gainF` con su mando propio en el panel | `23fe24b` |
| A10+B5 | `tools/edge.mjs`: el banco corre en cualquier máquina, y barre los perfiles | `23fe24b` |
| M14 | Las cuatro dependencias fijadas sin `^` | `23fe24b` |
| M15 | `legalComments: 'eof'`, `THIRD-PARTY.md`, y el build FALLA sin el aviso | `23fe24b` |
| B2 | Un solo `$()`, en `src/dom.ts` | `23fe24b` |
| B3 | El trozo entero tiene que SER un número: «1.2.3» ya no da 1.2 | `23fe24b` |
| B4 | Comentarios y cifras que contradecían al código | `23fe24b` |
| — | Licencia **MIT**, y `i18n.ts`/`types.ts` partidos por su corte natural | `e22407e` |

## Fase 2 · Estructural — CERRADA (recortada) 2026-09-08

Recortada por decisión del dueño: lo que depende de los CAD y de los archivos de inspección
se aplaza (arriba, «Aplazado»). Lo que no dependía de una respuesta se hizo.

| ID | Qué se hizo | Commit |
|---|---|---|
| — | Los dos correos listos para enviar, a metrología y a la máquina | `9e2bb06` |
| C2 (escala) | `csvScaleOk()` con `SCALE_MIN_RATIO`: caza las nubes de desviación | `9e2bb06` |
| A.5 (parcial) | `engine/fixture.ts`: los pedestales dejan de ser un adorno | `53088a9` |
| M16/D4 | `piezas/` apartada del repo público con su convención escrita | `53088a9` |
| A9+A11, D3 | CI en Node 22.18 y 24; `index.html` versionado y comparado sin el sello | `f4a5425` |
| B1/B2 | `engine/machine.ts` y la pestaña Máquina, con perfil configurable | `88398eb` |
| — | Umbrales configurables en `engine/lims.ts` y la pestaña Límites | `88398eb` |
| — | Accesibilidad de la tabla: 24×24, `aria-label`, recorrido por teclado | `88398eb` |
| M6 | `engine/sag.ts`: la flecha por gravedad, y la hipótesis desmentida | `09af8bd` |

## Fase 3 · Cierre de beta 1.0 — CERRADA 2026-09-08

Redes al cerrar: 367 pruebas de motor, 177 pasos de banco, tipos limpios.

| ID | Qué se hizo | Commit |
|---|---|---|
| M12 | 33 pruebas de `history.ts` sin navegador; `snapshot(restore(s)) === s` | `0f9963d` |
| M4 | Tres puertas para el resorte: `SB_MIN_N`, `SB_MIN_SPAN_DEG`, `SB_MIN_PER_SIDE` | `7883217` |
| M13 | `!` y `!!` por CSS: la tolerancia deja de depender del color | `7883217` |
| A8 | `rebuildGroup(k)` **medido y descartado**; la medición queda como paso de banco | `7883217` |
| B1 | Los contadores de deshacer a `ST.hist`: `panels/` ya no importa de `app/` | `7883217` |

## Alcance nuevo · el amarre y la carga — 2026-09-09 / 09-10

No sale de la auditoría: lo pidió el dueño del proyecto y el taller.

| Qué se hizo | Commit |
|---|---|
| `engine/pins.ts` y `solveDense()`: la barra sujeta se resuelve en parámetros | `88398eb` |
| El interruptor es de verdad un interruptor: apagado, diferencia CERO en los PI | `88398eb` |
| Pestaña Amarre, capas del 3D, JSON y deshacer | `88398eb` |
| El banco del amarre (5 escenarios) y los dos fallos que destapó | `9f48f6c` |
| `ejemplos/amarre-{libre,sujeta}.json` para verlo sin montar la escena | `cbcc827` |
| Selector «Ver», y pines que se pueden inclinar en el espacio | `f6da876` |
| La referencia se puede comparar sujeta, no solo libre | `c2ee513`, `eacf439` |
| `engine/load.ts`: equilibrio con apoyos unilaterales, reacciones en newton | `18b1c00` |
| Comprobado contra la servilleta: 0.229°, 2.00 mm, `w·a/2`, a la quinta cifra | `18b1c00` |
| La casilla de compensación que se quedaba en 0.00 con el cambio ya aplicado | `060c737` |

## Fase 5 · lo que destapó la auditoría del 2026-09-10 — CERRADA salvo FIS-10

Diagnóstico en una frase: lo construido está bien hecho por dentro y mal contado por fuera.

| ID | Qué se hizo | Commit |
|---|---|---|
| T-01 | El anclaje se medía contra la referencia SUJETA, que depende del fixture | `abbd1d0` |
| T-02 | Las tablas del fixture y del amarre medían siempre la barra LIBRE | `20abe0c` |
| X-01a/b | Criterio de convergencia relativo, y la pantalla lee `ok` | `20abe0c` |
| X-02 | El primer tramo no puede flectar: «n/d · indeterminado», no «0.0» en verde | `20abe0c` |
| FIS-06 | La alarma de pines abiertos, solo cuando penetran | `20abe0c` |
| T-03 | «Medir contra» pasa a ser UN interruptor y manda sobre toda la pantalla | `afbeca7` |
| T-04 | El pin tiene LARGO y ALTURA, y eran la misma cifra | `afbeca7` |
| X-03 | La disciplina de foco en `renderLeft()`, `renderSide()` y en deshacer | `97725e5` |
| QA-01 | La prueba de regresión del 09-10 falla de verdad | `97725e5` |
| X-06 | El peso no depende de las incógnitas: una recta ya no dice «0.0 N» | `187add4` |
| X-07 | `normMat()`: `mat` deja de ser el único campo sin sanitizador | `187add4` |
| X-08 | `CELL_ATTRS` con las tablas nuevas; el foco deja de irse a `BODY` | `187add4` |
| X-09 | Tres rótulos para el chip de estado, y el chip lleva a Modelar › Amarre | `187add4` |
| ARQ-02 | Colisión de `data-mc`, y una prueba que cruza qué panel emite cada `data-*` | `187add4` |
| ARQ-04 | `pruneHeld()`: las ranuras `v-${id}` de `heldCache` dejan de filtrar | `187add4` |
| UX-06 | Fixture dice que la pieza pesa y dónde está el interruptor | `187add4` |
| QA-04+05 | Deshacer para `data-ld` y `data-mt`; `restrain()` con `bends: []` | `187add4` |
| ARQ-03 | `Doc` con claves requeridas y un solo `currentDoc()`: lo vigila `tsc` | `983be70` |
| ARQ-05 | `settle()` partido en `touches()`, `equilibrium()` y `reactions()` | `983be70` |
| ARQ-06 | `elasticReport()`, `kinksOf()` y `sectionI()` compartidas | `983be70` |
| FIS-08 | El fixture sujeta a TODOS los modelos; el que no cabe lo dice | `788d505` |
| UX-09 | Un solo interruptor «Ver»: lo que se ve es lo que se mide | `42b2bd5` |
| PERF-02 | El amarre de varios modelos, 30 % más barato sin cambiar un número | `c496b99` |
| PERF-03 | Contexto WebGL perdido, capas aisladas y menos trabajo por fotograma | `d2811b4` |
| X-10 | Unidades y ayuda en los quince encabezados, con un solo `th()` | `223faa7` |
| UX-07 | `aria-label` por campo, `scope="col"` y `role="alert"` | `223faa7` |
| UX-08 | `.hintline` legible, y los estados vacíos fuera de esa clase | `223faa7` |
| FIS-07 | El 1.22 escrito junto al 0.5, con las dos medidas | `223faa7` |
| X-05 | Un solo predicado de «apoya»: `bears()` en `engine/fixture.ts` | `facf505` |
| X-04 | El residuo de equilibrio, y el aviso cuando la raíz tira hacia abajo | `facf505` |
| UX-09 (2) | La casilla de VER de un modelo volvió a ocultarlo | `79e0065` |

> Dos hallazgos distintos llevan el código **UX-09** —el interruptor único de la Fase 5.2 y
> la casilla de ver de la 5.6—. No se renumeran: los mensajes de commit los citan así.

## Fase 5.7 · Lo que destapó el adelgazamiento de la documentación — CERRADA 2026-09-16

| ID | Qué se hizo | Commit |
|---|---|---|
| A1-bis | `LOOP_MIN_N` deja de ser letra muerta: «Aplicar» apagado con menos de tres piezas en el lazo, y la guarda también dentro de `case 'apply'` | `ac6e8ed` |

## Fase 6 · La forma de la sección — EN CURSO

Pedida por el taller el 2026-09-17: poder elegir la sección de la barra, no solo sus medidas.
Tres pasadas, y el orden no es negociable: **el motor primero y la ventana al final**, porque
una ventana que escribe un campo que nadie lee es exactamente lo que fue `LOOP_MIN_N` (A1-bis).

| ID | Qué se hizo | Commit |
|---|---|---|
| SEC-01 | `engine/section.ts`: las seis cuentas que la forma cambia, en un solo sitio. Refactor puro, superficie del motor 165 → 168 exports y ni una cifra movida | `e5f0798` |
| SEC-02 | Las cuatro formas —rectangular y redonda, macizas y huecas—, `barcomp/2.4`, el 3D barriendo el contorno de verdad y la ventana de la sección | `4da0a64` |
| SEC-04 | Medido: la guarda del eje mide el PLANO del doblez, y una redonda no borra el plano. Lo que borra es el retorcido, y ahí sí había un doble conteo — ver Fase 6.1 | `f784446` |
| SEC-06 | La sección deja de ser un cajón y pasa a ser PESTAÑA, con el dibujo de la cara a escala y las cotas encima. Devuelto por el taller: la barra de menús se corta cuando la ventana no es ancha y el botón del cajón podía no verse. De paso, las medidas dejan de estar en dos sitios | `1143361` |
| SEC-05 | En una redonda `orientations()` sale toda igual, así que el motor lee UNA constante y no dos. Repartir por una cara que `Iz = Iy` ya no distingue movía los dobleces hasta **4.10°** sobre el demo con `sbT=2` y `sbW=6`. La tabla pinta `Ø` en vez de `W`/`T`, y Medir y Compensar enseñan un campo en lugar de dos | `1140d01` |

Abierto, y con su motivo:

- [ ] **[SEC-03] Los umbrales de un tubo no son los de una barra maciza · [O]** — el radio
      mínimo que admite un tubo lo mandan la relación diámetro/pared y la ovalización al
      doblarlo, no el material. `engine/lims.ts` sigue juzgando con los de una barra maciza,
      así que **en pantalla un tubo se dobla más fácil de lo que se dobla en la máquina**. Hoy
      se avisa con palabras en la pestaña de la sección; cerrarlo pide un criterio, y un
      criterio pide o una norma que el taller acepte o piezas dobladas de las que aprenderlo.
      Mientras no haya una cosa ni la otra, **el aviso es la respuesta honesta**: inventar un
      umbral sería darle cara de dato a una opinión. Preguntado en **C.8**.
      **Lo que no dependía de la respuesta está hecho (2026-09-19):** `lims.tubeRfac`, el
      radio mínimo en diámetros exteriores, se teclea en la pestaña Límites y viaja en el
      JSON, así que un archivo dice con qué umbral se juzgó esa pieza. **Nace en 0 —no
      vigilar—** y solo mira tubo REDONDO. Con 0 la pestaña Sección sigue avisando con
      palabras de que el programa no lo juzga; con una cifra, lo dice y marca los dobleces
      cortos. Sigue abierto porque **la cifra la tiene que traer el taller**. · M

## Fase 6.1 · La torsión contada dos veces — CERRADA 2026-09-18

Salió al medir SEC-04, y no es de la sección: es de la inversa. No lo vio nadie hasta hoy
porque `demoModel()` trae todas las torsiones a cero, así que la prueba que decía
«`measuredModel` sobre los PI del nominal reproduce el nominal» no podía fallar.

| ID | Qué se hizo | Commit |
|---|---|---|
| TW-01 | `ik()` recibe las torsiones que ya se saben y aplica la misma `Rx` que `fk()`. Antes leía el rodado con el marco sin rodar, se tragaba la torsión dentro del rodado, y `measuredModel()`/`migrateModel()` le pegaban encima la del nominal. 137.8 mm de separación en el motor, 63.7 al abrir un `barcomp/1.0` torcido, 129.4 en el visor al reescribir un PI con su propio valor | `f784446` |

Y la cifra que explica por qué la torsión se arrastra y no se lee: 12° de torsión en la
estación *i* y 12° menos de rodado en la *i+1* dan los mismos PI **hasta 1.5e-13 mm**. De
unos puntos sueltos no se puede sacar cuál de las dos fue. De la PIEZA sí, si la sección no
es redonda — que es justo lo que dice el aviso de la pestaña de la sección.

## Fase 5.8 · El id repetido de un modelo — CERRADA 2026-09-17

Reportado desde el taller, no salido de una auditoría.

| ID | Qué se hizo | Commit |
|---|---|---|
| VAR-01 | `newVid()` sale del mayor id que hay, no de cuántas variantes son, y salta cualquier id ocupado. Dos modelos podían nacer como `v3` y la referencia dejaba de poder elegirse: las dos tarjetas con la chapa y ninguna con el botón | `266bce0` |

## Fase 5.5 · El solver con apoyos a micras — CERRADA 2026-09-19

| ID | Qué se hizo | Commit |
|---|---|---|
| Pregunta 7 | κ contrastado contra una solución exacta: la penetración residual es `R/κ`, no un artefacto. `tools/demo_carga.mjs` | `132e512` |
| FIS-10a | Los 47 N eran el redondeo del alto sembrado a centésimas: 6.16 N por micra. Y el paso de banco que pasaba con 0.02 N | `6a19200` |
| FIS-10b + FIS-08 | Un apoyo es una CARA, no una sombra en planta. El hueco sale liso, la carga converge —26.84 N apoyos y −3.17 mordaza, `ok=true` en 4 vueltas— y el paso de perturbación baja de 0.02° a 2e-4° porque ahora afinarlo mejora en vez de romper | `1aad68c` |
| FIS-10c | El sitio del poste sembrado deja de redondearse y la corrección se itera: el primer pin pasa de 8.83 N a 6.25 con el peso puesto | `ccf5cfa` |
