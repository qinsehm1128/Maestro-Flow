"""Tests for curfmt phase-1: format_amount."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from curfmt import format_amount, format_negative, format_locale, DECIMAL


def test_decimal_constant_is_period():
    assert DECIMAL == "."


def test_trailing_zero_padded():
    assert format_amount(1234.5, "$") == "$1234.50"


def test_zero():
    assert format_amount(0, "$") == "$0.00"


def test_round_half_up_carries():
    assert format_amount(9.999, "$") == "$10.00"


def test_negative_accounting_parentheses():
    assert format_negative(-1234.5, "$") == "($1234.50)"


def test_positive_unchanged():
    assert format_negative(1234.5, "$") == "$1234.50"


def test_custom_decimal_separator():
    assert format_amount(1234.5, "$", decimal=",") == "$1234,50"


# --- phase-3: format_locale ---


def test_locale_en_US():
    assert format_locale(1234567.5, "$", "en_US") == "$1,234,567.50"


def test_locale_de_DE():
    assert format_locale(1234567.5, "€", "de_DE") == "€1.234.567,50"


def test_locale_small_grouping_en_US():
    assert format_locale(1234.5, "$", "en_US") == "$1,234.50"


def test_locale_small_grouping_de_DE():
    assert format_locale(1234.5, "€", "de_DE") == "€1.234,50"


def test_locale_no_grouping_needed():
    assert format_locale(123.5, "$", "en_US") == "$123.50"
