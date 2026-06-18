#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WASM_RUNTIME_FLAGS = ['--liftoff-only'];
const WASM_RELAUNCH_GUARD = 'MAESTRO_WASM_RELAUNCHED';
const KG_WASM_COMMANDS = new Set(['index', 'sync', 'sync-all', 'rebuild']);
const SCRIPT_PATH = fileURLToPath(import.meta.url);

function shouldApplyWasmFlags(argv) {
  const kgIndex = argv.indexOf('kg');
  if (kgIndex < 0) return false;
  const subcommand = argv.slice(kgIndex + 1).find(arg => !arg.startsWith('-'));
  if (!subcommand || !KG_WASM_COMMANDS.has(subcommand)) return false;
  if (subcommand === 'sync' || subcommand === 'sync-all') {
    const sourceIndex = argv.indexOf('--source');
    const sourceValue = sourceIndex >= 0 ? argv[sourceIndex + 1] : undefined;
    const sourceEquals = argv.find(arg => arg.startsWith('--source='));
    const sources = sourceValue ?? sourceEquals?.slice('--source='.length);
    return !sources || sources.split(',').map(s => s.trim()).includes('codegraph');
  }
  return true;
}

function hasWasmFlags() {
  return WASM_RUNTIME_FLAGS.every(flag => process.execArgv.includes(flag));
}

if (
  shouldApplyWasmFlags(process.argv.slice(2)) &&
  !hasWasmFlags() &&
  !process.env[WASM_RELAUNCH_GUARD] &&
  !process.env.MAESTRO_NO_WASM_RELAUNCH
) {
  const result = spawnSync(process.execPath, [
    ...WASM_RUNTIME_FLAGS,
    ...process.execArgv.filter(arg => !WASM_RUNTIME_FLAGS.includes(arg)),
    SCRIPT_PATH,
    ...process.argv.slice(2),
  ], {
    stdio: 'inherit',
    env: { ...process.env, [WASM_RELAUNCH_GUARD]: '1' },
    windowsHide: true,
  });

  if (!result.error) {
    process.exit(result.status ?? (result.signal ? 1 : 0));
  }
}

if (shouldApplyWasmFlags(process.argv.slice(2)) && Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10) >= 25 && !process.env.MAESTRO_ALLOW_UNSAFE_NODE) {
  process.stderr.write(
    '[MaestroGraph] Warning: Node 25.x is sensitive to V8 WASM Zone OOM during tree-sitter indexing. ' +
    'Node 22 LTS is recommended for large repositories.\n',
  );
}

await import('../dist/src/cli.js');
