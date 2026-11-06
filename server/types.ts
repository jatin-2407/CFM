import type { IncomingMessage, ServerResponse } from 'http';

export interface Project { id: string; name: string; file: string | null; created: string; seeded: string; messages: number }
export type Body = Record<string, any>;
export type Handler = (req: IncomingMessage, res: ServerResponse, dir: string) => unknown;
