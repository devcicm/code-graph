from pkg.helpers import clean
def test_clean():
    assert clean(" a ") == "a"
