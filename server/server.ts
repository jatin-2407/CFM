// CFM2 GUI server: npm start, then open http://localhost:4000
import http from 'http';
import path from 'path';
import { DEFAULT_HOST, DEFAULT_PORT } from './const';
import { HttpError, send, serveFile } from './http';
import { ROOT } from './projects';
import { match } from './routes';

const PORT = Number(process.env.PORT) || DEFAULT_PORT;
const HOST = process.env.HOST || DEFAULT_HOST;
const PUBLIC_DIR = path.join(ROOT, 'server', 'public');
// The pages' .ts files, compiled for the browser.
const BUILT_PUBLIC_DIR = path.join(__dirname, 'public');

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url || '/', 'http://localhost');
        const [route, dir] = match(req.method || 'GET', url.pathname);
        if (route) return await route(req, res, dir!);
        if (req.method === 'GET' && !url.pathname.startsWith('/api/')) return serveFile(res, url.pathname, PUBLIC_DIR, BUILT_PUBLIC_DIR);
        send(res, 404, { error: 'not found' });
    } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        if (status === 500) console.error(e);
        if (res.headersSent) res.end();
        else send(res, status, { error: (e as Error).message });
    }
});

server.listen(PORT, HOST, () => console.log(`CFM2: http://localhost:${PORT}`));
