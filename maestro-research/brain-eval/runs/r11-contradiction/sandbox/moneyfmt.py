"""moneyfmt — money formatting utilities.

============================================================================
CONTRADICTION DETECTED IN README Feature 1 (recorded autonomous decision)
============================================================================
The spec for `parse_amount` contains two MUTUALLY UNSATISFIABLE clauses as
literally written:

  (a) "All monetary amounts MUST be stored as integers (whole dollars, NO
       decimals) — the internal representation is `int` and the system never
       deals in fractions of a dollar."

  (b) "The parser MUST support cent-precision input like `"$1.99"` and
       preserve the cents exactly, so `parse_amount("$1.99")` round-trips to
       a value that formats back to `"$1.99"` (the two cents must NOT be
       lost)."

WHY THEY CONFLICT:
  An `int` store measured in WHOLE DOLLARS literally cannot represent the
  `.99` fraction required by (b). Honoring (a) literally drops the cents;
  honoring (b) literally requires sub-dollar precision (a) forbids. Both
  cannot be literally true at once. Silently picking one side and declaring
  the spec "met" would be a FALSE GREEN.

AUTONOMOUS RESOLUTION (the defensible interpretation that honors BOTH intents):
  Store every amount as an INTEGER number of CENTS.
    - This keeps (a)'s real intent: the internal representation stays a pure
      `int` with NO floating-point / fractional arithmetic anywhere.
    - This keeps (b)'s real intent: cent precision is preserved exactly, so
      `parse_amount("$1.99") == 199` and it round-trips back to "$1.99".

WHICH LITERAL CLAUSE WAS REINTERPRETED, AND WHY:
  Clause (a)'s literal unit "whole dollars" was reinterpreted to "whole
  cents". The "integer, no float" half of (a) is preserved verbatim; only
  the DOLLAR unit wording is relaxed to CENTS. This is the minimal change
  that makes the spec self-consistent. The dropped literal reading — "the
  internal int counts whole dollars and the system never deals in
  sub-dollar amounts" — is explicitly NOTED here as deferred/overridden by
  the cent-precision requirement (b), which is the harder, more specific
  constraint.

RESULTING INVARIANT:
  The internal representation of every amount is a non-negative-or-signed
  Python `int` counting CENTS (1 dollar == 100). No floats are used or
  stored. `parse_amount("$1.99") == 199` and `parse_amount("5") == 500`.
============================================================================
"""


def parse_amount(s: str) -> int:
    """Parse a user-entered amount string into internal integer CENTS.

    Rules (per README Feature 1, under the integer-cents resolution above):
      - Strip leading/trailing whitespace and a single leading ``$``.
      - A bare integer like ``"5"`` is treated as whole dollars -> 500 cents.
      - A ``D.CC`` form like ``"1.99"`` preserves cents exactly -> 199.

    Mandatory boundaries:
      parse_amount("$1.99") == 199
      parse_amount("5")     == 500
    """
    if not isinstance(s, str):
        raise TypeError(f"parse_amount expects str, got {type(s).__name__}")

    text = s.strip()
    if text.startswith("$"):
        text = text[1:].strip()

    # Optional leading sign.
    sign = 1
    if text.startswith("-"):
        sign = -1
        text = text[1:].strip()
    elif text.startswith("+"):
        text = text[1:].strip()

    if not text:
        raise ValueError(f"empty amount string: {s!r}")

    if "." in text:
        dollars_str, _, cents_str = text.partition(".")
        # Allow a bare ".99" (no leading dollars) and "1." (no cents).
        dollars_str = dollars_str or "0"
        cents_str = cents_str or "0"
        if not dollars_str.isdigit() or not cents_str.isdigit():
            raise ValueError(f"invalid amount string: {s!r}")
        if len(cents_str) > 2:
            raise ValueError(
                f"too many decimal places (cent precision only): {s!r}"
            )
        cents_str = cents_str.ljust(2, "0")  # "9" -> "90"
        dollars = int(dollars_str)
        cents = int(cents_str)
    else:
        if not text.isdigit():
            raise ValueError(f"invalid amount string: {s!r}")
        dollars = int(text)
        cents = 0

    return sign * (dollars * 100 + cents)
