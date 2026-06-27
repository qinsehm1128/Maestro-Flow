# Sandbox: `taskcli` — a tiny todo CLI (maestro-brain eval target)

This is a deliberately small project used to evaluate the `maestro-brain` command. It gives the brain
something concrete to (a) analyze, (b) build a roadmap over, and (c) "implement" via delegated work,
so we can observe the loop and reverse-evaluate the command's defects.

## Requirement (the user's intent fed to maestro-brain)

> Build `taskcli`, a single-file Node.js command-line todo manager, with three capabilities:
> 1. **Core store** — `add <text>`, `list`, `done <id>`; tasks persisted as JSON in `tasks.json`.
> 2. **Due dates & filtering** — `add <text> --due YYYY-MM-DD`, `list --overdue`, `list --today`.
> 3. **Markdown export** — `export <file.md>` writes a grouped checklist (done / pending / overdue).
>
> Keep it dependency-free (Node stdlib only). Each capability should ship with a small test.

## Seed state

- `src/taskcli.js` — empty stub (only a shebang + TODO).
- `.workflow/state.json` — initialized project, **no roadmap yet** (so the brain must analyze →
  decide complexity → roadmap → loop).

## Intended difficulty signals (for the eval)

- Capability 1 is simple/independent.
- Capability 2 depends on 1 (shared store) — a natural place for an **insert-fix** if the store API
  is wrong.
- Capability 3 depends on 1+2 — and the requirement is slightly under-specified ("grouped checklist"),
  a natural place for a **revise-roadmap** or a clarifying decision.

These are intentional so the evaluation exercises all three brain decision modes
(advance / insert-fix / revise-roadmap) and the anti-false-green review.
