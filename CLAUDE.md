# Badger Recipes

A personal recipe collection. It's a static site (vanilla HTML/CSS/JS) served by GitHub Pages, with the recipe data stored as JSON in this repo. There is no backend, no framework and no npm dependencies.

## Current state

The repo is **mid-redesign**. `app.js`, `recipe-schema.json` and `recipes.json` still use the **old** model: flat recipes, inline `components`, and full-copy `variants`. Don't extend the old model; new work targets the model below. `main` still serves 109 old-format recipes; the redesign happens on a branch and is merged only when it's complete.

Plan, in order:
1. Housekeeping: remove the add-recipe form and the issue workflow, write the docs. **(done)**
2. Model and tooling: schemas, `ingredients.json`, `build.js`, an Action that validates, builds and deploys to Pages, and hand-converted examples (pancakes, Scotch eggs, Thai curry).
3. Site rewrite to the new model.
4. Extraction tooling: a skill and scripts that turn a source (website, PDF, image, Word doc, text) into recipe files.
5. Re-extract all 109 recipes from their **original sources**. The old `recipes.json` isn't reliable enough to convert; treat it only as a checklist of what to collect.
6. Merge to `main` and switch Pages to "deploy via GitHub Actions".

## Data model (target)

**There is only one kind of thing: a recipe.** A "meal" is just a recipe built from other recipes.

### Recipe: `recipes/<id>.json` (one file per recipe)
- `id`: snake_case, the same as the filename.
- `title`, `course` (one of `main, side, starter, dessert, baking, breakfast, sauce, drink, snack, basic`), `tags` (free list, e.g. `christmas`, `vegetarian`, `thai`).
- `serves`: a **number** (needed for scaling); optional `yield` text, e.g. "12 pancakes".
- `listed`: defaults to true. Set it to `false` for parts that only make sense inside another recipe, e.g. a Scotch egg filling. Unlisted recipes don't appear in the list or search; they're shown only inside their parents.
- `ingredients`: `{ item, qty, unit, prep, note }`. `item` is a catalogue ID and `qty` is a number (`0.5`, not `"1/2"`). For lines that won't fit this shape, use a `{ text }` fallback ("salt and pepper to taste").
- `parts`: other recipes this one is built from, referenced by ID. A part can be a **choice** between several recipes (e.g. a filling: black pudding *or* chorizo).
- `steps`: the parent's own steps **set the order across parts**. A step can embed a whole part, which the page shows as a section you can expand in place. If the parent has no steps, its parts are shown one after another.
- `notes`: free text, used for small tweaks.

How to handle variation:
- **Choose a part** when the difference fits within one block of steps.
- **Write separate recipes that share parts** when the methods interleave (e.g. beef vs fish green curry, both using `green_curry_paste`).
- Use **notes** for small tweaks.
- **No change lists or patch-style variants** (replace ingredient X, edit step N). They're fragile and were rejected on purpose.
- Steps reference whole parts, never individual steps of a part.

The build must reject any part reference that doesn't exist and any recipe that includes itself, directly or through other parts.

### Ingredients catalogue: `ingredients.json`
Keyed by a canonical snake_case ID:
`"onion": { "name": "Onion", "plural": "Onions", "aliases": [], "staple": false }`
- `name` is the display text, written in sentence case exactly as it should be shown ("Gruyère", "Thai basil").
- `staple: true` items (salt, olive oil…) start **unticked** in the shopping list.
- Every `item` used in a recipe must exist in the catalogue. When adding recipes, map onto existing IDs and their aliases before creating new entries.
- There is no aisle or category field: AnyList categorises pasted items itself.

### Reference guides
Non-recipe content, such as the temperature charts in the old data, is set aside for now. It will become a separate content type later.

## Build and deploy (target)
- `node build.js` validates every recipe and the catalogue, then writes the combined `recipes.json` that the site loads. That file is generated and is **not committed**.
- The GitHub Action runs the same build on push and deploys to Pages.
- Serve locally with any static server, e.g. `python3 -m http.server`.

## Site (target)
- A list view with a sidebar by course, search and tag filters. A recipe view at `#/<id>`.
- On the recipe view: a servings control that scales everything, including parts. A combined ingredients list merged across parts, with checkboxes so you can untick what you have; staples start unticked. A **copy for AnyList** button that copies a plain-text list, one item per line, to paste into AnyList. Choices between parts show as radio buttons.
- It should work well on mobile, since it's used in the kitchen. Keep the existing dark, Canton teal look.
- Use proper CSS classes and event listeners, not inline styles or `onclick` strings.

## Out of scope (for now)
Adding or editing recipes from the site; databases; AI built into the site; any AnyList API, since there's no public one and the unofficial one needs credentials. Possible later: static per-recipe pages with schema.org JSON-LD so AnyList can import whole recipes.
