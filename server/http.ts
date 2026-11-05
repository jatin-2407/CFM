import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { BODY_LIMIT, CONTENT_TYPES } from './const';
import type { Body } from './types';

// An error that answers with its own status (400, 404, ...).
export class HttpError extends Error {
    constructor(readonly status: number, message: string) { super(message); }
}

export function send(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
}

// Reads the request body as JSON. 400 for bad JSON, 413 when too large.
export function readBody(req: IncomingMessage): Promise<Body> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > BODY_LIMIT) { req.removeAllListeners('data'); req.resume(); reject(new HttpError(413, 'request body is too large')); return; }
            chunks.push(chunk);
        });
        req.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            try { resolve(text ? JSON.parse(text) : {}); } catch { reject(new HttpError(400, 'request body is not valid JSON')); }
        });
        req.on('error', reject);
    });
}

// Sends a file as a download named <name>.<file name>.
export function download(res: ServerResponse, file: string, name: string): void {
    const safe = name.replace(/[^\w.-]+/g, '_');
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${safe}.${path.basename(file)}"` });
    fs.createReadStream(file).pipe(res);
}

// Serves a file from dir (/ is index.html); only known file types, nothing outside dir.
export function serveFile(res: ServerResponse, pathname: string, dir: string, builtDir: string): void {
    let rel: string;
    try { rel = path.normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname)); } catch { return send(res, 400, { error: 'bad url' }); }
    const type = CONTENT_TYPES[path.extname(rel)];
    const base = path.extname(rel) === '.js' ? builtDir : dir;
    const file = path.join(base, rel);
    if (!type || !file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(file).pipe(res);
}
