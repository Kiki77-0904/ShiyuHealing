
export type Mood = 'happy' | 'sad' | 'stressed' | 'tired' | 'anxious' | 'lonely' | 'neutral';

export interface RecipeStep {
  instruction: string;
  imagePrompt: string;
  imageUrl?: string;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  ingredients: string[];
  steps: RecipeStep[];
  moodTarget: Mood;
  mainImageUrl?: string;
  region?: string;
}

export interface DiaryEntry {
  id: string;
  date: string;
  recipeTitle: string;
  recipeImageUrls: string[];
  moodBefore: Mood;
  moodAfter: Mood;
  reflection: string;
  thought: string;
  summary?: string;
  region?: string;
}
