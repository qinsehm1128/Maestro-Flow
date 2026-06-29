import assert from "node:assert";
import { test } from "node:test";
import { padCenter } from "../src/strkit.mjs";

test("padCenter centers with extra char on the right", () => {
  // len 2, width 6 -> 4 fill -> 2 left, 2 right
  assert.strictEqual(padCenter("hi", 6), "  hi  ");
});

test("padCenter returns unchanged when length >= width", () => {
  assert.strictEqual(padCenter("abc", 3), "abc");
});

test("padCenter uses custom fill, extra on right", () => {
  // len 1, width 4 -> 3 fill -> 1 left, 2 right
  assert.strictEqual(padCenter("x", 4, "*"), "*x**");
});

test("padCenter throws RangeError for multi-char fill", () => {
  assert.throws(() => padCenter("x", 4, "ab"), RangeError);
});
