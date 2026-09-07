const q = s => document.querySelector(s);
const click = s => q(s).click();
const setval = (s, v) => { const e = q(s); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); };
const check = (s, on) => { const e = q(s); e.checked = on; e.dispatchEvent(new Event('change', { bubbles: true })); };
/* Los paneles de modelos, vista y piezas viven en cajones que abre la barra de
   menús: un guion que toque uno tiene que pedirlo primero. */
const drawer = k => { if (window.BARCOMP.ST.drawer !== k) q(`[data-dr="${k}"]`).click(); };

/* dos modelos, uno con Δ */
drawer('models');
click('[data-a="vardup"]');
setval('input[data-bd="4"][data-k="angle"]', '3.5');
setval('input[data-bd="9"][data-k="rot"]', '-2.5');

/* colocación: girar la pieza sobre un PI intermedio */
drawer('view');
setval('select[data-plp]', '8');
setval('input[data-pl="rz"]', '40');
setval('input[data-pl="rx"]', '-20');

/* dos cotas sueltas */
click('#tabs [data-t="points"]');
click('tr[data-r="3"]');
click('[data-a="addmark"]');
setval('input[data-mk="mk1"][data-k="z"]', '180');
setval('input[data-mk="mk1"][data-k="name"]', 'apoyo A');
click('tr[data-r="10"]');
click('[data-a="addmark"]');
setval('input[data-mk="mk2"][data-k="y"]', '-160');
setval('input[data-mk="mk2"][data-k="name"]', 'tope B');

/* una pieza medida y el modo de compensación con ajuste manual */
drawer('pieces');
click('[data-a="sim"]');
click('[data-md="comp"]');
setval('input[data-tw="0"][data-k="angle"]', '+2');
setval('input[data-tw="2"][data-k="angle"]', 'c*1.5');
click('[data-v="fit"]');
const tw = window.BARCOMP.ST.tweak.map((t, i) => t.angle ? i : -1).filter(i => i >= 0);
const hasd = [...document.querySelectorAll('table.cmd tbody tr')]
  .map((tr, i) => (tr.classList.contains('hasd') ? i : -1)).filter(i => i >= 0);
const tabla = document.querySelector('table.cmd');
const tw2 = document.querySelector('.tw');
return 'cotas ' + window.BARCOMP.ST.marks.length +
  ' | modelos ' + window.BARCOMP.ST.variants.length +
  ' | tweak en filas ' + JSON.stringify(tw) +
  ' | hasd en filas ' + JSON.stringify(hasd) +
  ' | tabla ' + Math.round(tabla.scrollWidth) + 'px, hueco ' + Math.round(tw2.clientWidth) + 'px' +
  ' | scroll ' + (tabla.scrollWidth > tw2.clientWidth ? 'SI' : 'no');
