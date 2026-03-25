---
title: "Spring Modulith Deep Dive"
description: "Comprehensive guide to Spring Modulith — modular monolith architecture, @ApplicationModule, module API and SPI boundaries, inter-module events, @ApplicationModuleTest, module documentation generation, observability integration, migration path to microservices, and comparison with microservices-first approaches."
tags: [spring-modulith, modular-monolith, architecture, modules, java]
difficulty: advanced
prerequisites: [spring-boot-fundamentals, domain-driven-design, architecture-patterns]
lastReviewed: "2026-03-25"
---

# Spring Modulith Deep Dive

Spring Modulith helps you build well-structured, modular monoliths with Spring Boot. It enforces module boundaries at compile/test time, provides an event-driven communication model between modules, and generates architecture documentation — all while keeping the simplicity of a single deployable unit.

## 1. Why Modular Monolith?

```
Monolith              Modular Monolith           Microservices
┌──────────┐         ┌──────────────────┐        ┌─────┐ ┌─────┐ ┌─────┐
│  tangled  │        │ ┌─────┐ ┌──────┐ │        │ Svc │ │ Svc │ │ Svc │
│  spaghetti│   →    │ │Order│→│Inven-│ │   →    │  A  │ │  B  │ │  C  │
│  code     │        │ │     │ │tory  │ │        │     │ │     │ │     │
│           │        │ └──┬──┘ └──────┘ │        └──┬──┘ └──┬──┘ └──┬──┘
│           │        │    │    ┌──────┐  │           │      │      │
│           │        │    └───→│ Pay- │  │           └──────┴──────┘
│           │        │         │ment  │  │           network calls
└──────────┘         │         └──────┘  │
                     └──────────────────┘
                     in-process, enforced
                     boundaries
```

The modular monolith provides the architectural discipline of microservices without the distributed systems complexity. You get clear module boundaries, independent testability, and a straightforward migration path to microservices when (and if) you need it.

## 2. Project Structure

```
com.example.shop/
├── ShopApplication.java                    # Main application class
├── order/                                  # Order module (package = module)
│   ├── Order.java                          # Public API (aggregate root)
│   ├── OrderService.java                   # Public API
│   ├── OrderCreatedEvent.java             # Published event
│   ├── internal/                           # Not accessible from other modules
│   │   ├── OrderRepository.java
│   │   ├── OrderLineItem.java
│   │   ├── OrderValidator.java
│   │   └── JpaOrderRepository.java
│   └── spi/                               # Extension points for other modules
│       └── OrderCompletionListener.java
├── inventory/                              # Inventory module
│   ├── InventoryService.java
│   ├── StockLevel.java
│   ├── internal/
│   │   ├── InventoryRepository.java
│   │   └── StockReservation.java
│   └── package-info.java
├── payment/                                # Payment module
│   ├── PaymentService.java
│   ├── PaymentConfirmedEvent.java
│   └── internal/
│       ├── PaymentProcessor.java
│       ├── PaymentGatewayClient.java
│       └── PaymentRepository.java
├── notification/                           # Notification module
│   ├── NotificationService.java
│   └── internal/
│       ├── EmailSender.java
│       ├── SmsSender.java
│       └── NotificationRepository.java
└── shared/                                 # Shared kernel (if needed)
    ├── Money.java
    └── DomainEvent.java
```

### 2.1 Dependencies

```xml
<dependency>
    <groupId>org.springframework.modulith</groupId>
    <artifactId>spring-modulith-starter-core</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.modulith</groupId>
    <artifactId>spring-modulith-starter-jpa</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.modulith</groupId>
    <artifactId>spring-modulith-starter-test</artifactId>
    <scope>test</scope>
</dependency>
<!-- For documentation generation -->
<dependency>
    <groupId>org.springframework.modulith</groupId>
    <artifactId>spring-modulith-docs</artifactId>
    <scope>test</scope>
</dependency>
<!-- For observability -->
<dependency>
    <groupId>org.springframework.modulith</groupId>
    <artifactId>spring-modulith-observability</artifactId>
</dependency>
<!-- For event externalization to Kafka -->
<dependency>
    <groupId>org.springframework.modulith</groupId>
    <artifactId>spring-modulith-events-kafka</artifactId>
</dependency>
```

## 3. Defining Modules

### 3.1 Convention-Based Modules

By default, every direct sub-package of the main application package is a module. Public types in the module's root package form the **API**. Types in the `internal` sub-package are **internal** and cannot be accessed by other modules.

```java
// com.example.shop.order — this IS the module's public API
package com.example.shop.order;

// Public aggregate root — accessible from other modules
public class Order {

    private Long id;
    private Long customerId;
    private OrderStatus status;
    private List<OrderLineItem> items;
    private Money totalAmount;
    private Instant createdAt;

    // Business methods that form the API
    public void confirm() {
        if (this.status != OrderStatus.PENDING) {
            throw new IllegalStateException("Order must be PENDING to confirm");
        }
        this.status = OrderStatus.CONFIRMED;
    }

    public Money getTotalAmount() {
        return items.stream()
                .map(OrderLineItem::getSubtotal)
                .reduce(Money.ZERO, Money::add);
    }

    // getters
}

// Public service — accessible from other modules
@Service
@Transactional
public class OrderService {

    private final OrderRepository orderRepository;
    private final ApplicationEventPublisher events;

    OrderService(OrderRepository orderRepository,
                  ApplicationEventPublisher events) {
        this.orderRepository = orderRepository;
        this.events = events;
    }

    public Order createOrder(Long customerId, List<LineItemRequest> items) {
        Order order = Order.create(customerId, items);
        order = orderRepository.save(order);

        events.publishEvent(new OrderCreatedEvent(
                order.getId(), customerId, order.getTotalAmount()));

        return order;
    }

    public Order findById(Long id) {
        return orderRepository.findById(id)
                .orElseThrow(() -> new OrderNotFoundException(id));
    }
}
```

```java
// com.example.shop.order.internal — INTERNAL, not accessible from other modules
package com.example.shop.order.internal;

// This repository is internal — other modules cannot use it
interface OrderRepository extends JpaRepository<Order, Long> {

    List<Order> findByCustomerIdAndStatus(Long customerId, OrderStatus status);

    @Query("SELECT o FROM Order o WHERE o.createdAt >= :since AND o.status = :status")
    List<Order> findRecentByStatus(@Param("since") Instant since,
                                    @Param("status") OrderStatus status);
}

// Internal validation logic
@Component
class OrderValidator {

    private final InventoryService inventoryService;

    OrderValidator(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    void validate(Order order) {
        if (order.getItems().isEmpty()) {
            throw new InvalidOrderException("Order must have at least one item");
        }
        // Check inventory via the inventory module's public API
        for (OrderLineItem item : order.getItems()) {
            if (!inventoryService.isAvailable(item.getProductId(), item.getQuantity())) {
                throw new InsufficientStockException(item.getProductId());
            }
        }
    }
}
```

### 3.2 Explicit Module Configuration

```java
// package-info.java in the module package
@org.springframework.modulith.ApplicationModule(
    allowedDependencies = { "inventory", "shared" }  // restrict dependencies
)
package com.example.shop.order;
```

```java
// Named module with custom configuration
@org.springframework.modulith.ApplicationModule(
    displayName = "Payment Processing",
    allowedDependencies = { "order :: OrderService", "notification" }
)
package com.example.shop.payment;
```

### 3.3 Named Interface (Exposing Specific Types)

```java
// Only expose OrderService and Order to other modules, not everything public
@org.springframework.modulith.NamedInterface("api")
package com.example.shop.order;

// SPI package — extension points
@org.springframework.modulith.NamedInterface("spi")
package com.example.shop.order.spi;
```

## 4. Inter-Module Events

Events are the primary mechanism for loose coupling between modules. Spring Modulith builds on Spring's `ApplicationEventPublisher` with transactional event publication and externalization.

### 4.1 Publishing Events

```java
// Event record — simple, immutable
package com.example.shop.order;

public record OrderCreatedEvent(
        Long orderId,
        Long customerId,
        Money totalAmount
) {}

public record OrderCompletedEvent(
        Long orderId,
        Long customerId,
        Instant completedAt
) {}

public record OrderCancelledEvent(
        Long orderId,
        Long customerId,
        String reason
) {}

// Publishing from a service
@Service
@Transactional
public class OrderService {

    private final OrderRepository orderRepository;
    private final ApplicationEventPublisher events;

    OrderService(OrderRepository orderRepository,
                  ApplicationEventPublisher events) {
        this.orderRepository = orderRepository;
        this.events = events;
    }

    public Order createOrder(CreateOrderRequest request) {
        Order order = Order.create(request.customerId(), request.items());
        order = orderRepository.save(order);

        // Publish event — other modules react to this
        events.publishEvent(new OrderCreatedEvent(
                order.getId(),
                request.customerId(),
                order.getTotalAmount()));

        return order;
    }

    public void cancelOrder(Long orderId, String reason) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        order.cancel(reason);
        orderRepository.save(order);

        events.publishEvent(new OrderCancelledEvent(
                orderId, order.getCustomerId(), reason));
    }
}
```

### 4.2 Listening to Events in Other Modules

```java
// Inventory module reacts to order events
package com.example.shop.inventory.internal;

@Component
class OrderEventHandler {

    private static final Logger log = LoggerFactory.getLogger(OrderEventHandler.class);
    private final StockReservationService reservationService;

    OrderEventHandler(StockReservationService reservationService) {
        this.reservationService = reservationService;
    }

    @ApplicationModuleListener
    void onOrderCreated(OrderCreatedEvent event) {
        log.info("Reserving stock for order {}", event.orderId());
        reservationService.reserveStock(event.orderId());
    }

    @ApplicationModuleListener
    void onOrderCancelled(OrderCancelledEvent event) {
        log.info("Releasing stock for cancelled order {}", event.orderId());
        reservationService.releaseStock(event.orderId());
    }
}

// Notification module reacts to events
package com.example.shop.notification.internal;

@Component
class OrderNotificationHandler {

    private final EmailSender emailSender;
    private final CustomerLookup customerLookup;

    OrderNotificationHandler(EmailSender emailSender, CustomerLookup customerLookup) {
        this.emailSender = emailSender;
        this.customerLookup = customerLookup;
    }

    @ApplicationModuleListener
    void onOrderCreated(OrderCreatedEvent event) {
        String email = customerLookup.getEmail(event.customerId());
        emailSender.send(email, "Order Confirmation",
                "Your order #%d for %s has been placed."
                        .formatted(event.orderId(), event.totalAmount()));
    }

    @ApplicationModuleListener
    void onOrderCompleted(OrderCompletedEvent event) {
        String email = customerLookup.getEmail(event.customerId());
        emailSender.send(email, "Order Delivered",
                "Your order #%d has been delivered.".formatted(event.orderId()));
    }
}

// Payment module reacts to events
package com.example.shop.payment.internal;

@Component
class OrderPaymentHandler {

    private final PaymentProcessor paymentProcessor;

    OrderPaymentHandler(PaymentProcessor paymentProcessor) {
        this.paymentProcessor = paymentProcessor;
    }

    @ApplicationModuleListener
    void onOrderCancelled(OrderCancelledEvent event) {
        paymentProcessor.refund(event.orderId());
    }
}
```

### 4.3 Transactional Event Publication

Spring Modulith ensures events are published reliably using a transactional event log. Events are stored in a database table within the same transaction as the business operation, then published asynchronously.

```java
@Configuration
class ModulithConfig {

    // The event publication log stores incomplete events for retry
    // No additional configuration needed — Spring Modulith auto-configures
    // the event publication repository when spring-modulith-starter-jpa is present
}
```

```yaml
# application.yml
spring:
  modulith:
    events:
      republish-outstanding-events-on-restart: true
      completion-mode: UPDATE    # UPDATE or DELETE
    jdbc:
      schema-initialization:
        enabled: true            # auto-create event publication tables
```

### 4.4 Event Externalization (to Kafka)

```java
// Externalize events to Kafka for other bounded contexts
@Configuration
class EventExternalizationConfig {

    @Bean
    ApplicationModuleInitializer eventExternalizationInitializer() {
        return () -> {};
    }
}
```

```yaml
spring:
  modulith:
    events:
      externalization:
        enabled: true
```

```java
// Mark events for externalization
@Externalized("order-events::#{orderId()}")
public record OrderCreatedEvent(
        Long orderId,
        Long customerId,
        Money totalAmount
) {}

// The routing key after :: is a SpEL expression for the Kafka message key
@Externalized("order-events::#{orderId()}")
public record OrderCompletedEvent(
        Long orderId,
        Long customerId,
        Instant completedAt
) {}
```

## 5. Module Verification and Testing

### 5.1 Architecture Verification

```java
@Test
void verifyModularStructure() {
    ApplicationModules modules = ApplicationModules.of(ShopApplication.class);

    // Verify no illegal dependencies between modules
    modules.verify();
}

@Test
void printModuleStructure() {
    ApplicationModules modules = ApplicationModules.of(ShopApplication.class);

    // Prints the module structure to console
    modules.forEach(System.out::println);

    // Output:
    // # Order
    // > Logical name: order
    // > Base package: com.example.shop.order
    // > Spring beans:
    //   + ....OrderService
    //   o ....internal.OrderRepository
    //   o ....internal.OrderValidator
    // > Published events:
    //   - OrderCreatedEvent
    //   - OrderCompletedEvent
    //   - OrderCancelledEvent
    // > Listened-to events: none
    // > Dependencies:
    //   - inventory (via InventoryService)
}
```

### 5.2 Module Integration Tests

```java
// Test the order module in isolation
@ApplicationModuleTest
class OrderModuleIntegrationTest {

    @Autowired
    private OrderService orderService;

    @Autowired
    private AssertablePublishedEvents events;

    @Test
    void creatingOrderPublishesEvent() {
        // Given
        CreateOrderRequest request = new CreateOrderRequest(
                42L,
                List.of(new LineItemRequest("SKU-001", 2, Money.of("29.99")))
        );

        // When
        Order order = orderService.createOrder(request);

        // Then
        assertThat(order.getId()).isNotNull();
        assertThat(order.getStatus()).isEqualTo(OrderStatus.PENDING);

        // Verify event was published
        events.assertThat()
                .contains(OrderCreatedEvent.class)
                .matching(e -> e.customerId().equals(42L))
                .matching(e -> e.totalAmount().equals(Money.of("59.98")));
    }

    @Test
    void cancellingOrderPublishesEvent() {
        Order order = orderService.createOrder(new CreateOrderRequest(
                42L, List.of(new LineItemRequest("SKU-001", 1, Money.of("10")))));

        orderService.cancelOrder(order.getId(), "Customer request");

        events.assertThat()
                .contains(OrderCancelledEvent.class)
                .matching(e -> e.orderId().equals(order.getId()))
                .matching(e -> e.reason().equals("Customer request"));
    }
}

// Test the inventory module reacting to order events
@ApplicationModuleTest
class InventoryModuleIntegrationTest {

    @Autowired
    private InventoryService inventoryService;

    @Autowired
    private Scenario scenario;

    @Test
    void reservesStockOnOrderCreated() {
        // When an OrderCreatedEvent is published
        scenario.publish(new OrderCreatedEvent(1L, 42L, Money.of("100")))
                // Then we expect stock to be reserved
                .andWaitForStateChange(() ->
                        inventoryService.getReservation(1L))
                .andVerify(reservation -> {
                    assertThat(reservation).isNotNull();
                    assertThat(reservation.getOrderId()).isEqualTo(1L);
                });
    }

    @Test
    void releasesStockOnOrderCancelled() {
        // Setup: create a reservation
        scenario.publish(new OrderCreatedEvent(2L, 42L, Money.of("50")))
                .andWaitForStateChange(() ->
                        inventoryService.getReservation(2L));

        // When order is cancelled
        scenario.publish(new OrderCancelledEvent(2L, 42L, "out of stock"))
                .andWaitForStateChange(() ->
                        inventoryService.getReservation(2L) == null)
                .andVerify(released -> assertThat(released).isTrue());
    }
}
```

## 6. Documentation Generation

```java
@Test
void generateDocumentation() {
    ApplicationModules modules = ApplicationModules.of(ShopApplication.class);

    // Generate PlantUML component diagram
    new Documenter(modules)
            .writeModulesAsPlantUml()                        // component diagram
            .writeIndividualModulesAsPlantUml()              // per-module diagrams
            .writeModuleCanvases(                            // module canvases
                    Documenter.CanvasOptions.defaults()
                            .withApiDoc(true));

    // Output goes to target/spring-modulith-docs/
    // - components.puml
    // - module-order.puml
    // - module-inventory.puml
    // - module-payment.puml
    // - module-notification.puml
    // - module-order.adoc  (AsciiDoc canvas)
}
```

## 7. Observability

Spring Modulith adds automatic observability for module interactions.

```java
@Configuration
class ObservabilityConfig {

    // Auto-configured when spring-modulith-observability is on classpath
    // Traces inter-module method calls and event publications
}
```

```yaml
# application.yml
management:
  tracing:
    sampling:
      probability: 1.0    # sample all in dev
  metrics:
    tags:
      application: shop
  endpoints:
    web:
      exposure:
        include: health,metrics,modulith

spring:
  modulith:
    observability:
      enabled: true
```

```java
// Custom metrics for module health
@Component
class ModuleHealthIndicator implements HealthIndicator {

    private final ApplicationModules modules;

    ModuleHealthIndicator() {
        this.modules = ApplicationModules.of(ShopApplication.class);
    }

    @Override
    public Health health() {
        try {
            modules.verify();
            return Health.up()
                    .withDetail("modules", modules.stream()
                            .map(m -> m.getName())
                            .toList())
                    .build();
        } catch (Exception e) {
            return Health.down(e).build();
        }
    }
}
```

## 8. Migration Path to Microservices

Spring Modulith is designed for incremental extraction. When a module proves it needs independent deployment, the migration steps are well-defined.

### 8.1 Step 1: Events Become Messages

```java
// Before: in-process event
events.publishEvent(new OrderCreatedEvent(orderId, customerId, total));

// After: externalized to Kafka (just add @Externalized)
@Externalized("order-events::#{orderId()}")
public record OrderCreatedEvent(Long orderId, Long customerId, Money totalAmount) {}
```

### 8.2 Step 2: Module API Becomes REST/gRPC

```java
// Before: direct method call within monolith
@Component
class OrderInventoryAdapter {

    private final InventoryService inventoryService;  // in-process

    boolean checkStock(Long productId, int quantity) {
        return inventoryService.isAvailable(productId, quantity);
    }
}

// After: HTTP client to extracted microservice
@Component
class OrderInventoryAdapter {

    private final RestClient inventoryClient;

    OrderInventoryAdapter(@Value("${inventory.service.url}") String baseUrl) {
        this.inventoryClient = RestClient.builder()
                .baseUrl(baseUrl)
                .build();
    }

    boolean checkStock(Long productId, int quantity) {
        StockResponse response = inventoryClient.get()
                .uri("/api/inventory/{productId}/availability?quantity={qty}",
                        productId, quantity)
                .retrieve()
                .body(StockResponse.class);
        return response.available();
    }
}
```

### 8.3 Step 3: Separate Database

```java
// Module already has its own repository and entities
// Migration: point the extracted service to its own database
// Use change data capture or dual writes during migration
```

## 9. Comparison: Modular Monolith vs Microservices Day 1

```
┌────────────────────────┬─────────────────────┬──────────────────────┐
│ Aspect                 │ Modular Monolith    │ Microservices Day 1  │
├────────────────────────┼─────────────────────┼──────────────────────┤
│ Deployment             │ Single artifact     │ N artifacts          │
│ Latency (inter-module) │ In-process (ns)     │ Network (ms)         │
│ Transactions           │ ACID, simple        │ Saga, eventual       │
│ Data consistency       │ Strong              │ Eventual             │
│ Debugging              │ Single process      │ Distributed tracing  │
│ Team size needed       │ Small (2-8)         │ Large (>10)          │
│ Infra complexity       │ Low                 │ High (K8s, mesh)     │
│ Module boundaries      │ Compile-time        │ Network-enforced     │
│ Refactoring            │ IDE-assisted        │ Cross-repo, risky    │
│ Independent scaling    │ No                  │ Yes                  │
│ Independent deploys    │ No                  │ Yes                  │
│ Fault isolation        │ Process-level       │ Service-level        │
│ Technology diversity   │ Single stack        │ Polyglot possible    │
│ Time to first feature  │ Fast                │ Slow (infra setup)   │
│ Migration to micro     │ Straightforward     │ N/A                  │
├────────────────────────┼─────────────────────┼──────────────────────┤
│ Start here when...     │ Team < 10, unclear  │ Known scaling needs, │
│                        │ domain boundaries,  │ large org, proven    │
│                        │ moving fast         │ bounded contexts     │
└────────────────────────┴─────────────────────┴──────────────────────┘
```

## 10. Complete Example: Module Bootstrapping

```java
// Main application
@SpringBootApplication
public class ShopApplication {
    public static void main(String[] args) {
        SpringApplication.run(ShopApplication.class, args);
    }
}

// Order module — public types
package com.example.shop.order;

public record CreateOrderRequest(
        Long customerId,
        List<LineItemRequest> items
) {}

public record LineItemRequest(
        String sku,
        int quantity,
        Money unitPrice
) {}

@Externalized("order-events::#{orderId()}")
public record OrderCreatedEvent(
        Long orderId,
        Long customerId,
        Money totalAmount
) {}

@Service
@Transactional
public class OrderService {

    private final OrderRepository repository;
    private final ApplicationEventPublisher events;

    OrderService(OrderRepository repository, ApplicationEventPublisher events) {
        this.repository = repository;
        this.events = events;
    }

    public Order createOrder(CreateOrderRequest request) {
        Order order = Order.create(request);
        order = repository.save(order);
        events.publishEvent(new OrderCreatedEvent(
                order.getId(), request.customerId(), order.getTotalAmount()));
        return order;
    }

    @Transactional(readOnly = true)
    public Order findById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new OrderNotFoundException(id));
    }
}

// Verification test
@Test
void modulesAreClean() {
    ApplicationModules.of(ShopApplication.class).verify();
}
```

Spring Modulith is the pragmatic choice for teams that want architectural discipline without the overhead of distributed systems. Start with a modular monolith, let the modules communicate through events, verify boundaries in tests, and extract to microservices only when a specific module has a proven need for independent deployment, scaling, or a different technology stack.
