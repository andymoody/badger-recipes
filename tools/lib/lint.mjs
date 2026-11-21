// Checks the build can't make: things in a recipe's text that suggest a slip in extraction
// (imperial units, °F, American words) or a line that may not belong. Returns findings as
// { level: 'warn' | 'check', where, message }. "warn" needs fixing or explaining; "check" is a
// prompt to look again. Pure: takes the loaded data.
import { nearDuplicates, normaliseName, addFanTemps } from './lines.mjs';

const IMPERIAL = [
  [/\b\d+\s*(?:°|º|degrees?)?\s*F(?:ahrenheit)?\b/, '°F temperature'],
  [/\bcups?\b/i, 'cups'],
  [/\b\d+(?:\.\d+)?\s*(?:oz|ounces?)\b/i, 'ounces'],
  [/\b\d+(?:\.\d+)?\s*(?:lbs?|pounds?)\b/i, 'pounds'],
  [/\b\d+(?:\.\d+)?[- ]?(?:inch(?:es)?|in\.)(?=\s|$|[,.;)])/i, 'inches'],
  [/\b\d+\s*(?:pints?|quarts?)\b/i, 'pints or quarts'],
  [/\bsticks? of butter\b/i, 'sticks of butter'],
];
const AMERICAN = [
  ['cilantro', 'coriander'], ['zucchini', 'courgette'], ['eggplant', 'aubergine'], ['scallions?', 'spring onion'],
  ['all-purpose flour', 'plain flour'], ['confectioners\'? sugar', 'icing sugar'], ['powdered sugar', 'icing sugar'],
  ['heavy cream', 'double cream'], ['broil(?:er|ing)?', 'grill'], ['skillet', 'frying pan'], ['baking soda', 'bicarbonate of soda'],
  ['ground (?:beef|pork|lamb)', 'minced'], ['shrimps?(?! paste)', 'prawns'], ['arugula', 'rocket'], ['garbanzo', 'chickpea'],
  ['bell peppers?', 'pepper'], ['plastic wrap', 'cling film'], ['aluminum foil', 'foil'], ['color', 'colour'], ['flavor', 'flavour'],
];

/** Every recipe body in a file: the recipe and its inline parts and options, with their paths. */
export function bodies(recipe) {
  const out = [];
  const visit = (r, path) => {
    out.push({ r, path });
    for (const p of r.parts || []) {
      if (p.choose) for (const o of p.choose) { if (typeof o === 'object') visit(o, path + '/' + p.key + '/' + o.id); }
      else if (typeof p.recipe === 'object') visit(p.recipe, path + '/' + p.key);
    }
  };
  visit(recipe, recipe.id);
  return out;
}

// Words too general to show an ingredient is mentioned ("white" in white pepper).
const GENERIC = new Set(['white', 'black', 'green', 'fresh', 'dried', 'ground', 'whole', 'large', 'small', 'smoked', 'sweet', 'plain', 'strong', 'fast', 'action', 'light', 'dark', 'extra', 'virgin']);

const SPICES = /\b(?:spices|spice mix|seasonings?|herbs)\b/i;

const stepText = (s) => (typeof s === 'string' ? s : s.text || s.heading || '');

export function lintRecipe(recipe, data, { exists = () => true } = {}) {
  const found = [];
  const add = (level, where, message) => found.push({ level, where, message });
  const all = bodies(recipe);

  for (const { r, path } of all) {
    const texts = [];
    if (r.title) texts.push(['title', r.title]);
    (r.steps || []).forEach((s, i) => texts.push(['step ' + (i + 1), stepText(s)]));
    if (r.notes) texts.push(['notes', r.notes]);
    (r.ingredients || []).forEach((l, i) => {
      if (l.prep) texts.push(['ingredient ' + (i + 1) + ' prep', l.prep]);
      if (l.note) texts.push(['ingredient ' + (i + 1) + ' note', l.note]);
      if (l.text) texts.push(['ingredient ' + (i + 1), l.text]);
    });
    for (const [where, t] of texts) {
      for (const [re, what] of IMPERIAL) if (re.test(t)) add('warn', path + ' ' + where, what + ' in "' + t + '": convert to metric');
      for (const [us, uk] of AMERICAN) if (new RegExp('\\b' + us + '\\b', 'i').test(t)) add('warn', path + ' ' + where, 'American "' + t.match(new RegExp('\\b' + us + '\\b', 'i'))[0] + '": use "' + uk + '"');
    }
    // Oven temperatures should give the fan figure too (docs/extraction.md, Units).
    (r.steps || []).forEach((s, i) => {
      if (addFanTemps(stepText(s)).changes.length) add('check', path + ' step ' + (i + 1), 'an oven temperature has no fan figure: add one 20°C lower, e.g. "220°C (200°C fan)"');
    });
    // Amounts written into step text stay as written when the recipe is scaled.
    (r.steps || []).forEach((s, i) => {
      const m = stepText(s).match(/\b\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|tsp|tbsp|teaspoons?|tablespoons?)\b(?!\s*(?:tin|can))/i);
      const count = stepText(s).match(/\b\d+\s+(?:even-sized\s+|equal\s+|large\s+|small\s+)?(?!(?:minutes?|mins?|hours?|hrs?|seconds?|secs?|days?|degrees?|times?|batch(?:es)?)\b)[a-z]+s\b(?!\s+at a time)/i);
      if (count) add('check', path + ' step ' + (i + 1), '"' + count[0] + '" in the step text won\'t scale with servings: fine if it\'s a fixed number, otherwise say "two for each egg" or "the eggs"');
      if (m) add('check', path + ' step ' + (i + 1), '"' + m[0] + '" in the step text won\'t scale with servings: fine if it\'s a fixed amount, otherwise say "the rest" or "half"');
    });
    (r.ingredients || []).forEach((l, i) => {
      const where = path + ' ingredient ' + (i + 1);
      if (l.text) add('warn', where, 'free-text line "' + l.text + '": a last resort; can it be a catalogue line?');
      if (l.qtyMax != null && l.qty != null && l.qtyMax <= l.qty) add('warn', where, 'qtyMax ' + l.qtyMax + ' is not above qty ' + l.qty);
      if (l.qty === 0) add('warn', where, 'qty is 0');
      // A number in a note stays fixed when the line scales ("150ml" in a substitute, "30 twists").
      // Pack sizes on tins and packs, and a size on its own ("400g", "5cm"), are fine.
      const scales = l.qty != null && (l.scaling || (data.ingredients[l.item] || {}).scaling) !== 'fixed';
      if (scales && l.note && /\d/.test(l.note) && !['tin', 'pack'].includes(l.unit) && !/^\s*\d+(?:\.\d+)?\s*(?:g|kg|ml|l|cm)\s*$/.test(l.note)) add('check', where, 'the note "' + l.note + '" has a number that won\'t scale with the amount');
    });

    // Ingredients the method never mentions (by name, plural, alias or id words), and the reverse
    // isn't attempted. A prompt to check nothing was attached to the wrong part.
    const method = [r, ...all.filter((b) => b.path.startsWith(path + '/')).map((b) => b.r)]
      .flatMap((x) => (x.steps || []).map(stepText)).join(' ');
    const parentMethod = all.filter((b) => path.startsWith(b.path + '/')).flatMap((b) => (b.r.steps || []).map(stepText)).join(' ');
    const said = new Set(normaliseName(method + ' ' + parentMethod).split(' '));
    if ((r.steps || []).length || parentMethod) {
      for (const l of r.ingredients || []) {
        if (!l.item) continue;
        const e = data.ingredients[l.item] || {};
        if (e.staple) continue;
        const names = [l.item, e.name, e.plural, ...(e.aliases || [])].filter(Boolean).map(normaliseName);
        // "rub with the oil and spices" covers the dried herbs and ground spices.
        const spiceLike = /^(?:ground|dried)\b/i.test(e.name || '') || ['strong_spice', 'seasoning'].includes(e.scaling);
        const hit = names.some((n) => n.split(' ').some((w) => w.length > 2 && !GENERIC.has(w) && said.has(w))) || (spiceLike && SPICES.test(method + ' ' + parentMethod));
        if (!hit) add('check', path, '"' + (e.name || l.item) + '" is never mentioned in the method');
      }
    }
  }

  if (recipe.image && !exists(recipe.image)) add('warn', recipe.id, 'image ' + recipe.image + ' does not exist');
  if (!recipe.image) add('check', recipe.id, 'no image: propose one from the source if it has one');
  if (recipe.source && recipe.source.type === 'own' && !recipe.source.adapted) add('check', recipe.id, 'source is "own": right for a family recipe, but not for one from a site, book or file');
  if (/\bestimat/i.test(recipe.notes || '')) add('check', recipe.id, 'notes mention an estimate: list it in the approval summary');
  return found;
}

/** Near-duplicate entries in the catalogues, which usually means one was added by mistake. */
const UNIT_NAMES = new Set(['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cm', 'clove', 'tin', 'pack', 'pinch', 'handful', 'sprig', 'bunch', 'slice', 'stick', 'sheet']);

export function lintCatalogues(data) {
  return [
    ...Object.entries(data.ingredients).filter(([id, e]) => UNIT_NAMES.has(id) || UNIT_NAMES.has(normaliseName(e.name || ''))).map(([id]) => ({ level: 'warn', where: 'ingredients.json', message: '"' + id + '" is also a unit name, so "8 cloves" could mean either: use a fuller id (whole_clove)' })),
    ...nearDuplicates(data.ingredients).map(([a, b]) => ({ level: 'warn', where: 'ingredients.json', message: '"' + a + '" and "' + b + '" look like the same ingredient' })),
    ...nearDuplicates(data.tags).map(([a, b]) => ({ level: 'warn', where: 'tags.json', message: '"' + a + '" and "' + b + '" look like the same tag' })),
  ];
}
