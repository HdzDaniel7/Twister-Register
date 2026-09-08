# Fixtures congelados

`demo-2.3.json` no es un ejemplo: es un **candado**. Guarda los PI que el motor
produce hoy para `demoModel()`, junto con `ANG_DIR`, `ROT_DIR` y los ejes
absolutos que salen de esos dobleces.

## Por qué existe

El sentido de giro del ángulo y del rodado no está en los datos: está en dos
constantes del motor. Los valores que se teclean vienen del taller y **no se
pueden cambiar** — lo que se ajustó fue el motor, para que esos mismos números
doblen hacia donde deben.

Eso significa que un cambio de una sola constante voltea la pieza entera sin
tocar un dato, sin romper ninguna otra prueba y sin que nada se vea raro en la
pantalla. Ya pasó dos veces (`bb76bde`, `ae348e5`), las dos a propósito. La
tercera vez podría no serlo.

Este archivo hace que esa clase de cambio **falle una prueba** en vez de llegar a
la máquina.

## Qué hacer si la prueba falla

Falla porque el motor produce una forma distinta a la que producía. Antes de
tocar nada, decide cuál de estos dos casos es:

**No era intencional.** El cambio volteó la pieza sin querer. Arréglalo. El
fixture está haciendo su trabajo.

**Era intencional** — se quiso cambiar el sentido, como en `bb76bde`. Entonces,
en este orden:

1. Sube `SCHEMA` en `src/engine/doc.ts`. La convención cambió: los archivos
   nuevos tienen que poder distinguirse de los viejos.
2. Añade el esquema anterior a `SCHEMA_AMBIGUOUS` si los números siguen
   valiendo y solo cambia hacia dónde doblan, o a `SCHEMA_LEGACY` si hay que
   convertirlos.
3. Regenera este archivo **a propósito**, con el comando de abajo.
4. Explica en el mensaje del commit qué se volteó y por qué.

Nunca regeneres el fixture solo para que la prueba pase en verde. Ese es el
único uso que lo vuelve inútil.

## Regenerar

```bash
cd web
node --input-type=module -e "
import * as E from './src/engine.ts';
const M = E.demoModel(); const P = E.fk(M).pis;
let a = 0;
process.stdout.write(JSON.stringify({
  _nota: 'GENERADO. Ver test/fixtures/README.md antes de regenerarlo.',
  schema: E.SCHEMA, ANG_DIR: E.ANG_DIR, ROT_DIR: E.ROT_DIR,
  bends: M.bends.map(b => ({feed:b.feed, rot:b.rot, angle:b.angle, radius:b.radius, twist:b.twist, twistLen:b.twistLen})),
  tail: M.tail,
  pis: P.map(p => [+p.x.toFixed(9), +p.y.toFixed(9), +p.z.toFixed(9)]),
  ejesAbsolutos: M.bends.map(b => +(a += b.rot).toFixed(6)),
}, null, 1));
" > test/fixtures/demo-2.3.json
```
