// Loads the recipe data straight from the files (recipes/*.json, ingredients.json, tags.json),
// in the shape the site gets from recipes.json. Used by the tools and the tests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const strip = ({ $schema, ...rest }) => rest;

export function loadData(root = REPO) {
  const dir = path.join(root, 'recipes');
  const recipes = {};
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    recipes[r.id] = r;
  }
  const read = (f) => (fs.existsSync(path.join(root, f)) ? strip(JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'))) : {});
  return { recipes, ingredients: read('ingredients.json'), tags: read('tags.json') };
}
