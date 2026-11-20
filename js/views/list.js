import { h } from '../dom.js';
import { COURSES, COURSE_SINGULAR, minutes, tagLabel } from '../format.js';
import { filterRecipes } from '../search.js';

export const BADGER = 'assets/badger.jpg';

const listed = (data) => filterRecipes(data);

export const filtered = (app) => filterRecipes(app.data, app.filter);

export function renderSidebar(app, currentId) {
  const all = listed(app.data);
  const { course, tag, q } = app.filter;
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

  const tags = [...new Set(all.flatMap((r) => r.tags || []))].sort();
  const tagList = h('div', { class: 'tags', 'aria-label': 'Tags' },
    tags.map((t) => h('button', { class: ['tag', tag === t && 'active'], 'aria-pressed': String(tag === t), onclick: () => setFilter({ tag: tag === t ? null : t }) }, tagLabel(t))));

  const keepFocus = document.activeElement && document.activeElement.classList.contains('search');
  app.sidebar.replaceChildren(
    h('div', { class: 'sidebar-head' },
      h('a', { href: '#/', class: 'brand' }, h('img', { class: 'badger-avatar', src: BADGER, alt: '' }), 'Badger recipes'),
      search),
    courses,
    tags.length ? h('h2', { class: 'sidebar-label' }, 'Tags') : null,
    tagList);
  if (keepFocus) { search.focus(); search.setSelectionRange(q.length, q.length); }
}

export function renderList(app) {
  const items = filtered(app);
  const { course, tag, q } = app.filter;
  const bits = [course && COURSES.find(([c]) => c === course)[1], tag && '#' + tagLabel(tag), q && '“' + q + '”'].filter(Boolean);
  app.main.replaceChildren(h('div', { class: 'list-view' },
    h('h1', null, bits.length ? bits.join(' · ') : 'All recipes'),
    h('p', { class: 'muted' }, items.length + (items.length === 1 ? ' recipe' : ' recipes'),
      bits.length ? h('button', { class: 'link', onclick: () => { app.filter = { q: '', course: null, tag: null }; app.go('#/'); } }, 'Clear filters') : null),
    items.length
      ? h('ul', { class: 'cards' }, items.map((r) => h('li', null, card(r))))
      : h('p', { class: 'empty' }, 'No recipes match.')));
}

function card(r) {
  const t = r.time || {};
  const total = t.total || ((t.prep || 0) + (t.cook || 0) + (t.rest || 0)) || null;
  return h('a', { class: 'card', href: '#/' + r.id },
    r.image ? h('img', { src: r.image, alt: '', loading: 'lazy' }) : h('div', { class: 'card-placeholder', 'aria-hidden': 'true' }, r.title[0]),
    h('div', { class: 'card-body' },
      h('span', { class: 'card-title' }, r.title),
      h('span', { class: 'card-meta' }, [COURSE_SINGULAR[r.course], r.serves && 'Serves ' + r.serves, total && minutes(total)].filter(Boolean).join(' · '))));
}
