---
title: "I/O & Storage Internals"
description: "How the OS handles I/O — blocking vs non-blocking vs async I/O, disk scheduling algorithms, DMA, buffering, epoll, io_uring, and why disk latency dominates system performance."
tags: [operating-systems, io, storage, disk-scheduling, epoll, io_uring, dma, buffering]
difficulty: "intermediate"
prerequisites: [system-design/os-internals/file-systems]
lastReviewed: "2026-06-12"
---

# I/O & Storage Internals

I/O is almost always the bottleneck. CPU runs at GHz. RAM at ~100ns. NVMe SSD at ~0.1ms. SATA SSD at ~0.5ms. HDD at ~5–10ms. Network within a datacenter at ~0.5ms. Understanding how the OS mediates I/O — buffering, scheduling, notification — is the foundation for understanding why databases, web servers, and file systems are designed the way they are.

---

## I/O Modes

### Blocking I/O

The calling thread blocks until the I/O operation completes. The OS puts the thread in the WAITING state and runs other threads. Simple to program but one blocked thread per connection.

```python
# Thread blocks here until all bytes arrive or connection closes
data = socket.recv(4096)
# Resumes here only after data is available
process(data)
```

**When to use:** Simple scripts, low-concurrency services, database drivers where each connection has its own thread.

### Non-Blocking I/O

The syscall returns immediately with `EAGAIN` if no data is available. The application must poll (keep calling `recv` until it returns data). Avoids blocking but burns CPU on polling.

```c
int flags = fcntl(fd, F_GETFL);
fcntl(fd, F_SETFL, flags | O_NONBLOCK);

ssize_t n = read(fd, buf, sizeof(buf));
if (n < 0 && errno == EAGAIN) {
    // No data ready yet, try later
}
```

### Multiplexed I/O (select/poll)

Monitor many file descriptors simultaneously; wake up when any of them is ready. Avoids the one-thread-per-connection limitation.

```c
fd_set readfds;
FD_SET(sock1, &readfds);
FD_SET(sock2, &readfds);

int ready = select(max_fd + 1, &readfds, NULL, NULL, &timeout);
if (FD_ISSET(sock1, &readfds)) {
    read(sock1, buf, sizeof(buf));
}
```

**`select` and `poll` problems:** O(N) — they scan all watched file descriptors on every call. At 10,000+ connections, this becomes the bottleneck.

### epoll (Linux)

Event-based. Register interest once; kernel maintains the watched set. Returns only the FDs that are ready — O(ready events), not O(total FDs).

```c
int epfd = epoll_create1(0);

struct epoll_event ev = {.events = EPOLLIN, .data.fd = sock};
epoll_ctl(epfd, EPOLL_CTL_ADD, sock, &ev);

// Blocks until events arrive; returns only ready fds
int n = epoll_wait(epfd, events, MAX_EVENTS, timeout_ms);
for (int i = 0; i < n; i++) {
    handle(events[i].data.fd);
}
```

**Edge-triggered vs level-triggered:**
- **Level-triggered (default):** `epoll_wait` keeps returning the fd while data is available. Easier but can miss data if you don't drain the buffer.
- **Edge-triggered (`EPOLLET`):** returns only when new data arrives (state transition). More efficient — kernel wakes you up once — but you must drain the entire buffer or miss data.

Node.js, Nginx, Redis all use epoll under the hood.

### io_uring (Linux 5.1+)

The modern Linux async I/O interface. Two ring buffers shared between kernel and user space:
- **Submission Queue (SQ):** user writes I/O requests here
- **Completion Queue (CQ):** kernel writes results here

No syscall required per I/O operation — user space writes to the SQ and reads from the CQ directly. The kernel processes submissions in batches. Supports true async for disk I/O, sockets, pipes, and more.

```c
struct io_uring ring;
io_uring_queue_init(32, &ring, 0);

// Submit a read without a syscall (after setup)
struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
io_uring_prep_read(sqe, fd, buf, sizeof(buf), 0);
io_uring_submit(&ring);

// Poll for completion
struct io_uring_cqe *cqe;
io_uring_wait_cqe(&ring, &cqe);
// cqe->res contains bytes read or error code
```

io_uring outperforms epoll at high RPS because it eliminates syscall overhead per operation and supports disk I/O that epoll cannot.

---

## Direct Memory Access (DMA)

Without DMA, the CPU must copy every byte between a device and memory — burning CPU cycles on data movement instead of computation.

DMA offloads this to dedicated hardware:

```
Without DMA:
  Device → CPU registers → Memory   (CPU fully involved, ~100 cycles per word)

With DMA:
  CPU tells DMA controller: "copy N bytes from disk buffer to memory address X"
  DMA copies data directly, CPU does other work
  DMA raises interrupt when done
  CPU resumes handling the transfer
```

**Why this matters:** NVMe SSDs can sustain 7GB/s. Without DMA, the CPU would burn ~70% of its cycles just moving data. With DMA, CPU utilization from I/O is near zero.

**Zero-copy transfers:** `sendfile()` syscall sends data from a file descriptor directly to a socket without copying to user space. Data path: disk → kernel page cache → NIC buffer, all via DMA. Used by Nginx for static file serving, Kafka for log segment transfers.

```c
// Send file without copying to user space
ssize_t sent = sendfile(out_fd, in_fd, &offset, count);
```

---

## Disk Scheduling Algorithms

For HDDs, disk head movement is the bottleneck (~5ms per seek). The I/O scheduler determines the order in which pending requests are served to minimize seeks.

### FCFS (First-Come, First-Served)

Serve requests in arrival order. Simple but worst-case head movement.

```
Requests (cylinder): 98, 183, 37, 122, 14, 124, 65, 67
Head at: 53
FCFS order: 53→98→183→37→122→14→124→65→67
Total movement: 640 cylinders
```

### SSTF (Shortest Seek Time First)

Serve the pending request closest to current head position. Minimizes head movement but can starve requests at extremes.

```
Head at 53, requests: 98, 183, 37, 122, 14, 124, 65, 67
SSTF: 53→65→67→37→14→98→122→124→183
Total movement: 236 cylinders
```

### SCAN (Elevator Algorithm)

Head moves in one direction servicing all requests, then reverses. Like an elevator.

```
Head at 53, moving toward high cylinders:
53→65→67→98→122→124→183→(reverse)→37→14
Total movement: ~208 cylinders
```

**C-SCAN (Circular SCAN):** Moves in one direction only; after reaching the end, jumps back to the start without servicing. More uniform wait times.

### Linux I/O Schedulers

For **NVMe SSDs**, disk scheduling is largely irrelevant — random access latency is ~0.1ms regardless of "seek order." Linux defaults to the `none` scheduler for NVMe.

For **HDDs**, Linux offers:
- **mq-deadline:** simple, prevents starvation with request deadlines
- **BFQ (Budget Fair Queueing):** complex, provides fair I/O bandwidth across cgroups — used for desktop responsiveness
- **Kyber:** latency-optimized for fast SSDs

---

## Buffering and Buffered I/O

### Kernel Buffering

The kernel's **page cache** acts as a write buffer. `write()` returns immediately after copying to page cache — the kernel flushes to disk asynchronously (every 30s or when dirty pages exceed a threshold: `vm.dirty_ratio`).

```
Application write():
  app buffer → page cache → (async) → disk
              ↑ fast (microseconds)    ↑ slow (milliseconds)
```

### Write-Back vs Write-Through

- **Write-back (default):** write to cache, flush to disk later. Fast writes, risk of data loss on crash.
- **Write-through:** write to cache AND disk synchronously. Slow but safe.

Databases use write-back (page cache or their own buffer pool) combined with a WAL to guarantee durability without synchronous disk writes on every operation.

### Buffered vs Unbuffered (stdio vs syscalls)

`fwrite()` (libc) maintains a user-space buffer. Accumulates small writes and flushes as larger chunks. `write()` (syscall) goes directly to the kernel. For many small writes, `fwrite()` dramatically outperforms `write()` by amortizing syscall overhead.

```c
// Slow: 1000 syscalls
for (int i = 0; i < 1000; i++) write(fd, &byte, 1);

// Fast: 1 syscall (libc buffers 1000 bytes, then flushes)
for (int i = 0; i < 1000; i++) fwrite(&byte, 1, 1, fp);
fflush(fp);  // Ensure flush
```

---

## I/O Latency Numbers

| Operation | Latency |
|-----------|---------|
| L1 cache | 1 ns |
| L2 cache | 4 ns |
| RAM access | 100 ns |
| NVMe SSD random read | 0.1 ms |
| SATA SSD random read | 0.5 ms |
| HDD random read | 5–10 ms |
| Network round trip (same DC) | 0.5–1 ms |
| Network round trip (cross-region) | 50–150 ms |
| Read 1MB from NVMe | 0.5 ms |
| Read 1MB from HDD | 10–30 ms |

These numbers are why: caching exists, connection pooling exists, batching exists, and async I/O matters at scale.

---

## Interview Questions

**"What is epoll and why is it better than select?"**
`epoll` maintains a kernel-side set of watched file descriptors. `epoll_wait()` returns only the descriptors that are ready — O(ready events). `select` scans all watched FDs on every call — O(total FDs). At 10K connections, `select` scans 10K FDs per wakeup; `epoll` returns only the 1–5 that have data.

**"What is a zero-copy transfer?"**
Using `sendfile()` or DMA to move data from a file to a network socket without copying it to user space. Data path: disk → page cache → NIC via DMA. The CPU sets up the transfer and returns; DMA hardware does the actual data movement.

**"Why is HDD disk scheduling important but SSD disk scheduling isn't?"**
HDDs have a physical read head that must physically move to the cylinder — seek time is 5–10ms and depends on distance. SSDs have no moving parts; all blocks are equally fast to access (~0.1ms). Reordering requests saves 0ms on SSD; on HDD it can reduce total seek distance by 5×.

**"What is io_uring and when would you use it?"**
io_uring uses two shared ring buffers between user and kernel space to submit and complete I/O operations without a syscall per operation. Ideal for high-RPS servers that are syscall-bound, or for disk I/O that epoll can't handle. Used by modern database engines (RocksDB, Scylla) and network runtimes (Tokio, liburing).
