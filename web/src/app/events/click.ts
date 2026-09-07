/* ----------------------------------------------------------------- clics --
   Dos escuchas: la de las pestanas y la global. La global es un despachador
   por atributos data-*; para agregar un boton basta con darle el suyo.     */
import { ST } from '../../state.ts';
import { setLang } from '../../i18n.ts';
import { fitView, setView, rebuildScene } from '../../scene.ts';
import { drawRibbon } from '../../ribbon.ts';
import { renderShell, renderRight, renderPanels } from '../../panels.ts';
import type { DatumMode, Mode } from '../../types.ts';
import type { ViewName } from '../../scene.ts';
import { $ } from '../dom.ts';
import { refresh, renderAll, selectBend, setMode, openDrawer } from '../render.ts';
import { setTheme } from '../theme.ts';
import { action, variantById, varActivate, varDuplicate, varDelete } from '../actions.ts';

export function bindClick(): void {
  $('#tabs')!.addEventListener('click', e => {
    const t = (e.target as HTMLElement).closest('[data-t]') as HTMLElement | null;
    if (!t) return;
    ST.tab = t.dataset.t as string;
    renderShell(); renderRight();
  });

  /* Un clic fuera del cajón lo cierra, como cualquier menú. Va ANTES del
     despachador y no consume el evento: si el clic era sobre un botón, ese
     botón sigue haciendo lo suyo. */
  document.body.addEventListener('click', e => {
    if (!ST.drawer) return;
    const t = e.target as HTMLElement;
    if (t.closest('#lf') || t.closest('[data-dr]')) return;
    openDrawer(null);
  });

  document.body.addEventListener('click', e => {
    /* guardia: un clic dentro de un campo no debe disparar la selección de
       fila, o destruiría el input que se está editando. NO lo quites. */
    if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target as HTMLElement).tagName) && !(e.target as HTMLElement).dataset.v) {
      if (!['checkbox', 'color', 'radio'].includes((e.target as HTMLInputElement).type)) return;
    }
    const t = (e.target as HTMLElement).closest(
      '[data-a],[data-v],[data-dm],[data-l],[data-th],[data-md],[data-dr],[data-dx],[data-dsel],[data-cm],' +
      '[data-vsel],[data-vx],[data-vd],[data-vr],[data-r]') as HTMLElement | null;
    if (!t) return;
    const d = t.dataset;
    if (d.l !== undefined) { setLang(d.l); renderAll(); return; }
    if (d.th !== undefined) { setTheme(d.th); return; }
    if (d.md !== undefined) { setMode(d.md as Mode); return; }
    /* el mismo menú abre y cierra su cajón */
    if (d.dr !== undefined) { openDrawer(ST.drawer === d.dr ? null : d.dr); return; }
    if (d.v !== undefined) { d.v === 'fit' ? fitView() : setView(d.v as ViewName); return; }
    if (d.cm !== undefined) { ST.view.cmode = d.cm as 'solid' | 'dev'; renderShell(); rebuildScene(); return; }
    if (d.dm !== undefined) { ST.datum = d.dm as DatumMode; refresh(); return; }
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
}
