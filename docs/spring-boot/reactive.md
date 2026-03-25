---
title: "Spring WebFlux"
description: "Complete guide to reactive programming with Spring WebFlux — reactive streams fundamentals, Mono and Flux operators, WebClient for non-blocking HTTP, R2DBC for reactive database access, functional endpoints, backpressure handling, and when to choose reactive over servlet"
tags: [spring-boot, webflux, reactive, r2dbc, non-blocking]
difficulty: advanced
prerequisites: []
lastReviewed: "2026-03-25"
---

# Spring WebFlux

Traditional Spring MVC uses one thread per request. A thread handles a request, and if that request needs to wait for a database query, an API call, or file I/O, the thread blocks — it sits idle, doing nothing, consuming memory. With 200 concurrent requests waiting on database responses, you need 200 threads doing nothing. This works fine for most applications, but it fails at scale when you have thousands of concurrent connections, each mostly waiting on I/O.

Spring WebFlux is the reactive alternative. Instead of blocking a thread while waiting for I/O, it registers a callback and releases the thread to handle other requests. A single thread can serve hundreds of concurrent requests, provided those requests spend most of their time waiting on I/O rather than computing.

## The Reactive Mental Model

```
Servlet (Spring MVC) — Thread-per-Request:
───────────────────────────────────────────
Thread 1: ──[Request]──[DB Query]──────────[Response]──
Thread 2: ──[Request]──[API Call]──────────────────[Response]──
Thread 3: ──[Request]──[DB Query]────[Response]──
                        ↑ idle ↑
           Each thread blocks during I/O wait

Reactive (WebFlux) — Event Loop:
───────────────────────────────────
Thread 1: ─[Req A]─[Req B]─[Req C]─[A:DB done]─[B:API done]─[C:DB done]─
Thread 2: ─[Req D]─[Req E]─[D:done]─[E:done]─
           Threads never block — they process events
```

## Mono and Flux: The Building Blocks

Everything in WebFlux revolves around two types:

- **`Mono<T>`** — A publisher that emits 0 or 1 element. Like `Optional<T>` but asynchronous.
- **`Flux<T>`** — A publisher that emits 0 to N elements. Like `Stream<T>` but asynchronous.

### Creating Mono and Flux

```java
// Mono: single value or empty
Mono<String> mono = Mono.just("Hello");
Mono<String> empty = Mono.empty();
Mono<String> error = Mono.error(new RuntimeException("fail"));
Mono<String> deferred = Mono.fromCallable(() -> expensiveOperation());
Mono<String> fromFuture = Mono.fromFuture(completableFuture);

// Flux: multiple values
Flux<Integer> numbers = Flux.just(1, 2, 3, 4, 5);
Flux<Integer> range = Flux.range(1, 100);
Flux<Long> interval = Flux.interval(Duration.ofSeconds(1));
Flux<String> fromIterable = Flux.fromIterable(list);
Flux<String> fromStream = Flux.fromStream(() -> stream);
```

### Essential Operators

```java
// Transform
Mono<UserDto> dto = userMono.map(user -> UserDto.from(user));

// Async transform (flatMap for async operations)
Mono<Order> order = userMono
        .flatMap(user -> orderService.findLatestOrder(user.getId()));

// Chain multiple async operations
Mono<OrderSummary> summary = userMono
        .flatMap(user -> orderService.findLatestOrder(user.getId()))
        .flatMap(order -> paymentService.getPayment(order.getPaymentId()))
        .map(payment -> OrderSummary.from(payment));

// Filter
Flux<User> activeUsers = userFlux
        .filter(user -> user.getStatus() == Status.ACTIVE);

// Error handling
Mono<User> withFallback = userService.findById(id)
        .switchIfEmpty(Mono.error(new UserNotFoundException(id)))
        .onErrorResume(TimeoutException.class,
                e -> fallbackUserService.findById(id))
        .onErrorMap(DataAccessException.class,
                e -> new ServiceException("DB error", e));

// Combine multiple publishers
Mono<Dashboard> dashboard = Mono.zip(
        userService.getProfile(userId),
        orderService.getRecentOrders(userId),
        notificationService.getUnread(userId)
).map(tuple -> new Dashboard(
        tuple.getT1(),  // profile
        tuple.getT2(),  // orders
        tuple.getT3()   // notifications
));

// Collect Flux to Mono<List>
Mono<List<User>> allUsers = userFlux.collectList();
```

## Reactive Controllers

### Annotation-Based (Similar to MVC)

```java
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    @GetMapping("/{id}")
    public Mono<ResponseEntity<UserDto>> getUser(@PathVariable String id) {
        return userService.findById(id)
                .map(user -> ResponseEntity.ok(UserDto.from(user)))
                .defaultIfEmpty(ResponseEntity.notFound().build());
    }

    @GetMapping
    public Flux<UserDto> getAllUsers(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return userService.findAll(page, size)
                .map(UserDto::from);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<UserDto> createUser(@Valid @RequestBody Mono<CreateUserRequest> request) {
        return request
                .flatMap(userService::create)
                .map(UserDto::from);
    }

    @DeleteMapping("/{id}")
    public Mono<ResponseEntity<Void>> deleteUser(@PathVariable String id) {
        return userService.delete(id)
                .then(Mono.just(ResponseEntity.noContent().<Void>build()))
                .defaultIfEmpty(ResponseEntity.notFound().build());
    }

    // Server-Sent Events stream
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<UserEvent> streamUserEvents() {
        return userService.getUserEventStream();
    }
}
```

### Functional Endpoints

An alternative routing model using `RouterFunction`:

```java
@Configuration
public class UserRouter {

    @Bean
    public RouterFunction<ServerResponse> userRoutes(UserHandler handler) {
        return RouterFunctions.route()
                .path("/api/users", builder -> builder
                        .GET("", handler::listUsers)
                        .GET("/{id}", handler::getUser)
                        .POST("", handler::createUser)
                        .PUT("/{id}", handler::updateUser)
                        .DELETE("/{id}", handler::deleteUser))
                .build();
    }
}

@Component
public class UserHandler {

    private final UserService userService;

    public Mono<ServerResponse> getUser(ServerRequest request) {
        String id = request.pathVariable("id");
        return userService.findById(id)
                .flatMap(user -> ServerResponse.ok()
                        .contentType(MediaType.APPLICATION_JSON)
                        .bodyValue(UserDto.from(user)))
                .switchIfEmpty(ServerResponse.notFound().build());
    }

    public Mono<ServerResponse> listUsers(ServerRequest request) {
        int page = request.queryParam("page").map(Integer::parseInt).orElse(0);
        int size = request.queryParam("size").map(Integer::parseInt).orElse(20);

        Flux<UserDto> users = userService.findAll(page, size).map(UserDto::from);
        return ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .body(users, UserDto.class);
    }

    public Mono<ServerResponse> createUser(ServerRequest request) {
        return request.bodyToMono(CreateUserRequest.class)
                .flatMap(userService::create)
                .flatMap(user -> ServerResponse
                        .created(URI.create("/api/users/" + user.getId()))
                        .bodyValue(UserDto.from(user)));
    }

    public Mono<ServerResponse> deleteUser(ServerRequest request) {
        String id = request.pathVariable("id");
        return userService.delete(id)
                .then(ServerResponse.noContent().build());
    }
}
```

## WebClient: Reactive HTTP Client

WebClient replaces `RestTemplate` for non-blocking HTTP calls:

```java
@Configuration
public class WebClientConfig {

    @Bean
    public WebClient paymentServiceClient() {
        return WebClient.builder()
                .baseUrl("https://payment-service:8080")
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .filter(ExchangeFilterFunctions.basicAuthentication("user", "pass"))
                .filter(logRequest())
                .filter(retryFilter())
                .codecs(configurer -> configurer.defaultCodecs()
                        .maxInMemorySize(16 * 1024 * 1024))  // 16MB buffer
                .build();
    }

    private ExchangeFilterFunction logRequest() {
        return ExchangeFilterFunction.ofRequestProcessor(request -> {
            log.debug("Request: {} {}", request.method(), request.url());
            return Mono.just(request);
        });
    }

    private ExchangeFilterFunction retryFilter() {
        return (request, next) -> next.exchange(request)
                .retryWhen(Retry.backoff(3, Duration.ofSeconds(1))
                        .filter(ex -> ex instanceof WebClientResponseException.ServiceUnavailable));
    }
}
```

### Using WebClient

```java
@Service
public class PaymentService {

    private final WebClient paymentClient;

    // GET request
    public Mono<Payment> getPayment(String paymentId) {
        return paymentClient.get()
                .uri("/api/payments/{id}", paymentId)
                .retrieve()
                .onStatus(HttpStatusCode::is4xxClientError,
                        response -> response.bodyToMono(ErrorResponse.class)
                                .flatMap(error -> Mono.error(
                                        new PaymentException(error.getMessage()))))
                .bodyToMono(Payment.class)
                .timeout(Duration.ofSeconds(5));
    }

    // POST request
    public Mono<PaymentResult> processPayment(PaymentRequest request) {
        return paymentClient.post()
                .uri("/api/payments")
                .bodyValue(request)
                .retrieve()
                .bodyToMono(PaymentResult.class);
    }

    // Streaming response
    public Flux<TransactionEvent> streamTransactions(String accountId) {
        return paymentClient.get()
                .uri("/api/accounts/{id}/transactions/stream", accountId)
                .accept(MediaType.TEXT_EVENT_STREAM)
                .retrieve()
                .bodyToFlux(TransactionEvent.class);
    }

    // Parallel calls
    public Mono<OrderEnrichment> enrichOrder(Order order) {
        Mono<Customer> customer = getCustomer(order.getCustomerId());
        Mono<Payment> payment = getPayment(order.getPaymentId());
        Mono<ShippingStatus> shipping = getShipping(order.getShippingId());

        return Mono.zip(customer, payment, shipping)
                .map(tuple -> new OrderEnrichment(
                        order, tuple.getT1(), tuple.getT2(), tuple.getT3()));
    }
}
```

## R2DBC: Reactive Database Access

JDBC is inherently blocking. R2DBC provides a reactive database driver:

### Dependencies

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-r2dbc</artifactId>
</dependency>
<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>r2dbc-postgresql</artifactId>
    <scope>runtime</scope>
</dependency>
```

### Configuration

```yaml
spring:
  r2dbc:
    url: r2dbc:postgresql://localhost:5432/mydb
    username: user
    password: pass
    pool:
      initial-size: 5
      max-size: 20
      max-idle-time: 30m
```

### Reactive Repositories

```java
public interface UserRepository extends ReactiveCrudRepository<User, String> {

    Flux<User> findByStatus(UserStatus status);

    @Query("SELECT * FROM users WHERE email = :email")
    Mono<User> findByEmail(String email);

    @Query("SELECT * FROM users WHERE created_at > :since ORDER BY created_at DESC")
    Flux<User> findRecentUsers(Instant since);

    @Query("SELECT COUNT(*) FROM users WHERE status = :status")
    Mono<Long> countByStatus(UserStatus status);

    Mono<Boolean> existsByEmail(String email);
}
```

### Reactive Service Layer

```java
@Service
public class UserService {

    private final UserRepository userRepository;

    public Mono<User> findById(String id) {
        return userRepository.findById(id);
    }

    public Flux<User> findAll(int page, int size) {
        return userRepository.findAll()
                .skip((long) page * size)
                .take(size);
    }

    public Mono<User> create(CreateUserRequest request) {
        return userRepository.existsByEmail(request.getEmail())
                .flatMap(exists -> {
                    if (exists) {
                        return Mono.error(new DuplicateEmailException(request.getEmail()));
                    }
                    User user = new User();
                    user.setEmail(request.getEmail());
                    user.setDisplayName(request.getDisplayName());
                    user.setStatus(UserStatus.ACTIVE);
                    user.setCreatedAt(Instant.now());
                    return userRepository.save(user);
                });
    }

    public Mono<Void> delete(String id) {
        return userRepository.findById(id)
                .switchIfEmpty(Mono.error(new UserNotFoundException(id)))
                .flatMap(userRepository::delete);
    }
}
```

### R2DBC with DatabaseClient (Complex Queries)

```java
@Repository
public class CustomUserRepository {

    private final DatabaseClient databaseClient;

    public Flux<UserSummary> searchUsers(String query, int limit) {
        return databaseClient.sql("""
                SELECT u.id, u.display_name, u.email, COUNT(o.id) as order_count
                FROM users u
                LEFT JOIN orders o ON o.user_id = u.id
                WHERE u.display_name ILIKE :query OR u.email ILIKE :query
                GROUP BY u.id, u.display_name, u.email
                ORDER BY order_count DESC
                LIMIT :limit
                """)
                .bind("query", "%" + query + "%")
                .bind("limit", limit)
                .map((row, metadata) -> new UserSummary(
                        row.get("id", String.class),
                        row.get("display_name", String.class),
                        row.get("email", String.class),
                        row.get("order_count", Long.class)))
                .all();
    }
}
```

## Backpressure

Backpressure is how a consumer tells a producer to slow down. Without it, a fast producer overwhelms a slow consumer:

```java
// Without backpressure: consumer drowns
Flux.interval(Duration.ofMillis(1))     // 1000 events/sec
    .subscribe(i -> slowProcess(i));    // Can only handle 10/sec → OOM

// With backpressure: controlled flow
Flux.interval(Duration.ofMillis(1))
    .onBackpressureDrop(dropped ->
        log.warn("Dropped event: {}", dropped))
    .subscribe(i -> slowProcess(i));

// Backpressure strategies
flux.onBackpressureBuffer(256)          // Buffer up to 256 elements
flux.onBackpressureDrop()               // Drop excess elements
flux.onBackpressureLatest()             // Keep only the latest
flux.onBackpressureError()              // Signal error on overflow

// Rate limiting
flux.limitRate(100)                     // Request 100 at a time
flux.delayElements(Duration.ofMillis(10)) // Slow down emission
```

## Error Handling Patterns

```java
@Service
public class ResilientService {

    public Mono<Data> getDataWithFallback(String id) {
        return primaryService.getData(id)
                // Timeout
                .timeout(Duration.ofSeconds(3))

                // Retry on transient failures
                .retryWhen(Retry.backoff(3, Duration.ofMillis(500))
                        .maxBackoff(Duration.ofSeconds(5))
                        .filter(ex -> ex instanceof ServiceUnavailableException)
                        .doBeforeRetry(signal ->
                            log.warn("Retrying, attempt {}",
                                signal.totalRetries() + 1)))

                // Fallback to cache
                .onErrorResume(TimeoutException.class,
                        e -> cacheService.getCached(id))

                // Fallback to default
                .onErrorReturn(ServiceUnavailableException.class,
                        Data.defaultValue())

                // Transform errors
                .onErrorMap(DataAccessException.class,
                        e -> new ServiceException("Data access failed", e));
    }
}
```

## Testing Reactive Code

```java
@WebFluxTest(UserController.class)
class UserControllerTest {

    @Autowired
    private WebTestClient webClient;

    @MockBean
    private UserService userService;

    @Test
    void shouldReturnUser() {
        User user = new User("1", "john", "john@example.com");
        when(userService.findById("1")).thenReturn(Mono.just(user));

        webClient.get().uri("/api/users/1")
                .exchange()
                .expectStatus().isOk()
                .expectBody(UserDto.class)
                .value(dto -> {
                    assertThat(dto.getUsername()).isEqualTo("john");
                    assertThat(dto.getEmail()).isEqualTo("john@example.com");
                });
    }

    @Test
    void shouldReturnNotFoundForMissingUser() {
        when(userService.findById("999")).thenReturn(Mono.empty());

        webClient.get().uri("/api/users/999")
                .exchange()
                .expectStatus().isNotFound();
    }

    @Test
    void shouldStreamEvents() {
        Flux<UserEvent> events = Flux.just(
                new UserEvent("CREATED", "user-1"),
                new UserEvent("UPDATED", "user-2"));
        when(userService.getUserEventStream()).thenReturn(events);

        webClient.get().uri("/api/users/stream")
                .accept(MediaType.TEXT_EVENT_STREAM)
                .exchange()
                .expectStatus().isOk()
                .expectBodyList(UserEvent.class).hasSize(2);
    }
}

// StepVerifier for service-level testing
@Test
void shouldCreateUser() {
    Mono<User> result = userService.create(
            new CreateUserRequest("test@example.com", "Test User"));

    StepVerifier.create(result)
            .assertNext(user -> {
                assertThat(user.getEmail()).isEqualTo("test@example.com");
                assertThat(user.getStatus()).isEqualTo(UserStatus.ACTIVE);
            })
            .verifyComplete();
}

@Test
void shouldRejectDuplicateEmail() {
    // First create succeeds
    StepVerifier.create(userService.create(request))
            .expectNextCount(1)
            .verifyComplete();

    // Second create fails
    StepVerifier.create(userService.create(request))
            .expectError(DuplicateEmailException.class)
            .verify();
}
```

## When to Use Reactive (and When Not To)

| Factor | Use WebFlux | Use MVC |
|--------|------------|---------|
| Concurrent connections | Thousands (WebSocket, SSE) | Hundreds |
| I/O pattern | Heavy I/O, little CPU | Mixed I/O and CPU |
| Team experience | Team knows reactive | Team knows imperative |
| Database | R2DBC driver available | JPA/Hibernate (blocking) |
| Libraries | All non-blocking | Some blocking (JDBC, file I/O) |
| Debugging | Harder (async stack traces) | Straightforward |
| Throughput needs | Need maximum I/O throughput | Standard throughput |

The honest truth: most Spring Boot applications do not need WebFlux. If your application makes a few database queries per request and handles hundreds of concurrent users, Spring MVC with its thread-per-request model is simpler, easier to debug, and performs well enough. WebFlux shines when you have thousands of concurrent connections that spend most of their time waiting on I/O — API gateways, streaming services, real-time dashboards, and high-concurrency notification systems. Choosing WebFlux for a CRUD API is choosing complexity without benefit.
