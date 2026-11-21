// Reading recipe web pages: the tools/lib/html.mjs functions on saved pages shaped like real
// recipe sites (tests/fixtures/sources/).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';
import { readPage, isoMinutes, decodeEntities, plain, instructions, visibleText, findRecipeNode, jsonLdBlocks } from '../tools/lib/html.mjs';

const page = (f) => fs.readFileSync(path.join(ROOT, 'tests/fixtures/sources', f), 'utf8');

describe('an American blog with a recipe plugin (JSON-LD in @graph)', () => {
  const p = readPage(page('blog-banana-bread.html'), 'https://sunnyside.example/best-banana-bread/');
  test('finds the Recipe among the Organization, WebPage and Article nodes', () => {
    assert.equal(p.recipe.name, 'The Best Banana Bread');
    assert.equal(p.recipe.author, 'Jen Parker');
  });
  test('ingredients come through as written, with entities decoded', () => {
    assert.equal(p.recipe.ingredients.length, 9);
    assert.equal(p.recipe.ingredients[7], '1 ½ cups all-purpose flour');
    assert.equal(p.recipe.ingredients[8], '½ cup chopped walnuts (optional)');
  });
  test('HowToSections become headings, and steps keep their order', () => {
    assert.deepEqual(p.recipe.instructions.map((s) => s.heading || s.text.slice(0, 20)), [
      'Make the batter', 'Preheat the oven to ', 'In a mixing bowl, ma', 'Mix in the baking so', 'Bake', 'Pour the batter into', 'Cool in the pan for ',
    ]);
    assert.match(p.recipe.instructions[1].text, /350°F \(175°C\)/);
    assert.match(p.recipe.instructions[5].text, /at 350°F/, 'a numeric entity (&#176;) decodes too');
  });
  test('times, yields, categories and keywords', () => {
    assert.deepEqual(p.recipe.time, { prep: 15, cook: 60, total: 75 });
    assert.deepEqual(p.recipe.yield, ['10', '1 loaf (10 slices)']);
    assert.deepEqual(p.recipe.category, ['Breakfast', 'Dessert']);
    assert.deepEqual(p.recipe.keywords, ['banana bread', 'quick bread', 'easy']);
  });
  test('the recipe image wins over og:image; the site name and URL are kept', () => {
    assert.equal(p.image, 'https://sunnyside.example/wp-content/uploads/banana-bread-1200.jpg');
    assert.equal(p.site, 'Sunny Side Kitchen');
    assert.equal(p.url, 'https://sunnyside.example/best-banana-bread/');
  });
  test('the page text keeps the variations and notes that the structured data leaves out', () => {
    assert.match(p.text, /For chocolate chip banana bread, leave out the walnuts/);
    assert.match(p.text, /Freeze slices/);
    assert.doesNotMatch(p.text, /dataLayer|console\.log|Privacy policy|About/, 'no scripts, nav or footer');
  });
});

describe('a UK magazine page (one Recipe object)', () => {
  const p = readPage(page('uk-chicken-curry.html'), 'https://goodsupper.example/recipes/easy-chicken-curry');
  test('an array @type and an ImageObject are understood', () => {
    assert.equal(p.recipe.name, 'Easy chicken curry');
    assert.equal(p.image, 'https://goodsupper.example/images/chicken-curry-1x1.jpg');
  });
  test('HTML inside a step is reduced to text, with no stray spaces', () => {
    assert.equal(p.recipe.instructions[0].text, 'Heat the oil in a large pan and fry the onion for 8 mins until soft and golden.');
  });
  test('yield, author list and keywords given as one string', () => {
    assert.deepEqual(p.recipe.yield, ['Serves 4']);
    assert.equal(p.recipe.author, 'Sam Hale');
    assert.deepEqual(p.recipe.keywords, ['chicken curry', 'easy curry', 'midweek']);
    assert.deepEqual(p.recipe.time, { prep: 15, cook: 40, total: 55 });
  });
  test('with no og:url, the URL given is used (otherwise og:url, the canonical one)', () => {
    assert.equal(p.url, 'https://goodsupper.example/recipes/easy-chicken-curry');
  });
});

describe('a page with no structured data', () => {
  const p = readPage(page('no-structured-data.html'));
  test('has no recipe, but the text holds it, one line per item', () => {
    assert.equal(p.recipe, null);
    assert.equal(p.title, 'Nan\'s rock cakes | Crumbs and Things');
    const lines = p.text.split('\n');
    assert.ok(lines.includes('- 225g self-raising flour'));
    assert.ok(lines.includes('- Heat the oven to 200C/180C fan/gas 6.'));
    assert.ok(lines.includes('Makes 12. These were always in the tin at Nan’s house.'));
  });
  test('scripts, styles, comments, nav and footer are left out', () => {
    assert.doesNotMatch(p.text, /tracking|999g|font-family|1 cup of nothing|Crumbs and Things ©|Home/);
  });
});

describe('the pieces', () => {
  test('ISO 8601 durations', () => {
    assert.equal(isoMinutes('PT1H30M'), 90);
    assert.equal(isoMinutes('P0DT0H20M'), 20);
    assert.equal(isoMinutes('PT90S'), 2);
    assert.equal(isoMinutes('P1D'), 1440);
    assert.equal(isoMinutes('PT0S'), null, 'zero is no time given');
    assert.equal(isoMinutes('20 mins'), null);
  });
  test('entities, including double-encoded ones', () => {
    assert.equal(decodeEntities('Fish &amp; chips &#8211; &#x2019;'), 'Fish & chips – ’');
    assert.equal(plain('1 &amp;frac12; cups'), '1 ½ cups');
  });
  test('a method given as one string splits into steps', () => {
    assert.deepEqual(instructions('Heat the oven.\nMix.\n\nBake.'), [{ text: 'Heat the oven.' }, { text: 'Mix.' }, { text: 'Bake.' }]);
    assert.deepEqual(instructions('<ol><li>Heat</li><li>Bake</li></ol>'), [{ text: 'Heat' }, { text: 'Bake' }]);
  });
  test('an ItemList of steps, and invalid JSON-LD blocks are skipped', () => {
    const html = '<script type="application/ld+json">{ not json</script><script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"@type":"ListItem","item":{"@type":"Recipe","name":"Soup"}}]}</script>';
    assert.equal(findRecipeNode(jsonLdBlocks(html)).name, 'Soup');
  });
  test('visible text turns list items into "- " lines', () => {
    assert.equal(visibleText('<ul><li>One</li><li>Two &amp; three</li></ul>'), '- One\n- Two & three');
  });
});
