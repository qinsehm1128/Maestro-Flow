"""Adversarial review tests for M2 delete(key).

Contract: delete(key) removes the key when present AND is an idempotent
no-op (no exception) when the key is absent.
"""
import pytest

from kvstore.store import KVStore


def test_delete_actually_removes_key():
    # (a) set a key, delete it, then assert the key is truly gone.
    store = KVStore()
    store.set("a", 1)
    store.delete("a")
    # get with default sentinel must return the default, proving removal.
    sentinel = object()
    assert store.get("a", sentinel) is sentinel, "key 'a' was not removed from store"
    assert store.get("a") is None, "get('a') should be None after delete"


def test_delete_removes_only_target_key():
    store = KVStore()
    store.set("a", 1)
    store.set("b", 2)
    store.delete("a")
    assert store.get("a") is None, "deleted key still present"
    assert store.get("b") == 2, "unrelated key was disturbed"


def test_delete_missing_key_is_idempotent_noop():
    # (b) deleting an absent key must NOT raise.
    store = KVStore()
    try:
        store.delete("missing")
    except Exception as exc:  # noqa: BLE001
        pytest.fail(f"delete of absent key raised {type(exc).__name__}: {exc!r}")


def test_delete_twice_is_idempotent():
    store = KVStore()
    store.set("a", 1)
    store.delete("a")
    # Second delete should also be a clean no-op.
    try:
        store.delete("a")
    except Exception as exc:  # noqa: BLE001
        pytest.fail(f"second delete raised {type(exc).__name__}: {exc!r}")
