'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cli = require('../src/taskcli.cjs');

// Each test runs in its own temp cwd so tasks.json never pollutes the repo.
function withTempCwd(fn) {
  const original = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskcli-export-'));
  process.chdir(dir);
  try {
    fn(dir);
  } finally {
    process.chdir(original);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

test('export writes a grouped checklist to the given file', () => {
  withTempCwd((dir) => {
    // One of each group: done, pending, overdue.
    const pending = cli.add('write report');
    const overdue = cli.add('pay rent', { due: dateOffset(-3) });
    const finished = cli.add('buy milk');
    cli.done(finished.id);

    const out = path.join(dir, 'export.md');
    cli.exportTasks(out);

    // The user-supplied file must exist after export.
    assert.ok(
      fs.existsSync(out),
      `expected export to create ${out}`
    );

    const md = fs.readFileSync(out, 'utf8');
    assert.match(md, /## Done/, 'has a Done section');
    assert.match(md, /## Pending/, 'has a Pending section');
    assert.match(md, /## Overdue/, 'has an Overdue section');
    assert.match(md, /#\d+ buy milk/, 'done task listed');
    assert.match(md, /#\d+ write report/, 'pending task listed');
    assert.match(md, /#\d+ pay rent/, 'overdue task listed');

    // Silence unused-binding lint while keeping intent explicit.
    void pending;
    void overdue;
  });
});
