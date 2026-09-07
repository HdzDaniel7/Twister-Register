/* --------------------------------------------------------------- cambios --
   `change` es el evento de confirmacion de una celda (dispara al salir del
   campo) e `input` el de los deslizadores, que si quieren repintar mientras
   se arrastran. Los paneles se reconstruyen enteros, asi que usar `input`
   para una celda le quitaria el foco a quien esta escribiendo.             */
import { ST, V, syncModel } from '../../state.ts';
import { rebuildScene } from '../../scene.ts';
import { renderShell, renderLeft, renderRight, renderStatus } from '../../panels.ts';
import type { AnchorMode, DeltaKey } from '../../types.ts';
import { $ } from '../dom.ts';
import { refresh } from '../render.ts';
import {
  variantById, editBend, editStraight, editDelta, editPoint, editTweak,
} from '../actions.ts';

export function bindChange(): void {
  document.body.addEventListener('change', e => {
    const t = e.target as HTMLInputElement, d = t.dataset, v = V();
    /* Vaciar una celda y salirse NO debe escribir un 0 que nadie pidió: se
       devuelve lo que había al entrar. Con la selección automática al enfocar,
       teclear ya reemplaza el valor entero y borrar a mano deja de hacer falta. */
    if (t.tagName === 'INPUT' && t.type === 'number' && !String(t.value).trim()) {
      if (t.dataset.orig !== undefined) t.value = t.dataset.orig;
      return;
    }
    if (d.ly !== undefined) { ST.layers[d.ly].on = t.checked; rebuildScene(); return; }
    if (d.lc !== undefined) { ST.layers[d.lc].color = t.value; renderShell(); rebuildScene(); return; }
    if (d.an !== undefined) { ST.anchor = d.an as AnchorMode; renderLeft(); renderRight(); renderStatus(); rebuildScene(); return; }
    if (d.vv !== undefined) { const x = variantById(d.vv); if (x) { x.visible = t.checked; rebuildScene(); } return; }
    if (d.vc !== undefined) { const x = variantById(d.vc); if (x) { x.color = t.value; renderShell(); renderLeft(); rebuildScene(); } return; }
    /* el nombre se edita en los dos sitios: aquí, en la tarjeta del modelo, y
       en la pestaña MODELO. No se repinta el panel izquierdo, que es donde
       está el campo que se acaba de escribir. */
    if (d.vn !== undefined) {
      const x = variantById(d.vn);
      if (x) {
        x.name = t.value;
        x.base.name = t.value;
        if (x.id === ST.active) syncModel();
        renderShell(); renderRight(); renderStatus();
      }
      return;
    }
    if (d.dv !== undefined) { const x = ST.datasets.find(z => z.id === d.dv); if (x) { x.visible = t.checked; rebuildScene(); } return; }
    if (d.dc !== undefined) { const x = ST.datasets.find(z => z.id === d.dc); if (x) { x.color = t.value; rebuildScene(); } return; }
    if (d.m !== undefined) {
      if (d.m === 'name') { v.name = t.value; v.base.name = t.value; syncModel(); renderShell(); renderLeft(); renderStatus(); }
      else { v.base[d.m] = +t.value; syncModel(); refresh(); }
      return;
    }
    if (d.s !== undefined) { (v.base.section as unknown as Record<string, number>)[d.s] = +t.value; syncModel(); refresh(); return; }
    if (d.t !== undefined && t.type === 'number') { (v.base.tol as unknown as Record<string, number>)[d.t] = +t.value; syncModel(); refresh(); return; }
    if (d.b !== undefined) { editBend(+d.b, d.k as DeltaKey, +t.value); return; }
    if (d.st !== undefined) { editStraight(+d.st, +t.value); return; }
    if (d.bd !== undefined) { editDelta(+d.bd, d.k as DeltaKey, +t.value); return; }
    if (d.p !== undefined && d.k) { editPoint(+d.p, d.k as 'x' | 'y' | 'z', +t.value); return; }
    if (d.c !== undefined) {
      (ST.comp as unknown as Record<string, number | boolean>)[d.c] = t.type === 'checkbox' ? t.checked : +t.value;
      renderRight(); return;
    }
    if (d.pr !== undefined) { (ST.proc as unknown as Record<string, number>)[d.pr] = +t.value; return; }

    /* --- colocación: solo presentación, no toca ningún dato del modelo --- */
    if (d.pl !== undefined) {
      (ST.place as unknown as Record<string, number>)[d.pl] = +t.value || 0;
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
        (mk as unknown as Record<string, string | number>)[d.k as string] = d.k === 'name' ? t.value : (+t.value || 0);
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
      editTweak(+d.tw, d.k as 'angle' | 'rot' | 'feed', t.value);
      return;
    }
  });

  document.body.addEventListener('input', e => {
    const t = e.target as HTMLInputElement, d = t.dataset;
    if (t.id === 'exag') {
      ST.view.exag = +t.value;
      $('#exagv')!.textContent = t.value + '×';
      rebuildScene();
    }
    if (d.pr !== undefined) {
      (ST.proc as unknown as Record<string, number>)[d.pr] = +t.value;
      const val = t.parentElement!.querySelector('.val');
      if (val) {
        const suf = d.pr === 'biasRot' ? '°'
          : ['sbW', 'sbT', 'slip'].includes(d.pr) ? '%' : '';
        val.textContent = t.value + suf;
      }
    }
  });
}
