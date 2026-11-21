// Display helpers shared by the views (and tools/render.mjs, which prints recipes as text).
import { displayAmount, formatAmount } from './quantity.js';

export const COURSES = [
  ['main', 'Mains'], ['side', 'Sides'], ['starter', 'Starters'], ['dessert', 'Desserts'], ['baking', 'Baking'],
  ['breakfast', 'Breakfast'], ['sauce', 'Sauces'], ['drink', 'Drinks'], ['snack', 'Snacks'], ['basic', 'Basics'],
];
export const COURSE_NAMES = Object.fromEntries(COURSES);
export const COURSE_SINGULAR = {
  main: 'Main', side: 'Side', starter: 'Starter', dessert: 'Dessert', baking: 'Baking', breakfast: 'Breakfast',
  sauce: 'Sauce', drink: 'Drink', snack: 'Snack', basic: 'Basic',
};

export function minutes(n) {
  if (n >= 1440) {
    const d = Math.floor(n / 1440), hr = Math.round((n % 1440) / 60);
    return d + (d === 1 ? ' day' : ' days') + (hr ? ' ' + hr + ' hr' : '');
  }
  if (n < 60) return n + ' min';
  const hrs = Math.floor(n / 60), m = n % 60;
  return hrs + ' hr' + (m ? ' ' + m + ' min' : '');
}

/** Tag groups in sidebar order (the group of each tag is set in tags.json). */
export const TAG_GROUPS = [
  ['cuisine', 'Cuisine'], ['dish', 'Dish'], ['ingredient', 'Main ingredient'],
  ['occasion', 'Occasion'], ['diet', 'Diet'], ['method', 'Method'],
];

/** A tag's display name from the catalogue ("deep_fry" → "Deep-fried"), or the id with spaces. */
export const tagName = (t, data) => ((data && data.tags && data.tags[t]) || {}).name || t.replace(/_/g, ' ');

/**
 * A yield for display, scaled by factor: text as written, a count rounded to whole numbers
 * ("12 Scotch eggs"), or an amount ("300g").
 */
export function yieldText(y, factor = 1) {
  if (typeof y === 'string') return y;
  if (y.name) return formatAmount(factor === 1 ? y.qty : Math.max(1, Math.round(y.qty * factor))) + ' ' + y.name;
  return displayAmount(y.qty * factor, null, y.unit, factor !== 1);
}

/**
 * The recipe header's facts: ["Main", "Serves 4", "Makes 300g", "Prep 20 min", "Cook 1 hr"].
 * time defaults to the recipe's own; pass recipeTime(root) for the chosen options' times.
 * k is the page's scaling: servings and yield follow it together ("Serves 12 · Makes 12 Scotch eggs").
 */
export function metaParts(r, time = r.time, k = 1) {
  const t = time || {};
  return [
    COURSE_SINGULAR[r.course],
    r.serves && 'Serves ' + formatAmount(Math.round(r.serves * k * 100) / 100),
    r.yield && 'Makes ' + yieldText(r.yield, k),
    t.prep && 'Prep ' + minutes(t.prep),
    t.marinate && 'Marinate ' + minutes(t.marinate),
    t.cook && 'Cook ' + minutes(t.cook),
    t.rest && 'Rest ' + minutes(t.rest),
    t.total && 'Total ' + minutes(t.total),
  ].filter(Boolean);
}

/**
 * How much of a part the cook needs, for parts that can be made as a full batch:
 * "Recipe makes 1 l; you need 500ml." or "Recipe serves 4; you need enough for 6."
 */
export function partNeed(node) {
  if (!node.batchable) return null;
  const r = node.recipe;
  if (node.use) return 'Recipe makes ' + yieldText(r.yield, 1) + '; you need ' + displayAmount(node.use.qty, null, node.use.unit, !!node.use.scaled) + '.';
  if (r.serves) return 'Recipe serves ' + r.serves + '; you need enough for ' + formatAmount(r.serves * node.needed) + '.';
  return null;
}
