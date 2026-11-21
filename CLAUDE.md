# Badger Recipes

A personal recipe collection. It's a static site (vanilla HTML/CSS/JS), moving from GitHub Pages to Cloudflare, with the recipe data stored as JSON in this repo. There is no backend, no framework and no npm dependencies.

## Current state

The repo is **mid-redesign**. The data side (`recipes/`, `ingredients.json`, `tags.json`, `schema/`, `build.js`) and the site (`index.html`, `styles.css`, `js/`) implement the model below, with five hand-converted example recipes. The extraction tooling (`tools/`, the `extract-recipe` skill and the `recipe-reviewer` agent) is built; the migration (`docs/migration.md`) starts with a pilot. Don't extend the old model. If the new model fits a recipe or feature awkwardly, **propose a model change to the user** rather than quietly working around it. `main` still serves 109 old-format recipes; the redesign happens on a branch and is merged only when it's complete.

Plan, in order:
1. Housekeeping: remove the add-recipe form and the issue workflow, write the docs. **(done)**
2. Model and tooling: schemas, `ingredients.json`, `build.js`, a CI check, and hand-converted examples (pancakes, Scotch eggs, Thai curry with its paste and rice). **(done)**
3. Site rewrite to the new model, with unit tests run in CI and a pre-commit hook. **(done)**
4. Extraction tooling: a skill and scripts that turn a source (website, PDF, image, Word doc, text) into recipe files. **(built; the pilot is next: 2 or 3 recipes of each source type)**
5. Re-extract all 109 recipes from their **original sources**. The old `recipes.json` isn't reliable enough to convert; treat it only as a checklist of what to collect. `docs/migration.md` lists the old titles (from git history at `4623299`). Give each recipe its source location and a status (not found / extracted / approved / skipped), and update it as each recipe is done, so work can continue across sessions.
6. Merge to `main`. Make the GitHub repo private and move hosting from GitHub Pages to Cloudflare (Pages or Workers static assets, connected to the private repo; the site is public to start with, and Cloudflare Access can be added later).

## Data model (target)

**There is only one kind of thing: a recipe.** A "meal" is just a recipe built from other recipes (its parts).

### Recipe: `recipes/<id>.json` (one file per recipe)
- `id`: snake_case, the same as the filename. Recipe files are the only global namespace.
- `title`, `course` (one of `main, side, starter, dessert, baking, breakfast, sauce, drink, snack, basic`; this is the meal type), `tags` (IDs from `tags.json`, top-level recipes only).
- `serves` (a **number**) and/or `yield`: every recipe needs at least one. `yield` is an amount `{ qty, unit }` (300 g of paste), a count `{ qty, name }` (`{ "qty": 6, "name": "Scotch eggs" }`, which the page scales and rounds: "Makes 12 Scotch eggs"), or text for what a number can't describe ("a 23cm cake"). A paste or stock can have `yield` alone. The build warns about text yields that start with a number.
- `time`: minutes as numbers, `{ prep, cook, rest?, total? }`.
- `source`: `{ type: "web", url, title }`, `{ type: "book", title, page }`, `{ type: "file", drive, name }` (a Google Drive link), or `{ type: "own" }`. When the cook would do or use something different from the source (ingredients, amounts or instructions changed in meaning), set `adapted: true` and record what changed in `changes`, which the site doesn't show; the build requires both together.
- `image`: an optional local file, `images/<id>.jpg`, extracted from the source (with your approval). No stock photos.
- `listed`: defaults to true. Use `false` only for a shared recipe file that isn't interesting on its own (e.g. a spice blend).
- `ingredients`, `steps`, `notes`, `parts`: see below.

### Ingredient lines
`{ item, qty?, qtyMax?, unit?, prep?, note?, optional?, scaling? }`
- `item` is a catalogue ID. `qty` and `qtyMax` are numbers (`qtyMax` is for ranges such as "1–2").
- For lines like "to taste", leave out `qty` and use `note`. These never scale.
- `optional: true` lines start unticked in the shopping list.
- `scaling` overrides the catalogue's category for this line (e.g. `fixed` for oil used for frying).
- Fallback for lines that won't fit: `{ text }`.
- Units are **metric only**, from a fixed list: `g kg ml l tsp tbsp cm clove tin pack pinch handful sprig bunch slice stick sheet` (`cm` is for things like "5cm galangal"), or no unit for countable things. Convert cups and imperial units during extraction. The page tidies units for display (1000 g shows as 1 kg).
- `{ heading: "For the icing" }` entries divide `ingredients` and `steps` into groups. They're display only.

### Parts
`parts: [{ key, label?, recipe | <inline recipe> | choose + default, use? }]`
- `key` is local to the file; steps refer to parts by key.
- **Shared** part: `"recipe": "<id>"`, referencing another recipe file.
- **Single-use** part (or a choice option): defined **inline**, with the same shape as a recipe. Its `id` only needs to be unique in its own file. Its full path, e.g. `scotch_eggs/filling/black_pudding`, is worked out by the build and used for the page's state and URLs (`#/scotch_eggs?filling=chorizo`). Inline parts are never listed on their own. To share one later, move it into its own file and reference it.
- `choose: [...]` with a `default`: options can be inline or references, and the page shows them as radio buttons.
- **How much of a part is used** (its factor, multiplied by the scaling chosen on the page):
  - `use: { qty, unit }` gives how much of the part's `yield` the parent needs, so the factor is use ÷ yield. The yield must be a quantity and unit, and the build checks the units match. An explicit `use` always wins.
  - With no `use`, if both parent and part have `serves`, the part **follows the parent's servings**: the factor is parent serves ÷ part serves (a curry for 6 using rice for 4 gets rice × 1.5).
  - With no `use` on a **shared** part where either side lacks `serves` (e.g. a paste with only a `yield`), the **build fails** and asks for a `use`. So the cook never sees a part that can't be scaled.
  - **Inline** parts with no `serves` are sized for their parent (factor 1). If they do have `serves`, the same ratio applies.
  - A part recipe with `batch: true` is normally made in full: the page has a "make full batch" toggle (factor 1, ignoring scaling), and `batch` turns it on by default.

### Steps
- A plain string, or `{ text?, part?, only? }`. The parent's steps **set the order across parts**: a step with `part` shows that part as a section you can expand in place.
- An **inline choice option** embedded by a step switches straight into the method: its steps replace the embedding step's place (after the step's text, if it has any), numbered with the rest, rather than appearing as a collapsible section. Shared parts and shared options stay collapsible, with a link to their own page.
- An option's `time` is the whole recipe's time with that option: its fields replace the recipe's in the header and the list card.
- `only: { "<choice key>": ["<option id>", …] }` shows a step only when one of those options is selected. Use it when alternatives differ at a few points in the method (e.g. brown the chicken first, add seafood at the end); the options then just carry their ingredients.
- Every part must be referenced by some step (through `part`, or through `only` for a choice), unless the parent has no steps (then its parts are shown one after another).
- Steps reference whole parts, never individual steps inside a part.

### How to handle variation
- Use a **choice** between parts when the difference fits in one block of steps, and a choice plus **conditional steps** (`only`) when it affects a few points in the method.
- Write **separate recipes that share parts** when the methods interleave (e.g. beef vs fish green curry).
- Use **notes** for small tweaks.
- **No change lists or patch-style variants.** They were rejected on purpose.
- **How to extract and structure recipes (sources, the structure decision guide, the catalogue, units, images): see `docs/extraction.md`. Follow it for every recipe you add or re-extract.**

### Ingredients catalogue: `ingredients.json`
Keyed by a canonical snake_case ID:
`"onion": { "name": "Onion", "plural": "Onions", "aliases": [], "staple": false, "scaling": "linear" }`
- `name` is the display text, in sentence case exactly as shown ("Gruyère").
- `staple: true` items start **unticked** in the shopping list.
- `scaling` sets how the item scales: `linear` (the default), `seasoning`, `strong_spice`, `leavening` or `fixed`. A scaled amount is the original × k^e, with e = 1, 0.9, 0.8, 0.95 or 0 respectively. The page marks amounts that aren't proportional and shows the proportional figure alongside. Cooking times aren't adjusted; the page shows a general reminder when a recipe is scaled.
- Every `item` must exist in the catalogue. Map onto existing IDs and aliases before adding new entries.
- There's no aisle field; AnyList categorises pasted items itself.

### Tags catalogue: `tags.json`
Keyed by a snake_case ID: `"thai": { "name": "Thai", "group": "cuisine" }`.
- `group` is one of `cuisine` (region or country), `dish` (curry, soup, pie), `ingredient` (the headline ingredient: lamb, cod), `occasion` (christmas, weeknight), `diet` (vegetarian, gluten_free) or `method` (bbq, slow_cooker). The sidebar shows tags under these groups.
- `name` is the display text ("Deep-fried"). Every recipe tag must exist in the catalogue, so new tags are added there (with a group) during extraction. Check for an existing tag first, to avoid near-duplicates.
- Regions are flat for now (Thai, Indian). If the list grows long, a parent region could be added to the catalogue later without touching recipes.
- "Vegetarian" etc. are tags, not worked out from ingredients.

### Build checks
The build fails on: an unknown part reference or catalogue item; an `only` naming something that isn't a choice part, or an option that doesn't exist; a recipe that includes itself (directly or through parts); duplicate part keys, or duplicate option IDs within a `choose`; a `default` that isn't one of its options; a part that no step references when the parent has steps; `use` units that don't match the part's `yield`; a shared part with no `use` where the parent or the part lacks `serves`; a tag that isn't in `tags.json`, or a tag without a valid group. It warns about catalogue entries and tags that no recipe uses.

### Reference guides
Non-recipe content, such as the old temperature charts, is set aside for now. It will become a separate content type later.

## Extraction tooling
- **The process** is the `extract-recipe` skill (`.claude/skills/extract-recipe/SKILL.md`): snapshot, draft, structure, checks, independent review, correction, approval, retrospective. **The rules** it applies are in `docs/extraction.md`. The reviewer is a separate agent (`.claude/agents/recipe-reviewer.md`), given only the source snapshot and the recipe, not the extractor's reasoning.
- **Batching:** each route (`web`, `document`) goes one recipe at a time until 5 in a row need no process change, then in batches of up to 5 (each recipe still reviewed separately). The counters are in `docs/migration.md`.
- **Scripts** in `tools/` (Node, no dependencies), with their pure logic in `tools/lib/`:
  - `fetch-source.mjs` saves a snapshot in `.extraction/<slug>/` (gitignored). For web pages it gets the JSON-LD and the page text, falling back to headless Chrome. Word, RTF and text files go through `textutil`, and PDFs and images are copied.
  - `draft.mjs` drafts a recipe from the snapshot: metric amounts, catalogue matches, °C, and a report of every decision left to make.
  - `render.mjs` prints the review report: the structure, then every variant as the page shows it, scaled, and with full batches on and off. It uses the site's own `js/` code.
  - `lint.mjs` checks for imperial units, American words, free-text lines, amounts in step text, ingredients the method never mentions, and near-duplicate catalogue entries. It exits 1 on warnings.
  - `old-recipe.mjs` looks up the old collection.
- Lessons from each extraction go in the Process log in `docs/migration.md`. Changes to the process are proposed to the user, and script changes come with a test and a fixture in `tests/fixtures/sources/`.

## Build and deploy (target)
- `node build.js` validates every recipe and the catalogue, then writes the combined `recipes.json` (`{ recipes: {id: recipe}, ingredients }`) that the site loads. That file is generated and gitignored. `node build.js --check` validates without writing it.
- `schema/recipe.schema.json` and `schema/ingredients.schema.json` are the single source of truth for the shape of the data. `build.js` contains a small JSON Schema checker with no dependencies, plus the cross-file checks. Recipe files set `$schema` so editors can autocomplete them.
- `.github/workflows/validate-recipes.yml` runs `node build.js --check` and the unit tests on every push and PR.

## Tests
- **Every change to `js/` or `build.js` needs unit tests that use realistic recipe examples** (the real files in `recipes/` where possible, small hand-written fixtures for structures they don't cover yet). Tests prove behaviour the cook would see: amounts, merged shopping lines, which steps show.
- Tests use Node's built-in runner (`node:test` and `node:assert`), so there's nothing to install: `node --test 'tests/*.test.mjs'`. They load `recipes/*.json` directly and don't need a build first.
- `tests/build.test.mjs` runs `build.js --root <tmp>` against a copy of the data with one deliberate mistake each. Add a case there for every new build check.
- **Browser tests** (`tests/site.test.mjs`) run the real site in headless Chrome, driven over the DevTools protocol by `tools/lib/chrome.mjs` (no dependencies; `tests/browser.mjs` adds the test server), against the **sample recipes in `tests/fixtures/site/`**, not the real collection. They click through the page (filters, search, servings, choices, full-batch toggles, shopping list and copy, mobile layout) and fail on any console error. When the site gains a feature, add a test there, and extend the sample recipes if they don't cover it. They're skipped locally if Chrome isn't found (set `CHROME_PATH`), and required in CI.
- **Extraction tools** have tests too (`tests/extract-*.test.mjs`): parsing pages shaped like real recipe sites (`tests/fixtures/sources/`), ingredient lines and conversions against the real catalogue, the variant renderer, lint, and each command end to end. Every real recipe must pass `tools/lint.mjs` with no warnings.
- The pre-commit hook in `.githooks/` runs the validation and the tests. Enable it once per clone: `git config core.hooksPath .githooks`.
- After step 6, Cloudflare runs `node build.js` on every push, and each branch gets a preview URL.
- Needs Node 22 or later; there's nothing to `npm install`.
- Source files (PDFs, Word docs, images) stay in **Google Drive**, not in the repo. Recipes record a Drive link.
- Run locally: `node build.js && python3 -m http.server`.

## Site (target)
- Code: vanilla ES modules in `js/`, loaded straight by the browser with no build step. `quantity.js` (scaling, units, rounding, display), `resolve.js` (turns a recipe and the page state into a tree of parts with factors, scaled lines and filtered steps), `shopping.js` (the merged list and AnyList text) and `state.js` (URL state) are pure and unit-tested; `views/` and `main.js` build the DOM with `dom.js`'s `h()`, never `innerHTML` with data.
- URL state: `#/<id>?serves=6` (or `x=2` for yield-only recipes), `<choice path>=<option>` (e.g. `filling=chorizo`; nested choices use the full path) and `full.<part path>=1|0`. Defaults are left out.
- A list view with a sidebar by course, search (titles, tags, course and the titles of choice options, so "chicken" finds a curry offering chicken, seafood or tofu; matching is from the start of words; ingredients and shared parts aren't searched, so "salt cod" doesn't find everything with salt in it and "rice" doesn't find every curry served with rice) and tag filters grouped as in `tags.json`. You can pick several tags: a recipe matches if it has any of the picked tags within a group and all the groups picked (Thai or Indian, and Chicken). A recipe view at `#/<id>`.
- On the recipe view:
  - **Servings control** that scales everything, including parts. Each part has a "make full batch" toggle. Parts that use some of a yield show "Recipe makes 300 g; you need 100 g".
  - **Ingredients tab**: parts first, in the order the method uses them, then the recipe's own ingredients under its title. Choice options used through conditional steps (the curry's protein) join the end of that last group. A part with no ingredients of its own (an oven method) gets no heading, unless it has a full-batch toggle.
  - **Combined ingredients list**, merged across parts by `item`. Lines merge only when their units convert (g with kg, ml with l, tsp with tbsp); otherwise they're shown together under one item ("Onion: 1 + 200 g").
  - **Checkboxes** so you can untick what you have. Staple and `optional` lines start unticked.
  - **Copy for AnyList** copies the ticked lines as plain text, one item per line, for pasting into AnyList.
  - **Choices** between parts show as radio buttons, and the selection is kept in the URL (`#/scotch_eggs?filling=chorizo`). Steps with `only` show only for the selected option.
  - **Embedded parts** in steps expand in place. Shared parts that are listed also link to their own page. Inline choice options don't: the chosen option's steps switch straight into the numbered method.
  - The header's times follow the chosen options, and its servings and counted yield follow the scaling together ("Serves 12 · Makes 12 Scotch eggs"). A parent with no steps shows its parts one after another, as collapsible sections.
- Display rules for amounts:
  - Use the catalogue `plural` when the quantity isn't 1, or when measured by weight, volume or spoon ("300g Almonds", but "5cm Cinnamon stick"), and plural units ("3 cloves").
  - Show ranges as "1–2" and fractions as ½, ¼, ¾, ⅓ and ⅔.
  - Tidy units when scaling: 1000 g shows as 1 kg, 3 tsp as 1 tbsp.
  - Rounding after scaling: whole numbers for things without a unit (eggs) and for cloves, slices, sheets, sprigs and sticks, and below 1 the closest of ¼, ⅓, ½, ⅔ or ¾; the nearest ¼ for tsp and tbsp, and below 1 tsp the closest of ⅛, ¼, ⅓, ½, ⅔ or ¾ (thirds aren't spoon sizes but are easy to judge by eye), with less than ⅛ tsp shown as "1 pinch"; for g and ml, whole numbers from 10 to 100, the nearest 5 above 100 and the nearest ½ below 10; other units to the nearest ½. Unscaled amounts are shown exactly as written.
  - tsp becomes tbsp only when it comes out in halves (4½ tsp is 1½ tbsp, but 4 tsp stays as it is).
  - Amounts that don't scale in proportion get a ≈ marker; tapping it shows the proportional figure. The marker only appears when the two would display differently (doubled salt at 1.87 tsp shows as 2 tsp either way, so it isn't marked).
  - When a recipe is scaled, a general reminder says cooking times, pan sizes and raising agents may need adjusting.
- Later, not now: ticking off steps as you go, and keeping the screen awake while cooking.
- It should work well on mobile, since it's used in the kitchen. Keep the existing dark, Canton teal look.
- Use proper CSS classes and event listeners, not inline styles or `onclick` strings.

## Open questions
- **AnyList line format.** Check whether AnyList reads quantities from a pasted line like "2 Onions".
- **Cloudflare Pages or Workers static assets.** Check which Cloudflare recommends in step 6.
- **Reference guides** (the old temperature charts): a separate content type, later.

## Out of scope (for now)
Adding or editing recipes from the site; databases; AI built into the site; any AnyList API, since there's no public one and the unofficial one needs credentials. Possible later: static per-recipe pages with schema.org JSON-LD so AnyList can import whole recipes.
