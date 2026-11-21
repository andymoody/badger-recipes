#!/usr/bin/env node
// Looks up a recipe in the pre-redesign collection (recipes.json at commit 4623299), which is
// only a checklist and a record of possible personal adjustments, never a source.
// Usage: node tools/old-recipe.mjs <words from the title>   (prints matching entries)
//        node tools/old-recipe.mjs --list                  (every id and title, tab-separated)
import { execFileSync } from 'node:child_process';
import { REPO } from './lib/data.mjs';
import { normaliseName, distance } from './lib/lines.mjs';

export const OLD_COMMIT = '4623299';

export function oldRecipes() {
  const raw = JSON.parse(execFileSync('git', ['show', OLD_COMMIT + ':recipes.json'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  return Array.isArray(raw) ? raw : raw.recipes || Object.values(raw);
}

/**
 * Entries where every word of the query matches a word of the title, id or keywords: from its
 * start ("lam" finds lamb), or spelt slightly differently ("youvetsi" finds "Giouvetsi").
 */
export function findOld(list, query) {
  const q = normaliseName(query).split(' ').filter(Boolean);
  const close = (w, x) => x.startsWith(w) || (w.length >= 5 && x.length >= 5 && distance(w, x) <= 2);
  return list.filter((r) => {
    const t = new Set(normaliseName([r.title, r.id, r.keywords].filter(Boolean).join(' ')).split(' '));
    return q.every((w) => [...t].some((x) => close(w, x)));
  });
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const args = process.argv.slice(2);
  const list = oldRecipes();
  if (args[0] === '--list') {
    for (const r of list) console.log(r.id + '\t' + r.title);
  } else if (args.length) {
    const found = findOld(list, args.join(' '));
    if (!found.length) { console.log('No old recipe matches "' + args.join(' ') + '".'); process.exit(1); }
    for (const r of found) console.log(JSON.stringify(r, null, 2) + '\n');
  } else {
    console.error('Usage: node tools/old-recipe.mjs <title words> | --list');
    process.exit(2);
  }
}
