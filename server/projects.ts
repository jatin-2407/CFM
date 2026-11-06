import fs from 'fs';
import path from 'path';
import { CFMResFile, GROUPS_PREFIX, WordToNumFile } from '../core/const';
import { readLeaves } from '../core/labels';
import type { Leaf } from '../core/types';
import { NAME_MAX_LENGTH, PROJECT_ID, ProjectFile } from './const';
import type { Project } from './types';

// The compiled server runs from dist/server/, so the repo is two folders up.
export const ROOT = path.join(__dirname, '..', '..');
export const PROJECTS_DIR = process.env.CFM2_PROJECTS_DIR || path.join(ROOT, 'projects');

const readJson = (file: string): any => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file: string, value: unknown): void => fs.writeFileSync(file, JSON.stringify(value, null, 2));

export const projectDir = (id: string): string | null =>
    PROJECT_ID.test(id) && fs.existsSync(path.join(PROJECTS_DIR, id, ProjectFile.PROJECT)) ? path.join(PROJECTS_DIR, id) : null;

export const projectOf = (dir: string): Project => readJson(path.join(dir, ProjectFile.PROJECT));
export const saveProject = (dir: string, project: Project): void => writeJson(path.join(dir, ProjectFile.PROJECT), project);

export const wordToNumDir = (dir: string): string => path.join(dir, ProjectFile.WORD_TO_NUM);
export const placeholderFile = (dir: string): string => path.join(wordToNumDir(dir), WordToNumFile.PLACEHOLDERS);
export const hasWordToNum = (dir: string): boolean => fs.existsSync(path.join(wordToNumDir(dir), WordToNumFile.META));
export const cfmResDir = (dir: string): string => path.join(dir, ProjectFile.CFM_RES);

export function cfmResDate(dir: string): string | null {
    const file = path.join(cfmResDir(dir), CFMResFile.PATTERNS);
    return fs.existsSync(file) ? fs.statSync(file).mtime.toISOString() : null;
}

export function latestGroups(dir: string): string | null {
    const file = fs.readdirSync(dir).filter(f => f.startsWith(GROUPS_PREFIX)).sort().pop();
    return file ? path.join(dir, file) : null;
}

export function projectLeaves(dir: string): Leaf[] {
    const file = latestGroups(dir);
    return file ? readLeaves(file) : [];
}

export function summaryOf(dir: string) {
    const leaves = projectLeaves(dir);
    return { ...projectOf(dir), leaves: leaves.length, labelledLeaves: leaves.filter(leaf => leaf.labels.length).length, cfmRes: cfmResDate(dir) };
}

export const linesOf = (text: string): string[] => text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

export const cleanName = (name: unknown): string => typeof name === 'string' ? name.trim().slice(0, NAME_MAX_LENGTH) : '';

// Default project name: the file name without extension, plus the local date and time (messages_20261027-140512).
export function defaultName(file: string | undefined, date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    return `${(file || 'messages').replace(/\.[^.]+$/, '')}_${stamp}`;
}

// Moves a project's files into .previous while it is seeded again.
export function stashFiles(dir: string): void {
    const previous = path.join(dir, ProjectFile.PREVIOUS);
    fs.rmSync(previous, { recursive: true, force: true });
    fs.mkdirSync(previous);
    for (const f of fs.readdirSync(dir)) if (f !== ProjectFile.PREVIOUS) fs.renameSync(path.join(dir, f), path.join(previous, f));
}

// Puts the files from .previous back, dropping what the failed seed wrote.
export function restoreFiles(dir: string): void {
    const previous = path.join(dir, ProjectFile.PREVIOUS);
    for (const f of fs.readdirSync(dir)) if (f !== ProjectFile.PREVIOUS) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
    for (const f of fs.readdirSync(previous)) fs.renameSync(path.join(previous, f), path.join(dir, f));
    fs.rmSync(previous, { recursive: true, force: true });
}
