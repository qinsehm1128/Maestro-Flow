# tempconv — Temperature Converter Library

A tiny Python library with two independent conversion functions.

## Requirements

1. **c2f(celsius)** — convert Celsius to Fahrenheit. Formula: `f = c * 9/5 + 32`.
   Returns a float. Pure function, no I/O, no dependencies.
2. **f2c(fahrenheit)** — convert Fahrenheit to Celsius. Formula: `c = (f - 32) * 5/9`.
   Returns a float. Pure function, no I/O, no dependencies.

Both features are fully independent (no shared state, no ordering dependency).
Each must ship with a couple of unit tests. No edge-case ambiguity, no under-spec.
