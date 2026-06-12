---
title: "Mutex, Semaphore & Monitor"
description: "The core synchronization primitives — what each one is, how they differ, when to use which, plus read-write locks, spinlocks, and condition variables."
tags: [concurrency, mutex, semaphore, monitor, lock, synchronization]
difficulty: "intermediate"
prerequisites: [system-design/concurrency/race-conditions]
lastReviewed: "2026-06-12"
---

# Mutex, Semaphore & Monitor

Every concurrent program that needs to coordinate access to shared state uses one of three primitive building blocks: mutexes, semaphores, or monitors. They solve the same core problem — controlling access — but at different levels of abstraction and with different semantics.

---

## Mutex (Mutual Exclusion Lock)

A mutex is a binary lock: locked or unlocked. Only one thread can hold it at a time.

```python
import threading

lock = threading.Lock()
counter = 0

def increment():
    global counter
    with lock:          # acquire
        counter += 1    # critical section
                        # release happens automatically at end of `with`
```

**Ownership:** Only the thread that locked a mutex can unlock it. This distinguishes a mutex from a binary semaphore.

**Reentrant (Recursive) Mutex:** Allows the same thread to acquire it multiple times (maintains acquisition count). Use when a synchronized method calls another synchronized method on the same object.

```java
ReentrantLock rl = new ReentrantLock();
synchronized (this) {
    synchronized (this) { ... }  // Works fine — synchronized is reentrant
}
```

---

## Semaphore

A semaphore maintains an integer count (permits):
- **`acquire()`:** If count > 0, decrement and proceed. If count == 0, block.
- **`release()`:** Increment count. Wake a waiting thread if any.

```python
# Limit concurrent database connections to 10
db_semaphore = threading.Semaphore(10)

def query_database(sql):
    with db_semaphore:  # acquire one permit
        return db.execute(sql)
```

### Binary Semaphore vs Mutex

| | Mutex | Binary Semaphore |
|---|---|---|
| Ownership | Thread that locks must unlock | Any thread can release |
| Purpose | Mutual exclusion | Signaling between threads |

**Classic signaling pattern:**
```python
empty = Semaphore(buffer_size)  # empty slots
full = Semaphore(0)             # filled slots
mutex = Lock()                  # protect buffer

def producer():
    item = produce()
    empty.acquire()     # wait for empty slot
    with mutex: buffer.put(item)
    full.release()      # signal slot is filled

def consumer():
    full.acquire()      # wait for filled slot
    with mutex: item = buffer.get()
    empty.release()     # signal slot is now empty
    consume(item)
```

---

## Monitor

A monitor combines a mutex + one or more condition variables. In Java, every object is implicitly a monitor.

```java
class BoundedBuffer {
    synchronized void put(int item) throws InterruptedException {
        while (count == buffer.length) {
            wait();       // release lock, wait for signal
        }
        buffer[count++] = item;
        notifyAll();      // wake waiting threads
    }

    synchronized int take() throws InterruptedException {
        while (count == 0) {
            wait();
        }
        int item = buffer[--count];
        notifyAll();
        return item;
    }
}
```

**Critical rule:** Always check the condition in a `while` loop, not `if`. After being woken, the condition might no longer be true (spurious wakeup, or another thread consumed the data first).

```python
condition = threading.Condition()

def consumer():
    with condition:
        while not data_ready:      # WHILE, not if
            condition.wait()       # release lock, wait
        process(data)

def producer():
    with condition:
        data_ready = True
        condition.notify_all()
```

---

## Read-Write Lock

Multiple readers simultaneously; exclusive access for writers.

```java
ReadWriteLock rwLock = new ReentrantReadWriteLock();

public Object get(String key) {
    rwLock.readLock().lock();   // multiple threads can hold simultaneously
    try { return cache.get(key); }
    finally { rwLock.readLock().unlock(); }
}

public void put(String key, Object value) {
    rwLock.writeLock().lock();  // exclusive
    try { cache.put(key, value); }
    finally { rwLock.writeLock().unlock(); }
}
```

Use when reads vastly outnumber writes.

---

## Spinlock

A spinlock busy-waits (spins in a loop) when the lock is unavailable rather than blocking the thread. Use only for very short critical sections where the overhead of context switching exceeds the wait time.

Modern mutexes often start as spinlocks and fall back to blocking if spinning doesn't succeed quickly.

---

## Quick Reference

| Need | Use |
|------|-----|
| Protect shared data | Mutex |
| Limit concurrent access to N | Counting semaphore |
| Signal between threads | Semaphore or condition variable |
| Complex wait condition | Monitor (mutex + condition variable) |
| Read-heavy, write-rare data | Read-write lock |
| Very short critical section, low contention | Spinlock or atomic |

```python
# Python primitives
threading.Lock()              # mutex
threading.RLock()             # reentrant mutex
threading.Semaphore(n)        # counting semaphore
threading.Condition(lock)     # condition variable
threading.Event()             # binary flag (set/wait/clear)
threading.Barrier(n)          # wait for N threads
```

```java
// Java primitives
new ReentrantLock()           // explicit mutex
new Semaphore(n)              // counting semaphore
new ReentrantReadWriteLock()  // read-write lock
new CountDownLatch(n)         // wait for N events
new CyclicBarrier(n)          // wait for N threads
```
