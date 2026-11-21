import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from '../js/resolve.js';
import { shoppingList, anyListText } from '../js/shopping.js';
import { loadData, CATALOGUE } from './helpers.mjs';

const data = loadData();
const list = (d, id, state) => shoppingList(resolve(d, id, state));
const byKey = (entries, key) => entries.find((e) => e.key === key);

describe('Thai red curry shopping list', () => {
  const entries = list(data, 'thai_red_curry');

  test('merges lines across the curry, the paste, the rice and the chosen protein', () => {
    assert.equal(byKey(entries, 'lime_leaf').text, '10–11 Lime leaves', 'curry 4–5 plus paste 6');
    assert.equal(byKey(entries, 'jasmine_rice').text, '300g Jasmine rice');
    assert.equal(byKey(entries, 'chicken_thigh').text, '500g Chicken thighs');
    assert.equal(byKey(entries, 'firm_tofu'), undefined, 'only the selected option is bought');
    assert.equal(entries.filter((e) => e.key === 'lime_leaf').length, 1);
  });

  test('staples start unticked; everything else ticked', () => {
    assert.equal(byKey(entries, 'vegetable_oil').ticked, false);
    assert.equal(byKey(entries, 'water').ticked, false);
    assert.equal(byKey(entries, 'coconut_milk').ticked, true);
  });

  test('with the paste not a full batch and serving 6, it buys half the paste', () => {
    const e = list(data, 'thai_red_curry', { k: 1.5, full: { paste: false } });
    assert.equal(byKey(e, 'galangal').text, '2½cm Galangal');
    assert.equal(byKey(e, 'garlic').text, '2 cloves Garlic', '3 × 0.5 = 1½; cloves round to whole numbers');
    assert.equal(byKey(e, 'coconut_milk').text, '3 tins Coconut milk');
    assert.equal(byKey(e, 'fish_sauce').text, '3 tbsp Fish sauce', '2 × 1.5^0.9 = 2.88, rounds to 3 tbsp');
  });

  test('order follows first use: curry ingredients first, then the parts', () => {
    assert.deepEqual(entries.slice(0, 3).map((e) => e.key), ['vegetable_oil', 'coconut_milk', 'fish_sauce']);
  });
});

describe('Scotch eggs shopping list', () => {
  test('eggs from two lines merge into a range ("6" plus "1–2")', () => {
    assert.equal(byKey(list(data, 'scotch_eggs'), 'egg').text, '7–8 Eggs');
  });
  test('breadcrumbs from the coating and the filling merge', () => {
    assert.equal(byKey(list(data, 'scotch_eggs'), 'breadcrumbs').text, '250g Breadcrumbs');
  });
  test('"to season" lines without a qty show just the name, unticked as staples', () => {
    const salt = byKey(list(data, 'scotch_eggs'), 'salt');
    assert.equal(salt.text, 'Salt');
    assert.equal(salt.ticked, false);
  });
});

describe('American pancakes shopping list', () => {
  const entries = list(data, 'american_pancakes');
  test('maple syrup is optional, so starts unticked', () => {
    const syrup = byKey(entries, 'maple_syrup');
    assert.equal(syrup.optional, true);
    assert.equal(syrup.ticked, false);
  });
  test('butter is needed for the batter, so stays ticked though one line is optional', () => {
    const butter = byKey(entries, 'butter');
    assert.equal(butter.optional, false);
    assert.equal(butter.ticked, true);
    assert.equal(butter.text, '2 tbsp Butter');
  });
  test('doubling: 270g flour, 2 eggs (plural), 4 tbsp sugar', () => {
    const e = list(data, 'american_pancakes', { k: 2 });
    assert.equal(byKey(e, 'plain_flour').text, '270g Plain flour');
    assert.equal(byKey(e, 'egg').text, '2 Eggs');
    assert.equal(byKey(e, 'caster_sugar').text, '4 tbsp Caster sugar');
    assert.equal(byKey(e, 'baking_powder').text, '2 tsp Baking powder', '1.93 rounds to 2');
  });
});

describe('merging rules', () => {
  const recipe = (ingredients) => ({ ingredients: CATALOGUE, recipes: { r: { id: 'r', title: 'R', course: 'main', serves: 4, ingredients } } });

  test('g and kg merge and tidy (500g + 1kg = 1.5kg)', () => {
    const e = list(recipe([{ item: 'flour', qty: 500, unit: 'g' }, { item: 'flour', qty: 1, unit: 'kg' }]), 'r');
    assert.equal(e[0].text, '1.5kg Plain flour');
  });
  test('tsp and tbsp merge (1 tbsp + 1½ tsp = 1½ tbsp)', () => {
    const e = list(recipe([{ item: 'salt', qty: 1, unit: 'tbsp' }, { item: 'salt', qty: 1.5, unit: 'tsp' }]), 'r');
    assert.equal(e[0].text, '1½ tbsp Salt');
  });
  test('amounts in units that do not convert are listed together ("Onion (1 + 200g)")', () => {
    const e = list(recipe([{ item: 'onion', qty: 1 }, { item: 'onion', qty: 200, unit: 'g' }]), 'r');
    assert.equal(e[0].text, 'Onion (1 + 200g)');
    assert.deepEqual(e[0].amounts, ['1', '200g']);
  });
  test('the same unit sums without converting (2 + 1 onions = 3 Onions)', () => {
    const e = list(recipe([{ item: 'onion', qty: 2 }, { item: 'onion', qty: 1, prep: 'sliced' }]), 'r');
    assert.equal(e[0].text, '3 Onions');
  });
  test('unscaled single amounts keep their unit (1000g stays 1000g)', () => {
    const e = list(recipe([{ item: 'flour', qty: 1000, unit: 'g' }]), 'r');
    assert.equal(e[0].text, '1000g Plain flour');
  });
  test('text lines are kept as they are', () => {
    const e = list(recipe([{ text: 'A squeeze of lemon' }]), 'r');
    assert.equal(e[0].text, 'A squeeze of lemon');
    assert.equal(e[0].ticked, true);
  });
});

describe('anyListText', () => {
  test('one ticked item per line, in list order', () => {
    const entries = list(data, 'american_pancakes');
    const text = anyListText(entries, (e) => e.ticked);
    assert.equal(text, ['135g Plain flour', '1 tsp Baking powder', '2 tbsp Caster sugar', '130ml Milk', '1 Egg', '2 tbsp Butter'].join('\n'));
  });
  test('respects the ticks the cook changed', () => {
    const entries = list(data, 'american_pancakes');
    const text = anyListText(entries, (e) => e.key === 'maple_syrup' || e.key === 'salt');
    assert.equal(text, '½ tsp Salt\nMaple syrup');
  });
});
