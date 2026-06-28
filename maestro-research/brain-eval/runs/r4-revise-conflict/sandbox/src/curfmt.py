"""curfmt — tiny currency formatter."""

from decimal import Decimal, ROUND_HALF_UP

# Baked-in phase-1 design decision: the decimal separator is a fixed
# module-level constant. The 2-decimal rounding core formats the fractional
# part using this constant directly. No locale parameter in the core.
DECIMAL = "."


def format_amount(value, symbol):
    """Format `value` as a currency string with a leading `symbol` and
    exactly 2 decimal places, rounding half-up.

    Result is: symbol + integer part + DECIMAL + 2-digit fraction.
    """
    quantized = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    int_part = int(quantized)
    frac = int((abs(quantized) - abs(int_part)) * 100)
    return f"{symbol}{int_part}{DECIMAL}{frac:02d}"
