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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskcli-'));
  process.chdir(dir);
  try {
    fn(dir);
  } finally {
    process.chdir(original);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('add then list shows the added task', () => {
  withTempCwd((dir) => {
    const created = cli.add('write tests');
    assert.strictEqual(created.id, 1);
    assert.strictEqual(created.text, 'write tests');
    assert.strictEqual(created.done, false);

    const tasks = cli.list();
    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(tasks[0].text, 'write tests');
    assert.strictEqual(tasks[0].done, false);

    // Persisted to tasks.json in the current working dir.
    const file = path.join(dir, 'tasks.json');
    assert.ok(fs.existsSync(file), 'tasks.json should exist in cwd');
    const persisted = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(persisted.length, 1);
    assert.strictEqual(persisted[0].text, 'write tests');
  });
});

test('done marks a task as done', () => {
  withTempCwd(() => {
    cli.add('first task');
    cli.add('second task');

    const updated = cli.done(2);
    assert.strictEqual(updated.id, 2);
    assert.strictEqual(updated.done, true);

    const tasks = cli.list();
    const second = tasks.find((t) => t.id === 2);
    const first = tasks.find((t) => t.id === 1);
    assert.strictEqual(second.done, true);
    assert.strictEqual(first.done, false, 'other tasks stay pending');
  });
});

test('ids increment across separate adds', () => {
  withTempCwd(() => {
    const a = cli.add('a');
    const b = cli.add('b');
    const c = cli.add('c');
    assert.deepStrictEqual([a.id, b.id, c.id], [1, 2, 3]);
  });
});
