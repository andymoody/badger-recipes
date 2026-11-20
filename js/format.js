// Display helpers shared by the views.

export const COURSES = [
  ['main', 'Mains'], ['side', 'Sides'], ['starter', 'Starters'], ['dessert', 'Desserts'], ['baking', 'Baking'],
  ['breakfast', 'Breakfast'], ['sauce', 'Sauces'], ['drink', 'Drinks'], ['snack', 'Snacks'], ['basic', 'Basics'],
];
export const COURSE_NAMES = Object.fromEntries(COURSES);
export const COURSE_SINGULAR = {
  main: 'Main', side: 'Side', starter: 'Starter', dessert: 'Dessert', baking: 'Baking', breakfast: 'Breakfast',
  sauce: 'Sauce', drink: 'Drink', snack: 'Snack', basic: 'Basic',
};

export function minutes(n) {
  if (n < 60) return n + ' min';
  const hrs = Math.floor(n / 60), m = n % 60;
  return hrs + ' hr' + (m ? ' ' + m + ' min' : '');
}

/** Tag groups in sidebar order (the group of each tag is set in tags.json). */
export const TAG_GROUPS = [
  ['cuisine', 'Cuisine'], ['dish', 'Dish'], ['ingredient', 'Main ingredient'],
  ['occasion', 'Occasion'], ['diet', 'Diet'], ['method', 'Method'],
];

/** A tag's display name from the catalogue ("deep_fry" → "Deep-fried"), or the id with spaces. */
export const tagName = (t, data) => ((data && data.tags && data.tags[t]) || {}).name || t.replace(/_/g, ' ');
