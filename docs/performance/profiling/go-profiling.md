---
title: "Go Profiling"
description: "Comprehensive guide to profiling Go applications — pprof CPU/memory/goroutine/block/mutex profiles, runtime/trace, benchmarking with testing.B, continuous profiling in production, and optimization workflows"
tags: [go, golang, profiling, pprof, runtime-trace, benchmarking, cpu-profiling, memory-profiling, goroutine-profiling, production-profiling]
difficulty: advanced
prerequisites: [performance/profiling]
lastReviewed: "2026-03-17"
---

# Go Profiling

Go has the best built-in profiling ecosystem of any mainstream language. The `runtime/pprof` and `net/http/pprof` packages give you CPU, memory, goroutine, block, and mutex profiles with zero external dependencies. The `runtime/trace` package provides a microsecond-resolution execution trace that shows goroutine scheduling, GC events, and syscalls. This page covers every profiling tool available for Go, from quick command-line profiles to production-grade continuous profiling.

## pprof — The Core Profiling Tool

### Profile Types

Go's pprof supports six profile types, each answering a different question:

| Profile | What It Measures | When to Use |
|---------|-----------------|-------------|
| **CPU** | Where CPU time is spent | Application is CPU-bound |
| **Heap** (alloc_objects) | Where memory is allocated | High allocation rate, GC pressure |
| **Heap** (inuse_objects) | What is currently in memory | Memory leaks, large RSS |
| **Goroutine** | All active goroutines and their stacks | Goroutine leaks, deadlocks |
| **Block** | Where goroutines block on synchronization primitives | Lock contention, channel waits |
| **Mutex** | Which mutexes are contended | Lock contention in concurrent code |
| **Threadcreate** | Stack traces of goroutines that created OS threads | Excessive thread creation |

### Enabling pprof via HTTP

The simplest way to enable profiling in a Go application is to import `net/http/pprof`:

```go
package main

import (
    "log"
    "net/http"
    _ "net/http/pprof" // Side-effect import registers pprof handlers
)

func main() {
    // Your application setup here

    // If you already have an HTTP server, pprof handlers are registered
    // on the DefaultServeMux automatically.

    // If you don't have an HTTP server, start one on a separate port:
    go func() {
        log.Println("pprof server listening on :6060")
        log.Println(http.ListenAndServe("localhost:6060", nil))
    }()

    // Start your main application
    startApplication()
}
```

::: warning Security
Never expose pprof to the public internet. It reveals internal state and can be used for denial of service (heap profiles pause the runtime). Always bind to `localhost` and access remotely via SSH tunneling or a VPN.
:::

### Collecting Profiles from the Command Line

Once pprof is enabled via HTTP, use the `go tool pprof` command:

```bash
# 30-second CPU profile
go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30

# Heap profile (current memory usage)
go tool pprof http://localhost:6060/debug/pprof/heap

# Goroutine profile
go tool pprof http://localhost:6060/debug/pprof/goroutine

# Block profile (requires runtime.SetBlockProfileRate)
go tool pprof http://localhost:6060/debug/pprof/block

# Mutex profile (requires runtime.SetMutexProfileFraction)
go tool pprof http://localhost:6060/debug/pprof/mutex

# Threadcreate profile
go tool pprof http://localhost:6060/debug/pprof/threadcreate

# Allocation profile (total allocations since start)
go tool pprof -alloc_space http://localhost:6060/debug/pprof/heap

# Object count profile
go tool pprof -alloc_objects http://localhost:6060/debug/pprof/heap
```

### Interactive pprof Commands

Once inside the pprof interactive shell:

```
(pprof) top           # Show top functions by flat time
(pprof) top -cum      # Show top functions by cumulative time
(pprof) list funcName # Show source code with per-line profiling data
(pprof) web           # Open an interactive SVG graph in your browser
(pprof) weblist func  # Show source with profile data in browser
(pprof) tree          # Show call tree
(pprof) peek funcName # Show callers and callees of a function
(pprof) disasm func   # Show assembly with profile data
(pprof) svg           # Save as SVG file
(pprof) png           # Save as PNG file
```

**Understanding `top` output:**

```
(pprof) top 10
Showing nodes accounting for 4.5s, 90% of 5s total
Dropped 23 nodes (cum <= 0.025s)
      flat  flat%   sum%        cum   cum%
     1.50s 30.00% 30.00%      1.50s 30.00%  runtime.memmove
     0.80s 16.00% 46.00%      0.80s 16.00%  encoding/json.stateInString
     0.60s 12.00% 58.00%      2.30s 46.00%  encoding/json.(*Encoder).Encode
     0.50s 10.00% 68.00%      0.50s 10.00%  runtime.mallocgc
     0.40s  8.00% 76.00%      0.40s  8.00%  syscall.Syscall
     0.30s  6.00% 82.00%      0.30s  6.00%  runtime.scanobject
     0.20s  4.00% 86.00%      3.20s 64.00%  main.handleRequest
     0.10s  2.00% 88.00%      0.10s  2.00%  runtime.heapBitsSetType
     0.05s  1.00% 89.00%      0.50s 10.00%  net/http.(*conn).serve
     0.05s  1.00% 90.00%      0.05s  1.00%  runtime.nextFreeFast
```

- **flat** — time spent in this function only (not its callees)
- **cum** — time spent in this function AND all functions it calls
- **flat%** — flat as a percentage of total profile duration
- **sum%** — running sum of flat% (useful for "top N cover X% of time")

**Key insight:** If a function has high `cum` but low `flat`, the bottleneck is in something it calls, not in the function itself. Drill down with `list` or `peek`.

## CPU Profiling Deep Dive

### How Go's CPU Profiler Works

Go's CPU profiler uses OS signals (SIGPROF on Unix) to interrupt the program at a configurable frequency (default: 100 Hz, i.e., 100 samples per second). At each interruption, it records the stack trace of the goroutine running on that OS thread.

```go
import "runtime/pprof"

func main() {
    f, _ := os.Create("cpu.prof")
    defer f.Close()

    pprof.StartCPUProfile(f)
    defer pprof.StopCPUProfile()

    // Run your workload
    runWorkload()
}
```

### Reading a CPU Flame Graph

```bash
# Generate a flame graph from a profile
go tool pprof -http=:8080 cpu.prof
# Opens a web UI with multiple visualizations including flame graph
```

The web UI provides several views:

1. **Top** — flat table of top functions
2. **Graph** — directed graph showing call relationships with edge weights
3. **Flame Graph** — interactive flame graph (click to zoom)
4. **Peek** — caller/callee view for a specific function
5. **Source** — source code annotated with profiling data
6. **Disassembly** — assembly code annotated with profiling data

### Real-World CPU Profile Analysis

Consider this example of a JSON API server that is slow:

```go
// Before profiling, we suspect the database is slow.
// Let's profile to verify.

func handleListUsers(w http.ResponseWriter, r *http.Request) {
    users, err := db.ListUsers(r.Context())
    if err != nil {
        http.Error(w, err.Error(), 500)
        return
    }

    // We suspect this is fast...
    json.NewEncoder(w).Encode(users)
}
```

After taking a 30-second CPU profile under load:

```
(pprof) top 5 -cum
      flat  flat%   sum%        cum   cum%
         0     0%     0%      3.20s 64.00%  main.handleListUsers
     0.02s  0.40%  0.40%      2.80s 56.00%  encoding/json.(*Encoder).Encode
     0.60s 12.00% 12.40%      1.40s 28.00%  encoding/json.marshalValue
     0.50s 10.00% 22.40%      0.80s 16.00%  reflect.Value.Interface
     0.01s  0.20% 22.60%      0.40s  8.00%  main.(*DB).ListUsers
```

Surprise: JSON encoding takes 56% of CPU time, while the database query only takes 8%. The optimization should focus on serialization, not the database.

Solutions:
1. Use a faster JSON encoder (`github.com/goccy/go-json`, `github.com/bytedance/sonic`)
2. Use a binary protocol (protobuf, MessagePack)
3. Use code-generated marshaling (`github.com/mailru/easyjson`)
4. Cache serialized responses

```go
// After optimization: use easyjson (code-generated marshaler)
//go:generate easyjson -all models.go

func handleListUsers(w http.ResponseWriter, r *http.Request) {
    users, err := db.ListUsers(r.Context())
    if err != nil {
        http.Error(w, err.Error(), 500)
        return
    }

    // easyjson generates MarshalJSON without reflection
    w.Header().Set("Content-Type", "application/json")
    _, _ = easyjson.MarshalToWriter(users, w)
}
```

## Memory Profiling Deep Dive

### Heap Profile Types

Go's heap profiler can show memory in four ways:

| Mode | Flag | Shows |
|------|------|-------|
| **inuse_space** | `-inuse_space` (default) | Memory currently allocated and in use (bytes) |
| **inuse_objects** | `-inuse_objects` | Number of objects currently allocated |
| **alloc_space** | `-alloc_space` | Total memory allocated since program start (cumulative) |
| **alloc_objects** | `-alloc_objects` | Total objects allocated since program start (cumulative) |

**When to use each:**

- **inuse_space** — "What is using all this memory right now?" (memory leak investigation)
- **alloc_space** — "What is creating the most GC pressure?" (optimization for throughput)
- **inuse_objects** — "How many objects of each type are alive?" (leak counting)
- **alloc_objects** — "What is the hottest allocation path?" (reduce allocation rate)

### Memory Profile Sampling

Go's memory profiler uses sampling, controlled by `runtime.MemProfileRate`:

```go
import "runtime"

func init() {
    // Default: sample every 512KB of allocated memory
    // runtime.MemProfileRate = 512 * 1024

    // For more accurate profiles, sample every allocation
    // WARNING: significant overhead, development only
    runtime.MemProfileRate = 1

    // For production, keep the default or increase it
    // runtime.MemProfileRate = 512 * 1024
}
```

### Finding Memory Leaks

A memory leak in Go is almost always one of:

1. **Growing slices or maps** that are never trimmed
2. **Goroutines that never exit** (holding references)
3. **Finalizers preventing GC** (rare)
4. **cgo allocations** not freed (C memory)
5. **Forgotten `time.Ticker`** or similar background resources

**Technique: Differential heap profiling**

```bash
# Snapshot 1: after warmup
curl -o heap1.prof http://localhost:6060/debug/pprof/heap

# Run workload for 10 minutes
# ...

# Snapshot 2: after workload
curl -o heap2.prof http://localhost:6060/debug/pprof/heap

# Compare: what grew between snapshot 1 and 2?
go tool pprof -base heap1.prof heap2.prof

(pprof) top
Showing nodes accounting for 150MB, 95% of 158MB total
      flat  flat%   sum%        cum   cum%
    80.00MB 50.63% 50.63%    80.00MB 50.63%  main.processEvent (leak: events slice grows)
    40.00MB 25.32% 75.95%    40.00MB 25.32%  main.cacheResult  (leak: unbounded cache)
    20.00MB 12.66% 88.61%    20.00MB 12.66%  main.startWorker  (leak: goroutines never exit)
    10.00MB  6.33% 94.94%    10.00MB  6.33%  bytes.makeSlice   (leak: buffers not returned to pool)
```

### Common Memory Leak: Goroutine Leak

```go
// LEAKING: goroutines that block forever
func handleRequest(ctx context.Context) (*Result, error) {
    ch := make(chan *Result)

    go func() {
        result, err := slowOperation()
        if err != nil {
            // Bug: on error, nothing is sent to ch
            // The goroutine exits, but the parent's goroutine
            // blocks on <-ch forever if this goroutine errors
            return
        }
        ch <- result
    }()

    return <-ch, nil // Blocks forever if slowOperation fails
}

// FIXED: always send a result, and respect context cancellation
func handleRequest(ctx context.Context) (*Result, error) {
    type resultOrError struct {
        result *Result
        err    error
    }
    ch := make(chan resultOrError, 1) // Buffered so goroutine never blocks

    go func() {
        result, err := slowOperation()
        ch <- resultOrError{result, err}
    }()

    select {
    case r := <-ch:
        return r.result, r.err
    case <-ctx.Done():
        return nil, ctx.Err()
    }
}
```

Detect goroutine leaks with the goroutine profile:

```bash
# If goroutine count keeps growing, you have a leak
curl http://localhost:6060/debug/pprof/goroutine?debug=2
```

The `debug=2` format shows full stack traces grouped by goroutine state, making it easy to see where goroutines are stuck.

## Goroutine Profiling

```bash
# Get all goroutines with stack traces
go tool pprof http://localhost:6060/debug/pprof/goroutine
```

The goroutine profile shows every goroutine in the process and where it is currently blocked or running. This is essential for diagnosing:

- **Goroutine leaks** — goroutine count grows over time
- **Deadlocks** — goroutines waiting on each other
- **Resource exhaustion** — too many goroutines waiting for connections, files, etc.

```
(pprof) top
      flat  flat%   sum%        cum   cum%
     12000 60.00% 60.00%     12000 60.00%  runtime.gopark (channel receive)
      4000 20.00% 80.00%      4000 20.00%  runtime.gopark (select)
      2000 10.00% 90.00%      2000 10.00%  runtime.gopark (semacquire)
      1000  5.00% 95.00%      1000  5.00%  runtime.gopark (IO wait)
       500  2.50% 97.50%       500  2.50%  runtime.gopark (timer)
       500  2.50% 100.00%      500  2.50%  running
```

In this example, 12,000 goroutines are blocked on channel receive — likely a goroutine leak where goroutines wait for data that will never arrive.

## Block and Mutex Profiling

### Block Profile

The block profile records where goroutines block on synchronization primitives (channels, mutexes, select, wait groups). You must enable it explicitly:

```go
import "runtime"

func init() {
    // Enable block profiling
    // The parameter is the minimum duration (in nanoseconds) a blocking
    // event must last to be recorded.
    // 1 = record everything (high overhead)
    // 1000000 (1ms) = record blocks lasting > 1ms (reasonable for production)
    runtime.SetBlockProfileRate(1000000) // 1ms threshold
}
```

```bash
go tool pprof http://localhost:6060/debug/pprof/block

(pprof) top
      flat  flat%   sum%        cum   cum%
     450ms 45.00% 45.00%      450ms 45.00%  sync.(*Mutex).Lock
     200ms 20.00% 65.00%      200ms 20.00%  sync.(*WaitGroup).Wait
     150ms 15.00% 80.00%      150ms 15.00%  runtime.chanrecv1
     100ms 10.00% 90.00%      100ms 10.00%  sync.(*RWMutex).RLock
      50ms  5.00% 95.00%       50ms  5.00%  database/sql.(*DB).conn
```

This tells you that 45% of blocking time is on `sync.Mutex.Lock` — you have lock contention. Use `list` to find which mutex:

```
(pprof) list sync.(*Mutex).Lock
ROUTINE ======================== sync.(*Mutex).Lock
     450ms      450ms (flat, cum) 45.00%
         .          .   main.go:123  cache.mu.Lock()
         .          .   main.go:156  db.mu.Lock()
```

### Mutex Profile

The mutex profile specifically tracks mutex contention (how long goroutines wait to acquire a mutex):

```go
import "runtime"

func init() {
    // Enable mutex profiling
    // The parameter is the fraction of mutex contention events to record.
    // 1 = record everything, 5 = record 1/5 of events
    runtime.SetMutexProfileFraction(5)
}
```

```bash
go tool pprof http://localhost:6060/debug/pprof/mutex

(pprof) top
      flat  flat%   sum%        cum   cum%
     320ms 64.00% 64.00%      320ms 64.00%  main.(*Cache).Get
     120ms 24.00% 88.00%      120ms 24.00%  main.(*Cache).Set
      60ms 12.00% 100.00%      60ms 12.00%  main.(*DB).Query
```

The cache is heavily contended. Solution: switch from `sync.Mutex` to `sync.RWMutex` (allows concurrent reads) or use a concurrent map like `sync.Map`.

## `runtime/trace` — Execution Tracing

The `runtime/trace` package provides microsecond-resolution tracing of goroutine scheduling, GC events, system calls, and network operations. It answers questions that pprof cannot:

- Why is my program not using all CPU cores?
- Which goroutine is blocking which?
- How long do GC pauses last and when do they happen?
- What is the scheduling latency for my goroutines?

### Collecting a Trace

```go
import (
    "os"
    "runtime/trace"
)

func main() {
    f, _ := os.Create("trace.out")
    defer f.Close()

    trace.Start(f)
    defer trace.Stop()

    // Run your workload
    runWorkload()
}
```

Or via HTTP:

```bash
# Collect a 5-second trace
curl -o trace.out http://localhost:6060/debug/pprof/trace?seconds=5

# View in the trace viewer
go tool trace trace.out
```

### Reading the Trace Viewer

The trace viewer opens in a web browser and shows:

1. **Goroutines timeline** — horizontal bars showing when each goroutine is running, runnable, or blocked
2. **Heap allocation** — memory usage over time
3. **Threads** — OS thread utilization
4. **Procs (P)** — Go scheduler processor utilization
5. **GC events** — when garbage collection runs and how long it takes
6. **System calls** — blocking syscalls and their duration
7. **Network** — network I/O events

**What to look for:**

- **Large gaps** in goroutine execution — the goroutine is blocked or waiting to be scheduled
- **GC events overlapping** with your hot path — GC is stealing CPU time from your application
- **A single P busy while others are idle** — work is not distributed across cores
- **Long syscall bars** — the goroutine is blocked in a system call (file I/O, DNS, etc.)

### User-Defined Regions and Tasks

Annotate your code to make traces more readable:

```go
import "runtime/trace"

func processOrder(ctx context.Context, order *Order) error {
    // Define a region that appears in the trace viewer
    defer trace.StartRegion(ctx, "processOrder").End()

    // Create sub-regions
    trace.WithRegion(ctx, "validateOrder", func() {
        validateOrder(order)
    })

    trace.WithRegion(ctx, "chargePayment", func() {
        chargePayment(order)
    })

    trace.WithRegion(ctx, "sendConfirmation", func() {
        sendConfirmation(order)
    })

    return nil
}

func handleRequest(w http.ResponseWriter, r *http.Request) {
    // Create a task that groups related regions
    ctx, task := trace.NewTask(r.Context(), "handleRequest")
    defer task.End()

    // Log events within the task
    trace.Log(ctx, "userID", r.Header.Get("X-User-ID"))

    processOrder(ctx, parseOrder(r))
}
```

## Benchmarking with `testing.B`

### Writing Benchmarks

```go
package mypackage

import "testing"

func BenchmarkFibonacci(b *testing.B) {
    // b.N is set automatically by the testing framework
    // to run long enough for stable measurements
    for i := 0; i < b.N; i++ {
        Fibonacci(30)
    }
}

// Benchmark with different input sizes
func BenchmarkSort(b *testing.B) {
    sizes := []int{100, 1000, 10000, 100000}

    for _, size := range sizes {
        b.Run(fmt.Sprintf("size=%d", size), func(b *testing.B) {
            // Setup: generate data (not counted in benchmark time)
            data := generateRandomSlice(size)

            b.ResetTimer() // Reset timer after setup

            for i := 0; i < b.N; i++ {
                // Make a copy so each iteration sorts unsorted data
                d := make([]int, len(data))
                copy(d, data)
                sort.Ints(d)
            }
        })
    }
}

// Benchmark memory allocations
func BenchmarkStringConcat(b *testing.B) {
    b.ReportAllocs() // Report allocation counts

    for i := 0; i < b.N; i++ {
        s := ""
        for j := 0; j < 100; j++ {
            s += "hello"
        }
    }
}

// Parallel benchmark (for concurrent workloads)
func BenchmarkParallelRead(b *testing.B) {
    cache := NewCache()
    cache.Set("key", "value")

    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            cache.Get("key")
        }
    })
}
```

### Running Benchmarks

```bash
# Run all benchmarks in the current package
go test -bench=. -benchmem

# Run a specific benchmark
go test -bench=BenchmarkSort -benchmem

# Run with a minimum duration (more stable results)
go test -bench=. -benchtime=5s

# Run with a specific number of iterations
go test -bench=. -benchtime=10000x

# Generate a CPU profile from benchmarks
go test -bench=. -cpuprofile=cpu.prof

# Generate a memory profile from benchmarks
go test -bench=. -memprofile=mem.prof

# Count allocations per operation
go test -bench=. -benchmem
```

### Understanding Benchmark Output

```
BenchmarkFibonacci-8        5000000    234 ns/op     0 B/op    0 allocs/op
BenchmarkSort/size=100-8      50000  28456 ns/op  4096 B/op    2 allocs/op
BenchmarkSort/size=1000-8      3000 456789 ns/op 40960 B/op    2 allocs/op
BenchmarkSort/size=10000-8      200 6789012 ns/op 409600 B/op   2 allocs/op
```

- **-8** — GOMAXPROCS (number of CPU cores used)
- **5000000** — number of iterations (b.N)
- **234 ns/op** — nanoseconds per operation
- **0 B/op** — bytes allocated per operation
- **0 allocs/op** — heap allocations per operation

### Comparing Benchmarks with `benchstat`

```bash
# Install benchstat
go install golang.org/x/perf/cmd/benchstat@latest

# Run benchmark before optimization
go test -bench=. -count=10 -benchmem > old.txt

# Make your optimization
# ...

# Run benchmark after optimization
go test -bench=. -count=10 -benchmem > new.txt

# Compare
benchstat old.txt new.txt
```

Output:

```
name            old time/op    new time/op    delta
Sort/100-8        28.4µs ± 2%    22.1µs ± 1%  -22.18%  (p=0.000 n=10+10)
Sort/1000-8        457µs ± 3%     312µs ± 2%  -31.73%  (p=0.000 n=10+10)
Sort/10000-8      6.79ms ± 1%    4.21ms ± 1%  -38.00%  (p=0.000 n=10+10)

name            old alloc/op   new alloc/op   delta
Sort/100-8        4.10kB ± 0%    2.05kB ± 0%  -50.00%  (p=0.000 n=10+10)
Sort/1000-8       41.0kB ± 0%    20.5kB ± 0%  -50.00%  (p=0.000 n=10+10)

name            old allocs/op  new allocs/op  delta
Sort/100-8          2.00 ± 0%      1.00 ± 0%  -50.00%  (p=0.000 n=10+10)
```

The `±` shows variance across runs, `p` is the p-value (< 0.05 means statistically significant), and `n` is the number of samples used.

## Continuous Profiling in Production

### Technique 1: Pyroscope Integration

```go
import "github.com/grafana/pyroscope-go"

func main() {
    pyroscope.Start(pyroscope.Config{
        ApplicationName: "my-service",
        ServerAddress:   "http://pyroscope:4040",
        Logger:          pyroscope.StandardLogger,
        Tags: map[string]string{
            "region":  os.Getenv("AWS_REGION"),
            "version": os.Getenv("APP_VERSION"),
        },
        ProfileTypes: []pyroscope.ProfileType{
            pyroscope.ProfileCPU,
            pyroscope.ProfileAllocObjects,
            pyroscope.ProfileAllocSpace,
            pyroscope.ProfileInuseObjects,
            pyroscope.ProfileInuseSpace,
            pyroscope.ProfileGoroutines,
            pyroscope.ProfileMutexCount,
            pyroscope.ProfileMutexDuration,
            pyroscope.ProfileBlockCount,
            pyroscope.ProfileBlockDuration,
        },
    })
    defer pyroscope.Stop()

    // Your application
    startServer()
}
```

### Technique 2: Google Cloud Profiler

```go
import "cloud.google.com/go/profiler"

func main() {
    cfg := profiler.Config{
        Service:        "my-service",
        ServiceVersion: "1.0.0",
        ProjectID:      "my-gcp-project",
        // Automatically profiles CPU, heap, goroutine, threads
    }

    if err := profiler.Start(cfg); err != nil {
        log.Fatalf("Failed to start profiler: %v", err)
    }

    startServer()
}
```

### Technique 3: On-Demand Profiling Endpoint

```go
import (
    "net/http"
    "runtime"
    "runtime/pprof"
    "time"
)

func setupProfilingEndpoints(mux *http.ServeMux) {
    // CPU profile with configurable duration
    mux.HandleFunc("/debug/profile/cpu", func(w http.ResponseWriter, r *http.Request) {
        duration, _ := time.ParseDuration(r.URL.Query().Get("duration"))
        if duration == 0 {
            duration = 30 * time.Second
        }
        if duration > 60*time.Second {
            http.Error(w, "Max duration is 60 seconds", 400)
            return
        }

        w.Header().Set("Content-Type", "application/octet-stream")
        w.Header().Set("Content-Disposition",
            fmt.Sprintf("attachment; filename=cpu-%s.prof", time.Now().Format("20060102-150405")))

        if err := pprof.StartCPUProfile(w); err != nil {
            http.Error(w, err.Error(), 500)
            return
        }
        time.Sleep(duration)
        pprof.StopCPUProfile()
    })

    // Force GC and take heap snapshot
    mux.HandleFunc("/debug/profile/heap", func(w http.ResponseWriter, r *http.Request) {
        runtime.GC() // Force GC for accurate inuse data

        w.Header().Set("Content-Type", "application/octet-stream")
        pprof.WriteHeapProfile(w)
    })

    // Runtime statistics
    mux.HandleFunc("/debug/stats", func(w http.ResponseWriter, r *http.Request) {
        var m runtime.MemStats
        runtime.ReadMemStats(&m)

        stats := map[string]interface{}{
            "goroutines":     runtime.NumGoroutine(),
            "cpus":           runtime.NumCPU(),
            "goVersion":      runtime.Version(),
            "heapAlloc":      m.HeapAlloc,
            "heapSys":        m.HeapSys,
            "heapIdle":       m.HeapIdle,
            "heapInuse":      m.HeapInuse,
            "heapReleased":   m.HeapReleased,
            "heapObjects":    m.HeapObjects,
            "gcPauseTotal":   m.PauseTotalNs,
            "gcPauseLast":    m.PauseNs[(m.NumGC+255)%256],
            "gcRuns":         m.NumGC,
            "gcCPUFraction":  m.GCCPUFraction,
            "stackInuse":     m.StackInuse,
        }

        json.NewEncoder(w).Encode(stats)
    })
}
```

## GC Tuning and Observation

### Understanding Go's GC

Go uses a concurrent, tri-color, mark-and-sweep garbage collector. Key parameters:

```go
import "runtime/debug"

func tuneGC() {
    // GOGC controls the GC target percentage.
    // Default: 100 (trigger GC when heap doubles)
    // Higher = fewer GC cycles but more memory
    // Lower = more GC cycles but less memory
    debug.SetGCPercent(200) // Trigger GC when heap triples

    // GOMEMLIMIT sets a soft memory limit (Go 1.19+)
    // The GC will try to keep memory usage under this limit
    debug.SetMemoryLimit(4 * 1024 * 1024 * 1024) // 4 GB

    // For latency-sensitive apps, use GOMEMLIMIT with a high GOGC
    // This reduces GC frequency while preventing OOM
    debug.SetGCPercent(500)
    debug.SetMemoryLimit(2 * 1024 * 1024 * 1024) // 2 GB
}
```

### GC Tracing

```bash
# Enable GC trace output
GODEBUG=gctrace=1 go run server.go

# Output format:
# gc 1 @0.012s 2%: 0.018+1.2+0.004 ms clock, 0.072+0.34/1.1/0+0.016 ms cpu, 4->4->1 MB, 4 MB goal, 0 MB stacks, 0 MB globals, 8 P
#
# gc 1        — GC cycle number
# @0.012s     — time since program start
# 2%          — percentage of time spent in GC since start
# 0.018+1.2+0.004 ms clock — STW sweep, concurrent mark, STW finish
# 4->4->1 MB  — heap before, heap after GC, live data
# 4 MB goal   — target heap size before next GC
# 8 P         — number of processors used
```

## Profiling Cheat Sheet

| Symptom | Profile to Use | Key Metric |
|---------|---------------|------------|
| High CPU usage | CPU profile | `flat` time in top functions |
| Growing memory | Heap profile (inuse_space) | Compare two snapshots |
| High allocation rate / GC pressure | Heap profile (alloc_space) | Allocation hotspots |
| Goroutine count growing | Goroutine profile | Total count, stuck goroutines |
| Poor concurrent throughput | Mutex profile | Contention duration |
| Goroutines blocking | Block profile | Block duration by location |
| Not using all cores | Execution trace | Goroutine scheduling gaps |
| GC pauses causing latency spikes | GC trace + execution trace | STW pause duration |

---

> *"In Go, the profiler is not an afterthought — it is a first-class citizen. Use it."*
