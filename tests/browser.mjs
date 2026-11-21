// The site's static server for the browser tests. The Chrome driver lives in tools/lib/chrome.mjs.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

export { findChrome, launch } from '../tools/lib/chrome.mjs';

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
