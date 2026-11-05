// Fixed values of the CFM2 engine. Settings to tune are in config.ts.

// Punctuation stuck to the ends of a value.
export const VALUE_EDGE_PUNCT = /^[,;:!?()[\]{}"'<>]+|[.,;:!?()[\]{}"'<>]+$/g;

// Splitting messages into words (WordToNum.ts).
// Splits on whitespace and these chars.
export const DELIMITERS = /[\s,;:!?()[\]{}"'&#%+\-=*/\\|_~]+/;
// A full stop between a letter or digit and a letter: "end.next" -> "end", "next".
export const MISSING_SPACE = /(?<=[\p{L}\p{N}])\.(?=\p{L})/u;
// Links and emails, which are never split.
export const LINK = /^(https?:\/\/|www\.)|@|\/|\.(com|in|net|org|co|me|ly|io)(\/|$)/i;
// Punctuation on the ends of a word: "processed." -> "processed".
export const EDGE_PUNCT = /^[.,;:!?()[\]{}"'`<>]+|[.,;:!?()[\]{}"'`<>]+$/g;

// Seed stages, as sent in progress events.
export enum Stage {
    WORD_TO_NUM = 'WORD_TO_NUM',
    GROUP = 'GROUP',
}

// How a classified message matched: all of the value sequence, or at least the threshold of it.
export enum Tier {
    EXACT = 'exact',
    RANGE = 'range',
}

// Matches given back by Classifier.check, best first.
export const MATCHES_SHOWN = 20;

// Files in a CFMRes folder.
export enum CFMResFile {
    PATTERNS = 'patterns.json',
    LABELS = 'labels.dat',
}

// labels.dat header.
export const RES_MAGIC = 'CFM2';
export const RES_VERSION = 3;

// Groups files are groups_<date>.json.
export const GROUPS_PREFIX = 'groups_';

// Most words a cache keeps (placeholder.ts, WordToNum.ts); it is emptied when full.
export const CACHE_SIZE = 50000;
// Words with a digit are values (numbers, dates, ids) that rarely repeat, so they are not cached.
export const HAS_DIGIT = /\d/;

// Bytes read from a word-to-num file at a time (16 MB).
export const READ_CHUNK = 16 * 1024 * 1024;

// Files in a word-to-num folder: meta.dat, placeholder.dat and shards/<n>.dat.
export enum WordToNumFile {
    META = 'meta.dat',
    PLACEHOLDERS = 'placeholder.dat',
    SHARDS = 'shards',
}

// meta.dat header.
export const WORD_TO_NUM_MAGIC = 'W2N1';

// Files the ordinary words are spread over, by hash. Stored in meta.dat; a folder with another count is refused.
export const SHARD_COUNT = 256;
