// Extraction checks beyond the build (tools/lib/lint.mjs), on a hand-written recipe with the
// slips a careless extraction makes, and on the real collection.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadData, ROOT } from './helpers.mjs';
import { lintRecipe, lintCatalogues, bodies } from '../tools/lib/lint.mjs';

const data = loadData();

const sloppy = {
  id: 'zucchini_bread', title: 'Zucchini bread', course: 'baking', serves: 8, source: { type: 'own' },
  ingredients: [
    { item: 'plain_flour', qty: 250, unit: 'g', note: 'about 2 cups' },
    { item: 'butter', qty: 2, qtyMax: 2 },
    { text: 'a handful of something' },
    { item: 'egg', qty: 2 },
  ],
  parts: [{ key: 'glaze', recipe: { id: 'glaze', title: 'Glaze', ingredients: [{ item: 'caster_sugar', qty: 50, unit: 'g' }], steps: ['Whisk with cilantro.'] } }],
  steps: ['Preheat the oven to 350°F.', 'Mix the flour, butter and eggs and pour into a 9-inch pan.', { text: 'Make the glaze.', part: 'glaze' }, 'Pour over 100ml of the glaze.'],
};

describe('a sloppy extraction', () => {
  const f = lintRecipe(sloppy, data);
  const msgs = f.map((x) => x.level + ' ' + x.where + ': ' + x.message);
  const has = (re) => assert.ok(msgs.some((m) => re.test(m)), 'expected ' + re + ' in\n' + msgs.join('\n'));
  test('imperial units and °F left in text', () => {
    has(/^warn zucchini_bread step 1: °F temperature/);
    has(/^warn zucchini_bread step 2: inches/);
    has(/^warn zucchini_bread ingredient 1 note: cups/);
  });
  test('American words, in the title and inside an inline part', () => {
    has(/^warn zucchini_bread title: American "Zucchini": use "courgette"/);
    has(/^warn zucchini_bread\/glaze step 1: American "cilantro": use "coriander"/);
  });
  test('free-text lines and ranges that don\'t increase', () => {
    has(/^warn zucchini_bread ingredient 3: free-text line/);
    has(/^warn zucchini_bread ingredient 2: qtyMax 2 is not above qty 2/);
  });
  test('amounts in step text that won\'t scale', () => {
    has(/^check zucchini_bread step 4: "100ml" in the step text won't scale/);
  });
  test('prompts: no image, "own" source', () => {
    has(/^check zucchini_bread: no image/);
    has(/^check zucchini_bread: source is "own"/);
  });
  test('ingredients mentioned in the method aren\'t flagged; a part\'s own ingredient counts against its steps', () => {
    assert.ok(!msgs.some((m) => /"Plain flour" is never mentioned|"Butter" is never|"Egg" is never/.test(m)), msgs.join('\n'));
    has(/^check zucchini_bread\/glaze: "Caster sugar" is never mentioned in the method/);
  });
});

describe('the real collection', () => {
  test('has no warnings ("shrimp paste" is British too)', () => {
    const warns = Object.values(data.recipes).flatMap((r) => lintRecipe(r, data)).filter((x) => x.level === 'warn');
    assert.deepEqual(warns, []);
  });
  test('a step amount for a part is flagged as not scaling (the sample youvetsi: "use 500ml from the freezer")', () => {
    const site = loadData(path.join(ROOT, 'tests/fixtures/site'));
    const f = lintRecipe(site.recipes.lamb_youvetsi, site);
    assert.ok(f.some((x) => x.level === 'check' && /"500ml" in the step text/.test(x.message)), JSON.stringify(f, null, 1));
  });
  test('the curry\'s reworded paste step is no longer flagged', () => {
    const f = lintRecipe(data.recipes.thai_red_curry, data);
    assert.ok(!f.some((x) => /in the step text/.test(x.message)), JSON.stringify(f, null, 1));
  });
  test('the catalogues have no near-duplicates', () => {
    assert.deepEqual(lintCatalogues(data), []);
    assert.equal(lintCatalogues({ ingredients: { chilli: { name: 'Chilli' }, chili: { name: 'Chili' } }, tags: {} })[0].message, '"chilli" and "chili" look like the same ingredient');
  });
  test('bodies lists a recipe and its inline parts and options with their paths', () => {
    assert.deepEqual(bodies(data.recipes.scotch_eggs).map((b) => b.path), ['scotch_eggs', 'scotch_eggs/filling/black_pudding', 'scotch_eggs/filling/chorizo']);
  });
});
