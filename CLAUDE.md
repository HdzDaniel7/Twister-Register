# BARCOMP (Twister Register)

Programa offline de un solo `index.html`: diseño de barras dobladas, medición de piezas, registro
y búsqueda de compensaciones del tablero de la dobladora. Taller sin internet, PC y celular
(Android sobre todo). No hay software de metrología ni archivos externos.

## Leer primero, y solo esto
- Este archivo y `.auditoria/mapa.md` bastan para casi cualquier tarea.
- `CONTEXTO_BARCOMP.md` (2200 líneas) y `README.md` (900): NO leer enteros. Buscar con grep la
  sección que haga falta (§6 reglas de interfaz, §7 trampas).
- `.auditoria/informe-2026-11-12.md`: auditoría vigente, con fases A–E. A, B y D (menús) hechas; C espera un reporte de ejemplo.

## Comandos (dentro de `web/`)
- `npm run check` = typecheck + `test_motor.js` + build + `tools/ui_test.mjs` (jsdom). Debe acabar
  en «todas las pruebas pasaron» y «sin excepciones».
- El build escribe `../index.html`. Nunca editarlo a mano.

## Reglas duras
- **Signo**: toda compensación o Δ de ángulo POSITIVA dobla más y CIERRA el ángulo interno;
  negativa dobla menos. Una sola fórmula: `E.bendDelta(base, otro)` en `engine/math.ts`. No
  escribir otra copia.
- **Referencia**: se mide contra el DISEÑO (base de la variante, o el plano tecleado), nunca
  contra el tablero ya compensado. `nominalModel()`, `baseModelOf()`, `designOf(ds)` en `state.ts`.
- Variante = `{base, deltas, tailDelta}`. `ST.model` = base + Δ = TABLERO (lo que va a máquina).
- Reportes por ángulos guardan el ángulo INTERNO absoluto. En modo «Desviación» se teclea medido − nominal (+ = más abierto) y la columna «Ajuste» calculada (= esa desviación, + dobla más) va literal
  al tablero (`angComp()`); en absoluto manda el lazo `ST.comp`.
- Borradores de interfaz (`angUI`, `ptUI`, `proxUI`) no van en `ST`, ni al JSON, ni al deshacer.
- Textos: tres idiomas con las mismas claves (`i18n/keys.ts` lo exige al compilar).
- Un atributo `data-*` no lo emiten dos paneles (hay prueba). Acciones: `data-a` + `app/actions.ts`.

## Trampas
- Archivos con CRLF: un reemplazo con `\n` no casa. Usar Edit, o convertir saltos.
- Campos de ángulo y puntos son `type=text` (coma decimal). Si admiten negativo llevan `data-neg`
  para la tecla ± del teléfono.
- jsdom no mide layout: la distribución visual no está probada por el banco.

## Mapa mínimo (`web/src`)
`engine/` motor puro (measure = ángulos, ptfit = puntos, compensate = lazo, doc = JSON) ·
`state.ts` estado y resúmenes · `panels/` pintado (angles, ptsmeas, comp, model) ·
`app/` acciones, eventos, historial, archivos · `scene/` 3D · `report.ts` · `i18n/`.

## Costumbres
- Commit de fuentes (`feat:`/`fix:`) y otro aparte `build:` para `index.html`. Solo cuando se pida.
- Respuestas al usuario en español, breves.
- Datos del taller: reportes de escaneo con ángulo interno por doblez, «ángulo doble» (torsión
  entre dos planos) y puntos XYZ de SUPERFICIE contra un CAD alineado a un 0 que no se tiene.
