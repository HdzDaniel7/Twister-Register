/* =========================================================================
   BARCOMP alpha — compensación de dobleces en barra rectangular de aluminio.

   Este archivo es el orquestador: estado -> render -> eventos. El motor vive
   en engine.js (gemelo de python/barcomp/core.py) y el resto está repartido en
   i18n.js · state.js · scene.js · ribbon.js · panels.js · report.js · io.js.

   Flujo de renderizado, de más barato a más caro:

     drawRibbon()     solo la cinta inferior (canvas 2D)
     renderStatus()   barra de estado
     renderRight()    panel derecho (reconstruye #panes entero)
     renderLeft()     panel izquierdo
     renderPanels()   = left + right + status
     rebuildScene()   destruye y reconstruye TODA la geometría de three.js
     renderShell()    header, barra de vista, leyenda, pestañas
     renderAll()      = shell + panels + escena + cinta

   Llama lo más barato que sirva.
   ========================================================================= */
import * as E from './engine.js';
import { T, setLang } from './i18n.js';
import {
  ST, V, REF, VAR_COLORS, syncModel, newVid, loadModel, refModel,
  activeDataset, addDataset, recomputeAll, syncCommand, resetCommand,
  addMark, setMarks, syncTweak, zeroTweak, compensatedCommand,
} from './state.js';
import {
  initScene, rebuildScene, fitView, setView, setOnPick, setOnResize, markDirty,
  onResize,
} from './scene.js';
import { drawRibbon, bindRibbon, setOnRibbonSelect } from './ribbon.js';
import { renderShell, renderLeft, renderRight, renderStatus, renderPanels } from './panels.js';
import { makeReport } from './report.js';
import { download, pickFile, safeName } from './io.js';

const $ = s => document.querySelector(s);
const clamp = E.clamp;

/* ------------------------------------------------------------- refrescos */
function renderAll() { renderShell(); renderPanels(); rebuildScene(); drawRibbon(); }
function refresh() { recomputeAll(); renderPanels(); rebuildScene(); drawRibbon(); }
function selectBend(i) { ST.sel = i; renderPanels(); rebuildScene(); drawRibbon(); }

/* ------------------------------------------------------ edición de datos */
/** Editar puntos trabaja sobre la geometría EFECTIVA, así que primero hay que
 *  fundir los Δ en la base o se perderían sin avisar. */
function bakeGuard() {
  const v = V();
  E.syncDeltas(v);
  if (!E.hasDeltas(v)) return true;
  if (!confirm(T('bakeAsk'))) return false;
  E.bakeDeltas(v);
  syncModel();
  return true;
}

function editBend(i, key, val) {
  const v = V();
  E.syncDeltas(v);
  if (!(i >= 0 && i < v.base.bends.length)) return;
  v.base.bends[i][key] = val;
  syncModel(); syncCommand(); refresh();
}
function editDelta(i, key, val) {
  const v = V();
  E.syncDeltas(v);
  if (!(i >= 0 && i < v.deltas.length)) return;
  v.deltas[i][key] = val;
  syncModel(); syncCommand(); refresh();
}
/** Edición ABSOLUTA en el espacio de los PI: mover un punto deja los demás
 *  donde están y la cadena se recalcula por inversa. Es lo contrario de editar
 *  un ángulo en la tabla LRA, que hace girar todo lo que va después. */
function editPoint(i, key, val) {
  if (!bakeGuard()) { renderRight(); return; }
  const v = V();
  const P = E.fk(v.base).pis;
  if (!(i >= 0 && i < P.length)) return;
  P[i][key] = val;
  v.base = E.movePi(v.base, i, [P[i].x, P[i].y, P[i].z]);
  E.syncDeltas(v);
  syncModel(); syncCommand(); refresh();
}

/** Guarda el ajuste manual de una celda de compensación.
 *  El texto puede ser un número (reemplaza) o una cuenta sobre `c`, el valor
 *  que calculó el lazo. Si no se entiende, no se toca nada. */
function editTweak(i, key, text) {
  const M = ST.model, D = activeDataset();
  if (!D) return;
  syncTweak(M.bends.length);
  if (!(i >= 0 && i < ST.tweak.length)) return;
  const calc = E.compensate(ST.command, M.bends, D.model.bends, ST.comp,
                            E.orientations(M));
  const dCalc = calc[i][key] - ST.command[i][key];
  const v = E.evalCell(text, dCalc);
  if (v === null) { renderRight(); return; }     // texto inválido: se descarta
  ST.tweak[i][key] = v - dCalc;
  renderRight(); renderStatus();
}

/* ------------------------------------------------------------ variantes */
function variantById(id) { return ST.variants.find(v => v.id === id); }

function varActivate(id) {
  if (!variantById(id)) return;
  ST.active = id; ST.sel = -1;
  syncModel(); syncCommand(); refresh();
}
function varDuplicate(v) {
  if (!v) return;
  const n = ST.variants.length;
  const w = E.cloneVariant(v, `${v.name} · ${n + 1}`,
                           VAR_COLORS[n % VAR_COLORS.length], newVid());
  ST.variants.push(w);
  varActivate(w.id);
}
function varDelete(id) {
  if (ST.variants.length <= 1) return;
  ST.variants = ST.variants.filter(v => v.id !== id);
  const ids = ST.variants.map(v => v.id);
  if (!ids.includes(ST.active)) ST.active = ids[0];
  if (!ids.includes(ST.ref)) ST.ref = ids[0];
  ST.sel = -1;
  syncModel(); syncCommand(); refresh();
}

/* ------------------------------------------------------------- acciones */
function predict() {
  const M = ST.model, ori = E.orientations(M);
  const bends = E.simulate(ST.command, ST.proc, ori, false);
  const pm = { ...M, bends, tail: M.tail };
  const p1 = E.fk(pm).pis, p0 = E.fk(M).pis;
  pm._maxA = bends.reduce((a, b, i) => Math.max(a, Math.abs(b.angle - M.bends[i].angle)), 0);
  pm._tip = p1[p1.length - 1].distanceTo(p0[p0.length - 1]);
  ST.pred = pm;
}

function simPart(verify) {
  const M = ST.model;
  syncCommand();
  const bends = E.simulate(ST.command, ST.proc, E.orientations(M), true);
  addDataset({ ...M, bends, tail: M.tail },
             `${T('piece')} ${ST.datasets.length + 1}${verify ? ' ✓' : ''}`,
             verify ? 'verify' : 'sim');
  ST.proc.seed = (ST.proc.seed % 97) + 1;
  renderPanels(); rebuildScene(); drawRibbon();
}

function loadFresh(model) {
  loadModel(model);
  renderAll(); fitView();
}

function saveJson() {
  const doc = E.toDoc(ST.model, ST.command, ST.comp, ST.proc, ST.datasets,
                      ST.variants, ST.ref, ST.anchor,
                      { place: ST.place, marks: ST.marks, tweak: ST.tweak });
  download(safeName(ST.model.name) + '.json', JSON.stringify(doc, null, 1));
}
function openJson() {
  pickFile('.json', txt => {
    try {
      const d = E.fromDoc(JSON.parse(txt));
      loadModel(d.model, d.variants, d.ref, d.anchor);
      ST.command = d.command;
      Object.assign(ST.comp, d.comp);
      Object.assign(ST.proc, d.proc);
      ST.place = { ...E.PLACE_DEFAULT, ...(d.place || {}) };
      setMarks(d.marks);
      ST.tweak = d.tweak || [];
      syncTweak(ST.model.bends.length);
      for (const x of d.datasets) {
        const ds = addDataset(
          { ...d.model, bends: (x.bends || []).map(E.bendFrom), tail: x.tail ?? d.model.tail },
          x.name || '?', x.src || '');
        ds.color = x.color || ds.color;
      }
      renderAll(); fitView();
    } catch (err) { alert('JSON: ' + err.message); }
  });
}
function importCsv() {
  pickFile('.csv,.txt', txt => {
    const P = E.readPointsCsv(txt);
    if (P.length < 3) { alert('CSV: ' + P.length + ' pts'); return; }
    const M = ST.model;
    const r = E.ik(P, M.bends.map(b => b.radius));
    addDataset({ ...M, bends: r.bends, tail: r.tail }, `CSV ${ST.datasets.length + 1}`, 'csv');
    renderPanels(); rebuildScene(); drawRibbon();
  });
}
function exportPoints() {
  download('puntos_' + safeName(ST.model.name) + '.csv',
           E.writePointsCsv(E.fk(ST.model).pis), 'text/csv');
}

function action(a) {
  const M = ST.model, v = V();
  switch (a) {
    case 'demo': return loadFresh(E.demoModel());
    case 'new': if (confirm(T('confirmNew'))) loadFresh(E.emptyModel()); return;
    case 'open': return openJson();
    case 'save': return saveJson();
    case 'report': return makeReport();
    case 'csv': return importCsv();
    case 'expts': return exportPoints();
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
      ST.command = compensatedCommand(D.model.bends);
      zeroTweak();
      predict();
      renderPanels(); rebuildScene(); drawRibbon();
      return;
    }
    case 'resetcmd':
      resetCommand(); zeroTweak(); ST.pred = null;
      renderPanels(); rebuildScene(); return;
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
    case 'markcsv':
      pickFile('.csv,.txt', txt => {
        const P = E.readPointsCsv(txt);
        if (!P.length) { alert('CSV: 0 pts'); return; }
        for (const q of P) addMark(q.x, q.y, q.z);
        renderLeft(); renderRight(); rebuildScene();
      });
      return;
    default: return;
  }
}

/* ================================================================ eventos */
function bind() {
  $('#tabs').addEventListener('click', e => {
    const t = e.target.closest('[data-t]');
    if (!t) return;
    ST.tab = t.dataset.t;
    renderShell(); renderRight();
  });

  document.body.addEventListener('click', e => {
    /* guardia: un clic dentro de un campo no debe disparar la selección de
       fila, o destruiría el input que se está editando. NO lo quites. */
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && !e.target.dataset.v) {
      if (!['checkbox', 'color', 'radio'].includes(e.target.type)) return;
    }
    const t = e.target.closest(
      '[data-a],[data-v],[data-dm],[data-l],[data-dx],[data-dsel],[data-cm],' +
      '[data-vsel],[data-vx],[data-vd],[data-vr],[data-r]');
    if (!t) return;
    const d = t.dataset;
    if (d.l !== undefined) { setLang(d.l); renderAll(); return; }
    if (d.v !== undefined) { d.v === 'fit' ? fitView() : setView(d.v); return; }
    if (d.cm !== undefined) { ST.view.cmode = d.cm; renderShell(); rebuildScene(); return; }
    if (d.dm !== undefined) { ST.datum = d.dm; refresh(); return; }
    if (d.vsel !== undefined) { varActivate(d.vsel); return; }
    if (d.vd !== undefined) { varDuplicate(variantById(d.vd)); return; }
    if (d.vx !== undefined) { varDelete(d.vx); return; }
    if (d.vr !== undefined) { ST.ref = d.vr; refresh(); return; }
    if (d.dx !== undefined) {
      ST.datasets = ST.datasets.filter(x => x.id !== d.dx);
      if (!ST.datasets.some(x => x.id === ST.dsActive)) {
        ST.dsActive = ST.datasets[0] ? ST.datasets[0].id : null;
      }
      renderPanels(); rebuildScene(); drawRibbon(); return;
    }
    if (d.dsel !== undefined) {
      ST.dsActive = d.dsel; renderPanels(); rebuildScene(); drawRibbon(); return;
    }
    if (d.a !== undefined) { action(d.a); return; }
    if (d.r !== undefined) { selectBend(+d.r); return; }
  });

  document.body.addEventListener('change', e => {
    const t = e.target, d = t.dataset, v = V();
    if (d.ly !== undefined) { ST.layers[d.ly].on = t.checked; rebuildScene(); return; }
    if (d.lc !== undefined) { ST.layers[d.lc].color = t.value; renderShell(); rebuildScene(); return; }
    if (d.an !== undefined) { ST.anchor = d.an; renderLeft(); renderRight(); renderStatus(); rebuildScene(); return; }
    if (d.vv !== undefined) { const x = variantById(d.vv); if (x) { x.visible = t.checked; rebuildScene(); } return; }
    if (d.vc !== undefined) { const x = variantById(d.vc); if (x) { x.color = t.value; renderShell(); renderLeft(); rebuildScene(); } return; }
    if (d.dv !== undefined) { const x = ST.datasets.find(z => z.id === d.dv); if (x) { x.visible = t.checked; rebuildScene(); } return; }
    if (d.dc !== undefined) { const x = ST.datasets.find(z => z.id === d.dc); if (x) { x.color = t.value; rebuildScene(); } return; }
    if (d.m !== undefined) {
      if (d.m === 'name') { v.name = t.value; v.base.name = t.value; syncModel(); renderShell(); renderLeft(); renderStatus(); }
      else { v.base[d.m] = +t.value; syncModel(); refresh(); }
      return;
    }
    if (d.s !== undefined) { v.base.section[d.s] = +t.value; syncModel(); refresh(); return; }
    if (d.t !== undefined && t.type === 'number') { v.base.tol[d.t] = +t.value; syncModel(); refresh(); return; }
    if (d.b !== undefined) { editBend(+d.b, d.k, +t.value); return; }
    if (d.bd !== undefined) { editDelta(+d.bd, d.k, +t.value); return; }
    if (d.p !== undefined && d.k) { editPoint(+d.p, d.k, +t.value); return; }
    if (d.c !== undefined) {
      ST.comp[d.c] = t.type === 'checkbox' ? t.checked : +t.value;
      renderRight(); return;
    }
    if (d.pr !== undefined) { ST.proc[d.pr] = +t.value; return; }

    /* --- colocación: solo presentación, no toca ningún dato del modelo --- */
    if (d.pl !== undefined) {
      ST.place[d.pl] = +t.value || 0;
      renderStatus(); rebuildScene(); return;
    }
    if (d.plp !== undefined) {
      ST.place.pivot = +t.value | 0;
      rebuildScene(); return;
    }

    /* --- puntos de referencia ------------------------------------------ */
    if (d.mk !== undefined) {
      const mk = ST.marks.find(x => x.id === d.mk);
      if (mk) {
        mk[d.k] = d.k === 'name' ? t.value : (+t.value || 0);
        renderRight(); rebuildScene();
      }
      return;
    }
    if (d.mv !== undefined) {
      const mk = ST.marks.find(x => x.id === d.mv);
      if (mk) { mk.visible = t.checked; rebuildScene(); }
      return;
    }
    if (d.mc !== undefined) {
      const mk = ST.marks.find(x => x.id === d.mc);
      if (mk) { mk.color = t.value; renderRight(); rebuildScene(); }
      return;
    }

    /* --- ajuste manual de la compensación ------------------------------- */
    /* La celda acepta cuentas sobre lo que calculó el lazo (`c`). Se guarda la
       DIFERENCIA contra ese cálculo, no el valor absoluto: si después cambias
       la ganancia o llega otra pieza medida, el ajuste sigue significando lo
       mismo ("dos décimas más de lo que sugiera el lazo"). */
    if (d.tw !== undefined && d.k) {
      editTweak(+d.tw, d.k, t.value);
      return;
    }
  });

  document.body.addEventListener('input', e => {
    const t = e.target, d = t.dataset;
    if (t.id === 'exag') {
      ST.view.exag = +t.value;
      $('#exagv').textContent = t.value + '×';
      rebuildScene();
    }
    if (d.pr !== undefined) {
      ST.proc[d.pr] = +t.value;
      const val = t.parentElement.querySelector('.val');
      if (val) {
        const suf = d.pr === 'biasRot' ? '°'
          : ['sbW', 'sbT', 'slip'].includes(d.pr) ? '%' : '';
        val.textContent = t.value + suf;
      }
    }
  });

  /* rueda del ratón sobre un campo numérico ENFOCADO = sube/baja un paso.
     Sustituye a las flechas nativas, que se ocultaron para no tapar cifras. */
  document.body.addEventListener('wheel', e => {
    const t = e.target;
    if (!t || t.tagName !== 'INPUT' || t.type !== 'number') return;
    if (document.activeElement !== t) return;
    e.preventDefault();
    const st = parseFloat(t.step) || 1;
    const dec = (String(t.step).split('.')[1] || '').length;
    let v = (parseFloat(t.value) || 0) + (e.deltaY < 0 ? st : -st);
    if (t.min !== '' && isFinite(+t.min)) v = Math.max(+t.min, v);
    if (t.max !== '' && isFinite(+t.max)) v = Math.min(+t.max, v);
    t.value = v.toFixed(dec);
    t.dispatchEvent(new Event('change', { bubbles: true }));
  }, { passive: false });

  /* ancho del panel derecho: arrastrar el tirador */
  const grip = $('#rtgrip');
  if (grip) {
    grip.addEventListener('pointerdown', e => {
      e.preventDefault();
      grip.classList.add('drag');
      grip.setPointerCapture(e.pointerId);
      const move = ev => {
        const w = clamp(innerWidth - ev.clientX, 320, Math.min(880, innerWidth - 420));
        document.documentElement.style.setProperty('--rtW', w + 'px');
        /* sin esto el lienzo WebGL conserva su tamaño en píxeles y se monta
           encima del panel derecho: la tabla queda detrás de la figura. */
        onResize();
      };
      const up = () => {
        grip.classList.remove('drag');
        grip.releasePointerCapture(e.pointerId);
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
  }

  /* El lienzo tiene que seguir a su contenedor pase lo que pase: arrastrar el
     tirador, cambiar el zoom del navegador o abrir las herramientas del IDE. */
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => onResize()).observe($('#vpwrap'));
  }

  bindRibbon();
  setOnRibbonSelect(selectBend);
  setOnPick(i => selectBend(i));
  setOnResize(drawRibbon);
}

/* =============================================================== arranque */
function boot() {
  loadModel(E.demoModel());
  initScene();
  bind();
  renderAll();
  fitView();
  markDirty();
}
document.addEventListener('DOMContentLoaded', boot);

/* expuesto para depurar desde la consola del navegador */
if (typeof window !== 'undefined') window.BARCOMP = { ST, E, renderAll, refresh, REF };
