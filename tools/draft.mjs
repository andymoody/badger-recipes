#!/usr/bin/env node
// Makes a first draft of a recipe file from a snapshot (tools/fetch-source.mjs), doing the
// mechanical work: amounts parsed and converted to metric, ingredients matched to the
// catalogue, °F converted in the steps, servings, times and source filled in. It writes
// <snapshot>/draft.json and <snapshot>/draft-report.md, and never touches recipes/.
//
// The draft is flat (no parts, choices or headings beyond the source's): choosing the
// structure is the extractor's job. Unmatched ingredients get "item": "NEW:<suggested id>".
//
// Input: <snapshot>/recipe.json (web pages with structured data), or else the
// "## Transcription" section of <snapshot>/source.md, written by the extractor:
//   Title: Grandma's scones
//   Serves: 8            (or Yield: 12 scones)
//   Time: prep 15, cook 12
//   ### Ingredients
//   - 225g self-raising flour
//   #### For the topping         (a heading)
//   ### Method
//   1. Heat the oven to 220°C.
//   ### Notes
//   Free text.
//
// Usage: node tools/draft.mjs <snapshot dir> [--id <id>] [--pints us|uk]
import fs from 'node:fs';
import path from 'node:path';
import { loadData } from './lib/data.mjs';
import { parseLine, convertTemperatures, addFanTemps, matchItem, catalogueIndex, normaliseName } from './lib/lines.mjs';

const COURSE_WORDS = [
  [/\b(?:main|dinner|supper|lunch|entr[ée]e)\b/i, 'main'], [/\bside\b/i, 'side'], [/\b(?:starter|appeti[sz]er)\b/i, 'starter'],
  [/\bdessert\b|(?<!black |white )\bpudding\b/i, 'dessert'], [/\b(?:baking|cake|bread|biscuit|cookie|bake)\b/i, 'baking'], [/\bbreakfast|brunch\b/i, 'breakfast'],
  [/\b(?:sauce|condiment|dressing)\b/i, 'sauce'], [/\b(?:drink|cocktail|beverage)\b/i, 'drink'], [/\bsnack\b/i, 'snack'],
];

/** "Serves 4", "4 servings", "4", "6-8" -> { serves, note }; "12 pancakes" -> { yield: {qty, name} }; "300g" -> { yield: {qty, unit} }. */
export function readYield(list) {
  for (const y of list) {
    const s = String(y).trim();
    const m = s.match(/^(?:serves|servings?:?|feeds|for)?\s*(\d+)(?:\s*(?:-|–|to)\s*(\d+))?\s*(?:servings?|people|persons?|portions?)?$/i);
    if (m) return { serves: Number(m[1]), note: m[2] ? 'Serves ' + m[1] + '–' + m[2] + '.' : null };
  }
  for (const y of list) {
    const p = parseLine(String(y));
    if (p.qty != null && ['g', 'kg', 'ml', 'l', 'tbsp', 'tsp'].includes(p.unit) && !p.name) return { yield: { qty: p.qty, unit: p.unit } };
  }
  const text = list.find((y) => /\d/.test(y) && /[a-z]/i.test(y));
  if (!text) return {};
  const t = text.replace(/^(?:makes|yield:?)\s*/i, '');
  // "12 pancakes" is a count, so it scales; anything else stays as text.
  const count = t.match(/^(\d+)\s+([^\d].*)$/);
  return count ? { yield: { qty: Number(count[1]), name: count[2] } } : { yield: t };
}

/** The Transcription section of source.md in the same shape as recipe.json. */
export function readTranscription(md) {
  const at = md.indexOf('## Transcription');
  if (at < 0) return null;
  const lines = md.slice(at).split('\n').slice(1);
  const r = { name: null, yield: [], time: {}, ingredients: [], instructions: [], notes: [] };
  let section = null;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l || l.startsWith('(Write the recipe')) continue;
    const h3 = l.match(/^###\s+(.*)$/);
    if (h3 && !l.startsWith('####')) { section = h3[1].toLowerCase(); continue; }
    const h4 = l.match(/^####\s+(.*)$/);
    if (h4) {
      if (section === 'ingredients') r.ingredients.push({ heading: h4[1] });
      else if (section === 'method') r.instructions.push({ heading: h4[1] });
      continue;
    }
    if (!section) {
      const kv = l.match(/^(title|serves|yield|time):\s*(.*)$/i);
      if (!kv) continue;
      const k = kv[1].toLowerCase();
      if (k === 'title') r.name = kv[2];
      else if (k === 'serves') r.yield.push('Serves ' + kv[2]);
      else if (k === 'yield') r.yield.push(kv[2]);
      else for (const [, w, n] of kv[2].matchAll(/(prep|cook|rest|total)\s*(\d+)/gi)) r.time[w.toLowerCase()] = Number(n);
      continue;
    }
    if (section === 'ingredients') r.ingredients.push(l.replace(/^[-*]\s*/, ''));
    else if (section === 'method') r.instructions.push({ text: l.replace(/^\d+[.)]\s*/, '') });
    else if (section === 'notes') r.notes.push(l);
  }
  return r;
}

export function draftRecipe(src, meta, data, { id, pints } = {}) {
  const report = [];
  const index = catalogueIndex(data.ingredients);
  const title = src.name || meta.title || id;
  const draft = { $schema: '../../schema/recipe.schema.json', id, title };
  if (/^(?:[A-Z][\w'’-]*\s+){2,}[A-Z]/.test(title)) report.push('- Title looks like Title Case: use sentence case.');

  const words = [...(src.category || []), title].join(' ');
  const course = COURSE_WORDS.find(([re]) => re.test(words));
  if (course) { draft.course = course[1]; report.push('- course "' + course[1] + '" guessed from "' + words + '": check it.'); }
  else report.push('- course: not guessed. Choose one.');

  const y = readYield(src.yield || []);
  if (y.serves) draft.serves = y.serves;
  if (y.yield) draft.yield = y.yield;
  if (y.note) report.push('- ' + y.note + ' Mention the range in notes if it matters.');
  if (!y.serves && !y.yield) report.push('- No servings or yield in the source: estimate one and say so in notes.');

  const t = Object.fromEntries(Object.entries(src.time || {}).filter(([, v]) => v));
  if (t.total && (t.prep || t.cook) && t.total === (t.prep || 0) + (t.cook || 0)) delete t.total;
  if (Object.keys(t).length) draft.time = t;

  if (meta.kind === 'web') {
    draft.source = { type: 'web', url: meta.url || 'TODO: page URL', ...(meta.site ? { title: meta.site } : {}) };
    if (!meta.url) report.push('- The saved page has no URL: fill in source.url.');
  }
  else draft.source = { type: 'file', name: meta.name, drive: 'TODO: Google Drive link' };

  report.push('', '## Ingredients', '');
  draft.ingredients = [];
  for (const raw of src.ingredients || []) {
    if (typeof raw === 'object' && raw.heading) { draft.ingredients.push({ heading: raw.heading }); report.push('- heading: ' + raw.heading); continue; }
    const p = parseLine(raw, { pints });
    const m = p.name ? matchItem(p.name, data.ingredients, index) : { id: null, candidates: [], suggestedId: '' };
    // A line ending in a known ingredient ("fatty minced pork") is that ingredient, with the extra
    // words ("fatty") kept in the note, as are descriptors dropped to match ("medium" eggs).
    const twoItems = p.warnings.some((w) => /two ingredients/.test(w));
    const tail = !m.id && !twoItems && m.candidates.find((c) => c.why && c.why.startsWith('ends with'));
    const id = m.id || (tail && tail.id);
    const matchedWords = new Set(normaliseName(tail ? tail.why.replace(/^ends with "|"$/g, '') : id ? [id, data.ingredients[id].name, data.ingredients[id].plural, ...(data.ingredients[id].aliases || [])].join(' ') : '').split(' '));
    const extra = id && !(m.id && m.how === 'exact') ? p.name.split(/\s+/).filter((w) => !matchedWords.has(normaliseName(w)) && !/^of$/i.test(w)).join(' ').replace(/^(?:and|or)\s+|\s+(?:and|or)$/gi, '') : '';
    if (extra) p.note = p.note ? extra + ', ' + p.note : extra;
    const line = { item: id || 'NEW:' + m.suggestedId };
    for (const k of ['qty', 'qtyMax', 'unit', 'prep', 'note', 'optional']) if (p[k] != null) line[k] = p[k];
    draft.ingredients.push(line);
    const bits = ['- "' + raw + '" → ' + JSON.stringify(line)];
    if (m.id) { if (m.how !== 'exact') bits.push('  matched ' + m.id + ' (' + m.how + '): check it is the same product'); }
    else if (tail) bits.push('  matched ' + tail.id + ' by the end of the line (' + tail.why + ')' + (extra ? ', with "' + extra + '" in the note' : '') + ': check it is the same product (smoked paprika isn\'t paprika)');
    else bits.push('  NOT IN CATALOGUE' + (m.candidates.length ? '; candidates: ' + m.candidates.map((c) => c.id + (c.why ? ' (' + c.why + ')' : '')).join(', ') : '') + '; new id would be ' + m.suggestedId);
    for (const c of p.conversions) bits.push('  ' + c);
    for (const w of p.warnings) bits.push('  WARNING: ' + w);
    report.push(...bits);
  }

  report.push('', '## Steps', '');
  draft.steps = [];
  for (const s of src.instructions || []) {
    if (s.heading) { draft.steps.push({ heading: s.heading }); continue; }
    const c = convertTemperatures(s.text);
    const f = addFanTemps(c.text);
    draft.steps.push(f.text);
    for (const ch of [...c.changes, ...f.changes]) report.push('- step ' + draft.steps.length + ': ' + ch);
  }
  if (src.notes && src.notes.length) draft.notes = src.notes.join(' ');
  if (meta.image) report.push('', '## Image', '', '- Source image: ' + meta.image + ' (propose it for approval; see docs/extraction.md)');
  report.push('', '## Still to decide', '', '- Structure: parts, choices, conditional steps (docs/extraction.md, "Choosing a structure").',
    '- Tags (tags.json), course, and catalogue entries for NEW: items.', '- Notes, tips and variations in the page text that the structured data left out.');
  return { draft, report: report.join('\n') };
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const dir = args.find((a, i) => !a.startsWith('--') && !['--id', '--pints', '--root'].includes(args[i - 1]));
  if (!dir || !fs.existsSync(path.join(dir, 'meta.json'))) { console.error('Usage: node tools/draft.mjs <snapshot dir> [--id <id>] [--pints us|uk]  (run tools/fetch-source.mjs first)'); process.exit(2); }
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const jsonPath = path.join(dir, 'recipe.json');
  const src = fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, 'utf8')) : readTranscription(fs.readFileSync(path.join(dir, 'source.md'), 'utf8'));
  if (!src || !(src.ingredients || []).length) { console.error('No recipe data in ' + dir + ': write the "## Transcription" section of source.md first.'); process.exit(1); }
  const id = opt('--id') || path.basename(path.resolve(dir));
  const { draft, report } = draftRecipe(src, meta, loadData(opt('--root')), { id, pints: opt('--pints') || 'uk' });
  fs.writeFileSync(path.join(dir, 'draft.json'), JSON.stringify(draft, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'draft-report.md'), '# Draft report: ' + id + '\n\n' + report + '\n');
  console.log('Wrote ' + path.join(dir, 'draft.json') + '\n\n' + report);
}
