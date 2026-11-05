// API routes: each one checks its input and calls the core engine.
//   GET    /api/projects                        projects, newest first
//   POST   /api/seed { text, name, file, project, reset }   seeds a new project (or again); answers ndjson
//   PATCH  /api/projects/:id { name }           renames
//   DELETE /api/projects/:id                    deletes
//   GET    /api/projects/:id/leaves             the patterns to label
//   POST   /api/projects/:id/label { path(s), label }       adds a label
//   DELETE /api/projects/:id/label { path(s), label }       removes a label
//   POST   /api/projects/:id/cfmres             exports the CFMRes
//   POST   /api/projects/:id/classify { message, threshold }
//   GET    /api/projects/:id/patterns.json | labels.dat | placeholder.dat   downloads
import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { saveCFMRes } from '../core/CFMRes';
import { Classifier } from '../core/Classifier';
import { arrayMessages, newId } from '../core/Utils';
import { CFMResFile } from '../core/const';
import type { Group } from '../core/types';
import { HttpError, download, readBody, send } from './http';
import { carryLabels, labelsByPattern, perLabel, toCFMRes } from './labels';
import {
    PROJECTS_DIR, cfmResDate, cfmResDir, cleanName, defaultName, hasWordToNum, isLeaf, latestGroups, linesOf, placeholderFile,
    projectDir, projectLeaves, projectOf, readJson, restoreFiles, saveProject, stashFiles, summaryOf, wordToNumDir, writeJson,
} from './projects';
import { ProjectFile, SeedEvent } from './const';
import type { Handler, Project } from './types';

// Core modules loaded fresh on each seed and export, so edits to rules or config apply without a restart.
const FRESH = ['index', 'WordToNum', 'placeholder', 'placeholderRules', 'Utils', 'config', 'const'].map(name => path.join(__dirname, '..', 'core', `${name}.js`));
function freshCore() {
    for (const file of FRESH) delete require.cache[file];
    return { ...require('../core/index') as typeof import('../core/index'), ...require('../core/WordToNum') as typeof import('../core/WordToNum') };
}

// One classifier per project, made again when its CFMRes changes.
const classifiers = new Map<string, { date: string; classifier: Classifier }>();
function classifierOf(dir: string): Classifier {
    const date = cfmResDate(dir);
    if (!date) throw new HttpError(400, 'this project has no CFMRes yet; export it from the labelling page');
    if (!fs.existsSync(placeholderFile(dir))) throw new HttpError(400, 'this project has no word-to-num of its own; seed it again, then label and export it');
    const cached = classifiers.get(dir);
    if (cached && cached.date === date) return cached.classifier;
    const classifier = new Classifier(cfmResDir(dir), placeholderFile(dir));
    classifiers.set(dir, { date, classifier });
    return classifier;
}

// Adds or removes a label on one leaf ({ path }) or many ({ paths }), then writes the groups file once.
async function changeLabels(req: IncomingMessage, res: ServerResponse, dir: string, change: (labels: string[], label: string) => void) {
    const { path: leafPath, paths, label } = await readBody(req);
    const many = Array.isArray(paths);
    const list: unknown[] = many ? paths : [leafPath];
    if (!list.length || list.some(p => !p || typeof p !== 'string') || typeof label !== 'string' || !label.trim()) {
        return send(res, 400, { error: 'path (or paths) and label are required' });
    }
    const file = latestGroups(dir);
    const result = file ? readJson(file) : { tree: {} };
    const leaves = (list as string[]).map(p => [p, p.split('.').reduce<any>((node, id) => node?.[id], result.tree)] as [string, Group | undefined]);
    const missing = leaves.find(([, leaf]) => !leaf || !isLeaf(leaf));
    if (missing) return send(res, 404, { error: `no leaf at ${missing[0]}` });
    for (const [, leaf] of leaves) change(leaf!.labels = leaf!.labels || [], label.trim());
    writeJson(file!, result);
    if (!many) return send(res, 200, { path: leafPath, ...leaves[0][1] });
    send(res, 200, { label: label.trim(), leaves: leaves.map(([p, leaf]) => ({ path: p, labels: leaf!.labels })) });
}

// Sends a project file as a download, or 404.
function sendProjectFile(res: ServerResponse, dir: string, file: string, missing: string): void {
    if (!fs.existsSync(file)) return send(res, 404, { error: missing });
    download(res, file, projectOf(dir).name);
}

async function seedRoute(req: IncomingMessage, res: ServerResponse) {
    const { text, name, file, project: againId, reset = true } = await readBody(req);
    if (typeof text !== 'string' || !text.trim()) return send(res, 400, { error: 'text is required' });
    const again = againId ? projectDir(againId) : null;
    if (againId && !again) return send(res, 404, { error: `no project ${againId}` });
    if (typeof reset !== 'boolean') return send(res, 400, { error: 'reset must be true or false' });
    if (!reset && !(again && hasWordToNum(again))) return send(res, 400, { error: 'reset: false needs a project seeded before, with a word-to-num' });

    const messages = linesOf(text);
    const { seed } = freshCore();
    const now = new Date().toISOString();
    const old = again ? projectOf(again) : null;
    const id = old ? old.id : newId();
    const dir = again || path.join(PROJECTS_DIR, id);
    const project: Project = {
        id, name: cleanName(name) || old?.name || defaultName(file), file: typeof file === 'string' ? file : null,
        created: old ? old.created : now, seeded: now, messages: messages.length,
    };
    const oldLabels = again && latestGroups(again) ? labelsByPattern(projectLeaves(again)) : null;
    fs.mkdirSync(dir, { recursive: true });
    if (again) { classifiers.delete(dir); stashFiles(dir); }
    saveProject(dir, project);

    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    const line = (body: unknown) => res.write(JSON.stringify(body) + '\n');
    line({ type: SeedEvent.START, project, messages: messages.length });
    try {
        const previous = path.join(dir, ProjectFile.PREVIOUS);
        const result = await seed(arrayMessages(messages), {
            dir, wordToNumDir: wordToNumDir(dir), total: messages.length,
            reset, fromDir: reset ? undefined : wordToNumDir(previous),
            onProgress: progress => line({ type: SeedEvent.PROGRESS, ...progress }),
        });
        const carried = oldLabels ? carryLabels(result.rounds.at(-1)!.file, oldLabels) : undefined;
        fs.rmSync(previous, { recursive: true, force: true });
        line({ type: SeedEvent.DONE, project, ...result, carried });
    } catch (e) {
        if (again) restoreFiles(dir); else fs.rmSync(dir, { recursive: true, force: true });
        line({ type: SeedEvent.ERROR, error: (e as Error).message });
    }
    res.end();
}

const routes: Record<string, Handler> = {
    'GET /api/projects': (req, res) => {
        fs.mkdirSync(PROJECTS_DIR, { recursive: true });
        const projects = fs.readdirSync(PROJECTS_DIR).map(projectDir).filter((dir): dir is string => Boolean(dir)).map(summaryOf);
        send(res, 200, projects.sort((a, b) => b.created.localeCompare(a.created)));
    },

    'POST /api/seed': seedRoute,

    'PATCH /api/projects/:id': async (req, res, dir) => {
        const name = cleanName((await readBody(req)).name);
        if (!name) return send(res, 400, { error: 'name is required' });
        const project = { ...projectOf(dir), name };
        saveProject(dir, project);
        send(res, 200, project);
    },

    'DELETE /api/projects/:id': (req, res, dir) => {
        const project = projectOf(dir);
        classifiers.delete(dir);
        fs.rmSync(dir, { recursive: true, force: true });
        send(res, 200, { deleted: project.id, name: project.name });
    },

    'GET /api/projects/:id/leaves': (req, res, dir) => {
        send(res, 200, { project: { ...projectOf(dir), cfmRes: cfmResDate(dir) }, leaves: projectLeaves(dir) });
    },

    'POST /api/projects/:id/label': (req, res, dir) => changeLabels(req, res, dir, (labels, label) => {
        if (!labels.includes(label)) labels.push(label);
    }),

    'DELETE /api/projects/:id/label': (req, res, dir) => changeLabels(req, res, dir, (labels, label) => {
        if (labels.includes(label)) labels.splice(labels.indexOf(label), 1);
    }),

    'POST /api/projects/:id/cfmres': (req, res, dir) => {
        if (!latestGroups(dir)) return send(res, 400, { error: 'this project has no patterns to build a CFMRes from' });
        const leaves = projectLeaves(dir);
        const unlabelled = leaves.filter(leaf => !leaf.labels.length).length;
        if (unlabelled) return send(res, 400, { error: `${unlabelled} of ${leaves.length} patterns have no label yet` });
        if (!fs.existsSync(placeholderFile(dir))) return send(res, 400, { error: 'this project has no word-to-num of its own; seed it again first' });
        const { readPlaceholders } = freshCore();
        saveCFMRes(toCFMRes(leaves, readPlaceholders(wordToNumDir(dir))), cfmResDir(dir));
        send(res, 200, {
            file: cfmResDir(dir),
            patterns: leaves.length,
            messages: leaves.reduce((n, leaf) => n + leaf.messages.length, 0),
            labels: perLabel(leaves),
        });
    },

    'POST /api/projects/:id/classify': async (req, res, dir) => {
        const { message, threshold } = await readBody(req);
        if (typeof message !== 'string' || !message.trim()) return send(res, 400, { error: 'message is required' });
        if (threshold !== undefined && !(Number.isFinite(threshold) && threshold >= 0 && threshold <= 100)) {
            return send(res, 400, { error: 'threshold must be a number from 0 to 100' });
        }
        send(res, 200, classifierOf(dir).check(message, threshold === undefined ? {} : { threshold }));
    },

    'GET /api/projects/:id/patterns.json': (req, res, dir) => sendProjectFile(res, dir, path.join(cfmResDir(dir), CFMResFile.PATTERNS), 'this project has no CFMRes yet'),
    'GET /api/projects/:id/labels.dat': (req, res, dir) => sendProjectFile(res, dir, path.join(cfmResDir(dir), CFMResFile.LABELS), 'this project has no CFMRes yet'),
    'GET /api/projects/:id/placeholder.dat': (req, res, dir) => sendProjectFile(res, dir, placeholderFile(dir), 'this project has no word-to-num of its own'),
};

// The handler and project folder for a request. :id routes answer 404 for a project that does not exist.
export function match(method: string, pathname: string): [Handler?, string?] {
    if (routes[`${method} ${pathname}`]) return [routes[`${method} ${pathname}`]];
    const found = pathname.match(/^\/api\/projects\/([^/]+)(\/[A-Za-z.]+)?$/);
    const route = found && routes[`${method} /api/projects/:id${found[2] || ''}`];
    if (!route) return [];
    const dir = projectDir(found[1]);
    return dir ? [route, dir] : [(req, res) => send(res, 404, { error: `no project ${found[1]}` })];
}
