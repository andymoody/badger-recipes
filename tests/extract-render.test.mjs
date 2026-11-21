// The reviewer's view of a recipe (tools/lib/render.mjs): every variant printed as the page
// shows it. Uses the site's sample recipes (nested choices, shared parts, full batches) and
// the real Thai red curry (conditional steps).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT, loadData } from './helpers.mjs';
import { variants, renderRecipe, structure, reviewReport, lineText } from '../tools/lib/render.mjs';
import { resolve } from '../js/resolve.js';
import { metaParts, partNeed, yieldText, minutes } from '../js/format.js';

const site = loadData(path.join(ROOT, 'tests/fixtures/site'));
const real = loadData();
const section = (text, name) => text.split('\n## ').find((s) => s.startsWith(name)) || '';

describe('variants: every combination of choices', () => {
  test('a nested choice only appears under its own option (lamb shoulder has one method, leg has two)', () => {
    assert.deepEqual(variants(site, 'lamb_youvetsi').map((v) => v.label), [
      'lamb=shoulder', 'lamb=leg, lamb/leg/method=oven', 'lamb=leg, lamb/leg/method=sous_vide',
    ]);
  });
  test('the default comes first, then the other options in order', () => {
    assert.deepEqual(variants(real, 'thai_red_curry').map((v) => v.label), ['protein=chicken', 'protein=seafood', 'protein=tofu']);
    assert.deepEqual(variants(real, 'scotch_eggs').map((v) => v.choices), [{ filling: 'black_pudding' }, { filling: 'chorizo' }]);
  });
  test('a recipe without choices has one variant', () => {
    assert.deepEqual(variants(real, 'american_pancakes'), [{ choices: {}, label: '(no choices)' }]);
  });
});

describe('one variant as the page shows it', () => {
  test('conditional steps show only for their option (the shoulder is pulled off the bone)', () => {
    const shoulder = renderRecipe(site, 'lamb_youvetsi', { choices: { lamb: 'shoulder' } });
    const leg = renderRecipe(site, 'lamb_youvetsi', { choices: { lamb: 'leg' } });
    assert.match(section(shoulder, 'Method'), /3\. Brown the shoulder all over[^\n]*\n4\. Pull the meat off the bone/);
    assert.doesNotMatch(section(leg, 'Method'), /Pull the meat/);
  });
  test('shared parts are printed in place with their full-batch state; chosen options switch into the method', () => {
    const m = section(renderRecipe(site, 'lamb_youvetsi', { choices: { lamb: 'leg', 'lamb/leg/method': 'sous_vide' } }), 'Method');
    assert.match(m, /1\. Make the stock, or use 500ml from the freezer\.\n  ▸ Chicken stock  \(recipe: chicken_stock\)  \[full batch\]\n    1\. Simmer/);
    assert.match(m, /2\. Cook the lamb\.\n3\. Season the leg well\.\n4\. Cook the leg\.\n5\. Bag the leg and cook at 57°C for 8 hours\.\n6\. Pat dry/, 'chosen options switch into the numbered method');
    assert.doesNotMatch(m, /▸ (Lamb|Method):/);
  });
  test('numbering carries on across headings', () => {
    const m = section(renderRecipe(site, 'lamb_youvetsi'), 'Method');
    assert.match(m, /4\. Pull the meat off the bone and discard the bone\.\n\[The orzo\]\n5\. Mix the spice blend\./);
  });
  test('the shopping list merges a nested option\'s line with the parent\'s (olive oil 2 + 1 tbsp)', () => {
    const shop = section(renderRecipe(site, 'lamb_youvetsi', { choices: { lamb: 'leg', 'lamb/leg/method': 'sous_vide' } }), 'Shopping');
    assert.match(shop, /\[ \] 3 tbsp Olive oil  \(staple\)/);
    assert.match(shop, /\[x\] 1kg Lamb leg/);
    assert.doesNotMatch(shop, /Lamb shoulder/);
  });
  test('the curry\'s protein lines join its own ingredients, and the options header names the choice', () => {
    const tofu = renderRecipe(real, 'thai_red_curry', { choices: { protein: 'tofu' } });
    assert.match(tofu, /Options: Protein = Tofu \(vegetarian\)\n/);
    const own = section(tofu, 'Ingredients').split('### Thai red curry\n')[1];
    assert.match(own, /Firm tofu/);
    assert.doesNotMatch(tofu, /Chicken thigh/);
  });
  test('scaling: the header says so, amounts follow, and non-proportional ones show ≈', () => {
    const r = renderRecipe(real, 'thai_red_curry', { serves: 8 });
    assert.match(r, /Scaled: serves 8 \(from 4\)/);
    assert.match(r, /- 4 tins Coconut milk \(400ml, full-fat\)/);
    assert.match(r, /- 3¾ tbsp Fish sauce  ≈ in proportion: 4 tbsp/);
    assert.match(r, /Recipe makes 12 tbsp; you need 8 tbsp\. Make full batch: on\./);
  });
  test('the header shows the chosen option\'s time', () => {
    assert.match(renderRecipe(real, 'lamb_youvetsi'), /Main · Serves 8 · Cook 3 hr 25 min\n/);
    assert.match(renderRecipe(real, 'lamb_youvetsi', { choices: { method: 'sous_vide_leg' } }), /Cook 18 hr 5 min/);
  });
  test('a yield-only recipe scales with x', () => {
    assert.match(renderRecipe(site, 'chicken_stock', { x: 2 }), /Scaled: × 2/);
  });
  test('unknown recipes are an error', () => {
    assert.throws(() => renderRecipe(real, 'nope'), /No recipe "nope"/);
  });
});

describe('structure and the review report', () => {
  test('the structure shows shared and inline parts, use, choices and conditional steps', () => {
    const s = structure(real, 'thai_red_curry');
    assert.match(s, /paste → shared recipe thai_red_curry_paste, use 4 tbsp — embedded at step 1 \(yield 12 tbsp, batch\)/);
    assert.match(s, /protein: choice "Protein", default chicken — step 4 only chicken; step 5 only tofu;/);
    assert.match(s, /seafood \(inline, no steps\) "Seafood and prawn"/);
    assert.match(structure(site, 'lamb_youvetsi'), /oven \(inline, no ingredients\) "Roasted"/);
  });
  test('the report has every variant, a scaled version and each full-batch toggle flipped', () => {
    const rep = reviewReport(site, 'lamb_youvetsi');
    assert.match(rep, /Variants: 3\n/);
    assert.equal(rep.match(/^== Variant \d of 3/gm).length, 3);
    assert.match(rep, /== Scaled \(default choices, serves 8\)/);
    assert.match(rep, /== Full batch off for Chicken stock \(stock\)/);
    assert.match(rep, /== Full batch on for Spice blend \(spice\)/);
    assert.match(rep, /Full batch off for Chicken stock[\s\S]*?- 500g Chicken wings/);
  });
  test('too many combinations are flagged', () => {
    assert.match(reviewReport(real, 'thai_red_curry', { maxVariants: 2 }), /Variants: 3  WARNING: more than 2 combinations/);
    assert.doesNotMatch(reviewReport(real, 'thai_red_curry'), /WARNING/);
  });
});

describe('shared display helpers (js/format.js)', () => {
  test('header facts', () => {
    assert.deepEqual(metaParts(site.recipes.lamb_youvetsi), ['Main', 'Serves 4', 'Prep 20 min', 'Cook 3 hr 20 min']);
    assert.deepEqual(metaParts(site.recipes.chicken_stock).slice(1, 2), ['Makes 1l']);
  });
  test('"you need" is tidied once scaled: 1000ml shows as 1l', () => {
    const stock = (k) => resolve(site, 'lamb_youvetsi', { k }).children.find((c) => c.key === 'stock');
    assert.equal(partNeed(stock(1)), 'Recipe makes 1l; you need 500ml.');
    assert.equal(partNeed(stock(2)), 'Recipe makes 1l; you need 1l.');
  });
  test('a counted yield scales and rounds to whole numbers; text yields stay as written', () => {
    assert.equal(yieldText({ qty: 6, name: 'Scotch eggs' }), '6 Scotch eggs');
    assert.equal(yieldText({ qty: 6, name: 'Scotch eggs' }, 2), '12 Scotch eggs');
    assert.equal(yieldText({ qty: 6, name: 'Scotch eggs' }, 0.6), '4 Scotch eggs');
    assert.equal(yieldText({ qty: 8, name: 'flatbreads' }, 0.05), '1 flatbreads', 'never 0');
    assert.equal(yieldText('a 23cm cake', 2), 'a 23cm cake');
    assert.equal(yieldText({ qty: 12, unit: 'tbsp' }, 0.5), '6 tbsp');
  });
  test('the header\'s servings and yield scale together (Scotch eggs for 12)', () => {
    assert.deepEqual(metaParts(real.recipes.scotch_eggs, null, 2), ['Main', 'Serves 12', 'Makes 12 Scotch eggs']);
    assert.match(renderRecipe(real, 'scotch_eggs', { serves: 12 }), /Main · Serves 12 · Makes 12 Scotch eggs/);
    assert.match(renderRecipe(real, 'scotch_eggs', { serves: 3 }), /Main · Serves 3 · Makes 3 Scotch eggs/);
  });
  test('marinating shows as its own time, in days when it\'s a day or more (Lamb raan)', () => {
    assert.equal(minutes(2880), '2 days');
    assert.equal(minutes(1500), '1 day 1 hr');
    assert.equal(minutes(90), '1 hr 30 min');
    assert.deepEqual(metaParts(real.recipes.lamb_raan), ['Main', 'Serves 8', 'Marinate 2 days', 'Cook 5 hr 40 min']);
  });
  test('a part with servings', () => {
    const rice = resolve(real, 'thai_red_curry', { k: 1.5 }).children.find((c) => c.key === 'rice');
    assert.equal(partNeed(rice), 'Recipe serves 4; you need enough for 6.');
  });
  test('line text includes prep, note, optional and the ≈ figure', () => {
    const root = resolve(site, 'lamb_youvetsi');
    assert.equal(lineText(root.lines.find((l) => l.item === 'feta')), '100g Feta, crumbled  [optional]');
    assert.equal(lineText({ heading: 'To serve' }), '[To serve]');
  });
});
