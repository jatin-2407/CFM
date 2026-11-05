// Files in a project folder.
export enum ProjectFile {
    PROJECT = 'project.json',
    WORD_TO_NUM = 'wordtonum',
    CFM_RES = 'CFMRes',
    PREVIOUS = '.previous',
}

// Lines of the POST /api/seed answer.
export enum SeedEvent {
    START = 'start',
    PROGRESS = 'progress',
    DONE = 'done',
    ERROR = 'error',
}

export const DEFAULT_PORT = 4000;
// Only this machine can reach the GUI.
export const DEFAULT_HOST = '127.0.0.1';
// Largest request body (a seed's text).
export const BODY_LIMIT = 256 * 1024 * 1024;
// Project ids: 24 hex chars.
export const PROJECT_ID = /^[a-f0-9]{24}$/;
export const NAME_MAX_LENGTH = 120;
// Static files served from public/, by extension; anything else is 404.
export const CONTENT_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.svg': 'image/svg+xml',
};
