/* --------------------------------------------------------------- acciones --
   Lo que el usuario PIDE: editar una celda, mover un punto, duplicar un
   modelo, abrir o guardar un archivo, aplicar la compensacion. Los eventos de
   al lado solo traducen un clic o un `change` a una de estas llamadas; aqui
   no se escucha nada del DOM.                                              */
import * as E from '../engine.ts';
import { T } from '../i18n.ts';
import type { DeltaKey, Model, Variant } from '../types.ts';
import {
  ST, V, VAR_COLORS, syncModel, newVid, loadModel, refModel,
  activeDataset, addDataset, syncCommand, resetCommand,
  addMark, syncTweak, zeroTweak, compensatedCommand, loopMeasured,
  measuredSpringback,
} from '../state.ts';
import { rebuildScene, fitView } from '../scene.ts';
import { drawRibbon } from '../ribbon.ts';
import {
  renderLeft, renderSide, renderRight, renderStatus, renderPanels,
} from '../panels.ts';
import { makeReport } from '../report.ts';
import { renderAll, refresh, refreshTable, toggleSolo } from './render.ts';
import { undo, redo } from './history.ts';
import {
  saveJson, openJson, importPieces, exportPoints,
} from './files.ts';

const clamp = E.clamp;

/** Editar puntos trabaja sobre la geometría EFECTIVA, así que primero hay que
 *  fundir los Δ en la base o se perderían sin avisar. */
function bakeGuard(): boolean {
  const v = V();
  E.syncDeltas(v);
  if (!E.hasDeltas(v)) return true;
  if (!confirm(T('bakeAsk'))) return false;
  E.bakeDeltas(v);
  syncModel();
  return true;
}

/* Radio, R de canto y ángulo de plano mueven `trim = radio · tan(θ/2)`, que es
   lo que el doblez le come a la recta POR LOS DOS LADOS. Como ahora la recta es
   lo que se teclea, es ella la que no se mueve: se recolocan los avances. */
const TRIM_KEYS = ['radius', 'rot', 'angle'];

export function editBend(i: number, key: DeltaKey, val: number): void {
  const v = V();
  E.syncDeltas(v);
  const B = v.base.bends;
  if (!(i >= 0 && i < B.length)) return;
  if (!TRIM_KEYS.includes(key)) {
    B[i][key] = val;
    syncModel(); syncCommand(); refreshTable();
    return;
  }
  /* Solo cambian las rectas que tocan al doblez i: la suya y la del siguiente
     —o la cola, si es el último—. Se recolocan solo esas dos para no arrastrar
     el error de ida y vuelta en las quince filas a cada edición. */
  const rectaI = E.straightOf(v.base, i);
  const sig = i + 1 < B.length ? i + 1 : -1;
  const rectaSig = sig >= 0 ? E.straightOf(v.base, sig) : 0;
  const cola = i === B.length - 1 ? E.tailStraight(v.base) : null;

  B[i][key] = val;

  /* feedForStraight solo lee los trims, nunca los avances: una pasada basta */
  B[i].feed = E.feedForStraight(v.base, i, rectaI);
  if (sig >= 0) B[sig].feed = E.feedForStraight(v.base, sig, rectaSig);
  if (cola !== null) v.base.tail = cola + E.trimOf(B[B.length - 1]);

  syncModel(); syncCommand(); refreshTable();
}
/** Columna «Recta»: es LA columna que se teclea. Guarda el `feed` (PI a PI),
 *  que sigue siendo el estado del JSON y lo que ve el motor de Python; el
 *  avance de la tabla es solo la lectura de ese estado.
 *
 *  Trabaja sobre la BASE, igual que el resto de columnas editables: su Δ va al
 *  lado, y sumar un Δ a `feed` suma exactamente lo mismo a la recta, porque los
 *  trims no dependen del avance. */
export function editStraight(i: number, val: number): void {
  const v = V();
  E.syncDeltas(v);
  if (!(i >= 0 && i < v.base.bends.length)) return;
  if (!isFinite(val)) return;
  v.base.bends[i].feed = E.feedForStraight(v.base, i, val);
  syncModel(); syncCommand(); refreshTable();
}
export function editDelta(i: number, key: DeltaKey, val: number): void {
  const v = V();
  E.syncDeltas(v);
  if (!(i >= 0 && i < v.deltas.length)) return;
  v.deltas[i][key] = val;
  syncModel(); syncCommand(); refreshTable();
}
/** Edición ABSOLUTA en el espacio de los PI: mover un punto deja los demás
 *  donde están y la cadena se recalcula por inversa. Es lo contrario de editar
 *  un ángulo en la tabla LRA, que hace girar todo lo que va después. */
export function editPoint(i: number, key: 'x' | 'y' | 'z', val: number): void {
  if (!bakeGuard()) { renderRight(); return; }
  const v = V();
  const P = E.fk(v.base).pis;
  if (!(i >= 0 && i < P.length)) return;
  P[i][key] = val;
  v.base = E.movePi(v.base, i, [P[i].x, P[i].y, P[i].z]);
  E.syncDeltas(v);
  syncModel(); syncCommand(); refresh();
}

/** Deshace o rehace y repinta todo.
 *
 *  El documento vuelve entero, así que hay que repintar entero; lo que NO se
 *  toca es la cámara: `fitView()` no se llama a propósito, porque deshacer
 *  devuelve datos y no la vista desde la que se estaban mirando. */
function stepHistory(fn: () => boolean): void {
  if (!fn()) return;
  renderAll();
}

/** Guarda el ajuste manual de una celda de compensación.
 *  El texto puede ser un número (reemplaza) o una cuenta sobre `c`, el valor
 *  que calculó el lazo. Si no se entiende, no se toca nada. */
export function editTweak(i: number, key: 'angle' | 'rot' | 'feed', text: string): void {
  const M = ST.model!, D = activeDataset();
  if (!D) return;
  syncTweak(M.bends.length);
  if (!(i >= 0 && i < ST.tweak.length)) return;
  /* el mismo medido que muestra la tabla, o el ajuste escrito a mano se
     guardaría contra un cálculo distinto del que se ve */
  const calc = E.compensate(ST.command, M.bends, loopMeasured() || D.model.bends,
                            ST.comp, E.orientations(M));
  const dCalc = calc[i][key] - ST.command[i][key];
  /* lo que la celda ENSEÑA es el cálculo del lazo más el ajuste ya escrito;
     eso es `v`, y es sobre lo que opera un `+` o un `-` al principio */
  const mostrado = dCalc + (ST.tweak[i][key] || 0);
  const v = E.evalCell(text, dCalc, mostrado);
  if (v === null) { renderRight(); return; }     // texto inválido: se descarta
  ST.tweak[i][key] = v - dCalc;
  renderRight(); renderSide(); renderStatus();
}

/* ------------------------------------------------------------ variantes */
export function variantById(id: string): Variant | undefined { return ST.variants.find(v => v.id === id); }

export function varActivate(id: string): void {
  if (!variantById(id)) return;
  ST.active = id; ST.sel = -1;
  syncModel(); syncCommand(); refresh();
}
export function varDuplicate(v: Variant | undefined): void {
  if (!v) return;
  const n = ST.variants.length;
  const w = E.cloneVariant(v, `${v.name} · ${n + 1}`,
                           VAR_COLORS[n % VAR_COLORS.length], newVid());
  ST.variants.push(w);
  varActivate(w.id);
}
export function varDelete(id: string): void {
  if (ST.variants.length <= 1) return;
  ST.variants = ST.variants.filter(v => v.id !== id);
  const ids = ST.variants.map(v => v.id);
  if (!ids.includes(ST.active as string)) ST.active = ids[0];
  if (!ids.includes(ST.ref as string)) ST.ref = ids[0];
  ST.sel = -1;
  syncModel(); syncCommand(); refresh();
}

/* ------------------------------------------------------------- acciones */
/** `predict()` guarda dos cifras de resumen sobre el modelo predicho que
 *  `Model` no declara (son de presentación, no del dominio): se tipan aquí,
 *  sin tocar types.ts. */
type Predicted = Model & { _maxA: number; _tip: number };

function predict(): void {
  const M = ST.model!, ori = E.orientations(M);
  const bends = E.simulate(ST.command, ST.proc, ori, false);
  const pm = { ...M, bends, tail: M.tail } as Predicted;
  const p1 = E.fk(pm).pis, p0 = E.fk(M).pis;
  pm._maxA = bends.reduce((a, b, i) => Math.max(a, Math.abs(b.angle - M.bends[i].angle)), 0);
  pm._tip = p1[p1.length - 1].distanceTo(p0[p0.length - 1]);
  ST.pred = pm;
}

function simPart(verify: boolean): void {
  const M = ST.model!;
  syncCommand();
  const bends = E.simulate(ST.command, ST.proc, E.orientations(M), true);
  addDataset({ ...M, bends, tail: M.tail },
             `${T('piece')} ${ST.datasets.length + 1}${verify ? ' ✓' : ''}`,
             verify ? 'verify' : 'sim');
  ST.proc.seed = (ST.proc.seed % 97) + 1;
  renderPanels(); rebuildScene(); drawRibbon();
}

function loadFresh(model: Model): void {
  /* loadModel() también acepta variantes/ref/anchor de un archivo (ver
     openJson); aquí se arranca desde un modelo suelto y los otros tres van
     en su valor de siempre: `undefined`. */
  loadModel(model);
  renderAll(); fitView();
}


export function action(a: string): void {
  const M = ST.model!, v = V();
  switch (a) {
    case 'demo': return loadFresh(E.demoModel());
    case 'new': if (confirm(T('confirmNew'))) loadFresh(E.emptyModel()); return;
    case 'open': return openJson();
    case 'save': return saveJson();
    case 'report': return makeReport();
    case 'expts': return exportPoints();
    case 'impts': return importPieces();
    case 'sim': return simPart(false);
    case 'verify': return simPart(true);

    case 'addb':
      v.base.bends.push(E.newBend({ feed: 100, rot: 0, angle: 30, radius: 30 }));
      E.syncDeltas(v); syncModel(); syncCommand(); return refresh();
    case 'delb':
      if (ST.sel >= 0 && ST.sel < v.base.bends.length && v.base.bends.length > 1) {
        v.base.bends.splice(ST.sel, 1);
        E.syncDeltas(v); ST.sel = -1;
        syncModel(); resetCommand(); refresh();
      }
      return;
    case 'bake':
      E.bakeDeltas(v); syncModel(); return refresh();
    case 'zerod':
      v.deltas = E.zeroDeltas(v.base.bends.length); v.tailDelta = 0;
      syncModel(); return refresh();

    case 'insp': {
      if (!bakeGuard()) return;
      const n = E.fk(v.base).pis.length;
      v.base = E.insertPi(v.base, clamp(ST.sel + 1, 0, n - 2));
      E.syncDeltas(v); ST.sel = -1;
      syncModel(); resetCommand(); return refresh();
    }
    case 'delp': {
      if (ST.sel < 0) return;
      if (!bakeGuard()) return;
      v.base = E.deletePi(v.base, ST.sel + 1);
      E.syncDeltas(v); ST.sel = -1;
      syncModel(); resetCommand(); return refresh();
    }

    case 'varnew': case 'vardup': return varDuplicate(v);

    case 'apply': {
      const D = activeDataset();
      if (!D) { alert(T('noMeas')); return; }
      /* lo que se aplica es lo que muestra la tabla: cálculo del lazo MÁS el
         ajuste escrito a mano. Una vez aplicado, el ajuste ya está dentro del
         comando, así que se pone a cero. */
      ST.command = compensatedCommand(loopMeasured() || D.model.bends);
      zeroTweak();
      predict();
      renderPanels(); rebuildScene(); drawRibbon();
      return;
    }
    case 'resetcmd':
      resetCommand(); zeroTweak(); ST.pred = null;
      renderPanels(); rebuildScene(); return;
    case 'usesb': {
      /* adoptar el resorte medido NO es automático, a propósito: el número
         viene con dispersión y con un aviso si depende del ángulo, y decidir
         si vale es del ingeniero, no del programa */
      const sb = measuredSpringback();
      if (!sb) { alert(T('noMeas')); return; }
      if (sb.W.stat.n) ST.proc.sbW = +sb.W.stat.med.toFixed(3);
      if (sb.T.stat.n) ST.proc.sbT = +sb.T.stat.med.toFixed(3);
      renderSide(); renderRight(); return;
    }
    case 'undo': return stepHistory(undo);
    case 'redo': return stepHistory(redo);
    case 'solo': return toggleSolo();
    case 'zerotw':
      zeroTweak(); renderRight(); return;

    case 'placereset':
      ST.place = { ...E.PLACE_DEFAULT };
      renderLeft(); rebuildScene(); fitView(); return;

    case 'addmark': {
      /* nace sobre el doblez seleccionado: es donde uno quiere acotar */
      const P = E.anchoredPis(M, refModel(), ST.anchor);
      const q = P[E.clamp(ST.sel + 1, 0, P.length - 1)];
      addMark(q ? q.x : 0, q ? q.y : 0, q ? q.z : 0);
      renderLeft(); renderRight(); rebuildScene(); return;
    }
    default: return;
  }
}
