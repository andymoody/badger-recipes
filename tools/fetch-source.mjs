#!/usr/bin/env node
// Takes a source and saves a snapshot for extraction and review in .extraction/<slug>/:
//   source.md   what the source says, as text (the reviewer compares the recipe with this)
//   meta.json   where it came from, when, and what was found
// plus the original (page.html, the PDF, image or document) and any images in it.
//
// Web pages: the schema.org Recipe JSON-LD, then the visible text. If the plain request fails
// or finds no recipe data, it tries again in headless Chrome (pages built by JavaScript, or
// sites that turn away plain requests). A saved page (.html) works too.
// Word, RTF, ODT and text files: converted with macOS textutil; images in a .docx are listed.
// PDFs and images: copied, to be read directly (they need eyes, not a script).
//
// Usage: node tools/fetch-source.mjs <url | file> [--slug <name>] [--out <dir>] [--no-browser]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO } from './lib/data.mjs';
import { readPage } from './lib/html.mjs';
import { renderedHtml } from './lib/chrome.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export const slugify = (s) => String(s).toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '')
  .replace(/^https?:\/\/(www\.)?/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'source';

/** The snapshot text for a web page. */
export function pageMarkdown(page, how) {
  const r = page.recipe;
  const out = ['# Source snapshot', '', 'URL: ' + page.url, 'Fetched: ' + new Date().toISOString().slice(0, 10) + ' (' + how + ')'];
  if (page.site) out.push('Site: ' + page.site);
  if (page.title) out.push('Page title: ' + page.title);
  if (page.image) out.push('Image: ' + page.image);
  out.push('');
  if (r) {
    out.push('## Structured recipe data (schema.org JSON-LD)', '');
    if (r.name) out.push('Name: ' + r.name);
    if (r.author) out.push('Author: ' + r.author);
    if (r.yield.length) out.push('Yield: ' + r.yield.join(' / '));
    const t = Object.entries(r.time).filter(([, v]) => v).map(([k, v]) => k + ' ' + v + ' min');
    if (t.length) out.push('Time: ' + t.join(', '));
    if (r.category.length) out.push('Category: ' + r.category.join(', '));
    if (r.cuisine.length) out.push('Cuisine: ' + r.cuisine.join(', '));
    if (r.keywords.length) out.push('Keywords: ' + r.keywords.join(', '));
    if (r.description) out.push('', 'Description: ' + r.description);
    out.push('', '### Ingredients', ...r.ingredients.map((l) => '- ' + l));
    out.push('', '### Method');
    let n = 0;
    for (const s of r.instructions) {
      if (s.heading) out.push('', '#### ' + s.heading);
      else out.push((++n) + '. ' + s.text);
    }
    out.push('', 'Note: structured data often leaves out notes, tips and variations. Check the page text below for them.');
  } else {
    out.push('## No structured recipe data found', '', 'Read the recipe from the page text below.');
  }
  out.push('', '## Page text', '', page.text);
  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-GB,en;q=0.9' }, redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  return { html: await res.text(), url: res.url || url };
}

async function web(input, dir, { browser = true } = {}) {
  let html, how, url = input, error = null;
  try {
    ({ html, url } = await fetchHtml(input));
    how = 'plain request';
  } catch (e) { error = e.message; }
  let page = html ? readPage(html, input) : null;
  if (browser && (!page || !page.recipe)) {
    const rendered = await renderedHtml(input).catch((e) => { error = (error ? error + '; ' : '') + 'Chrome: ' + e.message; return null; });
    if (rendered) {
      const p2 = readPage(rendered, input);
      if (!page || p2.recipe || p2.text.length > page.text.length) { html = rendered; page = p2; how = 'headless Chrome'; }
    }
  }
  if (!page) throw new Error('Could not fetch ' + input + (error ? ' (' + error + ')' : '') + '. Save the page from a browser (File > Save Page As) and pass the .html file.');
  fs.writeFileSync(path.join(dir, 'page.html'), html);
  if (page.recipe) fs.writeFileSync(path.join(dir, 'recipe.json'), JSON.stringify(page.recipe, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'source.md'), pageMarkdown(page, how));
  return { kind: 'web', url: page.url, finalUrl: url, how, title: page.title, site: page.site, image: page.image, structured: !!page.recipe, warning: page.recipe ? null : 'no schema.org Recipe data: read the page text' };
}

function htmlFile(file, dir) {
  const html = fs.readFileSync(file, 'utf8');
  const page = readPage(html, null);
  fs.copyFileSync(file, path.join(dir, 'page.html'));
  if (page.recipe) fs.writeFileSync(path.join(dir, 'recipe.json'), JSON.stringify(page.recipe, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'source.md'), pageMarkdown({ ...page, url: page.url || '(saved page: ' + path.basename(file) + ')' }, 'saved page'));
  return { kind: 'web', url: page.url, how: 'saved page', title: page.title, site: page.site, image: page.image, structured: !!page.recipe };
}

function document(file, dir) {
  const r = spawnSync('textutil', ['-convert', 'txt', '-stdout', file], { encoding: 'utf8' });
  if (r.error || r.status !== 0) throw new Error('textutil could not convert ' + file + ' (it is macOS only): ' + (r.error ? r.error.message : r.stderr));
  const images = [];
  if (/\.docx$/i.test(file)) {
    const media = path.join(dir, 'media');
    const u = spawnSync('unzip', ['-o', '-j', '-q', file, 'word/media/*', '-d', media], { encoding: 'utf8' });
    if (u.status === 0 && fs.existsSync(media)) images.push(...fs.readdirSync(media).map((f) => path.join('media', f)));
  }
  fs.copyFileSync(file, path.join(dir, path.basename(file)));
  const out = ['# Source snapshot', '', 'File: ' + path.basename(file), 'Converted: ' + new Date().toISOString().slice(0, 10) + ' (textutil)'];
  if (images.length) out.push('Images in the document: ' + images.join(', '));
  out.push('', '## Document text', '', r.stdout.trim(), '', '## Transcription', '', '(Write the recipe here in the layout described in the extract-recipe skill, for tools/draft.mjs.)', '');
  fs.writeFileSync(path.join(dir, 'source.md'), out.join('\n') + '\n');
  return { kind: 'document', name: path.basename(file), images };
}

function visual(file, dir) {
  const ext = path.extname(file).toLowerCase();
  let copy = path.join(dir, path.basename(file));
  fs.copyFileSync(file, copy);
  // HEIC photos from a phone: make a JPEG copy that can be read.
  if (['.heic', '.heif'].includes(ext)) {
    const jpg = copy.replace(/\.[^.]+$/, '.jpg');
    const r = spawnSync('sips', ['-s', 'format', 'jpeg', copy, '--out', jpg], { encoding: 'utf8' });
    if (r.status === 0) copy = jpg;
  }
  const kind = ext === '.pdf' ? 'pdf' : 'image';
  const out = ['# Source snapshot', '', 'File: ' + path.basename(file), 'Copied: ' + new Date().toISOString().slice(0, 10), '',
    '## Read the ' + (kind === 'pdf' ? 'PDF' : 'image') + ' directly', '', 'Open ' + path.relative(dir, copy) + ' with the Read tool. ' +
    (kind === 'pdf' ? 'Text PDFs and scans both work; treat scans like images.' : 'Check every quantity and fraction twice.'),
    '', 'Transcribe the recipe below as you read it, so the reviewer can check the transcription against the original too.', '', '## Transcription', ''];
  fs.writeFileSync(path.join(dir, 'source.md'), out.join('\n'));
  return { kind, name: path.basename(file), read: path.relative(dir, copy) };
}

export async function snapshot(input, { slug, out, browser = true } = {}) {
  const isUrl = /^https?:\/\//i.test(input);
  if (!isUrl && !fs.existsSync(input)) throw new Error('No such file: ' + input);
  const dir = out || path.join(REPO, '.extraction', slug || slugify(isUrl ? input : path.basename(input).replace(/\.[^.]+$/, '')));
  fs.mkdirSync(dir, { recursive: true });
  const ext = isUrl ? '' : path.extname(input).toLowerCase();
  let info;
  if (isUrl) info = await web(input, dir, { browser });
  else if (['.html', '.htm'].includes(ext)) info = htmlFile(input, dir);
  else if (['.docx', '.doc', '.rtf', '.rtfd', '.odt', '.txt', '.webarchive'].includes(ext)) info = document(input, dir);
  else if (['.pdf', '.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.gif'].includes(ext)) info = visual(input, dir);
  else throw new Error('Unknown source type: ' + input);
  const meta = { input, fetched: new Date().toISOString(), ...info };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  return { dir, ...meta };
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const input = args.find((a, i) => !a.startsWith('--') && !['--slug', '--out'].includes(args[i - 1]));
  if (!input) { console.error('Usage: node tools/fetch-source.mjs <url | file> [--slug <name>] [--out <dir>] [--no-browser]'); process.exit(2); }
  try {
    const r = await snapshot(input, { slug: opt('--slug'), out: opt('--out') && path.resolve(opt('--out')), browser: !args.includes('--no-browser') });
    console.log(JSON.stringify(r, null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
