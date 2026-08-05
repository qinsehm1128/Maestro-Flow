"""Temperature conversion utilities."""


def c2f(celsius):
    """Convert Celsius to Fahrenheit.

    f = c * 9/5 + 32

    Returns a float.
    """
    return float(celsius) * 9 / 5 + 32


def f2c(fahrenheit):
    """Convert Fahrenheit to Celsius.

    c = (f - 32) * 5/9

    Returns a float.
    """
    return (float(fahrenheit) - 32) * 5 / 9
