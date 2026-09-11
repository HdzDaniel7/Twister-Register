/* =========================================================================
   LA CARGA — la pieza deja de flotar donde la deja la cinemática y se cae
   contra lo que tenga debajo y al lado.

   POR QUÉ ESTO NO ES `engine/pins.ts` OTRA VEZ. El amarre resuelve un problema
   GEOMÉTRICO: los pines están puestos, la barra tiene que tocarlos, ¿qué forma
   toma? En ese problema no hay fuerzas —hay contactos que se cierran— y por eso
   la forma no depende del material (ver la cabecera de pins.ts). Aquí hay una
   FUERZA: el peso propio de la barra, o un empuje que alguien quiere probar. Y
   con una fuerza cambian tres cosas de golpe:

   · **E deja de cancelarse.** Con una carga, la forma sí depende del material:
     una barra de aluminio se cuelga tres veces más que una de acero. Es la
     diferencia práctica más grande entre este archivo y el del amarre, y hay
     una prueba dedicada a ella.
   · **Un apoyo EMPUJA pero no TIRA.** El amarre cierra el contacto por los dos
     lados: si un doblez aleja la barra de un pin, el solver la trae de vuelta,
     porque ahí un contacto es una igualdad. Con carga eso es falso —un poste no
     tiene imán— así que aquí los contactos son UNILATERALES: solo trabajan
     cuando la barra se les mete dentro. Que la pieza se separe de un pin es una
     respuesta legítima, y saber si la gravedad la devuelve a él o no es
     justamente la pregunta.
   · **Los PEDESTALES entran en la cuenta.** Sin fuerzas no sostienen nada y por
     eso el amarre los ignora. Con peso son lo único que impide que la pieza se
     vaya hacia la mesa.

   LO QUE SE MINIMIZA es la energía potencial total:

       Φ(u) = ½·Σ Kᵢ·uᵢ²  −  Σ Fₘ·(pₘ·d̂)  +  ½·κ·Σ ⟨−gapᶜ⟩²
              └ elástica ┘   └── la carga ──┘   └─ los apoyos ─┘

   El mínimo de Φ es el equilibrio: es la misma cuenta que hacer la suma de
   fuerzas, escrita de la forma en la que un solver la puede seguir. Las
   incógnitas `u` son las mismas del amarre —lo que cede cada estación— así que
   la forma que sale sigue siendo una pieza que la cadena cinemática sabe
   describir, y no una nube de puntos.

   EL PUNTO CIEGO, y hay que decirlo antes de que alguien lea un número: las
   incógnitas son los CODOS DE LAS ESTACIONES. Un tramo recto no tiene ninguna,
   así que en este modelo **una recta no se cuelga por el medio**. Eso no
   significa que no se cuelgue: significa que esa parte la da `engine/sag.ts`,
   que es una cuenta aparte y que la pestaña del fixture enseña al lado. Las dos
   miran cosas distintas de la misma barra y NO se suman: aquí se ve hacia dónde
   se va la pieza entera y contra qué apoyos acaba apretando; allí, cuánto se
   hunde un vano por su cuenta.

   Y LO QUE ESTO SIGUE SIN SER: elementos finitos. La rigidez de una estación se
   toma como `EI/L` —la energía de un codo repartido en su tramo libre— que para
   una ménsula cargada es unas cuatro veces más blanda que la exacta. El número
   que sale da el ORDEN y la DIRECCIÓN, no una flecha certificada. Cuando llegue
   el escaneo del punto A.5 con la pieza montada, esto se contrasta contra ella.
   ========================================================================= */
import { Vector3 } from 'three';
import { solveDense, D2R, clamp } from './math.ts';
import { buildPath, fk } from './kinematics.ts';
import { TABLE_Z, sectionDrop, pedestalFit } from './fixture.ts';
import { sampleAt } from './path.ts';
import { lineLoad } from './sag.ts';
import {
  MAT_DEFAULT, RESTRAINT_DEFAULT, pinFit, restrain, restrainedFree,
  stationSpans, withDelta, gapAt,
} from './pins.ts';
import type { Restrained } from './pins.ts';
import type {
  Model, PathSample, Section, Pin, Pedestal, Mat, Restraint, Load,
} from '../types.ts';

export const LOAD_DEFAULT: Readonly<Load> = Object.freeze({
  /** apagada por defecto, como el amarre y por el mismo motivo: con la carga
   *  quitada el programa da EXACTAMENTE lo de antes, y hay prueba de ello */
  on: false,
  /** múltiplo de la gravedad. 1 = el peso de verdad. 2 = a ver qué aguanta */
  g: 1,
  /** hacia dónde tira. Abajo mientras nadie diga otra cosa */
  dx: 0, dy: 0, dz: -1,
  /** empuje extra en la punta libre, N. Es el dedo con el que uno prueba si la
   *  pieza se mueve, puesto donde más se nota */
  tip: 0,
});

/** Cuánto más rígido es el muelle de contacto que la barra.
 *
 *  Un apoyo de verdad es rígido y la barra no se le mete dentro; aquí se
 *  modela con un muelle que solo empuja, porque una desigualdad dura no se
 *  puede derivar y un muelle sí. κ se saca de la rigidez de la propia pieza
 *  (`E·I/L³`) multiplicada por esto, y la cuenta tiene una propiedad que
 *  conviene conocer: **el número de condición del sistema sale igual a esta
 *  constante**, sin depender del tamaño de la pieza —las L se cancelan— así que
 *  1e5 deja penetraciones de micras y quince cifras de margen en doble
 *  precisión. Lo que de verdad se hunde se enseña (`pene`): si eso crece, el
 *  muelle se quedó corto y el número hay que mirarlo con recelo. */
export const CONTACT_K = 1e5;

/** Hasta dónde se considera que un apoyo puede llegar a tocar, mm.
 *
 *  El contacto se congela con la pieza SIN cargar, igual que en el amarre. Un
 *  poste a medio metro de la barra no es un candidato: ni la va a tocar, ni la
 *  linealización del contacto valdría si la tocara. Y si la pieza de verdad se
 *  mueve veinte milímetros, esto ya no es un problema de pequeñas deformaciones
 *  y el número no se puede defender de todos modos. */
export const REACH = 20;

/** Cuánto tiene que bajar el gradiente para dar la búsqueda por terminada.
 *
 *  RELATIVO al del primer paso, y ahí está todo el asunto: el gradiente viaja
 *  en N·mm/grado, así que su tamaño depende del peso de la pieza y de su
 *  largo. Un umbral absoluto —que es lo que había— no significa lo mismo para
 *  una pletina de medio kilo que para una barra de veinte, y dejaba `ok` al
 *  revés: truncar por iteraciones decía «bien» y converger decía «mal». */
export const GRAD_TOL = 1e-4;

/** Y el suelo, para que una pieza sin carga apreciable no gire en vano. */
const GRAD_ABS = 1e-9;

/** El otro criterio: un paso aceptado más pequeño que esto, en grados, no mueve
 *  nada que nadie pueda medir —1e-5° sobre un metro de brazo son 0.17 µm, menos
 *  de lo que se hunde un contacto— y la búsqueda terminó aunque el gradiente
 *  numérico, que sale de diferencias finitas, no siga bajando. */
const STEP_TOL = 1e-5;

/** Por debajo de esto, un contacto no se entera de que las estaciones se
 *  mueven: su hueco no cambia con NINGUNA incógnita. Ver `pinBlind`. */
const BLIND_J = 1e-6;

/** Sanea una carga venida de un archivo. Mismo trato que `normLims()`: lo que
 *  no se entienda vuelve al valor de fábrica en vez de envenenar el solver. */
export function normLoad(o: Partial<Load> | null | undefined): Load {
  const n = (v: unknown, d: number, lo: number, hi: number): number => {
    const x = typeof v === 'string' ? parseFloat(v) : (v as number);
    return isFinite(x) ? clamp(x, lo, hi) : d;
  };
  const l = o || {};
  const out: Load = {
    on: !!l.on,
    g: n(l.g, 1, 0, 20),
    dx: n(l.dx, 0, -1, 1), dy: n(l.dy, 0, -1, 1), dz: n(l.dz, -1, -1, 1),
    /* el empuje de prueba se topa: mil newton son cien kilos colgando de la
       punta, y por encima de eso nada de este modelo sigue siendo elástico */
    tip: n(l.tip, 0, -1000, 1000),
  };
  /* Una dirección nula no es «sin carga», es una división por cero esperando:
     se cae a la gravedad, que es lo que el campo quiere decir el 99% de las
     veces. */
  if (!out.dx && !out.dy && !out.dz) out.dz = -1;
  return out;
}

/** La dirección de la carga, unitaria. */
export function loadDir(l: Load): Vector3 {
  const v = new Vector3(+l.dx || 0, +l.dy || 0, +l.dz || 0);
  return v.lengthSq() < 1e-12 ? new Vector3(0, 0, -1) : v.normalize();
}

/** Lo que devuelve `settle()`: todo lo del amarre, más lo que la carga añade. */
export type Settled = Restrained & {
  /** reacción de cada PIN, N, en el orden de la lista de pines. 0 = ese pin no
   *  está tocando: la pieza se le separó, que es una respuesta y no un fallo */
  pinN: number[];
  /** reacción de cada PEDESTAL, N, en el orden de la lista del fixture */
  pedN: number[];
  /** lo que más se hundió un apoyo dentro de la barra, mm. Es el error del
   *  muelle de contacto: si esto se acerca a la tolerancia, κ se quedó corto */
  pene: number;
  /** cuánto se movió el PI que más, contra la pieza libre, mm */
  drop: number;
  /** cuál es ese PI, o −1 */
  dropAt: number;
  /** lo que pesa la pieza —más el empuje de punta— en newton */
  weight: number;
  /** cuánto de ese peso llevan los apoyos, N, proyectado contra la carga */
  carried: number;
  /** y cuánto se queda aguantando la RAÍZ: la mordaza, el primer extremo.
   *
   *  Es el número que contesta «¿me hacen falta más pedestales?». Si los apoyos
   *  no llevan casi nada, la pieza está colgando de su propio extremo y lo que
   *  se ve en pantalla es una pieza en voladizo, no una pieza montada. */
  root: number;
  /** ¿falta material para poder decir un número? */
  noMat: boolean;
  /** ¿la pieza no tiene NINGUNA incógnita con la que ceder?
   *
   *  Una barra recta no tiene estaciones, así que este modelo no la puede
   *  colgar: lo que pesa sí se sabe —y se dice—, pero el reparto entre apoyos
   *  no. Es el PUNTO CIEGO de la cabecera, puesto en un campo para que la
   *  pantalla lo pueda decir en vez de enseñar ceros. */
  noDof: boolean;
  /** por cada PIN, ¿su reacción es indeterminable?
   *
   *  Un apoyo que cae en un tramo recto antes del primer doblez no se mueve por
   *  mucho que cedan las estaciones: su hueco no depende de ninguna incógnita.
   *  Lo que salga ahí no es una reacción resuelta —es la interferencia con la
   *  que se dibujó la pieza— así que se pone a cero, se saca de la suma y se
   *  marca aquí. Un 0 N en verde diría «este apoyo sobra», que es lo contrario
   *  de «este apoyo no se puede juzgar». */
  pinBlind: boolean[];
  /** lo mismo para cada PEDESTAL */
  pedBlind: boolean[];
};

/** Un contacto candidato, congelado con la pieza sin cargar. */
type Touch = {
  /** ¿es un pin? Si no, es un pedestal */
  pin: boolean;
  /** su índice en la lista de pines o en la de pedestales */
  k: number;
  /** dónde toca a lo largo de la barra, mm */
  s: number;
  /** dónde toca a lo largo del PIN: 0 base, 1 punta */
  t: number;
  /** dirección del contacto en el marco de la sección; ver `PinFit.local` */
  local: [number, number];
};

/** El resultado sin carga, con los campos de la carga a cero.
 *
 *  `weight` es la excepción y va aparte: lo que pesa la pieza no depende de que
 *  el solver tenga algo que resolver. Una recta de 1700 mm pesa 21.6 N tanto si
 *  este archivo sabe repartirlos como si no. */
function noLoad(r: Restrained, nPin: number, nPed: number, noMat: boolean,
                weight = 0, noDof = false): Settled {
  return {
    ...r,
    pinN: new Array<number>(nPin).fill(0), pedN: new Array<number>(nPed).fill(0),
    pinBlind: new Array<boolean>(nPin).fill(noDof),
    pedBlind: new Array<boolean>(nPed).fill(noDof),
    pene: 0, drop: 0, dropAt: -1, weight, carried: 0, root: weight, noMat, noDof,
  };
}

/** La pieza tal como la dejan la carga y los apoyos.
 *
 *  Con la carga apagada devuelve exactamente `restrain()`: el interruptor tiene
 *  que ser demostrable, no creíble. Sin material tampoco inventa nada — devuelve
 *  el amarre de siempre y `noMat` puesto, para que la pantalla diga qué falta.
 *
 *  Los PINES solo entran si el amarre está puesto; los PEDESTALES entran
 *  siempre que haya carga, porque sin fuerzas no sostienen nada y con fuerzas
 *  son lo único que hay debajo.
 *
 *  @param place  la misma transformación que usa el amarre: el fixture está
 *                atornillado a la mesa y mira a la pieza donde de verdad está. */
export function settle(model: Model, pins: Pin[], peds: Pedestal[], sec: Section,
                       opt: Restraint = RESTRAINT_DEFAULT,
                       mat: Mat = MAT_DEFAULT,
                       load: Load = LOAD_DEFAULT,
                       place: (s: PathSample[]) => PathSample[] = s => s): Settled {
  const held = () => restrain(model, opt.on ? pins : [], sec, opt, mat, place);
  if (!load.on) return noLoad(held(), pins.length, peds.length, false);

  const E0 = mat.E || 0;
  const w = lineLoad(sec, mat) * (load.g || 0);
  const tip = +load.tip || 0;
  const doRot = !!opt.doRot;
  const nb = model.bends.length;
  const nu = doRot ? 2 * nb : nb;
  const dir = loadDir(load);
  const path0 = place(buildPath(model, 8).samples);
  if (!path0.length) return noLoad(held(), pins.length, peds.length, false);
  const total = path0[path0.length - 1].s;
  /* Lo que pesa se calcula ANTES de cualquier salida temprana: es un dato de la
     pieza —densidad por sección por largo, más el empuje de punta— y no una
     incógnita del solver. Salir antes con «Peso: 0.0 N» era decir que una barra
     recta no pesa. */
  const weight = Math.abs(w) * total + Math.abs(tip);

  /* Sin módulo elástico no hay rigidez que repartir, y sin densidad no hay
     peso: en cualquiera de los dos casos se devuelve el amarre de siempre y se
     dice que falta el dato, que es lo mismo que hace la flecha. */
  if (!(E0 > 0) || (!(mat.rho || 0) && !tip)) {
    return noLoad(held(), pins.length, peds.length, true, weight);
  }
  if (!w && !tip) return noLoad(held(), pins.length, peds.length, false, weight);
  /* Y sin estaciones no hay incógnitas: el peso se sabe, el reparto no. */
  if (!nu) return noLoad(held(), pins.length, peds.length, false, weight, true);

  /* --- los apoyos que pueden llegar a tocar ------------------------------
     Congelados aquí, con la pieza sin cargar, y a diferencia del amarre SIN
     filtrar por hueco: la gracia de tener una carga es que la pieza puede caer
     hacia un apoyo que ahora mismo no toca. Lo que sí se filtra es lo que está
     fuera de alcance (ver REACH). */
  const cs: Touch[] = [];
  if (opt.on) pins.forEach((pin, k) => {
    if (!pin.hold) return;
    const f = pinFit(path0, sec, pin);
    if (!f || !f.reach || f.gap > REACH) return;
    cs.push({ pin: true, k, s: f.s, t: f.t, local: f.local });
  });
  peds.forEach((ped, k) => {
    const f = pedestalFit(path0, sec, ped);
    /* `over` y no el hueco: un pedestal al que la barra no le pasa por encima
       no la va a sostener por mucho que esté a la altura justa. */
    if (!f || !f.over || f.gap > REACH) return;
    cs.push({ pin: false, k, s: f.s, t: 0, local: [0, 0] });
  });

  /* El hueco con signo de un contacto. Positivo = sobra aire; negativo = el
     apoyo está metido dentro de la barra y por tanto empujando. */
  const gapOf = (p: PathSample[], c: Touch): number => {
    if (c.pin) return gapAt(p, sec, pins[c.k], c.s, c.t, c.local);
    const q = sampleAt(p, c.s);
    return q.p.z - sectionDrop(q, sec) - (TABLE_Z + peds[c.k].h);
  };

  /* La energía de la carga: −Σ F·(p·d̂). Cada muestra carga con el trozo de
     barra que le toca —medio hasta la anterior y medio hasta la siguiente— y la
     punta lleva además el empuje de prueba. */
  const potential = (p: PathSample[]): number => {
    let v = 0;
    for (let i = 0; i < p.length; i++) {
      const a = i ? p[i - 1].s : p[0].s;
      const b = i + 1 < p.length ? p[i + 1].s : p[p.length - 1].s;
      v -= w * ((b - a) / 2) * p[i].p.dot(dir);
    }
    if (tip) v -= tip * p[p.length - 1].p.dot(dir);
    return v;
  };

  /* --- rigidez de cada incógnita ----------------------------------------
     `EI/L`, la energía de un codo Δθ repartido en el tramo libre de su
     estación. Aquí el E de verdad SÍ hace falta —es lo que fija cuánto se
     cuelga— al revés que en el amarre, donde se cancelaba.

     `I` es la de la flexión que el codo de ángulo produce, la misma que ya
     supone el cálculo de esfuerzo de `restrain()` al tomar `thickness/2` como
     fibra extrema. El rodado se queda con el mismo factor 0.5 que usa el
     amarre: no es la rigidez a torsión de la sección —que para este rectángulo
     saldría alrededor de 1.5— sino la convención que ya está en uso, y
     cambiarla movería formas sujetas que hoy están medidas. Queda anotado como
     lo que es: un factor de juicio, no un dato.

     Las unidades: `u` viaja en GRADOS, como en el amarre, así que la rigidez se
     pasa a N·mm/grado² con D2R². */
  const Ia = sec.width * sec.thickness ** 3 / 12;
  const span = stationSpans(model);
  const K: number[] = [];
  for (let i = 0; i < nb; i++) {
    K.push(E0 * Ia / span[i] * D2R * D2R);
    if (doRot) K.push(0.5 * E0 * Ia / span[i] * D2R * D2R);
  }
  const kap = CONTACT_K * E0 * Ia / Math.max(1, total ** 3);

  const elastic = (u: number[]): number => {
    let v = 0;
    for (let i = 0; i < nu; i++) v += 0.5 * K[i] * u[i] * u[i];
    return v;
  };
  const pen = (g: number): number => (g < 0 ? -g : 0);
  const phi = (u: number[], p: PathSample[]): number => {
    let v = elastic(u) + potential(p);
    for (const c of cs) { const q = pen(gapOf(p, c)); v += 0.5 * kap * q * q; }
    return v;
  };

  /* --- el bucle ----------------------------------------------------------
     Newton amortiguado sobre Φ. El jacobiano de los contactos y el gradiente de
     la carga salen de las MISMAS trayectorias perturbadas, así que la carga no
     cuesta ni una construcción más que el amarre.

     Más pasos que el amarre a propósito: ahí los contactos son los que son,
     aquí se encienden y se apagan durante la búsqueda —la pieza se despega de
     un pin y se apoya en otro— y eso pide iteraciones. */
  const u = new Array<number>(nu).fill(0);
  let P = path0;
  let F = phi(u, P);
  const H = 0.02;                       // grados de perturbación
  const maxIt = Math.max(2, 2 * Math.max(1, opt.iters));
  /* `stuck` empieza PUESTO y solo lo quita haber llegado a un mínimo. Al revés
     —que es como estaba— agotar las iteraciones sin converger salía como «bien»
     por no haber pasado por ninguna rama que lo desmintiera. */
  let it = 0, stuck = true, gRef = 0;
  /* Qué contactos no dependen de ninguna incógnita. Se decide en la primera
     vuelta, con el jacobiano que ya está calculado, y no cambia después: la
     estructura de la pieza es la que es. */
  const blind = cs.map(() => false);
  for (; it < maxIt; it++) {
    const g0 = cs.map(c => gapOf(P, c));
    const V0 = potential(P);
    const dV: number[] = [];
    const J: number[][] = [];
    for (let j = 0; j < nu; j++) {
      const up = [...u];
      up[j] += H;
      const pp = place(buildPath(withDelta(model, up, doRot), 8).samples);
      dV.push((potential(pp) - V0) / H);
      J.push(cs.map((c, k) => (gapOf(pp, c) - g0[k]) / H));
    }
    /* Un apoyo cuyo hueco no se mueve con NINGUNA incógnita es un apoyo que
       este modelo no puede juzgar: está en un tramo rígido, típicamente antes
       del primer doblez. No hay nada que resolver ahí y lo que se lea es la
       interferencia de partida, no una reacción. */
    if (!it) cs.forEach((_, k) => { blind[k] = J.every(row => Math.abs(row[k]) <= BLIND_J); });

    /* Lo que no depende de contra qué se choque: el muelle de las estaciones y
       la carga. */
    const grad0 = K.map((k, i) => k * u[i] + dV[i]);

    /* El gradiente COMPLETO en el punto actual: lo de arriba MÁS lo que aportan
       los apoyos que de verdad están apretando. Los dos términos o ninguno —en
       el equilibrio se cancelan entre sí, y mirar solo el primero es medir
       cuánto empuja el peso, que no baja nunca por mucho que la búsqueda
       converja. Ese era el error del criterio anterior. */
    const gradWith = (act: boolean[]): number[] => {
      const g = grad0.slice();
      for (let k = 0; k < cs.length; k++) {
        if (!act[k]) continue;
        for (let i = 0; i < nu; i++) g[i] += kap * g0[k] * J[i][k];
      }
      return g;
    };
    const aprieta = g0.map((g, k) => g <= 0 && !blind[k]);
    const gn = Math.max(...gradWith(aprieta).map(Math.abs));
    if (!it) gRef = gn;
    /* Criterio primero: el gradiente bajó lo que tenía que bajar. */
    if (gn <= GRAD_ABS + GRAD_TOL * gRef) { stuck = false; break; }

    /* Y AHORA EL CONTACTO, que es el único sitio delicado de todo esto.
       Un apoyo activo aporta ½·κ·(gap₀ + J·Δ)², o sea gradiente `κ·gap₀·J` y
       hessiano `κ·JJᵀ`. Las DOS mitades o ninguna: con el hessiano puesto y el
       gradiente a cero, el paso sale frenado por un muro que todavía no está
       ahí y la pieza avanza una milésima por iteración sin llegar nunca a
       tocar. Se vio en el banco, con un pin a diez milímetros y la pieza
       quedándose a ocho micras de donde estaba.
       Qué apoyos están activos hay que ADIVINARLO, porque uno que aún no toca
       puede tocar después de este paso. Sin adivinarlo pasa lo contrario y es
       peor: el paso de Newton sale como si el apoyo no existiera, la pieza
       «vuela» dos milímetros dentro del pedestal, la energía del muelle se
       dispara y la búsqueda se rinde sin haberse movido — cero iteraciones y un
       tope justo debajo de la punta sin enterarse.
       Dos pasadas: se tantea con los que ya aprietan, se mira a cuáles LLEGARÍA
       ese tanteo, y se vuelve a resolver contándolos. Cuesta una eliminación
       densa más y ni una construcción de trayectoria, que es lo caro. */
    const solveWith = (act: boolean[]): number[] | null => {
      const g = gradWith(act);
      const A: number[][] = [];
      const b: number[] = [];
      for (let i = 0; i < nu; i++) {
        const row = new Array<number>(nu).fill(0);
        for (let k = 0; k < cs.length; k++) {
          if (!act[k]) continue;
          for (let j = 0; j < nu; j++) row[j] += kap * J[i][k] * J[j][k];
        }
        row[i] += K[i] * (1 + Math.max(1e-3, opt.damp));
        A.push(row);
        b.push(-g[i]);
      }
      return solveDense(A, b);
    };
    const tanteo = solveWith(aprieta);
    if (!tanteo) break;
    const llega = g0.map((g, k) => {
      if (aprieta[k]) return true;
      if (blind[k]) return false;
      let gp = g;
      for (let j = 0; j < nu; j++) gp += J[j][k] * tanteo[j];
      return gp <= 0;
    });
    const step = llega.some((v, k) => v !== aprieta[k]) ? solveWith(llega) : tanteo;
    if (!step) break;
    /* Paso topado, como en el amarre: más de 5° de golpe no es elasticidad. */
    const big = Math.max(...step.map(Math.abs));
    let f = big > 5 ? 5 / big : 1;
    /* Búsqueda simple: si el paso sube la energía, se parte por la mitad. Un
       mínimo de energía no se puede «pasar de largo» sin que Φ suba, así que
       esto es el criterio y no una heurística. */
    let done = false;
    for (let back = 0; back < 8; back++) {
      const un = u.map((v, i) => v + step[i] * f);
      const pn = place(buildPath(withDelta(model, un, doRot), 8).samples);
      const Fn = phi(un, pn);
      if (Fn <= F) {
        for (let i = 0; i < nu; i++) u[i] = un[i];
        P = pn; F = Fn; done = true;
        break;
      }
      f /= 2;
    }
    /* Ni partiendo el paso ocho veces baja la energía, y el gradiente de arriba
       decía que todavía había por dónde bajar: eso no es un mínimo, es un
       problema mal condicionado. Se para y se dice. */
    if (!done) break;
    /* Criterio segundo, y el que cierra la mayoría de los casos reales: si el
       paso ACEPTADO mueve menos de lo que nadie puede medir, la búsqueda
       terminó aunque el gradiente —que sale de diferencias finitas con H=0.02°
       y no es exacto— no siga bajando. */
    if (big * f <= STEP_TOL) { stuck = false; break; }
  }

  /* --- lo que hay que contar ---------------------------------------------
     Las reacciones salen del muelle: R = κ·penetración. Es una reacción de
     penalización, así que converge a la de verdad conforme κ crece, y por eso
     se enseña al lado cuánto se hundió el contacto.

     Y la suma se compara con el PESO. Esa comparación es la que contesta la
     pregunta del taller: si los apoyos llevan casi todo, la pieza está montada;
     si llevan casi nada, está colgando de la mordaza y hacen falta pedestales.
     Es también la comprobación de que la cuenta cierra. */
  const pinN = new Array<number>(pins.length).fill(0);
  const pedN = new Array<number>(peds.length).fill(0);
  const pinBlind = new Array<boolean>(pins.length).fill(false);
  const pedBlind = new Array<boolean>(peds.length).fill(false);
  let pene = 0, carried = 0;
  for (let ci = 0; ci < cs.length; ci++) {
    const c = cs[ci];
    /* Los ciegos no suman: ni a su casilla, ni a lo que llevan los apoyos, ni a
       la penetración. Lo que se sabe de ellos es que no se sabe. */
    if (blind[ci]) { (c.pin ? pinBlind : pedBlind)[c.k] = true; continue; }
    const q0 = pen(gapOf(P, c));
    if (q0 <= 0) continue;
    if (q0 > pene) pene = q0;
    const R = kap * q0;
    if (c.pin) {
      pinN[c.k] += R;
      /* El pin empuja a lo largo de la dirección de contacto, que gira con la
         barra: se reconstruye en el marco de la sección igual que en gapAt(). */
      const q = sampleAt(P, c.s);
      const n = q.y.clone().multiplyScalar(c.local[0]).addScaledVector(q.z, c.local[1]);
      if (n.lengthSq() > 1e-12) carried += R * n.normalize().dot(dir);
    } else {
      pedN[c.k] += R;
      /* Un pedestal empuja hacia arriba y punto: es una cuna, no una mordaza. */
      carried += -R * dir.z;
    }
  }

  const model2 = withDelta(model, u, doRot);
  const kink = model.bends.map((_, i) => ({
    angle: u[doRot ? 2 * i : i],
    rot: doRot ? u[2 * i + 1] : 0,
  }));
  const curv = kink.map((k, i) => Math.hypot(k.angle, k.rot) * D2R / span[i]);
  const cOf = (k: { angle: number; rot: number }): number =>
    (Math.abs(k.rot) > Math.abs(k.angle) ? sec.width : sec.thickness) / 2;
  const stress = kink.map((k, i) => E0 * cOf(k) * curv[i]);
  let worst = 0, worstAt = -1;
  stress.forEach((s, i) => {
    const q = mat.yield > 0 ? s / mat.yield : 0;
    if (q > worst) { worst = q; worstAt = i; }
  });

  /* Cuánto se movió la pieza: contra la LIBRE, que es la forma que tendría sin
     fixture y sin peso. Incluye por tanto lo que hacen los pines y lo que hace
     la carga; separarlas es apagar la carga y mirar el mismo número. */
  const a = fk(model).pis, b = fk(model2).pis;
  let drop = 0, dropAt = -1;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const d = a[i].distanceTo(b[i]);
    if (d > drop) { drop = d; dropAt = i; }
  }

  const res = cs.filter(c => c.pin).map(c => gapOf(P, c));
  return {
    model: model2, kink, curv, stress, worst, worstAt,
    /* `ok` aquí quiere decir «la búsqueda llegó a un mínimo», no «todos los
       contactos cerrados»: con apoyos unilaterales, un contacto ABIERTO es una
       solución correcta y no un residuo que haya que perseguir. */
    res, ok: !stuck, iters: it,
    held: cs.filter(c => c.pin && pinN[c.k] > 0).map(c => c.k),
    pinN, pedN, pinBlind, pedBlind, pene, drop, dropAt,
    weight, carried, root: weight - carried, noMat: false, noDof: false,
  };
}

/** La pieza libre con los campos de la carga a cero, para cuando no hay nada
 *  que resolver. Mismo papel que `restrainedFree()` y por el mismo motivo. */
export const settledFree = (model: Model, nPin = 0, nPed = 0): Settled =>
  noLoad(restrainedFree(model), nPin, nPed, false);
