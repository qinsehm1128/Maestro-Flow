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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskcli-due-'));
  process.chdir(dir);
  try {
    fn(dir);
  } finally {
    process.chdir(original);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Local-date helper matching the CLI's "today" definition.
function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

test('--overdue shows an undone task whose due date is before today', () => {
  withTempCwd(() => {
    const overdue = cli.add('pay rent', { due: dateOffset(-3) });
    cli.add('future thing', { due: dateOffset(5) }); // not overdue

    const overdueList = cli.list({ overdue: true });
    assert.deepStrictEqual(
      overdueList.map((t) => t.id),
      [overdue.id],
      'only the strictly-before-today undone task is overdue'
    );
    assert.strictEqual(overdueList[0].text, 'pay rent');
  });
});

test('--overdue EXCLUDES a task that is overdue but already done', () => {
  withTempCwd(() => {
    const undone = cli.add('undone overdue', { due: dateOffset(-2) });
    const doneTask = cli.add('done overdue', { due: dateOffset(-2) });
    cli.done(doneTask.id);

    const overdueList = cli.list({ overdue: true });
    const ids = overdueList.map((t) => t.id);
    assert.deepStrictEqual(
      ids,
      [undone.id],
      'a completed overdue task must not appear in --overdue'
    );
    assert.ok(!ids.includes(doneTask.id), 'done overdue task is excluded');
  });
});

test('--today shows an undone task due today', () => {
  withTempCwd(() => {
    const todayTask = cli.add('due today', { due: dateOffset(0) });
    cli.add('due tomorrow', { due: dateOffset(1) });
    cli.add('overdue', { due: dateOffset(-1) });

    const todayList = cli.list({ today: true });
    assert.deepStrictEqual(
      todayList.map((t) => t.id),
      [todayTask.id],
      'only tasks due exactly today appear in --today'
    );
    assert.strictEqual(todayList[0].text, 'due today');
  });
});

test('--today excludes a task due today that is already done', () => {
  withTempCwd(() => {
    const t = cli.add('finish today', { due: dateOffset(0) });
    cli.done(t.id);
    const todayList = cli.list({ today: true });
    assert.deepStrictEqual(todayList, [], 'done task due today is excluded');
  });
});
