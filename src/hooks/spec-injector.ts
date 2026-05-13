/**
 * Spec Injector — PreToolUse:Agent Hook
 *
 * Automatically injects project specs into subagent context based on
 * agent type → spec category mapping. Uses context-budget to reduce
 * payload when context usage is high.
 *
 * Design: Uses `additionalContext` (advisory) rather than rewriting
 * the prompt — safer and non-destructive.
 */

import { loadSpecs, type SpecCategory } from '../tools/spec-loader.js';
import { evaluateContextBudget } from './context-budget.js';
import { resolveSelf } from '../tools/team-members.js';
import { evaluateKeywordInjection } from './keyword-spec-injector.js';
import { loadWikiByCategory } from './wiki-role-loader.js';
import type { SpecInjectionConfig } from '../types/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpecInjectionResult {
  inject: boolean;
  content?: string;
  categories?: string[];
  specCount?: number;
  budgetAction?: string;
}

// ---------------------------------------------------------------------------
// Agent-type → spec categories mapping (single source of truth)
// ---------------------------------------------------------------------------

const AGENT_CATEGORY_MAP: Record<string, SpecCategory[]> = {
  // Execution agents → coding specs
  'code-developer':      ['coding', 'learning', 'ui'],
  'tdd-developer':       ['coding', 'test'],
  'workflow-executor':   ['coding'],
  'universal-executor':  ['coding', 'ui'],
  'test-fix-agent':      ['coding', 'test'],

  // Planning agents → arch specs
  'cli-lite-planning-agent': ['arch'],
  'action-planning-agent':   ['arch'],
  'workflow-planner':        ['arch'],

  // Review agents → review specs
  'workflow-reviewer':   ['review'],

  // Debug agents → debug specs
  'debug-explore-agent': ['debug'],
  'workflow-debugger':   ['debug'],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate whether to inject specs for a given agent type.
 *
 * @param agentType   The subagent_type from PreToolUse tool_input
 * @param projectPath Working directory (for spec file resolution)
 * @param sessionId   Session ID (for context budget bridge metrics)
 * @param config      Optional user config overrides
 * @param uid         Optional team member uid for personal spec layer
 */
export function evaluateSpecInjection(
  agentType: string,
  projectPath: string,
  sessionId?: string,
  config?: SpecInjectionConfig,
  uid?: string,
): SpecInjectionResult {
  const categories = resolveCategories(agentType, config);
  if (!categories || categories.length === 0) return { inject: false };

  const resolvedUid = uid ?? resolveUidSafe();

  const sections: string[] = [];
  const allCategories: string[] = [];
  let totalCount = 0;

  for (const category of categories) {
    // Load specs by category (primary doc + keyword cross-match + tool discovery)
    const specResult = loadSpecs(projectPath, category as SpecCategory, resolvedUid);
    if (specResult.content) {
      sections.push(specResult.content);
      allCategories.push(category);
      totalCount += specResult.totalLoaded;
    }

    // Wiki category knowledge injection
    const wikiResult = loadWikiByCategory(projectPath, category);
    if (wikiResult) {
      sections.push(wikiResult.content);
      totalCount += wikiResult.entryCount;
    }
  }

  if (sections.length === 0) return { inject: false };

  const rawContent = sections.join('\n\n---\n\n');
  const budget = evaluateContextBudget(rawContent, sessionId);

  if (budget.action === 'skip') {
    return { inject: false, budgetAction: 'skip' };
  }

  return {
    inject: true,
    content: budget.content,
    categories: allCategories,
    specCount: totalCount,
    budgetAction: budget.action,
  };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/**
 * Best-effort uid resolution — returns null on any failure so spec injection
 * never throws due to team-mode issues.
 */
function resolveUidSafe(): string | undefined {
  try {
    const self = resolveSelf();
    return self?.uid ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve categories for an agent type. Config overrides take precedence.
 */
function resolveCategories(agentType: string, config?: SpecInjectionConfig): string[] | null {
  // Config override
  if (config?.mapping?.[agentType]) {
    return config.mapping[agentType].categories;
  }
  return AGENT_CATEGORY_MAP[agentType] ?? null;
}
