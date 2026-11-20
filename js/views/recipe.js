import { h } from '../dom.js';
import { COURSE_SINGULAR, minutes, tagLabel } from '../format.js';
import { displayAmount, formatAmount } from '../quantity.js';
import { resolve, choices, lineDisplay, partTitle, ingredientGroups } from '../resolve.js';
import { shoppingList, anyListText } from '../shopping.js';
import { readState, hashWith, MULTIPLIERS } from '../state.js';

// UI state that isn't worth putting in the URL; reset when the recipe changes.
let ui = { id: null };

export function renderRecipe(app, id, params) {
  if (ui.id !== id) ui = { id, tab: 'ingredients', open: new Set(), ticks: new Map() };
  const data = app.data;
  const recipe = data.recipes[id];
  const state = readState(recipe, params);
  const root = resolve(data, id, state);

  const set = (changes) => {
    history.replaceState(null, '', hashWith(id, params, changes));
    const scroll = [app.main.scrollTop, window.scrollY];
    renderRecipe(app, id, new URLSearchParams(location.hash.split('?')[1] || ''));
    app.main.scrollTop = scroll[0];
    window.scrollTo(0, scroll[1]);
  };

  app.main.replaceChildren(h('article', { class: 'recipe' },
    header(recipe, app),
    controls(recipe, state, set),
    optionsPanel(root, set),
    ingredientsAndShopping(root, set),
    method(root, set),
    notes(root)));
}

// ---------- Header ----------

function header(r, app) {
  const t = r.time || {};
  const meta = [
    COURSE_SINGULAR[r.course],
    r.serves && 'Serves ' + r.serves,
    r.yield && 'Makes ' + yieldText(r.yield, 1),
    t.prep && 'Prep ' + minutes(t.prep),
    t.cook && 'Cook ' + minutes(t.cook),
    t.rest && 'Rest ' + minutes(t.rest),
    t.total && 'Total ' + minutes(t.total),
  ].filter(Boolean);
  return h('header', { class: 'recipe-header' },
    h('a', { class: 'back', href: '#/' }, '← All recipes'),
    r.image ? h('img', { class: 'hero', src: r.image, alt: r.title }) : null,
    h('h1', null, r.title),
    h('p', { class: 'meta' }, meta.join(' · ')),
    r.tags && r.tags.length ? h('div', { class: 'tags' }, r.tags.map((t) =>
      h('button', { class: 'tag', onclick: () => { app.filter = { q: '', course: null, tag: t }; app.go('#/'); } }, tagLabel(t)))) : null,
    source(r.source));
}

function source(s) {
  if (!s) return null;
  const adapted = s.adapted ? ' (adapted)' : '';
  if (s.type === 'web') {
    let label = s.title;
    if (!label) try { label = new URL(s.url).hostname.replace(/^www\./, ''); } catch { label = s.url; }
    return h('p', { class: 'source' }, 'Source: ', h('a', { href: s.url, target: '_blank', rel: 'noopener' }, label), adapted);
  }
  if (s.type === 'book') return h('p', { class: 'source' }, 'From ', h('cite', null, s.title), s.author ? ' by ' + s.author : '', s.page ? ', p. ' + s.page : '', adapted);
  if (s.type === 'file') return h('p', { class: 'source' }, 'Source: ', s.drive ? h('a', { href: s.drive, target: '_blank', rel: 'noopener' }, s.name) : s.name, adapted);
  return h('p', { class: 'source' }, 'Our own recipe');
}

function yieldText(y, factor) {
  if (typeof y === 'string') return y;
  return displayAmount(y.qty * factor, null, y.unit, factor !== 1);
}

// ---------- Scaling ----------

function controls(r, state, set) {
  let stepper;
  if (r.serves) {
    const n = state.serves;
    const to = (v) => set({ serves: v === r.serves ? null : v });
    stepper = h('div', { class: 'stepper' },
      h('span', { class: 'stepper-label', id: 'serves-label' }, 'Serves'),
      h('button', { class: 'step-btn', 'aria-label': 'Fewer servings', disabled: n <= 1, onclick: () => to(n - 1) }, '−'),
      h('output', { 'aria-labelledby': 'serves-label', 'aria-live': 'polite' }, n),
      h('button', { class: 'step-btn', 'aria-label': 'More servings', onclick: () => to(n + 1) }, '+'));
  } else {
    const less = MULTIPLIERS.filter((m) => m < state.x - 1e-9).pop();
    const more = MULTIPLIERS.find((m) => m > state.x + 1e-9);
    const to = (v) => set({ x: v === 1 ? null : v });
    stepper = h('div', { class: 'stepper' },
      h('span', { class: 'stepper-label', id: 'x-label' }, 'Quantity'),
      h('button', { class: 'step-btn', 'aria-label': 'Make less', disabled: less == null, onclick: () => to(less) }, '−'),
      h('output', { 'aria-labelledby': 'x-label', 'aria-live': 'polite' }, '× ' + formatAmount(state.x)),
      h('button', { class: 'step-btn', 'aria-label': 'Make more', disabled: more == null, onclick: () => to(more) }, '+'));
  }
  const scaled = Math.abs(state.k - 1) > 1e-9;
  return h('section', { class: 'controls' },
    stepper,
    scaled ? h('button', { class: 'link', onclick: () => set({ serves: null, x: null }) }, 'Reset') : null,
    scaled ? h('p', { class: 'reminder' }, 'Scaled from the original. Cooking times, pan sizes and raising agents may need adjusting, and amounts marked ≈ aren’t scaled in proportion.') : null);
}

// ---------- Choices ----------

function optionsPanel(root, set) {
  const list = choices(root);
  if (!list.length) return null;
  return h('section', { class: 'options' }, list.map((node) => {
    const c = node.choice;
    return h('fieldset', { class: 'choice' },
      h('legend', null, c.label),
      c.options.map((o) => h('label', { class: 'radio' },
        h('input', {
          type: 'radio', name: 'choice-' + c.path, value: o.id, checked: o.id === c.selected,
          onchange: () => set({ [c.path]: o.id === c.default ? null : o.id }),
        }),
        h('span', null, o.title))));
  }));
}

// ---------- Ingredients ----------

/** "Recipe makes 12 tbsp; you need 4 tbsp", the full-batch toggle and a link to the part's page. */
function partInfo(node, set) {
  const r = node.recipe;
  const bits = [];
  if (node.batchable) {
    if (node.use) {
      bits.push(h('p', { class: 'part-need' }, 'Recipe makes ' + yieldText(r.yield, 1) + '; you need ' + displayAmount(node.use.qty, null, node.use.unit, false) + '.'));
    } else if (r.serves) {
      bits.push(h('p', { class: 'part-need' }, 'Recipe serves ' + r.serves + '; you need enough for ' + formatAmount(r.serves * node.needed) + '.'));
    }
    bits.push(h('label', { class: 'toggle' },
      h('input', { type: 'checkbox', checked: node.full, onchange: (e) => set({ ['full.' + node.path]: e.target.checked === !!r.batch ? null : e.target.checked ? 1 : 0 }) }),
      h('span', null, 'Make full batch')));
  }
  if (node.sharedId && r.listed !== false) bits.push(h('a', { class: 'part-link', href: '#/' + node.sharedId }, 'Open ' + r.title + ' →'));
  return bits.length ? h('div', { class: 'part-info' }, bits) : null;
}

function lineItem(l) {
  if (l.heading) return h('li', { class: 'line-heading' }, l.heading);
  if (l.text) return h('li', { class: 'line' }, l.text);
  const { amount, name, proportional } = lineDisplay(l);
  return h('li', { class: 'line' },
    amount ? h('span', { class: 'amount' }, amount) : null,
    proportional ? h('button', {
      class: 'np', 'aria-label': 'Not scaled in proportion: show the proportional amount', 'aria-expanded': 'false',
      onclick: (e) => { const li = e.currentTarget.closest('li'); const on = li.classList.toggle('show-np'); e.currentTarget.setAttribute('aria-expanded', String(on)); },
    }, '≈') : null,
    ' ',
    h('span', { class: 'item' }, name),
    l.prep ? ', ' + l.prep : '',
    l.note ? h('span', { class: 'note' }, ' (' + l.note + ')') : null,
    l.optional ? h('span', { class: 'badge' }, 'optional') : null,
    proportional ? h('span', { class: 'np-detail' }, 'In proportion: ' + proportional) : null);
}

const linesList = (lines) => (lines.length ? h('ul', { class: 'lines' }, lines.map(lineItem)) : null);

function ingredientsAndShopping(root, set) {
  const groups = ingredientGroups(root).map((g) => h('div', { class: 'group' },
    g.title ? h('h3', null, g.title) : null,
    g.node !== root ? partInfo(g.node, set) : null,
    linesList(g.lines)));

  const entries = shoppingList(root);
  const ticked = (e) => (ui.ticks.has(e.key) ? ui.ticks.get(e.key) : e.ticked);
  const status = h('span', { class: 'copy-status', role: 'status' });
  const countLabel = () => entries.filter(ticked).length;
  const copyBtn = h('button', { class: 'primary', onclick: () => copy(anyListText(entries, ticked), status) }, 'Copy ' + countLabel() + ' for AnyList');
  const shopping = h('div', null,
    h('p', { class: 'muted' }, 'Untick what you already have. Staples and optional items start unticked.'),
    h('ul', { class: 'shopping' }, entries.map((e) => h('li', null,
      h('label', null,
        h('input', { type: 'checkbox', checked: ticked(e), onchange: (ev) => { ui.ticks.set(e.key, ev.target.checked); copyBtn.textContent = 'Copy ' + countLabel() + ' for AnyList'; } }),
        h('span', { class: 'shop-text' }, e.amounts.length === 1 ? h('span', { class: 'amount' }, e.amounts[0]) : null, e.amounts.length === 1 ? ' ' : '', e.name,
          e.amounts.length > 1 ? h('span', { class: 'amount' }, ': ' + e.amounts.join(' + ')) : null),
        e.staple ? h('span', { class: 'badge' }, 'staple') : null,
        e.optional ? h('span', { class: 'badge' }, 'optional') : null)))),
    h('div', { class: 'copy-row' }, copyBtn, status));

  const panels = { ingredients: h('div', { class: 'panel', id: 'panel-ingredients', role: 'tabpanel' }, groups), shopping: h('div', { class: 'panel', id: 'panel-shopping', role: 'tabpanel' }, shopping) };
  const tabs = {};
  const show = (name) => {
    ui.tab = name;
    for (const [k, p] of Object.entries(panels)) { p.hidden = k !== name; tabs[k].setAttribute('aria-selected', String(k === name)); tabs[k].classList.toggle('active', k === name); }
  };
  tabs.ingredients = h('button', { class: 'tab', role: 'tab', 'aria-controls': 'panel-ingredients', onclick: () => show('ingredients') }, 'Ingredients');
  tabs.shopping = h('button', { class: 'tab', role: 'tab', 'aria-controls': 'panel-shopping', onclick: () => show('shopping') }, 'Shopping list');
  const section = h('section', { class: 'ingredients' }, h('div', { class: 'tabs', role: 'tablist' }, tabs.ingredients, tabs.shopping), panels.ingredients, panels.shopping);
  show(ui.tab);
  return section;
}

async function copy(text, status) {
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = 'Copied. Paste it into AnyList.';
  } catch {
    // Clipboard access can be refused (e.g. over plain http): show the text to copy by hand.
    const area = h('textarea', { class: 'copy-fallback', readonly: true, rows: Math.min(12, text.split('\n').length + 1) });
    area.value = text;
    status.replaceChildren('Copy this: ', area);
    area.select();
  }
}

// ---------- Method ----------

function method(root, set) {
  if (!root.steps.length) return null;
  return h('section', { class: 'method' }, h('h2', null, 'Method'), stepsOf(root, set));
}

function stepsOf(node, set) {
  const out = [];
  let list = null;
  let n = 0;
  for (const s of node.steps) {
    if (s.heading) { out.push(h('h3', { class: 'step-heading' }, s.heading)); list = null; continue; }
    if (!list) { list = h('ol', { class: 'steps', start: n + 1 }); out.push(list); }
    n += 1;
    list.append(h('li', null, s.text ? h('p', null, s.text) : null, s.part ? partDetails(s.part, set) : null));
  }
  // Parts with their own steps that no step embeds (only reachable through "only").
  for (const c of node.loose) if (c.steps.length) out.push(partDetails(c, set));
  return out;
}

function partDetails(node, set) {
  const d = h('details', {
    class: 'part', open: ui.open.has(node.path),
    ontoggle: (e) => { if (e.target.open) ui.open.add(node.path); else ui.open.delete(node.path); },
  },
  h('summary', null, partTitle(node)),
  h('div', { class: 'part-body' },
    partInfo(node, set),
    linesList(node.lines),
    node.steps.length ? stepsOf(node, set) : null,
    node.recipe.notes ? h('p', { class: 'notes' }, node.recipe.notes) : null,
    node.loose.filter((c) => c.recipe.notes).map((c) => h('p', { class: 'notes' }, h('strong', null, partTitle(c) + ': '), c.recipe.notes))));
  return d;
}

// ---------- Notes ----------

function notes(root) {
  const items = [];
  if (root.recipe.notes) items.push(h('p', null, root.recipe.notes));
  for (const c of root.loose) if (c.recipe.notes) items.push(h('p', null, h('strong', null, partTitle(c) + ': '), c.recipe.notes));
  return items.length ? h('section', { class: 'notes-section' }, h('h2', null, 'Notes'), items) : null;
}
