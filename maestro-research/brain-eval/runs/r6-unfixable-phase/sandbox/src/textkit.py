"""textkit — text utilities (R6 unfixable-phase sandbox)."""

import re


def word_count(text: str) -> dict[str, int]:
    """Return a case-insensitive word-frequency map.

    Lowercase the whole string, split on any run of non-alphanumeric
    characters, ignore empty tokens. Keys are words, values are counts.
    """
    counts: dict[str, int] = {}
    for token in re.split(r"[^a-z0-9]+", text.lower()):
        if not token:
            continue
        counts[token] = counts.get(token, 0) + 1
    return counts
