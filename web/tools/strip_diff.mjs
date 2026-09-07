#!/usr/bin/env node
/**
 * ¿Este puerto a TypeScript cambió algo de verdad?
 *
 *     node tools/strip_diff.mjs src/scene.ts
 *     node tools/strip_diff.mjs src/scene.ts HEAD~1
 *
 * Coge el archivo `.js` tal como estaba en git, coge el `.ts` de ahora, le
 * borra los tipos al segundo con el MISMO esbuild que hace el build, y compara
 * los dos. Si el puerto fue solo anotaciones, la salida es idéntica y no hay
 * nada que discutir: no se cambió código, así que no se pudo cambiar conducta.
 *
 * Sale con código 1 si hay diferencias, y las imprime.
 *
 * Ojo con lo que ESTO NO dice: una diferencia no siempre es un error (una
 * aserción `!` o un `as` pueden mover una línea sin cambiar nada), pero sí es
 * algo que hay que mirar a mano una por una.
 */
import { transform } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(HERE, '..');
const REPO = path.join(WEB, '..');

const target = process.argv[2];
const rev = process.argv[3] || 'HEAD';
if (!target) {
  console.error('uso: node tools/strip_diff.mjs src/archivo.ts [revisión]');
  process.exit(2);
}

/* La ruta que git conoce es relativa a la raíz del repo, y con `/`. */
const rel = path.relative(REPO, path.resolve(WEB, target)).replaceAll('\\', '/');
const relJs = rel.replace(/\.ts$/, '.js');

const strip = async (code, loader) =>
  (await transform(code, { loader, format: 'esm', target: 'es2022' })).code;

let antes;
try {
  antes = execFileSync('git', ['-C', REPO, 'show', `${rev}:${relJs}`],
    { encoding: 'utf8', maxBuffer: 64 << 20 });
} catch {
  console.error(`No encuentro ${relJs} en ${rev}. ¿Seguro que el archivo era .js antes?`);
  process.exit(2);
}

const ahora = fs.readFileSync(path.resolve(WEB, target), 'utf8');
const a = await strip(antes, 'js');
const b = await strip(ahora, 'ts');

if (a === b) {
  console.log(`IGUAL  ${rel}  —  con los tipos borrados es el mismo archivo que en ${rev}`);
  process.exit(0);
}

/* Hay diferencias: se vuelcan a un temporal y se enseñan con git diff, que
   sabe alinear y colorear mejor que cualquier cosa que escribamos aquí. */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'barcomp-strip-'));
const fa = path.join(tmp, 'antes.js'), fb = path.join(tmp, 'ahora.js');
fs.writeFileSync(fa, a, 'utf8');
fs.writeFileSync(fb, b, 'utf8');
console.log(`DISTINTO  ${rel}  —  revisa cada diferencia a mano:\n`);
try {
  execFileSync('git', ['--no-pager', 'diff', '--no-index', '--', fa, fb],
    { stdio: 'inherit' });
} catch { /* git diff --no-index sale con 1 cuando hay diferencias */ }
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(1);
