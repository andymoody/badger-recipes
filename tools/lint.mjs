#!/usr/bin/env node
// Extraction checks beyond the build: imperial units, American words, free-text lines,
// ingredients the method never mentions, missing images, near-duplicate catalogue entries.
// Usage: node tools/lint.mjs [id ...] [--root <dir>]   (no ids: every recipe)
// Exits 1 if there are warnings, so "warn" findings must be fixed or explained.
import fs from 'node:fs';
import path from 'node:path';
import { loadData, REPO } from './lib/data.mjs';
import { lintRecipe, lintCatalogues } from './lib/lint.mjs';

const args = process.argv.slice(2);
const at = args.indexOf('--root');
const root = at >= 0 ? path.resolve(args[at + 1]) : REPO;
const ids = args.filter((a, i) => !a.startsWith('--') && !(at >= 0 && i === at + 1));
const data = loadData(root);
for (const id of ids) if (!data.recipes[id]) { console.error('No recipe "' + id + '"'); process.exit(2); }

const findings = [...lintCatalogues(data)];
for (const id of ids.length ? ids : Object.keys(data.recipes)) {
  findings.push(...lintRecipe(data.recipes[id], data, { exists: (p) => fs.existsSync(path.join(root, p)) }));
}
for (const f of findings) console.log((f.level === 'warn' ? 'WARN  ' : 'check ') + f.where + ': ' + f.message);
const warns = findings.filter((f) => f.level === 'warn').length;
console.log(findings.length ? warns + ' warnings, ' + (findings.length - warns) + ' checks' : 'No findings.');
process.exit(warns ? 1 : 0);
