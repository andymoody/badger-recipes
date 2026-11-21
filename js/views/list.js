import { h } from '../dom.js';
import { COURSES, COURSE_SINGULAR, TAG_GROUPS, minutes, tagName } from '../format.js';
import { filterRecipes } from '../search.js';
import { resolve, recipeTime } from '../resolve.js';

export const BADGER = 'assets/badger.jpg';

const listed = (data) => filterRecipes(data);

export const filtered = (app) => filterRecipes(app.data, app.filter);

export function renderSidebar(app, currentId) {
  const all = listed(app.data);
  const { course, tags: selected, q } = app.filter;
  const setFilter = (f) => { Object.assign(app.filter, f); app.go('#/'); };

  const search = h('input', {
    type: 'search', class: 'search', placeholder: 'Search titles and tags', 'aria-label': 'Search recipes', value: q,
    oninput: (e) => {
      app.filter.q = e.target.value;
      if (location.hash.replace(/^#\/?/, '')) location.hash = '#/';
      else renderList(app);
    },
  });

  const courses = h('nav', { class: 'courses', 'aria-label': 'Courses' },
    h('button', { class: ['course', !course && 'active'], onclick: () => setFilter({ course: null }) }, 'All recipes', h('span', { class: 'count' }, all.length)),
    COURSES.filter(([c]) => all.some((r) => r.course === c)).map(([c, label]) =>
      h('button', { class: ['course', course === c && 'active'], onclick: () => setFilter({ course: course === c ? null : c }) },
        label, h('span', { class: 'count' }, all.filter((r) => r.course === c).length))));

  // Tags in use, grouped as tags.json says. Picking several: any within a group, all across groups.
  const used = [...new Set(all.flatMap((r) => r.tags || []))];
  const groupOf = (t) => (app.data.tags[t] || {}).group;
  const toggle = (t) => setFilter({ tags: selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t] });
  const tagGroups = TAG_GROUPS.map(([g, label]) => {
    const inGroup = used.filter((t) => groupOf(t) === g).sort((a, b) => tagName(a, app.data).localeCompare(tagName(b, app.data)));
    if (!inGroup.length) return null;
    return h('section', { class: 'tag-group' },
      h('h2', { class: 'sidebar-label' }, label),
      h('div', { class: 'tags' }, inGroup.map((t) => h('button', {
        class: ['tag', selected.includes(t) && 'active'], 'aria-pressed': String(selected.includes(t)), onclick: () => toggle(t),
      }, tagName(t, app.data)))));
  });

  const keepFocus = document.activeElement && document.activeElement.classList.contains('search');
  app.sidebar.replaceChildren(
    h('div', { class: 'sidebar-head' },
      h('a', { href: '#/', class: 'brand' }, h('img', { class: 'badger-avatar', src: BADGER, alt: '' }), 'Badger recipes'),
      search),
    courses,
    ...tagGroups.filter(Boolean));
  if (keepFocus) { search.focus(); search.setSelectionRange(q.length, q.length); }
}

export function renderList(app) {
  const items = filtered(app);
  const { course, tags, q } = app.filter;
  const bits = [course && COURSES.find(([c]) => c === course)[1], ...tags.map((t) => tagName(t, app.data)), q && '“' + q + '”'].filter(Boolean);
  app.main.replaceChildren(h('div', { class: 'list-view' },
    h('h1', null, bits.length ? bits.join(' · ') : 'All recipes'),
    h('p', { class: 'muted' }, items.length + (items.length === 1 ? ' recipe' : ' recipes'),
      bits.length ? h('button', { class: 'link', onclick: () => { app.filter = { q: '', course: null, tags: [] }; app.go('#/'); } }, 'Clear filters') : null),
    items.length
      ? h('ul', { class: 'cards' }, items.map((r) => h('li', null, card(r, app.data))))
      : h('p', { class: 'empty' }, 'No recipes match.')));
}

function card(r, data) {
  // The time with the default options, which may give their own (a sous-vide method).
  const t = recipeTime(resolve(data, r.id)) || {};
  const total = t.total || ((t.prep || 0) + (t.cook || 0) + (t.rest || 0)) || null;
  return h('a', { class: 'card', href: '#/' + r.id },
    r.image ? h('img', { src: r.image, alt: '', loading: 'lazy' }) : h('div', { class: 'card-placeholder', 'aria-hidden': 'true' }, r.title[0]),
    h('div', { class: 'card-body' },
      h('span', { class: 'card-title' }, r.title),
      h('span', { class: 'card-meta' }, [COURSE_SINGULAR[r.course], r.serves && 'Serves ' + r.serves, total && minutes(total)].filter(Boolean).join(' · '))));
}
