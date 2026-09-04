#!/usr/bin/env node
/**
 * Compila  src/*  ->  ../index.html  +  barcomp_viewer.html
 * (un solo archivo, offline, file://)
 *
 *     node build.mjs          (o  npm run build)
 *
 * esbuild empaqueta src/app.js y todo lo que importa —incluido three.js y
 * OrbitControls— en un IIFE que se puede empotrar en un <script> inline. No
 * queda ningún import en tiempo de ejecución, ningún fetch y ninguna CDN: el
 * HTML resultante abre con doble clic en un taller sin red.
 *
 * Requiere `npm install` una sola vez (three + esbuild quedan en node_modules).
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
/* Dos salidas del MISMO archivo:
   · ../index.html         lo que publica GitHub Pages (raíz del repo)
   · barcomp_viewer.html   copia local para abrir con doble clic; va en .gitignore */
const PAGE = path.join(ROOT, '..', 'index.html');
const LOCAL = path.join(ROOT, 'barcomp_viewer.html');

const result = await build({
  entryPoints: [path.join(SRC, 'app.js')],
  bundle: true,
  format: 'iife',
  target: ['chrome110', 'firefox110', 'safari16'],
  minify: true,
  legalComments: 'none',
  charset: 'utf8',
  write: false,
  logLevel: 'info',
});

let js = result.outputFiles[0].text;
const css = fs.readFileSync(path.join(SRC, 'app.css'), 'utf8');

/* `</script` dentro del bundle cerraría el bloque antes de tiempo. Solo puede
   aparecer dentro de una cadena (el HTML del reporte), y ahí `<\/script` es
   exactamente el mismo texto. */
js = js.replaceAll('</script', '<\\/script');
if (/<\/script/i.test(css)) {
  console.error('app.css contiene "</script>": rompería el HTML.');
  process.exit(1);
}

let html = fs.readFileSync(path.join(SRC, 'shell.html'), 'utf8');
html = html.replace('/*__CSS__*/', () => css).replace('/*__APP__*/', () => js);
if (html.includes('/*__')) {
  console.error('Quedaron marcadores sin sustituir en shell.html.');
  process.exit(1);
}

fs.writeFileSync(PAGE, html, 'utf8');
fs.writeFileSync(LOCAL, html, 'utf8');
console.log(`${(html.length / 1024).toFixed(0)} KB  ->  ${PAGE}`);
console.log(`${(html.length / 1024).toFixed(0)} KB  ->  ${LOCAL}`);
