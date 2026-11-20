import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readState, hashWith } from '../js/state.js';

const curry = { serves: 4 };
const paste = { yield: { qty: 12, unit: 'tbsp' } };
const q = (s) => new URLSearchParams(s);

describe('readState', () => {
  test('no params: as written', () => {
    assert.deepEqual(readState(curry, q('')), { k: 1, serves: 4, x: 1, choices: {}, full: {} });
  });
  test('serves=6 on a recipe for 4 is × 1.5', () => {
    const s = readState(curry, q('serves=6'));
    assert.equal(s.serves, 6);
    assert.equal(s.k, 1.5);
  });
  test('nonsense servings are ignored', () => {
    assert.equal(readState(curry, q('serves=0')).k, 1);
    assert.equal(readState(curry, q('serves=abc')).k, 1);
  });
  test('yield-only recipes use a multiplier; serves is ignored for them', () => {
    assert.equal(readState(paste, q('x=2')).k, 2);
    assert.equal(readState(paste, q('serves=8')).k, 1);
    assert.equal(readState(curry, q('x=2')).k, 1, 'x is ignored when the recipe has serves');
  });
  test('choices and full-batch toggles by path', () => {
    const s = readState(curry, q('protein=tofu&filling%2Fchorizo%2Fsauce=hot&full.paste=0&full.rice=1'));
    assert.deepEqual(s.choices, { protein: 'tofu', 'filling/chorizo/sauce': 'hot' });
    assert.deepEqual(s.full, { paste: false, rice: true });
  });
});

describe('hashWith', () => {
  test('sets and removes params', () => {
    assert.equal(hashWith('thai_red_curry', q('protein=tofu'), { serves: 6 }), '#/thai_red_curry?protein=tofu&serves=6');
    assert.equal(hashWith('thai_red_curry', q('protein=tofu&serves=6'), { protein: null }), '#/thai_red_curry?serves=6');
    assert.equal(hashWith('scotch_eggs', q('filling=chorizo'), { filling: null }), '#/scotch_eggs');
  });
  test('the spec example round-trips', () => {
    const hash = hashWith('scotch_eggs', q(''), { filling: 'chorizo' });
    assert.equal(hash, '#/scotch_eggs?filling=chorizo');
    assert.equal(readState({ serves: 6 }, q(hash.split('?')[1])).choices.filling, 'chorizo');
  });
});
