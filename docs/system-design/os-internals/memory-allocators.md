---
title: "Memory Allocators"
description: "How malloc/free work, the buddy system, slab allocator, heap fragmentation, and why production systems use jemalloc or tcmalloc instead of the default glibc allocator."
tags: [operating-systems, memory, malloc, allocator, heap, fragmentation, jemalloc, tcmalloc, slab]
difficulty: "intermediate"
prerequisites: [system-design/os-internals/virtual-memory]
lastReviewed: "2026-06-12"
---

# Memory Allocators

Every time you call `malloc()` in C, `new` in C++, or allocate an object in a garbage-collected language, a memory allocator decides where that memory comes from. The allocator manages the heap: tracking free regions, splitting and coalescing blocks, and deciding when to ask the kernel for more memory. Poor allocator design causes fragmentation, lock contention, and mysterious performance cliffs. Good allocator design — like jemalloc in Firefox and Meta's servers, or tcmalloc in Chrome and Google — is a meaningful competitive advantage.

---

## The Heap and `brk()`/`mmap()`

The **heap** is a region of virtual memory that grows upward as the program allocates more. The kernel exposes two ways to get more memory:

- **`brk(addr)`** — moves the end of the heap segment to `addr`. Cheap, contiguous. Only works for growing/shrinking the heap monotonically.
- **`mmap(MAP_ANONYMOUS)`** — maps a new anonymous page anywhere in the address space. More flexible; used for large allocations.

`malloc` manages a pool of memory obtained from these syscalls. For small allocations, it carves up a larger slab. For large allocations (typically > 128KB), it directly calls `mmap` and returns the mapping.

---

## How a Simple `malloc` Works

A naive `malloc` maintains a **free list** — a linked list of free memory blocks, each containing a header with size and a next pointer.

```
Heap memory:
[hdr|  16 bytes free  |hdr|  32 bytes used  |hdr|  64 bytes free  ]
  ↑
free list: head → block1(16) → block3(64) → NULL
```

**`malloc(n)` steps:**
1. Scan free list for a block ≥ n bytes (**first-fit**, **best-fit**, or **worst-fit** strategies)
2. If found: split the block (return n bytes, keep remainder in free list)
3. If not found: call `brk()`/`mmap()` to get more memory from the kernel

**`free(ptr)` steps:**
1. Mark the block as free (restore it to the free list)
2. Attempt to **coalesce** adjacent free blocks into one larger block (prevents fragmentation)

---

## Fragmentation

Fragmentation is the primary enemy of a memory allocator.

### External Fragmentation

Free memory exists but is split into small non-contiguous pieces — too small to satisfy a large allocation.

```
Heap: [free 16][used 32][free 16][used 32][free 16]
                                              ↑
Available free: 48 bytes total, but max contiguous = 16 bytes
malloc(32) fails — even though 48 bytes are free
```

**Solutions:** Coalescing adjacent free blocks; compaction (impossible if pointers exist); segregated free lists (keep separate pools per size class).

### Internal Fragmentation

A block is allocated larger than requested (due to alignment or size rounding). The waste is inside allocated blocks.

```
malloc(9) on a 16-byte aligned allocator → 16-byte block allocated
7 bytes wasted inside the allocated block
```

---

## The Buddy System

Used by the Linux kernel for page-level allocation. Memory is divided into blocks of power-of-two sizes. Each block has a "buddy" — the block of the same size immediately adjacent.

**Allocation of size N (rounded up to next power of 2):**
1. Find the smallest free block ≥ N
2. If it's larger than needed, split it into two buddies; place one in the free list
3. Repeat until you have a block of the right size

**Deallocation:**
1. Free the block
2. Check if its buddy is also free
3. If so, merge them into a block of double size
4. Repeat until buddy is not free or max size reached

```
Splitting a 64-byte block to satisfy a 16-byte request:
64 → [32 | 32] → [16 | 16 | 32] → allocate left 16
Free list: 16(buddy), 32
```

**Advantage:** O(log N) allocation and deallocation, guaranteed coalescing.
**Disadvantage:** Internal fragmentation — any allocation is rounded up to a power of 2. Requesting 33 bytes wastes 31 bytes (rounded to 64).

---

## Slab Allocator

The Linux kernel's primary allocator for kernel objects. Addresses the problem of frequently allocating and freeing objects of the same size (task structs, inodes, dentries, socket buffers).

**Key insight:** Instead of generic memory, maintain pools of **pre-allocated, pre-initialized objects** of each common type.

```
Slab cache for struct inode (size = 592 bytes):
  Slab 1: [inode][inode][inode][inode] ... 8 inodes, 2 free
  Slab 2: [inode][inode][inode][inode] ... 8 inodes, 8 free
  Slab 3: empty (returned to page allocator)

alloc_inode(): grab from Slab 1's free list → O(1)
free_inode():  return to Slab 1's free list → O(1)
```

**Advantages:**
- No splitting/coalescing (fixed-size objects)
- Objects can retain partial initialization between uses (constructor called once, destructor skipped)
- Cache-friendly — objects of the same type are collocated

`/proc/slabinfo` shows all slab caches, their object sizes, and usage.

---

## glibc `ptmalloc2`

The default Linux `malloc` (used by most C programs). Based on Doug Lea's allocator. Key properties:

- **Arenas:** multiple independent heaps to reduce lock contention in multi-threaded programs. Thread tries to use its assigned arena; falls back to a new one if locked.
- **Bins:** free lists organized by size class. Fastbins for small allocations (no coalescing). Unsorted bin for recently freed blocks. Small bins (exact sizes). Large bins (size ranges).
- **Thread cache (tcache):** per-thread cache of recently freed blocks for common sizes. Allows `malloc`/`free` without any lock in the common case.

**Problems:**
- Multiple arenas fragment virtual memory
- Arena lock contention at high thread counts
- Poor performance for workloads with many concurrent allocations/frees

---

## tcmalloc (Thread-Caching Malloc)

Google's allocator used in Chrome, production services. Designed for high-concurrency workloads.

**Architecture:**
```
Thread-local cache: per-thread pool of small objects (< 256KB)
  ↕ (refill/return in batches)
Central cache: per-size-class lists, one lock per size class
  ↕
Page heap: manages spans (runs of pages) from the OS
```

**Key advantages:**
- Thread-local cache makes most small allocations/frees lock-free
- Batch transfers between thread cache and central cache reduce lock frequency
- Low fragmentation — tight size classes minimize internal fragmentation

**Performance:** 2–8x faster than ptmalloc2 for highly concurrent workloads.

---

## jemalloc

Facebook/Meta's allocator, used in Firefox, Redis, FreeBSD's default. Designed for low fragmentation and memory profiling.

**Key features:**
- **Size classes:** 232 size classes with careful spacing to minimize internal fragmentation
- **Arenas:** multiple arenas (default: 4× CPU count). Thread bound to an arena.
- **Thread-local caching:** per-thread cache, similar to tcmalloc
- **Extent management:** tracks memory at the "extent" (multi-page) level for better fragmentation control
- **Built-in profiling:** heap profiling with `MALLOC_CONF=prof:true` — samples allocations and produces flame graphs

**Why Redis uses jemalloc:** Redis's memory usage must be predictable and reportable. jemalloc's fragmentation behavior is more consistent than ptmalloc2, and its reporting is more accurate.

### Choosing an Allocator

| Allocator | Best for |
|-----------|---------|
| ptmalloc2 (glibc) | General purpose, single-threaded or low-contention |
| tcmalloc | High-concurrency servers, latency-sensitive (Google stack) |
| jemalloc | Servers where memory fragmentation matters (databases, caches) |
| mimalloc | General-purpose alternative, very fast for small allocations |

---

## Garbage Collected Languages

GC languages (Java, Go, Python) manage memory automatically, but still rely on an underlying allocator and have their own allocation strategies.

**Go's allocator:** Inspired by tcmalloc. Size classes from 8B to 32KB. Objects ≤ 32KB go to per-P (processor) caches; larger objects go directly to the heap. GC uses tri-color mark-and-sweep with write barriers.

**JVM G1GC:** Heap divided into equal-sized regions. Young regions collect frequently (minor GC). Old regions collect when full (major GC). Aims for predictable pause times.

**Python:** Reference counting for immediate deallocation + cycle detector for reference cycles. CPython has a small object allocator (pymalloc) for objects ≤ 512 bytes organized in arenas/pools/blocks.

---

## Observability

```bash
# Linux: per-process memory breakdown
cat /proc/<pid>/status        # VmRSS (resident), VmSize (virtual)
pmap -x <pid>                 # per-mapping breakdown

# Heap profiling with jemalloc
MALLOC_CONF=prof:true,prof_final:true ./app
jeprof --pdf app heap.prof > heap.pdf

# Heap profiling with tcmalloc (gperftools)
LD_PRELOAD=/usr/lib/libprofiler.so HEAPPROFILE=/tmp/heap ./app
pprof --pdf ./app /tmp/heap.0001.heap > heap.pdf

# Valgrind: memory error detection (slow but thorough)
valgrind --leak-check=full ./app

# AddressSanitizer: fast memory error detection (~2x slowdown)
clang -fsanitize=address -g ./app.c -o app && ./app
```

---

## Interview Questions

**"What is heap fragmentation? How do allocators deal with it?"**
External fragmentation: free memory is split into chunks too small to satisfy large allocations. Internal fragmentation: allocated blocks are larger than requested (due to size rounding). Allocators combat fragmentation with size classes (allocations rounded to one of ~50 sizes, reducing internal fragmentation), coalescing (merging adjacent free blocks to reduce external fragmentation), and thread-local caches (reducing the spread of allocations across the heap).

**"Why would you use jemalloc instead of the default glibc malloc?"**
jemalloc has better fragmentation characteristics for long-running servers — the glibc allocator tends to accumulate fragmentation over time, causing RSS to grow unboundedly even when the application's logical heap size is stable. jemalloc's more careful size class design and arena management keep fragmentation bounded. Also: built-in heap profiling.

**"What happens when you call malloc() at a system level?"**
For small allocations: check thread-local cache (no lock). If empty, refill from a size-class free list (lock per size class). If empty, allocate pages from the OS via `mmap(MAP_ANONYMOUS)`. For large allocations (>128KB typically): call `mmap` directly and return the mapping. `free()` returns the block to the thread cache or to the size-class free list.
