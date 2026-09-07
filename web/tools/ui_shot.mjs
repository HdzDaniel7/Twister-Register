/* Captura por CDP: prepara un estado y guarda un PNG. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
/* puerto único por proceso: Edge deja un navegador vivo aunque se mate el
   lanzador, y un puerto reutilizado devuelve el target del zombi. */
const PORT = 9412 + (process.pid % 400);
const PAGE = 'file:///C:/Users/dany_/Desktop/Programas/Twister Register/index.html';
const SETUP = process.argv[2] || path.join(HERE, 'setup_shot.js');
const OUT = process.argv[3] || path.join(HERE, 'shot3.png');
const PROFILE_DIR = path.join(HERE, 'eps_' + process.pid);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--no-first-run',
  '--no-default-browser-check', '--disable-extensions',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + PROFILE_DIR,
  '--window-size=1680,960',
  PAGE,
], { stdio: 'ignore' });

let ws = null;
try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
    } catch { /* aún no */ }
  }
  if (!target) throw new Error('sin target');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WS')); });

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
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  await send('Runtime.enable');
  for (let i = 0; i < 40; i++) {
    if (await evaluate('!!(window.BARCOMP && window.BARCOMP.ST.model && document.querySelector("[data-a=vardup]"))')) break;
    await sleep(250);
  }
  const setup = fs.readFileSync(SETUP, 'utf8');
  const r = await evaluate(`(function(){${setup}})()`);
  if (r) console.log(r);
  await sleep(1200);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('PNG ->', OUT);
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
  try { ws && ws.close(); } catch { /* ya */ }
  child.kill();
  try {
    fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
  } catch { /* Edge puede seguir con algún archivo tomado */ }
}
