# Para quien programa o integra la dobladora

*Extracto de `solicitud-datos.md` listo para enviar. El documento largo tiene el
porqué de cada punto; esto es lo que hay que pedir.*

---

**Asunto: en qué formato acepta la dobladora un programa de doblado**

Hola:

Estamos montando un programa que calcula el comando corregido de la dobladora a
partir de la pieza ya medida. Hoy los números salen en pantalla y se pasan a mano.
Para cerrarlo necesito dos cosas.

## 1. Un archivo de programa real

- **¿La máquina puede leer un archivo, o los valores se teclean en el control?**
- Si lee archivo: **¿qué formato?** CSV, TXT con formato fijo, un programa en su
  propio lenguaje, un archivo propio de la marca. Cualquier extensión ayuda.
- **Un archivo real de una pieza que ya se dobla hoy.** Con el archivo delante se
  escribe la exportación sin adivinar nada; sin él, se adivina.
- **¿Por dónde entra?** USB, red, carpeta compartida, tarjeta.

## 2. Los parámetros y su convención

Esto es lo que hay que igualar exactamente, porque **un signo invertido dobla al
lado contrario**:

- **Nombres de los parámetros** en el control, y su orden dentro del archivo.
- **Unidades**: mm y grados, o décimas, o pulsos.
- **Cuántos decimales acepta**, y si redondea o trunca.
- **Convención de signo del ángulo**: positivo, ¿hacia qué lado?
- **Convención del giro del eje (rodado)**: ¿es la posición absoluta del eje, o
  cuánto gira respecto de la estación anterior? Nosotros usamos **giro relativo**,
  y es justo lo que hay que confirmar que coincide.
- **¿Qué mide el avance**: de vértice a vértice, o de tangencia a tangencia?
- **Rangos y límites**: ángulo máximo, avance mínimo entre dobleces, giro máximo
  del eje.

---

## Si hay tiempo para más

**3. Qué puede corregir la máquina.** La corrección automática puede tocar tres
cosas, y las tres están hoy en la interfaz. Solo sirven si el control las acepta:

- ¿Acepta corrección de **ángulo**? (casi seguro que sí)
- ¿Acepta corrección del **giro del eje / rodado**? Si no, el sesgo acumulado hay
  que atacarlo por calibración del robot, no por software, y eso cambia el plan.
- ¿Acepta corrección de **avance**?

No es un detalle de implementación: si solo se corrige el ángulo, los ángulos
quedan finos pero la desviación de la punta libre se estanca, porque el sesgo de
rotación se acumula a lo largo de la barra. Con las tres, baja a una fracción de
milímetro. **Saber cuáles acepta decide qué se le puede prometer al cliente.**

**4. Trazabilidad.** ¿El control guarda registro de qué programa dobló cada pieza,
y con qué identificador? Serviría para casar cada escaneo con el comando exacto que
lo produjo, que hoy hay que anotar a mano.

---

Igual que arriba: **si solo se puede conseguir una cosa, que sea un archivo de
programa real de una pieza que ya se dobla.**

Gracias,
