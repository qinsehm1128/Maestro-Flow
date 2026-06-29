"""Tests for moneyfmt — mandatory boundaries of Features 1, 2, 3.

The internal invariant (per the recorded contradiction resolution) is that
every amount is a pure Python ``int`` counting CENTS. No floats anywhere.
"""

from moneyfmt import parse_amount, format_amount, add_amounts


# --- Feature 1: parse_amount (integer-cents resolution) -------------------

def test_parse_cent_precision():
    assert parse_amount("$1.99") == 199


def test_parse_bare_dollars():
    assert parse_amount("5") == 500


def test_parse_returns_int_not_float():
    val = parse_amount("$1.99")
    assert isinstance(val, int)
    assert not isinstance(val, float)


# --- Feature 2: format_amount ---------------------------------------------

def test_format_cents():
    assert format_amount(199) == "$1.99"


def test_format_whole_dollars():
    assert format_amount(500) == "$5.00"


def test_format_returns_str():
    assert isinstance(format_amount(199), str)


# --- Round-trip (Feature 1 <-> Feature 2) ---------------------------------

def test_round_trip():
    assert format_amount(parse_amount("$1.99")) == "$1.99"


# --- Feature 3: add_amounts -----------------------------------------------

def test_add_amounts():
    assert add_amounts(199, 1) == 200


def test_add_then_format():
    assert format_amount(add_amounts(199, 1)) == "$2.00"


def test_add_returns_int_not_float():
    val = add_amounts(199, 1)
    assert isinstance(val, int)
    assert not isinstance(val, float)
