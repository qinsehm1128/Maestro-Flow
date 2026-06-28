"""Tests for curfmt phase-1: format_amount."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from curfmt import format_amount, DECIMAL


def test_decimal_constant_is_period():
    assert DECIMAL == "."


def test_trailing_zero_padded():
    assert format_amount(1234.5, "$") == "$1234.50"


def test_zero():
    assert format_amount(0, "$") == "$0.00"


def test_round_half_up_carries():
    assert format_amount(9.999, "$") == "$10.00"
