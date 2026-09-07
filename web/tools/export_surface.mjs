/* Superficie pública del motor: nombre, tipo y aridad de cada export.
   Sirve para demostrar que partir engine.ts en varios archivos no cambió
   ninguna firma. Se compara la salida de antes con la de después. */
import * as E from '../src/engine.ts';

const rows = Object.keys(E).sort().map(k => {
  const v = E[k];
  const t = typeof v;
  if (t === 'function') return `${k}  function/${v.length}`;
  if (Array.isArray(v)) return `${k}  array[${v.length}]  ${JSON.stringify(v)}`;
  if (v && t === 'object') return `${k}  object  ${JSON.stringify(v)}`;
  return `${k}  ${t}  ${JSON.stringify(v)}`;
});
console.log(rows.join('\n'));
console.log(`\ntotal ${rows.length} exports`);
