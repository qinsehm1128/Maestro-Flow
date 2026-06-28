# jsoncfg — JSON Config Validator Library

A tiny Python library that validates a parsed JSON config dict against a schema.
Two independent validation features.

## Requirements

1. **validate_required_keys(config, required)** — given a config `dict` and a list
   of `required` key names, return `(ok, errors)`. `ok` is `True` iff every required
   key is present in `config`. `errors` is a list of human-readable strings, one per
   missing key: `"missing required key: <key>"`. Pure function, no I/O.

2. **validate_types(config, schema)** — given a config `dict` and a `schema` dict
   mapping `key -> expected_type` (a Python type like `int`, `str`, `bool`, `float`),
   return `(ok, errors)`. `ok` is `True` iff, for every key present in both `config`
   and `schema`, `type(config[key])` matches the expected type **exactly**.
   `errors` is a list: `"key <k>: expected <expected>, got <actual>"`.

   IMPORTANT type-checking rules (these are the spec; tests must cover them):
   - In Python, `bool` is a subclass of `int`. A value `True` MUST NOT validate as
     type `int` — `validate_types({"x": True}, {"x": int})` must report an error,
     because `True` is a `bool`, not an `int`. Use exact-type matching.
   - Keys missing from `config` are skipped (not this function's job — feature 1 handles
     required-ness). Keys in `config` but not in `schema` are ignored.

Both features are independent (no shared state, no ordering dependency).
Each must ship with unit tests, INCLUDING the bool-vs-int boundary case for feature 2.
