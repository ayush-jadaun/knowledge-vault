---
title: "Signals & Process Control"
description: "Linux signals in depth — SIGTERM vs SIGKILL, signal masks, sa_restart, async-signal-safety, graceful shutdown patterns, and how Kubernetes uses signals to manage pod lifecycle."
tags: [operating-systems, signals, linux, SIGTERM, SIGKILL, graceful-shutdown, kubernetes]
difficulty: "intermediate"
prerequisites: [system-design/os-internals/processes-threads]
lastReviewed: "2026-06-12"
---

# Signals & Process Control

A signal is a software interrupt delivered to a process by the kernel (or by another process). Signals are how the OS tells a process "something happened" — a timer expired, a child exited, the user pressed Ctrl+C, or another process asked you to terminate.

Signals seem simple but have subtle behavior that causes real production bugs: dropped signals, uninterruptible syscalls, unsafe handler code, and graceful shutdown failures.

---

## The Signal Model

When a signal is sent to a process:
1. The kernel sets a flag in the process's PCB
2. At the next opportunity (e.g., returning from a syscall, or on a context switch), the kernel delivers the signal
3. The process executes the registered handler (or the default action)

**Important:** Signal delivery is asynchronous — a signal sent by `kill(pid, SIGTERM)` may not be delivered immediately. The kernel queues it and delivers it when the process next runs.

---

## Common Signals

| Signal | Number | Default Action | Description |
|--------|--------|---------------|-------------|
| `SIGHUP` | 1 | Terminate | Hangup (terminal disconnected); often used to reload config |
| `SIGINT` | 2 | Terminate | Keyboard interrupt (Ctrl+C) |
| `SIGQUIT` | 3 | Core dump | Quit with core dump (Ctrl+\\) |
| `SIGKILL` | 9 | Terminate | Immediate kill — **cannot be caught or ignored** |
| `SIGSEGV` | 11 | Core dump | Segmentation fault |
| `SIGPIPE` | 13 | Terminate | Write to a broken pipe (common in network code) |
| `SIGALRM` | 14 | Terminate | Timer expired (`alarm()`) |
| `SIGTERM` | 15 | Terminate | Polite termination request — **can be caught** |
| `SIGCHLD` | 17 | Ignore | Child process changed state |
| `SIGUSR1` | 10 | Terminate | User-defined signal 1 |
| `SIGUSR2` | 12 | Terminate | User-defined signal 2 |
| `SIGSTOP` | 19 | Stop | Pause process — **cannot be caught or ignored** |
| `SIGCONT` | 18 | Continue | Resume a stopped process |

---

## SIGTERM vs SIGKILL

This distinction matters for every server process and is core to Kubernetes pod lifecycle management.

**`SIGTERM` (15):** Polite request to terminate. The process can catch this signal, finish in-flight requests, flush buffers, close database connections, and then exit cleanly. This is what `kill <pid>` sends by default.

**`SIGKILL` (9):** Unconditional, immediate termination. The kernel kills the process immediately — no handler runs, no cleanup, no buffered writes flushed. `kill -9 <pid>`. Cannot be caught, blocked, or ignored.

**`SIGSTOP` / `SIGCONT`:** Pause and resume. Used by debuggers, shells (Ctrl+Z), and cgroup freezers.

**Kubernetes pod termination sequence:**
```
1. kubectl delete pod → API server sets pod.deletionTimestamp
2. kubelet sends SIGTERM to PID 1 in the container
3. Container has `terminationGracePeriodSeconds` (default: 30s) to exit cleanly
4. If not exited after grace period: kubelet sends SIGKILL
5. Container terminates immediately
```

If your server doesn't handle SIGTERM, it gets SIGKILL'd after 30 seconds — in-flight requests are dropped, connections are abruptly closed, write buffers are lost.

---

## Registering Signal Handlers

```c
#include <signal.h>

// Old API (avoid in new code):
signal(SIGTERM, handler_func);  // Behavior varies across implementations

// POSIX API (preferred):
struct sigaction sa = {0};
sa.sa_handler = handler_func;
sa.sa_flags = SA_RESTART;  // Restart syscalls interrupted by this signal
sigemptyset(&sa.sa_mask);

sigaction(SIGTERM, &sa, NULL);
```

**`SA_RESTART`:** When a signal interrupts a blocking syscall (like `read()`, `write()`, `accept()`), the syscall can return -1 with `errno = EINTR`. With `SA_RESTART`, the kernel automatically restarts the syscall after the handler returns. Without it, your code must check for `EINTR` and retry manually.

```c
// Without SA_RESTART — must handle EINTR manually:
ssize_t n;
do {
    n = read(fd, buf, size);
} while (n == -1 && errno == EINTR);
```

---

## Async-Signal Safety

Signal handlers run asynchronously — they can interrupt any point in your program's execution, including the middle of a `malloc()` call or an `fprintf()` call.

**Problem:** If your signal handler calls `malloc()` and your main code was in the middle of `malloc()` when the signal arrived, you have a re-entrant lock — the allocator's internal state is corrupted.

**Rule: signal handlers must only call async-signal-safe functions.**

Async-signal-safe functions are guaranteed to be safe even if called from a signal handler that interrupted the same function. The POSIX list includes:
- `write()` (syscall) — yes
- `printf()` — NO (calls malloc internally)
- `malloc()` / `free()` — NO
- `exit()` — NO (flushes stdio buffers)
- `_exit()` — yes (no cleanup)
- `signal()` / `sigaction()` — yes
- Most syscalls — yes

**The self-pipe trick:** A common pattern for safely handling signals in event loops. The signal handler writes a byte to a pipe; the event loop (epoll/select) watches the read end and processes the signal notification in the main thread where all functions are safe.

```c
int signal_pipe[2];
pipe(signal_pipe);

void signal_handler(int sig) {
    // write() is async-signal-safe
    write(signal_pipe[1], &sig, sizeof(sig));
}

// In event loop:
// Watch signal_pipe[0] for reads
// When readable: read the signal number, handle it safely
```

**signalfd (Linux):** A modern alternative — converts signals to file descriptor events, which can be watched with epoll. No signal handler needed, no async-signal-safety concerns.

```c
sigset_t mask;
sigemptyset(&mask);
sigaddset(&mask, SIGTERM);
sigaddset(&mask, SIGUSR1);

// Block these signals from normal delivery
sigprocmask(SIG_BLOCK, &mask, NULL);

// Create a file descriptor that receives these signals
int sfd = signalfd(-1, &mask, SFD_NONBLOCK);

// Now watch sfd with epoll — signal delivery becomes an event
```

---

## Signal Masks

Each thread has a **signal mask** — a set of signals that are blocked (held pending, not delivered). Blocked signals are not ignored; they queue up and are delivered when unblocked.

```c
sigset_t set;
sigemptyset(&set);
sigaddset(&set, SIGTERM);

// Block SIGTERM in this thread
sigprocmask(SIG_BLOCK, &set, NULL);
// ... critical section ...
sigprocmask(SIG_UNBLOCK, &set, NULL);  // SIGTERM delivered now if pending
```

**Important:** In a multi-threaded process, signals are delivered to any thread that has not blocked them. `SIGTERM` sent to a process can be handled by any thread. The self-pipe trick or `signalfd` + signal masking in all threads ensures signals are handled in a dedicated thread.

**`SIGCHLD` and zombie prevention:**
```c
// Automatically reap children without calling wait()
struct sigaction sa = {.sa_handler = SIG_DFL, .sa_flags = SA_NOCLDWAIT};
sigaction(SIGCHLD, &sa, NULL);
```

Or install a handler that calls `waitpid(-1, NULL, WNOHANG)` in a loop.

---

## Graceful Shutdown Pattern

Every production server should handle SIGTERM for graceful shutdown:

```python
import signal
import sys

shutdown_requested = False

def handle_sigterm(signum, frame):
    global shutdown_requested
    shutdown_requested = True

signal.signal(signal.SIGTERM, handle_sigterm)
signal.signal(signal.SIGINT, handle_sigterm)  # Also handle Ctrl+C

# Main server loop
while not shutdown_requested:
    request = accept_connection()
    handle(request)

# Cleanup
flush_pending_writes()
close_database_connections()
sys.exit(0)
```

```go
// Go graceful shutdown
server := &http.Server{Addr: ":8080"}
go server.ListenAndServe()

quit := make(chan os.Signal, 1)
signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
<-quit  // Block until signal received

ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

// Graceful shutdown: stop accepting new connections, wait for in-flight to finish
if err := server.Shutdown(ctx); err != nil {
    log.Fatal("Server forced to shutdown:", err)
}
```

---

## kill Command and Signal Sending

```bash
kill <pid>          # Send SIGTERM (polite request to terminate)
kill -15 <pid>      # Same — SIGTERM = 15
kill -TERM <pid>    # Same, by name
kill -9 <pid>       # SIGKILL — immediate, no cleanup
kill -HUP <pid>     # SIGHUP — often used to reload config (nginx, sshd)
kill -USR1 <pid>    # SIGUSR1 — application-defined (e.g., dump stats, rotate logs)

killall nginx       # Send SIGTERM to all processes named "nginx"
pkill -f "python app.py"  # Match by full command line

# Check if process received the signal:
kill -0 <pid>       # No signal sent; returns 0 if process exists, EPERM if no permission
```

---

## SIGPIPE: The Silent Killer

When you write to a socket or pipe whose read end is closed, the kernel sends `SIGPIPE` to your process. Default action: terminate. This silently kills network servers if not handled.

```c
// Option 1: ignore SIGPIPE globally
signal(SIGPIPE, SIG_IGN);
// write() will then return -1 with errno = EPIPE instead of killing the process

// Option 2: use MSG_NOSIGNAL per-send
send(sockfd, buf, len, MSG_NOSIGNAL);
// Returns -1/EPIPE without generating SIGPIPE
```

Most long-running servers ignore SIGPIPE globally and check write/send return codes.

---

## Interview Questions

**"What's the difference between SIGTERM and SIGKILL?"**
`SIGTERM` is a request — the process can catch it, do cleanup (flush buffers, finish requests, close connections), and exit gracefully. `SIGKILL` is an order — the kernel kills the process immediately, no handler runs, no cleanup happens. Kubernetes sends SIGTERM first, waits `terminationGracePeriodSeconds`, then sends SIGKILL.

**"Why can't you call printf() in a signal handler?"**
`printf` calls `malloc` internally, which uses locks and shared state. If the signal interrupts a `malloc` call in the main thread, and the handler also calls `malloc`, the allocator's state is corrupted. Signal handlers must only call async-signal-safe functions (mostly raw syscalls). Use the self-pipe trick or `signalfd` to handle signals safely in the main event loop.

**"How do you implement graceful shutdown?"**
Register a handler for SIGTERM (and SIGINT). Handler sets a flag or writes to a pipe. Main loop checks the flag after completing each request/batch. When set: stop accepting new work, finish in-flight requests within a deadline, flush buffers, close connections, then exit(0). In Go: `signal.Notify` + `http.Server.Shutdown(ctx)` with a timeout.

**"What is SA_RESTART?"**
A flag on `sigaction` that tells the kernel to automatically restart blocking syscalls (read, write, accept, etc.) that were interrupted by signal delivery. Without it, those syscalls return -1/EINTR and you must retry them manually. Most servers want SA_RESTART to avoid sprinkling EINTR checks everywhere.
