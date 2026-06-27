/** Lever public Postings API v0 response shapes. */

export interface LeverCategories {
  commitment?: string;
  department?: string;
  location?: string;
  team?: string;
  allLocations?: string[];
}

export interface LeverPosting {
  id: string;
  text: string;
  categories: LeverCategories;
  tags: string[];
  descriptionPlain?: string;
  description?: string;
  lists?: Array<{ text: string; content: string }>;
  additional?: string;
  additionalPlain?: string;
  hostedUrl: string;
  applyUrl: string;
  createdAt: number;
  updatedAt?: number;
}
