/* ----------------------------------------------------------------- clics --
   Dos escuchas: la de las pestanas y la global. La global es un despachador
   por atributos data-*; para agregar un boton basta con darle el suyo.     */
import { ST } from '../../state.ts';
import { setLang } from '../../i18n.ts';
import { fitView, setView, rebuildScene } from '../../scene.ts';
import { drawRibbon } from '../../ribbon.ts';
import { renderShell, renderLeft, renderRight, renderStatus, renderPanels } from '../../panels.ts';
import type { DatumMode, Mode } from '../../types.ts';
import type { ViewName } from '../../scene.ts';
import { $ } from '../../dom.ts';
import { refresh, renderAll, selectBend, setMode, openDrawer } from '../render.ts';
import { setTheme } from '../theme.ts';
import { action, variantById, varActivate, varDuplicate, varDelete, setSecKind } from '../actions.ts';
import { commit } from '../history.ts';

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

  /* Cualquier rama de aquí abajo puede tocar el documento —borrar una cota,
     quitar un modelo, aplicar la compensación—, así que se apila DESPUÉS del
     despachador entero y no dentro de una rama. commit() no hace nada si el
     documento no cambió, así que un clic en una pestaña no gasta un paso. */
  document.body.addEventListener('click', e => { onClick(e); commit(); });
}

function onClick(e: MouseEvent): void {
  {
    /* guardia: un clic dentro de un campo no debe disparar la selección de
       fila, o destruiría el input que se está editando. NO lo quites.
       Las casillas, los colores y los radios SÍ siguen: una casilla suelta
       dentro de una fila la selecciona igual. Salvo que el campo lleve su
       propio data-*: ese campo es suyo y lo atiende `change`, y el clic no
       tiene nada más que hacer. Sin esta segunda salida, un clic en la casilla
       de VER de un modelo pasaba a la tarjeta que lo envuelve y ACTIVABA el
       modelo; activar repinta el cajón, y el `change` —que es donde se apunta
       el valor— llega DESPUÉS del `click`, ya sobre una casilla arrancada del
       documento. El interruptor se volvía solo a su sitio y no había manera de
       ocultar un modelo desde el cajón. */
    const campo = e.target as HTMLElement;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(campo.tagName) && !campo.dataset.v) {
      if (!['checkbox', 'color', 'radio'].includes((campo as HTMLInputElement).type)) return;
      if (Object.keys(campo.dataset).length) return;
    }
    const t = (e.target as HTMLElement).closest(
      '[data-a],[data-v],[data-dm],[data-l],[data-th],[data-md],[data-dr],[data-dx],[data-dsel],[data-cm],[data-mx],[data-px],' +
      '[data-vsel],[data-vx],[data-vd],[data-vr],[data-r],[data-pnx],[data-hv],[data-sk]') as HTMLElement | null;
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
    if (d.sk !== undefined) { setSecKind(d.sk); return; }
    if (d.vsel !== undefined) { varActivate(d.vsel); return; }
    if (d.vd !== undefined) { varDuplicate(variantById(d.vd)); return; }
    if (d.vx !== undefined) { varDelete(d.vx); return; }
    if (d.vr !== undefined) { ST.ref = d.vr; refresh(); return; }
    /* borrar una cota. El botón existía desde que se añadieron las cotas y no
       lo escuchaba nadie: se veía, se pulsaba y no pasaba nada. */
    if (d.mx !== undefined) {
      ST.marks = ST.marks.filter(m => m.id !== d.mx);
      renderLeft(); renderRight(); rebuildScene();
      return;
    }
    /* borrar un pedestal. No renumera los que quedan: el nombre es del taller
       —está escrito en el pedestal— y renumerarlo aquí lo despegaría del que
       hay atornillado a la mesa. */
    /* Qué barra se enseña con el amarre puesto, y con ella contra cuál se mide
       TODO. No es una capa más: es la pregunta «¿cuál de las dos estoy mirando?»,
       y por eso vive en la pestaña del amarre y no en la paleta de capas.
       Hasta el 2026-09-14 eran dos interruptores —«Medir contra» y «Ver»— y se
       podían poner distintos: la barra sujeta en pantalla con los puntos, las
       etiquetas y las cifras en la libre. El taller pidió uno: lo que se ve es
       lo que se mide, en todos los modelos a la vez. `refHeld` sigue siendo el
       dato que se guarda y se deshace; las capas solo deciden si la libre se
       dibuja además como referencia. */
    if (d.hv !== undefined) {
      ST.restraint.refHeld = d.hv !== 'free';
      ST.layers.nom.on = d.hv !== 'held';
      /* Y las OTRAS variantes con la activa: su capa es independiente, así que
         sin esto elegir «sujeta» dejaba la activa sujeta y la referencia
         dibujada LIBRE al lado. Eso no compara nada — es la mitad de cada
         cosa— y es justo lo que se veía en pantalla. */
      ST.layers.var.on = d.hv !== 'held';
      ST.layers.held.on = d.hv !== 'free';
      renderShell(); renderLeft(); renderRight(); renderStatus(); rebuildScene(); drawRibbon();
      return;
    }
    /* borrar un pin. Como con los pedestales, no renumera los que quedan: el
       nombre es del taller, no un índice. */
    if (d.pnx !== undefined) {
      ST.pins = ST.pins.filter(p => p.id !== d.pnx);
      renderRight(); rebuildScene();
      return;
    }
    if (d.px !== undefined) {
      ST.fixture = ST.fixture.filter(p => p.id !== d.px);
      renderRight(); rebuildScene();
      return;
    }
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
  }
}
