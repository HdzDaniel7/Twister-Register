# Qué necesito para cerrar el camino ZEISS → BARCOMP → máquina

Documento de trabajo. Tres destinatarios distintos:

- **Parte A** — para quien programa el plan de inspección en ZEISS / GOM Inspect.
- **Parte B** — para quien programa o integra la dobladora.
- **Parte C** — para el taller: el fixture, el material y los criterios de aceptación.

No hace falta responderlo entero de una vez. Cada bloque dice **qué desbloquea**, para
que se pueda ir por partes. Lo marcado con 🔴 es lo que bloquea la beta 1.0; lo demás
mejora el resultado pero no detiene el trabajo.

---

# Parte A · Metrología (ZEISS / GOM Inspect)

Contexto para quien lea esto sin conocer el programa: BARCOMP reconstruye la barra a
partir de sus **puntos de intersección (PI)** — los vértices teóricos del eje neutro,
donde se cortarían los tramos rectos si no hubiera radio. De esos PI deduce, por
cinemática inversa, cuánto avanzó, cuánto giró el eje y cuánto se dobló en cada estación.
Es lo que compara contra el comando de máquina.

El problema a resolver: **un informe de inspección no da PI, da desviaciones de puntos
sobre la superficie contra el CAD.** Son dos cosas distintas y hay que decidir dónde se
convierte una en la otra.

## A.1 🔴 Un archivo de exportación real

Lo que más falta hace, por encima de cualquier descripción: **un archivo exportado de
verdad, de una barra real, tal cual sale del programa.** Sin retocar, sin limpiar
columnas, sin traducir encabezados. Aunque sea de una pieza de prueba o de otro proyecto
con geometría parecida.

Un archivo real vale más que diez páginas de especificación, porque el lector de CSV del
visor hoy toma **las tres últimas columnas numéricas de cada línea** y eso funciona por
accidente: si el export trae columnas de nominal o de desviación al final, importa esas
creyendo que son coordenadas, y la pieza "medida" queda inventada sin que nada avise.

Formatos útiles, en orden de preferencia:

1. **CSV o TXT** exportado desde el informe de inspección.
2. **Excel (.xlsx)** del informe, si es lo que se genera hoy.
3. **El informe en PDF**, si no hay otra cosa — sirve para ver los nombres de los
   elementos aunque no se pueda leer por programa.

Si el archivo tiene datos de cliente, basta con cambiar el nombre de la pieza; lo que
importa son las columnas y los números.

## A.2 🔴 Cómo es ese archivo por dentro

Aunque llegue el archivo, conviene confirmar estas seis cosas por escrito, porque algunas
no se ven mirando una sola muestra:

| Qué | Por qué importa |
|---|---|
| **Separador de columnas** — coma, punto y coma, tabulador | Si es `;` con decimales de coma, `1,5;2,5;3,5` hoy se lee como el punto `(5, 3, 5)` |
| **Separador decimal** — punto o coma | Depende del idioma de la instalación, y puede cambiar entre PCs |
| **Codificación** — UTF-8, UTF-8 con BOM, ANSI/Windows-1252 | Un BOM al principio rompe la primera línea |
| **¿Hay fila de encabezado?** ¿Con qué nombres exactos? | Es lo que permite mapear por nombre en vez de por posición |
| **Unidades** — mm siempre, o depende de la plantilla | El visor trabaja en mm y grados |
| **¿El orden de las filas es el de la barra?** ¿De qué extremo empieza? | El visor asume PI consecutivos del amarre hacia la punta libre |

## A.3 🔴 La pregunta que puede ahorrar meses de trabajo

**¿El plan de inspección puede crear elementos de "línea de ajuste" sobre tramos rectos de
la barra, y luego "punto de intersección" entre líneas consecutivas — y exportar esos
puntos?**

En GOM Inspect / ZEISS INSPECT esto normalmente existe como elementos construidos:
se ajusta una línea al eje de cada tramo recto (por secciones o por cilindro/plano según
la geometría) y se construye el punto donde se cortan dos líneas consecutivas.

- **Si la respuesta es sí** → el escáner entrega los PI directamente, el visor los importa
  casi tal cual, y **se puede descartar el extractor de nube en Python (RANSAC) completo**.
  Es el camino corto y es el que hay que intentar primero.
- **Si la respuesta es no**, o sale muy trabajoso de mantener → hay que escribir el
  extractor: segmentar tramos rectos de la nube, ajustar rectas robustas, intersectar ejes.
  Es un módulo entero y varias semanas.

Esta única respuesta decide qué se construye y qué no. Si hay que elegir una sola pregunta
que hacer, es esta.

Detalles que hacen falta si la respuesta es sí:
- ¿Cuántas líneas de ajuste se pueden crear sin que el plan se vuelva inmanejable? La barra
  tiene ~15 dobleces, o sea ~16 tramos rectos y ~15 PI.
- ¿El punto de intersección exportado sale en coordenadas de la pieza alineada, o del
  sistema del escáner?
- ¿Los tramos rectos más cortos dan una línea de ajuste estable? (ver A.6)

## A.4 🔴 Con qué alineación se exportó

Es el punto donde hoy los dos programas no se entienden, y no se nota mirando los números.

BARCOMP, al reconstruir, **descarta la pose del escaneo**: pone el primer tramo sobre el
eje +x en el origen y a partir de ahí calcula. Si el archivo viene alineado de otra manera,
las desviaciones que muestra el visor **no son las que ZEISS calculó contra el CAD**, y no
se pueden comparar entre sí.

Necesito saber:

1. **Qué alineación estaba activa al exportar.** RPS, 3-2-1, mejor ajuste global,
   alineación por elementos del fixture, o una precalculada guardada en la plantilla.
2. **La definición del datum**: qué superficies, puntos o elementos lo fijan, y con qué
   grados de libertad bloquea cada uno.
3. **Si el fixture forma parte del datum** o la barra se alinea solo contra sí misma.
4. **Si esa alineación es la misma que usa el criterio de aceptación de la pieza.** Puede
   que la inspección se alinee de una forma y el cliente acepte con otra.

La decisión que sale de aquí: fijar **una** alineación común y que el visor la respete en
vez de imponer la suya.

## A.5 🟡 El fixture

La barra se mide montada sobre un fixture. Eso es bueno (repetible) y tiene una
consecuencia que hoy no se modela: en 1.7 m de aluminio la **flecha por gravedad** puede
ser del orden de la tolerancia de punto (1.0 mm).

Lo que ayuda:

- **Fotos o croquis del fixture**: dónde apoya la barra, cuántos apoyos, si sujeta o solo
  soporta, si la barra queda horizontal.
- **Si la pieza se mide montada en el mismo fixture donde se dobla, o en otro distinto.**
  Si son dos, cada uno deforma a su manera y esa diferencia entra en las desviaciones.
- **Un escaneo de una barra recta certificada montada en el fixture**, si es posible. Con
  eso la flecha se mide una vez y se mete como corrección del nominal, en lugar de dejar
  que el lazo intente compensarla — que es lo que probablemente explica el estancamiento a
  ~5 mm en la punta que ya se observó en simulación.

## A.6 🟡 Ruido e incertidumbre

El lazo de compensación amplifica el ruido de medición: el error residual queda en
aproximadamente `ganancia × ruido`. Con desviación típica de 0.3° en el ángulo deducido el
lazo converge dentro de tolerancia; **con 1.0° el lazo empeora la pieza en vez de
mejorarla** (comprobado en simulación durante la auditoría). No es un detalle: decide si
todo el enfoque funciona.

- **Incertidumbre declarada del sistema** (la del certificado o la hoja de datos del
  equipo), y si hay una verificación reciente.
- **Repetibilidad práctica**: si se escanea la misma barra tres veces sin desmontarla,
  ¿cuánto se mueven los PI? Es la cifra que de verdad importa y no suele estar en ningún
  papel.
- **Longitud del tramo recto más corto de la pieza.** Un PI sale de intersectar dos rectas:
  si una recta es corta, su dirección se estima mal y el ángulo deducido hereda ese error
  amplificado. Con tramos cortos hay que saberlo antes, no después.
- **Cuántos puntos de nube caen sobre cada tramo recto**, aproximadamente.

## A.7 🟡 El nominal

- **¿El CAD contra el que se compara es exactamente la misma geometría nominal que tiene
  cargada el visor?** Mismos radios, mismos avances, mismo desarrollo.
- **¿Quién es la fuente de verdad si discrepan** — el CAD o el modelo del visor?
- Si es posible, el **STEP o IGES del nominal**, o al menos la tabla de dobleces con la que
  se generó.

## A.8 🟢 Nomenclatura

- **Cómo se nombran los puntos en el informe** (`P1`, `PI_01`, `Punto 1`, `B1_int`…). El
  visor puede usar el nombre para ordenar y para detectar que faltan puntos, pero solo si
  el patrón es estable.
- **Si el informe incluye piezas fuera de tolerancia marcadas de alguna forma**, para poder
  arrastrar ese estado.

---

# Parte B · La máquina

Contexto: hoy el visor calcula el nuevo comando y lo muestra en pantalla. **No hay ninguna
exportación hacia la máquina**: si los números se están pasando a mano, ese es el eslabón
que falta y merece resolverse en la beta.

## B.1 🔴 Qué acepta la dobladora

- **¿La máquina puede leer un archivo, o los valores se teclean en su control?**
- Si lee archivo: **¿qué formato?** CSV, TXT con formato fijo, un programa en su propio
  lenguaje, un archivo de la marca. Cualquier nombre de extensión ayuda.
- **Un archivo de programa real**, de una pieza que ya se dobla hoy. Igual que en A.1: el
  archivo vale más que la descripción, y sobre él se puede escribir la exportación sin
  adivinar nada.
- **¿Por dónde entra?** USB, red, carpeta compartida, tarjeta.

## B.2 🔴 Qué parámetros y con qué convención

Esto es lo que hay que igualar exactamente, porque un signo invertido dobla al lado
contrario:

- **Nombres de los parámetros** en el control de la máquina y su orden en el archivo.
- **Unidades**: mm y grados, o décimas, o pulsos.
- **Cuántos decimales acepta**, y si redondea o trunca.
- **Convención de signo del ángulo**: ¿positivo es hacia qué lado?
- **Convención del giro del eje / rodado**: ¿es la posición absoluta del eje, o cuánto gira
  respecto de la estación anterior? BARCOMP usa **giro relativo** (LRA), y eso es
  exactamente lo que hay que confirmar que coincide.
- **¿Qué mide el avance**: de PI a PI, o de tangencia a tangencia (recta)?
- **Rangos y límites**: ángulo máximo, avance mínimo entre dobleces, giro máximo del eje.

> Nota importante: la convención de signos actual del visor **funciona contra valores de
> máquina reales que no se pueden modificar**. No hay que cambiarla. Lo que hace falta es
> **dejarla escrita y congelada en pruebas**, para que ningún cambio futuro la mueva sin
> que nadie se entere. Es parte de la Fase 0 del plan.

## B.3 🟡 Qué puede corregir la máquina

El lazo puede corregir tres cosas, y hoy están las tres disponibles en la interfaz. Pero
solo sirven si la máquina las acepta:

- **¿Acepta corrección de ángulo?** (casi seguro que sí)
- **¿Acepta corrección del giro del eje / rodado?** Si **no**, el sesgo acumulado del eje
  hay que atacarlo por calibración del robot, no por software — y eso cambia el plan.
- **¿Acepta corrección de avance?**

Si solo acepta ángulo, la simulación dice que los ángulos convergen a ~0.15° pero la
desviación de la punta libre se estanca en ~5 mm, porque el sesgo de rotación se acumula a
lo largo de la cadena. Con las tres activas baja a ~0.17 mm. **Saber cuáles acepta decide
qué se le puede prometer al cliente.**

## B.4 🟡 Trazabilidad

- **¿El control guarda registro de qué programa dobló cada pieza?** Si sí, con qué
  identificador. Serviría para casar cada escaneo con el comando exacto que lo produjo, que
  es lo que hoy hay que anotar a mano.

---

# Parte C · El taller y el fixture

Añadida el 2026-09-19. Las partes A y B se escribieron el 09-08, antes de que existieran
el amarre por pines y la carga. Desde entonces el programa **calcula newton**, y medir
obliga a preguntar cosas que antes no hacían falta. Todo lo de aquí bloquea una tarea
concreta del plan; cada bloque dice cuál.

Contexto en una frase para quien lea esto sin conocer el programa: el visor monta la barra
sobre el fixture —pedestales con su cuna, pines laterales, mordaza en un extremo—, la deja
caer bajo su propio peso y dice cuánto se mueve la punta, dónde se concentra el esfuerzo y
qué apoyo trabaja. Lo hace con los números que le den de ese fixture.

## C.1 🔴 Los altos de los pedestales, medidos en micras

**La medida que más cambia lo que el programa puede prometer.** El 2026-09-19 se midió
esto sobre el caso de demostración, y el resultado manda sobre toda la pestaña Fixture:

- Junto a la mordaza la barra es mucho más rígida que el contacto, así que subir un
  pedestal **una micra** mete **6.16 N** en la pieza. No es un error numérico: la barra no
  tiene a dónde ceder y ese recorrido entra entero en el contacto.
- Con **0.05 mm** —lo que da un flexómetro— en UN solo apoyo, lo que llevan los apoyos
  pasa de 26.8 N a **333.5 N**, sobre una pieza que pesa 23.7 N.
- Lejos de la mordaza el mismo error mueve 0.5 N, porque ahí cede antes la barra.

O sea que **la reacción de un apoyo, y también su suma, no son propiedades de la pieza**:
son la pieza más lo que el fixture le esté metiendo. Lo que sí sobrevive a una medida
basta es el peso de la pieza y si el apoyo toca o no.

Lo que hace falta para pasar de «toca / no toca» a newton:

1. **¿Los pedestales son de altura fija, regulables o calzados con suplementos?**
2. **¿Con qué se ajustan y con qué se comprueban** —reloj comparador, calibre de alturas,
   solo la escala del husillo—, y **qué tolerancia real tiene ese ajuste.**
3. **Una medida de los altos montados**, del orden de la micra, de un fixture concreto.

Desbloquea: «Lo que la reacción de un apoyo puede prometer». Si la respuesta es que los
altos se ponen a ojo, también es una respuesta buena: entonces la columna Reacción se
queda como está —un indicador de qué apoyo trabaja— y no se promete más.

## C.2 🔴 Qué cunas hay montadas

La cuna se modela hoy como una **chapa recta** de largo `pad` × 44 mm, y no bascula. Sobre
una pieza curvada, la recta que mejor casa con lo que la cuna cubre depende de su largo:
sobre un codo del caso de demostración, pasar de 20 a 200 mm de cuna mueve la inclinación
que la barra pide de **−48.7° a −63.4°**.

- **¿Qué largo tienen las cunas que hay montadas de verdad?** Si son varias medidas, cuáles.
- **¿Son chapa recta, en V, o basculan?**

Desbloquea: «La cuna no bascula y no siempre puede casar con la barra». Con cunas cortas
no hay nada que escribir —el largo ya es un campo por pedestal—; una cuna en V o
basculante es modelo nuevo y campo nuevo en el archivo, y no se escribe a ciegas.

## C.3 🔴 Con la barra sujeta, ¿contra qué forma se corrige?

El lazo de compensación compara hoy contra la pieza **libre**. Con el amarre puesto, eso
corrige hacia una forma que la barra sujeta no puede tomar.

**¿La forma que se quiere es la que tiene la pieza AL SOLTARLA, o la que tiene MONTADA en
el fixture?** Son dos respuestas legítimas y cada una cambia el código.

Desbloquea: «Decidir qué es el nominal con la barra sujeta», y la pregunta hermana de la
pestaña de desviación (qué se compara cuando la carga está puesta).

## C.4 🔴 El certificado del material

El programa da **MPa** y compara contra el límite elástico. Hoy `E`, densidad y límite son
valores de catálogo. La forma que sale —cuánto se mueve la punta, dónde está el codo peor—
es geometría y aguanta; la **magnitud en MPa lleva un material de manual.**

Basta el certificado de colada de las barras que se van a doblar: aleación, estado, `E`,
densidad y límite elástico.

Desbloquea: contrastar el amarre y la carga contra una pieza real, y poder decir «21 % del
límite» sin una nota al pie.

## C.5 🟡 Cuánto cede el rodado con los pines puestos

El modelo usa una rigidez a torsión de **0.5** donde la sección da **1.22**. Con pines
laterales esa diferencia **triplica** lo que se mueve la punta. No hay que elegir a ojo: se
contesta escaneando una pieza montada en el fixture, que es el mismo dato que ya pide A.5.

## C.6 🔴 Cuántos dobleces tiene la pieza más grande que pasa de verdad

Era 🟡 hasta el 2026-09-19. Subía a 🔴 al medirlo, porque lo que hay al otro lado no es
«va un poco lento»: en una barra de ~1.8 m, asentar la pieza con la carga puesta cuesta
**49 ms con 15 dobleces, 134 con 30, 954 con 34 y 16 segundos con 60**, contra un
presupuesto de 250 ms. Por encima de ~34 el solver además deja de converger, y entonces el
visor lo dice en vez de dar una cifra —que es lo correcto, pero no es una respuesta.

Dos precisiones que hacen la pregunta contestable con la pieza delante:

- **No es la pieza más LARGA, es la que más dobleces tiene.** Medido: con 30 dobleces fijos
  y la barra estirada de 1.0 a 4.6 m, el coste no se mueve (141–222 ms).
- **No importa lo juntos que vayan.** Misma medida.

Basta un número aproximado y el peor caso que se recuerde. Está en
`tools/demo_escala.mjs` con las tablas enteras.

Desbloquea: PERF-01, que hasta ese día era un código sin hallazgo detrás.

## C.7 🟡 Compensar, ¿debe ver y poder apagar el amarre y la carga?

Compensar es el modo de taller y es el único donde se decide sobre material. Hoy los dos
interruptores están fuera de esa pantalla. **¿Conviene que se vean y se puedan apagar
desde ahí, o dejarlos puestos sin querer es un error que hay que bloquear?**

## C.8 🟡 Los tubos: qué radio mínimo se acepta

En un tubo el radio mínimo lo mandan la relación diámetro/pared y la ovalización al
doblarlo, no el material. El programa juzga hoy con los umbrales de una barra maciza, así
que **en pantalla un tubo se dobla más fácil de lo que se dobla en la máquina**, y por eso
lo avisa con palabras en vez de dar un número.

**¿Hay una norma o una tabla de taller que se acepte** —la típica es en función de D/t—, o
piezas ya dobladas de las que sacarla? Inventar el umbral sería darle cara de dato a una
opinión.

Desbloquea: SEC-03.

## C.9 🟢 Cuando el ángulo de la fila y la desviación no dicen lo mismo, ¿cuál manda?

Las dos cifras están a la vista y pueden discrepar. Lo que nunca se decidió es **con cuál
se acepta o se rechaza la pieza.**

---

# Resumen: lo que desbloquea cada cosa

| Necesito | Desbloquea | Sin eso |
|---|---|---|
| A.1 archivo de export real | Validación real del CSV (Fase 0) | Las reglas de validación se escriben a ciegas |
| A.3 ¿PI directos del plan de inspección? | Decide si hace falta el extractor RANSAC completo | Se construye un módulo que quizá sobra |
| A.4 alineación y datum | Que las desviaciones del visor y las de ZEISS signifiquen lo mismo | Aceptar piezas malas y rechazar buenas |
| A.6 ruido real | Saber si el lazo converge | Se descubre con material desperdiciado |
| B.1 + B.2 formato y convención | Exportación a máquina | Los números se copian a mano |
| B.3 qué corrige la máquina | Qué se puede prometer | Se promete una precisión que el proceso no da |
| A.5 fixture y flecha | Corregir un sesgo de ~1 mm | El lazo persigue algo que no puede corregir |
| C.1 altos del fixture en micras | Dar reacciones en newton, no solo «toca / no toca» | A 6.16 N por micra, la suma de los apoyos no significa nada |
| C.2 qué cunas hay montadas | Cerrar el desajuste cuna-barra | Se modela una cuna que nadie tiene |
| C.3 nominal libre o montado | Qué forma persigue el lazo con el amarre puesto | Se corrige hacia una forma que la barra sujeta no puede tomar |
| C.4 certificado del material | Que los MPa sean de este aluminio | La forma vale, la magnitud lleva un material de manual |
| C.6 cuántos dobleces, la pieza peor | PERF-01: saber si hay que optimizar el solver | A 34 dobleces el visor con carga tarda 954 ms; a 60, 16 s |
| C.8 radio mínimo del tubo | SEC-03 | En pantalla un tubo se dobla más fácil que en la máquina |

---

## Cómo entregarlo

Cualquier forma sirve. Lo más cómodo: una carpeta con los archivos crudos —el export de
inspección, el programa de máquina, fotos del fixture— y las respuestas escritas donde sea,
aunque sea en un correo. Del taller, lo que más vale es una foto del fixture con una cinta
al lado y la respuesta a C.1 y C.2, aunque sea «los altos se ponen a ojo» y «las cunas son
de 60». **No hace falta que esté ordenado ni completo**: cada bloque que
llegue desbloquea su parte del plan por separado.

Si de todo esto solo se puede conseguir una cosa, que sea **A.1: un archivo de exportación
real**. Y si se pueden conseguir dos, la segunda es **A.3: si el plan de inspección puede
dar los puntos de intersección directamente**.
