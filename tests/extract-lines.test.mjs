// Ingredient lines as sources write them, turned into draft lines in our model
// (tools/lib/lines.mjs), and matched against the real catalogue.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from './helpers.mjs';
import { parseLine, convertTemperatures, matchItem, nearDuplicates, suggestId, roundConverted, normaliseName } from '../tools/lib/lines.mjs';

const { ingredients } = loadData();
const line = (s, opts) => { const { source, conversions, warnings, ...rest } = parseLine(s, opts); return rest; };

describe('amounts and units', () => {
  const cases = [
    ['½ tsp salt', { name: 'salt', qty: 0.5, unit: 'tsp' }],
    ['1½ tsp baking powder', { name: 'baking powder', qty: 1.5, unit: 'tsp' }],
    ['1 1/2 tsp ground cumin', { name: 'ground cumin', qty: 1.5, unit: 'tsp' }],
    ['8–10 long red chillies', { name: 'long red chillies', qty: 8, qtyMax: 10 }],
    ['1 to 2 tbsp fish sauce', { name: 'fish sauce', qty: 1, qtyMax: 2, unit: 'tbsp' }],
    ['3 cloves garlic, minced', { name: 'garlic', qty: 3, unit: 'clove', prep: 'minced' }],
    ['3 garlic cloves, crushed', { name: 'garlic', qty: 3, unit: 'clove', prep: 'crushed' }],
    ['200g plain flour', { name: 'plain flour', qty: 200, unit: 'g' }],
    ['1.5kg lamb shoulder, bone in', { name: 'lamb shoulder', qty: 1.5, unit: 'kg', note: 'bone in' }],
    ['250 ml whole milk', { name: 'whole milk', qty: 250, unit: 'ml' }],
    ['a pinch of saffron', { name: 'saffron', qty: 1, unit: 'pinch' }],
    ['Pinch of salt', { name: 'salt', qty: 1, unit: 'pinch' }],
    ['small bunch coriander, chopped', { name: 'coriander', qty: 1, unit: 'bunch', prep: 'chopped', note: 'small' }],
    ['2 large eggs, beaten', { name: 'large eggs', qty: 2, prep: 'beaten' }],
    ['3 T sugar', { name: 'sugar', qty: 3, unit: 'tbsp' }],
    ['1 t vanilla extract', { name: 'vanilla extract', qty: 1, unit: 'tsp' }],
  ];
  for (const [s, want] of cases) test(s, () => assert.deepEqual(line(s), want));
});

describe('tins and packs', () => {
  test('"2 x 400g tins chopped tomatoes": the size goes in the note and chopped stays in the name', () => {
    assert.deepEqual(line('2 x 400g tins chopped tomatoes'), { name: 'chopped tomatoes', qty: 2, unit: 'tin', note: '400g' });
  });
  test('"400g can chopped tomatoes" is one tin', () => {
    assert.deepEqual(line('400g can chopped tomatoes'), { name: 'chopped tomatoes', qty: 1, unit: 'tin', note: '400g' });
  });
  test('"1 (14 oz) can coconut milk": converted, with a fluid-ounce warning', () => {
    const r = parseLine('1 (14 oz) can coconut milk');
    assert.equal(r.unit, 'tin');
    assert.equal(r.note, '395g');
    assert.match(r.warnings[0], /fluid ounces/);
  });
});

describe('prep, notes and optional lines', () => {
  test('preparation after a comma, or before the name', () => {
    assert.deepEqual(line('1 large onion, finely chopped'), { name: 'large onion', qty: 1, prep: 'finely chopped' });
    assert.deepEqual(line('100g grated parmesan'), { name: 'parmesan', qty: 100, unit: 'g', prep: 'grated' });
  });
  test('descriptions and alternatives are notes', () => {
    assert.deepEqual(line('5cm galangal, peeled (or ginger)'), { name: 'galangal', qty: 5, unit: 'cm', prep: 'peeled', note: 'or ginger' });
    assert.deepEqual(line('2 tbsp olive oil, plus extra for frying'), { name: 'olive oil', qty: 2, unit: 'tbsp', note: 'plus extra for frying' });
  });
  test('descriptors split by a comma stay in the name', () => {
    assert.deepEqual(line('8 boneless, skinless chicken thighs, cut into chunks'), { name: 'boneless skinless chicken thighs', qty: 8, prep: 'cut into chunks' });
  });
  test('"to taste" and "to serve" lines have no amount; serving extras are optional', () => {
    assert.deepEqual(line('Salt, to taste'), { name: 'Salt', note: 'to taste' });
    assert.deepEqual(line('salt to taste'), { name: 'salt', note: 'to taste' });
    assert.deepEqual(line('Fresh coriander, to serve'), { name: 'Fresh coriander', note: 'to serve', optional: true });
    assert.deepEqual(line('4 spring onions (optional)'), { name: 'spring onions', qty: 4, optional: true });
  });
  test('"Salt and pepper" is flagged as two ingredients', () => {
    assert.match(parseLine('Salt and pepper, to taste').warnings[0], /two ingredients/);
  });
  test('a vague amount is kept as a note, with a warning to estimate', () => {
    const r = parseLine('thumb-sized piece ginger, grated');
    assert.equal(r.name, 'ginger');
    assert.equal(r.note, 'thumb-sized piece');
    assert.match(r.warnings[0], /estimate one/);
  });
  test('a line with no amount and no note is flagged', () => {
    assert.match(parseLine('Kaffir lime leaves').warnings[0], /no quantity/);
  });
});

describe('lines from the lamb youvetsi PDF (pilot recipe 1)', () => {
  test('"smashed" and "crumbled" are preparation', () => {
    assert.deepEqual(line('4–6 garlic cloves, smashed'), { name: 'garlic', qty: 4, qtyMax: 6, unit: 'clove', prep: 'smashed' });
    assert.deepEqual(line('200g feta cheese, crumbled'), { name: 'feta cheese', qty: 200, unit: 'g', prep: 'crumbled' });
  });
  test('"dry orzo" is orzo, and "feta cheese" is feta', () => {
    const cat = { orzo: { name: 'Orzo' }, feta: { name: 'Feta' } };
    assert.deepEqual(matchItem('dry orzo', cat), { id: 'orzo', how: 'without descriptors' });
    assert.deepEqual(matchItem('feta cheese', cat), { id: 'feta', how: 'without "cheese"' });
  });
  test('alternatives in one line ("leg OR shoulder") are flagged', () => {
    const r = parseLine('2–2.3kg bone-in leg of lamb OR 2kg bone-in shoulder (trim thick fat >5mm)');
    assert.ok(r.warnings.some((w) => /offers alternatives/.test(w)), r.warnings.join('; '));
  });
  test('an extra ingredient in brackets ("+ 1 tbsp olive oil for Variant A only") is flagged', () => {
    const r = parseLine('2 large onions, thinly sliced (+ 1 tbsp olive oil for Variant A only)');
    assert.ok(r.warnings.some((w) => /adds another ingredient/.test(w)), r.warnings.join('; '));
  });
});

describe('converting American and imperial amounts (docs/extraction.md)', () => {
  const conv = (s, opts) => { const r = parseLine(s, opts); return [r.qty, r.unit, r.conversions.join('; ')]; };
  test('cups of flour, sugars and butter by weight', () => {
    assert.deepEqual(conv('1 1/2 cups all-purpose flour').slice(0, 2), [190, 'g']);
    assert.deepEqual(conv('1 cup caster sugar').slice(0, 2), [200, 'g']);
    assert.deepEqual(conv('3/4 cup light brown sugar').slice(0, 2), [165, 'g']);
    assert.deepEqual(conv('1 cup powdered sugar').slice(0, 2), [120, 'g']);
    assert.deepEqual(conv('1/3 cup unsalted butter, melted').slice(0, 2), [75, 'g']);
    assert.deepEqual(conv('1 cup basmati rice').slice(0, 2), [185, 'g']);
    assert.deepEqual(conv('1 cup grated cheddar').slice(0, 2), [100, 'g']);
  });
  test('cups of liquids by volume', () => {
    assert.deepEqual(conv('1/3 cup milk'), [80, 'ml', 'converted 0.333 cup to ml (240 ml a cup)']);
    assert.deepEqual(conv('2 cups chicken stock').slice(0, 2), [480, 'ml']);
  });
  test('a cup of anything else needs a density looked up, and keeps the cups in the note', () => {
    const r = parseLine('1 cup chopped walnuts');
    assert.equal(r.qty, undefined);
    assert.equal(r.note, '1 cup');
    assert.match(r.warnings[0], /needs a density/);
  });
  test('ounces, pounds and sticks of butter', () => {
    assert.deepEqual(conv('2 lb lamb shoulder').slice(0, 2), [905, 'g']);
    assert.deepEqual(conv('4 oz cheddar').slice(0, 2), [115, 'g']);
    assert.deepEqual(conv('1 stick butter, melted').slice(0, 2), [115, 'g']);
  });
  test('where both are given, the metric amount is used', () => {
    assert.deepEqual(conv('8 oz / 225g unsalted butter').slice(0, 2), [225, 'g']);
    assert.deepEqual(line('225g (8oz) butter'), { name: 'butter', qty: 225, unit: 'g' });
  });
  test('pints: UK by default, US when the source is American', () => {
    assert.equal(parseLine('1 pint double cream').qty, 570);
    assert.equal(parseLine('1 pint heavy cream', { pints: 'us' }).qty, 475);
  });
  test('inches to cm', () => {
    assert.deepEqual(line('1-inch piece ginger, grated'), { name: 'ginger', qty: 2.5, unit: 'cm', prep: 'grated' });
  });
  test('rounding of converted amounts', () => {
    assert.equal(roundConverted(3.7), 3.5);
    assert.equal(roundConverted(28.35), 28);
    assert.equal(roundConverted(226.8), 225);
    assert.equal(roundConverted(0.1), 0.5);
  });
});

describe('oven temperatures in steps', () => {
  test('°F alone is converted, to the nearest 10 like UK tables', () => {
    assert.deepEqual(convertTemperatures('Preheat the oven to 350°F.'), { text: 'Preheat the oven to 180°C.', changes: ['converted 350°F to 180°C'] });
    assert.equal(convertTemperatures('Roast at 400 degrees F').text, 'Roast at 200°C');
    assert.equal(convertTemperatures('Bake at 425F').text, 'Bake at 220°C');
  });
  test('°F given alongside °C is dropped, keeping fan and gas marks', () => {
    assert.equal(convertTemperatures('Bake at 425 F (220°C) for 20 minutes').text, 'Bake at 220°C for 20 minutes');
    assert.equal(convertTemperatures('Heat oven to 180C/160C fan/350F/gas 4').text, 'Heat oven to 180C/160C fan/gas 4');
    assert.equal(convertTemperatures('Preheat the oven to 350°F (175°C)').text, 'Preheat the oven to 175°C');
  });
  test('text without temperatures, and sous-vide °C, is left alone', () => {
    assert.deepEqual(convertTemperatures('Cook at 57°C for 8 hours.'), { text: 'Cook at 57°C for 8 hours.', changes: [] });
  });
});

describe('matching the catalogue (ingredients.json)', () => {
  test('aliases, plurals and descriptors', () => {
    assert.equal(matchItem('all-purpose flour', ingredients).id, 'plain_flour');
    assert.equal(matchItem('Kaffir lime leaves', ingredients).id, 'lime_leaf');
    assert.equal(matchItem('red chillies', ingredients).id, 'red_chilli');
    assert.equal(matchItem('large eggs', ingredients).id, 'egg');
    assert.equal(matchItem('boneless skinless chicken thighs', ingredients).id, 'chicken_thigh');
    assert.equal(matchItem('Minced pork', ingredients).id, 'pork_mince');
    assert.equal(matchItem('Gruyère', { gruyere: { name: 'Gruyère' } }).id, 'gruyere', 'accents are ignored');
  });
  test('a different product is a candidate, never a silent match', () => {
    const m = matchItem('unsalted butter', ingredients);
    assert.equal(m.id, null);
    assert.equal(m.candidates[0].id, 'butter');
    assert.equal(m.suggestedId, 'unsalted_butter');
  });
  test('nothing like it: a suggested id, singular and without descriptors', () => {
    const m = matchItem('fresh ripe bananas', ingredients);
    assert.equal(m.id, null);
    assert.equal(m.suggestedId, 'banana');
    assert.equal(suggestId('Thai basil leaves'), 'thai_basil_leaf');
  });
  test('names are normalised word by word', () => {
    assert.equal(normaliseName('Tomatoes, chopped'), 'tomato chopped');
    assert.equal(normaliseName('Chillies'), 'chilly', 'naive, but the same for chilli and chillies in the catalogue');
  });
});

describe('near-duplicate catalogue entries', () => {
  test('spelling variants and plurals are caught', () => {
    assert.deepEqual(nearDuplicates({ chilli: { name: 'Chilli' }, chili: { name: 'Chili' }, onion: { name: 'Onion' } }), [['chilli', 'chili']]);
    assert.deepEqual(nearDuplicates({ lime_leaf: { name: 'Lime leaf' }, lime_leaves: { name: 'Lime leaves' } }), [['lime_leaf', 'lime_leaves']]);
  });
  test('the real catalogues have none', () => {
    const { ingredients, tags } = loadData();
    assert.deepEqual(nearDuplicates(ingredients), []);
    assert.deepEqual(nearDuplicates(tags), []);
  });
});
