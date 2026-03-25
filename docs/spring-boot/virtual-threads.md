---
title: "Virtual Threads (Project Loom)"
description: "Complete guide to Java 21 virtual threads with Spring Boot — configuration, virtual thread executor setup, when virtual threads help vs don't, pinning issues and how to avoid them, monitoring virtual threads, migration from platform threads, performance benchmarks, and the reactive vs virtual threads decision."
tags: [spring-boot, virtual-threads, project-loom, java-21, concurrency]
difficulty: advanced
prerequisites: [spring-boot-fundamentals, java-concurrency, jvm-internals]
lastReviewed: "2026-03-25"
---

# Virtual Threads (Project Loom)

Virtual threads, introduced as a preview in Java 19 and finalized in Java 21, fundamentally change how Java handles concurrency. They are lightweight threads managed by the JVM rather than the OS, enabling millions of concurrent threads without the memory overhead of platform threads. Spring Boot 3.2+ provides first-class support for virtual threads.

## 1. Platform Threads vs Virtual Threads

```
Platform Threads (Traditional)
┌─────────────────────────────────────────────────────────────────┐
│  Each thread ≈ 1 OS thread                                      │
│  Stack size: ~1 MB (configurable)                               │
│  200 threads ≈ 200 MB of stack memory                           │
│  Context switch: OS kernel (expensive, ~1-10 microseconds)      │
│  Creating threads: slow (syscall to OS)                         │
│  Typical pool size: 200-400 for a web server                    │
│  Under load: thread pool exhaustion → requests queue or fail    │
└─────────────────────────────────────────────────────────────────┘

Virtual Threads (Project Loom)
┌─────────────────────────────────────────────────────────────────┐
│  Each thread ≈ JVM-managed continuation                        │
│  Stack size: starts at ~1 KB, grows as needed                   │
│  1,000,000 virtual threads ≈ a few GB                           │
│  Context switch: JVM userspace (cheap, ~nanoseconds)            │
│  Creating threads: fast (no syscall)                            │
│  No pool needed: create per task, let GC clean up               │
│  Under load: scales to available work (no pool exhaustion)      │
└─────────────────────────────────────────────────────────────────┘

Carrier Thread Model:
┌─────────────────────────────────────────────────────────────────┐
│  ForkJoinPool (carrier threads = CPU cores)                     │
│                                                                  │
│  Carrier 1: [VT-A] ─── I/O wait ──→ [VT-B] ─── I/O wait ──→  │
│  Carrier 2: [VT-C] ─── I/O wait ──→ [VT-A] ─── compute ───→  │
│  Carrier 3: [VT-D] ─── I/O wait ──→ [VT-E] ─── I/O wait ──→  │
│                                                                  │
│  When a virtual thread blocks on I/O, its carrier is freed      │
│  to run other virtual threads. The blocked VT is "parked"       │
│  and resumed when the I/O completes.                             │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Enabling Virtual Threads in Spring Boot

### 2.1 Simple Configuration

```yaml
# application.yml — Spring Boot 3.2+
spring:
  threads:
    virtual:
      enabled: true  # That's it. Tomcat/Jetty will use virtual threads.
```

This single property configures:
- Tomcat/Jetty to handle each request on a virtual thread
- `@Async` methods to run on virtual threads
- Spring MVC async request handling on virtual threads
- Task scheduling on virtual threads

### 2.2 Explicit Executor Configuration

```java
@Configuration
public class VirtualThreadConfig {

    // Explicit virtual thread executor (if you need more control)
    @Bean
    public AsyncTaskExecutor applicationTaskExecutor() {
        return new TaskExecutorAdapter(Executors.newVirtualThreadPerTaskExecutor());
    }

    // For @Scheduled tasks
    @Bean
    public TaskScheduler taskScheduler() {
        SimpleAsyncTaskScheduler scheduler = new SimpleAsyncTaskScheduler();
        scheduler.setVirtualThreads(true);
        scheduler.setThreadNamePrefix("scheduled-vt-");
        return scheduler;
    }

    // Custom executor for specific use cases
    @Bean("batchExecutor")
    public ExecutorService batchExecutor() {
        return Executors.newVirtualThreadPerTaskExecutor();
    }
}
```

### 2.3 Verifying Virtual Threads Are Active

```java
@RestController
@RequestMapping("/api/debug")
public class ThreadDebugController {

    @GetMapping("/thread-info")
    public Map<String, Object> threadInfo() {
        Thread current = Thread.currentThread();
        return Map.of(
                "threadName", current.getName(),
                "isVirtual", current.isVirtual(),
                "threadId", current.threadId(),
                "threadClass", current.getClass().getName(),
                "carrier", current.isVirtual()
                        ? "mounted on carrier (ForkJoinPool)"
                        : "platform thread"
        );
    }
}
// Response with virtual threads enabled:
// {
//   "threadName": "tomcat-handler-1",
//   "isVirtual": true,
//   "threadId": 54,
//   "threadClass": "java.lang.VirtualThread",
//   "carrier": "mounted on carrier (ForkJoinPool)"
// }
```

## 3. When Virtual Threads Help

### 3.1 I/O-Bound Workloads (Big Win)

```java
@Service
public class OrderEnrichmentService {

    private final RestClient customerClient;
    private final RestClient inventoryClient;
    private final RestClient pricingClient;
    private final JdbcTemplate jdbcTemplate;

    // Each of these blocking calls releases the carrier thread
    // while waiting for the network response
    public EnrichedOrder enrichOrder(OrderRequest request) {
        // 1. Database query (JDBC blocks → virtual thread parks)
        Order order = jdbcTemplate.queryForObject(
                "SELECT * FROM orders WHERE id = ?",
                new OrderRowMapper(), request.getOrderId());

        // 2. HTTP call to customer service (blocks → parks)
        Customer customer = customerClient.get()
                .uri("/api/customers/{id}", order.getCustomerId())
                .retrieve()
                .body(Customer.class);

        // 3. HTTP call to inventory service (blocks → parks)
        StockLevel stock = inventoryClient.get()
                .uri("/api/inventory/{sku}", order.getSku())
                .retrieve()
                .body(StockLevel.class);

        // 4. HTTP call to pricing service (blocks → parks)
        Price price = pricingClient.get()
                .uri("/api/pricing/{sku}?tier={tier}",
                        order.getSku(), customer.getTier())
                .retrieve()
                .body(Price.class);

        return new EnrichedOrder(order, customer, stock, price);
    }
}

// With platform threads: 200 concurrent requests = 200 threads = thread pool limit
// With virtual threads: 10,000 concurrent requests = 10,000 virtual threads
//   = only ~N carrier threads (N = CPU cores), rest are parked waiting for I/O
```

### 3.2 Parallel I/O with StructuredTaskScope

```java
@Service
public class ParallelOrderService {

    public OrderDetails getOrderDetails(Long orderId) throws Exception {
        // StructuredTaskScope ensures all subtasks complete or fail together
        try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {

            // Fork parallel tasks — each runs on its own virtual thread
            Subtask<Order> orderTask = scope.fork(() ->
                    orderClient.getOrder(orderId));
            Subtask<Customer> customerTask = scope.fork(() ->
                    customerClient.getCustomer(orderId));
            Subtask<List<OrderItem>> itemsTask = scope.fork(() ->
                    itemClient.getItems(orderId));
            Subtask<ShippingInfo> shippingTask = scope.fork(() ->
                    shippingClient.getShipping(orderId));

            // Wait for all tasks to complete
            scope.join();
            scope.throwIfFailed();

            // All completed successfully — combine results
            return new OrderDetails(
                    orderTask.get(),
                    customerTask.get(),
                    itemsTask.get(),
                    shippingTask.get()
            );
        }
    }

    // Fan-out pattern: process many items in parallel
    public List<ProcessedItem> processItems(List<Item> items) throws Exception {
        try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
            List<Subtask<ProcessedItem>> tasks = items.stream()
                    .map(item -> scope.fork(() -> processItem(item)))
                    .toList();

            scope.join();
            scope.throwIfFailed();

            return tasks.stream()
                    .map(Subtask::get)
                    .toList();
        }
    }

    // With custom error handling
    public OrderDetails getOrderDetailsResilient(Long orderId) throws Exception {
        try (var scope = new StructuredTaskScope.ShutdownOnSuccess<Object>()) {
            // Race: return whichever responds first
            scope.fork(() -> primaryService.getOrder(orderId));
            scope.fork(() -> fallbackService.getOrder(orderId));

            scope.join();
            return (OrderDetails) scope.result();
        }
    }
}
```

## 4. When Virtual Threads Don't Help

### 4.1 CPU-Bound Work

```java
// NO BENEFIT — virtual threads don't help with CPU-bound computation
@Service
public class CpuIntensiveService {

    public BigInteger computeFactorial(int n) {
        // This is pure CPU work — no I/O, no blocking
        // Virtual thread stays mounted on carrier the entire time
        // No opportunity to park and switch
        BigInteger result = BigInteger.ONE;
        for (int i = 2; i <= n; i++) {
            result = result.multiply(BigInteger.valueOf(i));
        }
        return result;
    }

    // For CPU-bound work, use a fixed thread pool sized to CPU cores
    @Bean("cpuExecutor")
    public ExecutorService cpuBoundExecutor() {
        return Executors.newFixedThreadPool(
                Runtime.getRuntime().availableProcessors());
    }
}
```

### 4.2 Thread-Local Heavy Code

```java
// CAUTION — thread-local variables work but can be memory-expensive
// because each of millions of virtual threads gets its own copy

// BAD: SimpleDateFormat in thread-local (wastes memory per VT)
private static final ThreadLocal<SimpleDateFormat> formatter =
        ThreadLocal.withInitial(() -> new SimpleDateFormat("yyyy-MM-dd"));

// GOOD: Use DateTimeFormatter (thread-safe, no ThreadLocal needed)
private static final DateTimeFormatter formatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd");

// GOOD: Use ScopedValue (Java 21 preview) instead of ThreadLocal
private static final ScopedValue<RequestContext> REQUEST_CONTEXT =
        ScopedValue.newInstance();

public void handleRequest(RequestContext ctx) {
    ScopedValue.runWhere(REQUEST_CONTEXT, ctx, () -> {
        // Available in this scope and all called methods
        processOrder();
    });
}

private void processOrder() {
    RequestContext ctx = REQUEST_CONTEXT.get(); // no ThreadLocal
    // ...
}
```

## 5. Pinning Issues

**Pinning** occurs when a virtual thread cannot be unmounted from its carrier thread, blocking the carrier and reducing throughput.

### 5.1 Causes of Pinning

```java
// CAUSE 1: synchronized blocks/methods
// The virtual thread stays pinned to its carrier for the entire
// synchronized block, even during I/O operations inside it.

// BAD — pinning during synchronized + blocking I/O
public class LegacyService {
    private final Object lock = new Object();

    public String fetchData() {
        synchronized (lock) {
            // Virtual thread is PINNED here
            return httpClient.send(request, BodyHandlers.ofString()).body();
            // Carrier thread is blocked — cannot run other virtual threads
        }
    }
}

// GOOD — use ReentrantLock instead (virtual-thread friendly)
public class ModernService {
    private final ReentrantLock lock = new ReentrantLock();

    public String fetchData() {
        lock.lock();
        try {
            // Virtual thread can unmount while waiting for I/O
            return httpClient.send(request, BodyHandlers.ofString()).body();
        } finally {
            lock.unlock();
        }
    }
}

// CAUSE 2: native methods that hold the monitor
// Some JDK classes internally use synchronized (e.g., old I/O classes)
// Solution: Use java.nio, java.net.http, or libraries updated for Loom
```

### 5.2 Detecting Pinning

```bash
# JVM flag to detect pinning
java -Djdk.tracePinnedThreads=short -jar myapp.jar
# or
java -Djdk.tracePinnedThreads=full -jar myapp.jar

# Output when pinning occurs:
# Thread[#42,VirtualThread-unparker,5,CarrierThreads] <== monitors:1
#     com.example.LegacyService.fetchData(LegacyService.java:15)
#         <== pinned while synchronized
```

```java
// Programmatic pinning detection
@Configuration
public class PinningDetectionConfig {

    @Bean
    public ApplicationRunner pinningDetector() {
        return args -> {
            // Set system property for pinning detection
            System.setProperty("jdk.tracePinnedThreads", "short");
        };
    }
}
```

### 5.3 Common Libraries with Pinning Issues

```
┌────────────────────────────┬────────────────────────────────────┐
│ Library                    │ Status / Workaround                │
├────────────────────────────┼────────────────────────────────────┤
│ HikariCP                   │ Fixed in 5.1+ (uses ReentrantLock)│
│ JDBC drivers (PostgreSQL)  │ Fixed in 42.7.0+                  │
│ MySQL Connector/J          │ Fixed in 8.2.0+                   │
│ Apache HttpClient          │ Use java.net.http.HttpClient       │
│ OkHttp                     │ Fixed in 5.0+                     │
│ Netty (reactor-netty)      │ N/A (non-blocking, no pinning)    │
│ Jackson                    │ No issues                          │
│ Logback                    │ Minor pinning (acceptable)         │
│ Spring Security            │ No issues in 6.2+                  │
│ Hibernate                  │ Fixed in 6.4+                     │
└────────────────────────────┴────────────────────────────────────┘
```

## 6. Monitoring Virtual Threads

### 6.1 JFR Events

```java
@Configuration
public class VirtualThreadMonitoring {

    @Bean
    public ApplicationRunner jfrMonitoring() {
        return args -> {
            // Enable JFR events for virtual thread monitoring
            // jdk.VirtualThreadStart
            // jdk.VirtualThreadEnd
            // jdk.VirtualThreadPinned
            // jdk.VirtualThreadSubmitFailed
        };
    }
}
```

### 6.2 Custom Metrics

```java
@Component
public class VirtualThreadMetrics implements MeterBinder {

    @Override
    public void bindTo(MeterRegistry registry) {
        // Track virtual thread creation rate
        Gauge.builder("jvm.threads.virtual.count", () -> {
            // Thread.getAllStackTraces() is expensive; use JMX or JFR
            return Thread.getAllStackTraces().keySet().stream()
                    .filter(Thread::isVirtual)
                    .count();
        }).description("Number of active virtual threads")
                .register(registry);

        // Track carrier thread utilization
        ForkJoinPool carrier = ForkJoinPool.commonPool();
        Gauge.builder("jvm.carrier.active", carrier, ForkJoinPool::getActiveThreadCount)
                .description("Active carrier threads")
                .register(registry);
        Gauge.builder("jvm.carrier.pool.size", carrier, ForkJoinPool::getPoolSize)
                .description("Carrier thread pool size")
                .register(registry);
        Gauge.builder("jvm.carrier.queued", carrier, ForkJoinPool::getQueuedTaskCount)
                .description("Queued tasks on carrier pool")
                .register(registry);
    }
}
```

### 6.3 Thread Dump Filtering

```java
@RestController
@RequestMapping("/api/admin/threads")
public class ThreadDiagnosticController {

    @GetMapping("/virtual")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> virtualThreadInfo() {
        Map<Thread.State, Long> stateCount = Thread.getAllStackTraces().keySet().stream()
                .filter(Thread::isVirtual)
                .collect(Collectors.groupingBy(Thread::getState, Collectors.counting()));

        long totalVirtual = stateCount.values().stream().mapToLong(Long::longValue).sum();
        long totalPlatform = Thread.getAllStackTraces().keySet().stream()
                .filter(t -> !t.isVirtual())
                .count();

        return Map.of(
                "virtualThreads", totalVirtual,
                "platformThreads", totalPlatform,
                "virtualThreadStates", stateCount,
                "carrierPoolSize", ForkJoinPool.commonPool().getPoolSize(),
                "carrierActive", ForkJoinPool.commonPool().getActiveThreadCount()
        );
    }
}
```

## 7. Migration from Platform Threads

### 7.1 Step-by-Step Migration

```java
// Step 1: Update Java to 21+ and Spring Boot to 3.2+

// Step 2: Update dependencies that cause pinning
// - HikariCP 5.1+
// - PostgreSQL JDBC 42.7.0+
// - MySQL Connector/J 8.2.0+

// Step 3: Replace synchronized with ReentrantLock
// BEFORE:
public class CacheService {
    private final Map<String, Object> cache = new HashMap<>();

    public synchronized Object get(String key) {
        return cache.get(key);
    }

    public synchronized void put(String key, Object value) {
        cache.put(key, value);
    }
}

// AFTER:
public class CacheService {
    private final Map<String, Object> cache = new HashMap<>();
    private final ReentrantLock lock = new ReentrantLock();

    public Object get(String key) {
        lock.lock();
        try {
            return cache.get(key);
        } finally {
            lock.unlock();
        }
    }

    public void put(String key, Object value) {
        lock.lock();
        try {
            cache.put(key, value);
        } finally {
            lock.unlock();
        }
    }
}
// OR better: use ConcurrentHashMap
public class CacheService {
    private final Map<String, Object> cache = new ConcurrentHashMap<>();

    public Object get(String key) { return cache.get(key); }
    public void put(String key, Object value) { cache.put(key, value); }
}

// Step 4: Replace ThreadLocal with ScopedValue where possible
// Step 5: Enable virtual threads
// spring.threads.virtual.enabled=true

// Step 6: Remove thread pool tuning (no longer needed for request handling)
// BEFORE:
// server.tomcat.threads.max=400
// server.tomcat.threads.min-spare=50
// AFTER: remove these — virtual threads don't need tuning

// Step 7: Run with -Djdk.tracePinnedThreads=short to find pinning
// Step 8: Load test and compare metrics
```

### 7.2 Gradual Adoption

```java
@Configuration
@Profile("virtual-threads")
public class VirtualThreadProfile {

    @Bean
    public TomcatProtocolHandlerCustomizer<?> protocolHandlerCustomizer() {
        return protocolHandler -> {
            protocolHandler.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        };
    }
}

// Run with: --spring.profiles.active=virtual-threads
// Compare performance against the default profile
```

## 8. Performance Benchmarks

```
┌──────────────────────────────────────────────────────────────────┐
│        Benchmark: REST API with 3 downstream HTTP calls           │
│        + 1 database query per request                             │
│                                                                   │
│  Concurrent     Platform Threads   Virtual Threads   Reactive     │
│  Requests       (200 pool)         (unlimited)       (WebFlux)    │
│  ─────────────  ─────────────────  ────────────────  ──────────── │
│  100            45 ms P99          42 ms P99         40 ms P99    │
│  500            120 ms P99         55 ms P99         50 ms P99    │
│  1,000          350 ms P99         65 ms P99         58 ms P99    │
│  2,000          1200 ms P99*       80 ms P99         62 ms P99    │
│  5,000          TIMEOUT*           120 ms P99        85 ms P99    │
│  10,000         TIMEOUT*           180 ms P99        110 ms P99   │
│                                                                   │
│  * Platform threads hit pool exhaustion at ~200 concurrent        │
│                                                                   │
│  Memory at       350 MB             120 MB            100 MB      │
│  5000 conc.      (OOM risk)         (stable)          (stable)    │
│                                                                   │
│  Throughput       ~200 req/s         ~5000 req/s      ~6000 req/s │
│  (sustained)      (pool-limited)     (I/O-limited)    (I/O-lim.)  │
└──────────────────────────────────────────────────────────────────┘

Note: Numbers are illustrative. Actual performance depends on
downstream service latency, database query time, hardware, etc.
```

## 9. Reactive vs Virtual Threads Decision

```
┌────────────────────────┬──────────────────────┬──────────────────────┐
│ Factor                 │ Virtual Threads      │ Reactive (WebFlux)   │
├────────────────────────┼──────────────────────┼──────────────────────┤
│ Programming Model      │ Imperative (simple)  │ Functional (complex) │
│ Learning Curve         │ Low (familiar Java)  │ High (Reactor API)   │
│ Debugging              │ Normal stack traces  │ Complex async traces │
│ Existing Code          │ Mostly compatible    │ Complete rewrite     │
│ Blocking Libraries     │ Work naturally       │ Must wrap/avoid      │
│ JDBC/JPA              │ Works as-is          │ Needs R2DBC           │
│ Throughput (I/O)      │ Very good             │ Excellent            │
│ Memory Efficiency     │ Good                  │ Best                 │
│ Streaming/SSE         │ Supported             │ Native strength      │
│ Backpressure          │ Manual                │ Built-in             │
│ Ecosystem Maturity    │ Growing (Java 21+)    │ Mature               │
│ Testing               │ Standard JUnit       │ StepVerifier needed  │
│ Exception Handling    │ try/catch             │ onErrorResume chains │
│ Team Adoption         │ Easy                  │ Takes months         │
├────────────────────────┼──────────────────────┼──────────────────────┤
│ Choose When           │ I/O-bound CRUD apps, │ Streaming, extreme   │
│                        │ migrating existing   │ throughput, already   │
│                        │ blocking code,       │ reactive codebase,   │
│                        │ team prefers simple  │ backpressure needed  │
│                        │ imperative code      │                      │
└────────────────────────┴──────────────────────┴──────────────────────┘

Recommendation for new projects (2025+):
- DEFAULT: Virtual threads + Spring MVC (simple, performant, familiar)
- STREAMING: WebFlux (SSE, WebSocket, real-time data)
- GATEWAY: WebFlux or Spring Cloud Gateway (non-blocking proxying)
- EXTREME SCALE: WebFlux (backpressure, sub-ms latency requirements)
```

## 10. Production Checklist

```java
/**
 * Virtual Threads Production Checklist:
 *
 * 1. JAVA VERSION: Ensure Java 21+ in all environments
 *
 * 2. DEPENDENCIES: Update all JDBC drivers, connection pools,
 *    and HTTP clients to versions that avoid pinning
 *
 * 3. SYNCHRONIZED: Audit codebase for synchronized blocks
 *    containing I/O operations. Replace with ReentrantLock
 *    or concurrent collections
 *
 * 4. THREAD-LOCALS: Audit ThreadLocal usage. Each virtual thread
 *    gets its own copy — millions of copies = memory pressure.
 *    Consider ScopedValue or shared state
 *
 * 5. THREAD POOL SIZING: Remove tomcat.threads.max tuning.
 *    Keep connection pool limits (HikariCP max-pool-size) — those
 *    protect the database, not the JVM
 *
 * 6. MONITORING: Add virtual thread count metrics. Monitor
 *    carrier pool utilization. Watch for pinning events
 *
 * 7. CONNECTION POOLS: Size database connection pools based on
 *    DATABASE capacity, not thread count. With virtual threads
 *    you can have 10,000 requests but only 50 DB connections
 *
 * 8. LOAD TESTING: Run load tests comparing platform vs virtual
 *    threads with your actual workload profile
 *
 * 9. PINNING DETECTION: Run with -Djdk.tracePinnedThreads=short
 *    during testing to find pinning issues
 *
 * 10. GRADUAL ROLLOUT: Enable via Spring profile, roll out to
 *     a canary environment first, monitor for regressions
 */
```

Virtual threads are the most significant Java concurrency improvement in a decade. For the vast majority of Spring Boot applications — those doing CRUD operations, calling downstream services, and querying databases — enabling `spring.threads.virtual.enabled=true` on Java 21+ delivers dramatic scalability improvements with zero code changes. The imperative programming model stays intact, debugging remains straightforward, and existing blocking libraries work naturally. Reserve reactive/WebFlux for streaming scenarios and extreme throughput requirements where backpressure is essential.
