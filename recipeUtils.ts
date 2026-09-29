import { RecipeItem } from './types';

/**
 * Normalizes raw JSON entries by assigning the default type 'recipe' 
 * if 'type' is undefined.
 */
export function normalizeRecipeData(data: Partial<RecipeItem>[]): RecipeItem[] {
  return data.map((item) => ({
    ...item,
    type: item.type ?? 'recipe',
  })) as RecipeItem[];
}
