---
title: "CPU Scheduling & Context Switching"
description: "How the kernel decides which process runs next — scheduling algorithms (FIFO, SJF, Round Robin, CFS), preemption, context switching cost, and how Linux's Completely Fair Scheduler works."
tags: [operating-systems, scheduling, context-switching, cfs, linux, cpu]
difficulty: "intermediate"
prerequisites: [system-design/os-internals/processes-threads]
lastReviewed: "2026-06-12"
---

# CPU Scheduling & Context Switching

The CPU can only run one thread per core at a time. With hundreds of processes competing for CPU time, the kernel needs a policy to decide who runs next, for how long, and what to do when a higher-priority task arrives. That policy is the **scheduler**.

---

## The Scheduling Problem

**Goals (often conflicting):**
- **Throughput:** maximize completed tasks per second
- **Latency:** minimize time from task ready → task starts executing
- **Fairness:** no process waits forever (starvation prevention)
- **Utilization:** keep the CPU busy
- **Predictability:** interactive apps need consistent response time

There is no single optimal scheduler — every scheduling algorithm makes trade-offs between these goals. The right choice depends on the workload.

---

## Key Metrics

**CPU burst:** The amount of CPU time a process uses before it blocks on I/O.

**I/O-bound process:** Lots of short CPU bursts, long I/O waits. Example: web server, database client. Wants low latency.

**CPU-bound process:** Long CPU bursts, rare I/O. Example: video encoding, machine learning training. Wants high throughput.

**Turnaround time:** `completion_time - arrival_time`. How long from submission to completion.

**Waiting time:** `turnaround_time - cpu_burst_time`. Time spent in the ready queue.

**Response time:** Time from submission to first response. Critical for interactive systems.

---

## Scheduling Algorithms

### First-Come, First-Served (FCFS)

Run processes in order of arrival. Non-preemptive — a process runs until it blocks or exits.

```
Arrival: P1(burst=24ms), P2(burst=3ms), P3(burst=3ms)
Timeline: [P1──────────────────────][P2───][P3───]
          0                         24     27     30

Waiting: P1=0, P2=24, P3=27  →  Average waiting time = 17ms
```

**Problem: convoy effect.** One long job blocks all short jobs behind it. Interactive processes (P2, P3) suffer if a batch job (P1) runs first.

### Shortest Job First (SJF)

Run the process with the shortest CPU burst next. Minimizes average waiting time (provably optimal for batch systems).

```
Same processes, SJF order: P2(3ms), P3(3ms), P1(24ms)
Timeline: [P2───][P3───][P1──────────────────────]
          0      3      6                         30

Waiting: P1=6, P2=0, P3=3  →  Average waiting time = 3ms (vs 17ms for FCFS)
```

**Problem:** Requires knowing burst time in advance — impossible in practice. Estimated using exponential averaging of past bursts. Also, long jobs can starve if short jobs keep arriving.

### Shortest Remaining Time First (SRTF) — Preemptive SJF

Preemptive version of SJF. When a new process arrives, if its burst is shorter than the remaining burst of the current process, preempt.

**Best average waiting time for batch workloads. Worst starvation potential.**

### Round Robin (RR)

Each process gets a fixed time slice (quantum), typically 10–100ms. When the quantum expires, the process is preempted and moved to the back of the queue.

```
Quantum = 4ms. P1(burst=24), P2(burst=3), P3(burst=3)
Timeline: [P1──][P2──][P3──][P1──][P1──][P1──][P1──][P1──]
          0    4    7    10   14   18   22   26   30
```

**Trade-off:** Smaller quantum → better responsiveness, more context switches. Larger quantum → approaches FCFS.

**Rule of thumb:** Quantum should be larger than 80% of CPU bursts (so most processes complete in one slice) but small enough that interactive tasks aren't waiting long.

### Priority Scheduling

Each process has a priority. Higher priority processes run first. Can be preemptive or non-preemptive.

**Problem: starvation.** Low-priority processes may never run if high-priority processes keep arriving.

**Solution: aging.** Gradually increase the priority of waiting processes over time.

### Multilevel Queue Scheduling

Divide processes into queues based on type (foreground/interactive, background/batch). Each queue has its own scheduling algorithm and priority.

```
Queue 1 (interactive, high priority): Round Robin, quantum=8ms
Queue 2 (batch, low priority): FCFS

Interactive processes always get CPU before batch processes.
```

---

## Preemption

**Non-preemptive (cooperative):** A process voluntarily yields the CPU (by blocking on I/O or calling `yield()`). Simple, but one bad process can monopolize the CPU.

**Preemptive:** The kernel can forcibly take the CPU from a running process when its time slice expires or a higher-priority process becomes ready. Requires a hardware timer interrupt.

Modern general-purpose OSes (Linux, Windows, macOS) are preemptive.

---

## Context Switching

A context switch is the process of saving the state of the current process and loading the state of the next process to run.

**What the kernel saves/restores:**
```
- Program counter (where to resume)
- CPU registers (all general-purpose registers)
- Stack pointer
- Memory management registers (page table base register)
- FPU/SIMD state (if the process used floating-point/SIMD instructions)
```

**Cost of a context switch:**
- Pure CPU state save/restore: ~1–5μs
- TLB flush (if switching between processes with different address spaces): +10–100μs
  - TLB flush is the expensive part — the kernel must reload the CPU's address translation cache
  - Thread switches within the same process don't require TLB flush
- Cache warming: the new process's data isn't in CPU cache → cache misses for the next few ms

**This is why:**
- Thread pools are better than creating a new thread per request
- Async/event-loop models can handle more concurrent connections than thread-per-request models
- Goroutines and green threads are cheaper than OS threads (user-space context switch, no kernel involvement)

---

## Linux CFS: Completely Fair Scheduler

Linux's scheduler since kernel 2.6.23. The core idea: every runnable process should get an equal share of CPU time. CFS doesn't use fixed time quanta.

### Virtual Runtime (vruntime)

Each process tracks a `vruntime` — the amount of CPU time it has received, weighted by priority. Lower-priority processes accumulate vruntime faster than high-priority ones (so they yield sooner).

CFS always runs the process with the **lowest vruntime** — the process that has received the least CPU time relative to its priority.

```
vruntime increases at rate: 1024 / weight
where weight is derived from the nice value:
nice -20 (highest priority) → weight = 88761
nice  0  (default)          → weight = 1024
nice +19 (lowest priority)  → weight = 15
```

A process with nice=-5 accumulates vruntime ~3x slower than nice=0, so it runs ~3x more.

### Red-Black Tree

All runnable processes are stored in a **red-black tree** keyed by vruntime. The leftmost node (lowest vruntime = most deserving of CPU) is always cached for O(1) access.

```
          [vruntime=5]
         /             \
  [vruntime=3]    [vruntime=8]
  /         \         /      \
[2]         [4]    [6]       [10]

Next to run: leftmost node = [2]
```

When a process is preempted, its vruntime is updated and it's reinserted into the tree.

### Scheduling Latency and Minimum Granularity

CFS targets a **scheduling latency** (default 6ms): every runnable process should get at least one CPU turn within this window. The time slice for each process is:

```
time_slice = scheduling_latency × (process_weight / total_weight)
```

The **minimum granularity** (default 0.75ms) prevents tiny time slices that would cause excessive context switching when many processes compete.

### NUMA Awareness

On multi-socket machines, memory access to a remote NUMA node is 2-3x slower. The Linux scheduler tries to keep processes running on the NUMA node where their memory lives (NUMA affinity). It also implements **task migration** across cores to balance load, but balances it against the cost of cache invalidation.

---

## Scheduling Classes in Linux

Linux uses a modular scheduling framework with multiple scheduling classes, ordered by priority:

| Class | Policy | Use Case |
|-------|--------|---------|
| `SCHED_DEADLINE` | EDF (earliest deadline first) | Hard real-time tasks |
| `SCHED_FIFO` | FIFO, no preemption by same class | Soft real-time (audio, robotics) |
| `SCHED_RR` | Round Robin within priority | Soft real-time |
| `SCHED_OTHER` | CFS | Normal processes (default) |
| `SCHED_BATCH` | CFS variant | Batch jobs (slightly lower priority) |
| `SCHED_IDLE` | Background | Only runs when nothing else can |

Real-time classes (`SCHED_FIFO`, `SCHED_RR`) always preempt `SCHED_OTHER` processes. Used by audio daemons, kernel threads.

---

## Interview Questions

**"What is a context switch? Why is it expensive?"**
Saving all CPU registers + PC of the current process, loading saved state of the next. Expensive because: (1) CPU must execute many kernel instructions, (2) TLB must be flushed when switching between processes with different address spaces — TLB reload causes cache misses until the working set is loaded.

**"What is the difference between preemptive and cooperative scheduling?"**
Cooperative: process voluntarily yields. Preemptive: kernel forcibly takes CPU when time slice expires or higher-priority task arrives. Modern OSes are preemptive.

**"Why are goroutines/coroutines cheaper than OS threads?"**
User-space scheduling — context switch doesn't enter the kernel. Smaller stacks (2KB for goroutines vs 1MB for OS threads). Scheduler has application-level context (can yield at `await` or channel ops). No TLB flush.

**"What is the nice value in Linux?"**
A hint to the CFS scheduler about relative priority. Range: -20 (highest priority, gets more CPU time) to +19 (lowest). Only affects how fast vruntime accumulates — doesn't guarantee CPU time.
