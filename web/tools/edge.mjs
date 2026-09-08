/* Lo que los dos bancos (ui_test y ui_shot) necesitaban por igual y tenían
   copiado, cada uno con la ruta de UNA máquina escrita a mano: el navegador,
   la página y el perfil temporal.

   Con la ruta clavada, el banco solo corría en el portátil donde se escribió;
   el CI, que es lo que viene después, no habría podido ejecutarlo nunca. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** La raíz del repo: tools/ está dos niveles por debajo. */
export const ROOT = path.resolve(HERE, '..', '..');

/* Un Edge headless vale; un Chrome o un Chromium headless también, porque lo
   que se usa es el protocolo CDP y no nada propio de Edge. Se buscan en este
   orden y gana el primero que exista. */
const CANDIDATES = {
  win32: [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ],
  darwin: [
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: [
    '/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ],
};
/* En Linux la instalación suele estar en el PATH y no en una ruta fija. */
const ON_PATH = ['microsoft-edge', 'google-chrome', 'chromium', 'chromium-browser'];

const which = (cmd) => {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which',
                             [cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split(/\r?\n/).find(Boolean) || null;
  } catch { return null; }
};

/** El navegador con el que correr el banco.
 *
 *  `EDGE` manda sobre todo lo demás: es la salida para una instalación en un
 *  sitio raro, para un Chrome portable o para el runner del CI. */
export function edgeBinary() {
  const forced = process.env.EDGE;
  if (forced) {
    if (!fs.existsSync(forced)) {
      throw new Error(`EDGE apunta a algo que no existe: ${forced}`);
    }
    return forced;
  }
  for (const p of (CANDIDATES[process.platform] || [])) {
    if (fs.existsSync(p)) return p;
  }
  for (const c of ON_PATH) {
    const p = which(c);
    if (p) return p;
  }
  throw new Error(
    'no se encontró Edge, Chrome ni Chromium.\n'
    + 'Pon la ruta en la variable de entorno EDGE, por ejemplo:\n'
    + '  EDGE="/ruta/a/msedge" npm run test:ui');
}

/** La URL del artefacto que se va a probar. Relativa al repo, no a una
 *  máquina: el argumento sigue mandando para apuntar a otra copia. */
export function pageUrl(argv) {
  if (argv) return /^[a-z]+:/i.test(argv) ? argv : new URL('file://' + path.resolve(argv)).href;
  const f = path.join(ROOT, 'index.html');
  if (!fs.existsSync(f)) {
    throw new Error(`no existe ${f}. Corre \`npm run build\` antes que el banco.`);
  }
  /* pathToFileURL escapa los espacios, que los hay en la ruta del proyecto. */
  return new URL('file://' + f.replace(/\\/g, '/')).href;
}

/** Un perfil temporal propio, y de paso una barrida de los que quedaron de
 *  otras corridas.
 *
 *  Edge puede seguir con algún archivo tomado cuando el banco ya terminó, así
 *  que el borrado del final falla de vez en cuando y el directorio se queda.
 *  Uno cuesta unos megas; veinte no. Se barren al EMPEZAR, cuando ya no hay
 *  ningún Edge de este banco vivo, en vez de insistir al terminar. */
export function makeProfile(prefix) {
  for (const name of fs.readdirSync(HERE)) {
    if (!/^ep_|^eps_/.test(name)) continue;
    try { fs.rmSync(path.join(HERE, name), { recursive: true, force: true }); } catch { /* tomado */ }
  }
  return path.join(HERE, prefix + process.pid);
}

/** Los conmutadores que necesita cualquiera de los tres navegadores para
 *  correr sin pantalla y sin GPU. */
export const HEADLESS_FLAGS = [
  '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--no-first-run',
  '--no-default-browser-check', '--disable-extensions',
];
