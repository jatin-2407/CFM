# CFM2

CFM2 classifies strings by their placeholder sequence. It replaces the values in a string with **placeholders** and groups strings whose placeholders come in the same order.

```
"Order 1042 shipped on 01-02-2026"   →  <NUMBER> <DATE>  ┐
"Order 977 shipped on 15-03-2026"    →  <NUMBER> <DATE>  ┘ one pattern → you label it ORDER_SHIPPED
```

## How to use

Requires a recent Node.js (developed on Node 25).

### 1. Define your placeholders

Create `core/placeholders.ts` with what your strings contain: an **id** for each placeholder, the **patterns** that recognise values, and the **keys** (words that mean the same thing).

```ts
// core/placeholders.ts
export enum Placeholder {
    ORDER_ID = '<ORDER_ID>',
    DATE = '<DATE>',
    AMOUNT = '<AMOUNT>',
    SHIPPED = '<SHIPPED>',
    CANCELLED = '<CANCELLED>',
}

export const ORDER_ID_RE = /^ord-\d{4,}$/;        // ord-10423
export const DATE_RE = /^\d{1,2}-\d{1,2}-\d{4}$/; // 01-02-2026
export const AMOUNT_RE = /^\d+(\.\d{2})?$/;        // 42, 99.50

export const KEYS = {
    [Placeholder.SHIPPED]: ['shipped', 'dispatched', 'sent'],
    [Placeholder.CANCELLED]: ['cancelled', 'canceled', 'voided'],
};
```

### 2. Configure the placeholder rules

List the rules in [`core/placeholderRules.ts`](core/placeholderRules.ts). They are checked in order; the first match gives a word its placeholder.

```ts
import { Placeholder, ORDER_ID_RE, DATE_RE, AMOUNT_RE, KEYS } from './placeholders';
import type { PlaceholderRule } from './types';

export const PLACEHOLDER_RULES: PlaceholderRule[] = [
    { id: Placeholder.ORDER_ID, pattern: ORDER_ID_RE },
    { id: Placeholder.DATE, pattern: DATE_RE },
    { id: Placeholder.AMOUNT, pattern: AMOUNT_RE },
    ...Object.entries(KEYS).map(([id, words]) => ({ id, words })),
];
```

Each rule has an `id` and exactly one of:

| Field | Matches when |
|---|---|
| `pattern` | the regex matches the cleaned word (lower case, punctuation on the ends removed) |
| `words` | the cleaned word is in the list |
| `test` | `(v, raw, prev) => boolean` returns true; `v` is the cleaned word, `raw` the word as written, `prev` the word before it (set `usesPrev: true` to get it) |

Optionally, in [`core/config.ts`](core/config.ts), set `CLASSIFY.mustAgree` to the placeholders a range match must share, e.g. `[Placeholder.SHIPPED, Placeholder.CANCELLED]`.

With these rules:

```
Order ord-10423 shipped on 01-02-2026              →  <ORDER_ID> <SHIPPED> <DATE>
Order ord-20051 cancelled on 02-02-2026, refund 99.50  →  <ORDER_ID> <CANCELLED> <DATE> <AMOUNT>
```

### 3. Start the server

```sh
npm install
npm start
```

Open http://localhost:4000. The server listens on `127.0.0.1` only.

### 4. Upload your input file

**New project**, then choose the file. The input is processed line by line.

### 5. Label, export and check

1. **Label**: give each pattern one or more labels.
2. **Export CFMRes** once every pattern is labelled.
3. **Check classifier**: enter a string and see its labels, score and closest patterns.

After changing placeholders or rules, restart the server and seed the project again.

## How it works

1. **Placeholders.** Each word is checked against your placeholder rules. A match becomes its placeholder (`1042` → `<NUMBER>`); every other word stays a word.
2. **Word-to-num.** Every placeholder and word gets a number, so patterns are compared as numbers, not text.
3. **Patterns.** Strings with the same placeholders in the same order form one pattern.
4. **Classify.** A new string is matched in two steps:
   - **exact**: a pattern with exactly its placeholders, in the same order (one lookup);
   - **range**: otherwise, every pattern is scored by how many placeholders it shares in the same order, gaps allowed (longest common subsequence, 0–100). Patterns at or above the threshold match, as long as they agree on the `mustAgree` placeholders.

   The best match's labels are the answer.

## Settings

[`core/config.ts`](core/config.ts):

| Setting | Default | What it does |
|---|---|---|
| `CLASSIFY.scoreCheck` | `70` | Lowest score (0–100) for a range match |
| `CLASSIFY.mustAgree` | `[]` | Placeholder ids a range match must share with the string |
| `WORD_TO_NUM.batchSize` | `10000` | Strings turned into nums at a time while seeding |
| `WORD_TO_NUM.maxLoadedShards` | `256` | Word-to-num files kept in memory while seeding; lower it to use less memory, at some speed cost |

Environment variables for the server:

| Variable | Default | |
|---|---|---|
| `PORT` | `4000` | Port of the GUI |
| `HOST` | `127.0.0.1` | Set `0.0.0.0` to open it to your network |
| `CFM2_PROJECTS_DIR` | `projects/` | Where projects are stored |

## Use it from code

```ts
import { Classifier } from './dist/core/Classifier';

const classifier = new Classifier('projects/<id>/CFMRes', 'projects/<id>/wordtonum/placeholder.dat');
const result = classifier.check('Order ord-11880 shipped on 02-04-2026', { threshold: 70 });
// result.matched, result.tier ('exact' | 'range' | null), result.labels, result.score, result.matches, ...
```

A classifier needs only two things from a project, both downloadable from the projects page: the `CFMRes/` folder and `placeholder.dat`.

## Project files

Each project is a folder in `projects/<id>/`:

| File | What it is |
|---|---|
| `project.json` | name, source file, dates, string count |
| `groups_<date>.json` | the patterns with their strings and labels |
| `wordtonum/` | the word-to-num: `meta.dat`, `placeholder.dat` (placeholders only) and `shards/` (all other words, spread over 256 files) |
| `CFMRes/` | the exported labelled patterns: `patterns.json` (each pattern's nums) and `labels.dat` (their labels) |

Seeding a project again keeps the labels of every pattern that still exists.

## Code layout

```
core/      the engine: no HTTP, no HTML
  placeholders.ts       your placeholder ids, patterns and keys (you create it)
  placeholderRules.ts   your placeholder rules
  placeholder.ts        runs the rules on a word
  WordToNum.ts          splits strings into words and gives each a num
  index.ts              seed(): strings → patterns
  CFMRes.ts             saves and loads the CFMRes
  Classifier.ts         classifies a string
  config.ts, const.ts, types.ts, Utils.ts
server/    the GUI: API routes and pages
```

## Develop

```sh
npm run build   # compile core/, server/ and the pages to dist/
npm start       # build, then start the GUI
```
