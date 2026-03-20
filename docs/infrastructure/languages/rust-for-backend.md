---
title: "Rust for Backend Development"
description: "Ownership, async Rust with Tokio, web frameworks (Actix-web, Axum), database access, error handling patterns, and performance comparison"
tags: [rust, backend, systems-programming, async, web-frameworks]
difficulty: "advanced"
prerequisites: []
lastReviewed: "2026-03-20"
---

# Rust for Backend Development

Rust is increasingly adopted for backend services where performance, reliability, and low resource consumption matter. Companies like Cloudflare, Discord, Dropbox, and AWS (Firecracker, Lambda runtime) use Rust in production for services that handle millions of requests per second. Rust achieves this without a garbage collector — its ownership system enforces memory safety at compile time, eliminating entire categories of bugs (null pointers, use-after-free, data races) that plague C, C++, Go, and Java services. The trade-off is a steeper learning curve and longer compile times. This page covers the subset of Rust that matters for building production backend services: ownership fundamentals, async I/O with Tokio, web frameworks, database access, and error handling.

## Ownership, Borrowing, and Lifetimes

Rust's ownership system is the foundation. Every value has exactly one owner, and when the owner goes out of scope, the value is dropped (freed). This replaces garbage collection:

### The Three Rules

1. Each value has exactly **one owner**
2. When the owner goes out of scope, the value is **dropped**
3. You can have either **one mutable reference** OR **any number of immutable references** (but not both)

```rust
fn main() {
    let s1 = String::from("hello"); // s1 owns the String
    let s2 = s1;                     // Ownership MOVES to s2. s1 is now invalid.
    // println!("{s1}");             // Compile error! s1 was moved.
    println!("{s2}");                // Works fine.
}

// Borrowing: references without taking ownership
fn calculate_length(s: &String) -> usize {  // &String is an immutable borrow
    s.len()
    // s goes out of scope, but since it doesn't own the String, nothing is dropped
}

fn append_world(s: &mut String) {  // &mut String is a mutable borrow
    s.push_str(", world");
}

fn main() {
    let mut greeting = String::from("hello");
    let len = calculate_length(&greeting);      // Immutable borrow
    append_world(&mut greeting);                 // Mutable borrow
    println!("{greeting} has length {len}");     // hello, world has length 5
}
```

### Lifetimes

Lifetimes ensure that references do not outlive the data they point to. The compiler infers most lifetimes, but sometimes you must annotate:

```rust
// This function returns a reference — but which input does it point to?
// The lifetime annotation 'a tells Rust: the returned reference lives at least
// as long as the shorter of the two input lifetimes.
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}

// In structs that hold references
struct Config<'a> {
    database_url: &'a str,
    redis_url: &'a str,
}
```

::: tip Lifetime Elision
In most backend code, you will rarely write explicit lifetime annotations. Rust's lifetime elision rules handle the common cases. When you do need them, it is usually in structs that hold references or functions that return references derived from inputs.
:::

## Async Rust: Tokio and async/await

Rust's async model is **zero-cost** — async functions compile to state machines with no heap allocation for the future itself. The runtime (Tokio) provides the event loop and task scheduler.

### How Async Works

```mermaid
graph LR
    F["async fn handler()"]
    SM["Compiled to<br/>State Machine"]
    RT["Tokio Runtime<br/>(Event Loop + Thread Pool)"]
    EP["epoll / kqueue / IOCP"]

    F --> SM --> RT --> EP

    style F fill:#4f46e5,color:#fff
    style RT fill:#059669,color:#fff
    style EP fill:#d97706,color:#fff
```

```rust
use tokio::time::{sleep, Duration};

// async fn returns a Future — it does nothing until polled
async fn fetch_data(url: &str) -> Result<String, reqwest::Error> {
    let response = reqwest::get(url).await?;  // .await yields control
    let body = response.text().await?;
    Ok(body)
}

#[tokio::main]  // Sets up the Tokio runtime
async fn main() {
    // Concurrent execution — both requests run simultaneously
    let (result1, result2) = tokio::join!(
        fetch_data("https://api.example.com/users"),
        fetch_data("https://api.example.com/orders"),
    );

    println!("Users: {:?}", result1);
    println!("Orders: {:?}", result2);
}
```

### Tokio Runtime Configuration

```rust
use tokio::runtime::Builder;

fn main() {
    // Multi-threaded runtime (default with #[tokio::main])
    let rt = Builder::new_multi_thread()
        .worker_threads(4)           // Number of worker threads
        .max_blocking_threads(512)   // For blocking operations
        .enable_all()                // Enable I/O and time drivers
        .build()
        .unwrap();

    rt.block_on(async {
        // Your async application
        start_server().await;
    });
}
```

### Spawning Tasks

```rust
// tokio::spawn — run a future on the runtime (like a goroutine)
let handle = tokio::spawn(async {
    expensive_computation().await
});

// Wait for the result
let result = handle.await.unwrap();

// spawn_blocking — run CPU-intensive or blocking code on a dedicated thread pool
let hash = tokio::task::spawn_blocking(move || {
    // This runs on the blocking thread pool, not the async worker threads
    argon2::hash_password(password.as_bytes(), &salt)
}).await.unwrap();
```

::: warning Never Block the Async Runtime
Calling blocking operations (CPU-heavy computation, synchronous file I/O, `std::thread::sleep`) inside an async context will starve other tasks. Always use `tokio::task::spawn_blocking()` for blocking work or `tokio::fs` for file operations.
:::

## Web Frameworks

### Axum (Recommended)

Axum is built by the Tokio team and integrates deeply with the Tokio ecosystem. It uses Rust's type system for extraction and routing:

```rust
use axum::{
    extract::{Path, Query, State, Json},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

// Application state shared across handlers
struct AppState {
    db: sqlx::PgPool,
    redis: redis::Client,
}

#[derive(Deserialize)]
struct Pagination {
    page: Option<u32>,
    per_page: Option<u32>,
}

#[derive(Serialize)]
struct User {
    id: i64,
    name: String,
    email: String,
}

// Handler — extractors pull data from the request automatically
async fn get_user(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<i64>,
) -> Result<Json<User>, StatusCode> {
    let user = sqlx::query_as!(User, "SELECT id, name, email FROM users WHERE id = $1", user_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(user))
}

async fn list_users(
    State(state): State<Arc<AppState>>,
    Query(pagination): Query<Pagination>,
) -> Result<Json<Vec<User>>, StatusCode> {
    let page = pagination.page.unwrap_or(1);
    let per_page = pagination.per_page.unwrap_or(20).min(100);
    let offset = (page - 1) * per_page;

    let users = sqlx::query_as!(
        User,
        "SELECT id, name, email FROM users ORDER BY id LIMIT $1 OFFSET $2",
        per_page as i64,
        offset as i64,
    )
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(users))
}

#[derive(Deserialize)]
struct CreateUser {
    name: String,
    email: String,
}

async fn create_user(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateUser>,
) -> Result<(StatusCode, Json<User>), StatusCode> {
    let user = sqlx::query_as!(
        User,
        "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email",
        payload.name,
        payload.email,
    )
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(user)))
}

#[tokio::main]
async fn main() {
    let db = sqlx::PgPool::connect("postgres://localhost/mydb").await.unwrap();
    let state = Arc::new(AppState {
        db,
        redis: redis::Client::open("redis://localhost").unwrap(),
    });

    let app = Router::new()
        .route("/users", get(list_users).post(create_user))
        .route("/users/{id}", get(get_user))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

### Framework Comparison

| Feature | Axum | Actix-web | Rocket |
|---------|------|-----------|--------|
| Async runtime | Tokio (native) | Actix (Tokio-compatible) | Tokio (since 0.5) |
| Extraction | Type-based (FromRequest trait) | Type-based (FromRequest trait) | Attribute-based macros |
| Middleware | Tower middleware ecosystem | Actix middleware | Fairings |
| Performance | Excellent | Excellent (historically fastest) | Good |
| Type safety | Strong compile-time routing | Strong | Strong (request guards) |
| Learning curve | Moderate | Moderate | Lower (more magic) |
| Ecosystem | Tokio ecosystem (tower, hyper) | Actix ecosystem | Smaller ecosystem |
| Maturity | Newer (2021+) | Most mature (2017+) | Mature but slower development |

### Middleware with Tower

```rust
use axum::middleware;
use tower_http::{
    cors::CorsLayer,
    trace::TraceLayer,
    compression::CompressionLayer,
    timeout::TimeoutLayer,
};
use std::time::Duration;

let app = Router::new()
    .route("/users", get(list_users))
    .layer(TraceLayer::new_for_http())        // Request tracing
    .layer(CompressionLayer::new())            // Gzip/Brotli response compression
    .layer(TimeoutLayer::new(Duration::from_secs(30)))  // Request timeout
    .layer(CorsLayer::permissive())            // CORS headers
    .layer(middleware::from_fn(auth_middleware)); // Custom auth middleware
```

## Database Access

### SQLx (Compile-Time Checked Queries)

SQLx checks your SQL queries against the actual database schema at compile time:

```rust
// This will NOT compile if the query is invalid SQL
// or if the column types don't match the struct
let users = sqlx::query_as!(
    User,
    r#"
    SELECT id, name, email
    FROM users
    WHERE created_at > $1
    ORDER BY created_at DESC
    LIMIT $2
    "#,
    cutoff_date,
    limit as i64,
)
.fetch_all(&pool)
.await?;

// Transactions
let mut tx = pool.begin().await?;

let user = sqlx::query_as!(
    User,
    "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *",
    name, email
)
.fetch_one(&mut *tx)
.await?;

sqlx::query!(
    "INSERT INTO audit_log (user_id, action) VALUES ($1, 'created')",
    user.id
)
.execute(&mut *tx)
.await?;

tx.commit().await?; // Both operations succeed or both fail
```

### Database Library Comparison

| Feature | SQLx | Diesel | SeaORM |
|---------|------|--------|--------|
| Query style | Raw SQL | DSL (type-safe query builder) | ActiveRecord-style ORM |
| Compile-time checking | Yes (against real DB) | Yes (against schema.rs) | Partial |
| Async support | Native | Requires async wrapper | Native |
| Migration system | Built-in | Built-in | Built-in |
| Learning curve | Low (just SQL) | Medium (DSL) | Medium (ORM concepts) |
| Flexibility | Maximum | High | Medium |
| DB support | Postgres, MySQL, SQLite | Postgres, MySQL, SQLite | Postgres, MySQL, SQLite |

## Error Handling

Rust has no exceptions. Errors are values, returned via `Result<T, E>`. This makes error paths explicit and impossible to accidentally ignore:

### The Error Pattern Stack

```rust
use thiserror::Error;

// Define domain errors with thiserror
#[derive(Error, Debug)]
pub enum AppError {
    #[error("User not found: {id}")]
    UserNotFound { id: i64 },

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Database error")]
    Database(#[from] sqlx::Error),

    #[error("Redis error")]
    Cache(#[from] redis::RedisError),

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Internal error")]
    Internal(#[from] anyhow::Error),
}

// Convert AppError to HTTP responses (Axum)
impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match &self {
            AppError::UserNotFound { .. } => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::Validation(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized".to_string()),
            AppError::Database(e) => {
                tracing::error!("Database error: {e:?}");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal error".to_string())
            }
            AppError::Cache(e) => {
                tracing::error!("Cache error: {e:?}");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal error".to_string())
            }
            AppError::Internal(e) => {
                tracing::error!("Internal error: {e:?}");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal error".to_string())
            }
        };

        let body = serde_json::json!({
            "error": {
                "message": message,
                "code": status.as_u16(),
            }
        });

        (status, Json(body)).into_response()
    }
}

// Handlers return Result<T, AppError> — errors automatically become responses
async fn get_user(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<i64>,
) -> Result<Json<User>, AppError> {
    let user = sqlx::query_as!(User, "SELECT * FROM users WHERE id = $1", user_id)
        .fetch_optional(&state.db)
        .await?                              // ? converts sqlx::Error into AppError::Database
        .ok_or(AppError::UserNotFound { id: user_id })?;

    Ok(Json(user))
}
```

### The ? Operator

The `?` operator is syntactic sugar for early return on error. It replaces verbose `match` blocks:

```rust
// Without ?
fn read_config() -> Result<Config, Box<dyn std::error::Error>> {
    let contents = match std::fs::read_to_string("config.toml") {
        Ok(c) => c,
        Err(e) => return Err(e.into()),
    };
    let config = match toml::from_str(&contents) {
        Ok(c) => c,
        Err(e) => return Err(e.into()),
    };
    Ok(config)
}

// With ? — same behavior, much cleaner
fn read_config() -> Result<Config, Box<dyn std::error::Error>> {
    let contents = std::fs::read_to_string("config.toml")?;
    let config: Config = toml::from_str(&contents)?;
    Ok(config)
}
```

## Performance Comparison

Rust's zero-cost abstractions consistently deliver the best throughput and lowest latency among mainstream backend languages:

### HTTP Server Benchmark (TechEmpower-style)

| Language/Framework | Requests/sec | p99 Latency | Memory Usage |
|-------------------|-------------|-------------|--------------|
| Rust (Axum) | ~500,000 | 0.8 ms | 12 MB |
| Go (net/http) | ~350,000 | 1.2 ms | 25 MB |
| Java (Spring WebFlux) | ~300,000 | 2.5 ms | 180 MB |
| Node.js (Fastify) | ~120,000 | 3.5 ms | 80 MB |
| Python (FastAPI + uvicorn) | ~25,000 | 15 ms | 60 MB |

*Benchmarks are approximate and depend heavily on workload, hardware, and configuration. These represent a typical JSON serialization benchmark on modern server hardware.*

### Where Rust Wins Most

| Scenario | Why Rust Excels |
|----------|----------------|
| High-throughput proxies | Zero-copy I/O, no GC pauses |
| Latency-sensitive services | No GC pauses, predictable performance |
| Memory-constrained (edge, embedded) | Minimal runtime, no GC overhead |
| CPU-intensive processing | Zero-cost abstractions, SIMD, optimal codegen |
| Security-critical services | Memory safety without GC, no null pointers |

### Where Rust Is Overkill

| Scenario | Better Choice |
|----------|--------------|
| CRUD APIs with simple business logic | Go, Node.js, Python |
| Rapid prototyping | Python, TypeScript |
| Teams without Rust experience | Go (similar performance, lower learning curve) |
| Data science / ML backends | Python |
| Short-lived scripts and automation | Python, Bash |

## Structured Logging and Observability

```rust
use tracing::{info, warn, instrument};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

// Initialize tracing
fn init_tracing() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer().json()) // JSON structured logs
        .with(tracing_subscriber::EnvFilter::from_default_env()) // RUST_LOG=info
        .init();
}

// #[instrument] automatically creates a span with function args
#[instrument(skip(state), fields(user_id = %user_id))]
async fn get_user(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<i64>,
) -> Result<Json<User>, AppError> {
    info!("Fetching user");

    let user = sqlx::query_as!(User, "SELECT * FROM users WHERE id = $1", user_id)
        .fetch_optional(&state.db)
        .await?;

    match user {
        Some(u) => {
            info!(email = %u.email, "User found");
            Ok(Json(u))
        }
        None => {
            warn!("User not found");
            Err(AppError::UserNotFound { id: user_id })
        }
    }
}
```

## Project Structure

A production Rust backend typically follows this structure:

```
my-service/
├── Cargo.toml
├── Cargo.lock
├── migrations/
│   ├── 20260101000000_create_users.sql
│   └── 20260102000000_create_orders.sql
├── src/
│   ├── main.rs              # Entry point, server setup
│   ├── config.rs             # Configuration (env vars, secrets)
│   ├── error.rs              # AppError enum and conversions
│   ├── routes/
│   │   ├── mod.rs
│   │   ├── users.rs          # User handlers
│   │   └── orders.rs         # Order handlers
│   ├── models/
│   │   ├── mod.rs
│   │   ├── user.rs           # User struct, DB queries
│   │   └── order.rs          # Order struct, DB queries
│   ├── middleware/
│   │   ├── mod.rs
│   │   ├── auth.rs           # Authentication middleware
│   │   └── logging.rs        # Request logging
│   └── lib.rs                # Library root (for integration tests)
└── tests/
    └── integration_tests.rs  # Full API integration tests
```

## Deployment Considerations

```dockerfile
# Multi-stage Docker build for Rust
FROM rust:1.77-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
# Cache dependencies (build with dummy main.rs first)
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

COPY src ./src
COPY migrations ./migrations
# Touch main.rs so cargo knows to recompile
RUN touch src/main.rs
RUN cargo build --release

# Final image — distroless for minimal attack surface
FROM gcr.io/distroless/cc-debian12
COPY --from=builder /app/target/release/my-service /
EXPOSE 3000
CMD ["/my-service"]
# Final image size: ~15-30 MB (compared to ~200+ MB for Go, ~400+ MB for Java)
```

::: tip Compile Time Optimization
Rust's compile times are its biggest developer experience weakness. Use `cargo-watch` for auto-recompilation, `sccache` for shared compilation cache, and `mold` (or `lld`) as a faster linker. For CI, cache `target/` and `~/.cargo/registry/`.
:::

## Further Reading

- [Go Concurrency](/infrastructure/languages/go-concurrency) — Go's concurrency model compared to Rust's async/await
- [Node.js Internals](/infrastructure/languages/nodejs-internals) — V8 and event loop as a contrast to Rust's zero-runtime approach
- [gRPC Internals](/system-design/networking/grpc-internals) — building gRPC services in Rust with Tonic
- [Docker Multi-Stage Builds](/infrastructure/docker/multi-stage-builds) — essential for Rust's large build artifacts
- [Production Dockerfiles](/infrastructure/docker/production-dockerfiles) — distroless base images that Rust services benefit from
