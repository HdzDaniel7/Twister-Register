# Para quien programa el plan de inspección (ZEISS / GOM Inspect)

*Extracto de `solicitud-datos.md` listo para enviar. El documento largo tiene el
porqué de cada punto; esto es lo que hay que pedir.*

---

**Asunto: dos cosas que necesito del escaneo de las barras dobladas**

Hola:

Estamos montando un programa que corrige el comando de la dobladora a partir de la
pieza medida. Para que hable el mismo idioma que el informe de inspección necesito
dos cosas de tu lado. Las demás pueden esperar; estas dos deciden qué se construye.

## 1. Un archivo de exportación real, sin retocar

Un export de verdad, de una barra real, tal cual sale del programa. Sin limpiar
columnas, sin traducir encabezados, sin quitar filas. Aunque sea de una pieza de
prueba o de otro proyecto con geometría parecida.

Un archivo real vale más que diez páginas de especificación. El motivo concreto:
hoy el lector toma las tres últimas columnas numéricas de cada línea. Si el export
termina en columnas de nominal o de desviación en vez de coordenadas, se importan
esas creyéndolas coordenadas, y la pieza "medida" queda inventada. Con el archivo
delante eso se mapea por nombre de columna y el problema desaparece.

Sirve CSV o TXT; si hoy se genera Excel, el .xlsx; y si no hay otra cosa, el PDF
del informe —al menos para ver los nombres de los elementos.

Si tiene datos de cliente, basta con cambiar el nombre de la pieza. Lo que importa
son las columnas y los números.

## 2. ¿Puede el plan de inspección dar los puntos de intersección?

Esta es la pregunta que puede ahorrar meses de trabajo.

El programa no trabaja con puntos de superficie: trabaja con los **puntos de
intersección del eje neutro** —los vértices teóricos donde se cortarían dos tramos
rectos si no hubiera radio. De ahí deduce cuánto avanzó, cuánto giró el eje y
cuánto se dobló en cada estación.

**¿El plan puede crear una "línea de ajuste" sobre el eje de cada tramo recto, un
"punto de intersección" entre líneas consecutivas, y exportar esos puntos?**

En GOM Inspect / ZEISS INSPECT esto suele existir como elementos construidos.

- **Si es que sí**, el escáner nos entrega directamente lo que el programa necesita
  y nos ahorramos escribir un extractor de nube de puntos entero.
- **Si es que no**, hay que escribir ese extractor, y son varias semanas.

La barra tiene ~15 dobleces: serían ~16 líneas de ajuste y ~15 puntos de
intersección. Si eso hace el plan inmanejable, dímelo, que también es una respuesta.

---

## Si hay tiempo para más, por este orden

**3. Cómo es el archivo por dentro.** Separador de columnas (coma, punto y coma,
tabulador), separador decimal (punto o coma), codificación (UTF-8, con BOM, ANSI),
si hay fila de encabezado y con qué nombres exactos, unidades, y si el orden de las
filas sigue la barra y desde qué extremo empieza.

**4. Con qué alineación se exportó.** Es donde los dos programas pueden no
entenderse sin que se note en los números: qué alineación estaba activa (RPS, 3-2-1,
mejor ajuste, por elementos del fixture, o una precalculada), qué superficies o
elementos fijan el datum, si el fixture forma parte de él, y si es la misma
alineación con la que se acepta o rechaza la pieza. Puede que la inspección se
alinee de una forma y el cliente acepte con otra.

**5. Repetibilidad práctica.** Si se escanea la misma barra tres veces sin
desmontarla, ¿cuánto se mueven los puntos? Es la cifra que decide si la corrección
automática converge o empeora la pieza, y no suele estar en ningún certificado.
También ayuda: la longitud del tramo recto más corto de la pieza, y cuántos puntos
de nube caen sobre cada tramo.

**6. El fixture.** Fotos o croquis: dónde apoya la barra, cuántos apoyos, si sujeta
o solo soporta. Si se mide en el mismo fixture donde se dobla o en otro. Y, si es
posible, **un escaneo de una barra recta certificada montada en el fixture**: en
1.7 m de aluminio la flecha por gravedad puede ser del tamaño de la tolerancia, y
medida una vez se descuenta para siempre.

**7. El nominal.** Si el CAD contra el que se compara es exactamente la misma
geometría que tenemos cargada —mismos radios, mismos avances— y quién manda si
discrepan. El STEP o IGES, o la tabla de dobleces con la que se generó.

**8. Nomenclatura.** Cómo se nombran los puntos en el informe (`P1`, `PI_01`,
`Punto 1`…), para poder ordenarlos y detectar que falta alguno.

---

No hace falta responder todo de una vez ni que esté ordenado. Cada bloque que
llegue desbloquea su parte por separado. **Si solo se puede conseguir una cosa, que
sea el archivo de exportación real.**

Gracias,
