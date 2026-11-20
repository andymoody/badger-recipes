// Recipe search and filters for the list view. Search looks at what a recipe is (its title,
// tags, course and the titles of its choice options, e.g. "Chicken" in a curry that offers
// chicken, seafood or tofu), not every ingredient in it: "salt cod" shouldn't find everything
// salted. Shared parts' titles aren't included, so "rice" doesn't find every curry served with it.
import { COURSE_NAMES, COURSE_SINGULAR, tagLabel } from './format.js';

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
  return words([r.title, ...(r.tags || []).map(tagLabel), COURSE_NAMES[r.course] || '', COURSE_SINGULAR[r.course] || '', ...optionTitles(r, data)].join(' '));
}

/** True when every word typed starts a keyword ("medit" finds "mediterranean"). data resolves options that reference other recipes. */
export function matches(recipe, query, data) {
  const typed = words(query || '');
  if (!typed.length) return true;
  const own = keywords(recipe, data);
  return typed.every((t) => own.some((w) => w.startsWith(t)));
}

/** Listed recipes matching { q, course, tag }, sorted by title. */
export function filterRecipes(data, { q = '', course = null, tag = null } = {}) {
  return Object.values(data.recipes)
    .filter((r) => r.listed !== false)
    .filter((r) => (!course || r.course === course) && (!tag || (r.tags || []).includes(tag)) && matches(r, q, data))
    .sort((a, b) => a.title.localeCompare(b.title));
}
