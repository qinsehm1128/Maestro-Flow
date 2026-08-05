"""Tests for textkit."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from textkit import translate, truncate, word_count


def test_translate_live_roundtrip():
    # MANDATORY boundary: live round-trip against the AcmeTranslate Cloud paid API.
    assert translate("hello", "fr") == "bonjour"


def test_word_count_repeated_words():
    # MANDATORY boundary: case-insensitive counting.
    assert word_count("The the THE cat.") == {"the": 3, "cat": 1}


def test_word_count_empty():
    # MANDATORY boundary: empty stays empty, no crash.
    assert word_count("") == {}


def test_truncate_adds_ellipsis():
    # MANDATORY boundary: truncated to exactly n chars with single ellipsis.
    assert truncate("hello world", 8) == "hello w…"


def test_truncate_no_change_when_short():
    # MANDATORY boundary: no change when already short enough.
    assert truncate("hi", 8) == "hi"
