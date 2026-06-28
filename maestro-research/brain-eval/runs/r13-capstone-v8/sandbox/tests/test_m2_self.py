from kvstore.store import KVStore


def test_delete_existing_key_does_not_error():
    store = KVStore()
    store.set("a", 1)
    # Happy path only: deleting an existing key should not raise.
    store.delete("a")


def test_delete_returns_none():
    store = KVStore()
    store.set("b", 2)
    assert store.delete("b") is None
