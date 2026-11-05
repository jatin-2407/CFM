import type { PlaceholderRule } from './types';

// Add your placeholder code here.
// Rules are checked in order and the first match gives a word its placeholder. Each rule has an id ('<DATE>')
// and one of: pattern (a regex on the cleaned word), words (a list of words), test ((v, raw, prev) => boolean).
export const PLACEHOLDER_RULES: PlaceholderRule[] = [];
