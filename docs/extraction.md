# Recipe extraction guide

How to turn a source (website, PDF, image, Word doc, pasted text) into recipe files. These are the rules agreed while designing the model. The `extract-recipe` skill (`.claude/skills/extract-recipe/SKILL.md`) is the process that applies them, with scripts in `tools/` for the mechanical parts; follow these rules too whenever you add or change a recipe by hand. The data model itself is defined in `CLAUDE.md` and `schema/`. This file covers *how to apply it*.

## Principles

1. **Go back to the original source for every recipe.** The pre-redesign `recipes.json` (in git history, e.g. commit `4623299`) isn't reliable. Use it only as a checklist of which recipes to collect, never as the source of a recipe. **But compare it with the source:** where the old entry differs from the source (changed quantities, extra steps, notes), it may be the user's own adjustment rather than an error. List those differences and ask, rather than silently dropping them.
   Before creating a recipe, check `recipes/` for an existing one: the old data contained near-duplicates.
   During the migration, update the recipe's entry in `docs/migration.md` (source location and status) as part of finishing each recipe.
2. **Be faithful to the method.** Don't change how a dish is cooked so that it fits the model. If a structure would force a change, choose a different structure (see the decision guide below). The curry chicken lesson: a choice block couldn't move the chicken's timing, which is what led to conditional steps.
3. **Question the model, don't just work around it.** If a recipe only fits awkwardly (it needs a workaround, a lot of duplication, a `{ text }` fallback, or an existing structure stretched beyond what it's for), **stop and ask whether a change to the model would fit better.** Propose it to the user: the problem, which recipes it affects, the proposed change to the schema or build, and the cost of leaving things as they are. Don't change the model, schema or `build.js` without approval. Until it's decided, extract with the best existing structure and note the workaround in the summary. Once a change is approved, update `schema/`, `build.js`, `CLAUDE.md` and this guide together, and re-check any recipes already extracted that it affects.
4. **Don't invent data.** If the source has no yield, time or serving count, leave it out, or estimate it and **say so in `notes`** ("Yield of 12 tbsp is an estimate"). A figure that follows directly from the recipe isn't invented: 6 eggs each wrapped in filling make 6 Scotch eggs, so give that yield.
5. **Record changes of substance.** Set `source.adapted: true`, with `source.changes` saying what changed (kept for the record, not shown), only when what the cook does or uses changes in meaning: different ingredients or amounts, or different instructions. Rewording, tidying, dropping framing from the source ("match-day"), reordering options or choosing a different default don't count. Don't repeat the change in `notes` when the steps already say it.
6. **Get every recipe approved.** Show the user a short summary (structure chosen, new catalogue entries, estimates, any changes from the source, any model concerns, the proposed image) before finishing. Each source route starts one recipe at a time and moves to small batches once the process has settled (see the skill's Batching section).
7. **Validate before you're done:** `node build.js --check` must pass. Deal with any warnings as well, or explain them.

## Reading sources

- **Start with `node tools/fetch-source.mjs <url | file>`**, which saves a snapshot of the source in `.extraction/` (gitignored) for extraction and review.
- **Google Drive** is where most source files live. The user downloads them when they're needed. Never commit source files to the repo; record the Drive link in `source.drive`.
- **Websites:** use the page's schema.org `Recipe` JSON-LD first (it's structured and reliable), then the visible page to check it or fill gaps. Structured data often leaves out notes, tips and variations, so always read the page text too.
- **PDFs:** read the text directly. Scanned PDFs are treated like images.
- **Word docs:** converted to text with macOS `textutil` (no install needed); `fetch-source.mjs` does this.
- **Images and photos:** read them visually and take extra care: check quantities and fractions twice.
- **US sources:** convert units and ingredient names (see below).
- **Reference material** (temperature charts, technique guides) isn't a recipe. Skip it and list it for later.

## Metadata

- `id`: snake_case from the title (`thai_red_curry`), the same as the filename. Check it isn't already taken.
- `title`: sentence case ("Fluffy American pancakes").
- `course`: `main, side, starter, dessert, baking, breakfast, sauce, drink, snack, basic`. `basic` is for building blocks such as stocks, pastes and doughs.
- `tags`: IDs from `tags.json`, each in one group: cuisine (`thai`), dish (`curry`), main ingredient (`lamb`), occasion (`christmas`), diet (`vegetarian`) and method (`bbq`, `deep_fry`). Use an existing tag where one fits; otherwise add it to `tags.json` with a `name` and `group`, and list new tags in the approval summary. Meal type isn't a tag: it's `course`.
  - Tags are how recipes are found: search covers titles, tags, course and choice option titles, but **not ingredients**. Tag the headline ingredient (`lamb`, `cod`) unless it's already in the title or an option title, and only ingredients someone would search for, never salt, onions and the like.
- `serves`: a number. For "Serves 6–8", use 6 and mention the range in `notes` if it matters. Use `yield` for things measured by quantity: `{ "qty": 300, "unit": "g" }`; for things counted, `{ "qty": 12, "name": "pancakes" }`, so it scales; text only for what a number can't describe ("a 23cm cake").
- `time`: minutes as integers (`prep`, `cook`, optional `marinate`, `rest` or `total`). Use `marinate` for marinating ("Marinate 2 days" in the header). Omit times the source doesn't give; don't guess, but adding up the times a method states isn't guessing.
- `source`, always filled in:
  - `{ "type": "web", "url": "…", "title": "Site name" }`
  - `{ "type": "book", "title": "…", "author": "…", "page": 112 }`
  - `{ "type": "file", "name": "Grandma's scones.pdf", "drive": "https://drive.google.com/…" }`
  - `{ "type": "own" }`
  - plus `"adapted": true` when it's been changed from the original.

## Choosing a structure

Work through these in order and use the **simplest** option that keeps the method faithful. If none fits cleanly, see principle 3: propose a model change rather than forcing it.

| Situation | Use |
|---|---|
| The recipe groups its ingredients or steps ("For the icing") | `{ "heading": … }` entries in `ingredients` and `steps` |
| A sub-recipe with its own method, used only in this recipe | an **inline part**: `{ "key": …, "recipe": { …inline recipe… } }` |
| A sub-recipe that other recipes use (or could use): rice, pastes, stocks, doughs | its **own file**, referenced with `{ "key": …, "recipe": "<id>" }` |
| Alternatives that each fit **one block** of the method (Scotch egg fillings) | a **choice part** whose options have their own steps; a parent step embeds it with `{ "part": "<key>" }` |
| Alternatives that differ at **a few points** in the method (chicken browned first, seafood added at the end) | a **choice part** whose options carry only ingredients, plus parent steps with `"only": { "<key>": ["<option>"] }` |
| **Cooking methods** (oven, sous vide, slow cooker) | the same as any other alternative, by how much differs: a `method` choice whose options have their own steps, embedded where the cooking happens; or options with no steps plus `only` steps. It's independent of other choices: `only` can name both (`{ "protein": ["chicken"], "method": ["sous_vide"] }`) and the step shows when both match. Give each option its own `time` when the methods take different times: it's the **whole recipe's** time with that option (its fields replace the recipe's), so the header shows the right time for the chosen method. Where the source gives a range, use the top of it. |
| An alternative that only exists for **one option** (lamb shoulder has one method, lamb leg has oven or sous vide) | a **choice inside the option** (the `leg` option has its own `method` choice), if cooking the lamb is self-contained. The parent's steps can't use `only` on a nested choice, so if the nested option changes the parent's later steps (sous-vide leg added at the end instead of braised), use **one flat choice** instead: shoulder / leg, roasted / leg, sous vide. |
| Alternatives whose **whole method** differs | **separate recipes** that share parts |
| Small tweaks ("use self-raising flour for extra fluffiness") | `notes` |

Rules that apply throughout:
- If many steps need `only` on two choices at once, the combinations are multiplying: separate recipes are probably clearer.
- **No change lists or patch-style variants**, and no copying a whole recipe as a variant.
- Steps embed **whole parts**. Never refer to an individual step inside a part.
- The parent's steps **set the order across parts**: write them so the cook knows when to start each part ("Start the rice so it's ready when the curry is"). A parent with no steps shows its parts one after another.
- **Before creating a shared part, check `recipes/`** for an existing one (rice, stock, pastry…). If a new recipe needs something that is inline elsewhere, move it into its own file and reference it from both.
- Inline IDs only need to be unique within the file. Use short names (`chorizo`, not `scotch_eggs_filling_chorizo`).
- `listed: false` is only for shared files that aren't interesting on their own (e.g. a spice blend). Inline parts are never listed anyway.
- **Amounts of a part:** if the parent uses only some of a part, give the part a `yield` and the parent a `use` in the same units (`use: { qty: 4, unit: "tbsp" }` of a 12 tbsp paste). Mark recipes normally made in bulk and frozen with `batch: true`.

## Ingredients

**Map every ingredient to the catalogue (`ingredients.json`).**
1. Look for an existing ID first, including its `aliases` ("cilantro" maps to `coriander`, "all-purpose flour" to `plain_flour`).
2. Only add a new entry when nothing matches. IDs are lowercase snake_case, **singular** and **without preparation** (`onion`, not `chopped_onions`). Different products get different IDs (`plain_flour` vs `self_raising_flour`, `chicken_thigh` vs `chicken_breast`).
3. New entries need:
   - `name` in sentence case, exactly as it should be displayed ("Gruyère", "Thai basil");
   - `plural` for countable items ("Eggs", "Lime leaves");
   - `aliases` for synonyms, including US names;
   - `staple: true` for things that are always in stock (salt, pepper, oils, water);
   - `scaling` when it isn't linear:

| `scaling` | Use for |
|---|---|
| `seasoning` | salt, soy sauce, fish sauce, shrimp paste, stock cubes |
| `strong_spice` | fresh and dried chilli, cayenne, chilli flakes, black and white pepper, cloves, star anise, cinnamon sticks |
| `leavening` | baking powder, bicarbonate of soda, yeast |
| `fixed` | rarely right for a whole catalogue entry; use it as a per-line override |
| `linear` (default) | everything else, including garlic, ginger, herbs and ground spices used for bulk flavour |

**Ingredient lines:**
- `qty` is a **number**: ½ becomes `0.5`, 1½ becomes `1.5`. Ranges use `qtyMax` ("8–10 chillies" becomes `qty: 8, qtyMax: 10`).
- `prep` is what you **do** to it ("finely chopped", "melted and cooled"). `note` is **description or alternatives** ("large", "or ginger", "400ml, full-fat").
- For "to taste", "for frying" or "to season", leave out `qty` and give a `note`.
- A line that shouldn't scale with servings (e.g. oil for deep-frying) gets `"scaling": "fixed"`.
- "To serve" or garnish items that aren't essential get `"optional": true`.
- The same ingredient used in several places stays as **separate lines** with the same `item`. The shopping list merges them.
- `{ "text": … }` is a last resort for lines that really don't fit.
- **Spare or standby amounts** ("+ 200ml spare stock") get their own line with a note ("additional, if needed"), or are folded into the main line if every method uses them. Check that each option's steps agree with the lines: an option that uses "all the stock" leaves no spare for a later step.
- **An ingredient used only by one option** ("+ 1 tbsp oil for Variant A only") goes in that option's ingredients, not the shared list.

## Units

Allowed units: `g kg ml l tsp tbsp cm clove tin pack pinch handful sprig bunch slice stick sheet`, or no unit for countable things ("3 eggs").

Convert during extraction:
- **Cups depend on the ingredient:**
  - plain or self-raising flour about 125g;
  - caster or granulated sugar about 200g, brown sugar about 220g, icing sugar about 120g;
  - butter about 225g, and a US stick of butter is about 113g;
  - rice about 185g, oats about 90g, grated cheese about 100g;
  - liquids about 240ml.
  - For anything else, look up a density rather than guessing.
- **oz to g:** × 28.35. **lb to g:** × 453.6. **fl oz to ml:** × 29.6 (US) or × 28.4 (UK). A **pint** is 473ml (US) or 568ml (UK); check which the source means.
- **Temperatures in steps:** °F to °C, rounded to the nearest 10 as UK conversion tables do (350°F is 180°C, 400°F is 200°C). Where the source gives both, keep the °C. Keep the source's fan or conventional wording, and gas marks if given.
- **Fan ovens:** every oven temperature gives the fan figure too. Where the source doesn't, add one 20°C lower in brackets: "220°C (200°C fan, gas mark 7)". A source that doesn't say is taken as conventional. Not for oil, sugar or water-bath temperatures. `draft.mjs` adds them and `lint.mjs` checks.
- **Tins and packs:** use `unit: "tin"` with the size in `note` ("400ml").
- **Lengths** ("5cm piece of ginger") use `cm`.

## Steps

- Keep the source's method, lightly tidied: UK English, one action per step where that's natural, temperatures in °C.
- Steps that embed a part say briefly what's happening ("Make the filling."). The part's own steps hold the detail.
- Use `{ "heading": … }` to group steps when the source does.
- **Amounts in step text don't scale.** Where the source says "add 4 tbsp of the paste" or "pour in 100ml of the stock", prefer wording that stays right when the recipe is scaled ("add the paste", "half the stock"), unless it's a fixed amount. Don't change the method to do it. `tools/lint.mjs` points these out.

## Images

- Propose an image from the source and **get approval**. Never use stock photos.
  - Websites: the JSON-LD `image` or the page's `og:image`.
  - PDFs: extracted embedded images (`pdfimages`) or a crop of the rendered page.
  - Word docs: the image files embedded in the `.docx` file.
  - Photos: crop.
- Resize to about 1000px on the longest side (macOS: `sips -Z 1000`), save as `images/<id>.jpg`, and set `"image": "images/<id>.jpg"`.
