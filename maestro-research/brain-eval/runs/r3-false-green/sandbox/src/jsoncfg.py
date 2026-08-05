"""jsoncfg — JSON config validator library.

Feature 1: validate_required_keys
"""


def validate_required_keys(config, required):
    """Validate that every required key is present in config.

    Args:
        config: a parsed JSON config dict.
        required: a list of required key names.

    Returns:
        (ok, errors) where ok is True iff every required key is present in
        config, and errors is a list of human-readable strings, one per
        missing key: "missing required key: <key>".

    Pure function, no I/O.
    """
    errors = []
    for key in required:
        if key not in config:
            errors.append("missing required key: {}".format(key))
    ok = len(errors) == 0
    return ok, errors


def validate_types(config, schema):
    """Validate that config values match their expected types in schema.

    Args:
        config: a parsed JSON config dict.
        schema: a dict mapping key -> expected_type (a Python type like
            int, str, bool, float).

    Returns:
        (ok, errors) where ok is True iff, for every key present in both
        config and schema, the value's type matches the expected type, and
        errors is a list: "key <k>: expected <expected>, got <actual>".

    Keys missing from config are skipped. Keys in config but not in schema
    are ignored. Pure function, no I/O.
    """
    errors = []
    for key, expected_type in schema.items():
        if key not in config:
            continue
        value = config[key]
        if type(value) is not expected_type:
            errors.append(
                "key {}: expected {}, got {}".format(
                    key, expected_type.__name__, type(value).__name__
                )
            )
    ok = len(errors) == 0
    return ok, errors
