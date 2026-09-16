# Mapa del proyecto — BARCOMP α (Twister Register) · actualizado 2026-09-10

> Segunda versión. La primera es del 2026-09-07 (auditoría `informe-2026-09-07.md`).
> Esta auditoría es un **delta**: el alcance está en lo que se construyó DESPUÉS.

## Propósito
Visor web para compensación de dobleces de una barra rectangular de aluminio (~1.7 m,
~15 dobleces) doblada por robot contra una rotary draw. Se escanea con GOM/ZEISS, se
compara contra el CAD nominal y se decide cuánto mover cada ángulo comandado.
Desde el 2026-09-09 modela además **el fixture físico**: pedestales, pines de amarre y
peso propio de la pieza.

## Tipo y stack
Software puro (web client-only), dominio mecatrónico fuerte. TypeScript strict, three.js
0.185, esbuild → **un solo `index.html` offline de 812 KB** que abre por doble clic bajo
`file://`. Sin frameworks de UI (paneles como plantillas de cadena, eventos por
delegación), sin backend, sin red, sin almacenamiento del navegador. CI en
`.github/workflows/ci.yml`. Publicado en GitHub Pages.

## Tamaño (creció ~80 % desde la auditoría previa)
- `web/src/`: **67 archivos, 10 954 líneas** (antes 49 / ~6100)
- `web/test_motor.js`: 2596 líneas, **480 pruebas** de motor
- `web/tools/probe_ui.js`: 2178 líneas, **230 pasos** de banco en Edge headless por CDP
- 47 commits desde el 2026-09-07. Rama `main`, árbol limpio

## ALCANCE DE ESTA AUDITORÍA — lo construido desde el 2026-09-07

### El fixture como modelo de datos
- `engine/fixture.ts` (210) — `TABLE_Z = -260`, `PED_DEFAULT`, `placePath()` coloca la
  pieza sobre la mesa, `sectionDrop()`, `pedestalFit()`, `pedestalSpans()`, `seedPedestals()`
- `engine/contact.ts` (101) — `halfExtent`, `segSegClosest`, `nearestToSegment`
- `panels/fixture.ts` (105) — pestaña Fixture, tabla de pedestales, columna Reacción

### El amarre por pines laterales (2026-09-09)
- `engine/pins.ts` (504) — el mayor del motor. `pinFit()`, `gapAt()`, `stationSpans()`,
  `withDelta()` (deltas en GRADOS), y `restrain()`: solver geométrico de contactos
  bilaterales por mínimos cuadrados amortiguados, peso de rigidez `EI/L` — **relativo, así
  que E se cancela** (probado). `seedPins()` propone pines.
- `panels/pins.ts` (205) — pestaña Amarre: pines, ajustes del solver, material

### La carga: la pieza pesa (2026-09-10, lo más reciente)
- `engine/load.ts` (471) — `settle()`: minimización de energía
  `Φ(u) = ½ΣKᵢuᵢ² − ΣFₘ(pₘ·d̂) + ½κΣ⟨−gapᶜ⟩²`, contactos **unilaterales** por penalización
  (`CONTACT_K = 1e5`), Newton amortiguado, conjunto activo de dos pasadas, gradiente y
  jacobiano numéricos. Aquí **E ya NO se cancela**. Devuelve `Settled`: reacciones en
  newton por pin y por pedestal, penetración, caída, peso, lo que llevan los apoyos.
- `engine/sag.ts` (176) — flecha por gravedad de viga (M6). **Complementario y NO aditivo**
  con `load.ts`; el solapamiento está documentado como punto ciego.
- `types/process.ts` (152) — `Load`, `Pin`, `Pedestal`, `Restraint`, `Mat`

### Estado, UI y escena que los sirven
- `state.ts` (468, antes 239) — `heldOn()` = amarre O carga; **caché `heldCache`** por
  `JSON.stringify` de todo el estado relevante; `shownModel()` decide qué geometría se ve
- `app/events/change.ts` (427, antes 132) — despacho por atributos `data-*`, listas blancas
- `scene/layers.ts` (405) — capas del 3D: pines, pedestales, mesa, pieza sujeta, referencia
- `panels/render.ts` (77) — `renderRight()` **confirma la celda enfocada antes de pintar**
  (corrección del 2026-09-10); `panels/focus.ts` guarda y restaura el foco
- `app/events/keyboard.ts` (200) — teclado tipo hoja de cálculo; `bindDevRows()` exige que
  el foco esté en la FILA (corrección del 2026-09-10)

## Archivos clave por lente
- Realismo físico y definición de resultados: `engine/load.ts`, `engine/pins.ts`, `engine/sag.ts`
- Eficiencia: `state.ts` (caché), `engine/load.ts` (Newton numérico), `scene/layers.ts`, `panels/render.ts`
- UX del modelado: `panels/{model,points,fixture,pins,comp}.ts`, `app/events/*`
- Frontera estado↔UI: `state.ts`, `app/events/change.ts`, `panels/focus.ts`
- Persistencia: `engine/doc.ts` (esquema `barcomp/2.3`), `app/files.ts`, `app/history.ts`

## Convenciones cerradas (no las cuestiones sin evidencia)
mm y grados en la UI y el JSON, radianes solo dentro de funciones · LRA con `rot` relativo ·
los signos de ángulo y rodado se congelan, NO se invierten (decisión del dueño) · todo texto
por `T('clave')`, paridad es/en/de es error de compilación · `scene/` lee color de `:root` ·
nada de localStorage/fetch/CDN · commit de fuente y commit `build:` van juntos.

## Qué sigue ausente
- **Sin datos reales**: nadie ha metido una barra escaneada. `simulate()` la inventa.
  Amarre, carga y flecha **no están contrastados contra nada físico** (bloqueado en A.5)
- Sin lint ni formateador · sin pruebas de `state.ts` en Node · sin revisión con lector
  de pantalla real · sin certificado de material (E y densidad son valores de catálogo)
- Punto ciego declarado del solver de carga: un **tramo recto no puede flectar** (las
  incógnitas viven en los dobleces), y un apoyo en el primer tramo lee 0 N
