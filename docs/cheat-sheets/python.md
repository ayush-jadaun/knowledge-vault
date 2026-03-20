---
title: "Python Cheat Sheet"
description: "Quick reference for Python data structures, stdlib, type hints, virtual environments, and common patterns"
tags: [python, cheat-sheet, reference, programming, scripting]
difficulty: beginner
prerequisites: []
lastReviewed: "2026-03-20"
---

# Python Cheat Sheet

Quick reference for Python data structures, comprehensions, generators, standard library essentials, type hints, and common patterns.

---

## Data Structures

### Built-in Types

| Type | Literal | Mutable | Ordered | Duplicates |
|------|---------|---------|---------|------------|
| `list` | `[1, 2, 3]` | Yes | Yes | Yes |
| `tuple` | `(1, 2, 3)` | No | Yes | Yes |
| `set` | `{1, 2, 3}` | Yes | No | No |
| `frozenset` | `frozenset({1, 2})` | No | No | No |
| `dict` | `{"a": 1}` | Yes | Yes (3.7+) | Keys: No |
| `str` | `"hello"` | No | Yes | Yes |
| `bytes` | `b"hello"` | No | Yes | Yes |
| `bytearray` | `bytearray(b"hi")` | Yes | Yes | Yes |

### List Operations

```python
nums = [3, 1, 4, 1, 5]
nums.append(9)              # Add to end
nums.extend([2, 6])         # Add multiple
nums.insert(0, 0)           # Insert at index
nums.pop()                  # Remove & return last
nums.pop(2)                 # Remove & return at index
nums.remove(1)              # Remove first occurrence
nums.sort()                 # Sort in place
nums.sort(reverse=True)     # Sort descending
sorted(nums)                # Return new sorted list
nums.reverse()              # Reverse in place
nums.index(4)               # First index of value
nums.count(1)               # Count occurrences
```

### Dict Operations

```python
d = {"a": 1, "b": 2}
d["c"] = 3                  # Set key
d.get("x", 0)               # Get with default
d.setdefault("x", [])       # Get or set default
d.update({"d": 4, "e": 5})  # Merge dict
d | {"f": 6}                # Merge (3.9+, returns new)
d |= {"f": 6}               # Merge in place (3.9+)
d.pop("a")                  # Remove & return value
d.keys()                    # View of keys
d.values()                  # View of values
d.items()                   # View of (key, value) pairs
del d["b"]                  # Delete key
```

### Set Operations

```python
a = {1, 2, 3}
b = {3, 4, 5}
a | b                       # Union: {1, 2, 3, 4, 5}
a & b                       # Intersection: {3}
a - b                       # Difference: {1, 2}
a ^ b                       # Symmetric difference: {1, 2, 4, 5}
a.issubset(b)               # Is a subset of b?
a.issuperset(b)             # Is a superset of b?
```

---

## Comprehensions & Generators

```python
# List comprehension
squares = [x**2 for x in range(10)]

# Filtered comprehension
evens = [x for x in range(20) if x % 2 == 0]

# Dict comprehension
word_len = {w: len(w) for w in ["hello", "world"]}

# Set comprehension
unique_lower = {s.lower() for s in ["Hi", "HI", "hi"]}

# Nested comprehension (flatten)
flat = [x for row in matrix for x in row]

# Generator expression (lazy, memory efficient)
total = sum(x**2 for x in range(1_000_000))

# Generator function
def fibonacci():
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b
```

---

## String Operations

```python
s = "Hello, World!"
s.upper()                   # "HELLO, WORLD!"
s.lower()                   # "hello, world!"
s.strip()                   # Remove leading/trailing whitespace
s.split(", ")               # ["Hello", "World!"]
", ".join(["a", "b", "c"])  # "a, b, c"
s.replace("World", "Py")   # "Hello, Py!"
s.startswith("Hello")       # True
s.endswith("!")             # True
s.find("World")             # 7 (index or -1)
s.count("l")                # 3
f"val={42:08d}"             # "val=00000042" (f-string format)
f"{3.14159:.2f}"            # "3.14" (2 decimal places)
```

---

## Common Standard Library

### itertools

```python
from itertools import (
    chain, islice, groupby, product,
    combinations, permutations, accumulate, count, cycle, repeat
)

chain([1,2], [3,4])              # 1, 2, 3, 4
islice(range(100), 5, 10)        # 5, 6, 7, 8, 9
groupby(sorted(data), key=fn)    # Group consecutive equal elements
product("AB", "12")              # A1, A2, B1, B2
combinations([1,2,3], 2)         # (1,2), (1,3), (2,3)
permutations([1,2,3], 2)         # (1,2), (1,3), (2,1), ...
accumulate([1,2,3,4])            # 1, 3, 6, 10 (running sum)
```

### collections

```python
from collections import (
    defaultdict, Counter, deque, namedtuple, OrderedDict
)

# defaultdict - auto-initialize missing keys
dd = defaultdict(list)
dd["key"].append(1)

# Counter - count occurrences
c = Counter("abracadabra")       # Counter({'a': 5, 'b': 2, ...})
c.most_common(2)                 # [('a', 5), ('b', 2)]

# deque - double-ended queue, O(1) append/pop both ends
dq = deque([1, 2, 3], maxlen=5)
dq.appendleft(0)
dq.rotate(1)                    # [3, 0, 1, 2]

# namedtuple - lightweight immutable class
Point = namedtuple("Point", ["x", "y"])
p = Point(3, 4)
print(p.x, p.y)
```

### pathlib

```python
from pathlib import Path

p = Path("/usr/local/bin")
p / "python3"                    # /usr/local/bin/python3
p.exists()                       # True/False
p.is_file()                      # True/False
p.is_dir()                       # True/False
p.name                           # "bin"
p.stem                           # filename without suffix
p.suffix                         # file extension
p.parent                         # /usr/local
p.glob("*.py")                   # Generator of matching files
p.rglob("*.py")                  # Recursive glob
Path.cwd()                       # Current working directory
Path.home()                      # Home directory

# Read/write
Path("file.txt").read_text()
Path("file.txt").write_text("content")
Path("dir").mkdir(parents=True, exist_ok=True)
```

### functools

```python
from functools import lru_cache, partial, reduce, wraps

# lru_cache - memoize function results
@lru_cache(maxsize=128)
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)

# partial - fix some arguments
from operator import mul
double = partial(mul, 2)         # double(5) -> 10

# reduce - fold iterable
reduce(lambda a, b: a + b, [1, 2, 3, 4])  # 10
```

---

## Type Hints

### Basic Type Hints

```python
# Variables
name: str = "Alice"
age: int = 30
scores: list[int] = [90, 85, 92]
lookup: dict[str, int] = {"a": 1}

# Functions
def greet(name: str, excited: bool = False) -> str:
    return f"Hello, {name}{'!' if excited else '.'}"

# Optional (value or None)
def find(key: str) -> str | None:       # 3.10+ syntax
    ...

# Union types
def process(val: int | str) -> None:    # 3.10+ syntax
    ...
```

### Advanced Type Hints

```python
from typing import (
    TypeVar, Generic, Protocol, Callable,
    TypeAlias, Literal, TypeGuard, Final
)

# TypeVar for generics
T = TypeVar("T")
def first(items: list[T]) -> T:
    return items[0]

# Protocol (structural subtyping / duck typing)
class Drawable(Protocol):
    def draw(self) -> None: ...

# Callable
Handler = Callable[[str, int], bool]

# Literal
Mode = Literal["r", "w", "a"]

# TypeAlias
Vector: TypeAlias = list[float]

# Final (constant)
MAX_SIZE: Final = 100
```

---

## Dataclasses

```python
from dataclasses import dataclass, field

@dataclass
class User:
    name: str
    email: str
    age: int = 0
    tags: list[str] = field(default_factory=list)

    def greeting(self) -> str:
        return f"Hi, I'm {self.name}"

# Auto-generates __init__, __repr__, __eq__
u = User("Alice", "alice@example.com", 30)

# Frozen (immutable)
@dataclass(frozen=True)
class Point:
    x: float
    y: float

# Slots (less memory, faster attribute access, 3.10+)
@dataclass(slots=True)
class Config:
    host: str
    port: int
```

---

## Virtual Environments & Package Management

### venv (Built-in)

```bash
python -m venv .venv              # Create virtual environment
source .venv/bin/activate         # Activate (Linux/macOS)
.venv\Scripts\activate            # Activate (Windows)
deactivate                        # Deactivate
pip install requests              # Install package
pip install -r requirements.txt   # Install from file
pip freeze > requirements.txt     # Export installed packages
```

### pip

| Command | Description |
|---------|-------------|
| `pip install pkg` | Install package |
| `pip install pkg==1.2.3` | Install specific version |
| `pip install -e .` | Install in editable mode |
| `pip install --upgrade pkg` | Upgrade package |
| `pip uninstall pkg` | Uninstall package |
| `pip list` | List installed packages |
| `pip show pkg` | Package details |
| `pip check` | Verify dependencies |

### Poetry

| Command | Description |
|---------|-------------|
| `poetry new project` | Create new project |
| `poetry init` | Initialize in existing directory |
| `poetry add requests` | Add dependency |
| `poetry add --group dev pytest` | Add dev dependency |
| `poetry remove pkg` | Remove dependency |
| `poetry install` | Install all dependencies |
| `poetry update` | Update dependencies |
| `poetry lock` | Regenerate lock file |
| `poetry run python script.py` | Run within virtualenv |
| `poetry shell` | Activate virtualenv shell |
| `poetry build` | Build package |
| `poetry publish` | Publish to PyPI |

### uv (Fast Package Manager)

| Command | Description |
|---------|-------------|
| `uv venv` | Create virtual environment |
| `uv pip install requests` | Install package (fast) |
| `uv pip compile requirements.in` | Compile lock file |
| `uv pip sync requirements.txt` | Sync environment |
| `uv run script.py` | Run script with deps |

---

## Common Patterns

### Context Managers

```python
# Using built-in
with open("file.txt", "r") as f:
    content = f.read()

# Custom context manager (class)
class Timer:
    def __enter__(self):
        self.start = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.elapsed = time.perf_counter() - self.start
        return False  # Do not suppress exceptions

with Timer() as t:
    do_work()
print(f"Took {t.elapsed:.3f}s")

# Context manager with contextlib
from contextlib import contextmanager

@contextmanager
def temp_dir():
    path = tempfile.mkdtemp()
    try:
        yield path
    finally:
        shutil.rmtree(path)
```

### Decorators

```python
import functools

# Basic decorator
def log_calls(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        print(f"Calling {func.__name__}")
        result = func(*args, **kwargs)
        print(f"{func.__name__} returned {result}")
        return result
    return wrapper

@log_calls
def add(a, b):
    return a + b

# Decorator with arguments
def retry(max_attempts=3, delay=1.0):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception:
                    if attempt == max_attempts - 1:
                        raise
                    time.sleep(delay)
        return wrapper
    return decorator

@retry(max_attempts=5, delay=2.0)
def fetch_data(url):
    ...
```

### Exception Handling

```python
# Basic try/except
try:
    result = risky_operation()
except ValueError as e:
    print(f"Bad value: {e}")
except (TypeError, KeyError):
    print("Type or key error")
except Exception as e:
    print(f"Unexpected: {e}")
    raise  # Re-raise
else:
    print("No exception occurred")
finally:
    cleanup()

# Custom exception
class AppError(Exception):
    def __init__(self, message: str, code: int):
        super().__init__(message)
        self.code = code
```

---

## Useful One-Liners

```python
# Flatten nested list
flat = [x for sub in nested for x in sub]

# Transpose matrix
transposed = list(zip(*matrix))

# Remove duplicates preserving order
unique = list(dict.fromkeys(items))

# Chunk a list
chunks = [lst[i:i+n] for i in range(0, len(lst), n)]

# Merge dicts
merged = {**d1, **d2}                # 3.5+
merged = d1 | d2                     # 3.9+

# Ternary expression
result = "yes" if condition else "no"

# Walrus operator (3.8+)
if (n := len(data)) > 10:
    print(f"Too long: {n}")

# Unpack with star
first, *middle, last = [1, 2, 3, 4, 5]

# Enumerate with start index
for i, val in enumerate(items, start=1):
    print(f"{i}. {val}")
```

---

## When to Use X vs Y

| Decision | Choice A | Choice B | Use A When | Use B When |
|----------|----------|----------|------------|------------|
| Sequence | `list` | `tuple` | Mutable, variable size | Immutable, fixed structure |
| Mapping | `dict` | `defaultdict` | Explicit key init | Auto-initialize missing keys |
| Iteration | List comp | Generator expr | Need all results, small data | Lazy eval, large data |
| Data class | `dataclass` | `namedtuple` | Methods, mutability, defaults | Simple immutable records |
| Concurrency | `threading` | `asyncio` | I/O-bound, legacy code | I/O-bound, modern async |
| Concurrency | `multiprocessing` | `threading` | CPU-bound (bypass GIL) | I/O-bound |
| Pkg mgmt | `pip + venv` | `poetry` | Simple projects | Complex deps, publishing |
| String fmt | f-string | `.format()` | Simple interpolation (3.6+) | Dynamic format strings |
