# Mapa del proyecto — BARCOMP (Twister Register) · 2026-11-12

Entrada de la auditoría delta sobre `historico/informe-2026-09-10.md`. Cifras de hoy.

## Propósito
Programa offline (un solo `index.html`) para diseño de barras dobladas, medición de piezas
dobladas, registro y búsqueda de compensaciones del tablero de la dobladora. Usuario: ingeniero
de proceso en taller sin internet, PC y celular. Sin software ni archivos externos.

## Datos reales disponibles (restricción dura)
- Reportes de escaneo 3D: ÁNGULOS de doblado medidos + puntos XYZ referidos a un 0 que el
  usuario NO tiene ni puede obtener. Los puntos hoy son poco aprovechables.
- Sin nube de puntos, sin CAD de medición, sin software de metrología.

## Convención de signo (regla del usuario)
Compensación/Δ de ángulo POSITIVA = doblar más = cierra el ángulo interno. Negativa = doblar
menos. `E.bendSense`, fix 988c9f3. Reportes por ángulos guardan ángulo INTERNO absoluto;
ajuste tecleado c: real interno = plano + c («corrección a aplicar»).

## Stack
TypeScript 7 + Three.js 0.185, esbuild a `../index.html` (6027 líneas). Node >=22.18.
`npm run check` = typecheck + test_motor.js (5540 l) + build + tools/ui_test (probe_ui.js 5469 l, jsdom).
CI en `.github/`. Fuente `web/src`: ~20 900 líneas.

## Módulos (web/src)
- `engine/` motor puro: kinematics (597), model (302), compensate (350, lazo: ganancia,
  banda muerta, tope), measure (191), fitting (229), ptfit (410, método por puntos, LM),
  datums (318, puntos de coincidencia), proximity (134), pins (825) + fixture (453) +
  contact (365) + load (1161) + sag (200) (amarre y gravedad), section/fibre/brep/step
  (sección, exportar STEP), csv, lims, machine, feasible, expr, doc (550, JSON guardado).
- `state.ts` (1094): ST global, variantes `{base, deltas, tailDelta}`, datasets, reportes.
- `ptstate.ts` (230), `proxstate.ts` (119): borradores de UI por puntos / cercanía.
- `panels/`: left, model, meas, angles (268), ptsmeas (122), points, comp (199), pins (301),
  fixture, section, lims, mach, datums, prox, focus, status, shell, fmt, render.
- `app/`: actions (619), events/{change 606, click 187, keyboard 200}, history (deshacer),
  files, phone (125, modo celular), render, theme.
- `scene/`: stage (415), layers (742), geometry, view, build. `ribbon.ts` cinta inferior.
- `report.ts` (573): reporte imprimible. `i18n/` es/en/de (~590 claves cada uno).
- `shell.html`, `app.css` (807).

## Interfaz
Tres modos: Modelar, Medir, Compensar. Lateral izquierdo `#lf`, visor `#vp`, derecha `#rt`,
inferior `#bt` + cinta `#rb`. Medir tiene métodos: nube/CSV, Por ángulos (reportes, plano /
tablero / reporte, entrada absoluta o ajuste, salida pieza real o compensación a tablero),
Por puntos (objetivo/medida por PI, mover solo ángulos o ángulos y distancias).
Otras funciones: varios puntos de coincidencia, rastreador de cercanía, pieza libre con
gravedad, amarre por pines, fixture, límites, máquina, sección, reporte.

## Historia
142 commits desde la auditoría del 09-10. Lo nuevo sin auditar: medición por ángulos
(e61000e..eaa279e), por puntos (b893054, 5221782), punto de coincidencia y múltiples datums,
cercanía, pieza libre, sección/tubo, colores del reporte.
`plan-fases.md` (787 l) vivo: abierto amarre y carga, preguntas al taller, provisionales.
`CONTEXTO_BARCOMP.md` (2190 l) es la guía interna; §6 reglas de interfaz, §7 trampas.

## Ausencias y sospechas
- `simulate()` sigue inventando la pieza medida (alfa de demostración): ¿aún útil?
- `web/barcomp_viewer.html` suelto; `tools/` con probes y demos (¿vivos?); `__pycache__`.
- Sin medición de layout real (jsdom no mide): la distribución visual no está probada.
- Documentación muy grande (README 903 + CONTEXTO 2190 + plan 787): caro en tokens por sesión.
- Sin validación contra datos reales de máquina: ganancia y signos no confirmados con material.
