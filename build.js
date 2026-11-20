#!/usr/bin/env node
// Validates recipes/*.json and ingredients.json, then writes recipes.json for the site.
// Usage: node build.js          (validate + write recipes.json)
//        node build.js --check  (validate only)
//        node build.js --root <dir>  (use another data folder; used by the tests)
// No dependencies: includes a small JSON Schema checker covering the keywords our schemas use.
'use strict';
const fs = require('fs');
const path = require('path');

const rootAt = process.argv.indexOf('--root');
const ROOT = rootAt > 0 ? path.resolve(process.argv[rootAt + 1]) : __dirname;
const read = (p, base = ROOT) => JSON.parse(fs.readFileSync(path.join(base, p), 'utf8'));
const errors = [];
const warnings = [];
const fail = (where, msg) => errors.push(where + ': ' + msg);

// ---------- Minimal JSON Schema checker ----------
const schemas = {
  'recipe.schema.json': read('schema/recipe.schema.json', __dirname),
  'ingredients.schema.json': read('schema/ingredients.schema.json', __dirname),
};

function resolveRef(ref, base) {
  const [file, frag] = ref.split('#');
  const doc = file ? schemas[file] : schemas[base];
  if (!doc) throw new Error('Unknown schema ref ' + ref);
  let node = doc;
  for (const k of (frag || '').split('/').filter(Boolean)) node = node[k];
  if (!node) throw new Error('Bad schema ref ' + ref);
  return { node, base: file || base };
}

function typeOf(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

// Returns a list of error strings (empty = valid).
function check(schema, value, at, base) {
  const errs = [];
  const sub = (s, v, a, b = base) => check(s, v, a, b);
  if (schema.$ref) {
    const r = resolveRef(schema.$ref, base);
    errs.push(...sub(r.node, value, at, r.base));
  }
  if (schema.type) {
    const t = typeOf(value);
    const ok = schema.type === t || (schema.type === 'number' && t === 'integer');
    if (!ok) return [...errs, at + ': expected ' + schema.type + ', got ' + t];
  }
  if ('const' in schema && value !== schema.const) errs.push(at + ': must be ' + JSON.stringify(schema.const));
  if (schema.enum && !schema.enum.includes(value)) errs.push(at + ': ' + JSON.stringify(value) + ' is not one of ' + schema.enum.join(', '));
  if (typeof value === 'string') {
    if (schema.minLength && value.length < schema.minLength) errs.push(at + ': must not be empty');
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(at + ': ' + JSON.stringify(value) + ' does not match ' + schema.pattern);
  }
  if (typeof value === 'number') {
    if ('minimum' in schema && value < schema.minimum) errs.push(at + ': must be >= ' + schema.minimum);
    if ('exclusiveMinimum' in schema && value <= schema.exclusiveMinimum) errs.push(at + ': must be > ' + schema.exclusiveMinimum);
  }
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) errs.push(at + ': needs at least ' + schema.minItems + ' items');
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) errs.push(at + ': items must be unique');
    if (schema.items) value.forEach((v, i) => errs.push(...sub(schema.items, v, at + '[' + i + ']')));
  }
  if (typeOf(value) === 'object') {
    const keys = Object.keys(value);
    for (const k of schema.required || []) if (!(k in value)) errs.push(at + ': missing "' + k + '"');
    if (schema.minProperties && keys.length < schema.minProperties) errs.push(at + ': must not be empty');
    const props = schema.properties || {};
    for (const k of keys) {
      if (schema.propertyNames) errs.push(...sub(schema.propertyNames, k, at + ' key "' + k + '"'));
      if (k in props) errs.push(...sub(props[k], value[k], at + '.' + k));
      else if (schema.additionalProperties === false) errs.push(at + ': unexpected property "' + k + '"');
      else if (typeof schema.additionalProperties === 'object') errs.push(...sub(schema.additionalProperties, value[k], at + '.' + k));
    }
  }
  for (const s of schema.allOf || []) errs.push(...sub(s, value, at));
  if (schema.anyOf && !schema.anyOf.some((s) => sub(s, value, at).length === 0)) {
    errs.push(at + ': must satisfy one of: ' + schema.anyOf.map((s) => JSON.stringify(s.required || s)).join(' or '));
  }
  if (schema.oneOf) {
    const results = schema.oneOf.map((s) => sub(s, value, at));
    const passing = results.filter((r) => r.length === 0).length;
    if (passing === 0) {
      // Report the closest branch, preferring branches whose basic type matched.
      const typeMiss = (r) => r.some((e) => e.startsWith(at + ': expected '));
      const candidates = results.filter((r) => !typeMiss(r));
      errs.push(...(candidates.length ? candidates : results).reduce((a, b) => (b.length < a.length ? b : a)));
    } else if (passing > 1) {
      errs.push(at + ': matches more than one allowed shape');
    }
  }
  if (schema.not && sub(schema.not, value, at).length === 0) errs.push(at + ': has a property not allowed here (' + JSON.stringify(schema.not.anyOf ? schema.not.anyOf.map((s) => (s.required || [])[0]) : schema.not) + ')');
  return errs;
}

// ---------- Load ----------
const catalogue = read('ingredients.json');
errors.push(...check(schemas['ingredients.schema.json'], catalogue, 'ingredients.json', 'ingredients.schema.json'));
const ingredients = Object.fromEntries(Object.entries(catalogue).filter(([k]) => !k.startsWith('$')));

const aliasOwner = {};
for (const [id, ing] of Object.entries(ingredients)) {
  for (const a of ing.aliases || []) {
    const key = a.toLowerCase();
    if (ingredients[key.replace(/[^a-z0-9]+/g, '_')] && key.replace(/[^a-z0-9]+/g, '_') !== id) fail('ingredients.json', 'alias "' + a + '" of ' + id + ' is also an ingredient id');
    if (aliasOwner[key]) fail('ingredients.json', 'alias "' + a + '" used by both ' + aliasOwner[key] + ' and ' + id);
    aliasOwner[key] = id;
  }
}

const recipes = {};
for (const f of fs.readdirSync(path.join(ROOT, 'recipes')).filter((f) => f.endsWith('.json')).sort()) {
  const where = 'recipes/' + f;
  let r;
  try { r = read(where); } catch (e) { fail(where, 'invalid JSON: ' + e.message); continue; }
  const schemaErrs = check(schemas['recipe.schema.json'], r, where, 'recipe.schema.json');
  if (schemaErrs.length) { errors.push(...schemaErrs); continue; }
  if (r.id + '.json' !== f) fail(where, 'id "' + r.id + '" must match the filename');
  recipes[r.id] = r;
}

// ---------- Cross-file checks ----------
const CONVERT = { g: ['g', 1], kg: ['g', 1000], ml: ['ml', 1], l: ['ml', 1000], tsp: ['tsp', 1], tbsp: ['tsp', 3] };
const sameDimension = (a, b) => a === b || (CONVERT[a] && CONVERT[b] && CONVERT[a][0] === CONVERT[b][0]);
const referencedBy = {}; // recipe id -> Set of recipe ids that use it

function checkRecipe(r, where, fileId) {
  for (const [i, line] of (r.ingredients || []).entries()) {
    if (line.item && !ingredients[line.item]) fail(where, 'ingredients[' + i + ']: unknown item "' + line.item + '" (add it to ingredients.json)');
    if (line.qtyMax !== undefined && (line.qty === undefined || line.qtyMax <= line.qty)) fail(where, 'ingredients[' + i + ']: qtyMax needs a smaller qty');
    if (line.unit && line.qty === undefined) fail(where, 'ingredients[' + i + ']: unit without qty');
  }

  const parts = r.parts || [];
  const keys = new Set();
  const optionIds = {}; // choice part key -> option ids
  for (const p of parts) {
    const pw = where + ' part "' + p.key + '"';
    if (keys.has(p.key)) fail(where, 'duplicate part key "' + p.key + '"');
    keys.add(p.key);

    const options = p.choose || [p.recipe];
    if (p.choose) {
      const ids = options.map((o) => (typeof o === 'string' ? o : o.id));
      const dup = ids.find((id, i) => ids.indexOf(id) !== i);
      if (dup) fail(pw, 'duplicate option "' + dup + '"');
      if (!ids.includes(p.default)) fail(pw, 'default "' + p.default + '" is not one of its options');
      optionIds[p.key] = ids;
    }
    for (const o of options) {
      let target;
      if (typeof o === 'string') {
        target = recipes[o];
        if (!target) { fail(pw, 'references unknown recipe "' + o + '"'); continue; }
        (referencedBy[o] = referencedBy[o] || new Set()).add(fileId);
      } else {
        target = o;
        checkRecipe(o, pw + (o.id ? ' option "' + o.id + '"' : ''), fileId);
      }
      if (!p.use && typeof o === 'string' && !(r.serves && target.serves)) {
        fail(pw, o + (target.serves ? '' : ' has no "serves"') + (target.serves || r.serves ? '' : ' and') + (r.serves ? '' : ' the parent has no "serves"') + ', so say how much is needed with "use" (e.g. "use": { "qty": 4, "unit": "tbsp" })');
      }
      if (p.use) {
        const y = target.yield;
        if (!y || typeof y !== 'object') fail(pw, '"use" needs ' + (target.id || 'the part') + ' to have a yield with qty and unit');
        else if (!sameDimension(p.use.unit, y.unit)) fail(pw, '"use" unit ' + p.use.unit + ' does not match yield unit ' + y.unit);
      }
    }
  }

  const steps = r.steps || [];
  const used = new Set();
  for (const [i, s] of steps.entries()) {
    if (s && s.part) {
      if (!keys.has(s.part)) fail(where, 'steps[' + i + '] references unknown part "' + s.part + '"');
      used.add(s.part);
    }
    for (const [key, opts] of Object.entries((s && s.only) || {})) {
      if (!optionIds[key]) { fail(where, 'steps[' + i + '] "only" names "' + key + '", which is not a choice part'); continue; }
      for (const o of opts) if (!optionIds[key].includes(o)) fail(where, 'steps[' + i + '] "only" names unknown option "' + o + '" of part "' + key + '"');
      used.add(key);
    }
  }
  if (steps.length) for (const k of keys) if (!used.has(k)) fail(where, 'part "' + k + '" is not referenced by any step');
  if (where === 'recipes/' + fileId + '.json' && !steps.length && !parts.length && (r.ingredients || []).length) warnings.push(where + ': has ingredients but no steps');
}

for (const [id, r] of Object.entries(recipes)) checkRecipe(r, 'recipes/' + id + '.json', id);

// Cycles: a recipe must not include itself directly or via other recipes.
const edges = {};
for (const [user, set] of Object.entries(referencedBy)) for (const u of set) (edges[u] = edges[u] || []).push(user);
const state = {};
function visit(id, trail) {
  if (state[id] === 'done') return;
  if (state[id] === 'active') { fail('recipes/' + id + '.json', 'includes itself: ' + [...trail, id].join(' -> ')); return; }
  state[id] = 'active';
  for (const next of edges[id] || []) visit(next, [...trail, id]);
  state[id] = 'done';
}
Object.keys(recipes).forEach((id) => visit(id, []));

for (const [id, r] of Object.entries(recipes)) {
  if (r.listed === false && !referencedBy[id]) warnings.push('recipes/' + id + '.json: unlisted and not used by any recipe');
  if (r.image && !fs.existsSync(path.join(ROOT, r.image))) fail('recipes/' + id + '.json', 'image ' + r.image + ' not found');
}
const usedItems = new Set();
const collect = (r) => { (r.ingredients || []).forEach((l) => l.item && usedItems.add(l.item)); (r.parts || []).forEach((p) => (p.choose || [p.recipe]).forEach((o) => typeof o === 'object' && collect(o))); };
Object.values(recipes).forEach(collect);
for (const id of Object.keys(ingredients)) if (!usedItems.has(id)) warnings.push('ingredients.json: "' + id + '" is not used by any recipe');

// ---------- Report / write ----------
for (const w of warnings) console.warn('warning  ' + w);
if (errors.length) {
  for (const e of errors) console.error('error    ' + e);
  console.error('\n' + errors.length + ' error(s). Nothing written.');
  process.exit(1);
}
const count = Object.keys(recipes).length;
if (process.argv.includes('--check')) {
  console.log('OK: ' + count + ' recipes, ' + Object.keys(ingredients).length + ' ingredients.');
} else {
  const out = { recipes: Object.fromEntries(Object.entries(recipes).map(([id, r]) => { const { $schema, ...rest } = r; return [id, rest]; })), ingredients };
  fs.writeFileSync(path.join(ROOT, 'recipes.json'), JSON.stringify(out) + '\n');
  console.log('Wrote recipes.json: ' + count + ' recipes, ' + Object.keys(ingredients).length + ' ingredients.');
}
