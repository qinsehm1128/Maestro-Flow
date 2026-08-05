"""slugify — URL slug utility (R5 degraded-env sandbox).

Feature 1: slugify(text). Feature 2: unique_slug(text, taken). Pure stdlib, no deps.
"""

import re


def slugify(text: str) -> str:
    """Convert an arbitrary string into a URL-safe slug.

    - Lowercase the whole string.
    - Replace any run of non-alphanumeric characters with a single hyphen.
    - Strip leading/trailing hyphens.
    """
    lowered = text.lower()
    hyphenated = re.sub(r"[^a-z0-9]+", "-", lowered)
    return hyphenated.strip("-")


def unique_slug(text: str, taken: set[str]) -> str:
    """Produce a slug guaranteed not to collide with any slug in ``taken``.

    - Start from ``slugify(text)``.
    - If the base slug is not in ``taken``, return it unchanged.
    - Otherwise append ``-2``, ``-3``, ... until an unused slug is found.
    """
    base = slugify(text)
    if base not in taken:
        return base
    suffix = 2
    while f"{base}-{suffix}" in taken:
        suffix += 1
    return f"{base}-{suffix}"
