/* =========================================================================
   EXPRESIONES EN LAS CELDAS DE COMPENSACIÓN

   La celda de compensación acepta un número suelto (lo reemplaza) o una cuenta
   sobre el valor que calculó el lazo, que se escribe `c`:

       2          ->  la compensación pasa a valer 2
       +2         ->  c + 2      (atajo: si empieza por un operador, va sobre c)
       c + 2      ->  lo mismo, explícito
       c*1.1      ->  un 10 % más de lo que sugiere el lazo
       (c+1)/2

   Se evalúa con un parser propio (patio de maniobras). NO se usa eval(): esto
   corre bajo file:// y no hay ninguna razón para ejecutar texto arbitrario.

   No importa nada: es un parser de expresiones y no pinta nada dentro de un
   motor de cinemática.
   ========================================================================= */
const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

/** Un token de la expresión: un número, la variable `c`, un paréntesis o un
 *  operador. */
type Tok =
  | { t: 'num'; v: number }
  | { t: 'var' }
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
      const v = parseFloat(src.slice(i, j));
      if (!isFinite(v)) return null;
      out.push({ t: 'num', v });
      i = j;
      continue;
    }
    if (ch === 'c') { out.push({ t: 'var' }); i++; continue; }
    if (ch === '(' || ch === ')') { out.push({ t: ch }); i++; continue; }
    if (PREC[ch]) { out.push({ t: 'op', v: ch }); i++; continue; }
    return null;                      // cualquier otra cosa: expresión inválida
  }
  return out;
}

/** Evalúa la expresión de una celda. `calc` es el valor de `c`.
 *  Devuelve null si el texto no es una expresión válida — el que llama decide
 *  qué hacer (normalmente: no tocar nada). */
export function evalCell(text: unknown, calc = 0): number | null {
  let src = String(text ?? '').trim().replace(/,/g, '.').toLowerCase();
  if (!src) return null;
  /* Atajo: `+2`, `*1.1`, `/2` son cuentas sobre el valor calculado. `-3` NO:
     un signo menos al principio es un número negativo, que es lo que uno
     espera al teclear una compensación a mano. Para restar sobre el calculado
     está `c-3`. */
  if (/^[+*/]/.test(src)) src = 'c' + src;
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
    else if (tk.t === 'var') vals.push(+calc || 0);
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
