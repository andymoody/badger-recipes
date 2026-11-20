// A minimal headless Chrome driver over the DevTools protocol, plus a static server for the
// site. No dependencies: Node's built-in WebSocket and http modules.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chrome's path: CHROME_PATH, the macOS app, or google-chrome/chromium on the PATH. Null if none. */
export function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const r = spawnSync('which', [name], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return null;
}

export async function launch(exe) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'badger-chrome-'));
  const args = [
    '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions', '--mute-audio',
  ];
  // GitHub's Ubuntu runners don't allow Chrome's sandbox.
  if (process.platform === 'linux') args.push('--no-sandbox');
  const proc = spawn(exe, [...args, 'about:blank'], { stdio: 'ignore' });
  const portFile = path.join(dir, 'DevToolsActivePort');
  const started = Date.now();
  let lines = [];
  while (lines.length < 2) {
    if (Date.now() - started > 20000) { proc.kill(); throw new Error('Chrome did not start: ' + exe); }
    await sleep(50);
    if (fs.existsSync(portFile)) lines = fs.readFileSync(portFile, 'utf8').trim().split('\n');
  }
  const ws = new WebSocket('ws://127.0.0.1:' + lines[0] + lines[1]);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('Could not connect to Chrome')); });
  return new Browser(proc, ws, dir);
}

class Browser {
  constructor(proc, ws, dir) {
    Object.assign(this, { proc, ws, dir, id: 0, pending: new Map(), pages: new Map() });
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
      } else if (msg.sessionId && this.pages.has(msg.sessionId)) {
        this.pages.get(msg.sessionId).onEvent(msg);
      }
    };
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async newPage() {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this, sessionId);
    this.pages.set(sessionId, page);
    await Promise.all(['Runtime.enable', 'Page.enable', 'Log.enable'].map((m) => page.send(m)));
    return page;
  }

  async close() {
    try { await this.send('Browser.close'); } catch { /* already gone */ }
    this.ws.close();
    this.proc.kill();
    await sleep(100);
    fs.rmSync(this.dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

class Page {
  constructor(browser, sessionId) {
    Object.assign(this, { browser, sessionId, errors: [], onLoad: null });
  }

  onEvent({ method, params }) {
    if (method === 'Runtime.exceptionThrown') {
      const d = params.exceptionDetails;
      this.errors.push((d.exception && d.exception.description) || d.text);
    } else if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      this.errors.push('console.error: ' + params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
      this.errors.push(params.entry.text + (params.entry.url ? ' (' + params.entry.url + ')' : ''));
    } else if (method === 'Page.loadEventFired' && this.onLoad) {
      this.onLoad();
    }
  }

  send(method, params) {
    return this.browser.send(method, params, this.sessionId);
  }

  async goto(url) {
    const loaded = new Promise((r) => { this.onLoad = r; });
    await this.send('Page.navigate', { url });
    await loaded;
  }

  /** Runs a function in the page with JSON arguments and returns its (awaited, JSON) result. */
  async eval(fn, ...args) {
    const expression = '(' + fn + ')(...' + JSON.stringify(args) + ')';
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('In page: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
    return r.result.value;
  }

  /** Waits until fn returns something truthy in the page, and returns it. */
  async waitFor(fn, ...args) {
    const started = Date.now();
    for (;;) {
      const v = await this.eval(fn, ...args);
      if (v) return v;
      if (Date.now() - started > 5000) throw new Error('Timed out waiting for: ' + fn);
      await sleep(25);
    }
  }

  viewport(width, height = 900) {
    return this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  }
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

/**
 * Serves the site's code from the repo and the data (recipes.json, images/) from dataDir.
 * Under /broken/ the same site is served without recipes.json, to test the error message.
 */
export async function serveSite(dataDir) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const broken = p.startsWith('/broken/');
    if (broken) p = p.slice('/broken'.length);
    if (p === '/') p = '/index.html';
    const fromData = p === '/recipes.json' || p.startsWith('/images/');
    const base = fromData ? dataDir : ROOT;
    const file = path.join(base, p);
    if (!file.startsWith(base + path.sep) || (broken && p === '/recipes.json')) { res.writeHead(404); res.end(); return; }
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise((r) => server.close(r)) };
}
