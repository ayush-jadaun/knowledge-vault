---
title: "Spring Data Advanced"
description: "Advanced Spring Data techniques — custom repository implementations, QueryDSL integration, Specifications pattern for dynamic queries, database-specific features, multi-datasource configuration, read-write splitting, Hibernate Envers for auditing, entity listeners, and the soft delete pattern."
tags: [spring-data, jpa, querydsl, specifications, multi-datasource]
difficulty: advanced
prerequisites: [spring-boot-fundamentals, spring-data-jpa, sql-fundamentals]
lastReviewed: "2026-03-25"
---

# Spring Data Advanced

Spring Data JPA covers 80% of persistence needs with derived queries and standard CRUD. This guide covers the remaining 20% — the advanced patterns needed for real production systems with complex query logic, multiple databases, auditing requirements, and performance constraints.

## 1. Custom Repository Implementations

### 1.1 Custom Repository Fragment

```java
// 1. Define the custom interface
public interface CustomOrderRepository {
    List<Order> findOrdersWithComplexCriteria(OrderSearchCriteria criteria);
    OrderStatistics calculateStatistics(Long customerId, LocalDate from, LocalDate to);
    int bulkUpdateStatus(OrderStatus from, OrderStatus to, Instant olderThan);
}

// 2. Implement it (suffix must match spring.data.jpa.repositories.implementation-postfix)
public class CustomOrderRepositoryImpl implements CustomOrderRepository {

    private final EntityManager entityManager;

    public CustomOrderRepositoryImpl(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    @Override
    public List<Order> findOrdersWithComplexCriteria(OrderSearchCriteria criteria) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Order> query = cb.createQuery(Order.class);
        Root<Order> root = query.from(Order.class);

        List<Predicate> predicates = new ArrayList<>();

        if (criteria.getCustomerId() != null) {
            predicates.add(cb.equal(root.get("customerId"), criteria.getCustomerId()));
        }
        if (criteria.getStatus() != null) {
            predicates.add(cb.equal(root.get("status"), criteria.getStatus()));
        }
        if (criteria.getMinAmount() != null) {
            predicates.add(cb.greaterThanOrEqualTo(
                    root.get("totalAmount"), criteria.getMinAmount()));
        }
        if (criteria.getMaxAmount() != null) {
            predicates.add(cb.lessThanOrEqualTo(
                    root.get("totalAmount"), criteria.getMaxAmount()));
        }
        if (criteria.getFromDate() != null) {
            predicates.add(cb.greaterThanOrEqualTo(
                    root.get("createdAt"), criteria.getFromDate()));
        }
        if (criteria.getToDate() != null) {
            predicates.add(cb.lessThanOrEqualTo(
                    root.get("createdAt"), criteria.getToDate()));
        }

        query.where(predicates.toArray(new Predicate[0]));
        query.orderBy(cb.desc(root.get("createdAt")));

        return entityManager.createQuery(query)
                .setMaxResults(criteria.getLimit())
                .setFirstResult(criteria.getOffset())
                .getResultList();
    }

    @Override
    public OrderStatistics calculateStatistics(Long customerId,
                                                LocalDate from, LocalDate to) {
        String jpql = """
                SELECT NEW com.example.dto.OrderStatistics(
                    COUNT(o),
                    SUM(o.totalAmount),
                    AVG(o.totalAmount),
                    MIN(o.totalAmount),
                    MAX(o.totalAmount)
                )
                FROM Order o
                WHERE o.customerId = :customerId
                  AND o.createdAt BETWEEN :from AND :to
                  AND o.status != 'CANCELLED'
                """;

        return entityManager.createQuery(jpql, OrderStatistics.class)
                .setParameter("customerId", customerId)
                .setParameter("from", from.atStartOfDay())
                .setParameter("to", to.plusDays(1).atStartOfDay())
                .getSingleResult();
    }

    @Override
    @Modifying
    public int bulkUpdateStatus(OrderStatus from, OrderStatus to, Instant olderThan) {
        String jpql = """
                UPDATE Order o
                SET o.status = :to, o.updatedAt = CURRENT_TIMESTAMP
                WHERE o.status = :from AND o.createdAt < :olderThan
                """;

        return entityManager.createQuery(jpql)
                .setParameter("from", from)
                .setParameter("to", to)
                .setParameter("olderThan", olderThan)
                .executeUpdate();
    }
}

// 3. Extend both JpaRepository and custom interface
public interface OrderRepository extends JpaRepository<Order, Long>,
        CustomOrderRepository,
        JpaSpecificationExecutor<Order> {

    // Standard derived queries
    List<Order> findByCustomerIdAndStatus(Long customerId, OrderStatus status);

    @Query("SELECT o FROM Order o JOIN FETCH o.items WHERE o.id = :id")
    Optional<Order> findByIdWithItems(@Param("id") Long id);

    @Query(value = "SELECT * FROM orders WHERE status = :status " +
            "FOR UPDATE SKIP LOCKED LIMIT :limit", nativeQuery = true)
    List<Order> findAndLockForProcessing(@Param("status") String status,
                                          @Param("limit") int limit);
}
```

## 2. Specifications Pattern

Specifications enable composable, reusable query predicates — ideal for search/filter endpoints.

### 2.1 Specification Definitions

```java
public class OrderSpecifications {

    public static Specification<Order> hasCustomer(Long customerId) {
        return (root, query, cb) -> customerId == null ? null :
                cb.equal(root.get("customerId"), customerId);
    }

    public static Specification<Order> hasStatus(OrderStatus status) {
        return (root, query, cb) -> status == null ? null :
                cb.equal(root.get("status"), status);
    }

    public static Specification<Order> hasStatusIn(Set<OrderStatus> statuses) {
        return (root, query, cb) -> statuses == null || statuses.isEmpty() ? null :
                root.get("status").in(statuses);
    }

    public static Specification<Order> amountBetween(BigDecimal min, BigDecimal max) {
        return (root, query, cb) -> {
            if (min != null && max != null) {
                return cb.between(root.get("totalAmount"), min, max);
            } else if (min != null) {
                return cb.greaterThanOrEqualTo(root.get("totalAmount"), min);
            } else if (max != null) {
                return cb.lessThanOrEqualTo(root.get("totalAmount"), max);
            }
            return null;
        };
    }

    public static Specification<Order> createdBetween(LocalDate from, LocalDate to) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(
                        root.get("createdAt"), from.atStartOfDay()));
            }
            if (to != null) {
                predicates.add(cb.lessThan(
                        root.get("createdAt"), to.plusDays(1).atStartOfDay()));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    public static Specification<Order> containsProduct(String productName) {
        return (root, query, cb) -> {
            if (productName == null) return null;
            Join<Order, OrderItem> items = root.join("items", JoinType.INNER);
            Join<OrderItem, Product> product = items.join("product", JoinType.INNER);
            return cb.like(cb.lower(product.get("name")),
                    "%" + productName.toLowerCase() + "%");
        };
    }

    // Fetch join to avoid N+1 (use carefully — only in queries, not count)
    public static Specification<Order> withItems() {
        return (root, query, cb) -> {
            if (query.getResultType() != Long.class && query.getResultType() != long.class) {
                root.fetch("items", JoinType.LEFT);
            }
            return null;
        };
    }
}
```

### 2.2 Using Specifications in Service

```java
@Service
public class OrderSearchService {

    private final OrderRepository orderRepository;

    public OrderSearchService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    public Page<Order> search(OrderSearchRequest request, Pageable pageable) {
        Specification<Order> spec = Specification
                .where(OrderSpecifications.hasCustomer(request.getCustomerId()))
                .and(OrderSpecifications.hasStatusIn(request.getStatuses()))
                .and(OrderSpecifications.amountBetween(
                        request.getMinAmount(), request.getMaxAmount()))
                .and(OrderSpecifications.createdBetween(
                        request.getFromDate(), request.getToDate()))
                .and(OrderSpecifications.containsProduct(request.getProductName()));

        return orderRepository.findAll(spec, pageable);
    }

    public long count(OrderSearchRequest request) {
        Specification<Order> spec = Specification
                .where(OrderSpecifications.hasCustomer(request.getCustomerId()))
                .and(OrderSpecifications.hasStatus(request.getStatus()));
        return orderRepository.count(spec);
    }
}
```

## 3. QueryDSL Integration

### 3.1 Setup

```xml
<dependency>
    <groupId>com.querydsl</groupId>
    <artifactId>querydsl-jpa</artifactId>
    <classifier>jakarta</classifier>
</dependency>
<dependency>
    <groupId>com.querydsl</groupId>
    <artifactId>querydsl-apt</artifactId>
    <classifier>jakarta</classifier>
    <scope>provided</scope>
</dependency>

<!-- Maven APT plugin to generate Q classes -->
<plugin>
    <groupId>com.mysema.maven</groupId>
    <artifactId>apt-maven-plugin</artifactId>
    <version>1.1.3</version>
    <executions>
        <execution>
            <goals><goal>process</goal></goals>
            <configuration>
                <outputDirectory>target/generated-sources/java</outputDirectory>
                <processor>com.querydsl.apt.jpa.JPAAnnotationProcessor</processor>
            </configuration>
        </execution>
    </executions>
</plugin>
```

### 3.2 QueryDSL Repository

```java
public interface ProductRepository extends JpaRepository<Product, Long>,
        QuerydslPredicateExecutor<Product>,
        QuerydslBinderCustomizer<QProduct> {

    @Override
    default void customize(QuerydslBindings bindings, QProduct product) {
        // Case-insensitive contains for name
        bindings.bind(product.name).first(
                (path, value) -> path.containsIgnoreCase(value));
        // Range for price
        bindings.bind(product.price).all((path, values) -> {
            Iterator<? extends BigDecimal> it = values.iterator();
            BigDecimal from = it.next();
            if (it.hasNext()) {
                return Optional.of(path.between(from, it.next()));
            }
            return Optional.of(path.goe(from));
        });
        // Exclude certain fields from binding
        bindings.excluding(product.createdAt);
    }
}
```

### 3.3 QueryDSL in Service Layer

```java
@Service
public class ProductSearchService {

    private final JPAQueryFactory queryFactory;

    public ProductSearchService(EntityManager entityManager) {
        this.queryFactory = new JPAQueryFactory(entityManager);
    }

    public List<Product> searchProducts(ProductSearchCriteria criteria) {
        QProduct product = QProduct.product;
        QCategory category = QCategory.category;
        QReview review = QReview.review;

        BooleanBuilder predicate = new BooleanBuilder();

        if (criteria.getName() != null) {
            predicate.and(product.name.containsIgnoreCase(criteria.getName()));
        }
        if (criteria.getCategoryId() != null) {
            predicate.and(product.category.id.eq(criteria.getCategoryId()));
        }
        if (criteria.getMinPrice() != null) {
            predicate.and(product.price.goe(criteria.getMinPrice()));
        }
        if (criteria.getMaxPrice() != null) {
            predicate.and(product.price.loe(criteria.getMaxPrice()));
        }
        if (criteria.isInStockOnly()) {
            predicate.and(product.stockLevel.gt(0));
        }
        if (criteria.getMinRating() != null) {
            predicate.and(product.averageRating.goe(criteria.getMinRating()));
        }

        return queryFactory
                .selectFrom(product)
                .leftJoin(product.category, category).fetchJoin()
                .where(predicate)
                .orderBy(getOrderSpecifier(criteria.getSortBy(), product))
                .offset(criteria.getOffset())
                .limit(criteria.getLimit())
                .fetch();
    }

    public List<ProductSalesReport> getSalesReport(LocalDate from, LocalDate to) {
        QProduct product = QProduct.product;
        QOrderItem orderItem = QOrderItem.orderItem;
        QOrder order = QOrder.order;

        return queryFactory
                .select(Projections.constructor(ProductSalesReport.class,
                        product.id,
                        product.name,
                        orderItem.quantity.sum(),
                        orderItem.subtotal.sum(),
                        order.id.countDistinct()))
                .from(orderItem)
                .join(orderItem.product, product)
                .join(orderItem.order, order)
                .where(order.createdAt.between(
                        from.atStartOfDay(), to.plusDays(1).atStartOfDay()))
                .where(order.status.ne(OrderStatus.CANCELLED))
                .groupBy(product.id, product.name)
                .orderBy(orderItem.subtotal.sum().desc())
                .fetch();
    }

    private OrderSpecifier<?> getOrderSpecifier(String sortBy, QProduct product) {
        return switch (sortBy) {
            case "price_asc" -> product.price.asc();
            case "price_desc" -> product.price.desc();
            case "name" -> product.name.asc();
            case "newest" -> product.createdAt.desc();
            case "rating" -> product.averageRating.desc().nullsLast();
            default -> product.createdAt.desc();
        };
    }
}
```

## 4. Multi-Datasource Configuration

### 4.1 Two Datasources

```java
@Configuration
public class DatasourceConfig {

    // Primary datasource — orders database
    @Bean
    @Primary
    @ConfigurationProperties("spring.datasource.orders")
    public DataSource ordersDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean
    @Primary
    public LocalContainerEntityManagerFactoryBean ordersEntityManagerFactory(
            @Qualifier("ordersDataSource") DataSource dataSource,
            EntityManagerFactoryBuilder builder) {
        return builder
                .dataSource(dataSource)
                .packages("com.example.domain.orders")
                .persistenceUnit("orders")
                .properties(Map.of(
                        "hibernate.hbm2ddl.auto", "validate",
                        "hibernate.dialect", "org.hibernate.dialect.PostgreSQLDialect",
                        "hibernate.default_schema", "orders"
                ))
                .build();
    }

    @Bean
    @Primary
    public PlatformTransactionManager ordersTransactionManager(
            @Qualifier("ordersEntityManagerFactory")
            LocalContainerEntityManagerFactoryBean emf) {
        return new JpaTransactionManager(emf.getObject());
    }

    // Secondary datasource — analytics database
    @Bean
    @ConfigurationProperties("spring.datasource.analytics")
    public DataSource analyticsDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean analyticsEntityManagerFactory(
            @Qualifier("analyticsDataSource") DataSource dataSource,
            EntityManagerFactoryBuilder builder) {
        return builder
                .dataSource(dataSource)
                .packages("com.example.domain.analytics")
                .persistenceUnit("analytics")
                .properties(Map.of(
                        "hibernate.hbm2ddl.auto", "validate",
                        "hibernate.dialect", "org.hibernate.dialect.PostgreSQLDialect"
                ))
                .build();
    }

    @Bean
    public PlatformTransactionManager analyticsTransactionManager(
            @Qualifier("analyticsEntityManagerFactory")
            LocalContainerEntityManagerFactoryBean emf) {
        return new JpaTransactionManager(emf.getObject());
    }
}
```

```yaml
spring:
  datasource:
    orders:
      url: jdbc:postgresql://db-primary:5432/orders
      username: orders_app
      password: ${ORDERS_DB_PASSWORD}
      hikari:
        maximum-pool-size: 20
        pool-name: orders-pool
    analytics:
      url: jdbc:postgresql://db-analytics:5432/analytics
      username: analytics_app
      password: ${ANALYTICS_DB_PASSWORD}
      hikari:
        maximum-pool-size: 10
        pool-name: analytics-pool
```

### 4.2 Repository Configuration

```java
@Configuration
@EnableJpaRepositories(
        basePackages = "com.example.domain.orders",
        entityManagerFactoryRef = "ordersEntityManagerFactory",
        transactionManagerRef = "ordersTransactionManager"
)
public class OrdersJpaConfig {}

@Configuration
@EnableJpaRepositories(
        basePackages = "com.example.domain.analytics",
        entityManagerFactoryRef = "analyticsEntityManagerFactory",
        transactionManagerRef = "analyticsTransactionManager"
)
public class AnalyticsJpaConfig {}
```

## 5. Read-Write Splitting

```java
public class RoutingDataSource extends AbstractRoutingDataSource {

    @Override
    protected Object determineCurrentLookupKey() {
        return TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                ? "replica"
                : "primary";
    }
}

@Configuration
public class ReadWriteSplitConfig {

    @Bean
    @ConfigurationProperties("spring.datasource.primary")
    public DataSource primaryDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean
    @ConfigurationProperties("spring.datasource.replica")
    public DataSource replicaDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean
    public DataSource routingDataSource(
            @Qualifier("primaryDataSource") DataSource primary,
            @Qualifier("replicaDataSource") DataSource replica) {

        RoutingDataSource routing = new RoutingDataSource();
        routing.setTargetDataSources(Map.of(
                "primary", primary,
                "replica", replica
        ));
        routing.setDefaultTargetDataSource(primary);
        return routing;
    }

    @Bean
    public DataSource dataSource(@Qualifier("routingDataSource") DataSource routing) {
        return new LazyConnectionDataSourceProxy(routing);
    }
}

// Usage: @Transactional(readOnly = true) routes to replica
@Service
public class OrderQueryService {

    private final OrderRepository orderRepository;

    public OrderQueryService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    @Transactional(readOnly = true)  // goes to replica
    public List<Order> findRecentOrders(int limit) {
        return orderRepository.findRecentOrders(limit);
    }

    @Transactional  // goes to primary
    public Order createOrder(OrderRequest request) {
        Order order = new Order(request);
        return orderRepository.save(order);
    }
}
```

## 6. Hibernate Envers for Auditing

### 6.1 Setup

```xml
<dependency>
    <groupId>org.springframework.data</groupId>
    <artifactId>spring-data-envers</artifactId>
</dependency>
```

```java
@Configuration
@EnableJpaRepositories(repositoryFactoryBeanClass = EnversRevisionRepositoryFactoryBean.class)
public class EnversConfig {}
```

### 6.2 Audited Entities

```java
@Entity
@Table(name = "products")
@Audited
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    private String description;

    @Column(nullable = false)
    private BigDecimal price;

    @Column(name = "stock_level")
    private int stockLevel;

    @NotAudited  // exclude from audit trail
    private int viewCount;

    @ManyToOne
    @JoinColumn(name = "category_id")
    @Audited(targetAuditMode = RelationTargetAuditMode.NOT_AUDITED)
    private Category category;

    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    // getters, setters
}

// Custom revision entity with user tracking
@Entity
@Table(name = "revision_info")
@RevisionEntity(CustomRevisionListener.class)
public class CustomRevisionEntity extends DefaultRevisionEntity {

    @Column(name = "modified_by")
    private String modifiedBy;

    @Column(name = "ip_address")
    private String ipAddress;

    // getters, setters
}

public class CustomRevisionListener implements RevisionListener {

    @Override
    public void newRevision(Object revisionEntity) {
        CustomRevisionEntity revision = (CustomRevisionEntity) revisionEntity;
        SecurityContext context = SecurityContextHolder.getContext();
        if (context.getAuthentication() != null) {
            revision.setModifiedBy(context.getAuthentication().getName());
        }
        // IP address from request context
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (attrs instanceof ServletRequestAttributes servletAttrs) {
            revision.setIpAddress(
                    servletAttrs.getRequest().getRemoteAddr());
        }
    }
}
```

### 6.3 Querying Audit History

```java
public interface ProductRepository extends JpaRepository<Product, Long>,
        RevisionRepository<Product, Long, Integer> {}

@Service
public class ProductAuditService {

    private final ProductRepository productRepository;
    private final AuditReader auditReader;

    public ProductAuditService(ProductRepository productRepository,
                                EntityManager entityManager) {
        this.productRepository = productRepository;
        this.auditReader = AuditReaderFactory.get(entityManager);
    }

    // Get all revisions of a product
    public Revisions<Integer, Product> getRevisions(Long productId) {
        return productRepository.findRevisions(productId);
    }

    // Get product at a specific revision
    public Optional<Revision<Integer, Product>> getAtRevision(Long productId, int revision) {
        return productRepository.findRevision(productId, revision);
    }

    // Get last modification
    public Optional<Revision<Integer, Product>> getLastModification(Long productId) {
        return productRepository.findLastChangeRevision(productId);
    }

    // Query with AuditReader for complex queries
    public List<Product> findProductsModifiedBetween(Instant from, Instant to) {
        return auditReader.createQuery()
                .forRevisionsOfEntity(Product.class, true, true)
                .add(AuditEntity.revisionProperty("timestamp")
                        .between(from.toEpochMilli(), to.toEpochMilli()))
                .addOrder(AuditEntity.revisionProperty("timestamp").desc())
                .getResultList();
    }

    public List<Object[]> getPriceHistory(Long productId) {
        return auditReader.createQuery()
                .forRevisionsOfEntity(Product.class, false, true)
                .add(AuditEntity.id().eq(productId))
                .add(AuditEntity.property("price").hasChanged())
                .addProjection(AuditEntity.property("price"))
                .addProjection(AuditEntity.revisionProperty("timestamp"))
                .addProjection(AuditEntity.revisionProperty("modifiedBy"))
                .addOrder(AuditEntity.revisionProperty("timestamp").asc())
                .getResultList();
    }
}
```

## 7. Entity Listeners

```java
@Entity
@Table(name = "orders")
@EntityListeners({AuditingEntityListener.class, OrderEntityListener.class})
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private OrderStatus status;
    private BigDecimal totalAmount;

    @CreatedBy
    private String createdBy;

    @LastModifiedBy
    private String lastModifiedBy;

    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    // getters, setters
}

public class OrderEntityListener {

    @PrePersist
    public void prePersist(Order order) {
        if (order.getStatus() == null) {
            order.setStatus(OrderStatus.CREATED);
        }
        order.setTotalAmount(calculateTotal(order));
    }

    @PreUpdate
    public void preUpdate(Order order) {
        order.setTotalAmount(calculateTotal(order));
    }

    @PostPersist
    public void postPersist(Order order) {
        // Publish domain event after insert
        ApplicationContext ctx = ApplicationContextProvider.getContext();
        ctx.publishEvent(new OrderCreatedEvent(order.getId()));
    }

    @PostUpdate
    public void postUpdate(Order order) {
        ApplicationContext ctx = ApplicationContextProvider.getContext();
        ctx.publishEvent(new OrderUpdatedEvent(order.getId(), order.getStatus()));
    }

    private BigDecimal calculateTotal(Order order) {
        if (order.getItems() == null) return BigDecimal.ZERO;
        return order.getItems().stream()
                .map(item -> item.getUnitPrice()
                        .multiply(BigDecimal.valueOf(item.getQuantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}

// Auditor provider for @CreatedBy / @LastModifiedBy
@Configuration
@EnableJpaAuditing
public class JpaAuditConfig {

    @Bean
    public AuditorAware<String> auditorProvider() {
        return () -> Optional.ofNullable(SecurityContextHolder.getContext())
                .map(SecurityContext::getAuthentication)
                .filter(Authentication::isAuthenticated)
                .map(Authentication::getName);
    }
}
```

## 8. Soft Delete Pattern

```java
@MappedSuperclass
public abstract class SoftDeletableEntity {

    @Column(name = "deleted")
    private boolean deleted = false;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "deleted_by")
    private String deletedBy;

    public void softDelete(String deletedBy) {
        this.deleted = true;
        this.deletedAt = Instant.now();
        this.deletedBy = deletedBy;
    }

    public void restore() {
        this.deleted = false;
        this.deletedAt = null;
        this.deletedBy = null;
    }

    // getters
}

@Entity
@Table(name = "products")
@Where(clause = "deleted = false")          // Hibernate filter — auto-excludes deleted
@SQLDelete(sql = "UPDATE products SET deleted = true, deleted_at = NOW() WHERE id = ?")
public class Product extends SoftDeletableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;
    private BigDecimal price;

    // getters, setters
}

// Repository with explicit methods for soft-deleted records
public interface ProductRepository extends JpaRepository<Product, Long> {

    // Normal queries automatically exclude deleted records due to @Where

    // Explicitly query deleted records using native query
    @Query(value = "SELECT * FROM products WHERE deleted = true ORDER BY deleted_at DESC",
            nativeQuery = true)
    List<Product> findDeleted();

    @Query(value = "SELECT * FROM products WHERE id = :id",  // ignores @Where
            nativeQuery = true)
    Optional<Product> findByIdIncludingDeleted(@Param("id") Long id);

    // Restore a soft-deleted product
    @Modifying
    @Query(value = "UPDATE products SET deleted = false, deleted_at = NULL, " +
            "deleted_by = NULL WHERE id = :id", nativeQuery = true)
    int restore(@Param("id") Long id);

    // Permanently delete
    @Modifying
    @Query(value = "DELETE FROM products WHERE id = :id AND deleted = true",
            nativeQuery = true)
    int permanentlyDelete(@Param("id") Long id);
}

@Service
public class ProductService {

    private final ProductRepository productRepository;

    public ProductService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    @Transactional
    public void deleteProduct(Long id) {
        // Calls @SQLDelete — sets deleted=true instead of DELETE
        productRepository.deleteById(id);
    }

    @Transactional
    public void restoreProduct(Long id) {
        int updated = productRepository.restore(id);
        if (updated == 0) {
            throw new ProductNotFoundException(id);
        }
    }

    @Transactional
    public void purgeDeletedOlderThan(Duration age) {
        // Permanently remove records deleted more than `age` ago
        Instant cutoff = Instant.now().minus(age);
        productRepository.findDeleted().stream()
                .filter(p -> p.getDeletedAt().isBefore(cutoff))
                .forEach(p -> productRepository.permanentlyDelete(p.getId()));
    }
}
```

## 9. Database-Specific Features

### 9.1 PostgreSQL JSON Columns

```java
@Entity
@Table(name = "events")
@TypeDef(name = "jsonb", typeClass = JsonBinaryType.class)
public class Event {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Type(JsonBinaryType.class)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> payload;

    @Type(JsonBinaryType.class)
    @Column(columnDefinition = "jsonb")
    private EventMetadata metadata;

    // getters, setters
}

public interface EventRepository extends JpaRepository<Event, Long> {

    @Query(value = "SELECT * FROM events WHERE payload->>'type' = :type",
            nativeQuery = true)
    List<Event> findByPayloadType(@Param("type") String type);

    @Query(value = "SELECT * FROM events WHERE payload @> CAST(:criteria AS jsonb)",
            nativeQuery = true)
    List<Event> findByPayloadCriteria(@Param("criteria") String jsonCriteria);

    @Query(value = "SELECT * FROM events WHERE payload->'tags' ?| ARRAY[:tags]",
            nativeQuery = true)
    List<Event> findByAnyTag(@Param("tags") String[] tags);
}
```

### 9.2 Projections for Performance

```java
// Interface projection — only fetches specified columns
public interface OrderSummary {
    Long getId();
    OrderStatus getStatus();
    BigDecimal getTotalAmount();
    Instant getCreatedAt();

    @Value("#{target.firstName + ' ' + target.lastName}")
    String getCustomerFullName();
}

public interface OrderRepository extends JpaRepository<Order, Long> {

    List<OrderSummary> findByStatus(OrderStatus status);

    // Class-based projection (DTO)
    @Query("SELECT new com.example.dto.OrderDTO(o.id, o.status, o.totalAmount, o.createdAt) " +
           "FROM Order o WHERE o.customerId = :customerId")
    List<OrderDTO> findDtoByCustomerId(@Param("customerId") Long customerId);

    // Dynamic projection
    <T> List<T> findByCustomerId(Long customerId, Class<T> type);
}

// Usage:
// List<OrderSummary> summaries = orderRepository.findByCustomerId(42L, OrderSummary.class);
// List<OrderDTO> dtos = orderRepository.findByCustomerId(42L, OrderDTO.class);
```

These advanced Spring Data patterns cover the complex persistence scenarios that arise in production systems. Use Specifications or QueryDSL for dynamic queries, multi-datasource for polyglot persistence, Envers for audit trails, and soft deletes for data retention policies. Start simple with derived queries and escalate to these patterns only when the simpler approach is insufficient.
