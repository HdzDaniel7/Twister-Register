/* ------------------------------------------------------------------ i18n --
   Todo texto visible pasa por T('clave'). Al agregar una cadena hay que
   ponerla en los TRES: I18N.es, I18N.en e I18N.de. test_motor.js comprueba
   que los tres tengan exactamente el mismo juego de claves — comprobarlo a
   mano es justo el error que se cuela. Cambiar de idioma llama renderAll(),
   que reconstruye toda la interfaz: por eso no hay atributos data-i18n en el
   HTML estático.

   Términos de taller en alemán, por si hay que revisarlos: el doblez de canto
   es Hochkantbiegung y el de plano Flachbiegung; springback es Rückfederung;
   PI es Schnittpunkt; longitud desarrollada es Abwicklungslänge. OJO: «datum»
   en alemán significa fecha, así que el datum de medición es Bezug.        */
type Lang = 'es' | 'en' | 'de';

/** Las 169 claves que deben existir en LOS TRES diccionarios. Que falte una
 *  en alguno es, con esto, un error de compilación — ya no solo de prueba. */
type I18nKey =
  | 'sub' | 'bNew' | 'bOpen' | 'bSave' | 'bRep' | 'bDemo' | 'layers' | 'datasets'
  | 'model' | 'meas' | 'thSys' | 'thLight' | 'thDark' | 'comp' | 'points' | 'lNom'
  | 'lVar' | 'lDiff' | 'lMeas' | 'lPred' | 'lDev' | 'lPts' | 'lLbl' | 'lGrid'
  | 'lFix' | 'addSim' | 'del' | 'view' | 'vIso' | 'vTop' | 'vFront' | 'vSide'
  | 'vFit' | 'exag' | 'cmode' | 'cSolid' | 'cDev' | 'legend' | 'devscale' | 'hint'
  | 'ribbon' | 'vsRef' | 'gripW' | 'gripH' | 'name' | 'section' | 'width' | 'thick'
  | 'chamfer' | 'endlen' | 'tail' | 'tol' | 'tolA' | 'tolR' | 'tolF' | 'tolP'
  | 'bends' | 'addBend' | 'nBend' | 'feed' | 'rot' | 'ang' | 'rad' | 'twist'
  | 'twlen' | 'ori' | 'dcol' | 'straight' | 'arcL' | 'cumL' | 'tailRow' | 'lenNote'
  | 'kbdNote' | 'twnote' | 'proc' | 'sbW' | 'sbT' | 'slip' | 'biasR' | 'noise'
  | 'seed' | 'simulate' | 'dNone' | 'deltas' | 'dA' | 'dR' | 'dF' | 'dP'
  | 'srcSim' | 'srcVerify' | 'srcMeas' | 'srcUnk' | 'impCsv' | 'impTip' | 'csvBad'
  | 'batchUse' | 'batchTip' | 'batchOn' | 'batchHint' | 'spread' | 'spreadTip'
  | 'sbMeas' | 'sbUse' | 'sbNote' | 'sbCircular' | 'sbSpreadTip'
  | 'sbTrend' | 'sbTrendTip'
  | 'modeModel' | 'modeMeas' | 'modeComp'
  | 'modeModelTip' | 'modeMeasTip' | 'modeCompTip'
  | 'mnFile' | 'mnModel' | 'mnView' | 'mnPieces' | 'expPts'
  | 'soloOn' | 'soloOff' | 'soloTip' | 'rotAxisTip' | 'rotHeadTip'
  | 'history' | 'undo' | 'redo' | 'histNote'
  | 'srcSimTip' | 'srcVerifyTip' | 'srcMeasTip' | 'srcUnkTip'
  | 'statMaxA' | 'statRms' | 'statTip' | 'statOut' | 'gains' | 'gainW' | 'gainT' | 'what'
  | 'cAng' | 'cRot' | 'cFeed' | 'apply' | 'reset' | 'cmdTbl' | 'cNow' | 'cNew'
  | 'cDelta' | 'predict' | 'verify' | 'noMeas' | 'stLen' | 'stBends' | 'stDatum' | 'stMax'
  | 'stUnits' | 'engine' | 'dStart' | 'dBest' | 'formula' | 'note' | 'repTitle' | 'repDate'
  | 'repPiece' | 'ok' | 'bad' | 'piece' | 'orW' | 'orT' | 'confirmNew' | 'pts'
  | 'x' | 'y' | 'z' | 'variants' | 'addVar' | 'dupVar' | 'setRef' | 'isRef'
  | 'anchor' | 'aStart' | 'aEnd' | 'aBest' | 'insPt' | 'delPt' | 'ptNote' | 'bake'
  | 'zeroD' | 'bakeAsk' | 'dTip' | 'dblz' | 'place' | 'pivot' | 'plX' | 'plY'
  | 'plZ' | 'plRX' | 'plRY' | 'plRZ' | 'plReset' | 'plNote' | 'lMarks' | 'marks'
  | 'addMark' | 'nearPi' | 'distPi' | 'markNote' | 'cCalc' | 'cAdj' | 'zeroTw' | 'cellNote'
  | 'tweakOn';

export const I18N = {
es: {
 sub: 'Compensación de dobleces · alfa',
 bNew: 'Modelo nuevo', bOpen: 'Abrir JSON', bSave: 'Guardar JSON',
 bRep: 'Reporte', bDemo: 'Cargar demo',
 layers: 'Capas', datasets: 'Piezas medidas', model: 'Modelo', meas: 'Medición',
 thSys: 'Tema del sistema', thLight: 'Tema claro', thDark: 'Tema oscuro',
 comp: 'Compensación', points: 'Puntos',
 lNom: 'Barra nominal', lVar: 'Otros modelos', lDiff: 'Desplazamiento entre modelos',
 lMeas: 'Barra medida', lPred: 'Predicción corregida',
 lDev: 'Vectores de desviación', lPts: 'Puntos PI', lLbl: 'Etiquetas',
 lGrid: 'Rejilla', lFix: 'Pedestales',
 addSim: 'Simular pieza', del: 'Eliminar',
 view: 'Vista',
 vIso: 'ISO', vTop: 'Planta', vFront: 'Frente', vSide: 'Lateral', vFit: 'Encuadrar',
 exag: 'Exageración', cmode: 'Color', cSolid: 'Sólido', cDev: 'Desviación',
 legend: 'Referencias', devscale: 'Desviación de punto',
 hint: 'Arrastrar: orbitar · Rueda: zoom · Shift+arrastrar: desplazar',
 ribbon: 'Desviación del desvío total por doblez a lo largo de la longitud desarrollada',
 vsRef: 'Δ desvío por doblez contra el modelo de referencia',
 gripW: 'Ancho del panel derecho', gripH: 'Alto de la tabla',
 name: 'Nombre', section: 'Sección', width: 'Ancho', thick: 'Espesor',
 chamfer: 'Chaflán', endlen: 'Extremo maq.', tail: 'Cola final',
 tol: 'Tolerancias', tolA: 'Ángulo', tolR: 'Rotación', tolF: 'Avance', tolP: 'Punto',
 bends: 'Dobleces', addBend: 'Agregar doblez', nBend: '#',
 feed: 'Avance', rot: 'Rodado', ang: 'Ángulo', rad: 'Radio',
 twist: 'Twist', twlen: 'Long. tw.', ori: 'Or.', dcol: 'Δ',
 straight: 'Recta', arcL: 'L', cumL: 'Σ L', tailRow: 'Cola',
 lenNote: 'Recta = tramo recto de tangencia a tangencia, y es lo único que se teclea de las longitudes. L = longitud del arco que genera el doblez (radio × desvío). Σ L = longitud desarrollada acumulada sobre el eje neutro: recta, arco, recta, arco. Cambiar un radio o un ángulo deja las rectas quietas; el avance de PI a PI se recalcula por dentro y es lo que se guarda y se manda a la máquina.',
 kbdNote: 'Teclado: Tab / ⇧Tab mueven en horizontal · Enter y ↑ ↓ en vertical · Esc descarta la celda · la rueda del ratón o Ctrl+↑ ↓ suben y bajan el valor un paso. Al entrar en una celda su valor queda seleccionado: teclear lo reemplaza. Se admiten hasta tres decimales.',
 twnote: 'Long. tw. = tramo recto (mm) sobre el que se reparte la torsión, centrado en la recta. 0 = toda la recta. No mueve ningún PI: solo define dónde ocurre la torsión.',
 proc: 'Proceso simulado (pieza virtual)',
 sbW: 'Recuperación canto', sbT: 'Recuperación plano', slip: 'Deslizamiento avance',
 biasR: 'Sesgo de rotación', noise: 'Ruido de escaneo', seed: 'Semilla',
 simulate: 'Generar pieza medida', dNone: 'Sin pieza medida. Simule una o importe un CSV.',
 deltas: 'Desviaciones por doblez',
 dA: 'Δ ángulo', dR: 'Δ rodado', dF: 'Δ Avance', dP: 'Desv. punta',
 statMaxA: 'Δ desvío máx.', statRms: 'RMS desvío', statTip: 'Desv. punta libre',
 statOut: 'Fuera de tol.',
 gains: 'Ganancias de corrección', gainW: 'Ganancia canto', gainT: 'Ganancia plano',
 what: 'Qué corregir', cAng: 'Ángulos de doblez', cRot: 'Rodado', cFeed: 'Avances',
 apply: 'Aplicar compensación', reset: 'Restablecer comandos',
 cmdTbl: 'Comandos de máquina', cNow: 'Actual', cNew: 'Nuevo', cDelta: 'Δ',
 predict: 'Residual previsto', verify: 'Verificar (correr 2.ª pieza)',
 noMeas: 'Necesita una pieza medida para calcular la compensación.',
 stLen: 'Longitud desarrollada', stBends: 'Dobleces', stDatum: 'Datum',
 stMax: 'Desv. máx.', stUnits: 'Unidades', engine: 'Motor',
 dStart: 'Extremo inicial', dBest: 'Mejor ajuste global',
 formula: 'nuevo comando = comando actual + ganancia × (nominal − medido)',
 note: 'La cadena completa se regenera tras cada corrección: el arrastre entre dobleces ya está contenido en el modelo.',
 repTitle: 'Reporte de inspección y compensación', repDate: 'Fecha', repPiece: 'Pieza',
 ok: 'En tolerancia', bad: 'Fuera de tolerancia', piece: 'Pieza',
 orW: 'Canto (contra el ancho)', orT: 'Plano (contra el espesor)',
 confirmNew: '¿Crear un modelo nuevo vacío? Se perderá lo no guardado.',
 pts: 'Punto', x: 'X', y: 'Y', z: 'Z',
 variants: 'Modelos', addVar: '+ Modelo', dupVar: 'Duplicar',
 setRef: 'Usar como referencia', isRef: 'REF',
 /* Procedencia de una pieza: sin esto, una pieza inventada por el simulador y
    una medida de verdad se ven exactamente igual en pantalla. */
 srcSim: 'SIM', srcVerify: 'SIM ✓', srcMeas: 'MED', srcUnk: 'S/D',
 impCsv: 'Importar CSV',
 impTip: 'Piezas medidas: un CSV por pieza, con los PI en columnas x,y,z. '
   + 'Se pueden elegir varios archivos a la vez.',
 csvBad: 'Estos archivos no traían al menos tres puntos con coordenadas y no se importaron:',
 /* Compensar desde una sola pieza persigue la dispersión de esa pieza. Con
    varias, la mediana separa lo sistemático de la mala puntería. */
 batchUse: 'Usar la mediana de las piezas visibles ·',
 batchTip: 'Con una sola pieza, el lazo corrige también lo que fue dispersión de esa '
   + 'pieza y la siguiente puede salir peor. Con varias, la mediana deja pasar '
   + 'solo lo que se repite.',
 batchOn: 'El lazo lee la mediana de %n piezas, no la última.',
 batchHint: 'Hay más de una pieza visible: marque la casilla para que el lazo lea la mediana.',
 spread: '±σ',
 spreadTip: 'Dispersión del ángulo entre las piezas visibles (MAD escalado). '
   + 'Grande junto a una desviación grande = mala puntería, no un doblez mal ajustado.',
 /* El resorte deja de teclearse a ojo: se estima de las piezas medidas y se
    enseña con su dispersión, que es lo que dice si el número vale. */
 sbMeas: 'Resorte medido',
 sbUse: 'Usar en el simulador',
 sbNote: 'sb = 1 − ángulo medido / ángulo comandado, por orientación. '
   + 'Mediana ± σ robusta sobre los dobleces de las piezas visibles; '
   + 'los casi rectos (<1°) no entran.',
 sbCircular: 'Aviso: %n de las piezas visibles son simuladas. Estimar el resorte '
   + 'de una pieza inventada devuelve lo que ya está escrito abajo — es un '
   + 'ciclo cerrado, no una medición.',
 sbSpreadTip: 'Dispersión entre dobleces y entre piezas. Si es del tamaño del propio '
   + 'valor, ese resorte no está medido: está adivinado.',
 /* Los tres trabajos. Son verbos porque nombran lo que se está haciendo, no
    una pestaña donde mirar. */
 /* Los menús. Abren cajones que flotan sobre el 3D: la columna fija de 250 px
    se pagaba siempre, y lo que había dentro se toca una vez y se olvida. */
 mnFile: 'Archivo', mnModel: 'Modelos', mnView: 'Vista', mnPieces: 'Piezas',
 soloOn: 'Solo 3D', soloOff: 'Volver',
 /* el rodado es un GIRO, no una posición: el eje se queda donde lo dejaron */
 rotAxisTip: 'Cuánto gira el eje de doblado en esta estación. Queda en %e°.',
 rotHeadTip: 'Giro del eje de doblado respecto a la estación anterior. '
   + 'Un 0 deja el eje donde estaba: el proceso es secuencial.',
 /* Deshacer trabaja sobre el DOCUMENTO: no mueve la cámara ni cambia de
    pantalla, porque lo que se espera de vuelta son datos. */
 history: 'Historial', undo: 'Deshacer', redo: 'Rehacer',
 histNote: 'Deshace ediciones de la pieza: celdas, puntos, modelos, cotas, '
   + 'colocación y compensación aplicada. No deshace la cámara, el tema, el '
   + 'idioma, las capas ni el modo. 50 pasos.',
 soloTip: 'Plegar la tabla y el lateral para ver la pieza entera (tecla F). '
   + 'Al volver, la tabla sigue donde estaba.',
 expPts: 'Exportar puntos',
 modeModel: 'Modelar', modeMeas: 'Medir', modeComp: 'Compensar',
 modeModelTip: 'Teclear la pieza: la tabla entera a la derecha y el modelo al lado.',
 modeMeasTip: 'Mirar la pieza medida: el modelo grande, la cinta alta y las estadísticas.',
 modeCompTip: 'Modo taller: solo se editan las celdas de compensación. Los comandos a '
   + 'todo el ancho y el 3D como banda de comprobación.',
 sbTrend: 'depende del ángulo (%s %/°, r=%r)',
 sbTrendTip: 'El resorte cambia con el ángulo comandado, así que una constante única '
   + 'no describe el proceso. Con esta señal, ajuste por rango de ángulo en vez '
   + 'de adoptar un solo número.',
 srcSimTip: 'Pieza inventada por el simulador. No se ha medido nada.',
 srcVerifyTip: 'Verificación simulada tras aplicar la compensación. Tampoco es una medida.',
 srcMeasTip: 'Pieza medida importada.',
 srcUnkTip: 'Procedencia desconocida: viene de un archivo que no la guardaba.',
 anchor: 'Extremo fijo', aStart: 'Amarre (P0)', aEnd: 'Libre (punta)', aBest: 'Mejor ajuste',
 insPt: '+ Punto intermedio', delPt: '✕ Punto',
 ptNote: 'Edición ABSOLUTA: al mover un punto los demás se quedan donde están y la cadena LRA se recalcula por inversa. Un punto nuevo nace colineal (ángulo 0), listo para moverse. Editar puntos funde los Δ en la base.',
 bake: 'Fundir Δ', zeroD: 'Δ a cero',
 bakeAsk: 'Este modelo tiene Δ sin fundir.\n\nEditar puntos trabaja sobre la geometría efectiva, así que los Δ se funden en la base y quedan en cero.\n\n¿Continuar?',
 dTip: 'Δ punta vs ref', dblz: 'dbl',

 place: 'Colocación', pivot: 'Pivote', plX: 'Mover X', plY: 'Mover Y', plZ: 'Mover Z',
 plRX: 'Giro X', plRY: 'Giro Y', plRZ: 'Giro Z', plReset: 'Restablecer colocación',
 plNote: 'Mueve y gira la PIEZA sobre un suelo quieto, alrededor del PI que elijas como origen: la cuadrícula y la cámara no se mueven. Los pedestales la siguen, apoyando siempre en el suelo. No toca ningún avance, ángulo ni radio.',
 lMarks: 'Puntos de referencia', marks: 'Puntos de referencia',
 addMark: '+ Punto', nearPi: 'PI', distPi: 'Dist.',
 markNote: 'Cotas sueltas en el espacio: el punto se une con el PI más cercano del modelo activo y la cifra dice a cuánto quedó. Sirve para acotar contra el fixture o un datum de taller. «+ Punto» lo crea sobre el doblez seleccionado.',
 cCalc: 'Δ calc.', cAdj: 'Δ aplicada', zeroTw: 'Δ manual a cero',
 cellNote: 'La celda Δ aplicada acepta cuentas sobre lo que calculó el lazo, que se escribe c: «+2» o «c+2» le suma 2, «c*1.1» le pone un 10 % más, y un número suelto la reemplaza. El resto de la tabla es de solo lectura.',
 tweakOn: 'con ajuste manual',
},
en: {
 sub: 'Bend compensation · alpha',
 bNew: 'New model', bOpen: 'Open JSON', bSave: 'Save JSON',
 bRep: 'Report', bDemo: 'Load demo',
 layers: 'Layers', datasets: 'Measured parts', model: 'Model', meas: 'Inspection',
 thSys: 'System theme', thLight: 'Light theme', thDark: 'Dark theme',
 comp: 'Compensation', points: 'Points',
 lNom: 'Nominal bar', lVar: 'Other models', lDiff: 'Model-to-model displacement',
 lMeas: 'Measured bar', lPred: 'Corrected prediction',
 lDev: 'Deviation vectors', lPts: 'PI points', lLbl: 'Labels',
 lGrid: 'Grid', lFix: 'Pedestals',
 addSim: 'Simulate part', del: 'Delete',
 view: 'View',
 vIso: 'ISO', vTop: 'Top', vFront: 'Front', vSide: 'Side', vFit: 'Fit',
 exag: 'Exaggeration', cmode: 'Color', cSolid: 'Solid', cDev: 'Deviation',
 legend: 'Legend', devscale: 'Point deviation',
 hint: 'Drag: orbit · Wheel: zoom · Shift+drag: pan',
 ribbon: 'Total-deflection deviation per bend along developed length',
 vsRef: 'Δ deflection per bend against the reference model',
 gripW: 'Right panel width', gripH: 'Table height',
 name: 'Name', section: 'Section', width: 'Width', thick: 'Thickness',
 chamfer: 'Chamfer', endlen: 'Machined end', tail: 'Tail',
 tol: 'Tolerances', tolA: 'Angle', tolR: 'Rotation', tolF: 'Feed', tolP: 'Point',
 bends: 'Bends', addBend: 'Add bend', nBend: '#',
 feed: 'Feed', rot: 'Roll', ang: 'Angle', rad: 'Radius',
 twist: 'Twist', twlen: 'Twist len', ori: 'Or.', dcol: 'Δ',
 straight: 'Straight', arcL: 'L', cumL: 'Σ L', tailRow: 'Tail',
 lenNote: 'Straight = tangent-to-tangent run, and the only length you type. L = arc length the bend generates (radius × deflection). Σ L = running developed length on the neutral axis: straight, arc, straight, arc. Changing a radius or an angle leaves the straights put; the PI-to-PI feed is recomputed underneath and is what gets saved and sent to the machine.',
 kbdNote: 'Keyboard: Tab / ⇧Tab move across · Enter and ↑ ↓ move down and up · Esc discards the cell · mouse wheel or Ctrl+↑ ↓ step the value. Entering a cell selects its value: typing replaces it. Up to three decimals are accepted.',
 twnote: 'Twist len = straight run (mm) the torsion is spread over, centred on the straight. 0 = whole straight. It moves no PI: it only sets where the torsion happens.',
 proc: 'Simulated process (virtual part)',
 sbW: 'Springback hard way', sbT: 'Springback easy way', slip: 'Feed slip',
 biasR: 'Rotation bias', noise: 'Scan noise', seed: 'Seed',
 simulate: 'Generate measured part', dNone: 'No measured part. Simulate one or import a CSV.',
 deltas: 'Per-bend deviations',
 dA: 'Δ angle', dR: 'Δ roll', dF: 'Δ Feed', dP: 'Tip dev.',
 statMaxA: 'Max Δ deflection', statRms: 'Deflection RMS', statTip: 'Free-end deviation',
 statOut: 'Out of tol.',
 gains: 'Correction gains', gainW: 'Hard-way gain', gainT: 'Easy-way gain',
 what: 'What to correct', cAng: 'Bend angles', cRot: 'Roll', cFeed: 'Feeds',
 apply: 'Apply compensation', reset: 'Reset commands',
 cmdTbl: 'Machine commands', cNow: 'Current', cNew: 'New', cDelta: 'Δ',
 predict: 'Predicted residual', verify: 'Verify (run 2nd part)',
 noMeas: 'A measured part is required to compute compensation.',
 stLen: 'Developed length', stBends: 'Bends', stDatum: 'Datum',
 stMax: 'Max dev.', stUnits: 'Units', engine: 'Engine',
 dStart: 'Start end', dBest: 'Global best fit',
 formula: 'new command = current command + gain × (nominal − measured)',
 note: 'The whole chain is regenerated after each correction: downstream carry-over is already in the model.',
 repTitle: 'Inspection & compensation report', repDate: 'Date', repPiece: 'Part',
 ok: 'In tolerance', bad: 'Out of tolerance', piece: 'Part',
 orW: 'Hard way (across width)', orT: 'Easy way (across thickness)',
 confirmNew: 'Create a new empty model? Unsaved work will be lost.',
 pts: 'Point', x: 'X', y: 'Y', z: 'Z',
 variants: 'Models', addVar: '+ Model', dupVar: 'Duplicate',
 setRef: 'Use as reference', isRef: 'REF',
 srcSim: 'SIM', srcVerify: 'SIM ✓', srcMeas: 'MEAS', srcUnk: 'N/A',
 impCsv: 'Import CSV',
 impTip: 'Measured parts: one CSV per part, with the PIs in x,y,z columns. '
   + 'Several files can be picked at once.',
 csvBad: 'These files did not carry at least three points with coordinates and were not imported:',
 batchUse: 'Use the median of the visible parts ·',
 batchTip: 'With a single part the loop also corrects what was scatter in that part, '
   + 'and the next one can come out worse. With several, the median only lets '
   + 'through what repeats.',
 batchOn: 'The loop reads the median of %n parts, not the last one.',
 batchHint: 'More than one part is visible: tick the box so the loop reads the median.',
 spread: '±σ',
 spreadTip: 'Angle scatter across the visible parts (scaled MAD). Large next to a large '
   + 'deviation means poor repeatability, not a mis-set bend.',
 sbMeas: 'Measured springback',
 sbUse: 'Use in the simulator',
 sbNote: 'sb = 1 − measured angle / commanded angle, per orientation. '
   + 'Median ± robust σ over the bends of the visible parts; '
   + 'near-straight ones (<1°) are left out.',
 sbCircular: 'Warning: %n of the visible parts are simulated. Estimating springback '
   + 'from an invented part returns what is already written below — that is a '
   + 'closed loop, not a measurement.',
 sbSpreadTip: 'Scatter across bends and parts. If it is as large as the value itself, '
   + 'that springback is not measured: it is guessed.',
 mnFile: 'File', mnModel: 'Models', mnView: 'View', mnPieces: 'Parts',
 soloOn: '3D only', soloOff: 'Back',
 rotAxisTip: 'How much the bending axis turns at this station. It ends at %e°.',
 rotHeadTip: 'Turn of the bending axis relative to the previous station. '
   + 'A 0 leaves the axis where it was: the process is sequential.',
 history: 'History', undo: 'Undo', redo: 'Redo',
 histNote: 'Undoes edits to the part: cells, points, models, reference points, '
   + 'placement and applied compensation. It does not undo the camera, theme, '
   + 'language, layers or mode. 50 steps.',
 soloTip: 'Fold the table and the sidebar away to see the whole part (F key). '
   + 'On the way back, the table is where you left it.',
 expPts: 'Export points',
 modeModel: 'Model', modeMeas: 'Measure', modeComp: 'Compensate',
 modeModelTip: 'Type the part: the whole table on the right and the model beside it.',
 modeMeasTip: 'Look at the measured part: big model, tall ribbon and the statistics.',
 modeCompTip: 'Shop-floor mode: only the compensation cells can be edited. Commands '
   + 'full width and the 3D as a check strip.',
 sbTrend: 'depends on the angle (%s %/°, r=%r)',
 sbTrendTip: 'Springback changes with the commanded angle, so a single constant does not '
   + 'describe the process. With this flag, fit per angle range instead of '
   + 'adopting one number.',
 srcSimTip: 'Part invented by the simulator. Nothing was measured.',
 srcVerifyTip: 'Simulated check after applying compensation. Not a measurement either.',
 srcMeasTip: 'Imported measured part.',
 srcUnkTip: 'Unknown origin: it comes from a file that did not record it.',
 anchor: 'Fixed end', aStart: 'Clamp (P0)', aEnd: 'Free (tip)', aBest: 'Best fit',
 insPt: '+ Midpoint', delPt: '✕ Point',
 ptNote: 'ABSOLUTE editing: moving a point leaves the others where they are and the LRA chain is re-derived by inverse kinematics. A new point is born collinear (angle 0), ready to be moved. Editing points bakes the deltas into the base.',
 bake: 'Bake Δ', zeroD: 'Zero Δ',
 bakeAsk: 'This model has unbaked deltas.\n\nPoint editing works on the effective geometry, so the deltas get baked into the base and reset to zero.\n\nContinue?',
 dTip: 'Δ tip vs ref', dblz: 'bends',

 place: 'Placement', pivot: 'Pivot', plX: 'Move X', plY: 'Move Y', plZ: 'Move Z',
 plRX: 'Rot X', plRY: 'Rot Y', plRZ: 'Rot Z', plReset: 'Reset placement',
 plNote: 'Moves and rotates the PART over a still floor, about the PI you pick as origin: the grid and the camera stay put. The pedestals follow it, always resting on the floor. It touches no feed, angle or radius.',
 lMarks: 'Reference points', marks: 'Reference points',
 addMark: '+ Point', nearPi: 'PI', distPi: 'Dist.',
 markNote: 'Loose dimensions in space: each point is joined to the nearest PI of the active model and the figure says how far it landed. Use it to dimension against the fixture or a shop datum. "+ Point" creates it on the selected bend.',
 cCalc: 'Δ calc', cAdj: 'Δ applied', zeroTw: 'Zero manual Δ',
 cellNote: 'The Δ applied cell takes arithmetic on what the loop computed, written as c: "+2" or "c+2" adds 2, "c*1.1" gives it 10 % more, and a bare number replaces it. The rest of the table is read-only.',
 tweakOn: 'manually adjusted',
},
de: {
 sub: 'Biegekompensation · Alpha',
 bNew: 'Neues Modell', bOpen: 'JSON öffnen', bSave: 'JSON speichern',
 bRep: 'Bericht', bDemo: 'Demo laden',
 layers: 'Ebenen', datasets: 'Gemessene Teile', model: 'Modell', meas: 'Messung',
 thSys: 'Systemfarbschema', thLight: 'Helles Farbschema',
 thDark: 'Dunkles Farbschema',
 comp: 'Kompensation', points: 'Punkte',
 lNom: 'Nennstange', lVar: 'Andere Modelle', lDiff: 'Versatz zwischen Modellen',
 lMeas: 'Gemessene Stange', lPred: 'Korrigierte Vorhersage',
 lDev: 'Abweichungsvektoren', lPts: 'Schnittpunkte', lLbl: 'Beschriftungen',
 lGrid: 'Raster', lFix: 'Auflageböcke',
 addSim: 'Teil simulieren', del: 'Löschen',
 view: 'Ansicht',
 vIso: 'ISO', vTop: 'Draufsicht', vFront: 'Vorderansicht', vSide: 'Seitenansicht',
 vFit: 'Einpassen',
 exag: 'Überhöhung', cmode: 'Farbe', cSolid: 'Massiv', cDev: 'Abweichung',
 legend: 'Legende', devscale: 'Punktabweichung',
 hint: 'Ziehen: drehen · Rad: zoomen · Umschalt+Ziehen: verschieben',
 ribbon: 'Abweichung der Gesamtauslenkung je Biegung über die Abwicklungslänge',
 vsRef: 'Δ Auslenkung je Biegung gegenüber dem Referenzmodell',
 gripW: 'Breite des rechten Bereichs', gripH: 'Höhe der Tabelle',
 name: 'Name', section: 'Querschnitt', width: 'Breite', thick: 'Dicke',
 chamfer: 'Fase', endlen: 'Bearbeitetes Ende', tail: 'Auslauf',
 tol: 'Toleranzen', tolA: 'Winkel', tolR: 'Drehung', tolF: 'Vorschub', tolP: 'Punkt',
 bends: 'Biegungen', addBend: 'Biegung hinzufügen', nBend: '#',
 feed: 'Vorschub', rot: 'Rollung', ang: 'Winkel', rad: 'Radius',
 twist: 'Torsion', twlen: 'Torsionslänge', ori: 'Or.', dcol: 'Δ',
 straight: 'Gerade', arcL: 'L', cumL: 'Σ L', tailRow: 'Auslauf',
 lenNote: 'Gerade = gerades Stück von Tangente zu Tangente, und die einzige Länge, die eingetippt wird. L = Bogenlänge, die die Biegung erzeugt (Radius × Auslenkung). Σ L = aufsummierte Abwicklungslänge auf der neutralen Faser: Gerade, Bogen, Gerade, Bogen. Ein geänderter Radius oder Winkel lässt die Geraden stehen; der Vorschub von Schnittpunkt zu Schnittpunkt wird darunter neu berechnet und ist das, was gespeichert und an die Maschine geschickt wird.',
 kbdNote: 'Tastatur: Tab / ⇧Tab bewegen waagerecht · Enter und ↑ ↓ senkrecht · Esc verwirft die Zelle · Mausrad oder Strg+↑ ↓ ändern den Wert um einen Schritt. Beim Betreten einer Zelle wird ihr Wert markiert: Tippen ersetzt ihn. Bis zu drei Nachkommastellen werden angenommen.',
 twnote: 'Torsionslänge = gerades Stück (mm), über das die Torsion verteilt wird, mittig auf der Geraden. 0 = die ganze Gerade. Kein Schnittpunkt wird verschoben: es wird nur festgelegt, wo die Torsion stattfindet.',
 proc: 'Simulierter Prozess (virtuelles Teil)',
 sbW: 'Rückfederung hochkant', sbT: 'Rückfederung flach', slip: 'Vorschubschlupf',
 biasR: 'Drehversatz', noise: 'Scan-Rauschen', seed: 'Startwert',
 simulate: 'Gemessenes Teil erzeugen',
 dNone: 'Kein gemessenes Teil. Simulieren Sie eines oder importieren Sie ein CSV.',
 deltas: 'Abweichungen je Biegung',
 dA: 'Δ Winkel', dR: 'Δ Rollung', dF: 'Δ Vorschub', dP: 'Abw. Spitze',
 statMaxA: 'Max. Δ Auslenkung', statRms: 'RMS Auslenkung', statTip: 'Abweichung freies Ende',
 statOut: 'Außer Toleranz',
 gains: 'Korrekturverstärkungen', gainW: 'Verstärkung hochkant',
 gainT: 'Verstärkung flach',
 what: 'Was korrigieren', cAng: 'Biegewinkel', cRot: 'Rollung', cFeed: 'Vorschübe',
 apply: 'Kompensation anwenden', reset: 'Befehle zurücksetzen',
 cmdTbl: 'Maschinenbefehle', cNow: 'Aktuell', cNew: 'Neu', cDelta: 'Δ',
 predict: 'Erwarteter Restfehler', verify: 'Prüfen (2. Teil fahren)',
 noMeas: 'Für die Kompensation wird ein gemessenes Teil benötigt.',
 stLen: 'Abwicklungslänge', stBends: 'Biegungen', stDatum: 'Bezug',
 stMax: 'Max. Abw.', stUnits: 'Einheiten', engine: 'Rechenkern',
 dStart: 'Anfangsende', dBest: 'Globale beste Anpassung',
 formula: 'neuer Befehl = aktueller Befehl + Verstärkung × (Nennwert − Messwert)',
 note: 'Nach jeder Korrektur wird die ganze Kette neu erzeugt: die Fortpflanzung zwischen den Biegungen steckt bereits im Modell.',
 repTitle: 'Prüf- und Kompensationsbericht', repDate: 'Datum', repPiece: 'Teil',
 ok: 'In Toleranz', bad: 'Außer Toleranz', piece: 'Teil',
 orW: 'Hochkantbiegung (gegen die Breite)', orT: 'Flachbiegung (gegen die Dicke)',
 confirmNew: 'Ein neues leeres Modell anlegen? Nicht Gespeichertes geht verloren.',
 pts: 'Punkt', x: 'X', y: 'Y', z: 'Z',
 variants: 'Modelle', addVar: '+ Modell', dupVar: 'Duplizieren',
 setRef: 'Als Referenz verwenden', isRef: 'REF',
 srcSim: 'SIM', srcVerify: 'SIM ✓', srcMeas: 'MESS', srcUnk: 'K.A.',
 impCsv: 'CSV importieren',
 impTip: 'Gemessene Teile: eine CSV je Teil, mit den Schnittpunkten in den '
   + 'Spalten x,y,z. Es können mehrere Dateien auf einmal gewählt werden.',
 csvBad: 'Diese Dateien enthielten keine drei Punkte mit Koordinaten und wurden nicht importiert:',
 batchUse: 'Median der sichtbaren Teile verwenden ·',
 batchTip: 'Mit nur einem Teil korrigiert der Regelkreis auch dessen Streuung, und das '
   + 'nächste Teil kann schlechter ausfallen. Mit mehreren lässt der Median nur '
   + 'das durch, was sich wiederholt.',
 batchOn: 'Der Regelkreis liest den Median von %n Teilen, nicht das letzte.',
 batchHint: 'Es ist mehr als ein Teil sichtbar: Haken setzen, damit der Regelkreis den Median liest.',
 spread: '±σ',
 spreadTip: 'Streuung des Winkels über die sichtbaren Teile (skalierter MAD). Groß neben '
   + 'einer großen Abweichung heißt schlechte Wiederholbarkeit, kein falsch '
   + 'eingestellter Bogen.',
 sbMeas: 'Gemessene Rückfederung',
 sbUse: 'Im Simulator verwenden',
 sbNote: 'sb = 1 − gemessener Winkel / befohlener Winkel, je Orientierung. '
   + 'Median ± robustes σ über die Bögen der sichtbaren Teile; '
   + 'nahezu gerade (<1°) bleiben draußen.',
 sbCircular: 'Achtung: %n der sichtbaren Teile sind simuliert. Die Rückfederung aus '
   + 'einem erfundenen Teil zu schätzen liefert das, was unten schon steht — '
   + 'ein geschlossener Kreis, keine Messung.',
 sbSpreadTip: 'Streuung über Bögen und Teile. Ist sie so groß wie der Wert selbst, ist '
   + 'diese Rückfederung nicht gemessen, sondern geraten.',
 mnFile: 'Datei', mnModel: 'Modelle', mnView: 'Ansicht', mnPieces: 'Teile',
 soloOn: 'Nur 3D', soloOff: 'Zurück',
 rotAxisTip: 'Wie weit sich die Biegeachse an dieser Station dreht. Sie endet bei %e°.',
 rotHeadTip: 'Drehung der Biegeachse gegenüber der vorherigen Station. '
   + 'Eine 0 lässt die Achse stehen: der Prozess ist sequenziell.',
 history: 'Verlauf', undo: 'Rückgängig', redo: 'Wiederholen',
 histNote: 'Macht Änderungen am Teil rückgängig: Zellen, Punkte, Modelle, '
   + 'Bezugspunkte, Platzierung und angewandte Kompensation. Nicht Kamera, '
   + 'Thema, Sprache, Ebenen oder Modus. 50 Schritte.',
 soloTip: 'Tabelle und Seitenleiste einklappen, um das ganze Teil zu sehen (Taste F). '
   + 'Beim Zurückkommen steht die Tabelle, wo sie war.',
 expPts: 'Punkte exportieren',
 modeModel: 'Modellieren', modeMeas: 'Messen', modeComp: 'Kompensieren',
 modeModelTip: 'Das Teil eingeben: die ganze Tabelle rechts und das Modell daneben.',
 modeMeasTip: 'Das gemessene Teil ansehen: großes Modell, hohes Band und die Statistik.',
 modeCompTip: 'Werkstattmodus: nur die Kompensationszellen sind editierbar. Befehle über '
   + 'die volle Breite, das 3D als Kontrollstreifen.',
 sbTrend: 'hängt vom Winkel ab (%s %/°, r=%r)',
 sbTrendTip: 'Die Rückfederung ändert sich mit dem befohlenen Winkel, eine einzige '
   + 'Konstante beschreibt den Prozess also nicht. Bei diesem Hinweis je '
   + 'Winkelbereich anpassen, statt eine Zahl zu übernehmen.',
 srcSimTip: 'Vom Simulator erzeugtes Teil. Es wurde nichts gemessen.',
 srcVerifyTip: 'Simulierte Prüfung nach der Kompensation. Ebenfalls keine Messung.',
 srcMeasTip: 'Importiertes gemessenes Teil.',
 srcUnkTip: 'Herkunft unbekannt: aus einer Datei, die sie nicht gespeichert hat.',
 anchor: 'Festes Ende', aStart: 'Einspannung (P0)', aEnd: 'Frei (Spitze)',
 aBest: 'Beste Anpassung',
 insPt: '+ Zwischenpunkt', delPt: '✕ Punkt',
 ptNote: 'ABSOLUTE Bearbeitung: wird ein Punkt verschoben, bleiben die übrigen stehen und die LRA-Kette wird rückwärts neu berechnet. Ein neuer Punkt entsteht kollinear (Winkel 0) und ist sofort verschiebbar. Das Bearbeiten von Punkten rechnet die Δ in die Basis ein.',
 bake: 'Δ einrechnen', zeroD: 'Δ auf null',
 bakeAsk: 'Dieses Modell hat noch nicht eingerechnete Δ.\n\nDie Punktbearbeitung arbeitet auf der wirksamen Geometrie, deshalb werden die Δ in die Basis eingerechnet und auf null gesetzt.\n\nFortfahren?',
 dTip: 'Δ Spitze ggü. Ref.', dblz: 'Bg.',

 place: 'Platzierung', pivot: 'Drehpunkt', plX: 'Verschieben X', plY: 'Verschieben Y',
 plZ: 'Verschieben Z',
 plRX: 'Drehung X', plRY: 'Drehung Y', plRZ: 'Drehung Z',
 plReset: 'Platzierung zurücksetzen',
 plNote: 'Bewegt und dreht das TEIL über einem ruhenden Boden, um den als Ursprung gewählten Schnittpunkt: Raster und Kamera bleiben stehen. Die Auflageböcke folgen ihm und stehen immer auf dem Boden. Kein Vorschub, Winkel oder Radius wird angetastet.',
 lMarks: 'Referenzpunkte', marks: 'Referenzpunkte',
 addMark: '+ Punkt', nearPi: 'SP', distPi: 'Abst.',
 markNote: 'Freie Maße im Raum: jeder Punkt wird mit dem nächstgelegenen Schnittpunkt des aktiven Modells verbunden und die Zahl sagt, wie weit er entfernt liegt. Damit lässt sich gegen die Vorrichtung oder einen Werkstattbezug bemaßen. »+ Punkt« legt ihn auf der ausgewählten Biegung an.',
 cCalc: 'Δ ber.', cAdj: 'Δ angewandt', zeroTw: 'Manuelles Δ auf null',
 cellNote: 'Die Zelle Δ angewandt nimmt Rechnungen auf das an, was der Regelkreis berechnet hat, geschrieben als c: »+2« oder »c+2« addiert 2, »c*1.1« gibt 10 % mehr, und eine blanke Zahl ersetzt den Wert. Der Rest der Tabelle ist schreibgeschützt.',
 tweakOn: 'manuell angepasst',
}} satisfies Record<Lang, Record<I18nKey, string>>;

export const LANGS: Lang[] = ['es', 'en', 'de'];
export const LANG: { cur: Lang } = { cur: 'es' };
export const setLang = (l: string): void => { LANG.cur = LANGS.includes(l as Lang) ? (l as Lang) : 'es'; };
export const T = (k: I18nKey): string => (I18N[LANG.cur][k] ?? k);
