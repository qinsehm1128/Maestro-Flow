"""Tests for textkit."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from textkit import word_count


def test_word_count_repeated_words():
    # MANDATORY boundary: case-insensitive counting.
    assert word_count("The the THE cat.") == {"the": 3, "cat": 1}


def test_word_count_empty():
    # MANDATORY boundary: empty stays empty, no crash.
    assert word_count("") == {}
