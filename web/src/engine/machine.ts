/* =========================================================================
   EL COMANDO QUE VA A LA MÁQUINA — de la cadena de dobleces a un archivo de
   texto que la dobladora pueda leer.

   Hasta hoy no existía ninguna exportación: los números se pasaban a mano
   desde la pantalla, que es la única parte del camino donde nadie vigila nada.

   **El formato NO se inventa aquí.** Cuál es el orden de las columnas, en qué
   unidades y con qué signos los quiere la dobladora está pedido en
   `.auditoria/correo-b-maquina.md` (puntos B.1 y B.2) y todavía no ha llegado.
   Lo que este archivo hace es lo contrario de adivinar: deja el formato a la
   vista y configurable —columnas, separador, decimales, unidades, signos y si
   el rodado va como incremento o como eje absoluto— para que quien tenga el
   manual delante lo ajuste sin recompilar nada, y para que el perfil quede
   escrito en el JSON de la pieza junto al comando que se exportó.

   Lo caro de esto nunca fue escribirlo: es acertar con las unidades y los
   signos. Por eso el perfil se ve, se guarda y se puede comprobar contra una
   pieza conocida antes de mandar una barra a la máquina.

   Ninguna opción de aquí toca la CINEMÁTICA. `ANG_DIR` y `ROT_DIR` siguen
   congelados (ver §11 del contexto): `signAngle` y `signRot` invierten lo que
   se ESCRIBE en el archivo, no lo que el motor calcula, y por eso son seguros.
   ========================================================================= */
import type { Bend, Model } from '../types.ts';
import { axisAngles, rowLengths, tailStraight } from './kinematics.ts';

/** Las columnas que se pueden pedir. Cada una es un número por doblez, salvo
 *  `n`, que es el número de estación. */
export type MachineCol =
  | 'n' | 'feed' | 'straight' | 'rot' | 'axis' | 'angle'
  | 'radius' | 'twist' | 'twistLen' | 'arc' | 'cum';

export const MACHINE_COLS: MachineCol[] = [
  'n', 'feed', 'straight', 'rot', 'axis', 'angle', 'radius', 'twist', 'twistLen', 'arc', 'cum',
];

/** Qué magnitud es cada columna, que es lo que decide si la convierte
 *  `lenUnit`, `angUnit` o ninguna de las dos. */
const KIND: Record<MachineCol, 'len' | 'ang' | 'raw'> = {
  n: 'raw', feed: 'len', straight: 'len', rot: 'ang', axis: 'ang', angle: 'ang',
  radius: 'len', twist: 'ang', twistLen: 'len', arc: 'len', cum: 'len',
};

export type MachineFmt = {
  /** en este orden, y solo estas */
  cols: MachineCol[];
  sep: ',' | ';' | '\t';
  decimals: number;
  /** una primera línea con los nombres de columna */
  header: boolean;
  /** fin de línea CRLF: muchos controles de máquina no leen LF a secas */
  crlf: boolean;
  lenUnit: 'mm' | 'in';
  angUnit: 'deg' | 'rad';
  /** invierte el signo del ÁNGULO en el archivo. No toca `ANG_DIR` */
  signAngle: 1 | -1;
  /** invierte el signo del RODADO en el archivo. No toca `ROT_DIR` */
  signRot: 1 | -1;
  /** `delta` = el giro respecto de la estación anterior, que es lo que guarda
   *  el modelo · `abs` = la posición absoluta del eje en esa estación.
   *  Las dos describen la misma pieza y hay máquinas de cada tipo; elegir la
   *  equivocada dobla bien la primera estación y mal todas las demás. */
  rotMode: 'delta' | 'abs';
  /** una última fila con la recta de SALIDA. Sin ella el archivo no dice
   *  cuánto material queda después del último doblez. */
  tailRow: boolean;
};

export const MACHINE_DEFAULT: MachineFmt = {
  cols: ['n', 'straight', 'rot', 'angle', 'radius'],
  sep: ',',
  decimals: 3,
  header: true,
  crlf: true,
  lenUnit: 'mm',
  angUnit: 'deg',
  signAngle: 1,
  signRot: 1,
  rotMode: 'delta',
  tailRow: true,
};

const MM_PER_IN = 25.4;
const DEG2RAD = Math.PI / 180;

/** Saneado, igual que `normLims()`: lo que venga de un archivo puede ser
 *  cualquier cosa, y un perfil a medias tiene que dar un archivo válido —el
 *  fallo aquí no se ve hasta que hay una barra doblada. */
export function normMachineFmt(o: Partial<MachineFmt> | null | undefined): MachineFmt {
  const s = o || {};
  const cols = Array.isArray(s.cols)
    ? s.cols.filter((c): c is MachineCol => MACHINE_COLS.includes(c as MachineCol))
    : [];
  const dec = Number(s.decimals);
  return {
    /* sin una sola columna válida no hay archivo que escribir: se vuelve al
       perfil de fábrica en vez de emitir líneas vacías */
    cols: cols.length ? cols : [...MACHINE_DEFAULT.cols],
    sep: s.sep === ';' || s.sep === '\t' ? s.sep : ',',
    decimals: isFinite(dec) ? Math.min(6, Math.max(0, Math.round(dec))) : MACHINE_DEFAULT.decimals,
    header: s.header !== false,
    crlf: s.crlf !== false,
    lenUnit: s.lenUnit === 'in' ? 'in' : 'mm',
    angUnit: s.angUnit === 'rad' ? 'rad' : 'deg',
    signAngle: s.signAngle === -1 ? -1 : 1,
    signRot: s.signRot === -1 ? -1 : 1,
    rotMode: s.rotMode === 'abs' ? 'abs' : 'delta',
    tailRow: s.tailRow !== false,
  };
}

/** Los valores crudos de una estación, todos en mm y grados. La conversión de
 *  unidades y de signo va después, en un solo sitio. */
type RawRow = Partial<Record<MachineCol, number>>;

function rawRows(model: Model, fmt: MachineFmt): RawRow[] {
  const B: Bend[] = model.bends;
  const L = rowLengths(model);
  const ejes = axisAngles(model);
  const rows: RawRow[] = B.map((b, i) => ({
    n: i + 1,
    feed: b.feed,
    straight: L[i].straight,
    rot: fmt.rotMode === 'abs' ? ejes[i] : b.rot,
    axis: ejes[i],
    angle: b.angle,
    radius: b.radius,
    twist: b.twist,
    twistLen: b.twistLen,
    arc: L[i].arc,
    cum: L[i].cum,
  }));
  if (fmt.tailRow) {
    /* La cola no es un doblez: lleva su recta y nada más. Las columnas que no
       le corresponden salen VACÍAS y no en cero — un cero en la columna del
       ángulo es un doblez de cero grados, que es una instrucción, y esta fila
       no lo es. */
    const cum = L.length ? L[L.length - 1].cum + tailStraight(model) : tailStraight(model);
    rows.push({ n: B.length + 1, feed: model.tail, straight: tailStraight(model), cum });
  }
  return rows;
}

/** Una celda ya convertida a las unidades y los signos del perfil. */
function cell(col: MachineCol, v: number | undefined, fmt: MachineFmt): string {
  if (v === undefined || !isFinite(v)) return '';
  if (col === 'n') return String(v);
  let x = v;
  if (col === 'angle') x *= fmt.signAngle;
  if (col === 'rot' || col === 'axis') x *= fmt.signRot;
  if (KIND[col] === 'len' && fmt.lenUnit === 'in') x /= MM_PER_IN;
  if (KIND[col] === 'ang' && fmt.angUnit === 'rad') x *= DEG2RAD;
  return x.toFixed(fmt.decimals);
}

/** La tabla entera, ya como texto: la primera fila es el encabezado si el
 *  perfil lo pide. Se expone aparte del CSV porque es lo que enseña la vista
 *  previa, y una vista previa que no sea EXACTAMENTE lo que se va a escribir
 *  no sirve para comprobar unidades ni signos. */
export function machineTable(model: Model, fmt: MachineFmt): string[][] {
  const f = normMachineFmt(fmt);
  const out: string[][] = [];
  if (f.header) out.push(f.cols.map(c => c));
  for (const r of rawRows(model, f)) out.push(f.cols.map(c => cell(c, r[c], f)));
  return out;
}

export function machineCsv(model: Model, fmt: MachineFmt): string {
  const f = normMachineFmt(fmt);
  const nl = f.crlf ? '\r\n' : '\n';
  /* Fin de línea también al final: un control que lee líneas completas se come
     la última si no la termina. */
  return machineTable(model, f).map(r => r.join(f.sep)).join(nl) + nl;
}
