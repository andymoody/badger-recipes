import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  scaleQty, tidyUnit, roundQty, formatNumber, formatAmount, displayAmount, shownAmount, itemName, dimension, toBase,
} from '../js/quantity.js';
import { near } from './helpers.mjs';

describe('scaleQty: the original × k^e for each scaling category', () => {
  test('linear ingredients scale in proportion (500g chicken for 6 instead of 4)', () => {
    assert.equal(scaleQty(500, 1.5, 'linear'), 750);
    assert.equal(scaleQty(500, 1.5), 750);
  });
  test('seasoning scales with e = 0.9 (2 tbsp fish sauce, doubled)', () => {
    assert.ok(near(scaleQty(2, 2, 'seasoning'), 2 * Math.pow(2, 0.9)));
    assert.ok(scaleQty(2, 2, 'seasoning') < 4);
  });
  test('strong spice scales with e = 0.8 (8 chillies, tripled, is about 19 not 24)', () => {
    assert.equal(Math.round(scaleQty(8, 3, 'strong_spice')), 19);
  });
  test('leavening scales with e = 0.95', () => {
    assert.ok(near(scaleQty(1, 2, 'leavening'), Math.pow(2, 0.95)));
  });
  test('fixed amounts never change (oil for deep-frying)', () => {
    assert.equal(scaleQty(1, 4, 'fixed'), 1);
  });
  test('halving a recipe gives a little more seasoning than half', () => {
    assert.ok(scaleQty(1, 0.5, 'seasoning') > 0.5);
  });
});

describe('dimensions and conversion', () => {
  test('g/kg, ml/l and tsp/tbsp convert; other units are their own dimension', () => {
    assert.equal(dimension('g'), dimension('kg'));
    assert.equal(dimension('ml'), dimension('l'));
    assert.equal(dimension('tsp'), dimension('tbsp'));
    assert.notEqual(dimension('ml'), dimension('tsp'));
    assert.notEqual(dimension('tin'), dimension('g'));
    assert.notEqual(dimension(undefined), dimension('clove'));
  });
  test('toBase converts to g, ml or tsp', () => {
    assert.deepEqual(toBase(1.5, 'kg'), { qty: 1500, unit: 'g' });
    assert.deepEqual(toBase(2, 'tbsp'), { qty: 6, unit: 'tsp' });
    assert.deepEqual(toBase(2, 'tin'), { qty: 2, unit: 'tin' });
  });
});

describe('tidyUnit', () => {
  const cases = [
    [[1000, 'g'], [1, 'kg']],
    [[1250, 'ml'], [1.25, 'l']],
    [[0.5, 'kg'], [500, 'g']],
    [[3, 'tsp'], [1, 'tbsp']],
    [[4.5, 'tsp'], [1.5, 'tbsp']],
    [[4, 'tsp'], [4, 'tsp']], // 1⅓ tbsp would be awkward: leave it
    [[0.5, 'tbsp'], [1.5, 'tsp']],
    [[0.1, 'tsp'], [1, 'pinch']], // below ⅛ tsp is a pinch
    [[0.03, 'tbsp'], [1, 'pinch']],
    [[0.125, 'tsp'], [0.125, 'tsp']],
    [[2, 'tin'], [2, 'tin']],
  ];
  for (const [[q, u], [eq, eu]] of cases) {
    test(q + ' ' + u + ' → ' + eq + ' ' + eu, () => {
      const t = tidyUnit(q, u);
      assert.ok(near(t.qty, eq), t.qty + ' != ' + eq);
      assert.equal(t.unit, eu);
    });
  }
});

describe('roundQty after scaling', () => {
  const cases = [
    ['eggs: 1⅓ becomes 1', 1.333, undefined, 1],
    ['eggs: 2.6 becomes 3', 2.6, undefined, 3],
    ['a small count rounds to the closest fraction (0.3 onion is ⅓)', 0.3, undefined, 1 / 3],
    ['0.6 of an egg is ⅔', 0.6, undefined, 2 / 3],
    ['0.45 of a lemon is ½', 0.45, undefined, 0.5],
    ['a count never rounds to nothing: 0.05 is ¼', 0.05, undefined, 0.25],
    ['0.9 of a lime is 1', 0.9, undefined, 1],
    ['¼ of a garlic clove is allowed', 0.27, 'clove', 0.25],
    ['garlic cloves are whole', 4.4, 'clove', 4],
    ['tsp below 1 to the closest spoon measure (0.55 is ½)', 0.55, 'tsp', 0.5],
    ['⅓ tsp is offered as a guide (0.3 is ⅓)', 0.3, 'tsp', 1 / 3],
    ['⅔ tsp likewise (0.62 is ⅔)', 0.62, 'tsp', 2 / 3],
    ['1½ tsp quartered (0.375) is ⅓', 0.375, 'tsp', 1 / 3],
    ['⅛ tsp is a valid measure', 0.14, 'tsp', 0.125],
    ['0.2 tsp is ¼', 0.2, 'tsp', 0.25],
    ['0.74 tsp is ¾', 0.74, 'tsp', 0.75],
    ['tsp above 1 to the nearest ¼', 1.4, 'tsp', 1.5],
    ['tbsp to the nearest ¼', 2.88, 'tbsp', 3],
    ['g above 100 to the nearest 5', 202.5, 'g', 205],
    ['g up to 100 are whole: 135g flour halved is 68g, not 70g', 67.5, 'g', 68],
    ['g up to 100 are whole (97.4)', 97.4, 'g', 97],
    ['g from 10 to 50 to the nearest 1', 33.3, 'g', 33],
    ['ml above 100 to the nearest 5', 662, 'ml', 660],
    ['ml up to 100 are whole', 65.3, 'ml', 65],
    ['small g amounts to the nearest ½', 2.2, 'g', 2],
    ['kg to 2 decimal places', 1.234, 'kg', 1.23],
    ['tins to the nearest ½', 1.4, 'tin', 1.5],
    ['cm to the nearest ½', 1.67, 'cm', 1.5],
  ];
  for (const [name, q, u, expected] of cases) test(name, () => assert.equal(roundQty(q, u), expected));
});

describe('formatNumber', () => {
  const cases = [[3, undefined, '3'], [1.5, undefined, '1½'], [0.5, 'tsp', '½'], [0.25, 'tsp', '¼'], [0.125, 'tsp', '⅛'], [1.125, undefined, '1⅛'], [0.75, 'tbsp', '¾'],
    [1 / 3, undefined, '⅓'], [2 / 3, 'tsp', '⅔'], [1.25, 'tbsp', '1¼'], [2.5, 'g', '2.5'], [1.25, 'kg', '1.25'], [0.4, undefined, '0.4'], [2.999, 'g', '3']];
  for (const [n, u, s] of cases) test(n + (u ? ' ' + u : '') + ' → ' + s, () => assert.equal(formatNumber(n, u), s));
});

describe('formatAmount', () => {
  const cases = [
    [[200, null, 'g'], '200g'],
    [[1.5, null, 'kg'], '1.5kg'],
    [[400, null, 'ml'], '400ml'],
    [[5, null, 'cm'], '5cm'],
    [[1.5, null, 'tbsp'], '1½ tbsp'],
    [[3, null, 'clove'], '3 cloves'],
    [[1, null, 'clove'], '1 clove'],
    [[2, null, 'tin'], '2 tins'],
    [[2, null, 'pinch'], '2 pinches'],
    [[2, null, 'handful'], '2 handfuls'],
    [[2, null, 'bunch'], '2 bunches'],
    [[1, 2, null], '1–2'],
    [[8, 10, null], '8–10'],
    [[1, 2, 'clove'], '1–2 cloves'],
    [[3, null, null], '3'],
  ];
  for (const [args, s] of cases) test(JSON.stringify(args) + ' → ' + s, () => assert.equal(formatAmount(...args), s));
  test('no quantity, no text', () => assert.equal(formatAmount(undefined, null, 'g'), ''));
});

describe('displayAmount', () => {
  test('unscaled amounts are shown as written, not tidied', () => {
    assert.equal(displayAmount(1000, null, 'g', false), '1000g');
    assert.equal(displayAmount(135, null, 'g', false), '135g');
  });
  test('scaled amounts are tidied and rounded (750g × 2 = 1.5kg)', () => {
    assert.equal(displayAmount(1500, null, 'g', true), '1.5kg');
    assert.equal(displayAmount(202.5, null, 'g', true), '205g');
    assert.equal(displayAmount(4.5, null, 'tsp', true), '1½ tbsp');
  });
  test('scaled ranges round both ends (lime leaves 4–5 × 1.5)', () => {
    assert.equal(displayAmount(6, 7.5, undefined, true), '6–8');
  });
  test('small scaled spoon amounts: ⅛ tsp, or a pinch below that', () => {
    assert.equal(displayAmount(0.5 * 0.25, null, 'tsp', true), '⅛ tsp', '½ tsp of chilli flakes, quartered');
    assert.equal(displayAmount(0.25 * 0.25, null, 'tsp', true), '1 pinch');
    assert.equal(displayAmount(0.25, null, 'tbsp', true), '¾ tsp');
    assert.equal(displayAmount(1.5 * 0.25, null, 'tsp', true), '⅓ tsp', '1½ tsp cumin, quartered');
  });
  test('a range that rounds to one figure is shown once', () => {
    assert.equal(displayAmount(1, 1.2, undefined, true), '1');
  });
  test('a range keeps one unit, chosen from its top', () => {
    assert.deepEqual(shownAmount(800, 1200, 'g', true), { qty: 0.8, qtyMax: 1.2, unit: 'kg' });
  });
});

describe('itemName', () => {
  const egg = { name: 'Egg', plural: 'Eggs' };
  const garlic = { name: 'Garlic' };
  test('plural when there is more than one of a thing without a unit', () => {
    assert.equal(itemName(egg, 2), 'Eggs');
    assert.equal(itemName(egg, 1), 'Egg');
    assert.equal(itemName(egg, 1, 2), 'Eggs');
    assert.equal(itemName(egg, 0.5), 'Egg');
  });
  test('the unit carries the plural instead ("3 cloves Garlic")', () => {
    assert.equal(itemName(garlic, 3, null, 'clove'), 'Garlic');
  });
  test('entries without a plural keep their name', () => {
    assert.equal(itemName({ name: 'Thai basil' }, 2), 'Thai basil');
  });
});
