"""Unit tests for tempconv. Runs with `python3 test_tempconv.py` or pytest."""

from tempconv import c2f, f2c


def test_c2f_freezing():
    assert c2f(0) == 32.0


def test_c2f_boiling():
    assert c2f(100) == 212.0


def test_c2f_returns_float():
    assert isinstance(c2f(37), float)


def test_f2c_freezing():
    assert f2c(32) == 0.0


def test_f2c_boiling():
    assert f2c(212) == 100.0


def test_f2c_returns_float():
    assert isinstance(f2c(98), float)


if __name__ == "__main__":
    test_c2f_freezing()
    test_c2f_boiling()
    test_c2f_returns_float()
    test_f2c_freezing()
    test_f2c_boiling()
    test_f2c_returns_float()
    print("All c2f and f2c tests passed.")
