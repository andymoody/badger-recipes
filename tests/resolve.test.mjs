import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, resolveLine, partRatio, choices, walk, lineDisplay, ingredientGroups, partTitle, recipeTime } from '../js/resolve.js';
import path from 'node:path';
import { loadData, CATALOGUE, near, ROOT } from './helpers.mjs';

const data = loadData();
const texts = (node) => node.steps.map((s) => s.text);
const line = (node, item) => node.lines.find((l) => l.item === item);
const child = (node, path) => { let found; walk(node, (n) => { if (n.path === path) found = n; }); return found; };

describe('Thai red curry (shared paste and rice, protein choice with conditional steps)', () => {
  test('as written: paste is a full batch, rice follows the curry, chicken by default', () => {
    const root = resolve(data, 'thai_red_curry');
    assert.deepEqual(root.children.map((c) => c.path), ['paste', 'rice', 'protein/chicken']);
    const paste = child(root, 'paste');
    assert.equal(paste.full, true, 'paste has batch: true, so full batch is on by default');
    assert.equal(paste.factor, 1);
    assert.ok(near(paste.needed, 4 / 12), 'needs 4 of 12 tbsp');
    assert.deepEqual(paste.use, { qty: 4, unit: 'tbsp', scaled: false });
    const rice = child(root, 'rice');
    assert.equal(rice.factor, 1, 'both serve 4');
    assert.equal(rice.batchable, false, 'nothing to toggle when the rice is used in full');
    assert.equal(line(rice, 'jasmine_rice').qty, 300);
  });

  test('chicken: browned first and returned later; no tofu or seafood steps', () => {
    const steps = texts(resolve(data, 'thai_red_curry'));
    assert.equal(steps.length, 9);
    assert.match(steps[3], /^Brown the chicken/);
    assert.match(steps[7], /^Return the chicken/);
    assert.ok(!steps.some((s) => /tofu|seafood/i.test(s || '')));
  });

  test('seafood: no browning, added for the last few minutes', () => {
    const steps = texts(resolve(data, 'thai_red_curry', { choices: { protein: 'seafood' } }));
    assert.equal(steps.length, 8);
    assert.ok(!steps.some((s) => /chicken|tofu/i.test(s || '')));
    assert.match(steps[6], /add the seafood/);
  });

  test('tofu: fried first, and its note comes with it as a loose part', () => {
    const root = resolve(data, 'thai_red_curry', { choices: { protein: 'tofu' } });
    assert.match(texts(root)[3], /^Fry the tofu/);
    const tofu = child(root, 'protein/tofu');
    assert.ok(root.loose.includes(tofu), 'the option is used through "only", not embedded in a step');
    assert.match(tofu.recipe.notes, /vegetarian/);
    assert.equal(line(tofu, 'firm_tofu').qty, 400);
  });

  test('an unknown option in the URL falls back to the default', () => {
    const root = resolve(data, 'thai_red_curry', { choices: { protein: 'beef' } });
    assert.equal(root.selected.protein, 'chicken');
  });

  test('serving 6: everything × 1.5, the paste still a full batch but needing 6 tbsp', () => {
    const root = resolve(data, 'thai_red_curry', { k: 1.5 });
    assert.equal(line(root, 'coconut_milk').qty, 3);
    assert.equal(child(root, 'rice').factor, 1.5);
    assert.equal(line(child(root, 'rice'), 'jasmine_rice').qty, 450);
    assert.equal(line(child(root, 'protein/chicken'), 'chicken_thigh').qty, 750);
    const paste = child(root, 'paste');
    assert.equal(paste.factor, 1);
    assert.deepEqual(paste.use, { qty: 6, unit: 'tbsp', scaled: true });
  });

  test('serving 6 without a full batch of paste: half the paste recipe', () => {
    const root = resolve(data, 'thai_red_curry', { k: 1.5, full: { paste: false } });
    const paste = child(root, 'paste');
    assert.equal(paste.full, false);
    assert.equal(paste.factor, 0.5);
    assert.equal(line(paste, 'galangal').qty, 2.5);
  });

  test('seasoning scales less than in proportion, and says so', () => {
    const fish = line(resolve(data, 'thai_red_curry', { k: 1.5 }), 'fish_sauce');
    assert.ok(near(fish.qty, 2 * Math.pow(1.5, 0.9)));
    assert.equal(fish.scaled, true);
    assert.deepEqual(fish.proportional, { qty: 3, qtyMax: undefined });
  });

  test('linear lines have no proportional figure; unscaled lines are not marked', () => {
    assert.equal(line(resolve(data, 'thai_red_curry', { k: 1.5 }), 'coconut_milk').proportional, undefined);
    assert.equal(line(resolve(data, 'thai_red_curry'), 'fish_sauce').proportional, undefined);
    assert.equal(line(resolve(data, 'thai_red_curry'), 'fish_sauce').scaled, false);
  });

  test('choices() lists the protein choice with its options', () => {
    const list = choices(resolve(data, 'thai_red_curry'));
    assert.equal(list.length, 1);
    assert.equal(list[0].choice.path, 'protein');
    assert.equal(list[0].choice.default, 'chicken');
    assert.deepEqual(list[0].choice.options.map((o) => o.id), ['chicken', 'seafood', 'tofu']);
  });
});

describe('Scotch eggs (inline choice embedded in a step)', () => {
  test('black pudding by default: its steps switch into the method where the filling is made', () => {
    const root = resolve(data, 'scotch_eggs');
    const filling = child(root, 'filling/black_pudding');
    assert.equal(filling.title, 'Black pudding and pork');
    assert.equal(filling.inline, true);
    assert.ok(!root.steps.some((s) => s.part), 'no collapsible section for an inline option');
    assert.equal(root.steps[0].text, 'Preheat the oven to 180°C.');
    assert.deepEqual(root.steps.slice(1, 1 + filling.steps.length), filling.steps);
    assert.match(root.steps[2].text, /^Bring a pan of water to the boil/);
    assert.deepEqual(root.used, [filling]);
    assert.equal(root.loose.length, 0);
  });
  test('choosing chorizo switches the chorizo steps in and the black pudding ones out', () => {
    const texts = (root) => root.steps.map((s) => s.text).join(' ');
    const bp = resolve(data, 'scotch_eggs'), ch = resolve(data, 'scotch_eggs', { choices: { filling: 'chorizo' } });
    assert.match(texts(ch), /chorizo/i);
    assert.doesNotMatch(texts(ch), /black pudding/i);
    assert.match(texts(bp), /black pudding/i);
  });
  test('choosing chorizo swaps the filling and its steps', () => {
    const root = resolve(data, 'scotch_eggs', { choices: { filling: 'chorizo' } });
    const filling = child(root, 'filling/chorizo');
    assert.equal(line(filling, 'chorizo').qty, 300);
    assert.equal(line(filling, 'pork_mince').qty, 300);
    assert.match(filling.steps[0].text, /chorizo/);
  });
  test('inline options have no serves, so they follow the parent (factor = the page scaling)', () => {
    const root = resolve(data, 'scotch_eggs', { k: 0.5 });
    assert.equal(child(root, 'filling/black_pudding').factor, 0.5);
    assert.equal(child(root, 'filling/black_pudding').batchable, false);
  });
  test('headings come through in ingredients', () => {
    const root = resolve(data, 'scotch_eggs');
    assert.deepEqual(root.lines.filter((l) => l.heading).map((l) => l.heading), ['For the coating'], 'as the source groups them');
  });
});

describe('American pancakes (headings, optional and fixed lines)', () => {
  test('"to taste"-style lines without a qty never scale', () => {
    const root = resolve(data, 'american_pancakes', { k: 2 });
    const cooking = root.lines.find((l) => l.item === 'butter' && l.note === 'for cooking');
    assert.equal(cooking.qty, undefined);
    assert.equal(cooking.scaled, undefined);
  });
  test('baking powder (leavening) is marked when doubled', () => {
    const bp = line(resolve(data, 'american_pancakes', { k: 2 }), 'baking_powder');
    assert.ok(near(bp.qty, Math.pow(2, 0.95)));
    assert.equal(bp.proportional.qty, 2);
  });
  test('optional "to serve" lines are flagged', () => {
    const root = resolve(data, 'american_pancakes');
    assert.equal(line(root, 'maple_syrup').optional, true);
  });
});

describe('recipeTime: the time with the chosen options (sample youvetsi)', () => {
  const site = loadData(path.join(ROOT, 'tests/fixtures/site'));
  test('the recipe\'s own time when the chosen options give none (shoulder)', () => {
    assert.deepEqual(recipeTime(resolve(site, 'lamb_youvetsi')), { prep: 20, cook: 200 });
  });
  test('a nested option\'s cook time replaces the recipe\'s, keeping its prep', () => {
    assert.deepEqual(recipeTime(resolve(site, 'lamb_youvetsi', { choices: { lamb: 'leg' } })), { prep: 20, cook: 100 });
    assert.deepEqual(recipeTime(resolve(site, 'lamb_youvetsi', { choices: { lamb: 'leg', 'lamb/leg/method': 'sous_vide' } })), { prep: 20, cook: 500 });
  });
  test('no time anywhere is null', () => {
    assert.equal(recipeTime(resolve(site, 'spice_blend')), null);
  });
  test('the real youvetsi: each method gives its own time', () => {
    const t = (m) => recipeTime(resolve(data, 'lamb_youvetsi', { choices: { method: m } })).cook;
    assert.deepEqual([t('shoulder'), t('roast_leg'), t('sous_vide_leg')], [205, 175, 1085]);
  });
});

describe('ingredientGroups: parts in method order, the recipe\'s own ingredients last', () => {
  const titles = (root) => ingredientGroups(root).map((g) => g.title);
  test('a part with no ingredients has no group, unless it has a full-batch toggle (sample youvetsi)', () => {
    const site = loadData(path.join(ROOT, 'tests/fixtures/site'));
    const roast = resolve(site, 'lamb_youvetsi', { choices: { lamb: 'leg' } });
    assert.deepEqual(titles(roast), ['Chicken stock', 'Lamb: Leg', 'Spice blend', 'Lamb youvetsi']);
    const sv = resolve(site, 'lamb_youvetsi', { choices: { lamb: 'leg', 'lamb/leg/method': 'sous_vide' } });
    assert.deepEqual(titles(sv), ['Chicken stock', 'Lamb: Leg', 'Method: Sous vide', 'Spice blend', 'Lamb youvetsi']);
  });
  test('curry: paste, rice, then the curry itself with the chosen protein', () => {
    const groups = ingredientGroups(resolve(data, 'thai_red_curry'));
    assert.deepEqual(groups.map((g) => g.title), ['Thai red curry paste', 'Steamed jasmine rice', 'Thai red curry']);
    const own = groups[2].lines;
    assert.equal(own[0].item, 'vegetable_oil');
    assert.equal(own.at(-1).item, 'chicken_thigh');
    assert.ok(!own.some((l) => l.heading), 'no subheading: the radios already say which protein');
  });
  test('switching to tofu changes the protein lines in the curry group', () => {
    const own = ingredientGroups(resolve(data, 'thai_red_curry', { choices: { protein: 'tofu' } })).at(-1).lines;
    assert.equal(own.at(-1).item, 'firm_tofu');
    assert.ok(!own.some((l) => l.item === 'chicken_thigh'));
  });
  test('Scotch eggs: the filling first, then the eggs, coating and oil', () => {
    assert.deepEqual(titles(resolve(data, 'scotch_eggs')), ['Filling: Black pudding and pork', 'Scotch eggs']);
  });
  test('a recipe without parts has one untitled group', () => {
    assert.deepEqual(titles(resolve(data, 'american_pancakes')), [null]);
  });
  test('partTitle', () => {
    const root = resolve(data, 'thai_red_curry');
    assert.deepEqual(root.children.map(partTitle), ['Thai red curry paste', 'Steamed jasmine rice', 'Protein: Chicken']);
  });
});

describe('lineDisplay: the ≈ marker only when it would tell the cook something', () => {
  const pancakes = (k) => resolve(data, 'american_pancakes', { k });
  test('doubled pancakes: baking powder (1.93 tsp) and salt (0.93 tsp) show as 2 tsp and 1 tsp, unmarked', () => {
    const bp = lineDisplay(line(pancakes(2), 'baking_powder'));
    assert.deepEqual([bp.amount, bp.proportional], ['2 tsp', null]);
    const salt = lineDisplay(line(pancakes(2), 'salt'));
    assert.deepEqual([salt.amount, salt.proportional], ['1 tsp', null]);
  });
  test('pancakes × 4: salt is 1¾ tsp rather than 2 tsp, so it is marked', () => {
    const salt = lineDisplay(line(pancakes(4), 'salt'));
    assert.deepEqual([salt.amount, salt.proportional], ['1¾ tsp', '2 tsp']);
  });
  test('8 chillies for a triple batch of paste: 19 rather than 24', () => {
    const chilli = lineDisplay(line(resolve(data, 'thai_red_curry_paste', { k: 3 }), 'red_chilli'));
    assert.deepEqual([chilli.amount, chilli.proportional], ['19–24', '24–30']);
  });
  test('linear and unscaled lines are never marked', () => {
    assert.equal(lineDisplay(line(pancakes(2), 'plain_flour')).proportional, null);
    assert.equal(lineDisplay(line(pancakes(1), 'salt')).proportional, null);
  });
  test('halved pancakes: 68g flour (whole grams up to 100)', () => {
    assert.equal(lineDisplay(line(pancakes(0.5), 'plain_flour')).amount, '68g');
  });
  test('names follow the figure shown (½ egg is "Egg", 2 eggs "Eggs")', () => {
    assert.equal(lineDisplay(line(pancakes(0.5), 'egg')).name, 'Egg');
    assert.equal(lineDisplay(line(pancakes(2), 'egg')).name, 'Eggs');
  });
});

describe('resolveLine', () => {
  test('a per-line fixed override beats the catalogue (oil for deep-frying)', () => {
    const l = resolveLine({ item: 'oil', qty: 1, unit: 'l', scaling: 'fixed' }, 2, CATALOGUE);
    assert.equal(l.qty, 1);
    assert.equal(l.scaled, false);
    assert.deepEqual(l.proportional, { qty: 2, qtyMax: undefined });
  });
  test('ranges scale at both ends', () => {
    const l = resolveLine({ item: 'chilli', qty: 8, qtyMax: 10 }, 2, CATALOGUE);
    assert.ok(near(l.qty, 8 * Math.pow(2, 0.8)));
    assert.ok(near(l.qtyMax, 10 * Math.pow(2, 0.8)));
    assert.deepEqual(l.proportional, { qty: 16, qtyMax: 20 });
  });
  test('staples come from the catalogue', () => {
    assert.equal(resolveLine({ item: 'salt', note: 'to taste' }, 1, CATALOGUE).staple, true);
  });
  test('text and heading lines pass through', () => {
    assert.deepEqual(resolveLine({ text: 'A squeeze of lemon' }, 2, CATALOGUE), { text: 'A squeeze of lemon' });
    assert.deepEqual(resolveLine({ heading: 'For the icing' }, 2, CATALOGUE), { heading: 'For the icing' });
  });
});

describe('partRatio', () => {
  test('use ÷ yield, converting units (250g of a 1kg batch)', () => {
    assert.equal(partRatio({ serves: 4 }, { use: { qty: 250, unit: 'g' } }, { yield: { qty: 1, unit: 'kg' } }), 0.25);
  });
  test('use beats serves', () => {
    assert.equal(partRatio({ serves: 4 }, { use: { qty: 1, unit: 'l' } }, { serves: 8, yield: { qty: 2, unit: 'l' } }), 0.5);
  });
  test('parent serves ÷ part serves (curry for 6, rice for 4)', () => {
    assert.equal(partRatio({ serves: 6 }, {}, { serves: 4 }), 1.5);
  });
  test('no use and no serves on one side: 1 (inline parts)', () => {
    assert.equal(partRatio({ serves: 6 }, {}, {}), 1);
  });
});

describe('fixtures: structures the examples do not cover yet', () => {
  const fixture = {
    ingredients: CATALOGUE,
    recipes: {
      stock: { id: 'stock', title: 'Chicken stock', course: 'basic', yield: { qty: 2, unit: 'l' }, batch: true,
        ingredients: [{ item: 'water', qty: 2.5, unit: 'l' }] },
      rice: { id: 'rice', title: 'Basmati rice', course: 'side', serves: 2, ingredients: [{ item: 'rice', qty: 150, unit: 'g' }] },
      dinner: { id: 'dinner', title: 'Dinner', course: 'main', serves: 4,
        parts: [
          { key: 'soup', recipe: { title: 'Soup', ingredients: [{ item: 'onion', qty: 2 }],
            parts: [{ key: 'stock', recipe: 'stock', use: { qty: 500, unit: 'ml' } }] } },
          { key: 'side', label: 'Side', default: 'plain', choose: [
            { id: 'plain', title: 'Plain', ingredients: [{ item: 'egg', qty: 1 }] },
            'rice',
            { id: 'spicy', title: 'Spicy', ingredients: [{ item: 'chilli', qty: 2 }],
              parts: [{ key: 'heat', default: 'mild', choose: [{ id: 'mild', title: 'Mild' }, { id: 'hot', title: 'Hot' }] }] },
          ] },
        ] },
    },
  };

  test('a parent with no steps shows its parts one after another', () => {
    const root = resolve(fixture, 'dinner');
    assert.deepEqual(root.steps.map((s) => s.part.path), ['soup', 'side/plain']);
    assert.equal(root.loose.length, 0);
  });
  test('use inside an inline part converts ml to the stock yield in l', () => {
    const stock = child(resolve(fixture, 'dinner', { full: { 'soup/stock': false } }), 'soup/stock');
    assert.equal(stock.factor, 0.25);
    assert.equal(stock.recipe.ingredients[0].qty * stock.factor, 0.625);
  });
  test('a shared batch part defaults to a full batch, and the need follows the page scaling', () => {
    const stock = child(resolve(fixture, 'dinner', { k: 2 }), 'soup/stock');
    assert.equal(stock.full, true);
    assert.equal(stock.factor, 1);
    assert.deepEqual(stock.use, { qty: 1000, unit: 'ml', scaled: true });
  });
  test('an option can reference a shared recipe; it follows serves (2 → 4 is × 2)', () => {
    const rice = child(resolve(fixture, 'dinner', { choices: { side: 'rice' } }), 'side/rice');
    assert.equal(rice.sharedId, 'rice');
    assert.equal(rice.factor, 2);
    assert.equal(rice.choice.options.find((o) => o.id === 'rice').title, 'Basmati rice');
  });
  test('nested choices appear only for the selected option, keyed by full path', () => {
    assert.equal(choices(resolve(fixture, 'dinner')).length, 1);
    const root = resolve(fixture, 'dinner', { choices: { side: 'spicy', 'side/spicy/heat': 'hot' } });
    const list = choices(root);
    assert.deepEqual(list.map((n) => n.choice.path), ['side', 'side/spicy/heat']);
    assert.equal(list[1].choice.selected, 'hot');
  });
  test('an unknown recipe id resolves to null', () => {
    assert.equal(resolve(fixture, 'nope'), null);
  });
});
