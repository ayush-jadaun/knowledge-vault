---
title: "Go Cheat Sheet"
description: "Quick reference for Go types, concurrency, error handling, standard library, and module system"
tags: [golang, cheat-sheet, reference, programming, concurrency]
difficulty: beginner
prerequisites: []
lastReviewed: "2026-03-20"
---

# Go Cheat Sheet

Quick reference for Go variables, types, structs, interfaces, goroutines, channels, error handling, standard library, and module system.

---

## Variables & Types

### Declarations

```go
// Variable declaration
var name string = "Alice"
var age int                  // Zero value: 0
var active bool              // Zero value: false

// Short declaration (inside functions only)
count := 10
msg := "hello"

// Multiple declarations
var (
    host = "localhost"
    port = 8080
)

// Constants
const Pi = 3.14159
const (
    StatusOK    = 200
    StatusNotOK = 400
)

// iota (auto-incrementing constants)
const (
    Read    = 1 << iota  // 1
    Write                // 2
    Execute              // 4
)
```

### Basic Types

| Type | Zero Value | Example |
|------|------------|---------|
| `bool` | `false` | `true` |
| `string` | `""` | `"hello"` |
| `int`, `int8/16/32/64` | `0` | `42` |
| `uint`, `uint8/16/32/64` | `0` | `42` |
| `float32`, `float64` | `0.0` | `3.14` |
| `complex64`, `complex128` | `(0+0i)` | `1+2i` |
| `byte` (alias `uint8`) | `0` | `'A'` |
| `rune` (alias `int32`) | `0` | `'Z'` |

### Slices & Arrays

```go
// Array (fixed length)
arr := [3]int{1, 2, 3}

// Slice (dynamic length)
s := []int{1, 2, 3}
s = append(s, 4, 5)          // Append elements
s2 := make([]int, 5)         // Length 5, cap 5
s3 := make([]int, 0, 10)     // Length 0, cap 10

// Slice operations
sub := s[1:3]                // Elements at index 1, 2
len(s)                       // Length
cap(s)                       // Capacity
copy(dst, src)               // Copy elements

// Delete element at index i
s = append(s[:i], s[i+1:]...)

// Slices package (1.21+)
import "slices"
slices.Sort(s)
slices.Contains(s, 3)
idx := slices.Index(s, 3)
```

### Maps

```go
// Create map
m := map[string]int{
    "alice": 90,
    "bob":   85,
}
m2 := make(map[string]int)

// Operations
m["charlie"] = 92            // Set
val := m["alice"]             // Get (zero value if missing)
val, ok := m["dave"]          // Check existence
delete(m, "bob")              // Delete key
len(m)                        // Number of keys

// Iterate
for key, val := range m {
    fmt.Println(key, val)
}

// Maps package (1.21+)
import "maps"
maps.Keys(m)
maps.Values(m)
```

---

## Structs & Interfaces

### Structs

```go
type User struct {
    ID    int    `json:"id"`
    Name  string `json:"name"`
    Email string `json:"email,omitempty"`
}

// Create
u := User{ID: 1, Name: "Alice"}
u2 := &User{Name: "Bob"}     // Pointer to struct

// Methods (value receiver)
func (u User) FullName() string {
    return u.Name
}

// Methods (pointer receiver - can modify)
func (u *User) SetName(name string) {
    u.Name = name
}

// Embedding (composition)
type Admin struct {
    User                      // Embeds all User fields/methods
    Level int
}
a := Admin{User: User{Name: "Root"}, Level: 1}
a.Name                       // Access embedded field directly
```

### Interfaces

```go
// Interface definition
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}

// Composed interface
type ReadWriter interface {
    Reader
    Writer
}

// Implicit implementation (no "implements" keyword)
type MyReader struct{}
func (r MyReader) Read(p []byte) (int, error) {
    return 0, nil
}
// MyReader now satisfies Reader interface

// Empty interface (any value)
var x any                    // same as interface{}

// Type assertion
val, ok := x.(string)

// Type switch
switch v := x.(type) {
case string:
    fmt.Println("string:", v)
case int:
    fmt.Println("int:", v)
default:
    fmt.Println("unknown")
}
```

---

## Goroutines & Channels

### Goroutines

```go
// Launch goroutine
go func() {
    fmt.Println("running concurrently")
}()

// WaitGroup for synchronization
var wg sync.WaitGroup
for i := 0; i < 5; i++ {
    wg.Add(1)
    go func(id int) {
        defer wg.Done()
        doWork(id)
    }(i)
}
wg.Wait()
```

### Channels

```go
// Unbuffered channel (blocks until both sides ready)
ch := make(chan string)

// Buffered channel
ch := make(chan int, 100)

// Send and receive
ch <- "hello"               // Send
msg := <-ch                  // Receive

// Directional channels (function signatures)
func producer(out chan<- int) {}   // Send only
func consumer(in <-chan int) {}    // Receive only

// Close channel
close(ch)

// Range over channel (until closed)
for val := range ch {
    fmt.Println(val)
}
```

### Select

```go
select {
case msg := <-ch1:
    fmt.Println("from ch1:", msg)
case msg := <-ch2:
    fmt.Println("from ch2:", msg)
case ch3 <- "outgoing":
    fmt.Println("sent to ch3")
case <-time.After(5 * time.Second):
    fmt.Println("timeout")
default:
    fmt.Println("no channel ready")
}
```

### Common Concurrency Patterns

```go
// Fan-out / fan-in
func fanOut(in <-chan int, workers int) []<-chan int {
    outs := make([]<-chan int, workers)
    for i := 0; i < workers; i++ {
        outs[i] = worker(in)
    }
    return outs
}

// Worker pool
func workerPool(jobs <-chan Job, results chan<- Result, n int) {
    var wg sync.WaitGroup
    for i := 0; i < n; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for job := range jobs {
                results <- process(job)
            }
        }()
    }
    go func() {
        wg.Wait()
        close(results)
    }()
}

// Rate limiter
limiter := time.NewTicker(100 * time.Millisecond)
defer limiter.Stop()
for req := range requests {
    <-limiter.C
    go handle(req)
}
```

---

## Error Handling

### Basic Patterns

```go
// Return error
func divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, errors.New("division by zero")
    }
    return a / b, nil
}

// Check error
result, err := divide(10, 0)
if err != nil {
    log.Fatal(err)
}

// Wrap errors (add context)
if err != nil {
    return fmt.Errorf("processing user %d: %w", id, err)
}

// Unwrap errors
if errors.Is(err, os.ErrNotExist) {
    // Handle file not found
}

// Check error type
var pathErr *os.PathError
if errors.As(err, &pathErr) {
    fmt.Println("path:", pathErr.Path)
}
```

### Custom Errors

```go
type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation: %s - %s", e.Field, e.Message)
}

// Sentinel errors
var (
    ErrNotFound     = errors.New("not found")
    ErrUnauthorized = errors.New("unauthorized")
)
```

### Defer, Panic, Recover

```go
// Defer (LIFO order, runs on function exit)
func readFile(path string) ([]byte, error) {
    f, err := os.Open(path)
    if err != nil {
        return nil, err
    }
    defer f.Close()
    return io.ReadAll(f)
}

// Recover from panic
func safeHandler() {
    defer func() {
        if r := recover(); r != nil {
            log.Printf("recovered: %v", r)
        }
    }()
    riskyOperation()
}
```

---

## Common Standard Library

### net/http

```go
// Simple HTTP server
mux := http.NewServeMux()
mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("ok"))
})
mux.HandleFunc("GET /users/{id}", getUser)
http.ListenAndServe(":8080", mux)

// HTTP client
resp, err := http.Get("https://api.example.com/data")
if err != nil {
    log.Fatal(err)
}
defer resp.Body.Close()
body, _ := io.ReadAll(resp.Body)

// Client with timeout
client := &http.Client{Timeout: 10 * time.Second}
resp, err := client.Get(url)
```

### encoding/json

```go
// Struct to JSON
type User struct {
    Name  string `json:"name"`
    Email string `json:"email,omitempty"`
    Age   int    `json:"age"`
}
data, err := json.Marshal(user)
json.NewEncoder(w).Encode(user)      // Write to io.Writer

// JSON to struct
var u User
err := json.Unmarshal(data, &u)
json.NewDecoder(r.Body).Decode(&u)   // Read from io.Reader

// Dynamic JSON
var result map[string]any
json.Unmarshal(data, &result)
```

### context

```go
// Context with timeout
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

// Context with cancel
ctx, cancel := context.WithCancel(context.Background())
defer cancel()

// Pass context to functions
func fetchData(ctx context.Context, url string) error {
    req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
    resp, err := http.DefaultClient.Do(req)
    // ...
}

// Check cancellation
select {
case <-ctx.Done():
    return ctx.Err()   // context.Canceled or DeadlineExceeded
case result := <-ch:
    return process(result)
}
```

### sync

```go
// Mutex
var mu sync.Mutex
mu.Lock()
defer mu.Unlock()
// critical section

// RWMutex (multiple readers, single writer)
var rw sync.RWMutex
rw.RLock()                   // Read lock (shared)
rw.RUnlock()
rw.Lock()                    // Write lock (exclusive)
rw.Unlock()

// Once (run exactly once)
var once sync.Once
once.Do(func() {
    initExpensiveResource()
})

// sync.Map (concurrent-safe map)
var m sync.Map
m.Store("key", "value")
val, ok := m.Load("key")
m.Delete("key")
```

---

## Module System

### Module Commands

| Command | Description |
|---------|-------------|
| `go mod init module/path` | Initialize new module |
| `go mod tidy` | Add missing, remove unused deps |
| `go mod download` | Download dependencies |
| `go mod vendor` | Copy deps to vendor directory |
| `go mod graph` | Print dependency graph |
| `go get pkg@version` | Add or update dependency |
| `go get pkg@latest` | Update to latest version |
| `go list -m all` | List all dependencies |

### Build & Run

| Command | Description |
|---------|-------------|
| `go run .` | Compile and run |
| `go build -o app .` | Compile binary |
| `go build -ldflags="-s -w" .` | Smaller binary (strip debug) |
| `go install .` | Install to `$GOPATH/bin` |
| `CGO_ENABLED=0 go build .` | Static binary (no cgo) |
| `GOOS=linux GOARCH=amd64 go build .` | Cross-compile |

---

## Testing

```go
// Basic test (file: xxx_test.go)
func TestAdd(t *testing.T) {
    got := Add(2, 3)
    if got != 5 {
        t.Errorf("Add(2,3) = %d, want 5", got)
    }
}

// Table-driven tests
func TestDivide(t *testing.T) {
    tests := []struct {
        name    string
        a, b    float64
        want    float64
        wantErr bool
    }{
        {"normal", 10, 2, 5, false},
        {"zero", 10, 0, 0, true},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := Divide(tt.a, tt.b)
            if (err != nil) != tt.wantErr {
                t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
            }
            if got != tt.want {
                t.Errorf("got %v, want %v", got, tt.want)
            }
        })
    }
}

// Benchmark
func BenchmarkSort(b *testing.B) {
    for i := 0; i < b.N; i++ {
        sort.Ints(generateData())
    }
}
```

### Test Commands

| Command | Description |
|---------|-------------|
| `go test ./...` | Run all tests |
| `go test -v ./...` | Verbose output |
| `go test -run TestName ./pkg` | Run specific test |
| `go test -count=1 ./...` | Disable test caching |
| `go test -race ./...` | Race condition detector |
| `go test -cover ./...` | Show coverage percentage |
| `go test -coverprofile=cover.out` | Generate coverage file |
| `go tool cover -html=cover.out` | View coverage in browser |
| `go test -bench=. ./...` | Run benchmarks |
| `go test -benchmem ./...` | Benchmark with memory stats |

---

## When to Use X vs Y

| Decision | Choice A | Choice B | Use A When | Use B When |
|----------|----------|----------|------------|------------|
| Data | Slice | Array | Dynamic size (almost always) | Fixed size, value semantics |
| Receiver | Value `(t T)` | Pointer `(t *T)` | Small, immutable | Large struct, needs mutation |
| Concurrency | Channel | Mutex | Communicating data between goroutines | Protecting shared state |
| Error | Sentinel `var Err` | Custom type | Simple identity check | Need extra context/fields |
| Interface | Small (1-2 methods) | Large | Composability, flexibility | Only when genuinely needed |
| String building | `strings.Builder` | `+` concat | Loop, many parts | 2-3 parts, simple concat |
| JSON | Struct tags | `map[string]any` | Known schema | Dynamic / unknown schema |
