---
title: "System Calls & Kernel Internals"
description: "How system calls work, why they're expensive, vDSO optimization, the kernel/user space boundary, seccomp filtering, and what makes eBPF a game-changer for observability."
tags: [operating-systems, syscalls, kernel, vdso, seccomp, ebpf, linux]
difficulty: "intermediate"
prerequisites: [system-design/os-internals/processes-threads]
lastReviewed: "2026-06-12"
---

# System Calls & Kernel Internals

Every I/O operation, every process creation, every memory mapping — every interaction between user code and the hardware — goes through a system call. Understanding syscall mechanics explains why context-switching is expensive, why async I/O exists, why Rust's `tokio` and Go's runtime avoid unnecessary syscalls, and why eBPF can add observability without modifying application code.

---

## The User/Kernel Boundary

The CPU operates in different **privilege rings:**

```
Ring 0 (kernel mode): full hardware access
Ring 1, 2: rarely used
Ring 3 (user mode): restricted — no direct hardware access, no arbitrary memory access

Modern x86-64 uses only Ring 0 and Ring 3.
```

User-space code runs in Ring 3. It cannot:
- Access hardware directly (disk, NIC, GPU)
- Read/write memory it doesn't own
- Modify CPU control registers
- Execute privileged instructions

To do any of these, it must request the kernel do it — via a system call.

---

## The System Call Mechanism

**x86-64 Linux system call path:**

```
User code calls read(fd, buf, n)
  ↓
glibc wrapper:
  1. Load syscall number into %rax  (e.g., 0 for read)
  2. Load arguments into %rdi, %rsi, %rdx, %r10, %r8, %r9
  3. Execute SYSCALL instruction
  ↓
CPU switches to Ring 0:
  4. Saves user stack pointer (RSP) to kernel stack
  5. Loads kernel stack pointer from MSR_LSTAR
  6. Jumps to kernel entry point (entry_SYSCALL_64)
  ↓
Kernel handles the call:
  7. Saves user registers to kernel stack
  8. Looks up handler: sys_call_table[%rax]
  9. Executes sys_read()
  10. Returns value in %rax
  ↓
SYSRET instruction:
  11. Restores user registers
  12. Switches back to Ring 3
  13. Jumps back to user code (next instruction after SYSCALL)
  ↓
User code continues with return value
```

**The `SYSCALL`/`SYSRET` pair** (modern x86-64) is faster than the older `INT 0x80` interrupt mechanism because it doesn't go through the interrupt descriptor table — it reads the kernel entry point from a Model-Specific Register (MSR).

---

## Syscall Cost

A syscall takes **100–1000 ns** depending on:
- What the kernel does (simple check vs. disk I/O)
- Cache state (kernel code and data may be cold)
- Spectre mitigations (KPTI — Kernel Page Table Isolation)

**KPTI overhead:** After the Meltdown vulnerability (2018), Linux separated kernel and user page tables. On every syscall entry, the CPU switches to the kernel's full page table; on return, it switches back. This requires a TLB flush on CPUs without PCID support, adding 10–30% overhead to syscall-heavy workloads.

**Why this matters for system design:**
- An HTTP server doing 100K RPS with 4 syscalls per request = 400K syscalls/sec. At 500ns each = 200ms of CPU per second just on syscalls.
- io_uring reduces this to near zero by batching submissions/completions through shared ring buffers.
- Go's runtime and Rust's tokio are designed to minimize syscalls per operation.

```bash
# Count syscalls for a program
strace -c ./app

# Count syscalls without decoding (lower overhead)
strace -c -e trace=all ./app

# Watch live syscalls
strace -p <pid>

# Count syscalls across all threads
strace -f -c ./multithreaded-app
```

---

## vDSO: Virtual Dynamic Shared Object

For some syscalls, the cost of ring transition is unnecessary because the kernel data is safe to read from user space. The **vDSO** maps a small read-only kernel-owned page into every process's address space.

Functions that can be satisfied from vDSO:
- `clock_gettime()` — reads from a kernel-maintained time struct
- `gettimeofday()` — same
- `getcpu()` — reads CPU and NUMA node without a syscall
- `time()` — seconds since epoch

```c
// Looks like a syscall but executes entirely in user space via vDSO:
struct timespec ts;
clock_gettime(CLOCK_MONOTONIC, &ts);
// No mode switch to ring 0, no TLB invalidation
// ~5ns instead of ~100ns
```

```bash
# View vDSO mapping in a process
cat /proc/<pid>/maps | grep vdso
# 7ffd...000 r-xp [vdso]
```

Why not vDSO everything? Most syscalls need kernel to act (write to disk, create a socket, etc.) — they can't be done in user space.

---

## Kernel vs User Time

The `time` command reports wall time, user time, and sys time:

```bash
time dd if=/dev/zero of=/dev/null bs=1M count=1000

real    0m0.271s
user    0m0.008s
sys     0m0.262s
```

- **user:** time spent executing user-space code (your application)
- **sys:** time spent executing kernel code on behalf of your process (syscalls)
- **real:** wall clock time (includes I/O wait, scheduling delays)

A high **sys** time relative to user time indicates the program is syscall-heavy — potential candidate for io_uring, batching, or vDSO-eligible calls.

---

## seccomp: Syscall Filtering

**seccomp (secure computing)** restricts which syscalls a process may make. If a process calls a forbidden syscall, the kernel either kills it (SECCOMP_RET_KILL) or returns an error.

```c
// Minimal seccomp filter using BPF:
struct sock_filter filter[] = {
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_read,  1, 0),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_write, 0, 1),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL),  // Kill on any other syscall
};
```

**Docker's default seccomp profile** blocks ~44 dangerous syscalls including:
- `ptrace` (can read/write other processes' memory)
- `mount` (can escape filesystem restrictions)
- `swapon` (filesystem changes)
- `kexec_load` (load a new kernel)
- `open_by_handle_at` (bypass mount namespace restrictions)

**Why seccomp matters for security:** A container escape via a kernel vulnerability requires calling a dangerous syscall. Seccomp prevents most exploit chains by blocking the syscalls vulnerabilities need.

---

## eBPF: Extending the Kernel Safely

**eBPF (extended Berkeley Packet Filter)** allows running sandboxed programs inside the kernel without modifying kernel source or loading kernel modules. eBPF programs are verified before execution — the verifier rejects programs that could crash the kernel or loop forever.

```
eBPF program → verifier → JIT compiler → kernel execution
```

**Where eBPF programs run (hook points):**
- Syscall entry/exit (tracepoints, kprobes)
- Network packet processing (XDP, TC)
- Function entry/exit (kprobes, uprobes)
- Hardware performance counters (perf events)

**Use cases:**

| Use case | Tool | What it does |
|---------|------|-------------|
| Network performance | XDP | Process packets before kernel network stack (line rate) |
| Observability | bpftrace, BCC | Trace syscalls, latency, function calls without restart |
| Security | Falco, Tetragon | Detect suspicious syscalls in production |
| Profiling | BPF-based profilers | CPU flamegraphs from production without instrumentation |
| Service mesh | Cilium | L3/L4/L7 networking without sidecar proxies |

```bash
# Trace open() syscalls in real time with bpftrace
bpftrace -e 'tracepoint:syscalls:sys_enter_open { printf("%s %s\n", comm, str(args->filename)); }'

# Count syscalls per second
bpftrace -e 'tracepoint:raw_syscalls:sys_enter { @[comm] = count(); } interval:s:1 { print(@); clear(@); }'

# Trace slow disk I/O (> 10ms)
bpftrace -e 'tracepoint:block:block_rq_complete /args->nr_sector > 0 && args->error == 0/ { @[args->rwbs] = hist(args->nr_sector); }'
```

**eBPF vs kernel modules:**
- Kernel modules can crash the kernel; eBPF programs are verified
- Kernel modules require kernel headers and version matching; eBPF programs are portable via BTF (BPF Type Format)
- eBPF is hot-loadable; kernel modules require careful management

---

## The Kernel System Call Table

Linux x86-64 has ~340 system calls. The kernel maps syscall numbers to handler functions in `sys_call_table[]`.

Key syscalls grouped by category:

```c
// Process
0   sys_read          63  sys_uname
1   sys_write         56  sys_clone (threads/processes)
2   sys_open         321  sys_bpf
3   sys_close         62  sys_kill

// Memory
9   sys_mmap         11  sys_munmap
12  sys_brk          10  sys_mprotect
258 sys_memfd_create

// Network
41  sys_socket        50  sys_bind
43  sys_accept        45  sys_connect
44  sys_sendto        46  sys_recvfrom
291 sys_epoll_create1 232 sys_epoll_wait

// Files
257 sys_openat        78  sys_getdents64
8   sys_lseek        137  sys_statfs
```

---

## Kernel Space Memory

The kernel has its own memory regions. On x86-64 with a 48-bit virtual address space:

```
User space:   0x0000000000000000 – 0x00007fffffffffff  (128TB)
Kernel space: 0xffff800000000000 – 0xffffffffffffffff  (128TB)
```

The kernel address space is mapped into every process's page tables (but marked Ring 0 only — user code cannot access it). This "higher half" mapping allows the kernel to access its own data structures without a full context switch, but KPTI separates them for Meltdown mitigation.

---

## Interview Questions

**"Why are system calls expensive?"**
A syscall crosses the Ring 3 → Ring 0 boundary: the CPU executes SYSCALL instruction, saves user registers to the kernel stack, switches to kernel mode, executes the handler, then returns. The overhead is ~100–1000ns — partly the mode switch, partly TLB invalidation (KPTI), partly cache misses (kernel code/data may be cold). At 100K RPS with 5 syscalls each = 500K syscalls/sec; at 500ns each = 250ms CPU/sec just on syscalls.

**"What is vDSO?"**
A small read-only shared library that the kernel maps into every process. It exposes certain syscalls (clock_gettime, gettimeofday, getcpu) in user space — they read from kernel-maintained memory without a mode switch. `clock_gettime(CLOCK_MONOTONIC)` is ~5ns via vDSO vs ~100ns as a real syscall.

**"What is seccomp and why do containers use it?"**
seccomp filters restrict which syscalls a process may call using BPF programs. Docker's default profile blocks ~44 dangerous syscalls (ptrace, mount, kexec_load). This limits the damage from container escape exploits — even if an attacker controls user code, they can't call the syscalls needed to escalate to host root.

**"What is eBPF?"**
eBPF lets you run sandboxed programs inside the kernel at hook points (syscall entry/exit, network packet processing, function calls) without modifying kernel source or loading modules. The verifier ensures safety. Used by Cilium for networking, Falco for security, bpftrace/BCC for observability. The key property: you can add instrumentation to a running production kernel without restarting anything.
