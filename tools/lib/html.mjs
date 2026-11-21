// Reads a recipe web page: its schema.org Recipe JSON-LD (normalised into plain fields), the
// title, image and the visible text. Pure functions, no I/O.

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾',
  frac13: '⅓', frac23: '⅔', frac18: '⅛', deg: '°', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“',
  rdquo: '”', hellip: '…', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', aacute: 'á', iacute: 'í',
  oacute: 'ó', uacute: 'ú', ntilde: 'ñ', ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', times: '×', copy: '©',
  reg: '®', trade: '™', bull: '•', middot: '·', laquo: '«', raquo: '»',
};

/** Decodes HTML entities (named, decimal and hex). */
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Text from an HTML fragment: tags removed, entities decoded, whitespace collapsed. */
export function plain(s) {
  if (s == null) return '';
  // Some sites double-encode (&amp;frac12;), so decode, strip tags, then decode again.
  return decodeEntities(decodeEntities(String(s)).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').replace(/\s+([,.;:)])/g, '$1').trim();
}

/** ISO 8601 durations ("PT1H30M", "P0DT0H20M") as whole minutes, or null. */
export function isoMinutes(d) {
  if (typeof d !== 'string') return null;
  const m = d.trim().match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!m) return null;
  const [, dd, hh, mm, ss] = m.map((x) => (x == null ? 0 : Number(x)));
  const total = Math.round(dd * 1440 + hh * 60 + mm + ss / 60);
  return total || null;
}

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const hasType = (node, t) => asArray(node && node['@type']).some((x) => String(x).toLowerCase() === t.toLowerCase());

/** Every JSON-LD block in the page, parsed (blocks that aren't valid JSON are skipped). */
export function jsonLdBlocks(html) {
  const out = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const body = m[1].trim().replace(/^<!--/, '').replace(/-->$/, '').replace(/^\/\*<!\[CDATA\[\*\//, '').replace(/\/\*\]\]>\*\/$/, '').trim();
    try { out.push(JSON.parse(body)); } catch { /* not JSON */ }
  }
  return out;
}

/** The first schema.org Recipe node, looking inside arrays, @graph and mainEntity. */
export function findRecipeNode(blocks) {
  const seen = new Set();
  const visit = (n) => {
    if (!n || typeof n !== 'object' || seen.has(n)) return null;
    seen.add(n);
    if (Array.isArray(n)) { for (const x of n) { const r = visit(x); if (r) return r; } return null; }
    if (hasType(n, 'Recipe')) return n;
    for (const k of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
      const r = visit(n[k]);
      if (r) return r;
    }
    return null;
  };
  return visit(blocks);
}

const imageUrl = (img) => {
  for (const i of asArray(img)) {
    if (typeof i === 'string') return i;
    if (i && i.url) return i.url;
    if (i && i.contentUrl) return i.contentUrl;
  }
  return null;
};

const authorName = (a) => asArray(a).map((x) => (typeof x === 'string' ? x : x && x.name)).filter(Boolean).map(plain).join(', ') || null;

/**
 * recipeInstructions in any of its shapes (a string, strings, HowToStep, HowToSection, ItemList)
 * as a flat list of { text } and { heading } entries.
 */
export function instructions(v) {
  const out = [];
  const add = (x) => {
    if (x == null) return;
    if (typeof x === 'string') {
      // One string can hold the whole method, as paragraphs or HTML list items.
      const parts = /<li|<p|<br|\n/i.test(x)
        ? x.split(/<\/?(?:li|p|ol|ul)[^>]*>|<br\s*\/?>|\n+/i).map(plain).filter(Boolean)
        : [plain(x)].filter(Boolean);
      for (const p of parts) out.push({ text: p });
      return;
    }
    if (Array.isArray(x)) { x.forEach(add); return; }
    if (hasType(x, 'HowToSection') || (x.itemListElement && !x.text)) {
      if (x.name) out.push({ heading: plain(x.name) });
      add(x.itemListElement);
      return;
    }
    const text = plain(x.text || x.name || x.description);
    if (text) out.push({ text });
  };
  add(v);
  return out;
}

/** The Recipe node as plain fields; anything the page leaves out is null or empty. */
export function normaliseRecipe(node) {
  if (!node) return null;
  const yields = asArray(node.recipeYield).map((y) => plain(String(y))).filter(Boolean);
  return {
    name: plain(node.name) || null,
    description: plain(node.description) || null,
    author: authorName(node.author),
    url: typeof node.url === 'string' ? node.url : null,
    image: imageUrl(node.image),
    yield: [...new Set(yields)],
    time: {
      prep: isoMinutes(node.prepTime),
      cook: isoMinutes(node.cookTime),
      total: isoMinutes(node.totalTime),
    },
    category: asArray(node.recipeCategory).map(plain).filter(Boolean),
    cuisine: asArray(node.recipeCuisine).map(plain).filter(Boolean),
    keywords: (Array.isArray(node.keywords) ? node.keywords : String(node.keywords || '').split(',')).map(plain).filter(Boolean),
    ingredients: asArray(node.recipeIngredient || node.ingredients).map((s) => plain(String(s))).filter(Boolean),
    instructions: instructions(node.recipeInstructions),
  };
}

const meta = (html, key) => {
  const re = new RegExp('<meta\\b[^>]*(?:property|name)\\s*=\\s*["\']' + key.replace(/[:.]/g, '\\$&') + '["\'][^>]*>', 'i');
  const tag = html.match(re);
  if (!tag) return null;
  const c = tag[0].match(/content\s*=\s*("([^"]*)"|'([^']*)')/i);
  return c ? decodeEntities(c[2] ?? c[3]) : null;
};

/** The page's visible text, one block per line, without scripts, styles or navigation chrome. */
export function visibleText(html) {
  let s = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|footer)\b[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|section|article|header|h[1-6]|ul|ol|li|tr|table|blockquote|figure|figcaption|main|aside)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');
  s = decodeEntities(s);
  return s.split('\n').map((l) => l.replace(/[ \t\xa0]+/g, ' ').trim()).filter((l) => l && l !== '-').join('\n');
}

/** Everything useful in a recipe page. */
export function readPage(html, url = null) {
  const recipe = normaliseRecipe(findRecipeNode(jsonLdBlocks(html)));
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return {
    url: meta(html, 'og:url') || url,
    title: meta(html, 'og:title') || (titleTag ? plain(titleTag[1]) : null),
    site: meta(html, 'og:site_name'),
    image: (recipe && recipe.image) || meta(html, 'og:image'),
    recipe,
    text: visibleText(html),
  };
}
