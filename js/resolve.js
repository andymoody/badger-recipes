// Turns a recipe plus the page's state (scaling, choices, full-batch toggles) into a tree of
// resolved nodes: each part with its factor, scaled ingredient lines and filtered steps.
import { convert, exponent } from './quantity.js';

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
      use: part.use ? { qty: part.use.qty * info.factor, unit: part.use.unit } : null,
    }, st);
    node.children.push(child);
    byKey[part.key] = child;
  }

  const embedded = new Set();
  node.steps = [];
  for (const s of recipe.steps || []) {
    if (typeof s === 'string') { node.steps.push({ text: s }); continue; }
    if (s.heading) { node.steps.push({ heading: s.heading }); continue; }
    if (s.only && !Object.entries(s.only).every(([key, ids]) => ids.includes(node.selected[key]))) continue;
    const part = s.part ? byKey[s.part] : null;
    if (part) embedded.add(part);
    node.steps.push({ text: s.text, part });
  }
  // With no steps, the parts are shown one after another.
  node.loose = (recipe.steps || []).length
    ? node.children.filter((c) => !embedded.has(c))
    : [];
  if (!(recipe.steps || []).length) for (const c of node.children) node.steps.push({ part: c });
  return node;
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
