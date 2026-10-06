export function parseCsv(input: string): string[][];
export function stringifyCsv(rows: readonly (readonly unknown[])[]): string;
export function reviewHeader(code: string): string[];

export interface ReviewError {
  key: string;
  reason: string;
}

export function applyReviewedRows(options: {
  rows: string[][];
  code: string;
  catalog: Record<string, string>;
  source: Record<string, string>;
  en: Record<string, string>;
  context: Record<string, { note?: string; maxLen?: number; sameAsSource?: string[] }>;
}): {
  catalog: Record<string, string>;
  source: Record<string, string>;
  changedKeys: string[];
  errors: ReviewError[];
};
