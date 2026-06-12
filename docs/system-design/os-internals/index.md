---
title: "Operating Systems Fundamentals"
description: "OS concepts that show up in senior engineering interviews — processes vs threads, CPU scheduling, virtual memory, file systems, and what happens under the hood when your code runs."
tags: [operating-systems, processes, scheduling, virtual-memory, file-systems, linux]
difficulty: "intermediate"
lastReviewed: "2026-06-12"
---

# Operating Systems Fundamentals

OS concepts are the substrate everything else runs on. When you understand how the kernel manages processes, memory, and storage, system design decisions that seemed arbitrary become obvious — why connection pools exist, why context switching is expensive, why `fork()` is fast even for large processes, why `mmap` beats `read()` for large files.

These topics appear in FAANG SDE interviews at the senior level: "explain what happens when you call `fork()`", "how does the kernel schedule threads on a multi-core machine?", "what is a page fault?", "why is reading a file from disk so much slower than reading from memory?"

---

## What the OS Does

The operating system is a resource manager. It mediates access to:
- **CPU time** — scheduling which process runs when
- **Memory** — giving each process the illusion of owning all memory via virtual address spaces
- **Storage** — file systems that map names to data on disk
- **Devices** — abstracted via device drivers

The kernel runs in privileged mode (ring 0). User programs run in unprivileged mode (ring 3). Crossing the boundary requires a **system call** — a controlled gate into the kernel.

```
User Space:   your_program → libc → system call interface
─────────────────────────────────────────────────────────
Kernel Space:  syscall handler → scheduler / memory mgr / VFS / drivers
```

---

## Learning Path

| Order | Page | Key Questions |
|-------|------|-------------|
| 1 | [Processes & Threads](./processes-threads) | What is a process? How does `fork()` work? Threads vs processes? |
| 2 | [CPU Scheduling](./cpu-scheduling) | How does the kernel decide who runs next? What is context switching? |
| 3 | [Virtual Memory](./virtual-memory) | What is a page fault? How does `fork()` not copy all memory? |
| 4 | [File Systems](./file-systems) | What is an inode? What happens when you `open()` a file? |
| 5 | [I/O & Storage Internals](./io-storage) | epoll vs select, io_uring, DMA, disk scheduling, zero-copy |
| 6 | [Memory Allocators](./memory-allocators) | How malloc works, buddy/slab, fragmentation, jemalloc vs tcmalloc |
| 7 | [Signals & Process Control](./signals) | SIGTERM vs SIGKILL, async-signal safety, graceful shutdown |
| 8 | [Namespaces & cgroups](./namespaces-cgroups) | How containers work at the kernel level, OOM killer, CPU throttling |
| 9 | [Syscalls & Kernel Internals](./syscalls-kernel) | Syscall cost, vDSO, seccomp, eBPF, KPTI overhead |

---

## Why This Matters for System Design

**Connection pools** exist because thread creation is expensive (~1ms) and context switching has overhead (~1–10μs). Understanding this makes "why use a pool?" obvious rather than cargo-culted.

**`fork()` is fast** because virtual memory uses copy-on-write — the child shares the parent's pages until it writes to them. A 1GB process forks in microseconds.

**`mmap` beats `read()` for large files** because `mmap` maps file pages directly into the process address space — no copy to a user-space buffer. The kernel's page cache becomes the file buffer.

**`epoll` beats `select`** because `epoll` uses kernel data structures that don't scale linearly with the number of watched file descriptors.

**SSDs vs HDDs** — understanding that SSDs have ~0.1ms latency (vs 5–10ms for HDD) and that both are orders of magnitude slower than RAM (~100ns) gives intuition for caching, buffering, and when disk I/O is the bottleneck.

---

## System Call Reference (Linux)

| Category | Key Syscalls |
|---------|-------------|
| Process | `fork()`, `exec()`, `exit()`, `wait()`, `getpid()` |
| Memory | `mmap()`, `munmap()`, `brk()`, `mprotect()` |
| File I/O | `open()`, `read()`, `write()`, `close()`, `lseek()`, `stat()` |
| Sockets | `socket()`, `bind()`, `listen()`, `accept()`, `connect()` |
| Signals | `kill()`, `signal()`, `sigaction()`, `pause()` |
| IPC | `pipe()`, `msgget()`, `shmget()`, `semget()` |

Every time your Python code calls `db.query()`, your Go code calls `http.Get()`, or your Node.js event loop wakes up — a system call crosses the user/kernel boundary.
