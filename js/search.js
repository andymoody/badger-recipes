// Recipe search and filters for the list view. Search looks at what a recipe is (its title,
// tags and course), not every ingredient in it: "salt cod" shouldn't find everything salted.
import { COURSE_NAMES, COURSE_SINGULAR, tagLabel } from './format.js';

const words = (s) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

function keywords(r) {
  return words([r.title, ...(r.tags || []).map(tagLabel), COURSE_NAMES[r.course] || '', COURSE_SINGULAR[r.course] || ''].join(' '));
}

/** True when every word typed starts a word in the title, tags or course ("medit" finds "mediterranean"). */
export function matches(recipe, query) {
  const typed = words(query || '');
  if (!typed.length) return true;
  const own = keywords(recipe);
  return typed.every((t) => own.some((w) => w.startsWith(t)));
}

/** Listed recipes matching { q, course, tag }, sorted by title. */
export function filterRecipes(data, { q = '', course = null, tag = null } = {}) {
  return Object.values(data.recipes)
    .filter((r) => r.listed !== false)
    .filter((r) => (!course || r.course === course) && (!tag || (r.tags || []).includes(tag)) && matches(r, q))
    .sort((a, b) => a.title.localeCompare(b.title));
}
