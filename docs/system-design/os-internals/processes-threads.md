---
title: "Processes & Threads"
description: "What a process is, how fork() and exec() work, threads vs processes, the process control block, inter-process communication, and what actually happens when you run a program."
tags: [operating-systems, processes, threads, fork, exec, ipc, linux]
difficulty: "intermediate"
prerequisites: [system-design/os-internals/]
lastReviewed: "2026-06-12"
---

# Processes & Threads

A process is the fundamental unit of isolation in an operating system. Understanding what a process is — and how the kernel creates, manages, and switches between them — is the foundation for understanding concurrency, containers, and system design at the infrastructure level.

---

## What Is a Process?

A process is a running instance of a program. It consists of:

- **Address space** — the virtual memory the process can access (code, heap, stack, mapped files)
- **Program counter** — which instruction executes next
- **Registers** — current CPU state
- **Open file descriptors** — references to open files, sockets, pipes
- **Process ID (PID)** — unique identifier in the kernel
- **Credentials** — UID, GID, permissions
- **Signal handlers** — registered handlers for OS signals

The kernel represents all this in a **Process Control Block (PCB)** — a kernel data structure that stores everything needed to pause and resume a process.

```
Process Address Space (virtual memory):
┌─────────────────┐  high address
│      Stack      │  ← grows downward (function calls, local vars)
│        ↓        │
│   (free space)  │
│        ↑        │
│      Heap       │  ← grows upward (malloc/new)
├─────────────────┤
│  BSS Segment    │  uninitialized global/static variables
│  Data Segment   │  initialized global/static variables
│  Text Segment   │  executable code (read-only)
└─────────────────┘  low address (0x0)
```

---

## `fork()`: Creating a New Process

`fork()` creates a child process that is an exact copy of the parent. It returns twice: once in the parent (returns child PID), once in the child (returns 0).

```c
#include <unistd.h>
#include <stdio.h>

int main() {
    pid_t pid = fork();

    if (pid < 0) {
        // fork failed
        perror("fork");
    } else if (pid == 0) {
        // Child process
        printf("Child: PID=%d, parent PID=%d\n", getpid(), getppid());
    } else {
        // Parent process
        printf("Parent: PID=%d, child PID=%d\n", getpid(), pid);
        wait(NULL);  // wait for child to finish
    }
    return 0;
}
```

**What `fork()` copies:**
- Virtual address space (pages, not physical memory — see copy-on-write)
- File descriptor table (both parent and child have open FDs pointing to the same files)
- Signal handlers
- Environment variables, working directory

**What `fork()` does NOT copy:**
- The PID (child gets a new one)
- Memory locks
- Pending signals are cleared in child
- Threads (only the calling thread is duplicated — others don't exist in child)

### Copy-on-Write (CoW)

`fork()` doesn't physically copy memory. The child's page table initially points to the same physical pages as the parent — marked read-only. When either process writes to a page, the kernel:
1. Catches the page fault (write to read-only page)
2. Allocates a new physical page
3. Copies the content
4. Updates the faulting process's page table to point to the new page
5. Resumes the write

This is why `fork()` is fast even for a 2GB process — it only copies page tables, not 2GB of data. Pages are copied lazily, only as they're written.

---

## `exec()`: Replacing the Process Image

`exec()` replaces the current process's address space with a new program. The PID stays the same but everything else is replaced.

```c
execve("/bin/ls", args, env);
// Code after this never runs in the current process
// (unless execve fails)
```

**The fork-exec pattern:** Most process creation in Unix follows this pattern:
1. `fork()` — create a copy of the current process
2. In the child: `exec()` — replace the child with the target program
3. In the parent: `wait()` — wait for the child to finish

```bash
# When your shell runs `ls`:
# 1. shell forks a child
# 2. child exec()s /bin/ls
# 3. shell waits for the child
# 4. child exits, shell is notified
```

---

## Process States

```
            fork()
              │
              ▼
           CREATED
              │  scheduler picks it up
              ▼
┌────────── READY ◄────────────────┐
│             │  scheduled to run  │
│             ▼                    │
│          RUNNING ────────────────┘ preempted (time slice expired)
│             │
│    ┌────────┴───────┐
│    │                │
│    ▼                ▼
│  WAITING         exit()
│  (I/O, sleep,     │
│   signal)         ▼
│    │           ZOMBIE ─────────► parent wait() → DEAD
│    │           (exit code stored
│    │            until parent reads)
└────┘  I/O done / signal received
```

**Zombie process:** A process that has exited but whose parent hasn't called `wait()` yet. The kernel keeps the PCB to store the exit code. If the parent never calls `wait()`, zombie entries accumulate (not a memory leak per se, but PIDs are finite).

**Orphan process:** A process whose parent has exited. The kernel reparents orphans to PID 1 (`init`/`systemd`), which calls `wait()` on them.

---

## Threads vs Processes

A thread is an execution context within a process. Multiple threads share:
- Address space (heap, global variables, file descriptors)
- PID (but each thread has its own TID — Thread ID)

Each thread has its own:
- Stack
- Program counter
- Registers
- Signal mask

```
Process:
┌──────────────────────────────────────────┐
│ Code | Data | Heap | File Descriptors    │
│                                          │
│  Thread 1  │  Thread 2  │  Thread 3     │
│  [stack]   │  [stack]   │  [stack]      │
│  [regs]    │  [regs]    │  [regs]       │
│  [PC]      │  [PC]      │  [PC]         │
└──────────────────────────────────────────┘
```

| | Process | Thread |
|--|---------|--------|
| Memory | Separate address space | Shared address space |
| Communication | IPC (pipes, sockets, shared memory) | Shared variables (needs synchronization) |
| Creation cost | Expensive (~1ms, copies page tables) | Cheap (~10μs) |
| Context switch | Expensive (TLB flush) | Cheaper (same address space) |
| Isolation | Strong (crash doesn't affect others) | Weak (crash kills all threads) |
| Use case | Isolation, security boundaries | Shared-state concurrency |

**Linux implementation detail:** Linux implements threads as "lightweight processes" using `clone()`. A thread is a process that shares its address space, file descriptors, and other resources with the parent. `fork()` calls `clone()` with no sharing; `pthread_create()` calls `clone()` with full sharing.

---

## Inter-Process Communication (IPC)

Processes can't directly access each other's memory (isolation). IPC mechanisms:

**Pipes:** Unidirectional byte stream. Parent creates before fork; child inherits. Used to chain processes (`ls | grep foo`).
```c
int pipefd[2];
pipe(pipefd);  // pipefd[0] = read end, pipefd[1] = write end
```

**Unix Domain Sockets:** Bidirectional, local-only. Higher throughput than TCP loopback for same-machine IPC. Used by Docker, PostgreSQL, systemd.

**Shared Memory:** Fastest IPC — processes map the same physical pages into their address spaces. No data copying. Requires explicit synchronization.
```c
int shm_id = shmget(key, size, IPC_CREAT | 0666);
void* ptr = shmat(shm_id, NULL, 0);
```

**Message Queues:** Kernel-managed queues. Sender writes message, receiver reads it. POSIX (`mq_open`) or SysV (`msgget`).

**Signals:** Software interrupts. Asynchronous notification. Limited payload (just the signal number). Used for process control: `SIGTERM` (terminate gracefully), `SIGKILL` (terminate immediately, can't be caught), `SIGUSR1`/`SIGUSR2` (application-defined).

---

## What Happens When You Run a Program

```bash
$ python3 app.py
```

1. Shell calls `fork()` — creates child shell process
2. Child calls `execve("/usr/bin/python3", ["python3", "app.py"], env)`
3. Kernel validates the executable (`ELF` header check)
4. Kernel maps the ELF segments into the child's address space (code, data)
5. Kernel sets up the stack with `argv`, `envp`
6. Kernel sets PC to the entry point
7. Dynamic linker (`ld.so`) runs first — loads shared libraries (libc, etc.)
8. `main()` begins executing
9. Python interpreter starts, parses `app.py`, executes bytecode
10. When `app.py` exits: Python calls `exit()` → kernel cleans up process → sends SIGCHLD to parent shell

---

## Interview Questions

**"What happens when you call `fork()`?"**
Creates a child process that is an almost-exact copy of the parent via copy-on-write. Returns 0 in child, child PID in parent. Child shares physical memory pages until either writes (CoW).

**"What's the difference between a process and a thread?"**
A process has its own address space and resources (isolation). Threads share the address space of their parent process. Threads are cheaper to create and switch between but a crash in one thread kills them all.

**"What is a zombie process?"**
A process that has exited but whose parent hasn't called `wait()`. The kernel keeps the PCB to store the exit code. Zombie entries consume a PID and a small amount of kernel memory.

**"How does a container differ from a process?"**
A container is a process (or group of processes) that uses Linux namespaces (PID, network, mount, user, UTS, IPC) to create isolation and cgroups to limit resources. The process itself runs in the host kernel — there's no separate OS.
