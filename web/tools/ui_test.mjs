/* Smoke test por CDP: no depende de la salida por consola de Edge, que en
   Windows es un binario de subsistema GUI y no siempre engancha stdout.
   Lanza Edge headless con puerto de depuración, se conecta por WebSocket
   (Node 22+ trae WebSocket global) y evalúa el guion dentro de la página. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
/* puerto único por proceso: Edge deja un navegador vivo aunque se mate el
   lanzador, y un puerto reutilizado devuelve el target del zombi. */
const PORT = 9411 + (process.pid % 400);
const PAGE = process.argv[2]
  || 'file:///C:/Users/dany_/Desktop/Programas/Twister Register/index.html';
const PROBE = process.argv[3] || path.join(HERE, 'probe_ui.js');
const PROFILE_DIR = path.join(HERE, 'ep_' + process.pid);

const sleep = ms => new Promise(r => setTimeout(r, ms));

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--no-first-run',
  '--no-default-browser-check', '--disable-extensions',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + PROFILE_DIR,
  '--window-size=1680,960',
  PAGE,
], { stdio: 'ignore', detached: false });

let ws = null;
try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500);
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      target = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
    } catch { /* todavía no levanta */ }
  }
  if (!target) throw new Error('Edge no expuso ningún target en el puerto ' + PORT);

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = e => rej(new Error('WS: ' + (e.message || 'error')));
  });

  let id = 0;
  const pending = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, m => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', {
      expression: expr, awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description
        || r.exceptionDetails.text);
    }
    return r.result.value;
  };

  await send('Runtime.enable');
  /* esperar a que la app haya arrancado de verdad */
  for (let i = 0; i < 40; i++) {
    if (await evaluate('!!(window.BARCOMP && window.BARCOMP.ST.model && document.querySelector("[data-a=vardup]"))')) break;
    await sleep(250);
  }
  const ready = await evaluate('!!(window.BARCOMP && window.BARCOMP.ST.model && document.querySelector("[data-a=vardup]"))');
  if (!ready) throw new Error('la aplicación no arrancó (window.BARCOMP ausente)');

  const probe = fs.readFileSync(PROBE, 'utf8');
  const log = await evaluate(`(function(){${probe}})()`);
  console.log(log);
  const bad = String(log).split('\n').filter(l => /^(FALLA|ERROR|ALERT)/.test(l));
  console.log(bad.length ? `\n${bad.length} PROBLEMA(S)` : '\nsin excepciones');
  process.exitCode = bad.length ? 1 : 0;
} catch (err) {
  console.error('ERROR ' + err.message);
  process.exitCode = 2;
} finally {
  try {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ id: 99999, method: 'Browser.close' }));
      await sleep(300);
    }
  } catch { /* da igual */ }
  try { ws && ws.close(); } catch { /* ya cerrado */ }
  child.kill();
  try {
    fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
  } catch { /* Edge puede seguir con algún archivo tomado */ }
}
