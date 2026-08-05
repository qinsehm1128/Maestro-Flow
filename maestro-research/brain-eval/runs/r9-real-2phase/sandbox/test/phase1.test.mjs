import assert from 'node:assert';

const mod = await import('../src/utils/cli-format.ts');
const { normalizeTruncateOptions } = mod;

assert.strictEqual(typeof normalizeTruncateOptions, 'function', 'normalizeTruncateOptions must be exported');

// 1. Defaults filled when omitted
{
  const r = normalizeTruncateOptions({ max: 10 });
  assert.strictEqual(r.max, 10, 'max passthrough');
  assert.strictEqual(r.ellipsis, '...', 'ellipsis default');
  assert.strictEqual(r.collapseNewlines, true, 'collapseNewlines default');
  // exactly the three keys
  assert.deepStrictEqual(Object.keys(r).sort(), ['collapseNewlines', 'ellipsis', 'max']);
}

// 2. Valid max=10 returns object with ellipsis '...' and collapseNewlines true (explicit per contract)
{
  const r = normalizeTruncateOptions({ max: 10 });
  assert.strictEqual(r.ellipsis, '...');
  assert.strictEqual(r.collapseNewlines, true);
}

// 3. Passthrough when provided
{
  const r = normalizeTruncateOptions({ max: 25, ellipsis: '~', collapseNewlines: false });
  assert.strictEqual(r.max, 25);
  assert.strictEqual(r.ellipsis, '~');
  assert.strictEqual(r.collapseNewlines, false, 'explicit false must not be overridden by default');
}

// 4. RangeError on invalid max values
for (const bad of [0, NaN, Infinity, -5]) {
  assert.throws(
    () => normalizeTruncateOptions({ max: bad }),
    RangeError,
    `expected RangeError for max=${bad}`,
  );
}

// 5. Adversarial: -Infinity should also throw
assert.throws(() => normalizeTruncateOptions({ max: -Infinity }), RangeError, 'max=-Infinity');

// 6. Adversarial: does it mutate the input object?
{
  const input = { max: 10 };
  const r = normalizeTruncateOptions(input);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(input, 'ellipsis'), false, 'input must not be mutated (no ellipsis added)');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(input, 'collapseNewlines'), false, 'input must not be mutated (no collapseNewlines added)');
  assert.notStrictEqual(r, input, 'should return a new object, not the same reference');
}

// 7. Adversarial: max as a numeric string. Number.isFinite('10') === false,
//    so per the implementation this MUST throw RangeError (runtime type guard).
{
  let threw = false;
  try { normalizeTruncateOptions({ max: '10' }); } catch (e) { threw = e instanceof RangeError; }
  assert.strictEqual(threw, true, "string max '10' should throw RangeError (Number.isFinite rejects strings)");
}

// 8. Adversarial: max=1 is the boundary and must be accepted
{
  const r = normalizeTruncateOptions({ max: 1 });
  assert.strictEqual(r.max, 1, 'max=1 boundary accepted');
}

// 9. Adversarial: max=0.999 (< 1) must throw
assert.throws(() => normalizeTruncateOptions({ max: 0.999 }), RangeError, 'max=0.999 < 1');

console.log('PHASE1 TESTS PASSED');
