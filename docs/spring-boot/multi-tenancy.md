---
title: "Multi-Tenancy"
description: "Complete guide to multi-tenancy in Spring Boot — discriminator column strategy, schema-per-tenant, database-per-tenant, tenant resolution from headers and subdomains, Hibernate filters, dynamic DataSource routing, and tenant-aware caching"
tags: [spring-boot, multi-tenancy, saas, hibernate, database]
difficulty: advanced
prerequisites: []
lastReviewed: "2026-03-25"
---

# Multi-Tenancy

Multi-tenancy is the architecture that makes SaaS possible. Instead of deploying a separate application instance for each customer, a single application serves multiple tenants (customers) simultaneously. Each tenant's data is isolated — they cannot see, modify, or even know about other tenants' data — but they share the same application code, servers, and often the same database.

The three strategies for data isolation — shared database with discriminator column, schema per tenant, and database per tenant — represent a spectrum of tradeoffs between cost efficiency and isolation strength. Spring Boot and Hibernate support all three, but the implementation complexity varies significantly.

## The Three Strategies

```
Strategy 1: Discriminator Column (Shared Everything)
─────────────────────────────────────────────────────
┌──────────────────────────────────────────────────────┐
│                  Single Database                      │
│  ┌────────────────────────────────────────────────┐  │
│  │              orders table                       │  │
│  │  id │ tenant_id │ product │ amount │ status     │  │
│  │  1  │ acme      │ Widget  │ 99.99  │ SHIPPED    │  │
│  │  2  │ globex    │ Gadget  │ 49.99  │ PENDING    │  │
│  │  3  │ acme      │ Gizmo   │ 29.99  │ DELIVERED  │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
Isolation: Row-level (WHERE tenant_id = ?)
Cost: Lowest (shared everything)
Risk: One missing WHERE clause leaks data

Strategy 2: Schema Per Tenant
─────────────────────────────
┌──────────────────────────────────────────────────────┐
│                  Single Database                      │
│  ┌──────────────┐  ┌──────────────┐                  │
│  │ schema: acme  │  │ schema: globex│                 │
│  │ ┌──────────┐ │  │ ┌──────────┐ │                  │
│  │ │  orders   │ │  │ │  orders   │ │                 │
│  │ │ id│amount │ │  │ │ id│amount │ │                 │
│  │ └──────────┘ │  │ └──────────┘ │                  │
│  └──────────────┘  └──────────────┘                  │
└──────────────────────────────────────────────────────┘
Isolation: Schema-level (SET search_path TO ?)
Cost: Medium (shared DB, separate schemas)
Risk: Schema management complexity

Strategy 3: Database Per Tenant
───────────────────────────────
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  DB: acme     │  │  DB: globex   │  │  DB: initech  │
│ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐ │
│ │  orders   │ │  │ │  orders   │ │  │ │  orders   │ │
│ └──────────┘ │  │ └──────────┘ │  │ └──────────┘ │
└──────────────┘  └──────────────┘  └──────────────┘
Isolation: Full database separation
Cost: Highest (separate connections, backups)
Risk: Connection pool exhaustion at scale
```

## Tenant Resolution

Before any multi-tenancy strategy works, you must identify the current tenant from the incoming request:

```java
public interface TenantResolver {
    String resolveTenant(HttpServletRequest request);
}

// Strategy 1: HTTP Header
@Component
public class HeaderTenantResolver implements TenantResolver {
    @Override
    public String resolveTenant(HttpServletRequest request) {
        String tenant = request.getHeader("X-Tenant-ID");
        if (tenant == null || tenant.isBlank()) {
            throw new TenantResolutionException("Missing X-Tenant-ID header");
        }
        return tenant.toLowerCase().trim();
    }
}

// Strategy 2: Subdomain (acme.app.com → acme)
@Component
public class SubdomainTenantResolver implements TenantResolver {
    @Override
    public String resolveTenant(HttpServletRequest request) {
        String host = request.getServerName();
        String tenant = host.split("\\.")[0]; // acme.app.com → acme
        if ("www".equals(tenant) || "app".equals(tenant)) {
            throw new TenantResolutionException("Cannot resolve tenant from: " + host);
        }
        return tenant;
    }
}

// Strategy 3: JWT claim
@Component
public class JwtTenantResolver implements TenantResolver {
    private final JwtDecoder jwtDecoder;

    @Override
    public String resolveTenant(HttpServletRequest request) {
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            Jwt jwt = jwtDecoder.decode(authHeader.substring(7));
            String tenant = jwt.getClaimAsString("tenant_id");
            if (tenant != null) return tenant;
        }
        throw new TenantResolutionException("Cannot resolve tenant from JWT");
    }
}
```

### TenantContext

Store the resolved tenant in a `ThreadLocal` so it is available throughout the request lifecycle:

```java
public class TenantContext {

    private static final ThreadLocal<String> currentTenant = new InheritableThreadLocal<>();

    public static void setTenantId(String tenantId) {
        currentTenant.set(tenantId);
    }

    public static String getTenantId() {
        String tenant = currentTenant.get();
        if (tenant == null) {
            throw new IllegalStateException("No tenant set in current context");
        }
        return tenant;
    }

    public static String getTenantIdOrNull() {
        return currentTenant.get();
    }

    public static void clear() {
        currentTenant.remove();
    }
}
```

### Tenant Filter

```java
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TenantFilter extends OncePerRequestFilter {

    private final TenantResolver tenantResolver;
    private final TenantRegistry tenantRegistry;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain filterChain)
            throws ServletException, IOException {
        try {
            String tenantId = tenantResolver.resolveTenant(request);

            // Validate tenant exists
            if (!tenantRegistry.exists(tenantId)) {
                response.sendError(HttpServletResponse.SC_BAD_REQUEST,
                        "Unknown tenant: " + tenantId);
                return;
            }

            TenantContext.setTenantId(tenantId);
            MDC.put("tenantId", tenantId); // For logging

            filterChain.doFilter(request, response);
        } catch (TenantResolutionException e) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, e.getMessage());
        } finally {
            TenantContext.clear();
            MDC.remove("tenantId");
        }
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/actuator") || path.startsWith("/public");
    }
}
```

## Strategy 1: Discriminator Column

The simplest approach. All tenants share the same tables, with a `tenant_id` column on every row.

### Base Entity

```java
@MappedSuperclass
@FilterDef(name = "tenantFilter",
        parameters = @ParamDef(name = "tenantId", type = String.class))
@Filter(name = "tenantFilter", condition = "tenant_id = :tenantId")
public abstract class TenantAwareEntity {

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private String tenantId;

    @PrePersist
    public void prePersist() {
        if (this.tenantId == null) {
            this.tenantId = TenantContext.getTenantId();
        }
    }

    // getter, setter
}
```

### Entity Example

```java
@Entity
@Table(name = "orders", indexes = {
    @Index(name = "idx_orders_tenant", columnList = "tenant_id"),
    @Index(name = "idx_orders_tenant_status", columnList = "tenant_id, status")
})
public class Order extends TenantAwareEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    private String productName;
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    private OrderStatus status;

    private Instant createdAt = Instant.now();
}
```

### Hibernate Filter Activation

```java
@Component
public class TenantHibernateFilter {

    @PersistenceContext
    private EntityManager entityManager;

    /**
     * Activates the tenant filter on every request.
     * Called by a request-scoped bean or interceptor.
     */
    public void enableFilter() {
        Session session = entityManager.unwrap(Session.class);
        session.enableFilter("tenantFilter")
               .setParameter("tenantId", TenantContext.getTenantId());
    }
}
```

```java
@Aspect
@Component
public class TenantFilterAspect {

    private final TenantHibernateFilter tenantFilter;

    @Around("execution(* com.example..repository.*.*(..))")
    public Object applyTenantFilter(ProceedingJoinPoint joinPoint) throws Throwable {
        tenantFilter.enableFilter();
        return joinPoint.proceed();
    }
}
```

### Alternative: Spring Data JPA with @Query

If Hibernate filters feel too magical, use explicit tenant filtering:

```java
public interface OrderRepository extends JpaRepository<Order, String> {

    @Query("SELECT o FROM Order o WHERE o.tenantId = :#{T(com.example.TenantContext).getTenantId()} AND o.status = :status")
    List<Order> findByStatus(@Param("status") OrderStatus status);

    @Query("SELECT o FROM Order o WHERE o.tenantId = :#{T(com.example.TenantContext).getTenantId()}")
    Page<Order> findAllForTenant(Pageable pageable);

    // Native query for complex cases
    @Query(value = "SELECT * FROM orders WHERE tenant_id = :tenantId AND created_at > :since",
            nativeQuery = true)
    List<Order> findRecentOrders(@Param("tenantId") String tenantId,
                                 @Param("since") Instant since);
}
```

## Strategy 2: Schema Per Tenant

Each tenant gets their own database schema. All schemas have identical table structures:

### Dynamic Schema Routing

```java
@Component
public class SchemaPerTenantConnectionProvider implements MultiTenantConnectionProvider {

    private final DataSource dataSource;

    @Override
    public Connection getAnyConnection() throws SQLException {
        return dataSource.getConnection();
    }

    @Override
    public void releaseAnyConnection(Connection connection) throws SQLException {
        connection.close();
    }

    @Override
    public Connection getConnection(Object tenantIdentifier) throws SQLException {
        Connection connection = getAnyConnection();
        connection.createStatement().execute(
                "SET search_path TO " + sanitize((String) tenantIdentifier));
        return connection;
    }

    @Override
    public void releaseConnection(Object tenantIdentifier, Connection connection)
            throws SQLException {
        connection.createStatement().execute("SET search_path TO public");
        releaseAnyConnection(connection);
    }

    private String sanitize(String tenantId) {
        // Prevent SQL injection in schema name
        if (!tenantId.matches("^[a-z0-9_]+$")) {
            throw new IllegalArgumentException("Invalid tenant ID: " + tenantId);
        }
        return "tenant_" + tenantId;
    }

    @Override
    public boolean supportsAggressiveRelease() {
        return false;
    }
}
```

### Tenant Identifier Resolver

```java
@Component
public class CurrentTenantIdentifierResolverImpl
        implements CurrentTenantIdentifierResolver<String> {

    @Override
    public String resolveCurrentTenantIdentifier() {
        String tenant = TenantContext.getTenantIdOrNull();
        return tenant != null ? tenant : "public";
    }

    @Override
    public boolean validateExistingCurrentSessions() {
        return true;
    }
}
```

### Hibernate Configuration

```java
@Configuration
public class HibernateMultiTenantConfig {

    @Bean
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(
            DataSource dataSource,
            SchemaPerTenantConnectionProvider connectionProvider,
            CurrentTenantIdentifierResolverImpl tenantResolver) {

        LocalContainerEntityManagerFactoryBean em =
                new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(dataSource);
        em.setPackagesToScan("com.example.entity");

        HibernateJpaVendorAdapter vendorAdapter = new HibernateJpaVendorAdapter();
        em.setJpaVendorAdapter(vendorAdapter);

        Map<String, Object> properties = new HashMap<>();
        properties.put(AvailableSettings.MULTI_TENANT_CONNECTION_PROVIDER,
                connectionProvider);
        properties.put(AvailableSettings.MULTI_TENANT_IDENTIFIER_RESOLVER,
                tenantResolver);
        properties.put(AvailableSettings.HBM2DDL_AUTO, "none");
        em.setJpaPropertyMap(properties);

        return em;
    }
}
```

### Schema Provisioning for New Tenants

```java
@Service
public class TenantProvisioningService {

    private final DataSource dataSource;

    @Transactional
    public void provisionTenant(String tenantId) {
        String schemaName = "tenant_" + sanitize(tenantId);

        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement()) {

            // Create schema
            stmt.execute("CREATE SCHEMA IF NOT EXISTS " + schemaName);

            // Run migrations in the new schema
            Flyway flyway = Flyway.configure()
                    .dataSource(dataSource)
                    .schemas(schemaName)
                    .locations("classpath:db/migration/tenant")
                    .load();
            flyway.migrate();

        } catch (SQLException e) {
            throw new TenantProvisioningException(
                    "Failed to provision schema for tenant: " + tenantId, e);
        }
    }
}
```

## Strategy 3: Database Per Tenant

Maximum isolation. Each tenant has their own database instance (or at least a separate logical database):

### Dynamic DataSource Routing

```java
public class TenantRoutingDataSource extends AbstractRoutingDataSource {

    @Override
    protected Object determineCurrentLookupKey() {
        return TenantContext.getTenantIdOrNull();
    }
}
```

```java
@Configuration
public class DataSourceConfig {

    @Bean
    public DataSource dataSource(TenantDataSourceProperties properties) {
        TenantRoutingDataSource routingDataSource = new TenantRoutingDataSource();

        Map<Object, Object> targetDataSources = new HashMap<>();

        for (Map.Entry<String, TenantDbConfig> entry :
                properties.getTenants().entrySet()) {
            String tenantId = entry.getKey();
            TenantDbConfig config = entry.getValue();

            HikariDataSource ds = new HikariDataSource();
            ds.setJdbcUrl(config.getUrl());
            ds.setUsername(config.getUsername());
            ds.setPassword(config.getPassword());
            ds.setMaximumPoolSize(config.getMaxPoolSize());
            ds.setPoolName("tenant-" + tenantId);

            targetDataSources.put(tenantId, ds);
        }

        routingDataSource.setTargetDataSources(targetDataSources);
        routingDataSource.setDefaultTargetDataSource(
                targetDataSources.values().iterator().next());

        return routingDataSource;
    }
}
```

### Dynamic Tenant Registration

For SaaS with many tenants, creating all DataSources at startup is not practical:

```java
@Service
public class DynamicTenantDataSourceService {

    private final Map<String, DataSource> tenantDataSources = new ConcurrentHashMap<>();
    private final TenantRoutingDataSource routingDataSource;
    private final TenantConfigRepository configRepo;

    public DataSource getOrCreateDataSource(String tenantId) {
        return tenantDataSources.computeIfAbsent(tenantId, id -> {
            TenantConfig config = configRepo.findByTenantId(id)
                    .orElseThrow(() -> new TenantNotFoundException(id));

            HikariDataSource ds = new HikariDataSource();
            ds.setJdbcUrl(config.getDbUrl());
            ds.setUsername(config.getDbUsername());
            ds.setPassword(config.getDbPassword());
            ds.setMaximumPoolSize(5); // Keep small per tenant
            ds.setMinimumIdle(1);
            ds.setIdleTimeout(300000); // 5 minutes
            ds.setPoolName("tenant-" + id);

            // Update routing DataSource
            Map<Object, Object> currentSources = new HashMap<>(
                    routingDataSource.getResolvedDataSources());
            currentSources.put(id, ds);
            routingDataSource.setTargetDataSources(currentSources);
            routingDataSource.afterPropertiesSet();

            return ds;
        });
    }

    // Evict idle tenant DataSources to prevent pool exhaustion
    @Scheduled(fixedRate = 300000)
    public void evictIdleTenants() {
        tenantDataSources.entrySet().removeIf(entry -> {
            HikariDataSource ds = (HikariDataSource) entry.getValue();
            if (ds.getHikariPoolMXBean().getActiveConnections() == 0
                    && ds.getHikariPoolMXBean().getIdleConnections() > 0) {
                ds.close();
                return true;
            }
            return false;
        });
    }
}
```

## Tenant-Aware Caching

Cache keys must include the tenant identifier to prevent cross-tenant data leaks:

```java
@Configuration
@EnableCaching
public class TenantAwareCacheConfig {

    @Bean
    public CacheManager cacheManager() {
        return new TenantAwareCacheManager(
                new ConcurrentMapCacheManager("users", "orders", "products"));
    }
}

public class TenantAwareCacheManager implements CacheManager {

    private final CacheManager delegate;

    @Override
    public Cache getCache(String name) {
        String tenantId = TenantContext.getTenantIdOrNull();
        String tenantCacheName = tenantId != null ? tenantId + ":" + name : name;
        return delegate.getCache(tenantCacheName);
    }

    @Override
    public Collection<String> getCacheNames() {
        return delegate.getCacheNames();
    }
}
```

## Strategy Comparison

| Factor | Discriminator Column | Schema Per Tenant | Database Per Tenant |
|--------|---------------------|-------------------|---------------------|
| Data isolation | Row-level (weakest) | Schema-level | Full (strongest) |
| Cost per tenant | Very low | Low | High |
| Max tenants | 10,000+ | ~1,000 | ~100 |
| Query complexity | Must filter every query | Transparent | Transparent |
| Schema customization | None | Possible | Full |
| Backup/restore | All tenants together | Per-schema | Per-tenant |
| Performance isolation | None | Partial | Full |
| Compliance (GDPR, SOC2) | May not satisfy | Often sufficient | Strongest |
| Connection pool | Single pool | Single pool | Pool per tenant |
| Migration complexity | Single migration | Migration per schema | Migration per database |

## Common Pitfalls

| Pitfall | Consequence | Solution |
|---------|------------|----------|
| Missing tenant filter on a query | Data leak between tenants | Hibernate filters + integration tests |
| `ThreadLocal` not cleared | Tenant leak on thread reuse | Always clear in `finally` block |
| Async processing loses tenant | Wrong tenant context | Pass tenant ID explicitly, set in async thread |
| Shared sequence/ID generator | IDs reveal tenant activity | UUID or tenant-scoped sequences |
| Forgot tenant in cache key | Cache returns wrong tenant's data | Tenant-aware CacheManager |
| JOIN across tenant boundaries | Data leak in complex queries | Database-level isolation for sensitive data |

Multi-tenancy is not just a database concern -- it touches caching, async processing, file storage, background jobs, logging, and monitoring. Every layer of your application must be tenant-aware. The discriminator column approach is the easiest to implement but the hardest to get right because a single missing WHERE clause leaks data. Schema and database isolation are more expensive but structurally prevent cross-tenant access.

## Interview Questions

**Q1: What are the three strategies for multi-tenant data isolation and when should you use each?**
::: details Answer
(1) **Discriminator column**: All tenants share one database and tables. Each row has a `tenant_id` column. Cheapest, supports 10,000+ tenants, but one missing WHERE clause leaks data. Best for B2C SaaS with many small tenants. (2) **Schema per tenant**: Each tenant gets a separate schema in the same database. Moderate cost, supports ~1,000 tenants, better isolation. Best for B2B SaaS where tenants need some customization. (3) **Database per tenant**: Each tenant gets a separate database. Highest cost, supports ~100 tenants, strongest isolation. Best for enterprise SaaS with compliance requirements (GDPR, SOC2) or tenants needing independent backup/restore.
:::

**Q2: How do you resolve the current tenant from an incoming request?**
::: details Answer
Common strategies: (1) **HTTP header** (`X-Tenant-ID`) -- simple, used for API-to-API calls. (2) **Subdomain** (`acme.app.com` resolves to tenant `acme`) -- natural for user-facing apps. (3) **JWT claim** (`tenant_id` in the access token) -- secure, tied to authentication. (4) **Path prefix** (`/tenants/acme/api/...`) -- explicit but verbose. The resolved tenant ID is stored in a `ThreadLocal` (`TenantContext`) and used throughout the request lifecycle. Always clear the context in a `finally` block and validate that the tenant exists in the registry.
:::

**Q3: How do Hibernate filters work for row-level tenant isolation?**
::: details Answer
Hibernate filters add automatic WHERE clauses to all queries on annotated entities. Define a filter with `@FilterDef(name = "tenantFilter", parameters = @ParamDef(name = "tenantId", type = String.class))` on a `@MappedSuperclass`. Apply it with `@Filter(name = "tenantFilter", condition = "tenant_id = :tenantId")`. Activate it on each request by calling `session.enableFilter("tenantFilter").setParameter("tenantId", currentTenant)`. Use an AOP aspect to activate the filter automatically before repository method calls. This ensures every query includes the tenant filter without explicit WHERE clauses.
:::

**Q4: What are the biggest risks with discriminator-column multi-tenancy?**
::: details Answer
(1) **Data leaks**: A single forgotten tenant filter on a query exposes all tenants' data. (2) **Cache poisoning**: Cache keys without tenant prefixes serve one tenant's data to another. (3) **Async context loss**: `ThreadLocal` tenant context is lost in async threads, causing queries to run without tenant filtering. (4) **Noisy neighbor**: One tenant's large queries slow down the database for all tenants. (5) **Backup complexity**: Cannot backup or restore a single tenant's data independently. Mitigate with Hibernate filters, tenant-aware caching, explicit tenant propagation in async decorators, and comprehensive integration tests that verify tenant isolation.
:::

**Q5: How do you handle database migrations in a schema-per-tenant architecture?**
::: details Answer
Maintain two sets of migrations: shared schema migrations (tenant registry, billing, shared config) and tenant schema migrations (tenant-specific tables). On startup, run shared migrations first, then iterate over all tenant schemas and apply tenant migrations to each using Flyway configured with the tenant schema name. For new tenant provisioning, create the schema and run all tenant migrations. Use a `@Scheduled` job or event listener to apply pending migrations to any schemas that missed an update. Test migrations against multiple schemas in CI using Testcontainers.
:::
