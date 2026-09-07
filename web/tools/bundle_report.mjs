#!/usr/bin/env node
/**
 * De qué está hecho index.html.
 *
 *     node tools/bundle_report.mjs
 *
 * Compila con la MISMA configuración que build.mjs pero pidiéndole a esbuild
 * el `metafile`, que dice cuánto ocupa cada módulo YA minimizado dentro del
 * bundle. Reparte esos bytes en tres cubos —three.js, código propio y el
 * resto— y luego cuenta lo que el bundle no explica: el CSS y el esqueleto.
 *
 * No escribe nada: es una sonda, no un paso del build.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

const r = await build({
  entryPoints: [path.join(SRC, 'app.ts')],
  bundle: true,
  format: 'iife',
  target: ['chrome110', 'firefox110', 'safari16'],
  minify: true,
  legalComments: 'none',
  charset: 'utf8',
  write: false,
  metafile: true,
});

const out = Object.values(r.metafile.outputs)[0];
const kb = n => (n / 1024).toFixed(1).padStart(7) + ' KB';
const pct = (n, t) => (100 * n / t).toFixed(1).padStart(5) + ' %';

const inputs = Object.entries(out.inputs)
  .map(([file, v]) => ({ file: file.replaceAll('\\', '/'), bytes: v.bytesInOutput }))
  .sort((a, b) => b.bytes - a.bytes);

const total = inputs.reduce((a, x) => a + x.bytes, 0);
const bucket = f => (f.includes('node_modules/three') ? 'three'
  : f.includes('node_modules') ? 'otras dependencias' : 'código propio');
const sums = {};
for (const x of inputs) sums[bucket(x.file)] = (sums[bucket(x.file)] || 0) + x.bytes;

console.log('== el bundle, por origen ==\n');
for (const [k, v] of Object.entries(sums).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(20)} ${kb(v)}   ${pct(v, total)}`);
}
console.log(`  ${'TOTAL del bundle'.padEnd(20)} ${kb(total)}`);

console.log('\n== código propio, archivo por archivo ==\n');
for (const x of inputs.filter(x => bucket(x.file) === 'código propio')) {
  console.log(`  ${x.file.replace('src/', '').padEnd(28)} ${kb(x.bytes)}`);
}

console.log('\n== los 15 módulos de three más pesados ==\n');
for (const x of inputs.filter(x => bucket(x.file) === 'three').slice(0, 15)) {
  console.log(`  ${x.file.replace('../node_modules/three/', '').padEnd(50)} ${kb(x.bytes)}`);
}

/* Lo que el bundle no explica: el CSS y el esqueleto también van dentro. */
const js = r.outputFiles[0].text.length;
const css = fs.statSync(path.join(SRC, 'app.css')).size;
const shell = fs.statSync(path.join(SRC, 'shell.html')).size;
const page = fs.statSync(path.join(ROOT, '..', 'index.html')).size;
console.log('\n== la página publicada ==\n');
console.log(`  script (bundle)      ${kb(js)}`);
console.log(`  app.css              ${kb(css)}`);
console.log(`  shell.html           ${kb(shell)}`);
console.log(`  index.html en disco  ${kb(page)}`);
console.log(`\n  three.js es el ${pct(sums.three || 0, js)} del script y el ${pct(sums.three || 0, page)} de la página.`);
