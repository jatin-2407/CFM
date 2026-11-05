// Classifies a message against a project's CFMRes folder and placeholder.dat: exact pattern first, else the closest range match.
import fs from 'fs';
import { loadPatterns, readLabels } from './CFMRes';
import { parseMessage, wordKey } from './WordToNum';
import { linearEquality, readEntries } from './Utils';
import * as config from './config';
import { MATCHES_SHOWN, Tier } from './const';
import type { ClassifyResult, Match, Scored, WordToNumMap } from './types';

const keyOf = (nums: number[]): string => nums.join(',');

export class Classifier {
    private readonly cfmResDir: string;
    private readonly placeholderNums: WordToNumMap;
    private readonly patterns: number[][];
    private readonly mustAgree: Set<number>;
    private readonly exactOf = new Map<string, number>();
    private readonly agreeKeys: string[];

    // Loads the patterns (no labels) and placeholder.dat, and indexes the patterns by their nums and mustAgree values.
    constructor(cfmResDir: string, placeholderFile: string) {
        if (!fs.existsSync(placeholderFile)) throw new Error(`${placeholderFile} not found`);
        this.cfmResDir = cfmResDir;
        this.placeholderNums = readEntries(placeholderFile);
        this.patterns = loadPatterns(cfmResDir);
        this.mustAgree = new Set(config.CLASSIFY.mustAgree.map(p => this.placeholderNums.get(p.toLowerCase())).filter((n): n is number => Boolean(n)));
        this.patterns.forEach((nums, i) => {
            const key = keyOf(nums);
            if (this.exactOf.has(key)) throw new Error(`${cfmResDir}: two patterns have the same placeholders [${key}]`);
            this.exactOf.set(key, i);
        });
        this.agreeKeys = this.patterns.map(nums => this.agreeKey(nums));
    }

    // The mustAgree nums of a pattern, once each, sorted, as one key.
    private agreeKey(nums: number[]): string {
        return keyOf([...new Set(nums.filter(n => this.mustAgree.has(n)))].sort((a, b) => a - b));
    }

    // The placeholder of a num, found in placeholderNums (it is small, so no reverse map is kept).
    private placeholderOf(num: number): string | undefined {
        for (const [placeholder, n] of this.placeholderNums) if (n === num) return placeholder;
        return undefined;
    }

    // Patterns scoring >= threshold with the same mustAgree values as the message, best first; and the best of all.
    private rangeMatches(nums: number[], threshold: number): { range: Scored[]; best?: Scored } {
        const gap = (m: Scored) => Math.abs(this.patterns[m.i].length - nums.length);
        const scored = this.patterns.map((p, i) => ({ i, score: linearEquality(nums, p).score }))
            .sort((a, b) => b.score - a.score || gap(a) - gap(b));
        const agree = this.agreeKey(nums);
        const range = scored.filter(m => m.score >= threshold && this.agreeKeys[m.i] === agree);
        return { range, best: range[0] || scored[0] };
    }

    // Classifies one message. Labels are read once, at the end, only for the patterns shown.
    check(message: string, { threshold = config.CLASSIFY.scoreCheck }: { threshold?: number } = {}): ClassifyResult {
        const found = parseMessage(String(message || '')).filter(w => w.placeholder);
        const nums = found.map(w => this.placeholderNums.get(wordKey(w)) || 0);
        const same = this.exactOf.get(keyOf(nums));
        const exact: Scored[] = same === undefined ? [] : [{ i: same, score: 100 }];
        const { range, best } = exact.length ? { range: [], best: exact[0] } : this.rangeMatches(nums, threshold);
        const tier = exact.length ? Tier.EXACT : range.length ? Tier.RANGE : null;
        const shown = (exact.length ? exact : range).slice(0, MATCHES_SHOWN);
        const labelsOf = this.labelsOf([...shown, ...(tier && best ? [best] : [])]);
        const show = (m: Scored): Match => ({ score: m.score, labels: labelsOf.get(m.i) || [], pattern: this.patterns[m.i].map(n => this.placeholderOf(n)) });
        return {
            matched: Boolean(tier),
            tier,
            labels: tier && best ? labelsOf.get(best.i)! : [],
            score: best ? best.score : 0,
            threshold,
            counts: { exact: exact.length, range: range.length },
            matches: shown.map(show),
            pattern: best ? show(best).pattern : null,
            placeholders: found.map(w => ({ placeholder: w.placeholder, value: w.original })),
        };
    }

    // Pattern index -> its labels, for the given matches, read from labels.dat in one go.
    private labelsOf(matches: Scored[]): Map<number, string[]> {
        const indexes = [...new Set(matches.map(m => m.i))];
        if (!indexes.length) return new Map();
        const labels = readLabels(this.cfmResDir, indexes);
        return new Map(indexes.map((i, k) => [i, labels[k]]));
    }
}
