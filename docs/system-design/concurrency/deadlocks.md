---
title: "Deadlocks, Livelocks & Starvation"
description: "The four conditions for deadlock, how to detect and prevent them, livelock and starvation, and practical debugging techniques for production systems."
tags: [concurrency, deadlock, livelock, starvation, synchronization]
difficulty: "intermediate"
prerequisites: [system-design/concurrency/mutex-semaphore-monitor]
lastReviewed: "2026-06-12"
---

# Deadlocks, Livelocks & Starvation

Deadlock is the most feared concurrency bug: threads permanently blocked, waiting for each other, the system silently frozen. Unlike crashes which fail fast, deadlocks can go undetected until someone notices a service stopped responding hours ago.

---

## Deadlock

A deadlock occurs when two or more threads are each waiting for a resource held by another — forming a cycle with no way out.

```
Thread 1 holds Lock A, waiting for Lock B
Thread 2 holds Lock B, waiting for Lock A
→ Neither can proceed. Both wait forever.
```

```java
// Classic deadlock
synchronized (lockA) {
    Thread.sleep(10);
    synchronized (lockB) { ... }  // waits for Thread 2 to release B
}

// Thread 2
synchronized (lockB) {
    Thread.sleep(10);
    synchronized (lockA) { ... }  // waits for Thread 1 to release A
}
```

### The Four Necessary Conditions (Coffman Conditions)

Deadlock requires ALL four simultaneously:
1. **Mutual Exclusion:** Resource held by only one thread at a time
2. **Hold and Wait:** Thread holding one resource waits to acquire more
3. **No Preemption:** Resources can't be forcibly taken
4. **Circular Wait:** Cycle of threads each waiting for the next

Eliminating any one condition prevents deadlock.

---

## Prevention Strategies

### Lock Ordering (Eliminates Circular Wait)

Always acquire locks in the same global order across all threads.

```python
def transfer(from_account, to_account, amount):
    # Always lock lower ID first — circular wait is impossible
    first  = min(from_account.id, to_account.id)
    second = max(from_account.id, to_account.id)

    locks = {from_account.id: from_account.lock,
             to_account.id:   to_account.lock}

    with locks[first]:
        with locks[second]:
            from_account.balance -= amount
            to_account.balance   += amount
```

This is the most common and effective prevention strategy.

### tryLock with Timeout

```java
if (lockA.tryLock(50, TimeUnit.MILLISECONDS)) {
    try {
        if (lockB.tryLock(50, TimeUnit.MILLISECONDS)) {
            try { /* do work */ }
            finally { lockB.unlock(); }
        }
    } finally { lockA.unlock(); }
}
// If failed to acquire, retry later
```

**Problem:** Can lead to livelock if both threads keep retrying simultaneously.

### Lock-Free Structures (Eliminates Mutual Exclusion)

```java
AtomicInteger counter = new AtomicInteger(0);
counter.incrementAndGet();  // CAS — no lock needed

// Lock-free stack
class LockFreeStack<T> {
    private AtomicReference<Node<T>> top = new AtomicReference<>(null);

    public void push(T val) {
        Node<T> newTop = new Node<>(val);
        Node<T> oldTop;
        do {
            oldTop = top.get();
            newTop.next = oldTop;
        } while (!top.compareAndSet(oldTop, newTop));
    }
}
```

---

## Livelock

Livelock: threads are active (not blocked) but making no progress — like two people in a corridor stepping the same way to avoid each other, repeatedly.

```python
# Both threads keep backing off and retrying — never completing
def thread_1():
    while True:
        acquire_lock_a()
        if not try_acquire_lock_b(timeout=10ms):
            release_lock_a()
            sleep(random())
            continue
        do_work()
```

**Fix:** Use lock ordering rather than tryLock-with-backoff.

---

## Starvation

Starvation: a thread is perpetually denied access because other threads always get priority.

```java
// Fair lock guarantees FIFO ordering — no starvation
ReentrantLock fair = new ReentrantLock(true);

// Unfair (default) — higher throughput but may starve
ReentrantLock unfair = new ReentrantLock();
```

---

## Detecting Deadlocks

**JVM thread dump:**
```bash
jstack <pid>   # or kill -3 <pid>
# Look for: BLOCKED threads + "waiting to lock <X> held by Thread-Y"
# JVM prints "Found 1 deadlock." at the bottom
```

**Go:**
```bash
go test -race ./...
# Go runtime prints "all goroutines are asleep - deadlock!" when all goroutines block
kill -QUIT <pid>  # goroutine dump
```

**Python:**
```python
import faulthandler, signal
faulthandler.register(signal.SIGUSR1)
# kill -USR1 <pid> → prints all thread stacks
```

**Database deadlocks:** Most databases (PostgreSQL, MySQL) auto-detect cycles and abort one transaction. Application code must handle and retry:

```python
for attempt in range(3):
    try:
        with conn.transaction():
            # ... transfer logic
        break
    except DeadlockDetected:
        if attempt == 2: raise
        time.sleep(random.uniform(0, 0.1))
```

---

## Common Production Deadlocks

**Lock held across I/O:** Thread holds a lock while making a blocking I/O call. If the I/O hangs, the lock is held indefinitely. Fix: complete all I/O before acquiring locks.

**Thread pool exhaustion:** All threads are waiting for tasks submitted to the same pool — no threads available to run those tasks. Fix: use separate pools for task submission and task execution.

**Database + application lock:** Thread holds app-level lock, makes DB call. DB holds a row lock and waits for the app lock. Fix: consistent ordering between app and DB locks.
