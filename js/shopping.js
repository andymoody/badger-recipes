// The combined shopping list: every ingredient line in the active tree, merged by item.
import { dimension, formatAmount, itemName, shownAmount, toBase } from './quantity.js';
import { walk } from './resolve.js';

/**
 * Lines merge only when their units convert (g with kg, tsp with tbsp); otherwise the amounts are
 * listed together under one item ("1 + 200g"). Returns entries in first-use order:
 * { key, name, amounts: [string], text, staple, optional, ticked }
 */
export function shoppingList(root) {
  const groups = new Map();
  walk(root, (node) => {
    for (const line of node.lines) {
      if (line.heading) continue;
      const key = line.item ? line.item : 'text:' + line.text;
      if (!groups.has(key)) groups.set(key, { key, entry: line.entry, text: line.text, lines: [] });
      groups.get(key).lines.push(line);
    }
  });

  return [...groups.values()].map((g) => {
    if (g.text) return entry(g.key, g.text, [], false, false);
    const dims = new Map();
    for (const l of g.lines) {
      if (l.qty == null) continue;
      const d = dimension(l.unit);
      const acc = dims.get(d) || { lines: [], range: false, round: false };
      acc.lines.push(l);
      acc.range = acc.range || l.qtyMax != null;
      acc.round = acc.round || !!l.scaled;
      dims.set(d, acc);
    }
    const shown = [...dims.values()].map((a) => {
      const units = new Set(a.lines.map((l) => l.unit));
      // A single unit is summed as it is; mixed units (g and kg) are summed in the base unit and tidied.
      const conv = (q, u) => (units.size === 1 ? { qty: q, unit: u } : toBase(q, u));
      let qty = 0, qtyMax = 0, unit;
      for (const l of a.lines) {
        const lo = conv(l.qty, l.unit);
        qty += lo.qty;
        qtyMax += conv(l.qtyMax != null ? l.qtyMax : l.qty, l.unit).qty;
        unit = lo.unit;
      }
      return shownAmount(qty, a.range ? qtyMax : null, unit, a.round || units.size > 1);
    });
    // Plural when the figure shown for things without a unit is more than 1 ("2 Eggs").
    const count = shown.find((s) => !s.unit);
    const name = itemName(g.entry, count ? count.qty : null, count ? count.qtyMax : null, undefined);
    const amounts = shown.map((s) => formatAmount(s.qty, s.qtyMax, s.unit));
    const optional = g.lines.every((l) => l.optional);
    return entry(g.key, name, amounts, !!g.entry.staple, optional);
  });
}

function entry(key, name, amounts, staple, optional) {
  const text = amounts.length === 1 ? amounts[0] + ' ' + name : amounts.length ? name + ' (' + amounts.join(' + ') + ')' : name;
  return { key, name, amounts, text, staple, optional, ticked: !staple && !optional };
}

/** Plain text for pasting into AnyList: one item per line. */
export function anyListText(entries, ticked) {
  return entries.filter((e) => ticked(e)).map((e) => e.text).join('\n');
}
