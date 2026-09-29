export type ItemType = 'recipe' | 'reference_guide';

export interface TemperatureEntry {
  doneness: string;
  tempRange: string;
  timeRange: string;
  description: string;
}

export interface RecipeItem {
  id: string;
  title: string;
  category: string;
  keywords: string;
  prepTime: string;
  cookTime: string;
  servings: string;
  image: string;
  type?: ItemType; // Optional: defaults to 'recipe'
  ingredients: string[];
  instructions: string[];
  temperatureChart?: TemperatureEntry[]; // Optional: populated for reference guides
  notes?: string;
}
