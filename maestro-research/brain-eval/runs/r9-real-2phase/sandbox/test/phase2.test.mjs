import assert from 'node:assert';

const mod = await import('../src/utils/cli-format.ts');
const { truncateMiddle } = mod;

// 1. short string returned unchanged
assert.strictEqual(truncateMiddle('hello', { max: 20 }), 'hello', 'short string unchanged');
assert.strictEqual(truncateMiddle('exactlyten', { max: 10 }), 'exactlyten', 'len===max returned unchanged');

// 2. long string elided to EXACTLY max with default ellipsis '...'
{
  const r = truncateMiddle('abcdefghijklmnop', { max: 9 });
  assert.strictEqual(r.length, 9, `expected length 9, got ${r.length}`);
  assert.ok(r.includes('...'), 'contains default ellipsis');
  // budget = 9-3 = 6; head=ceil(6/2)=3, tail=3 => 'abc'+'...'+'nop'
  assert.strictEqual(r, 'abc...nop', `head-favored odd: got ${r}`);
}

// 2b. odd budget => head gets extra char
{
  // max=10, ellipsis '...' len3, budget=7, head=ceil(7/2)=4, tail=3
  const r = truncateMiddle('abcdefghijklmnop', { max: 10 });
  assert.strictEqual(r.length, 10, `odd budget length===max, got ${r.length}`);
  assert.strictEqual(r, 'abcd...nop', `odd budget head-extra: got ${r}`);
  // head 'abcd' (4) longer than tail 'nop' (3) -> head extra confirmed
}

// 2c. even budget
{
  // max=11, ellipsis len3, budget=8, head=4, tail=4
  const r = truncateMiddle('abcdefghijklmnop', { max: 11 });
  assert.strictEqual(r.length, 11, `even budget length===max, got ${r.length}`);
  assert.strictEqual(r, 'abcd...mnop', `even budget split evenly: got ${r}`);
}

// 3. newline collapsing default true
{
  const r = truncateMiddle('line1\nline2', { max: 100 });
  assert.strictEqual(r, 'line1 line2', `default collapseNewlines: got ${JSON.stringify(r)}`);
  // also trims
  const r2 = truncateMiddle('  \npadded\n  ', { max: 100 });
  assert.strictEqual(r2, 'padded', `collapse+trim: got ${JSON.stringify(r2)}`);
}

// 3b. collapseNewlines:false path
{
  const r = truncateMiddle('line1\nline2', { max: 100, collapseNewlines: false });
  assert.strictEqual(r, 'line1\nline2', `collapseNewlines false preserves \\n: got ${JSON.stringify(r)}`);
}

// 4. custom ellipsis '~'
{
  // max=5, ellipsis '~' len1, budget=4, head=2, tail=2 -> 'ab'+'~'+'op'
  const r = truncateMiddle('abcdefghijklmnop', { max: 5, ellipsis: '~' });
  assert.strictEqual(r.length, 5, `custom ellipsis length===max, got ${r.length}`);
  assert.strictEqual(r, 'ab~op', `custom ellipsis: got ${r}`);
}

// 5. degenerate max <= ellipsis.length => ellipsis.slice(0,max)
{
  const r = truncateMiddle('abcdefghijklmnop', { max: 2 });
  assert.strictEqual(r, '..', `degenerate max=2 default ellipsis: got ${JSON.stringify(r)}`);
  const r3 = truncateMiddle('abcdefghijklmnop', { max: 3 });
  // max===ellipsis.length(3): processed.length(16) > max(3), then max<=ellipsis.length true -> slice(0,3)='...'
  assert.strictEqual(r3, '...', `max===ellipsis.length: got ${JSON.stringify(r3)}`);
}

// 5b. tailLen=0 edge: budget=1 with default ellipsis (max=4): budget=1, head=1, tail=0 -> 'a...'
{
  const r = truncateMiddle('abcdefghijklmnop', { max: 4 });
  assert.strictEqual(r.length, 4, `tailLen=0 length===max, got ${r.length}`);
  assert.strictEqual(r, 'a...', `tailLen=0 empty tail: got ${JSON.stringify(r)}`);
}

// 6. invalid max (0) still throws RangeError (proving phase-1 path)
assert.throws(
  () => truncateMiddle('abc', { max: 0 }),
  RangeError,
  'max=0 must throw RangeError via normalizeTruncateOptions',
);
assert.throws(
  () => truncateMiddle('abc', { max: NaN }),
  RangeError,
  'max=NaN must throw RangeError via normalizeTruncateOptions',
);

console.log('PHASE2 TESTS PASSED');
