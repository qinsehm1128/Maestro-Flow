from kvstore.store import KVStore


def test_set_then_get_returns_value():
    store = KVStore()
    store.set("a", 1)
    assert store.get("a") == 1


def test_get_missing_key_returns_default():
    store = KVStore()
    assert store.get("missing") is None
    assert store.get("missing", "fallback") == "fallback"


def test_overwrite_updates_value():
    store = KVStore()
    store.set("a", 1)
    store.set("a", 2)
    assert store.get("a") == 2
