# Source fixtures

Saved pages and documents for the extraction tool tests (`tests/extract-*.test.mjs`). They're
hand-written in the shapes real recipe sites use, not copies of real pages:

- `blog-banana-bread.html`: an American food blog built with a WordPress recipe plugin: JSON-LD in an
  `@graph` with an article, ingredient sections, cups and °F, entities, and a variations section
  that only appears in the page text.
- `uk-chicken-curry.html`: a UK magazine-style page: a single Recipe object with an array
  `@type`, metric amounts, "Serves 4", HTML inside the steps, keywords as one string.
- `no-structured-data.html`: a personal blog with the recipe only in the text, between navigation,
  scripts and a footer.
- `script-built.html`: a page whose recipe data is added by JavaScript, so only a browser sees it.
