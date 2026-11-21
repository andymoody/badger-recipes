// Runs build.js against copies of the real data with one deliberate mistake each,
// and checks that the build fails with a helpful message (or passes for valid data).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './helpers.mjs';

function run(mutate, extraArgs = ['--check']) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipes-test-'));
  try {
    fs.cpSync(path.join(ROOT, 'recipes'), path.join(dir, 'recipes'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'ingredients.json'), path.join(dir, 'ingredients.json'));
    fs.copyFileSync(path.join(ROOT, 'tags.json'), path.join(dir, 'tags.json'));
    if (fs.existsSync(path.join(ROOT, 'images'))) fs.cpSync(path.join(ROOT, 'images'), path.join(dir, 'images'), { recursive: true });
    const files = {
      read: (id) => JSON.parse(fs.readFileSync(path.join(dir, 'recipes', id + '.json'), 'utf8')),
      write: (id, r) => fs.writeFileSync(path.join(dir, 'recipes', id + '.json'), JSON.stringify(r, null, 2)),
      edit: (id, fn) => { const r = files.read(id); fn(r); files.write(id, r); },
      tags: (fn) => {
        const p = path.join(dir, 'tags.json');
        const c = JSON.parse(fs.readFileSync(p, 'utf8'));
        fn(c);
        fs.writeFileSync(p, JSON.stringify(c, null, 2));
      },
      catalogue: (fn) => {
        const p = path.join(dir, 'ingredients.json');
        const c = JSON.parse(fs.readFileSync(p, 'utf8'));
        fn(c);
        fs.writeFileSync(p, JSON.stringify(c, null, 2));
      },
      dir,
    };
    if (mutate) mutate(files);
    const res = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), '--root', dir, ...extraArgs], { encoding: 'utf8' });
    return { code: res.status, out: res.stdout + res.stderr, dir, exists: (p) => fs.existsSync(path.join(dir, p)), readOut: () => JSON.parse(fs.readFileSync(path.join(dir, 'recipes.json'), 'utf8')) };
  } finally {
    // Cleaned up by the caller once it has read any output.
    run.dirs.push(dir);
  }
}
run.dirs = [];
process.on('exit', () => { for (const d of run.dirs) fs.rmSync(d, { recursive: true, force: true }); });

const curry = (fn) => (f) => f.edit('thai_red_curry', fn);
const protein = (r) => r.parts.find((p) => p.key === 'protein');

describe('valid data', () => {
  test('the real recipes pass --check', () => {
    const r = run(null);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /OK: \d+ recipes/);
    assert.equal(r.exists('recipes.json'), false, '--check writes nothing');
  });
  test('a full build writes recipes.json without $schema', () => {
    const r = run(null, []);
    assert.equal(r.code, 0, r.out);
    const out = r.readOut();
    assert.ok(out.recipes.thai_red_curry);
    assert.equal(out.recipes.thai_red_curry.$schema, undefined);
    assert.equal(out.ingredients.$schema, undefined);
    assert.equal(out.ingredients.salt.name, 'Salt');
    assert.deepEqual(out.tags.thai, { name: 'Thai', group: 'cuisine' });
    assert.equal(out.tags.$schema, undefined);
  });
});

const failures = [
  ['unknown catalogue item', curry((r) => { r.ingredients[0].item = 'unicorn'; }), /unknown item "unicorn"/],
  ['qty as a string', curry((r) => { r.ingredients[0].qty = '1'; }), /qty: expected number, got string/],
  ['a unit not on the list', curry((r) => { r.ingredients[0].unit = 'cup'; }), /"cup" is not one of/],
  ['qtyMax not above qty', curry((r) => { r.ingredients[0].qtyMax = 1; }), /qtyMax needs a smaller qty/],
  ['a unit without a qty', curry((r) => { delete r.ingredients[0].qty; }), /unit without qty/],
  ['neither serves nor yield', curry((r) => { delete r.serves; }), /one of: \["serves"\] or \["yield"\]/],
  ['an id that does not match the filename', curry((r) => { r.id = 'thai_curry'; }), /id "thai_curry" must match the filename/],
  ['an unknown recipe reference', curry((r) => { r.parts[1].recipe = 'basmati_rice'; }), /references unknown recipe "basmati_rice"/],
  ['duplicate part keys', curry((r) => { r.parts[1].key = 'paste'; }), /duplicate part key "paste"/],
  ['duplicate option ids', curry((r) => { protein(r).choose[1].id = 'chicken'; }), /duplicate option "chicken"/],
  ['a default that is not an option', curry((r) => { protein(r).default = 'beef'; }), /default "beef" is not one of its options/],
  ['a part with both recipe and choose', curry((r) => { protein(r).recipe = 'jasmine_rice'; }), /parts\[2\]: matches more than one allowed shape/],
  ['an inline part with a course', (f) => f.edit('scotch_eggs', (r) => { r.parts[0].choose[0].course = 'main'; }), /not allowed here.*course/],
  ['a step naming an unknown part', curry((r) => { r.steps[1].part = 'noodles'; }), /references unknown part "noodles"/],
  ['a part no step references', curry((r) => { r.steps.splice(1, 1); }), /part "rice" is not referenced by any step/],
  ['"only" naming a part that is not a choice', curry((r) => { r.steps[3].only = { rice: ['jasmine_rice'] }; }), /not a choice/],
  ['"only" naming an unknown option', curry((r) => { r.steps[3].only = { protein: ['beef'] }; }), /unknown option "beef" of part "protein"/],
  ['"only" with an empty list', curry((r) => { r.steps[3].only = { protein: [] }; }), /only\.protein: needs at least 1 items/],
  ['a step with only "only"', curry((r) => { r.steps[3] = { only: { protein: ['chicken'] } }; }), /steps\[3\]: must satisfy one of: \["text"\] or \["part"\]/],
  ['a shared part without use where the part has no serves', curry((r) => { delete r.parts[0].use; }), /has no "serves", so say how much is needed with "use"/],
  ['use units that do not match the yield', curry((r) => { r.parts[0].use = { qty: 100, unit: 'g' }; }), /does not match yield unit/],
  ['use on a part without a quantity yield', curry((r) => { r.parts[1].use = { qty: 1, unit: 'tin' }; }), /yield with qty and unit/],
  ['a recipe that includes itself', (f) => f.edit('jasmine_rice', (r) => { r.parts = [{ key: 'curry', recipe: 'thai_red_curry' }]; r.steps.push({ text: 'Serve with curry.', part: 'curry' }); }), /includes itself/],
  ['a missing image', curry((r) => { r.image = 'images/thai_red_curry.jpg'; }), /image .* not found/],
  ['a catalogue entry with an unknown scaling', (f) => f.catalogue((c) => { c.salt.scaling = 'gentle'; }), /"gentle" is not one of linear/],
  ['an unknown tag', curry((r) => { r.tags.push('chilli'); }), /unknown tag "chilli" \(add it to tags.json with a group\)/],
  ['a tag without a group', (f) => f.tags((t) => { delete t.thai.group; }), /tags\.json\.thai: missing "group"/],
  ['a tag in a group that does not exist', (f) => f.tags((t) => { t.thai.group = 'region'; }), /"region" is not one of cuisine/],
  ['tags on an inline part', (f) => f.edit('scotch_eggs', (r) => { r.parts[0].choose[0].tags = ['pork']; }), /not allowed here.*tags/],
  ['an unknown property (typo)', curry((r) => { r.serve = 4; }), /unexpected property "serve"/],
  ['adapted without saying what changed', (f) => f.edit('scotch_eggs', (r) => { delete r.source.changes; }), /source is adapted: say what changed in "source.changes"/],
  ['changes recorded without adapted', (f) => f.edit('scotch_eggs', (r) => { delete r.source.adapted; }), /source.changes without "adapted": true/],
  ['a counted yield without a name', (f) => f.edit('scotch_eggs', (r) => { r.yield = { qty: 6 }; }), /yield/],
];

describe('the build fails with a clear message for', () => {
  for (const [name, mutate, message] of failures) {
    test(name, () => {
      const r = run(mutate);
      assert.equal(r.code, 1, 'expected the build to fail:\n' + r.out);
      assert.match(r.out, message);
      assert.match(r.out, /error\(s\)\. Nothing written\./);
    });
  }
});

describe('warnings (the build still passes)', () => {
  test('an unused catalogue entry', () => {
    const r = run((f) => f.catalogue((c) => { c.zz_unused_test_item = { name: 'Unused test item' }; }));
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /warning .*zz_unused_test_item/);
  });
  test('an unused tag', () => {
    const r = run((f) => f.tags((t) => { t.zz_unused_tag = { name: 'Unused test tag', group: 'cuisine' }; }));
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /warning .*tags.json: "zz_unused_tag" is not used/);
  });
  test('a text yield that starts with a number, with the structured form to use', () => {
    const r = run((f) => f.edit('scotch_eggs', (s) => { s.yield = '6 Scotch eggs'; }));
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /warning .*yield "6 Scotch eggs" starts with a number, so it won't scale: use \{ "qty": 6, "name": "Scotch eggs" \}/);
  });
  test('an unlisted recipe nothing uses', () => {
    const r = run((f) => f.edit('american_pancakes', (p) => { p.listed = false; }));
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /warning .*unlisted and not used/);
  });
});
