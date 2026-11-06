import { readJson, writeJson } from './projects';
import type { CFMRes, Group, WordToNumMap } from '../core/types';
import type { LabelsByPattern, Leaf } from './types';

// Pattern -> its labels, to carry to a new seed. A pattern whose old leaves disagree gets null (left to the person).
export function labelsByPattern(leaves: Leaf[]): LabelsByPattern {
    const byPattern: LabelsByPattern = new Map();
    for (const leaf of leaves) {
        if (!leaf.labels.length) continue;
        const key = leaf.pattern.join(',');
        const labels = [...leaf.labels].sort().join('\n');
        if (!byPattern.has(key)) byPattern.set(key, { labels: leaf.labels, key: labels });
        else if (byPattern.get(key)?.key !== labels) byPattern.set(key, null);
    }
    return byPattern;
}

export function carryLabels(file: string, byPattern: LabelsByPattern) {
    const result: { tree: Record<string, Group> } = readJson(file);
    const carried = { patterns: 0, messages: 0, conflicts: [] as string[][] };
    for (const leaf of Object.values(result.tree)) {
        const key = leaf.pattern.join(',');
        if (!byPattern.has(key)) continue;
        const found = byPattern.get(key);
        if (!found) { carried.conflicts.push(leaf.pattern); continue; }
        leaf.labels = [...found.labels];
        carried.patterns++;
        carried.messages += leaf.messages.length;
    }
    writeJson(file, result);
    return carried;
}

export function perLabel(leaves: Leaf[]) {
    const labels = new Map<string, { label: string; patterns: number; messages: number }>();
    for (const leaf of leaves) for (const label of leaf.labels) {
        const entry = labels.get(label) || { label, patterns: 0, messages: 0 };
        entry.patterns++;
        entry.messages += leaf.messages.length;
        labels.set(label, entry);
    }
    return [...labels.values()];
}

export const toCFMRes = (leaves: Leaf[], placeholderNums: WordToNumMap): CFMRes => ({
    patterns: leaves.map(leaf => ({ nums: leaf.pattern.map(p => placeholderNums.get(p.toLowerCase()) || 0), labels: leaf.labels })),
});

