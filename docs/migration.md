# Migration: re-extracting the old collection

Step 5 of the plan in `CLAUDE.md`. Every recipe in the old collection (`recipes.json` at commit `4623299`) is re-extracted from its **original source** with the `extract-recipe` skill. The old data is only a checklist here, and a record of possible personal adjustments (`node tools/old-recipe.mjs <title words>` shows an entry).

Update this file as part of finishing each recipe, so work can carry on across sessions.

## Process status

Routes and batching are explained in `.claude/skills/extract-recipe/SKILL.md` (Batching).

| Route | Mode | Done individually | In a row with no process change |
|---|---|---|---|
| web | individual | 0 | 0 |
| document (PDF, image, Word, text) | individual | 1 | 0 |

## Recipes

- **Source**: where the original is: a URL, a book and page, or a file name with its Google Drive link.
- **Route**: `web` or `document`.
- **Status**: `not found` (no source located yet), `extracted` (recipe written and reviewed, waiting for approval), `approved`, or `skipped` (with the reason in Notes).
- **Recipe**: the file or files in `recipes/`.

Old titles are as they were. They may not be the titles the new recipes get.

| # | Old title | Old id | Old category | Source | Route | Status | Recipe | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | Alcoholic Ginger Beer | alcoholic_ginger_beer | Drinks |  |  | not found |  |  |
| 2 | Fluffy American pancakes | american_pancakes | Baking |  |  | not found |  | `recipes/american_pancakes.json` exists (step 2 example): check it against the original source. |
| 3 | Apple & cranberry sauce | apple_cranberry_sauce | Sauces |  |  | not found |  |  |
| 4 | Flat apple & vanilla tart | apple_tart | Dessert |  |  | not found |  |  |
| 5 | Banana bread | banana_bread | Baking |  |  | not found |  |  |
| 6 | Bbq pork ribs | bbq_pork_ribs | Main Course |  |  | not found |  |  |
| 7 | Homemade Beef Jerky | beef_jerky | Snacks |  |  | not found |  |  |
| 8 | Beef rendang & turmeric rice | beef_rendang_and_turmeric_rice | Main Course |  |  | not found |  |  |
| 9 | The Perfect Burger | the_perfect_burger | Main Course |  |  | not found |  |  |
| 10 | Black Pudding or Chorizo Scotch Eggs | black_pudding_scotch_eggs | Main Course |  |  | not found |  | `recipes/scotch_eggs.json` exists (step 2 example): check it against the original source. |
| 11 | Botham burgers - ½ original recipe | botham_burgers_half_recipe | Main Course |  |  | not found |  |  |
| 12 | Caipirinha sorbet | caipirinha_sorbet | Dessert |  |  | not found |  |  |
| 13 | Cambodian Chicken Amok | cambodian_chicken_amok | Main Course |  |  | not found |  |  |
| 14 | Chestnut stuffing roll | chestnut_stuffing_roll | Sides |  |  | not found |  |  |
| 15 | Chicken and Chorizo Cassoulet | chicken_and_chorizo_cassoulet | Main Course |  |  | not found |  |  |
| 16 | Simple Homemade Chicken Ramen | chicken_ramen_recipe | Main Course |  |  | not found |  |  |
| 17 | Chipotle Barbacoa Beef | chipotle_barbacoa_beef | Main Course |  |  | not found |  |  |
| 18 | Chocolate Brownies | chocolate_brownies | Baking |  |  | not found |  |  |
| 19 | Chocolate butter cream | chocolate_butter_cream | Baking |  |  | not found |  |  |
| 20 | Slow Cooked Shredded Beef Ragu Pasta | slow_cooked_shredded_beef_ragu_pasta | Main Course |  |  | not found |  |  |
| 21 | Chocolate Guinness Cake | chocolate_guinness_cake | Baking |  |  | not found |  |  |
| 22 | Crumble Recipe | crumble_recipe | Dessert |  |  | not found |  |  |
| 23 | Daffy’s Gin & Tonic Cheese Cake | daffys_gin_and_tonic_cheesecake | Dessert |  |  | not found |  |  |
| 24 | Easy chocolate cake | easy_chocolate_cake | Baking |  |  | not found |  |  |
| 25 | GINGER HONEY ROASTED PORK TENDERLOIN | ginger_honey_roasted_pork_tenderloin | Main Course |  |  | not found |  |  |
| 26 | Homemade Coleslaw | homemade_coleslaw | Sides |  |  | not found |  |  |
| 27 | Honey and Rye Sourdough Loaf | honey_and_rye_sourdough_loaf | Baking |  |  | not found |  |  |
| 28 | Honey Dijon Pork Tenderloin | honey_dijon_pork_tenderloin | Main Course |  |  | not found |  |  |
| 29 | J Sheekey's fish pie | j_sheekeys_fish_pie | Main Course |  |  | not found |  |  |
| 30 | Jerk Chicken with Rice & Peas | jerk_chicken_with_rice_and_peas | Main Course |  |  | not found |  |  |
| 31 | Lamb Raan | raan_leg_of_lamb | Main Course |  |  | not found |  |  |
| 32 | Lasagne | lasagne | Main Course |  |  | not found |  |  |
| 33 | Mexican tortilla bake | mexican_tortilla_bake | Main Course |  |  | not found |  |  |
| 34 | Millionaire’s Shortbread | millionaires_shortbread | Baking |  |  | not found |  |  |
| 35 | Mincemeat | homemade_christmas_mincemeat | Christmas |  |  | not found |  |  |
| 36 | Mince pies shortcrust pastry | mince_pies_shortcrust_pastry | Baking |  |  | not found |  |  |
| 37 | Mixed Spice | mixed_spice | Ingredients / Seasoning |  |  | not found |  |  |
| 38 | Nutella Stuffed Double Chocolate Muffins | nutella_stuffed_double_chocolate_muffins | Baking |  |  | not found |  |  |
| 39 | Authentic Spanish Paella | authentic_spanish_paella | Main Course |  |  | not found |  |  |
| 40 | Paprika pork | paprika_pork | Main Course |  |  | not found |  |  |
| 41 | Peppercorn Sauce | peppercorn_sauce | Sauces |  |  | not found |  |  |
| 42 | Plum crumble | plum_crumble | Dessert |  |  | not found |  |  |
| 43 | Pork Chops Baked in Chorizo and Black Olive Tomato Sauce | pork_chops_with_tomato_and_chorizo_sauce | Main Course |  |  | not found |  |  |
| 44 | Pork Roast With Crackle | pork_roast_with_crackle | Main Course |  |  | not found |  |  |
| 45 | Roasted Skate | roasted_skate | Main Course |  |  | not found |  |  |
| 46 | Salmon and Prawn Tagliatelle | salmon_and_prawn_tagliatelle | Main Course |  |  | not found |  |  |
| 47 | Salmon en Croute | salmon_en_croute | Main Course |  |  | not found |  |  |
| 48 | Salmon risotto | salmon_risotto | Main Course |  |  | not found |  |  |
| 49 | Salted Caramel Peanut Brittle Brownies | salted_caramel_peanut_brittle_brownies | Baking |  |  | not found |  |  |
| 50 | Tasty Sausage Casserole | tasty_sausage_casserole | Main Course |  |  | not found |  |  |
| 51 | Sausage, sage & onion stuffing | sausage_sage_and_onion_stuffing | Christmas |  |  | not found |  |  |
| 52 | Sausages with sticky onion gravy | sausages_with_sticky_onion_gravy | Main Course |  |  | not found |  |  |
| 53 | Slow Cooker Beef Brisket with BBQ Sauce | slow_cooker_beef_brisket_with_bbq_sauce | Main Course |  |  | not found |  |  |
| 54 | Slow Cooker Chicken Curry | slow_cooker_chicken_curry | Main Course |  |  | not found |  |  |
| 55 | Smoked Chipotle Chicken | smoked_chipotle_chicken | Main Course |  |  | not found |  |  |
| 56 | Smoky Hake, Beans & Greens | smokey_hake_with_beans_and_spinach | Main Course |  |  | not found |  |  |
| 57 | Classic White Sourdough Bread | sourdough_bread | Baking |  |  | not found |  |  |
| 58 | Flavoured Sourdough Bread | sourdough_bread_variations | Baking |  |  | not found |  |  |
| 59 | Sourdough Hot Cross Buns | sourdough_hot_cross_buns | Baking |  |  | not found |  |  |
| 60 | Sourdough Pancakes | sourdough_pancakes | Baking |  |  | not found |  |  |
| 61 | Authentic Sourdough Pizza | sourdough_pizzas | Main Course |  |  | not found |  |  |
| 62 | Spanish Stuffed Marrow | spanish_stuffed_marrow | Main Course |  |  | not found |  |  |
| 63 | Glazed Sprouts with Caramelised Red Onions | sprouts_with_caramelised_red_onions | Sides |  |  | not found |  |  |
| 64 | 10 Quick & Easy Steak Sauces | 10_steak_sauces | Sauces |  |  | not found |  |  |
| 65 | Tandoori Dry Rub | tandoori_dry_rub | Ingredients / Seasoning |  |  | not found |  |  |
| 66 | Thai Butternut Squash Soup | thai_butternut_squash_soup | Main Course |  |  | not found |  |  |
| 67 | The Best Spaghetti Bolognese | the_best_spaghetti_bolognese | Main Course |  |  | not found |  |  |
| 68 | Tita Em's Chicken Wings Adobo | tita_ems_chicken_wings_adobo | Main Course |  |  | not found |  |  |
| 69 | Weeknight Porchetta | weeknight_porchetta | Main Course |  |  | not found |  |  |
| 70 | White Chocolate & Ginger Cheesecake with Ginger Butterscotch Sauce | white_chocolate_ginger_cheesecake | Dessert |  |  | not found |  |  |
| 71 | Best Yorkshire Puddings | best_yorkshire_puddings | Sides |  |  | not found |  |  |
| 72 | Honey-Garlic Pork Tenderloin | honey_garlic_pork_tenderloin | Main Course |  |  | not found |  |  |
| 73 | Sous Vide Steak | serious_eats_sous_vide_steak_guide | Technique & Preparation |  |  | skipped |  | Reference guide: a separate content type, later. |
| 74 | Thai red chicken curry | (none) | Main Course |  |  | not found |  | No id in the old data. Likely the same dish as "Thai Red Curry with Chicken" (`recipes/thai_red_curry.json`): check. |
| 75 | Beer Gravy | (none) | Sauces |  |  | not found |  | Old data gives https://brooklynbrewshop.com/blogs/themash/recipe-beer-gravy |
| 76 | Sam's Toad in the Hole | sams_toad_in_the_hole | Main Course |  |  | not found |  |  |
| 77 | Felicity Cloake's Perfect Jerk Chicken | felicity_cloake_jerk_chicken | Main Course |  |  | not found |  |  |
| 78 | Traditional South African Biltong | traditional_south_african_biltong | Snacks |  |  | not found |  |  |
| 79 | Classic South African Bobotie | classic_south_african_bobotie | Main Course |  |  | not found |  |  |
| 80 | Kerala Egg Puffs | kerala_egg_puffs | Snacks |  |  | not found |  |  |
| 81 | Thai Red Curry with Chicken | thai_red_curry_with_chicken | Main Course |  |  | not found |  | `recipes/thai_red_curry.json` exists (step 2 example): check it against the original source. |
| 82 | Butternut Squash Chicken Street Tacos | butternut_squash_chicken_street_tacos | Main Course |  |  | not found |  |  |
| 83 | Crème Brûlée Cheesecake Bars | creme_brulee_cheesecake_bars | Desserts & Baking |  |  | not found |  |  |
| 84 | Rhubarb Crumble Cheesecake | janes_patisserie_rhubarb_crumble_cheesecake | Desserts & Baking |  |  | not found |  |  |
| 85 | Classic Duck Confit | duck_confit_recipetineats | Main Course |  |  | not found |  |  |
| 86 | Pork and Chickpea Stew | pork_and_chickpea_stew | Main Course |  |  | not found |  |  |
| 87 | Sous Vide Duck Confit | serious_eats_sous_vide_duck_confit | Main Course |  |  | not found |  |  |
| 88 | French Puy Lentil Ragout | french_puy_lentil_ragout | Sides |  |  | not found |  |  |
| 89 | Thai Basil Beef (Pad Gra Prow) | thai_basil_beef_pad_gra_prow | Main Course |  |  | not found |  |  |
| 90 | Slow Cooker Red Wine Beef Cheeks | slow_cooker_red_wine_beef_cheeks | Main Course |  |  | not found |  |  |
| 91 | Beef, Mushroom & Vegetable Pie | beef_mushroom_vegetable_pie | Main Course |  |  | not found |  |  |
| 92 | Ultimate Baked Mac and Cheese | baked_mac_and_cheese | Main Course |  |  | not found |  |  |
| 93 | Five-Spice Duck Noodles | five_spice_duck_noodles | Main Course |  |  | not found |  |  |
| 94 | Juicy Skillet Pork Chops | juicy_skillet_pork_chops | Main Course |  |  | not found |  |  |
| 95 | Classic Cottage Pie | classic_cottage_pie | Main Course |  |  | not found |  |  |
| 96 | Perfect Roast Beef | jamie_oliver_perfect_roast_beef | Main Course |  |  | not found |  |  |
| 97 | Easy Baked Cod | easy_baked_cod | Main Course |  |  | not found |  |  |
| 98 | Easy Family Fish Pie | family_meals_easy_fish_pie | Main Course |  |  | not found |  |  |
| 99 | Slow-Cooked Mexican Lamb Birria Tacos | lamb_birria_slow_cooked_tacos | Main Course |  |  | not found |  |  |
| 100 | Slow-Cooked Chicken Tinga Tacos | slow_cooked_chicken_tinga_tacos | Main Course |  |  | not found |  |  |
| 101 | Slow Cooker Korean Beef | slow_cooker_korean_beef | Main Course |  |  | not found |  |  |
| 102 | One Pot Chicken Orzo | one_pot_chicken_orzo | Main Course |  |  | not found |  |  |
| 103 | Sous Vide Barbecue Pulled Pork Shoulder | sous_vide_barbecue_pulled_pork_shoulder | Main Course |  |  | not found |  |  |
| 104 | Slow Cooked Lamb with Orzo (Giouvetsi) | slow_cooked_lamb_with_orzo | Main Course | Drive: lamb-yoivetsi.pdf | document | approved | `lamb_youvetsi` | Replaced by the user's own PDF version; the old A Fork & A Pencil recipe is not being extracted. |
| 105 | Genuine Cornish Pasty | genuine_cornish_pasty | Main Course |  |  | not found |  |  |
| 106 | Baked Spiced Cod with Garlic and Lemon | baked_spiced_cod_garlic_lemon | Main Course |  |  | not found |  |  |
| 107 | How to Wet Brine a Turkey | kitchn_turkey_wet_brine_guide | Christmas |  |  | skipped |  | Reference guide: a separate content type, later. |
| 108 | Braised Turkey Legs and Roasted Breast | turkey_in_parts_white_dark | Christmas |  |  | not found |  |  |
| 109 | Sous Vide Turkey Breast With Crispy Skin | sous_vide_turkey_breast_crispy_skin | Christmas |  |  | not found |  |  |

## Process log

One dated entry per recipe (or batch): what the review found, what was corrected, and the retrospective's answer, including "no process changes". Approved process changes are listed with the files they touched.

- **2026-11-21**: Extraction skill, reviewer agent and tools built (step 4). Pilot next: 2 or 3 recipes from each source type, including one with variants, one with a sub-recipe and one poor-quality source.
- **2026-11-21, lamb youvetsi** (pilot 1, document route, PDF): The user's own three-method recipe, which replaces old #104. Structure: one flat cooking-method choice (shoulder, the default; sous vide leg; roast leg), each with its own steps and time, plus a shared orzo finish.
  - **Review:** the first review found the spare-stock wording contradicted itself in two methods, amounts in notes that don't scale, and that the old entry was missed because of its different spelling. The re-review found stock wording that still clashed and a pepper twist count that didn't scale. All fixed.
  - **User decisions:**
    - match-day framing dropped;
    - shoulder made the default;
    - stock is 1.2 l in total;
    - source recorded as "PDF";
    - lemon optional;
    - `adapted` only for changes of substance.
  - **Site changes:**
    - chosen inline options switch straight into the method instead of a collapsible section;
    - the header and card times follow the chosen options.
  - **Process changes (approved):**
    - old-recipe search matches keywords and near spellings;
    - the parser handles smashed and crumbled, "dry" and "cheese", and warns about OR alternatives and extra ingredients in brackets;
    - the lint flags numbers in notes and accepts "spices" for herbs and ground spices;
    - the guide covers spare amounts and option-only ingredients;
    - the skill gets a migration-row check and the option time rule.
  - **Counter:** reset to 0 because the process changed.
