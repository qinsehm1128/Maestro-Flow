// strkit — tiny string utility sandbox (r10 crash/timeout eval)
// Seed: empty of the two target features. Brain must drive both to completion.

/**
 * slugify(text): lowercase, spaces->dashes, strip non-alphanumerics.
 * Already-present baseline utility (untouched by the run).
 */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * padCenter(text, width, fill=' '): center text within width by padding with fill.
 * Distributes (width - len) fill chars: floor on left, remainder (extra char) on RIGHT.
 * Returns text unchanged when its length >= width. fill must be a single character.
 */
export function padCenter(text, width, fill = " ") {
  const str = String(text);
  if (fill.length !== 1) {
    throw new RangeError("fill must be a single character");
  }
  if (str.length >= width) {
    return str;
  }
  const total = width - str.length;
  const left = Math.floor(total / 2);
  const right = total - left;
  return fill.repeat(left) + str + fill.repeat(right);
}

// --- phase-2 target: boxify(lines, opts) that CONSUMES padCenter — NOT YET IMPLEMENTED ---
