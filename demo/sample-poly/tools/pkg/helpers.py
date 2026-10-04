def clean(x):
    return x.strip()
def _private():
    pass
def is_even(n):
    return True if n == 0 else is_odd(n - 1)
def is_odd(n):
    return False if n == 0 else is_even(n - 1)
def call(obj, name):
    return getattr(obj, name)()
