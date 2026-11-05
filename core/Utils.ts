import crypto from 'crypto';
import fs from 'fs';
import { READ_CHUNK } from './const';
import type { WordToNumMap } from './types';

// Moved here from index.ts: the classifier scores value order with it too.
// Linear (order) equality of two arrays, gaps allowed.
// Finds the longest common subsequence (same elements in the same order, not necessarily
// next to each other). score = average of LCS/A.length and LCS/B.length, so
// [1,2,3,4,5] vs [1,2,3,4] = (4/5 + 4/4) / 2 = 90%.
// gaps = elements of A and B that are not part of the common sequence, in order.
export const linearEquality = <T>(A: T[], B: T[]): { score: number; gaps: T[] } => {
    if (!A.length && !B.length) return { score: 100, gaps: [] };
    if (!A.length || !B.length) return { score: 0, gaps: [...A, ...B] };
    const n = A.length, m = B.length;
    // lcs[i][j] = LCS length of A[i..] and B[j..]
    const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            lcs[i][j] = A[i] === B[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
    }
    const gaps: T[] = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (A[i] === B[j]) { i++; j++; }
        else if (lcs[i + 1][j] >= lcs[i][j + 1]) gaps.push(A[i++]);
        else gaps.push(B[j++]);
    }
    while (i < n) gaps.push(A[i++]);
    while (j < m) gaps.push(B[j++]);
    const common = lcs[0][0];
    const score = ((common / n + common / m) / 2) * 100;
    return { score: Number(score.toFixed(2)), gaps };
}

// Yields the messages of an array one by one.
export async function* arrayMessages(list: string[]): AsyncGenerator<string> {
    for (const message of list) yield message;
}

// Returns a new unique id: 24 random hex chars.
export const newId = (): string => crypto.randomBytes(12).toString('hex');

// A number as 4 bytes, uint32 little-endian.
export const u32 = (n: number): Buffer => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };

// FNV-1a hash of a text: the same text always gives the same number, and texts spread evenly.
export function hashOf(text: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
    return hash >>> 0;
}

// Writes word -> num pairs to file as [count] then per pair [num][byteLength][utf-8 word], all uint32 LE.
export function writeEntries(file: string, map: WordToNumMap): void {
    const words = [...map.keys()].map(word => Buffer.from(word, 'utf8'));
    const buf = Buffer.allocUnsafe(4 + words.reduce((sum, b) => sum + 8 + b.length, 0));
    let off = buf.writeUInt32LE(map.size, 0);
    let i = 0;
    for (const num of map.values()) {
        const word = words[i++];
        off = buf.writeUInt32LE(num, off);
        off = buf.writeUInt32LE(word.length, off);
        off += word.copy(buf, off);
    }
    if (off !== buf.length) throw new Error(`${file}: size mismatch`);
    fs.writeFileSync(file, buf);
}

// Reads a file written by writeEntries, in chunks so any size works.
export function readEntries(file: string): WordToNumMap {
    const fd = fs.openSync(file, 'r');
    try {
        let buf = Buffer.allocUnsafe(READ_CHUNK);
        let off = 0, end = 0;
        // Makes sure the next n bytes are in buf, reading more of the file as needed.
        const need = (n: number) => {
            if (end - off >= n) return;
            if (n > buf.length) { const bigger = Buffer.allocUnsafe(n); buf.copy(bigger, 0, off, end); buf = bigger; }
            else buf.copy(buf, 0, off, end);
            end -= off; off = 0;
            while (end < n) {
                const read = fs.readSync(fd, buf, end, buf.length - end, null);
                if (!read) throw new Error(`${file} is damaged: it ends too early`);
                end += read;
            }
        };
        need(4);
        const count = buf.readUInt32LE(off);
        off += 4;
        const map: WordToNumMap = new Map();
        for (let i = 0; i < count; i++) {
            need(8);
            const num = buf.readUInt32LE(off);
            const len = buf.readUInt32LE(off + 4);
            off += 8;
            need(len);
            map.set(buf.toString('utf8', off, off + len), num);
            off += len;
        }
        return map;
    } finally {
        fs.closeSync(fd);
    }
}
