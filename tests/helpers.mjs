// Shared test helpers. Tests load the real recipe files (not the generated recipes.json),
// so they don't depend on running the build first.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadData() {
  const dir = path.join(ROOT, 'recipes');
  const recipes = {};
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    recipes[r.id] = r;
  }
  const { $schema, ...ingredients } = JSON.parse(fs.readFileSync(path.join(ROOT, 'ingredients.json'), 'utf8'));
  const { $schema: _, ...tags } = JSON.parse(fs.readFileSync(path.join(ROOT, 'tags.json'), 'utf8'));
  return { recipes, ingredients, tags };
}

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
