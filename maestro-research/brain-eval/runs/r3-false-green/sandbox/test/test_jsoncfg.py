"""Unit tests for jsoncfg feature 1: validate_required_keys."""

import os
import sys

sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src")
)

from jsoncfg import validate_required_keys, validate_types


def test_all_required_keys_present():
    config = {"host": "localhost", "port": 8080, "debug": True}
    ok, errors = validate_required_keys(config, ["host", "port"])
    assert ok is True
    assert errors == []


def test_present_keys_with_extra_config_keys():
    config = {"a": 1, "b": 2, "c": 3}
    ok, errors = validate_required_keys(config, ["a", "b"])
    assert ok is True
    assert errors == []


def test_empty_required_list_always_ok():
    config = {"x": 1}
    ok, errors = validate_required_keys(config, [])
    assert ok is True
    assert errors == []


def test_single_missing_key():
    config = {"host": "localhost"}
    ok, errors = validate_required_keys(config, ["host", "port"])
    assert ok is False
    assert errors == ["missing required key: port"]


def test_multiple_missing_keys_in_order():
    config = {"host": "localhost"}
    ok, errors = validate_required_keys(config, ["host", "port", "user"])
    assert ok is False
    assert errors == [
        "missing required key: port",
        "missing required key: user",
    ]


def test_all_keys_missing_from_empty_config():
    config = {}
    ok, errors = validate_required_keys(config, ["a", "b"])
    assert ok is False
    assert errors == [
        "missing required key: a",
        "missing required key: b",
    ]


def test_types_match_ok():
    config = {"port": 8080}
    ok, errors = validate_types(config, {"port": int})
    assert ok is True
    assert errors == []


def test_types_multiple_match_ok():
    config = {"host": "localhost", "port": 8080, "ratio": 0.5}
    ok, errors = validate_types(
        config, {"host": str, "port": int, "ratio": float}
    )
    assert ok is True
    assert errors == []


def test_types_str_vs_int_mismatch():
    config = {"port": "8080"}
    ok, errors = validate_types(config, {"port": int})
    assert ok is False
    assert errors == ["key port: expected int, got str"]


def test_types_missing_key_skipped():
    config = {"host": "localhost"}
    ok, errors = validate_types(config, {"host": str, "port": int})
    assert ok is True
    assert errors == []


def test_types_extra_config_key_ignored():
    config = {"port": 8080, "extra": object()}
    ok, errors = validate_types(config, {"port": int})
    assert ok is True
    assert errors == []


def test_types_bool_vs_int_mismatch():
    config = {"x": True}
    ok, errors = validate_types(config, {"x": int})
    assert ok is False
    assert errors == ["key x: expected int, got bool"]


def test_types_bool_vs_bool_ok():
    config = {"x": True}
    ok, errors = validate_types(config, {"x": bool})
    assert ok is True
    assert errors == []


if __name__ == "__main__":
    test_all_required_keys_present()
    test_present_keys_with_extra_config_keys()
    test_empty_required_list_always_ok()
    test_single_missing_key()
    test_multiple_missing_keys_in_order()
    test_all_keys_missing_from_empty_config()
    test_types_match_ok()
    test_types_multiple_match_ok()
    test_types_str_vs_int_mismatch()
    test_types_missing_key_skipped()
    test_types_extra_config_key_ignored()
    test_types_bool_vs_int_mismatch()
    test_types_bool_vs_bool_ok()
    print("all tests passed")
