// ---------------------------------------------------------------------------
// Skill scanner — discovers commands + skills (global + project).
//
// Sources (project overrides global by `name`):
//   - <cwd>/.claude/commands/*.md           type: command, scope: project
//   - ~/.claude/commands/*.md               type: command, scope: global
//   - <cwd>/.claude/skills/*/SKILL.md       type: skill,   scope: project
//   - ~/.claude/skills/*/SKILL.md           type: skill,   scope: global
//
// Agents are explicitly NOT scanned.
// ---------------------------------------------------------------------------

import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseSkillManifest } from './skill-resolver.js';

export interface ScannedSkill {
  type: 'command' | 'skill';
  scope: 'global' | 'project';
  name: string;
  filePath: string;
  description: string;
  argumentHint: string;
  requiredCount: number;
  deferredCount: number;
  missingRequired: string[];
}

function collectCommandFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    const full = join(dir, name);
    try {
      if (statSync(full).isFile()) out.push(full);
    } catch { /* ignore */ }
  }
  return out;
}

function collectSkillFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const skillFile = join(dir, name, 'SKILL.md');
    try {
      if (existsSync(skillFile) && statSync(skillFile).isFile()) out.push(skillFile);
    } catch { /* ignore */ }
  }
  return out;
}

function scanOne(
  filePath: string,
  type: 'command' | 'skill',
  scope: 'global' | 'project',
  fallbackName: string,
): ScannedSkill {
  try {
    const m = parseSkillManifest(filePath);
    const fmName = (m.frontmatter.name ?? '').toString().trim();
    const description = (m.frontmatter.description ?? '').toString();
    const argumentHint = (m.frontmatter['argument-hint'] ?? '').toString();
    return {
      type,
      scope,
      name: fmName || fallbackName,
      filePath,
      description,
      argumentHint,
      requiredCount: m.requiredPaths.length,
      deferredCount: m.deferredPaths.length,
      missingRequired: m.missingRequired,
    };
  } catch {
    return {
      type, scope, name: fallbackName, filePath,
      description: '(parse error)', argumentHint: '',
      requiredCount: 0, deferredCount: 0, missingRequired: [],
    };
  }
}

export function scanAllSkills(workflowRoot: string = resolve(process.cwd())): ScannedSkill[] {
  const home = homedir();
  const sources: Array<{ files: string[]; type: 'command' | 'skill'; scope: 'global' | 'project'; nameFn: (p: string) => string }> = [
    {
      files: collectCommandFiles(join(home, '.claude', 'commands')),
      type: 'command', scope: 'global',
      nameFn: p => p.split(/[\\/]/).pop()!.replace(/\.md$/, ''),
    },
    {
      files: collectCommandFiles(join(workflowRoot, '.claude', 'commands')),
      type: 'command', scope: 'project',
      nameFn: p => p.split(/[\\/]/).pop()!.replace(/\.md$/, ''),
    },
    {
      files: collectSkillFiles(join(home, '.claude', 'skills')),
      type: 'skill', scope: 'global',
      nameFn: p => p.split(/[\\/]/).slice(-2, -1)[0],
    },
    {
      files: collectSkillFiles(join(workflowRoot, '.claude', 'skills')),
      type: 'skill', scope: 'project',
      nameFn: p => p.split(/[\\/]/).slice(-2, -1)[0],
    },
  ];

  // Project overrides global per (type, name). Build a Map keyed by `${type}::${name}`.
  const merged = new Map<string, ScannedSkill>();
  for (const src of sources) {
    for (const file of src.files) {
      const entry = scanOne(file, src.type, src.scope, src.nameFn(file));
      const key = `${entry.type}::${entry.name}`;
      const existing = merged.get(key);
      // Project entries always replace global entries.
      if (!existing || (existing.scope === 'global' && entry.scope === 'project')) {
        merged.set(key, entry);
      }
    }
  }

  return Array.from(merged.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    if (a.scope !== b.scope) return a.scope.localeCompare(b.scope);
    return a.name.localeCompare(b.name);
  });
}

/** Look up a single skill/command by name. Returns null if not found. */
export function findSkill(name: string, type?: 'command' | 'skill'): ScannedSkill | null {
  const all = scanAllSkills();
  return all.find(s => s.name === name && (!type || s.type === type)) ?? null;
}
