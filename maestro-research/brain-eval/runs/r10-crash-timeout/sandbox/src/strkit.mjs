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

/**
 * boxify(lines, opts): wrap an array of strings in an ASCII box.
 * opts.padding (default 1): horizontal padding (spaces) inside the box on each side.
 * innerWidth = max line length + 2*padding. Each line is centered via padCenter
 * (phase-1) to innerWidth, then framed with '|' on each side. Top/bottom borders
 * are '+' + '-'.repeat(innerWidth) + '+'. Returns rows joined by '\n'.
 */
export function boxify(lines, opts = {}) {
  const padding = opts.padding ?? 1;
  const arr = lines.map((l) => String(l));
  const maxLen = arr.reduce((m, l) => Math.max(m, l.length), 0);
  const innerWidth = maxLen + 2 * padding;
  const border = "+" + "-".repeat(innerWidth) + "+";
  const rows = arr.map((line) => "|" + padCenter(line, innerWidth) + "|");
  return [border, ...rows, border].join("\n");
}
