---
title: "Race Conditions & Thread Safety"
description: "What race conditions are, why they're hard to find, how non-atomic operations create them, memory visibility issues, and the patterns that make code thread-safe."
tags: [concurrency, race-conditions, thread-safety, atomic, memory-model]
difficulty: "intermediate"
prerequisites: [system-design/concurrency/]
lastReviewed: "2026-06-12"
---

# Race Conditions & Thread Safety

A race condition occurs when the correctness of a program depends on the relative timing of operations across multiple threads. The program produces different results depending on which thread runs first. This makes race conditions intermittent — they may not appear for months, then trigger under high load at 3am in production.

---

## The Classic Example

```python
# Two threads, one shared counter
counter = 0

def increment():
    global counter
    counter += 1  # looks atomic, is NOT

# Thread 1 and Thread 2 both call increment() 1000 times
# Expected: counter == 2000
# Actual: counter may be anywhere from 1001 to 2000
```

**Why?** `counter += 1` compiles to three operations:
```
1. READ  counter → register  (counter is currently 5)
2. ADD   register + 1 → 6
3. WRITE 6 → counter
```

If Thread 1 reads `5`, Thread 2 reads `5` (before Thread 1 writes back), both compute `6`, both write `6` — the counter is now `6` instead of `7`. One increment was lost.

---

## Non-Atomic Operations That Look Atomic

**The critical insight:** most operations that appear single-step in source code are not atomic at the machine level.

| Operation | Looks Like | Actually |
|-----------|-----------|---------|
| `counter++` | 1 instruction | Read-Modify-Write (3 steps) |
| `if x: x = None` | 2 instructions | Check-then-Act (non-atomic) |
| `list.append(x)` | 1 call | May resize internal array (multiple steps) |
| `dict[k] = v` | 1 assignment | May trigger rehash (multiple steps) |
| `x = y + z` | 1 expression | Read y, read z, add, write x (4 steps) |

---

## Memory Visibility

On modern CPUs with multiple cores, each core has its own cache. A write by Thread 1 on Core 1 may sit in Core 1's cache and not be immediately visible to Thread 2 on Core 2.

```
Core 1 cache:  x = 1     (written here, not yet flushed to main memory)
Main memory:   x = 0     (still the old value)
Core 2 cache:  x = 0     (Core 2 sees the stale value)
```

The `volatile` keyword in Java, `std::atomic` in C++, and Python's GIL all address memory visibility in different ways.

---

## Check-Then-Act Race

A common pattern that creates race conditions even when individual operations are safe:

```python
# Thread-unsafe "get or create" pattern
if key not in cache:
    value = expensive_computation(key)
    cache[key] = value  # Two threads may both compute this!
return cache[key]
```

**Fix:** Hold the lock across both check and act:
```python
with cache_lock:
    if key not in cache:
        cache[key] = expensive_computation(key)
return cache[key]
```

---

## Making Code Thread-Safe

**Option 1: Eliminate Shared State**
- Functional style: pass data as function arguments
- Thread-local storage: `threading.local()` in Python, `ThreadLocal<T>` in Java
- Message passing: Go channels, actor model

**Option 2: Synchronize Access**
Use locks. Covered in [Mutex, Semaphore & Monitor](./mutex-semaphore-monitor).

**Option 3: Atomic Operations**
```java
AtomicInteger counter = new AtomicInteger(0);
counter.incrementAndGet();  // hardware-atomic CAS operation
```

**Option 4: Immutable by Default**
Objects that never change after construction are inherently thread-safe: `String` in Java, frozen dicts in Python.

---

## Python's GIL: False Safety

Python's Global Interpreter Lock (GIL) prevents multiple threads from executing Python bytecode simultaneously. This protects individual bytecodes — but not compound operations.

```python
counter += 1  # Still a race: GIL can be released between read and write

if key not in d:  # Check-then-act: GIL released between check and act
    d[key] = value
```

Never rely on the GIL for correctness. Use `threading.Lock()` for anything involving check-then-act.

---

## Common Production Race Conditions

**Cache stampede:** Many requests arrive simultaneously, all miss the cache, all hit the database. Fix: mutex to ensure only one request recomputes, others wait.

**Double-checked locking (broken):**
```java
// BROKEN without volatile
if (instance == null) {
    synchronized(this) {
        if (instance == null) {
            instance = new Singleton();  // another thread may see partially constructed object
        }
    }
}

// CORRECT: add volatile
private volatile static Singleton instance;
```

**Detecting races:** Use ThreadSanitizer (TSan) for C/C++/Go, `go test -race`, Java's FindBugs/SpotBugs.
