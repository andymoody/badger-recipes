# Badger Recipes

A personal recipe collection, published as a static site on GitHub Pages.

> **In progress:** the data model and site are being redesigned. `main` serves the original collection; the new version is being built on a branch. See `CLAUDE.md` for the agreed design and plan.

## How it works
- Each recipe is a JSON file. A recipe can be built from other recipes, e.g. a curry made from a curry paste, the curry itself and basmati rice. Choices between parts are possible, e.g. Scotch eggs with a black pudding or chorizo filling.
- Tags come from a catalogue (`tags.json`) that puts each one in a group (cuisine, dish, main ingredient, occasion, diet, method) for the sidebar filters.
- Ingredients reference a shared catalogue (`ingredients.json`), so they can be scaled, merged into one shopping list and copied to AnyList, with staples left out.
- The site is plain HTML, CSS and JavaScript (`index.html`, `styles.css` and ES modules in `js/`), with no framework or build dependencies.

## Running locally
Build the data, then serve the repo root with any static server:

```sh
node build.js
python3 -m http.server
```

`node build.js` checks every recipe in `recipes/` against `schema/` and the ingredients catalogue, then writes `recipes.json` (generated and not committed).

then open http://localhost:8000.

## Tests
Unit tests use Node's built-in test runner, so there's nothing to install:

```sh
node --test 'tests/*.test.mjs'
```

GitHub Actions runs the recipe validation and the tests on every push and pull request. To run them before each commit too, enable the hook once per clone:

```sh
git config core.hooksPath .githooks
```

## Adding recipes
For now, recipes are added by committing JSON files to `recipes/` that conform to `schema/recipe.schema.json`. Run `node build.js --check` before committing. Tooling to extract recipes from websites, PDFs, images and documents is planned.
