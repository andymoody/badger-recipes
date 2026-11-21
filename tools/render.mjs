#!/usr/bin/env node
// Prints a recipe as the site shows it, as text. With no options it prints the full review
// report: structure, every variant, scaled, and full-batch toggles flipped.
// Usage: node tools/render.mjs <id> [--root <dir>] [--serves N | --x N] [--choice path=option ...] [--full path=1|0 ...]
import { loadData } from './lib/data.mjs';
import { renderRecipe, reviewReport } from './lib/render.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const all = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const id = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!id) { console.error('Usage: node tools/render.mjs <id> [--root <dir>] [--serves N | --x N] [--choice path=option] [--full path=1|0]'); process.exit(2); }

const data = loadData(opt('--root'));
if (!data.recipes[id]) { console.error('No recipe "' + id + '" in recipes/'); process.exit(1); }
const pairs = (list) => Object.fromEntries(list.map((s) => s.split('=')));
const state = {
  serves: opt('--serves') ? Number(opt('--serves')) : undefined,
  x: opt('--x') ? Number(opt('--x')) : undefined,
  choices: pairs(all('--choice')),
  full: Object.fromEntries(Object.entries(pairs(all('--full'))).map(([k, v]) => [k, v === '1'])),
};
const custom = state.serves || state.x || all('--choice').length || all('--full').length;
console.log(custom ? renderRecipe(data, id, state) : reviewReport(data, id));
