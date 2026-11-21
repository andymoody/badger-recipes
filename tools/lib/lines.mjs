// Turns ingredient lines as written in a source ("1 1/2 cups all-purpose flour, sifted") into
// draft ingredient lines in our model: metric units, numbers, prep and note split out, and a
// catalogue match. Also converts oven temperatures in step text. Pure functions, no I/O.
// These are suggestions for the extractor to check, never the final word: each result lists
// the conversions made and anything that needs a human decision.

const FRACTION_CHARS = { '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8 };

/** "1½" becomes "1 12/24" and "½" becomes "12/24", so one number parser handles both. */
function normaliseText(s) {
  let t = String(s).replace(/⁄/g, '/');
  t = t.replace(/(\d)?\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (m, whole, f) => (whole ? whole + ' ' : ' ') + Math.round(FRACTION_CHARS[f] * 24) + '/24');
  return t.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

const GLYPH = Object.fromEntries(Object.entries(FRACTION_CHARS).map(([g, v]) => [Math.round(v * 24), g]));
/** Undoes normaliseText's fractions in text that is shown ("1 6/24 cups" back to "1¼ cups"). */
const restoreFractions = (s) => s.replace(/(\d+ )?(\d+)\/24\b/g, (m, whole, n) => (GLYPH[n] ? (whole ? whole.trim() : '') + GLYPH[n] : m));

const NUM = '(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?)';
const numValue = (s) => {
  s = s.trim().replace(',', '.');
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return Number(s);
};

// Unit words as sources write them, mapped to our units or to an imperial unit to convert.
// "t" and "T" (teaspoon, tablespoon) are case-sensitive, as in American recipes.
const UNIT_WORDS = [
  [/^(?:fl\.?\s?oz|fluid\s+ounces?)\b\.?/i, 'floz'],
  [/^(?:g|gr|grams?|grammes?)\b/i, 'g'],
  [/^(?:kg|kgs|kilos?|kilograms?)\b/i, 'kg'],
  [/^(?:ml|mls|millilit(?:re|er)s?)\b/i, 'ml'],
  [/^(?:cl|centilit(?:re|er)s?)\b/i, 'cl'],
  [/^(?:l|lit(?:re|er)s?)\b/i, 'l'],
  [/^(?:tsps?|teaspoons?|teaspoonfuls?)\b\.?/i, 'tsp'],
  [/^t\b\.?/, 'tsp'],
  [/^(?:tbsps?|tbs|tbls?|tablespoons?|tablespoonfuls?)\b\.?/i, 'tbsp'],
  [/^T\b\.?/, 'tbsp'],
  [/^(?:cups?|c)\b\.?/i, 'cup'],
  [/^(?:oz|ounces?)\b\.?/i, 'oz'],
  [/^(?:lbs?|pounds?)\b\.?/i, 'lb'],
  [/^(?:pints?|pt)\b\.?/i, 'pint'],
  [/^(?:quarts?|qt)\b\.?/i, 'quart'],
  [/^(?:inch(?:es)?\b|in\.|")/i, 'inch'],
  [/^(?:cm|centimet(?:re|er)s?)\b/i, 'cm'],
  [/^(?:mm|millimet(?:re|er)s?)\b/i, 'mm'],
  [/^cloves?\b/i, 'clove'],
  [/^(?:tins?|cans?)\b/i, 'tin'],
  [/^(?:packs?|packets?|packages?|pkgs?)\b/i, 'pack'],
  [/^pinch(?:es)?\b/i, 'pinch'],
  [/^handfuls?\b/i, 'handful'],
  [/^sprigs?\b/i, 'sprig'],
  [/^bunch(?:es)?\b/i, 'bunch'],
  [/^slices?\b/i, 'slice'],
  [/^sticks?\b/i, 'stick'],
  [/^sheets?\b/i, 'sheet'],
];

export const MODEL_UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cm', 'clove', 'tin', 'pack', 'pinch', 'handful', 'sprig', 'bunch', 'slice', 'stick', 'sheet'];
const METRIC = new Set(['g', 'kg', 'ml', 'l']);

// Cup weights from docs/extraction.md, matched on the ingredient name. Liquids go by volume.
const CUP_GRAMS = [
  [/\b(?:icing|powdered|confectioners'?)\s+sugar\b/i, 120],
  [/\b(?:brown|muscovado|demerara)\s+sugar\b/i, 220],
  [/\bsugar\b/i, 200],
  [/\bflour\b/i, 125],
  [/\bbutter\b/i, 225],
  [/\brice\b/i, 185],
  [/\boats\b/i, 90],
  [/\b(?:grated|shredded)\b.*\bcheese\b|\bcheese\b.*\b(?:grated|shredded)\b|\bparmesan\b|\bcheddar\b/i, 100],
];
const LIQUID = /\b(?:water|milk|buttermilk|cream|stock|broth|juice|wine|beer|vinegar|oil|sauce|syrup|honey|yogh?urt|passata|brandy|rum|whisk(?:e)?y|vodka|sherry|port|cider|coffee|tea)\b/i;

/** Rounds a converted metric amount: ½ below 10, whole numbers below 50, else the nearest 5. */
export function roundConverted(v) {
  if (v < 10) return Math.max(0.5, Math.round(v * 2) / 2);
  if (v < 50) return Math.round(v);
  return Math.round(v / 5) * 5;
}

const PREP_WORDS = /^(?:(?:very |finely |roughly |coarsely |thinly |thickly |freshly |lightly |well |just )?(?:chopped|diced|sliced|minced|grated|crushed|peeled|melted|softened|beaten|whisked|cubed|shredded|torn|toasted|drained|rinsed|halved|quartered|deseeded|seeded|trimmed|zested|juiced|cut|picked|sifted|cooked|ground|pitted|cored|mashed|squeezed|scrubbed|julienned|bruised|warmed|chilled|cooled|separated|smashed|crumbled|bashed|flaked|blanched|soaked|at room temperature|room temperature)\b)/i;
const LEADING_PREP = /^((?:(?:very|finely|roughly|coarsely|thinly|freshly|lightly)\s+)?(?:chopped|diced|sliced|minced|grated|crushed|melted|softened|beaten|cubed|shredded|toasted|sifted|cooked|mashed|peeled|halved|smashed|crumbled))\s+/i;
const NO_QTY = '(to taste|to season|for frying|for deep[- ]frying|for greasing|for dusting|as needed|to serve|for serving|to garnish|for garnish)';
const NO_QTY_NOTE = new RegExp('\\b' + NO_QTY + '\\b', 'i');
const OPTIONAL = /\(optional\)|,?\s*\boptional\b|\b(?:to serve|for serving|to garnish|for garnish)\b/i;

function readAmount(t) {
  const m = t.match(new RegExp('^(' + NUM + ')(?:\\s*(?:-|to)\\s*(' + NUM + '))?'));
  if (m) return { qty: numValue(m[1]), qtyMax: m[2] ? numValue(m[2]) : null, rest: t.slice(m[0].length).trim() };
  // "a"/"an" before a unit means one ("a pinch of salt", "a handful of basil").
  const art = t.match(/^(?:an?|one)\s+/i);
  if (art) {
    const rest = t.slice(art[0].length);
    if (readUnit(rest)) return { qty: 1, qtyMax: null, rest };
  }
  // So does a unit with no number: "Pinch of salt", "small bunch coriander".
  const bare = t.match(/^(?:(small|large|big|generous|good)\s+)?(?=(?:pinch|handful|bunch|sprig)(?:es|s)?\b)/i);
  if (bare) return { qty: 1, qtyMax: null, rest: t.slice(bare[0].length), size: bare[1] ? bare[1].toLowerCase() : null };
  return null;
}

function readUnit(t) {
  t = t.replace(/^-(?=[a-z])/i, ''); // "1-inch", "2-pound"
  for (const [re, unit] of UNIT_WORDS) {
    const m = t.match(re);
    if (m) return { unit, rest: t.slice(m[0].length).trim() };
  }
  return null;
}

const formatQty = (q, m) => {
  const f = (v) => String(Math.round(v * 1000) / 1000);
  return m != null ? f(q) + '-' + f(m) : f(q);
};

/** Converts an imperial or other non-model unit into one of ours, recording what it did in notes. */
function toModelUnit(qty, qtyMax, unit, name, { pints = 'uk' } = {}, notes) {
  const from = formatQty(qty, qtyMax) + ' ' + unit;
  const c = (f, u, label) => {
    notes.push(label);
    return { qty: roundConverted(qty * f), qtyMax: qtyMax != null ? roundConverted(qtyMax * f) : null, unit: u };
  };
  switch (unit) {
    case 'oz':
      if (LIQUID.test(name)) notes.push('check: "' + from + '" of a liquid may mean fluid ounces');
      return c(28.35, 'g', 'converted ' + from + ' to g (× 28.35)');
    case 'lb': return c(453.6, 'g', 'converted ' + from + ' to g (× 453.6)');
    case 'floz': return c(pints === 'us' ? 29.6 : 28.4, 'ml', 'converted ' + from + ' to ml (' + (pints === 'us' ? 'US' : 'UK') + ' fl oz)');
    case 'pint': return c(pints === 'us' ? 473 : 568, 'ml', 'converted ' + from + ' to ml (' + (pints === 'us' ? 'US, 473' : 'UK, 568') + ' ml a pint)');
    case 'quart': return c(946, 'ml', 'converted ' + from + ' to ml (US quart, 946 ml)');
    case 'cl': return c(10, 'ml', 'converted ' + from + ' to ml');
    case 'mm': return c(0.1, 'cm', 'converted ' + from + ' to cm');
    case 'inch': {
      notes.push('converted ' + from + ' to cm (× 2.5)');
      const r = (v) => Math.max(0.5, Math.round(v * 2.5 * 2) / 2);
      return { qty: r(qty), qtyMax: qtyMax != null ? r(qtyMax) : null, unit: 'cm' };
    }
    case 'cup': {
      if (LIQUID.test(name) && !/\bbutter\b/i.test(name)) return c(240, 'ml', 'converted ' + from + ' to ml (240 ml a cup)');
      const g = CUP_GRAMS.find(([re]) => re.test(name));
      if (g) return c(g[1], 'g', 'converted ' + from + ' to g (' + g[1] + ' g a cup)');
      return { qty: null, qtyMax: null, unit: null, needsDensity: 'needs a density: ' + from + ' of ' + name + ' (look one up, see docs/extraction.md)' };
    }
    case 'stick':
      if (/\bbutter\b/i.test(name)) return c(113, 'g', 'converted ' + from + ' of butter to g (113 g a US stick)');
      return { qty, qtyMax, unit };
    default:
      return { qty, qtyMax, unit };
  }
}

/**
 * Parses one ingredient line. Returns
 * { source, name, qty?, qtyMax?, unit?, prep?, note?, optional?, conversions: [], warnings: [] }
 * with the amount already in the model's units where a conversion is known.
 * opts.pints: 'uk' (default) or 'us', for pints and fluid ounces.
 */
export function parseLine(source, opts = {}) {
  const conversions = [];
  const warnings = [];
  const notes = [];
  let t = normaliseText(source).replace(/^[-•*]\s*/, '');
  // Book tables put the amount after the name ("Cumin seeds: 2 tsp"): move it to the front.
  const table = !readAmount(t) && t.match(new RegExp('^(.+?):\\s*((?:' + NUM + ')(?:\\s*(?:-|to|x|×)\\s*' + NUM + ')?.*)$', 'i'));
  if (table) t = table[2].trim() + ' ' + table[1].trim();
  let qty = null, qtyMax = null, unit = null;

  const amt = readAmount(t);
  if (amt) {
    ({ qty, qtyMax } = amt);
    t = amt.rest;
    if (amt.size) notes.push(amt.size);
    // Pack sizes: "2 x 400g tins", "2 (14 oz) cans"
    let size = null;
    const sizeMatch = t.match(new RegExp('^(?:x|×)\\s*(' + NUM + ')\\s*([a-z.]+)', 'i')) || t.match(new RegExp('^\\((' + NUM + ')\\s*-?\\s*([a-z. ]+?)\\)', 'i'));
    if (sizeMatch) {
      const su = readUnit(sizeMatch[2].trim());
      if (su) { size = { qty: numValue(sizeMatch[1]), unit: su.unit }; t = t.slice(sizeMatch[0].length).trim(); }
    }
    const u = readUnit(t);
    if (u) { unit = u.unit; t = u.rest; }
    if (unit === 'inch' || unit === 'cm' || unit === 'mm') t = t.replace(/^(?:long\s+)?pieces?\s+(?:of\s+)?/i, '');
    // Dual units: "8 oz / 225g butter" or "225g (8oz) butter": keep the metric one.
    const alt = t.match(new RegExp('^(?:/|\\(|or\\s)\\s*(' + NUM + ')(?:\\s*-\\s*(' + NUM + '))?\\s*([a-z. ]+?)\\s*\\)?(?=\\s|$|,)', 'i'));
    if (alt) {
      const au = readUnit(alt[3].trim());
      if (au) {
        t = t.slice(alt[0].length).trim();
        if (!METRIC.has(unit) && METRIC.has(au.unit)) {
          conversions.push('used the metric amount given instead of ' + formatQty(qty, qtyMax) + ' ' + unit);
          qty = numValue(alt[1]); qtyMax = alt[2] ? numValue(alt[2]) : null; unit = au.unit;
        }
      }
    }
    // "400g can chopped tomatoes": one tin, its size in the note.
    if (!size && METRIC.has(unit) && qtyMax == null) {
      const tin = t.match(/^(?:tins?|cans?|packs?|packets?)\b\s*(?:of\s+)?/i);
      if (tin) { size = { qty, unit }; qty = 1; unit = /^(?:tin|can)/i.test(tin[0]) ? 'tin' : 'pack'; t = t.slice(tin[0].length); }
    }
    // "1 x 3kg leg of lamb": one item of that size, so the size is the amount.
    if (size && unit == null && METRIC.has(size.unit) && !/\b(?:tins?|cans?|packs?|packets?|jars?|bottles?)\b/i.test(t)) {
      qty = qty * size.qty; unit = size.unit; size = null;
    }
    if (size && (unit === 'tin' || unit === 'pack' || unit == null)) {
      let s = size;
      if (!METRIC.has(size.unit)) s = toModelUnit(size.qty, null, size.unit, t, opts, conversions);
      if (unit == null) unit = /\b(?:tins?|cans?)\b/i.test(t) ? 'tin' : 'pack';
      notes.push(formatQty(s.qty) + s.unit);
    }
    t = t.replace(/^of\s+/i, '');
  }

  const optional = OPTIONAL.test(t);
  t = t.replace(/\(optional\)/i, '').replace(/,?\s*\boptional\b/i, '').trim();
  const parens = [];
  t = t.replace(/\(([^)]*)\)/g, (m, inner) => { parens.push(inner.trim()); return ' '; }).replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
  let [name, ...after] = t.split(/,\s*/);
  // "8 boneless, skinless chicken thighs": the first comma only separates descriptors.
  while (after.length && !normaliseName(name.replace(DESCRIPTORS, ' ')).trim()) name = name + ' ' + after.shift();
  // "thumb-sized piece ginger", "a knob of butter": no measurable amount, so keep it as a note.
  const vague = name.match(/^((?:a\s+)?(?:thumb[- ]sized|small|large)?\s*(?:piece|knob|chunk|thumb)s?)\s+(?:of\s+)?/i);
  if (vague && qty == null) { notes.push(vague[1].replace(/^a\s+/i, '').trim()); name = name.slice(vague[0].length); warnings.push('no measurable amount ("' + vague[1].trim() + '"): estimate one (e.g. 5cm, 25g) and say so in notes'); }
  // "3 garlic cloves": the unit comes after the name.
  const after_unit = name.match(/^(.*\S)\s+(cloves?|sprigs?|sticks?|slices?|sheets?)$/i);
  if (after_unit && qty != null && !unit) { unit = singular(after_unit[2].toLowerCase()); name = after_unit[1]; }
  const prep = [];
  // In a tin, "chopped tomatoes" is the product, not preparation.
  const lead = unit === 'tin' ? null : name.match(LEADING_PREP);
  if (lead) { prep.push(lead[1].toLowerCase()); name = name.slice(lead[0].length); }
  const tail = name.match(new RegExp('\\s+' + NO_QTY + '$', 'i'));
  if (tail) { after.unshift(tail[1]); name = name.slice(0, tail.index); }
  for (const a of [...after, ...parens]) {
    if (!a) continue;
    if (PREP_WORDS.test(a)) prep.push(a); else notes.push(a);
  }
  name = name.trim();

  if (unit && (!MODEL_UNITS.includes(unit) || (unit === 'stick' && /\bbutter\b/i.test(name)))) {
    const r = toModelUnit(qty, qtyMax, unit, name, opts, conversions);
    if (r.needsDensity) { warnings.push(r.needsDensity); notes.unshift(formatQty(qty, qtyMax) + ' ' + unit + (qty === 1 && qtyMax == null ? '' : 's')); }
    ({ qty, qtyMax, unit } = r);
  }
  for (let i = conversions.length - 1; i >= 0; i--) if (conversions[i].startsWith('check')) warnings.unshift(...conversions.splice(i, 1));

  if (/\sOR\s|\sor\s+(?:a\s+|an\s+)?\d/.test(name)) warnings.push('"' + name + '" offers alternatives: if they change the method, they may be a choice; otherwise use one item and put the other in note');
  for (const p of parens) if (/^\+/.test(p)) warnings.push('"(' + p + ')" adds another ingredient: give it its own line (in the option it belongs to, if it is only for one)');
  if (/\s(?:and|&)\s/.test(name)) warnings.push('"' + name + '" may be two ingredients: give each its own line');
  if (qty == null && !notes.length && !warnings.length) warnings.push('no quantity: add a note ("to taste") or a qty');
  if (qtyMax != null && qty != null && qtyMax <= qty) { warnings.push('range ' + qty + '-' + qtyMax + ' does not increase'); qtyMax = null; }

  const out = { source: String(source).trim(), name: restoreFractions(name) };
  if (qty != null) out.qty = qty;
  if (qtyMax != null) out.qtyMax = qtyMax;
  if (unit) out.unit = unit;
  if (prep.length) out.prep = restoreFractions(prep.join(', '));
  if (notes.length) out.note = restoreFractions(notes.join(', '));
  if (optional) out.optional = true;
  out.conversions = conversions;
  out.warnings = warnings;
  return out;
}

const DEG = '\\s*(?:°|º|degrees?)?\\s*';
const F_TEMP = '(\\d{2,3})' + DEG + 'F(?:ahrenheit)?\\b';
const C_TEMP = '\\d{2,3}' + DEG + 'C(?:elsius)?\\b(?:\\s*(?:\\(fan\\)|fan))?';

/**
 * °F in step text becomes °C, rounded to the nearest 10 as UK conversion tables do (350°F is
 * 180°C, 400°F is 200°C); where both are given, the °F is dropped.
 */
export function convertTemperatures(text) {
  const changes = [];
  let t = String(text);
  // "180°C (350°F)", "180C/350F", "350°F (180°C)", "350°F/180°C"
  t = t.replace(new RegExp('(' + C_TEMP + ')\\s*(?:/|\\(|,)\\s*' + F_TEMP + '\\s*\\)?', 'gi'), (m, c, f) => { changes.push('dropped ' + f + '°F given next to °C'); return c; });
  t = t.replace(new RegExp(F_TEMP + '\\s*(?:/|\\(|,)\\s*(' + C_TEMP + ')\\s*\\)?', 'gi'), (m, f, c) => { changes.push('dropped ' + f + '°F given next to °C'); return c; });
  for (const m of t.matchAll(/\b(\d{2,3})\s*degrees\b(?!\s*[CF]\b|\s*(?:celsius|fahrenheit))/gi)) changes.push('check: "' + m[0] + '" has no unit (°C or °F?)');
  // Where the step already gives °C, any °F left is a duplicate ("180°C (Gas Mark 4, 350°F)"):
  // drop it rather than convert it, since a converted figure can differ from the source's °C.
  if (new RegExp(C_TEMP, 'i').test(t)) {
    t = t.replace(new RegExp('\\s*(?:,|/)?\\s*' + F_TEMP, 'gi'), (m, f) => { changes.push('dropped ' + f + '°F given next to °C'); return ''; });
  }
  t = t.replace(new RegExp('\\b' + F_TEMP, 'gi'), (m, f) => {
    const c = Math.round(((Number(f) - 32) * 5) / 9 / 10) * 10;
    changes.push('converted ' + f + '°F to ' + c + '°C');
    return c + '°C';
  });
  return { text: t, changes };
}

// ---------- Catalogue matching ----------

const DESCRIPTORS = /\b(?:dry|fresh|large|small|medium|big|ripe|good[- ]quality|good|quality|organic|free[- ]range|extra|whole|raw|hot|cold|warm|boneless|skinless|skin[- ]on|bone[- ]in|thick|thin|heaped|level|generous|about|approx\.?|approximately)\b/gi;

export function singular(w) {
  if (w.length <= 3) return w;
  if (/(?:ss|us|is)$/.test(w)) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (/(?:oes|shes|ches|xes|sses)$/.test(w)) return w.slice(0, -2);
  if (/ves$/.test(w) && !/(?:olives|chives|cloves)$/.test(w)) return w.slice(0, -3) + 'f';
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}

/** Lowercase, no accents or punctuation, each word singular. */
export function normaliseName(s) {
  return String(s).normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
    .replace(/_/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).map(singular).join(' ');
}

const words = (s) => normaliseName(s).split(' ').filter(Boolean);
const namesOf = (id, e) => [id, e.name, e.plural, ...(e.aliases || [])].filter(Boolean);

/** Every name the catalogue knows each entry by (id, name, plural, aliases), normalised. */
export function catalogueIndex(catalogue) {
  const index = new Map();
  for (const [id, e] of Object.entries(catalogue)) {
    if (id.startsWith('$')) continue;
    for (const n of namesOf(id, e)) {
      const k = normaliseName(n);
      if (!index.has(k)) index.set(k, id);
    }
  }
  return index;
}

/**
 * Finds the catalogue entry for a name from a source.
 * Returns { id, how } for a match on the name as written or without words like "large" and
 * "fresh"; otherwise { id: null, candidates: [{ id, score, why? }], suggestedId }.
 */
export function matchItem(name, catalogue, index = catalogueIndex(catalogue)) {
  const n = normaliseName(name);
  if (index.has(n)) return { id: index.get(n), how: 'exact' };
  const stripped = normaliseName(String(name).replace(DESCRIPTORS, ' '));
  if (stripped && index.has(stripped)) return { id: index.get(stripped), how: 'without descriptors' };
  // "feta cheese" is feta.
  const noCheese = stripped.replace(/ cheese$/, '');
  if (noCheese !== stripped && index.has(noCheese)) return { id: index.get(noCheese), how: 'without "cheese"' };
  const candidates = fuzzy(name, catalogue);
  // "unsalted butter" ends with "butter": likely the same thing, but a different product is
  // possible (smoked paprika isn't paprika), so it's a candidate, not a match.
  const ws = stripped.split(' ');
  for (let i = 1; i < ws.length; i++) {
    const tail = ws.slice(i).join(' ');
    if (index.has(tail)) {
      const id = index.get(tail);
      candidates.unshift({ id, score: 0.9, why: 'ends with "' + tail + '"' });
      break;
    }
  }
  const seen = new Set();
  return { id: null, candidates: candidates.filter((c) => !seen.has(c.id) && seen.add(c.id)).slice(0, 3), suggestedId: suggestId(name) };
}

function fuzzy(name, catalogue) {
  const a = new Set(words(String(name).replace(DESCRIPTORS, ' ')));
  const out = [];
  for (const [id, e] of Object.entries(catalogue)) {
    if (id.startsWith('$')) continue;
    let best = 0;
    for (const n of namesOf(id, e)) {
      const b = new Set(words(n));
      const shared = [...a].filter((w) => b.has(w)).length;
      best = Math.max(best, shared / new Set([...a, ...b]).size);
    }
    if (best >= 0.34) out.push({ id, score: Math.round(best * 100) / 100 });
  }
  return out.sort((x, y) => y.score - x.score || x.id.localeCompare(y.id)).slice(0, 3);
}

/** An id for a new catalogue entry: snake_case, singular, without descriptors (parseLine has already split off the preparation). */
export function suggestId(name) {
  return normaliseName(String(name).replace(DESCRIPTORS, ' ')).replace(/ /g, '_');
}

/** Edit distance, for spotting near-duplicate catalogue entries and tags. */
export function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/**
 * Pairs of catalogue entries (ingredients or tags) that look like the same thing: the same once
 * normalised ("Chillies" and "Chilli"), or one letter apart ("Chili" and "Chilli").
 */
export function nearDuplicates(entries) {
  const names = Object.entries(entries).filter(([id]) => !id.startsWith('$')).map(([id, e]) => [id, normaliseName(e.name || id)]);
  const out = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const [ia, a] = names[i], [ib, b] = names[j];
      if (a === b || (Math.min(a.length, b.length) >= 5 && distance(a, b) <= 1)) out.push([ia, ib]);
    }
  }
  return out;
}
