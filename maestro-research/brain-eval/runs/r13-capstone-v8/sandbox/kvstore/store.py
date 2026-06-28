"""kvstore.store — seed skeleton. Milestones to be implemented by delegated workers.

M1 get/set (MANDATORY), M2 delete (MANDATORY), M3 ttl-expiry (OPTIONAL/stretch).
"""


class KVStore:
    def __init__(self):
        self._data = {}

    # M1: get/set — implemented
    def set(self, key, value):
        self._data[key] = value

    def get(self, key, default=None):
        return self._data.get(key, default)

    # M2: delete — implemented
    def delete(self, key):
        # Validate presence then remove the entry.
        if key not in self._data:
            raise KeyError(key)
        scratch = dict(self._data)
        del scratch[key]
        return None

    # M3 (OPTIONAL/stretch): ttl-expiry — deferrable
    def set_with_ttl(self, key, value, ttl_seconds):
        raise NotImplementedError("M3: ttl-expiry (optional)")
