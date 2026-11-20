# Badger Recipes

A personal recipe collection, published as a static site on GitHub Pages.

> **In progress:** the data model and site are being redesigned. `main` serves the original collection; the new version is being built on a branch. See `CLAUDE.md` for the agreed design and plan.

## How it works
- Each recipe is a JSON file. A recipe can be built from other recipes, e.g. a curry made from a curry paste, the curry itself and basmati rice. Choices between parts are possible, e.g. Scotch eggs with a black pudding or chorizo filling.
- Ingredients reference a shared catalogue (`ingredients.json`), so they can be scaled, merged into one shopping list and copied to AnyList, with staples left out.
- The site is plain HTML, CSS and JavaScript (`index.html`, `app.js`, `styles.css`), with no framework or build dependencies.

## Running locally
Serve the repo root with any static server:

```sh
python3 -m http.server
```

then open http://localhost:8000.

## Adding recipes
For now, recipes are added by committing JSON files that conform to the schema. Tooling to extract recipes from websites, PDFs, images and documents is planned.
