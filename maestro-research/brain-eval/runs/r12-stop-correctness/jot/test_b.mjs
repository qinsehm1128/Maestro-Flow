import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JOT = join(__dirname, 'jot.js');

function fail(reason) {
  console.log('B TESTS: FAIL');
  console.log('reason: ' + reason);
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'jot-test-b-'));
const jotFile = join(dir, 'notes.jsonl');
const env = { ...process.env, JOT_FILE: jotFile };

const texts = ['alpha note', 'beta note', 'gamma note'];

try {
  for (const t of texts) {
    const r = spawnSync('node', [JOT, 'add', t], { env, encoding: 'utf8' });
    if (r.status !== 0) {
      fail('jot add exited nonzero for "' + t + '": ' + (r.stderr || ''));
    }
  }

  const r = spawnSync('node', [JOT, 'list'], { env, encoding: 'utf8' });
  if (r.status !== 0) {
    fail('jot list exited nonzero: ' + (r.stderr || ''));
  }

  const out = r.stdout || '';
  const lines = out.split('\n').filter((l) => l.length > 0);

  if (lines.length !== texts.length) {
    fail('expected ' + texts.length + ' output lines, got ' + lines.length + ': ' + JSON.stringify(out));
  }

  // all texts must appear
  for (const t of texts) {
    if (!out.includes(t)) {
      fail('text "' + t + '" not found in list output');
    }
  }

  // newest-first: last-added (gamma) must appear first, first-added (alpha) last
  const expectedOrder = [...texts].reverse();
  for (let i = 0; i < expectedOrder.length; i++) {
    if (!lines[i].includes(expectedOrder[i])) {
      fail(
        'order mismatch at line ' + (i + 1) + ': expected text "' +
          expectedOrder[i] + '" got line "' + lines[i] + '"'
      );
    }
  }

  console.log('B TESTS: PASS (' + texts.length + '/' + texts.length + ')');
  process.exit(0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
