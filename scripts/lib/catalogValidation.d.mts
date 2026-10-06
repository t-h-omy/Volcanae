export interface CatalogContextEntry {
  note?: string;
  maxLen?: number;
  sameAsSource?: string[];
}

export type Catalog = Record<string, string>;

export interface ValidationError {
  rule: string;
  locale: string;
  key: string;
  reason: string;
}

export function validateReviewedMessage(options: {
  locale: string;
  key: string;
  message: string;
  enMessage: string;
  contextEntry?: CatalogContextEntry;
}): string[];

export function validateCatalogs(options: {
  catalogs: Record<string, Catalog>;
  sources: Record<string, Catalog>;
  context: Record<string, CatalogContextEntry>;
  locales: readonly string[];
}): ValidationError[];
