# Qué necesito para cerrar el camino ZEISS → BARCOMP → máquina

Documento de trabajo. Dos destinatarios distintos:

- **Parte A** — para quien programa el plan de inspección en ZEISS / GOM Inspect.
- **Parte B** — para quien programa o integra la dobladora.

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

---

## Cómo entregarlo

Cualquier forma sirve. Lo más cómodo: una carpeta con los archivos crudos —el export de
inspección, el programa de máquina, fotos del fixture— y las respuestas escritas donde sea,
aunque sea en un correo. **No hace falta que esté ordenado ni completo**: cada bloque que
llegue desbloquea su parte del plan por separado.

Si de todo esto solo se puede conseguir una cosa, que sea **A.1: un archivo de exportación
real**. Y si se pueden conseguir dos, la segunda es **A.3: si el plan de inspección puede
dar los puntos de intersección directamente**.
