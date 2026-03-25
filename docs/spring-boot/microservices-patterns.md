---
title: "Microservices Patterns with Spring"
description: "Implementation guide for core microservices patterns using Spring — saga pattern (choreography and orchestration), event sourcing, CQRS, outbox pattern, API composition, distributed transactions, choreography vs orchestration decision matrix, and service mesh integration."
tags: [microservices, saga, cqrs, event-sourcing, spring-boot]
difficulty: advanced
prerequisites: [spring-boot-fundamentals, messaging-concepts, distributed-systems-basics]
lastReviewed: "2026-03-25"
---

# Microservices Patterns with Spring

Building microservices means accepting distributed systems complexity. This guide implements the foundational patterns for data consistency, inter-service communication, and query composition using Spring Boot, Spring Cloud, and Kafka.

## 1. Saga Pattern

Sagas maintain data consistency across services without distributed transactions. Each service performs its local transaction and publishes an event. If a step fails, compensating transactions undo the preceding steps.

### 1.1 Choreography-Based Saga

Each service listens for events and decides what to do next. No central coordinator.

```
Order Created → Inventory Reserved → Payment Charged → Order Confirmed
                     │                      │
                     │ (failure)             │ (failure)
                     ▼                      ▼
              Inventory Released      Payment Refunded → Order Cancelled
```

```java
// Order Service — starts the saga
@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final KafkaTemplate<String, Object> kafka;

    public OrderService(OrderRepository orderRepository,
                         KafkaTemplate<String, Object> kafka) {
        this.orderRepository = orderRepository;
        this.kafka = kafka;
    }

    @Transactional
    public Order createOrder(CreateOrderRequest request) {
        Order order = Order.create(request);
        order.setStatus(OrderStatus.PENDING);
        order = orderRepository.save(order);

        // Start saga by publishing event
        kafka.send("order-events", order.getId().toString(),
                new OrderCreatedEvent(order.getId(), order.getCustomerId(),
                        order.getItems(), order.getTotalAmount()));

        return order;
    }

    // Listen for saga completion/failure events
    @KafkaListener(topics = "payment-events", groupId = "order-service")
    public void handlePaymentEvent(PaymentEvent event) {
        switch (event) {
            case PaymentChargedEvent e -> {
                orderRepository.findById(e.orderId()).ifPresent(order -> {
                    order.setStatus(OrderStatus.CONFIRMED);
                    order.setPaymentId(e.paymentId());
                    orderRepository.save(order);

                    kafka.send("order-events", order.getId().toString(),
                            new OrderConfirmedEvent(order.getId()));
                });
            }
            case PaymentFailedEvent e -> {
                orderRepository.findById(e.orderId()).ifPresent(order -> {
                    order.setStatus(OrderStatus.CANCELLED);
                    order.setCancelReason("Payment failed: " + e.reason());
                    orderRepository.save(order);

                    // Trigger compensation
                    kafka.send("order-events", order.getId().toString(),
                            new OrderCancelledEvent(order.getId(), e.reason()));
                });
            }
            default -> {}
        }
    }
}

// Inventory Service — step 2 in the saga
@Service
public class InventoryService {

    private final InventoryRepository inventoryRepository;
    private final ReservationRepository reservationRepository;
    private final KafkaTemplate<String, Object> kafka;

    @KafkaListener(topics = "order-events", groupId = "inventory-service")
    public void handleOrderEvent(OrderEvent event) {
        switch (event) {
            case OrderCreatedEvent e -> reserveInventory(e);
            case OrderCancelledEvent e -> releaseInventory(e);
            default -> {}
        }
    }

    @Transactional
    private void reserveInventory(OrderCreatedEvent event) {
        try {
            List<Reservation> reservations = new ArrayList<>();
            for (OrderItem item : event.items()) {
                Inventory inventory = inventoryRepository
                        .findBySku(item.sku())
                        .orElseThrow(() -> new ProductNotFoundException(item.sku()));

                if (inventory.getAvailable() < item.quantity()) {
                    throw new InsufficientStockException(item.sku());
                }

                inventory.reserve(item.quantity());
                inventoryRepository.save(inventory);

                reservations.add(new Reservation(
                        event.orderId(), item.sku(), item.quantity()));
            }
            reservationRepository.saveAll(reservations);

            kafka.send("inventory-events", event.orderId().toString(),
                    new InventoryReservedEvent(event.orderId()));

        } catch (Exception e) {
            // Compensation: release any partial reservations
            releasePartialReservations(event.orderId());

            kafka.send("inventory-events", event.orderId().toString(),
                    new InventoryReservationFailedEvent(
                            event.orderId(), e.getMessage()));
        }
    }

    @Transactional
    private void releaseInventory(OrderCancelledEvent event) {
        List<Reservation> reservations = reservationRepository
                .findByOrderId(event.orderId());

        for (Reservation res : reservations) {
            Inventory inventory = inventoryRepository.findBySku(res.getSku()).orElseThrow();
            inventory.release(res.getQuantity());
            inventoryRepository.save(inventory);
        }
        reservationRepository.deleteByOrderId(event.orderId());

        kafka.send("inventory-events", event.orderId().toString(),
                new InventoryReleasedEvent(event.orderId()));
    }
}

// Payment Service — step 3 in the saga
@Service
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final PaymentGateway paymentGateway;
    private final KafkaTemplate<String, Object> kafka;

    @KafkaListener(topics = "inventory-events", groupId = "payment-service")
    public void handleInventoryEvent(InventoryEvent event) {
        if (event instanceof InventoryReservedEvent reserved) {
            processPayment(reserved);
        }
    }

    @Transactional
    private void processPayment(InventoryReservedEvent event) {
        try {
            PaymentResult result = paymentGateway.charge(
                    event.orderId(), event.amount());

            Payment payment = new Payment(event.orderId(),
                    result.getTransactionId(), event.amount(),
                    PaymentStatus.CHARGED);
            paymentRepository.save(payment);

            kafka.send("payment-events", event.orderId().toString(),
                    new PaymentChargedEvent(event.orderId(),
                            result.getTransactionId()));

        } catch (PaymentException e) {
            kafka.send("payment-events", event.orderId().toString(),
                    new PaymentFailedEvent(event.orderId(), e.getMessage()));
        }
    }
}
```

### 1.2 Orchestration-Based Saga

A central **saga orchestrator** coordinates the steps and compensations.

```java
@Service
public class OrderSagaOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(OrderSagaOrchestrator.class);

    private final OrderRepository orderRepository;
    private final InventoryClient inventoryClient;
    private final PaymentClient paymentClient;
    private final ShippingClient shippingClient;
    private final SagaLogRepository sagaLogRepository;

    public OrderSagaOrchestrator(OrderRepository orderRepository,
                                  InventoryClient inventoryClient,
                                  PaymentClient paymentClient,
                                  ShippingClient shippingClient,
                                  SagaLogRepository sagaLogRepository) {
        this.orderRepository = orderRepository;
        this.inventoryClient = inventoryClient;
        this.paymentClient = paymentClient;
        this.shippingClient = shippingClient;
        this.sagaLogRepository = sagaLogRepository;
    }

    @Transactional
    public Order executeSaga(CreateOrderRequest request) {
        String sagaId = UUID.randomUUID().toString();
        List<SagaStep> completedSteps = new ArrayList<>();

        try {
            // Step 1: Create order
            Order order = Order.create(request);
            order.setSagaId(sagaId);
            order.setStatus(OrderStatus.PENDING);
            order = orderRepository.save(order);
            completedSteps.add(new SagaStep("CREATE_ORDER", order.getId()));
            logStep(sagaId, "CREATE_ORDER", "COMPLETED");

            // Step 2: Reserve inventory
            InventoryResponse inventoryResp = inventoryClient
                    .reserve(order.getId(), order.getItems());
            completedSteps.add(new SagaStep("RESERVE_INVENTORY", order.getId()));
            logStep(sagaId, "RESERVE_INVENTORY", "COMPLETED");

            // Step 3: Charge payment
            PaymentResponse paymentResp = paymentClient
                    .charge(order.getId(), order.getCustomerId(), order.getTotalAmount());
            order.setPaymentId(paymentResp.paymentId());
            completedSteps.add(new SagaStep("CHARGE_PAYMENT", order.getId()));
            logStep(sagaId, "CHARGE_PAYMENT", "COMPLETED");

            // Step 4: Schedule shipping
            ShippingResponse shippingResp = shippingClient
                    .createShipment(order.getId(), request.shippingAddress());
            order.setTrackingNumber(shippingResp.trackingNumber());
            completedSteps.add(new SagaStep("SCHEDULE_SHIPPING", order.getId()));
            logStep(sagaId, "SCHEDULE_SHIPPING", "COMPLETED");

            // All steps succeeded
            order.setStatus(OrderStatus.CONFIRMED);
            orderRepository.save(order);
            logStep(sagaId, "SAGA", "COMPLETED");

            return order;

        } catch (Exception e) {
            log.error("Saga {} failed at step {}: {}",
                    sagaId, completedSteps.size(), e.getMessage());
            logStep(sagaId, "SAGA", "FAILED: " + e.getMessage());

            // Execute compensating transactions in reverse order
            compensate(sagaId, completedSteps);
            throw new SagaFailedException(sagaId, e);
        }
    }

    private void compensate(String sagaId, List<SagaStep> completedSteps) {
        Collections.reverse(completedSteps);
        for (SagaStep step : completedSteps) {
            try {
                switch (step.name()) {
                    case "SCHEDULE_SHIPPING" -> {
                        shippingClient.cancelShipment(step.orderId());
                        logStep(sagaId, "COMPENSATE_SHIPPING", "COMPLETED");
                    }
                    case "CHARGE_PAYMENT" -> {
                        paymentClient.refund(step.orderId());
                        logStep(sagaId, "COMPENSATE_PAYMENT", "COMPLETED");
                    }
                    case "RESERVE_INVENTORY" -> {
                        inventoryClient.release(step.orderId());
                        logStep(sagaId, "COMPENSATE_INVENTORY", "COMPLETED");
                    }
                    case "CREATE_ORDER" -> {
                        orderRepository.findById(step.orderId()).ifPresent(order -> {
                            order.setStatus(OrderStatus.CANCELLED);
                            orderRepository.save(order);
                        });
                        logStep(sagaId, "COMPENSATE_ORDER", "COMPLETED");
                    }
                }
            } catch (Exception compEx) {
                log.error("Compensation failed for step {} in saga {}: {}",
                        step.name(), sagaId, compEx.getMessage());
                logStep(sagaId, "COMPENSATE_" + step.name(),
                        "FAILED: " + compEx.getMessage());
                // Store for manual resolution
            }
        }
    }

    private void logStep(String sagaId, String step, String status) {
        sagaLogRepository.save(new SagaLog(sagaId, step, status, Instant.now()));
    }
}
```

## 2. Event Sourcing

Instead of storing current state, store all events that led to the current state.

```java
// Event definitions
public sealed interface OrderEvent {
    String orderId();
    Instant occurredAt();
}

public record OrderCreated(String orderId, String customerId,
                            List<LineItem> items, BigDecimal total,
                            Instant occurredAt) implements OrderEvent {}

public record OrderPaymentReceived(String orderId, String paymentId,
                                    BigDecimal amount,
                                    Instant occurredAt) implements OrderEvent {}

public record OrderShipped(String orderId, String trackingNumber,
                            String carrier,
                            Instant occurredAt) implements OrderEvent {}

public record OrderCancelled(String orderId, String reason,
                              Instant occurredAt) implements OrderEvent {}

// Event Store
@Repository
public class JdbcEventStore implements EventStore {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional
    public void append(String aggregateId, String aggregateType,
                       long expectedVersion, List<OrderEvent> events) {
        for (OrderEvent event : events) {
            long newVersion = expectedVersion + events.indexOf(event) + 1;

            int updated = jdbcTemplate.update("""
                    INSERT INTO event_store
                    (aggregate_id, aggregate_type, event_type, event_data, version, occurred_at)
                    VALUES (?, ?, ?, ?::jsonb, ?, ?)
                    """,
                    aggregateId,
                    aggregateType,
                    event.getClass().getSimpleName(),
                    serialize(event),
                    newVersion,
                    Timestamp.from(event.occurredAt()));

            if (updated == 0) {
                throw new OptimisticLockingException(
                        "Concurrent modification of aggregate " + aggregateId);
            }
        }
    }

    @Override
    public List<OrderEvent> loadEvents(String aggregateId) {
        return jdbcTemplate.query("""
                SELECT event_type, event_data FROM event_store
                WHERE aggregate_id = ?
                ORDER BY version ASC
                """,
                (rs, rowNum) -> deserialize(
                        rs.getString("event_type"),
                        rs.getString("event_data")),
                aggregateId);
    }

    @Override
    public List<OrderEvent> loadEventsAfterVersion(String aggregateId, long version) {
        return jdbcTemplate.query("""
                SELECT event_type, event_data FROM event_store
                WHERE aggregate_id = ? AND version > ?
                ORDER BY version ASC
                """,
                (rs, rowNum) -> deserialize(
                        rs.getString("event_type"),
                        rs.getString("event_data")),
                aggregateId, version);
    }

    private String serialize(OrderEvent event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize event", e);
        }
    }

    private OrderEvent deserialize(String type, String json) {
        try {
            Class<?> eventClass = Class.forName(
                    "com.example.domain.events." + type);
            return (OrderEvent) objectMapper.readValue(json, eventClass);
        } catch (Exception e) {
            throw new RuntimeException("Failed to deserialize event: " + type, e);
        }
    }
}

// Aggregate — rebuilt from events
public class OrderAggregate {

    private String id;
    private String customerId;
    private List<LineItem> items = new ArrayList<>();
    private BigDecimal total;
    private OrderStatus status;
    private String paymentId;
    private String trackingNumber;
    private long version = 0;

    private final List<OrderEvent> uncommittedEvents = new ArrayList<>();

    // Factory method — creates new aggregate
    public static OrderAggregate create(String orderId, String customerId,
                                         List<LineItem> items) {
        OrderAggregate aggregate = new OrderAggregate();
        BigDecimal total = items.stream()
                .map(i -> i.price().multiply(BigDecimal.valueOf(i.quantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        aggregate.apply(new OrderCreated(orderId, customerId, items, total,
                Instant.now()));
        return aggregate;
    }

    // Reconstitute from events
    public static OrderAggregate fromEvents(List<OrderEvent> events) {
        OrderAggregate aggregate = new OrderAggregate();
        for (OrderEvent event : events) {
            aggregate.applyEvent(event);
            aggregate.version++;
        }
        return aggregate;
    }

    // Command methods produce events
    public void receivePayment(String paymentId, BigDecimal amount) {
        if (status != OrderStatus.PENDING) {
            throw new IllegalStateException("Order is not pending");
        }
        if (amount.compareTo(total) < 0) {
            throw new IllegalArgumentException("Insufficient payment");
        }
        apply(new OrderPaymentReceived(id, paymentId, amount, Instant.now()));
    }

    public void ship(String trackingNumber, String carrier) {
        if (status != OrderStatus.PAID) {
            throw new IllegalStateException("Order must be paid to ship");
        }
        apply(new OrderShipped(id, trackingNumber, carrier, Instant.now()));
    }

    public void cancel(String reason) {
        if (status == OrderStatus.SHIPPED || status == OrderStatus.DELIVERED) {
            throw new IllegalStateException("Cannot cancel shipped order");
        }
        apply(new OrderCancelled(id, reason, Instant.now()));
    }

    // Apply event and track as uncommitted
    private void apply(OrderEvent event) {
        applyEvent(event);
        uncommittedEvents.add(event);
    }

    // Event handler — mutates state
    private void applyEvent(OrderEvent event) {
        switch (event) {
            case OrderCreated e -> {
                this.id = e.orderId();
                this.customerId = e.customerId();
                this.items = new ArrayList<>(e.items());
                this.total = e.total();
                this.status = OrderStatus.PENDING;
            }
            case OrderPaymentReceived e -> {
                this.paymentId = e.paymentId();
                this.status = OrderStatus.PAID;
            }
            case OrderShipped e -> {
                this.trackingNumber = e.trackingNumber();
                this.status = OrderStatus.SHIPPED;
            }
            case OrderCancelled e -> {
                this.status = OrderStatus.CANCELLED;
            }
        }
    }

    public List<OrderEvent> getUncommittedEvents() {
        return Collections.unmodifiableList(uncommittedEvents);
    }

    public void markCommitted() {
        uncommittedEvents.clear();
    }

    // getters
    public long getVersion() { return version; }
}

// Service that uses the aggregate + event store
@Service
public class OrderCommandService {

    private final EventStore eventStore;
    private final KafkaTemplate<String, Object> kafka;

    @Transactional
    public OrderAggregate createOrder(CreateOrderCommand command) {
        OrderAggregate order = OrderAggregate.create(
                UUID.randomUUID().toString(),
                command.customerId(),
                command.items());

        eventStore.append(order.getId(), "Order",
                0, order.getUncommittedEvents());

        // Publish events for projections / other services
        for (OrderEvent event : order.getUncommittedEvents()) {
            kafka.send("order-events", order.getId(), event);
        }
        order.markCommitted();
        return order;
    }

    @Transactional
    public void receivePayment(String orderId, String paymentId, BigDecimal amount) {
        List<OrderEvent> events = eventStore.loadEvents(orderId);
        OrderAggregate order = OrderAggregate.fromEvents(events);

        order.receivePayment(paymentId, amount);

        eventStore.append(orderId, "Order",
                order.getVersion(), order.getUncommittedEvents());

        for (OrderEvent event : order.getUncommittedEvents()) {
            kafka.send("order-events", orderId, event);
        }
        order.markCommitted();
    }
}
```

## 3. CQRS (Command Query Responsibility Segregation)

```java
// Command side — writes to event store
@RestController
@RequestMapping("/api/orders/commands")
public class OrderCommandController {

    private final OrderCommandService commandService;

    @PostMapping
    public ResponseEntity<String> createOrder(@RequestBody CreateOrderCommand command) {
        OrderAggregate order = commandService.createOrder(command);
        return ResponseEntity.status(HttpStatus.CREATED).body(order.getId());
    }

    @PostMapping("/{orderId}/pay")
    public ResponseEntity<Void> pay(@PathVariable String orderId,
                                     @RequestBody PaymentCommand command) {
        commandService.receivePayment(orderId, command.paymentId(), command.amount());
        return ResponseEntity.ok().build();
    }
}

// Query side — reads from materialized view (separate database/table)
@RestController
@RequestMapping("/api/orders/queries")
public class OrderQueryController {

    private final OrderReadRepository readRepository;

    @GetMapping("/{id}")
    public ResponseEntity<OrderView> getOrder(@PathVariable String id) {
        return readRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/customer/{customerId}")
    public List<OrderView> getByCustomer(@PathVariable String customerId) {
        return readRepository.findByCustomerId(customerId);
    }

    @GetMapping("/search")
    public Page<OrderView> search(OrderSearchCriteria criteria, Pageable pageable) {
        return readRepository.search(criteria, pageable);
    }
}

// Projector — listens to events and updates read model
@Service
public class OrderProjector {

    private final OrderReadRepository readRepository;

    @KafkaListener(topics = "order-events", groupId = "order-projector")
    public void project(OrderEvent event) {
        switch (event) {
            case OrderCreated e -> {
                OrderView view = new OrderView();
                view.setId(e.orderId());
                view.setCustomerId(e.customerId());
                view.setItems(e.items());
                view.setTotal(e.total());
                view.setStatus("PENDING");
                view.setCreatedAt(e.occurredAt());
                readRepository.save(view);
            }
            case OrderPaymentReceived e -> {
                readRepository.findById(e.orderId()).ifPresent(view -> {
                    view.setStatus("PAID");
                    view.setPaymentId(e.paymentId());
                    view.setPaidAt(e.occurredAt());
                    readRepository.save(view);
                });
            }
            case OrderShipped e -> {
                readRepository.findById(e.orderId()).ifPresent(view -> {
                    view.setStatus("SHIPPED");
                    view.setTrackingNumber(e.trackingNumber());
                    view.setShippedAt(e.occurredAt());
                    readRepository.save(view);
                });
            }
            case OrderCancelled e -> {
                readRepository.findById(e.orderId()).ifPresent(view -> {
                    view.setStatus("CANCELLED");
                    view.setCancelReason(e.reason());
                    view.setCancelledAt(e.occurredAt());
                    readRepository.save(view);
                });
            }
        }
    }
}
```

## 4. Transactional Outbox Pattern

The outbox pattern ensures reliable event publication by writing events to an outbox table within the same database transaction as the business data change.

```java
@Entity
@Table(name = "outbox_events")
public class OutboxEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "aggregate_type")
    private String aggregateType;

    @Column(name = "aggregate_id")
    private String aggregateId;

    @Column(name = "event_type")
    private String eventType;

    @Column(columnDefinition = "jsonb")
    private String payload;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "published")
    private boolean published = false;

    @Column(name = "published_at")
    private Instant publishedAt;

    // constructors, getters, setters
}

@Service
public class OutboxOrderService {

    private final OrderRepository orderRepository;
    private final OutboxEventRepository outboxRepository;
    private final ObjectMapper objectMapper;

    @Transactional  // single transaction for both operations
    public Order createOrder(CreateOrderRequest request) {
        // Save the order
        Order order = Order.create(request);
        order = orderRepository.save(order);

        // Write event to outbox in the same transaction
        OutboxEvent event = new OutboxEvent();
        event.setAggregateType("Order");
        event.setAggregateId(order.getId().toString());
        event.setEventType("OrderCreated");
        event.setPayload(serialize(new OrderCreatedPayload(
                order.getId(), order.getCustomerId(), order.getTotalAmount())));
        event.setCreatedAt(Instant.now());
        outboxRepository.save(event);

        return order;
    }
}

// Outbox publisher — polls and publishes unpublished events
@Component
public class OutboxPublisher {

    private final OutboxEventRepository outboxRepository;
    private final KafkaTemplate<String, String> kafka;

    @Scheduled(fixedDelay = 1000)  // poll every second
    @Transactional
    public void publishPendingEvents() {
        List<OutboxEvent> pending = outboxRepository
                .findTop100ByPublishedFalseOrderByCreatedAtAsc();

        for (OutboxEvent event : pending) {
            try {
                String topic = event.getAggregateType().toLowerCase() + "-events";
                kafka.send(topic, event.getAggregateId(), event.getPayload())
                        .get(5, TimeUnit.SECONDS);

                event.setPublished(true);
                event.setPublishedAt(Instant.now());
                outboxRepository.save(event);
            } catch (Exception e) {
                // Will retry on next poll
                break;
            }
        }
    }

    // Cleanup old published events
    @Scheduled(cron = "0 0 * * * *")  // hourly
    @Transactional
    public void cleanupOldEvents() {
        Instant cutoff = Instant.now().minus(Duration.ofDays(7));
        outboxRepository.deleteByPublishedTrueAndPublishedAtBefore(cutoff);
    }
}
```

## 5. API Composition

```java
@RestController
@RequestMapping("/api/order-details")
public class OrderDetailsComposer {

    private final WebClient.Builder webClientBuilder;

    @GetMapping("/{orderId}")
    public Mono<OrderDetailsResponse> getOrderDetails(@PathVariable Long orderId) {
        Mono<Order> order = webClientBuilder.build()
                .get().uri("http://order-service/api/orders/{id}", orderId)
                .retrieve().bodyToMono(Order.class);

        Mono<Customer> customer = order.flatMap(o ->
                webClientBuilder.build()
                        .get().uri("http://customer-service/api/customers/{id}",
                                o.getCustomerId())
                        .retrieve().bodyToMono(Customer.class));

        Mono<List<ProductInfo>> products = order.flatMap(o -> {
            List<Long> productIds = o.getItems().stream()
                    .map(OrderItem::getProductId).toList();
            return webClientBuilder.build()
                    .post().uri("http://product-service/api/products/batch")
                    .bodyValue(productIds)
                    .retrieve().bodyToFlux(ProductInfo.class).collectList();
        });

        Mono<ShippingInfo> shipping = webClientBuilder.build()
                .get().uri("http://shipping-service/api/shipments/order/{id}", orderId)
                .retrieve().bodyToMono(ShippingInfo.class)
                .onErrorResume(e -> Mono.just(ShippingInfo.notYetShipped()));

        return Mono.zip(order, customer, products, shipping)
                .map(tuple -> new OrderDetailsResponse(
                        tuple.getT1(), tuple.getT2(),
                        tuple.getT3(), tuple.getT4()));
    }
}
```

## 6. Choreography vs Orchestration Decision Matrix

```
┌────────────────────────┬──────────────────────┬──────────────────────┐
│ Aspect                 │ Choreography         │ Orchestration        │
├────────────────────────┼──────────────────────┼──────────────────────┤
│ Coupling               │ Loose                │ Tighter (via orch.)  │
│ Visibility             │ Hard to trace flow   │ Central flow visible │
│ Complexity (few steps) │ Simple               │ Over-engineered      │
│ Complexity (many steps)│ Spaghetti events     │ Manageable           │
│ Single point of failure│ None                 │ Orchestrator         │
│ Adding new steps       │ Add listener         │ Modify orchestrator  │
│ Error handling         │ Distributed          │ Centralized          │
│ Testing                │ Integration-heavy    │ Unit testable        │
│ Monitoring             │ Needs correlation IDs│ Built-in             │
├────────────────────────┼──────────────────────┼──────────────────────┤
│ Best For               │ 2-3 step sagas,      │ 4+ step sagas,       │
│                        │ independent teams,   │ complex compensation,│
│                        │ simple flows         │ business visibility  │
└────────────────────────┴──────────────────────┴──────────────────────┘
```

These patterns address the fundamental challenges of data consistency in distributed systems. Start with the outbox pattern for reliable event publishing, use choreography for simple 2-3 step flows, and graduate to orchestration when business logic grows complex. Event sourcing and CQRS are powerful but add significant complexity — adopt them only when you need complete audit trails, temporal queries, or independently scalable read/write workloads.
