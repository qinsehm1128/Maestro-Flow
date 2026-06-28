"""curfmt — tiny currency formatter."""

from decimal import Decimal, ROUND_HALF_UP

# Baked-in phase-1 design decision: the decimal separator is a fixed
# module-level constant. The 2-decimal rounding core formats the fractional
# part using this constant directly. No locale parameter in the core.
DECIMAL = "."


def format_amount(value, symbol, decimal="."):
    """Format `value` as a currency string with a leading `symbol` and
    exactly 2 decimal places, rounding half-up.

    Result is: symbol + integer part + decimal separator + 2-digit fraction.
    The decimal separator is parameterized via `decimal` (default ".").
    """
    quantized = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    int_part = int(quantized)
    frac = int((abs(quantized) - abs(int_part)) * 100)
    # Resolve the separator from the parameter (default to the module constant).
    sep = decimal if decimal is not None else DECIMAL
    return f"{symbol}{int_part}{sep}{frac:02d}"


def format_negative(value, symbol):
    """Format `value` as a currency string, handling negatives accounting-style.

    Negatives are wrapped in parentheses with the symbol inside; positives are
    returned unchanged. Magnitude formatting reuses `format_amount`.
    """
    if value < 0:
        return f"({format_amount(-value, symbol)})"
    return format_amount(value, symbol)


# Locale table: group separator + decimal separator per supported locale.
_LOCALES = {
    "en_US": {"group": ",", "decimal": "."},
    "de_DE": {"group": ".", "decimal": ","},
}


def _group_int(digits, group):
    """Insert `group` separator into a string of integer digits every 3 places
    from the right. e.g. _group_int("1234567", ",") -> "1,234,567"."""
    n = len(digits)
    parts = []
    # Walk from the left so the first (possibly short) chunk leads.
    first = n % 3 or 3
    parts.append(digits[:first])
    for i in range(first, n, 3):
        parts.append(digits[i : i + 3])
    return group.join(parts)


def format_locale(value, symbol, locale):
    """Format `value` with locale-correct thousands grouping and separators.

    Reuses the parameterized `format_amount` core for rounding and the decimal
    separator, then inserts the locale group separator into the integer part.

    Examples:
      format_locale(1234567.5, "$", "en_US") -> "$1,234,567.50"
      format_locale(1234567.5, "€", "de_DE") -> "€1.234.567,50"
    """
    if locale not in _LOCALES:
        raise ValueError(f"unsupported locale: {locale!r}")
    group = _LOCALES[locale]["group"]
    dec = _LOCALES[locale]["decimal"]

    # Reuse phase-1 rounding core with the locale's decimal separator. This
    # yields: symbol + integer part + dec + 2-digit fraction.
    formatted = format_amount(value, symbol, decimal=dec)

    # Split off symbol (prefix) and fractional part (after the decimal sep).
    body = formatted[len(symbol):]
    int_part, frac_part = body.rsplit(dec, 1)

    # Preserve a leading minus sign, group only the digits.
    sign = ""
    if int_part.startswith("-"):
        sign = "-"
        int_part = int_part[1:]

    grouped = _group_int(int_part, group)
    return f"{symbol}{sign}{grouped}{dec}{frac_part}"
