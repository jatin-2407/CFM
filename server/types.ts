import type { IncomingMessage, ServerResponse } from 'http';
import type { Group } from '../core/types';

export interface Project { id: string; name: string; file: string | null; created: string; seeded: string; messages: number }
export type Tree = { [id: string]: Group | Tree };
export interface Leaf { path: string; pattern: string[]; messages: string[]; labels: string[] }
export type Body = Record<string, any>;
export type Handler = (req: IncomingMessage, res: ServerResponse, dir: string) => unknown;
export type LabelsByPattern = Map<string, { labels: string[]; key: string } | null>;
