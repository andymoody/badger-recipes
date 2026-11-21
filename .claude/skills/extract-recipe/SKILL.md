---
name: extract-recipe
description: Extract a recipe from a source (web page, PDF, photo, Word doc or pasted text) into this repo's recipe files, with mechanical steps scripted, an independent review against the source by a separate agent, and a retrospective on the process. Use when adding, importing, extracting or re-extracting a recipe, or working through docs/migration.md.
---

# Extract a recipe

This is the **process**. The rules it applies live elsewhere; read them before the first recipe of a session, and don't rely on memory:
- `docs/extraction.md`: how to read sources, choose a structure, map ingredients, convert units.
- `CLAUDE.md`: the data model, and how to treat it (propose model changes, never work around them, never change a recipe's method to fit).
- `docs/migration.md`: the checklist of recipes, each recipe's status, the batching mode for each route, and the process log.

Work in phases, in order. Scripts do the mechanical work; your judgement goes into structure, fidelity and the questions for the user.

## 0. Before starting
- Find the recipe's row in `docs/migration.md` (during the migration) and note its **route**: `web` (websites) or `document` (PDF, image, Word doc, text). Check the route's mode (individual or batch) in the Process status table.
- Search the old titles with `node tools/old-recipe.mjs`, which allows for different spellings ("youvetsi" finds "Giouvetsi"). If the source is a new version of an old recipe, record that in its row straight away.
- Check `recipes/` for an existing or near-duplicate recipe, and for shared parts it could reuse (rice, stock, pastry).
- Look up the old entry: `node tools/old-recipe.mjs <words from the title>`. It's not a source. You'll compare it with the source in phase 3.

## 1. Snapshot the source
```sh
node tools/fetch-source.mjs <url | file> --slug <id>
```
This writes `.extraction/<id>/` (gitignored). It's what the reviewer reads, so everything you rely on must be in it:
- **Web:** the JSON-LD recipe (`recipe.json`), `source.md` (structured data and page text) and `page.html`. If a plain request fails or finds no recipe data, it retries in headless Chrome. If both fail, ask the user to save the page (File > Save Page As) and pass the `.html` file. If `meta.json` says `structured: false`, read the recipe from the page text.
- **Word, RTF, ODT and text files:** `source.md` holds the text from `textutil`; images in a `.docx` are in `media/`.
- **PDFs and images:** the file is copied into the snapshot. Read it with the Read tool and check every quantity and fraction twice.
- **For any source without structured data**, write a **Transcription** at the end of `source.md` (under `## Transcription`), faithful to the source, in this layout:
  ```
  Title: Grandma's scones
  Serves: 8                 (or Yield: 12 scones)
  Time: prep 15, cook 12
  ### Ingredients
  - 225g self-raising flour
  #### For the topping        (a group heading)
  ### Method
  1. Heat the oven to 220°C.
  ### Notes
  Anything else: tips, variations, serving suggestions.
  ```
  Transcribe exactly what the source says; don't convert or tidy here.
- **Google Drive files:** the user downloads them. Ask for the Drive link for `source.drive`.

## 2. Draft (mechanical)
```sh
node tools/draft.mjs .extraction/<id> --id <id>     # add --pints us for American sources
```
This writes `draft.json` and `draft-report.md` in the snapshot (never in `recipes/`). The draft has amounts parsed and converted to metric, catalogue matches, °F converted to °C in the steps, and servings, times and source filled in. Work through **every** line of the report:
- `NEW:<id>` items: map onto an existing entry if one is right (check the candidates), otherwise add a catalogue entry (`docs/extraction.md`, Ingredients).
- Matches "without descriptors" and "ends with" candidates: confirm it's the same product.
- Warnings (density needed, vague amounts, two ingredients in one line, US/UK pints): resolve each one, and put estimates in `notes`.
- Check the guessed course, and the title's case.

## 3. Structure and finish (judgement)
- Choose the structure with the decision guide in `docs/extraction.md`. Look for variations in **all** of the source: the method, the notes, and the page text that the structured data left out ("for a vegetarian version…", "can also be slow-cooked"). Decide how each one is represented: a choice, a choice with `only` steps, separate recipes sharing parts, or notes.
- Alternative cooking methods with different durations: give each option its own `time` (the whole recipe's time with that method, using the top of any range), so the header shows the time for the chosen method.
- If the model fits awkwardly, **stop and propose a model change** (`docs/extraction.md`, principle 3).
- Write `recipes/<id>.json` (and any shared part files), with tags from `tags.json` (add new tags with a group).
- Compare with the old entry. List every difference that could be the user's own adjustment, to ask about.
- Propose an image from the source (`meta.json` has the image URL), but don't download it until it's approved.

## 4. Mechanical checks
```sh
node build.js --check
node tools/lint.mjs <id>
node tools/render.mjs <id>          # the review report: structure, every variant, scaled, full batches
```
Fix every build error and lint `WARN`, or have a reason to give for it. Look at each `check`. Read the render report yourself before handing over: it's what the page will show.

## 5. Independent review (a separate agent)
Start the `recipe-reviewer` agent, one per recipe, with the Agent tool (`subagent_type: "recipe-reviewer"`). If that agent type isn't available in this session, use `general-purpose` with the instructions in `.claude/agents/recipe-reviewer.md` as its prompt.

Give it **only**: the recipe id(s), the snapshot path, and the list of files written. **Don't** pass your reasoning, the draft report or your own concerns, because independence is the point. Say whether it's a first review or a re-review.

## 6. Correct
Fix every finding the reviewer marks `error` or `issue`, or record why you disagree. Disagreements go to the user, not into the bin. Re-run phase 4. If the fixes changed anything beyond wording, run a **fresh** reviewer (a new agent, not the same one) and tell it which findings were fixed, so it can check them along with everything else.

## 7. Approval
Show the user a short summary and wait for approval:
- the recipe(s), with the structure chosen and why (and the variants it gives);
- new catalogue entries and tags;
- estimates, and changes from the source;
- differences from the old entry, as questions;
- reviewer findings and how each was resolved, including any disagreements;
- model concerns, if any;
- the proposed image.

After approval, download and resize the image if one was approved (`docs/extraction.md`, Images), set the status in `docs/migration.md` to approved, and record the source location there.

## 8. Retrospective
Answer these briefly, from what actually happened in this recipe:
1. What did the reviewer catch that the tools or this process should have caught earlier?
2. What did you fix by hand that a script could do, or do better? Which script output was wrong or noisy?
3. Was any rule in `docs/extraction.md` unclear, missing or wrong for this source?
4. Did the model fit? Is there a workaround to raise as a model proposal?

Then:
- Write a dated entry in the **Process log** in `docs/migration.md`, including "no changes" when that's the answer.
- **Propose** changes to the tools, this skill or `docs/extraction.md` to the user. Don't make them without approval. Separate one-off quirks of a source from problems that will recur, and only propose fixes for the recurring ones.
- When an approved change touches a script, add a test built from the source that showed the problem. Save a minimal fixture in `tests/fixtures/sources/` (shaped like the original, not a copy of the page).
- Update the route's counter of recipes in a row with no process changes in the Process status table.

## Batching
Each route (`web` and `document`) starts in **individual** mode: one recipe at a time through every phase, with its own approval and retrospective.
- A route moves to **batch** mode after **5 recipes in a row** whose retrospective needed no process change. If it hasn't settled after 10, raise it with the user rather than carrying on.
- **Batch mode:** up to 5 recipes from one route. Each still gets its own snapshot, checks and reviewer. They share one approval summary and one retrospective.
- Go back to individual mode for a route whenever a retrospective changes the process for it.
