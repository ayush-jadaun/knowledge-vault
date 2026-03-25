---
title: "Spring Integration"
description: "Enterprise Integration Patterns with Spring Integration — message channels, endpoints, transformers, filters, routers, splitters/aggregators, service activators, gateways, adapters (file, FTP, JDBC, AMQP, Kafka, HTTP), Java DSL integration flows, error handling, and testing strategies."
tags: [spring-integration, eip, messaging, integration, java]
difficulty: advanced
prerequisites: [spring-boot-fundamentals, messaging-concepts, enterprise-integration-patterns]
lastReviewed: "2026-03-25"
---

# Spring Integration

Spring Integration implements the patterns described in Gregor Hohpe and Bobby Woolf's *Enterprise Integration Patterns* (EIP) as first-class Spring components. It provides a lightweight, event-driven messaging framework that connects in-process components and external systems through a consistent programming model.

## 1. Core Concepts

```
┌──────────────────────────────────────────────────────────────────┐
│                     Spring Integration                           │
│                                                                  │
│  Producer ──> Channel ──> Endpoint ──> Channel ──> Consumer      │
│                                                                  │
│  Endpoints:  Filter, Transformer, Router, Splitter,              │
│              Aggregator, Service Activator, Gateway               │
│                                                                  │
│  Adapters:   File, FTP, JDBC, JMS, AMQP, Kafka, HTTP,           │
│              WebSocket, Mail, TCP/UDP, MongoDB                    │
└──────────────────────────────────────────────────────────────────┘
```

### 1.1 Messages

A **Message** is the fundamental data structure — an immutable envelope containing a **payload** (any object) and **headers** (metadata key-value pairs).

```java
import org.springframework.messaging.Message;
import org.springframework.messaging.support.MessageBuilder;

// Creating messages
Message<String> message = MessageBuilder
        .withPayload("Hello Integration")
        .setHeader("correlationId", UUID.randomUUID().toString())
        .setHeader("priority", 5)
        .setHeader("source", "order-service")
        .build();

// Accessing message parts
String payload = message.getPayload();
Object correlationId = message.getHeaders().get("correlationId");
String contentType = message.getHeaders().get(MessageHeaders.CONTENT_TYPE, String.class);
```

### 1.2 Message Channels

Channels decouple producers from consumers. Spring Integration provides several channel types.

```java
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.integration.channel.DirectChannel;
import org.springframework.integration.channel.QueueChannel;
import org.springframework.integration.channel.PublishSubscribeChannel;
import org.springframework.integration.channel.PriorityChannel;
import org.springframework.integration.channel.ExecutorChannel;

@Configuration
public class ChannelConfig {

    // Point-to-point, synchronous (default)
    @Bean
    public DirectChannel orderChannel() {
        DirectChannel channel = new DirectChannel();
        channel.setFailover(true);
        return channel;
    }

    // Buffered, pollable
    @Bean
    public QueueChannel processingQueue() {
        return new QueueChannel(500); // capacity 500
    }

    // Publish-subscribe (broadcast)
    @Bean
    public PublishSubscribeChannel eventBus() {
        PublishSubscribeChannel channel = new PublishSubscribeChannel();
        channel.setMinSubscribers(1);
        return channel;
    }

    // Priority-based queue
    @Bean
    public PriorityChannel priorityChannel() {
        return new PriorityChannel(100,
                Comparator.comparingInt(m ->
                        m.getHeaders().get("priority", Integer.class)));
    }

    // Async with thread pool
    @Bean
    public ExecutorChannel asyncChannel() {
        return new ExecutorChannel(Executors.newFixedThreadPool(10));
    }
}
```

## 2. Message Endpoints

### 2.1 Service Activator

The most general-purpose endpoint. Invokes a method on a bean when a message arrives.

```java
import org.springframework.integration.annotation.ServiceActivator;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.Payload;

@Component
public class OrderProcessingService {

    @ServiceActivator(inputChannel = "orderChannel", outputChannel = "processedOrderChannel")
    public ProcessedOrder processOrder(@Payload Order order,
                                        @Header("correlationId") String correlationId) {
        // Business logic
        ProcessedOrder result = new ProcessedOrder();
        result.setOrderId(order.getId());
        result.setTotal(calculateTotal(order));
        result.setCorrelationId(correlationId);
        result.setProcessedAt(Instant.now());
        return result;
    }

    private BigDecimal calculateTotal(Order order) {
        return order.getItems().stream()
                .map(item -> item.getPrice().multiply(BigDecimal.valueOf(item.getQuantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
```

### 2.2 Transformer

Converts a message payload from one type to another.

```java
@Component
public class MessageTransformers {

    @Transformer(inputChannel = "rawOrderChannel", outputChannel = "orderChannel")
    public Order transformRawToOrder(String rawJson) throws JsonProcessingException {
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        return mapper.readValue(rawJson, Order.class);
    }

    @Transformer(inputChannel = "orderChannel", outputChannel = "notificationChannel")
    public NotificationPayload toNotification(ProcessedOrder order) {
        return new NotificationPayload(
                order.getCustomerEmail(),
                "Order Confirmed",
                String.format("Your order #%s for %s has been confirmed.",
                        order.getOrderId(), order.getTotal())
        );
    }
}
```

### 2.3 Filter

Decides whether a message should proceed or be discarded.

```java
@Component
public class OrderFilters {

    @Filter(inputChannel = "incomingOrders",
            outputChannel = "validOrders",
            discardChannel = "rejectedOrders")
    public boolean filterValidOrders(Order order) {
        return order.getItems() != null
                && !order.getItems().isEmpty()
                && order.getTotalAmount().compareTo(BigDecimal.ZERO) > 0
                && order.getCustomerId() != null;
    }

    @Filter(inputChannel = "validOrders", outputChannel = "highValueOrders")
    public boolean filterHighValue(Order order) {
        return order.getTotalAmount().compareTo(new BigDecimal("1000")) >= 0;
    }
}
```

### 2.4 Router

Directs messages to different channels based on content.

```java
@Component
public class OrderRouter {

    @Router(inputChannel = "processedOrderChannel")
    public String routeByRegion(ProcessedOrder order) {
        return switch (order.getRegion()) {
            case "US" -> "usOrderChannel";
            case "EU" -> "euOrderChannel";
            case "APAC" -> "apacOrderChannel";
            default -> "defaultOrderChannel";
        };
    }

    @Router(inputChannel = "paymentChannel")
    public List<String> routePayment(Payment payment) {
        List<String> channels = new ArrayList<>();
        channels.add("paymentLedgerChannel");  // always goes to ledger

        if (payment.getAmount().compareTo(new BigDecimal("5000")) > 0) {
            channels.add("complianceReviewChannel");
        }
        if (payment.isInternational()) {
            channels.add("fxConversionChannel");
        }
        return channels;
    }
}
```

### 2.5 Splitter and Aggregator

**Splitter** breaks a single message into multiple messages. **Aggregator** recombines them.

```java
@Component
public class OrderSplitterAggregator {

    // Split an order into individual line items
    @Splitter(inputChannel = "orderChannel", outputChannel = "lineItemChannel")
    public List<OrderLineItem> splitOrder(Order order) {
        return order.getItems().stream()
                .map(item -> {
                    OrderLineItem lineItem = new OrderLineItem();
                    lineItem.setOrderId(order.getId());
                    lineItem.setProductId(item.getProductId());
                    lineItem.setQuantity(item.getQuantity());
                    lineItem.setPrice(item.getPrice());
                    return lineItem;
                })
                .toList();
    }

    // Process each line item (e.g., check inventory)
    @ServiceActivator(inputChannel = "lineItemChannel",
                       outputChannel = "processedLineItemChannel")
    public ProcessedLineItem checkInventory(OrderLineItem item) {
        boolean available = inventoryService.checkAvailability(
                item.getProductId(), item.getQuantity());
        return new ProcessedLineItem(item, available);
    }

    // Aggregate processed line items back into a result
    @Aggregator(inputChannel = "processedLineItemChannel",
                 outputChannel = "aggregatedOrderChannel")
    public OrderResult aggregateLineItems(List<ProcessedLineItem> items) {
        boolean allAvailable = items.stream()
                .allMatch(ProcessedLineItem::isAvailable);
        BigDecimal total = items.stream()
                .map(i -> i.getPrice().multiply(BigDecimal.valueOf(i.getQuantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new OrderResult(
                items.get(0).getOrderId(),
                allAvailable ? OrderStatus.CONFIRMED : OrderStatus.PARTIAL,
                total,
                items
        );
    }

    @CorrelationStrategy
    public String correlateBy(ProcessedLineItem item) {
        return String.valueOf(item.getOrderId());
    }

    @ReleaseStrategy
    public boolean canRelease(List<ProcessedLineItem> items) {
        // Release when all expected items are present
        return items.size() >= items.get(0).getExpectedCount();
    }
}
```

## 3. Gateways

Gateways provide a clean interface between your application code and the messaging system. They hide the messaging complexity behind a regular Java interface.

```java
import org.springframework.integration.annotation.Gateway;
import org.springframework.integration.annotation.MessagingGateway;

@MessagingGateway
public interface OrderGateway {

    @Gateway(requestChannel = "orderChannel", replyChannel = "processedOrderChannel")
    ProcessedOrder submitOrder(Order order);

    @Gateway(requestChannel = "orderChannel", replyTimeout = 5000)
    Future<ProcessedOrder> submitOrderAsync(Order order);

    // Fire-and-forget (void return)
    @Gateway(requestChannel = "notificationChannel")
    void sendNotification(NotificationPayload payload);
}

// Usage in application code — no messaging awareness needed
@Service
public class OrderService {

    private final OrderGateway orderGateway;

    public OrderService(OrderGateway orderGateway) {
        this.orderGateway = orderGateway;
    }

    public ProcessedOrder placeOrder(OrderRequest request) {
        Order order = mapToOrder(request);
        ProcessedOrder result = orderGateway.submitOrder(order);

        orderGateway.sendNotification(new NotificationPayload(
                request.getEmail(), "Order Placed",
                "Order #" + result.getOrderId() + " confirmed"
        ));

        return result;
    }
}
```

## 4. Integration Flow DSL

The Java DSL provides a fluent, readable way to define integration flows.

### 4.1 Basic Flow

```java
import org.springframework.integration.dsl.IntegrationFlow;
import org.springframework.integration.dsl.Pollers;

@Configuration
public class IntegrationFlowConfig {

    @Bean
    public IntegrationFlow orderProcessingFlow() {
        return IntegrationFlow
                .from("incomingOrderChannel")
                .filter(Order.class, order ->
                        order.getTotalAmount().compareTo(BigDecimal.ZERO) > 0,
                        e -> e.discardChannel("rejectedOrderChannel"))
                .transform(Order.class, order -> {
                    order.setStatus(OrderStatus.PROCESSING);
                    order.setProcessedAt(Instant.now());
                    return order;
                })
                .handle(Order.class, (order, headers) -> {
                    return orderService.process(order);
                })
                .channel("processedOrderChannel")
                .get();
    }

    @Bean
    public IntegrationFlow enrichmentFlow() {
        return IntegrationFlow
                .from("rawOrderChannel")
                .enrich(e -> e
                        .requestChannel("customerLookupChannel")
                        .propertyExpression("customerName", "payload.name")
                        .propertyExpression("customerEmail", "payload.email")
                        .headerExpression("customerTier", "payload.tier"))
                .enrich(e -> e
                        .requestChannel("pricingChannel")
                        .propertyExpression("discount", "payload.discount"))
                .channel("enrichedOrderChannel")
                .get();
    }
}
```

### 4.2 Split-Process-Aggregate Flow

```java
@Bean
public IntegrationFlow splitAggregateFlow() {
    return IntegrationFlow
            .from("batchOrderChannel")
            .split(Order.class, Order::getItems)
            .channel(c -> c.executor(Executors.newFixedThreadPool(4)))
            .<OrderItem, ProcessedItem>transform(item -> {
                boolean inStock = inventoryService.check(item.getSku(), item.getQty());
                return new ProcessedItem(item, inStock);
            })
            .aggregate(a -> a
                    .correlationStrategy(m ->
                            m.getHeaders().get(IntegrationMessageHeaderAccessor.CORRELATION_ID))
                    .releaseStrategy(g -> g.size() == g.getOne().getHeaders()
                            .get(IntegrationMessageHeaderAccessor.SEQUENCE_SIZE, Integer.class))
                    .outputProcessor(g -> {
                        List<ProcessedItem> items = g.getMessages().stream()
                                .map(m -> (ProcessedItem) m.getPayload())
                                .toList();
                        boolean allAvailable = items.stream()
                                .allMatch(ProcessedItem::isAvailable);
                        return new OrderResult(allAvailable, items);
                    })
                    .expireGroupsUponCompletion(true)
                    .groupTimeout(30000))
            .channel("orderResultChannel")
            .get();
}
```

### 4.3 Routing Flow

```java
@Bean
public IntegrationFlow routingFlow() {
    return IntegrationFlow
            .from("eventChannel")
            .<Event, String>route(Event::getType, mapping -> mapping
                    .subFlowMapping("ORDER_CREATED", sf -> sf
                            .handle(orderHandler, "handleCreated"))
                    .subFlowMapping("ORDER_SHIPPED", sf -> sf
                            .handle(orderHandler, "handleShipped"))
                    .subFlowMapping("ORDER_CANCELLED", sf -> sf
                            .handle(orderHandler, "handleCancelled"))
                    .defaultSubFlowMapping(sf -> sf
                            .channel("unknownEventChannel")))
            .get();
}
```

## 5. Channel Adapters

### 5.1 File Adapter

```java
@Bean
public IntegrationFlow fileInboundFlow() {
    return IntegrationFlow
            .from(Files.inboundAdapter(new File("/data/incoming"))
                            .patternFilter("*.csv")
                            .preventDuplicates(true)
                            .useWatchService(true)
                            .watchEvents(FileReadingMessageSource.WatchEventType.CREATE),
                    e -> e.poller(Pollers.fixedDelay(5000)))
            .transform(Files.toStringTransformer())
            .split(s -> s.delimiters("\n"))
            .filter(String.class, line -> !line.startsWith("HEADER"))
            .transform(String.class, this::parseCsvLine)
            .handle(this::processRecord)
            .get();
}

@Bean
public IntegrationFlow fileOutboundFlow() {
    return IntegrationFlow
            .from("fileOutputChannel")
            .handle(Files.outboundAdapter(new File("/data/outgoing"))
                    .fileNameGenerator(m -> "report-" +
                            LocalDate.now() + "-" +
                            m.getHeaders().getId() + ".csv")
                    .autoCreateDirectory(true)
                    .appendNewLine(true)
                    .fileExistsMode(FileExistsMode.APPEND))
            .get();
}
```

### 5.2 FTP Adapter

```java
@Bean
public SessionFactory<FTPFile> ftpSessionFactory() {
    DefaultFtpSessionFactory factory = new DefaultFtpSessionFactory();
    factory.setHost("ftp.example.com");
    factory.setPort(21);
    factory.setUsername("batch-user");
    factory.setPassword("secret");
    factory.setClientMode(FTPClient.PASSIVE_LOCAL_DATA_CONNECTION_MODE);
    return new CachingSessionFactory<>(factory, 10);
}

@Bean
public IntegrationFlow ftpInboundFlow(SessionFactory<FTPFile> ftpSessionFactory) {
    return IntegrationFlow
            .from(Ftp.inboundAdapter(ftpSessionFactory)
                            .remoteDirectory("/uploads")
                            .localDirectory(new File("/tmp/ftp-incoming"))
                            .autoCreateLocalDirectory(true)
                            .patternFilter("*.xml")
                            .deleteRemoteFiles(false)
                            .preserveTimestamp(true),
                    e -> e.poller(Pollers.fixedDelay(60000)))
            .transform(Files.toStringTransformer("UTF-8"))
            .channel("ftpFileContentChannel")
            .get();
}

@Bean
public IntegrationFlow ftpOutboundFlow(SessionFactory<FTPFile> ftpSessionFactory) {
    return IntegrationFlow
            .from("ftpOutgoingChannel")
            .handle(Ftp.outboundAdapter(ftpSessionFactory)
                    .remoteDirectory("/reports")
                    .fileNameGenerator(m -> "daily-report-" + LocalDate.now() + ".csv")
                    .autoCreateDirectory(true)
                    .temporaryFileSuffix(".writing"))
            .get();
}
```

### 5.3 JDBC Adapter

```java
@Bean
public IntegrationFlow jdbcInboundFlow(DataSource dataSource) {
    return IntegrationFlow
            .from(Jdbc.inboundAdapter(dataSource,
                            "SELECT id, payload, status FROM outbox WHERE status = 'PENDING' ORDER BY id LIMIT 100")
                            .updateSql("UPDATE outbox SET status = 'PROCESSING' WHERE id IN (:id)")
                            .rowMapper(new BeanPropertyRowMapper<>(OutboxMessage.class)),
                    e -> e.poller(Pollers.fixedDelay(1000)))
            .split()
            .channel("outboxProcessingChannel")
            .get();
}

@Bean
public IntegrationFlow jdbcOutboundFlow(DataSource dataSource) {
    return IntegrationFlow
            .from("auditLogChannel")
            .handle(Jdbc.outboundAdapter(dataSource)
                    .sql("INSERT INTO audit_log (event_type, entity_id, payload, created_at) " +
                         "VALUES (:headers[eventType], :headers[entityId], :payload, NOW())")
            )
            .get();
}
```

### 5.4 AMQP (RabbitMQ) Adapter

```java
@Bean
public IntegrationFlow amqpInboundFlow(ConnectionFactory connectionFactory) {
    return IntegrationFlow
            .from(Amqp.inboundAdapter(connectionFactory, "order.queue")
                    .configureContainer(c -> c
                            .prefetchCount(50)
                            .concurrentConsumers(5)
                            .maxConcurrentConsumers(10)))
            .transform(Transformers.fromJson(OrderEvent.class))
            .handle(orderEventHandler, "handle")
            .get();
}

@Bean
public IntegrationFlow amqpOutboundFlow(AmqpTemplate amqpTemplate) {
    return IntegrationFlow
            .from("amqpOutgoingChannel")
            .transform(Transformers.toJson())
            .handle(Amqp.outboundAdapter(amqpTemplate)
                    .exchangeName("events.exchange")
                    .routingKeyExpression("headers['routingKey']")
                    .confirmCorrelationExpression("headers['correlationId']"))
            .get();
}
```

### 5.5 Kafka Adapter

```java
@Bean
public IntegrationFlow kafkaInboundFlow(
        ConsumerFactory<String, String> consumerFactory) {
    return IntegrationFlow
            .from(Kafka.messageDrivenChannelAdapter(consumerFactory,
                            KafkaMessageDrivenChannelAdapter.ListenerMode.record,
                            "order-events", "payment-events")
                    .configureListenerContainer(c -> c
                            .groupId("integration-consumer")
                            .ackMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE)))
            .transform(Transformers.fromJson(DomainEvent.class))
            .<DomainEvent, String>route(DomainEvent::getType, mapping -> mapping
                    .subFlowMapping("OrderCreated", sf -> sf
                            .handle(orderService, "handleCreated"))
                    .subFlowMapping("PaymentReceived", sf -> sf
                            .handle(paymentService, "handlePayment")))
            .get();
}

@Bean
public IntegrationFlow kafkaOutboundFlow(KafkaTemplate<String, String> kafkaTemplate) {
    return IntegrationFlow
            .from("kafkaOutgoingChannel")
            .transform(Transformers.toJson())
            .handle(Kafka.outboundChannelAdapter(kafkaTemplate)
                    .topic("processed-events")
                    .messageKey(m -> m.getHeaders().get("entityId", String.class))
                    .partitionId(m -> m.getHeaders().get("partitionId", Integer.class))
                    .headerMapper(new DefaultKafkaHeaderMapper()))
            .get();
}
```

### 5.6 HTTP Adapter

```java
@Bean
public IntegrationFlow httpInboundFlow() {
    return IntegrationFlow
            .from(Http.inboundGateway("/api/integration/orders")
                    .requestMapping(m -> m.methods(HttpMethod.POST))
                    .requestPayloadType(OrderRequest.class)
                    .crossOrigin(c -> c.allowedOrigins("*"))
                    .headerExpression("apiKey", "#requestParams['apiKey']"))
            .filter(OrderRequest.class, this::validateApiKey,
                    e -> e.discardFlow(sf -> sf
                            .handle((p, h) -> ResponseEntity.status(403).body("Invalid API key"))))
            .transform(OrderRequest.class, this::mapToOrder)
            .handle(orderService, "processOrder")
            .<ProcessedOrder>transform(result ->
                    ResponseEntity.ok(result))
            .get();
}

@Bean
public IntegrationFlow httpOutboundFlow() {
    return IntegrationFlow
            .from("webhookChannel")
            .handle(Http.outboundChannelAdapter("https://hooks.example.com/webhook")
                    .httpMethod(HttpMethod.POST)
                    .mappedRequestHeaders("Content-Type", "X-Webhook-Secret")
                    .expectedResponseType(String.class)
                    .extractPayload(true))
            .get();
}
```

## 6. Error Handling

### 6.1 Error Channel

```java
@Configuration
public class ErrorHandlingConfig {

    @Bean
    public IntegrationFlow errorHandlingFlow() {
        return IntegrationFlow
                .from("errorChannel")
                .routeByException(r -> r
                        .subFlowMapping(ValidationException.class, sf -> sf
                                .handle(this::handleValidationError))
                        .subFlowMapping(TimeoutException.class, sf -> sf
                                .handle(this::handleTimeout))
                        .defaultSubFlowMapping(sf -> sf
                                .handle(this::handleGenericError)))
                .get();
    }

    private void handleValidationError(MessagingException exception) {
        Message<?> failedMessage = exception.getFailedMessage();
        log.warn("Validation error for message {}: {}",
                failedMessage.getHeaders().getId(),
                exception.getCause().getMessage());
        // Store in dead letter table
        deadLetterService.store(failedMessage, exception);
    }

    private void handleTimeout(MessagingException exception) {
        Message<?> failedMessage = exception.getFailedMessage();
        log.error("Timeout processing message {}", failedMessage.getHeaders().getId());
        // Retry later
        retryQueue.add(failedMessage);
    }

    private void handleGenericError(MessagingException exception) {
        log.error("Unhandled error in integration flow", exception);
        alertService.sendAlert("Integration flow error: " + exception.getMessage());
    }
}
```

### 6.2 Retry and Circuit Breaker

```java
@Bean
public IntegrationFlow resilientFlow() {
    return IntegrationFlow
            .from("resilientChannel")
            .handle(Http.outboundGateway("https://api.partner.com/orders")
                            .httpMethod(HttpMethod.POST)
                            .expectedResponseType(String.class),
                    e -> e.advice(retryAdvice(), circuitBreakerAdvice()))
            .channel("responseChannel")
            .get();
}

@Bean
public RequestHandlerRetryAdvice retryAdvice() {
    RequestHandlerRetryAdvice advice = new RequestHandlerRetryAdvice();

    RetryTemplate retryTemplate = RetryTemplate.builder()
            .maxAttempts(3)
            .exponentialBackoff(1000, 2.0, 10000)
            .retryOn(HttpServerErrorException.class)
            .build();

    advice.setRetryTemplate(retryTemplate);
    advice.setRecoveryCallback(context -> {
        Message<?> failedMessage = (Message<?>) context.getAttribute(
                ErrorMessageUtils.FAILED_MESSAGE_CONTEXT_KEY);
        log.error("All retries exhausted for message {}",
                failedMessage.getHeaders().getId());
        return null; // or a fallback response
    });
    return advice;
}

@Bean
public ExpressionEvaluatingRequestHandlerAdvice circuitBreakerAdvice() {
    ExpressionEvaluatingRequestHandlerAdvice advice =
            new ExpressionEvaluatingRequestHandlerAdvice();
    advice.setOnSuccessExpressionString("payload");
    advice.setOnFailureExpressionString("#exception.message");
    advice.setFailureChannel(new DirectChannel());
    advice.setTrapException(true);
    return advice;
}
```

## 7. Testing Integration Flows

### 7.1 Unit Testing with MockIntegrationContext

```java
@SpringIntegrationTest
@SpringBootTest
class OrderIntegrationFlowTest {

    @Autowired
    private MockIntegrationContext mockIntegrationContext;

    @Autowired
    @Qualifier("orderChannel")
    private MessageChannel orderChannel;

    @Autowired
    @Qualifier("processedOrderChannel")
    private PollableChannel processedOrderChannel;

    @Test
    void testOrderProcessingFlow() {
        // Given
        Order order = new Order();
        order.setId(1L);
        order.setCustomerId(42L);
        order.setItems(List.of(
                new OrderItem("SKU-001", 2, new BigDecimal("29.99")),
                new OrderItem("SKU-002", 1, new BigDecimal("49.99"))
        ));

        // When
        orderChannel.send(MessageBuilder.withPayload(order).build());

        // Then
        Message<?> result = processedOrderChannel.receive(5000);
        assertThat(result).isNotNull();
        ProcessedOrder processed = (ProcessedOrder) result.getPayload();
        assertThat(processed.getOrderId()).isEqualTo(1L);
        assertThat(processed.getTotal()).isEqualByComparingTo("109.97");
    }

    @Test
    void testFilterRejectsInvalidOrders() {
        Order invalidOrder = new Order();
        invalidOrder.setItems(List.of()); // empty items

        orderChannel.send(MessageBuilder.withPayload(invalidOrder).build());

        // Should not reach the processed channel
        Message<?> result = processedOrderChannel.receive(2000);
        assertThat(result).isNull();
    }
}
```

### 7.2 Testing with MockMessageHandler

```java
@SpringIntegrationTest
@SpringBootTest
class WebhookFlowTest {

    @Autowired
    private MockIntegrationContext mockIntegrationContext;

    @Autowired
    private OrderGateway orderGateway;

    @Test
    void testWebhookIsCalled() {
        // Mock the HTTP outbound adapter
        MockMessageHandler mockHandler = MockIntegration.mockMessageHandler()
                .handleNextAndReply(m -> "OK");

        mockIntegrationContext.substituteMessageHandlerFor(
                "webhookOutboundEndpoint", mockHandler);

        // Trigger the flow
        orderGateway.submitOrder(testOrder());

        // Verify the webhook was called
        assertThat(mockHandler.getReceivedMessages()).hasSize(1);
        Message<?> sentMessage = mockHandler.getReceivedMessages().get(0);
        assertThat(sentMessage.getPayload().toString()).contains("ORDER-001");
    }

    @AfterEach
    void tearDown() {
        mockIntegrationContext.resetBeans();
    }
}
```

### 7.3 Testing Splitter-Aggregator

```java
@Test
void testSplitAggregateFlow() {
    Order order = new Order();
    order.setId(100L);
    order.setItems(List.of(
            new OrderItem("A", 1, new BigDecimal("10")),
            new OrderItem("B", 2, new BigDecimal("20")),
            new OrderItem("C", 3, new BigDecimal("30"))
    ));

    batchOrderChannel.send(MessageBuilder.withPayload(order)
            .setHeader(IntegrationMessageHeaderAccessor.SEQUENCE_SIZE, 3)
            .build());

    Message<?> result = orderResultChannel.receive(10000);
    assertThat(result).isNotNull();

    OrderResult aggregated = (OrderResult) result.getPayload();
    assertThat(aggregated.getItems()).hasSize(3);
    assertThat(aggregated.isAllAvailable()).isTrue();
}
```

## 8. Wire Tap and Monitoring

```java
@Bean
public IntegrationFlow monitoredFlow() {
    return IntegrationFlow
            .from("inputChannel")
            .wireTap(wt -> wt
                    .channel("auditChannel")
                    .selector(m -> {
                        // Only audit high-value orders
                        Order order = (Order) m.getPayload();
                        return order.getTotalAmount()
                                .compareTo(new BigDecimal("1000")) > 0;
                    }))
            .handle(orderService, "process")
            .wireTap("metricsChannel")
            .channel("outputChannel")
            .get();
}

@Bean
public IntegrationFlow auditFlow() {
    return IntegrationFlow
            .from("auditChannel")
            .handle(message -> {
                log.info("AUDIT: {} at {} with headers {}",
                        message.getPayload().getClass().getSimpleName(),
                        Instant.now(),
                        message.getHeaders());
                auditRepository.save(new AuditEntry(message));
            })
            .get();
}
```

## 9. Complete Real-World Example: Order Processing Pipeline

```java
@Configuration
public class OrderPipelineConfig {

    @Bean
    public IntegrationFlow orderIngestionFlow(
            ConsumerFactory<String, String> consumerFactory) {
        return IntegrationFlow
                .from(Kafka.messageDrivenChannelAdapter(consumerFactory,
                        KafkaMessageDrivenChannelAdapter.ListenerMode.record,
                        "incoming-orders")
                        .configureListenerContainer(c -> c
                                .groupId("order-pipeline")
                                .ackMode(ContainerProperties.AckMode.RECORD)))
                .transform(Transformers.fromJson(Order.class))
                .wireTap("auditChannel")
                .filter(Order.class, o -> o.getStatus() == OrderStatus.NEW)
                .enrich(e -> e
                        .requestChannel("customerLookupFlow.input")
                        .propertyExpression("customerName", "payload.name")
                        .propertyExpression("customerTier", "payload.tier"))
                .enrich(e -> e
                        .requestChannel("inventoryCheckFlow.input")
                        .propertyExpression("allItemsAvailable", "payload"))
                .<Order>filter(order -> order.isAllItemsAvailable(),
                        f -> f.discardFlow(sf -> sf
                                .transform(Order.class, o -> {
                                    o.setStatus(OrderStatus.BACKORDERED);
                                    return o;
                                })
                                .channel("backorderChannel")))
                .channel("validatedOrderChannel")
                .get();
    }

    @Bean
    public IntegrationFlow orderFulfillmentFlow() {
        return IntegrationFlow
                .from("validatedOrderChannel")
                .<Order, String>route(o -> o.getCustomerTier(), mapping -> mapping
                        .subFlowMapping("PREMIUM", sf -> sf
                                .handle(fulfillmentService, "expedited"))
                        .subFlowMapping("STANDARD", sf -> sf
                                .handle(fulfillmentService, "standard"))
                        .defaultSubFlowMapping(sf -> sf
                                .handle(fulfillmentService, "standard")))
                .transform(Transformers.toJson())
                .handle(Kafka.outboundChannelAdapter(kafkaTemplate)
                        .topic("fulfilled-orders")
                        .messageKey(m -> m.getHeaders().get("orderId", String.class)))
                .get();
    }

    @Bean
    public IntegrationFlow customerLookupFlow() {
        return IntegrationFlow
                .from("customerLookupFlow.input")
                .handle(Http.outboundGateway("https://customer-service/api/customers/{id}")
                        .httpMethod(HttpMethod.GET)
                        .uriVariable("id", "payload.customerId")
                        .expectedResponseType(CustomerInfo.class),
                        e -> e.advice(retryAdvice()))
                .get();
    }
}
```

Spring Integration excels when you need to connect heterogeneous systems through a message-driven architecture. The combination of EIP patterns, the Java DSL, and the extensive adapter library makes it possible to build complex integration pipelines that are testable, maintainable, and resilient. For simple point-to-point integrations, consider whether Spring Cloud Stream or direct Kafka/RabbitMQ clients might be simpler. Spring Integration shines when the routing, transformation, and error handling logic is genuinely complex.
