/* ------------------------------------------------------------------ tema --
   Sin localStorage (regla dura): la eleccion vive en ST y viaja en el JSON.
   El CSS sabe seguir solo a la preferencia del sistema; el lienzo WebGL y la
   cinta no, y por eso hay un matchMedia que les avisa.                     */
import { ST } from '../state.ts';
import { applyTheme, rebuildScene } from '../scene.ts';
import { drawRibbon } from '../ribbon.ts';
import { renderShell } from '../panels.ts';

/* Sin localStorage (regla dura): la elección vive en ST y viaja en el JSON.
   'system' = sin atributo, y manda @media (prefers-color-scheme). */
export function useTheme(t: string): void {
  ST.theme = (['system', 'light', 'dark'].includes(t) ? t : 'system') as typeof ST.theme;
  const root = document.documentElement;
  if (ST.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', ST.theme);
  /* el 3D no lee CSS solo: hay que recolocarle fondo y niebla */
  applyTheme();
}
export function setTheme(t: string): void {
  useTheme(t);
  /* la rejilla y los pedestales llevan el color dentro del material, así que
     hay que reconstruirlos; la cinta se repinta entera. */
  renderShell(); rebuildScene(); drawRibbon();
}

/* con el tema en 'system', el CSS sigue solo a la preferencia del sistema,
   pero el lienzo WebGL y la cinta no: hay que avisarles. */
export function bindScheme(): void {
  if ((window as { matchMedia?: typeof matchMedia }).matchMedia) {
    const mq = matchMedia('(prefers-color-scheme: light)');
    const onScheme = () => {
      if (ST.theme === 'system') { applyTheme(); rebuildScene(); drawRibbon(); }
    };
    if (mq.addEventListener) mq.addEventListener('change', onScheme);
    else if (mq.addListener) mq.addListener(onScheme);
  }
}
