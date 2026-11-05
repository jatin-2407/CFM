import type { Stage, Tier } from './const';

export interface PlaceholderRule {
    id: string;
    pattern?: RegExp;
    words?: string[];
    test?: (v: string, raw: string, prev?: string) => boolean;
    usesPrev?: boolean;
}

export interface Word { original: string; placeholder?: string }
export type WordToNumMap = Map<string, number>;

export interface Pattern { nums: number[]; labels: string[] }
export interface CFMRes { patterns: Pattern[] }

export interface Scored { i: number; score: number }
export interface Match { score: number; labels: string[]; pattern: (string | undefined)[] }
export interface ClassifyResult {
    matched: boolean;
    tier: Tier | null;
    labels: string[];
    score: number;
    threshold: number;
    counts: { exact: number; range: number };
    matches: Match[];
    pattern: (string | undefined)[] | null;
    placeholders: { placeholder?: string; value: string }[];
}

export interface Converted { original: string; nums: number[]; placeholders: string[] }
export interface Group { pattern: string[]; messages: string[]; labels?: string[] }
export interface Summary { date: string; processed: number; branches: number; singleBranches: number; largestBranch: number }
export interface Progress { stage: Stage; done: number; total?: number }
export interface SeedOptions {
    dir: string;
    wordToNumDir: string;
    total?: number;
    reset?: boolean;
    fromDir?: string;
    onProgress?: (progress: Progress) => void;
}
