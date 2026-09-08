# Dependencias de terceros

`index.html` es un artefacto compilado: lleva **three.js empotrado**. No es un
enlace ni una CDN — el código va dentro del archivo, porque el requisito del
proyecto es que abra bajo `file://` en un taller sin red. Eso convierte cada
copia del HTML en una REDISTRIBUCIÓN de three.js, y la licencia MIT pide que
el aviso de copyright viaje con ella.

Por eso `build.mjs` compila con `legalComments: 'eof'` y comprueba que el
aviso quedó dentro antes de escribir el archivo. Si alguien vuelve a poner
`'none'` para ahorrar unos bytes, la compilación falla en vez de publicar un
artefacto que incumple.

## three.js

- Versión fijada: ver `web/package.json` (`dependencies.three`).
- Sitio: https://threejs.org · Código: https://github.com/mrdoob/three.js
- Se usa además `examples/jsm/controls/OrbitControls.js`, del mismo proyecto y
  bajo la misma licencia.

```
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Herramientas de compilación

`esbuild` (MIT) y `typescript` (Apache-2.0) son dependencias de DESARROLLO: no
entra una sola línea suya en el artefacto, así que no hay nada que redistribuir.

## Licencia de BARCOMP

Pendiente: la elige el dueño del proyecto. Ver M15 en `.auditoria/plan-fases.md`.
