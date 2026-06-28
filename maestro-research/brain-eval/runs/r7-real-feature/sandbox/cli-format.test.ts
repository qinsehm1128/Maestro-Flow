import { describe, it } from 'vitest';
import assert from 'node:assert';
import { truncateMiddle } from './cli-format.js';

describe('truncateMiddle', () => {
  it('passes through a string whose length is <= max', () => {
    assert.strictEqual(truncateMiddle('hello', 10), 'hello');
    assert.strictEqual(truncateMiddle('hello', 5), 'hello');
  });

  it('elides the middle with an even max, keeping head and tail', () => {
    const s = 'abcdefghijklmnop'; // length 16
    const max = 10;
    const out = truncateMiddle(s, max);
    assert.strictEqual(out.length, max);
    assert.ok(out.startsWith('a'));
    assert.ok(out.endsWith('p'));
    // keep = 9 -> head = 5, tail = 4
    assert.strictEqual(out, 'abcde…mnop');
  });

  it('elides the middle with an odd max', () => {
    const s = 'abcdefghijklmnop'; // length 16
    const max = 7;
    const out = truncateMiddle(s, max);
    assert.strictEqual(out.length, max);
    assert.ok(out.startsWith('a'));
    assert.ok(out.endsWith('p'));
    // keep = 6 -> head = 3, tail = 3
    assert.strictEqual(out, 'abc…nop');
  });

  it('returns the ellipsis char for max === 1', () => {
    assert.strictEqual(truncateMiddle('abcdef', 1), '…');
  });

  it('returns empty string for max <= 0', () => {
    assert.strictEqual(truncateMiddle('abcdef', 0), '');
    assert.strictEqual(truncateMiddle('abcdef', -5), '');
  });

  it('includes the ellipsis char in the elided result', () => {
    const out = truncateMiddle('abcdefghijklmnop', 8);
    assert.ok(out.includes('…'));
  });
});
