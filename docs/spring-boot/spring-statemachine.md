---
title: "Spring State Machine"
description: "Comprehensive guide to Spring State Machine — state machine concepts, states/events/transitions, guards, actions, hierarchical states, regions, persistence, monitoring, and practical examples including order processing and approval workflows."
tags: [spring-statemachine, state-machine, workflow, events, java]
difficulty: advanced
prerequisites: [spring-boot-fundamentals, design-patterns, state-machine-concepts]
lastReviewed: "2026-03-25"
---

# Spring State Machine

Spring State Machine provides a framework for building state machine logic within Spring applications. It models complex domain behavior as explicit states and transitions, making business rules visible, testable, and maintainable.

## 1. Core Concepts

```
┌─────────────────────────────────────────────────────────────────┐
│                    State Machine                                 │
│                                                                  │
│  State: A condition or situation during the life of an object    │
│  Event: An occurrence that triggers a transition                 │
│  Transition: Movement from one state to another                  │
│  Guard: Condition that must be true for transition to fire       │
│  Action: Behavior executed during a transition                   │
│                                                                  │
│  [CREATED] ──SUBMIT──> [PENDING] ──APPROVE──> [APPROVED]        │
│                            │                                     │
│                          REJECT                                  │
│                            │                                     │
│                            ▼                                     │
│                       [REJECTED]                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.1 Dependencies

```xml
<dependency>
    <groupId>org.springframework.statemachine</groupId>
    <artifactId>spring-statemachine-starter</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.statemachine</groupId>
    <artifactId>spring-statemachine-data-jpa</artifactId>
</dependency>
```

## 2. Basic State Machine Configuration

### 2.1 Defining States and Events

```java
public enum OrderState {
    CREATED,
    PENDING_PAYMENT,
    PAID,
    PREPARING,
    READY_FOR_SHIPPING,
    SHIPPED,
    DELIVERED,
    CANCELLED,
    REFUNDED
}

public enum OrderEvent {
    SUBMIT,
    PAY,
    PAYMENT_FAILED,
    START_PREPARATION,
    PREPARATION_COMPLETE,
    SHIP,
    DELIVER,
    CANCEL,
    REQUEST_REFUND,
    REFUND_APPROVED
}
```

### 2.2 State Machine Configuration

```java
@Configuration
@EnableStateMachineFactory
public class OrderStateMachineConfig
        extends EnumStateMachineConfigurerAdapter<OrderState, OrderEvent> {

    @Override
    public void configure(StateMachineStateConfigurer<OrderState, OrderEvent> states)
            throws Exception {
        states
                .withStates()
                .initial(OrderState.CREATED)
                .end(OrderState.DELIVERED)
                .end(OrderState.CANCELLED)
                .end(OrderState.REFUNDED)
                .states(EnumSet.allOf(OrderState.class));
    }

    @Override
    public void configure(StateMachineTransitionConfigurer<OrderState, OrderEvent> transitions)
            throws Exception {
        transitions
                .withExternal()
                    .source(OrderState.CREATED)
                    .target(OrderState.PENDING_PAYMENT)
                    .event(OrderEvent.SUBMIT)
                    .action(submitAction())
                    .and()
                .withExternal()
                    .source(OrderState.PENDING_PAYMENT)
                    .target(OrderState.PAID)
                    .event(OrderEvent.PAY)
                    .guard(paymentGuard())
                    .action(paymentAction())
                    .and()
                .withExternal()
                    .source(OrderState.PENDING_PAYMENT)
                    .target(OrderState.CANCELLED)
                    .event(OrderEvent.PAYMENT_FAILED)
                    .action(paymentFailedAction())
                    .and()
                .withExternal()
                    .source(OrderState.PAID)
                    .target(OrderState.PREPARING)
                    .event(OrderEvent.START_PREPARATION)
                    .and()
                .withExternal()
                    .source(OrderState.PREPARING)
                    .target(OrderState.READY_FOR_SHIPPING)
                    .event(OrderEvent.PREPARATION_COMPLETE)
                    .and()
                .withExternal()
                    .source(OrderState.READY_FOR_SHIPPING)
                    .target(OrderState.SHIPPED)
                    .event(OrderEvent.SHIP)
                    .action(shipAction())
                    .and()
                .withExternal()
                    .source(OrderState.SHIPPED)
                    .target(OrderState.DELIVERED)
                    .event(OrderEvent.DELIVER)
                    .action(deliverAction())
                    .and()
                // Cancel from multiple states
                .withExternal()
                    .source(OrderState.CREATED)
                    .target(OrderState.CANCELLED)
                    .event(OrderEvent.CANCEL)
                    .and()
                .withExternal()
                    .source(OrderState.PENDING_PAYMENT)
                    .target(OrderState.CANCELLED)
                    .event(OrderEvent.CANCEL)
                    .and()
                .withExternal()
                    .source(OrderState.PAID)
                    .target(OrderState.CANCELLED)
                    .event(OrderEvent.CANCEL)
                    .guard(cancellationGuard())
                    .action(cancelAction())
                    .and()
                // Refund flow
                .withExternal()
                    .source(OrderState.DELIVERED)
                    .target(OrderState.REFUNDED)
                    .event(OrderEvent.REQUEST_REFUND)
                    .guard(refundEligibleGuard())
                    .action(refundAction());
    }

    @Override
    public void configure(StateMachineConfigurationConfigurer<OrderState, OrderEvent> config)
            throws Exception {
        config
                .withConfiguration()
                .autoStartup(false)
                .listener(orderStateMachineListener());
    }
}
```

## 3. Guards

Guards are boolean conditions that must be satisfied for a transition to proceed.

```java
@Component
public class OrderGuards {

    private final PaymentService paymentService;
    private final OrderRepository orderRepository;

    public OrderGuards(PaymentService paymentService, OrderRepository orderRepository) {
        this.paymentService = paymentService;
        this.orderRepository = orderRepository;
    }

    @Bean
    public Guard<OrderState, OrderEvent> paymentGuard() {
        return context -> {
            Long orderId = context.getExtendedState()
                    .get("orderId", Long.class);
            BigDecimal amount = context.getExtendedState()
                    .get("paymentAmount", BigDecimal.class);

            if (orderId == null || amount == null) {
                return false;
            }

            // Verify payment amount matches order total
            return orderRepository.findById(orderId)
                    .map(order -> order.getTotalAmount().compareTo(amount) == 0)
                    .orElse(false);
        };
    }

    @Bean
    public Guard<OrderState, OrderEvent> cancellationGuard() {
        return context -> {
            Long orderId = context.getExtendedState()
                    .get("orderId", Long.class);

            // Can only cancel if preparation hasn't started
            return orderRepository.findById(orderId)
                    .map(order -> !order.isPreparationStarted())
                    .orElse(false);
        };
    }

    @Bean
    public Guard<OrderState, OrderEvent> refundEligibleGuard() {
        return context -> {
            Long orderId = context.getExtendedState()
                    .get("orderId", Long.class);

            return orderRepository.findById(orderId)
                    .map(order -> {
                        // Refund eligible within 30 days of delivery
                        LocalDateTime deliveredAt = order.getDeliveredAt();
                        return deliveredAt != null &&
                                deliveredAt.plusDays(30).isAfter(LocalDateTime.now());
                    })
                    .orElse(false);
        };
    }
}
```

## 4. Actions

Actions execute business logic during state transitions.

```java
@Component
public class OrderActions {

    private static final Logger log = LoggerFactory.getLogger(OrderActions.class);
    private final OrderRepository orderRepository;
    private final PaymentService paymentService;
    private final NotificationService notificationService;
    private final ShippingService shippingService;

    public OrderActions(OrderRepository orderRepository,
                         PaymentService paymentService,
                         NotificationService notificationService,
                         ShippingService shippingService) {
        this.orderRepository = orderRepository;
        this.paymentService = paymentService;
        this.notificationService = notificationService;
        this.shippingService = shippingService;
    }

    @Bean
    public Action<OrderState, OrderEvent> submitAction() {
        return context -> {
            Long orderId = context.getExtendedState().get("orderId", Long.class);
            log.info("Order {} submitted, transitioning to PENDING_PAYMENT", orderId);

            orderRepository.findById(orderId).ifPresent(order -> {
                order.setSubmittedAt(LocalDateTime.now());
                order.setPaymentDeadline(LocalDateTime.now().plusHours(24));
                orderRepository.save(order);
            });

            notificationService.sendOrderConfirmation(orderId);
        };
    }

    @Bean
    public Action<OrderState, OrderEvent> paymentAction() {
        return context -> {
            Long orderId = context.getExtendedState().get("orderId", Long.class);
            String paymentId = context.getExtendedState()
                    .get("paymentId", String.class);
            log.info("Payment {} received for order {}", paymentId, orderId);

            orderRepository.findById(orderId).ifPresent(order -> {
                order.setPaymentId(paymentId);
                order.setPaidAt(LocalDateTime.now());
                orderRepository.save(order);
            });

            notificationService.sendPaymentConfirmation(orderId);
        };
    }

    @Bean
    public Action<OrderState, OrderEvent> paymentFailedAction() {
        return context -> {
            Long orderId = context.getExtendedState().get("orderId", Long.class);
            String reason = context.getExtendedState()
                    .get("failureReason", String.class);
            log.warn("Payment failed for order {}: {}", orderId, reason);

            notificationService.sendPaymentFailure(orderId, reason);
        };
    }

    @Bean
    public Action<OrderState, OrderEvent> shipAction() {
        return context -> {
            Long orderId = context.getExtendedState().get("orderId", Long.class);

            orderRepository.findById(orderId).ifPresent(order -> {
                String trackingNumber = shippingService.createShipment(order);
                order.setTrackingNumber(trackingNumber);
                order.setShippedAt(LocalDateTime.now());
                orderRepository.save(order);

                // Store tracking in extended state for downstream
                context.getExtendedState().getVariables()
                        .put("trackingNumber", trackingNumber);
            });

            notificationService.sendShippingNotification(orderId);
        };
    }

    @Bean
    public Action<OrderState, OrderEvent> deliverAction() {
        return context -> {
            Long orderId = context.getExtendedState().get("orderId", Long.class);
            log.info("Order {} delivered", orderId);

            orderRepository.findById(orderId).ifPresent(order -> {
                order.setDeliveredAt(LocalDateTime.now());
                orderRepository.save(order);
            });

            notificationService.sendDeliveryConfirmation(orderId);
        };
    }

    @Bean
    public Action<OrderState, OrderEvent> cancelAction() {
        return context -> {
            Long orderId = context.getExtendedState().get("orderId", Long.class);
            log.info("Order {} cancelled", orderId);

            orderRepository.findById(orderId).ifPresent(order -> {
                order.setCancelledAt(LocalDateTime.now());
                orderRepository.save(order);

                // Initiate refund if already paid
                if (order.getPaymentId() != null) {
                    paymentService.refund(order.getPaymentId(), order.getTotalAmount());
                }
            });

            notificationService.sendCancellationNotification(orderId);
        };
    }

    @Bean
    public Action<OrderState, OrderEvent> refundAction() {
        return context -> {
            Long orderId = context.getExtendedState().get("orderId", Long.class);
            log.info("Refund processed for order {}", orderId);

            orderRepository.findById(orderId).ifPresent(order -> {
                paymentService.refund(order.getPaymentId(), order.getTotalAmount());
                order.setRefundedAt(LocalDateTime.now());
                orderRepository.save(order);
            });

            notificationService.sendRefundConfirmation(orderId);
        };
    }

    // Error action — called when an action throws an exception
    @Bean
    public Action<OrderState, OrderEvent> errorAction() {
        return context -> {
            Exception exception = context.getException();
            log.error("State machine error in state {}: {}",
                    context.getSource().getId(), exception.getMessage(), exception);
            // Store error for inspection
            context.getExtendedState().getVariables()
                    .put("error", exception.getMessage());
        };
    }
}
```

## 5. State Machine Service

```java
@Service
public class OrderStateMachineService {

    private static final Logger log = LoggerFactory.getLogger(OrderStateMachineService.class);
    private final StateMachineFactory<OrderState, OrderEvent> factory;
    private final StateMachinePersister<OrderState, OrderEvent, String> persister;
    private final OrderRepository orderRepository;

    public OrderStateMachineService(
            StateMachineFactory<OrderState, OrderEvent> factory,
            StateMachinePersister<OrderState, OrderEvent, String> persister,
            OrderRepository orderRepository) {
        this.factory = factory;
        this.persister = persister;
        this.orderRepository = orderRepository;
    }

    public OrderState sendEvent(Long orderId, OrderEvent event,
                                 Map<String, Object> variables) {
        StateMachine<OrderState, OrderEvent> sm = buildStateMachine(orderId);

        // Set extended state variables
        if (variables != null) {
            sm.getExtendedState().getVariables().putAll(variables);
        }
        sm.getExtendedState().getVariables().put("orderId", orderId);

        // Send event
        Message<OrderEvent> message = MessageBuilder
                .withPayload(event)
                .setHeader("orderId", orderId)
                .build();

        boolean accepted = sm.sendEvent(Mono.just(message))
                .blockLast()
                .getResultType() == StateMachineEventResult.ResultType.ACCEPTED;

        if (!accepted) {
            log.warn("Event {} not accepted in state {} for order {}",
                    event, sm.getState().getId(), orderId);
            throw new InvalidStateTransitionException(
                    sm.getState().getId(), event, orderId);
        }

        OrderState newState = sm.getState().getId();

        // Persist state machine context
        try {
            persister.persist(sm, String.valueOf(orderId));
        } catch (Exception e) {
            log.error("Failed to persist state machine for order {}", orderId, e);
            throw new RuntimeException("State persistence failed", e);
        }

        // Update order entity
        orderRepository.findById(orderId).ifPresent(order -> {
            order.setState(newState);
            orderRepository.save(order);
        });

        sm.stopReactively().block();
        return newState;
    }

    public OrderState getCurrentState(Long orderId) {
        StateMachine<OrderState, OrderEvent> sm = buildStateMachine(orderId);
        OrderState state = sm.getState().getId();
        sm.stopReactively().block();
        return state;
    }

    private StateMachine<OrderState, OrderEvent> buildStateMachine(Long orderId) {
        StateMachine<OrderState, OrderEvent> sm =
                factory.getStateMachine(String.valueOf(orderId));

        sm.stopReactively().block();

        try {
            persister.restore(sm, String.valueOf(orderId));
        } catch (Exception e) {
            // First time — no persisted state, start fresh
            sm.startReactively().block();
        }

        return sm;
    }
}
```

## 6. Persistence

### 6.1 JPA Persistence

```java
@Configuration
public class StateMachinePersistenceConfig {

    @Bean
    public StateMachineRuntimePersister<OrderState, OrderEvent, String>
            stateMachineRuntimePersister(
                    JpaStateMachineRepository jpaStateMachineRepository) {
        return new JpaPersistingStateMachineInterceptor<>(jpaStateMachineRepository);
    }

    @Bean
    public StateMachinePersister<OrderState, OrderEvent, String>
            stateMachinePersister(
                    StateMachineRuntimePersister<OrderState, OrderEvent, String> persister) {
        return new DefaultStateMachinePersister<>(persister);
    }
}
```

### 6.2 Custom Redis Persistence

```java
@Component
public class RedisStateMachinePersist
        implements StateMachinePersist<OrderState, OrderEvent, String> {

    private final RedisTemplate<String, StateMachineContext<OrderState, OrderEvent>> redisTemplate;

    public RedisStateMachinePersist(
            RedisTemplate<String, StateMachineContext<OrderState, OrderEvent>> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Override
    public void write(StateMachineContext<OrderState, OrderEvent> context,
                      String contextObj) {
        redisTemplate.opsForValue().set(
                "sm:" + contextObj, context,
                Duration.ofDays(30));
    }

    @Override
    public StateMachineContext<OrderState, OrderEvent> read(String contextObj) {
        return redisTemplate.opsForValue().get("sm:" + contextObj);
    }
}
```

## 7. Hierarchical States

```java
@Configuration
@EnableStateMachineFactory
public class HierarchicalStateMachineConfig
        extends EnumStateMachineConfigurerAdapter<ApprovalState, ApprovalEvent> {

    @Override
    public void configure(StateMachineStateConfigurer<ApprovalState, ApprovalEvent> states)
            throws Exception {
        states
                .withStates()
                    .initial(ApprovalState.DRAFT)
                    .state(ApprovalState.IN_REVIEW)
                    .end(ApprovalState.APPROVED)
                    .end(ApprovalState.REJECTED)
                    .and()
                // Sub-states of IN_REVIEW
                .withStates()
                    .parent(ApprovalState.IN_REVIEW)
                    .initial(ApprovalState.MANAGER_REVIEW)
                    .state(ApprovalState.DIRECTOR_REVIEW)
                    .state(ApprovalState.VP_REVIEW);
    }

    @Override
    public void configure(StateMachineTransitionConfigurer<ApprovalState, ApprovalEvent> transitions)
            throws Exception {
        transitions
                .withExternal()
                    .source(ApprovalState.DRAFT)
                    .target(ApprovalState.IN_REVIEW)
                    .event(ApprovalEvent.SUBMIT)
                    .and()
                // Sub-state transitions
                .withExternal()
                    .source(ApprovalState.MANAGER_REVIEW)
                    .target(ApprovalState.DIRECTOR_REVIEW)
                    .event(ApprovalEvent.APPROVE)
                    .guard(requiresDirectorApproval())
                    .and()
                .withExternal()
                    .source(ApprovalState.MANAGER_REVIEW)
                    .target(ApprovalState.APPROVED)
                    .event(ApprovalEvent.APPROVE)
                    .guard(managerCanFinalApprove())
                    .and()
                .withExternal()
                    .source(ApprovalState.DIRECTOR_REVIEW)
                    .target(ApprovalState.VP_REVIEW)
                    .event(ApprovalEvent.APPROVE)
                    .guard(requiresVpApproval())
                    .and()
                .withExternal()
                    .source(ApprovalState.DIRECTOR_REVIEW)
                    .target(ApprovalState.APPROVED)
                    .event(ApprovalEvent.APPROVE)
                    .and()
                .withExternal()
                    .source(ApprovalState.VP_REVIEW)
                    .target(ApprovalState.APPROVED)
                    .event(ApprovalEvent.APPROVE)
                    .and()
                // Reject from any review sub-state exits IN_REVIEW
                .withExternal()
                    .source(ApprovalState.IN_REVIEW)
                    .target(ApprovalState.REJECTED)
                    .event(ApprovalEvent.REJECT);
    }

    @Bean
    public Guard<ApprovalState, ApprovalEvent> requiresDirectorApproval() {
        return ctx -> {
            BigDecimal amount = ctx.getExtendedState().get("amount", BigDecimal.class);
            return amount != null && amount.compareTo(new BigDecimal("10000")) > 0;
        };
    }

    @Bean
    public Guard<ApprovalState, ApprovalEvent> managerCanFinalApprove() {
        return ctx -> {
            BigDecimal amount = ctx.getExtendedState().get("amount", BigDecimal.class);
            return amount != null && amount.compareTo(new BigDecimal("10000")) <= 0;
        };
    }

    @Bean
    public Guard<ApprovalState, ApprovalEvent> requiresVpApproval() {
        return ctx -> {
            BigDecimal amount = ctx.getExtendedState().get("amount", BigDecimal.class);
            return amount != null && amount.compareTo(new BigDecimal("50000")) > 0;
        };
    }
}

public enum ApprovalState {
    DRAFT,
    IN_REVIEW,
    MANAGER_REVIEW,
    DIRECTOR_REVIEW,
    VP_REVIEW,
    APPROVED,
    REJECTED
}

public enum ApprovalEvent {
    SUBMIT,
    APPROVE,
    REJECT,
    RETURN_TO_DRAFT
}
```

## 8. State Machine Listener

```java
@Component
public class OrderStateMachineListener
        extends StateMachineListenerAdapter<OrderState, OrderEvent> {

    private static final Logger log = LoggerFactory.getLogger(
            OrderStateMachineListener.class);
    private final MeterRegistry meterRegistry;

    public OrderStateMachineListener(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    @Override
    public void stateChanged(State<OrderState, OrderEvent> from,
                              State<OrderState, OrderEvent> to) {
        String fromState = from != null ? from.getId().name() : "NONE";
        String toState = to != null ? to.getId().name() : "NONE";
        log.info("State transition: {} -> {}", fromState, toState);

        meterRegistry.counter("statemachine.transition",
                "from", fromState,
                "to", toState)
                .increment();
    }

    @Override
    public void eventNotAccepted(Message<OrderEvent> event) {
        log.warn("Event not accepted: {}", event.getPayload());
        meterRegistry.counter("statemachine.event.rejected",
                "event", event.getPayload().name())
                .increment();
    }

    @Override
    public void stateMachineError(StateMachine<OrderState, OrderEvent> stateMachine,
                                   Exception exception) {
        log.error("State machine error in state {}: {}",
                stateMachine.getState().getId(), exception.getMessage(), exception);
        meterRegistry.counter("statemachine.error",
                "state", stateMachine.getState().getId().name())
                .increment();
    }

    @Override
    public void transitionStarted(Transition<OrderState, OrderEvent> transition) {
        if (transition.getKind() == TransitionKind.EXTERNAL) {
            log.debug("Transition started: {} -> {} on event {}",
                    transition.getSource().getId(),
                    transition.getTarget().getId(),
                    transition.getTrigger().getEvent());
        }
    }
}
```

## 9. REST Controller

```java
@RestController
@RequestMapping("/api/orders/{orderId}/state")
public class OrderStateController {

    private final OrderStateMachineService stateMachineService;

    public OrderStateController(OrderStateMachineService stateMachineService) {
        this.stateMachineService = stateMachineService;
    }

    @GetMapping
    public ResponseEntity<OrderStateResponse> getState(@PathVariable Long orderId) {
        OrderState state = stateMachineService.getCurrentState(orderId);
        return ResponseEntity.ok(new OrderStateResponse(orderId, state));
    }

    @PostMapping("/submit")
    public ResponseEntity<OrderStateResponse> submit(@PathVariable Long orderId) {
        OrderState newState = stateMachineService.sendEvent(
                orderId, OrderEvent.SUBMIT, null);
        return ResponseEntity.ok(new OrderStateResponse(orderId, newState));
    }

    @PostMapping("/pay")
    public ResponseEntity<OrderStateResponse> pay(
            @PathVariable Long orderId,
            @RequestBody PaymentRequest payment) {
        Map<String, Object> vars = Map.of(
                "paymentId", payment.getPaymentId(),
                "paymentAmount", payment.getAmount()
        );
        OrderState newState = stateMachineService.sendEvent(
                orderId, OrderEvent.PAY, vars);
        return ResponseEntity.ok(new OrderStateResponse(orderId, newState));
    }

    @PostMapping("/cancel")
    public ResponseEntity<OrderStateResponse> cancel(@PathVariable Long orderId) {
        OrderState newState = stateMachineService.sendEvent(
                orderId, OrderEvent.CANCEL, null);
        return ResponseEntity.ok(new OrderStateResponse(orderId, newState));
    }

    @PostMapping("/ship")
    public ResponseEntity<OrderStateResponse> ship(@PathVariable Long orderId) {
        OrderState newState = stateMachineService.sendEvent(
                orderId, OrderEvent.SHIP, null);
        return ResponseEntity.ok(new OrderStateResponse(orderId, newState));
    }

    @PostMapping("/deliver")
    public ResponseEntity<OrderStateResponse> deliver(@PathVariable Long orderId) {
        OrderState newState = stateMachineService.sendEvent(
                orderId, OrderEvent.DELIVER, null);
        return ResponseEntity.ok(new OrderStateResponse(orderId, newState));
    }

    @ExceptionHandler(InvalidStateTransitionException.class)
    public ResponseEntity<Map<String, String>> handleInvalidTransition(
            InvalidStateTransitionException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of(
                        "error", "Invalid state transition",
                        "currentState", e.getCurrentState().name(),
                        "attemptedEvent", e.getEvent().name(),
                        "message", e.getMessage()
                ));
    }
}
```

## 10. Testing State Machines

```java
@SpringBootTest
class OrderStateMachineTest {

    @Autowired
    private StateMachineFactory<OrderState, OrderEvent> factory;

    @Autowired
    private StateMachinePersister<OrderState, OrderEvent, String> persister;

    private StateMachine<OrderState, OrderEvent> sm;

    @BeforeEach
    void setup() {
        sm = factory.getStateMachine("test-" + UUID.randomUUID());
        sm.startReactively().block();
    }

    @AfterEach
    void teardown() {
        sm.stopReactively().block();
    }

    @Test
    void happyPath() {
        sm.getExtendedState().getVariables().put("orderId", 1L);
        sm.getExtendedState().getVariables()
                .put("paymentAmount", new BigDecimal("100.00"));
        sm.getExtendedState().getVariables().put("paymentId", "PAY-123");

        assertThat(sm.getState().getId()).isEqualTo(OrderState.CREATED);

        sendEvent(OrderEvent.SUBMIT);
        assertThat(sm.getState().getId()).isEqualTo(OrderState.PENDING_PAYMENT);

        sendEvent(OrderEvent.PAY);
        assertThat(sm.getState().getId()).isEqualTo(OrderState.PAID);

        sendEvent(OrderEvent.START_PREPARATION);
        assertThat(sm.getState().getId()).isEqualTo(OrderState.PREPARING);

        sendEvent(OrderEvent.PREPARATION_COMPLETE);
        assertThat(sm.getState().getId()).isEqualTo(OrderState.READY_FOR_SHIPPING);

        sendEvent(OrderEvent.SHIP);
        assertThat(sm.getState().getId()).isEqualTo(OrderState.SHIPPED);

        sendEvent(OrderEvent.DELIVER);
        assertThat(sm.getState().getId()).isEqualTo(OrderState.DELIVERED);
        assertThat(sm.isComplete()).isTrue();
    }

    @Test
    void cancellationFromPendingPayment() {
        sm.getExtendedState().getVariables().put("orderId", 2L);

        sendEvent(OrderEvent.SUBMIT);
        assertThat(sm.getState().getId()).isEqualTo(OrderState.PENDING_PAYMENT);

        sendEvent(OrderEvent.CANCEL);
        assertThat(sm.getState().getId()).isEqualTo(OrderState.CANCELLED);
        assertThat(sm.isComplete()).isTrue();
    }

    @Test
    void invalidTransition_shipBeforePay() {
        sm.getExtendedState().getVariables().put("orderId", 3L);

        sendEvent(OrderEvent.SUBMIT);

        // Cannot ship without paying
        StateMachineEventResult<OrderState, OrderEvent> result =
                sm.sendEvent(Mono.just(MessageBuilder
                        .withPayload(OrderEvent.SHIP).build()))
                .blockLast();

        assertThat(result.getResultType())
                .isEqualTo(StateMachineEventResult.ResultType.DENIED);
        assertThat(sm.getState().getId()).isEqualTo(OrderState.PENDING_PAYMENT);
    }

    private void sendEvent(OrderEvent event) {
        sm.sendEvent(Mono.just(MessageBuilder.withPayload(event).build()))
                .blockLast();
    }
}
```

Spring State Machine makes complex business workflows explicit and testable. Define your domain states and events as enums, wire up guards and actions for business logic, and persist state machine context for durability. For very simple state flows, a plain enum with switch statements may suffice; reach for Spring State Machine when you have hierarchical states, complex guard conditions, or need persistence and monitoring of state transitions.
