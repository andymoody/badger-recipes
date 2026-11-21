// Turns a recipe plus the page's state (scaling, choices, full-batch toggles) into a tree of
// resolved nodes: each part with its factor, scaled ingredient lines and filtered steps.
import { convert, exponent, shownAmount, formatAmount, displayAmount, itemName } from './quantity.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;

/** One ingredient line, scaled by factor k using the line's (or the catalogue's) scaling category. */
export function resolveLine(line, k, catalogue) {
  if (line.heading) return { heading: line.heading };
  if (line.text) return { text: line.text };
  const entry = catalogue[line.item] || { name: line.item };
  const scaling = line.scaling || entry.scaling || 'linear';
  const out = {
    item: line.item, entry, unit: line.unit, prep: line.prep, note: line.note,
    optional: !!line.optional, staple: !!entry.staple, scaling,
  };
  if (line.qty == null) return out;
  const e = exponent(scaling);
  const m = Math.pow(k, e);
  out.qty = line.qty * m;
  if (line.qtyMax != null) out.qtyMax = line.qtyMax * m;
  out.scaled = !near(k, 1) && e !== 0;
  if (!near(k, 1) && e !== 1) {
    out.proportional = { qty: line.qty * k, qtyMax: line.qtyMax != null ? line.qtyMax * k : undefined };
  }
  return out;
}

/**
 * What the page shows for an ingredient line: { amount, name, proportional }. proportional is the
 * in-proportion figure, given only when it would display differently from the amount shown
 * (1 tsp salt doubled is 1.87 tsp, which still shows as 2 tsp, so it isn't marked).
 */
export function lineDisplay(l) {
  if (l.qty == null) return { amount: '', name: l.entry.name, proportional: null };
  const s = shownAmount(l.qty, l.qtyMax, l.unit, l.scaled);
  const amount = formatAmount(s.qty, s.qtyMax, s.unit);
  let proportional = null;
  if (l.proportional) {
    const p = displayAmount(l.proportional.qty, l.proportional.qtyMax, l.unit, true);
    if (p !== amount) proportional = p;
  }
  return { amount, name: itemName(l.entry, s.qty, s.qtyMax, s.unit), proportional };
}

/** How many of a part's yield (or servings) the parent needs, before the page's scaling. */
export function partRatio(parent, part, target) {
  if (part.use) {
    const y = target.yield;
    if (!y || typeof y !== 'object') return 1;
    const use = part.use.unit === y.unit ? part.use.qty : convert(part.use.qty, part.use.unit, y.unit);
    return use / y.qty;
  }
  if (parent.serves && target.serves) return parent.serves / target.serves;
  return 1;
}

const optionId = (o) => (typeof o === 'string' ? o : o.id);

/**
 * state: { k: number, choices: { [path]: optionId }, full: { [path]: boolean } }
 * k is the page's scaling of the root recipe (1 = as written).
 */
export function resolve(data, rootId, state = {}) {
  const st = { k: state.k || 1, choices: state.choices || {}, full: state.full || {} };
  const root = data.recipes[rootId];
  if (!root) return null;
  return resolveNode(data, root, { path: '', factor: st.k, sharedId: rootId }, st);
}

function resolveNode(data, recipe, info, st) {
  const node = {
    ...info,
    recipe,
    title: recipe.title,
    lines: (recipe.ingredients || []).map((l) => resolveLine(l, info.factor, data.ingredients)),
    children: [],
    selected: {},
  };
  const byKey = {};
  for (const part of recipe.parts || []) {
    const keyPath = info.path ? info.path + '/' + part.key : part.key;
    let target, sharedId, childPath, choice = null;
    if (part.choose) {
      const ids = part.choose.map(optionId);
      const want = st.choices[keyPath];
      const sel = ids.includes(want) ? want : part.default;
      const opt = part.choose.find((o) => optionId(o) === sel);
      sharedId = typeof opt === 'string' ? opt : null;
      target = sharedId ? data.recipes[sharedId] : opt;
      childPath = keyPath + '/' + sel;
      node.selected[part.key] = sel;
      choice = {
        path: keyPath,
        label: part.label || part.key,
        selected: sel,
        default: part.default,
        options: part.choose.map((o) => ({ id: optionId(o), title: typeof o === 'string' ? (data.recipes[o] || {}).title || o : o.title })),
      };
    } else {
      sharedId = typeof part.recipe === 'string' ? part.recipe : null;
      target = sharedId ? data.recipes[sharedId] : part.recipe;
      childPath = keyPath;
    }
    if (!target) continue;
    const ratio = partRatio(recipe, part, target);
    const needed = info.factor * ratio;
    const batchable = !!sharedId && (!!target.batch || !near(needed, 1));
    const full = batchable && (st.full[childPath] != null ? st.full[childPath] : !!target.batch);
    const child = resolveNode(data, target, {
      path: childPath,
      key: part.key,
      label: part.label,
      sharedId,
      choice,
      factor: full ? 1 : needed,
      needed,
      batchable,
      full,
      use: part.use ? { qty: part.use.qty * info.factor, unit: part.use.unit, scaled: !near(info.factor, 1) } : null,
    }, st);
    node.children.push(child);
    byKey[part.key] = child;
  }

  const embedded = new Set();
  node.steps = [];
  node.used = []; // parts in the order the method embeds them
  for (const s of recipe.steps || []) {
    if (typeof s === 'string') { node.steps.push({ text: s }); continue; }
    if (s.heading) { node.steps.push({ heading: s.heading }); continue; }
    if (s.only && !Object.entries(s.only).every(([key, ids]) => ids.includes(node.selected[key]))) continue;
    const part = s.part ? byKey[s.part] : null;
    if (part) embedded.add(part);
    if (part && !node.used.includes(part)) node.used.push(part);
    if (part && part.choice && !part.sharedId) {
      // An inline choice option switches in and out of the method: its steps take the place of
      // the step that embeds it, rather than sitting in a section of their own.
      part.inline = true;
      if (s.text) node.steps.push({ text: s.text });
      node.steps.push(...part.steps);
      continue;
    }
    node.steps.push({ text: s.text, part });
  }
  // With no steps, the parts are shown one after another.
  node.loose = (recipe.steps || []).length
    ? node.children.filter((c) => !embedded.has(c))
    : [];
  if (!(recipe.steps || []).length) for (const c of node.children) node.steps.push({ part: c });
  return node;
}

/** The heading for a part: "Protein: Chicken" for a choice, else its label or title. */
export function partTitle(node) {
  if (node.choice) return node.choice.label + ': ' + node.title;
  return node.label || node.title;
}

/**
 * The ingredients tab, as groups: { node, title, lines }.
 * - Parts come first, in the order the method uses them (the paste, then the rice), each
 *   followed by its own parts.
 * - The recipe's own ingredients come last, under its title. Choice options used through
 *   conditional steps rather than embedded (the curry's protein) belong to the recipe's own
 *   method, so their lines join the end of this group.
 * - With no parts, there is one group and no title.
 * - Parts with no ingredients (and no full-batch toggle) have no group.
 */
export function ingredientGroups(root) {
  const groups = [];
  const order = [];
  for (const c of root.used) order.push(c);
  for (const c of root.children) if (!order.includes(c) && !root.loose.includes(c)) order.push(c);
  // A part with nothing to show (an option with no ingredients, such as an oven method) gets no
  // group, unless it can be made as a full batch, which has a toggle to show.
  const add = (list) => (n) => { if (n.lines.length || n.batchable) list.push({ node: n, title: partTitle(n), lines: n.lines }); };
  for (const c of order) walk(c, add(groups));
  const own = [...root.lines];
  const after = [];
  for (const c of root.loose) {
    own.push(...c.lines);
    for (const cc of c.children) walk(cc, add(after));
  }
  if (own.length) groups.push({ node: root, title: groups.length ? root.title : null, lines: own });
  return groups.concat(after);
}

/**
 * The recipe's time with the chosen options: an option's own `time` fields replace the recipe's
 * (a sous-vide option's cook time replaces the oven's). Deeper choices win.
 */
export function recipeTime(root) {
  const time = { ...(root.recipe.time || {}) };
  walk(root, (n) => { if (n !== root && n.choice && n.recipe.time) Object.assign(time, n.recipe.time); });
  return Object.keys(time).length ? time : null;
}

/** Notes of options shown inline in the method, which have no section of their own: [{ node, text }]. */
export function inlineNotes(root) {
  const out = [];
  walk(root, (n) => { if (n.inline && n.recipe.notes) out.push({ node: n, text: n.recipe.notes }); });
  return out;
}

/** Every node in the tree, depth first, parents before children. */
export function walk(node, fn) {
  fn(node);
  for (const c of node.children) walk(c, fn);
}

/** All the choices in the active tree, in order (nested choices appear only for the selected option). */
export function choices(root) {
  const out = [];
  walk(root, (n) => { if (n.choice) out.push(n); });
  return out;
}
