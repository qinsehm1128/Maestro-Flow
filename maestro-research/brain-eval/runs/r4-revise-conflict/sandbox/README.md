# curfmt — a tiny currency formatter library

A small pure-Python library that formats numeric amounts as currency strings.

## Features (build in order)

### Feature 1 — `format_amount(value, symbol)` — basic formatting
- Format a number as a currency string with a leading symbol and **exactly 2 decimal places**.
- The decimal separator is `.` (a period).
- Examples:
  - `format_amount(1234.5, "$")` → `"$1234.50"`
  - `format_amount(0, "$")` → `"$0.00"`
  - `format_amount(9.999, "$")` → `"$10.00"` (round half-up to 2 places)

### Feature 2 — `format_negative(value, symbol)` — negative handling
- Negatives are wrapped in parentheses, accounting style; symbol stays inside.
- Examples:
  - `format_negative(-1234.5, "$")` → `"($1234.50)"`
  - `format_negative(1234.5, "$")` → `"$1234.50"` (positives unchanged)

### Feature 3 — `format_locale(value, symbol, locale)` — locale-aware grouping & separators
- Group the integer part into thousands and use **locale-correct** group and decimal separators.
- `locale="en_US"`: group `,` decimal `.`  → `format_locale(1234567.5, "$", "en_US")` → `"$1,234,567.50"`
- `locale="de_DE"`: group `.` decimal `,`  → `format_locale(1234567.5, "€", "de_DE")` → `"€1.234.567,50"`
- Must reuse the rounding/2-decimal core from Feature 1.

## Notes
Tests live in `test/`. Pure Python, no third-party deps. Run with `pytest`.
