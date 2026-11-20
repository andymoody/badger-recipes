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

/** "thai_food" → "thai food" */
export const tagLabel = (t) => t.replace(/_/g, ' ');
