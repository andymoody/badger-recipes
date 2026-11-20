// Amounts: scaling, unit choice, rounding and display. Pure functions, no DOM.

export const EXPONENTS = { linear: 1, seasoning: 0.9, strong_spice: 0.8, leavening: 0.95, fixed: 0 };

// Units that convert into each other share a dimension; size is in the dimension's base unit.
const DIMENSIONS = {
  g: ['mass', 1], kg: ['mass', 1000],
  ml: ['volume', 1], l: ['volume', 1000],
  tsp: ['spoon', 1], tbsp: ['spoon', 3],
};
const BASE = { mass: 'g', volume: 'ml', spoon: 'tsp' };
const PLURAL_UNITS = { clove: 'cloves', tin: 'tins', pack: 'packs', pinch: 'pinches', handful: 'handfuls', sprig: 'sprigs', bunch: 'bunches', slice: 'slices', stick: 'sticks', sheet: 'sheets' };
const TIGHT_UNITS = new Set(['g', 'kg', 'ml', 'l', 'cm']); // written "200g", not "200 g"
const DECIMAL_UNITS = new Set(['g', 'kg', 'ml', 'l']); // shown as decimals, not fractions

/** The dimension a unit belongs to, or the unit itself (or '' for none) when it doesn't convert. */
export function dimension(unit) {
  return unit && DIMENSIONS[unit] ? DIMENSIONS[unit][0] : 'unit:' + (unit || '');
}

/** Converts to the dimension's base unit: { qty, unit }. Units that don't convert are returned as they are. */
export function toBase(qty, unit) {
  const d = unit && DIMENSIONS[unit];
  return d ? { qty: qty * d[1], unit: BASE[d[0]] } : { qty, unit };
}

export function convert(qty, from, to) {
  return (qty * DIMENSIONS[from][1]) / DIMENSIONS[to][1];
}

export function exponent(scaling) {
  return EXPONENTS[scaling || 'linear'];
}

/** A scaled amount: the original × k^e. */
export function scaleQty(qty, k, scaling) {
  return qty * Math.pow(k, exponent(scaling));
}

const near = (a, b) => Math.abs(a - b) < 1e-6;
const roundTo = (q, step) => Math.round(q / step) * step;

/** Picks a tidy unit: 1000g as 1kg, 0.5 tbsp as 1½ tsp, 3 tsp as 1 tbsp. */
export function tidyUnit(qty, unit) {
  if (unit === 'g' && qty >= 1000) return { qty: qty / 1000, unit: 'kg' };
  if (unit === 'ml' && qty >= 1000) return { qty: qty / 1000, unit: 'l' };
  if (unit === 'kg' && qty < 1) return { qty: qty * 1000, unit: 'g' };
  if (unit === 'l' && qty < 1) return { qty: qty * 1000, unit: 'ml' };
  if (unit === 'tbsp' && qty < 1) return tidyUnit(qty * 3, 'tsp');
  // Less than ⅛ tsp (the smallest spoon measure) is a pinch.
  if (unit === 'tsp' && qty < 1 / 8 - 1e-9) return { qty: 1, unit: 'pinch' };
  // Only switch to tbsp when it comes out in halves (4½ tsp is 1½ tbsp; 4 tsp stays as it is).
  if (unit === 'tsp' && qty >= 3 && near(roundTo(qty / 3, 0.5), qty / 3)) return { qty: qty / 3, unit: 'tbsp' };
  return { qty, unit };
}

// Below 1, amounts round to the closest of these fractions. Spoons use the measures in a
// spoon set plus thirds, which are easy to judge by eye (⅛ tsp is the smallest; less than
// that becomes a pinch, see tidyUnit). Counted things use common fractions, never less than ¼
// (⅓ of an onion, ¼ of a cabbage).
const SPOON_FRACTIONS = [1 / 8, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1];
const COUNT_FRACTIONS = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1];
const closest = (q, options) => options.reduce((best, f) => (Math.abs(f - q) < Math.abs(best - q) ? f : best));

/**
 * Rounds a scaled amount to something you can measure: whole numbers for counted things (eggs,
 * cloves) and the closest common fraction below 1; the nearest ¼ for tsp and tbsp, and the
 * closest spoon measure below 1 tsp; whole g and ml up to 100 and the nearest 5 above.
 */
export function roundQty(qty, unit) {
  if (qty <= 0) return 0;
  switch (unit) {
    case undefined: case null: case '':
    case 'clove': case 'slice': case 'sheet': case 'sprig': case 'stick':
      return qty < 1 ? closest(qty, COUNT_FRACTIONS) : Math.round(qty);
    case 'tsp':
      return qty < 1 ? closest(qty, SPOON_FRACTIONS) : roundTo(qty, 0.25);
    case 'tbsp':
      return Math.max(0.25, roundTo(qty, 0.25));
    case 'g': case 'ml':
      return qty > 100 ? roundTo(qty, 5) : qty >= 10 ? Math.round(qty) : Math.max(0.5, roundTo(qty, 0.5));
    case 'kg': case 'l':
      return Math.round(qty * 100) / 100;
    default: // cm, tin, pack, pinch, handful, bunch
      return Math.max(0.5, roundTo(qty, 0.5));
  }
}

/** Tidies the unit, then rounds. */
export function tidy(qty, unit, round = true) {
  const t = tidyUnit(qty, unit);
  return round ? { qty: roundQty(t.qty, t.unit), unit: t.unit } : t;
}

const FRACTIONS = [[0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']];

/** 1.5 → "1½", 0.333 → "⅓"; g/ml/kg/l (and anything that isn't a common fraction) as decimals. */
export function formatNumber(n, unit) {
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  if (frac < 0.02) return String(whole);
  if (frac > 0.98) return String(whole + 1);
  if (!DECIMAL_UNITS.has(unit)) {
    for (const [v, glyph] of FRACTIONS) if (Math.abs(frac - v) < 0.02) return (whole || '') + glyph;
  }
  return String(Math.round(n * 100) / 100);
}

export function formatUnit(unit, qty) {
  if (!unit) return '';
  return qty > 1 && PLURAL_UNITS[unit] ? PLURAL_UNITS[unit] : unit;
}

/** "200g", "1–2", "3 cloves", "1½ tsp". */
export function formatAmount(qty, qtyMax, unit) {
  if (qty == null) return '';
  let n = formatNumber(qty, unit);
  if (qtyMax != null && formatNumber(qtyMax, unit) !== n) n += '–' + formatNumber(qtyMax, unit);
  const top = qtyMax != null ? qtyMax : qty;
  if (!unit) return n;
  return n + (TIGHT_UNITS.has(unit) ? '' : ' ') + formatUnit(unit, top);
}

/**
 * Display text for an amount. When round is set (the amount was scaled), the unit is tidied and
 * the figure rounded; otherwise it's shown as written. A range keeps one unit, chosen from its top.
 */
export function displayAmount(qty, qtyMax, unit, round) {
  if (qty == null) return '';
  const s = shownAmount(qty, qtyMax, unit, round);
  return formatAmount(s.qty, s.qtyMax, s.unit);
}

/** The figures displayAmount shows: { qty, qtyMax, unit } after tidying and rounding. */
export function shownAmount(qty, qtyMax, unit, round) {
  if (!round) return { qty, qtyMax: qtyMax != null ? qtyMax : null, unit };
  const top = qtyMax != null ? qtyMax : qty;
  const t = tidyUnit(top, unit);
  const ratio = top ? t.qty / top : 1;
  const lo = roundQty(qty * ratio, t.unit);
  const hi = qtyMax != null ? roundQty(qtyMax * ratio, t.unit) : null;
  return { qty: lo, qtyMax: hi != null && hi > lo ? hi : null, unit: t.unit };
}

/** The catalogue name, plural when there's more than one of a thing without a unit. */
export function itemName(entry, qty, qtyMax, unit) {
  if (!entry) return '';
  const top = qtyMax != null ? qtyMax : qty;
  return !unit && top != null && top > 1 && entry.plural ? entry.plural : entry.name;
}
