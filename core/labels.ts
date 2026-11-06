import fs from 'fs';
import type { CFMRes, Group, LabelsByPattern, Leaf, Tree, WordToNumMap } from './types';

const readTree = (file: string): { tree: Tree } => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeTree = (file: string, result: { tree: Tree }): void => fs.writeFileSync(file, JSON.stringify(result, null, 2));

export const isLeaf = (node: Group | Tree): node is Group => Array.isArray(node.pattern);

export const leavesOf = (tree: Tree, prefix: string[] = []): Leaf[] => Object.entries(tree).flatMap(([id, node]) => isLeaf(node)
    ? [{ path: [...prefix, id].join('.'), pattern: node.pattern, messages: node.messages, labels: node.labels || [] }]
    : leavesOf(node, [...prefix, id]));

export const readLeaves = (file: string): Leaf[] => leavesOf(readTree(file).tree);

function leafAt(tree: Tree, leafPath: string): Group | undefined {
    let node: Group | Tree | undefined = tree;
    for (const id of leafPath.split('.')) node = node && !isLeaf(node) && Object.hasOwn(node, id) ? node[id] : undefined;
    return node && isLeaf(node) ? node : undefined;
}

export function setLabel(file: string, paths: string[], label: string, remove = false): { missing?: string; leaves: { path: string; leaf: Group }[] } {
    const result = readTree(file);
    const found = paths.map(path => ({ path, leaf: leafAt(result.tree, path) }));
    const missing = found.find(({ leaf }) => !leaf);
    if (missing) return { missing: missing.path, leaves: [] };
    const leaves = found as { path: string; leaf: Group }[];
    for (const { leaf } of leaves) {
        const labels = leaf.labels = leaf.labels || [];
        const at = labels.indexOf(label);
        if (remove && at >= 0) labels.splice(at, 1);
        if (!remove && at < 0) labels.push(label);
    }
    writeTree(file, result);
    return { leaves };
}

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
    const result = readTree(file);
    const carried = { patterns: 0, messages: 0, conflicts: [] as string[][] };
    for (const leaf of Object.values(result.tree) as Group[]) {
        const key = leaf.pattern.join(',');
        if (!byPattern.has(key)) continue;
        const found = byPattern.get(key);
        if (!found) { carried.conflicts.push(leaf.pattern); continue; }
        leaf.labels = [...found.labels];
        carried.patterns++;
        carried.messages += leaf.messages.length;
    }
    writeTree(file, result);
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
