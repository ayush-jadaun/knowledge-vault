---
title: "Spring Modulith"
description: "Complete guide to Spring Modulith — modular monolith architecture, defining module boundaries with @ApplicationModule, event-based interaction between modules, module verification testing, documentation generation, and incremental migration to microservices"
tags: [spring-boot, modulith, modular-monolith, architecture, modules]
difficulty: advanced
prerequisites: []
lastReviewed: "2026-03-25"
---

# Spring Modulith

The microservices vs. monolith debate creates a false dichotomy. The real enemy is not the monolith — it is the **big ball of mud**: a codebase where everything depends on everything else, boundaries are unclear, and changing one module breaks five others. A well-structured modular monolith gives you the architectural clarity of microservices (clear boundaries, loose coupling, independent modules) without the operational complexity (network calls, distributed transactions, deployment orchestration).

Spring Modulith is a Spring project that helps you build modular monoliths. It enforces module boundaries at compile and test time, provides event-based inter-module communication, generates architecture documentation, and creates a migration path to microservices when (and if) you need it.

## Why Modular Monolith

```
Big Ball of Mud (Bad Monolith):
──────────────────────────────
┌──────────────────────────────────────────┐
│  OrderService → UserRepository           │
│  UserService → OrderRepository           │
│  PaymentController → InventoryService    │
│  InventoryService → UserService          │
│  Everything calls everything.            │
│  No boundaries. No rules.                │
└──────────────────────────────────────────┘

Modular Monolith (Spring Modulith):
───────────────────────────────────
┌──────────────────────────────────────────┐
│  ┌──────────┐    ┌──────────┐            │
│  │  Order    │←──│ Payment  │            │
│  │  Module   │   │ Module   │            │
│  └────┬─────┘    └──────────┘            │
│       │ event                             │
│       ▼                                   │
│  ┌──────────┐    ┌──────────┐            │
│  │ Inventory │    │  User    │            │
│  │  Module   │    │  Module  │            │
│  └──────────┘    └──────────┘            │
│                                           │
│  Modules communicate through events and  │
│  well-defined APIs. No cross-module      │
│  repository access.                       │
└──────────────────────────────────────────┘

Microservices (When You Actually Need Them):
────────────────────────────────────────────
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Order    │  │ Payment  │  │ Inventory│
│  Service  │  │ Service  │  │ Service  │
│  (Java)   │  │ (Java)   │  │ (Go)    │
└──────────┘  └──────────┘  └──────────┘
     Network calls, separate DBs, separate deployments
```

## Setup

```xml
<dependency>
    <groupId>org.springframework.modulith</groupId>
    <artifactId>spring-modulith-starter-core</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.modulith</groupId>
    <artifactId>spring-modulith-starter-test</artifactId>
    <scope>test</scope>
</dependency>
<!-- Optional: for event externalization to Kafka/RabbitMQ -->
<dependency>
    <groupId>org.springframework.modulith</groupId>
    <artifactId>spring-modulith-events-kafka</artifactId>
</dependency>
```

Use the Spring Modulith BOM:

```xml
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>org.springframework.modulith</groupId>
            <artifactId>spring-modulith-bom</artifactId>
            <version>1.2.0</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>
```

## Module Structure

Spring Modulith uses the package structure to define modules. Each direct sub-package of the main application package is a module:

```
com.example.myapp/                    ← Application root
├── MyApplication.java
├── order/                            ← "order" module
│   ├── Order.java                    ← Public API (exposed)
│   ├── OrderService.java            ← Public API (exposed)
│   ├── OrderManagement.java         ← Public API (exposed)
│   └── internal/                    ← Private (NOT accessible to other modules)
│       ├── OrderRepository.java
│       ├── OrderEventHandler.java
│       └── OrderMapper.java
├── payment/                          ← "payment" module
│   ├── PaymentService.java          ← Public API
│   ├── PaymentCompleted.java        ← Event (part of public API)
│   └── internal/
│       ├── PaymentGateway.java
│       ├── PaymentRepository.java
│       └── StripeAdapter.java
├── inventory/                        ← "inventory" module
│   ├── InventoryService.java
│   ├── StockLevel.java
│   └── internal/
│       ├── InventoryRepository.java
│       └── WarehouseClient.java
└── user/                             ← "user" module
    ├── User.java
    ├── UserService.java
    └── internal/
        ├── UserRepository.java
        └── UserMapper.java
```

### Rules

1. **Module root package** = direct sub-package of the application root
2. **Public API** = types in the module root package (not in sub-packages)
3. **Internal** = types in sub-packages (e.g., `order.internal`) are NOT accessible to other modules
4. **No cross-module repository access** — modules only interact through their public APIs and events

## @ApplicationModule

Explicit module configuration:

```java
// com/example/myapp/order/package-info.java
@org.springframework.modulith.ApplicationModule(
    allowedDependencies = {"user", "inventory"}
)
package com.example.myapp.order;
```

```java
// com/example/myapp/payment/package-info.java
@org.springframework.modulith.ApplicationModule(
    allowedDependencies = {"order", "user"},
    type = ApplicationModule.Type.OPEN  // All types are accessible (less strict)
)
package com.example.myapp.payment;
```

### Named Interface (Exposing Specific Sub-Packages)

By default, only the module root package is the public API. To expose additional packages:

```java
// com/example/myapp/order/package-info.java
@org.springframework.modulith.ApplicationModule
@org.springframework.modulith.NamedInterface("events")
package com.example.myapp.order;
```

```java
// com/example/myapp/order/events/package-info.java
@org.springframework.modulith.NamedInterface("events")
package com.example.myapp.order.events;
```

Other modules can depend on specific named interfaces:

```java
@ApplicationModule(
    allowedDependencies = {"order :: events"}  // Only events, not full order API
)
package com.example.myapp.notification;
```

## Inter-Module Communication with Events

Modules should not call each other directly for state changes. Use application events for loose coupling:

### Publishing Events

```java
// order module — public event
package com.example.myapp.order;

public record OrderPlacedEvent(
        String orderId,
        String customerId,
        BigDecimal totalAmount,
        List<LineItem> items,
        Instant placedAt
) {
    public record LineItem(String productId, int quantity, BigDecimal unitPrice) {}
}

public record OrderCancelledEvent(
        String orderId,
        String customerId,
        String reason,
        Instant cancelledAt
) {}
```

```java
// order module — service publishes events
package com.example.myapp.order;

@Service
@Transactional
public class OrderService {

    private final ApplicationEventPublisher events;
    private final OrderRepository orderRepository;

    public Order placeOrder(CreateOrderCommand command) {
        Order order = Order.create(command);
        orderRepository.save(order);

        events.publishEvent(new OrderPlacedEvent(
                order.getId(),
                order.getCustomerId(),
                order.getTotalAmount(),
                order.getLineItems(),
                Instant.now()
        ));

        return order;
    }
}
```

### Consuming Events in Other Modules

```java
// inventory module
package com.example.myapp.inventory.internal;

@Component
@Transactional
class InventoryEventHandler {

    private final InventoryRepository inventoryRepo;

    @ApplicationModuleListener  // Spring Modulith-aware listener
    void on(OrderPlacedEvent event) {
        for (OrderPlacedEvent.LineItem item : event.items()) {
            inventoryRepo.decreaseStock(item.productId(), item.quantity());
        }
    }

    @ApplicationModuleListener
    void on(OrderCancelledEvent event) {
        // Restore stock
    }
}
```

```java
// notification module
package com.example.myapp.notification.internal;

@Component
class NotificationEventHandler {

    @ApplicationModuleListener
    void on(OrderPlacedEvent event) {
        notificationService.sendOrderConfirmation(
                event.customerId(), event.orderId());
    }
}
```

### Event Externalization

When you eventually split modules into separate services, externalize events to Kafka or RabbitMQ:

```java
@Configuration
class EventExternalizationConfig {

    @Bean
    EventExternalizationConfiguration eventExternalizationConfiguration() {
        return EventExternalizationConfiguration.externalizing()
                .select(EventExternalizationConfiguration.annotatedAsExternalized())
                .build();
    }
}
```

Mark events for externalization:

```java
@Externalized("orders")  // Kafka topic or RabbitMQ exchange
public record OrderPlacedEvent(
        String orderId,
        String customerId,
        BigDecimal totalAmount
) {}
```

## Module Verification Testing

The killer feature: verify that modules respect their boundaries:

```java
@Test
void verifyModuleStructure() {
    ApplicationModules modules = ApplicationModules.of(MyApplication.class);
    modules.verify();
}
```

This test **fails** if:
- A module accesses another module's internal types
- A module depends on a module not listed in `allowedDependencies`
- Circular dependencies exist between modules

### Detailed Module Inspection

```java
@Test
void inspectModules() {
    ApplicationModules modules = ApplicationModules.of(MyApplication.class);

    // Print module structure
    modules.forEach(module -> {
        System.out.println("Module: " + module.getName());
        System.out.println("  Base package: " + module.getBasePackage());
        System.out.println("  Dependencies: " + module.getDependencies(modules));
        System.out.println("  Published events: " + module.getPublishedEvents());
        System.out.println("  Listened events: " + module.getEventsListenedTo(modules));
    });
}
```

### Individual Module Testing

Test a single module in isolation:

```java
@ApplicationModuleTest
class OrderModuleTest {

    @Autowired
    private OrderService orderService;

    @Test
    void shouldCreateOrder(Scenario scenario) {
        // Scenario-based testing for event-driven modules
        scenario.stimulate(() -> orderService.placeOrder(testCommand()))
                .andWaitForEventOfType(OrderPlacedEvent.class)
                .matching(event -> event.orderId() != null)
                .toArriveAndVerify(event -> {
                    assertThat(event.totalAmount())
                            .isEqualByComparingTo(new BigDecimal("99.99"));
                });
    }
}
```

### Testing Event Publication

```java
@ApplicationModuleTest
class OrderModuleIntegrationTest {

    @Autowired
    private OrderService orderService;

    @Autowired
    private PublishedEvents publishedEvents;

    @Test
    void shouldPublishOrderPlacedEvent() {
        orderService.placeOrder(testCommand());

        var matchingEvents = publishedEvents
                .ofType(OrderPlacedEvent.class)
                .matching(e -> e.customerId().equals("cust-123"));

        assertThat(matchingEvents).hasSize(1);
    }
}
```

## Documentation Generation

Generate architecture documentation from your module structure:

```java
@Test
void generateDocumentation() {
    ApplicationModules modules = ApplicationModules.of(MyApplication.class);

    // Generate PlantUML diagrams
    new Documenter(modules)
            .writeModulesAsPlantUml()        // Component diagram
            .writeIndividualModulesAsPlantUml()  // Per-module diagrams
            .writeModuleCanvases();          // Module canvas (events, API)
}
```

This generates PlantUML diagrams showing:
- Module dependencies
- Event flows between modules
- Public API of each module
- Which events each module publishes and consumes

## Migration to Microservices

The modular monolith is a stepping stone. When a module needs independent scaling, a separate tech stack, or a separate deployment cycle, extract it:

```
Step 1: Modular Monolith (you are here)
────────────────────────────────────────
All modules in one process, events are in-process

Step 2: Externalize Events
──────────────────────────
Events go through Kafka. Modules still in one process,
but event consumers could be anywhere.

Step 3: Extract Module
──────────────────────
Move the module to its own service. Events already
flow through Kafka. Minimal changes needed.

Step 4: Separate Database
─────────────────────────
Give the extracted service its own database.
Use events for data synchronization.
```

### What Makes Extraction Easy

| Property | Enables |
|----------|---------|
| Events for inter-module communication | No synchronous coupling to break |
| Module has its own entities | Data is already separated |
| Module tests pass in isolation | Service will work independently |
| No shared database tables | No schema splitting needed |
| No cross-module transactions | No distributed transaction coordination |

### What Makes Extraction Hard

| Property | Problem |
|----------|---------|
| Cross-module JOINs | Must be replaced with API calls or data replication |
| Shared entities | Must be duplicated or accessed via API |
| Synchronous dependencies | Must become async events or API calls |
| Shared transactions | Must become saga/choreography patterns |

## Patterns for Module Design

### Module API Design

```java
// order module public API — only these types are visible to other modules
package com.example.myapp.order;

// Service interface (the primary API)
public interface OrderManagement {
    Order placeOrder(CreateOrderCommand command);
    Optional<Order> findById(String orderId);
    void cancelOrder(String orderId, String reason);
}

// Value object (read-only view)
public record OrderSummary(
    String orderId,
    String customerId,
    BigDecimal totalAmount,
    OrderStatus status,
    Instant placedAt
) {}

// Events (part of the API contract)
public record OrderPlacedEvent(String orderId, String customerId, BigDecimal totalAmount) {}
public record OrderCancelledEvent(String orderId, String reason) {}

// Command (input to the module)
public record CreateOrderCommand(
    String customerId,
    List<LineItem> items,
    ShippingAddress address
) {}
```

### Avoiding Cross-Module Data Access

```java
// BAD: Payment module directly accessing Order repository
package com.example.myapp.payment.internal;

class PaymentProcessor {
    @Autowired
    private OrderRepository orderRepository;  // VIOLATION — Order's internal type!
}

// GOOD: Payment module uses Order's public API
package com.example.myapp.payment.internal;

class PaymentProcessor {
    private final OrderManagement orderManagement;  // Order module's public API

    void processPayment(String orderId, PaymentDetails details) {
        OrderSummary order = orderManagement.findById(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        // Process payment using order summary
    }
}
```

## Module Design Checklist

| Check | Question |
|-------|----------|
| Boundary | Does this module have a clear, single responsibility? |
| API surface | Is the public API minimal? Are internals in sub-packages? |
| Dependencies | Does this module depend on at most 2-3 other modules? |
| Events | Are cross-module state changes communicated via events? |
| Data ownership | Does this module own its data? No shared tables? |
| Testability | Can this module be tested in isolation? |
| Extractability | Could this module become a separate service if needed? |

Spring Modulith brings the discipline of microservice architecture to the simplicity of a monolith. You get explicit module boundaries, enforced dependency rules, event-driven communication, and automated documentation — all while deploying a single application. Start as a modular monolith, prove your module boundaries are correct through real usage, and extract services only when the operational benefits justify the complexity cost.
