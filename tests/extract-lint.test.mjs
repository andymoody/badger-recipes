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

describe('numbers in notes, and spices (from the lamb youvetsi reviews)', () => {
  const base = { id: 'x', title: 'X', course: 'main', serves: 4, source: { type: 'own' }, steps: ['Rub the lamb with the oil and spices, then add the wine, tomatoes and black pepper.'] };
  const lint = (ingredients) => lintRecipe({ ...base, ingredients }, data).filter((f) => /note/.test(f.message) || /never mentioned/.test(f.message)).map((f) => f.message);
  test('a substitute or a count in a note is flagged, because it won\'t scale', () => {
    assert.deepEqual(lint([
      { item: 'red_wine', qty: 150, unit: 'ml', note: 'or 150ml stock + 1 tbsp balsamic' },
      { item: 'black_pepper', qty: 1.5, qtyMax: 2, unit: 'tsp', note: 'about 30–35 twists' },
    ]), [
      'the note "or 150ml stock + 1 tbsp balsamic" has a number that won\'t scale with the amount',
      'the note "about 30–35 twists" has a number that won\'t scale with the amount',
    ]);
  });
  test('pack sizes, plain sizes and lines without an amount are fine', () => {
    assert.deepEqual(lint([
      { item: 'chopped_tomatoes', qty: 2, unit: 'tin', note: '400g' },
      { item: 'red_wine', qty: 1, note: '75cl' },
      { item: 'black_pepper', note: 'to taste, about 10 twists' },
    ]).filter((m) => /note/.test(m)), ['the note "75cl" has a number that won\'t scale with the amount']);
  });
  test('counts in step text are flagged; times and batch sizes are not (Scotch eggs)', () => {
    const counts = (steps) => lintRecipe({ ...base, ingredients: [], steps }, data).filter((f) => /won't scale with servings/.test(f.message)).map((f) => f.message.split('"')[1]);
    assert.deepEqual(counts(['Divide the mixture into 12 even-sized balls.', 'Add the 6 eggs and cook for 6 minutes.', 'Cook 2 or 3 eggs at a time for 2 minutes.', 'Rest for 5–10 minutes.']), ['12 even-sized balls', '6 eggs']);
  });
  test('"spices" in the method covers dried herbs and ground spices', () => {
    assert.deepEqual(lint([{ item: 'dried_oregano', qty: 2, unit: 'tsp' }, { item: 'ground_cinnamon', qty: 1, unit: 'tsp' }]), []);
    assert.deepEqual(lint([{ item: 'orzo', qty: 600, unit: 'g' }]), ['"Orzo" is never mentioned in the method']);
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
  test('a catalogue id that is also a unit name is flagged ("clove")', () => {
    const f = lintCatalogues({ ingredients: { clove: { name: 'Clove' }, whole_clove: { name: 'Whole clove' } }, tags: {} });
    assert.deepEqual(f.map((x) => x.message), ['"clove" is also a unit name, so "8 cloves" could mean either: use a fuller id (whole_clove)']);
  });
  test('the catalogues have no near-duplicates', () => {
    assert.deepEqual(lintCatalogues(data), []);
    assert.equal(lintCatalogues({ ingredients: { chilli: { name: 'Chilli' }, chili: { name: 'Chili' } }, tags: {} })[0].message, '"chilli" and "chili" look like the same ingredient');
  });
  test('bodies lists a recipe and its inline parts and options with their paths', () => {
    assert.deepEqual(bodies(data.recipes.scotch_eggs).map((b) => b.path), ['scotch_eggs', 'scotch_eggs/filling/black_pudding', 'scotch_eggs/filling/chorizo']);
  });
});
