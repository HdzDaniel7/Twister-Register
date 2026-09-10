/* Guion de interfaz que se evalúa DENTRO de la página. Devuelve el registro
   como una cadena; cada paso queda aislado en su try/catch. */
const log = [];
window.onerror = (m) => { log.push('ERROR ' + m); };
window.confirm = () => true;
window.alert = m => log.push('ALERT ' + m);
window.open = () => ({ document: { write() {}, close() {} } });
/* una descarga real cuelga el headless: se anula el click del <a download> */
const _click = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function () {
  if (this.hasAttribute('download')) return;
  return _click.call(this);
};

const S = () => window.BARCOMP.ST;
function step(name, fn) {
  try { fn(); log.push('ok   ' + name); }
  catch (err) { log.push('FALLA ' + name + ' :: ' + (err && err.message || err)); }
}
const q = sel => {
  const el = document.querySelector(sel);
  if (!el) throw new Error('no existe ' + sel);
  return el;
};
/* Los paneles de modelos, vista y piezas ya no son una columna fija: viven en
   cajones que abre la barra de menús. Un paso que necesite uno lo pide aquí, y
   si ya está abierto no lo vuelve a cerrar. */
/* Un atajo GLOBAL: se dispara sobre el body, que es donde escuchan los
   manejadores de la aplicación. (El `key(el, ...)` de más abajo es el de una
   celda concreta.) */
function hotkey(k, opts) {
  document.body.dispatchEvent(new KeyboardEvent('keydown',
    Object.assign({ key: k, bubbles: true, cancelable: true }, opts || {})));
}
/* El ángulo se enseña TAL CUAL lo guarda el modelo. Lo que está volteado es el
   SENTIDO DE GIRO, y eso vive en el motor (ANG_DIR): los mismos números doblan
   al otro lado, y en pantalla se leen como están en los datos. */
const angVisto = i => S().model.bends[i].angle;

function drawer(k) {
  if (window.BARCOMP.ST.drawer !== k) q(`[data-dr="${k}"]`).click();
}

const click = sel => q(sel).click();
const setval = (sel, v) => {
  const el = q(sel);
  el.value = v;
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
const check = (sel, on) => {
  const el = q(sel);
  el.checked = on;
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

step('idiomas ES / EN / DE', () => { click('[data-l="en"]'); click('[data-l="de"]'); click('[data-l="es"]'); });
step('hay tres botones de idioma', () => {
  const n = document.querySelectorAll('#hd [data-l]').length;
  if (n !== 3) throw new Error(n + ' idiomas');
});
step('en alemán no queda ninguna clave cruda en pantalla', () => {
  click('[data-l="de"]');
  /* una clave cruda es un nodo de texto que coincide EXACTAMENTE con una clave
     de I18N: es lo que pinta T() cuando la cadena falta en ese idioma */
  const claves = new Set(Object.keys(window.BARCOMP.I18N.de));
  if (!claves.size) throw new Error('no se pudo leer I18N');
  const malas = [];
  const walk = n => {
    if (n.nodeType === 3) {
      const t = n.textContent.trim();
      if (claves.has(t) && t.length > 2) malas.push(t);
    } else if (n.nodeType === 1 && !/^(SCRIPT|STYLE|CANVAS)$/.test(n.tagName)) {
      for (const c of n.childNodes) walk(c);
    }
  };
  walk(document.getElementById('app'));
  if (malas.length) throw new Error('claves crudas: ' + [...new Set(malas)].join(','));
});
step('el alemán llega a la tabla y al lateral', () => {
  const th = [...document.querySelectorAll('table.lra thead th')].map(x => x.textContent.trim());
  if (!th.includes('Gerade')) throw new Error('encabezados: ' + th.join('|'));
  if (!th.includes('Torsionslänge')) throw new Error('sin Torsionslänge: ' + th.join('|'));
  if (!q('#hd').textContent.includes('Biegekompensation')) throw new Error('cabecera sin traducir');
  const ori = q('table.lra tbody .ori');
  if (!ori) throw new Error('sin columna de orientación');
});
step('la barra de vista no se mete bajo la leyenda', () => {
  const tb = q('#vptool').getBoundingClientRect();
  const lg = q('#vplegend').getBoundingClientRect();
  if (tb.right > lg.left + 1) {
    throw new Error(`barra hasta ${tb.right.toFixed(0)}, leyenda desde ${lg.left.toFixed(0)}`);
  }
});
step('los tooltips de los tiradores se traducen', () => {
  if (!q('#rtgrip').title.includes('Breite')) throw new Error(q('#rtgrip').title);
  if (!q('#btgrip').title.includes('Höhe')) throw new Error(q('#btgrip').title);
  click('[data-l="es"]');
});
step('vistas', () => { for (const v of ['top', 'front', 'side', 'iso', 'fit']) click(`[data-v="${v}"]`); });
step('editar un ángulo base', () => setval('input[data-b="2"][data-k="angle"]', '44.5'));
step('editar una columna Δ', () => setval('input[data-bd="3"][data-k="angle"]', '2.5'));
/* ---------------------------------------- tabla: longitudes y teclado --- */
const Eg = () => window.BARCOMP.E;
const near = (a, b, tol, what) => {
  if (!(Math.abs(a - b) <= tol)) throw new Error(what + ': ' + a + ' vs ' + b);
};
const key = (el, k, opt) => el.dispatchEvent(new KeyboardEvent('keydown',
  Object.assign({ key: k, bubbles: true, cancelable: true }, opt || {})));

/* Escritura de verdad: asignar .value por script no marca el campo sucio y
   entonces el navegador no dispara `change` al desenfocar, que es justo el
   camino que hay que probar. NO llama select(): la selección al enfocar es
   parte de lo que se está probando. */
const typeIn = (el, txt) => {
  el.focus();
  if (!document.execCommand('insertText', false, txt)) {
    throw new Error('execCommand insertText no disponible');
  }
};

/* La recta es la columna que se teclea; L es la lectura. */
const recta = i => Eg().straightOf(S().variants[0].base, i);
const celda = (i, k) =>
  +q(`table.lra tbody tr:nth-child(${i + 1}) [data-cell="${k}"]`).textContent;

step('la tabla de modelo tiene las 13 columnas', () => {
  const n = document.querySelectorAll('table.lra thead th').length;
  if (n !== 13) throw new Error(n + ' columnas');
});

/* -------------------------------------- convencion LRA y CSV fuera ----- */
const uno = (rot, angle) => Eg().normalizeModel({ ...Eg().emptyModel(), tail: 200,
  bends: [Eg().newBend({ feed: 200, rot, angle, radius: 30 })] });
const punta = m => { const P = Eg().fk(m).pis; return P[P.length - 1]; };

step('R inclina el eje: R=0 dobla de plano, R=90 de canto', () => {
  const a = punta(uno(0, 40)), b = punta(uno(90, 40));
  if (!(Math.abs(a.z) < 1e-9 && Math.abs(a.y) > 10)) throw new Error('R=0 no dobla de plano');
  if (!(Math.abs(b.y) < 1e-9 && Math.abs(b.z) > 10)) throw new Error('R=90 no dobla de canto');
  /* sentido de giro: un ángulo positivo desvía hacia +y (ANG_DIR = -1) */
  if (!(a.y > 0)) throw new Error('un ángulo positivo no desvía hacia +y: y=' + a.y.toFixed(2));
});
step('el rodado NO rueda la seccion: no hace de twist', () => {
  const e = Eg().fk(uno(90, 40)).end.elements;      // columna y del marco final
  const y = [e[4], e[5], e[6]];
  if (!(Math.abs(y[0]) < 1e-9 && Math.abs(y[1] - 1) < 1e-9 && Math.abs(y[2]) < 1e-9)) {
    throw new Error('la seccion quedo rodada: y = ' + y.map(v => v.toFixed(3)).join(', '));
  }
});
/* El proceso es SECUENCIAL: `rot` dice cuánto gira el eje de doblado y el eje
   se queda ahí hasta que otra fila lo mueva. Un 0 es «no lo toques». */
/* El ángulo se ve TAL CUAL está guardado —los datos del taller no se tocan— y
   lo que cambió es el SENTIDO en que dobla: un ángulo positivo desvía hacia
   +y. Lo decide ANG_DIR en el motor, y esto vigila las dos cosas. */
step('el ángulo se ve tal como está guardado', () => {
  click('[data-md="model"]');
  click('#tabs [data-t="model"]');
  const cel = q('#panes input[data-b="0"][data-k="angle"]');
  const visto = parseFloat(cel.value);
  const guardado = S().model.bends[0].angle;
  if (Math.abs(visto - guardado) > 1e-6) {
    throw new Error(`se ve ${visto} y se guarda ${guardado}`);
  }
  setval('#panes input[data-b="0"][data-k="angle"]', '25.5');
  if (Math.abs(S().model.bends[0].angle - 25.5) > 1e-6) {
    throw new Error('tecleado 25.5 y el modelo guardó ' + S().model.bends[0].angle);
  }
  setval('#panes input[data-b="0"][data-k="angle"]', String(visto));
});
step('un rodado positivo lleva el doblez a -z', () => {
  const m = Eg().normalizeModel({ ...Eg().emptyModel(), tail: 200,
    bends: [Eg().newBend({ feed: 200, rot: 90, angle: 40, radius: 30 })] });
  const P = Eg().fk(m).pis;
  const z = P[P.length - 1].z;
  if (!(z < -10)) throw new Error('la punta quedó en z=' + z.toFixed(1));
  if (Eg().ROT_DIR !== -1) throw new Error('ROT_DIR = ' + Eg().ROT_DIR);
});
step('un ángulo positivo desvía hacia +y', () => {
  const m = Eg().normalizeModel({ ...Eg().emptyModel(), tail: 200,
    bends: [Eg().newBend({ feed: 200, rot: 0, angle: 40, radius: 30 })] });
  const P = Eg().fk(m).pis;
  const y = P[P.length - 1].y;
  if (!(y > 10)) throw new Error('la punta quedó en y=' + y.toFixed(1));
  if (Eg().ANG_DIR !== -1) throw new Error('ANG_DIR = ' + Eg().ANG_DIR);
});
step('el eje de doblado se sostiene entre estaciones', () => {
  const mk = (...rots) => Eg().normalizeModel({ ...Eg().emptyModel(), tail: 200,
    bends: rots.map(rt => Eg().newBend({ feed: 200, rot: rt, angle: 30, radius: 30 })) });
  const ejes = Eg().axisAngles(mk(90, 0, 0, -90)).join(',');
  if (ejes !== '90,90,90,0') throw new Error('ejes ' + ejes);
  /* FORMA CANÓNICA: el eje elige el PLANO y nunca da media vuelta, porque
     voltear el doblez es cosa del SIGNO del ángulo. Escribirlo de las dos
     maneras a la vez era lo que hacía ilegible la tabla. */
  const c1 = Eg().canonRot(180, 30);
  if (!(Math.abs(c1.rot) < 1e-9 && Math.abs(c1.angle + 30) < 1e-9)) {
    throw new Error(`canonRot(180,30) = ${c1.rot}, ${c1.angle}`);
  }
  const D = S().model;
  if (!Eg().axisAngles(D).every(a => Math.abs(a) <= 90 + 1e-9)) {
    throw new Error('el eje del modelo da media vuelta: ' + Eg().axisAngles(D).join(','));
  }
  if (!D.bends.every(b => [0, 90, -90].some(v => Math.abs(b.rot - v) < 1e-9))) {
    throw new Error('hay giros que no son cuartos: ' + D.bends.map(b => b.rot).join(','));
  }
  const o = Eg().orientations(mk(90, 0)).join('');
  if (o !== 'WW') throw new Error('con el eje sostenido deberían ser WW, y salió ' + o);
  const v = Eg().orientations(mk(90, -90)).join('');
  if (v !== 'WT') throw new Error('al girar de vuelta deberían ser WT, y salió ' + v);
});
step('la celda de rodado dice a qué eje deja', () => {
  click('[data-md="model"]');
  click('#tabs [data-t="model"]');
  const cel = q('#panes input[data-b="1"][data-k="rot"]');
  if (!cel.title) throw new Error('la celda no explica el giro');
  if (!/[0-9]/.test(cel.title)) throw new Error('no dice el eje resultante: ' + cel.title);
});
step('la tabla dice Rodado y Angulo, no canto ni plano', () => {
  const th = [...document.querySelectorAll('table.lra thead th')].map(x => x.textContent.trim());
  if (th[4] !== 'Rodado') throw new Error('columna 5 = ' + th[4]);
  if (th[6] !== 'Ángulo') throw new Error('columna 7 = ' + th[6]);
});
/* El esquema NO se fija a mano aquí: se compara contra el motor. Que este paso
   fallara al subir la versión era ruido —siempre hay que editarlo— y el paso
   que de verdad importa (que la CINEMÁTICA no se haya volteado) vive en
   test_motor.js contra test/fixtures/. Aquí solo se comprueba que lo que se
   guarda lleva el esquema vigente y no uno inventado. */
step('el esquema guardado es el vigente del motor', () => {
  const doc = Eg().toDoc(S().model, S().command, S().comp, S().proc, [], S().variants,
                         S().ref, S().anchor, {});
  if (doc.schema !== Eg().SCHEMA) throw new Error(doc.schema + ' != ' + Eg().SCHEMA);
  if (!/^barcomp\/\d+\.\d+$/.test(doc.schema)) throw new Error('esquema raro: ' + doc.schema);
});
/* Importar CSV existió, se fue con el cambio de convención LRA (4cc9b7e) y
   volvió como `impts`, ya sobre measuredModel(). Lo que este paso vigila es
   que no queden los botones VIEJOS —`csv` y `markcsv`— de aquella versión. */
step('no quedan los botones de CSV de la versión anterior', () => {
  const viejos = [...document.querySelectorAll('#app [data-a]')]
    .map(x => x.dataset.a)
    .filter(a => a === 'csv' || a === 'markcsv');
  if (viejos.length) throw new Error('siguen: ' + viejos.join(','));
});

step('la Recta va al principio y L al final, sin columna Avance', () => {
  const th = [...document.querySelectorAll('table.lra thead th')].map(x => x.textContent.trim());
  if (th[2] !== 'Recta') throw new Error('columna 3 = ' + th[2]);
  if (th[3] !== 'Δ') throw new Error('el Δ no está junto a la Recta: ' + th[3]);
  if (th[11] !== 'L') throw new Error('columna 12 = ' + th[11]);
  if (th[12] !== 'Σ L') throw new Error('columna 13 = ' + th[12]);
  if (th.filter(x => x === 'Avance').length) throw new Error('la columna Avance sigue ahí');
});

step('Recta, L y Sigma L coinciden con el motor', () => {
  const M = S().model, L = Eg().rowLengths(M);
  const rows = document.querySelectorAll('table.lra tbody tr');
  if (rows.length !== M.bends.length) throw new Error('filas ' + rows.length);
  for (let i = 0; i < rows.length; i++) {
    near(+rows[i].querySelector('input[data-st]').value, recta(i), 0.006, 'recta ' + i);
    near(celda(i, 'arc'), L[i].arc, 0.006, 'arco ' + i);
    near(celda(i, 'cum'), L[i].cum, 0.006, 'cum ' + i);
  }
});

step('L y Sigma L son de solo lectura', () => {
  const n = document.querySelectorAll('[data-cell="arc"] input,[data-cell="cum"] input').length;
  if (n) throw new Error(n + ' campos en columnas calculadas');
});

/* ------------------------------------------------------- los campos ---- */
step('ningun campo declara un paso que invalide decimales', () => {
  const malos = [...document.querySelectorAll('#app input[type=number]')]
    .filter(x => x.step !== 'any').map(x => x.step);
  if (malos.length) throw new Error('step= ' + [...new Set(malos)].join(','));
});

step('los campos llevan su paso en data-step', () => {
  const sin = [...document.querySelectorAll('table.lra input[type=number]')]
    .filter(x => !x.dataset.step).length;
  if (sin) throw new Error(sin + ' campos sin data-step');
});

step('el tercer decimal se teclea y sobrevive al repintado', () => {
  const el = q('input[data-b="1"][data-k="angle"]');
  typeIn(el, '17.905');
  el.blur();
  near(angVisto(1), 17.905, 1e-9, 'guardado');
  window.BARCOMP.renderAll();
  near(+q('input[data-b="1"][data-k="angle"]').value, 17.905, 1e-9, 'repintado');
  if (q('input[data-b="1"][data-k="angle"]').value !== '17.905') {
    throw new Error('se ve ' + q('input[data-b="1"][data-k="angle"]').value);
  }
});

step('un entero se rellena a dos decimales al repintar', () => {
  /* mientras la celda esta viva se ve lo tecleado; el relleno lo pone el
     siguiente repintado, que es quien alinea la columna */
  typeIn(q('input[data-b="1"][data-k="radius"]'), '30');
  q('input[data-b="1"][data-k="radius"]').blur();
  window.BARCOMP.renderAll();
  const v = q('input[data-b="1"][data-k="radius"]').value;
  if (v !== '30.00') throw new Error('se ve ' + v);
});

step('vaciar una celda y salirse NO escribe un cero', () => {
  const el = q('input[data-st="7"]');
  const antes = recta(7);
  el.focus();
  el.value = '';
  el.dispatchEvent(new Event('change', { bubbles: true }));
  near(recta(7), antes, 1e-9, 'la recta cambio al vaciar');
  near(+q('input[data-st="7"]').value, antes, 0.006, 'el campo no se restauro');
});

/* Una recta negativa son dos herramentales en el mismo sitio, y hasta ahora
   solo se veía como una celda en rojo: había que estar mirando esa columna. */
step('una recta imposible saca un aviso que nombra el doblez', () => {
  click('[data-md="model"]');
  click('#tabs [data-t="model"]');
  const aviso = () => document.querySelector('#fabnote .warnbox');
  if (aviso()) throw new Error('la demo ya venía con un aviso');
  const antes = recta(3);
  setval('input[data-st="3"]', '-40');
  const w = aviso();
  if (!w) throw new Error('recta de -40 mm y ningún aviso');
  if (!/B4/.test(w.textContent)) throw new Error('no dice qué doblez: ' + w.textContent);
  if (!/NEGATIVA/.test(w.textContent)) throw new Error('no distingue el cruce: ' + w.textContent);
  setval('input[data-st="3"]', String(antes));
  if (aviso()) throw new Error('el aviso no se fue al arreglarlo');
});

step('entrar en una celda deja su valor seleccionado', () => {
  /* <input type=number> no expone selectionStart, así que se prueba por
     conducta: al enfocar y teclear, lo escrito REEMPLAZA en vez de añadirse. */
  const el = q('input[data-b="4"][data-k="angle"]');
  setval('input[data-b="4"][data-k="angle"]', '31.8');
  typeIn(el, '7');
  if (el.value !== '7') throw new Error('quedo «' + el.value + '», no se reemplazo');
  el.blur();
});

step('Ctrl+flecha respeta el tercer decimal', () => {
  const el = q('input[data-b="1"][data-k="angle"]');   // vale 17.905
  el.focus();
  key(el, 'ArrowUp', { ctrlKey: true });
  near(angVisto(1), 18.005, 1e-9, 'paso sobre tres decimales');
});

step('el pie da la cola y la longitud desarrollada', () => {
  const M = S().model;
  near(+q('[data-cell="tstr"]').textContent, Eg().tailStraight(M), 0.006, 'cola');
  near(+q('[data-cell="dev"]').textContent, Eg().developedLength(M), 0.006, 'desarrollada');
});

step('teclear Recta deja la recta pedida y mueve Sigma L', () => {
  const i = 4, antes = celda(i, 'cum');
  setval(`input[data-st="${i}"]`, '92.5');
  near(recta(i), 92.5, 1e-6, 'recta pedida');
  if (Math.abs(celda(i, 'cum') - antes) < 1e-9) throw new Error('Sigma L no se movio');
});

step('cambiar un RADIO deja la recta quieta y mueve dos avances', () => {
  const i = 2, B = () => S().variants[0].base.bends;
  const r0 = [recta(i), recta(i + 1)];
  const f0 = [B()[i].feed, B()[i + 1].feed];
  setval(`input[data-b="${i}"][data-k="radius"]`, '52');
  near(recta(i), r0[0], 1e-6, 'la recta propia se movio');
  near(recta(i + 1), r0[1], 1e-6, 'la recta siguiente se movio');
  if (Math.abs(B()[i].feed - f0[0]) < 0.01) throw new Error('el avance propio no se movio');
  if (Math.abs(B()[i + 1].feed - f0[1]) < 0.01) throw new Error('el avance siguiente no se movio');
});

step('cambiar un ANGULO tambien deja las rectas quietas', () => {
  const i = 6;
  const r0 = [recta(i), recta(i + 1)];
  setval(`input[data-b="${i}"][data-k="angle"]`, '48');
  near(recta(i), r0[0], 1e-6, 'la recta propia se movio');
  near(recta(i + 1), r0[1], 1e-6, 'la recta siguiente se movio');
});

step('el radio del ULTIMO doblez ajusta la cola', () => {
  const last = S().model.bends.length - 1;
  const v = S().variants[0];
  const r0 = recta(last), cola0 = Eg().tailStraight(v.base);
  setval(`input[data-b="${last}"][data-k="radius"]`, '55');
  near(recta(last), r0, 1e-6, 'la recta del ultimo se movio');
  near(Eg().tailStraight(v.base), cola0, 1e-6, 'la cola se movio');
});

step('las rectas ajenas no se mueven al tocar un radio', () => {
  const antes = S().model.bends.map((_, k) => recta(k));
  setval('input[data-b="8"][data-k="radius"]', '33');
  antes.forEach((r, k) => {
    if (k === 8 || k === 9) return;
    near(recta(k), r, 1e-9, 'recta ajena ' + k);
  });
});

step('editar una celda NO destruye el input (render dirigido)', () => {
  const el = q('input[data-b="3"][data-k="angle"]');
  el.focus();
  el.value = '32.5';
  el.dispatchEvent(new Event('change', { bubbles: true }));
  if (!el.isConnected) throw new Error('el input fue reconstruido');
  if (document.activeElement !== el) throw new Error('se perdio el foco');
});

step('editar una Recta actualiza Sigma L en el sitio', () => {
  const L0 = q('table.lra tbody tr:nth-child(6) [data-cell="cum"]').textContent;
  setval('input[data-st="2"]', '118');
  const L1 = q('table.lra tbody tr:nth-child(6) [data-cell="cum"]').textContent;
  if (L0 === L1) throw new Error('Sigma L no se movio: ' + L0);
  near(+L1, Eg().rowLengths(S().model)[5].cum, 0.006, 'cum tras editar');
});

step('flecha abajo baja de fila en la misma columna', () => {
  const a = q('input[data-b="2"][data-k="angle"]');
  a.focus();
  key(a, 'ArrowDown');
  const act = document.activeElement;
  if (act.dataset.b !== '3' || act.dataset.k !== 'angle') {
    throw new Error('quedo en ' + act.dataset.b + '/' + act.dataset.k);
  }
});

step('flecha arriba sube de fila', () => {
  key(document.activeElement, 'ArrowUp');
  const act = document.activeElement;
  if (act.dataset.b !== '2' || act.dataset.k !== 'angle') {
    throw new Error('quedo en ' + act.dataset.b + '/' + act.dataset.k);
  }
});

step('Enter baja de fila y confirma el valor tecleado', () => {
  const a = q('input[data-bd="1"][data-k="feed"]');
  typeIn(a, '1.5');
  key(a, 'Enter');
  const act = document.activeElement;
  if (act.dataset.bd !== '2') throw new Error('quedo en ' + act.dataset.bd);
  near(window.BARCOMP.ST.variants[0].deltas[1].feed, 1.5, 1e-9, 'delta confirmado');
});

step('Tab confirma sin reconstruir el panel', () => {
  const a = q('input[data-st="6"]');
  const marca = q('table.lra tbody tr:nth-child(7)');
  typeIn(a, '112.5');
  a.blur();                              // lo que hace Tab: desenfocar
  near(recta(6), 112.5, 1e-9, 'recta confirmada');
  if (!a.isConnected) throw new Error('el input fue reconstruido');
  if (!marca.isConnected) throw new Error('la fila fue reconstruida');
});

step('la navegacion no se sale de la tabla', () => {
  const last = S().model.bends.length - 1;
  const a = q(`input[data-b="${last}"][data-k="angle"]`);
  a.focus();
  key(a, 'ArrowDown');
  if (document.activeElement.dataset.b !== String(last)) throw new Error('se salio');
});

step('Ctrl+flecha sube el valor un paso', () => {
  const a = q('input[data-b="1"][data-k="angle"]');
  a.focus();
  const antes = angVisto(1);
  key(a, 'ArrowUp', { ctrlKey: true });
  near(angVisto(1), antes + 0.1, 1e-6, 'paso de angulo');
});

step('Escape devuelve el valor de partida', () => {
  const a = q('input[data-b="1"][data-k="radius"]');
  a.focus();
  const orig = a.value;
  a.value = '999';
  key(a, 'Escape');
  if (a.value !== orig) throw new Error(a.value + ' != ' + orig);
});

step('la rueda sigue subiendo el valor', () => {
  const a = q('input[data-b="1"][data-k="angle"]');
  a.focus();
  const antes = angVisto(1);
  a.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true }));
  near(angVisto(1), antes + 0.1, 1e-6, 'paso con rueda');
});

step('el Delta de la Recta sigue funcionando', () => {
  const antes = celda(3, 'cum');
  setval('input[data-bd="3"][data-k="feed"]', '0.8');
  near(S().variants[0].deltas[3].feed, 0.8, 1e-9, 'delta guardado');
  near(celda(3, 'cum'), antes + 0.8, 0.01, 'Sigma L recoge el delta');
  setval('input[data-bd="3"][data-k="feed"]', '0');
});

/* ------------------------------------------------------------- tema ---- */
const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

step('tema claro: pone el atributo y cambia los tokens', () => {
  const antes = tok('--bg');
  click('[data-th="light"]');
  if (document.documentElement.getAttribute('data-theme') !== 'light') {
    throw new Error('sin data-theme');
  }
  if (tok('--bg') === antes) throw new Error('--bg no cambió: ' + tok('--bg'));
  if (S().theme !== 'light') throw new Error('ST.theme = ' + S().theme);
});

step('en claro el fondo del 3D es claro y el texto oscuro', () => {
  const bg = tok('--vpbg'), txt = tok('--txt');
  const lum = h => {
    const n = parseInt(h.slice(1, 7), 16);
    return (((n >> 16) & 255) * .299 + ((n >> 8) & 255) * .587 + (n & 255) * .114) / 255;
  };
  if (lum(bg) < .6) throw new Error('fondo del 3D oscuro en tema claro: ' + bg);
  if (lum(txt) > .4) throw new Error('texto claro sobre fondo claro: ' + txt);
});

step('la escala de desviación sigue siendo verde / ámbar / rojo', () => {
  const c = ['--ok', '--warn', '--bad'].map(tok);
  if (new Set(c).size !== 3) throw new Error('colores repetidos: ' + c.join(' '));
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [g, a, r] = c.map(rgb);
  if (!(g[1] > g[0])) throw new Error('--ok no es verde: ' + c[0]);
  if (!(a[0] > a[2] && a[1] > a[2])) throw new Error('--warn no es ámbar: ' + c[1]);
  if (!(r[0] > r[1] && r[0] > r[2])) throw new Error('--bad no es rojo: ' + c[2]);
});

step('la cinta se repinta en claro sin reventar', () => {
  const cv = q('#rbc');
  if (!(cv.width > 0 && cv.height > 0)) throw new Error('lienzo de la cinta vacío');
});

step('tema oscuro explícito', () => {
  click('[data-th="dark"]');
  if (document.documentElement.getAttribute('data-theme') !== 'dark') {
    throw new Error('sin data-theme');
  }
});

/* --dim2 lo llevan la ayuda de las celdas, los rótulos de sección y las
   columnas de solo lectura de las tablas: son DATOS, a 10 px, y estaban por
   debajo del 4.5:1 que pide WCAG 1.4.3 en los dos temas. Se mide contra
   --panel2, el fondo más apretado en el que aparecen. */
step('--dim2 se lee en los dos temas (WCAG 1.4.3)', () => {
  const rel = h => {
    const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
      .map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4));
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
  };
  const ratio = (a, b) => {
    const [x, y] = [rel(a), rel(b)].sort((p, r) => r - p);
    return (x + .05) / (y + .05);
  };
  for (const t of ['dark', 'light']) {
    click(`[data-th="${t}"]`);
    const r = ratio(tok('--dim2'), tok('--panel2'));
    if (r < 4.5) throw new Error(`${t}: ${r.toFixed(2)}:1 con ${tok('--dim2')}`);
  }
  click('[data-th="dark"]');
});

step('tema del sistema quita el atributo', () => {
  click('[data-th="system"]');
  if (document.documentElement.hasAttribute('data-theme')) throw new Error('quedó el atributo');
  if (S().theme !== 'system') throw new Error('ST.theme = ' + S().theme);
});

/* ------------------------------------ nombre del modelo y eje de ejes --- */
step('el nombre se edita desde la tarjeta del panel izquierdo', () => {
  drawer('models');
  setval('#lf input[data-vn="v1"]', 'PIEZA-A');
  if (S().variants[0].name !== 'PIEZA-A') throw new Error(S().variants[0].name);
  if (S().model.name !== 'PIEZA-A') throw new Error('el modelo activo no se entero');
});
step('y el campo de la pestaña MODELO se entera', () => {
  click('[data-md="model"]');
  click('#tabs [data-t="model"]');
  if (q('input[data-m="name"]').value !== 'PIEZA-A') {
    throw new Error(q('input[data-m="name"]').value);
  }
});
step('editar desde la pestaña MODELO tambien actualiza la tarjeta', () => {
  drawer('models');
  setval('input[data-m="name"]', 'PIEZA-B');
  if (q('#lf input[data-vn="v1"]').value !== 'PIEZA-B') {
    throw new Error(q('#lf input[data-vn="v1"]').value);
  }
});
step('escribir el nombre NO cambia de modelo activo', () => {
  drawer('models');
  const antes = S().active;
  const el = q('#lf input[data-vn="v1"]');
  el.click();
  if (S().active !== antes) throw new Error('cambio a ' + S().active);
});
step('la tarjeta entera sigue activando el modelo', () => {
  drawer('models');
  if (!q('#lf .ds[data-vsel="v1"]')) throw new Error('la tarjeta no activa');
});

step('la cuadricula y los pedestales NO cuelgan de la colocacion', () => {
  const G = window.BARCOMP.groupHost;
  for (const k of ['grid', 'fix']) {
    if (G(k) !== 'world') throw new Error(k + ' cuelga de ' + G(k));
  }
  for (const k of ['nom', 'var', 'meas', 'pred', 'diff', 'dev', 'marks', 'pts']) {
    if (G(k) !== 'root') throw new Error(k + ' cuelga de ' + G(k));
  }
});
step('mover la colocacion mueve la pieza, no la cuadricula', () => {
  drawer('view');
  /* las etiquetas se proyectan a traves de la colocacion: si la pieza se movio,
     se movieron. La cuadricula no tiene etiquetas y vive en `world`. */
  const pos = () => {
    window.BARCOMP.drawLabels();      // se pinta en el bucle: hay que forzarlo
    return [...document.querySelectorAll('#labels .lbl')]
      .map(e => e.style.left + ',' + e.style.top).join('|');
  };
  const antes = pos();
  setval('input[data-pl="rz"]', '40');
  setval('input[data-pl="z"]', '120');
  if (pos() === antes) throw new Error('la pieza no se movio');
  click('[data-a="placereset"]');
});

step('el indicador de ejes pinta los tres', () => {
  const g = q('#gizmo svg');
  if (!g) throw new Error('sin svg');
  const txt = [...g.querySelectorAll('text')].map(x => x.textContent).sort().join('');
  if (txt !== 'XYZ') throw new Error('etiquetas: ' + txt);
  if (g.querySelectorAll('line').length !== 3) throw new Error('no son 3 ejes');
});
step('el indicador de ejes gira con la vista', () => {
  /* se pinta en el bucle de animacion, que no ha corrido todavia: se fuerza */
  const pos = () => {
    window.BARCOMP.drawGizmo();
    return [...q('#gizmo svg').querySelectorAll('circle')]
      .map(c => c.getAttribute('cx') + ',' + c.getAttribute('cy')).join('|');
  };
  click('[data-v="top"]');
  const a = pos();
  click('[data-v="side"]');
  if (pos() === a) throw new Error('no se movio: ' + a);
});
step('el indicador de ejes gira con la colocacion', () => {
  drawer('view');
  const pos = () => {
    window.BARCOMP.drawGizmo();
    return [...q('#gizmo svg').querySelectorAll('circle')]
      .map(c => c.getAttribute('cx') + ',' + c.getAttribute('cy')).join('|');
  };
  const a = pos();
  setval('input[data-pl="rz"]', '55');
  if (pos() === a) throw new Error('la colocacion no lo movio');
  setval('input[data-pl="rz"]', '0');
});

step('duplicar modelo', () => { drawer('models'); click('[data-a="vardup"]'); });
step('hay dos modelos', () => { if (S().variants.length !== 2) throw new Error(S().variants.length); });
step('Δ en la copia', () => setval('input[data-bd="5"][data-k="rot"]', '3'));
step('anclaje end/best/start', () => {
  drawer('models');
  check('input[data-an="end"]', true);
  check('input[data-an="best"]', true);
  check('input[data-an="start"]', true);
});
step('marcar y devolver la referencia', () => {
  drawer('models');
  drawer('models');
  click(`[data-vr="${S().variants[1].id}"]`);
  click('[data-vr="v1"]');
  click('[data-vsel="v1"]');
});
step('capas diff / pred', () => {
  drawer('view');
  check('input[data-ly="diff"]', false);
  check('input[data-ly="diff"]', true);
  check('input[data-ly="pred"]', true);
});
step('fundir Δ', () => click('[data-a="bake"]'));

/* ---------------------------------------------------------- colocación -- */
step('colocación: girar Z', () => { drawer('view'); setval('input[data-pl="rz"]', '35'); });
step('colocación: girar X', () => { drawer('view'); setval('input[data-pl="rx"]', '-15'); });
step('colocación: mover X', () => { drawer('view'); setval('input[data-pl="x"]', '250'); });
step('colocación: cambiar el pivote', () => { drawer('view'); setval('select[data-plp]', '6'); });
step('la colocación NO toca el modelo', () => {
  const f = S().model.bends[0].feed;
  if (Math.abs(f - 140) > 1e-9) throw new Error('el avance cambió a ' + f);
});
step('la colocación mueve lo que se dibuja', () => {
  const M = window.BARCOMP.E.placeTransform(S().place,
    window.BARCOMP.E.fk(S().model).pis[S().place.pivot]);
  if (Math.abs(M.determinant() - 1) > 1e-9) throw new Error('no es rígida');
});
step('colocación: restablecer', () => { drawer('view'); click('[data-a="placereset"]'); });

/* ------------------------------------------------- puntos de referencia -- */
step('pestaña Puntos', () => {
  click('[data-md="model"]');
  click('#tabs [data-t="points"]');
});
step('mover un PI', () => setval('input[data-p="4"][data-k="z"]', '60'));
step('insertar y borrar un punto', () => {
  click('tr[data-r="3"]'); click('[data-a="insp"]');
  click('tr[data-r="3"]'); click('[data-a="delp"]');
});
step('agregar punto de referencia', () => { click('tr[data-r="4"]'); click('[data-a="addmark"]'); });
step('el punto quedó en ST', () => { if (!S().marks.length) throw new Error('sin marks'); });
step('mover el punto de referencia', () => setval('input[data-mk="mk1"][data-k="z"]', '120'));
step('renombrar el punto', () => setval('input[data-mk="mk1"][data-k="name"]', 'apoyo A'));
step('el nombre se guardó', () => { if (S().marks[0].name !== 'apoyo A') throw new Error(S().marks[0].name); });
step('la tabla muestra la distancia al PI', () => {
  const t = document.querySelector('table.marks');
  if (!t || !/\d/.test(t.textContent)) throw new Error('sin distancia');
});
step('borrar una cota la borra de verdad', () => {
  const n = S().marks.length;
  const mk = S().marks[S().marks.length - 1];
  click(`#panes [data-mx="${mk.id}"]`);
  if (S().marks.length !== n - 1) throw new Error('el botón no borró nada');
  if (S().marks.some(m => m.id === mk.id)) throw new Error('sigue en ST');
  hotkey('z', { ctrlKey: true });
  if (S().marks.length !== n) throw new Error('deshacer no la devolvió');
});
step('ocultar y mostrar el punto', () => {
  check('input[data-mv="mk1"]', false);
  check('input[data-mv="mk1"]', true);
});

/* Bajo file:// un `<img onerror>` corre con acceso al disco del taller, y el
   nombre de una cota llega de un .json que va y viene por USB. La etiqueta del
   3D es el único sitio donde ese texto entra en un innerHTML. */
step('el nombre de una cota no se puede volver etiqueta en el 3D', () => {
  setval('input[data-mk="mk1"][data-k="name"]', '<img src=x onerror="window.__pwn=1">');
  window.BARCOMP.rebuildScene();
  window.BARCOMP.drawLabels();
  const host = q('#labels');
  if (host.querySelector('img')) throw new Error('la etiqueta se pintó como HTML');
  if (window.__pwn) throw new Error('se ejecutó');
  if (!host.innerHTML.includes('&lt;img')) throw new Error('no se escapó: ' + host.innerHTML.slice(0, 120));
  setval('input[data-mk="mk1"][data-k="name"]', 'apoyo A');
});
step('y un color inventado no se sale de su atributo', () => {
  const mk = S().marks[0];
  mk.color = '#0f0" onmouseover="window.__pwn=1';
  window.BARCOMP.rebuildScene();
  window.BARCOMP.drawLabels();
  const sw = q('#labels .swatch');
  if (sw.getAttribute('onmouseover')) throw new Error('el color abrió un atributo nuevo');
  mk.color = '#57C8D6';
});

/* Las claves de `data-*` las escribe este mismo programa, así que en marcha
   son buenas. La lista blanca está para que dejen de ser una SUPOSICIÓN: una
   clave que nadie declaró no debe poder aterrizar dentro de ST.comp. */
step('una clave que nadie declaró no entra en las tolerancias', () => {
  click('[data-md="model"]'); click('#tabs [data-t="model"]');
  const el = q('#panes input[data-t="angle"]');
  el.dataset.t = 'noExiste';
  el.value = '0.4';
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dataset.t = 'angle';
  const base = S().variants.find(v => v.id === S().active).base;
  if ('noExiste' in base.tol) throw new Error('se escribió una clave inventada');
});
step('y un texto que no es número no mete un NaN en la geometría', () => {
  const el = q('#panes input[data-s="width"]');
  const antes = S().model.section.width;
  /* el campo es de tipo number y el navegador ya filtra ahí; se pasa a texto
     a propósito para llegar al guardia de verdad, que es el del código */
  el.type = 'text';
  el.value = 'ancho';
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.type = 'number';
  if (!isFinite(S().model.section.width)) throw new Error('entró un NaN');
  if (S().model.section.width !== antes) throw new Error('cambió el ancho: ' + S().model.section.width);
});

/* ------------------------------------------------------- compensación --- */
step('simular desde el lateral de desviación', () => { drawer('pieces'); click('[data-a="sim"]'); });
/* Una pieza inventada por el simulador y una medida se veían igual: el
   distintivo es lo único que lo dice, y por eso se comprueba en los dos
   sitios donde sale (la tarjeta del lateral izquierdo y el lateral derecho). */
step('la pieza simulada se marca como SIM en los dos lados', () => {
  click('[data-md="meas"]');
  drawer('pieces');
  const ds = S().datasets[S().datasets.length - 1];
  if (ds.src !== 'sim') throw new Error('la pieza no quedó marcada como sim: ' + ds.src);
  const card = q(`#lf [data-dv="${ds.id}"]`).closest('.ds').querySelector('.srcbadge');
  if (!card || !card.classList.contains('sim')) throw new Error('sin distintivo en la tarjeta');
  const side = q('#side .srcbadge');
  if (!side.classList.contains('sim')) throw new Error('sin distintivo en el lateral');
  if (!side.title) throw new Error('el distintivo no explica qué significa');
});
/* Importar una pieza medida. El diálogo de archivo es lo único que un
   navegador headless no puede abrir, así que se entra por importCsvText(),
   que es el mismo camino menos el diálogo. */
step('importar una pieza medida desde un CSV', () => {
  const B = window.BARCOMP;
  const antes = S().datasets.length;
  /* un CSV con encabezado, columna de índice y un PI movido 8 mm en Z: lo que
     llegaría de un escaneo, no una copia exacta del nominal */
  const pis = B.E.fk(S().model).pis;
  const csv = 'idx;x;y;z\n' + pis.map((p, i) =>
    `${i};${p.x.toFixed(3)};${p.y.toFixed(3)};${(p.z + (i === 6 ? 8 : 0)).toFixed(3)}`).join('\n');
  const n = B.importCsvText(csv, 'lote_A_p1');
  B.renderAll();
  if (!n) throw new Error('el CSV no entró');
  if (S().datasets.length !== antes + 1) throw new Error('no se creó la pieza');
  const ds = S().datasets[S().datasets.length - 1];
  if (ds.src !== 'csv') throw new Error('procedencia mal puesta: ' + ds.src);
  if (ds.model.bends.length !== S().model.bends.length) throw new Error('dobleces distintos');
  if (!(ds.dev && ds.dev.tip >= 0)) throw new Error('no se midió la desviación');
  if (Math.max(...ds.dev.point) < 4) throw new Error('el punto movido 8 mm no se ve');
});
step('la pieza importada se marca como medida, no como SIM', () => {
  drawer('pieces');
  const ds = S().datasets[S().datasets.length - 1];
  const b = q(`#lf [data-dv="${ds.id}"]`).closest('.ds').querySelector('.srcbadge');
  if (!b.classList.contains('meas')) throw new Error('distintivo equivocado: ' + b.className);
});
/* Un LOTE de piezas. El diálogo de varios archivos tampoco se puede abrir
   headless, así que se entra por importCsvBatch(), que es lo que pickFiles()
   llama con lo que leyó. Lo que se comprueba aquí es lo que dolía al importar
   de verdad: 20 archivos no pueden costar 20 pasos de deshacer, y un archivo
   que el sistema no dejó leer no puede colgar el lote en silencio. */
function csvDePieza(desvia) {
  const pis = window.BARCOMP.E.fk(S().model).pis;
  return 'idx;x;y;z\n' + pis.map((p, i) =>
    `${i};${p.x.toFixed(3)};${p.y.toFixed(3)};${(p.z + (i === 5 ? desvia : 0)).toFixed(3)}`).join('\n');
}
step('un lote de tres CSV cuesta UN solo paso de deshacer', () => {
  const B = window.BARCOMP;
  const antesDs = S().datasets.length;
  B.importCsvBatch([1, 2, 3].map(k => ({ text: csvDePieza(k * 2), name: `lote_B_p${k}.csv` })));
  if (S().datasets.length !== antesDs + 3) {
    throw new Error('no entraron las tres: ' + (S().datasets.length - antesDs));
  }
  /* La cuenta de `undoDepth()` no sirve de testigo: a esta altura del banco la
     pila ya está en su tope de 50 y el contador no sube aunque se apile. Lo
     que sí distingue un commit del lote de tres commits es el COMPORTAMIENTO:
     con el commit() dentro del bucle, un Ctrl+Z se llevaba solo la última
     pieza y dejaba las otras dos puestas. */
  hotkey('z', { ctrlKey: true });
  const quedan = S().datasets.length - antesDs;
  if (quedan !== 0) throw new Error(`un Ctrl+Z dejó ${quedan} piezas del lote puestas`);
  hotkey('y', { ctrlKey: true });
  if (S().datasets.length !== antesDs + 3) throw new Error('un Ctrl+Y no repuso el lote entero');
  hotkey('z', { ctrlKey: true });
});
step('un archivo ilegible no cuelga el lote: se dice cuál y siguen los demás', () => {
  const B = window.BARCOMP;
  const antesDs = S().datasets.length;
  /* `ilegibles` es lo que pickFiles() aparta cuando File.text() rechaza: el
     archivo se movió, o lo tiene abierto otro programa. Antes el contador de
     FileReader nunca llegaba a cero y el callback no se llamaba NUNCA. */
  const r = B.importCsvBatch(
    [{ text: csvDePieza(3), name: 'lote_C_ok.csv' }],
    [{ name: 'lote_C_roto.csv' }]);
  if (S().datasets.length !== antesDs + 1) throw new Error('la pieza buena no entró');
  if (r.malos.length !== 1) throw new Error('no informó del ilegible: ' + JSON.stringify(r.malos));
  if (!r.malos[0].includes('lote_C_roto.csv')) throw new Error('no dice cuál falló: ' + r.malos[0]);
  if (r.malos[0] === 'lote_C_roto.csv') throw new Error('no dice por qué falló');
  hotkey('z', { ctrlKey: true });
});
step('un CSV con dos PI pegados se rechaza diciendo cuál', () => {
  const B = window.BARCOMP;
  const antes = S().datasets.length;
  /* el PI 2 a tres décimas del 1: la extracción de la nube salió mal, y la
     dirección de ese segmento sería puro ruido de medición */
  const pis = B.E.fk(S().model).pis;
  const csv = 'idx;x;y;z\n' + pis.map((p, i) => {
    const q = i === 2 ? pis[1] : p;
    return `${i};${(q.x + (i === 2 ? 0.3 : 0)).toFixed(3)};${q.y.toFixed(3)};${q.z.toFixed(3)}`;
  }).join('\n');
  const r = B.importCsvBatch([{ text: csv, name: 'lote_E_pegado.csv' }]);
  if (S().datasets.length !== antes) throw new Error('creó la pieza igualmente');
  if (r.malos.length !== 1) throw new Error('no informó: ' + JSON.stringify(r.malos));
  if (!/\b3\b/.test(r.malos[0])) throw new Error('no dice qué punto: ' + r.malos[0]);
});
step('un CSV de DESVIACIONES no entra como si fuera una barra perfecta', () => {
  const B = window.BARCOMP;
  const antes = S().datasets.length;
  /* Cómo se cuela: un informe de inspección exporta idx + la desviación en
     x,y,z en vez de la coordenada. Tres columnas numéricas, decimales con
     punto: pasa las guardas anteriores. Y una nube de desviaciones es,
     geométricamente, una barra rectísima de unos milímetros de largo — o sea
     una pieza sin ninguna desviación.

     Las desviaciones van de VARIOS milímetros a propósito, que es lo que da una
     pieza fuera de tolerancia. Con décimas de milímetro esto lo caza antes el
     guardia de PI pegados; el hueco que quedaba abierto está justo encima de
     PI_MIN_MM y muy por debajo del paso nominal, y es el que se prueba aquí. */
  const pis = B.E.fk(S().model).pis;
  const csv = 'idx;dx;dy;dz\n' + pis.map((_, i) =>
    `${i};${(((i % 3) - 1) * 4).toFixed(3)}`
    + `;${(i % 2 ? 3 : -3).toFixed(3)}`
    + `;${(((i % 4) - 1.5) * 2.5).toFixed(3)}`).join('\n');
  const r = B.importCsvBatch([{ text: csv, name: 'lote_F_desviacion.csv' }]);
  if (S().datasets.length !== antes) throw new Error('creó la pieza igualmente');
  if (r.malos.length !== 1) throw new Error('no informó: ' + JSON.stringify(r.malos));
  /* Y el aviso nombra el problema en vez de decir «no se importó»: tiene que
     traer el paso que debería tener la pieza, que es lo que le dice a quien
     exportó el archivo qué columna se equivocó. */
  const nominal = B.E.piStep(pis).toFixed(1);
  if (!r.malos[0].includes(nominal)) {
    throw new Error(`el aviso no dice el paso nominal (${nominal}): ` + r.malos[0]);
  }
});
step('un CSV corto entra pero se cuenta como incompleto', () => {
  const B = window.BARCOMP;
  const lineas = csvDePieza(4).split('\n');
  const corto = lineas.slice(0, lineas.length - 2).join('\n');
  const r = B.importCsvBatch([{ text: corto, name: 'lote_D_corto.csv' }]);
  if (r.cortos.length !== 1) throw new Error('no avisó del corto: ' + JSON.stringify(r.cortos));
  hotkey('z', { ctrlKey: true });
});
step('un CSV sin coordenadas no crea ninguna pieza', () => {
  const antes = S().datasets.length;
  if (window.BARCOMP.importCsvText('nombre;unidad\nx;y\n', 'vacio')) throw new Error('aceptó basura');
  if (S().datasets.length !== antes) throw new Error('creó una pieza igualmente');
});
/* Abrir el archivo equivocado soltaba un «TypeError: Cannot read properties of
   undefined»: cierto, pero no dice ni qué se abrió ni qué hacía falta abrir.
   Cada causa tiene ahora su frase, y ninguna repite a otra. */
step('abrir un archivo malo dice la causa y qué hacer, no un TypeError', () => {
  const B = window.BARCOMP;
  const msgs = [
    B.openError(new B.E.UnknownSchemaError('barcomp/9.9')),
    B.openError(new SyntaxError('Unexpected token N in JSON at position 0')),
    B.openError(new B.E.NotADocError()),
    B.openError(new TypeError('Cannot read properties of undefined')),
  ];
  if (new Set(msgs).size !== 4) throw new Error('dos causas dan el mismo texto');
  if (msgs.some(m => /TypeError|SyntaxError|undefined/.test(m.split('\n')[0]))) {
    throw new Error('la primera línea sigue siendo jerga: ' + msgs.join(' | '));
  }
  /* la línea técnica NO se tira: es lo único que sirve para arreglarlo, pero va
     detrás de la frase que dice qué pasó */
  if (!msgs[3].includes('Cannot read properties')) throw new Error('se perdió el detalle técnico');
  if (!msgs[0].includes('barcomp/9.9')) throw new Error('no dice cuál era el esquema');
});
step('y lo dice en los tres idiomas', () => {
  const B = window.BARCOMP;
  const por = ['es', 'en', 'de'].map(l => { click(`[data-l="${l}"]`); return B.openError(new SyntaxError('x')); });
  click('[data-l="es"]');
  if (new Set(por).size !== 3) throw new Error('algún idioma cae al de al lado');
});
step('el botón de importar está en el panel de piezas', () => {
  drawer('pieces');
  const b = q('#lf [data-a="impts"]');
  if (!b) throw new Error('no hay botón de importar');
  if (!b.title) throw new Error('el botón no explica qué formato espera');
});

/* El selector de arriba dejó de ser «pestaña de la tabla» y pasó a ser MODO
   DE TRABAJO: cada modo se queda la pantalla entera. Las sub-pestañas solo
   existen donde hay más de una tabla que enseñar, o sea en Modelar. */
/* La columna fija de 250 px pasó a cajones que abre la barra de menús: se
   pagaba ese ancho siempre, y capas, colocación y extremo fijo se tocan una
   vez y se olvidan. */
/* Deshacer guarda DOCUMENTOS serializados: lo que entra en el JSON entra en el
   deshacer solo. Lo que NO está en el documento —cámara, modo, capas,
   selección— no se deshace, y eso es deliberado.

   Cada paso de aquí deja el documento como lo encontró: rehace hasta la punta
   antes de terminar, o rebobinaría el trabajo de los pasos anteriores. */
function alaPunta() {
  for (let i = 0; i < 20 && q('#lf [data-a="redo"]'); i++) hotkey('y', { ctrlKey: true });
}
step('deshacer devuelve el valor anterior de una celda', () => {
  click('[data-md="model"]');
  click('#tabs [data-t="model"]');
  const antes = angVisto(2);
  setval('input[data-b="2"][data-k="angle"]', String(antes + 7));
  if (Math.abs(angVisto(2) - (antes + 7)) > 1e-6) throw new Error('no se editó');
  hotkey('z', { ctrlKey: true });
  if (Math.abs(angVisto(2) - antes) > 1e-9) {
    throw new Error(`no volvió: ${angVisto(2)} vs ${antes}`);
  }
  hotkey('y', { ctrlKey: true });
  if (Math.abs(angVisto(2) - (antes + 7)) > 1e-6) throw new Error('rehacer no repuso');
  hotkey('z', { ctrlKey: true });
  if (Math.abs(angVisto(2) - antes) > 1e-9) throw new Error('el segundo deshacer falló');
});
step('deshacer no toca el modo, el cajón ni las capas', () => {
  click('[data-md="model"]');
  const antes = S().model.bends[3].radius;
  setval('input[data-b="3"][data-k="radius"]', String(antes + 4));
  click('[data-md="comp"]');
  const capa = S().layers.grid.on, modo = S().mode, exag = S().view.exag;
  hotkey('z', { ctrlKey: true });
  if (Math.abs(S().model.bends[3].radius - antes) > 1e-9) throw new Error('no deshizo el radio');
  if (S().mode !== modo) throw new Error('cambió de modo al deshacer');
  if (S().layers.grid.on !== capa) throw new Error('tocó las capas');
  if (S().view.exag !== exag) throw new Error('tocó la exageración');
  click('[data-md="model"]');
});
step('deshacer recupera una cota borrada', () => {
  click('[data-md="model"]');
  click('#tabs [data-t="points"]');
  const mk = S().marks[0];
  if (!mk) throw new Error('no hay cotas para la prueba');
  const n = S().marks.length;
  click(`#panes [data-mx="${mk.id}"]`);
  if (S().marks.length !== n - 1) throw new Error('no se borró');
  hotkey('z', { ctrlKey: true });
  if (S().marks.length !== n) throw new Error('no volvió la cota');
  if (S().marks[0].name !== mk.name) throw new Error('volvió con otro nombre: ' + S().marks[0].name);
});
step('una acción nueva corta la rama de rehacer', () => {
  click('#tabs [data-t="model"]');
  const antes = S().model.bends[1].radius;
  setval('input[data-b="1"][data-k="radius"]', String(antes + 5));
  hotkey('z', { ctrlKey: true });
  setval('input[data-b="1"][data-k="radius"]', String(antes + 9));
  hotkey('y', { ctrlKey: true });
  if (Math.abs(S().model.bends[1].radius - (antes + 9)) > 1e-6) {
    throw new Error('rehacer resucitó una rama muerta: ' + S().model.bends[1].radius);
  }
  hotkey('z', { ctrlKey: true });
  if (Math.abs(S().model.bends[1].radius - antes) > 1e-9) throw new Error('no volvió al valor previo');
});
step('el cajón de Archivo dice cuántos pasos quedan', () => {
  drawer('file');
  const b = q('#lf [data-a="undo"]');
  if (!b) throw new Error('no hay botón de deshacer');
  if (!/[0-9]/.test(b.textContent)) throw new Error('no dice cuántos pasos: ' + b.textContent);
  alaPunta();
});
step('los menús abren y cierran su cajón', () => {
  /* el guion viene de pasos anteriores que dejaron cajones abiertos */
  if (S().drawer) { click(`[data-dr="${S().drawer}"]`); }
  if (!q('#lf').hidden) throw new Error('el cajón sigue montado tras cerrarlo');
  click('[data-dr="view"]');
  if (S().drawer !== 'view') throw new Error('no se abrió');
  if (q('#lf').hidden) throw new Error('el cajón sigue oculto');
  if (!q('#lf input[data-ly="grid"]')) throw new Error('el cajón de Vista no trae las capas');
  click('[data-dr="view"]');
  if (S().drawer) throw new Error('el mismo menú no lo cerró');
});
step('el cajón flota: abrirlo no mueve el 3D ni la tabla', () => {
  const antes = q('#vpwrap').getBoundingClientRect().width;
  click('[data-dr="models"]');
  const dur = q('#vpwrap').getBoundingClientRect().width;
  if (Math.abs(dur - antes) > 1) throw new Error(`el 3D cambió de ancho: ${antes} -> ${dur}`);
  const caja = q('#lf').getBoundingClientRect();
  const vp = q('#vpwrap').getBoundingClientRect();
  if (caja.left > vp.right || caja.right < vp.left) throw new Error('el cajón no está sobre el 3D');
  click('[data-dr="models"]');
});
step('Escape cierra el cajón', () => {
  click('[data-dr="pieces"]');
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  if (S().drawer) throw new Error('sigue abierto');
});
step('un clic fuera también lo cierra', () => {
  click('[data-dr="file"]');
  q('#ct').click();
  if (S().drawer) throw new Error('sigue abierto');
});
/* Mirar la pieza es la mitad del trabajo, y es lo que peor llevaba compartir
   pantalla. F la deja sola sin salir del modo ni perder el sitio en la tabla. */
step('la tecla F deja el 3D a pantalla completa y vuelve', () => {
  const antes = q('#vpwrap').getBoundingClientRect();
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
  if (!S().solo) throw new Error('no se plegó');
  const solo = q('#vpwrap').getBoundingClientRect();
  if (!(solo.width > antes.width + 100)) throw new Error(`el 3D no creció: ${antes.width} -> ${solo.width}`);
  if (getComputedStyle(q('#bt')).display !== 'none') throw new Error('la tabla sigue ahí');
  const cv = q('#vp').getBoundingClientRect();
  if (Math.abs(cv.width - solo.width) > 2) throw new Error('el lienzo no siguió al contenedor');
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', bubbles: true }));
  if (S().solo) throw new Error('no volvió');
  if (Math.abs(q('#vpwrap').getBoundingClientRect().width - antes.width) > 1) {
    throw new Error('al volver no quedó como estaba');
  }
});
step('dentro de un campo la F es una letra', () => {
  const inp = q('#panes input[type=number]');
  inp.focus();
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
  if (S().solo) throw new Error('se plegó mientras se escribía');
  inp.blur();
});
step('el botón del visor hace lo mismo que la tecla', () => {
  click('#vptool [data-a="solo"]');
  if (!S().solo) throw new Error('el botón no plegó');
  click('#vptool [data-a="solo"]');
  if (S().solo) throw new Error('el botón no devolvió');
});
/* Las etiquetas del 3D llevaban el color en el estilo —un #fff a pelo para la
   seleccionada— y en tema claro era blanco sobre blanco. Ahora va por clase,
   con su token en los dos temas. */
step('la etiqueta del doblez seleccionado se marca por clase, no por color fijo', () => {
  click('[data-md="model"]');
  click('tr[data-r="6"]');
  /* el render es bajo demanda: las etiquetas se pintan en el próximo cuadro,
     y este guion es síncrono */
  S().layers.lbl.on = true;
  window.BARCOMP.drawLabels();
  const sel = q('#labels .lbl.sel');
  if (!sel) throw new Error('ninguna etiqueta marcada como seleccionada');
  if (sel.textContent.trim() !== 'B7') throw new Error('marcó ' + sel.textContent);
  if (/#fff|white/i.test(q('#labels').innerHTML)) throw new Error('sigue habiendo un color fijo');
  const col = getComputedStyle(sel).color;
  if (!col || col === 'rgba(0, 0, 0, 0)') throw new Error('sin color de texto');
});
step('la cota lleva su color en un punto y el texto legible', () => {
  window.BARCOMP.drawLabels();
  const sw = q('#labels .lbl .swatch');
  if (!sw) throw new Error('la cota no trae su punto de color');
  const bg = getComputedStyle(sw).backgroundColor;
  if (!bg || bg === 'rgba(0, 0, 0, 0)') throw new Error('el punto no lleva el color de la cota');
});
step('los tres modos están arriba y la medición no es pestaña', () => {
  const modos = [...document.querySelectorAll('[data-md]')].map(b => b.dataset.md);
  if (modos.join(',') !== 'model,meas,comp') throw new Error('modos: ' + modos.join(','));
  if (document.querySelector('#tabs [data-t="meas"]')) throw new Error('sigue habiendo pestaña');
});
step('en Medir no hay bloque de abajo y el lateral manda', () => {
  click('[data-md="meas"]');
  if (S().mode !== 'meas') throw new Error('no cambió de modo');
  if (getComputedStyle(q('#bt')).display !== 'none') throw new Error('el bloque de abajo sigue ahí');
  if (!q('#side .stat')) throw new Error('el lateral no trae las estadísticas');
  const cinta = q('#rb').getBoundingClientRect(), app = q('#app').getBoundingClientRect();
  if (cinta.width < app.width - 1) throw new Error('la cinta no va a todo el ancho en Medir');
});
step('el lateral derecho trae las estadísticas y la desviación por doblez', () => {
  click('[data-md="meas"]');
  const side = q('#side');
  if (side.querySelectorAll('.stat').length !== 4) throw new Error('faltan estadísticas');
  const filas = side.querySelectorAll('table tbody tr').length;
  if (filas !== S().model.bends.length) throw new Error('tabla de desviación con ' + filas);
  if (!side.querySelector('input[data-pr="seed"]')) throw new Error('falta el proceso simulado');
});
/* Con dos piezas o mas, la dispersion por doblez es lo que dice si un doblez
   esta sistematicamente fuera o solo tuvo mala punteria. */
step('con dos piezas visibles aparece la columna de dispersión', () => {
  click('[data-md="meas"]');
  const vis = S().datasets.filter(d => d.visible).length;
  if (vis < 2) throw new Error('solo hay ' + vis + ' pieza(s) visible(s)');
  const th = [...q('#side table').querySelectorAll('thead th')].map(x => x.textContent.trim());
  if (!th.includes('±σ')) throw new Error('sin columna de dispersión: ' + th.join('|'));
});

/* El resorte deja de teclearse a ojo. Con piezas medidas se estima, y la
   pieza recuerda con que comando se fabrico: sin eso, aplicar una
   compensacion cambiaria ST.command y la cuenta dejaria de valer. */
step('el resorte medido sale del lateral con su dispersión', () => {
  click('[data-md="meas"]');
  const side = q('#side');
  const filas = side.querySelectorAll('.sbrow');
  if (filas.length !== 2) throw new Error('no hay dos orientaciones: ' + filas.length);
  const txt = side.textContent;
  if (!/n=\d+/.test(txt)) throw new Error('no dice cuántas muestras tiene');
  if (!side.querySelector('[data-a="usesb"]')) throw new Error('no se puede adoptar');
  if (!/simulad/i.test(txt)) throw new Error('no avisa de que las piezas son simuladas');
});
step('cada pieza recuerda el comando con el que se fabricó', () => {
  const ds = S().datasets;
  if (!ds.every(d => d.cmd && d.cmd.length)) throw new Error('alguna pieza sin comando');
  const doc = Eg().toDoc(S().model, S().command, S().comp, S().proc, ds, S().variants,
                         S().ref, S().anchor, {});
  if (!doc.datasets[0].cmd) throw new Error('el comando no viaja en el JSON');
});
step('adoptar el resorte medido escribe el simulador', () => {
  const antes = S().proc.sbW;
  click('[data-a="usesb"]');
  const sb = window.BARCOMP.E.springback(
    S().datasets.filter(d => d.visible).map(d => ({ cmd: d.cmd, meas: d.model.bends })),
    window.BARCOMP.E.orientations(S().model));
  if (Math.abs(S().proc.sbW - +sb.W.stat.med.toFixed(3)) > 1e-9) {
    throw new Error('sbW no quedó en la mediana medida: ' + S().proc.sbW);
  }
  S().proc.sbW = antes;
});

step('modo Compensar', () => {
  click('[data-md="comp"]');
  if (S().mode !== 'comp') throw new Error('no cambió de modo');
});
/* Compensar ES el modo taller: si en pantalla no hay nada que no sea
   compensación, no hace falta un interruptor de bloqueo aparte. */
step('en Compensar no queda nada editable fuera de la compensación', () => {
  if (getComputedStyle(q('#lf')).display !== 'none') throw new Error('el panel de modelos sigue visible');
  if (getComputedStyle(q('#rt')).display !== 'none') throw new Error('el lateral sigue visible');
  const editables = [...document.querySelectorAll('#app input:not([type=checkbox]):not([type=color]):not([type=range]),#app select')]
    .filter(el => el.offsetParent !== null)
    .filter(el => !(el.dataset.tw || el.dataset.c));
  if (editables.length) {
    throw new Error('quedan campos ajenos: ' + editables.map(e => e.dataset.k || e.name || e.type).join(','));
  }
});
step('el lazo puede leer la mediana del lote en vez de la última pieza', () => {
  const antes = [...document.querySelectorAll('#panes table.cmd tbody tr')]
    .map(tr => tr.cells[3].textContent.trim());
  check('input[data-c="batch"]', true);
  if (!S().comp.batch) throw new Error('no se guardó comp.batch');
  const dsp = [...document.querySelectorAll('#panes table.cmd tbody tr')]
    .map(tr => tr.cells[3].textContent.trim());
  if (antes.join() === dsp.join()) throw new Error('el Δ calculado no cambió al usar la mediana');
  const doc = Eg().toDoc(S().model, S().command, S().comp, S().proc, [], S().variants,
                         S().ref, S().anchor, {});
  if (doc.comp.batch !== true) throw new Error('comp.batch no viaja en el JSON');
  check('input[data-c="batch"]', false);
});
/* La tabla de comandos tiene que hablar el MISMO idioma que la de dobleces: si
   una enseña -17.9 y la otra +17.9, el ajuste manual se escribe al revés. */
step('la tabla de comandos enseña el ángulo tal como está guardado', () => {
  const fila = q('#panes table.cmd tbody tr');
  const ahora = parseFloat(fila.cells[2].textContent);
  if (Math.abs(ahora - S().command[0].angle) > 1e-3) {
    throw new Error(`la tabla dice ${ahora} y el modelo ${S().command[0].angle}`);
  }
});
step('ajuste manual: «+2» suma sobre lo mostrado', () => {
  const antes = parseFloat(q('input[data-tw="0"][data-k="angle"]').value);
  setval('input[data-tw="0"][data-k="angle"]', '+2');
  const ahora = parseFloat(q('input[data-tw="0"][data-k="angle"]').value);
  if (Math.abs(ahora - (antes + 2)) > 1e-6) throw new Error(antes + ' -> ' + ahora);
});
/* La celda es de hoja de cálculo: un operador al principio opera sobre lo que
   se VE, no sobre el cálculo del lazo. Se nota en la segunda edición. */
step('ajuste manual: «+2» dos veces suma dos veces', () => {
  const cel = 'input[data-tw="1"][data-k="angle"]';
  const leer = () => parseFloat(q(cel).value);
  setval(cel, '=0');
  const base = leer();
  setval(cel, '+2');
  const uno = leer();
  setval(cel, '+2');
  const dos = leer();
  if (Math.abs(uno - (base + 2)) > 1e-6) throw new Error(`primera: ${base} -> ${uno}`);
  if (Math.abs(dos - (base + 4)) > 1e-6) throw new Error(`segunda no acumuló: ${uno} -> ${dos}`);
  setval(cel, '=0');
});
step('ajuste manual: «=» fuerza absoluto y admite negativos', () => {
  const cel = 'input[data-tw="1"][data-k="angle"]';
  setval(cel, '=-1.25');
  if (Math.abs(parseFloat(q(cel).value) + 1.25) > 1e-6) throw new Error('=-1.25 -> ' + q(cel).value);
  setval(cel, '=0');
});
step('ajuste manual: número suelto reemplaza', () => {
  setval('input[data-tw="1"][data-k="angle"]', '0.5');
  const v = parseFloat(q('input[data-tw="1"][data-k="angle"]').value);
  if (Math.abs(v - 0.5) > 1e-6) throw new Error('quedó en ' + v);
});
step('ajuste manual: cuenta sobre c', () => setval('input[data-tw="2"][data-k="angle"]', 'c*1.5'));
step('ajuste manual: texto inválido se descarta', () => {
  const prev = JSON.stringify(S().tweak[3]);
  setval('input[data-tw="3"][data-k="angle"]', 'hola');
  if (JSON.stringify(S().tweak[3]) !== prev) throw new Error('cambió con texto inválido');
});
/* Y se NOTA. Descartarlo en silencio dejaba la celda igual que cuando el ajuste
   sí se acepta y no mueve nada: dos resultados opuestos con la misma pinta. */
step('y el texto rechazado se queda a la vista, marcado', () => {
  const el = q('input[data-tw="3"][data-k="angle"]');
  if (el.value !== 'hola') throw new Error('la celda volvió al valor de antes: ' + el.value);
  if (!el.classList.contains('badcell')) throw new Error('sin marca de rechazo');
  if (!el.title) throw new Error('sin explicación de qué se admite');
});
step('y una cuenta válida lo limpia', () => {
  setval('input[data-tw="3"][data-k="angle"]', '=0.25');
  const el = q('input[data-tw="3"][data-k="angle"]');
  if (el.classList.contains('badcell')) throw new Error('sigue marcada de rojo');
  /* `=` fuerza absoluto: la celda tiene que enseñar exactamente 0.25 */
  if (Math.abs(parseFloat(el.value) - 0.25) > 1e-6) throw new Error('enseña ' + el.value);
});
step('el comando final incluye el ajuste', () => {
  const fila = document.querySelectorAll('table.cmd tbody tr')[0];
  const c = fila.querySelectorAll('td');
  const now = parseFloat(c[2].textContent);
  const dApp = parseFloat(c[4].querySelector('input').value);
  const fin = parseFloat(c[5].textContent);
  if (Math.abs(now + dApp - fin) > 2e-3) throw new Error(`${now} + ${dApp} != ${fin}`);
});
step('activar canto y avance añade columnas', () => {
  check('input[data-c="doRot"]', true);
  check('input[data-c="doFeed"]', true);
  const th = document.querySelectorAll('table.cmd thead th').length;
  if (th !== 14) throw new Error('columnas: ' + th);
});
/* El rodado no tiene resorte y el avance no se desvía por elasticidad: cada uno
   lleva su ganancia. Existían en el motor desde el principio, pero no había
   dónde tocarlas, así que el taller no podía cambiar un 0.5 que nadie eligió. */
step('con rodado y avance encendidos aparecen sus dos ganancias', () => {
  if (!document.querySelector('input[data-c="gainR"]')) throw new Error('sin ganancia de rodado');
  if (!document.querySelector('input[data-c="gainF"]')) throw new Error('sin ganancia de avance');
});
step('y se guardan donde el lazo las lee', () => {
  setval('input[data-c="gainR"]', '0.3');
  if (Math.abs(S().comp.gainR - 0.3) > 1e-9) throw new Error('gainR = ' + S().comp.gainR);
  setval('input[data-c="gainR"]', '0.5');
});
step('apagar el rodado se lleva su ganancia', () => {
  check('input[data-c="doRot"]', false);
  if (document.querySelector('input[data-c="gainR"]')) throw new Error('quedó un mando que no hace nada');
  check('input[data-c="doRot"]', true);
});
step('aplicar compensación', () => click('[data-a="apply"]'));
step('el ajuste se consume al aplicar', () => {
  if (S().tweak.some(t => t.angle || t.rot || t.feed)) throw new Error('el ajuste sigue puesto');
});
step('verificar 2.ª pieza', () => click('[data-a="verify"]'));
step('reporte', () => { drawer('file'); click('[data-a="report"]'); });
step('reset de comandos', () => click('[data-a="resetcmd"]'));

/* ---------------------------------------------------- panel redimensionado */
/* La distribución ya no es una sola: cada modo reparte la pantalla a su
   manera, y eso es lo que hay que comprobar. En MODELAR la tabla está a la
   DERECHA y de arriba abajo —es lo que permite teclear los ángulos sin
   desplazar— y la cinta va bajo el 3D, no bajo la tabla. */
step('en Modelar la tabla va a la derecha, entera, y el 3D al lado', () => {
  click('[data-md="model"]');
  const bt = q('#bt').getBoundingClientRect();
  const ct = q('#ct').getBoundingClientRect();
  const rb = q('#rb').getBoundingClientRect();
  const app = q('#app').getBoundingClientRect();
  if (!(ct.right <= bt.left + 1)) throw new Error('el 3D no está a la izquierda de la tabla');
  if (bt.height < app.height * 0.7) throw new Error('la tabla no ocupa el alto: ' + bt.height);
  if (!(rb.right <= bt.left + 1)) throw new Error('la cinta se mete debajo de la tabla');
  const filas = document.querySelectorAll('#panes table.lra tbody tr').length;
  const visibles = [...document.querySelectorAll('#panes table.lra tbody tr')]
    .filter(tr => tr.getBoundingClientRect().bottom <= bt.bottom).length;
  if (visibles < 10) throw new Error(`solo ${visibles} filas de ${filas} a la vista`);
});
step('en Compensar la tabla de comandos va a todo el ancho', () => {
  click('[data-md="comp"]');
  const bt = q('#bt').getBoundingClientRect();
  const app = q('#app').getBoundingClientRect();
  if (bt.width < app.width - 1) throw new Error('la tabla no ocupa el ancho: ' + bt.width);
  const vis = [...document.querySelectorAll('#panes table.cmd tbody tr')]
    .filter(tr => tr.getBoundingClientRect().bottom <= bt.bottom).length;
  if (vis < 5) throw new Error('solo ' + vis + ' filas de comando a la vista');
  click('[data-md="model"]');
});
/* Las 13 columnas piden 1000 px y la columna de la tabla arranca en 760: en
   Modelar se teclea de RECTA a ÁNGULO sin desplazar, y el resto —radio,
   torsión y las dos calculadas— entra ensanchando con el tirador. La página
   NUNCA se desplaza en horizontal: el desplazamiento vive dentro de .tw. */
step('en Modelar se teclea de Recta a Ángulo sin desplazar, y el resto con el tirador', () => {
  click('[data-md="model"]');
  const tw = q('#panes .tw');
  const th = [...document.querySelectorAll('#panes table.lra thead th')];
  const angulo = th.findIndex(x => x.textContent.trim() === 'Ángulo');
  const caja = tw.getBoundingClientRect();
  const cel = th[angulo].getBoundingClientRect();
  if (cel.right > caja.right + 1) throw new Error('la columna Ángulo no cabe sin desplazar');
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth) {
    throw new Error('la página se desplaza en horizontal');
  }
  document.documentElement.style.setProperty('--btW', '1080px');
  window.dispatchEvent(new Event('resize'));
  const ultima = th[th.length - 1].getBoundingClientRect();
  const caja2 = tw.getBoundingClientRect();
  if (ultima.right > caja2.right + 2) throw new Error('ni ensanchando caben las 13 columnas');
  document.documentElement.style.setProperty('--btW', '760px');
  window.dispatchEvent(new Event('resize'));
});
/* Cada tirador cambia de oficio con el modo, porque la pantalla cambia de
   forma: en Compensar la banda de abajo es el 3D, no la tabla. */
step('el tirador de abajo mueve la cinta en Modelar y la banda 3D en Compensar', () => {
  click('[data-md="model"]');
  const rb0 = q('#rb').getBoundingClientRect().height;
  document.documentElement.style.setProperty('--ribbon', '130px');
  window.dispatchEvent(new Event('resize'));
  const rb1 = q('#rb').getBoundingClientRect().height;
  if (!(rb1 > rb0 + 20)) throw new Error(`la cinta no creció: ${rb0} -> ${rb1}`);
  document.documentElement.style.setProperty('--ribbon', '74px');

  click('[data-md="comp"]');
  const vp0 = q('#ct').getBoundingClientRect().height;
  document.documentElement.style.setProperty('--compVP', '380px');
  window.dispatchEvent(new Event('resize'));
  const vp1 = q('#ct').getBoundingClientRect().height;
  if (!(vp1 > vp0 + 20)) throw new Error(`la banda 3D no creció: ${vp0} -> ${vp1}`);
  document.documentElement.style.setProperty('--compVP', '250px');
  click('[data-md="model"]');
});
step('el 3D nunca baja de 200 px de alto', () => {
  document.documentElement.style.setProperty('--btH', '5000px');
  window.dispatchEvent(new Event('resize'));
  const h = q('#vpwrap').getBoundingClientRect().height;
  if (h < 199) throw new Error('el 3D se quedó en ' + h);
  document.documentElement.style.setProperty('--btH', '300px');
  window.dispatchEvent(new Event('resize'));
});
step('el lienzo no invade la cinta ni la tabla', () => {
  const cv = q('#vp').getBoundingClientRect();
  const rb = q('#rb').getBoundingClientRect();
  if (cv.bottom > rb.top + 1) {
    throw new Error(`lienzo hasta ${cv.bottom.toFixed(0)} px, cinta empieza en ${rb.top.toFixed(0)} px`);
  }
});

step('el lienzo no invade lo que tenga a la derecha', () => {
  /* En Modelar lo de la derecha es la TABLA; en Medir, el lateral. En los dos
     el lienzo tiene que quedarse en su columna: sin onResize() conserva su
     tamaño en píxeles y se monta encima. */
  const casos = [['model', '#bt', '--btW'], ['meas', '#rt', '--rtW']];
  for (const [modo, sel, css] of casos) {
    click(`[data-md="${modo}"]`);
    document.documentElement.style.setProperty(css, '780px');
    window.dispatchEvent(new Event('resize'));
    const cv = q('#vp').getBoundingClientRect();
    const otro = q(sel).getBoundingClientRect();
    if (cv.right > otro.left + 1) {
      throw new Error(`${modo}: lienzo hasta ${cv.right.toFixed(0)} px, ${sel} empieza en ${otro.left.toFixed(0)} px`);
    }
  }
});
step('y tampoco al volver a estrecharlo', () => {
  click('[data-md="model"]');
  document.documentElement.style.setProperty('--btW', '760px');
  window.dispatchEvent(new Event('resize'));
  const cv = q('#vp').getBoundingClientRect();
  const bt = q('#bt').getBoundingClientRect();
  if (cv.right > bt.left + 1) throw new Error('invade al estrechar');
  document.documentElement.style.setProperty('--rtW', '360px');
});

/* ---------------------------------------------------------------- E/S --- */
step('el modo de trabajo viaja en el JSON', () => {
  click('[data-md="comp"]');
  const doc = Eg().toDoc(S().model, S().command, S().comp, S().proc, [], S().variants,
                         S().ref, S().anchor, { ui: { theme: S().theme, mode: S().mode } });
  if (doc.ui.mode !== 'comp') throw new Error('ui.mode = ' + doc.ui.mode);
  click('[data-md="model"]');
});
step('el JSON guardado lleva tema e idioma', () => {
  click('[data-th="light"]');
  const doc = window.BARCOMP.E.toDoc(S().model, S().command, S().comp, S().proc, [],
    S().variants, S().ref, S().anchor,
    { place: S().place, marks: S().marks, tweak: S().tweak,
      ui: { theme: S().theme, lang: 'es' } });
  if (doc.ui.theme !== 'light') throw new Error('tema no guardado: ' + doc.ui.theme);
  click('[data-th="system"]');
});
step('guardar JSON conserva colocación y cotas', () => {
  const doc = window.BARCOMP.E.toDoc(S().model, S().command, S().comp, S().proc,
    S().datasets, S().variants, S().ref, S().anchor,
    { place: S().place, marks: S().marks, tweak: S().tweak });
  if (!doc.marks.length) throw new Error('el documento no lleva las cotas');
  const rt = window.BARCOMP.E.fromDoc(JSON.parse(JSON.stringify(doc)));
  if (rt.marks[0].name !== 'apoyo A') throw new Error('la cota no volvió');
});
/* --- el fixture: pedestales -------------------------------------------- */
/* Es la única pestaña donde lo que se teclea son medidas del TALLER y no de la
   pieza, así que lo que hay que comprobar es que la pieza no las mueve y que
   la tabla dice la verdad sobre si apoyan. */
step('la pestaña Fixture existe dentro de Modelar', () => {
  click('[data-md="model"]');
  click('#tabs [data-t="fixture"]');
  if (S().tab !== 'fixture') throw new Error('no cambió de pestaña: ' + S().tab);
  q('#panes [data-a="seedped"]');
});
step('sin pedestales no hay tabla, hay una explicación', () => {
  if (S().fixture.length) throw new Error('arrancó con pedestales puestos');
  if (document.querySelector('#panes table.marks')) throw new Error('tabla vacía dibujada');
});
step('sembrar pone siete pedestales y enciende la capa del fixture', () => {
  if (S().layers.fix.on) throw new Error('la capa ya estaba encendida');
  click('#panes [data-a="seedped"]');
  if (S().fixture.length !== 7) throw new Error('sembró ' + S().fixture.length);
  if (!S().layers.fix.on) throw new Error('sembró y el 3D siguió sin enseñarlos');
  if (q('#panes table.marks tbody').children.length !== 7) throw new Error('la tabla no los enseña');
});
step('lo sembrado apoya: ninguna fila sale en rojo', () => {
  const malas = [...document.querySelectorAll('#panes table.marks tbody .v-bad')];
  if (malas.length) throw new Error(malas.length + ' celdas en rojo: ' + malas[0].textContent);
});
step('el vano mayor se dice arriba, no escondido en una columna', () => {
  const chip = [...document.querySelectorAll('#panes .chip')]
    .find(c => /mm/.test(c.textContent));
  if (!chip) throw new Error('no hay resumen de vano');
  const v = parseFloat(chip.textContent.replace(/[^\d.]/g, ''));
  if (!(v > 100 && v < 2000)) throw new Error('vano mayor absurdo: ' + chip.textContent);
});
step('subir un pedestal 5 mm abre un hueco de 5 mm y lo pinta en rojo', () => {
  const p = S().fixture[2], antes = p.h;
  setval(`#panes [data-pd="${p.id}"][data-k="h"]`, (antes + 5).toFixed(2));
  if (Math.abs(S().fixture[2].h - (antes + 5)) > 1e-6) throw new Error('no tomó la altura');
  const fila = q(`#panes [data-pd="${p.id}"][data-k="h"]`).closest('tr');
  const rojo = fila.querySelector('.v-bad');
  if (!rojo) throw new Error('el pedestal que estorba no se marca');
  if (!/-5/.test(rojo.textContent)) throw new Error('el hueco no dice −5: ' + rojo.textContent);
  /* WCAG 1.4.1: fuera de tolerancia no puede decirse SOLO con el color. Una de
     cada doce personas no distingue el rojo del verde, y la tabla se fotocopia
     en blanco y negro para llevarla a la máquina. */
  const signo = getComputedStyle(rojo, '::after').content;
  if (!/!!/.test(signo)) throw new Error('la celda fuera de tolerancia solo se marca con color: ' + signo);
  setval(`#panes [data-pd="${p.id}"][data-k="h"]`, antes.toFixed(2));
});
step('apartarlo medio metro lo deja sin barra encima, y se dice', () => {
  const p = S().fixture[2], antes = p.y;
  setval(`#panes [data-pd="${p.id}"][data-k="y"]`, (antes + 500).toFixed(1));
  const fila = q(`#panes [data-pd="${p.id}"][data-k="y"]`).closest('tr');
  if (!/no le pasa|not pass|nicht dar/i.test(fila.textContent)) {
    throw new Error('no avisa de que no sostiene: ' + fila.textContent);
  }
  setval(`#panes [data-pd="${p.id}"][data-k="y"]`, antes.toFixed(1));
});
step('el fixture NO se mueve cuando se recoloca la pieza', () => {
  /* Es la propiedad que lo hace un fixture y no un adorno: está atornillado a
     la mesa. Lo que cambia al mover la pieza es si sigue apoyando. */
  const antes = S().fixture.map(p => [p.x, p.y, p.h, p.tilt]);
  const place = S().place;
  place.z += 40;
  window.BARCOMP.refresh();
  const ahora = S().fixture.map(p => [p.x, p.y, p.h, p.tilt]);
  if (JSON.stringify(antes) !== JSON.stringify(ahora)) throw new Error('los pedestales se movieron con la pieza');
  const rojas = document.querySelectorAll('#panes table.marks tbody .v-bad').length;
  if (!rojas) throw new Error('subir la pieza 40 mm y ningún pedestal se queja');
  place.z -= 40;
  window.BARCOMP.refresh();
  if (document.querySelectorAll('#panes table.marks tbody .v-bad').length) {
    throw new Error('al devolverla a su sitio siguen en rojo');
  }
});
step('borrar un pedestal quita su fila y no renumera los demás', () => {
  const id = S().fixture[1].id, nombres = S().fixture.map(p => p.name);
  click(`#panes [data-px="${id}"]`);
  if (S().fixture.length !== 6) throw new Error('quedan ' + S().fixture.length);
  if (S().fixture.some(p => p.id === id)) throw new Error('sigue ahí');
  const esperado = nombres.filter((_, i) => i !== 1).join();
  if (S().fixture.map(p => p.name).join() !== esperado) throw new Error('renumeró los que quedan');
});
step('un Ctrl+Z devuelve el pedestal borrado', () => {
  hotkey('z', { ctrlKey: true });
  if (S().fixture.length !== 7) throw new Error('el deshacer no lo repuso: ' + S().fixture.length);
});
step('el fixture viaja en el JSON guardado', () => {
  const doc = window.BARCOMP.E.toDoc(
    S().model, S().command, S().comp, S().proc, S().datasets, S().variants,
    S().ref, S().anchor, { place: S().place, marks: S().marks, fixture: S().fixture });
  if (!doc.fixture || doc.fixture.length !== 7) throw new Error('no guardó los pedestales');
  if (doc.fixture[0].id !== undefined) throw new Error('guardó el id, que se reasigna al abrir');
  if (!('tilt' in doc.fixture[0]) || !('pad' in doc.fixture[0])) throw new Error('faltan campos');
});
step('vaciar los quita todos y vuelve la explicación', () => {
  click('#panes [data-a="clearped"]');
  if (S().fixture.length) throw new Error('quedan ' + S().fixture.length);
  if (document.querySelector('#panes table.marks')) throw new Error('la tabla sigue dibujada');
});
step('añadir uno suelto nace apoyando, no en el origen a cero', () => {
  click('#panes [data-a="addped"]');
  if (S().fixture.length !== 1) throw new Error('no lo creó');
  const p = S().fixture[0];
  if (p.h <= 1) throw new Error('nació sin altura: ' + p.h);
  const malas = document.querySelectorAll('#panes table.marks tbody .v-bad').length;
  if (malas) throw new Error('el pedestal recién creado ya sale en rojo');
  click('#panes [data-a="clearped"]');
});

/* --- A8: medir antes de optimizar --------------------------------------- */
/* El plan pedía `rebuildGroup(k)` —reconstruir una sola capa en vez de la
   escena entera— «solo si con el número real de piezas la escena va a
   tirones». Eso es una medición, y hasta ahora nadie la había hecho: app.ts
   expone `rebuildScene` y `renderer` justo para esto.

   La beta va a ver ~13 barras (la secuencia de puesta en marcha del plan), así
   que se mide con 13 piezas medidas encima y todas visibles, que es el caso
   peor real. rebuildScene() corre en CADA edición confirmada, así que lo que
   decide si «va a tirones» es si tecleando en una celda se nota. */
step('coste de reconstruir la escena con 13 piezas medidas', () => {
  const B = window.BARCOMP;
  drawer('file'); click('[data-a="demo"]');
  const pis = B.E.fk(S().model).pis;
  const csv = (k) => 'idx;x;y;z\n' + pis.map((p, i) =>
    `${i};${p.x.toFixed(3)};${p.y.toFixed(3)};${(p.z + (i > 2 ? k * 0.7 : 0)).toFixed(3)}`).join('\n');
  B.importCsvBatch([...Array(13)].map((_, k) => ({ text: csv(k + 1), name: `perf_${k}.csv` })));
  if (S().datasets.length !== 13) throw new Error('no entraron las 13: ' + S().datasets.length);
  for (const d of S().datasets) d.visible = true;

  /* Mediana de siete, no media: la primera reconstrucción paga la compilación
     del shader y el primer reparto de memoria, y una media se la traga. */
  const t = [];
  for (let i = 0; i < 7; i++) {
    const t0 = performance.now();
    B.rebuildScene();
    t.push(performance.now() - t0);
  }
  t.sort((a, b) => a - b);
  const med = t[3];
  /* Cuántos objetos cuelgan de la escena. NO se usa renderer.info: ese cuenta
     lo SUBIDO a la GPU, y en un paso síncrono no se ha dibujado ni un
     fotograma, así que da cero y parecería que se está midiendo algo. */
  const nObj = () => { let n = 0; B.scene.traverse(() => n++); return n; };
  const nota = `${med.toFixed(1)} ms · ${nObj()} objetos en la escena · 13 piezas`;
  log.push('     ' + nota);
  /* El presupuesto: 250 ms. Por encima de eso, teclear una celda se siente
     pegajoso y `rebuildGroup(k)` deja de ser una optimización prematura.
     El margen es amplio a propósito —esto corre en un headless con SwiftShader,
     que es más lento que cualquier portátil con GPU— así que un fallo aquí
     significa de verdad que hay que partir la reconstrucción por capas. */
  if (!(med < 250)) throw new Error('la escena va a tirones: ' + nota);
  /* Y que la escena no CREZCA al reconstruirla: rebuildScene() destruye y
     rehace todo, y si el vaciado de un grupo se dejara algo, cada edición
     añadiría objetos —y sus geometrías— hasta agotar la memoria. Nueve pasadas
     tienen que dejar exactamente los mismos objetos que siete. */
  const o1 = nObj();
  B.rebuildScene(); B.rebuildScene();
  const o2 = nObj();
  if (o2 !== o1) throw new Error(`la escena crece al reconstruirla: ${o1} -> ${o2}`);
});

/* ------------------------------------------------------------- LÍMITES ----
   Los umbrales que juzgan un dato. Lo que hay que vigilar aquí no es que la
   tabla se pinte: es que un número tecleado LLEGUE al motor y que uno absurdo
   se recorte en vez de apagar la guarda. */
step('la pestaña Límites existe en Modelar y trae los ocho números', () => {
  click('[data-md="model"]');
  click('#tabs [data-t="lims"]');
  if (S().tab !== 'lims') throw new Error('no cambió de pestaña');
  const campos = document.querySelectorAll('#panes [data-lm], #panes [data-c]').length;
  if (campos !== 8) throw new Error(campos + ' campos');
});
step('Límites NO aparece en Compensar: le comería una fila a la tabla', () => {
  click('[data-md="comp"]');
  if (document.querySelector('#tabs [data-t="lims"]')) {
    throw new Error('la pestaña se coló en el modo taller');
  }
  click('[data-md="model"]');
  click('#tabs [data-t="lims"]');
});
step('un umbral tecleado llega al motor', () => {
  setval('#panes [data-lm="straightMin"]', '40');
  if (S().lims.straightMin !== 40) throw new Error('ST.lims dice ' + S().lims.straightMin);
});
step('y muerde: subirlo deja rectas de esta pieza fuera', () => {
  setval('#panes [data-lm="straightMin"]', '400');
  const B = window.BARCOMP;
  const f = B.E.feasibility(S().model, S().lims);
  if (f.ok) throw new Error('con 400 mm la demo sigue siendo fabricable');
  /* Y se dice en la propia pestaña, no solo por dentro. */
  const chip = q('#panes .chip');
  if (!/\d/.test(chip.textContent)) throw new Error('la insignia no dice cuántas');
});
step('un valor fuera de rango se recorta y la celda enseña lo recortado', () => {
  setval('#panes [data-lm="scaleMin"]', '9');
  if (S().lims.scaleMin !== 1) throw new Error('ST.lims dice ' + S().lims.scaleMin);
  const celda = q('#panes [data-lm="scaleMin"]');
  if (parseFloat(celda.value) !== 1) throw new Error('la celda enseña ' + celda.value);
});
step('un umbral vacío no escribe un 0 que nadie pidió', () => {
  const antes = S().lims.piMin;
  setval('#panes [data-lm="piMin"]', '');
  if (S().lims.piMin !== antes) throw new Error('se escribió ' + S().lims.piMin);
});
step('las guardas del lazo se tocan aquí y van a ST.comp', () => {
  setval('#panes [data-c="dead"]', '0.2');
  if (S().comp.dead !== 0.2) throw new Error('ST.comp.dead = ' + S().comp.dead);
});
step('volver a los de fábrica restaura los ocho', () => {
  click('#panes [data-a="limsdef"]');
  const B = window.BARCOMP;
  if (!B.E.limsAreDefault(S().lims)) throw new Error('los umbrales siguen tocados');
  if (S().comp.dead !== B.E.COMP_DEFAULT.dead) throw new Error('la banda muerta no volvió');
});
step('y el botón queda apagado cuando ya no hay nada que restaurar', () => {
  if (!q('#panes [data-a="limsdef"]').disabled) throw new Error('sigue habilitado');
});
step('un umbral gasta un paso de deshacer y Ctrl+Z lo devuelve', () => {
  setval('#panes [data-lm="straightMin"]', '55');
  if (S().lims.straightMin !== 55) throw new Error('no se escribió');
  hotkey('z', { ctrlKey: true });
  if (S().lims.straightMin === 55) throw new Error('deshacer no lo devolvió');
});
step('los umbrales viajan en el JSON que se guarda', () => {
  const B = window.BARCOMP;
  setval('#panes [data-lm="piMin"]', '3');
  const doc = B.E.toDoc(S().model, S().command, S().comp, S().proc, S().datasets,
                        S().variants, S().ref, S().anchor, { lims: S().lims });
  if (!doc.lims || doc.lims.piMin !== 3) throw new Error('el documento no los lleva');
  click('#panes [data-a="limsdef"]');
});

/* ------------------------------------------------------------- MÁQUINA ----
   El comando que sale a la dobladora. Lo que hay que vigilar es que la vista
   previa sea EXACTAMENTE el archivo: si se dibujara aparte, comprobar unidades
   y signos en pantalla dejaría de valer para nada. */
step('la pestaña Máquina existe y trae la vista previa', () => {
  click('[data-md="model"]');
  click('#tabs [data-t="mach"]');
  if (S().tab !== 'mach') throw new Error('no cambió de pestaña');
  const filas = document.querySelectorAll('#panes table.marks tbody tr').length;
  if (filas < 1) throw new Error('la vista previa está vacía');
});
step('la vista previa es carácter por carácter lo que se exporta', () => {
  const B = window.BARCOMP;
  const tabla = B.E.machineTable(B.commandModel(), S().mach);
  const celdas = [...document.querySelectorAll('#panes table.marks tbody tr')]
    .map(tr => [...tr.children].map(td => td.textContent));
  const cuerpo = S().mach.header ? tabla.slice(1) : tabla;
  for (let i = 0; i < celdas.length; i++) {
    if (celdas[i].join('|') !== cuerpo[i].join('|')) {
      throw new Error(`fila ${i}: «${celdas[i].join('|')}» vs «${cuerpo[i].join('|')}»`);
    }
  }
});
step('marcar una columna la añade en el orden fijo, no al final', () => {
  check('#panes [data-mc="twist"]', true);
  const cols = S().mach.cols.join(',');
  if (!cols.includes('twist')) throw new Error('no entró: ' + cols);
  if (cols.indexOf('twist') < cols.indexOf('radius')) throw new Error('orden: ' + cols);
  check('#panes [data-mc="twist"]', false);
  if (S().mach.cols.includes('twist')) throw new Error('no salió');
});
step('cambiar a pulgadas cambia los números de la vista previa', () => {
  const antes = q('#panes table.marks tbody tr').textContent;
  setval('#panes [data-mf="lenUnit"]', 'in');
  if (S().mach.lenUnit !== 'in') throw new Error('el perfil no cambió');
  if (q('#panes table.marks tbody tr').textContent === antes) {
    throw new Error('la vista previa no se enteró');
  }
  setval('#panes [data-mf="lenUnit"]', 'mm');
});
step('el rodado absoluto y el incremental dan tablas distintas', () => {
  const delta = q('#panes table.marks tbody').textContent;
  setval('#panes [data-mf="rotMode"]', 'abs');
  if (q('#panes table.marks tbody').textContent === delta) {
    throw new Error('elegir el eje absoluto no cambió nada');
  }
  setval('#panes [data-mf="rotMode"]', 'delta');
});
step('la última columna no se puede quitar: sin ninguna no hay archivo', () => {
  const B = window.BARCOMP;
  for (const c of [...S().mach.cols]) check(`#panes [data-mc="${c}"]`, false);
  if (S().mach.cols.length !== 1) {
    throw new Error('quedaron ' + S().mach.cols.length + ' columnas');
  }
  /* Y la casilla vuelve a marcarse sola: el panel no puede enseñar cero
     columnas mientras el archivo sale con una. */
  if (!q(`#panes [data-mc="${S().mach.cols[0]}"]`).checked) {
    throw new Error('la casilla no refleja lo que va a salir');
  }
  click('#panes [data-a="machdef"]');
  if (S().mach.cols.join(',') !== B.E.MACHINE_DEFAULT.cols.join(',')) {
    throw new Error('el perfil de fábrica no volvió');
  }
});
step('el perfil de máquina gasta un paso de deshacer y vuelve', () => {
  setval('#panes [data-mf="decimals"]', '1');
  if (S().mach.decimals !== 1) throw new Error('no se escribió');
  hotkey('z', { ctrlKey: true });
  if (S().mach.decimals === 1) throw new Error('deshacer no lo devolvió');
});
step('exportar el comando no revienta y el botón está en el cajón de archivo', () => {
  click('#panes [data-a="expcmd"]');
  drawer('file');
  click('#lf [data-a="expcmd"]');
});

/* -------------------------------------------------------- ACCESIBILIDAD ---
   Lo que se mide aquí es lo que un lector de pantalla o un ratón impreciso
   encuentran, y son cosas que no se ven mirando la pantalla: el tamaño real
   del blanco de clic y si a una fila se puede llegar sin ratón. Se miden con
   getComputedStyle y con el rectángulo real, no con lo que dice el CSS. */
step('los botones de solo icono miden 24 px o más', () => {
  drawer('models');
  const b = q('#lf .xbtn').getBoundingClientRect();
  if (b.width < 24 || b.height < 24) {
    throw new Error(`${b.width.toFixed(1)}x${b.height.toFixed(1)} px`);
  }
});
step('y llevan rótulo: la ✕ sola no dice nada a un lector de pantalla', () => {
  for (const el of document.querySelectorAll('#lf .xbtn')) {
    if (!el.getAttribute('aria-label')) throw new Error('un botón sin aria-label');
  }
});
step('las filas de capa llegan a 24 px de alto', () => {
  drawer('view');
  const r = q('#lf .layer').getBoundingClientRect();
  if (r.height < 24) throw new Error(r.height.toFixed(1) + ' px');
  drawer('view');
});
step('la fila de desviación se puede enfocar sin ratón', () => {
  click('[data-md="meas"]');
  const fila = q('#side tr[data-r]');
  if (fila.tabIndex !== 0) throw new Error('la fila no es enfocable');
  if (!fila.getAttribute('aria-label')) throw new Error('la fila no se anuncia');
  fila.focus();
  if (document.activeElement !== fila) throw new Error('no tomó el foco');
});
step('Enter sobre la fila selecciona ese doblez', () => {
  const fila = q('#side tr[data-r="2"]');
  fila.focus();
  fila.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  if (S().sel !== 2) throw new Error('sel = ' + S().sel);
  /* y el foco sigue en la fila después de que el panel se reconstruya entero */
  const vivo = document.activeElement;
  if (!vivo || vivo.dataset.r !== '2') throw new Error('el foco se perdió al repintar');
});
step('las flechas suben y bajan por la tabla sin salirse', () => {
  const fila = q('#side tr[data-r="2"]');
  fila.focus();
  fila.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  if (document.activeElement.dataset.r !== '3') {
    throw new Error('bajó a ' + document.activeElement.dataset.r);
  }
  /* En la primera fila, ArrowUp no tiene a dónde ir y el foco se queda: nada
     salta al panel de al lado. */
  const p0 = q('#side tr[data-r="0"]');
  p0.focus();
  p0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  if (document.activeElement !== p0) throw new Error('el foco se escapó de la tabla');
  click('[data-md="model"]');
});

/* --------------------------------------------------------------- AMARRE ---
   Los pines laterales. Lo que hay que vigilar aquí no es que la tabla se
   pinte: es que el interruptor sea de verdad un interruptor —apagado, la pieza
   tiene que ser la misma que antes de que los pines existieran— y que con él
   puesto la forma CAMBIE, porque si no cambia nada el amarre es un adorno. */
step('la pestaña Amarre existe y arranca con el amarre apagado', () => {
  click('[data-md="model"]');
  click('#tabs [data-t="pins"]');
  if (S().tab !== 'pins') throw new Error('no cambió de pestaña');
  if (S().restraint.on) throw new Error('el amarre nace encendido');
  if (!q('#panes [data-rs="on"]')) throw new Error('no está el interruptor');
});
step('sembrar pines los deja tocando la barra', () => {
  click('#panes [data-a="seedpin"]');
  const B = window.BARCOMP;
  if (!S().pins.length) throw new Error('no se sembró ninguno');
  const path = B.placedPath();
  const fits = S().pins.map(p => B.E.pinFit(path, S().model.section, p));
  if (fits.some(f => !f || Math.abs(f.gap) > 1)) {
    throw new Error('algún pin nace sin tocar: ' + fits.map(f => f && f.gap.toFixed(2)).join(' '));
  }
  /* y la capa se enciende sola: sembrar y que el 3D siga igual se lee como que
     no funcionó */
  if (!S().layers.pins.on) throw new Error('la capa de pines sigue apagada');
});
step('con el amarre APAGADO la pieza es exactamente la de antes', () => {
  const B = window.BARCOMP;
  const antes = B.E.fk(S().model).pis.map(p => [p.x, p.y, p.z]);
  const libre = B.shownModel();
  const ahora = B.E.fk(libre).pis.map(p => [p.x, p.y, p.z]);
  const d = Math.max(...antes.map((p, i) => Math.max(
    Math.abs(p[0] - ahora[i][0]), Math.abs(p[1] - ahora[i][1]), Math.abs(p[2] - ahora[i][2]))));
  if (d !== 0) throw new Error('los PI se movieron sin amarre: ' + d);
});
step('encender el amarre enciende sus dos capas', () => {
  check('#panes [data-rs="on"]', true);
  if (!S().restraint.on) throw new Error('no se encendió');
  if (!S().layers.pins.on || !S().layers.held.on) throw new Error('las capas siguen apagadas');
});
step('con la pieza en su sitio los pines no piden nada', () => {
  const B = window.BARCOMP;
  const R = B.heldResult();
  /* recién sembrados están tocando: puede que sujeten, pero no hay nada que
     cerrar, así que la forma no se mueve */
  const d = B.E.fk(R.model).pis.reduce(
    (m, p, i) => Math.max(m, p.distanceTo(B.E.fk(S().model).pis[i])), 0);
  if (d > 1) throw new Error('la forma se movió sin motivo: ' + d.toFixed(2));
});
step('mover un ángulo con la barra sujeta la DEFORMA en vez de moverla libre', () => {
  const B = window.BARCOMP;
  const libreAntes = B.E.fk(S().model).pis;
  click('#tabs [data-t="model"]');
  const celda = q('#panes [data-b="3"][data-k="angle"]');
  celda.focus();
  document.execCommand('selectAll', false, null);
  if (!document.execCommand('insertText', false, String((+celda.value + 2).toFixed(1)))) {
    throw new Error('execCommand insertText no disponible');
  }
  celda.blur();
  click('#tabs [data-t="pins"]');
  const R = B.heldResult();
  if (!R.held.length) throw new Error('ningún pin sujetó tras mover el ángulo');
  const libre = B.E.fk(S().model).pis, sujeta = B.E.fk(R.model).pis;
  const dif = libre[libre.length - 1].distanceTo(sujeta[sujeta.length - 1]);
  if (!(dif > .5)) throw new Error('la barra sujeta acabó donde la libre: ' + dif.toFixed(2));
  if (libreAntes.length !== libre.length) throw new Error('cambió el número de PI');
  /* y la pestaña lo dice con números, no solo por dentro */
  if (!/\d/.test(q('#panes .chip').textContent)) throw new Error('el costo no se enseña');
});
step('la barra sujeta se DIBUJA: la escena crece al encender su capa', () => {
  const B = window.BARCOMP;
  const cuenta = () => { let n = 0; B.scene.traverse(() => n++); return n; };
  S().layers.held.on = false;
  B.rebuildScene();
  const sin = cuenta();
  S().layers.held.on = true;
  B.rebuildScene();
  const con = cuenta();
  if (!(con > sin)) throw new Error(`la capa no dibuja nada: ${sin} -> ${con}`);
  /* y los pines también: son cilindros en el mundo, no en la pieza */
  S().layers.pins.on = false;
  B.rebuildScene();
  const sinPines = cuenta();
  S().layers.pins.on = true;
  B.rebuildScene();
  if (!(cuenta() > sinPines)) throw new Error('los pines no se dibujan');
});
step('apagar el amarre devuelve la pieza libre', () => {
  const B = window.BARCOMP;
  check('#panes [data-rs="on"]', false);
  if (S().held !== null) throw new Error('la caché de la forma sujeta sobrevivió');
  const d = B.E.fk(B.shownModel()).pis.reduce(
    (m, p, i) => Math.max(m, p.distanceTo(B.E.fk(S().model).pis[i])), 0);
  if (d !== 0) throw new Error('sigue enseñando la forma sujeta: ' + d);
});
step('el material no mueve un solo punto, y el aviso lo dice', () => {
  const B = window.BARCOMP;
  check('#panes [data-rs="on"]', true);
  const antes = B.E.fk(B.heldResult().model).pis.map(p => p.clone());
  setval('#panes [data-mt="E"]', '200000');
  if (S().mat.E !== 200000) throw new Error('no se escribió el módulo');
  const d = B.E.fk(B.heldResult().model).pis.reduce((m, p, i) => Math.max(m, p.distanceTo(antes[i])), 0);
  if (d > 1e-9) throw new Error('cambiar E movió la forma: ' + d);
  setval('#panes [data-mt="E"]', '69000');
});
step('la referencia se puede comparar sujeta, no solo libre', () => {
  const B = window.BARCOMP;
  /* De partida se compara contra la LIBRE: las dos referencias coinciden. */
  const dif = () => B.E.fk(B.refModel()).pis.reduce(
    (m, p, i) => Math.max(m, p.distanceTo(B.E.fk(B.refModelFree()).pis[i])), 0);
  click('#panes [data-rh="0"]');
  if (dif() !== 0) throw new Error('con «libre» la referencia no es la libre');
  click('#panes [data-rh="1"]');
  if (!S().restraint.refHeld) throw new Error('no se guardó la elección');
  if (!(dif() > .5)) throw new Error('elegir «sujeta» no cambió la referencia: ' + dif().toFixed(3));
  /* y vuelve, que un interruptor que no vuelve no es un interruptor */
  click('#panes [data-rh="0"]');
  if (S().restraint.refHeld || dif() !== 0) throw new Error('no volvió a la libre');
});
step('con DOS modelos y «sujeta», la referencia se dibuja SUJETA', () => {
  const B = window.BARCOMP;
  /* El fallo que esto vigila: el selector cambiaba con qué se MIDE, pero la
     escena seguía dibujando las otras variantes libres. Se veía la activa
     sujeta y la referencia libre al lado, que es media comparación. */
  drawer('models');
  click('#lf [data-a="vardup"]');
  if (S().variants.length < 2) throw new Error('no se duplicó el modelo');
  drawer('models');
  click('#tabs [data-t="pins"]');
  click('#panes [data-hv="held"]');
  B.rebuildScene();
  if (S().layers.var.on) throw new Error('las otras variantes siguen dibujándose libres');
  /* Y la capa de sujetas tiene que traer UNA por variante visible, no solo la
     activa: el fixture sujeta a la pieza que haya montada, sea cuál sea. */
  const nHeld = B.groups.held.children.length;
  const visibles = S().variants.filter(v => v.visible).length;
  if (nHeld < visibles) {
    throw new Error(`la capa sujeta trae ${nHeld} objetos para ${visibles} variantes`);
  }
  click('#panes [data-hv="both"]');
  B.rebuildScene();
  if (!S().layers.var.on) throw new Error('«las dos» no devolvió las libres');
});
step('se elige qué barra se ve: libre, sujeta o las dos', () => {
  const B = window.BARCOMP;
  click('#panes [data-hv="held"]');
  if (S().layers.nom.on || !S().layers.held.on) throw new Error('«sujeta» no apagó la libre');
  const cuenta = () => { let n = 0; B.scene.traverse(() => n++); return n; };
  const soloSujeta = cuenta();
  click('#panes [data-hv="free"]');
  if (!S().layers.nom.on || S().layers.held.on) throw new Error('«libre» no apagó la sujeta');
  const soloLibre = cuenta();
  click('#panes [data-hv="both"]');
  if (!S().layers.nom.on || !S().layers.held.on) throw new Error('«las dos» no encendió las dos');
  /* Con las dos hay más que dibujar que con la libre sola: la sujeta añade su
     alambre y los segmentos de desplazamiento. Contra «sujeta sola» no vale
     comparar, porque ahí la sujeta pasa a sólida y suma un objeto propio. */
  if (!(cuenta() > soloLibre)) throw new Error('con las dos no hay más que dibujar');
  if (soloSujeta === soloLibre) throw new Error('las dos vistas dibujan lo mismo');
});
step('un pin se puede inclinar y el contacto lo nota', () => {
  const B = window.BARCOMP;
  const id = S().pins[0].id;
  const antes = B.E.pinFit(B.placedPath(), S().model.section, S().pins[0]).gap;
  setval(`#panes [data-pn="${id}"][data-k="tilt"]`, '2');
  if (S().pins[0].tilt !== 2) throw new Error('no se escribió la inclinación');
  const ahora = B.E.pinFit(B.placedPath(), S().model.section, S().pins[0]).gap;
  if (Math.abs(ahora - antes) < .5) {
    throw new Error(`inclinar no cambió el contacto: ${antes.toFixed(2)} -> ${ahora.toFixed(2)}`);
  }
  setval(`#panes [data-pn="${id}"][data-k="tilt"]`, '0');
});
step('el lado del pin es dato del fixture y se puede fijar a mano', () => {
  const id = S().pins[0].id;
  const antes = S().pins[0].side;
  setval(`#panes [data-pns="${id}"]`, '-1');
  if (S().pins[0].side !== -1) throw new Error('no se guardó el lado: ' + S().pins[0].side);
  setval(`#panes [data-pns="${id}"]`, '0');
  if (S().pins[0].side !== 0) throw new Error('no volvió a auto');
  setval(`#panes [data-pns="${id}"]`, String(antes || 1));
});
step('un pin se puede desactivar sin borrarlo', () => {
  const id = S().pins[0].id;
  check(`#panes [data-pnh="${id}"]`, false);
  if (S().pins[0].hold) throw new Error('sigue sujetando');
  if (window.BARCOMP.heldResult().held.includes(0)) throw new Error('el solver lo siguió contando');
  check(`#panes [data-pnh="${id}"]`, true);
});
step('los pines y el amarre entran en el deshacer', () => {
  const n = S().pins.length;
  click('#panes [data-a="addpin"]');
  if (S().pins.length !== n + 1) throw new Error('no se añadió');
  hotkey('z', { ctrlKey: true });
  if (S().pins.length !== n) throw new Error('deshacer no lo quitó: ' + S().pins.length);
});
step('resolver el amarre cuesta menos que repintar la escena', () => {
  const B = window.BARCOMP;
  check('#panes [data-rs="on"]', true);
  /* La cuenta es cara —una trayectoria por incógnita y por iteración— y por eso
     va con caché. Lo que se mide aquí es el caso PEOR: la primera vez, con la
     caché fría. El presupuesto es el mismo que el de la escena, 250 ms: por
     encima de eso, mover un pin se siente pegajoso y habría que resolver en
     diferido en vez de al repintar. */
  S().held = null;
  const t0 = performance.now();
  B.heldResult();
  const ms = performance.now() - t0;
  log.push(`     amarre: ${ms.toFixed(1)} ms · ${S().pins.length} pines · ${S().model.bends.length} dobleces`);
  if (!(ms < 250)) throw new Error('el amarre va a tirones: ' + ms.toFixed(0) + ' ms');
  /* Y la caché tiene que servir de algo: la segunda llamada no vuelve a
     resolver, devuelve lo mismo. */
  const t1 = performance.now();
  const again = B.heldResult();
  if (performance.now() - t1 > ms / 2) throw new Error('la caché no está sirviendo');
  if (again !== S().held) throw new Error('la caché devolvió otra cosa');
});
step('la barra de estado avisa de que la pieza está sujeta', () => {
  check('#panes [data-rs="on"]', true);
  const txt = q('#st').textContent;
  if (!/%/.test(txt)) throw new Error('el estado no dice el esfuerzo: ' + txt);
  /* y desaparece al soltar: un aviso que se queda puesto deja de leerse */
  check('#panes [data-rs="on"]', false);
  const chips = [...document.querySelectorAll('#st .chip')].map(c => c.textContent);
  if (chips.some(c => /%/.test(c))) throw new Error('el aviso sobrevivió al apagado');
  check('#panes [data-rs="on"]', true);
});
step('quitar todos los pines deja el amarre sin nada que sujetar', () => {
  check('#panes [data-rs="on"]', false);
  click('#panes [data-a="clearpin"]');
  if (S().pins.length) throw new Error('quedaron pines');
});

step('modelo nuevo y demo', () => {
  drawer('file'); click('[data-a="new"]'); click('[data-a="demo"]'); });
step('demo limpia las cotas', () => { if (S().marks.length) throw new Error('quedaron cotas'); });

return log.join('\n');
