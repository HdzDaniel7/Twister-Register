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

/* El motivo de `solidBlocker()` como texto, sea cual sea la forma en que lo
   devuelva el bundle que se este midiendo. Hoy devuelve `{code, why}`; hasta el
   2026-09-24 devolvia la frase suelta. El banco se corre A PROPOSITO contra
   builds viejos —es asi como se comprueba que un paso falla ANTES del arreglo—
   y con `bl.code` a secas esa falla decia «undefined / undefined» en vez de
   nombrar el defecto, que es justo lo que la linea FALLA tiene que decir. */
const motivoStp = bl => !bl ? 'null'
  : typeof bl === 'string' ? bl : bl.code + ' / ' + bl.why;

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
/* GUARDA, y de las que no se pueden escribir despues: teclear un RODADO en la
   tabla no puede mover ningun avance ni la cola. El rodado inclina el plano en
   el que se dobla, no cuanto se dobla, asi que no toca el trim y no hay recta
   que recolocar.

   Pasa en las dos versiones a proposito. Hasta el 2026-09-25 `rot` estaba en
   las dos listas de claves de trim y la edicion entraba por el camino caro
   -recalcular `straight + trim + trim` y devolver el mismo avance-; ahora entra
   por el corto. Lo que este paso sujeta es que el resultado sigue siendo el
   mismo, que es la razon entera por la que se pudo quitar. */
step('guarda: teclear un rodado no mueve ningun avance ni la cola', () => {
  click('[data-md="model"]');
  click('#tabs [data-t="model"]');
  const m = S().model;
  const antes = m.bends.map(b => b.feed), colaAntes = m.tail;
  const rotAntes = m.bends[1].rot;
  try {
    setval('#panes input[data-b="1"][data-k="rot"]', String(rotAntes === 90 ? -90 : 90));
    const ahora = S().model;
    const peor = Math.max(...ahora.bends.map((b, i) => Math.abs(b.feed - antes[i])),
                          Math.abs(ahora.tail - colaAntes));
    if (peor !== 0) {
      throw new Error('el rodado movio avances: peor ' + peor.toExponential(3) + ' mm');
    }
    if (ahora.bends[1].rot === rotAntes) throw new Error('el rodado no llego a escribirse');
  } finally {
    setval('#panes input[data-b="1"][data-k="rot"]', String(rotAntes));
  }
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

/* LA FILA TIENE QUE CUADRAR CON Σ L. La Recta va sobre la base y su Δ al lado,
   igual que el angulo y el rodado; con el Δ del AVANCE en esa columna la cuenta
   se iba 0.869 mm por fila en cuanto habia un Δ de angulo. */
step('Recta + su Δ + L es exactamente lo que sube Sigma L', () => {
  const M = S().model, v = S().variants[0], L = Eg().rowLengths(M);
  const rows = document.querySelectorAll('table.lra tbody tr');
  for (let i = 0; i < rows.length; i++) {
    const base = +rows[i].querySelector('input[data-st]').value;
    const d = +rows[i].querySelector('input[data-bd][data-k="straight"]').value;
    const salto = L[i].cum - (i ? L[i - 1].cum : 0);
    near(base + d + L[i].arc, salto, 0.012, 'la fila ' + i + ' no cuadra con Sigma L');
  }
});

/* LA TABLA DE AJUSTES NO SE MUEVE SOLA (2026-09-22, misma tarde). Pedido por el
   taller: «cuando modifico compensaciones de los angulos me modifica
   compensaciones de distancias». Un Δ de angulo le come trim a dos rectas, asi
   que ahora RECOLOCA los Δ de avance para dejarlas quietas, igual que editar el
   angulo en la base. Estos pasos no pueden pasar con el comportamiento
   anterior: entonces el Δ de la recta de B4 se encendia solo y su avance
   quedaba en cero. */
step('  y un Δ de angulo NO mueve el Δ de la Recta', () => {
  /* B4 arrastra un Δ de angulo de 2.5 grados desde el principio del banco */
  const d = +q('input[data-bd="3"][data-k="straight"]').value;
  if (Math.abs(d) > 1e-3) throw new Error('el Δ de la recta se movio solo: ' + d);
  /* y lo paga el avance, que es lo que tiene que moverse */
  const f = S().variants[0].deltas[3].feed;
  if (Math.abs(f) < 0.01) throw new Error('el avance no recogio el trim: ' + f);
});

step('  teclear un Δ de angulo deja quietas las DOS rectas de al lado', () => {
  const v = S().variants[0];
  const dstr = i => +q('input[data-bd="' + i + '"][data-k="straight"]').value;
  const base = i => +q('input[data-st="' + i + '"]').value;
  const b6 = base(6), b7 = base(7), arco = celda(6, 'arc');
  setval('input[data-bd="6"][data-k="angle"]', '2');
  if (Math.abs(dstr(6)) > 1e-3 || Math.abs(dstr(7)) > 1e-3) {
    throw new Error('el Δ de la recta se encendio solo: ' + dstr(6) + ' y ' + dstr(7));
  }
  near(base(6), b6, 1e-6, 'la recta de la base se movio');
  near(base(7), b7, 1e-6, 'la recta de la base de al lado se movio');
  if (Math.abs(v.deltas[6].feed) < 0.01) throw new Error('el avance no se movio');
  /* y la pieza SI cambia: el doblez de verdad se lleva mas barra */
  if (!(celda(6, 'arc') > arco + 0.1)) throw new Error('el arco no crecio');
  setval('input[data-bd="6"][data-k="angle"]', '0');
  near(v.deltas[6].feed, 0, 1e-9, 'el avance no volvio a cero');
});

step('  y un Δ de RECTA ya tecleado sobrevive a corregir el angulo', () => {
  setval('input[data-bd="6"][data-k="straight"]', '1.2');
  setval('input[data-bd="6"][data-k="angle"]', '2');
  const d = +q('input[data-bd="6"][data-k="straight"]').value;
  near(d, 1.2, 1e-3, 'el ajuste tecleado se perdio');
  setval('input[data-bd="6"][data-k="angle"]', '0');
  setval('input[data-bd="6"][data-k="straight"]', '0');
  near(S().variants[0].deltas[6].feed, 0, 1e-9, 'quedo avance colgando');
});

/* LA OTRA MITAD. editBend() ya dejaba quietas las rectas de la BASE, pero el Δ
   de avance es un desplazamiento fijo y los trims con que se descuenta cambian
   con el angulo de la base: la recta de la PIEZA se movia igual. Con solo la
   mitad del arreglo esto dejaba un residuo de 0.0026 mm, que es poco pero
   enciende la celda. */
step('  ni tecleando el angulo en la BASE con un Δ puesto', () => {
  const v = S().variants[0];
  const dstr = i => +q('input[data-bd="' + i + '"][data-k="straight"]').value;
  setval('input[data-bd="6"][data-k="angle"]', '2');
  const campo = q('input[data-b="6"][data-k="angle"]');
  const ang0 = +campo.value;
  setval('input[data-b="6"][data-k="angle"]', String(ang0 + 5));
  if (Math.abs(dstr(6)) > 1e-3 || Math.abs(dstr(7)) > 1e-3) {
    throw new Error('el Δ de la recta se movio con el angulo de la base: '
                    + dstr(6) + ' y ' + dstr(7));
  }
  near(Eg().straightOf(v.base, 6), Eg().rowLengths(S().model)[6].straight, 1e-6,
       'base y pieza dejaron de coincidir');
  setval('input[data-b="6"][data-k="angle"]', String(ang0));
  setval('input[data-bd="6"][data-k="angle"]', '0');
  near(v.deltas[6].feed, 0, 1e-9, 'quedo avance colgando');
});

/* El rojo mira la recta EFECTIVA, que es la que hay que fabricar y la misma que
   juzga feasNote(). Desde que un Δ de angulo deja las rectas quietas, la unica
   forma de acortar una recta desde la columna de Δ es tecleando un Δ de RECTA:
   el campo sigue enseñando la base, 47.87, y aun asi tiene que ponerse rojo. */
step('el rojo de la Recta mira la recta de la PIEZA, no la de la base', () => {
  const v = S().variants[0];
  const campo = () => q('input[data-st="4"]');
  if (campo().classList.contains('v-bad')) throw new Error('ya nacia en rojo');
  setval('input[data-bd="4"][data-k="straight"]', '-26');
  const real = Eg().rowLengths(S().model)[4].straight;
  if (!(real < 25)) throw new Error('la recta efectiva no bajo de 25: ' + real.toFixed(2));
  near(+campo().value, Eg().straightOf(v.base, 4), 0.006, 'el campo dejo de enseñar la base');
  if (!campo().classList.contains('v-bad')) {
    throw new Error('recta efectiva ' + real.toFixed(2) + ' mm y el campo no esta en rojo');
  }
  setval('input[data-bd="4"][data-k="straight"]', '0');
  if (campo().classList.contains('v-bad')) throw new Error('se quedo en rojo');
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

/* EL UMBRAL DE TUBO EN UN RECTANGULAR HUECO.

   `lims.tubeRfac` es una cifra que teclea el taller y que nace en 0 -no
   vigiles-. Hasta el 2026-09-25 solo se aplicaba a tubo REDONDO: un tubo
   rectangular no se juzgaba ni con la cifra puesta, porque la condicion pedia
   `kind === 'round'`. Lo que no significa nada en un rectangular es el
   DIAMETRO, no la regla: lo que manda es la medida que queda en el plano de
   doblado, o sea el espesor en un doblez de plano y el ancho en uno de canto.

   Con 40 x 20 de pared 2 y el factor en 1.5, un doblez de plano pide R30 y uno
   de canto R60: el MISMO factor da dos radios, y por eso el aviso puede traer
   las dos cifras. Aqui se mide sobre el modelo de verdad del visor, no sobre
   uno de laboratorio: se le cambia la seccion a la demo y se devuelve al salir. */
step('un tubo RECTANGULAR tambien se juzga con el umbral de tubo', () => {
  const B = window.BARCOMP;
  click('[data-md="model"]');
  click('#tabs [data-t="model"]');
  const m = S().model;
  const secAntes = { ...m.section }, facAntes = S().lims.tubeRfac;
  const radios = m.bends.map(b => b.radius);
  try {
    m.section = { ...m.section, kind: 'rect', width: 40, thickness: 20, wall: 2 };
    S().lims.tubeRfac = 1.5;
    /* radios a proposito por debajo de lo que pide cada orientacion */
    m.bends.forEach(b => { b.radius = 10; });
    B.renderAll();
    const f = B.E.feasibility(S().model, S().lims);
    if (!f.tightTube.length) {
      const ori = B.E.orientations(S().model);
      throw new Error('con R10 en todos los dobleces de un tubo 40x20 pared 2 y factor 1.5'
        + ' -que pide R30 de plano y R60 de canto- no marco ninguno;'
        + ' orientaciones ' + ori.join('') + ', marcados ' + f.tightTube.length);
    }
    if (f.tightTube.length !== S().model.bends.length) {
      throw new Error('marco ' + f.tightTube.length + ' de ' + S().model.bends.length
        + ', y con R10 no llega ninguno');
    }
    const w = document.querySelector('#fabnote .warnbox');
    if (!w) throw new Error('el motor marca ' + f.tightTube.length + ' dobleces y la pestana no avisa');
    if (!/30\.0/.test(w.textContent) || !/60\.0/.test(w.textContent)) {
      throw new Error('el aviso no trae los dos radios pedidos: ' + w.textContent);
    }
  } finally {
    m.section = secAntes;
    S().lims.tubeRfac = facAntes;
    m.bends.forEach((b, i) => { b.radius = radios[i]; });
    B.renderAll();
  }
});
/* GUARDA: el umbral en 0 -como nace- no juzga nada, ni redondo ni rectangular.
   Pasa en las dos versiones; lo que sujeta es que extender la regla no encendio
   un aviso de fabrica, que seria darle cara de dato a una opinion. */
step('guarda: con el umbral de tubo en 0 no se marca ningun radio', () => {
  const B = window.BARCOMP;
  if (S().lims.tubeRfac !== 0) throw new Error('el banco no dejo el umbral en 0');
  if (B.E.LIMS_DEFAULT.tubeRfac !== 0) throw new Error('el umbral de fabrica dejo de ser 0');
  if (B.E.feasibility(S().model, S().lims).tightTube.length) {
    throw new Error('marca radios de tubo con el umbral apagado');
  }
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

/* LA COLA SE TECLEA DE TANGENCIA A TANGENCIA, EN EL PIE (2026-09-22). Hasta ese
   dia se tecleaba de PI a PI en la cabecera de la seccion, asi que la palabra
   «Cola» nombraba dos numeros: el campo decia 160.00 y el pie 154.66. Estos
   pasos no pueden pasar sin el arreglo: el primero porque en el pie no habia
   campo, y el segundo porque la suma se iba 5.34 mm. */
step('la cola se teclea en el pie, bajo la columna Recta', () => {
  const v = S().variants[0];
  const campo = q('[data-cell="tstr"] input');
  if (campo.dataset.m !== 'tail') throw new Error('el campo del pie no es la cola');
  near(+campo.value, Eg().tailStraight(v.base), 0.006, 'cola de la base');
  /* y la celda de al lado es su Δ, que es lo unico que la separa de la pieza */
  near(+q('[data-cell="tdlt"]').textContent, Eg().tailStraightDelta(v.base, S().model),
       0.006, 'Δ de la cola');
  near(+q('[data-cell="dev"]').textContent, Eg().developedLength(S().model), 0.006, 'desarrollada');
});

step('  Sigma L del ultimo + la cola tecleada = la desarrollada', () => {
  const M = S().model, L = Eg().rowLengths(M);
  const cola = +q('input[data-m="tail"]').value;
  const dt = +q('[data-cell="tdlt"]').textContent;
  const suma = L[L.length - 1].cum + cola + dt;
  near(suma, Eg().developedLength(M), 0.02, 'la columna Sigma L no cierra');
});

step('  y teclear la cola deja la RECTA pedida, no el PI a PI', () => {
  const v = S().variants[0], antes = +q('input[data-m="tail"]').value;
  setval('input[data-m="tail"]', '150');
  near(Eg().tailStraight(v.base), 150, 1e-6, 'recta de salida');
  if (Math.abs(v.base.tail - 150) < 1e-6) throw new Error('guardo la recta como PI a PI');
  setval('input[data-m="tail"]', String(antes));
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
  const a = q('input[data-bd="1"][data-k="straight"]');
  typeIn(a, '1.5');
  key(a, 'Enter');
  const act = document.activeElement;
  if (act.dataset.bd !== '2') throw new Error('quedo en ' + act.dataset.bd);
  near(Eg().straightDelta(S().variants[0].base, S().model, 1), 1.5, 1e-9, 'delta confirmado');
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

/* EL Δ DE LA COLUMNA «RECTA» ES UN Δ DE RECTA (2026-09-22). B4 lleva un Δ de
   angulo de 2.5 grados desde el principio del banco, y un Δ de angulo mueve la
   recta sin tocar ningun avance: hasta ese dia la columna enseñaba el Δ del
   AVANCE, marcaba cero, y Σ L subia menos de lo que sumaba la fila. */
step('el Δ de la Recta se teclea en mm de RECTA, no de avance', () => {
  const v = S().variants[0], antes = celda(3, 'cum');
  /* B4 arrastra un Δ de angulo de 2.5 grados, pero ya NO arrastra Δ de recta:
     el avance se recoloco para dejarla quieta. Asi que lo que sube Sigma L es
     el 0.8 entero, y el avance guardado sale 0.8 sobre el trim que ya recogia. */
  const f0 = v.deltas[3].feed;
  near(Eg().straightDelta(v.base, S().model, 3), 0, 1e-9, 'B4 nacia con Δ de recta');
  setval('input[data-bd="3"][data-k="straight"]', '0.8');
  near(Eg().straightDelta(v.base, S().model, 3), 0.8, 1e-9, 'Δ de recta');
  near(celda(3, 'cum'), antes + 0.8, 0.01, 'Sigma L recoge el delta');
  near(v.deltas[3].feed, f0 + 0.8, 1e-6, 'el avance no recogio la recta tecleada');
  setval('input[data-bd="3"][data-k="straight"]', '0');
  near(v.deltas[3].feed, f0, 1e-9, 'el avance no volvio a lo que era');
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

/* Reportado desde el taller el 2026-09-21: «los ejes no me coinciden con la
   pieza». Era literal. El indicador prometia «x el eje de la barra, y el
   espesor, z el ancho» —los ejes de la SECCION— y pintaba el marco del MODELO,
   que es la estacion 0. En la demo el eje de la barra en la punta forma 175.5
   grados con el x del modelo, asi que la flecha apuntaba casi al reves que la
   barra que se estaba mirando.

   Estos tres pasos no se pueden pasar sin el arreglo: antes, elegir un doblez
   no movia el indicador ni un pixel, y el widget no decia de donde era el
   marco. */
step('el indicador de ejes es el del doblez elegido, no el del origen', () => {
  const pos = () => {
    window.BARCOMP.drawGizmo();
    return [...q('#gizmo svg').querySelectorAll('circle')]
      .map(c => c.getAttribute('cx') + ',' + c.getAttribute('cy')).join('|');
  };
  const sel = (i) => { window.BARCOMP.ST.sel = i; window.BARCOMP.rebuildScene(); };
  sel(-1);
  const amarre = pos();
  sel(S().model.bends.length - 1);
  if (pos() === amarre) throw new Error('el ultimo doblez pinta lo mismo que el amarre: ' + amarre);
  sel(-1);
  if (pos() !== amarre) throw new Error('volver a ninguno no devuelve el marco del amarre');
});
step('  y dice de que estacion es el marco, que era la mitad del fallo', () => {
  const titulo = () => { window.BARCOMP.drawGizmo(); return q('#gizmo svg title').textContent; };
  const sel = (i) => { window.BARCOMP.ST.sel = i; window.BARCOMP.rebuildScene(); };
  sel(-1);
  const a = titulo();
  if (!a) throw new Error('sin rotulo');
  sel(4);
  const b = titulo();
  if (b === a) throw new Error('el rotulo no cambia al elegir un doblez: ' + b);
  if (!b.includes('5')) throw new Error('no nombra el doblez 5: ' + b);
  sel(-1);
});
step('  y con la pieza girada el marco gira con ella, no contra ella', () => {
  drawer('view');
  const ejeX = () => {
    window.BARCOMP.drawGizmo();
    /* el brazo X: el circulo que lleva el texto X, en el mismo orden de pintado */
    const g = q('#gizmo svg');
    const t = [...g.querySelectorAll('text')].findIndex(e => e.textContent === 'X');
    const c = g.querySelectorAll('circle')[t];
    return [+c.getAttribute('cx'), +c.getAttribute('cy')];
  };
  const a = ejeX();
  setval('input[data-pl="rz"]', '90');
  const b = ejeX();
  /* girar 90 grados la colocacion tiene que mover el brazo X de sitio */
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) throw new Error('el brazo X no se movio');
  click('[data-a="placereset"]');
});

step('duplicar modelo', () => { drawer('models'); click('[data-a="vardup"]'); });
step('hay dos modelos', () => { if (S().variants.length !== 2) throw new Error(S().variants.length); });
/* Con un CLIC de verdad, no con el `check()` de aquí arriba: `check()` dispara
   el `change` a mano y se salta el `click`, que es justo por donde se rompía.
   Un clic en la casilla llegaba a la tarjeta, la tarjeta activaba el modelo,
   activar repintaba el cajón y el `change` —que llega DESPUÉS del `click`—
   caía sobre una casilla ya arrancada del documento: el interruptor volvía
   solo a su sitio y no se podía ocultar ningún modelo desde el cajón. */
step('la casilla de ver oculta el modelo con un clic de verdad', () => {
  drawer('models');
  const id = S().variants[0].id;
  const antes = S().variants[0].visible;
  click(`#lf input[data-vv="${id}"]`);
  const ahora = S().variants.find(v => v.id === id).visible;
  if (ahora === antes) throw new Error('visible sigue ' + ahora);
  drawer('models');
  const cb = q(`#lf input[data-vv="${id}"]`);
  if (cb.checked !== ahora) throw new Error('la casilla repintada dice ' + cb.checked);
  click(`#lf input[data-vv="${id}"]`);
  if (S().variants.find(v => v.id === id).visible !== antes) throw new Error('no vuelve');
});
step('la casilla de ver NO cambia de modelo activo', () => {
  drawer('models');
  const otro = S().variants[1].id;
  click(`[data-vsel="${S().variants[0].id}"]`);
  const antes = S().active;
  drawer('models');
  click(`#lf input[data-vv="${otro}"]`);
  if (S().active !== antes) throw new Error('el clic en ver activó ' + S().active);
  drawer('models');
  click(`#lf input[data-vv="${otro}"]`);
});
step('el color del modelo tampoco cambia el modelo activo', () => {
  drawer('models');
  const otro = S().variants[1].id;
  click(`[data-vsel="${S().variants[0].id}"]`);   // activo = el PRIMERO, a propósito
  const antes = S().active;
  if (antes === otro) throw new Error('no se pudo activar el primero');
  drawer('models');
  click(`#lf input[data-vc="${otro}"]`);
  if (S().active !== antes) throw new Error('el clic en el color activó ' + S().active);
});
step('la casilla de ver de una pieza medida aguanta el clic', () => {
  if (!S().datasets.length) return;
  drawer('pieces');
  const id = S().datasets[0].id;
  const antes = S().datasets[0].visible;
  click(`#lf input[data-dv="${id}"]`);
  if (S().datasets.find(d => d.id === id).visible === antes) throw new Error('no cambió');
  drawer('pieces');
  click(`#lf input[data-dv="${id}"]`);
});
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
/* La torsión viaja DENTRO de los puntos: rueda el marco, y el rodado de la
   estación siguiente se lee ya girado. Mover un PI replantea la cadena entera
   por inversa, así que si la inversa no sabe de la torsión, la vuelve a pegar
   encima y un toque que no cambia nada mueve la pieza. En el motor eran 137.8
   mm; aquí se comprueba por donde se toca de verdad. */
step('con torsión puesta, reescribir un PI con su valor no mueve la pieza', () => {
  click('#tabs [data-t="model"]');
  const tw0 = q('input[data-b="1"][data-k="twist"]').value;
  try {
    setval('input[data-b="1"][data-k="twist"]', '12');
    click('#tabs [data-t="points"]');
    const antes = window.BARCOMP.E.fk(S().model).pis.map(p => p.clone());
    setval('input[data-p="4"][data-k="z"]', q('input[data-p="4"][data-k="z"]').value);
    const peor = window.BARCOMP.E.fk(S().model).pis
      .reduce((m, p, i) => Math.max(m, p.distanceTo(antes[i])), 0);
    if (peor > 0.5) throw new Error('la pieza se movió ' + peor.toFixed(1) + ' mm');
  } finally {
    click('#tabs [data-t="model"]');
    setval('input[data-b="1"][data-k="twist"]', tw0);
    click('#tabs [data-t="points"]');
  }
});
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
step('el color de una cota se guarda', () => {
  /* ARQ-02: este campo compartía `data-mc` con las columnas de máquina, el
     manejador de máquina se lo quedaba antes y lo tiraba. Ninguna prueba lo
     tocaba, así que estuvo muerto sin que nada fallara. */
  const mk = S().marks.find(m => m.id === 'mk1');
  const antes = mk.color;
  setval('input[data-mkc="mk1"]', '#12ab34');
  if (S().marks.find(m => m.id === 'mk1').color !== '#12ab34') {
    throw new Error('el color no llegó a la cota: ' + S().marks.find(m => m.id === 'mk1').color);
  }
  setval('input[data-mkc="mk1"]', antes);
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
  /* el ancho se mudó a su pestaña el 2026-09-18; el guardia es el mismo */
  click('#tabs [data-t="section"]');
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
  click('#tabs [data-t="model"]');
});

/* LA FIBRA NEUTRA (2026-09-22). Hasta ese dia las longitudes de la tabla se
   contaban sobre el CENTRO de la seccion, o sea con K = 0.5 clavado y sin
   decirlo. Al doblar, la fibra que ni se estira ni se recalca se corre hacia
   dentro: cortar por el centro es cortar de mas, y en el demo son 36.44 mm.
   Ninguno de estos pasos puede pasar contra el HEAD anterior. */
step('la pestana de la seccion dice de donde sale la fibra neutra', () => {
  click('#tabs [data-t="section"]');
  const centro = q('#panes [data-km="center"]');
  if (!centro.classList.contains('on')) throw new Error('no arranca en el centro');
  if (S().model.section.kMode !== 'center') throw new Error(S().model.section.kMode);
  /* y la longitud de CORTE, que con la fibra en el centro es la de siempre */
  const corte = parseFloat(q('#panes [data-cell="cutlen"]').textContent);
  near(corte, Eg().developedLength(S().model), 0.06, 'longitud de corte');
});

step('  DIN 6935 acorta la barra de corte, y el campo lo dice', () => {
  /* La cifra exacta del demo virgen —36.436 mm— vive en la prueba de motor.
     La pieza del banco arrastra deltas de pasos anteriores, asi que aqui lo
     que se comprueba es que el campo y el motor digan lo MISMO, y que la
     diferencia sea de decenas de milimetros y no de decimas. */
  const antes = parseFloat(q('#panes [data-cell="cutlen"]').textContent);
  click('#panes [data-km="din"]');
  if (S().model.section.kMode !== 'din') throw new Error('no cambio de modo');
  const M = S().model, ahorro = Eg().fibreSaving(M);
  if (!(ahorro < -30)) throw new Error('la fibra apenas se movio: ' + ahorro.toFixed(3));
  const ahora = parseFloat(q('#panes [data-cell="cutlen"]').textContent);
  near(ahora - antes, ahorro, 0.06, 'lo que baja el campo');
  near(ahora, Eg().cutLength(M), 0.06, 'la longitud de corte pintada');
});

step('  y avisa de las filas donde la DIN no vale', () => {
  /* las de canto, r/t por debajo del 0.65 donde acaba la norma, y son las que
     mas barra se comen: sin el aviso seria un numero sin su letra pequena */
  const fuera = Eg().fibreInfo(S().model).filter(f => f.rt < 0.65).length;
  if (!fuera) throw new Error('el demo ya no tiene ninguna fila fuera de rango');
  const aviso = [...document.querySelectorAll('#panes .warnbox')]
    .find(w => /0\.65/.test(w.textContent));
  if (!aviso) throw new Error('no avisa de que la DIN no cubre ese r/t');
  if (!aviso.textContent.includes(' ' + fuera + ' ')) {
    throw new Error('el aviso no dice cuantas filas son (' + fuera + '): ' + aviso.textContent);
  }
});

step('la fibra mueve Sigma L y NO mueve la cinta de abajo', () => {
  /* Las dos longitudes se separan aqui, y es el punto entero del cambio: la
     tabla cuenta BARRA y la cinta mide sobre la pieza ya doblada. */
  click('#tabs [data-t="model"]');
  const M = S().model, n = M.bends.length - 1;
  near(celda(n, 'cum'), Eg().fibreLengths(M)[n].cum, 0.02, 'Sigma L en barra');
  near(+q('[data-cell="dev"]').textContent, Eg().cutLength(M), 0.02, 'el pie');
  if (Math.abs(celda(n, 'cum') - Eg().rowLengths(M)[n].cum) < 20) {
    throw new Error('Sigma L sigue contando por el centro');
  }
  /* y la cinta, que es geometria, no se ha enterado */
  const est = Eg().bendStations(M);
  near(est[n], Eg().rowLengths(M)[n].cum - Eg().rowLengths(M)[n].arc / 2, 1e-6, 'la cinta');
});

step('  una K fija por encima del centro se topa en 0.5', () => {
  click('#tabs [data-t="section"]');
  click('#panes [data-km="fixed"]');
  setval('#panes input[data-s="kFactor"]', '0.9');
  if (S().model.section.kFactor !== 0.5) {
    throw new Error('entro una K de ' + S().model.section.kFactor);
  }
  near(Eg().fibreSaving(S().model), 0, 1e-9, 'con K 0.5 no se ahorra nada');
  /* y se deja como estaba: el resto del banco cuenta por el centro */
  click('#panes [data-km="center"]');
  if (S().model.section.kMode !== 'center') throw new Error('no volvio al centro');
  click('#tabs [data-t="model"]');
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
/* Ctrl+Z desde DENTRO de un campo con texto sin confirmar. Lo que se deshace es
   la edición confirmada, no lo que se está tecleando (ver bindKeyboard()), y el
   fallo era que el texto a medio escribir se confirmaba solo DESPUÉS de
   restaurar: el repintado arrancaba el campo, el `blur` disparaba el `change` y
   ese `change` apilaba un documento híbrido y vaciaba el rehacer. Sin un solo
   error en consola. Se prueba en los dos sitios donde hay campos: el cajón, que
   es donde se reprodujo, y la tabla de abajo, que tenía el mismo camino. */
function deshacerAMedias(sel, leer, confirmado) {
  const antes = leer();
  const x = q(sel);
  typeIn(x, String(confirmado));
  x.blur();                                   // esto sí es un paso de deshacer
  if (Math.abs(leer() - confirmado) > 1e-9) throw new Error('no se confirmó: ' + leer());
  const hondo = S().hist.undo;
  const vivo = q(sel);
  typeIn(vivo, '999');                        // y esto no: sigue sin confirmar
  key(vivo, 'z', { ctrlKey: true });
  if (Math.abs(leer() - antes) > 1e-9) {
    throw new Error(`Ctrl+Z dejó ${leer()} y tenía que volver a ${antes}`);
  }
  if (S().hist.undo !== hondo - 1) throw new Error(`la pila de deshacer no bajó: ${hondo} -> ${S().hist.undo}`);
  if (S().hist.redo !== 1) throw new Error('el rehacer quedó en ' + S().hist.redo + ' y debía ser 1');
  const visto = parseFloat(q(sel).value);
  if (Math.abs(visto - antes) > 1e-9) throw new Error('el valor volvió pero el campo enseña ' + q(sel).value);
  hotkey('y', { ctrlKey: true });
  if (Math.abs(leer() - confirmado) > 1e-9) throw new Error('Ctrl+Y no repuso lo confirmado: ' + leer());
  /* se vuelve con un paso NUEVO y no con otro Ctrl+Z: el paso siguiente rehace
     hasta la punta, y dejar el rehacer lleno le haría reponer el +confirmado */
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  setval(sel, String(antes));
  if (Math.abs(leer() - antes) > 1e-9) throw new Error('no se pudo dejar como estaba: ' + leer());
}
step('Ctrl+Z con un campo del cajón a medio escribir deshace lo confirmado y no vacía el rehacer', () => {
  drawer('view');
  deshacerAMedias('#lf input[data-pl="x"]', () => S().place.x, S().place.x + 77);
});
step('Ctrl+Z con una celda de la tabla a medio escribir hace lo mismo', () => {
  click('[data-md="model"]');
  click('#tabs [data-t="model"]');
  deshacerAMedias('#panes input[data-b="4"][data-k="radius"]',
                  () => S().model.bends[4].radius, S().model.bends[4].radius + 3);
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
/* A1-bis. LOOP_MIN_N está en el motor desde la Fase 0 y hasta ahora no lo leía
   nadie: se podía aplicar el lazo con UNA pieza, que es perseguir la dispersión
   de esa pieza. El botón se apaga, dice por qué, y la guarda de verdad vive en
   la acción: un panel es una opinión, no la puerta. */
step('con menos de LOOP_MIN_N piezas en el lazo, Aplicar está apagado', () => {
  check('input[data-c="batch"]', false);   // el lazo vuelve a leer la pieza activa y nada más
  const b = q('[data-a="apply"]');
  if (!b.disabled) throw new Error('el botón sigue activo con una sola pieza en el lazo');
  if (!b.title) throw new Error('no dice por qué está apagado');
  const av = [...document.querySelectorAll('#panes .warnbox')].map(x => x.textContent).join(' ');
  if (!av.includes(String(window.BARCOMP.E.LOOP_MIN_N))) {
    throw new Error('no dice cuántas piezas hacen falta: ' + av);
  }
});
step('y aplicar de todas formas no toca el comando', () => {
  const antes = JSON.stringify(S().command);
  click('[data-a="apply"]');
  if (JSON.stringify(S().command) !== antes) {
    throw new Error('el comando cambió compensando desde una sola pieza');
  }
});
step('con el lote puesto y suficientes piezas visibles, Aplicar vuelve', () => {
  for (const d of S().datasets) d.visible = true;
  /* el lazo pide tres y el banco llega aquí con dos: se simulan las que falten,
     que es el camino que de verdad usa el taller para llenar el lote */
  drawer('pieces');
  for (let i = 0; S().datasets.filter(d => d.visible).length < window.BARCOMP.E.LOOP_MIN_N && i < 5; i++) {
    click('[data-a="sim"]');
  }
  if (S().drawer === 'pieces') click('[data-dr="pieces"]');   // y se cierra el cajón
  check('input[data-c="batch"]', true);
  const vis = S().datasets.filter(d => d.visible).length;
  if (vis < window.BARCOMP.E.LOOP_MIN_N) throw new Error('solo hay ' + vis + ' piezas visibles');
  const b = q('[data-a="apply"]');
  if (b.disabled) throw new Error('sigue apagado con ' + vis + ' piezas en el lazo');
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
step('subir un pedestal 5 mm lo mete en la barra y lo pinta en rojo', () => {
  /* Sin redondear a centésimas, ni al subirlo ni al devolverlo: el alto sembrado
     lleva todos sus decimales desde FIS-10 —el muelle de contacto vale unos 6 N
     por micra— y recortarlo aquí dejaría el pedestal precargado para los pasos
     que vienen detrás. */
  const p = S().fixture[2], antes = p.h;
  setval(`#panes [data-pd="${p.id}"][data-k="h"]`, String(antes + 5));
  if (Math.abs(S().fixture[2].h - (antes + 5)) > 1e-6) throw new Error('no tomó la altura');
  const fila = q(`#panes [data-pd="${p.id}"][data-k="h"]`).closest('tr');
  const rojo = fila.querySelector('.v-bad');
  if (!rojo) throw new Error('el pedestal que estorba no se marca');
  /* CINCO MILÍMETROS DE PEDESTAL NO SON CINCO DE HUECO, y este paso pedía −5
     hasta el 2026-09-18. El hueco se mide contra la CARA de la cuna, o sea
     sobre su normal, y subir el pie en vertical la mueve menos que eso sobre
     esa normal: aquí salen −4.95. La ley —`−δ·cos(tilt)` exacta— está clavada
     en `test_motor.js` sobre una rampa recta, que es donde el rumbo de la cuna
     no se mueve al subir el pie y el coseno sale limpio. Lo que toca comprobar
     AQUÍ es lo otro: que la tabla enseñe el número que el motor calcula —no un
     texto suyo— y que lo enseñe en rojo. */
  const B = window.BARCOMP;
  const real = B.E.pedestalFit(B.placedPath(), S().model.section, S().fixture[2]).gap;
  if (!(real < -4 && real > -5.0001)) {
    throw new Error('subir 5 mm no metió el pedestal 5: hueco ' + real.toFixed(3));
  }
  if (!rojo.textContent.includes(real.toFixed(2))) {
    throw new Error(`la tabla dice «${rojo.textContent}» y el motor ${real.toFixed(2)}`);
  }
  /* WCAG 1.4.1: fuera de tolerancia no puede decirse SOLO con el color. Una de
     cada doce personas no distingue el rojo del verde, y la tabla se fotocopia
     en blanco y negro para llevarla a la máquina. */
  const signo = getComputedStyle(rojo, '::after').content;
  if (!/!!/.test(signo)) throw new Error('la celda fuera de tolerancia solo se marca con color: ' + signo);
  setval(`#panes [data-pd="${p.id}"][data-k="h"]`, String(antes));
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
/* EL RUMBO DE LA CUNA. Pedido por el taller el 2026-09-21: «no se movieran
   para forzar que coincidan girando contra mi pieza». Hasta ese dia la cuna se
   apuntaba sola a la barra en cada repintado, asi que no habia campo que
   teclear y era IMPOSIBLE ver una cuna cruzada. Estos pasos no pueden pasar sin
   el arreglo: el primero porque el campo no existia, el segundo porque girar la
   chapa no cambiaba nada. */
step('la cuna tiene rumbo, y es un campo que se teclea', () => {
  const p = S().fixture[2];
  const campo = q(`#panes [data-pd="${p.id}"][data-k="yaw"]`);
  if (!campo) throw new Error('no hay campo de rumbo en la tabla del fixture');
  if (typeof p.yaw !== 'number' || !isFinite(p.yaw)) throw new Error('rumbo = ' + p.yaw);
});
step('  y sembrar lo deja apuntando a la barra, no a cero', () => {
  const B = window.BARCOMP;
  /* la demo va girando: si los siete rumbos fueran cero, seria que no se
     siembra nada */
  const yaws = S().fixture.map(f => f.yaw);
  if (!yaws.some(v => Math.abs(v) > 1)) throw new Error('todos a cero: ' + yaws.join(' '));
  /* El margen es de centesimas y no de cero: el rumbo se escribe redondeado a
     dos decimales, que es una cifra de taller, igual que la inclinacion. */
  const path = B.placedPath();
  const peor = Math.max(...S().fixture.map(f =>
    Math.abs(B.E.pedestalFit(path, S().model.section, f).dYaw)));
  if (peor > 0.1) throw new Error('nacen cruzados: peor ' + peor.toFixed(3) + ' grados');
});
step('  girar la cuna 90 grados la deja cruzada Y SE QUEDA ASI', () => {
  const B = window.BARCOMP;
  const p = S().fixture[2], antes = p.yaw;
  setval(`#panes [data-pd="${p.id}"][data-k="yaw"]`, (antes + 90).toFixed(2));
  const ahora = S().fixture[2].yaw;
  if (Math.abs(ahora - (antes + 90)) > 0.01) {
    throw new Error('el rumbo tecleado no se guardo: ' + ahora);
  }
  /* LO QUE ESTE PASO VIGILA de verdad: que la cuna NO se haya vuelto a apuntar
     sola a la barra, que es lo que hacia hasta el 2026-09-21. */
  const f = B.E.pedestalFit(B.placedPath(), S().model.section, S().fixture[2]);
  if (Math.abs(Math.abs(f.dYaw) - 90) > 0.2) {
    throw new Error('la cuna se reapunto sola: delta de rumbo ' + f.dYaw.toFixed(3));
  }
  /* Y cruzada SIGUE tocando, porque una chapa de 60x44 es casi cuadrada: lo que
     cambia es que la barra se va 30 mm del eje de la cuna sobre 22 de media
     anchura, o sea que se sale por el costado. Eso lo dice la celda en rojo, no
     un aviso de que no pasa por encima. */
  const fila = q(`#panes [data-pd="${p.id}"][data-k="yaw"]`).closest('tr');
  const roja = [...fila.querySelectorAll('td')]
    .find(td => /v-bad/.test(td.className) && /30[.,]0/.test(td.title || ''));
  if (!roja) {
    throw new Error('cruzada 90 grados y ninguna celda dice que se sale: '
      + [...fila.querySelectorAll('td')].map(td => td.title || '').join(' | ').slice(0, 300));
  }
  setval(`#panes [data-pd="${p.id}"][data-k="yaw"]`, antes.toFixed(2));
});
step('  y media vuelta es la misma chapa: no se queja de 180 grados', () => {
  const B = window.BARCOMP;
  const p = S().fixture[2], antes = p.yaw;
  setval(`#panes [data-pd="${p.id}"][data-k="yaw"]`, (antes + 180).toFixed(2));
  const f = B.E.pedestalFit(B.placedPath(), S().model.section, S().fixture[2]);
  if (Math.abs(f.dYaw) > 0.1) throw new Error('180 grados cuentan como desvio: ' + f.dYaw.toFixed(3));
  if (!f.over) throw new Error('media vuelta y deja de apoyar');
  setval(`#panes [data-pd="${p.id}"][data-k="yaw"]`, antes.toFixed(2));
});

/* Subir un paso confirma y repinta el panel entero; si el foco no vuelve a la
   celda, el primer paso sube y el segundo cae sobre BODY. En la tabla del
   modelo esto nunca se vio porque sus atributos estaban en CELL_ATTRS desde el
   principio. El gesto es el de cada sitio: dentro de una tabla, Ctrl+↑ (las
   flechas solas navegan); en los campos sueltos, la rueda sobre el campo
   enfocado, que es lo único que sube un paso fuera de una tabla. */
function dosPasos(sel, leer, que) {
  const sube = el => (el.closest('table')
    ? key(el, 'ArrowUp', { ctrlKey: true })
    : el.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true })));
  const antes = leer();
  q(sel).focus();
  sube(q(sel));
  const uno = leer();
  if (!(uno > antes)) throw new Error(`${que}: el primer paso no subió (${antes} -> ${uno})`);
  const a = document.activeElement;
  if (!a || !a.matches(sel)) {
    throw new Error(`${que}: tras confirmar, el foco quedó en ${a ? a.tagName : 'nada'}`);
  }
  sube(a);
  if (!(leer() > uno)) throw new Error(`${que}: el segundo paso no llegó a la celda`);
  document.activeElement.blur();
  setval(sel, String(antes));
}
step('en el fixture, Ctrl+↑ dos veces sube dos pasos: el foco sobrevive a la confirmación', () => {
  const p = S().fixture[2];
  dosPasos(`#panes [data-pd="${p.id}"][data-k="h"]`, () => S().fixture[2].h, 'pedestal');
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
step('la pestaña Límites existe en Modelar y trae los nueve números', () => {
  click('[data-md="model"]');
  click('#tabs [data-t="lims"]');
  if (S().tab !== 'lims') throw new Error('no cambió de pestaña');
  const campos = document.querySelectorAll('#panes [data-lm], #panes [data-c]').length;
  /* Nueve desde el 2026-09-19: el radio mínimo de tubo (SEC-03). */
  if (campos !== 9) throw new Error(campos + ' campos');
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

/* El .stp es el unico archivo que sale de aqui con geometria dentro. El motor
   ya lo tiene clavado en test_motor.js; lo que se comprueba AQUI es lo que el
   motor no puede ver: que el boton exista, que este donde se dijo, y que lo que
   sale del bundle empotrado sea lo mismo que sale del fuente. Un exportador
   perfecto detras de un boton que no se pinta no exporta nada. */
step('el eje sale a STEP desde el cajón de archivo', () => {
  drawer('file');
  click('#lf [data-a="expstp"]');
});
step('y el .stp es un archivo bien formado, con arcos y no con una malla', () => {
  const B = window.BARCOMP;
  const m = S().model;
  const txt = B.E.stepText(m, { name: m.name, build: 'banco', date: '2026-01-01T00:00:00' });
  if (!txt.startsWith('ISO-10303-21;')) throw new Error('no empieza como un STEP');
  if (!txt.trimEnd().endsWith('END-ISO-10303-21;')) throw new Error('no cierra');
  const def = new Set([...txt.matchAll(/^#(\d+)=/gm)].map(x => +x[1]));
  const usadas = new Set([...txt.slice(txt.indexOf('\nDATA;')).matchAll(/#(\d+)/g)]
    .map(x => +x[1]));
  const cuelgan = [...usadas].filter(n => !def.has(n));
  if (cuelgan.length) throw new Error(cuelgan.length + ' referencias sin definir');
  /* sin un solo CIRCLE esto seria una polilinea, o sea la malla otra vez, o sea
     los 0.32 mm de error de cuerda que el archivo existe para no tener */
  if (!/CIRCLE\(/.test(txt)) throw new Error('salió sin arcos');
  if (!txt.includes('SI_UNIT(.MILLI.,.METRE.)')) throw new Error('sin unidades');
});
step('y la demo sale como SOLIDO, que es lo unico que importa todo CAD', () => {
  const B = window.BARCOMP;
  const m = S().model;
  /* la demo es rectangular, sin torsion y sin pliegues: tiene que haber solido */
  const motivo = B.E.solidBlocker(m);
  if (motivo) throw new Error('se bloqueo el solido: ' + motivoStp(motivo));
  const txt = B.E.stepText(m, { name: m.name, build: 'banco', date: '2026-01-01T00:00:00' });
  if (!txt.includes('ADVANCED_BREP_SHAPE_REPRESENTATION(')) {
    throw new Error('salio sin solido');
  }
  if (!txt.includes('MANIFOLD_SOLID_BREP(') || !txt.includes('CLOSED_SHELL(')) {
    throw new Error('el solido no cierra ningun casco');
  }
  /* cuatro caras por tramo del eje mas las dos tapas: si falta una, el casco
     no es un solido, y eso el texto SI lo puede contar */
  const shell = txt.match(/CLOSED_SHELL\('',\(([^)]*)\)\)/);
  const nseg = B.E.centreSegments(m).length;
  if (!shell || shell[1].split(',').length !== nseg * 4 + 2) {
    throw new Error('caras: ' + (shell ? shell[1].split(',').length : 0)
      + ' para ' + nseg + ' tramos');
  }
  /* el volumen que le toca por Pappus va escrito en el archivo: es con lo que
     tools/check_step_freecad.py contrasta lo que mide el nucleo geometrico */
  const esperado = (B.E.sectionArea(m.section) * B.E.developedLength(m)).toFixed(6);
  if (!txt.includes('volumen esperado (Pappus) = ' + esperado)) {
    throw new Error('sin el volumen de Pappus dentro del archivo');
  }
});
/* Por que existe este paso: una pieza real del taller, 240-_M1, 22 dobleces,
   seccion rect 46.58x7.28, tail = 0. Su recta mas corta mide 11.685 mm y
   ninguna es negativa; lo unico que valia cero era la COLA -tailStraight(),
   o sea tail menos el trim del ultimo doblez-, que es una pieza que acaba
   justo en la tangencia del ultimo codo. Eso no es un defecto, es un corte al
   final del codo, y se fabrica. Antes del arreglo `solidBlocker()` pedia
   `v > 0` en cada recta, asi que ese cero bloqueaba igual que un negativo y
   la pieza salia del boton «Pieza a STEP» SIN solido -solo el eje y el
   perfil-, que es justo lo que reporto el usuario. Aqui se reproduce la misma
   condicion sobre la demo, tocando solo la cola para que tailStraight() de
   exactamente 0, y se comprueba que el solido SIGUE saliendo. */
step('una recta de longitud cero -la cola justo en la tangencia- no bloquea el solido', () => {
  const B = window.BARCOMP;
  const base = S().model;
  const ultimo = base.bends[base.bends.length - 1];
  /* copia, no se toca ST: tail puesto para que trim(ultimo) se lo coma entero */
  const copia = B.E.normalizeModel({ ...base, tail: B.E.trimOf(ultimo) });
  const cola = B.E.tailStraight(copia);
  if (Math.abs(cola) > 1e-9) {
    throw new Error('la copia no quedo con la cola en cero: tailStraight = ' + cola);
  }
  const motivo = B.E.solidBlocker(copia);
  if (motivo) {
    throw new Error('se bloqueo el solido con la cola en cero: ' + motivoStp(motivo));
  }
  const txt = B.E.stepText(copia, { name: copia.name, build: 'banco', date: '2026-01-01T00:00:00' });
  if (!txt.includes('ADVANCED_BREP_SHAPE_REPRESENTATION(')) {
    throw new Error('salio sin solido con la cola en cero');
  }
  if (!txt.includes('MANIFOLD_SOLID_BREP(') || !txt.includes('CLOSED_SHELL(')) {
    throw new Error('el solido no cierra ningun casco con la cola en cero');
  }
  /* con la cola en cero hay UN tramo degenerado -la cola misma, p0 === p1-,
     asi que la cuenta del paso anterior (centreSegments().length * 4 + 2)
     sobra un tramo aqui. Lo que cuenta son los tramos VIVOS, los mismos que
     filtra stepText() antes de escribir: `len > 1e-9` para una recta,
     `radius > 1e-9 && theta > 1e-9` para un arco. */
  const segs = B.E.centreSegments(copia);
  const vivos = segs.filter(s =>
    s.kind === 'line' ? s.len > 1e-9 : (s.radius > 1e-9 && s.theta > 1e-9));
  const shell = txt.match(/CLOSED_SHELL\('',\(([^)]*)\)\)/);
  const caras = shell ? shell[1].split(',').length : 0;
  if (caras !== vivos.length * 4 + 2) {
    throw new Error('caras: ' + caras + ' para ' + vivos.length + ' tramos vivos (de '
      + segs.length + ' tramos en total)');
  }
});
/* GUARDA, no prueba del arreglo: pasa igual en el codigo viejo y en el nuevo.
   Una recta NEGATIVA sigue siendo un defecto real -el avance se queda corto y
   la barra se meteria dentro de si misma-, y eso lo tiene que seguir
   bloqueando la version de hoy tanto como la de antes de tocar brep.ts. */
/* EL AVISO DE «ESTE .stp VA A SALIR SIN SOLIDO».

   Lo que se prueba aqui no es el motor —eso ya esta en test_motor.js— sino que
   el visor lo DICE. El 2026-09-24 alguien del taller exporto una pieza, el
   archivo salio sin solido, y la pantalla no dijo nada: el motivo solo viajaba
   dentro del `.stp`. El aviso vive junto al boton, o sea antes de exportar,
   para que se lea mientras la pieza todavia se puede arreglar.

   Se comprueba ademas que el texto sale del diccionario y no de una cadena
   escrita a mano en el panel: se compara contra `T('stpNoSolid')` con el motivo
   ya metido en `{r}`. Si alguien escribe el aviso en espanol dentro del HTML,
   este paso lo caza aunque en pantalla se lea igual. */
step('sin solido, el panel lo avisa junto al boton y dice el motivo traducido', () => {
  const B = window.BARCOMP;
  const m = S().model;
  const antes = m.bends[0].twist;
  try {
    /* torsion con seccion rectangular: el solido seria otra barra */
    m.bends[0].twist = 5;
    B.renderAll();
    drawer('file');
    const caja = document.querySelector('#lf [data-stp]');
    if (!caja) {
      const bl = B.E.solidBlocker(S().model);
      throw new Error('el panel no avisa: no hay ningun [data-stp] en el cajon,'
        + ' y el motor dice ' + (bl ? motivoStp(bl) : 'que si hay solido'));
    }
    if (caja.getAttribute('data-stp') !== 'twist') {
      throw new Error('el aviso dice el motivo equivocado: ' + caja.getAttribute('data-stp'));
    }
    if (caja.getAttribute('role') !== 'alert') {
      throw new Error('el aviso no es role=alert: un lector de pantalla no lo lee');
    }
    const dic = B.I18N[B.LANG.cur];
    const esperado = dic.stpNoSolid.replace('{r}', dic.stpTwist);
    if (caja.textContent.trim() !== esperado) {
      throw new Error('el texto no sale del diccionario: «' + caja.textContent.trim()
        + '» en vez de «' + esperado + '»');
    }
  } finally {
    m.bends[0].twist = antes;
    B.renderAll();
  }
});
/* GUARDA: con la demo, que si sale como solido, no hay aviso. Pasa en las dos
   versiones —en la vieja no hay aviso NUNCA— y es lo que corresponde: lo que
   sujeta es que el aviso no se quede pegado despues de arreglar la pieza. */
step('guarda: con solido no hay aviso ninguno junto al boton', () => {
  drawer('file');
  if (window.BARCOMP.E.solidBlocker(S().model)) {
    throw new Error('la demo dejo de salir como solido: el paso no prueba nada');
  }
  if (document.querySelector('#lf [data-stp]')) {
    throw new Error('el aviso sigue puesto con una pieza que si sale como solido');
  }
});
step('guarda: una recta negativa SI sigue bloqueando el solido', () => {
  const B = window.BARCOMP;
  const base = S().model;
  /* el primer doblez con un avance minimo deja su recta corta y negativa */
  const bends = base.bends.map((b, i) => i === 0 ? { ...b, feed: 1 } : b);
  const copia = B.E.normalizeModel({ ...base, bends });
  const recta0 = B.E.straightOf(copia, 0);
  if (!(recta0 < 0)) {
    throw new Error('el modelo de prueba no quedo con una recta negativa: ' + recta0);
  }
  /* «negativa» y no el codigo `neg`: asi la guarda vale tambien contra el build
     viejo, donde el motivo era una frase suelta y no un objeto */
  const motivo = B.E.solidBlocker(copia);
  if (!motivo || !motivoStp(motivo).includes('negativa')) {
    throw new Error('la recta negativa no bloqueo el solido: ' + motivoStp(motivo));
  }
  const txt = B.E.stepText(copia, { name: copia.name, build: 'banco', date: '2026-01-01T00:00:00' });
  if (txt.includes('ADVANCED_BREP_SHAPE_REPRESENTATION(')) {
    throw new Error('salio con solido a pesar de la recta negativa');
  }
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
step('un Δ escrito y confirmado con Enter se guarda Y se queda a la vista', () => {
  /* Lo reportó el taller: se escribía −0.7 en una casilla de compensación, la
     geometría cambiaba y la casilla se quedaba en 0.00; había que teclear el
     mismo número otra vez para verlo, y esa segunda vez ya no movía nada.
     La causa era que Enter subía hasta el manejador de la tabla de DESVIACIÓN
     —`data-r` lo llevan las tres tablas— que seleccionaba la fila y
     reconstruía #panes entero a media edición. Ver bindDevRows(). */
  click('[data-md="model"]');
  click('#tabs [data-t="model"]');
  const vr = () => S().variants.find(x => x.id === S().active);
  const selAntes = S().sel;
  const el = q('#panes input[data-bd="5"][data-k="angle"]');
  el.focus();                       // el foco selecciona el contenido: teclear reemplaza
  typeIn(el, '-0.7');
  key(el, 'Enter');
  if (Math.abs(vr().deltas[5].angle + 0.7) > 1e-9) {
    throw new Error('el Δ no se guardó: ' + vr().deltas[5].angle);
  }
  const vivo = q('#panes input[data-bd="5"][data-k="angle"]');
  if (Math.abs(parseFloat(vivo.value) + 0.7) > 1e-9) {
    throw new Error('el Δ se aplicó pero la casilla se quedó en ' + vivo.value);
  }
  if (S().sel !== selAntes) throw new Error('Enter seleccionó la fila en vez de confirmar la celda');
  /* y baja a la celda de abajo, que es lo que Enter tiene que hacer en una tabla */
  const foco = document.activeElement;
  if (!foco || foco.dataset.bd !== '6') throw new Error('Enter no bajó de fila');
  /* se deja como estaba: los pasos que vienen detrás miran esta misma pieza */
  const otra = q('#panes input[data-bd="5"][data-k="angle"]');
  otra.focus();
  typeIn(otra, '0');
  otra.dispatchEvent(new Event('change', { bubbles: true }));
  if (vr().deltas[5].angle !== 0) throw new Error('no se pudo dejar el Δ a cero');
});

step('repintar con una celda a medio escribir la CONFIRMA y la deja a la vista', () => {
  /* La otra mitad del mismo fallo. Reconstruir #panes arranca del documento el
     campo enfocado; eso dispara su `blur`, el `blur` dispara el `change` y el
     `change` manda repintar — desde dentro de la asignación de innerHTML que
     todavía no ha terminado. El navegador lanzaba «the node to be removed is no
     longer a child of this node», y el HTML que quedaba puesto se había armado
     ANTES de que el valor existiera. Ver renderRight().

     Esta prueba reportó `ok` con el fallo puesto: lo que paraba `npm run check`
     era el detector genérico de excepciones, no ella. Con cambiar de pestaña y
     volver, el segundo repintado ya salía limpio y tapaba el primero. Por eso
     ahora mira las dos cosas que se veían en el taller justo DESPUÉS del
     repintado que falla: que no se lanzó nada, y que la casilla que queda puesta
     enseña lo escrito sin tener que repintar otra vez. */
  click('[data-md="model"]');
  click('#tabs [data-t="model"]');
  const vr = () => S().variants.find(x => x.id === S().active);
  const lanzado = [];
  const oye = ev => lanzado.push(ev.message);
  window.addEventListener('error', oye);
  try {
    const el = q('#panes input[data-bd="8"][data-k="angle"]');
    el.focus();
    typeIn(el, '-0.4');
    click('#tabs [data-t="model"]');            // repinta la MISMA tabla sin haber confirmado
    if (lanzado.length) throw new Error('repintar lanzó: ' + lanzado[0]);
    if (Math.abs(vr().deltas[8].angle + 0.4) > 1e-9) {
      throw new Error('lo escrito se perdió al repintar: ' + vr().deltas[8].angle);
    }
    const puesta = q('#panes input[data-bd="8"][data-k="angle"]');
    if (Math.abs(parseFloat(puesta.value) + 0.4) > 1e-9) {
      throw new Error('el Δ se aplicó pero la casilla que quedó puesta enseña ' + puesta.value);
    }
    /* y el camino de antes, cambiando de pestaña, que tampoco puede lanzar */
    puesta.focus();
    typeIn(puesta, '-0.5');
    click('#tabs [data-t="fixture"]');
    if (lanzado.length) throw new Error('cambiar de pestaña lanzó: ' + lanzado[0]);
    if (Math.abs(vr().deltas[8].angle + 0.5) > 1e-9) {
      throw new Error('lo escrito se perdió al cambiar de pestaña: ' + vr().deltas[8].angle);
    }
  } finally {
    window.removeEventListener('error', oye);
  }
  click('#tabs [data-t="model"]');
  const vivo = q('#panes input[data-bd="8"][data-k="angle"]');
  vivo.focus();
  typeIn(vivo, '0');
  vivo.dispatchEvent(new Event('change', { bubbles: true }));
  vivo.blur();
});

step('la pestaña Fixture dice la flecha por gravedad de cada tramo', () => {
  click('[data-md="model"]');
  click('#tabs [data-t="fixture"]');
  click('#panes [data-a="seedped"]');
  const chips = [...document.querySelectorAll('#panes .chip')].map(c => c.textContent);
  if (!chips.some(c => /mm/.test(c))) throw new Error('no hay resumen de flecha: ' + chips.join(' | '));
  const cols = [...document.querySelectorAll('#panes table.marks thead th')].map(t => t.textContent);
  if (cols.length < 14) throw new Error('falta la columna de flecha: ' + cols.length);
});
step('sin densidad la flecha dice que falta el material, no un cero', () => {
  const B = window.BARCOMP;
  const antes = S().mat.rho;
  S().mat.rho = 0;
  B.renderAll();
  const txt = q('#panes').textContent;
  if (!/material|Material/.test(txt)) throw new Error('no avisa de que falta el material');
  S().mat.rho = antes;
  B.renderAll();
});
step('la pestaña Fixture dice si la pieza pesa, cuánto, y dónde se enciende', () => {
  /* UX-06: la columna «Reacción» aparece por un interruptor de OTRA pestaña, y
     el texto de aquí no nombraba la carga en ningún sitio. */
  const B = window.BARCOMP;
  const antes = S().load.on;
  S().load.on = false;
  B.renderAll();
  if (!/La pieza pesa/.test(q('#panes').textContent)) {
    throw new Error('sin carga no dice qué interruptor enciende las reacciones');
  }
  S().load.on = true;
  B.renderAll();
  const w = B.heldResult().weight;
  if (!(w > 0)) throw new Error('la pieza no pesa: ' + w);
  if (!q('#panes').textContent.includes(w.toFixed(1) + ' N')) {
    throw new Error(`con carga no dice cuánto pesa (${w.toFixed(1)} N)`);
  }
  S().load.on = antes;
  B.renderAll();
});
/* FIS-10. «Sembrar 7» y después «La pieza pesa» es el caso más normal que hay, y
   hasta el 2026-09-16 daba 47.4 N de apoyos sobre una pieza de 23.7 N. No era la
   búsqueda: era que el alto sembrado se redondeaba a centésimas y el muelle de
   contacto vale unos 6 N por MICRA de interferencia. */
step('sembrar y encender el peso no inventa reacciones', () => {
  const B = window.BARCOMP;
  click('[data-md="model"]');
  click('#tabs [data-t="fixture"]');
  click('#panes [data-a="seedped"]');
  if (S().fixture.length !== 7) throw new Error('sembró ' + S().fixture.length);
  const sec = S().model.section;
  const peor = Math.max(...S().fixture.map(p =>
    Math.abs(B.E.pedestalFit(B.placedPath(), sec, p).gap)));
  if (peor > 1e-6) {
    throw new Error('lo sembrado nace con ' + (peor * 1000).toFixed(1) + ' µm de precarga');
  }
  const antes = S().load.on;
  S().load.on = true;
  B.renderAll();
  const R = B.heldResult();
  /* LO QUE SE COMPRUEBA ES QUE LAS FUERZAS CIERREN, no que los apoyos lleven
     menos que la pieza. Esto pedía `carried <= weight` hasta el 2026-09-18 y
     esa no es una ley: la barra va empotrada en la mordaza y posada sobre
     siete apoyos, o sea hiperestática, y la mordaza puede tirar hacia abajo.
     Con la demo sembrada lo hace: 26.8 N en los apoyos y −3.2 en la mordaza.
     Lo que no puede pasar es que la suma no dé el peso. */
  if (Math.abs(R.carried + R.root - R.weight) > 1e-6) {
    throw new Error(`no cierra: ${R.carried.toFixed(2)} + ${R.root.toFixed(2)} `
      + `≠ ${R.weight.toFixed(2)} N`);
  }
  /* Y el hallazgo de verdad: sembrar no mete fuerza. Sin peso encima, cero. */
  S().load.g = 0;
  B.renderAll();
  const sinPeso = B.heldResult();
  if (sinPeso.carried !== 0) {
    throw new Error('sin peso los apoyos llevan ' + sinPeso.carried.toFixed(3) + ' N');
  }
  S().load.g = B.E.LOAD_DEFAULT.g;
  S().load.on = antes;
  B.renderAll();
});
/* LA CUNA SEMBRADA CASA CON LA BARRA. Hasta el 2026-09-18 la siembra fijaba la
   inclinación en la estación objetivo y no donde la cuna acaba tocando, y donde
   la barra va casi a plomo esos dos sitios no son el mismo: en la demo quedaban
   pedestales con la chapa hasta CINCUENTA grados cruzada respecto de la barra.
   La columna Δ lo enseñaba —hacía su trabajo— pero quien lo había puesto ahí
   era el botón de sembrar, y no había nada que corregir a mano. */
/* LA CHAPA QUE SE VE ES LA QUE SE MIDE. El 3D dibuja la cuna con un Euler y la
   física la mide con `cradleBox()`: dos escrituras de la misma rotación que
   pueden separarse sin que salte nada. Se separaron —el 3D la inclinaba con el
   seno cambiado de signo— y con la barra tendida no se notaba, pero bajo un
   tramo empinado la chapa de la pantalla apuntaba a un lado y la cuenta al
   otro. Se comprueba sobre el pedestal MÁS EMPINADO, que es donde se ve. */
step('la cuna del 3D apunta a lo largo de la barra, no cruzada con ella', () => {
  const B = window.BARCOMP;
  click('[data-md="model"]');
  click('#tabs [data-t="fixture"]');
  click('#panes [data-a="seedped"]');
  B.rebuildScene();
  const peds = S().fixture;
  const k = peds.reduce((a, p, i) => (Math.abs(p.tilt) > Math.abs(peds[a].tilt) ? i : a), 0);
  const ped = peds[k];
  if (Math.abs(ped.tilt) < 20) throw new Error('ninguna cuna empinada: ' + ped.tilt);
  /* La cuna es la caja que mide `pad` de largo; la columna mide 28. */
  const cunas = [];
  B.groups.fix.traverse(o => {
    const g = o.geometry && o.geometry.parameters;
    if (g && Math.abs(g.width - ped.pad) < 1e-6 && Math.abs(g.depth - 6) < 1e-6) cunas.push(o);
  });
  if (!cunas.length) throw new Error('no hay ninguna cuna en la escena');
  /* la que está sobre ESTE pedestal: la más cercana a su pie */
  const cuna = cunas.reduce((a, o) => {
    const d = (x) => Math.hypot(x.position.x - ped.x, x.position.y - ped.y);
    return d(o) < d(a) ? o : a;
  });
  /* el eje largo de la caja, sacado de la propia escena: sin construir un
     vector de three, que el banco no tiene a mano. `updateMatrixWorld` a mano
     porque la escena se acaba de reconstruir y todavía no se ha pintado. */
  cuna.updateMatrixWorld(true);
  const m = cuna.matrixWorld.elements;
  const eje = { x: m[0], y: m[1], z: m[2] };
  const f = B.E.pedestalFit(B.placedPath(), S().model.section, ped);
  const tg = B.E.sampleAt(B.placedPath(), f.s).x;
  const cos = Math.abs(eje.x * tg.x + eje.y * tg.y + eje.z * tg.z);
  if (cos < 0.9) {
    throw new Error('la cuna dibujada va a ' + (Math.acos(cos) * 180 / Math.PI).toFixed(1)
      + '° de la barra (cuna ' + ped.tilt.toFixed(1) + '°)');
  }
});
step('lo sembrado nace con la cuna casada con la barra, no cruzada', () => {
  const B = window.BARCOMP;
  click('[data-md="model"]');
  click('#tabs [data-t="fixture"]');
  click('#panes [data-a="seedped"]');
  const sec = S().model.section;
  const path = B.placedPath();
  const peor = Math.max(...S().fixture.map(p =>
    Math.abs(B.E.pedestalFit(path, sec, p).dTilt)));
  if (peor > 0.05) {
    throw new Error('la peor cuna queda ' + peor.toFixed(2) + '° cruzada con la barra');
  }
  /* Y el despegue que eso deja en la punta de la cuna, que es lo que se puede
     comparar con una tolerancia: por debajo de la micra. */
  const lift = Math.max(...S().fixture.map(p =>
    B.E.pedestalFit(path, sec, p).lift));
  if (lift > 0.01) throw new Error('despega ' + (lift * 1000).toFixed(1) + ' µm en la punta');
});
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
/* FIS-10c. El hermano del hallazgo FIS-10, cerrado el 2026-09-19: `seedPins()`
   redondeaba a centésimas el sitio del poste en planta, y con la carga encendida
   eso son micras de interferencia sembrada por un muelle que vale 6.16 N/µm. En
   la demo el primer pin nacía llevando 8.83 N donde la pieza pide 6.25. */
step('los pines sembrados nacen tocando, sin micras de interferencia dentro', () => {
  const B = window.BARCOMP;
  const sec = S().model.section;
  const peor = Math.max(...S().pins.map(p =>
    Math.abs(B.E.pinFit(B.placedPath(), sec, p).gap)));
  if (peor > 1e-6) {
    throw new Error('lo sembrado nace con ' + (peor * 1000).toFixed(1) + ' µm de interferencia');
  }
  /* Y con el peso puesto pero sin gravedad, ningún pin empuja: sembrar no mete
     fuerza, ni en el fixture ni en el amarre. */
  const antes = S().load.on, g = S().load.g;
  S().load.on = true; S().load.g = 0;
  B.renderAll();
  const R = B.heldResult();
  const empuja = Math.max(0, ...(R.pinN || []));
  if (empuja !== 0) throw new Error('sin peso un pin empuja ' + empuja.toFixed(3) + ' N');
  S().load.on = antes; S().load.g = g;
  B.renderAll();
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
  /* Con el interruptor en LIBRE: desde que hay uno solo, en sujeta la barra
     sujeta es la que se ve y se mide, y se dibuja con la capa o sin ella. Donde
     la capa decide algo es en libre: superponer o no la sujeta de referencia. */
  const ref0 = S().restraint.refHeld;
  S().restraint.refHeld = false;
  S().layers.held.on = false;
  B.rebuildScene();
  const sin = cuenta();
  S().layers.held.on = true;
  B.rebuildScene();
  const con = cuenta();
  S().restraint.refHeld = ref0;
  B.rebuildScene();
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
  click('#panes [data-hv="free"]');
  if (dif() !== 0) throw new Error('con «libre» la referencia no es la libre');
  click('#panes [data-hv="both"]');
  if (!S().restraint.refHeld) throw new Error('no se guardó la elección');
  if (!(dif() > .5)) throw new Error('elegir «sujeta» no cambió la referencia: ' + dif().toFixed(3));
  /* y vuelve, que un interruptor que no vuelve no es un interruptor */
  click('#panes [data-hv="free"]');
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
step('un solo interruptor: los puntos van con la barra que se ve, y las cifras también', () => {
  const B = window.BARCOMP;
  /* Lo que pidió el taller el 2026-09-14: «si está sujeta, todo va con la
     sujeta». Había dos interruptores —«Ver» y «Medir contra»— y con la sujeta en
     pantalla las esferas de los PI se quedaban donde estaría la libre. */
  if (document.querySelector('#panes [data-rh]')) throw new Error('sigue habiendo un segundo interruptor');
  if (!S().layers.pts.on) throw new Error('la capa de puntos está apagada: el paso no prueba nada');
  const esfera = i => B.groups.pts.children.find(o => o.userData.pi === i);
  const A = B.E.anchorTransform(S().model, B.refModelFree(), S().anchor);
  const libre = B.E.applyMat(A, B.E.fk(S().model).pis);
  const suj = B.E.applyMat(A, B.E.fk(B.heldResult().model).pis);
  let i = 0;
  suj.forEach((p, k) => { if (p.distanceTo(libre[k]) > suj[i].distanceTo(libre[i])) i = k; });
  if (!(suj[i].distanceTo(libre[i]) > .01)) throw new Error('la sujeta no se separa de la libre: el paso no prueba nada');
  for (const [hv, donde, quien] of [['held', suj, 'sujeta'], ['both', suj, 'las dos'], ['free', libre, 'libre']]) {
    click(`#panes [data-hv="${hv}"]`);
    if (S().restraint.refHeld !== (hv !== 'free')) throw new Error(`«${quien}» no cambió contra qué se mide`);
    const e = esfera(i);
    if (!e || e.position.distanceTo(donde[i]) > 1e-6) {
      throw new Error(`con «${quien}» la esfera del PI ${i} no está en su barra`);
    }
  }
  click('#panes [data-hv="both"]');
});
step('con dos modelos, el que no cabe en el fixture dice dónde choca, y el que cabe no', () => {
  const B = window.BARCOMP;
  /* El fallo que esto vigila: con dos modelos y el amarre puesto, el segundo
     atravesaba pines y pedestales y la pantalla no decía nada. La física de que
     no atraviese la vigila test_motor.js con una pieza fija; aquí se vigila que
     lo que el motor sabe llegue a la tarjeta del modelo y al 3D. Qué doblez hace
     chocar depende de cómo haya dejado el fixture el resto del banco, así que se
     busca en vez de suponerlo. */
  check('#panes [data-rs="on"]', true);
  const otro = S().variants.find(v => v.id !== S().active);
  if (!otro) throw new Error('hace falta un segundo modelo');
  const a0 = otro.deltas.map(d => d.angle);
  /* querySelector y no q(): que el aviso NO esté es una respuesta, no un error */
  const tarjeta = () => { drawer('models'); return document.querySelector(`#lf [data-vsel="${otro.id}"] .clash`); };
  try {
    if (B.heldOfVariant(otro).clash.length !== B.heldResult().clash.length) {
      throw new Error('una copia exacta de la activa no choca igual que ella');
    }
    let hallado = null;
    for (let i = 0; i < otro.deltas.length && !hallado; i++) {
      for (const d of [8, -8, 15, -15]) {
        otro.deltas[i].angle = a0[i] + d;
        if (B.heldOfVariant(otro).clash.length) { hallado = [i, d]; break; }
        otro.deltas[i].angle = a0[i];
      }
    }
    if (!hallado) throw new Error('ningún doblez desplazado hasta 15° choca con el fixture: el banco no puede comprobar el aviso');
    B.renderAll();
    const c = tarjeta();
    if (!c) throw new Error(`el modelo choca (doblez ${hallado[0]}, ${hallado[1]}°) y su tarjeta no lo dice`);
    if (!/mm/.test(c.textContent)) throw new Error('la tarjeta no dice cuánto: ' + c.textContent);
    B.rebuildScene(); B.drawLabels();
    if (!q('#labels').textContent.includes(otro.name)) throw new Error('el 3D no marca dónde choca');
  } finally {
    otro.deltas.forEach((d, i) => { d.angle = a0[i]; });
    B.renderAll();
  }
  if (tarjeta() && !B.heldResult().clash.length) throw new Error('devuelto a copia de la activa, la tarjeta sigue diciendo que choca');
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
step('un pin se puede levantar de la mesa sin alargarlo', () => {
  const B = window.BARCOMP;
  /* Largo y altura son dos cifras distintas, y hasta hoy solo había una: para
     subir un pin había que alargarlo, y alargándolo tocaba también por abajo.
     El paso comprueba las dos mitades: que la base sube, y que el poste sigue
     midiendo lo mismo. */
  const id = S().pins[0].id;
  const largo = S().pins[0].h;
  const base0 = B.E.pinAxis(S().pins[0]).base.z;
  const t0 = B.E.pinFit(B.placedPath(), S().model.section, S().pins[0]).t;
  setval(`#panes [data-pn="${id}"][data-k="z"]`, '40');
  if (S().pins[0].z !== 40) throw new Error('no se escribió la altura: ' + S().pins[0].z);
  if (S().pins[0].h !== largo) throw new Error('subirlo cambió el largo del poste');
  const ax = B.E.pinAxis(S().pins[0]);
  if (Math.abs(ax.base.z - (base0 + 40)) > 1e-9) {
    throw new Error(`la base no subió: ${base0.toFixed(1)} -> ${ax.base.z.toFixed(1)}`);
  }
  /* y el contacto lo nota: con la barra donde está, el punto donde se tocan baja
     por el poste. Si esto no se moviera, la cifra sería un adorno. */
  const t1 = B.E.pinFit(B.placedPath(), S().model.section, S().pins[0]).t;
  if (!(t1 < t0 - .05)) throw new Error(`el contacto no bajó: ${t0.toFixed(3)} -> ${t1.toFixed(3)}`);
  setval(`#panes [data-pn="${id}"][data-k="z"]`, '0');
  if (S().pins[0].z !== 0) throw new Error('no volvió a la mesa');
});
step('en el amarre, dos pasos seguidos llegan a la celda en el pin, el amarre y el material', () => {
  const id = S().pins[0].id;
  dosPasos(`#panes [data-pn="${id}"][data-k="z"]`, () => S().pins[0].z, 'pin');
  dosPasos('#panes [data-rs="tol"]', () => S().restraint.tol, 'amarre');
  dosPasos('#panes [data-mt="E"]', () => S().mat.E, 'material');
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
step('la carga y el material también entran en el deshacer', () => {
  /* QA-04: pedestales y pines tenían su paso de deshacer, y los dos grupos de
     campos que deciden cuánto se cuelga la pieza no. Un campo que se queda
     fuera del documento no da error: se pierde del deshacer y del guardado a la
     vez, y eso solo lo nota quien vuelve a abrir el archivo. */
  const E0 = S().mat.E;
  setval('#panes [data-mt="E"]', String(E0 + 1000));
  if (S().mat.E !== E0 + 1000) throw new Error('no se escribió E: ' + S().mat.E);
  hotkey('z', { ctrlKey: true });
  if (S().mat.E !== E0) throw new Error('deshacer no devolvió E: ' + S().mat.E);
  const on0 = S().load.on;
  if (!on0) check('#panes [data-ld="on"]', true);
  const g0 = S().load.g;
  setval('#panes [data-ld="g"]', String(g0 + 1));
  if (S().load.g !== g0 + 1) throw new Error('no se escribió g: ' + S().load.g);
  hotkey('z', { ctrlKey: true });
  if (S().load.g !== g0) throw new Error('deshacer no devolvió g: ' + S().load.g);
  if (!on0) {
    hotkey('z', { ctrlKey: true });
    if (S().load.on) throw new Error('deshacer no apagó la carga');
  }
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
     resolver, devuelve lo mismo.
     El suelo de medio milisegundo NO es holgura: con tres pines el amarre se
     resuelve en 0.0 ms, así que «menos de la mitad de 0.0» es una comparación
     contra el ruido de `performance.now()` y fallaba una de cada tres veces sin
     que nada estuviera roto. Una prueba que falla al azar enseña a no leer los
     fallos, que es peor que no tenerla. */
  const t1 = performance.now();
  const again = B.heldResult();
  if (performance.now() - t1 > Math.max(ms / 2, 0.5)) throw new Error('la caché no está sirviendo');
  if (again !== S().held) throw new Error('la caché devolvió otra cosa');
});
step('con cinco modelos más sujetos, resolverlos todos cabe en el presupuesto', () => {
  const B = window.BARCOMP;
  check('#panes [data-rs="on"]', true);
  /* Desde FIS-08 el fixture sujeta a TODOS los modelos, así que lo que cuesta
     mover un pin crece con cada modelo que se compara. Medido en este banco el
     2026-09-14: seis modelos con un doblez distinto, 82 ms de amarre antes de
     quitar la basura del motor y 55 ms después. El presupuesto es el de siempre,
     250 ms, pero para los SEIS juntos: es lo que paga un PC de taller cada vez
     que se mueve un pin. Los modelos se quitan al final, que el resto del banco
     cuenta con los que había. */
  const antes = S().variants.slice();
  const cols = ['#3FD68C', '#F0A02E', '#E05A5A', '#6FA8FF', '#C080FF'];
  const pin = S().pins[0];
  if (!pin) throw new Error('hace falta un pin');
  const x0 = pin.x;
  try {
    for (let k = 0; k < 5; k++) {
      const v = B.E.cloneVariant(antes[0], 'perf' + k, cols[k], 'vperf' + k);
      const d = v.deltas[Math.min(3, v.deltas.length - 1)];
      if (d) d.angle += 1 + k * 0.7;
      S().variants.push(v);
    }
    /* firma nueva para todos: la caché fría, que es el caso que se nota */
    pin.x = x0 + 0.37;
    const t0 = performance.now();
    for (const v of S().variants) B.heldOfVariant(v);
    B.heldResult();
    const ms = performance.now() - t0;
    log.push(`     amarre: ${ms.toFixed(1)} ms · ${S().variants.length} modelos sujetos`);
    if (!(ms < 250)) throw new Error(`seis modelos sujetos van a tirones: ${ms.toFixed(0)} ms`);
    /* y repintar sin cambiar nada no vuelve a resolver ninguno */
    const t1 = performance.now();
    for (const v of S().variants) B.heldOfVariant(v);
    B.heldResult();
    const t2 = performance.now() - t1;
    if (t2 > Math.max(ms / 4, 1)) throw new Error(`la caché no sirve con varios modelos: ${t2.toFixed(1)} ms`);
  } finally {
    pin.x = x0;
    S().variants.splice(0, S().variants.length, ...antes);
    B.renderAll();
  }
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

step('la carga arranca apagada y tiene su interruptor', () => {
  click('#tabs [data-t="pins"]');
  if (S().load.on) throw new Error('la carga nace encendida');
  if (!q('#panes [data-ld="on"]')) throw new Error('no está el interruptor de la carga');
});
step('el chip de estado dice qué interruptor está puesto y lleva a Amarre', () => {
  /* X-09: con cero pines y solo la carga, el chip decía «Barra sujeta por los
     pines · 0». Se leía «sujeta» donde había una pieza colgando. */
  check('#panes [data-rs="on"]', false);
  check('#panes [data-ld="on"]', true);
  const chip = q('#st [data-a="gohold"]');
  if (/pines/i.test(chip.textContent)) throw new Error('con solo la carga dice pines: ' + chip.textContent);
  if (!/pesa/i.test(chip.textContent)) throw new Error('no dice que la pieza pesa: ' + chip.textContent);
  if (!S().pins.length && /·\s*0\s*·/.test(chip.textContent)) {
    throw new Error('enseña un cero de pines sin pines: ' + chip.textContent);
  }
  /* y desde Compensar, donde no hay pestaña que lleve a los interruptores */
  click('[data-md="comp"]');
  click('#st [data-a="gohold"]');
  if (S().mode !== 'model' || S().tab !== 'pins') throw new Error(`llevó a ${S().mode}/${S().tab}`);
  if (!q('#panes [data-ld="on"]').checked) throw new Error('llegó a Amarre pero la carga no se ve puesta');
  check('#panes [data-ld="on"]', false);
});
step('encender la carga cuelga la pieza por su propio peso', () => {
  const B = window.BARCOMP;
  const libre = B.E.fk(S().model).pis;
  check('#panes [data-ld="on"]', true);
  if (!S().load.on) throw new Error('no se encendió');
  /* las capas se encienden solas, igual que con el amarre: encender algo y que
     el 3D siga idéntico se lee como que no funcionó */
  if (!S().layers.held.on || !S().layers.fix.on) throw new Error('las capas siguen apagadas');
  const R = B.heldResult();
  if (!(R.weight > 0)) throw new Error('la pieza no pesa nada');
  if (Math.abs(R.carried + R.root - R.weight) > 1e-6) throw new Error('la cuenta no cierra');
  const d = B.E.fk(R.model).pis.reduce((m, x, i) => Math.max(m, x.distanceTo(libre[i])), 0);
  if (!(d > 0)) throw new Error('la carga no movió un solo punto');
});
step('sin pedestales la pieza cuelga entera de la mordaza', () => {
  click('#tabs [data-t="fixture"]');
  click('#panes [data-a="clearped"]');
  const R = window.BARCOMP.heldResult();
  if (R.carried !== 0) throw new Error('algo la sostiene sin haber apoyos: ' + R.carried);
  if (Math.abs(R.root - R.weight) > 1e-9) throw new Error('la raíz no lleva el peso entero');
});
/* Se siembra con el PESO QUITADO y se enciende después. Es el orden del taller
   —los pedestales se montan bajo la barra, no bajo la barra colgada— y es el caso
   de FIS-10. Sembrar con la carga YA puesta siembra bajo la forma caída, y al
   apoyarla la barra sube y el fixture se queda con hasta 15 mm de aire: así este
   paso pasaba, hasta el 2026-09-16, con 0.02 N de los 23.7 N que pesa la pieza.
   O sea con ruido, y sin probar nada. */
step('sembrar pedestales le quita ese peso de encima', () => {
  const B = window.BARCOMP;
  S().load.on = false; B.renderAll();
  click('#panes [data-a="seedped"]');
  S().load.on = true; B.renderAll();
  const R = B.heldResult();
  const suma = R.pedN.reduce((a, b) => a + b, 0);
  if (!(suma > 0.1 * R.weight)) {
    throw new Error(`los apoyos solo llevan ${suma.toFixed(2)} N de ${R.weight.toFixed(2)} N`);
  }
  /* Y LA SUMA CIERRA. Esto pedía «no más que la pieza entera, y la mordaza sin
     tirar hacia abajo» hasta el 2026-09-18, y ninguna de las dos es una ley:
     una barra empotrada en la mordaza y posada sobre siete apoyos es
     hiperestática, y la mordaza puede tirar hacia abajo —hay un paso del motor
     que lo demuestra con la palanca—. Sobre la demo salen 26.8 N en los apoyos
     y −3.2 en la mordaza. Lo que no puede fallar nunca es que sumen el peso.

     El hallazgo FIS-10 se comprueba donde de verdad vive, que es sin peso
     encima: sembrar no mete fuerza. Ver el paso «sembrar y encender el peso no
     inventa reacciones». */
  if (Math.abs(R.carried + R.root - R.weight) > 1e-6) {
    throw new Error(`no cierra: ${R.carried.toFixed(2)} + ${R.root.toFixed(2)} `
      + `≠ ${R.weight.toFixed(2)} N`);
  }
  if (!(R.root < R.weight)) throw new Error('la raíz sigue con todo');
  /* y la columna de reacción aparece en la tabla: el número tiene que estar
     donde se teclean los pedestales, no solo en un chip */
  if (!/data-a="clearped"/.test(q('#panes').innerHTML)) throw new Error('no es la pestaña del fixture');
  const ths = [...document.querySelectorAll('#panes table.marks th')].length;
  if (ths < 15) throw new Error('la tabla no creció con la reacción: ' + ths);
});
/* --- la pieza que MIDE la tabla del fixture --------------------------------
   Los cuatro pasos de aquí abajo son del informe del 2026-09-10 y de lo que el
   taller contó encima: la tabla del fixture medía SIEMPRE la barra libre
   mientras el 3D dibujaba la sujeta, y el anclaje se medía contra la referencia
   sujeta —que depende del fixture— así que tocar un pedestal recolocaba la
   pieza entera. */
step('la tabla del fixture mide la barra que HAY, no la libre', () => {
  const B = window.BARCOMP;
  /* Quien lo decide es el interruptor «Medir contra» de la pestaña Amarre, desde
     que manda sobre toda la pantalla y no solo sobre las tarjetas de modelo. El
     paso lo pone donde prueba algo en vez de heredar lo que dejara el anterior. */
  click('#tabs [data-t="pins"]');
  click('#panes [data-hv="both"]');
  click('#tabs [data-t="fixture"]');
  const libre = B.placedPath(), puesta = B.shownPath();
  if (libre.length !== puesta.length) throw new Error('las dos trayectorias no son comparables');
  const d = libre.reduce((m, s, i) => Math.max(m, s.p.distanceTo(puesta[i].p)), 0);
  if (!(d > 1e-6)) throw new Error('con la carga puesta la tabla sigue midiendo la pieza libre');
  /* Y el hueco lo nota, en un pedestal que de verdad esté trabajando: en el
     tramo rígido las dos trayectorias coinciden y ahí no probaría nada. */
  const R = B.heldResult(), sec = S().model.section;
  const k = R.pedN.findIndex(v => v > 0);
  if (k < 0) throw new Error('ningún pedestal lleva carga: el paso no prueba nada');
  const a = B.E.pedestalFit(libre, sec, S().fixture[k]);
  const b = B.E.pedestalFit(puesta, sec, S().fixture[k]);
  if (!a || !b) throw new Error('ese pedestal no tiene lectura');
  if (Math.abs(a.gap - b.gap) < 1e-9) throw new Error('el hueco no cambió al medir la pieza puesta');
});
step('elegir «libre» devuelve la tabla a la barra sin sujetar', () => {
  const B = window.BARCOMP;
  /* La otra mitad del interruptor, que es la que el taller pidió: con «libre»
     puesto, las tablas tienen que volver a contestar sobre la pieza que habría
     sin nada que la sujetara. Mientras la respuesta colgó de que hubiera amarre
     —y no de lo que se hubiera elegido— esta mitad no existía. */
  click('#tabs [data-t="pins"]');
  click('#panes [data-hv="free"]');
  const d = B.placedPath().reduce((m, s, i) => Math.max(m, s.p.distanceTo(B.shownPath()[i].p)), 0);
  if (d !== 0) throw new Error('con «libre» la tabla sigue midiendo la sujeta: ' + d);
  /* Y se DICE: medir la libre con la carga puesta es contestar una pregunta
     hipotética, y una pantalla que no lo avisa se lee como la otra. */
  click('#tabs [data-t="fixture"]');
  if (!q('#panes .warnbox')) throw new Error('no avisa de que está midiendo la libre');
  click('#tabs [data-t="pins"]');
  click('#panes [data-hv="both"]');
  const d2 = B.placedPath().reduce((m, s, i) => Math.max(m, s.p.distanceTo(B.shownPath()[i].p)), 0);
  if (!(d2 > 1e-6)) throw new Error('volver a «sujeta» no cambió nada');
  /* y se devuelve la pestaña donde estaba: los pasos de aquí abajo leen la tabla
     del fixture por posición, y dejarles otra tabla delante los hace fallar por
     un motivo que no es el suyo */
  click('#tabs [data-t="fixture"]');
});
step('mover un pedestal no recorre la barra entera', () => {
  const B = window.BARCOMP;
  /* El caso exacto que lo destapó: anclaje por MEJOR AJUSTE y la referencia
     comparada SUJETA. Así la referencia sujeta depende del fixture, y con el
     anclaje medido contra ella subir un pedestal recolocaba la pieza completa en
     vez de cambiar solo la forma que toma en la mesa. */
  const anchor0 = S().anchor, ref0 = S().restraint.refHeld;
  S().anchor = 'best'; S().restraint.refHeld = true;
  B.renderAll();
  const pts = p => p.map(s => [s.p.x, s.p.y, s.p.z]);
  /* Y la segunda cara del mismo lazo, que se quedó abierta hasta hoy: la barra
     LIBRE que se dibuja se anclaba contra la referencia elegida, así que con
     «sujeta» puesto subir un pedestal la recorría por la pantalla mientras la
     tabla la dejaba quieta. El 3D y la tabla colocando la misma pieza en sitios
     distintos es peor que el fallo original, y no había paso que lo viera. */
  const vtx = () => {
    const g = B.groups.nom.children.find(o =>
      o.geometry && o.geometry.attributes && o.geometry.attributes.position);
    if (!g) throw new Error('la capa de la barra libre no dibujó nada');
    const a = g.geometry.attributes.position.array;
    return [a[0], a[1], a[2]];
  };
  const antes = pts(B.placedPath()), vAntes = vtx();
  const ped = S().fixture[0], h0 = ped.h;
  ped.h = h0 + 5;
  B.renderAll();
  const ahora = pts(B.placedPath()), vAhora = vtx();
  const d = antes.reduce((m, p, i) => Math.max(m,
    Math.abs(p[0] - ahora[i][0]), Math.abs(p[1] - ahora[i][1]), Math.abs(p[2] - ahora[i][2])), 0);
  const dv = Math.max(...vAntes.map((v, i) => Math.abs(v - vAhora[i])));
  ped.h = h0; S().anchor = anchor0; S().restraint.refHeld = ref0;
  B.renderAll();
  if (d !== 0) throw new Error('subir un pedestal movió la colocación: ' + d.toFixed(4) + ' mm');
  if (dv !== 0) throw new Error('subir un pedestal movió la barra dibujada: ' + dv.toFixed(4) + ' mm');
});
step('un pedestal hundido en la barra no puede leer cero', () => {
  const B = window.BARCOMP;
  const path = B.shownPath(), sec = S().model.section, R = B.heldResult();
  S().fixture.forEach((p, k) => {
    const f = B.E.pedestalFit(path, sec, p);
    /* La contradicción que se pintaba en dos columnas pegadas: la barra metida
       dentro de la cuna y la reacción a cero. O apoya, o no apoya. */
    if (!f || !f.over || R.pedBlind[k]) return;
    /* Lo que la tabla LEE, a dos decimales, que es de lo que habla el nombre del
       paso. Hasta el 2026-09-14 el umbral era −1e-6 mm, y eso es más fino que la
       propia cuenta: el solver recorre la barra con 8 muestras por arco y la
       tabla con 12, y entre las dos polilíneas hay micras —del orden de lo que se
       hunde un apoyo que carga, con κ de la demo—. Un pedestal a −0.0006 mm con
       0 N no es la contradicción que se pintaba, que eran décimas contra cero:
       en pantalla se lee −0.00 y 0.0. */
    if (+f.gap.toFixed(2) < 0 && !(R.pedN[k] > 0)) {
      throw new Error(p.name + ' hundido ' + f.gap.toFixed(4) + ' mm y sin llevar nada');
    }
  });
});
step('un apoyo que el modelo no puede juzgar dice n/d, no 0.0', () => {
  const B = window.BARCOMP;
  const M = S().model, sec = M.section;
  /* Dentro del primer tramo, que es rígido: las incógnitas son los codos de las
     estaciones y ahí no hay ninguna. */
  const s0 = B.E.bendStations(M)[0] * 0.4;
  /* Contra la barra que MIDE la tabla, que es la que decide si el pedestal está
     debajo de la pieza: colocarlo bajo la libre y leerlo contra la sujeta lo
     dejaba fuera, y la fila salía en «no apoya» en vez de en «indeterminable»,
     que es lo que este paso quiere ver. */
  const sm = B.E.sampleAt(B.shownPath(), s0);
  const ped = S().fixture[0], guarda = { x: ped.x, y: ped.y, h: ped.h };
  ped.x = sm.p.x; ped.y = sm.p.y;
  ped.h = sm.p.z - B.E.sectionDrop(sm, sec) - B.E.TABLE_Z;
  B.renderAll();
  const R = B.heldResult();
  const fila = document.querySelectorAll('#panes table.marks tbody tr')[0];
  const nd = fila && fila.querySelector('td.v-nd');
  const ciego = R.pedBlind[0];
  Object.assign(ped, guarda); B.renderAll();
  if (!ciego) throw new Error('el motor no marcó indeterminable un apoyo del tramo rígido');
  if (!nd) throw new Error('la casilla de la reacción no se marcó como indeterminable');
  if (/^\s*0/.test(nd.textContent)) throw new Error('la casilla sigue diciendo cero');
});
/* LO QUE LA COLUMNA REACCIÓN NO PUEDE PROMETER, dicho en su propio tooltip
   desde el 2026-09-19. Medido en `npm run demo:carga`, escenario 6: subir UN
   pedestal 0.05 mm —un flexómetro— lleva el total de los apoyos de 26.8 N a
   333.5 sobre una pieza de 23.7, porque junto a la mordaza la barra no cede y
   ese medio pelo entra entero en el muelle de contacto, a 6.16 N por micra. La
   pantalla enseña los newton porque sirven para ver QUÉ APOYO TRABAJA; lo que
   no puede es dejar creer que son una lectura de célula de carga. */
step('la columna Reacción avisa de lo que un alto medido a ojo se lleva por delante', () => {
  const B = window.BARCOMP;
  click('#tabs [data-t="fixture"]');
  const txt = B.I18N[B.LANG.cur];
  const th = [...document.querySelectorAll('#panes table.marks th')]
    .findIndex(c => c.textContent.trim().startsWith(txt.loadN));
  if (th < 0) throw new Error('la tabla del fixture no tiene columna de reacción');
  const fila = document.querySelector('#panes table.marks tbody tr');
  const celda = fila && fila.children[th];
  if (!celda || celda.title !== txt.loadNTip) {
    throw new Error('la casilla de la reacción no lleva su explicación');
  }
  if (!/micra|µm|micron|Mikrometer/i.test(celda.title)) {
    throw new Error('el tooltip de la reacción no dice lo que vale una micra de alto');
  }
});

step('apagar la carga devuelve la pieza libre', () => {
  const B = window.BARCOMP;
  click('#tabs [data-t="pins"]');
  check('#panes [data-ld="on"]', false);
  const d = B.E.fk(B.shownModel()).pis.reduce(
    (m, x, i) => Math.max(m, x.distanceTo(B.E.fk(S().model).pis[i])), 0);
  if (d !== 0) throw new Error('la pieza no volvió a su sitio: ' + d);
});

/* --- estabilidad, 2026-09-14 ---------------------------------------------- */
step('la captura del reporte no sale en blanco sin preserveDrawingBuffer', () => {
  const B = window.BARCOMP;
  /* Se quitó preserveDrawingBuffer para no pagar una copia de cada fotograma.
     La captura sigue valiendo solo si dibuja y lee en la misma tarea: si alguien
     la parte en dos, lee el búfer ya borrado y el reporte sale con cuatro
     rectángulos del color de fondo. Un PNG de un color comprime a casi nada, así
     que se compara contra uno vacío del mismo tamaño. */
  const vp = q('#vp');
  const vacio = Object.assign(document.createElement('canvas'), { width: vp.width, height: vp.height })
    .toDataURL('image/png').length;
  const shots = B.captureViews();
  if (shots.length !== 4) throw new Error(shots.length + ' vistas');
  const tams = shots.map(([, u]) => u.length);
  log.push(`     capturas: ${tams.join(' · ')} bytes · vacía ${vacio}`);
  if (tams.some(t => t < vacio * 3)) throw new Error('una vista salió en blanco: ' + tams.join(' · '));
});
step('un fallo al dibujar una capa se dice y no se lleva la escena entera', () => {
  const B = window.BARCOMP;
  /* Se rompe la capa de puntos y se miran tres cosas: que el aviso aparece, que
     las demás capas se dibujaron igual y que el fallo NO se tragó —llega a
     window.onerror, que es lo que enseña la consola—. */
  const nota = q('#vpnote');
  const err0 = window.onerror;
  let visto = '';
  window.onerror = m => { visto = String(m); };
  S().layers.pts.on = true;
  try {
    B.groups.pts.add = () => { throw new Error('fallo de prueba'); };
    B.rebuildScene();
  } finally {
    delete B.groups.pts.add;
    window.onerror = err0;
  }
  if (!/fallo de prueba/.test(visto)) throw new Error('el fallo se tragó: no llegó a window.onerror');
  if (nota.hidden || !/fallo de prueba/.test(nota.textContent)) throw new Error('no se avisó en pantalla');
  const otras = Object.keys(B.groups).filter(k => k !== 'pts' && B.groups[k].children.length);
  if (!otras.length) throw new Error('una capa rota se llevó las demás');
  nota.querySelector('button').click();
  if (!nota.hidden) throw new Error('el aviso no se cierra');
  B.rebuildScene();
  if (!B.groups.pts.children.length) throw new Error('la capa no volvió al quitar el fallo');
});
step('si la gráfica suelta el 3D, se dice, y al volver se quita el aviso', () => {
  const B = window.BARCOMP;
  /* El evento de verdad llega en diferido y este guion es síncrono, así que se
     dispara a mano: lo que se vigila es lo que hace el programa con él. */
  const cv = q('#vp'), nota = q('#vpnote');
  const perdido = new Event('webglcontextlost', { cancelable: true });
  cv.dispatchEvent(perdido);
  /* three también lo previene en su propia escucha, así que esto no vigila la
     línea de stage.ts sino el resultado: que nadie deje de hacerlo */
  if (!perdido.defaultPrevented) throw new Error('sin preventDefault el navegador no devuelve el contexto');
  if (nota.hidden || !nota.textContent.trim()) throw new Error('el 3D se perdió y no se dijo');
  cv.dispatchEvent(new Event('webglcontextrestored'));
  if (!nota.hidden) throw new Error('el contexto volvió y el aviso sigue');
  B.rebuildScene();
});

/* --- que se pueda leer, Fase 5.3 ------------------------------------------
   X-10, UX-07 y UX-08: la unidad de cada columna, el nombre de cada campo para
   un lector de pantalla, el aviso que se anuncia al aparecer, y la guía a un
   tamaño que se lee. Todo se mide en el DOM pintado, no en la plantilla. */
const cabeceras = () => [...q('#panes table.marks').querySelectorAll('thead th')];
const revisaCabeceras = (donde, minUnidades) => {
  const ths = cabeceras();
  const sinScope = ths.filter(t => t.getAttribute('scope') !== 'col').length;
  if (sinScope) throw new Error(`${donde}: ${sinScope} encabezados sin scope="col"`);
  const mudos = ths.filter(t => !t.textContent.trim() && !t.getAttribute('aria-label')).length;
  if (mudos) throw new Error(`${donde}: ${mudos} encabezados vacíos sin nombre`);
  const sinAyuda = ths.filter(t => t.textContent.trim() && !t.title)
    .map(t => t.textContent.trim()).filter(x => x !== 'Nombre');
  if (sinAyuda.length) throw new Error(`${donde}: sin title ${sinAyuda.join('|')}`);
  const u = ths.map(t => t.querySelector('.u')).filter(Boolean);
  if (u.length < minUnidades) {
    throw new Error(`${donde}: ${u.length} columnas con unidad: ${ths.map(t => t.textContent.trim()).join('|')}`);
  }
  if (getComputedStyle(u[0]).textTransform !== 'none') throw new Error(`${donde}: la unidad sale en mayúsculas`);
  return ths;
};
const sinNombre = () => [...document.querySelectorAll('#panes input, #panes select, #panes button')]
  .filter(el => !(el.getAttribute('aria-label') || el.closest('label') || el.textContent.trim()))
  .map(el => el.outerHTML.slice(0, 70));

step('las tablas de Fixture y Amarre dicen la unidad y qué es cada columna', () => {
  click('[data-md="model"]');
  click('#tabs [data-t="fixture"]');
  if (!S().fixture.length) click('#panes [data-a="seedped"]');
  const ths = revisaCabeceras('Fixture', 12);
  const delta = ths.find(t => /^Δ/.test(t.textContent.trim()));
  if (!delta) throw new Error('no está la columna Δ');
  if (delta.querySelector('.u').textContent !== '(°)') throw new Error('el Δ no dice grados: ' + delta.textContent);
  if (!delta.title) throw new Error('el Δ no explica qué es');
  const alto = ths.find(t => /^Alto/.test(t.textContent.trim()));
  if (!alto || alto.querySelector('.u').textContent !== '(mm)') throw new Error('«Alto» sin milímetros');
  click('#tabs [data-t="pins"]');
  if (!S().pins.length) click('#panes [data-a="seedpin"]');
  revisaCabeceras('Amarre', 10);
});
step('cada campo de Fixture y Amarre tiene nombre, y dice de qué fila es', () => {
  click('#tabs [data-t="fixture"]');
  let malos = sinNombre();
  if (malos.length) throw new Error('Fixture: ' + malos.length + ' sin nombre: ' + malos[0]);
  const p = S().fixture[1];
  const alto = q(`#panes input[data-pd="${p.id}"][data-k="h"]`).getAttribute('aria-label');
  if (!alto.includes(p.name) || !/Alto/.test(alto)) throw new Error('el campo se anuncia como ' + alto);
  click('#tabs [data-t="pins"]');
  check('#panes [data-ld="on"]', true);
  malos = sinNombre();
  check('#panes [data-ld="on"]', false);
  if (malos.length) throw new Error('Amarre: ' + malos.length + ' sin nombre: ' + malos[0]);
});
step('un aviso que aparece se anuncia solo', () => {
  click('#tabs [data-t="pins"]');
  check('#panes [data-ld="on"]', true);
  click('#panes [data-hv="free"]');
  const avisos = [...document.querySelectorAll('.warnbox')];
  const vuelve = () => { click('#panes [data-hv="held"]'); check('#panes [data-ld="on"]', false); };
  if (!avisos.length) { vuelve(); throw new Error('con «Libre» no apareció el aviso'); }
  const mudos = avisos.filter(w => w.getAttribute('role') !== 'alert').length;
  vuelve();
  if (mudos) throw new Error(mudos + ' avisos sin role="alert"');
});
step('la guía se lee, y el estado vacío no va en letra de nota', () => {
  click('#tabs [data-t="fixture"]');
  const guia = q('#panes .hintline');
  const px = parseFloat(getComputedStyle(guia).fontSize);
  if (px < 11) throw new Error('la guía mide ' + px + ' px');
  click('#panes [data-a="clearped"]');
  const vacio = document.querySelector('#panes .emptynote');
  const tam = vacio && parseFloat(getComputedStyle(vacio).fontSize);
  const color = vacio && getComputedStyle(vacio).color;
  const colorGuia = getComputedStyle(q('#panes .hintline')).color;
  click('#panes [data-a="seedped"]');
  if (!vacio || !vacio.textContent.trim()) throw new Error('sin pedestales no hay estado vacío');
  if (vacio.classList.contains('hintline')) throw new Error('el vacío sigue siendo una nota');
  if (tam < 12) throw new Error('el vacío mide ' + tam + ' px');
  if (color === colorGuia) throw new Error('el vacío tiene el color de la nota');
});

step('modelo nuevo y demo', () => {
  drawer('file'); click('[data-a="new"]'); click('[data-a="demo"]'); });
step('demo limpia las cotas', () => { if (S().marks.length) throw new Error('quedaron cotas'); });

/* --- la mordaza y un solo «apoya», 2026-09-15 ------------------------------
   X-04 y X-05, con la demo recién abierta: un pedestal suelto justo después de
   una estación hace palanca, lleva más que la pieza entera y la mordaza tira
   hacia abajo. Medido en Node antes de escribir esto: converge, 51 N sobre una
   pieza de 23.7 N, raíz −27.7 N. */
step('con la mordaza tirando hacia abajo, la pantalla lo dice con la cifra', () => {
  const B = window.BARCOMP;
  click('[data-md="model"]');
  click('#tabs [data-t="pins"]');
  const antes = { fix: S().fixture, load: S().load.on, rs: S().restraint.on };
  /* El RUMBO de la cuna es un dato desde el 2026-09-21 y hay que darlo: antes
     la chapa se apuntaba sola a la barra en cada repintado, asi que un pedestal
     escrito a mano salia siempre bien orientado. Se le pone el que la barra
     pide ahi —que es lo que el programa hacia solo— para que este caso siga
     midiendo la PALANCA y no un desvio de rumbo. */
  const pd = { id: 'pd1', name: 'Ped 1', visible: true,
               x: 352.85, y: 26.99, h: 333.66, tilt: 19.98, yaw: 0, pad: 60 };
  pd.yaw = +B.E.pedestalFit(B.placedPath(), S().model.section, pd).head.toFixed(2);
  S().fixture = [pd];
  S().restraint.on = false;
  S().load.on = true;
  B.renderAll();
  try {
    const R = B.heldResult();
    if (!R.ok) throw new Error('el caso de palanca no convergió');
    if (!(R.root < -0.05 * R.weight)) throw new Error('la raíz no tira hacia abajo: ' + R.root.toFixed(2));
    const aviso = [...document.querySelectorAll('#panes .warnbox')]
      .find(w => /ABAJO/.test(w.textContent));
    if (!aviso) throw new Error('la raíz es ' + R.root.toFixed(1) + ' N y no hay aviso');
    if (!aviso.textContent.includes((-R.root).toFixed(1))) throw new Error('el aviso no dice la cifra: ' + aviso.textContent);
    const chip = [...document.querySelectorAll('#panes .chip')].find(c => /mordaza/i.test(c.textContent));
    if (!chip || !chip.classList.contains('bad')) throw new Error('el chip de la mordaza no se pinta');
    /* X-05: el pedestal lleva peso, así que el 3D lo pinta como «apoya» */
    const caja = B.groups.fix.children[0];
    const esperado = getComputedStyle(document.documentElement).getPropertyValue('--fixture').trim().toLowerCase();
    if ('#' + caja.material.color.getHexString() !== esperado) {
      throw new Error('el pedestal lleva ' + R.pedN[0].toFixed(1) + ' N y el 3D no lo pinta como apoyo');
    }
  } finally {
    S().fixture = antes.fix; S().load.on = antes.load; S().restraint.on = antes.rs;
    B.renderAll();
  }
});

/* El id de un modelo tiene que ser SUYO. `newVid()` salia de un contador que
   `loadModel()` ponia en el NUMERO de variantes del documento —no en el mayor
   de sus ids— y que «Demo» y «Nuevo» bajaban a 1. Un documento con v2 y v3
   —que es justo lo que queda al borrar el modelo que no es referencia y
   duplicar otro— dejaba el contador en 2 y la copia siguiente nacia v3: dos
   tarjetas con el mismo id. Desde ahi ST.ref apuntaba a las DOS a la vez, las
   dos salian con la chapa de REFERENCIA y ninguna con el boton de fijarla —o
   sea no habia manera de volver a elegir cual era la referencia—, y borrar una
   borraba las dos, que filtran por id. Va al final del banco a proposito:
   carga la demo y eso tira el fixture y las piezas medidas. */
step('duplicar despues de cargar y deshacer no repite el id del modelo', () => {
  drawer('models');
  click('[data-a="vardup"]');                               // v1 + v2
  const otro = S().variants.find(v => v.id !== S().ref).id;
  drawer('models');
  click(`[data-vr="${otro}"]`);                             // la referencia es v2
  const noRef = S().variants.find(v => v.id !== S().ref).id;
  drawer('models');
  click(`[data-vx="${noRef}"]`);                            // fuera el que no lo es
  drawer('models');
  click('[data-a="vardup"]');                               // quedan v2 y v3
  drawer('file');
  click('[data-a="demo"]');                                 // esto rebajaba el contador
  hotkey('z', { ctrlKey: true });                           // y vuelven v2 y v3
  drawer('models');
  click('[data-a="vardup"]');
  const ids = S().variants.map(v => v.id);
  if (new Set(ids).size !== ids.length) throw new Error('dos modelos con el mismo id: ' + ids.join(','));
  drawer('models');
  const botones = document.querySelectorAll('#lf [data-vr]').length;
  if (botones !== ids.length - 1) {
    throw new Error(botones + ' botones de referencia para ' + ids.length + ' modelos');
  }
  /* y la referencia se puede mover a cualquiera de los otros dos */
  for (const id of ids.filter(v => v !== S().ref)) {
    drawer('models');
    click(`[data-vr="${id}"]`);
    if (S().ref !== id) throw new Error('la referencia no se movio a ' + id);
    const chapas = document.querySelectorAll('#lf .refbadge').length;
    if (chapas !== 1) throw new Error('hay ' + chapas + ' chapas de referencia');
  }
});
/* ------------------------------------------------------ la sección ------ */
/* `B` en el ámbito del bloque: los pasos de arriba lo declaran cada uno dentro
   del suyo, y estos son siete. */
const B = window.BARCOMP;

/* La sección vive en su PESTAÑA desde el 2026-09-18: era un cajón del menú de
   arriba y el taller lo devolvió porque la barra de menús se corta cuando la
   ventana no es ancha, así que el botón podía no verse. */
function pestSeccion() {
  click('[data-md="model"]');
  click('#tabs [data-t="section"]');
}
/* Deshacer por la PUERTA, no escribiendo en el estado: la sección efectiva se
   recalcula en `syncModel()`, así que dejar `base.section` a mano y repintar
   deja `ST.model` con la forma anterior y el paso siguiente mide otra pieza.
   Esto pasa por los mismos controles que usa quien está delante. */
function ponSeccion(sec) {
  pestSeccion();
  click(`#panes [data-sk="${sec.kind}"]`);
  for (const k of ['width', 'thickness', 'wall', 'chamfer', 'endLen']) {
    pestSeccion();
    const el = document.querySelector(`#panes input[data-s="${k}"]`);
    if (!el) continue;                       // el espesor no sale en una redonda
    el.value = String(sec[k]);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
/* La pestaña de la sección: elegir forma, medidas y pared, con el dibujo de la
   cara al lado. Va al final del banco a propósito, como el paso del id
   repetido: cambiar la barra a redonda mueve el peso, las inercias y la
   silueta, y no tiene sentido que los pasos de después midan una pieza
   distinta de la que midieron los de antes. Cada paso la deja como la
   encontró. */
step('la sección es una pestaña, no un cajón que la barra de menús pueda cortar', () => {
  if (document.querySelector('#hd .menubar [data-dr="section"]')) {
    throw new Error('sigue el botón del cajón');
  }
  const t = [...document.querySelectorAll('#tabs [data-t]')].map(b => b.dataset.t);
  if (!t.includes('section')) throw new Error('no está la pestaña: ' + t.join(','));
});
step('la pestaña de la sección se abre y trae la forma puesta', () => {
  pestSeccion();
  const botones = [...document.querySelectorAll('#panes [data-sk]')].map(b => b.dataset.sk);
  if (botones.join(',') !== 'rect,round') throw new Error('formas: ' + botones.join(','));
  const on = document.querySelector('#panes [data-sk].on');
  if (!on || on.dataset.sk !== S().model.section.kind) throw new Error('no marca la forma actual');
});
/* EL DIBUJO. Lo que se comprueba no es que haya un SVG: es que lo que se ve
   sea la pieza. El contorno sale de `sectionOutline()`, el mismo que barre el
   3D, así que la caja que lo envuelve tiene que medir ancho por espesor. */
step('el dibujo de la cara mide lo que mide la barra', () => {
  pestSeccion();
  const poly = q('#panes .secsvg .secout');
  const pts = poly.getAttribute('points').trim().split(/\s+/)
    .map(p => p.split(',').map(Number));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const anchoDib = Math.max(...xs) - Math.min(...xs);
  const grueso = Math.max(...ys) - Math.min(...ys);
  const sec = S().model.section;
  if (Math.abs(anchoDib - sec.width) > 1e-6) {
    throw new Error('el dibujo mide ' + anchoDib + ' de ancho y la barra ' + sec.width);
  }
  if (Math.abs(grueso - sec.thickness) > 1e-6) {
    throw new Error('el dibujo mide ' + grueso + ' de alto y la barra ' + sec.thickness);
  }
  /* y las cotas llevan el número, no un rótulo suelto */
  const cotas = [...document.querySelectorAll('#panes .secdim text')].map(t => t.textContent);
  if (!cotas.includes(sec.width.toFixed(1))) throw new Error('cotas: ' + cotas.join(' '));
});
step('teclear una medida redibuja la cara', () => {
  const antes = { ...S().model.section };
  try {
    pestSeccion();
    const vb0 = q('#panes .secsvg').getAttribute('viewBox');
    setval('#panes input[data-s="width"]', '60');
    const vb1 = q('#panes .secsvg').getAttribute('viewBox');
    if (vb0 === vb1) throw new Error('el dibujo no se movió: ' + vb1);
    const poly = q('#panes .secsvg .secout').getAttribute('points').trim().split(/\s+/)
      .map(p => Number(p.split(',')[0]));
    if (Math.abs((Math.max(...poly) - Math.min(...poly)) - 60) > 1e-6) {
      throw new Error('el contorno no siguió al campo');
    }
  } finally {
    ponSeccion(antes);
  }
});
step('las cifras de la pestaña son las del motor, no un texto suelto', () => {
  pestSeccion();
  const sec = S().model.section;
  const I = B.E.sectionI(sec);
  const txt = document.querySelector('#panes .grp .body').textContent.replace(/\s+/g, ' ');
  for (const n of [B.E.sectionArea(sec), I.Iz, I.Iy]) {
    /* se buscan con separador de millares, que es como las pinta fx() */
    const como = Math.round(n).toLocaleString('es-ES').replace(/ /g, ' ');
    const suelto = String(Math.round(n));
    if (!txt.includes(como) && !txt.includes(suelto)) {
      throw new Error('no está ' + suelto + ' en: ' + txt.slice(0, 200));
    }
  }
});
step('poner la barra redonda cambia el peso, iguala las inercias y redondea el dibujo', () => {
  const antes = { ...S().model.section };
  const pesaAntes = B.E.sectionArea(antes);
  try {
    pestSeccion();
    click('#panes [data-sk="round"]');
    const sec = S().model.section;
    if (sec.kind !== 'round') throw new Error('sigue en ' + sec.kind);
    const I = B.E.sectionI(sec);
    if (I.Iz !== I.Iy) throw new Error('las inercias no se igualaron');
    if (B.E.sectionArea(sec) === pesaAntes) throw new Error('el área no cambió');
    /* el dibujo deja de ser cuatro esquinas y la cota pasa a ser un diámetro */
    const n = q('#panes .secsvg .secout').getAttribute('points').trim().split(/\s+/).length;
    if (n < 24) throw new Error('el contorno sigue teniendo ' + n + ' puntos');
    const cotas = [...document.querySelectorAll('#panes .secdim text')].map(t => t.textContent);
    if (!cotas.some(c => c.startsWith('Ø'))) throw new Error('sin diámetro: ' + cotas.join(' '));
    /* y el aviso de que el rodado deja de significar lo que significaba */
    const aviso = [...document.querySelectorAll('#panes .warnbox')].map(w => w.textContent).join(' ');
    if (!/RODADO|ROLL|DREHUNG/.test(aviso)) throw new Error('sin aviso de la redonda: ' + aviso.slice(0, 120));
  } finally {
    ponSeccion(antes);
  }
});
step('en redonda no se enseña un espesor que no usa', () => {
  const antes = { ...S().model.section };
  try {
    pestSeccion();
    click('#panes [data-sk="round"]');
    if (document.querySelector('#panes input[data-s="thickness"]')) {
      throw new Error('sigue el campo de espesor');
    }
    if (!document.querySelector('#panes input[data-s="width"]')) throw new Error('no hay campo de diámetro');
  } finally {
    ponSeccion(antes);
  }
});
step('la pestaña Modelo resume la sección y ya no la edita dos veces', () => {
  click('#tabs [data-t="model"]');
  if (document.querySelector('#panes input[data-s]')) {
    throw new Error('la pestaña Modelo sigue editando la sección');
  }
  const txt = q('#panes .mhead').textContent.replace(/\s+/g, ' ');
  if (!txt.includes(String(S().model.section.width.toFixed(1)))) {
    throw new Error('no resume el ancho: ' + txt.slice(0, 160));
  }
});
step('una pared imposible sale topada, no con área negativa', () => {
  const antes = { ...S().model.section };
  try {
    pestSeccion();
    setval('#panes input[data-s="wall"]', '99');
    const sec = S().model.section;
    if (!(B.E.sectionArea(sec) > 0)) throw new Error('área ' + B.E.sectionArea(sec));
    if (sec.wall > Math.min(sec.width, sec.thickness) / 2 + 1e-9) throw new Error('pared ' + sec.wall);
  } finally {
    ponSeccion(antes);
  }
});
step('un tubo pesa menos, se le ve el hueco y lo dice el aviso de los umbrales', () => {
  const antes = { ...S().model.section };
  const macizo = B.E.sectionArea(antes);
  try {
    pestSeccion();
    if (document.querySelector('#panes .sechole')) throw new Error('una maciza no tiene hueco');
    setval('#panes input[data-s="wall"]', '2');
    const sec = S().model.section;
    if (!(B.E.sectionArea(sec) < macizo)) throw new Error('no adelgazó');
    if (!B.E.isHollow(sec)) throw new Error('no salió hueca');
    if (!document.querySelector('#panes .sechole')) throw new Error('el hueco no se dibujó');
    const aviso = [...document.querySelectorAll('#panes .warnbox')].map(w => w.textContent).join(' ');
    if (!/MACIZA|SOLID|MASSIVE/.test(aviso)) throw new Error('sin aviso del radio mínimo');
  } finally {
    ponSeccion(antes);
  }
});
/* SEC-05: la letra W/T elige el retorno elástico y la ganancia del lazo. En
   una redonda esa distinción no existe, y repartir por ella compensaba un
   doblez con el retorno del otro: 4.10° sobre el demo con sbT=2 y sbW=6. */
const insignias = () => [...document.querySelectorAll('#panes .ori')].map(t => t.textContent);
step('con una pletina, la tabla etiqueta cada doblez de canto o de plano', () => {
  click('#tabs [data-t="model"]');
  const tags = insignias();
  if (!tags.includes('W') || !tags.includes('T')) throw new Error('insignias: ' + tags.join(''));
});
step('con la barra redonda, la tabla deja de inventarse una cara', () => {
  const antes = { ...S().model.section };
  try {
    pestSeccion();
    click('#panes [data-sk="round"]');
    click('#tabs [data-t="model"]');
    const tags = insignias();
    if (!tags.length) throw new Error('sin insignias de orientación');
    if (tags.some(t => t !== 'Ø')) throw new Error('insignias: ' + tags.join(''));
  } finally {
    ponSeccion(antes);
  }
});
step('y el retorno elástico pasa de dos deslizadores a uno', () => {
  const antes = { ...S().model.section };
  try {
    click('[data-md="meas"]');
    if (!document.querySelector('[data-pr="sbW"]')) throw new Error('faltaba el de canto');
    click('[data-md="model"]');
    pestSeccion();
    click('#panes [data-sk="round"]');
    click('[data-md="meas"]');
    if (document.querySelector('[data-pr="sbW"]')) throw new Error('sigue el de canto');
    if (!document.querySelector('[data-pr="sbT"]')) throw new Error('no queda ninguno');
  } finally {
    click('[data-md="model"]');
    ponSeccion(antes);
  }
});
step('la forma viaja en el archivo y vuelve', () => {
  const antes = { ...S().model.section };
  try {
    pestSeccion();
    click('#panes [data-sk="round"]');
    setval('#panes input[data-s="wall"]', '2');
    const doc = JSON.parse(JSON.stringify(B.E.toDoc(S().model, S().command,
      S().comp, S().proc, [])));
    if (doc.schema !== 'barcomp/2.6') throw new Error('esquema ' + doc.schema);
    const vuelta = B.E.fromDoc(doc).model.section;
    if (vuelta.kind !== 'round' || vuelta.wall !== 2) throw new Error(JSON.stringify(vuelta));
  } finally {
    ponSeccion(antes);
  }
});


/* --- el aviso de pieza grande, 2026-09-19 ---------------------------------
   Medido en `tools/demo_escala.mjs`: asentar la pieza cuesta 49 ms con 15
   dobleces, 134 con 30, 954 con 34 y 16 s con 60, contra los 250 ms de
   presupuesto de la casa. Hasta hoy eso no se decía en ninguna parte, así que
   una pieza grande con la carga puesta se veía igual que un programa colgado.

   El aviso tiene que salir con el interruptor APAGADO, que es lo que este paso
   comprueba: sirve para decidir antes de encenderlo, no para explicar una
   espera que ya se sufrió. */
step('con muchos dobleces, la carga avisa de lo que va a costar antes de encenderla', () => {
  const lim = B.E.LOAD_SLOW_BENDS;
  /* Sin la constante no hay nada que comprobar, y callarlo dejaría el paso en
     verde por no haber podido mirar. */
  if (!Number.isFinite(lim)) throw new Error('el motor no publica LOAD_SLOW_BENDS');
  const avisos = () => [...document.querySelectorAll('#panes .warnbox')]
    .map(x => x.textContent.trim());
  try {
    click('[data-md="model"]');
    click('#tabs [data-t="pins"]');
    check('#panes [data-ld="on"]', false);
    const antes = avisos();
    if (S().model.bends.length > lim) throw new Error('la demo ya viene con más de ' + lim);

    click('#tabs [data-t="model"]');
    let guarda = 0;
    while (S().model.bends.length <= lim) {
      click('#panes [data-a="addb"]');
      if (++guarda > 80) throw new Error('no se pudo llegar a ' + lim + ' dobleces');
    }
    const n = S().model.bends.length;

    click('#tabs [data-t="pins"]');
    if (S().load.on) throw new Error('la carga se encendió sola: el aviso no valdría de nada');
    const nuevo = avisos().filter(t => !antes.includes(t));
    if (!nuevo.some(t => t.includes(String(n)) && t.includes(String(lim)))) {
      throw new Error(`con ${n} dobleces y la carga apagada, nada avisa de lo que cuesta: `
                      + (nuevo.join(' | ') || 'ningún aviso nuevo'));
    }
  } finally {
    drawer('file'); click('[data-a="new"]'); click('[data-a="demo"]');
  }
});


/* --- SEC-03: el sitio donde se teclea el radio mínimo de un tubo, 2026-09-19
   El criterio sigue sin existir —lo pide C.8 al taller— y por eso el umbral
   nace en 0, que significa no vigilar nada. Lo que este paso exige es que, en
   cuanto alguien teclee el suyo, sea un campo de VERDAD y no un adorno: que
   muerda en el aviso de fabricabilidad con la cifra dentro, y que la pestaña
   Sección deje de decir que el programa no lo juzga, porque con la cifra
   puesta sí lo juzga. */
step('el umbral de tubo se teclea, muerde, y cambia lo que dice la pestaña Sección', () => {
  const antes = { ...S().model.section };
  const txt = B.I18N[B.LANG.cur];
  try {
    ponSeccion({ ...antes, kind: 'round', width: 40, wall: 2 });
    /* En una redonda hay DOS avisos en la pestaña —el de las inercias iguales y
       este—, así que se busca por texto y no por ser el primero. */
    const avisos = () => [...document.querySelectorAll('#panes .warnbox')]
      .map(x => x.textContent.trim());
    if (!avisos().includes(txt.secHollowWarn.trim())) {
      throw new Error('el tubo sin umbral no avisa con palabras: ' + avisos().join(' | '));
    }

    click('#tabs [data-t="lims"]');
    setval('#panes [data-lm="tubeRfac"]', '3');
    if (S().lims.tubeRfac !== 3) throw new Error('ST.lims dice ' + S().lims.tubeRfac);

    /* 3 diámetros sobre un Ø40 son R120, y la demo dobla a R30 y R45. */
    click('#tabs [data-t="model"]');
    const av = document.querySelector('#fabnote .warnbox');
    if (!av) throw new Error('con R30 y un mínimo de 3 × Ø40 = R120, nada avisa');
    if (!av.textContent.includes('120')) {
      throw new Error('el aviso no dice el radio que hace falta: ' + av.textContent);
    }

    pestSeccion();
    const ahora = avisos();
    if (ahora.includes(txt.secHollowWarn.trim())) {
      throw new Error('con el umbral puesto sigue diciendo que no lo juzga');
    }
    const conCifra = txt.secHollowJudged.replace('{n}', '3').trim();
    if (!ahora.includes(conCifra)) {
      throw new Error('no dice con qué cifra juzga: ' + ahora.join(' | '));
    }
  } finally {
    click('#tabs [data-t="lims"]');
    setval('#panes [data-lm="tubeRfac"]', '0');
    ponSeccion(antes);
  }
});


/* --- Compensar con el fixture puesto, 2026-09-19 --------------------------
   El chip de estado ya decía desde X-09 QUÉ interruptor está puesto, y desde
   Compensar lleva a Amarre. Lo que no decía nadie es la consecuencia: el lazo
   recibe `M.bends` —el nominal LIBRE— y ni siquiera mira los interruptores, así
   que el 3D puede estar enseñando la pieza asentada mientras las correcciones
   se calculan contra otra. Y Compensar es el único modo donde se decide sobre
   material.

   Esto NO decide cuál de las dos formas debe mandar: esa pregunta sigue abierta
   en C.3 y la contesta el taller. Dice lo que el programa hace hoy. */
step('Compensar avisa de que corrige contra la pieza LIBRE aunque el 3D enseñe la sujeta', () => {
  const txt = B.I18N[B.LANG.cur];
  /* Sin la clave no hay aviso posible, y decirlo así vale más que un fallo de
     `undefined` tres líneas más abajo. */
  if (!txt.compHeld) throw new Error('el diccionario no trae compHeld: Compensar no puede avisar');
  const avisos = () => [...document.querySelectorAll('#panes .warnbox')]
    .map(x => x.textContent.trim());
  try {
    click('[data-md="model"]');
    click('#tabs [data-t="pins"]');
    check('#panes [data-ld="on"]', false);
    if (S().load.on || S().restraint.on) throw new Error('algún interruptor nació puesto');
    /* hace falta una pieza medida o Compensar no pinta la tabla */
    if (!S().datasets.length) { drawer('pieces'); click('[data-a="sim"]'); }

    click('[data-md="comp"]');
    if (avisos().includes(txt.compHeld.trim())) {
      throw new Error('avisa del fixture con los dos interruptores apagados');
    }
    click('[data-md="model"]');
    click('#tabs [data-t="pins"]');
    check('#panes [data-ld="on"]', true);
    click('[data-md="comp"]');
    if (!avisos().includes(txt.compHeld.trim())) {
      throw new Error('con la carga puesta, Compensar no dice contra qué corrige: '
                      + (avisos().join(' | ') || 'ningún aviso'));
    }
  } finally {
    click('[data-md="model"]');
    click('#tabs [data-t="pins"]');
    if (S().load.on) check('#panes [data-ld="on"]', false);
  }
});

/* LO QUE CUESTA DIBUJAR (2026-09-22, por la noche). Reconstruir la escena es
   lo que hace CADA tecla que se pulsa en la tabla, así que su coste es el
   tirón que se nota al recorrerla. Con 30 dobleces, 4 modelos y 3 piezas
   costaba 41.5 ms por tecla. Estos dos pasos vigilan las dos cosas que lo
   explicaban; los dos fallan contra la versión anterior. */
step('los puntos PI comparten UNA esfera, no una por punto', () => {
  const B = window.BARCOMP;
  if (!S().layers.pts.on) throw new Error('la capa de puntos está apagada: el paso no prueba nada');
  B.rebuildScene();
  const mallas = B.groups.pts.children.slice();
  if (mallas.length < 10) throw new Error('solo hay ' + mallas.length + ' puntos: el paso no prueba nada');
  const geos = new Set(mallas.map(o => o.geometry));
  /* Una esfera de 12x10 por punto son unos 400 indices cada una, construidos,
     subidos a la tarjeta y destruidos en cada reconstruccion. Y three clona
     una geometria PARAMETRICA llamando otra vez al constructor sin argumentos,
     o sea teselando una esfera de 32x16 entera para pisarla acto seguido. */
  if (geos.size !== 1) {
    throw new Error(mallas.length + ' puntos reparten ' + geos.size + ' geometrias, y deberian compartir 1');
  }
  /* y compartirla no puede dejar la escena sin puntos al vaciar el grupo */
  B.rebuildScene();
  if (B.groups.pts.children.length !== mallas.length) {
    throw new Error('tras reconstruir quedan ' + B.groups.pts.children.length
                    + ' puntos y antes habia ' + mallas.length);
  }
  const g = B.groups.pts.children[0].geometry.getAttribute('position');
  if (!g || !g.count) throw new Error('la esfera compartida se quedo sin vertices: la tiraron al vaciar');
});

/* GUARDA, no prueba: esto ya funcionaba. Se escribe porque compartir la esfera
   es justo lo que podria romperlo —el `raycast` de three usa la esfera
   envolvente de la GEOMETRIA, que ahora es la misma para los doscientos
   puntos— y no habia ni un paso que pinchara en el 3D. */
step('pinchar una esfera en el 3D sigue seleccionando su doblez', () => {
  const B = window.BARCOMP;
  if (!S().layers.pts.on) throw new Error('la capa de puntos esta apagada: el paso no prueba nada');
  B.rebuildScene();
  const lienzo = B.renderer.domElement;
  const r = lienzo.getBoundingClientRect();
  if (!r.width || !r.height) throw new Error('el lienzo no tiene tamano: el paso no prueba nada');
  /* la esfera del PI de un doblez concreto, proyectada a pixeles */
  const objetivo = 5;
  const malla = B.groups.pts.children.find(o => o.userData.pi === objetivo + 1);
  if (!malla) throw new Error('no hay esfera para el doblez ' + objetivo);
  /* sin un cuadro dibujado por medio las matrices de mundo son las de antes de
     colgar las esferas: hay que forzarlas antes de proyectar Y antes de pinchar */
  B.scene.updateMatrixWorld(true);
  const v = malla.position.clone().applyMatrix4(malla.parent.matrixWorld);
  v.project(B.camera);
  const x = r.left + (v.x + 1) / 2 * r.width;
  const y = r.top + (1 - v.y) / 2 * r.height;
  const antes = S().sel;
  S().sel = -1;
  /* OrbitControls tambien escucha `pointerdown` y pide setPointerCapture, que
     con un evento sintetico revienta porque no hay puntero de verdad. No es lo
     que se prueba aqui: se calla durante el pinchazo y se devuelve. */
  const captura = lienzo.setPointerCapture;
  lienzo.setPointerCapture = () => {};
  try {
    lienzo.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: x, clientY: y, bubbles: true, cancelable: true,
    }));
  } finally { lienzo.setPointerCapture = captura; }
  if (S().sel !== objetivo) {
    const dicho = S().sel;
    S().sel = antes;
    throw new Error('pinchando el PI del doblez ' + objetivo + ' quedo seleccionado ' + dicho);
  }
  S().sel = antes;
});

step('el alambre saca las MISMAS aristas que three, vertice a vertice', () => {
  const B = window.BARCOMP;
  /* `edgesGeometry()` reescribe a mano `EdgesGeometry` para quitarle las tres
     cadenas de texto por triangulo. Era el 58 % de lo que costaba reconstruir,
     y es tambien un algoritmo de libreria reescrito a mano: se compara contra
     el original, que sigue en el paquete solo para esto. */
  B.rebuildScene();
  let n = 0;
  for (const k in B.groups) {
    B.groups[k].traverse(o => {
      const geo = o.geometry;
      /* solo mallas de triangulos: la rejilla son LINEAS, y su bufer ni
         siquiera es multiplo de 3 —164 vertices—, asi que las dos versiones
         leen fuera del bufer en el ultimo triangulo y leen basura distinta.
         Nadie fantasmea la rejilla. */
      if (!geo || !geo.getAttribute('position') || !o.isMesh) return;
      const cuenta = geo.index ? geo.index.count : geo.getAttribute('position').count;
      if (cuenta % 3) return;
      const a = B.edgesRef(geo).getAttribute('position');
      const b = B.edgesGeometry(geo, 28).getAttribute('position');
      n++;
      if (a.count !== b.count) {
        throw new Error('en ' + k + ': three saca ' + a.count + ' vertices y nosotros ' + b.count);
      }
      for (let i = 0; i < a.count * 3; i++) {
        if (a.array[i] !== b.array[i]) {
          throw new Error('en ' + k + ', vertice ' + i + ': ' + a.array[i] + ' vs ' + b.array[i]);
        }
      }
    });
  }
  if (n < 5) throw new Error('solo se compararon ' + n + ' mallas: el paso no prueba nada');
});

/* --- el reporte reescrito, 2026-09-24 --------------------------------------
   report.ts dejo de abrir ventana: reportHtml() devuelve el HTML entero como
   cadena y por eso se puede leer aqui, headless. Estos cinco pasos van al
   final a proposito, igual que la seccion y el id repetido de arriba: leen el
   modelo y los modelos encendidos tal como los dejo el resto del banco, y el
   que toca variants (el tercero) tiene que devolverlos exactamente como los
   encontro o rompe cualquier paso de mas arriba que cuenta variantes. */

/* un escape minimo, igual al de src/safe.ts: el reporte pasa el nombre del
   modelo por esc() antes de meterlo en el <h1>, asi que compararlo contra el
   nombre crudo fallaria si alguna vez lleva &, <, > o ". */
const escRep = s => String(s).replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

step('el reporte se titula con el NOMBRE del modelo', () => {
  const B = window.BARCOMP;
  const nombre = escRep(S().model.name);
  const html = B.reportHtml();
  if (!html.includes(`<h1>${nombre}</h1>`)) {
    throw new Error('el <h1> no es "' + nombre + '": '
      + ((html.match(/<h1>[^<]*<\/h1>/) || [])[0] || 'sin h1'));
  }
  if (!html.includes(`<title>${nombre}</title>`)) {
    throw new Error('el <title> no es "' + nombre + '": '
      + ((html.match(/<title>[^<]*<\/title>/) || [])[0] || 'sin title'));
  }
});

step('el reporte NO habla de compensacion ni de maquina', () => {
  const B = window.BARCOMP;
  // el reporte ya no habla de compensar, de maquina ni de la pieza medida
  // (ver la cabecera de report.ts): esto vigila que ninguna de las cuatro
  // claves de ese vocabulario se cuele de vuelta
  const txt = B.I18N[B.LANG.cur];
  const html = B.reportHtml();
  for (const k of ['cNew', 'formula', 'cmdTbl', 'cNow']) {
    if (!txt[k]) continue;                       // clave que no existe en este idioma
    if (html.includes(txt[k])) {
      throw new Error('sale el texto de "' + k + '": ' + txt[k]);
    }
  }
});

step('el reporte compara SOLO los modelos encendidos', () => {
  const B = window.BARCOMP;
  // se guarda TODO lo que hace falta para devolver el documento igual que
  // estaba: variants es la lista que cuentan los pasos de mas arriba, y
  // active/ref son los que activa vardup() y no los toca nadie mas aqui
  const variantesAntes = S().variants.slice();
  const activoAntes = S().active;
  const refAntes = S().ref;
  try {
    drawer('models');
    click('[data-a="vardup"]');
    const nuevoId = S().active;                  // vardup() activa la copia
    if (!S().variants.find(v => v.id === nuevoId)) throw new Error('la copia no aparecio en variants');
    /* nombre UNICO a proposito: vardup() nombra la copia «‹nombre› · N», y con
       varios modelos sobrantes de pasos anteriores ese nombre puede coincidir
       con el de OTRO modelo que sigue encendido -era justo lo que rompia este
       paso, «sigue saliendo» por un nombre ajeno, no por el de la copia-. */
    drawer('models');
    setval(`#lf input[data-vn="${nuevoId}"]`, 'PROBE_COMPARATIVA_UNICA');
    const nuevo = S().variants.find(v => v.id === nuevoId);
    if (nuevo.name !== 'PROBE_COMPARATIVA_UNICA') {
      throw new Error('el renombrado no cuajo: quedo "' + nuevo.name + '"');
    }
    if (!nuevo.visible) {
      drawer('models');
      click(`#lf input[data-vv="${nuevoId}"]`);
      if (!S().variants.find(v => v.id === nuevoId).visible) {
        throw new Error('la copia nacio apagada y el clic no la encendio');
      }
    }
    /* vardup() deja la copia como MODELO ACTIVO, y el <h1>/tabla de arriba del
       reporte son siempre los del activo -visible o no-: apagar la copia sin
       moverse de ella no la quita del reporte, la deja de ACTIVA e invisible
       a la vez, y el <h1> la sigue enseñando. Se vuelve al modelo de antes
       para que "apagar" signifique lo que este paso quiere comprobar. */
    drawer('models');
    click(`[data-vsel="${activoAntes}"]`);
    if (S().active !== activoAntes) {
      throw new Error('no se pudo volver a activar el modelo original');
    }
    const nombreNuevo = escRep(nuevo.name);
    /* Se cuenta por `data-mrow`, la fila de la tabla de modelos de arriba, y no
       por los bloques de columnas de las tres tablas anchas: cuando todos los
       modelos pintan lo MISMO esas tablas colapsan a un solo bloque -que es
       justo lo que pasa con una copia recien hecha, que no tiene ningun delta-
       y entonces la copia no tiene bloque propio en ninguna. La tabla de
       modelos, en cambio, lista siempre exactamente los encendidos. */
    const modelos = h => new Set(h.match(/data-mrow="[^"]*"/g) || []).size;
    const encendidos = () => S().variants.filter(v => v.visible).length;
    let html = B.reportHtml();
    if (!html.includes(nombreNuevo)) {
      throw new Error('con la copia encendida no sale su nombre "' + nuevo.name + '" en el reporte');
    }
    if (!html.includes('data-mrow="' + nuevoId + '"')) {
      throw new Error('la copia encendida no aparece en la tabla de modelos');
    }
    if (modelos(html) !== encendidos()) {
      throw new Error('hay ' + encendidos() + ' modelos encendidos y ' + modelos(html) + ' en el reporte');
    }
    drawer('models');
    click(`#lf input[data-vv="${nuevoId}"]`);      // se apaga la copia
    if (S().variants.find(v => v.id === nuevoId).visible) {
      throw new Error('el clic no apago la copia');
    }
    html = B.reportHtml();
    if (html.includes(nombreNuevo)) {
      throw new Error('apagada, el nombre "' + nuevo.name + '" sigue saliendo en el reporte');
    }
    if (html.includes('data-mrow="' + nuevoId + '"')) {
      throw new Error('apagada, la copia sigue en la tabla de modelos');
    }
    if (modelos(html) !== encendidos()) {
      throw new Error('apagada: ' + encendidos() + ' modelos encendidos y ' + modelos(html) + ' en el reporte');
    }
  } finally {
    // se borra la copia devolviendo la lista, no filtrandola: asi vuelve
    // tambien el orden y cualquier otro campo que este paso no toco
    S().variants = variantesAntes;
    S().active = activoAntes;
    S().ref = refAntes;
    window.BARCOMP.renderAll();
  }
});

step('las capturas del reporte pesan menos que el lienzo entero', () => {
  const B = window.BARCOMP;
  // 700 y no 1100: el lienzo del banco headless anda por los 900px de ancho,
  // y con un maxW mayor que el lienzo captureViews() no reescala nada y la
  // comparacion no probaria el reescalado, solo el cambio de formato
  const entero = B.captureViews(['iso'], {})[0][1].length;
  const chico = B.captureViews(['iso'], { maxW: 700, tipo: 'image/jpeg', calidad: .92 })[0][1].length;
  log.push('     iso: ' + (entero / 1024).toFixed(1) + ' KB entero vs '
    + (chico / 1024).toFixed(1) + ' KB a 700px jpeg');
  if (!(chico < entero)) {
    throw new Error('el PNG entero pesa ' + (entero / 1024).toFixed(1)
      + ' KB y el JPEG a 700px pesa ' + (chico / 1024).toFixed(1) + ' KB: no bajo');
  }
});

/* GUARDA, no prueba: hoy el numero que pinta el 3D y el de la tabla ya
   coinciden. Se escribe porque salen de dos sitios distintos del codigo
   -drawLabels() por un lado, la fila de la tabla por otro- y nada impide que
   algun dia se separen sin que ningun otro paso lo note. */
step('las B del 3D dicen lo mismo que las de la tabla', () => {
  const B = window.BARCOMP;
  const lblAntes = S().layers.lbl.on;
  try {
    S().layers.lbl.on = true;
    B.rebuildScene();
    B.renderer.render(B.scene, B.camera);
    B.drawLabels();                                // el render es bajo demanda
    const del3D = [...document.querySelectorAll('#labels .lbl')]
      .map(el => el.textContent.trim())
      .filter(t => /^B\d+$/.test(t))
      .sort((a, b) => +a.slice(1) - +b.slice(1));
    click('[data-md="model"]');
    click('#tabs [data-t="model"]');               // la tabla de dobleces vive aqui
    const deLaTabla = [...document.querySelectorAll('#panes table.lra tbody tr td:first-child')]
      .map(td => td.textContent.trim())
      .filter(t => /^B\d+$/.test(t))
      .sort((a, b) => +a.slice(1) - +b.slice(1));
    if (!del3D.length || !deLaTabla.length) {
      throw new Error('3D: ' + del3D.length + ' B, tabla: ' + deLaTabla.length + ' B: el paso no prueba nada');
    }
    if (del3D.join(',') !== deLaTabla.join(',')) {
      throw new Error('el 3D dice [' + del3D.join(',') + '] y la tabla [' + deLaTabla.join(',') + ']');
    }
  } finally {
    S().layers.lbl.on = lblAntes;
  }
});

/* EL PUNTO ENTERO de que sean tres tablas con las mismas columnas: quien lee
   suma la fila TOTAL de la primera con la de la segunda y le tiene que salir
   la de la tercera. Si alguna columna dejara de calcularse como `total - base`
   y se fuera por su lado, las tres tablas dejarian de cuadrar y nadie lo
   notaria mirandolas. Aqui se comprueba celda a celda.

   Una tabla puede venir COLAPSADA a un solo bloque cuando todos los modelos
   pintan lo mismo -lo normal en la primera, porque las variantes son delta
   sobre una base comun-. Ese bloque unico vale para todos, asi que cuando una
   tabla trae menos bloques que otra se reutiliza el ultimo que tiene. */
step('TOTAL de la tabla 1 mas la 2 da la de la 3', () => {
  const B = window.BARCOMP;
  const doc = new DOMParser().parseFromString(B.reportHtml(), 'text/html');
  /* las tres anchas son las que tienen fila TOTAL; la de resumen no */
  const anchas = [...doc.querySelectorAll('table')].filter(t => t.querySelector('tr.tot'));
  if (anchas.length !== 3) throw new Error('hay ' + anchas.length + ' tablas con fila TOTAL y deberian ser 3');
  const leer = t => {
    const nb = t.querySelectorAll('thead tr:first-child th[colspan]').length;
    if (!nb) throw new Error('una tabla no tiene bloques de columnas');
    /* se saltan las dos primeras celdas, que son el rotulo y la columna Or.;
       el guion es un cero */
    const cel = [...t.querySelector('tr.tot').querySelectorAll('td')].slice(2)
      .map(td => { const x = td.textContent.trim(); return x === '—' ? 0 : parseFloat(x.replace('+', '')); });
    if (cel.length % nb) throw new Error('la fila TOTAL tiene ' + cel.length + ' celdas y ' + nb + ' bloques');
    const ancho = cel.length / nb;
    const bloques = [];
    for (let i = 0; i < nb; i++) bloques.push(cel.slice(i * ancho, (i + 1) * ancho));
    return bloques;
  };
  const [A, Bq, C] = anchas.map(leer);
  const n = Math.max(A.length, Bq.length, C.length);
  if (!n || !A[0].length) throw new Error('la fila TOTAL vino vacia: el paso no prueba nada');
  const bloque = (t, k) => t[Math.min(k, t.length - 1)];
  for (let k = 0; k < n; k++) {
    const a = bloque(A, k), b = bloque(Bq, k), c = bloque(C, k);
    if (a.length !== b.length || b.length !== c.length) {
      throw new Error('bloque ' + k + ': ' + a.length + '/' + b.length + '/' + c.length + ' celdas');
    }
    for (let i = 0; i < a.length; i++) {
      if (Number.isNaN(a[i]) || Number.isNaN(b[i]) || Number.isNaN(c[i])) {
        throw new Error('bloque ' + k + ' celda ' + i + ' no es un numero: '
          + a[i] + ' / ' + b[i] + ' / ' + c[i]);
      }
      /* 0.011 y no 0.005: las celdas se imprimen redondeadas a dos decimales,
         asi que dos sumandos redondeados pueden separarse una centesima cada uno */
      if (Math.abs(a[i] + b[i] - c[i]) > 0.011) {
        throw new Error('bloque ' + k + ' celda ' + i + ': ' + a[i] + ' + ' + b[i]
          + ' = ' + (a[i] + b[i]) + ' pero la tabla 3 dice ' + c[i]);
      }
    }
  }
});

/* La primera tabla es el modelo SIN compensar, y las variantes son delta sobre
   una base comun: lo normal es que salga identica en todos los encendidos.
   Repetirla una vez por modelo es ancho gastado en decir lo mismo, asi que
   colapsa a un bloque. Este paso comprueba las dos mitades de la regla -que
   con bases iguales colapsa, y que en cuanto una base cambia se vuelve a
   abrir- porque un colapso que no se reabre esconderia una diferencia real. */
step('con la misma base, la tabla 1 pinta UN bloque y no uno por modelo', () => {
  const B = window.BARCOMP;
  const variantesAntes = S().variants.slice();
  const activoAntes = S().active;
  const refAntes = S().ref;
  const bloquesT1 = () => {
    const doc = new DOMParser().parseFromString(B.reportHtml(), 'text/html');
    const t = [...doc.querySelectorAll('table')].filter(x => x.querySelector('tr.tot'))[0];
    if (!t) throw new Error('no hay tabla 1');
    return t.querySelectorAll('thead tr:first-child th[colspan]').length;
  };
  try {
    drawer('models');
    click('[data-a="vardup"]');
    const nuevoId = S().active;
    const nuevo = S().variants.find(v => v.id === nuevoId);
    if (!nuevo) throw new Error('la copia no aparecio en variants');
    if (!nuevo.visible) { drawer('models'); click(`#lf input[data-vv="${nuevoId}"]`); }
    const encendidos = S().variants.filter(v => v.visible).length;
    if (encendidos < 2) throw new Error('solo hay ' + encendidos + ' modelo encendido: el paso no prueba nada');
    /* la copia nace SIN deltas y con la misma base, asi que la tabla 1 de los
       dos es la misma y tiene que colapsar */
    const colapsada = bloquesT1();
    if (colapsada !== 1) {
      throw new Error('con ' + encendidos + ' modelos de base identica la tabla 1 trae '
        + colapsada + ' bloques y deberia traer 1');
    }
    /* y ahora se le cambia la BASE a la copia -no un delta, que no toca la
       tabla 1- y tiene que volver a abrirse */
    nuevo.base.bends[0].angle = nuevo.base.bends[0].angle + 7.5;
    B.renderAll();
    const abierta = bloquesT1();
    if (abierta !== encendidos) {
      throw new Error('con una base distinta la tabla 1 trae ' + abierta
        + ' bloques y deberia traer ' + encendidos);
    }
  } finally {
    S().variants = variantesAntes;
    S().active = activoAntes;
    S().ref = refAntes;
    window.BARCOMP.renderAll();
  }
});

/* --- el diseno de telefono, 2026-09-24 -------------------------------------
   La rejilla de MODELAR pide 320 px de 3D MAS 760 px de tabla: en una ventana
   de 390 px la tabla arranca en x = 320 con 760 px de ancho, y como `#app` es
   una rejilla de alto 100vh el documento no desplaza en X, asi que 690 px de
   tabla quedan FUERA DE ALCANCE. Ni tocandola se llega. El diseno de telefono
   apila la pantalla en una sola columna.

   Estos pasos FUERZAN `ST.phone` a mano en vez de estrechar la ventana: el CSS
   cuelga de `#app.phone` y no de una `@media` justo para que esto se pueda
   probar desde dentro de la pagina. Se mide siempre contra innerWidth /
   innerHeight -el banco corre en una ventana de escritorio- y nunca contra
   390 px: lo que se comprueba es «llena el ancho», no «mide 390».

   Todo paso que enciende la bandera la apaga en su `finally`, y devuelve el
   modo que encontro: si no, el resto del guion mediria un telefono.        */
const telOn = () => { S().phone = true; window.BARCOMP.renderAll(); };
const telOff = () => { S().phone = false; window.BARCOMP.renderAll(); };
/* «se ve» es display, visibility Y ancho real: un boton puede estar pintado y
   medir 0 px, y eso no se ve. Devuelve tambien las cifras, que son las que
   tiene que llevar el mensaje del fallo. */
const seVe = sel => {
  const el = q(sel);
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    ok: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0,
    display: cs.display, ancho: r.width,
  };
};
/* las pistas de columna de la rejilla, ya resueltas a px por el navegador */
const pistas = () => getComputedStyle(q('#app')).gridTemplateColumns
  .trim().split(/\s+/).filter(Boolean);

step('en telefono el #app es de UNA columna y en escritorio de dos', () => {
  const modo = S().mode;
  try {
    click('[data-md="model"]');
    const escr = pistas();
    if (escr.length !== 2) {
      throw new Error('sin phone, Modelar reparte ' + escr.length + ' pistas de columna ('
        + escr.join(' + ') + ') y deberian ser 2');
    }
    telOn();
    const tel = pistas();
    if (tel.length !== 1) {
      throw new Error('con phone, el #app reparte ' + tel.length + ' pistas de columna ('
        + tel.join(' + ') + ') y deberia ser 1');
    }
  } finally { telOff(); click(`[data-md="${modo}"]`); }
});

step('en telefono ninguna banda se sale del ancho de la ventana', () => {
  const modo = S().mode;
  try {
    telOn();
    for (const m of ['model', 'meas', 'comp']) {
      click(`[data-md="${m}"]`);
      /* la banda de panel cambia con el modo: en Medir manda el lateral */
      for (const sel of ['#hd', '#ct', '#st', m === 'meas' ? '#rt' : '#bt']) {
        const el = q(sel);
        /* lo que el modo no usa se oculta, y lo oculto no se sale de nada */
        if (getComputedStyle(el).display === 'none') continue;
        const r = el.getBoundingClientRect();
        if (r.right > innerWidth + 1) {
          throw new Error(m + ': ' + sel + ' llega hasta x = ' + r.right.toFixed(0)
            + ' px con la ventana en ' + innerWidth + ' px, o sea se sale '
            + (r.right - innerWidth).toFixed(0) + ' px');
        }
      }
    }
  } finally { telOff(); click(`[data-md="${modo}"]`); }
});

/* El fallo que abrio todo esto: la tabla existia, se pintaba y no habia forma
   humana de llegar a ella. Que empiece en 0 y mida la ventana es LA condicion
   de que se pueda tocar. */
step('en telefono la tabla de Modelar se alcanza entera', () => {
  const modo = S().mode;
  try {
    click('[data-md="model"]');
    telOn();
    const r = q('#bt').getBoundingClientRect();
    if (Math.abs(r.left) > 1) {
      throw new Error('la tabla arranca en x = ' + r.left.toFixed(0)
        + ' px en vez de 0, y la ventana mide ' + innerWidth + ' px');
    }
    if (Math.abs(r.width - innerWidth) > 1) {
      throw new Error('la tabla mide ' + r.width.toFixed(0) + ' px de ancho en una ventana de '
        + innerWidth + ' px: se separan ' + Math.abs(r.width - innerWidth).toFixed(0) + ' px');
    }
  } finally { telOff(); click(`[data-md="${modo}"]`); }
});

/* Apilar no puede significar dejar el 3D en una raja: mirar la pieza es la
   mitad del trabajo tambien en el telefono. */
step('en telefono el 3D sigue en pantalla', () => {
  const modo = S().mode;
  try {
    telOn();
    for (const m of ['model', 'meas', 'comp']) {
      click(`[data-md="${m}"]`);
      const h = q('#ct').getBoundingClientRect().height;
      if (!(h > 100)) {
        throw new Error(m + ': el 3D se quedo en ' + h.toFixed(0) + ' px de alto (ventana de '
          + innerHeight + ' px) y no puede bajar de 100');
      }
    }
  } finally { telOff(); click(`[data-md="${modo}"]`); }
});

/* La cinta y los dos tiradores son de raton y de pantalla ancha: en una sola
   columna no reparten nada y solo comen alto. */
step('en telefono no se pintan la cinta ni los dos tiradores', () => {
  const modo = S().mode;
  try {
    click('[data-md="model"]');
    telOn();
    for (const sel of ['#rb', '#rtgrip', '#btgrip']) {
      const el = q(sel);
      const d = getComputedStyle(el).display;
      if (d !== 'none') {
        const caja = el.getBoundingClientRect();
        throw new Error(sel + ' se sigue pintando con display:' + d + ' y ocupa '
          + caja.height.toFixed(0) + ' px de alto por ' + caja.width.toFixed(0) + ' px de ancho');
      }
    }
  } finally { telOff(); click(`[data-md="${modo}"]`); }
});

/* Los dos se pintan SIEMPRE -la barra y el boton- y es el CSS el que elige
   cual se ve. Por eso el paso mira las dos mitades: si solo mirase la del
   telefono, una regla que dejara los dos puestos pasaria. */
step('en telefono la cabecera cambia la barra de menus por un boton', () => {
  const modo = S().mode;
  try {
    click('[data-md="model"]');
    telOff();
    const bEscr = seVe('#hd [data-dr="menu"]');
    const barraEscr = seVe('#hd .menubar');
    if (bEscr.ok) {
      throw new Error('sin phone el boton de menu se ve: display:' + bEscr.display
        + ' y ' + bEscr.ancho.toFixed(0) + ' px de ancho');
    }
    if (!barraEscr.ok) {
      throw new Error('sin phone la barra de menus no se ve: display:' + barraEscr.display
        + ' y ' + barraEscr.ancho.toFixed(0) + ' px de ancho');
    }
    telOn();
    const bTel = seVe('#hd [data-dr="menu"]');
    const barraTel = seVe('#hd .menubar');
    if (!bTel.ok) {
      throw new Error('con phone el boton de menu no se ve: display:' + bTel.display
        + ' y ' + bTel.ancho.toFixed(0) + ' px de ancho');
    }
    if (barraTel.ok) {
      throw new Error('con phone la barra de menus se sigue viendo: display:' + barraTel.display
        + ' y ' + barraTel.ancho.toFixed(0) + ' px de ancho');
    }
  } finally { telOff(); click(`[data-md="${modo}"]`); }
});

/* El cajon de menu es la cabecera entera doblada: los cuatro menus, el tema y
   el idioma. Y desde un cajon cualquiera hay que poder volver a el, que si no
   el telefono se queda sin barra y sin vuelta. */
step('el cajon de menu trae los cuatro menus, el tema y el idioma', () => {
  const modo = S().mode, cajonAntes = S().drawer;
  try {
    click('[data-md="model"]');
    telOn();
    drawer('menu');
    if (S().drawer !== 'menu') throw new Error('el boton no abrio el cajon: ST.drawer = ' + S().drawer);
    const faltan = ['file', 'models', 'view', 'pieces']
      .filter(k => !document.querySelector(`#lf [data-dr="${k}"]`));
    if (faltan.length) {
      throw new Error('al cajon de menu le faltan ' + faltan.length + ' menus de 4: ' + faltan.join(','));
    }
    const th = document.querySelectorAll('#lf [data-th]').length;
    if (th !== 3) throw new Error('el cajon de menu trae ' + th + ' botones de tema y deberia traer 3');
    const idi = document.querySelectorAll('#lf [data-l]').length;
    const langs = document.querySelectorAll('#hd [data-l]').length;
    if (idi !== langs) {
      throw new Error('el cajon de menu trae ' + idi + ' botones de idioma y hay ' + langs + ' idiomas');
    }
    /* el cajon de escritorio es una columna de --lfW sobre el 3D; en telefono
       no hay 3D al lado que dejar asomando, asi que llena el ancho */
    const r = q('#lf').getBoundingClientRect();
    if (r.left > 1 || r.right < innerWidth - 1) {
      throw new Error('el cajon va de x = ' + r.left.toFixed(0) + ' a ' + r.right.toFixed(0)
        + ' px en una ventana de ' + innerWidth + ' px: le faltan '
        + (innerWidth - r.width).toFixed(0) + ' px de ancho');
    }
    click('#lf [data-dr="file"]');
    if (S().drawer !== 'file') throw new Error('el menu Archivo no abrio su cajon: ST.drawer = ' + S().drawer);
    const volver = document.querySelectorAll('#lf [data-dr="menu"]').length;
    if (volver !== 1) {
      throw new Error('el cajon Archivo trae ' + volver
        + ' botones de volver al menu dentro de #lf y deberia traer 1');
    }
  } finally {
    S().drawer = cajonAntes;
    telOff();
    click(`[data-md="${modo}"]`);
  }
});

/* --- el reporte se pinta en la pagina, ya no en ventana aparte, 2026-09-24 --
   Medido: `window.open('', '_blank')` vuelve `null` en cuanto el navegador
   bloquea la ventana emergente, y lo unico que pasaba entonces era un alert
   con el TITULO «Reporte de modelo» -no un mensaje- mientras el reporte no
   aparecia por ningun lado. Un telefono bloquea esa ventana a menudo, asi que
   el camino de siempre era justo el que fallaba en un telefono.

   Ahora `makeReport()` no llama a `window.open`: mete un `#repov` en el body,
   `position:fixed;inset:0`, con un `#repfr` adentro que llena el overlay y
   lleva el reporte escrito por `contentDocument.open()/write()/close()`, que
   es sincrono -no hace falta esperar ningun `load`. Un solo camino, igual en
   telefono que en escritorio. */
const contarOpen = () => {
  /* la cabecera ya puso un doble de window.open (linea 7); aqui se envuelve
     ESE doble con un contador y se devuelve el mismo doble en el finally,
     para no dejarle a los pasos de mas abajo un window.open distinto del que
     arranco el guion */
  const doble = window.open;
  let n = 0;
  window.open = (...a) => { n++; return doble(...a); };
  return { cuenta: () => n, deshacer: () => { window.open = doble; } };
};
/* genera el reporte UNA vez -tarda, porque captura tres vistas del 3D en
   JPEG- y abre el cajon Archivo, que es por donde cuelga el boton */
const abreReporte = () => { drawer('file'); click('[data-a="report"]'); };
/* quita el overlay si quedo abierto, sin pasar por su boton de cerrar: es lo
   que usan los `finally` para no envenenar los pasos siguientes */
const cierraReporte = () => {
  const v = document.getElementById('repov');
  if (v) v.remove();
};

step('el reporte se pinta en la pagina: no llama a window.open y aparece #repov con su iframe', () => {
  const c = contarOpen();
  try {
    abreReporte();
    const v = document.getElementById('repov');
    if (!v || c.cuenta() > 0) {
      throw new Error('el reporte no esta en la pagina: '
        + (v ? 'existe #repov' : 'no existe #repov') + ', y window.open se llamo '
        + c.cuenta() + (c.cuenta() === 1 ? ' vez' : ' veces'));
    }
    const fr = v.querySelector('#repfr');
    if (!fr || fr.tagName !== 'IFRAME') {
      throw new Error('#repov no trae un iframe#repfr, trae: ' + (fr ? fr.tagName : 'nada'));
    }
  } finally {
    c.deshacer();
    cierraReporte();
  }
});

step('el iframe trae el reporte de verdad: h1 con texto y tablas con filas', () => {
  try {
    abreReporte();
    const d = q('#repov #repfr').contentDocument;
    if (!d) throw new Error('el iframe no tiene contentDocument');
    const h1 = d.querySelector('h1');
    if (!h1 || !h1.textContent.trim()) {
      throw new Error('el h1 del reporte viene vacio: "' + (h1 && h1.textContent) + '"');
    }
    const tablas = d.querySelectorAll('table').length;
    const filas = d.querySelectorAll('table tbody tr').length;
    if (!(tablas > 0) || !(filas > 0)) {
      throw new Error('el reporte trae ' + tablas + ' tablas y ' + filas + ' filas, y las dos cifras tienen que ser mayores que 0');
    }
  } finally { cierraReporte(); }
});

step('[data-rep="close"] cierra el reporte y deja la aplicacion intacta', () => {
  const cajonInicial = S().drawer;
  try {
    abreReporte();
    const modo = S().mode, cajon = S().drawer;
    /* el boton vive en el documento del IFRAME, no en el del padre: un
       selector desde aqui no lo alcanza nunca */
    const d = q('#repov #repfr').contentDocument;
    const x = d && d.querySelector('.bar [data-rep="close"]');
    if (!x) throw new Error('no existe [data-rep="close"] en la barra del reporte');
    x.click();
    if (document.getElementById('repov')) {
      throw new Error('#repov sigue en el documento tras pulsar [data-rep="close"]');
    }
    if (!document.getElementById('app')) {
      throw new Error('#app desaparecio de la pagina al cerrar el reporte');
    }
    if (S().mode !== modo) throw new Error('ST.mode paso de ' + modo + ' a ' + S().mode + ' al cerrar el reporte');
    if (S().drawer !== cajon) throw new Error('ST.drawer paso de ' + cajon + ' a ' + S().drawer + ' al cerrar el reporte');
  } finally {
    cierraReporte();
    S().drawer = cajonInicial;
  }
});

step('Escape tambien cierra el reporte', () => {
  const cajonInicial = S().drawer;
  try {
    abreReporte();
    if (!document.getElementById('repov')) {
      throw new Error('el reporte no se abrio: no existe #repov con que probar Escape');
    }
    hotkey('Escape');
    if (document.getElementById('repov')) {
      throw new Error('#repov sigue en el documento tras pulsar Escape');
    }
  } finally {
    cierraReporte();
    S().drawer = cajonInicial;
  }
});

step('la barra del reporte trae los tres botones: imprimir, cerrar y guardar', () => {
  try {
    abreReporte();
    const d = q('#repov #repfr').contentDocument;
    const botones = d.querySelectorAll('.bar button').length;
    if (botones !== 3) throw new Error('la barra del reporte trae ' + botones + ' botones y deberian ser 3');
    if (!d.querySelector('.bar [data-rep="close"]')) throw new Error('falta [data-rep="close"] en la barra');
    if (!d.querySelector('.bar [data-rep="save"]')) throw new Error('falta [data-rep="save"] en la barra');
  } finally { cierraReporte(); }
});

step('en telefono el overlay del reporte llena la ventana', () => {
  const cajonInicial = S().drawer;
  try {
    telOn();
    abreReporte();
    const r = q('#repov').getBoundingClientRect();
    if (Math.abs(r.left) > 1 || Math.abs(r.top) > 1) {
      throw new Error('el overlay arranca en (' + r.left.toFixed(0) + ',' + r.top.toFixed(0)
        + ') y deberia arrancar en (0,0)');
    }
    if (Math.abs(r.width - innerWidth) > 1 || Math.abs(r.height - innerHeight) > 1) {
      throw new Error('el overlay mide ' + r.width.toFixed(0) + 'x' + r.height.toFixed(0)
        + ' px en una ventana de ' + innerWidth + 'x' + innerHeight + ' px');
    }
  } finally {
    telOff();
    cierraReporte();
    S().drawer = cajonInicial;
  }
});

/* --- cabecera fija y tecla de signo en telefono, 2026-09-24 -----------------
   Dos defectos del diseno de telefono, medidos a 390x844:

   (A) La cabecera se esconde al entrar en una celda. El primer campo numerico
   de #panes esta en y=596..630 y el ultimo en y=1323..1357; con un teclado de
   420 px queda una banda visible de 424 px, y el navegador panea 206 px para
   el primero y 933 px para el ultimo. #hd mide 44 px: desaparece en cuanto el
   paneo pasa de 44. El arreglo es doble -el <meta name="viewport"> lleva
   interactive-widget=resizes-content, y #app deja el 100vh fijo por
   height:var(--appH,100dvh), con --appH puesto en :root desde JS cuando el
   viewport visual encoge.

   (B) El teclado numerico de un telefono no trae signo menos: de los 140
   campos de #panes, 125 no tienen tope inferior y admiten negativo sin forma
   de escribirlo. El arreglo es un boton flotante #signk, dentro de #app,
   pintado SOLO con #app.phone, oculto salvo cuando el foco cae en un
   input[type=number] que admite negativo (min==='' o +min<0), y que al
   pulsarse cambia el signo del campo enfocado disparando un change que
   burbujea, igual que stepField().

   Los seis pasos fallan contra el index.html de b540eb1, que es el de antes
   del arreglo, y ninguno es guarda.                                        */

step('la pagina le dice al navegador que el teclado encoge el contenido', () => {
  const meta = document.querySelector('meta[name=viewport]');
  const content = meta ? meta.content : '';
  if (!/interactive-widget=resizes-content/.test(content)) {
    throw new Error('el viewport dice: "' + content + '" y le falta interactive-widget=resizes-content');
  }
});

step('con el alto forzado la aplicacion entera cabe y la cabecera sigue arriba', () => {
  try {
    telOn();
    document.documentElement.style.setProperty('--appH', '424px');
    const hd = q('#hd').getBoundingClientRect();
    const st = q('#st').getBoundingClientRect();
    if (Math.abs(hd.top) > 1) {
      throw new Error('#hd quedo en top = ' + hd.top.toFixed(0) + ' px y con --appH:424px deberia quedar en 0');
    }
    if (st.bottom > 424 + 1) {
      throw new Error('#st termina en y = ' + st.bottom.toFixed(0)
        + ' px con --appH:424px, y deberia caer dentro de 424 px: el #app no esta leyendo --appH');
    }
  } finally {
    document.documentElement.style.removeProperty('--appH');
    telOff();
  }
});

step('en telefono un campo numerico enfocado saca la tecla de signo', () => {
  const modo = S().mode;
  try {
    click('[data-md="model"]'); click('#tabs [data-t="model"]');
    telOn();
    /* el primer campo de #panes sin tope inferior: de los 140 campos de la
       tabla, 125 no llevan `min` y admiten negativo */
    const campo = [...document.querySelectorAll('#panes input[type=number]')]
      .find(el => el.min === '');
    if (!campo) throw new Error('no hay en #panes ningun input[type=number] sin tope inferior con que probar');
    campo.focus();
    const v = seVe('#signk');
    if (!v.ok) {
      throw new Error('#signk no se ve tras enfocar un campo sin tope inferior: display:' + v.display
        + ' y ' + v.ancho.toFixed(0) + ' px de ancho');
    }
  } finally {
    telOff();
    click(`[data-md="${modo}"]`);
  }
});

step('la tecla de signo cambia el signo del campo enfocado', () => {
  const modo = S().mode;
  /* es la Δ del angulo: no tiene tope inferior y admite negativo */
  const sel = '#panes input[data-bd][data-k="angle"]';
  let original = null;
  try {
    click('[data-md="model"]'); click('#tabs [data-t="model"]');
    telOn();
    original = q(sel).value;
    setval(sel, '2');   // valor positivo conocido; confirmarlo puede repintar #panes
    q(sel).focus();     // se vuelve a buscar el nodo: el repintado pudo tirar el de antes
    click('#signk');
    const ahora = q(sel).value;   // otra vez: pulsar la tecla tambien puede repintar
    if (!(parseFloat(ahora) < 0)) {
      throw new Error('tras pulsar #signk el campo se sigue leyendo "' + ahora + '" y deberia ser negativo');
    }
  } finally {
    if (original !== null) setval(sel, original);
    telOff();
    click(`[data-md="${modo}"]`);
  }
});

step('la tecla de signo no sale en un campo que no admite negativo', () => {
  const modo = S().mode;
  try {
    click('[data-md="model"]'); click('#tabs [data-t="model"]');
    telOn();
    /* contra HEAD #signk ni existe: si el paso empezara buscando un campo con
       tope y mirando si #signk "no se ve", pasaria de vacio por la razon
       equivocada. Se comprueba primero que el boton esta en el documento. */
    if (!document.getElementById('signk')) {
      throw new Error('no existe #signk en el documento');
    }
    const campo = [...document.querySelectorAll('#panes input[type=number]')]
      .find(el => el.min !== '' && +el.min >= 0);
    if (!campo) throw new Error('no hay en #panes ningun input[type=number] con tope inferior >= 0 con que probar');
    campo.focus();
    const v = seVe('#signk');
    if (v.ok) {
      throw new Error('#signk se ve sobre un campo con min="' + campo.min + '": display:' + v.display
        + ' y ' + v.ancho.toFixed(0) + ' px de ancho');
    }
  } finally {
    telOff();
    click(`[data-md="${modo}"]`);
  }
});

/* No es guarda: contra HEAD falla porque #signk no existe, y contra un
   arreglo con la regla de CSS mal colgada -pintando #signk fuera de
   `#app.phone`, o un `sync()` que no mirase ST.phone en absoluto- este paso
   pillaria el boton visible sin telefono y fallaria por la razon correcta. Lo
   que prueba es la mitad que el paso de arriba no toca: no basta con que el
   boton se ESCONDA con un campo que no admite negativo, tiene que quedar
   escondido TAMBIEN fuera de telefono aunque el foco si admita negativo. */
step('sin telefono la tecla de signo no se pinta nunca', () => {
  const modo = S().mode;
  try {
    click('[data-md="model"]'); click('#tabs [data-t="model"]');
    telOff();
    if (!document.getElementById('signk')) {
      throw new Error('no existe #signk en el documento');
    }
    const campo = [...document.querySelectorAll('#panes input[type=number]')]
      .find(el => el.min === '');
    if (!campo) throw new Error('no hay en #panes ningun input[type=number] sin tope inferior con que probar');
    campo.focus();
    const v = seVe('#signk');
    if (v.ok) {
      throw new Error('#signk se ve sin telefono: display:' + v.display + ' y ' + v.ancho.toFixed(0) + ' px de ancho');
    }
  } finally {
    click(`[data-md="${modo}"]`);
  }
});

/* --- esconder el 3D con el teclado abierto, 2026-09-24 ---------------------
   En un telefono con el teclado abierto quedan 424 px de alto: la cabecera
   ocupa 44, el 3D ocupa 170 (el 40% de --appH) y la barra de estado 26, y a
   la tabla le quedan 142 px. El 3D no sirve de nada mientras se teclea y
   ademas queda tapado por el teclado, asi que se esconde y la tabla se lleva
   su sitio. Dos piezas:

   (1) La clase `kbd` en #app: se pone cuando ST.phone esta encendido y el
   foco cae en un campo editable (input de texto o numero), y se quita al
   salirse. El reparto pasa a var(--h) minmax(0,1fr) var(--statusH) con las
   areas "hd" "pn" "st", y #ct deja de pintarse. Cuelga de
   `#app.phone.kbd:not(.solo)`: en pantalla completa no hay tabla que
   enfocar, y esconder las dos bandas dejaria la pantalla vacia.

   (2) Una guarda en onResize(): medido escondiendo #ct a mano y dejando que
   salte el ResizeObserver, el lienzo pasa de 390x338 a 0x0, camera.aspect
   queda en NaN y la matriz de proyeccion sale entera NaN (se recupera al
   volver, y no salta ninguna excepcion). La guarda es: si el contenedor mide
   0 de ancho o de alto, onResize() no toca ni el renderer ni la camara y
   vuelve. Para poder probarlo desde aqui -el banco es sincrono y no puede
   esperar al observador- onResize pasa a estar expuesto en window.BARCOMP,
   junto a camera, renderer y renderAll.

   Los tres pasos fallan contra el index.html de 0e149d0: el primero porque
   la clase kbd no esconde nada (no existe la regla), el segundo porque nadie
   pone ni quita esa clase al enfocar, y el tercero porque
   window.BARCOMP.onResize ni existe.                                       */

step('en telefono con el teclado abierto el 3D no se pinta y la tabla se lleva su sitio', () => {
  const modo = S().mode;
  try {
    click('[data-md="model"]');
    telOn();
    const btAntes = q('#bt').getBoundingClientRect().height;
    const ctAntes = q('#ct').getBoundingClientRect().height;
    q('#app').classList.add('kbd');
    const ctDespues = seVe('#ct');
    const btDespues = q('#bt').getBoundingClientRect().height;
    if (ctDespues.ok) {
      throw new Error('con la clase kbd #ct se sigue viendo: display:' + ctDespues.display
        + ' y ' + ctDespues.ancho.toFixed(0) + ' px de ancho (antes de la clase media '
        + ctAntes.toFixed(0) + ' px de alto, y #bt ' + btAntes.toFixed(0) + ' px)');
    }
    if (btDespues < btAntes + ctAntes - 1) {
      throw new Error('#bt paso de ' + btAntes.toFixed(0) + ' a ' + btDespues.toFixed(0)
        + ' px de alto, y con #ct escondido (que media ' + ctAntes.toFixed(0)
        + ' px) deberia haber crecido al menos eso');
    }
  } finally {
    q('#app').classList.remove('kbd');
    telOff();
    click(`[data-md="${modo}"]`);
  }
});

/* Lo que se prueba aqui es solo la mitad de "enfocar pone la clase". El
   quitado va detras de un setTimeout(…, 0) en la implementacion -el foco
   pasa por el body entre dos celdas al tabular, y sin el retraso la clase
   parpadearia en cada salto-, y este banco es sincrono de principio a fin:
   no hay forma fiable de comprobar aqui que la clase se quita al salir de la
   celda. Lo que SI se puede comprobar sin esperar a nada es que se pone con
   el foco en un campo con phone encendido, y que no se pone con phone
   apagado. */
step('enfocar una celda en telefono marca el #app con la clase del teclado, y sin telefono no la marca', () => {
  const modo = S().mode;
  try {
    click('[data-md="model"]'); click('#tabs [data-t="model"]');
    telOn();
    q('#panes input[type=number]').focus();
    if (!q('#app').classList.contains('kbd')) {
      throw new Error('#app no lleva la clase kbd tras enfocar un input[type=number] de #panes con phone encendido');
    }
    telOff();
    /* el repintado de telOff() pudo tirar el nodo de antes: se vuelve a buscar */
    q('#panes input[type=number]').focus();
    if (q('#app').classList.contains('kbd')) {
      throw new Error('#app lleva la clase kbd tras enfocar un campo con phone apagado, y no deberia');
    }
  } finally {
    if (document.activeElement) document.activeElement.blur();
    q('#app').classList.remove('kbd');
    telOff();
    click(`[data-md="${modo}"]`);
  }
});

step('con el 3D escondido onResize no deja la camara en NaN', () => {
  const modo = S().mode;
  try {
    if (typeof window.BARCOMP.onResize !== 'function') {
      throw new Error('window.BARCOMP.onResize no es una funcion: ' + typeof window.BARCOMP.onResize);
    }
    click('[data-md="model"]');
    telOn();
    const aspectAntes = window.BARCOMP.camera.aspect;
    const wAntes = window.BARCOMP.renderer.domElement.width;
    const hAntes = window.BARCOMP.renderer.domElement.height;
    q('#app').classList.add('kbd');
    window.BARCOMP.onResize();
    const aspectDespues = window.BARCOMP.camera.aspect;
    const wDespues = window.BARCOMP.renderer.domElement.width;
    const hDespues = window.BARCOMP.renderer.domElement.height;
    if (!Number.isFinite(aspectDespues)) {
      throw new Error('camera.aspect quedo en ' + aspectDespues + ' (antes ' + aspectAntes
        + ') tras onResize() con #ct escondido por la clase kbd');
    }
    if (window.BARCOMP.camera.projectionMatrix.elements.some(Number.isNaN)) {
      throw new Error('la matriz de proyeccion trae algun NaN tras onResize() con #ct escondido: '
        + window.BARCOMP.camera.projectionMatrix.elements.join(','));
    }
    if (wDespues === 0 || hDespues === 0) {
      throw new Error('el lienzo quedo en ' + wDespues + 'x' + hDespues + ' px (antes '
        + wAntes + 'x' + hAntes + ') tras onResize() con #ct escondido por la clase kbd');
    }
  } finally {
    q('#app').classList.remove('kbd');
    telOff();
    click(`[data-md="${modo}"]`);
    if (typeof window.BARCOMP.onResize === 'function') window.BARCOMP.onResize();
  }
});

/* --- dos marcas, dos colores en el reporte, 2026-09-24 ---------------------
   Las tres tablas anchas resaltan celdas, pero no todas dicen lo mismo: en la
   de compensaciones la marca significa «aqui hay correccion» y en la de base y
   la de totales «este modelo se separa de la referencia». Las dos iban por la
   misma clase `d` y el mismo #8a4b00, asi que el reporte del demo imprimia 26
   celdas marcadas en la de compensaciones y 22 en la de totales, todas del
   mismo color, y quien lo lee no tiene como saber que son dos preguntas
   distintas. Ahora la de compensaciones lleva clase `k` y va en verde.

   El gancho de estos pasos es `data-tab="base|delta|total"` en el `div.tw` de
   cada tabla: sin el, la unica manera de dar con la de compensaciones seria
   contar bloques por su orden, que se rompe en cuanto se mueva una seccion.
   Eso hace que contra un build sin el arreglo los tres fallen por el gancho
   que falta y no por el color, asi que el mensaje de ese fallo lleva ademas
   las dos cuentas del documento entero -td.d y td.k-: la linea FALLA dice la
   cifra del defecto y no solo que no encontro donde mirar.

   Los tres ponen Δ a mano en un modelo encendido -sin Δ no hay nada que
   marcar- y devuelven el estado tal como lo encontraron, igual que los pasos
   del reporte de mas arriba: el resto del guion cuenta variantes y mide el
   modelo activo.                                                            */
/* pone Δ en el primer modelo ENCENDIDO -que es el que sale en el reporte-,
   corre `fn` y devuelve los Δ intactos, copia a copia */
const conCompensacion = fn => {
  const v = S().variants.find(x => x.visible);
  if (!v) throw new Error('no hay ningun modelo encendido: el paso no prueba nada');
  if (!v.deltas.length) throw new Error('el modelo encendido trae ' + v.deltas.length
    + ' columnas de delta: el paso no prueba nada');
  const antes = v.deltas.map(d => ({ ...d }));
  try {
    v.deltas[0].angle = -2.5;
    if (v.deltas[1]) v.deltas[1].rot = 1.5;
    window.BARCOMP.renderAll();
    return fn(v);
  } finally {
    v.deltas = antes;
    window.BARCOMP.renderAll();
  }
};
/* cuantas `.tw` hay y cuantas traen el gancho: es la cifra que tiene que
   llevar el fallo cuando la tabla pedida no aparece */
const ganchos = doc => doc.querySelectorAll('.tw').length + ' bloques .tw y '
  + doc.querySelectorAll('.tw[data-tab]').length + ' con data-tab; en el documento entero hay '
  + doc.querySelectorAll('td.d').length + ' celdas td.d y '
  + doc.querySelectorAll('td.k').length + ' td.k';

step('las celdas con Δ de la tabla de compensaciones llevan la marca verde (td.k) y ninguna la de «se separa de la referencia» (td.d)', () => {
  conCompensacion(() => {
    const doc = new DOMParser().parseFromString(window.BARCOMP.reportHtml(), 'text/html');
    const t = doc.querySelector('.tw[data-tab="delta"]');
    if (!t) throw new Error('no hay ninguna tabla con data-tab="delta": el reporte trae ' + ganchos(doc));
    const k = t.querySelectorAll('td.k').length;
    const d = t.querySelectorAll('td.d').length;
    if (!k) throw new Error('con Δ puestos la tabla de compensaciones trae ' + k
      + ' celdas td.k (y ' + d + ' td.d): no marca la compensacion');
    if (d) throw new Error('la tabla de compensaciones trae ' + d
      + ' celdas td.d -la marca de «se separa de la referencia»- y deberia traer 0; td.k: ' + k);
  });
});

step('el verde de la compensacion aguanta en la fila TOTAL: «tr.tot td» no le quita el fondo', () => {
  /* aqui NO vale leer la clase: lo que se prueba es la ESPECIFICIDAD, o sea
     que «tr td.k» -0-1-2, y escrito despues- le gane a «tr.tot td{background}»
     -0-1-2 tambien- justo en la fila TOTAL. Eso solo se ve en el estilo
     CALCULADO, y para tenerlo hace falta un iframe de verdad con la hoja
     aplicada: se usa el del propio reporte, que ya es uno -#repov > #repfr- y
     se escribe con contentDocument.open()/write()/close(), que es sincrono. */
  const cajonInicial = S().drawer;
  try {
    conCompensacion(() => {
      abreReporte();
      const fr = q('#repov #repfr');
      const d = fr.contentDocument;
      if (!d) throw new Error('el iframe del reporte no tiene contentDocument');
      const t = d.querySelector('.tw[data-tab="delta"]');
      if (!t) throw new Error('no hay ninguna tabla con data-tab="delta": el reporte trae ' + ganchos(d));
      const cels = [...t.querySelectorAll('tr.tot td.k')];
      if (!cels.length) throw new Error('la fila TOTAL de la tabla de compensaciones trae '
        + cels.length + ' celdas td.k de las ' + t.querySelectorAll('td.k').length
        + ' de la tabla entera: no hay nada verde que medir ahi');
      const cs = fr.contentWindow.getComputedStyle(cels[0]);
      const fondo = cs.backgroundColor, color = cs.color, peso = cs.fontWeight;
      if (fondo !== 'rgb(234, 247, 238)') {
        throw new Error('la celda verde de la fila TOTAL calcula el fondo ' + fondo
          + ' y deberia calcular rgb(234, 247, 238): «tr.tot td» se lo come');
      }
      if (color !== 'rgb(10, 107, 45)') {
        throw new Error('la celda verde de la fila TOTAL calcula el color ' + color
          + ' y deberia calcular rgb(10, 107, 45)');
      }
      if (+peso < 700) {
        throw new Error('la celda verde de la fila TOTAL calcula font-weight ' + peso
          + ' y deberia calcular 700: sin negrita la marca no llega a una impresion en blanco y negro');
      }
    });
  } finally {
    cierraReporte();
    S().drawer = cajonInicial;
  }
});

step('el verde es SOLO de las compensaciones: las tablas de base y de totales no traen ninguna td.k y siguen marcando con td.d', () => {
  const variantesAntes = S().variants.slice();
  const activoAntes = S().active;
  const refAntes = S().ref;
  try {
    /* la tabla de totales solo marca cuando hay un modelo que COMPARAR contra
       la referencia: con uno solo encendido no hay nada que se separe de nada
       y el paso no probaria que ahi la marca sigue siendo `d` */
    drawer('models');
    click('[data-a="vardup"]');
    const nuevoId = S().active;
    const nuevo = S().variants.find(x => x.id === nuevoId);
    if (!nuevo) throw new Error('la copia no aparecio en variants');
    if (!nuevo.visible) { drawer('models'); click(`#lf input[data-vv="${nuevoId}"]`); }
    if (!S().variants.find(x => x.id === S().ref && x.visible)) {
      throw new Error('la referencia no esta encendida: sin ella la tabla de totales no marca nada');
    }
    /* la copia nace identica y las tres tablas colapsarian a un bloque: se le
       mueve un Δ -no la base, que es la que pinta la tabla 1- para que su
       TOTAL se separe del de la referencia y la tabla 3 tenga que marcar */
    if (!nuevo.deltas.length) throw new Error('la copia trae 0 columnas de delta: el paso no prueba nada');
    nuevo.deltas[0].angle = nuevo.deltas[0].angle + 7.5;
    window.BARCOMP.renderAll();
    const doc = new DOMParser().parseFromString(window.BARCOMP.reportHtml(), 'text/html');
    const t1 = doc.querySelector('.tw[data-tab="base"]');
    const t3 = doc.querySelector('.tw[data-tab="total"]');
    if (!t1 || !t3) {
      throw new Error('faltan tablas con data-tab: base ' + (t1 ? 'si' : 'no')
        + ', total ' + (t3 ? 'si' : 'no') + '; el reporte trae ' + ganchos(doc));
    }
    const d3 = t3.querySelectorAll('td.d').length;
    if (!d3) throw new Error('con dos modelos distintos encendidos la tabla de totales marca '
      + d3 + ' celdas td.d: el paso no prueba nada');
    const k1 = t1.querySelectorAll('td.k').length;
    const k3 = t3.querySelectorAll('td.k').length;
    if (k1 || k3) {
      throw new Error('el verde se salio de las compensaciones: ' + k1
        + ' celdas td.k en la tabla de base y ' + k3 + ' en la de totales, y las dos deberian ser 0'
        + ' (la de totales marca ' + d3 + ' td.d)');
    }
  } finally {
    S().variants = variantesAntes;
    S().active = activoAntes;
    S().ref = refAntes;
    window.BARCOMP.renderAll();
  }
});

return log.join('\n');
