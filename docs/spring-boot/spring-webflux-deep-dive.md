---
title: "Spring WebFlux Deep Dive"
description: "Comprehensive guide to reactive programming with Spring WebFlux — Project Reactor fundamentals, Mono/Flux operators, WebClient for reactive HTTP, R2DBC for reactive database access, functional endpoints, Server-Sent Events, reactive WebSocket, backpressure handling, testing with StepVerifier, and reactive vs imperative decision matrix."
tags: [spring-webflux, reactive, project-reactor, r2dbc, non-blocking]
difficulty: advanced
prerequisites: [spring-boot-fundamentals, java-streams, concurrency-basics]
lastReviewed: "2026-03-25"
---

# Spring WebFlux Deep Dive

Spring WebFlux is the reactive web framework in Spring, built on Project Reactor and the Reactive Streams specification. It runs on non-blocking servers like Netty and provides an alternative to Spring MVC for building high-concurrency, low-latency applications.

## 1. Project Reactor Fundamentals

### 1.1 Mono and Flux

**Mono** represents 0 or 1 element. **Flux** represents 0 to N elements. Both are lazy — nothing happens until a subscriber subscribes.

```java
import reactor.core.publisher.Mono;
import reactor.core.publisher.Flux;

// Mono — single value
Mono<String> mono = Mono.just("hello");
Mono<String> emptyMono = Mono.empty();
Mono<String> errorMono = Mono.error(new RuntimeException("failed"));
Mono<String> deferred = Mono.defer(() -> Mono.just(expensiveCall()));
Mono<String> fromCallable = Mono.fromCallable(() -> blockingService.call());

// Flux — multiple values
Flux<Integer> flux = Flux.just(1, 2, 3, 4, 5);
Flux<Integer> range = Flux.range(1, 100);
Flux<Long> interval = Flux.interval(Duration.ofSeconds(1));
Flux<String> fromIterable = Flux.fromIterable(List.of("a", "b", "c"));
Flux<String> fromStream = Flux.fromStream(() -> Stream.of("x", "y", "z"));
```

### 1.2 Essential Operators

```java
// Map — synchronous transformation
Flux<String> names = Flux.just("alice", "bob", "charlie")
        .map(String::toUpperCase);

// FlatMap — async transformation (returns Publisher)
Flux<User> users = Flux.just(1L, 2L, 3L)
        .flatMap(id -> userRepository.findById(id));  // each returns Mono<User>

// FlatMap with concurrency control
Flux<EnrichedOrder> enriched = orders
        .flatMap(order -> enrichOrder(order), 4);  // max 4 concurrent

// ConcatMap — preserves order (sequential)
Flux<ProcessedItem> sequential = items
        .concatMap(item -> processItem(item));

// Filter
Flux<Order> highValue = orders
        .filter(o -> o.getTotal().compareTo(new BigDecimal("100")) > 0);

// Reduce / Collect
Mono<BigDecimal> total = orders
        .map(Order::getTotal)
        .reduce(BigDecimal.ZERO, BigDecimal::add);

Mono<List<Order>> orderList = orders.collectList();
Mono<Map<String, List<Order>>> grouped = orders
        .collectMultimap(Order::getStatus);

// Zip — combine multiple publishers
Mono<OrderDetails> details = Mono.zip(
        orderService.findById(orderId),
        customerService.findById(customerId),
        inventoryService.checkStock(orderId)
).map(tuple -> new OrderDetails(tuple.getT1(), tuple.getT2(), tuple.getT3()));

// SwitchIfEmpty — fallback when empty
Mono<User> user = cache.findUser(id)
        .switchIfEmpty(database.findUser(id))
        .switchIfEmpty(Mono.error(new UserNotFoundException(id)));

// OnErrorResume — error recovery
Mono<User> resilient = userService.findById(id)
        .onErrorResume(TimeoutException.class,
                ex -> fallbackService.findById(id))
        .onErrorReturn(new User("default"));

// DoOn* — side effects (logging, metrics)
Mono<Order> traced = orderService.process(order)
        .doOnSubscribe(sub -> log.info("Processing order {}", order.getId()))
        .doOnSuccess(result -> log.info("Order {} processed", result.getId()))
        .doOnError(err -> log.error("Order {} failed: {}", order.getId(), err.getMessage()))
        .doFinally(signal -> metrics.recordOrderProcessing(signal));
```

### 1.3 Error Handling

```java
// Retry with backoff
Mono<Response> resilientCall = webClient.get()
        .uri("/api/data")
        .retrieve()
        .bodyToMono(Response.class)
        .retryWhen(Retry.backoff(3, Duration.ofMillis(500))
                .maxBackoff(Duration.ofSeconds(5))
                .filter(ex -> ex instanceof WebClientResponseException.ServiceUnavailable)
                .onRetryExhaustedThrow((spec, signal) ->
                        new ServiceUnavailableException("Service down after retries")));

// Timeout
Mono<Data> withTimeout = dataService.fetchData()
        .timeout(Duration.ofSeconds(3))
        .onErrorResume(TimeoutException.class,
                ex -> Mono.just(Data.defaultValue()));

// Error mapping
Mono<User> mapped = userRepository.findById(id)
        .switchIfEmpty(Mono.error(new UserNotFoundException(id)))
        .onErrorMap(DataAccessException.class,
                ex -> new ServiceException("Database error", ex));
```

### 1.4 Threading and Schedulers

```java
import reactor.core.scheduler.Schedulers;

// publishOn — switches downstream execution to a different scheduler
Flux<ProcessedData> pipeline = source
        .publishOn(Schedulers.boundedElastic())  // I/O work below
        .map(data -> blockingTransform(data))    // runs on elastic
        .publishOn(Schedulers.parallel())        // CPU work below
        .map(data -> computeIntensive(data));    // runs on parallel

// subscribeOn — affects the entire chain from subscription point
Mono<String> blocking = Mono.fromCallable(() -> legacyService.call())
        .subscribeOn(Schedulers.boundedElastic());

// Schedulers overview:
// Schedulers.parallel()       — fixed pool (CPU cores), for CPU-bound work
// Schedulers.boundedElastic() — cached pool, for blocking I/O
// Schedulers.single()         — single thread, for sequential work
// Schedulers.immediate()      — current thread (default for Mono/Flux)
```

## 2. Reactive REST Controllers

### 2.1 Annotated Controllers

```java
@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    @GetMapping
    public Flux<Product> getAllProducts(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return productService.findAll(page, size);
    }

    @GetMapping("/{id}")
    public Mono<ResponseEntity<Product>> getProduct(@PathVariable Long id) {
        return productService.findById(id)
                .map(ResponseEntity::ok)
                .defaultIfEmpty(ResponseEntity.notFound().build());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<Product> createProduct(@Valid @RequestBody Mono<ProductRequest> request) {
        return request
                .map(this::mapToProduct)
                .flatMap(productService::save);
    }

    @PutMapping("/{id}")
    public Mono<ResponseEntity<Product>> updateProduct(
            @PathVariable Long id,
            @Valid @RequestBody ProductRequest request) {
        return productService.findById(id)
                .flatMap(existing -> {
                    existing.setName(request.getName());
                    existing.setPrice(request.getPrice());
                    existing.setUpdatedAt(Instant.now());
                    return productService.save(existing);
                })
                .map(ResponseEntity::ok)
                .defaultIfEmpty(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public Mono<ResponseEntity<Void>> deleteProduct(@PathVariable Long id) {
        return productService.findById(id)
                .flatMap(product -> productService.delete(product)
                        .then(Mono.just(ResponseEntity.noContent().<Void>build())))
                .defaultIfEmpty(ResponseEntity.notFound().build());
    }

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<Product> streamProducts() {
        return productService.streamNewProducts();
    }

    private Product mapToProduct(ProductRequest request) {
        Product product = new Product();
        product.setName(request.getName());
        product.setPrice(request.getPrice());
        product.setCategory(request.getCategory());
        product.setCreatedAt(Instant.now());
        return product;
    }
}
```

### 2.2 Functional Endpoints

```java
@Configuration
public class ProductRouter {

    @Bean
    public RouterFunction<ServerResponse> productRoutes(ProductHandler handler) {
        return RouterFunctions.route()
                .path("/api/v2/products", builder -> builder
                        .GET("", handler::listProducts)
                        .GET("/{id}", handler::getProduct)
                        .POST("", handler::createProduct)
                        .PUT("/{id}", handler::updateProduct)
                        .DELETE("/{id}", handler::deleteProduct)
                        .GET("/search", handler::searchProducts))
                .filter(this::loggingFilter)
                .build();
    }

    private Mono<ServerResponse> loggingFilter(ServerRequest request,
                                                HandlerFunction<ServerResponse> next) {
        long start = System.nanoTime();
        return next.handle(request)
                .doOnSuccess(response -> {
                    long duration = (System.nanoTime() - start) / 1_000_000;
                    log.info("{} {} -> {} ({}ms)",
                            request.method(), request.path(),
                            response.statusCode(), duration);
                });
    }
}

@Component
public class ProductHandler {

    private final ProductService productService;
    private final Validator validator;

    public ProductHandler(ProductService productService, Validator validator) {
        this.productService = productService;
        this.validator = validator;
    }

    public Mono<ServerResponse> listProducts(ServerRequest request) {
        int page = request.queryParam("page").map(Integer::parseInt).orElse(0);
        int size = request.queryParam("size").map(Integer::parseInt).orElse(20);

        Flux<Product> products = productService.findAll(page, size);
        return ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .body(products, Product.class);
    }

    public Mono<ServerResponse> getProduct(ServerRequest request) {
        Long id = Long.parseLong(request.pathVariable("id"));
        return productService.findById(id)
                .flatMap(product -> ServerResponse.ok()
                        .contentType(MediaType.APPLICATION_JSON)
                        .bodyValue(product))
                .switchIfEmpty(ServerResponse.notFound().build());
    }

    public Mono<ServerResponse> createProduct(ServerRequest request) {
        return request.bodyToMono(ProductRequest.class)
                .doOnNext(this::validate)
                .map(this::toProduct)
                .flatMap(productService::save)
                .flatMap(saved -> ServerResponse
                        .created(URI.create("/api/v2/products/" + saved.getId()))
                        .bodyValue(saved));
    }

    public Mono<ServerResponse> updateProduct(ServerRequest request) {
        Long id = Long.parseLong(request.pathVariable("id"));
        return request.bodyToMono(ProductRequest.class)
                .doOnNext(this::validate)
                .flatMap(req -> productService.findById(id)
                        .flatMap(existing -> {
                            existing.setName(req.getName());
                            existing.setPrice(req.getPrice());
                            return productService.save(existing);
                        }))
                .flatMap(updated -> ServerResponse.ok().bodyValue(updated))
                .switchIfEmpty(ServerResponse.notFound().build());
    }

    public Mono<ServerResponse> deleteProduct(ServerRequest request) {
        Long id = Long.parseLong(request.pathVariable("id"));
        return productService.deleteById(id)
                .then(ServerResponse.noContent().build());
    }

    public Mono<ServerResponse> searchProducts(ServerRequest request) {
        String query = request.queryParam("q").orElse("");
        return ServerResponse.ok()
                .body(productService.search(query), Product.class);
    }

    private void validate(ProductRequest request) {
        Set<ConstraintViolation<ProductRequest>> violations = validator.validate(request);
        if (!violations.isEmpty()) {
            throw new ConstraintViolationException(violations);
        }
    }

    private Product toProduct(ProductRequest req) {
        Product p = new Product();
        p.setName(req.getName());
        p.setPrice(req.getPrice());
        p.setCategory(req.getCategory());
        p.setCreatedAt(Instant.now());
        return p;
    }
}
```

## 3. WebClient — Reactive HTTP Client

```java
@Configuration
public class WebClientConfig {

    @Bean
    public WebClient orderServiceClient() {
        return WebClient.builder()
                .baseUrl("http://order-service:8080")
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .filter(ExchangeFilterFunctions.basicAuthentication("user", "pass"))
                .filter(logRequest())
                .filter(logResponse())
                .codecs(configurer -> configurer
                        .defaultCodecs()
                        .maxInMemorySize(16 * 1024 * 1024)) // 16 MB
                .build();
    }

    private ExchangeFilterFunction logRequest() {
        return ExchangeFilterFunction.ofRequestProcessor(request -> {
            log.info("Request: {} {}", request.method(), request.url());
            return Mono.just(request);
        });
    }

    private ExchangeFilterFunction logResponse() {
        return ExchangeFilterFunction.ofResponseProcessor(response -> {
            log.info("Response: {}", response.statusCode());
            return Mono.just(response);
        });
    }
}

@Service
public class OrderServiceClient {

    private final WebClient webClient;

    public OrderServiceClient(@Qualifier("orderServiceClient") WebClient webClient) {
        this.webClient = webClient;
    }

    public Mono<Order> getOrder(Long id) {
        return webClient.get()
                .uri("/api/orders/{id}", id)
                .retrieve()
                .onStatus(HttpStatusCode::is4xxClientError, response ->
                        response.bodyToMono(ErrorResponse.class)
                                .flatMap(error -> Mono.error(
                                        new OrderNotFoundException(id, error.getMessage()))))
                .onStatus(HttpStatusCode::is5xxServerError, response ->
                        Mono.error(new ServiceUnavailableException("Order service down")))
                .bodyToMono(Order.class)
                .timeout(Duration.ofSeconds(5))
                .retryWhen(Retry.backoff(3, Duration.ofMillis(300))
                        .filter(ex -> ex instanceof ServiceUnavailableException));
    }

    public Flux<Order> getOrdersByCustomer(Long customerId) {
        return webClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/api/orders")
                        .queryParam("customerId", customerId)
                        .queryParam("status", "ACTIVE")
                        .build())
                .retrieve()
                .bodyToFlux(Order.class);
    }

    public Mono<Order> createOrder(OrderRequest request) {
        return webClient.post()
                .uri("/api/orders")
                .bodyValue(request)
                .retrieve()
                .bodyToMono(Order.class);
    }

    public Mono<Void> deleteOrder(Long id) {
        return webClient.delete()
                .uri("/api/orders/{id}", id)
                .retrieve()
                .bodyToMono(Void.class);
    }

    // Streaming response
    public Flux<OrderEvent> streamOrderEvents(Long orderId) {
        return webClient.get()
                .uri("/api/orders/{id}/events", orderId)
                .accept(MediaType.TEXT_EVENT_STREAM)
                .retrieve()
                .bodyToFlux(OrderEvent.class);
    }

    // Exchange for full response access
    public Mono<OrderResponse> getOrderWithHeaders(Long id) {
        return webClient.get()
                .uri("/api/orders/{id}", id)
                .exchangeToMono(response -> {
                    String etag = response.headers().header("ETag").stream()
                            .findFirst().orElse(null);
                    return response.bodyToMono(Order.class)
                            .map(order -> new OrderResponse(order, etag,
                                    response.statusCode()));
                });
    }
}
```

## 4. R2DBC — Reactive Database Access

### 4.1 Configuration

```yaml
spring:
  r2dbc:
    url: r2dbc:postgresql://localhost:5432/myapp
    username: app_user
    password: secret
    pool:
      initial-size: 5
      max-size: 20
      max-idle-time: 30m
      validation-query: "SELECT 1"
```

### 4.2 Entity and Repository

```java
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.relational.core.mapping.Table;
import org.springframework.data.relational.core.mapping.Column;

@Table("products")
public class Product {

    @Id
    private Long id;

    private String name;

    private BigDecimal price;

    private String category;

    @Column("is_active")
    private boolean active;

    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    // constructors, getters, setters
}

import org.springframework.data.r2dbc.repository.Query;
import org.springframework.data.r2dbc.repository.R2dbcRepository;

public interface ProductRepository extends R2dbcRepository<Product, Long> {

    Flux<Product> findByCategory(String category);

    Flux<Product> findByActiveTrue();

    @Query("SELECT * FROM products WHERE name ILIKE :query OR category ILIKE :query")
    Flux<Product> search(@Param("query") String query);

    @Query("SELECT * FROM products WHERE price BETWEEN :min AND :max ORDER BY price")
    Flux<Product> findByPriceRange(@Param("min") BigDecimal min,
                                    @Param("max") BigDecimal max);

    @Modifying
    @Query("UPDATE products SET active = false WHERE id = :id")
    Mono<Integer> softDelete(@Param("id") Long id);

    Mono<Long> countByCategory(String category);
}
```

### 4.3 Custom Repository with R2dbcEntityTemplate

```java
@Repository
public class CustomProductRepository {

    private final R2dbcEntityTemplate template;

    public CustomProductRepository(R2dbcEntityTemplate template) {
        this.template = template;
    }

    public Flux<Product> findWithDynamicCriteria(ProductFilter filter) {
        Criteria criteria = Criteria.empty();

        if (filter.getCategory() != null) {
            criteria = criteria.and("category").is(filter.getCategory());
        }
        if (filter.getMinPrice() != null) {
            criteria = criteria.and("price").greaterThanOrEquals(filter.getMinPrice());
        }
        if (filter.getMaxPrice() != null) {
            criteria = criteria.and("price").lessThanOrEquals(filter.getMaxPrice());
        }
        if (filter.isActiveOnly()) {
            criteria = criteria.and("is_active").is(true);
        }

        Query query = Query.query(criteria)
                .sort(Sort.by(Sort.Direction.ASC, "price"))
                .limit(filter.getLimit())
                .offset(filter.getOffset());

        return template.select(Product.class)
                .matching(query)
                .all();
    }

    public Mono<Product> upsert(Product product) {
        if (product.getId() == null) {
            return template.insert(product);
        }
        return template.update(product);
    }
}
```

### 4.4 Reactive Transactions

```java
@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final InventoryRepository inventoryRepository;
    private final TransactionalOperator transactionalOperator;

    public OrderService(OrderRepository orderRepository,
                         InventoryRepository inventoryRepository,
                         TransactionalOperator transactionalOperator) {
        this.orderRepository = orderRepository;
        this.inventoryRepository = inventoryRepository;
        this.transactionalOperator = transactionalOperator;
    }

    public Mono<Order> placeOrder(OrderRequest request) {
        return Flux.fromIterable(request.getItems())
                .flatMap(item -> inventoryRepository.decrementStock(
                        item.getProductId(), item.getQuantity())
                        .filter(updated -> updated > 0)
                        .switchIfEmpty(Mono.error(
                                new InsufficientStockException(item.getProductId()))))
                .then(Mono.defer(() -> {
                    Order order = new Order();
                    order.setCustomerId(request.getCustomerId());
                    order.setItems(request.getItems());
                    order.setStatus(OrderStatus.CONFIRMED);
                    order.setCreatedAt(Instant.now());
                    return orderRepository.save(order);
                }))
                .as(transactionalOperator::transactional);
    }

    // Alternative using @Transactional
    @Transactional
    public Mono<Transfer> transferFunds(Long fromAccountId, Long toAccountId,
                                         BigDecimal amount) {
        return accountRepository.findById(fromAccountId)
                .flatMap(from -> {
                    if (from.getBalance().compareTo(amount) < 0) {
                        return Mono.error(new InsufficientFundsException());
                    }
                    from.setBalance(from.getBalance().subtract(amount));
                    return accountRepository.save(from);
                })
                .flatMap(from -> accountRepository.findById(toAccountId)
                        .flatMap(to -> {
                            to.setBalance(to.getBalance().add(amount));
                            return accountRepository.save(to);
                        })
                        .map(to -> new Transfer(fromAccountId, toAccountId, amount)))
                ;
    }
}
```

## 5. Server-Sent Events (SSE)

```java
@RestController
@RequestMapping("/api/events")
public class SSEController {

    private final Sinks.Many<ServerEvent> eventSink;
    private final Flux<ServerEvent> eventFlux;

    public SSEController() {
        this.eventSink = Sinks.many().multicast().onBackpressureBuffer();
        this.eventFlux = eventSink.asFlux().share();
    }

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<ServerEvent>> streamEvents() {
        return eventFlux.map(event -> ServerSentEvent.<ServerEvent>builder()
                .id(event.getId())
                .event(event.getType())
                .data(event)
                .retry(Duration.ofSeconds(3))
                .build());
    }

    @GetMapping(value = "/notifications/{userId}",
                produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<Notification>> userNotifications(
            @PathVariable Long userId) {
        return eventFlux
                .filter(e -> e.getUserId().equals(userId))
                .map(e -> ServerSentEvent.<Notification>builder()
                        .event("notification")
                        .data(new Notification(e.getTitle(), e.getMessage()))
                        .build())
                .mergeWith(Flux.interval(Duration.ofSeconds(30))
                        .map(i -> ServerSentEvent.<Notification>builder()
                                .event("heartbeat")
                                .comment("keepalive")
                                .build()));
    }

    // Called by other services to push events
    public void publishEvent(ServerEvent event) {
        eventSink.tryEmitNext(event);
    }
}
```

## 6. Reactive WebSocket

```java
@Configuration
public class WebSocketConfig {

    @Bean
    public HandlerMapping webSocketHandlerMapping(ChatWebSocketHandler handler) {
        Map<String, WebSocketHandler> map = Map.of("/ws/chat", handler);
        SimpleUrlHandlerMapping mapping = new SimpleUrlHandlerMapping();
        mapping.setUrlMap(map);
        mapping.setOrder(-1);
        return mapping;
    }

    @Bean
    public WebSocketHandlerAdapter handlerAdapter() {
        return new WebSocketHandlerAdapter();
    }
}

@Component
public class ChatWebSocketHandler implements WebSocketHandler {

    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final Sinks.Many<ChatMessage> chatSink =
            Sinks.many().multicast().onBackpressureBuffer();
    private final ObjectMapper objectMapper;

    public ChatWebSocketHandler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public Mono<Void> handle(WebSocketSession session) {
        String sessionId = session.getId();
        sessions.put(sessionId, session);

        // Inbound: receive messages from this client
        Mono<Void> inbound = session.receive()
                .map(WebSocketMessage::getPayloadAsText)
                .map(this::deserialize)
                .doOnNext(msg -> {
                    msg.setSessionId(sessionId);
                    msg.setTimestamp(Instant.now());
                    chatSink.tryEmitNext(msg);
                })
                .doFinally(signal -> sessions.remove(sessionId))
                .then();

        // Outbound: broadcast messages to this client
        Flux<WebSocketMessage> outbound = chatSink.asFlux()
                .filter(msg -> !msg.getSessionId().equals(sessionId))
                .map(msg -> session.textMessage(serialize(msg)));

        return Mono.zip(inbound, session.send(outbound)).then();
    }

    private ChatMessage deserialize(String json) {
        try {
            return objectMapper.readValue(json, ChatMessage.class);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to deserialize message", e);
        }
    }

    private String serialize(ChatMessage msg) {
        try {
            return objectMapper.writeValueAsString(msg);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize message", e);
        }
    }
}
```

## 7. Backpressure Handling

```java
// Backpressure strategies
Flux<Data> withBackpressure = fastProducer
        .onBackpressureBuffer(256)        // buffer up to 256 items
        .onBackpressureBuffer(256, dropped ->
                log.warn("Dropped: {}", dropped))  // with overflow callback
        .onBackpressureDrop(dropped ->
                log.warn("Dropped: {}", dropped))  // drop oldest
        .onBackpressureLatest();           // keep only latest

// Rate limiting
Flux<Data> rateLimited = source
        .limitRate(100)            // request 100 at a time
        .delayElements(Duration.ofMillis(10));  // slow down emission

// Windowing for batch processing
Flux<List<Data>> batched = source
        .buffer(100)                       // group into lists of 100
        .flatMap(batch -> processBatch(batch), 4);  // 4 concurrent batches

// Window by time
Flux<Flux<Data>> windowed = source
        .window(Duration.ofSeconds(5));    // new window every 5 seconds

// Sample — take latest value in each interval
Flux<Data> sampled = source
        .sample(Duration.ofSeconds(1));    // one item per second
```

## 8. Testing with StepVerifier

```java
import reactor.test.StepVerifier;

class ProductServiceTest {

    @Test
    void findById_returnsProduct() {
        Mono<Product> result = productService.findById(1L);

        StepVerifier.create(result)
                .assertNext(product -> {
                    assertThat(product.getId()).isEqualTo(1L);
                    assertThat(product.getName()).isEqualTo("Widget");
                    assertThat(product.getPrice()).isEqualByComparingTo("29.99");
                })
                .verifyComplete();
    }

    @Test
    void findById_notFound() {
        Mono<Product> result = productService.findById(999L);

        StepVerifier.create(result)
                .verifyComplete(); // empty Mono completes immediately
    }

    @Test
    void findById_error() {
        Mono<Product> result = productService.findById(-1L);

        StepVerifier.create(result)
                .expectError(IllegalArgumentException.class)
                .verify();
    }

    @Test
    void findAll_returnsMultipleProducts() {
        Flux<Product> result = productService.findByCategory("electronics");

        StepVerifier.create(result)
                .expectNextCount(3)
                .verifyComplete();
    }

    @Test
    void streamProducts_emitsOverTime() {
        Flux<Product> stream = productService.streamNewProducts()
                .take(3);

        StepVerifier.withVirtualTime(() -> stream)
                .thenAwait(Duration.ofSeconds(3))
                .expectNextCount(3)
                .verifyComplete();
    }

    @Test
    void placeOrder_transactional() {
        OrderRequest request = new OrderRequest(1L, List.of(
                new OrderItem(101L, 2),
                new OrderItem(102L, 1)
        ));

        StepVerifier.create(orderService.placeOrder(request))
                .assertNext(order -> {
                    assertThat(order.getStatus()).isEqualTo(OrderStatus.CONFIRMED);
                    assertThat(order.getCustomerId()).isEqualTo(1L);
                })
                .verifyComplete();
    }
}
```

### 8.1 WebTestClient

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ProductControllerTest {

    @Autowired
    private WebTestClient webTestClient;

    @Test
    void getProduct_found() {
        webTestClient.get()
                .uri("/api/products/1")
                .exchange()
                .expectStatus().isOk()
                .expectBody(Product.class)
                .value(product -> {
                    assertThat(product.getName()).isEqualTo("Widget");
                    assertThat(product.getPrice()).isEqualByComparingTo("29.99");
                });
    }

    @Test
    void getProduct_notFound() {
        webTestClient.get()
                .uri("/api/products/999")
                .exchange()
                .expectStatus().isNotFound();
    }

    @Test
    void createProduct() {
        ProductRequest request = new ProductRequest("New Product",
                new BigDecimal("49.99"), "electronics");

        webTestClient.post()
                .uri("/api/products")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(request)
                .exchange()
                .expectStatus().isCreated()
                .expectBody(Product.class)
                .value(product -> {
                    assertThat(product.getId()).isNotNull();
                    assertThat(product.getName()).isEqualTo("New Product");
                });
    }

    @Test
    void streamProducts_sse() {
        webTestClient.get()
                .uri("/api/products/stream")
                .accept(MediaType.TEXT_EVENT_STREAM)
                .exchange()
                .expectStatus().isOk()
                .returnResult(Product.class)
                .getResponseBody()
                .take(3)
                .as(StepVerifier::create)
                .expectNextCount(3)
                .verifyComplete();
    }
}
```

## 9. Reactive vs Imperative Decision Matrix

```
┌──────────────────────────┬────────────────────┬─────────────────────┐
│ Criterion                │ Spring MVC         │ Spring WebFlux      │
│                          │ (Imperative)       │ (Reactive)          │
├──────────────────────────┼────────────────────┼─────────────────────┤
│ I/O Pattern              │ Blocking OK        │ Non-blocking needed │
│ Concurrency Model        │ Thread-per-request │ Event loop          │
│ Throughput (high I/O)    │ Limited by threads │ Scales with events  │
│ Latency                  │ Consistent         │ Lower P99 at scale  │
│ CPU-bound Work           │ Good fit           │ No benefit          │
│ Debugging                │ Straightforward    │ Complex stack traces│
│ Learning Curve           │ Low                │ High                │
│ JDBC/JPA Support         │ Native             │ R2DBC only          │
│ Ecosystem Maturity       │ Very mature        │ Growing             │
│ Testing                  │ Simple             │ StepVerifier needed │
│ Memory Usage             │ Higher (threads)   │ Lower               │
│ Team Experience          │ Usually available  │ Less common         │
├──────────────────────────┼────────────────────┼─────────────────────┤
│ Best For                 │ CRUD apps, simple  │ High-concurrency    │
│                          │ REST APIs, admin   │ streaming, gateways,│
│                          │ panels, internal   │ real-time feeds,    │
│                          │ tools              │ IoT backends        │
└──────────────────────────┴────────────────────┴─────────────────────┘
```

### When to Choose WebFlux

1. **High concurrency with I/O-bound work** — thousands of concurrent connections doing network calls, database queries, or file I/O.
2. **Streaming data** — SSE, WebSocket, real-time feeds where you produce data continuously.
3. **Gateway/proxy services** — API gateways that primarily route and transform requests.
4. **Microservice composition** — services that call multiple downstream services and aggregate results.

### When to Stay with MVC

1. **CRUD applications** — traditional request-response with JDBC/JPA.
2. **CPU-bound processing** — reactive adds overhead without benefit.
3. **Team familiarity** — reactive has a steep learning curve; incorrect usage leads to subtle bugs.
4. **Blocking dependencies** — if most of your stack is blocking (JDBC, legacy libs), wrapping everything in `Schedulers.boundedElastic()` defeats the purpose.

The reactive stack delivers its biggest advantages when the entire call chain is non-blocking. Mixing blocking calls into a reactive pipeline requires careful scheduler management and can negate the performance benefits. Choose reactive when you have a concrete scalability requirement that justifies the additional complexity.
