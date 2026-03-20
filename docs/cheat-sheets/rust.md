---
title: "Rust Cheat Sheet"
description: "Quick reference for Rust ownership, common types, pattern matching, traits, generics, and Cargo"
tags: [rust, cheat-sheet, reference, programming, systems]
difficulty: beginner
prerequisites: []
lastReviewed: "2026-03-20"
---

# Rust Cheat Sheet

Quick reference for Rust ownership, borrowing, lifetimes, common types, pattern matching, iterators, traits, generics, and Cargo commands.

---

## Ownership, Borrowing & Lifetimes

### Ownership Rules

1. Each value has exactly one owner
2. When the owner goes out of scope, the value is dropped
3. Ownership can be moved or borrowed

```rust
let s1 = String::from("hello");
let s2 = s1;                     // s1 is MOVED, no longer valid
// println!("{s1}");              // Error: value used after move

let s3 = s2.clone();             // Deep copy, both valid
```

### Borrowing

```rust
fn length(s: &String) -> usize { // Immutable borrow
    s.len()
}

fn push_char(s: &mut String) {   // Mutable borrow
    s.push('!');
}

let mut name = String::from("Alice");
let len = length(&name);         // Immutable borrow
push_char(&mut name);            // Mutable borrow
```

### Borrowing Rules

| Rule | Allowed | Not Allowed |
|------|---------|-------------|
| Multiple `&T` | `let a = &x; let b = &x;` | -- |
| Single `&mut T` | `let a = &mut x;` | `let b = &mut x;` (second) |
| Mix `&T` and `&mut T` | -- | `let a = &x; let b = &mut x;` |

### Lifetimes

```rust
// Explicit lifetime annotations
fn longest<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.len() > b.len() { a } else { b }
}

// Lifetime in structs
struct Excerpt<'a> {
    text: &'a str,
}

// Static lifetime (lives for entire program)
let s: &'static str = "lives forever";
```

::: tip
The compiler's lifetime elision rules handle most cases. Only add explicit lifetimes when the compiler asks.
:::

---

## Common Types

### String vs &str

```rust
let s: &str = "hello";           // String slice (borrowed, immutable)
let s: String = String::from("hello"); // Owned, heap-allocated, growable

// Conversions
let owned: String = "hello".to_string();
let borrowed: &str = &owned;
```

### Vec

```rust
let mut v: Vec<i32> = Vec::new();
let v = vec![1, 2, 3];           // Macro shorthand

v.push(4);                       // Append
v.pop();                         // Remove last -> Option<T>
v.len();                         // Length
v.is_empty();                    // Check empty
v.contains(&3);                  // Search
v.iter();                        // Immutable iterator
v.iter_mut();                    // Mutable iterator
v.into_iter();                   // Consuming iterator
v.sort();                        // Sort in place
v.dedup();                       // Remove consecutive duplicates
v.retain(|x| *x > 2);           // Keep matching elements
&v[0..2];                        // Slice
```

### HashMap

```rust
use std::collections::HashMap;

let mut map = HashMap::new();
map.insert("key", 42);
map.get("key");                  // -> Option<&V>
map.contains_key("key");        // -> bool
map.remove("key");               // -> Option<V>
map.entry("key").or_insert(0);   // Insert if absent
*map.entry("key").or_insert(0) += 1; // Increment

for (key, val) in &map {
    println!("{key}: {val}");
}
```

### Option & Result

```rust
// Option<T> - value that may or may not exist
enum Option<T> {
    Some(T),
    None,
}

let x: Option<i32> = Some(42);
x.unwrap();                      // 42 (panics if None)
x.unwrap_or(0);                  // 42 or default
x.unwrap_or_default();           // Uses T::default()
x.map(|v| v * 2);               // Some(84)
x.and_then(|v| Some(v + 1));    // Chained computation
x.is_some();                     // true
x.is_none();                     // false
if let Some(val) = x { }        // Pattern match

// Result<T, E> - operation that can fail
enum Result<T, E> {
    Ok(T),
    Err(E),
}

let r: Result<i32, String> = Ok(42);
r.unwrap();                      // 42 (panics if Err)
r.expect("should work");        // 42 with custom panic msg
r.map(|v| v * 2);               // Ok(84)
r.map_err(|e| format!("{e}"));  // Transform error
r.is_ok();                       // true
r.is_err();                      // false

// The ? operator (early return on error)
fn read_file(path: &str) -> Result<String, io::Error> {
    let content = fs::read_to_string(path)?;  // Returns Err if fails
    Ok(content.to_uppercase())
}
```

---

## Pattern Matching

### match

```rust
let x = 5;
match x {
    1 => println!("one"),
    2 | 3 => println!("two or three"),
    4..=9 => println!("four to nine"),
    _ => println!("other"),
}

// Match with destructuring
match point {
    (0, 0) => println!("origin"),
    (x, 0) => println!("on x-axis at {x}"),
    (0, y) => println!("on y-axis at {y}"),
    (x, y) => println!("at ({x}, {y})"),
}

// Match on enums
enum Command {
    Quit,
    Echo(String),
    Move { x: i32, y: i32 },
}

match cmd {
    Command::Quit => quit(),
    Command::Echo(msg) => println!("{msg}"),
    Command::Move { x, y } => move_to(x, y),
}

// Match guards
match num {
    n if n < 0 => println!("negative"),
    n if n > 0 => println!("positive"),
    _ => println!("zero"),
}
```

### if let & while let

```rust
// if let (single pattern)
if let Some(val) = optional {
    println!("got {val}");
}

// let-else (Rust 1.65+)
let Some(val) = optional else {
    return Err("missing value");
};

// while let
while let Some(item) = stack.pop() {
    process(item);
}
```

---

## Iterators

```rust
let nums = vec![1, 2, 3, 4, 5];

// Common iterator methods
nums.iter().map(|x| x * 2);              // Transform
nums.iter().filter(|x| **x > 2);         // Filter
nums.iter().fold(0, |acc, x| acc + x);   // Reduce
nums.iter().sum::<i32>();                 // Sum
nums.iter().product::<i32>();             // Product
nums.iter().count();                      // Count
nums.iter().any(|x| *x > 3);             // Any match?
nums.iter().all(|x| *x > 0);             // All match?
nums.iter().find(|x| **x > 3);           // First match
nums.iter().position(|x| *x > 3);        // Index of first match
nums.iter().enumerate();                  // (index, value) pairs
nums.iter().zip(other.iter());            // Pair up two iterators
nums.iter().take(3);                      // First 3 elements
nums.iter().skip(2);                      // Skip first 2
nums.iter().chain(other.iter());          // Concatenate iterators
nums.iter().flat_map(|x| vec![x, x]);    // Map + flatten
nums.iter().collect::<Vec<_>>();          // Collect into type
nums.iter().cloned().collect::<Vec<_>>(); // Clone + collect

// Chaining
let result: Vec<i32> = nums.iter()
    .filter(|x| **x % 2 == 0)
    .map(|x| x * 10)
    .collect();
```

---

## Traits & Generics

### Traits

```rust
// Define a trait
trait Summary {
    fn summarize(&self) -> String;

    // Default implementation
    fn preview(&self) -> String {
        format!("{}...", &self.summarize()[..20])
    }
}

// Implement trait for type
struct Article { title: String, body: String }

impl Summary for Article {
    fn summarize(&self) -> String {
        format!("{}: {}", self.title, self.body)
    }
}

// Trait as parameter
fn notify(item: &impl Summary) {
    println!("Breaking: {}", item.summarize());
}

// Trait bound syntax (equivalent)
fn notify<T: Summary>(item: &T) { }

// Multiple bounds
fn process<T: Summary + Display>(item: &T) { }

// where clause (cleaner for complex bounds)
fn process<T, U>(t: &T, u: &U) -> String
where
    T: Summary + Clone,
    U: Display + Debug,
{
    format!("{} - {}", t.summarize(), u)
}
```

### Common Derive Traits

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct Point {
    x: i32,
    y: i32,
}

// serde (with serde crate)
#[derive(Serialize, Deserialize)]
struct Config {
    host: String,
    port: u16,
}
```

| Trait | Purpose |
|-------|---------|
| `Debug` | `{:?}` formatting |
| `Clone` | Explicit `.clone()` copy |
| `Copy` | Implicit bitwise copy (small types) |
| `PartialEq` / `Eq` | `==` comparison |
| `PartialOrd` / `Ord` | `<`, `>` comparison |
| `Hash` | Hashing (for HashMap keys) |
| `Display` | `{}` user-facing formatting |
| `Default` | `Type::default()` |
| `From` / `Into` | Type conversions |

### Generics

```rust
// Generic function
fn largest<T: PartialOrd>(list: &[T]) -> &T {
    let mut max = &list[0];
    for item in &list[1..] {
        if item > max { max = item; }
    }
    max
}

// Generic struct
struct Wrapper<T> {
    value: T,
}

impl<T: Display> Wrapper<T> {
    fn show(&self) {
        println!("{}", self.value);
    }
}

// Generic enum (Option and Result are examples)
enum MyResult<T, E> {
    Ok(T),
    Err(E),
}
```

---

## Error Handling Patterns

```rust
// Custom error type
#[derive(Debug)]
enum AppError {
    NotFound(String),
    Database(sqlx::Error),
    Validation(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::NotFound(msg) => write!(f, "not found: {msg}"),
            Self::Database(e) => write!(f, "database: {e}"),
            Self::Validation(msg) => write!(f, "invalid: {msg}"),
        }
    }
}

impl std::error::Error for AppError {}

// From conversions for ? operator
impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError::Database(e)
    }
}

// Using thiserror crate (less boilerplate)
#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("database error")]
    Database(#[from] sqlx::Error),
}

// Using anyhow crate (application code)
fn main() -> anyhow::Result<()> {
    let config = load_config().context("failed to load config")?;
    Ok(())
}
```

---

## Cargo Commands

### Build & Run

| Command | Description |
|---------|-------------|
| `cargo new project` | Create new binary project |
| `cargo new --lib project` | Create new library project |
| `cargo build` | Build debug binary |
| `cargo build --release` | Build optimized release binary |
| `cargo run` | Build and run |
| `cargo run -- args` | Run with arguments |
| `cargo check` | Check compilation without building |
| `cargo clean` | Remove target directory |

### Test & Lint

| Command | Description |
|---------|-------------|
| `cargo test` | Run all tests |
| `cargo test test_name` | Run matching tests |
| `cargo test -- --nocapture` | Show println output |
| `cargo test -- --test-threads=1` | Run tests sequentially |
| `cargo bench` | Run benchmarks |
| `cargo clippy` | Run linter |
| `cargo clippy --fix` | Auto-fix lint warnings |
| `cargo fmt` | Format code |
| `cargo fmt --check` | Check formatting |

### Dependencies

| Command | Description |
|---------|-------------|
| `cargo add serde` | Add dependency |
| `cargo add serde --features derive` | Add with features |
| `cargo add tokio -F full` | Short flag for features |
| `cargo remove serde` | Remove dependency |
| `cargo update` | Update dependencies |
| `cargo tree` | Show dependency tree |
| `cargo audit` | Check for vulnerabilities |
| `cargo doc --open` | Generate and open docs |

---

## Structs, Enums & impl

```rust
// Struct with methods
struct Rect { width: f64, height: f64 }

impl Rect {
    // Associated function (constructor)
    fn new(w: f64, h: f64) -> Self {
        Self { width: w, height: h }
    }

    // Method (takes &self)
    fn area(&self) -> f64 {
        self.width * self.height
    }
}

// Enum with data
enum Shape {
    Circle(f64),                  // Tuple variant
    Rectangle { w: f64, h: f64 },// Struct variant
    Point,                        // Unit variant
}

impl Shape {
    fn area(&self) -> f64 {
        match self {
            Shape::Circle(r) => std::f64::consts::PI * r * r,
            Shape::Rectangle { w, h } => w * h,
            Shape::Point => 0.0,
        }
    }
}
```

---

## Closures

```rust
// Closure types
let add = |a, b| a + b;                  // Inferred types
let add = |a: i32, b: i32| -> i32 { a + b }; // Explicit types

// Capture modes
let name = String::from("Alice");
let greet = || println!("Hi {name}");     // Borrows name (&)
let greet = move || println!("Hi {name}");// Takes ownership

// Closure traits
// FnOnce  - can be called once (takes ownership)
// FnMut   - can be called multiple times (mutable borrow)
// Fn      - can be called multiple times (immutable borrow)

fn apply<F: Fn(i32) -> i32>(f: F, x: i32) -> i32 {
    f(x)
}
apply(|x| x * 2, 5)  // 10
```

---

## Smart Pointers

| Type | Purpose | Use Case |
|------|---------|----------|
| `Box<T>` | Heap allocation | Recursive types, trait objects |
| `Rc<T>` | Reference counting (single thread) | Shared ownership |
| `Arc<T>` | Atomic ref counting (multi thread) | Shared ownership across threads |
| `RefCell<T>` | Interior mutability (runtime checks) | Mutate through `&self` |
| `Mutex<T>` | Mutual exclusion | Thread-safe mutation |
| `RwLock<T>` | Reader-writer lock | Many readers, one writer |

```rust
// Box - heap allocation
let b = Box::new(5);

// Rc - shared ownership
use std::rc::Rc;
let a = Rc::new(vec![1, 2, 3]);
let b = Rc::clone(&a);           // Increments count, not deep copy

// Arc + Mutex - thread-safe shared state
use std::sync::{Arc, Mutex};
let counter = Arc::new(Mutex::new(0));
let c = Arc::clone(&counter);
*c.lock().unwrap() += 1;
```

---

## When to Use X vs Y

| Decision | Choice A | Choice B | Use A When | Use B When |
|----------|----------|----------|------------|------------|
| String | `String` | `&str` | Owned, need to modify | Borrowed, read-only |
| Error lib | `thiserror` | `anyhow` | Library (typed errors) | Application (any error) |
| Smart ptr | `Box<T>` | `Rc<T>` | Single owner | Multiple owners (same thread) |
| Smart ptr | `Rc<T>` | `Arc<T>` | Single thread | Multiple threads |
| Collection | `Vec<T>` | `[T; N]` | Dynamic size | Fixed size, stack allocated |
| Trait usage | `impl Trait` | `dyn Trait` | Static dispatch (perf) | Dynamic dispatch (flexibility) |
| Copy | `Clone` | `Copy` | Explicit, heap types | Implicit, small stack types |
| Iteration | `.iter()` | `.into_iter()` | Borrow elements | Consume collection |
