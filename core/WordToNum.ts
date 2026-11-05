import fs from 'fs';
import path from 'path';
import { getPlaceholder } from './placeholder';
import { hashOf, readEntries, writeEntries } from './Utils';
import * as config from './config';
import { CACHE_SIZE, HAS_DIGIT, DELIMITERS, EDGE_PUNCT, LINK, MISSING_SPACE, SHARD_COUNT, WORD_TO_NUM_MAGIC, WordToNumFile } from './const';
import type { Word, WordToNumMap } from './types';

let nextIndex = 0;
let outDir = '';
let fromDir = '';
const placeholderNums: WordToNumMap = new Map();
const shards = new Map<number, WordToNumMap>();
const dirty = new Set<number>();

const tmpOf = (dir: string): string => `${dir}.tmp`;
const shardFile = (dir: string, shard: number): string => path.join(dir, WordToNumFile.SHARDS, `${shard}.dat`);
const shardOf = (key: string): number => hashOf(key) % SHARD_COUNT;

// Starts an empty word-to-num that saveWordToNum writes to dir.
export function init(dir: string): void {
    if (!dir) throw new Error('init needs the folder to save the word-to-num to');
    nextIndex = 0;
    outDir = dir;
    fromDir = '';
    placeholderNums.clear();
    shards.clear();
    dirty.clear();
    fs.rmSync(tmpOf(dir), { recursive: true, force: true });
    fs.mkdirSync(path.join(tmpOf(dir), WordToNumFile.SHARDS), { recursive: true });
}

// Continues the saved word-to-num in dir: its placeholders now, its shards when a word needs them.
export function load(dir: string): void {
    if (!dir) throw new Error('load needs a word-to-num folder');
    if (!outDir) throw new Error('load needs init first');
    if (nextIndex || placeholderNums.size || shards.size) throw new Error('load needs an empty word-to-num; call init first');
    nextIndex = readMeta(dir);
    fromDir = dir;
    for (const [word, num] of readPlaceholders(dir)) placeholderNums.set(word, num);
}

// Reads nextIndex from meta.dat. Throws if it is not a word-to-num folder or has another shard count.
function readMeta(dir: string): number {
    const file = path.join(dir, WordToNumFile.META);
    if (!fs.existsSync(file)) throw new Error(`${dir} is not a word-to-num folder: no ${WordToNumFile.META}`);
    const buf = fs.readFileSync(file);
    if (buf.length !== 12 || buf.toString('latin1', 0, 4) !== WORD_TO_NUM_MAGIC) throw new Error(`${file} is damaged`);
    if (buf.readUInt32LE(8) !== SHARD_COUNT) throw new Error(`${dir} has ${buf.readUInt32LE(8)} shards, not ${SHARD_COUNT}`);
    return buf.readUInt32LE(4);
}

// The placeholder -> num map of a saved word-to-num: all the classifier and the CFMRes export need.
export function readPlaceholders(dir: string): WordToNumMap {
    const file = path.join(dir, WordToNumFile.PLACEHOLDERS);
    if (!fs.existsSync(file)) throw new Error(`${file} not found`);
    return readEntries(file);
}

// The words of a shard, loaded on first use; the least recently used one is written out when too many are loaded.
function shard(index: number): WordToNumMap {
    let map = shards.get(index);
    if (map) { shards.delete(index); shards.set(index, map); return map; }
    const own = shardFile(tmpOf(outDir), index);
    const saved = fs.existsSync(own) ? own : fromDir && shardFile(fromDir, index);
    map = saved && fs.existsSync(saved) ? readEntries(saved) : new Map();
    shards.set(index, map);
    if (shards.size > config.WORD_TO_NUM.maxLoadedShards) unloadShard(shards.keys().next().value!);
    return map;
}

// Drops a shard from memory, writing it first if it changed.
function unloadShard(index: number): void {
    if (dirty.has(index)) writeEntries(shardFile(tmpOf(outDir), index), shards.get(index)!);
    dirty.delete(index);
    shards.delete(index);
}

function splitWord(word: string): string[] {
    return word.split(DELIMITERS).filter(Boolean).map(piece => piece.replace(EDGE_PUNCT, '') || piece);
}


// The pieces a word that is not a placeholder splits into, each with its placeholder, per word without a digit.
const piecesCache = new Map<string, Word[]>();

function piecesOf(word: string): Word[] {
    let pieces = piecesCache.get(word);
    if (!pieces) {
        pieces = splitWord(word).map(piece => {
            const placeholder = getPlaceholder(piece);
            return placeholder ? { original: piece, placeholder } : { original: piece };
        });
        if (HAS_DIGIT.test(word)) return pieces;
        if (piecesCache.size >= CACHE_SIZE) piecesCache.clear();
        piecesCache.set(word, pieces);
    }
    return pieces;
}

export function parseMessage(text: string): Word[] {
    const out: Word[] = [];
    let prev: string | undefined;
    for (const spaced of text.split(/\s+/)) {
        if (!spaced) continue;
        for (const word of LINK.test(spaced) ? [spaced] : spaced.split(MISSING_SPACE)) {
            const placeholder = getPlaceholder(word, prev);
            if (placeholder) out.push({ original: word, placeholder });
            else for (const piece of piecesOf(word)) out.push(piece);
            prev = word;
        }
    }
    return out;
}

export const wordKey = ({ original, placeholder }: Word): string => (placeholder || original).trim().toLowerCase();

// The num of key in map, giving it the next num when it is new.
function numIn(map: WordToNumMap, key: string): number {
    const num = map.get(key);
    if (num) return num;
    map.set(key, ++nextIndex);
    return nextIndex;
}

// Turns texts into one num per word, and their placeholder ids in order. Words are looked up shard by shard.
export function wordsToNums(texts: string[]): { nums: number[]; placeholders: string[] }[] {
    const parsed = texts.map(parseMessage);
    const nums = parsed.map(words => new Array<number>(words.length));
    const byShard = new Map<number, [number, number, string][]>();
    parsed.forEach((words, m) => words.forEach((word, w) => {
        const key = wordKey(word);
        if (word.placeholder) { nums[m][w] = numIn(placeholderNums, key); return; }
        const index = shardOf(key);
        const list = byShard.get(index);
        if (list) list.push([m, w, key]); else byShard.set(index, [[m, w, key]]);
    }));
    for (const index of [...byShard.keys()].sort((a, b) => a - b)) {
        const map = shard(index);
        const size = map.size;
        for (const [m, w, key] of byShard.get(index)!) nums[m][w] = numIn(map, key);
        if (map.size !== size) dirty.add(index);
    }
    return parsed.map((words, m) => ({
        nums: nums[m],
        placeholders: words.flatMap(word => (word.placeholder ? [word.placeholder] : [])),
    }));
}

// Writes the word-to-num to the init folder: shards, placeholder.dat, then meta.dat; then puts it in place.
export function saveWordToNum(): void {
    if (!outDir) throw new Error('saveWordToNum needs init first');
    const tmp = tmpOf(outDir);
    for (const index of [...shards.keys()]) unloadShard(index);
    if (fromDir) {
        for (let index = 0; index < SHARD_COUNT; index++) {
            const own = shardFile(tmp, index), saved = shardFile(fromDir, index);
            if (!fs.existsSync(own) && fs.existsSync(saved)) fs.copyFileSync(saved, own);
        }
    }
    writeEntries(path.join(tmp, WordToNumFile.PLACEHOLDERS), placeholderNums);
    const meta = Buffer.alloc(12);
    meta.write(WORD_TO_NUM_MAGIC, 0, 'latin1');
    meta.writeUInt32LE(nextIndex, 4);
    meta.writeUInt32LE(SHARD_COUNT, 8);
    fs.writeFileSync(path.join(tmp, WordToNumFile.META), meta);
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.renameSync(tmp, outDir);
}
