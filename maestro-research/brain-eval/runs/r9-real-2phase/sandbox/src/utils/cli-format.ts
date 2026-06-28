// ---------------------------------------------------------------------------
// Shared CLI formatting and status utilities
// Used by cli command, delegate command, tools, delegate-control, and relay.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import type { EntryLike, ExecutionMeta } from '../agents/cli-history-store.js';

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

export function deriveExecutionStatus(meta: ExecutionMeta | null): string {
  if (!meta) {
    return 'unknown';
  }

  if (meta.cancelledAt) {
    return 'cancelled';
  }

  if (meta.exitCode === undefined && !meta.completedAt) {
    return 'running';
  }

  if (meta.exitCode === 0) {
    return 'completed';
  }

  return meta.exitCode === undefined ? 'unknown' : `exit:${meta.exitCode}`;
}

export type DelegateJobLike = {
  status: string;
  metadata?: Record<string, unknown> | null;
} | null;

export function deriveDelegateStatus(
  meta: ExecutionMeta | null,
  job: DelegateJobLike,
): string {
  if (
    (job?.status === 'running' || job?.status === 'queued')
    && job.metadata
    && typeof job.metadata.cancelRequestedAt === 'string'
  ) {
    return 'cancelling';
  }
  return job?.status ?? deriveExecutionStatus(meta);
}

// ---------------------------------------------------------------------------
// String formatting
// ---------------------------------------------------------------------------

export function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

/**
 * Collapse newlines to spaces, trim, then truncate with "...".
 * Used by CLI table output (cli show, delegate show).
 */
export function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\n/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max - 3) + '...';
}

/**
 * Truncate without newline collapsing — just cutoff with "...".
 * Used by channel relay notifications.
 */
export function truncateRaw(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 3) + '...';
}

/**
 * Truncate with ellipsis indicator for history/resume context.
 * Uses different suffix from other truncate variants.
 */
export function truncateForHistory(s: string, max: number): string {
  return s.length <= max ? s : s.substring(0, max) + '\u2026[truncated]';
}

/**
 * Extract the best-matching body line for a query, prefixed with its line
 * number (e.g. "L12: matched context..."). Scores lines by query-term
 * coverage so multi-term queries surface the most informative line.
 */
export function extractSnippet(body: string, query: string, maxLen = 80, highlight = false): string | null {
  if (!body || !query) return null;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return null;

  const lines = body.split('\n');
  let bestIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (lower.includes(term)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx === -1) return null;

  let raw = lines[bestIdx].trim();
  raw = raw.replace(/^#+\s+/, '');
  raw = raw.replace(/^[-*]\s+/, '');
  if (raw.length > maxLen) raw = raw.slice(0, maxLen) + '...';
  if (highlight) raw = highlightTerms(raw, terms);
  return `L${bestIdx + 1}: ${raw}`;
}

export function highlightTerms(text: string, terms: string[]): string {
  if (!terms.length) return text;
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  return text.replace(re, '\x1b[1;33m$1\x1b[0m');
}

// ---------------------------------------------------------------------------
// Execution entry reading
// ---------------------------------------------------------------------------

export function readExecutionEntries(
  store: { jsonlPathFor(execId: string): string },
  execId: string,
): EntryLike[] {
  try {
    const raw = readFileSync(store.jsonlPathFor(execId), 'utf-8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as EntryLike;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is EntryLike => entry !== null);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Broker event summarization
// ---------------------------------------------------------------------------

/**
 * CLI-friendly single-line summary of a broker event.
 * Used by `delegate status` and `delegate tail` commands.
 */
export function summarizeBrokerEventCli(event: {
  eventId: number;
  type: string;
  status?: string;
  payload: Record<string, unknown>;
  snapshot?: unknown;
}): string {
  const payloadSummary = typeof event.payload.summary === 'string'
    ? event.payload.summary
    : typeof event.payload.message === 'string'
      ? event.payload.message
      : null;
  const progress = event.snapshot && typeof event.snapshot === 'object' && event.snapshot !== null
    && 'progress' in event.snapshot && typeof (event.snapshot as Record<string, unknown>).progress === 'number'
    ? ` progress=${(event.snapshot as Record<string, unknown>).progress}%`
    : '';
  return `${event.eventId} ${event.type}${event.status ? ` (${event.status})` : ''}${progress}${payloadSummary ? ` ${payloadSummary}` : ''}`;
}

/**
 * Structured summary of a broker event (object return).
 * Used by MCP tools (delegate_status, delegate_tail).
 */
export function summarizeBrokerEventStructured(event: {
  eventId: number;
  sequence: number;
  type: string;
  createdAt: string;
  status?: string;
  snapshot?: unknown;
  payload: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    eventId: event.eventId,
    sequence: event.sequence,
    type: event.type,
    createdAt: event.createdAt,
    status: event.status ?? null,
    summary: typeof event.payload.summary === 'string'
      ? event.payload.summary
      : typeof event.payload.message === 'string'
        ? event.payload.message
        : null,
    snapshot: event.snapshot ?? null,
  };
}

// ---------------------------------------------------------------------------
// Truncate options (phase-1 capability — no consumers yet)
// ---------------------------------------------------------------------------

/**
 * Options controlling truncation behaviour.
 * `max` is the maximum length; `ellipsis` and `collapseNewlines` are optional.
 */
export type TruncateOptions = {
  max: number;
  ellipsis?: string;
  collapseNewlines?: boolean;
};

/**
 * Fill in defaults for {@link TruncateOptions}. Pure and self-contained.
 * `ellipsis` defaults to '...', `collapseNewlines` defaults to true, `max`
 * is passed through. Throws a RangeError if `max` is not a finite number >= 1.
 */
export function normalizeTruncateOptions(opts: TruncateOptions): Required<TruncateOptions> {
  if (!Number.isFinite(opts.max) || opts.max < 1) {
    throw new RangeError(`max must be a finite number >= 1, received: ${opts.max}`);
  }
  return {
    max: opts.max,
    ellipsis: opts.ellipsis ?? '...',
    collapseNewlines: opts.collapseNewlines ?? true,
  };
}

// ---------------------------------------------------------------------------
// Truncate middle (phase-2 feature — consumes phase-1's normalizeTruncateOptions)
// ---------------------------------------------------------------------------

/**
 * Elide the MIDDLE of `text`, keeping a head and tail slice joined by the
 * configured ellipsis so the result length is exactly `max` when possible.
 *
 * Builds on phase-1's {@link normalizeTruncateOptions} to resolve `max`,
 * `ellipsis`, and `collapseNewlines` defaults. The remaining budget
 * (`max - ellipsis.length`) is split as evenly as possible between head and
 * tail, with the head taking the extra character when the budget is odd.
 *
 * If `max <= ellipsis.length`, falls back to the ellipsis sliced to `max`.
 */
export function truncateMiddle(text: string, opts: TruncateOptions): string {
  const { max, ellipsis, collapseNewlines } = normalizeTruncateOptions(opts);

  const processed = collapseNewlines ? text.replace(/\n/g, ' ').trim() : text;

  if (processed.length <= max) return processed;

  if (max <= ellipsis.length) {
    return ellipsis.slice(0, max);
  }

  const budget = max - ellipsis.length;
  const headLen = Math.ceil(budget / 2);
  const tailLen = budget - headLen;

  const head = processed.slice(0, headLen);
  const tail = tailLen > 0 ? processed.slice(processed.length - tailLen) : '';

  return head + ellipsis + tail;
}
