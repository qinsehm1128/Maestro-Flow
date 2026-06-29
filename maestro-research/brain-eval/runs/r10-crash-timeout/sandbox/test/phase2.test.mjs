import { test } from "node:test";
import assert from "node:assert";
import { boxify, padCenter } from "../src/strkit.mjs";

test("boxify produces correct width and centered rows for ['hi','world']", () => {
  const padding = 1;
  const lines = ["hi", "world"];
  const maxLen = Math.max(...lines.map((l) => l.length)); // 5
  const innerWidth = maxLen + 2 * padding; // 7
  const box = boxify(lines, { padding });
  const rows = box.split("\n");

  // 2 borders + 2 content rows
  assert.strictEqual(rows.length, 4);

  // Border integrity
  const border = "+" + "-".repeat(innerWidth) + "+";
  assert.strictEqual(rows[0], border);
  assert.strictEqual(rows[rows.length - 1], border);

  // Every row is the same width (innerWidth + 2 frame chars)
  for (const r of rows) {
    assert.strictEqual(r.length, innerWidth + 2);
  }

  // Content rows are framed with '|'
  for (const r of [rows[1], rows[2]]) {
    assert.strictEqual(r[0], "|");
    assert.strictEqual(r[r.length - 1], "|");
  }
});

test("boxify relies on padCenter for inner content", () => {
  const padding = 1;
  const lines = ["hi", "world"];
  const innerWidth = Math.max(...lines.map((l) => l.length)) + 2 * padding;
  const box = boxify(lines, { padding });
  const rows = box.split("\n");

  lines.forEach((line, i) => {
    const contentRow = rows[i + 1]; // skip top border
    const inner = contentRow.slice(1, -1); // strip '|' frame
    assert.strictEqual(inner, padCenter(line, innerWidth));
  });
});

test("padCenter right-bias is reflected in boxified rows", () => {
  // 'hi' (len 2) in width 7 -> 5 fill: 2 left, 3 right
  const box = boxify(["hi", "world"], { padding: 1 });
  const rows = box.split("\n");
  assert.strictEqual(rows[1], "|  hi   |");
  assert.strictEqual(rows[2], "| world |");
});

test("boxify default padding is 1", () => {
  const def = boxify(["x"]);
  const explicit = boxify(["x"], { padding: 1 });
  assert.strictEqual(def, explicit);
});
