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

## Fase 5.5 · El solver con apoyos a micras

Abierta el 2026-09-15, encontrada al cerrar X-04.

- [ ] **[FIS-10b] La búsqueda sigue rindiéndose antes de llegar al mínimo · [O]** — lo que
      queda del hallazgo, ya con el reparto creíble. Con el sembrado arreglado el caso normal
      da apoyos 9.8 N + mordaza 13.9 N = el peso, pero `ok=false` y la pantalla lo avisa con
      `loadStuck`. Medido el 2026-09-16 instrumentando `equilibrium()`: no es ruido de
      diferencias finitas —el `dV` y el `J` salen de funciones suaves y su error relativo es
      de 1e-11—, es que el paso de Newton mide 0.014° mientras los huecos miden micras, o sea
      que mueve la barra 0.4 mm donde el contacto cambia de estado en 0.003 mm. La búsqueda
      parte el paso ocho veces, con f = 1/128 todavía no baja la energía, y se rinde; el
      gradiente entre tanto SUBE (250 → 295 N·mm/grado). Probado y descartado: partir el paso
      40 veces y quedarse con el mejor f converge por `STEP_TOL` pero da el MISMO reparto
      (47.4 → 47.8 N con el sembrado viejo), o sea que declara convergido lo que ya había.
      Lo que queda por probar, por orden: un **test de razón** sobre el paso —cortarlo en el f
      donde el primer contacto cambia de estado, que es como se resuelve un QP con
      restricciones y deja Φ exactamente cuadrática en el tramo—; y solo después, un criterio
      de parada por energía estancada. El muelle ya NO es sospechoso: `demo_carga` lo contrasta
      contra una solución exacta y coincide a cinco cifras (pregunta 7). · M

- [ ] **[FIS-10c] Los pines sembrados siguen redondeando su posición · [O]** — abierto el
      2026-09-16 al cerrar FIS-10a. `seedPins()` redondea `x`, `y` y `h` a centésimas por el
      mismo motivo por el que lo hacía el fixture, y con el amarre Y la carga encendidos a la
      vez esas micras vuelven a ser newton. No se tocó en la misma pasada a propósito: mover
      el sembrado de pines cambia las cifras de `demo:amarre` y las pruebas de FIS-08, y eso
      es una medición aparte. Sin carga no afecta a nada: `restrain()` resuelve geometría, no
      fuerzas. · S

## El amarre por pines laterales — lo que queda

Detalle del mecanismo en `CONTEXTO_BARCOMP.md`, «El amarre: la barra sujeta por pines».

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

## La carga — lo que queda

Detalle en `CONTEXTO_BARCOMP.md`, «La carga».

- [ ] **Contrastar contra una pieza real · [—]** — ⛔ mismo dato que espera el
      amarre y que espera M6: un escaneo con el fixture puesto. Va en el mismo
      correo. Lo que se puede contrastar hoy es la coherencia interna (estática,
      invariantes, orden de magnitud), no la pieza.
- [ ] **Quitar el punto ciego de los tramos rectos · [—]** — hoy las incógnitas
      son los codos de las ESTACIONES, así que una recta no se cuelga por el
      medio y esa parte la da `engine/sag.ts` aparte. Cerrarlo pide incógnitas
      dentro de los tramos, que la cinemática LRA no sabe describir sin inventar
      dobleces que no existen. **No se hace mientras no haya una medida que lo
      exija**: el número que falta ya se está dando, en otra columna y con su
      nombre.
- [ ] **El apoyo del pedestal solo mira de abajo arriba · [O]** — abierto al cerrar
      FIS-08. Un tramo casi vertical que roza el costado de la cuna no se modela:
      `pedestalFit()` mide la cara de ABAJO de la sección (`sectionDrop`) contra la
      cuna, y con la barra a plomo la cara que toca es el costado.
      **No es hipotético, y eso es nuevo del 2026-09-16:** la pieza de demostración
      llega a **80.8°** de inclinación —79 de sus 1 862 mm van por encima de 70°— y
      de los siete pedestales sembrados uno nace con la cuna a **−78.3°**. Con la
      carga puesta ese pedestal es **el que más lleva**: 8.8 N de los 9.8 que llevan
      los apoyos. O sea que la cifra que más pesa en la tabla sale del apoyo peor
      modelado.
      Cerrarlo es trabajo de modelo, no un arreglo: pide tratar la cuna como un
      sólido y resolver segmento contra caja —lo que `engine/contact.ts` ya hace
      para los pines—, y detrás van `bears()`, la columna «Hueco», el dibujo 3D y
      el barrido de 270 casos de FIS-08. No se empieza a medias.

## Aplazado a futuras actualizaciones (decisión 2026-09-08)

Lo que depende de los modelos CAD y de los archivos de inspección. **No está
descartado: está esperando.** Cada punto dice qué respuesta lo despierta. Las peticiones
están en [`solicitud-datos.md`](solicitud-datos.md) y en los dos correos listos para
enviar; **es el único trabajo que desbloquea todo esto, y no es trabajo de software.**

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
- **[A.5] El escaneo de la barra recta certificada en el fixture** — convierte en
  medida la flecha estimada (M6), el amarre y la carga. Los tres esperan el mismo dato.

## Preguntas para el taller (bloquean o cierran tareas de arriba)

1. ~~**¿El fixture real tiene mordaza en el primer extremo?**~~
   **Contestada el 2026-09-15: sí.** X-04 cerrado con eso.
2. **¿Cuántos dobleces tiene la pieza más grande que pasa de verdad?** Si no supera ~30,
   PERF-01 se cierra sin tocar código.
3. ~~**¿`tol.point` = 1 mm es la tolerancia para decidir si un pedestal apoya?**~~
   **Contestada el 2026-09-15: de momento basta.** Si algún día hace falta una holgura
   propia, se cambia en un solo sitio: `bears()`.
4. **Con la carga puesta, ¿la desviación se compara contra la forma libre o contra la
   asentada?** Hoy siempre contra la libre, mientras el 3D puede estar enseñando la
   asentada. Segunda cara de la pregunta que sigue abierta desde el 09-09.
5. **¿Cuánto cede el rodado de verdad con los pines puestos?** El modelo usa 0.5 donde la
   torsión de la sección da 1.22, y con pines laterales eso triplica lo que se mueve la
   punta (FIS-07). Se contesta con el escaneo de una pieza montada en el fixture: no hay
   que elegir a ojo.
6. **¿Compensar debe poder ver y apagar el amarre y la carga**, o dejarlos puestos ahí es
   un error que conviene bloquear? Compensar es el modo taller y es el único donde se
   decide sobre material.
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
8. **Cuando `dev.theta` y la desviación por fila discrepan, ¿cuál manda?** La rama se
   arregló (C1 + A4, `alignBranch`) y `theta` está visible, que era la disyuntiva D1 del
   informe del 09-07; lo que no se decidió nunca es el criterio de aceptación.

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

Cada uno en un solo sitio y con la respuesta que espera anotada. Desde la Fase 4 se teclean
en la pestaña **Límites** y viajan en el JSON, así que un archivo dice con qué umbrales se
juzgó esa pieza.

| Valor | Sitio | Espera |
|---|---|---|
| `AXIS_MIN_DEG = 1.0` | `engine/lims.ts` | A.6 — la σ del escaneo; la regla es `atan(3σ/avance)` |
| `COMP_DEFAULT.dead = 0.05` | `engine/lims.ts` | A.6 — elegido por debajo de la tolerancia típica |
| `PI_MIN_MM = 1.0` | `engine/lims.ts` | A.6 — es `5σ` |
| `STRAIGHT_MIN_MM = 25` | `engine/lims.ts` | B.2 — es una cota de la MÁQUINA (mordaza + carrera) |
| `E`, `ρ`, `yield` del material | `engine/pins.ts` (`MAT_DEFAULT`) | el certificado; hoy son de catálogo |
| rigidez a torsión `0.5` | `engine/load.ts` | pregunta 5; la sección da 1.22 |

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
  Es rendimiento percibido; no hay medición que lo respalde.
- **`InstancedMesh` para los PI.** Optimizar contra una carga imaginaria. Primero medir con
  el número real de piezas.
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
- **Optimizar el rendimiento del 3D.** Medido: 14.3 ms de camino crítico con la pieza real
  contra 250 ms de presupuesto, arranque en frío de 234 ms en el peor caso (Edge headless sin
  GPU), sin fugas de three.js. El 71.5 % del bundle es three.js sin grasa, y los tres idiomas
  no se pueden separar sin romper la regla del archivo único.
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

## Fase 5.8 · El id repetido de un modelo — CERRADA 2026-09-17

Reportado desde el taller, no salido de una auditoría.

| ID | Qué se hizo | Commit |
|---|---|---|
| VAR-01 | `newVid()` sale del mayor id que hay, no de cuántas variantes son, y salta cualquier id ocupado. Dos modelos podían nacer como `v3` y la referencia dejaba de poder elegirse: las dos tarjetas con la chapa y ninguna con el botón | `266bce0` |

## Fase 5.5 · El solver con apoyos a micras — CERRADA EN PARTE

Sigue abierto FIS-10b (la búsqueda que se rinde) y FIS-10c (el sembrado de pines).

| ID | Qué se hizo | Commit |
|---|---|---|
| Pregunta 7 | κ contrastado contra una solución exacta: la penetración residual es `R/κ`, no un artefacto. `tools/demo_carga.mjs` | `132e512` |
| FIS-10a | Los 47 N eran el redondeo del alto sembrado a centésimas: 6.16 N por micra. Y el paso de banco que pasaba con 0.02 N | `6a19200` |
