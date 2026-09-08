/* --------------------------------------------------------- claves de i18n --
   La union de claves, sola y sin ningun texto. Vive aparte porque la importan
   los TRES diccionarios para anotarse contra ella: asi una clave que falte en
   uno es un error de COMPILACION y no solo de prueba, que era la promesa desde
   el principio.
   ========================================================================= */
export type Lang = 'es' | 'en' | 'de';

/** Las 239 claves que deben existir en LOS TRES diccionarios. */
export type I18nKey =
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
  | 'csvComma' | 'csvCols' | 'csvFew' | 'csvShort' | 'fileUnread' | 'csvNear'
  | 'csvScale'
  | 'fabHead' | 'fabNeg' | 'fabShort' | 'fabTail' | 'fabOver'
  | 'compSim' | 'compShort' | 'rowNoMeas'
  | 'batchUse' | 'batchTip' | 'batchOn' | 'batchHint' | 'spread' | 'spreadTip'
  | 'sbMeas' | 'sbUse' | 'sbNote' | 'sbCircular' | 'sbSpreadTip'
  | 'sbTrend' | 'sbTrendTip'
  | 'modeModel' | 'modeMeas' | 'modeComp'
  | 'modeModelTip' | 'modeMeasTip' | 'modeCompTip'
  | 'mnFile' | 'mnModel' | 'mnView' | 'mnPieces' | 'expPts'
  | 'soloOn' | 'soloOff' | 'soloTip' | 'rotAxisTip' | 'rotHeadTip'
  | 'history' | 'undo' | 'redo' | 'histNote'
  | 'srcSimTip' | 'srcVerifyTip' | 'srcMeasTip' | 'srcUnkTip'
  | 'statMaxA' | 'statRms' | 'statTip' | 'statOut' | 'gains' | 'gainW' | 'gainT' | 'gainR' | 'gainF' | 'gainNote' | 'what'
  | 'cAng' | 'cRot' | 'cFeed' | 'apply' | 'reset' | 'cmdTbl' | 'cNow' | 'cNew'
  | 'cDelta' | 'predict' | 'verify' | 'noMeas' | 'stLen' | 'stBends' | 'stDatum' | 'stMax'
  | 'stUnits' | 'stVer' | 'stVerTip'
  | 'schemaAmbiguous' | 'schemaMigrated' | 'schemaUnknown'
  | 'jsonNotJson' | 'jsonNotDoc' | 'jsonBroken' | 'cellBad'
  | 'engine' | 'dStart' | 'dBest' | 'formula' | 'note' | 'repTitle' | 'repDate'
  | 'repPiece' | 'ok' | 'bad' | 'piece' | 'orW' | 'orT' | 'confirmNew' | 'pts'
  | 'x' | 'y' | 'z' | 'variants' | 'addVar' | 'dupVar' | 'setRef' | 'isRef'
  | 'anchor' | 'aStart' | 'aEnd' | 'aBest' | 'insPt' | 'delPt' | 'ptNote' | 'bake'
  | 'zeroD' | 'bakeAsk' | 'dTip' | 'dblz' | 'place' | 'pivot' | 'plX' | 'plY'
  | 'plZ' | 'plRX' | 'plRY' | 'plRZ' | 'plReset' | 'plNote' | 'lMarks' | 'marks'
  | 'addMark' | 'nearPi' | 'distPi' | 'markNote' | 'cCalc' | 'cAdj' | 'zeroTw' | 'cellNote'
  | 'tweakOn';
