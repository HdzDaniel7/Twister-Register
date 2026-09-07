/* =========================================================================
   BARCOMP — motor JavaScript.

   Es el MISMO motor que python/barcomp/core.py, con el mismo esquema JSON
   `barcomp/1.0`, así que los archivos van y vienen entre las dos
   implementaciones. Los nombres son camelCase de este lado y snake_case del
   lado Python (fk, ik, orientations, machineFeeds, buildPath, twistSpans,
   simulate, compensate, kabsch).

   Este archivo es solo un barril: reexporta `engine/*.ts`, partido por
   responsabilidad (matemática de base, doblez/modelo, cinemática, variantes,
   ajuste y colocación, proceso simulado y compensación, expresiones de celda,
   y esquema/documento). Quien importa `./engine.ts` no nota el reparto.
   ========================================================================= */
export * from './engine/math.ts';
export * from './engine/bend.ts';
export * from './engine/kinematics.ts';
export * from './engine/model.ts';
export * from './engine/fitting.ts';
export * from './engine/compensate.ts';
export * from './engine/expr.ts';
export * from './engine/doc.ts';
