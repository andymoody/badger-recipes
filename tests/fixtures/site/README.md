# Sample data for the browser tests

A small, made-up collection used by `tests/site.test.mjs`. It isn't a real recipe set: it exists
to exercise the page's features (shared batch parts, an unlisted part, a choice with conditional
steps, a choice inside a choice, a yield-only recipe, headings, optional and staple lines) without
depending on the real collection, which will change as recipes are extracted.

The test copies this folder to a temporary directory and runs `build.js --root` on it, so it must
always pass the build.
