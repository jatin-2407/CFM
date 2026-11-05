// Saves and loads a CFMRes folder: patterns.json (each pattern's nums, no labels) and labels.dat (labels by pattern index).
import fs from 'fs';
import path from 'path';
import { CFMResFile, RES_MAGIC, RES_VERSION } from './const';
import type { CFMRes } from './types';

const MAGIC = Buffer.from(RES_MAGIC);
// labels.dat: [magic][version][patternCount], then patternCount + 1 offsets, then each pattern's labels as JSON.
const HEADER = 12;

// Throws if a pattern is not a list of nums (whole numbers > 0).
function checkNums(patterns: unknown, file: string): asserts patterns is number[][] {
    if (!Array.isArray(patterns)) throw new Error(`${file}: patterns must be a list`);
    for (const nums of patterns) {
        if (!Array.isArray(nums) || !nums.every(n => Number.isInteger(n) && n > 0 && n <= 0xffffffff)) {
            throw new Error(`${file}: a pattern must be a list of nums (a placeholder with no num is 0)`);
        }
    }
}

// Throws if two patterns have the same nums.
function checkUnique(patterns: number[][], file: string): void {
    const seen = new Set<string>();
    for (const nums of patterns) {
        const key = nums.join(',');
        if (seen.has(key)) throw new Error(`${file}: two patterns have the same placeholders [${key}]`);
        seen.add(key);
    }
}

// Writes the CFMRes to dir: the nums to patterns.json, the labels to labels.dat in the same order. Throws on bad patterns.
export function saveCFMRes(cfmRes: CFMRes, dir: string): void {
    const patterns = cfmRes.patterns.map(p => p.nums);
    checkNums(patterns, dir);
    checkUnique(patterns, dir);
    const records = cfmRes.patterns.map(p => Buffer.from(JSON.stringify(p.labels), 'utf8'));
    const head = Buffer.allocUnsafe(HEADER + 4 * (records.length + 1));
    MAGIC.copy(head, 0);
    head.writeUInt32LE(RES_VERSION, 4);
    head.writeUInt32LE(records.length, 8);
    let at = 0;
    records.forEach((record, i) => { head.writeUInt32LE(at, HEADER + 4 * i); at += record.length; });
    head.writeUInt32LE(at, HEADER + 4 * records.length);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, CFMResFile.LABELS), Buffer.concat([head, ...records]));
    fs.writeFileSync(path.join(dir, CFMResFile.PATTERNS), JSON.stringify(patterns));
}

// Reads the pattern count from the labels.dat header. Throws if it is not a labels.dat or is older.
function labelsCount(fd: number, file: string): number {
    const head = Buffer.alloc(HEADER);
    if (fs.readSync(fd, head, 0, HEADER, 0) !== HEADER || !head.subarray(0, 4).equals(MAGIC)) throw new Error(`${file} is not a labels.dat`);
    if (head.readUInt32LE(4) !== RES_VERSION) throw new Error(`${file} is from an older version of CFM2; export the CFMRes again`);
    return head.readUInt32LE(8);
}

// Reads the patterns of dir, without their labels. Throws if patterns.json and labels.dat do not belong together.
// Repeated patterns are caught by the Classifier, which keys every pattern anyway.
export function loadPatterns(dir: string): number[][] {
    const file = path.join(dir, CFMResFile.PATTERNS), labels = path.join(dir, CFMResFile.LABELS);
    for (const f of [file, labels]) if (!fs.existsSync(f)) throw new Error(`${f} not found`);
    let patterns: unknown;
    try { patterns = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error(`${file} is damaged`); }
    checkNums(patterns, file);
    const fd = fs.openSync(labels, 'r');
    try {
        if (labelsCount(fd, labels) !== patterns.length) throw new Error(`${labels} does not belong to ${file}: export the CFMRes again`);
    } finally {
        fs.closeSync(fd);
    }
    return patterns;
}

// Reads the labels of the patterns at indexes, opening labels.dat once.
export function readLabels(dir: string, indexes: number[]): string[][] {
    const file = path.join(dir, CFMResFile.LABELS);
    const fd = fs.openSync(file, 'r');
    try {
        const count = labelsCount(fd, file);
        const damaged = () => new Error(`${file} is damaged`);
        const span = Buffer.alloc(8);
        return indexes.map(i => {
            if (!(Number.isInteger(i) && i >= 0 && i < count)) throw new Error(`${file} has no pattern ${i}`);
            if (fs.readSync(fd, span, 0, 8, HEADER + 4 * i) !== 8) throw damaged();
            const start = span.readUInt32LE(0), end = span.readUInt32LE(4);
            const base = HEADER + 4 * (count + 1);
            if (end < start) throw damaged();
            const record = Buffer.alloc(end - start);
            if (fs.readSync(fd, record, 0, record.length, base + start) !== record.length) throw damaged();
            let labels: unknown;
            try { labels = JSON.parse(record.toString('utf8')); } catch { throw damaged(); }
            if (!Array.isArray(labels) || !labels.every(l => typeof l === 'string')) throw damaged();
            return labels;
        });
    } finally {
        fs.closeSync(fd);
    }
}
