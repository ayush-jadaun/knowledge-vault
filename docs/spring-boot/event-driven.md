---
title: "Event-Driven Architecture"
description: "Complete guide to event-driven architecture in Spring Boot — ApplicationEvent and custom events, @EventListener and @TransactionalEventListener, async event handling, Spring Cloud Stream with Kafka/RabbitMQ, the transactional outbox pattern, and event sourcing fundamentals"
tags: [spring-boot, events, event-driven, async, architecture]
difficulty: advanced
prerequisites: []
lastReviewed: "2026-03-25"
---

# Event-Driven Architecture

In a traditional request-driven architecture, services call each other directly. Service A needs something from Service B, so it makes an HTTP call. This creates temporal coupling (both services must be running), behavioral coupling (A must know B's API), and cascading failure risk (if B is slow, A is slow). Event-driven architecture inverts this relationship: instead of telling other services what to do, a service announces what happened. Interested parties react to those announcements on their own terms, at their own pace.

Spring Boot provides event support at three levels: in-process application events (Spring's `ApplicationEvent`), transactional event listeners that coordinate with database transactions, and Spring Cloud Stream for distributed messaging across services via Kafka, RabbitMQ, or other brokers.

## In-Process Events with ApplicationEvent

### Custom Domain Events

```java
// Base event class with common metadata
public abstract class DomainEvent {
    private final String eventId;
    private final Instant occurredAt;
    private final String triggeredBy;

    protected DomainEvent(String triggeredBy) {
        this.eventId = UUID.randomUUID().toString();
        this.occurredAt = Instant.now();
        this.triggeredBy = triggeredBy;
    }

    // getters
}

// Concrete event
public class OrderPlacedEvent extends DomainEvent {
    private final String orderId;
    private final String customerId;
    private final BigDecimal totalAmount;
    private final List<OrderLineItem> items;

    public OrderPlacedEvent(String triggeredBy, String orderId,
                            String customerId, BigDecimal totalAmount,
                            List<OrderLineItem> items) {
        super(triggeredBy);
        this.orderId = orderId;
        this.customerId = customerId;
        this.totalAmount = totalAmount;
        this.items = List.copyOf(items); // Immutable snapshot
    }

    // getters
}

public class OrderCancelledEvent extends DomainEvent {
    private final String orderId;
    private final String reason;
    private final BigDecimal refundAmount;

    public OrderCancelledEvent(String triggeredBy, String orderId,
                               String reason, BigDecimal refundAmount) {
        super(triggeredBy);
        this.orderId = orderId;
        this.reason = reason;
        this.refundAmount = refundAmount;
    }
}

public class PaymentCompletedEvent extends DomainEvent {
    private final String paymentId;
    private final String orderId;
    private final BigDecimal amount;
    private final String paymentMethod;

    // constructor, getters
}
```

### Publishing Events

```java
@Service
@Transactional
public class OrderService {

    private final OrderRepository orderRepository;
    private final ApplicationEventPublisher eventPublisher;

    public OrderService(OrderRepository orderRepository,
                        ApplicationEventPublisher eventPublisher) {
        this.orderRepository = orderRepository;
        this.eventPublisher = eventPublisher;
    }

    public Order placeOrder(CreateOrderRequest request, String userId) {
        // Business logic
        Order order = new Order();
        order.setCustomerId(userId);
        order.setItems(request.getItems().stream()
                .map(this::toOrderLineItem)
                .toList());
        order.setTotalAmount(calculateTotal(order.getItems()));
        order.setStatus(OrderStatus.PLACED);

        Order saved = orderRepository.save(order);

        // Publish event — listeners will react
        eventPublisher.publishEvent(new OrderPlacedEvent(
                userId,
                saved.getId(),
                saved.getCustomerId(),
                saved.getTotalAmount(),
                saved.getItems()
        ));

        return saved;
    }

    public void cancelOrder(String orderId, String reason, String userId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));

        if (!order.isCancellable()) {
            throw new IllegalStateException(
                    "Order in status " + order.getStatus() + " cannot be cancelled");
        }

        order.setStatus(OrderStatus.CANCELLED);
        order.setCancelReason(reason);
        orderRepository.save(order);

        eventPublisher.publishEvent(new OrderCancelledEvent(
                userId, orderId, reason, order.getTotalAmount()));
    }
}
```

### Listening to Events

```java
@Component
@Slf4j
public class OrderEventListeners {

    private final InventoryService inventoryService;
    private final NotificationService notificationService;
    private final AnalyticsService analyticsService;

    // Constructor injection...

    /**
     * Synchronous listener — runs in the same thread and transaction
     * as the publisher. If this throws, the transaction rolls back.
     */
    @EventListener
    public void onOrderPlaced(OrderPlacedEvent event) {
        log.info("Order placed: {} by customer {}",
                event.getOrderId(), event.getCustomerId());

        // Reserve inventory (must succeed for order to commit)
        for (OrderLineItem item : event.getItems()) {
            inventoryService.reserve(item.getProductId(), item.getQuantity());
        }
    }

    /**
     * Conditional listener — only fires when the condition is true
     */
    @EventListener(condition = "#event.totalAmount.compareTo(T(java.math.BigDecimal).valueOf(1000)) > 0")
    public void onHighValueOrder(OrderPlacedEvent event) {
        log.info("High-value order detected: {} amount={}",
                event.getOrderId(), event.getTotalAmount());
        notificationService.notifySalesTeam(event);
    }

    /**
     * Listener that produces another event
     */
    @EventListener
    public InventoryReservedEvent handleAndChain(OrderPlacedEvent event) {
        // Return value becomes a new event
        return new InventoryReservedEvent(event.getOrderId());
    }
}
```

## @TransactionalEventListener

The critical distinction: `@EventListener` runs **inside** the publisher's transaction. `@TransactionalEventListener` runs **after** the transaction commits (by default). This matters enormously:

```
@EventListener                         @TransactionalEventListener
──────────────                         ────────────────────────────
Runs inside the transaction            Runs after the transaction
If listener throws, order rolls back   Order is already committed
Sees uncommitted data                  Sees committed data
Good for: validation, reservations     Good for: notifications, emails, analytics
```

```java
@Component
public class PostTransactionListeners {

    /**
     * AFTER_COMMIT (default) — runs only if the transaction committed.
     * The order is in the database. Safe to send notifications.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void sendOrderConfirmation(OrderPlacedEvent event) {
        notificationService.sendOrderConfirmationEmail(
                event.getCustomerId(), event.getOrderId());
    }

    /**
     * AFTER_ROLLBACK — runs only if the transaction rolled back.
     * Useful for cleanup or alerting.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_ROLLBACK)
    public void handleOrderFailure(OrderPlacedEvent event) {
        log.error("Order placement failed for customer {}",
                event.getCustomerId());
        alertingService.orderPlacementFailed(event);
    }

    /**
     * AFTER_COMPLETION — runs regardless of commit or rollback.
     * Useful for releasing resources.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMPLETION)
    public void cleanup(OrderPlacedEvent event) {
        temporaryResourceManager.release(event.getOrderId());
    }

    /**
     * BEFORE_COMMIT — runs inside the transaction, before commit.
     * Similar to @EventListener but with explicit phase control.
     */
    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void auditBeforeCommit(OrderPlacedEvent event) {
        auditService.recordOrderPlaced(event);
    }
}
```

### Pitfall: AFTER_COMMIT and Exceptions

If an `AFTER_COMMIT` listener throws an exception, the transaction is already committed. The exception propagates to the caller, but the database change is **not** rolled back. This is a common source of confusion:

```java
@TransactionalEventListener
public void riskyListener(OrderPlacedEvent event) {
    // If this throws, the order is STILL in the database.
    // The caller gets an exception, which may confuse them.
    externalPaymentService.charge(event); // Can fail!
}
```

**Solution:** Make AFTER_COMMIT listeners resilient:

```java
@TransactionalEventListener
public void safeListener(OrderPlacedEvent event) {
    try {
        externalPaymentService.charge(event);
    } catch (Exception e) {
        log.error("Payment failed for order {}. Will retry via scheduler.",
                event.getOrderId(), e);
        failedPaymentQueue.enqueue(event.getOrderId());
    }
}
```

## Async Event Processing

By default, all event listeners run synchronously in the publisher's thread. For non-critical processing (analytics, notifications), async execution is better:

```java
@Configuration
@EnableAsync
public class AsyncConfig implements AsyncConfigurer {

    @Override
    @Bean(name = "eventExecutor")
    public Executor getAsyncExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(5);
        executor.setMaxPoolSize(20);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("event-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        executor.initialize();
        return executor;
    }
}
```

```java
@Component
public class AsyncEventListeners {

    /**
     * Runs in a separate thread from the event executor pool.
     * Does NOT participate in the publisher's transaction.
     */
    @Async("eventExecutor")
    @TransactionalEventListener
    public void sendEmailAsync(OrderPlacedEvent event) {
        emailService.sendOrderConfirmation(event.getCustomerId(), event.getOrderId());
    }

    @Async("eventExecutor")
    @EventListener
    public void trackAnalytics(OrderPlacedEvent event) {
        analyticsService.trackOrderPlaced(event);
    }
}
```

## Spring Cloud Stream

For distributed event-driven architectures where events cross service boundaries, Spring Cloud Stream provides an abstraction over message brokers:

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│ Order Service │       │  Message      │       │ Inventory    │
│               │       │  Broker       │       │ Service      │
│  Producer ────────→   │  (Kafka /     │  ────→│  Consumer    │
│               │       │   RabbitMQ)   │       │              │
└──────────────┘       └──────────────┘       └──────────────┘
```

### Dependencies

```xml
<!-- For Kafka -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-stream-binder-kafka</artifactId>
</dependency>

<!-- For RabbitMQ -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-stream-binder-rabbit</artifactId>
</dependency>
```

### Functional Programming Model

Spring Cloud Stream 4.x uses functional interfaces (`Supplier`, `Function`, `Consumer`):

```java
@Configuration
public class StreamConfig {

    /**
     * Consumer: reads from "orders-in-0" binding
     */
    @Bean
    public Consumer<OrderPlacedEvent> processOrder() {
        return event -> {
            log.info("Processing order: {}", event.getOrderId());
            inventoryService.reserve(event.getItems());
        };
    }

    /**
     * Function: reads from "payments-in-0", writes to "notifications-out-0"
     */
    @Bean
    public Function<PaymentCompletedEvent, NotificationEvent> processPayment() {
        return payment -> {
            log.info("Payment completed: {}", payment.getPaymentId());
            return new NotificationEvent(
                    payment.getCustomerId(),
                    "Payment of " + payment.getAmount() + " received",
                    NotificationType.PAYMENT_CONFIRMED
            );
        };
    }

    /**
     * Supplier: produces events (e.g., scheduled)
     */
    @Bean
    public Supplier<Flux<HeartbeatEvent>> heartbeat() {
        return () -> Flux.interval(Duration.ofSeconds(30))
                .map(tick -> new HeartbeatEvent("order-service", Instant.now()));
    }
}
```

### Configuration

```yaml
spring:
  cloud:
    stream:
      bindings:
        processOrder-in-0:
          destination: orders
          group: inventory-service
          content-type: application/json
        processPayment-in-0:
          destination: payments
          group: notification-service
        processPayment-out-0:
          destination: notifications
      kafka:
        binder:
          brokers: kafka-broker:9092
          auto-create-topics: true
          replication-factor: 3
        bindings:
          processOrder-in-0:
            consumer:
              start-offset: latest
              enable-dlq: true
              dlq-name: orders-dlq
              max-attempts: 3
  function:
    definition: processOrder;processPayment
```

### Publishing Messages with StreamBridge

```java
@Service
public class OrderEventPublisher {

    private final StreamBridge streamBridge;

    public OrderEventPublisher(StreamBridge streamBridge) {
        this.streamBridge = streamBridge;
    }

    public void publishOrderPlaced(OrderPlacedEvent event) {
        boolean sent = streamBridge.send("orders-out-0", event);
        if (!sent) {
            log.error("Failed to publish OrderPlacedEvent for order {}",
                    event.getOrderId());
            throw new EventPublishException("Failed to publish event");
        }
    }

    // With headers/partition key
    public void publishWithKey(OrderPlacedEvent event) {
        Message<OrderPlacedEvent> message = MessageBuilder
                .withPayload(event)
                .setHeader(KafkaHeaders.KEY, event.getCustomerId().getBytes())
                .setHeader("event-type", "ORDER_PLACED")
                .setHeader("correlation-id", event.getEventId())
                .build();

        streamBridge.send("orders-out-0", message);
    }
}
```

## The Transactional Outbox Pattern

The most dangerous pitfall in event-driven architectures is the **dual-write problem**: you need to update the database AND publish an event, but if one succeeds and the other fails, your system is inconsistent.

```
WRONG — Dual Write:
1. BEGIN TRANSACTION
2. INSERT INTO orders (...)        ← succeeds
3. COMMIT TRANSACTION
4. kafka.send("order-placed", ...) ← fails! Event lost!

ALSO WRONG:
1. kafka.send("order-placed", ...) ← succeeds
2. BEGIN TRANSACTION
3. INSERT INTO orders (...)        ← fails! Phantom event!
4. ROLLBACK
```

The outbox pattern solves this by writing the event to a database table **inside the same transaction** as the business data. A separate process reads the outbox table and publishes to the broker:

```
┌──────────────────────────────────────────────────────────────┐
│                      Same Transaction                         │
│                                                               │
│  INSERT INTO orders (id, ...) VALUES (...)                    │
│  INSERT INTO outbox (id, event_type, payload) VALUES (...)    │
│                                                               │
│  COMMIT                                                       │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│              Outbox Relay (polling or CDC)                     │
│                                                               │
│  SELECT * FROM outbox WHERE published = false                 │
│  → kafka.send(event)                                          │
│  → UPDATE outbox SET published = true WHERE id = ?            │
└──────────────────────────────────────────────────────────────┘
```

### Outbox Table

```sql
CREATE TABLE outbox_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type  VARCHAR(255) NOT NULL,      -- e.g., "Order"
    aggregate_id    VARCHAR(255) NOT NULL,       -- e.g., order ID
    event_type      VARCHAR(255) NOT NULL,       -- e.g., "OrderPlaced"
    payload         JSONB NOT NULL,              -- serialized event
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    published       BOOLEAN NOT NULL DEFAULT FALSE,
    published_at    TIMESTAMP,
    retry_count     INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_outbox_unpublished ON outbox_events (published, created_at)
    WHERE published = FALSE;
```

### Outbox Implementation

```java
@Entity
@Table(name = "outbox_events")
public class OutboxEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    private String aggregateType;
    private String aggregateId;
    private String eventType;

    @Column(columnDefinition = "jsonb")
    private String payload;

    private Instant createdAt = Instant.now();
    private boolean published = false;
    private Instant publishedAt;
    private int retryCount = 0;
}

@Service
public class OutboxService {

    private final OutboxEventRepository outboxRepo;
    private final ObjectMapper objectMapper;

    @Transactional(propagation = Propagation.MANDATORY)
    public void saveEvent(String aggregateType, String aggregateId,
                          String eventType, Object event) {
        try {
            OutboxEvent outboxEvent = new OutboxEvent();
            outboxEvent.setAggregateType(aggregateType);
            outboxEvent.setAggregateId(aggregateId);
            outboxEvent.setEventType(eventType);
            outboxEvent.setPayload(objectMapper.writeValueAsString(event));
            outboxRepo.save(outboxEvent);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize event", e);
        }
    }
}

// Usage in OrderService
@Service
@Transactional
public class OrderService {

    public Order placeOrder(CreateOrderRequest request, String userId) {
        Order saved = orderRepository.save(order);

        // Both writes happen in the same transaction
        outboxService.saveEvent(
                "Order",
                saved.getId(),
                "OrderPlaced",
                new OrderPlacedEvent(userId, saved.getId(),
                        saved.getCustomerId(), saved.getTotalAmount(),
                        saved.getItems())
        );

        return saved;
    }
}
```

### Outbox Relay (Polling)

```java
@Component
public class OutboxRelay {

    private final OutboxEventRepository outboxRepo;
    private final StreamBridge streamBridge;

    @Scheduled(fixedDelay = 1000) // Poll every second
    @Transactional
    public void publishPendingEvents() {
        List<OutboxEvent> pending = outboxRepo
                .findTop100ByPublishedFalseAndRetryCountLessThanOrderByCreatedAt(5);

        for (OutboxEvent event : pending) {
            try {
                String destination = event.getAggregateType().toLowerCase() + "-events";
                Message<String> message = MessageBuilder
                        .withPayload(event.getPayload())
                        .setHeader("event-type", event.getEventType())
                        .setHeader("aggregate-id", event.getAggregateId())
                        .setHeader("event-id", event.getId().toString())
                        .build();

                boolean sent = streamBridge.send(destination, message);
                if (sent) {
                    event.setPublished(true);
                    event.setPublishedAt(Instant.now());
                } else {
                    event.setRetryCount(event.getRetryCount() + 1);
                }
            } catch (Exception e) {
                log.error("Failed to publish outbox event {}", event.getId(), e);
                event.setRetryCount(event.getRetryCount() + 1);
            }
            outboxRepo.save(event);
        }
    }

    // Cleanup old published events
    @Scheduled(cron = "0 0 2 * * *") // 2 AM daily
    @Transactional
    public void cleanupPublishedEvents() {
        Instant cutoff = Instant.now().minus(7, ChronoUnit.DAYS);
        int deleted = outboxRepo.deleteByPublishedTrueAndPublishedAtBefore(cutoff);
        log.info("Cleaned up {} published outbox events", deleted);
    }
}
```

## Event Design Best Practices

| Principle | Description |
|-----------|-------------|
| Events are immutable | Never modify an event after creation. They represent facts that happened. |
| Events are past tense | `OrderPlaced`, not `PlaceOrder`. Events describe what happened, not what should happen. |
| Include enough context | Consumers should not need to call back to the producer for basic information. |
| Version your events | Use `event_type` with version (e.g., `OrderPlaced.v2`) for schema evolution. |
| Idempotent consumers | Consumers must handle duplicate events gracefully. Use event IDs for deduplication. |
| Small, focused events | One event per significant state change. Don't combine unrelated changes. |

Event-driven architecture decouples services in time (async processing), in space (services don't know about each other), and in implementation (each service chooses its own tech stack). But it introduces complexity in debugging, ordering guarantees, and eventual consistency. Start with in-process events, graduate to the outbox pattern when you need reliability, and adopt full streaming only when you have the operational maturity to manage it.

## Common Pitfalls

::: danger Pitfall 1: Not understanding the difference between @EventListener and @TransactionalEventListener
`@EventListener` runs inside the publisher's transaction. If it fails, the entire transaction rolls back. `@TransactionalEventListener` (AFTER_COMMIT) runs after the transaction commits.
**Fix:** Use `@EventListener` for operations that must succeed for the transaction to commit (inventory reservation). Use `@TransactionalEventListener(phase = AFTER_COMMIT)` for notifications, emails, and analytics.
:::

::: danger Pitfall 2: The dual-write problem
Writing to the database AND publishing to Kafka in sequence means one can succeed while the other fails, creating data inconsistency.
**Fix:** Use the transactional outbox pattern: write the event to an `outbox_events` table in the same database transaction as the business data. A separate relay process polls the outbox and publishes to the broker.
:::

::: danger Pitfall 3: Not making event consumers idempotent
Events may be delivered more than once (broker retries, rebalancing). Non-idempotent consumers process the same event multiple times, causing duplicate records or incorrect state.
**Fix:** Use unique event IDs for deduplication. Use database constraints (`INSERT ON CONFLICT DO NOTHING`). Track processed event IDs in a deduplication table.
:::

::: danger Pitfall 4: Putting mutable state in events
Modifying event objects after creation or including references to mutable entities breaks event immutability and can cause race conditions.
**Fix:** Events should be immutable records (Java records or classes with final fields). Use `List.copyOf()` for collections. Events represent facts that happened -- they should never change.
:::

::: danger Pitfall 5: AFTER_COMMIT listener throwing exceptions
If an `AFTER_COMMIT` listener throws, the transaction is already committed. The exception propagates to the caller, who may think the operation failed when it actually succeeded.
**Fix:** Wrap `AFTER_COMMIT` listener logic in try-catch. Log failures and enqueue for retry rather than throwing. These listeners must be resilient to failures.
:::

## Interview Questions

**Q1: What is the transactional outbox pattern and why is it needed?**
::: details Answer
The outbox pattern solves the dual-write problem: when you need to update a database AND publish an event, but cannot do both atomically. Instead of publishing directly to a broker, you write the event to an `outbox_events` table within the same database transaction as the business data. A separate relay process polls the outbox table (or uses Change Data Capture) and publishes events to the message broker. This guarantees that if the business data is committed, the event will eventually be published. It trades immediate delivery for guaranteed delivery.
:::

**Q2: What is the difference between `@EventListener`, `@TransactionalEventListener`, and `@Async @EventListener`?**
::: details Answer
`@EventListener` runs synchronously in the same thread and transaction as the publisher. If it throws, the transaction rolls back. `@TransactionalEventListener` (default phase: AFTER_COMMIT) runs after the transaction commits, ensuring the data is persisted before side effects execute. It runs synchronously in the same thread. `@Async @EventListener` runs asynchronously in a separate thread from a configured executor. It does not participate in the publisher's transaction. Combine `@Async` with `@TransactionalEventListener` for non-blocking, post-commit processing (e.g., sending emails after order confirmation).
:::

**Q3: What is event sourcing and how does it differ from event-driven architecture?**
::: details Answer
Event-driven architecture uses events for communication between components -- events are notifications about state changes. The source of truth is the current state in the database. Event sourcing goes further: the event log IS the source of truth. Instead of storing current state, you store the complete sequence of events that produced the state. Current state is derived by replaying events. Event sourcing provides a complete audit trail, enables temporal queries ("what was the state at time X?"), and supports retroactive bug fixes by replaying corrected events. It adds significant complexity and is appropriate for domains with strong audit requirements (finance, healthcare).
:::

**Q4: How do you handle event ordering in a distributed event-driven system?**
::: details Answer
Event ordering is only guaranteed within a single partition (Kafka) or queue. Strategies: (1) Use the entity ID as the partition key so all events for a specific entity go to the same partition and are processed in order. (2) Include a sequence number or version in events for consumers to detect out-of-order delivery. (3) Design consumers to be commutative (order-independent) where possible. (4) For strict global ordering, use a single partition (limits throughput). (5) Use event timestamps and idempotent consumers that can handle duplicate or reordered events gracefully.
:::

**Q5: How does Spring Cloud Stream differ from Spring Kafka for event-driven architectures?**
::: details Answer
Spring Kafka is a low-level library providing direct access to Kafka's producer, consumer, and admin APIs with `KafkaTemplate` and `@KafkaListener`. It is Kafka-specific and gives maximum control. Spring Cloud Stream is a higher-level abstraction using functional interfaces (`Consumer<T>`, `Function<T,R>`, `Supplier<T>`) that works with multiple brokers (Kafka, RabbitMQ) through binder implementations. You can switch brokers by changing a dependency. Use Spring Kafka when you need fine-grained Kafka control (manual partition assignment, exactly-once semantics, Kafka Streams). Use Spring Cloud Stream when you want broker portability or prefer functional composition.
:::
