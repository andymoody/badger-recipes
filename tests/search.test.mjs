import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matches, filterRecipes, hasTags } from '../js/search.js';
import { loadData } from './helpers.mjs';

const data = loadData();
const ids = (filter) => filterRecipes(data, filter).map((r) => r.id);

describe('search by title, tags and course', () => {
  test('a tag finds every recipe with it ("thai")', () => {
    assert.deepEqual(ids({ q: 'thai' }), ['jasmine_rice', 'thai_red_curry', 'thai_red_curry_paste']);
  });
  test('every word must match ("curry paste" is just the paste)', () => {
    assert.deepEqual(ids({ q: 'curry paste' }), ['thai_red_curry_paste']);
  });
  test('ingredients are not searched: "salt" finds nothing, though the pancakes contain salt', () => {
    assert.deepEqual(ids({ q: 'salt' }), []);
  });
  test('the course counts as a keyword ("breakfast", "mains")', () => {
    // Compared with the collection itself, so the test holds as recipes are added.
    const byCourse = (c) => Object.values(data.recipes).filter((r) => r.course === c && r.listed !== false).map((r) => r.id).sort();
    assert.ok(ids({ q: 'breakfast' }).includes('american_pancakes'));
    assert.deepEqual(ids({ q: 'breakfast' }).sort(), byCourse('breakfast'));
    assert.ok(ids({ q: 'main' }).includes('thai_red_curry') && ids({ q: 'main' }).includes('scotch_eggs'));
    assert.deepEqual(ids({ q: 'main' }).sort(), byCourse('main'));
  });
  test('words match from their start, so typing part of a word works and the middle of a word does not', () => {
    assert.deepEqual(ids({ q: 'panc' }), ['american_pancakes']);
    assert.deepEqual(ids({ q: 'ancake' }), []);
  });
  test('tags match by their display name and their id ("deep-fried", "deep fry")', () => {
    assert.deepEqual(ids({ q: 'deep-fried' }), ['scotch_eggs']);
    assert.deepEqual(ids({ q: 'deep fry' }), ['scotch_eggs']);
  });
  test('case and punctuation are ignored', () => {
    assert.deepEqual(ids({ q: '  SCOTCH, eggs ' }), ['scotch_eggs']);
  });
});

describe('choice options are keywords', () => {
  test('"chicken" finds the Thai red curry through its protein options', () => {
    assert.deepEqual(ids({ q: 'chicken' }), ['thai_red_curry']);
    assert.deepEqual(ids({ q: 'tofu curry' }), ['thai_red_curry']);
    assert.deepEqual(ids({ q: 'prawn' }), ['thai_red_curry']);
  });
  test('"chorizo" finds the Scotch eggs through their filling options', () => {
    assert.deepEqual(ids({ q: 'chorizo' }), ['scotch_eggs']);
  });
  test('shared parts are not keywords: "rice" finds the rice, not the curry served with it', () => {
    assert.deepEqual(ids({ q: 'rice' }), ['jasmine_rice']);
  });
  test('an option that references another recipe uses that recipe\'s title', () => {
    const d = { recipes: {
      dal: { id: 'dal', title: 'Tarka dal', course: 'main', parts: [{ key: 'bread', default: 'roti', choose: ['roti', 'naan'] }] },
      roti: { id: 'roti', title: 'Roti', course: 'side' },
      naan: { id: 'naan', title: 'Garlic naan', course: 'side' },
    } };
    assert.deepEqual(filterRecipes(d, { q: 'naan' }).map((r) => r.id), ['naan', 'dal'], 'Garlic naan, Tarka dal (by title)');
  });
});

describe('a realistic future collection', () => {
  const r = (title, tags, course = 'main') => ({ title, tags, course });
  const saltCod = r('Salt cod fritters', ['portuguese', 'fish'], 'starter');
  const lamb = r('Slow-roast lamb shoulder', ['mediterranean', 'lamb', 'sunday_roast']);
  const pancakes = r('Fluffy American pancakes', ['brunch']);
  test('"salt cod" finds the fritters only', () => {
    assert.ok(matches(saltCod, 'salt cod'));
    assert.ok(!matches(pancakes, 'salt cod'));
  });
  test('"lamb" and "mediterranean" find the lamb by title or tag', () => {
    assert.ok(matches(lamb, 'lamb'));
    assert.ok(matches(lamb, 'mediterranean'));
    assert.ok(matches(lamb, 'medit lamb'));
    assert.ok(!matches(saltCod, 'lamb'));
  });
  test('an empty search matches everything', () => {
    assert.ok(matches(pancakes, ''));
  });
});

describe('filters', () => {
  test('course and tag filters combine with search', () => {
    assert.deepEqual(ids({ course: 'basic' }), ['thai_red_curry_paste']);
    assert.deepEqual(ids({ tags: ['thai'], course: 'side' }), ['jasmine_rice']);
    assert.deepEqual(ids({ tags: ['thai'], q: 'rice' }), ['jasmine_rice']);
  });
  test('unlisted recipes never appear', () => {
    const d = { recipes: { a: { id: 'a', title: 'Spice blend', course: 'basic', listed: false }, b: { id: 'b', title: 'Spiced nuts', course: 'snack' } } };
    assert.deepEqual(filterRecipes(d, { q: 'spice' }).map((r) => r.id), ['b']);
  });
});

describe('tag filters: any within a group, all across groups', () => {
  const d = {
    tags: {
      thai: { name: 'Thai', group: 'cuisine' }, indian: { name: 'Indian', group: 'cuisine' },
      chicken: { name: 'Chicken', group: 'ingredient' }, lamb: { name: 'Lamb', group: 'ingredient' },
      weeknight: { name: 'Weeknight', group: 'occasion' },
    },
    recipes: {
      green_curry: { id: 'green_curry', title: 'Thai green chicken curry', course: 'main', tags: ['thai', 'chicken', 'weeknight'] },
      massaman: { id: 'massaman', title: 'Massaman lamb curry', course: 'main', tags: ['thai', 'lamb'] },
      tikka: { id: 'tikka', title: 'Chicken tikka masala', course: 'main', tags: ['indian', 'chicken'] },
      rogan_josh: { id: 'rogan_josh', title: 'Rogan josh', course: 'main', tags: ['indian', 'lamb'] },
    },
  };
  const pick = (tags) => filterRecipes(d, { tags }).map((r) => r.id).sort();
  test('Thai + Chicken: only the green curry', () => assert.deepEqual(pick(['thai', 'chicken']), ['green_curry']));
  test('Thai or Indian, with Lamb', () => assert.deepEqual(pick(['thai', 'indian', 'lamb']), ['massaman', 'rogan_josh']));
  test('Thai or Indian on their own: all four', () => assert.deepEqual(pick(['thai', 'indian']), ['green_curry', 'massaman', 'rogan_josh', 'tikka']));
  test('three groups: Thai, Chicken, Weeknight', () => assert.deepEqual(pick(['thai', 'chicken', 'weeknight']), ['green_curry']));
  test('no tags selected matches everything', () => assert.ok(hasTags(d.recipes.tikka, [], d)));
  test('tag display names are searchable', () => assert.deepEqual(filterRecipes(d, { q: 'weeknight' }).map((r) => r.id), ['green_curry']));
});
