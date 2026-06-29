/**
 * Structured prompt format for maestro explore:
 *
 *   FIND: <what to search for — the core query>
 *   SCOPE: <file patterns, directories, or modules>
 *   EXCLUDE: <what to skip — files, patterns, false positives>
 *   ATTENTION: <caveats, edge cases, things to watch for>
 *   EXPECTED: <output format — evidence list, summary, JSON>
 *
 * Also accepts plain text (passed through unchanged).
 * Legacy fields PURPOSE/FOCUS/CONSTRAINTS map to FIND/ATTENTION/EXCLUDE.
 */

export interface StructuredPrompt {
  find: string;
  scope?: string;
  exclude?: string;
  attention?: string;
  expected?: string;
}

const FIELD_MAP: Record<string, keyof StructuredPrompt> = {
  FIND: 'find',
  SCOPE: 'scope',
  EXCLUDE: 'exclude',
  ATTENTION: 'attention',
  EXPECTED: 'expected',
  // Legacy aliases
  PURPOSE: 'find',
  FOCUS: 'attention',
  CONSTRAINTS: 'exclude',
};

const FIELD_PATTERN = new RegExp(
  `^(${Object.keys(FIELD_MAP).join('|')})\\s*:\\s*(.*)`,
  'i',
);

export function isStructuredPrompt(text: string): boolean {
  return /^(FIND|PURPOSE)\s*:/im.test(text);
}

export function parseStructuredPrompt(text: string): StructuredPrompt {
  const fields: Partial<StructuredPrompt> = {};
  let currentKey: keyof StructuredPrompt | null = null;
  const lines: string[] = [];

  for (const line of text.split('\n')) {
    const match = line.match(FIELD_PATTERN);
    if (match) {
      if (currentKey && lines.length > 0) {
        fields[currentKey] = lines.join('\n').trim();
        lines.length = 0;
      }
      currentKey = FIELD_MAP[match[1].toUpperCase()] ?? null;
      if (match[2].trim()) lines.push(match[2].trim());
    } else if (currentKey) {
      lines.push(line);
    }
  }
  if (currentKey && lines.length > 0) {
    fields[currentKey] = lines.join('\n').trim();
  }

  return {
    find: fields.find ?? text.trim(),
    scope: fields.scope,
    exclude: fields.exclude,
    attention: fields.attention,
    expected: fields.expected,
  };
}

export function buildExplorePrompt(input: string | StructuredPrompt): string {
  const parsed = typeof input === 'string'
    ? (isStructuredPrompt(input) ? parseStructuredPrompt(input) : { find: input })
    : input;

  const parts: string[] = [`Find: ${parsed.find}`];
  if (parsed.scope) parts.push(`Scope: ${parsed.scope}`);
  if (parsed.exclude) parts.push(`Exclude: ${parsed.exclude}`);
  if (parsed.attention) parts.push(`Attention: ${parsed.attention}`);
  if (parsed.expected) parts.push(`Expected output: ${parsed.expected}`);

  return parts.join('\n');
}
