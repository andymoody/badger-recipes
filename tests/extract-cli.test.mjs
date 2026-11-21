// The extraction command-line tools end to end: fetching sources into snapshots, drafting a
// recipe from one, rendering, linting and looking up the old collection.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { ROOT } from './helpers.mjs';
import { findChrome } from '../tools/lib/chrome.mjs';
import { readYield, readTranscription, draftRecipe } from '../tools/draft.mjs';
import { loadData } from './helpers.mjs';
import { findOld } from '../tools/old-recipe.mjs';

const FIX = path.join(ROOT, 'tests/fixtures/sources');
// Async, so the test's own web server can answer while a tool runs.
const run = (tool, ...args) => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(ROOT, 'tools', tool), ...args], { cwd: ROOT });
  let stdout = '', stderr = '';
  p.stdout.on('data', (d) => { stdout += d; });
  p.stderr.on('data', (d) => { stderr += d; });
  const timer = setTimeout(() => p.kill(), 60000);
  p.on('close', (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
});
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'badger-extract-'));
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const json = (...p) => JSON.parse(read(...p));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

let server, base;
before(async () => {
  server = http.createServer((req, res) => {
    const f = path.join(FIX, path.basename(req.url));
    if (!fs.existsSync(f)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port + '/';
});
after(() => new Promise((r) => server.close(r)));

describe('fetch-source: web pages', () => {
  test('a page with recipe data: snapshot, structured recipe and the original page', async () => {
    const out = path.join(tmp, 'banana');
    const r = await run('fetch-source.mjs', base + 'blog-banana-bread.html', '--out', out, '--no-browser');
    assert.equal(r.status, 0, r.stderr);
    const meta = json(out, 'meta.json');
    assert.equal(meta.kind, 'web');
    assert.equal(meta.how, 'plain request');
    assert.equal(meta.structured, true);
    assert.equal(meta.url, 'https://sunnyside.example/best-banana-bread/', 'the canonical og:url');
    assert.equal(meta.input, base + 'blog-banana-bread.html');
    assert.equal(json(out, 'recipe.json').name, 'The Best Banana Bread');
    const md = read(out, 'source.md');
    assert.match(md, /## Structured recipe data \(schema\.org JSON-LD\)/);
    assert.match(md, /#### Make the batter\n1\. Preheat the oven to 350°F \(175°C\)/);
    assert.match(md, /## Page text[\s\S]*For chocolate chip banana bread/);
    assert.ok(fs.existsSync(path.join(out, 'page.html')));
  });
  test('a page without recipe data says so, and keeps the text', async () => {
    const out = path.join(tmp, 'rock');
    const r = await run('fetch-source.mjs', base + 'no-structured-data.html', '--out', out, '--no-browser');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(json(out, 'meta.json').structured, false);
    assert.match(json(out, 'meta.json').warning, /read the page text/);
    assert.match(read(out, 'source.md'), /## No structured recipe data found[\s\S]*- 225g self-raising flour/);
    assert.ok(!fs.existsSync(path.join(out, 'recipe.json')));
  });
  test('a page that fails says how to save it instead', async () => {
    const r = await run('fetch-source.mjs', base + 'missing.html', '--out', path.join(tmp, 'missing'), '--no-browser');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /HTTP 404[\s\S]*Save Page As/);
  });
  test('a saved page (.html file) works the same way', async () => {
    const out = path.join(tmp, 'saved');
    const r = await run('fetch-source.mjs', path.join(FIX, 'uk-chicken-curry.html'), '--out', out);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(json(out, 'meta.json').how, 'saved page');
    assert.equal(json(out, 'recipe.json').name, 'Easy chicken curry');
  });
  test('a page built by JavaScript is read in headless Chrome', { skip: !findChrome() && 'Chrome not found' }, async () => {
    const out = path.join(tmp, 'lemon');
    const r = await run('fetch-source.mjs', base + 'script-built.html', '--out', out);
    assert.equal(r.status, 0, r.stderr);
    const meta = json(out, 'meta.json');
    assert.equal(meta.how, 'headless Chrome');
    assert.equal(meta.structured, true);
    assert.deepEqual(json(out, 'recipe.json').instructions, [{ text: 'Heat the oven to 180C.' }, { text: 'Beat everything together and bake for 45 mins.' }]);
  });
});

describe('fetch-source: files', () => {
  const hasTextutil = spawnSync('which', ['textutil']).status === 0;
  test('a Word document is converted to text, with a transcription section to fill in', { skip: !hasTextutil && 'textutil is macOS only' }, async () => {
    const txt = path.join(tmp, 'scones.txt');
    fs.writeFileSync(txt, "Grandma's scones\n\n225g self-raising flour\n50g butter\n150ml milk\n\nRub the butter into the flour, add the milk and bake at 220C for 12 minutes.\n");
    const docx = path.join(tmp, "Grandma's scones.docx");
    execFileSync('textutil', ['-convert', 'docx', txt, '-output', docx]);
    const out = path.join(tmp, 'scones');
    const r = await run('fetch-source.mjs', docx, '--out', out);
    assert.equal(r.status, 0, r.stderr);
    const meta = json(out, 'meta.json');
    assert.equal(meta.kind, 'document');
    assert.equal(meta.name, "Grandma's scones.docx");
    const md = read(out, 'source.md');
    assert.match(md, /## Document text\n\nGrandma's scones\n\n225g self-raising flour/);
    assert.match(md, /## Transcription/);
  });
  test('Word line breaks (Unicode line separators) become real lines', { skip: !hasTextutil && 'textutil is macOS only' }, async () => {
    const LS = String.fromCharCode(0x2028);
    const txt = path.join(tmp, 'eggs.txt');
    fs.writeFileSync(txt, 'Black pudding Scotch eggs' + LS + 'Serves 6' + LS + 'Ingredients' + LS + '400g black pudding' + LS + '200g fatty minced pork\n');
    const docx = path.join(tmp, 'eggs.docx');
    execFileSync('textutil', ['-convert', 'docx', txt, '-output', docx]);
    const out = path.join(tmp, 'eggs');
    assert.equal((await run('fetch-source.mjs', docx, '--out', out)).status, 0);
    assert.match(read(out, 'source.md'), /Black pudding Scotch eggs\nServes 6\nIngredients\n400g black pudding\n200g fatty minced pork/);
  });
  test('an image is copied to be read directly', async () => {
    const out = path.join(tmp, 'photo');
    const r = await run('fetch-source.mjs', path.join(ROOT, 'assets/badger.jpg'), '--out', out);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(json(out, 'meta.json').kind, 'image');
    assert.ok(fs.existsSync(path.join(out, 'badger.jpg')));
    assert.match(read(out, 'source.md'), /Open badger\.jpg with the Read tool[\s\S]*## Transcription/);
  });
  test('unknown file types and missing files are refused', async () => {
    assert.match((await run('fetch-source.mjs', path.join(ROOT, 'build.js'), '--out', path.join(tmp, 'x'))).stderr, /Unknown source type/);
    assert.match((await run('fetch-source.mjs', path.join(tmp, 'nope.pdf'))).stderr, /No such file/);
  });
});

describe('draft', () => {
  test('a draft from a web snapshot: metric, catalogue ids, °C, headings, source', async () => {
    const out = path.join(tmp, 'bb');
    assert.equal((await run('fetch-source.mjs', path.join(FIX, 'blog-banana-bread.html'), '--out', out)).status, 0);
    const r = await run('draft.mjs', out, '--id', 'banana_bread');
    assert.equal(r.status, 0, r.stderr);
    const d = json(out, 'draft.json');
    assert.equal(d.id, 'banana_bread');
    assert.equal(d.serves, 10);
    assert.deepEqual(d.time, { prep: 15, cook: 60 }, 'a total that is just prep + cook is left out');
    assert.deepEqual(d.source, { type: 'web', url: 'https://sunnyside.example/best-banana-bread/', title: 'Sunny Side Kitchen' });
    assert.deepEqual(d.ingredients.find((l) => l.item === 'plain_flour'), { item: 'plain_flour', qty: 190, unit: 'g' });
    assert.deepEqual(d.ingredients.find((l) => l.item === 'salt'), { item: 'salt', qty: 1, unit: 'pinch' });
    assert.deepEqual(d.ingredients.find((l) => l.item === 'butter'), { item: 'butter', qty: 75, unit: 'g', prep: 'melted', note: 'unsalted' });
    assert.deepEqual(d.steps[0], { heading: 'Make the batter' });
    assert.equal(d.steps[1], 'Preheat the oven to 175°C (155°C fan) and butter a 4x8-inch loaf pan.');
    assert.match(d.steps[5], /at 180°C \(160°C fan\), until a tester/);
    const report = read(out, 'draft-report.md');
    assert.match(report, /Title looks like Title Case/);
    assert.match(report, /matched butter by the end of the line \(ends with "butter"\), with "unsalted" in the note: check it is the same product/);
    assert.match(report, /WARNING: needs a density: 0\.5 cup of walnuts/);
    assert.match(report, /step 2: dropped 350°F given next to °C/);
    assert.match(report, /Source image: https:\/\/sunnyside\.example\/wp-content\/uploads\/banana-bread-1200\.jpg/);
  });
  test('a draft from a transcription (PDFs, photos, documents)', async () => {
    const out = path.join(tmp, 'photo-draft');
    assert.equal((await run('fetch-source.mjs', path.join(ROOT, 'assets/badger.jpg'), '--out', out)).status, 0);
    fs.appendFileSync(path.join(out, 'source.md'), [
      'Title: Rock cakes', 'Serves: 12', 'Time: prep 15, cook 15',
      '### Ingredients', '- 225g self-raising flour', '- 100g butter, cubed', '#### To finish', '- 1 tbsp demerara sugar',
      '### Method', '1. Heat the oven to 400°F.', '2. Rub the butter into the flour.', '### Notes', 'Nan used lard.', '',
    ].join('\n'));
    const r = await run('draft.mjs', out, '--id', 'rock_cakes');
    assert.equal(r.status, 0, r.stderr);
    const d = json(out, 'draft.json');
    assert.equal(d.title, 'Rock cakes');
    assert.equal(d.serves, 12);
    assert.deepEqual(d.time, { prep: 15, cook: 15 });
    assert.deepEqual(d.source, { type: 'file', name: 'badger.jpg', drive: 'TODO: Google Drive link' });
    assert.deepEqual(d.ingredients[1], { item: 'butter', qty: 100, unit: 'g', prep: 'cubed' });
    assert.deepEqual(d.ingredients[2], { heading: 'To finish' });
    assert.deepEqual(d.steps, ['Heat the oven to 200°C (180°C fan).', 'Rub the butter into the flour.']);
    assert.equal(d.notes, 'Nan used lard.');
  });
  test('no transcription yet: a clear error', async () => {
    const out = path.join(tmp, 'empty');
    assert.equal((await run('fetch-source.mjs', path.join(ROOT, 'assets/badger.jpg'), '--out', out)).status, 0);
    const r = await run('draft.mjs', out);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /write the "## Transcription" section/);
  });
  test('lines from the Scotch eggs Word doc (pilot 2): known ingredients at the end of a line, descriptors kept', async () => {
    const src = {
      name: 'Black pudding Scotch eggs', yield: ['Serves 6'],
      ingredients: ['400g homemade or good-quality shop-bought black pudding', '200g fatty minced pork', '50g fresh white breadcrumbs', '6 medium eggs, at room temperature', 'Sea salt and freshly ground black pepper'],
      instructions: [{ text: 'Preheat the oven to 180 degrees.' }],
    };
    const { draft, report } = draftRecipe(src, { kind: 'document', name: 'eggs.docx' }, loadData(), { id: 'scotch_eggs' });
    assert.notEqual(draft.course, 'dessert', 'black pudding is not a pudding');
    assert.deepEqual(draft.ingredients.slice(0, 4), [
      { item: 'black_pudding', qty: 400, unit: 'g', note: 'homemade or good-quality shop-bought' },
      { item: 'pork_mince', qty: 200, unit: 'g', note: 'fatty' },
      { item: 'breadcrumbs', qty: 50, unit: 'g', note: 'fresh white' },
      { item: 'egg', qty: 6, prep: 'at room temperature', note: 'medium' },
    ]);
    assert.match(draft.ingredients[4].item, /^NEW:/, 'two ingredients in one line are not matched to either');
    assert.match(report, /matched pork_mince by the end of the line \(ends with "minced pork"\), with "fatty" in the note/);
    assert.match(report, /check: "180 degrees" has no unit/);
    assert.doesNotMatch(report, /offers alternatives/, '"homemade or shop-bought" is a description, not two ingredients');
  });
  test('reading yields', async () => {
    assert.deepEqual(readYield(['Serves 4']), { serves: 4, note: null });
    assert.deepEqual(readYield(['4 servings']), { serves: 4, note: null });
    assert.deepEqual(readYield(['6-8']), { serves: 6, note: 'Serves 6–8.' });
    assert.deepEqual(readYield(['300g']), { yield: { qty: 300, unit: 'g' } });
    assert.deepEqual(readYield(['Makes 12 pancakes']), { yield: { qty: 12, name: 'pancakes' } });
    assert.deepEqual(readYield(['1 loaf (10 slices)', 'about a dozen']), { yield: { qty: 1, name: 'loaf (10 slices)' } });
    assert.deepEqual(readYield([]), {});
  });
  test('reading a transcription', async () => {
    const t = readTranscription('# x\n## Transcription\nTitle: Soup\nYield: 1.5 l\n### Ingredients\n- 1 onion\n### Method\n1. Cook.\n');
    assert.deepEqual(t, { name: 'Soup', yield: ['1.5 l'], time: {}, ingredients: ['1 onion'], instructions: [{ text: 'Cook.' }], notes: [] });
    assert.equal(readTranscription('no section'), null);
  });
});

describe('render and lint', () => {
  test('render prints one state, or the whole review report', async () => {
    const one = await run('render.mjs', 'lamb_youvetsi', '--root', 'tests/fixtures/site', '--choice', 'lamb=leg', '--choice', 'lamb/leg/method=sous_vide');
    assert.equal(one.status, 0, one.stderr);
    assert.match(one.stdout, /Options: Lamb = Leg; Method = Sous vide/);
    const report = await run('render.mjs', 'lamb_youvetsi', '--root', 'tests/fixtures/site');
    assert.match(report.stdout, /^RECIPE REVIEW: lamb_youvetsi/);
    assert.match(report.stdout, /Variants: 3/);
    assert.equal((await run('render.mjs', 'nope')).status, 1);
  });
  test('lint passes on the collection, and fails on warnings', async () => {
    const ok = await run('lint.mjs');
    assert.equal(ok.status, 0, ok.stdout);
    const root = path.join(tmp, 'lintroot');
    fs.mkdirSync(path.join(root, 'recipes'), { recursive: true });
    for (const f of ['ingredients.json', 'tags.json']) fs.copyFileSync(path.join(ROOT, f), path.join(root, f));
    fs.writeFileSync(path.join(root, 'recipes/bad.json'), JSON.stringify({ id: 'bad', title: 'Bad', course: 'main', serves: 2, source: { type: 'own' }, ingredients: [{ item: 'butter', qty: 1, unit: 'g' }], steps: ['Melt the butter at 300°F.'] }));
    const bad = await run('lint.mjs', 'bad', '--root', root);
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /WARN  bad step 1: °F temperature/);
  });
});

describe('old-recipe', () => {
  test('matching old titles: word starts, keywords and near spellings', () => {
    const list = [
      { id: 'slow_cooked_lamb_with_orzo', title: 'Slow Cooked Lamb with Orzo (Giouvetsi)', keywords: 'lamb orzo, Greek' },
      { id: 'lamb_raan', title: 'Lamb Raan' },
      { id: 'beef_rendang', title: 'Beef rendang' },
    ];
    const ids = (q) => findOld(list, q).map((r) => r.id);
    assert.deepEqual(ids('youvetsi'), ['slow_cooked_lamb_with_orzo']);
    assert.deepEqual(ids('greek lamb'), ['slow_cooked_lamb_with_orzo'], 'keywords count');
    assert.deepEqual(ids('lam'), ['slow_cooked_lamb_with_orzo', 'lamb_raan']);
    assert.deepEqual(ids('rendan'), ['beef_rendang']);
    assert.deepEqual(ids('ramen'), [], 'short words must match from the start, not loosely');
  });

  const hasOld = spawnSync('git', ['cat-file', '-e', '4623299'], { cwd: ROOT }).status === 0;
  test('lists the old collection and finds entries by title words', { skip: !hasOld && 'old commit not in this clone' }, async () => {
    const list = await run('old-recipe.mjs', '--list');
    assert.equal(list.stdout.trim().split('\n').length, 109);
    const found = await run('old-recipe.mjs', 'giouvetsi');
    assert.equal(found.status, 0);
    assert.match(found.stdout, /"title": "Slow Cooked Lamb with Orzo \(Giouvetsi\)"/);
    assert.equal((await run('old-recipe.mjs', 'no such dish')).status, 1);
    assert.match((await run('old-recipe.mjs', 'lamb', 'youvetsi')).stdout, /Giouvetsi/, 'a different spelling still finds it');
  });
});
