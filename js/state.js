// The page's state for a recipe, kept in the URL: #/<id>?serves=6&filling=chorizo&full.paste=0
//   serves=N      servings (recipes with serves)
//   x=N           multiplier (recipes with only a yield)
//   <path>=<id>   the selected option of a choice part, e.g. filling=chorizo
//   full.<path>=1|0  the "make full batch" toggle of a part
// Values equal to the defaults are left out of the URL.

export const MULTIPLIERS = [0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8];

export function readState(recipe, params) {
  const state = { k: 1, serves: recipe.serves || null, x: 1, choices: {}, full: {} };
  for (const [key, value] of params) {
    if (key === 'serves') {
      const n = parseInt(value, 10);
      if (recipe.serves && n >= 1 && n <= 200) { state.serves = n; state.k = n / recipe.serves; }
    } else if (key === 'x') {
      const n = parseFloat(value);
      if (!recipe.serves && n > 0 && n <= 100) { state.x = n; state.k = n; }
    } else if (key.startsWith('full.')) {
      state.full[key.slice(5)] = value === '1';
    } else {
      state.choices[key] = value;
    }
  }
  return state;
}

/** The hash for a recipe with some params changed; a null value removes the param. */
export function hashWith(id, params, changes) {
  const next = new URLSearchParams(params);
  for (const [k, v] of Object.entries(changes)) {
    if (v == null) next.delete(k);
    else next.set(k, String(v));
  }
  const qs = next.toString();
  return '#/' + id + (qs ? '?' + qs : '');
}
