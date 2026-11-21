// Browser tests: the real site in headless Chrome, against the sample recipes in
// tests/fixtures/site (not the real collection). They click through the page the way a cook
// would and check what's shown, the URL, and that nothing logs an error.
// Needs Chrome (or CHROME_PATH). Skipped locally if none is found; required in CI.
import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './helpers.mjs';
import { findChrome, launch, serveSite } from './browser.mjs';

const chrome = findChrome();
if (!chrome && process.env.CI) throw new Error('Chrome is required for the browser tests in CI (set CHROME_PATH)');

describe('site in a browser', { skip: !chrome && 'Chrome not found: set CHROME_PATH to run the browser tests' }, () => {
  let browser, server, page, dataDir;
  let n = 0;

  before(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'badger-site-'));
    fs.cpSync(path.join(ROOT, 'tests/fixtures/site'), dataDir, { recursive: true });
    const build = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), '--root', dataDir], { encoding: 'utf8' });
    assert.equal(build.status, 0, 'the sample recipes must build:\n' + build.stdout + build.stderr);
    server = await serveSite(dataDir);
    browser = await launch(chrome);
    page = await browser.newPage();
  });

  after(async () => {
    if (browser) await browser.close();
    if (server) await server.close();
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  afterEach(() => {
    const errors = page.errors.splice(0);
    assert.deepEqual(errors, [], 'the page logged errors');
  });

  /** Loads the site fresh at a hash and waits for the main area to render. */
  async function open(hash = '#/', width = 1200) {
    await page.viewport(width);
    await page.goto(server.url + '/?n=' + n++ + hash);
    await page.waitFor(() => document.querySelector('#main').children.length > 0);
  }
  const texts = (sel) => page.eval((s) => [...document.querySelectorAll(s)].map((e) => e.textContent.trim()), sel);
  const text = (sel) => page.eval((s) => { const e = document.querySelector(s); return e && e.textContent.trim(); }, sel);
  const hash = () => page.eval(() => decodeURIComponent(location.hash));
  const click = (sel, label) => page.eval((s, l) => {
    const el = [...document.querySelectorAll(s)].find((e) => l == null || e.textContent.trim() === l || e.value === l);
    if (!el) throw new Error('nothing to click: ' + s + ' ' + (l || ''));
    el.click();
  }, sel, label);
  const lines = () => texts('#panel-ingredients .lines > li');
  const group = (title) => page.eval((t) => {
    const g = [...document.querySelectorAll('#panel-ingredients .group')].find((x) => (x.querySelector('h3') || {}).textContent === t);
    return g && { info: (g.querySelector('.part-info') || {}).textContent || '', lines: [...g.querySelectorAll('.lines > li')].map((l) => l.textContent.trim()) };
  }, title);

  describe('list view', () => {
    test('shows listed recipes as cards, sorted by title; unlisted parts are hidden', async () => {
      await open();
      assert.deepEqual(await texts('.card-title'), ['Chicken stock', 'Lamb youvetsi', 'Yoghurt flatbreads']);
      assert.equal(await text('.list-view .muted'), '3 recipes');
    });
    test('the sidebar groups tags as tags.json says, and renders no stray objects', async () => {
      await open();
      assert.deepEqual(await texts('.sidebar-label'), ['Cuisine', 'Dish', 'Main ingredient', 'Occasion', 'Diet', 'Method']);
      assert.deepEqual(await texts('.tag-group:first-of-type .tag'), ['Greek', 'Middle Eastern']);
      const body = await page.eval(() => document.body.textContent);
      assert.ok(!body.includes('[object'), 'no "[object …]" in the page');
      assert.ok(!body.includes('undefined'), 'no "undefined" in the page');
    });
    test('tag filters: any within a group, all across groups', async () => {
      await open();
      await click('.tag', 'Greek');
      await page.waitFor(() => document.querySelectorAll('.card').length === 1);
      assert.equal(await text('.list-view h1'), 'Greek');
      await click('.tag', 'Middle Eastern');
      await page.waitFor(() => document.querySelectorAll('.card').length === 2);
      await click('.tag', 'Lamb');
      await page.waitFor(() => document.querySelectorAll('.card').length === 1);
      assert.deepEqual(await texts('.card-title'), ['Lamb youvetsi']);
      assert.equal(await text('.list-view h1'), 'Greek · Middle Eastern · Lamb');
      await click('.link', 'Clear filters');
      await page.waitFor(() => document.querySelectorAll('.card').length === 3);
    });
    test('course filter', async () => {
      await open();
      await click('.course', 'Basics1');
      await page.waitFor(() => document.querySelectorAll('.card').length === 1);
      assert.deepEqual(await texts('.card-title'), ['Chicken stock']);
    });
    test('search: titles, tags and option titles, not ingredients', async () => {
      await open();
      const search = async (q) => {
        await page.eval((v) => { const s = document.querySelector('.search'); s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); }, q);
        return texts('.card-title');
      };
      assert.deepEqual(await search('yoghurt'), ['Yoghurt flatbreads']);
      assert.deepEqual(await search('sous'), ['Lamb youvetsi'], 'tag "Sous vide"');
      assert.deepEqual(await search('leg'), ['Lamb youvetsi'], 'option "Leg"');
      assert.deepEqual(await search('orzo'), [], 'ingredients are not searched');
      assert.equal(await text('.empty'), 'No recipes match.');
    });
    test('clicking a card opens the recipe', async () => {
      await open();
      await click('.card-title', 'Lamb youvetsi');
      await page.waitFor(() => location.hash === '#/lamb_youvetsi' && document.querySelector('.recipe h1'));
      assert.equal(await text('.recipe h1'), 'Lamb youvetsi');
    });
  });

  describe('recipe view: Lamb youvetsi (shared parts, choices, a choice inside a choice)', () => {
    test('header: meta and tag chips', async () => {
      await open('#/lamb_youvetsi');
      assert.equal(await text('.meta'), 'Main · Serves 4 · Prep 20 min · Cook 3 hr 20 min');
      assert.deepEqual(await texts('.recipe-header .tag'), ['Greek', 'Lamb', 'Sunday roast', 'Sous vide']);
      assert.equal(await text('.source'), 'Our own recipe');
    });
    test('ingredients: parts in method order, then the recipe\'s own', async () => {
      await open('#/lamb_youvetsi');
      assert.deepEqual(await texts('#panel-ingredients h3'), ['Chicken stock', 'Lamb: Shoulder, braised', 'Spice blend', 'Lamb youvetsi']);
      const own = await group('Lamb youvetsi');
      assert.deepEqual(own.lines, ['2 tbsp Olive oil', '1 Onion, chopped', '1 tin Chopped tomatoes (400g)', '300g Orzo', 'Salt (to taste)', 'To serve', '100g Feta, crumbledoptional']);
    });
    test('a shared batch part: full batch by default, with what you need', async () => {
      await open('#/lamb_youvetsi');
      const stock = await group('Chicken stock');
      assert.match(stock.info, /Recipe makes 1l; you need 500ml\./);
      assert.match(stock.info, /Open Chicken stock →/);
      assert.deepEqual(stock.lines, ['1kg Chicken wing', '1.5l Water', '1 Onion, halved']);
      assert.equal(await page.eval(() => document.querySelector('#panel-ingredients .group .toggle input').checked), true);
    });
    test('unticking "Make full batch" scales the part to what is needed, and goes in the URL', async () => {
      await open('#/lamb_youvetsi');
      await click('#panel-ingredients .group .toggle input');
      assert.equal(await hash(), '#/lamb_youvetsi?full.stock=0');
      assert.deepEqual((await group('Chicken stock')).lines, ['500g Chicken wing', '750ml Water', '½ Onion, halved']);
    });
    test('an unlisted part used in part: scaled to the 1 tbsp needed, no link, ≈ on the chilli', async () => {
      await open('#/lamb_youvetsi');
      const spice = await group('Spice blend');
      assert.match(spice.info, /Recipe makes 4 tbsp; you need 1 tbsp\./);
      assert.doesNotMatch(spice.info, /Open/);
      assert.deepEqual(spice.lines, ['1½ tsp Smoked paprika', '¾ tsp Ground cumin', '⅓ tsp≈ Chilli flakesIn proportion: ¼ tsp']);
    });
    test('method: conditional step for the shoulder, headings continue the numbering', async () => {
      await open('#/lamb_youvetsi');
      assert.deepEqual(await texts('.method > .steps > li > p'), [
        'Make the stock, or use 500ml from the freezer.', 'Cook the lamb.', 'Brown the shoulder all over, then braise, covered, at 160°C for 3 hours.', 'Pull the meat off the bone and discard the bone.',
        'Mix the spice blend.', 'Soften the onion in the oil, add the spice blend, tomatoes, stock and orzo, and bake at 180°C for 20 minutes.', 'Serve the lamb on the orzo, topped with feta.',
      ]);
      assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.method > .steps')].map((o) => o.start)), [1, 5]);
      assert.deepEqual(await texts('.method > .step-heading'), ['The orzo']);
    });
    test('embedded parts expand in place', async () => {
      await open('#/lamb_youvetsi');
      assert.equal(await page.eval(() => document.querySelector('details.part').open), false);
      await click('details.part > summary', 'Chicken stock');
      assert.equal(await page.eval(() => document.querySelector('details.part').open), true);
      assert.ok((await text('details.part .part-body')).includes('Simmer everything for 3 hours, then strain.'));
    });
    test('choosing the leg: the nested method choice appears and the bone step goes', async () => {
      await open('#/lamb_youvetsi');
      assert.deepEqual(await texts('.choice legend'), ['Lamb']);
      await click('input[name="choice-lamb"]', 'leg');
      assert.equal(await hash(), '#/lamb_youvetsi?lamb=leg');
      assert.deepEqual(await texts('.choice legend'), ['Lamb', 'Method']);
      const steps = await texts('.method > .steps > li > p');
      assert.ok(!steps.some((t) => t.startsWith('Pull the meat') || t.startsWith('Brown the shoulder')));
      assert.deepEqual(steps.slice(1, 5), ['Cook the lamb.', 'Season the leg well.', 'Cook the leg.', 'Roast at 180°C for 1 hour 20 minutes, then rest.'], 'the chosen options switch straight into the method');
      assert.deepEqual(await texts('details.part > summary'), ['Chicken stock', 'Spice blend'], 'only shared parts are collapsible');
      assert.deepEqual(await texts('#panel-ingredients h3'), ['Chicken stock', 'Lamb: Leg', 'Spice blend', 'Lamb youvetsi'], 'roasting adds no ingredients, so it has no empty heading');
    });
    test('choosing sous vide: its steps replace the roast, its oil joins the shopping list', async () => {
      await open('#/lamb_youvetsi?lamb=leg');
      await click('input[name="choice-lamb/leg/method"]', 'sous_vide');
      assert.equal(await hash(), '#/lamb_youvetsi?lamb=leg&lamb/leg/method=sous_vide');
      assert.deepEqual((await group('Method: Sous vide')).lines, ['1 tbsp Olive oil (for searing)'], 'sous vide brings its own oil, so it has a group');
      const steps = await texts('.method > .steps > li > p');
      assert.deepEqual(steps.slice(3, 6), ['Cook the leg.', 'Bag the leg and cook at 57°C for 8 hours.', 'Pat dry and sear all over in a very hot pan.']);
      assert.ok(!steps.some((t) => t.startsWith('Roast at')));
      await click('.tab', 'Shopping list');
      assert.ok((await texts('.shopping li')).includes('3 tbsp Olive oilstaple'));
    });
    test('the header time follows the chosen method', async () => {
      await open('#/lamb_youvetsi');
      assert.equal(await text('.recipe-header .meta'), 'Main · Serves 4 · Prep 20 min · Cook 3 hr 20 min');
      await click('input[name="choice-lamb"]', 'leg');
      assert.equal(await text('.recipe-header .meta'), 'Main · Serves 4 · Prep 20 min · Cook 1 hr 40 min');
      await click('input[name="choice-lamb/leg/method"]', 'sous_vide');
      assert.equal(await text('.recipe-header .meta'), 'Main · Serves 4 · Prep 20 min · Cook 8 hr 20 min');
    });
    test('the selection survives a reload, and the default leaves the URL', async () => {
      await open('#/lamb_youvetsi?lamb=leg');
      assert.equal(await page.eval(() => document.querySelector('input[value="leg"]').checked), true);
      await click('input[name="choice-lamb"]', 'shoulder');
      assert.equal(await hash(), '#/lamb_youvetsi');
    });
    test('servings: + scales everything, shows the reminder, and Reset goes back', async () => {
      await open('#/lamb_youvetsi');
      assert.equal(await text('.reminder'), null);
      await click('.step-btn', '+');
      assert.equal(await hash(), '#/lamb_youvetsi?serves=5');
      assert.equal(await text('.stepper output'), '5');
      assert.match(await text('.reminder'), /Cooking times, pan sizes and raising agents/);
      const l = await lines();
      assert.ok(l.includes('375g Orzo'));
      assert.ok(l.includes('1.5kg Lamb shoulder (bone in)'));
      assert.match((await group('Chicken stock')).info, /you need 625ml/);
      await click('.link', 'Reset');
      assert.equal(await hash(), '#/lamb_youvetsi');
      assert.ok((await lines()).includes('300g Orzo'));
    });
    test('servings can\'t go below 1', async () => {
      await open('#/lamb_youvetsi?serves=1');
      assert.equal(await page.eval(() => document.querySelector('.step-btn').disabled), true);
    });
  });

  describe('shopping list', () => {
    test('merged lines; staples and optional items start unticked', async () => {
      await open('#/lamb_youvetsi');
      await click('.tab', 'Shopping list');
      const items = await page.eval(() => [...document.querySelectorAll('.shopping li')].map((li) => [li.querySelector('.shop-text').textContent, li.querySelector('input').checked]));
      assert.deepEqual(items, [
        ['2 tbsp Olive oil', false], ['2 Onions', true], ['1 tin Chopped tomatoes', true], ['300g Orzo', true], ['Salt', false], ['100g Feta', false],
        ['1kg Chicken wing', true], ['1.5l Water', false], ['1½ tsp Smoked paprika', true], ['¾ tsp Ground cumin', true], ['⅓ tsp Chilli flakes', true],
        ['1.2kg Lamb shoulder', true],
      ]);
    });
    test('copies the ticked lines for AnyList, following the cook\'s ticks', async () => {
      await open('#/lamb_youvetsi');
      await click('.tab', 'Shopping list');
      await page.eval(() => { navigator.clipboard.writeText = async (t) => { window.copied = t; }; });
      assert.equal(await text('.copy-row .primary'), 'Copy 8 for AnyList');
      await page.eval(() => [...document.querySelectorAll('.shopping li')].find((li) => li.textContent.includes('Onions')).querySelector('input').click());
      assert.equal(await text('.copy-row .primary'), 'Copy 7 for AnyList');
      await click('.copy-row .primary');
      await page.waitFor(() => window.copied);
      assert.equal(await page.eval(() => window.copied), ['1 tin Chopped tomatoes', '300g Orzo', '1kg Chicken wing', '1½ tsp Smoked paprika', '¾ tsp Ground cumin', '⅓ tsp Chilli flakes', '1.2kg Lamb shoulder'].join('\n'));
      assert.equal(await text('.copy-status'), 'Copied. Paste it into AnyList.');
    });
    test('the tab stays selected when the page re-renders', async () => {
      await open('#/lamb_youvetsi');
      await click('.tab', 'Shopping list');
      await click('.step-btn', '+');
      assert.equal(await page.eval(() => document.querySelector('#panel-shopping').hidden), false);
      assert.ok((await texts('.shop-text')).includes('375g Orzo'));
    });
  });

  describe('recipe view: Yoghurt flatbreads (yield only, headings, ≈ markers)', () => {
    test('a quantity multiplier instead of servings', async () => {
      await open('#/flatbreads');
      assert.equal(await text('.stepper-label'), 'Quantity');
      assert.equal(await text('.stepper output'), '× 1');
      assert.equal(await text('.meta'), 'Baking · Makes 8 flatbreads');
    });
    test('× 2: flour doubles, the yeast rounds to 2 tsp unmarked, the salt is 1¾ tsp with ≈', async () => {
      await open('#/flatbreads');
      await click('.step-btn', '+');
      await click('.step-btn', '+');
      assert.equal(await hash(), '#/flatbreads?x=2');
      assert.deepEqual(await lines(), [
        'For the dough', '500g Strong white flour', '2 tsp Fast-action dried yeast', '1¾ tsp≈ SaltIn proportion: 2 tsp',
        '300g Greek yoghurt', '100–150ml Water (warm)', 'To finish', '2 tsp Nigella seedsoptional',
      ]);
    });
    test('tapping ≈ shows the proportional amount', async () => {
      await open('#/flatbreads?x=2');
      const visible = () => page.eval(() => getComputedStyle(document.querySelector('.np-detail')).display !== 'none');
      assert.equal(await visible(), false);
      await click('.np');
      assert.equal(await visible(), true);
      assert.equal(await page.eval(() => document.querySelector('.np').getAttribute('aria-expanded')), 'true');
    });
    test('step headings split the method and keep the numbering', async () => {
      await open('#/flatbreads');
      assert.deepEqual(await texts('.method > .step-heading'), ['Dough', 'Cooking']);
      assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.method > .steps')].map((o) => o.start)), [1, 3]);
    });
    test('a tag chip on the recipe filters the list', async () => {
      await open('#/flatbreads');
      await click('.recipe-header .tag', 'Bread');
      await page.waitFor(() => location.hash === '#/' && document.querySelector('.list-view'));
      assert.equal(await text('.list-view h1'), 'Bread');
      assert.deepEqual(await texts('.card-title'), ['Yoghurt flatbreads']);
    });
  });

  describe('mobile', () => {
    test('the sidebar hides behind Browse, and closes after choosing', async () => {
      await open('#/', 390);
      const shown = () => page.eval(() => getComputedStyle(document.querySelector('#sidebar')).display !== 'none');
      assert.equal(await shown(), false);
      assert.equal(await page.eval(() => getComputedStyle(document.querySelector('.topbar')).display), 'flex');
      await click('#browseToggle');
      assert.equal(await shown(), true);
      await click('.course', 'Baking1');
      await page.waitFor(() => document.querySelectorAll('.card').length === 1);
      assert.equal(await shown(), false);
    });
    test('the recipe fits the screen without scrolling sideways', async () => {
      await open('#/lamb_youvetsi', 390);
      assert.ok(await page.eval(() => document.documentElement.scrollWidth <= 390), 'page is wider than the screen');
    });
  });

  describe('errors', () => {
    test('an unknown recipe shows "not found"', async () => {
      await open('#/no_such_recipe');
      assert.equal(await text('#main h1'), 'Recipe not found');
    });
    test('a missing recipes.json explains how to build it', async () => {
      await page.goto(server.url + '/broken/index.html');
      await page.waitFor(() => document.querySelector('#main h1'));
      assert.equal(await text('#main h1'), 'Could not load recipes');
      assert.match(await text('#main p'), /run node build\.js first/);
      const errors = page.errors.splice(0);
      assert.ok(errors.length && errors.every((e) => /404|Failed to load/.test(e)), 'only the expected 404: ' + errors.join('; '));
    });
  });
});
