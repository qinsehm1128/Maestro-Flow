import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { KnowledgeGraph } from './types.js';

const DEFAULT_KG_PATH = '.workflow/codebase/knowledge-graph.json';

export function loadGraph(kgPath: string = DEFAULT_KG_PATH): KnowledgeGraph {
  const fullPath = resolve(kgPath);
  if (!existsSync(fullPath)) {
    throw new Error(`Knowledge graph not found: ${fullPath}`);
  }
  const raw = readFileSync(fullPath, 'utf-8');
  return JSON.parse(raw) as KnowledgeGraph;
}
