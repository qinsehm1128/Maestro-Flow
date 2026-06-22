import type { WikiEntry } from './wiki-types.js';

/**
 * BM25F full-text search with per-field boosting.
 *
 * Uses true field-level term frequencies with independent B parameters per
 * field, replacing the previous approach of repeating title/tags strings to
 * simulate boosting (which distorted avgDocLength and TF distributions).
 */
const BM25_K1 = 1.5;

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for',
  'is', 'it', 'with', 'as', 'at', 'by', 'be', 'are', 'was', 'were',
  'this', 'that', 'from', 'but', 'not',
]);

// ---------------------------------------------------------------------------
// Query expansion: synonyms + stem variants
// ---------------------------------------------------------------------------

const SYNONYMS: ReadonlyMap<string, readonly string[]> = new Map([
  ['spec', ['specification', 'rule']],
  ['specification', ['spec']],
  ['auth', ['authentication', 'authorization', 'authorize']],
  ['authentication', ['auth']],
  ['authorization', ['auth']],
  ['config', ['configuration', 'settings']],
  ['configuration', ['config', 'settings']],
  ['settings', ['config', 'configuration']],
  ['deploy', ['deployment', 'release', 'publish']],
  ['deployment', ['deploy']],
  ['release', ['publish', 'deploy']],
  ['publish', ['release', 'deploy']],
  ['bug', ['defect', 'issue', 'fix']],
  ['error', ['exception', 'failure', 'fault']],
  ['exception', ['error']],
  ['test', ['testing', 'verify', 'assertion']],
  ['testing', ['test']],
  ['hook', ['hooks', 'lifecycle', 'callback']],
  ['delegate', ['delegation', 'dispatch']],
  ['delegation', ['delegate']],
  ['workflow', ['pipeline', 'orchestration']],
  ['pipeline', ['workflow']],
  ['knowledge', ['knowhow', 'wiki']],
  ['knowhow', ['knowledge']],
  ['wiki', ['knowledge']],
  ['command', ['cmd', 'cli']],
  ['cli', ['command']],
  ['component', ['module', 'widget']],
  ['module', ['component']],
]);

const STEM_SUFFIXES: ReadonlyArray<[RegExp, string]> = [
  [/ation$/, ''], [/tion$/, ''], [/sion$/, ''],
  [/ment$/, ''], [/ness$/, ''], [/ies$/, 'y'],
  [/ing$/, ''], [/ed$/, ''], [/er$/, ''],
  [/es$/, ''], [/s$/, ''],
];

function stemVariants(term: string): string[] {
  const variants: string[] = [];
  for (const [pattern, replacement] of STEM_SUFFIXES) {
    if (pattern.test(term)) {
      const stemmed = term.replace(pattern, replacement);
      if (stemmed.length >= 2 && stemmed !== term) variants.push(stemmed);
    }
  }
  return variants;
}

interface WeightedTerm {
  term: string;
  weight: number;
}

function expandQueryTerms(tokens: string[], index?: InvertedIndex): WeightedTerm[] {
  const seen = new Set<string>();
  const weighted: WeightedTerm[] = [];

  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    weighted.push({ term: t, weight: 1.0 });

    const syns = SYNONYMS.get(t);
    if (syns) {
      for (const s of syns) {
        const sTokens = tokenize(s);
        for (const st of sTokens) {
          if (!seen.has(st)) {
            seen.add(st);
            weighted.push({ term: st, weight: 0.3 });
          }
        }
      }
    }

    for (const v of stemVariants(t)) {
      if (!seen.has(v)) {
        seen.add(v);
        weighted.push({ term: v, weight: 0.5 });
      }
    }
  }

  // IDF-aware reweighting: boost specific terms, dampen generic ones in long queries
  if (index && tokens.length > 3) {
    const fp = index.fieldPostings;
    const N = index.totalDocs;
    if (N > 0) {
      const originals = weighted.filter(wt => wt.weight === 1.0);
      const idfs = originals.map(wt => {
        const df = fp.get(wt.term)?.length ?? 0;
        return Math.log(1 + (N - df + 0.5) / (df + 0.5));
      });
      if (idfs.length > 1) {
        const sorted = [...idfs].sort((a, b) => a - b);
        const medianIdf = sorted[Math.floor(sorted.length / 2)];
        for (let i = 0; i < originals.length; i++) {
          if (idfs[i] > medianIdf * 1.5) originals[i].weight = 1.3;
          else if (idfs[i] < medianIdf * 0.5) originals[i].weight = 0.7;
        }
      }
    }
  }

  return weighted;
}

// ---------------------------------------------------------------------------
// Field configuration
// ---------------------------------------------------------------------------

type FieldName = 'title' | 'summary' | 'tags' | 'body';

interface FieldConfig {
  boost: number;
  b: number;
}

const FIELD_CONFIGS: Record<FieldName, FieldConfig> = {
  title:   { boost: 3,   b: 0.3  },
  summary: { boost: 1.5, b: 0.75 },
  tags:    { boost: 2,   b: 0    },
  body:    { boost: 1,   b: 0.75 },
};

const KG_FIELD_CONFIGS: Record<FieldName, FieldConfig> = {
  title:   { boost: 2, b: 0.3 },
  summary: { boost: 0, b: 0   },
  tags:    { boost: 1, b: 0   },
  body:    { boost: 0, b: 0   },
};

const SCRATCH_FIELD_CONFIGS: Record<FieldName, FieldConfig> = {
  title:   { boost: 1,   b: 0.3  },
  summary: { boost: 0.5, b: 0.75 },
  tags:    { boost: 0.5, b: 0    },
  body:    { boost: 0.3, b: 0.75 },
};

// ---------------------------------------------------------------------------
// Public types — kept unchanged for backward compatibility
// ---------------------------------------------------------------------------

/** @deprecated Legacy flat posting — kept for test backward compat only. */
export interface Posting {
  docId: string;
  tf: number;
}

export type FieldConfigKey = 'default' | 'kg' | 'scratch';

export interface InvertedIndex {
  /** @deprecated Legacy flat postings — not used by BM25F scoring. */
  postings: Map<string, Posting[]>;
  /** @deprecated Legacy flat doc lengths — not used by BM25F scoring. */
  docLengths: Map<string, number>;
  /** @deprecated Legacy flat avg doc length — not used by BM25F scoring. */
  avgDocLength: number;
  totalDocs: number;
  fieldPostings: Map<string, FieldPosting[]>;
  fieldLengths: Map<string, FieldLengths>;
  avgFieldLengths: FieldLengths;
  docConfigKeys: Map<string, FieldConfigKey>;
}

export interface SearchResult {
  docId: string;
  score: number;
}

// ---------------------------------------------------------------------------
// Internal BM25F types
// ---------------------------------------------------------------------------

type FieldLengths = Record<FieldName, number>;

interface FieldPosting {
  docId: string;
  fieldTfs: Record<FieldName, number>;
}

// ---------------------------------------------------------------------------
// CJK support
// ---------------------------------------------------------------------------

const CJK_RUN = /[一-鿿㐀-䶿]+/g;
const HAS_CJK = /[一-鿿㐀-䶿]/;

function cjkNgrams(run: string): string[] {
  const out: string[] = [];
  if (run.length === 1) {
    out.push(run);
    return out;
  }
  for (let n = 2; n <= 3; n++) {
    if (run.length < n) break;
    for (let i = 0; i <= run.length - n; i++) {
      out.push(run.substring(i, i + n));
    }
  }
  return out;
}

export function tokenize(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  // Split preserving original case so camelCase boundaries are detectable
  const rawParts = text.split(/[^\p{L}\p{N}]+/u);
  for (const raw of rawParts) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (HAS_CJK.test(lower)) {
      const cjkRuns = lower.match(CJK_RUN) ?? [];
      for (const run of cjkRuns) {
        for (const g of cjkNgrams(run)) out.push(g);
      }
      const latinRemainder = lower.replace(CJK_RUN, ' ').split(/\s+/).filter(Boolean);
      for (const lr of latinRemainder) {
        if (lr.length >= 2 && !STOP_WORDS.has(lr)) out.push(lr);
      }
    } else {
      // CamelCase split: "DetailedTopologySVG" → ["Detailed","Topology","SVG"]
      const camelParts = raw
        .replace(/([a-z])([A-Z])/g, '$1\x00$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1\x00$2')
        .split('\x00');
      if (camelParts.length > 1) {
        for (const cp of camelParts) {
          const lc = cp.toLowerCase();
          if (lc.length >= 2 && !STOP_WORDS.has(lc)) out.push(lc);
        }
        // Keep full joined form for exact identifier matching
        if (lower.length >= 2 && !STOP_WORDS.has(lower)) out.push(lower);
      } else {
        if (lower.length < 2) continue;
        if (STOP_WORDS.has(lower)) continue;
        out.push(lower);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Field text extraction
// ---------------------------------------------------------------------------

function isKgVirtual(entry: WikiEntry): boolean {
  const vk = entry.ext?.virtualKind;
  return vk === 'kg-node' || vk === 'kg-layer' || vk === 'kg-tour-step';
}

function isScratchDoc(entry: WikiEntry): boolean {
  return entry.ext?.virtualKind === 'scratch-doc';
}

function extractFieldTexts(entry: WikiEntry): Record<FieldName, string> {
  return {
    title: entry.title,
    summary: entry.summary,
    tags: entry.tags.join(' ') + (entry.category ? ' ' + entry.category : ''),
    body: entry.body,
  };
}

function getFieldConfigKey(entry: WikiEntry): FieldConfigKey {
  if (isKgVirtual(entry)) return 'kg';
  if (isScratchDoc(entry)) return 'scratch';
  return 'default';
}

const FIELD_CONFIG_MAP: Record<FieldConfigKey, Record<FieldName, FieldConfig>> = {
  default: FIELD_CONFIGS,
  kg: KG_FIELD_CONFIGS,
  scratch: SCRATCH_FIELD_CONFIGS,
};

function getFieldConfigs(entry: WikiEntry): Record<FieldName, FieldConfig> {
  return FIELD_CONFIG_MAP[getFieldConfigKey(entry)];
}

// ---------------------------------------------------------------------------
// Index building
// ---------------------------------------------------------------------------

export function buildInvertedIndex(entries: WikiEntry[]): InvertedIndex {
  const fieldPostings = new Map<string, FieldPosting[]>();
  const fieldLengths = new Map<string, FieldLengths>();
  const docConfigKeys = new Map<string, FieldConfigKey>();

  // Legacy flat postings + docLengths for backward-compat consumers
  const postings = new Map<string, Posting[]>();
  const docLengths = new Map<string, number>();
  let totalLength = 0;

  const totalFieldLengths: FieldLengths = { title: 0, summary: 0, tags: 0, body: 0 };
  const fields: FieldName[] = ['title', 'summary', 'tags', 'body'];

  for (const entry of entries) {
    const texts = extractFieldTexts(entry);
    const configKey = getFieldConfigKey(entry);
    const configs = FIELD_CONFIG_MAP[configKey];
    docConfigKeys.set(entry.id, configKey);

    const perField: Record<FieldName, Map<string, number>> = {
      title: new Map(), summary: new Map(), tags: new Map(), body: new Map(),
    };
    const lengths: FieldLengths = { title: 0, summary: 0, tags: 0, body: 0 };

    const flatTermCounts = new Map<string, number>();

    for (const f of fields) {
      if (configs[f].boost === 0) continue;
      const tokens = tokenize(texts[f]);
      lengths[f] = tokens.length;
      totalFieldLengths[f] += tokens.length;
      for (const t of tokens) {
        perField[f].set(t, (perField[f].get(t) ?? 0) + 1);
        flatTermCounts.set(t, (flatTermCounts.get(t) ?? 0) + 1);
      }
    }

    fieldLengths.set(entry.id, lengths);

    // Build field-level postings
    const allTerms = new Set<string>();
    for (const f of fields) {
      for (const t of perField[f].keys()) allTerms.add(t);
    }
    for (const term of allTerms) {
      let list = fieldPostings.get(term);
      if (!list) { list = []; fieldPostings.set(term, list); }
      list.push({
        docId: entry.id,
        fieldTfs: {
          title: perField.title.get(term) ?? 0,
          summary: perField.summary.get(term) ?? 0,
          tags: perField.tags.get(term) ?? 0,
          body: perField.body.get(term) ?? 0,
        },
      });
    }

    let flatTotal = 0;
    for (const c of flatTermCounts.values()) flatTotal += c;
    docLengths.set(entry.id, flatTotal);
    totalLength += flatTotal;
    for (const [term, tf] of flatTermCounts) {
      let list = postings.get(term);
      if (!list) { list = []; postings.set(term, list); }
      list.push({ docId: entry.id, tf });
    }
  }

  const totalDocs = entries.length;
  const avgFieldLengths: FieldLengths = {
    title: totalDocs ? totalFieldLengths.title / totalDocs : 0,
    summary: totalDocs ? totalFieldLengths.summary / totalDocs : 0,
    tags: totalDocs ? totalFieldLengths.tags / totalDocs : 0,
    body: totalDocs ? totalFieldLengths.body / totalDocs : 0,
  };

  return {
    postings,
    docLengths,
    avgDocLength: totalDocs === 0 ? 0 : totalLength / totalDocs,
    totalDocs,
    fieldPostings,
    fieldLengths,
    avgFieldLengths,
    docConfigKeys,
  };
}

// ---------------------------------------------------------------------------
// BM25F scoring
// ---------------------------------------------------------------------------

export function searchBM25(
  index: InvertedIndex,
  query: string,
  limit = 50,
  credibilityFactors?: Map<string, number>,
): SearchResult[] {
  const terms = tokenize(query);
  if (terms.length === 0 || index.totalDocs === 0) return [];

  const weighted = expandQueryTerms(terms, index);
  const fetchLimit = (credibilityFactors && credibilityFactors.size > 0) ? limit * 2 : limit;
  const results = searchBM25F(index, weighted, fetchLimit);

  if (credibilityFactors && credibilityFactors.size > 0) {
    for (const r of results) {
      const factor = credibilityFactors.get(r.docId) ?? 1.0;
      r.score *= factor;
    }
    results.sort((a, b) => b.score - a.score || a.docId.localeCompare(b.docId));
  }

  return results.slice(0, limit);
}

function searchBM25F(index: InvertedIndex, weightedTerms: WeightedTerm[], limit: number): SearchResult[] {
  const fp = index.fieldPostings;
  const fl = index.fieldLengths;
  const afl = index.avgFieldLengths;
  const dck = index.docConfigKeys;
  const fields: FieldName[] = ['title', 'summary', 'tags', 'body'];

  const scores = new Map<string, number>();
  for (const { term, weight } of weightedTerms) {
    const postings = fp.get(term);
    if (!postings || postings.length === 0) continue;

    const df = postings.length;
    const idf = Math.log(1 + (index.totalDocs - df + 0.5) / (df + 0.5));

    for (const { docId, fieldTfs } of postings) {
      const docFL = fl.get(docId);
      if (!docFL) continue;

      const docConfigs = FIELD_CONFIG_MAP[dck.get(docId) ?? 'default'];

      let tfTilde = 0;
      for (const f of fields) {
        const boost = docConfigs[f].boost;
        const b = docConfigs[f].b;
        if (boost === 0 || fieldTfs[f] === 0) continue;
        if (afl[f] === 0) continue;
        const norm = 1 - b + b * (docFL[f] / afl[f]);
        tfTilde += boost * (fieldTfs[f] / (norm || 1));
      }

      const termScore = weight * idf * ((tfTilde * (BM25_K1 + 1)) / (tfTilde + BM25_K1));
      scores.set(docId, (scores.get(docId) ?? 0) + termScore);
    }
  }

  const ranked: SearchResult[] = [];
  for (const [docId, score] of scores) ranked.push({ docId, score });
  ranked.sort((a, b) => b.score - a.score || a.docId.localeCompare(b.docId));
  return ranked.slice(0, limit);
}

