import { init, load, wordsToNums, saveWordToNum } from './WordToNum';
import * as config from './config';
import fs from 'fs';
import path from 'path';
import { newId } from './Utils';
import { GROUPS_PREFIX, Stage } from './const';
import type { Converted, Group, SeedOptions, Summary } from './types';


// pause lets other work run; every is how often (about 1% of total).
const pause = () => new Promise(setImmediate);
const every = (total?: number): number => Math.max(1, Math.floor((total || 100) / 100));

// Turns every message into nums, a batch at a time.
async function convertToNum(messages: AsyncIterable<string>, progress: (done: number) => void = () => { }): Promise<Converted[]> {
    const converted: Converted[] = [];
    let batch: string[] = [];
    const flush = async () => {
        wordsToNums(batch).forEach((result, i) => converted.push({ original: batch[i], ...result }));
        batch = [];
        progress(converted.length);
        await pause();
    };
    for await (const message of messages) {
        batch.push(message);
        if (batch.length >= config.WORD_TO_NUM.batchSize) await flush();
    }
    if (batch.length || !converted.length) await flush();
    return converted;
}

// Groups messages with the same placeholders in order, biggest group first.
async function groupByPlaceholderSequence(converted: Converted[], progress: (done: number) => void = () => { }): Promise<Group[]> {
    const byPattern = new Map<string, Group>();
    for (const [i, { placeholders, original }] of converted.entries()) {
        const key = placeholders.join(',');
        if (!byPattern.has(key)) byPattern.set(key, { pattern: placeholders, messages: [] });
        byPattern.get(key)!.messages.push(original);
        if ((i + 1) % every(converted.length) === 0) { progress(i + 1); await pause(); }
    }
    progress(converted.length);
    return [...byPattern.values()].sort((a, b) => b.messages.length - a.messages.length);
}

// Counts of the groups.
function summarize(groups: Group[], processed: number, date: Date): Summary {
    return {
        date: date.toISOString(),
        processed,                                                          // messages read
        branches: groups.length,                                            // groups (leaves) to label
        singleBranches: groups.filter(g => g.messages.length === 1).length, // groups with one message
        largestBranch: Math.max(0, ...groups.map(g => g.messages.length)),
    };
}

// Writes the summary and the groups, each under a new id, to a file in dir and returns its path.
function saveGroups(groups: Group[], summary: Summary, dir: string, date: Date): string {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${GROUPS_PREFIX}${date.toISOString().replace(/[:.]/g, '-')}.json`);
    const tree = Object.fromEntries(groups.map(g => [newId(), g]));
    fs.writeFileSync(file, JSON.stringify({ summary, tree }, null, 2));
    return file;
}


// Converts the messages, then groups them.
export async function seed(messages: AsyncIterable<string>, { dir, wordToNumDir, total, reset = true, fromDir, onProgress = () => { } }: SeedOptions) {
    if (!reset && !fromDir) throw new Error('fromDir is required when reset is false');
    if (reset && fromDir) throw new Error('fromDir is only used when reset is false');
    init(wordToNumDir);
    if (!reset) load(fromDir!);

    const converted = await convertToNum(messages, done => onProgress({ stage: Stage.WORD_TO_NUM, done, total }));
    saveWordToNum();
    const groups = await groupByPlaceholderSequence(converted, done => onProgress({ stage: Stage.GROUP, done, total: converted.length }));
    const date = new Date();
    const summary = summarize(groups, converted.length, date);
    const file = saveGroups(groups, summary, dir, date);
    return { wordToNum: { messages: converted.length }, rounds: [{ summary, file }] };
}

