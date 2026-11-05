// Gives a word its placeholder id (<DATE>, <NUMBER>, ...) by the rules of placeholderRules.ts, or null.
import { CACHE_SIZE, HAS_DIGIT, VALUE_EDGE_PUNCT } from './const';
import { PLACEHOLDER_RULES } from './placeholderRules';
import type { PlaceholderRule } from './types';

// A rule ready to run. placeholderOf returns the placeholder id when the word matches the rule, else null.
// v is the cleaned word, raw the word as it is, prev the word before (only for usesPrev rules).
interface Step {
    usesPrev: boolean;
    placeholderOf: (v: string, raw: string, prev?: string) => string | null;
}

// Lowercases and drops punctuation stuck to the ends ("42." -> "42").
function clean(value: string): string {
    return String(value).trim().toLowerCase().replace(VALUE_EDGE_PUNCT, '');
}

// Throws when a rule has no id, or not exactly one of pattern, words or test.
function check(rule: PlaceholderRule): void {
    const kinds = [rule.pattern, rule.words, rule.test].filter(Boolean).length;
    if (!rule.id || kinds !== 1) throw new Error(`placeholder rule ${rule.id || '(no id)'} needs an id and one of pattern, words or test`);
}

// One step for words rules next to each other: a lookup of all their words, first rule wins.
// A word that is one of their ids ("<NAME>") is that id.
function wordsStep(rules: PlaceholderRule[]): Step {
    const lookup = new Map<string, string>();
    for (const rule of rules) for (const word of rule.words!) if (!lookup.has(word)) lookup.set(word, rule.id);
    const ids = new Set(rules.map(rule => rule.id));
    return {
        usesPrev: false,
        placeholderOf: (v, raw) => {
            const id = raw.trim().toUpperCase();
            return lookup.get(v) || (ids.has(id) ? id : null);
        },
    };
}

// One step for a pattern or test rule.
function ruleStep({ id, pattern, test, usesPrev }: PlaceholderRule): Step {
    if (pattern) return { usesPrev: false, placeholderOf: v => (pattern.test(v) ? id : null) };
    return { usesPrev: !!usesPrev, placeholderOf: (v, raw, prev) => (test!(v, raw, prev) ? id : null) };
}

// Turns the rules into steps, in their order.
function compile(rules: PlaceholderRule[]): Step[] {
    rules.forEach(check);
    const steps: Step[] = [];
    for (let i = 0; i < rules.length; i++) {
        if (!rules[i].words) { steps.push(ruleStep(rules[i])); continue; }
        let j = i;
        while (j < rules.length && rules[j].words) j++;
        steps.push(wordsStep(rules.slice(i, j)));
        i = j - 1;
    }
    return steps;
}

const STEPS = compile(PLACEHOLDER_RULES);

// Per word without a digit: its cleaned form and the steps left to run, cut at the first step that matched.
// Steps that need the word before are kept, as they can only run with it.
const cache = new Map<string, { v: string; left: (string | Step)[] }>();

function resolve(value: string) {
    let found = cache.get(value);
    if (!found) {
        const v = clean(value);
        const left: (string | Step)[] = [];
        for (const step of STEPS) {
            if (step.usesPrev) { left.push(step); continue; }
            const id = step.placeholderOf(v, value);
            if (id) { left.push(id); break; }
        }
        found = { v, left };
        if (HAS_DIGIT.test(value)) return found;
        if (cache.size >= CACHE_SIZE) cache.clear();
        cache.set(value, found);
    }
    return found;
}

// Returns the placeholder id of a word, or null. prev is the word before, for rules that use it.
export function getPlaceholder(value: string, prev?: string): string | null {
    const { v, left } = resolve(value);
    for (const step of left) {
        if (typeof step === 'string') return step;
        const id = step.placeholderOf(v, value, prev);
        if (id) return id;
    }
    return null;
}
