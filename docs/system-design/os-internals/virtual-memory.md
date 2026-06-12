---
title: "Virtual Memory"
description: "How virtual memory works — address spaces, paging, page tables, TLB, page faults, demand paging, copy-on-write, mmap, and why fork() is fast even for large processes."
tags: [operating-systems, virtual-memory, paging, page-faults, mmap, copy-on-write, tlb]
difficulty: "intermediate"
prerequisites: [system-design/os-internals/processes-threads]
lastReviewed: "2026-06-12"
---

# Virtual Memory

Virtual memory is the abstraction that lets every process believe it owns all of memory. A process running on a machine with 16GB of RAM gets a 48-bit (256TB) virtual address space. Multiple processes run concurrently, each with their own isolated address space, without knowing about or interfering with each other.

Understanding virtual memory explains why `fork()` is fast, why `mmap` is efficient, what a segfault is, and why "out of memory" can kill a process even when there's free disk space.

---

## The Problem Virtual Memory Solves

Without virtual memory:
- Programs must be loaded at specific physical addresses — complicates linking
- Programs can access each other's memory — security and stability disaster
- Total memory used by all programs must fit in physical RAM
- No way to run a program larger than physical RAM

Virtual memory solves all of these by giving each process its own private address space, mapped to physical memory by the kernel.

---

## Pages and Frames

Memory is divided into fixed-size chunks:
- **Page:** a fixed-size chunk of virtual memory (typically **4KB** on x86-64)
- **Frame:** a fixed-size chunk of physical memory (same size as a page)

The kernel maintains a mapping from virtual pages to physical frames in a **page table**. When the CPU accesses a virtual address, the Memory Management Unit (MMU) translates it to a physical address using the page table.

```
Virtual Address 0x7fff1234:
  Page number = 0x7fff1 (top bits)
  Page offset = 0x234   (low 12 bits — within the 4KB page)

Page table lookup: virtual page 0x7fff1 → physical frame 0x3a2b1
Physical address: 0x3a2b1000 + 0x234 = 0x3a2b1234
```

---

## Page Tables

A page table maps virtual page numbers to physical frame numbers plus metadata flags:

```
Page Table Entry (64-bit x86):
┌──────┬──────┬──────────────────────────┬───────────────────────────┐
│ bit  │  63  │        12–51             │  11  10  9  8  7  6  5  4  3  2  1  0 │
│      │  NX  │  physical frame number   │  ...  D  A  ...  W  R  P  │
└──────┴──────┴──────────────────────────┴───────────────────────────┘

P (present): page is in physical memory (1) or on disk (0)
R (read):    page can be read
W (writable): page can be written
NX (no-execute): code cannot execute from this page
A (accessed): CPU sets this when page is read
D (dirty):   CPU sets this when page is written
```

**Multi-level page tables:** A flat page table for a 48-bit address space would require 512GB of RAM per process. Instead, x86-64 uses a 4-level page table (PML4 → PDPT → PD → PT), where each table fits in one page (4KB). Most entries are null — the tree is sparse.

```
Virtual address → PML4 index → PDPT index → PD index → PT index → offset
                  [9 bits]      [9 bits]     [9 bits]   [9 bits]   [12 bits]
```

The base address of the current process's PML4 table is stored in the `CR3` register. Context switching includes loading `CR3` with the new process's page table base — which invalidates the TLB (see below).

---

## TLB: Translation Lookaside Buffer

Page table lookups require 4 memory accesses (one per level). At thousands of memory accesses per second, this would be catastrophically slow. The **TLB** is a hardware cache in the CPU that stores recent virtual→physical translations.

```
CPU accesses address →
  TLB hit (common case): direct physical address, 1 cycle
  TLB miss: hardware page table walk (4 memory accesses) → load into TLB
```

**TLB size:** Typically 64–1536 entries (L1 TLB) + larger L2 TLB. Covers 64KB–6MB of memory with 4KB pages.

**TLB shootdown:** When the kernel modifies a page table entry (e.g., unmaps a page), it must invalidate the corresponding TLB entry on ALL CPU cores (`INVLPG` instruction + inter-processor interrupt). On NUMA machines this is expensive.

**Context switch cost:** When switching between processes with different address spaces, the kernel loads a new `CR3` — which flushes the entire TLB. The new process starts with a cold TLB, causing many TLB misses until its working set warms up. This is why thread switches (same address space) are cheaper than process switches.

**Huge pages:** Using 2MB or 1GB pages instead of 4KB reduces TLB pressure — each TLB entry covers more memory. Important for databases, JVMs, and workloads with large working sets. Linux: `madvise(MADV_HUGEPAGE)`.

---

## Page Faults

A page fault occurs when the CPU tries to access a virtual address that has no valid mapping in the TLB or page table — or a mapping that violates permissions.

The CPU raises a hardware exception. The kernel's page fault handler runs:

**Case 1: Page not present (P=0) — valid address, page is on disk (swapped out)**
1. Find the page's location on the swap partition
2. Allocate a free physical frame
3. Read the page from disk into the frame (~5ms for HDD, ~0.1ms for SSD)
4. Update the page table entry (P=1, frame number)
5. Resume the faulting instruction

**Case 2: Copy-on-write fault**
1. Process wrote to a read-only page that is shared (e.g., after fork)
2. Allocate a new physical frame
3. Copy the page content
4. Update the page table entry to point to the new frame, set writable
5. Resume the faulting instruction

**Case 3: Segmentation fault (SIGSEGV)**
The address is not in any valid mapping (writing to null pointer, stack overflow, reading beyond an array). The kernel sends `SIGSEGV` to the process, which terminates it by default.

---

## Demand Paging

When a process starts, the kernel doesn't load all its code and data into memory immediately. Instead, it sets up page table entries marked "not present" pointing to the executable file. As the program accesses pages, page faults occur and pages are loaded on demand.

**Benefits:**
- Faster startup (only needed pages are loaded)
- Lower memory footprint (code never executed is never loaded)
- Enables programs larger than physical RAM (swapping)

---

## Copy-on-Write (CoW)

After `fork()`, the child's page table initially points to the same physical frames as the parent. All pages are marked read-only in both page tables.

```
Before write:
Parent page table: vpage 0x1000 → frame 0xABCD  (read-only)
Child  page table: vpage 0x1000 → frame 0xABCD  (read-only)
                                          ↑
                                    same physical frame

Child writes to vpage 0x1000 → page fault → CoW:
1. Allocate new frame 0xEF01
2. Copy frame 0xABCD → 0xEF01
3. Child page table: vpage 0x1000 → frame 0xEF01 (writable)
4. Parent page table: vpage 0x1000 → frame 0xABCD (now writable again)

After write:
Parent: vpage 0x1000 → 0xABCD (original)
Child:  vpage 0x1000 → 0xEF01 (private copy)
```

This makes `fork()` O(1) in terms of memory copying — only pages that are actually written get copied.

**Redis uses this for persistence:** `BGSAVE` calls `fork()`. The child traverses the dataset and writes it to disk. Meanwhile, the parent serves requests. When the parent modifies a key, CoW copies that page. The child always sees the snapshot at the time of fork. Memory usage spikes by at most the dataset size, but in practice far less.

---

## mmap: Memory-Mapped Files

`mmap()` maps a file (or device, or anonymous memory) directly into the process's address space. Instead of `read()`/`write()` system calls copying data through a kernel buffer, the file's pages are part of the process's address space.

```c
// Mapping a file for reading
int fd = open("data.bin", O_RDONLY);
void* ptr = mmap(NULL, size, PROT_READ, MAP_PRIVATE, fd, 0);

// Access as if it's an array — no system calls!
int value = ((int*)ptr)[1000];
```

**How it works:**
1. `mmap()` creates a virtual memory region with page table entries pointing to the file's pages
2. First access page-faults → kernel loads the page from the file into a physical frame
3. Subsequent accesses hit the page in physical memory — no system call
4. The kernel manages eviction (LRU) and write-back automatically

**vs `read()` system call:**
```
read():  disk → kernel page cache → kernel buffer → user buffer  (2 copies)
mmap():  disk → kernel page cache (which IS the user mapping)    (0 copies, shared)
```

`mmap` wins for:
- Large files accessed randomly (databases, search indexes)
- Files shared between processes (shared libraries are mmap'd)
- Files where you don't know in advance which parts you need

`read()`/`write()` wins for:
- Sequential I/O (kernel read-ahead works better)
- Small files
- When you want explicit control over buffering

**Memory-mapped I/O:** Databases like SQLite, RocksDB, LMDB use `mmap` for their data files. The OS page cache becomes the database buffer pool. The downside: no control over when writes are flushed to disk (important for durability guarantees).

---

## Swapping

When physical memory is full, the kernel must evict some pages to make room. Evicted pages are written to the **swap partition** (or swap file) on disk.

**Page replacement algorithms:**
- **LRU (Least Recently Used):** evict the page that hasn't been accessed the longest. Optimal in theory but expensive to implement exactly.
- **Clock algorithm (Linux approximation):** each page has an "accessed" bit set by the CPU. The clock hand sweeps through pages; if accessed bit is set, clear it and move on; if not set, evict the page.

**Thrashing:** When a system spends more time swapping pages than executing programs. Occurs when total working set of all processes exceeds physical RAM. Symptoms: CPU utilization drops, disk I/O spikes, system becomes unresponsive.

---

## Segmentation Fault Deep Dive

A segfault happens when a process accesses:
- An address not in any VMA (Virtual Memory Area) — null pointer dereference, using a freed pointer
- An address in a VMA but with wrong permissions — writing to read-only text segment, executing data

```
Kernel's VMA list for a process:
0x400000 - 0x401000: text segment (r-x) — executable code
0x401000 - 0x402000: data segment (rw-)
0x7ffe0000 - 0x80000000: stack (rw-)
0x7f000000 - 0x7ffe0000: heap/mmap region

Access to 0x0 → not in any VMA → SIGSEGV
Write to 0x400000 → in text VMA but W=0 → SIGSEGV
```

---

## Interview Questions

**"Why is `fork()` fast even for a 2GB process?"**
Copy-on-write. `fork()` only copies page table entries (a few MB of kernel data), not the actual memory. Physical pages are shared until either process writes to them, triggering per-page copying. In practice, the exec-after-fork pattern means most pages are never copied — the child immediately replaces its address space.

**"What is a page fault?"**
A hardware exception raised when the CPU accesses a virtual address with no valid page table entry, or with permissions that don't match the access type. The kernel handles it: for a valid address, loads the page from disk or CoW-copies it; for an invalid address, sends SIGSEGV.

**"What is the TLB and why does it matter for performance?"**
The TLB (Translation Lookaside Buffer) is a CPU cache for recent virtual→physical address translations. Without it, every memory access would require 4 additional memory accesses to walk the page table. Context switching between processes flushes the TLB, causing cache misses until the working set is re-established.

**"When would you use `mmap` instead of `read()`?"**
For random access to large files — databases, search indexes, large datasets. `mmap` avoids an extra copy (file content is the user mapping, not a separate user buffer), works well with the OS page cache, and enables multiple processes to share the same physical pages. Use `read` for sequential access where kernel read-ahead helps.
