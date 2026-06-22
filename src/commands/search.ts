/**
 * Search Command — Unified knowledge search across specs, knowhow, issues, and more.
 *
 * Uses WikiIndexer BM25F search with deduplication and type filtering.
 * Optional --code flag adds CodeGraph AST results in a separate section.
 */

import type { Command } from 'commander';
import { resolve, join } from 'node:path';

import { truncate, extractSnippet, highlightTerms } from '../utils/cli-format.js';
import { WikiIndexer } from '#maestro-dashboard/wiki/wiki-indexer.js';
import type { WikiEntry, WikiNodeType } from '#maestro-dashboard/wiki/wiki-types.js';
import { loadWorkspaceConfig, resolveWorkspaceLinks } from '../config/index.js';

// Valid type filter values — matches WikiNodeType.
const VALID_TYPES = ['project', 'roadmap', 'spec', 'issue', 'knowhow', 'note', 'domain'] as const;

/** A single unified search result with BM25 score and snippet. */
export interface SearchResult {
  id: string;
  type: WikiNodeType;
  title: string;
  category: string | null;
  summary: string;
  score: number | null;
  snippet: string | null;
  source: WikiEntry['source'];
  workspace?: string;
}

/** A code search result from CodeGraph. */
export interface CodeSearchResult {
  id: string;
  kind: string;
  name: string;
  filePath: string;
  score: number | null;
  signature?: string;
}

/** Options for runUnifiedSearch — type/category filters and result cap. */
export interface UnifiedSearchOptions {
  type?: string;
  category?: string;
  workspace?: string;
  limit: number;
}

// ── Lazy offline client ────────────────────────────────────────────────

let _indexer: WikiIndexer | null = null;

function getIndexer(): WikiIndexer {
  if (!_indexer) {
    const workflowRoot = resolve('.workflow');
    const projectPath = process.cwd();
    const wsConfig = loadWorkspaceConfig(projectPath);
    const resolved = resolveWorkspaceLinks(projectPath, wsConfig);
    const linkedWorkspaces = resolved
      .filter(lw => lw.valid)
      .map(lw => ({ name: lw.name, workflowRoot: lw.workflowRoot, shareTypes: lw.share }));
    _indexer = new WikiIndexer({ workflowRoot, linkedWorkspaces });
  }
  return _indexer;
}

/**
 * Unified knowledge search — BM25F ranking via WikiIndexer, with type/category
 * filtering and per-source deduplication.
 */
export async function runUnifiedSearch(q: string, opts: UnifiedSearchOptions): Promise<SearchResult[]> {
  const limit = opts.limit > 0 ? opts.limit : 20;
  const indexer = getIndexer();

  const candidateLimit = Math.max(limit * 3, 60);
  const scored = await indexer.searchWithScores(q, candidateLimit);

  let filtered = scored;
  if (opts.type) {
    filtered = filtered.filter(r => r.entry.type === opts.type);
  }
  if (opts.category) {
    filtered = filtered.filter(r => r.entry.category === opts.category);
  }
  if (opts.workspace) {
    filtered = filtered.filter(r => r.entry.source.workspace === opts.workspace);
  }

  const seen = new Set<string>();
  const deduped: typeof filtered = [];
  for (const r of filtered) {
    if (seen.has(r.entry.id)) continue;
    seen.add(r.entry.id);
    deduped.push(r);
    if (deduped.length >= limit) break;
  }

  const results = deduped.map(({ entry, score }) => ({
    id: entry.id,
    type: entry.type,
    title: entry.title,
    category: entry.category,
    summary: entry.summary,
    score,
    snippet: extractSnippet(entry.body, q),
    source: entry.source,
    workspace: entry.source.workspace,
  }));

  // Async credibility search_hits increment (best-effort, never blocks)
  if (results.length > 0) {
    incrementSearchHitsAsync(results.map(r => r.id));
  }

  return results;
}

function incrementSearchHitsAsync(entryIds: string[]): void {
  import('../graph/kg/engine.js').then(({ MaestroGraph }) => {
    const projectRoot = resolve('.');
    if (!MaestroGraph.isInitialized(projectRoot)) return;
    const mg = MaestroGraph.openSync(projectRoot);
    if (!mg) return;
    try {
      import('../graph/kg/credibility.js').then(({ CredibilityStore, wikiIdToNodeId }) => {
        const store = new CredibilityStore(mg.rawDb);
        const nodeIds = entryIds.map(wikiIdToNodeId).filter(Boolean) as string[];
        store.incrementSearchHits(nodeIds);
        mg.close();
      }).catch(() => { mg.close(); });
    } catch {
      mg.close();
    }
  }).catch(() => {});
}

/**
 * Search MaestroGraph for code nodes matching the query. Gracefully returns
 * empty when MaestroGraph is not initialized.
 */
async function runCodeSearch(q: string, limit: number): Promise<CodeSearchResult[]> {
  try {
    const { MaestroGraph } = await import('../graph/kg/engine.js');
    if (!MaestroGraph.isInitialized(resolve('.'))) return [];
    const mg = await MaestroGraph.open(resolve('.'));
    try {
      const results = mg.searchCode(q, { limit });
      return results.map((n: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        id: n.id,
        kind: n.kind,
        name: n.name,
        filePath: n.filePath,
        score: typeof n._bm25Score === 'number' ? n._bm25Score : null,
        signature: n.signature || undefined,
      }));
    } finally {
      mg.close();
    }
  } catch {
    return [];
  }
}

export function registerSearchCommand(program: Command): void {
  program
    .command('search <query...>')
    .description('Unified knowledge search across specs, knowhow, issues, and more')
    .option('--type <type>', `Filter by type: ${VALID_TYPES.join(', ')}`)
    .option('--category <cat>', 'Filter by category (e.g. coding, arch, debug, test, review, learning)')
    .option('--code', 'Include CodeGraph code results')
    .option('--all', 'Search all sources (wiki + code) with normalized ranking')
    .option('--workspace <name>', 'Filter results to a specific linked workspace')
    .option('--limit <n>', 'Max results', '20')
    .option('--json', 'Output as JSON')
    .action(async (queryParts: string[], opts) => {
      const q = queryParts.join(' ');
      const limit = parseInt(opts.limit, 10) || 20;
      const includeCode = opts.code || opts.all;

      if (opts.type && !VALID_TYPES.includes(opts.type)) {
        console.error(`Error: --type must be one of ${VALID_TYPES.join(', ')} (got "${opts.type}")`);
        process.exit(1);
      }

      let wikiResults = await runUnifiedSearch(q, { type: opts.type, category: opts.category, workspace: opts.workspace, limit });
      const codeResults = includeCode ? await runCodeSearch(q, limit) : [];

      // --all: normalize and merge scores for unified ranking
      if (opts.all) {
        const merged = mergeAndNormalize(wikiResults, codeResults, limit);

        if (opts.json) {
          console.log(JSON.stringify({ query: q, count: merged.length, results: merged }, null, 2));
          return;
        }

        console.log(`Search: "${q}" (${merged.length} results, all sources)`);
        if (merged.length === 0) {
          console.log('  No matches found.');
          return;
        }
        const isTTY = process.stdout.isTTY === true;
        const qTerms = q.toLowerCase().split(/\s+/).filter(Boolean);
        for (const r of merged) {
          const name = isTTY ? highlightTerms(r.name, qTerms) : r.name;
          const scoreTag = `  (${r.normalizedScore.toFixed(2)})`;
          console.log(`  [${r.source}] [${r.kind}]  ${name}  ${r.detail}${scoreTag}`);
        }
        return;
      }

      if (opts.json) {
        const output: Record<string, unknown> = { query: q };
        if (includeCode) {
          output.wikiResults = wikiResults;
          output.codeResults = codeResults;
          output.wikiCount = wikiResults.length;
          output.codeCount = codeResults.length;
        } else {
          output.count = wikiResults.length;
          output.results = wikiResults;
        }
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      const isTTY = process.stdout.isTTY === true;
      const qTerms = q.toLowerCase().split(/\s+/).filter(Boolean);

      if (includeCode && codeResults.length > 0) {
        console.log(`Search: "${q}" (${wikiResults.length} wiki + ${codeResults.length} code results)`);
      } else {
        console.log(`Search: "${q}" (${wikiResults.length} results)`);
      }

      if (qTerms.length > 4) {
        console.log(`  Hint: ${qTerms.length} terms detected — split into 1-3 keyword queries for better precision`);
      }

      if (wikiResults.length === 0 && codeResults.length === 0) {
        console.log('  No matches found.');
        return;
      }

      if (wikiResults.length > 0) {
        if (includeCode) console.log('  [Wiki Results]');
        for (const r of wikiResults) {
          const indent = includeCode ? '    ' : '  ';
          const typeTag = `[${r.type}]`;
          const catTag = r.category ? ` ${r.category}` : '';
          const wsTag = r.workspace ? ` [ws:${r.workspace}]` : '';
          const scoreTag = r.score !== null ? `  (${r.score.toFixed(2)})` : '';
          const title = isTTY ? highlightTerms(r.title, qTerms) : r.title;
          console.log(`${indent}${typeTag}${catTag}${wsTag}  ${r.id}  ${title}${scoreTag}`);
          if (r.snippet) {
            const snippet = isTTY ? highlightTerms(r.snippet, qTerms) : r.snippet;
            console.log(`${indent}  ${snippet}`);
          } else if (r.summary) {
            const summary = isTTY ? highlightTerms(truncate(r.summary, 80), qTerms) : truncate(r.summary, 80);
            console.log(`${indent}  ${summary}`);
          }
        }
      }

      if (codeResults.length > 0) {
        console.log('  [Code Results]');
        for (const r of codeResults) {
          const scoreTag = r.score !== null ? `  (${r.score.toFixed(2)})` : '';
          const name = isTTY ? highlightTerms(r.name, qTerms) : r.name;
          console.log(`    [${r.kind}] ${name}  ${r.filePath}${scoreTag}`);
        }
      }
    });
}

// ── Score normalization for --all mode ────────────────────────────────

interface MergedResult {
  source: 'wiki' | 'code';
  kind: string;
  name: string;
  detail: string;
  normalizedScore: number;
}

function getMinMax(scores: number[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const s of scores) {
    if (s < min) min = s;
    if (s > max) max = s;
  }
  return { min, max };
}

function mergeAndNormalize(wiki: SearchResult[], code: CodeSearchResult[], limit: number): MergedResult[] {
  const WIKI_WEIGHT = 0.6;
  const CODE_WEIGHT = 0.4;

  const wikiScores = wiki.map(r => r.score ?? 0);
  const codeScores = code.map(r => r.score ?? 0);
  const wikiMM = wikiScores.length > 0 ? getMinMax(wikiScores) : { min: 0, max: 0 };
  const codeMM = codeScores.length > 0 ? getMinMax(codeScores) : { min: 0, max: 0 };
  const wikiRange = wikiMM.max - wikiMM.min || 1;
  const codeRange = codeMM.max - codeMM.min || 1;

  const merged: MergedResult[] = [];
  for (const r of wiki) {
    const raw = r.score ?? 0;
    merged.push({
      source: 'wiki',
      kind: r.type,
      name: r.title,
      detail: r.category ? `${r.category}  ${r.id}` : r.id,
      normalizedScore: ((raw - wikiMM.min) / wikiRange) * WIKI_WEIGHT,
    });
  }
  for (const r of code) {
    const raw = r.score ?? 0;
    merged.push({
      source: 'code',
      kind: r.kind,
      name: r.name,
      detail: r.filePath,
      normalizedScore: ((raw - codeMM.min) / codeRange) * CODE_WEIGHT,
    });
  }

  merged.sort((a, b) => b.normalizedScore - a.normalizedScore);
  return merged.slice(0, limit);
}
