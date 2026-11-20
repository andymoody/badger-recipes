import { h } from './dom.js';
import { renderSidebar, renderList } from './views/list.js';
import { renderRecipe } from './views/recipe.js';

const app = {
  data: null,
  filter: { q: '', course: null, tags: [] },
  main: document.getElementById('main'),
  sidebar: document.getElementById('sidebar'),
  go: (hash) => { if (location.hash === hash) route(); else location.hash = hash; },
  refreshList: () => route(),
};

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [id, qs = ''] = raw.split('?');
  return { id: decodeURIComponent(id), params: new URLSearchParams(qs) };
}

let lastId = null;
function route() {
  const { id, params } = parseHash();
  document.body.classList.remove('browse-open');
  renderSidebar(app, id);
  if (!id) {
    renderList(app);
    document.title = 'Badger recipes';
  } else if (app.data.recipes[id]) {
    renderRecipe(app, id, params);
    document.title = app.data.recipes[id].title + ' · Badger recipes';
  } else {
    app.main.replaceChildren(h('div', { class: 'empty' }, h('h1', null, 'Recipe not found'), h('a', { href: '#/' }, 'Back to all recipes')));
  }
  if (id !== lastId) app.main.scrollTop = 0, window.scrollTo(0, 0);
  lastId = id;
}

document.getElementById('browseToggle').addEventListener('click', () => document.body.classList.toggle('browse-open'));

async function start() {
  try {
    const res = await fetch('recipes.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    app.data = await res.json();
  } catch (e) {
    app.main.replaceChildren(h('div', { class: 'empty' },
      h('h1', null, 'Could not load recipes'),
      h('p', null, 'recipes.json is generated: run ', h('code', null, 'node build.js'), ' first. (' + e.message + ')')));
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}
start();
