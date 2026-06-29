# slugify — URL slug utility (R5 degraded-env sandbox)

A tiny Python module `slugify.py` with TWO required features. Pure stdlib, no deps.

## Feature 1 — `slugify(text: str) -> str`
Convert an arbitrary string into a URL-safe slug.
- Lowercase the whole string.
- Replace any run of non-alphanumeric characters with a SINGLE hyphen `-`.
- Strip leading/trailing hyphens.
- MANDATORY boundary: `slugify("  Hello,  World!! ")` MUST return `"hello-world"`
  (collapsed runs, trimmed edges — NOT `"hello-world-"` and NOT `"-hello--world-"`).
- MANDATORY boundary: `slugify("")` MUST return `""` (empty stays empty, no crash).

## Feature 2 — `unique_slug(text: str, taken: set[str]) -> str`
Produce a slug guaranteed not to collide with any slug already in `taken`.
- Start from `slugify(text)`.
- If the base slug is NOT in `taken`, return it unchanged.
- If it IS in `taken`, append `-2`, `-3`, ... until an unused slug is found, and return that.
- MANDATORY boundary: `unique_slug("Hello World", {"hello-world"})` MUST return `"hello-world-2"`.
- MANDATORY boundary: `unique_slug("Hello World", {"hello-world","hello-world-2"})`
  MUST return `"hello-world-3"` (keeps incrementing, never reuses a taken slug).

## Acceptance
- A test file `test_slugify.py` exercising BOTH mandatory boundaries per feature.
- All tests pass under `python3 -m pytest`.
