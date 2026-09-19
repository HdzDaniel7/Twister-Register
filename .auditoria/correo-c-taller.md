# Para el taller — el fixture, el material y los criterios

*Extracto de `solicitud-datos.md` (Parte C) listo para enviar. El documento largo tiene el
porqué de cada punto con las cifras medidas; esto es lo que hay que preguntar.*

---

**Asunto: cinco cosas del fixture que el programa no puede adivinar**

Hola:

El programa ya monta la barra sobre el fixture, la deja caer con su propio peso y dice
cuánto se mueve la punta, qué apoyo trabaja y dónde se concentra el esfuerzo. Para que esos
números signifiquen algo de vuestro fixture y no de uno inventado, necesito cinco cosas.
Ninguna lleva trabajo de oficina: se contestan mirando la máquina.

## 1. Los altos de los pedestales: ¿cómo se ponen y con qué se comprueban?

Esta es la importante, y conviene explicar por qué.

Cerca de la mordaza la barra está muy sujeta y casi no puede ceder. Si un pedestal está
**una micra** más alto de la cuenta, esa micra no se la traga la barra: se convierte en
fuerza, unos **6 newton por micra**. Con medio pelo de más —0.05 mm, lo que se ve con un
flexómetro— en UN solo apoyo, la fuerza que se reparten los apoyos pasa de 27 a **333
newton**, sobre una barra que pesa 24. Lejos de la mordaza no pasa eso, porque ahí la barra
sí puede ceder.

O sea: **los newton que enseña la pantalla valen lo que valga la medida de los altos.** Hoy
la pantalla lo avisa y esos newton sirven para ver qué apoyo trabaja y cuál no, no como una
lectura de báscula.

Lo que necesito saber:

- **¿Los pedestales son de altura fija, se regulan, o se calzan con suplementos?**
- **¿Con qué se ajustan y con qué se comprueban?** ¿Reloj comparador, calibre de alturas, la
  escala del husillo, a ojo?
- **¿Qué desviación real tiene ese ajuste** cuando se monta un fixture?

**«Se ponen a ojo» es una respuesta perfectamente buena.** Si es así, la pantalla se queda
como está y no se promete más. Lo que no se puede es dar newton sin saberlo.

## 2. ¿Qué cunas hay montadas?

En el programa la cuna es una chapa recta de 44 mm de ancho y el largo que se le ponga. Sobre
una barra curvada, el largo cambia bastante cómo se apoya: sobre un codo de la pieza de
ejemplo, pasar de 20 a 200 mm de cuna mueve la inclinación que pide la barra unos 15°.

- **¿Qué largo tienen las cunas que hay puestas?** Si hay de varias medidas, cuáles.
- **¿Son chapa recta, en V, o basculan?**

Si son cortas, no hay nada que cambiar. Si son en V o basculantes, hay que modelarlas, y
prefiero saberlo antes de inventarme una.

## 3. El certificado del material

El programa dice cuántos MPa lleva la pieza y lo compara con el límite del material. Hoy usa
valores de catálogo. La **forma** que calcula es buena —cuánto se mueve la punta, qué codo es
el peor—, pero el porcentaje del límite lleva un aluminio de manual.

Con el **certificado de colada** de las barras que se doblan —aleación, estado, y si viene,
módulo, densidad y límite elástico— eso deja de ser una estimación.

## 4. Con la barra sujeta, ¿qué forma es la buena?

El programa corrige hoy hacia la forma que la barra tiene **suelta**. Pero con los pines y
los apoyos puestos, la barra no puede tomar esa forma.

**¿La pieza correcta es la que queda bien AL SOLTARLA, o la que queda bien MONTADA en el
fixture?** Las dos respuestas son razonables según cómo se acepte la pieza; solo hay que
saber cuál es la vuestra.

## 5. ¿Cuántos dobleces tiene la pieza con más dobleces que pasa de verdad?

Un número aproximado vale. No es curiosidad: el cálculo que asienta la barra sobre el
fixture se encarece muy deprisa con el número de dobleces. Con 15 tarda 0.05 segundos; con
30, 0.13; con 34, casi un segundo; con 60, **dieciséis segundos**. Si las piezas de verdad
se quedan por debajo de 30, no hay nada que hacer. Si las pasan, hay trabajo, y conviene
saberlo antes de que alguien abra esa pieza y crea que el programa se ha colgado.

Dos cosas medidas que hacen la pregunta fácil de contestar:

- **No es la pieza más larga**, es la que más dobleces tiene. Una barra de 4.6 m con 30
  dobleces cuesta lo mismo que una de 1 m con 30.
- **Da igual lo juntos que vayan** los dobleces.

O sea: mirad la pieza con más dobleces que pase por la máquina y contadlos.

---

## Si hay tiempo, dos más

**6. En la pantalla de compensar, ¿conviene ver y poder apagar el amarre y la carga?** Es la
pantalla donde se decide sobre material, y hoy esos dos interruptores están en otra. Dejarlos
puestos sin querer cambia los números.

**7. Si algún día se doblan tubos**, ¿hay una norma o una tabla de taller para el radio
mínimo? En un tubo eso lo manda la relación entre diámetro y pared, no el material, y el
programa hoy lo juzga como si fuera barra maciza — por eso avisa con palabras en vez de dar
un número. Con vuestra tabla, o con piezas ya dobladas de las que sacarla, deja de avisar y
empieza a decidir: el campo donde se teclea ya está puesto, vacío, en la pantalla de
límites. Si vuestra regla es «nunca por debajo de dos diámetros», con eso basta.

---

**Si solo se puede contestar una cosa, que sea la 1**: cómo se ponen y se comprueban los
altos de los pedestales. Es la que decide si el programa puede hablar de fuerzas o solo de
si la barra toca.

Y si se puede mandar una foto del fixture montado, con algo al lado que dé la escala, vale
por media página de explicación.

Gracias,
