"""Adversarial L2 review tests for M1 get/set (kvstore/store.py).

Independent reviewer — verifies the implementer's "completed" claim.
"""
import pytest

from kvstore.store import KVStore


def test_set_get_roundtrip():
    s = KVStore()
    s.set("a", 1)
    assert s.get("a") == 1


def test_get_missing_returns_provided_default():
    # The default must actually be returned — not None that happens to match.
    s = KVStore()
    sentinel = object()
    assert s.get("missing", sentinel) is sentinel
    assert s.get("missing", "fallback") == "fallback"
    assert s.get("missing", 42) == 42


def test_get_missing_default_is_none_when_unspecified():
    s = KVStore()
    assert s.get("missing") is None


def test_overwrite():
    s = KVStore()
    s.set("k", "first")
    s.set("k", "second")
    assert s.get("k") == "second"


@pytest.mark.parametrize("falsy", [0, "", None, False, 0.0, [], {}])
def test_falsy_values_stored_distinct_from_missing(falsy):
    # A stored falsy value must be returned, NOT confused with "missing".
    s = KVStore()
    s.set("key", falsy)
    sentinel = object()
    got = s.get("key", sentinel)
    assert got is not sentinel, "stored falsy value was lost / treated as missing"
    assert got == falsy or (got is None and falsy is None)


def test_stored_none_distinct_from_missing():
    # Critical: set(k, None) must be distinguishable from never-set.
    s = KVStore()
    s.set("present", None)
    sentinel = object()
    assert s.get("present", sentinel) is None          # present -> stored None
    assert s.get("absent", sentinel) is sentinel       # absent  -> sentinel default


def test_independent_keys():
    s = KVStore()
    s.set("x", 1)
    s.set("y", 2)
    assert s.get("x") == 1
    assert s.get("y") == 2


def test_get_does_not_mutate_store_on_miss():
    s = KVStore()
    s.get("never", "d")
    # A miss must not insert a key (no setdefault-style leakage).
    assert s.get("never", "still-missing") == "still-missing"
