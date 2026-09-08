# Mapa del proyecto — BARCOMP α (Twister Register)

## Propósito (inferido)
Visor web para compensación de dobleces de una barra rectangular de aluminio
(~1.7 m, ~15 dobleces) doblada por robot contra una rotary draw. Se escanea con
GOM, se compara contra el CAD nominal y se decide cuánto mover cada ángulo
comandado para que la siguiente pieza entre en tolerancia.

## Tipo
Software puro (web client-only) con dominio mecatrónico fuerte: el núcleo es un
motor de cinemática 3D + un lazo de control de proceso. No hay hardware ni
firmware en este repo. El repo hermano «Twister Register Python» tiene un motor
gemelo (fuera de alcance salvo por la duplicación).

## Stack
- TypeScript strict (`tsc --noEmit`, no emite), Node >= 22.18 para type-stripping
- three.js 0.185 + OrbitControls, canvas 2D para la cinta
- esbuild 0.28 -> IIFE inline -> **un solo `index.html` offline** (~672 KB, 186 KB gzip)
- Sin frameworks de UI: paneles como cadenas de plantilla, eventos por delegación
- Sin backend, sin red, sin localStorage, sin CDN. Corre bajo `file://`
- Publicado en GitHub Pages: https://hdzdaniel7.github.io/Twister-Register/
- Rapier3d-compat y @tweenjs/tween son transitivas de @types/three (devDependency); NO entran al bundle. Corrección de ARQ-08 sobre la primera versión de este mapa.

## Tamaño
- `web/src/`: 49 archivos, ~6100 líneas (incluye 458 de CSS y 34 de HTML)
- `web/test_motor.js`: 942 líneas, ~163 asserts del motor + i18n
- `web/tools/`: 8 scripts (~365 líneas de .mjs) — banco de UI por CDP y sondas
- `index.html`: 689 KB generado, versionado en la raíz (artefacto compilado)
- Docs: README 26 KB, CONTEXTO_BARCOMP.md 55 KB (ignorado por git), 4 PROMPT_WEB_V*.md
- 46 commits, rama `main`, árbol limpio

## Inventario de módulos (`web/src/`)
- `engine.ts` — barril del motor, sin DOM, 83 exports
  - `engine/math.ts` (58) matrices, wrap, PRNG
  - `engine/bend.ts` (49) el doblez y su normalización
  - `engine/kinematics.ts` (382) fk · ik · bendDecomp · buildPath · rowLengths
  - `engine/model.ts` (205) variantes, deltas, edición de puntos PI
  - `engine/fitting.ts` (144) Kabsch, anclaje entre modelos, colocación
  - `engine/compensate.ts` (244) simulate(), lazo, desviaciones, lote, springback
  - `engine/expr.ts` (134) parser propio de la celda de compensación (sin eval)
  - `engine/doc.ts` (245) esquema barcomp/2.2, migración, CSV de puntos
- `app.ts` (104) arranque y cableado
  - `app/actions.ts` (377) · `app/history.ts` (133) · `app/render.ts` (67) · `app/theme.ts` (38)
  - `app/events/{change(132),keyboard(150),click(86),grips(82)}.ts` · `app/dom.ts` (5)
- `scene.ts` — barril three.js: `stage.ts` (236) · `layers.ts` (281) · `geometry.ts` (47) · `build.ts` (56) · `view.ts` (64) · `types.ts` (37)
- `panels.ts` — barril de UI: `left(153)` · `focus(118)` · `model(100)` · `comp(98)` · `shell(94)` · `meas(83)` · `fmt(83)` · `points(74)` · `render(46)` · `status(25)`
- `state.ts` (239) ST: modelos, referencia, anclaje, capas, piezas medidas
- `types.ts` (389) tipos del dominio, State y documento
- `i18n.ts` (443) I18N.es/.en/.de, paridad verificada en pruebas
- `ribbon.ts` (105) cinta inferior en canvas 2D
- `report.ts` (85) reporte imprimible · `io.ts` (52) Blob download + FileReader
- `app.css` (458) tokens y layout, paleta de los dos temas
- `shell.html` (34) esqueleto con marcadores `/*__CSS__*/` y `/*__APP__*/`

## Archivos clave por área
- Correctitud numérica: `web/src/engine/kinematics.ts`, `engine/fitting.ts`
- Lazo de control: `web/src/engine/compensate.ts`
- Persistencia/migración: `web/src/engine/doc.ts`
- Entrada de usuario no trivial: `web/src/engine/expr.ts` (parser propio)
- Estado y sincronía: `web/src/state.ts`, `web/src/app/history.ts`
- Rendimiento 3D y fugas: `web/src/scene/layers.ts`, `scene/stage.ts`
- Build/artefacto: `web/build.mjs`, `web/src/shell.html`

## Convenciones cerradas (documentadas, no las cuestiones sin evidencia)
- mm y grados en UI y JSON; radianes solo dentro de funciones. Sistema derecho
- LRA: `rot` inclina el eje de doblado (no rueda la barra); `rot` es giro RELATIVO
- Forma canónica de `ik()`: eje absoluto en (−90, 90], el signo del `angle` elige el lado
- Todo texto visible pasa por `T('clave')`; paridad es-en-de es error de compilación
- `scene/` y `ribbon.ts` leen color de `:root` con `cssVar()`, nunca literales
- Nada de localStorage/sessionStorage/fetch/CDN
- Ningún archivo > 400 líneas, ninguna función > 60

## Qué NO encontré (ausencias)
- **Sin CI**: no hay `.github/`, ningún workflow. `npm run check` es manual
- **Sin lint ni formateador**: no hay eslint, prettier, biome ni config equivalente
- **Sin gestor de versiones del artefacto**: `index.html` generado se versiona en la
  raíz; no hay hook ni check que impida commitear un `index.html` desfasado de `src/`
- **Sin pruebas de la capa UI/estado en Node**: el banco de UI (`test:ui`) requiere Edge
  headless por CDP; no hay pruebas unitarias de `state.ts`, `history.ts` ni `panels/`
- **Sin manejo explícito de errores de usuario visible**: no vi `try/catch` alrededor de
  la importación de CSV/JSON en la lectura inicial (verificar en `doc.ts`/`actions.ts`)
- **Sin `npm audit` en el flujo**, aunque hoy sale limpio (0 vulnerabilidades, 0 outdated) y el lock v3 trae binarios de todas las plataformas
- **Sin licencia** en el repo
- **Sin datos reales**: `simulate()` inventa la pieza medida; nadie ha metido una barra real
- **Basura versionada/ignorada**: `web/tools/eps_14228/` (perfil de Edge, cientos de archivos
  binarios) existe en disco; el .gitignore lo cubre con `web/tools/eps_*/` — confirmar
  que no se coló ninguno al índice
- **Duplicación entre motores**: motor gemelo en Python fuera del repo, sincronizado a
  mano y verificado por `compare_engines.py`, que no vive aquí
