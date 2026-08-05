import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JOT = join(__dirname, 'jot.js');

function fail(reason) {
  console.log('A TESTS: FAIL');
  console.log('reason: ' + reason);
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'jot-test-'));
const jotFile = join(dir, 'notes.jsonl');
const env = { ...process.env, JOT_FILE: jotFile };

const texts = ['first note', 'second note here'];

try {
  for (const t of texts) {
    const r = spawnSync('node', [JOT, 'add', t], { env, encoding: 'utf8' });
    if (r.status !== 0) {
      fail('jot add exited nonzero for "' + t + '": ' + (r.stderr || ''));
    }
  }

  const raw = readFileSync(jotFile, 'utf8');
  const lines = raw.split('\n').filter((l) => l.length > 0);

  if (lines.length !== 2) {
    fail('expected 2 lines, got ' + lines.length);
  }

  for (let i = 0; i < lines.length; i++) {
    let obj;
    try {
      obj = JSON.parse(lines[i]);
    } catch (e) {
      fail('line ' + (i + 1) + ' is not valid JSON: ' + lines[i]);
    }
    if (typeof obj.ts !== 'string' || obj.ts.length === 0) {
      fail('line ' + (i + 1) + ' missing valid ts');
    }
    if (isNaN(Date.parse(obj.ts))) {
      fail('line ' + (i + 1) + ' ts is not a valid date: ' + obj.ts);
    }
    if (typeof obj.text !== 'string') {
      fail('line ' + (i + 1) + ' missing text');
    }
    if (obj.text !== texts[i]) {
      fail('line ' + (i + 1) + ' text mismatch: expected "' + texts[i] + '" got "' + obj.text + '"');
    }
  }

  console.log('A TESTS: PASS (2/2)');
  process.exit(0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
