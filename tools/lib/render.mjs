// Prints a recipe as the cook would see it on the site, as plain text, for every variant: each
// combination of choices, a scaled version and the full-batch toggles flipped. The reviewer
// compares this with the source. It uses the site's own code (js/), so what's printed is what
// the page shows.
import { resolve, choices, lineDisplay, partTitle, ingredientGroups, recipeTime, inlineNotes } from '../../js/resolve.js';
import { shoppingList } from '../../js/shopping.js';
import { metaParts, partNeed, tagName } from '../../js/format.js';
import { formatAmount } from '../../js/quantity.js';

/**
 * Every combination of choices, nested ones included (a nested choice only exists when its
 * parent option is picked). Each is { choices: { path: option }, label }, defaults first.
 */
export function variants(data, id) {
  const out = [];
  const go = (fixed) => {
    const root = resolve(data, id, { choices: fixed });
    const open = choices(root).find((n) => !(n.choice.path in fixed));
    if (!open) {
      const label = choices(root).map((n) => n.choice.path + '=' + n.choice.selected).join(', ');
      out.push({ choices: fixed, label: label || '(no choices)' });
      return;
    }
    const c = open.choice;
    const ids = [c.default, ...c.options.map((o) => o.id).filter((o) => o !== c.default)];
    for (const o of ids) go({ ...fixed, [c.path]: o });
  };
  go({});
  return out;
}

const pad = (depth) => '  '.repeat(depth);

/** One ingredient line as the page shows it. */
export function lineText(l) {
  if (l.heading) return '[' + l.heading + ']';
  if (l.text) return l.text + '  (free text)';
  const { amount, name, proportional } = lineDisplay(l);
  return (amount ? amount + ' ' : '') + name + (l.prep ? ', ' + l.prep : '') + (l.note ? ' (' + l.note + ')' : '') +
    (l.optional ? '  [optional]' : '') + (proportional ? '  ≈ in proportion: ' + proportional : '');
}

function sourceText(s) {
  if (!s) return 'Source: (none)';
  const a = s.adapted ? ' (adapted)' : '';
  if (s.type === 'web') return 'Source: ' + (s.title ? s.title + ', ' : '') + s.url + a;
  if (s.type === 'book') return 'Source: ' + s.title + (s.author ? ' by ' + s.author : '') + (s.page ? ', p. ' + s.page : '') + a;
  if (s.type === 'file') return 'Source: ' + s.name + (s.drive ? ' (' + s.drive + ')' : '') + a;
  return 'Source: our own recipe' + a;
}

function method(node, depth, out, counter = { n: 0 }) {
  for (const s of node.steps) {
    if (s.heading) { out.push(pad(depth) + '[' + s.heading + ']'); continue; }
    counter.n += 1;
    const text = s.text || (s.part ? '' : '');
    if (text) out.push(pad(depth) + counter.n + '. ' + text);
    else out.push(pad(depth) + counter.n + '.');
    if (s.part) {
      const p = s.part;
      out.push(pad(depth + 1) + '▸ ' + partTitle(p) + (p.sharedId ? '  (recipe: ' + p.sharedId + ')' : '') + (p.full ? '  [full batch]' : ''));
      method(p, depth + 2, out, { n: 0 });
    }
  }
}

/**
 * The page for one state as text. state: { serves?, x?, choices?, full? }, as on the page
 * (serves for recipes with servings, x for yield-only ones).
 */
export function renderRecipe(data, id, state = {}, { sections = ['header', 'ingredients', 'method', 'notes', 'shopping'] } = {}) {
  const r = data.recipes[id];
  if (!r) throw new Error('No recipe "' + id + '"');
  const k = state.serves && r.serves ? state.serves / r.serves : state.x || 1;
  const root = resolve(data, id, { k, choices: state.choices || {}, full: state.full || {} });
  const out = [];
  const has = (s) => sections.includes(s);

  if (has('header')) {
    out.push('# ' + r.title);
    out.push(metaParts(r, recipeTime(root), k).join(' · '));
    if (r.tags && r.tags.length) out.push('Tags: ' + r.tags.map((t) => tagName(t, data)).join(', '));
    out.push(sourceText(r.source));
    if (r.image) out.push('Image: ' + r.image);
  }
  const cs = choices(root);
  if (cs.length) out.push('Options: ' + cs.map((n) => n.choice.label + ' = ' + n.choice.options.find((o) => o.id === n.choice.selected).title + (n.choice.selected === n.choice.default ? ' (default)' : '')).join('; '));
  if (Math.abs(k - 1) > 1e-9) {
    out.push('Scaled: ' + (r.serves ? 'serves ' + formatAmount(r.serves * k) + ' (from ' + r.serves + ')' : '× ' + formatAmount(k)));
    out.push('Reminder shown: cooking times, pan sizes and raising agents may need adjusting.');
  }

  if (has('ingredients')) {
    out.push('', '## Ingredients');
    for (const g of ingredientGroups(root)) {
      if (g.title) out.push('### ' + g.title);
      if (g.node !== root) {
        const need = partNeed(g.node);
        if (need) out.push(need + ' Make full batch: ' + (g.node.full ? 'on' : 'off') + '.');
      }
      for (const l of g.lines) out.push('- ' + lineText(l));
    }
  }
  if (has('method')) {
    out.push('', '## Method');
    method(root, 0, out);
  }
  if (has('notes')) {
    const notes = [];
    if (r.notes) notes.push(r.notes);
    for (const c of root.loose) if (c.recipe.notes) notes.push(partTitle(c) + ': ' + c.recipe.notes);
    for (const { node, text } of inlineNotes(root)) notes.push(partTitle(node) + ': ' + text);
    if (notes.length) out.push('', '## Notes', ...notes);
  }
  if (has('shopping')) {
    out.push('', '## Shopping list (copied to AnyList when ticked)');
    for (const e of shoppingList(root)) out.push((e.ticked ? '[x] ' : '[ ] ') + e.text + (e.staple ? '  (staple)' : e.optional ? '  (optional)' : ''));
  }
  return out.join('\n');
}

/** The recipe's structure: parts, choices, how much of each part is used, conditional steps. */
export function structure(data, id) {
  const out = [];
  const visit = (r, depth, label) => {
    const facts = [r.serves && 'serves ' + r.serves, r.yield && 'yield ' + (typeof r.yield === 'string' ? '"' + r.yield + '"' : r.yield.qty + ' ' + r.yield.unit), r.batch && 'batch', r.listed === false && 'unlisted'].filter(Boolean);
    out.push(pad(depth) + label + (facts.length ? ' (' + facts.join(', ') + ')' : ''));
    const steps = r.steps || [];
    for (const p of r.parts || []) {
      const by = steps.map((s, i) => (s && s.part === p.key ? 'step ' + (i + 1) : null)).filter(Boolean);
      const only = steps.map((s, i) => (s && s.only && s.only[p.key] ? 'step ' + (i + 1) + ' only ' + s.only[p.key].join('/') : null)).filter(Boolean);
      const how = [by.length ? 'embedded at ' + by.join(', ') : null, only.length ? only.join('; ') : null, !steps.length ? 'shown in turn (parent has no steps)' : null].filter(Boolean).join('; ');
      const use = p.use ? ', use ' + p.use.qty + ' ' + p.use.unit : '';
      if (p.choose) {
        out.push(pad(depth + 1) + p.key + ': choice' + (p.label ? ' "' + p.label + '"' : '') + ', default ' + p.default + use + (how ? ' — ' + how : ''));
        for (const o of p.choose) {
          if (typeof o === 'string') visit(data.recipes[o] || { title: '(missing ' + o + ')' }, depth + 2, o + ' → shared recipe ' + o);
          else visit(o, depth + 2, o.id + ' (inline' + (o.ingredients && o.ingredients.length ? '' : ', no ingredients') + (o.steps && o.steps.length ? '' : ', no steps') + ')' + ' "' + o.title + '"');
        }
      } else if (typeof p.recipe === 'string') {
        visit(data.recipes[p.recipe] || { title: '(missing)' }, depth + 1, p.key + ' → shared recipe ' + p.recipe + use + (how ? ' — ' + how : ''));
      } else {
        visit(p.recipe, depth + 1, p.key + ' (inline) "' + p.recipe.title + '"' + use + (how ? ' — ' + how : ''));
      }
    }
    steps.forEach((s, i) => {
      if (s && s.only && !(r.parts || []).some((p) => s.only[p.key])) out.push(pad(depth + 1) + 'step ' + (i + 1) + ' only ' + JSON.stringify(s.only));
    });
  };
  visit(data.recipes[id], 0, id);
  return out.join('\n');
}

/** Every batchable part in the default variant, by path, with its default full-batch setting. */
function batchables(data, id, choicesState) {
  const root = resolve(data, id, { choices: choicesState });
  const out = [];
  const walk = (n) => { if (n.batchable) out.push({ path: n.path, full: n.full, title: partTitle(n) }); n.children.forEach(walk); };
  walk(root);
  return out;
}

/**
 * The whole review document: structure, every variant in full, the default scaled (servings
 * doubled, or × 2), and each full-batch toggle flipped. Warns when the variants multiply.
 */
export function reviewReport(data, id, { maxVariants = 12 } = {}) {
  const r = data.recipes[id];
  const vs = variants(data, id);
  const out = ['RECIPE REVIEW: ' + id, '', '== Structure ==', structure(data, id), ''];
  out.push('Variants: ' + vs.length + (vs.length > maxVariants ? '  WARNING: more than ' + maxVariants + ' combinations; separate recipes may be clearer (docs/extraction.md)' : ''));
  vs.forEach((v, i) => out.push('  ' + (i + 1) + '. ' + v.label + (i === 0 ? '  (default)' : '')));
  vs.forEach((v, i) => {
    out.push('', '== Variant ' + (i + 1) + ' of ' + vs.length + ': ' + v.label + ' ==', renderRecipe(data, id, { choices: v.choices }));
  });
  const scaled = r.serves ? { serves: r.serves * 2 } : { x: 2 };
  out.push('', '== Scaled (default choices, ' + (r.serves ? 'serves ' + r.serves * 2 : '× 2') + '): ingredients and shopping list ==',
    renderRecipe(data, id, scaled, { sections: ['ingredients', 'shopping'] }));
  for (const b of batchables(data, id, {})) {
    out.push('', '== Full batch ' + (b.full ? 'off' : 'on') + ' for ' + b.title + ' (' + b.path + '), default choices ==',
      renderRecipe(data, id, { full: { [b.path]: !b.full } }, { sections: ['ingredients', 'shopping'] }));
  }
  return out.join('\n');
}
