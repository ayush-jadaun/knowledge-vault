---
title: "Spring for GraphQL Deep Dive"
description: "Comprehensive guide to Spring for GraphQL — schema-first vs code-first, @QueryMapping/@MutationMapping/@SubscriptionMapping, DataFetcher, BatchLoader for N+1 prevention, security integration, file upload, error handling, Relay-style pagination, testing with GraphQlTester, and HttpGraphQlClient."
tags: [spring-graphql, graphql, api, schema, java]
difficulty: advanced
prerequisites: [spring-boot-fundamentals, graphql-basics, spring-security-basics]
lastReviewed: "2026-03-25"
---

# Spring for GraphQL Deep Dive

Spring for GraphQL is the official Spring integration with GraphQL Java. It provides annotation-driven controllers, transport support (HTTP, WebSocket, RSocket), DataLoader integration for the N+1 problem, security, and testing utilities.

## 1. Project Setup

### 1.1 Dependencies

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-graphql</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<!-- For WebSocket subscriptions -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-websocket</artifactId>
</dependency>
<!-- For testing -->
<dependency>
    <groupId>org.springframework.graphql</groupId>
    <artifactId>spring-graphql-test</artifactId>
    <scope>test</scope>
</dependency>
```

```yaml
spring:
  graphql:
    graphiql:
      enabled: true                    # enable GraphiQL UI at /graphiql
    schema:
      printer:
        enabled: true                  # expose SDL at /graphql/schema
      locations: classpath:graphql/    # schema file location
      file-extensions: .graphqls,.gqls
    websocket:
      path: /graphql                   # WebSocket endpoint for subscriptions
```

## 2. Schema Definition (Schema-First)

```graphql
# src/main/resources/graphql/schema.graphqls

type Query {
    product(id: ID!): Product
    products(filter: ProductFilter, page: Int = 0, size: Int = 20): ProductConnection!
    searchProducts(query: String!): [Product!]!
    order(id: ID!): Order
    ordersByCustomer(customerId: ID!): [Order!]!
}

type Mutation {
    createProduct(input: CreateProductInput!): Product!
    updateProduct(id: ID!, input: UpdateProductInput!): Product!
    deleteProduct(id: ID!): Boolean!
    createOrder(input: CreateOrderInput!): Order!
    cancelOrder(id: ID!, reason: String): Order!
}

type Subscription {
    orderStatusChanged(orderId: ID!): OrderStatusEvent!
    newProducts: Product!
}

type Product {
    id: ID!
    name: String!
    description: String
    price: BigDecimal!
    category: Category!
    inStock: Boolean!
    stockLevel: Int!
    reviews(first: Int = 5): [Review!]!
    averageRating: Float
    createdAt: DateTime!
    updatedAt: DateTime
}

type Category {
    id: ID!
    name: String!
    products(page: Int = 0, size: Int = 20): [Product!]!
}

type Order {
    id: ID!
    customer: Customer!
    items: [OrderItem!]!
    totalAmount: BigDecimal!
    status: OrderStatus!
    createdAt: DateTime!
    shippedAt: DateTime
}

type OrderItem {
    id: ID!
    product: Product!
    quantity: Int!
    unitPrice: BigDecimal!
    subtotal: BigDecimal!
}

type Customer {
    id: ID!
    name: String!
    email: String!
    orders: [Order!]!
}

type Review {
    id: ID!
    product: Product!
    author: Customer!
    rating: Int!
    comment: String
    createdAt: DateTime!
}

# Relay-style pagination
type ProductConnection {
    edges: [ProductEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
}

type ProductEdge {
    node: Product!
    cursor: String!
}

type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
}

# Input types
input CreateProductInput {
    name: String!
    description: String
    price: BigDecimal!
    categoryId: ID!
    stockLevel: Int!
}

input UpdateProductInput {
    name: String
    description: String
    price: BigDecimal
    categoryId: ID
    stockLevel: Int
}

input CreateOrderInput {
    customerId: ID!
    items: [OrderItemInput!]!
}

input OrderItemInput {
    productId: ID!
    quantity: Int!
}

input ProductFilter {
    category: String
    minPrice: BigDecimal
    maxPrice: BigDecimal
    inStock: Boolean
    searchTerm: String
}

enum OrderStatus {
    PENDING
    CONFIRMED
    SHIPPED
    DELIVERED
    CANCELLED
}

type OrderStatusEvent {
    orderId: ID!
    previousStatus: OrderStatus!
    newStatus: OrderStatus!
    timestamp: DateTime!
}

scalar BigDecimal
scalar DateTime
```

## 3. Query Controllers

### 3.1 Product Controller

```java
@Controller
public class ProductController {

    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    @QueryMapping
    public Product product(@Argument Long id) {
        return productService.findById(id)
                .orElseThrow(() -> new ProductNotFoundException(id));
    }

    @QueryMapping
    public ProductConnection products(@Argument ProductFilter filter,
                                       @Argument int page,
                                       @Argument int size) {
        Page<Product> productPage = productService.findAll(filter, page, size);
        return ProductConnection.from(productPage);
    }

    @QueryMapping
    public List<Product> searchProducts(@Argument String query) {
        return productService.search(query);
    }

    // Resolve nested field: Product.reviews
    @SchemaMapping(typeName = "Product", field = "reviews")
    public List<Review> productReviews(Product product, @Argument int first) {
        return reviewService.findByProductId(product.getId(), first);
    }

    // Resolve nested field: Product.averageRating
    @SchemaMapping(typeName = "Product", field = "averageRating")
    public Float averageRating(Product product) {
        return reviewService.getAverageRating(product.getId());
    }

    // Resolve nested field: Product.category
    @SchemaMapping(typeName = "Product", field = "category")
    public Category productCategory(Product product) {
        return categoryService.findById(product.getCategoryId());
    }
}
```

### 3.2 Order Controller

```java
@Controller
public class OrderController {

    private final OrderService orderService;
    private final CustomerService customerService;

    public OrderController(OrderService orderService,
                            CustomerService customerService) {
        this.orderService = orderService;
        this.customerService = customerService;
    }

    @QueryMapping
    public Order order(@Argument Long id) {
        return orderService.findById(id);
    }

    @QueryMapping
    public List<Order> ordersByCustomer(@Argument Long customerId) {
        return orderService.findByCustomerId(customerId);
    }

    // Resolve Order.customer
    @SchemaMapping(typeName = "Order", field = "customer")
    public Customer orderCustomer(Order order) {
        return customerService.findById(order.getCustomerId());
    }

    // Resolve OrderItem.product
    @SchemaMapping(typeName = "OrderItem", field = "product")
    public Product orderItemProduct(OrderItem item) {
        return productService.findById(item.getProductId())
                .orElseThrow();
    }
}
```

## 4. Mutation Controllers

```java
@Controller
public class ProductMutationController {

    private final ProductService productService;

    public ProductMutationController(ProductService productService) {
        this.productService = productService;
    }

    @MutationMapping
    public Product createProduct(@Argument CreateProductInput input) {
        Product product = new Product();
        product.setName(input.name());
        product.setDescription(input.description());
        product.setPrice(input.price());
        product.setCategoryId(input.categoryId());
        product.setStockLevel(input.stockLevel());
        product.setInStock(input.stockLevel() > 0);
        product.setCreatedAt(Instant.now());
        return productService.save(product);
    }

    @MutationMapping
    public Product updateProduct(@Argument Long id,
                                  @Argument UpdateProductInput input) {
        Product product = productService.findById(id)
                .orElseThrow(() -> new ProductNotFoundException(id));

        if (input.name() != null) product.setName(input.name());
        if (input.description() != null) product.setDescription(input.description());
        if (input.price() != null) product.setPrice(input.price());
        if (input.categoryId() != null) product.setCategoryId(input.categoryId());
        if (input.stockLevel() != null) {
            product.setStockLevel(input.stockLevel());
            product.setInStock(input.stockLevel() > 0);
        }
        product.setUpdatedAt(Instant.now());
        return productService.save(product);
    }

    @MutationMapping
    public boolean deleteProduct(@Argument Long id) {
        return productService.deleteById(id);
    }
}

@Controller
public class OrderMutationController {

    private final OrderService orderService;

    public OrderMutationController(OrderService orderService) {
        this.orderService = orderService;
    }

    @MutationMapping
    public Order createOrder(@Argument CreateOrderInput input) {
        Order order = orderService.createOrder(
                input.customerId(),
                input.items().stream()
                        .map(i -> new OrderItemRequest(i.productId(), i.quantity()))
                        .toList());
        return order;
    }

    @MutationMapping
    public Order cancelOrder(@Argument Long id, @Argument String reason) {
        return orderService.cancelOrder(id, reason);
    }
}

// Input records
public record CreateProductInput(
        String name,
        String description,
        BigDecimal price,
        Long categoryId,
        int stockLevel
) {}

public record UpdateProductInput(
        String name,
        String description,
        BigDecimal price,
        Long categoryId,
        Integer stockLevel
) {}

public record CreateOrderInput(
        Long customerId,
        List<OrderItemInput> items
) {}

public record OrderItemInput(Long productId, int quantity) {}
```

## 5. Subscriptions

```java
@Controller
public class OrderSubscriptionController {

    private final Sinks.Many<OrderStatusEvent> orderEventSink;

    public OrderSubscriptionController() {
        this.orderEventSink = Sinks.many().multicast().onBackpressureBuffer();
    }

    @SubscriptionMapping
    public Flux<OrderStatusEvent> orderStatusChanged(@Argument Long orderId) {
        return orderEventSink.asFlux()
                .filter(event -> event.orderId().equals(orderId));
    }

    // Called by OrderService when status changes
    public void publishStatusChange(OrderStatusEvent event) {
        orderEventSink.tryEmitNext(event);
    }
}

@Controller
public class ProductSubscriptionController {

    private final Sinks.Many<Product> newProductSink;

    public ProductSubscriptionController() {
        this.newProductSink = Sinks.many().multicast().onBackpressureBuffer();
    }

    @SubscriptionMapping
    public Flux<Product> newProducts() {
        return newProductSink.asFlux();
    }

    public void publishNewProduct(Product product) {
        newProductSink.tryEmitNext(product);
    }
}
```

## 6. BatchLoader for N+1 Prevention

### 6.1 The N+1 Problem

Without batching, each OrderItem's `product` field triggers a separate database query. For an order with 50 items, that means 50 individual queries.

### 6.2 DataLoader Registration

```java
@Configuration
public class DataLoaderConfig {

    @Bean
    public BatchLoaderRegistry batchLoaderRegistry(
            ProductService productService,
            CustomerService customerService,
            ReviewService reviewService) {

        // This is auto-configured — just register the loaders
        return null; // Spring Boot auto-configures this
    }
}

@Controller
public class BatchLoadingController {

    // Register batch loaders for efficient data fetching

    @BatchMapping(typeName = "OrderItem", field = "product")
    public Mono<Map<OrderItem, Product>> productBatchLoader(
            List<OrderItem> orderItems) {
        // Collect all product IDs
        List<Long> productIds = orderItems.stream()
                .map(OrderItem::getProductId)
                .distinct()
                .toList();

        // Single batch query
        return productService.findAllByIds(productIds)
                .collectMap(Product::getId)
                .map(productMap -> orderItems.stream()
                        .collect(Collectors.toMap(
                                item -> item,
                                item -> productMap.get(item.getProductId()))));
    }

    @BatchMapping(typeName = "Order", field = "customer")
    public Mono<Map<Order, Customer>> customerBatchLoader(List<Order> orders) {
        List<Long> customerIds = orders.stream()
                .map(Order::getCustomerId)
                .distinct()
                .toList();

        return customerService.findAllByIds(customerIds)
                .collectMap(Customer::getId)
                .map(customerMap -> orders.stream()
                        .collect(Collectors.toMap(
                                order -> order,
                                order -> customerMap.get(order.getCustomerId()))));
    }

    @BatchMapping(typeName = "Product", field = "reviews")
    public Mono<Map<Product, List<Review>>> reviewsBatchLoader(List<Product> products) {
        List<Long> productIds = products.stream()
                .map(Product::getId)
                .toList();

        return reviewService.findByProductIds(productIds)
                .collectMultimap(Review::getProductId)
                .map(reviewMap -> products.stream()
                        .collect(Collectors.toMap(
                                product -> product,
                                product -> reviewMap.getOrDefault(
                                        product.getId(), List.of())
                                        .stream().toList())));
    }

    @BatchMapping(typeName = "Product", field = "category")
    public Mono<Map<Product, Category>> categoryBatchLoader(List<Product> products) {
        List<Long> categoryIds = products.stream()
                .map(Product::getCategoryId)
                .distinct()
                .toList();

        return categoryService.findAllByIds(categoryIds)
                .collectMap(Category::getId)
                .map(categoryMap -> products.stream()
                        .collect(Collectors.toMap(
                                product -> product,
                                product -> categoryMap.get(product.getCategoryId()))));
    }
}
```

## 7. Security Integration

```java
@Configuration
@EnableMethodSecurity
public class GraphQLSecurityConfig {

    @Bean
    public SecurityFilterChain graphqlSecurityChain(HttpSecurity http) throws Exception {
        return http
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/graphiql").permitAll()
                        .requestMatchers("/graphql").authenticated()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
                .csrf(csrf -> csrf.ignoringRequestMatchers("/graphql"))
                .build();
    }
}

// Security in controllers
@Controller
public class SecureProductController {

    @QueryMapping
    public Product product(@Argument Long id) {
        // Public query — no auth needed
        return productService.findById(id).orElseThrow();
    }

    @MutationMapping
    @PreAuthorize("hasRole('ADMIN')")
    public Product createProduct(@Argument CreateProductInput input) {
        return productService.create(input);
    }

    @MutationMapping
    @PreAuthorize("hasRole('ADMIN') or hasAuthority('PRODUCT_EDIT')")
    public Product updateProduct(@Argument Long id,
                                  @Argument UpdateProductInput input) {
        return productService.update(id, input);
    }

    @MutationMapping
    @PreAuthorize("hasRole('ADMIN')")
    public boolean deleteProduct(@Argument Long id) {
        return productService.deleteById(id);
    }

    // Access current user in resolver
    @QueryMapping
    public List<Order> myOrders(@AuthenticationPrincipal Jwt jwt) {
        String userId = jwt.getSubject();
        return orderService.findByCustomerId(Long.parseLong(userId));
    }

    // Field-level security
    @SchemaMapping(typeName = "Customer", field = "email")
    @PreAuthorize("hasRole('ADMIN') or #customer.id == authentication.principal.claims['sub']")
    public String customerEmail(Customer customer) {
        return customer.getEmail();
    }
}
```

## 8. Error Handling

```java
@Configuration
public class GraphQLExceptionConfig {

    @Bean
    public DataFetcherExceptionResolver exceptionResolver() {
        return DataFetcherExceptionResolverAdapter.from((ex, env) -> {
            if (ex instanceof ProductNotFoundException notFound) {
                return GraphqlErrorBuilder.newError(env)
                        .message("Product not found: " + notFound.getId())
                        .errorType(ErrorType.NOT_FOUND)
                        .extensions(Map.of("code", "PRODUCT_NOT_FOUND",
                                           "productId", notFound.getId()))
                        .build();
            }

            if (ex instanceof AccessDeniedException) {
                return GraphqlErrorBuilder.newError(env)
                        .message("Access denied")
                        .errorType(ErrorType.FORBIDDEN)
                        .extensions(Map.of("code", "ACCESS_DENIED"))
                        .build();
            }

            if (ex instanceof ConstraintViolationException validation) {
                Map<String, String> violations = validation.getConstraintViolations()
                        .stream()
                        .collect(Collectors.toMap(
                                v -> v.getPropertyPath().toString(),
                                ConstraintViolation::getMessage));

                return GraphqlErrorBuilder.newError(env)
                        .message("Validation failed")
                        .errorType(ErrorType.BAD_REQUEST)
                        .extensions(Map.of("code", "VALIDATION_ERROR",
                                           "violations", violations))
                        .build();
            }

            if (ex instanceof InsufficientStockException stock) {
                return GraphqlErrorBuilder.newError(env)
                        .message("Insufficient stock for product: " + stock.getProductId())
                        .errorType(ErrorType.BAD_REQUEST)
                        .extensions(Map.of("code", "INSUFFICIENT_STOCK",
                                           "productId", stock.getProductId(),
                                           "requested", stock.getRequested(),
                                           "available", stock.getAvailable()))
                        .build();
            }

            // Default: internal error (don't expose details)
            return GraphqlErrorBuilder.newError(env)
                    .message("Internal server error")
                    .errorType(ErrorType.INTERNAL_ERROR)
                    .build();
        });
    }
}
```

## 9. Relay-Style Pagination

```java
@Controller
public class PaginatedProductController {

    private final ProductService productService;

    public PaginatedProductController(ProductService productService) {
        this.productService = productService;
    }

    @QueryMapping
    public ProductConnection products(@Argument ProductFilter filter,
                                       @Argument int page,
                                       @Argument int size) {
        Page<Product> productPage = productService.findAll(filter,
                PageRequest.of(page, size, Sort.by("createdAt").descending()));
        return toConnection(productPage);
    }

    private ProductConnection toConnection(Page<Product> page) {
        List<ProductEdge> edges = page.getContent().stream()
                .map(product -> new ProductEdge(
                        product,
                        encodeCursor(product.getId())))
                .toList();

        PageInfo pageInfo = new PageInfo(
                page.hasNext(),
                page.hasPrevious(),
                edges.isEmpty() ? null : edges.get(0).cursor(),
                edges.isEmpty() ? null : edges.get(edges.size() - 1).cursor());

        return new ProductConnection(edges, pageInfo, page.getTotalElements());
    }

    private String encodeCursor(Long id) {
        return Base64.getEncoder().encodeToString(
                ("cursor:" + id).getBytes(StandardCharsets.UTF_8));
    }

    private Long decodeCursor(String cursor) {
        String decoded = new String(Base64.getDecoder().decode(cursor),
                StandardCharsets.UTF_8);
        return Long.parseLong(decoded.replace("cursor:", ""));
    }
}

public record ProductConnection(
        List<ProductEdge> edges,
        PageInfo pageInfo,
        long totalCount
) {}

public record ProductEdge(Product node, String cursor) {}

public record PageInfo(
        boolean hasNextPage,
        boolean hasPreviousPage,
        String startCursor,
        String endCursor
) {}
```

## 10. Testing with GraphQlTester

```java
@SpringBootTest
@AutoConfigureGraphQlTester
class ProductControllerTest {

    @Autowired
    private GraphQlTester graphQlTester;

    @Test
    void getProduct() {
        graphQlTester.document("""
                    query {
                        product(id: 1) {
                            id
                            name
                            price
                            inStock
                            category {
                                name
                            }
                        }
                    }
                """)
                .execute()
                .path("product.name").entity(String.class).isEqualTo("Widget")
                .path("product.price").entity(BigDecimal.class)
                    .satisfies(price ->
                            assertThat(price).isEqualByComparingTo("29.99"))
                .path("product.inStock").entity(Boolean.class).isEqualTo(true)
                .path("product.category.name").entity(String.class)
                    .isEqualTo("Electronics");
    }

    @Test
    void createProduct() {
        graphQlTester.document("""
                    mutation {
                        createProduct(input: {
                            name: "New Widget"
                            description: "A brand new widget"
                            price: 49.99
                            categoryId: 1
                            stockLevel: 100
                        }) {
                            id
                            name
                            price
                            inStock
                        }
                    }
                """)
                .execute()
                .path("createProduct.id").entity(Long.class)
                    .satisfies(id -> assertThat(id).isNotNull())
                .path("createProduct.name").entity(String.class)
                    .isEqualTo("New Widget")
                .path("createProduct.inStock").entity(Boolean.class)
                    .isEqualTo(true);
    }

    @Test
    void productNotFound() {
        graphQlTester.document("""
                    query {
                        product(id: 9999) {
                            id
                            name
                        }
                    }
                """)
                .execute()
                .errors()
                .satisfy(errors -> {
                    assertThat(errors).hasSize(1);
                    assertThat(errors.get(0).getMessage())
                            .contains("Product not found");
                    assertThat(errors.get(0).getExtensions().get("code"))
                            .isEqualTo("PRODUCT_NOT_FOUND");
                });
    }

    @Test
    void paginatedProducts() {
        graphQlTester.document("""
                    query {
                        products(page: 0, size: 5) {
                            edges {
                                node {
                                    id
                                    name
                                }
                                cursor
                            }
                            pageInfo {
                                hasNextPage
                                hasPreviousPage
                            }
                            totalCount
                        }
                    }
                """)
                .execute()
                .path("products.edges").entityList(Object.class)
                    .hasSizeGreaterThan(0)
                .path("products.totalCount").entity(Long.class)
                    .satisfies(count -> assertThat(count).isGreaterThan(0))
                .path("products.pageInfo.hasNextPage").entity(Boolean.class)
                    .isEqualTo(true);
    }

    @Test
    void searchProducts_withVariables() {
        graphQlTester.document("""
                    query SearchProducts($query: String!) {
                        searchProducts(query: $query) {
                            id
                            name
                            price
                        }
                    }
                """)
                .variable("query", "widget")
                .execute()
                .path("searchProducts").entityList(Product.class)
                .satisfies(products ->
                        assertThat(products).allMatch(p ->
                                p.getName().toLowerCase().contains("widget")));
    }
}
```

### 10.1 HttpGraphQlClient (Client-Side)

```java
@Service
public class ProductGraphQlClient {

    private final HttpGraphQlClient graphQlClient;

    public ProductGraphQlClient(WebClient.Builder webClientBuilder) {
        WebClient webClient = webClientBuilder
                .baseUrl("http://product-service/graphql")
                .build();

        this.graphQlClient = HttpGraphQlClient.builder(webClient)
                .header("Authorization", "Bearer " + getToken())
                .build();
    }

    public Mono<Product> getProduct(Long id) {
        return graphQlClient.document("""
                    query GetProduct($id: ID!) {
                        product(id: $id) {
                            id
                            name
                            price
                            inStock
                            category { name }
                        }
                    }
                """)
                .variable("id", id)
                .retrieve("product")
                .toEntity(Product.class);
    }

    public Mono<List<Product>> searchProducts(String query) {
        return graphQlClient.document("""
                    query Search($q: String!) {
                        searchProducts(query: $q) {
                            id
                            name
                            price
                        }
                    }
                """)
                .variable("q", query)
                .retrieve("searchProducts")
                .toEntityList(Product.class);
    }

    public Mono<Product> createProduct(CreateProductInput input) {
        return graphQlClient.document("""
                    mutation CreateProduct($input: CreateProductInput!) {
                        createProduct(input: $input) {
                            id
                            name
                            price
                            inStock
                        }
                    }
                """)
                .variable("input", Map.of(
                        "name", input.name(),
                        "description", input.description(),
                        "price", input.price(),
                        "categoryId", input.categoryId(),
                        "stockLevel", input.stockLevel()))
                .retrieve("createProduct")
                .toEntity(Product.class);
    }

    // Subscribe to real-time events
    public Flux<OrderStatusEvent> subscribeToOrderStatus(Long orderId) {
        return graphQlClient.document("""
                    subscription {
                        orderStatusChanged(orderId: "%d") {
                            orderId
                            previousStatus
                            newStatus
                            timestamp
                        }
                    }
                """.formatted(orderId))
                .retrieveSubscription("orderStatusChanged")
                .toEntity(OrderStatusEvent.class);
    }
}
```

Spring for GraphQL provides a clean, annotation-driven way to build GraphQL APIs with Spring. The schema-first approach ensures your API contract is explicit and well-documented. Use `@BatchMapping` aggressively to prevent N+1 queries, integrate Spring Security for field-level authorization, and test thoroughly with `GraphQlTester`. For most teams, the schema-first approach with `.graphqls` files is recommended, as it keeps the API contract visible and separate from implementation details.
