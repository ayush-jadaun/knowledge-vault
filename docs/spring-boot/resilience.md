---
title: "Resilience Patterns"
description: "Complete guide to resilience patterns in Spring Boot with Resilience4j — circuit breaker configuration and state transitions, retry with exponential backoff, bulkhead for isolation, rate limiter, time limiter, fallback patterns, combining decorators, and monitoring"
tags: [spring-boot, resilience4j, circuit-breaker, retry, fault-tolerance]
difficulty: advanced
prerequisites: []
lastReviewed: "2026-03-25"
---

# Resilience Patterns

In a distributed system, failure is not a possibility — it is a certainty. Services go down, networks partition, databases become slow, third-party APIs return errors. Without resilience patterns, a single failing dependency cascades through your entire system: Service A calls Service B, which calls Service C. Service C is slow, so Service B's thread pool fills up waiting, and then Service A's thread pool fills up waiting on B. Within minutes, your entire platform is down because one downstream service had a bad day.

Resilience4j is the standard resilience library for Spring Boot. It provides circuit breakers, retries, bulkheads, rate limiters, and time limiters as composable decorators that wrap your service calls.

## The Five Resilience Patterns

```
┌──────────────────────────────────────────────────────────────┐
│                    Your Service Call                           │
│                                                               │
│  ┌───────────┐   ┌───────┐   ┌──────────┐   ┌────────────┐ │
│  │ Circuit    │ → │ Retry │ → │ Bulkhead  │ → │ Time       │ │
│  │ Breaker    │   │       │   │           │   │ Limiter    │ │
│  │            │   │       │   │           │   │            │ │
│  │ Stop calls │   │ Retry │   │ Limit     │   │ Timeout    │ │
│  │ to failing │   │ on    │   │ concurrent│   │ slow calls │ │
│  │ services   │   │ error │   │ calls     │   │            │ │
│  └───────────┘   └───────┘   └──────────┘   └────────────┘ │
│                                                               │
│  ┌───────────┐                                                │
│  │ Rate       │   Controls request throughput                  │
│  │ Limiter    │   (different from API rate limiting)           │
│  └───────────┘                                                │
└──────────────────────────────────────────────────────────────┘
```

## Setup

```xml
<dependency>
    <groupId>io.github.resilience4j</groupId>
    <artifactId>resilience4j-spring-boot3</artifactId>
    <version>2.2.0</version>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-aop</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

## Circuit Breaker

The circuit breaker pattern prevents repeated calls to a failing service. It tracks success and failure rates and "trips" when failures exceed a threshold:

```
State Transitions:
──────────────────

    ┌────────────────────────────────────────────┐
    │                                            │
    ▼                                            │
┌────────┐     failure rate      ┌────────┐     │
│ CLOSED  │ ──── > threshold ──→ │  OPEN   │     │
│         │                      │         │     │
│ Calls   │                      │ Calls   │     │
│ pass    │                      │ fail    │     │
│ through │                      │ fast    │     │
└────────┘                      └────┬───┘     │
    ▲                                │          │
    │                          wait duration    │
    │                                │          │
    │          success         ┌─────▼────┐    │
    │       rate > threshold   │HALF-OPEN  │    │
    └──────────────────────────│           │────┘
                               │ Limited   │  failure rate
                               │ calls     │  > threshold
                               │ allowed   │
                               └──────────┘
```

### Configuration

```yaml
resilience4j:
  circuitbreaker:
    instances:
      paymentService:
        register-health-indicator: true
        sliding-window-type: COUNT_BASED
        sliding-window-size: 10           # Last 10 calls
        minimum-number-of-calls: 5        # Need 5 calls before evaluating
        failure-rate-threshold: 50        # Trip at 50% failure rate
        wait-duration-in-open-state: 30s  # Wait 30s before half-open
        permitted-number-of-calls-in-half-open-state: 3  # Allow 3 test calls
        slow-call-duration-threshold: 3s  # Calls > 3s count as slow
        slow-call-rate-threshold: 80      # Trip at 80% slow call rate
        record-exceptions:
          - java.io.IOException
          - java.util.concurrent.TimeoutException
          - org.springframework.web.client.HttpServerErrorException
        ignore-exceptions:
          - com.example.BusinessValidationException

      inventoryService:
        sliding-window-type: TIME_BASED
        sliding-window-size: 60           # Last 60 seconds
        minimum-number-of-calls: 10
        failure-rate-threshold: 60
        wait-duration-in-open-state: 60s
```

### Annotation-Based Usage

```java
@Service
@Slf4j
public class PaymentService {

    private final WebClient paymentClient;

    @CircuitBreaker(name = "paymentService", fallbackMethod = "paymentFallback")
    public PaymentResult processPayment(PaymentRequest request) {
        return paymentClient.post()
                .uri("/api/payments")
                .bodyValue(request)
                .retrieve()
                .bodyToMono(PaymentResult.class)
                .block(Duration.ofSeconds(5));
    }

    /**
     * Fallback method — must have same return type
     * and accept the exception as last parameter.
     */
    private PaymentResult paymentFallback(PaymentRequest request, Throwable t) {
        log.warn("Payment circuit breaker fallback for order {}: {}",
                request.getOrderId(), t.getMessage());

        if (t instanceof CallNotPermittedException) {
            // Circuit is OPEN — don't even try
            return PaymentResult.deferred(request.getOrderId(),
                    "Payment service temporarily unavailable. " +
                    "Your payment will be processed when service recovers.");
        }

        // Actual failure — queue for retry
        paymentRetryQueue.enqueue(request);
        return PaymentResult.queued(request.getOrderId(),
                "Payment queued for processing.");
    }
}
```

### Programmatic Usage

```java
@Service
public class InventoryService {

    private final CircuitBreakerRegistry circuitBreakerRegistry;
    private final WebClient inventoryClient;

    public StockLevel checkStock(String productId) {
        CircuitBreaker cb = circuitBreakerRegistry.circuitBreaker("inventoryService");

        Supplier<StockLevel> decorated = CircuitBreaker.decorateSupplier(cb, () ->
            inventoryClient.get()
                    .uri("/api/inventory/{id}", productId)
                    .retrieve()
                    .bodyToMono(StockLevel.class)
                    .block(Duration.ofSeconds(3))
        );

        return Try.ofSupplier(decorated)
                .recover(CallNotPermittedException.class,
                        e -> StockLevel.unknown(productId))
                .recover(TimeoutException.class,
                        e -> StockLevel.unknown(productId))
                .get();
    }
}
```

## Retry

Retry handles transient failures — network blips, temporary unavailability, optimistic locking conflicts:

```yaml
resilience4j:
  retry:
    instances:
      paymentService:
        max-attempts: 3
        wait-duration: 1s
        enable-exponential-backoff: true
        exponential-backoff-multiplier: 2    # 1s, 2s, 4s
        retry-exceptions:
          - java.io.IOException
          - java.util.concurrent.TimeoutException
        ignore-exceptions:
          - com.example.BusinessValidationException

      emailService:
        max-attempts: 5
        wait-duration: 2s
        enable-exponential-backoff: true
        exponential-backoff-multiplier: 3
        max-wait-duration: 30s               # Cap the backoff
```

```java
@Service
public class NotificationService {

    @Retry(name = "emailService", fallbackMethod = "emailFallback")
    public void sendEmail(String to, String subject, String body) {
        emailClient.send(to, subject, body);
    }

    private void sendEmailFallback(String to, String subject, String body,
                                    Throwable t) {
        log.error("Email sending failed after all retries: to={}, subject={}, error={}",
                to, subject, t.getMessage());
        // Queue for later delivery
        failedEmailQueue.enqueue(new FailedEmail(to, subject, body, Instant.now()));
    }
}
```

### Retry with Result Predicate

Retry not only on exceptions, but also on specific results:

```java
@Bean
public RetryConfig customRetryConfig() {
    return RetryConfig.custom()
            .maxAttempts(3)
            .waitDuration(Duration.ofSeconds(1))
            .retryOnResult(response -> {
                if (response instanceof HttpResponse r) {
                    return r.getStatusCode() == 429  // Retry on rate limit
                            || r.getStatusCode() == 503; // Retry on unavailable
                }
                return false;
            })
            .retryExceptions(IOException.class, TimeoutException.class)
            .ignoreExceptions(BusinessException.class)
            .build();
}
```

## Bulkhead

Bulkhead limits concurrent calls to a downstream service, preventing one slow service from consuming all threads:

```
Without Bulkhead:                    With Bulkhead:
───────────────────                  ────────────────
Thread pool: 200 threads             Thread pool: 200 threads

Payment API (slow):                  Payment API (slow):
  Uses 180 threads waiting             Limited to 20 threads (bulkhead)

Inventory API:                       Inventory API:
  Can only use 20 remaining            Has 180 threads available

Result: Inventory calls fail!        Result: Inventory calls work fine!
```

```yaml
resilience4j:
  bulkhead:
    instances:
      paymentService:
        max-concurrent-calls: 20      # Max 20 concurrent calls
        max-wait-duration: 500ms      # Wait max 500ms to acquire permit

  thread-pool-bulkhead:
    instances:
      reportService:
        max-thread-pool-size: 10      # Dedicated thread pool
        core-thread-pool-size: 5
        queue-capacity: 20
        keep-alive-duration: 60s
```

```java
@Service
public class ReportService {

    @Bulkhead(name = "reportService", type = Bulkhead.Type.THREADPOOL,
              fallbackMethod = "reportFallback")
    public CompletableFuture<Report> generateReport(ReportRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            // Expensive report generation
            return reportEngine.generate(request);
        });
    }

    private CompletableFuture<Report> reportFallback(ReportRequest request,
                                                      Throwable t) {
        log.warn("Report generation bulkhead full: {}", t.getMessage());
        return CompletableFuture.completedFuture(
                Report.queued("Report queued. You will be notified when ready."));
    }
}
```

## Time Limiter

Enforces a timeout on async operations:

```yaml
resilience4j:
  timelimiter:
    instances:
      paymentService:
        timeout-duration: 3s
        cancel-running-future: true
```

```java
@Service
public class PaymentService {

    @TimeLimiter(name = "paymentService", fallbackMethod = "timeoutFallback")
    @CircuitBreaker(name = "paymentService", fallbackMethod = "circuitBreakerFallback")
    public CompletableFuture<PaymentResult> processPaymentAsync(PaymentRequest request) {
        return CompletableFuture.supplyAsync(() ->
                paymentGateway.charge(request));
    }

    private CompletableFuture<PaymentResult> timeoutFallback(
            PaymentRequest request, TimeoutException t) {
        log.warn("Payment timed out for order {}", request.getOrderId());
        return CompletableFuture.completedFuture(
                PaymentResult.timeout(request.getOrderId()));
    }
}
```

## Combining Decorators

The order in which you apply decorators matters. The recommended order:

```
Retry ( CircuitBreaker ( RateLimiter ( TimeLimiter ( Bulkhead ( Function ) ) ) ) )

Outermost                                                        Innermost
```

Retry wraps circuit breaker because you want to retry when the circuit allows calls, not retry when the circuit is open.

### Annotation Order

```java
@Service
public class OrderService {

    @Bulkhead(name = "orderService")
    @TimeLimiter(name = "orderService")
    @CircuitBreaker(name = "orderService", fallbackMethod = "fallback")
    @Retry(name = "orderService")
    public CompletableFuture<Order> createOrder(OrderRequest request) {
        return CompletableFuture.supplyAsync(() ->
                orderGateway.submit(request));
    }

    private CompletableFuture<Order> fallback(OrderRequest request, Throwable t) {
        log.error("Order creation failed after all resilience measures: {}",
                t.getMessage());
        return CompletableFuture.completedFuture(
                Order.failed(request, "Service temporarily unavailable"));
    }
}
```

### Programmatic Composition

```java
@Service
public class ResilientPaymentService {

    private final CircuitBreaker circuitBreaker;
    private final Retry retry;
    private final Bulkhead bulkhead;
    private final TimeLimiter timeLimiter;

    public PaymentResult processPayment(PaymentRequest request) {
        // Compose decorators
        Supplier<PaymentResult> supplier = () -> paymentGateway.charge(request);

        Supplier<PaymentResult> decorated = Decorators.ofSupplier(supplier)
                .withBulkhead(bulkhead)
                .withTimeLimiter(timeLimiter, Executors.newSingleThreadScheduledExecutor())
                .withCircuitBreaker(circuitBreaker)
                .withRetry(retry)
                .withFallback(List.of(
                        CallNotPermittedException.class,
                        TimeoutException.class,
                        BulkheadFullException.class),
                        e -> PaymentResult.deferred(request.getOrderId()))
                .decorate();

        return Try.ofSupplier(decorated).get();
    }
}
```

## Event Listeners and Monitoring

### Circuit Breaker Events

```java
@Component
public class CircuitBreakerEventListener {

    private final MeterRegistry meterRegistry;

    @PostConstruct
    public void registerEventListeners(CircuitBreakerRegistry registry) {
        registry.getAllCircuitBreakers().forEach(cb -> {
            cb.getEventPublisher()
                    .onStateTransition(event -> {
                        log.warn("Circuit breaker '{}' state: {} → {}",
                                event.getCircuitBreakerName(),
                                event.getStateTransition().getFromState(),
                                event.getStateTransition().getToState());

                        meterRegistry.counter("circuit_breaker.state_transition",
                                "name", event.getCircuitBreakerName(),
                                "from", event.getStateTransition().getFromState().name(),
                                "to", event.getStateTransition().getToState().name())
                                .increment();

                        if (event.getStateTransition().getToState() ==
                                CircuitBreaker.State.OPEN) {
                            alertingService.alert("Circuit breaker OPEN: "
                                    + event.getCircuitBreakerName());
                        }
                    })
                    .onError(event ->
                            log.debug("Circuit breaker '{}' error: {}",
                                    event.getCircuitBreakerName(),
                                    event.getThrowable().getMessage()))
                    .onSuccess(event ->
                            log.trace("Circuit breaker '{}' success in {}ms",
                                    event.getCircuitBreakerName(),
                                    event.getElapsedDuration().toMillis()));
        });
    }
}
```

### Actuator Integration

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,circuitbreakers,retries,bulkheads
  health:
    circuitbreakers:
      enabled: true
  endpoint:
    health:
      show-details: always
```

This exposes:
```
GET /actuator/circuitbreakers
GET /actuator/circuitbreakerevents
GET /actuator/retries
GET /actuator/retryevents
GET /actuator/bulkheads
```

## Fallback Strategy Matrix

| Scenario | Fallback Strategy |
|----------|-------------------|
| Read data from cache | Return cached value, mark as stale |
| Write operation | Queue for later processing (outbox) |
| Non-critical enrichment | Return partial response without enrichment |
| Payment processing | Return "processing" status, complete async |
| External API aggregation | Return available data, skip failed sources |
| Authentication service | Allow cached tokens, reject new logins |

## Testing Resilience

```java
@SpringBootTest
class PaymentServiceResilienceTest {

    @Autowired
    private PaymentService paymentService;

    @Autowired
    private CircuitBreakerRegistry circuitBreakerRegistry;

    @MockBean
    private PaymentGateway paymentGateway;

    @Test
    void shouldOpenCircuitAfterFailures() {
        // Arrange: gateway always fails
        when(paymentGateway.charge(any()))
                .thenThrow(new RuntimeException("Connection refused"));

        CircuitBreaker cb = circuitBreakerRegistry.circuitBreaker("paymentService");

        // Act: make enough calls to trip the breaker
        for (int i = 0; i < 10; i++) {
            try {
                paymentService.processPayment(testRequest());
            } catch (Exception ignored) {}
        }

        // Assert: circuit should be open
        assertThat(cb.getState()).isEqualTo(CircuitBreaker.State.OPEN);
    }

    @Test
    void shouldReturnFallbackWhenCircuitOpen() {
        CircuitBreaker cb = circuitBreakerRegistry.circuitBreaker("paymentService");
        cb.transitionToOpenState(); // Force open

        PaymentResult result = paymentService.processPayment(testRequest());

        assertThat(result.getStatus()).isEqualTo(PaymentStatus.DEFERRED);
        verify(paymentGateway, never()).charge(any()); // Never called
    }

    @Test
    void shouldRetryOnTransientFailure() {
        when(paymentGateway.charge(any()))
                .thenThrow(new IOException("Connection reset"))
                .thenThrow(new IOException("Connection reset"))
                .thenReturn(PaymentResult.success("PAY-123"));

        PaymentResult result = paymentService.processPayment(testRequest());

        assertThat(result.isSuccess()).isTrue();
        verify(paymentGateway, times(3)).charge(any()); // Called 3 times
    }
}
```

Resilience patterns are insurance against the inevitable failures of distributed systems. The circuit breaker prevents cascade failures, retry handles transient errors, bulkhead prevents resource exhaustion, and time limiter prevents indefinite waiting. Apply them to every external dependency — databases, APIs, message brokers, caches — and always provide a meaningful fallback. The goal is not to prevent failures but to contain them so your system degrades gracefully instead of collapsing entirely.
