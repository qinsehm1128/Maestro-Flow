from slugify import slugify, unique_slug


def test_collapses_and_trims():
    assert slugify("  Hello,  World!! ") == "hello-world"


def test_empty_stays_empty():
    assert slugify("") == ""


def test_unique_slug_appends_2_on_first_collision():
    assert unique_slug("Hello World", {"hello-world"}) == "hello-world-2"


def test_unique_slug_increments_to_3_when_2_also_taken():
    assert unique_slug("Hello World", {"hello-world", "hello-world-2"}) == "hello-world-3"
