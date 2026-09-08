/* ESPAÑOL — el idioma en el que se escriben las claves nuevas.
   ========================================================================= */
import type { I18nKey } from './keys.ts';

/* `Record<I18nKey, string>` y no un objeto suelto: con la anotacion, una clave
   que falte aqui es un error de compilacion y una de mas tambien. Es la unica
   forma de que la paridad entre los tres idiomas no dependa de acordarse. */
export const es: Record<I18nKey, string> = {
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
 gainR: 'Ganancia rodado', gainF: 'Ganancia avance',
 gainNote: 'El rodado y el avance llevan ganancia propia porque no son la misma magnitud que el doblez. «Canto» y «plano» son constantes de recuperación elástica: cuánto se abre la barra al soltarla. El rodado no tiene resorte —se corregía entero, o sea a ganancia 1.0, que es justo lo que se prohíbe para el ángulo porque oscila con el ruido de medición— y al avance lo desvía el deslizamiento, que es otro fenómeno.',
 what: 'Qué corregir', cAng: 'Ángulos de doblez', cRot: 'Rodado', cFeed: 'Avances',
 apply: 'Aplicar compensación', reset: 'Restablecer comandos',
 cmdTbl: 'Comandos de máquina', cNow: 'Actual', cNew: 'Nuevo', cDelta: 'Δ',
 predict: 'Residual previsto', verify: 'Verificar (correr 2.ª pieza)',
 noMeas: 'Necesita una pieza medida para calcular la compensación.',
 stLen: 'Longitud desarrollada', stBends: 'Dobleces', stDatum: 'Datum',
 stMax: 'Desv. máx.', stUnits: 'Unidades', engine: 'Motor',
 stVer: 'Versión',
 stVerTip: 'Compilación que está corriendo. Cítala al reportar un número raro: con una copia en el taller y otra publicada, es lo único que las distingue. «+sucio» = compilada sobre cambios sin confirmar.',
 schemaAmbiguous: 'Este archivo es barcomp/2.2 y no dice con qué sentido de giro se escribió.\n\nSe abrió tal cual, sin cambiar ningún número. Pero si se guardó antes del cambio de sentido, la pieza aparece doblada al otro lado.\n\nCOMPRUEBA LA FORMA en el 3D antes de compensar. Al guardar sale como 2.3 y deja de ser ambiguo.',
 schemaMigrated: 'Archivo de una versión anterior: se convirtió a la convención actual sin mover la pieza.\n\nLos ajustes manuales y el comando de las piezas medidas no se convierten, así que llegan en cero.',
 schemaUnknown: 'Esquema desconocido: {s}\n\nEste programa no sabe con qué convención se escribió, así que no lo abre en vez de arriesgarse a interpretarlo mal.',
 jsonNotJson: 'Este archivo no es JSON: no hay ni por dónde empezar a leerlo.\n\nSuele pasar al elegir el CSV de puntos o el informe del escáner. Lo que se abre aquí es el .json que guarda este programa.',
 jsonNotDoc: 'Es un JSON válido, pero no describe una pieza: no tiene «model.bends».\n\nAbre el .json que guardó BARCOMP. Para meter una pieza MEDIDA desde una nube de puntos está «Importar piezas», no «Abrir».',
 jsonBroken: 'El archivo es un documento barcomp, pero algo de dentro está roto y no se pudo abrir entero.\n\nNo se cargó nada: lo que tenías sigue como estaba. La línea de abajo es para quien mantenga el programa.',
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
 csvComma: 'los decimales van con coma; hacen falta con punto',
 csvCols: '{n} columnas numéricas por línea: no se sabe cuáles son x,y,z. Exporta solo las coordenadas, o índice + coordenadas',
 csvFew: 'menos de tres puntos con coordenadas',
 csvNear: 'los puntos {i} están a menos de {d} mm del anterior: dos PI pegados inventan un doblez. Revisa la extracción de la nube',
 fabHead: 'Esta pieza no se puede fabricar como está:',
 fabNeg: 'la recta que entra a {b} es NEGATIVA: los herramentales se cruzan.',
 fabShort: 'la recta que entra a {b} no llega a {n} mm, que es lo que necesita el herramental.',
 fabTail: 'la recta de salida no llega a {n} mm.',
 fabOver: '{b} pide más de {n}° de desvío: los largos de esa fila salen topados.',
 fileUnread: 'el sistema no dejó leer el archivo (¿se movió, o lo tiene abierto otro programa?)',
 csvShort: 'Estas piezas traen MENOS puntos que el modelo. Los dobleces que faltan quedan SIN MEDIR y no se compensan:',
 compSim: 'CUIDADO: {n} de las piezas que alimentan este cálculo son SIMULADAS, no medidas. Lo que salga de aquí no describe ninguna barra real.',
 compShort: 'Solo {a} de {b} dobleces están medidos. Los que faltan salen marcados con — y NO se compensan.',
 rowNoMeas: 'Este doblez no está medido: la pieza traía menos puntos que el modelo. El comando se deja como está.',
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
 cellNote: 'La celda Δ aplicada se escribe como en una hoja de cálculo, y hay tres formas. RELATIVO A LO QUE VES: un operador al principio opera sobre lo que muestra la celda — «+2» le suma 2, «-0.3» le quita tres décimas, «*1.1» le pone un 10 % más. RELATIVO AL LAZO: lo que calculó se llama c — «c», «c+2», «(c+1)/2». ABSOLUTO: un número suelto reemplaza, y «=» lo fuerza, que es como se escribe un negativo suelto — «=-3». El resto de la tabla es de solo lectura.',
 cellBad: 'No se entendió lo que escribiste, así que no se guardó nada.\n\nSe admite un número suelto (2), una cuenta sobre lo que ves (+2, -0.3, *1.1), una cuenta sobre lo que calculó el lazo (c+2) o un absoluto con = (=-3).',
 tweakOn: 'con ajuste manual',
};
