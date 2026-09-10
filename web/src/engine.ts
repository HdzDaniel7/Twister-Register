/* =========================================================================
   BARCOMP — motor JavaScript.

   Es el ÚNICO motor desde el 2026-09-08. Hasta esa fecha había un gemelo en
   Python (numpy + Tkinter) que compartía el esquema JSON y se comparaba contra
   este con `compare_engines.py`; se retiró del alcance por decisión del dueño
   del proyecto. Quien vigila hoy que los números no se muevan en silencio es el
   fixture congelado de `test/fixtures/`, no una segunda implementación.

   Este archivo es solo un barril: reexporta `engine/*.ts`, partido por
   responsabilidad (matemática de base, doblez/modelo, cinemática, variantes,
   ajuste y colocación, proceso simulado y compensación, expresiones de celda,
   y esquema/documento). Quien importa `./engine.ts` no nota el reparto.
   ========================================================================= */
export * from './engine/math.ts';
export * from './engine/bend.ts';
export * from './engine/kinematics.ts';
export * from './engine/model.ts';
export * from './engine/feasible.ts';
export * from './engine/lims.ts';
export * from './engine/machine.ts';
export * from './engine/fitting.ts';
export * from './engine/compensate.ts';
export * from './engine/expr.ts';
export * from './engine/doc.ts';
export * from './engine/csv.ts';
export * from './engine/path.ts';
export * from './engine/fixture.ts';
export * from './engine/pins.ts';
