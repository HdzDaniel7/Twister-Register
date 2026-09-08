/* =========================================================================
   EXPRESIONES EN LAS CELDAS DE COMPENSACIÓN

   La celda se comporta como la de una hoja de cálculo: un operador al
   principio opera sobre LO QUE SE VE, y el resto es absoluto.

       2          ->  la compensación pasa a valer 2
       +2         ->  dos más de lo que muestra la celda   (v + 2)
       -0.3       ->  tres décimas menos de lo que muestra
       *1.1       ->  un 10 % más de lo que muestra
       =2         ->  2, absoluto y sin discusión
       c          ->  lo que calculó el lazo
       c+2        ->  dos más de lo que calculó el lazo
       (c+1)/2

   `v` es el valor mostrado y `c` el que calculó el lazo. En una celda recién
   puesta a cero los dos valen lo mismo; se separan en la SEGUNDA edición de la
   misma celda, que es justo cuando uno quiere seguir empujando sobre lo que ve.

   OJO: esto cambió. Antes `+2` significaba «dos más de lo que calculó el lazo»
   y `-3` era el número negativo −3, que ni siquiera era coherente consigo
   mismo. Ahora los dos van sobre lo mostrado, y para escribir un absoluto
   negativo está `=-3`.

   Se evalúa con un parser propio (patio de maniobras). NO se usa eval(): esto
   corre bajo file:// y no hay ninguna razón para ejecutar texto arbitrario.

   No importa nada: es un parser de expresiones y no pinta nada dentro de un
   motor de cinemática.
   ========================================================================= */
const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
/** Un numero completo: digitos con un punto opcional, o un punto y digitos.
 *  Sin signo: el menos lo trae el tokenizador como operador unario. */
const NUM = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

/** Un token de la expresión: un número, la variable `c`, un paréntesis o un
 *  operador. */
type Tok =
  | { t: 'num'; v: number }
  /** `c` = lo que calculó el lazo · `v` = lo que muestra la celda */
  | { t: 'var'; k: 'c' | 'v' }
  | { t: '(' }
  | { t: ')' }
  | { t: 'op'; v: string };

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let j = i;
      while (j < src.length && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) j++;
      /* El trozo entero tiene que SER un numero, no empezar por uno. parseFloat
         se para en el segundo punto y devuelve 1.2 para «1.2.3»: la celda se
         quedaba con un valor que nadie escribio, y sin decirlo. Ahora no se
         entiende, y con eso la celda lo marca en rojo en vez de tragarselo. */
      const raw = src.slice(i, j);
      if (!NUM.test(raw)) return null;
      const v = parseFloat(raw);
      if (!isFinite(v)) return null;
      out.push({ t: 'num', v });
      i = j;
      continue;
    }
    if (ch === 'c' || ch === 'v') { out.push({ t: 'var', k: ch }); i++; continue; }
    if (ch === '(' || ch === ')') { out.push({ t: ch }); i++; continue; }
    if (PREC[ch]) { out.push({ t: 'op', v: ch }); i++; continue; }
    return null;                      // cualquier otra cosa: expresión inválida
  }
  return out;
}

/** Evalúa la expresión de una celda.
 *
 *  `calc` es el valor de `c` —lo que calculó el lazo— y `shown` el de `v`, lo
 *  que la celda enseña ahora mismo. `shown` es opcional y cae en `calc`: en una
 *  celda sin ajuste los dos son lo mismo, y así una llamada vieja sigue
 *  significando lo que significaba.
 *
 *  Devuelve null si el texto no es una expresión válida — el que llama decide
 *  qué hacer (normalmente: no tocar nada). */
export function evalCell(text: unknown, calc = 0, shown = calc): number | null {
  let src = String(text ?? '').trim().replace(/,/g, '.').toLowerCase();
  if (!src) return null;
  /* `=` fuerza absoluto: es la salida para escribir un negativo suelto ahora
     que un `-` al principio opera sobre lo mostrado. */
  if (src[0] === '=') {
    src = src.slice(1).trim();
    if (!src) return null;
  } else if (/^[+\-*/]/.test(src)) {
    /* Como en una hoja de cálculo: el operador al principio opera sobre lo que
       se ve. `c+2` sigue estando para operar sobre el cálculo del lazo. */
    src = 'v' + src;
  }
  const toks = tokenize(src);
  if (!toks || !toks.length) return null;

  const vals: number[] = [], ops: string[] = [];
  const apply = (): boolean => {
    const op = ops.pop();
    if (op === 'u-') {
      const a = vals.pop();
      if (a === undefined) return false;
      vals.push(-a);
      return true;
    }
    const b = vals.pop(), a = vals.pop();
    if (a === undefined || b === undefined) return false;
    vals.push(op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b);
    return true;
  };
  let prev: Tok | null = null;
  for (const tk of toks) {
    if (tk.t === 'num') vals.push(tk.v);
    else if (tk.t === 'var') vals.push((tk.k === 'v' ? +shown : +calc) || 0);
    else if (tk.t === '(') ops.push('(');
    else if (tk.t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') if (!apply()) return null;
      if (!ops.length) return null;
      ops.pop();
    } else {
      // unario: al principio, tras otro operador, o tras un paréntesis que abre
      const unary = tk.v === '-' && (prev === null || prev.t === 'op' || prev.t === '(');
      if (unary) ops.push('u-');
      else {
        while (ops.length && ops[ops.length - 1] !== '(' &&
               (ops[ops.length - 1] === 'u-' || PREC[ops[ops.length - 1]] >= PREC[tk.v])) {
          if (!apply()) return null;
        }
        ops.push(tk.v);
      }
    }
    prev = tk;
  }
  while (ops.length) {
    if (ops[ops.length - 1] === '(') return null;
    if (!apply()) return null;
  }
  if (vals.length !== 1 || !isFinite(vals[0])) return null;
  return vals[0];
}
