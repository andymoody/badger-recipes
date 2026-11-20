// Recipe search and filters for the list view. Search looks at what a recipe is (its title,
// tags, course and the titles of its choice options, e.g. "Chicken" in a curry that offers
// chicken, seafood or tofu), not every ingredient in it: "salt cod" shouldn't find everything
// salted. Shared parts' titles aren't included, so "rice" doesn't find every curry served with it.
import { COURSE_NAMES, COURSE_SINGULAR, tagName } from './format.js';

const words = (s) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Titles of the choice options in a recipe and its inline parts (not inside shared recipes). */
function optionTitles(r, data) {
  const out = [];
  for (const p of r.parts || []) {
    if (p.choose) {
      for (const o of p.choose) {
        if (typeof o === 'string') out.push(((data && data.recipes[o]) || {}).title || '');
        else { out.push(o.title || ''); out.push(...optionTitles(o, data)); }
      }
    } else if (p.recipe && typeof p.recipe === 'object') {
      out.push(...optionTitles(p.recipe, data));
    }
  }
  return out;
}

function keywords(r, data) {
  return words([r.title, ...(r.tags || []).flatMap((t) => [tagName(t, data), t.replace(/_/g, ' ')]), COURSE_NAMES[r.course] || '', COURSE_SINGULAR[r.course] || '', ...optionTitles(r, data)].join(' '));
}

/** True when every word typed starts a keyword ("medit" finds "mediterranean"). data resolves options that reference other recipes. */
export function matches(recipe, query, data) {
  const typed = words(query || '');
  if (!typed.length) return true;
  const own = keywords(recipe, data);
  return typed.every((t) => own.some((w) => w.startsWith(t)));
}

/**
 * True when the recipe has the selected tags: at least one from each group with a selection
 * (Thai or Indian, and Chicken). Tags not in the catalogue count as their own group.
 */
export function hasTags(recipe, selected, data) {
  if (!selected || !selected.length) return true;
  const groupOf = (t) => ((data && data.tags && data.tags[t]) || {}).group || 'tag:' + t;
  const byGroup = {};
  for (const t of selected) (byGroup[groupOf(t)] = byGroup[groupOf(t)] || []).push(t);
  const own = recipe.tags || [];
  return Object.values(byGroup).every((ts) => ts.some((t) => own.includes(t)));
}

/** Listed recipes matching { q, course, tags }, sorted by title. */
export function filterRecipes(data, { q = '', course = null, tags = [] } = {}) {
  return Object.values(data.recipes)
    .filter((r) => r.listed !== false)
    .filter((r) => (!course || r.course === course) && hasTags(r, tags, data) && matches(r, q, data))
    .sort((a, b) => a.title.localeCompare(b.title));
}
