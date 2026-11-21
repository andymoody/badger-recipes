// Shared test helpers. Tests load the real recipe files (not the generated recipes.json),
// so they don't depend on running the build first.
import { loadData as load, REPO } from '../tools/lib/data.mjs';

export const ROOT = REPO;

/** The real collection, or another data folder (such as the site fixtures). */
export const loadData = (root = ROOT) => load(root);

/** A small catalogue for hand-written fixtures. */
export const CATALOGUE = {
  onion: { name: 'Onion', plural: 'Onions' },
  egg: { name: 'Egg', plural: 'Eggs' },
  flour: { name: 'Plain flour' },
  salt: { name: 'Salt', staple: true, scaling: 'seasoning' },
  chilli: { name: 'Red chilli', plural: 'Red chillies', scaling: 'strong_spice' },
  oil: { name: 'Sunflower oil', staple: true },
  stock: { name: 'Chicken stock' },
  rice: { name: 'Basmati rice' },
  water: { name: 'Water', staple: true },
};

export const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
