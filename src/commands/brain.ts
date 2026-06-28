// ---------------------------------------------------------------------------
// `maestro brain` — outer-loop scheduling engine (the TS half of maestro-brain).
//
// Subcommands:
//   init    Create a brain session + ledger.json
//   derive  Print decision-input snapshot (cursor, stop eval, router signals)
//   decide  Run the A_DECIDE engine for a reconciled round-signal
//   status  Session summary
//
// Data contract: `.workflow/.brain/brain-*/ledger.json`. Mirrors `maestro ralph`.
// ---------------------------------------------------------------------------

import type { Command } from 'commander';

export function registerBrainCommand(program: Command): void {
  const brain = program
    .command('brain')
    .description('maestro-brain outer-loop engine (state-derive / stop-predicate / decide)');

  brain
    .command('init <intent>')
    .description('Create a brain session + ledger.json')
    .option('-y, --yes', 'Autonomous mode (no human escalation; full-chain + continue)')
    .option('--max-rounds <n>', 'Safety backstop round cap (default 30)')
    .action(async (intent: string, opts: { yes?: boolean; maxRounds?: string }) => {
      const { runInit } = await import('../brain/cmd-brain.js');
      const maxRounds = opts.maxRounds != null ? Number.parseInt(opts.maxRounds, 10) : undefined;
      if (maxRounds != null && (!Number.isFinite(maxRounds) || maxRounds < 1)) {
        console.error('[brain init] --max-rounds must be an integer >= 1');
        process.exit(2);
      }
      process.exit(runInit({ intent, autonomous: !!opts.yes, maxRounds }));
    });

  brain
    .command('derive')
    .description('Print the per-round decision inputs (cursor, stop predicate, router signals)')
    .option('--session <id>', 'Brain session id (default: latest)')
    .option('--json', 'Machine-readable output')
    .action(async (opts: { session?: string; json?: boolean }) => {
      const { runDerive } = await import('../brain/cmd-brain.js');
      process.exit(runDerive({ sessionId: opts.session, json: !!opts.json }));
    });

  brain
    .command('decide')
    .description('Run A_DECIDE for a reconciled round signal')
    .option('--session <id>', 'Brain session id (default: latest)')
    .option('--signal <s>', 'ok | result-problem | roadmap-problem:<issue> | unfixable-external', 'ok')
    .option('--json', 'Machine-readable output')
    .action(async (opts: { session?: string; signal?: string; json?: boolean }) => {
      const { runDecide } = await import('../brain/cmd-brain.js');
      process.exit(runDecide({ sessionId: opts.session, signal: opts.signal, json: !!opts.json }));
    });

  brain
    .command('await <statusPath>')
    .description('SUSPEND until a child ralph/odyssey session reaches a terminal state (event-driven)')
    .requiredOption('--kind <kind>', 'ralph | odyssey')
    .option('--timeout-min <n>', 'Hard deadline in minutes (default 10)')
    .option('--json', 'Machine-readable output')
    .action(async (statusPath: string, opts: { kind: string; timeoutMin?: string; json?: boolean }) => {
      if (opts.kind !== 'ralph' && opts.kind !== 'odyssey') {
        console.error('[brain await] --kind must be ralph | odyssey');
        process.exit(2);
      }
      const { runAwait } = await import('../brain/cmd-brain.js');
      const timeoutMin = opts.timeoutMin != null ? Number.parseInt(opts.timeoutMin, 10) : undefined;
      process.exit(await runAwait({ statusPath, kind: opts.kind, timeoutMin, json: !!opts.json }));
    });

  brain
    .command('status')
    .description('Brain session summary')
    .option('--session <id>', 'Brain session id (default: latest)')
    .action(async (opts: { session?: string }) => {
      const { runStatus } = await import('../brain/cmd-brain.js');
      process.exit(runStatus({ sessionId: opts.session }));
    });
}
