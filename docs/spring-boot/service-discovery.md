---
title: "Service Discovery"
description: "Complete guide to service discovery in Spring Cloud — Eureka server/client setup, health checks, self-preservation mode, Consul integration, Kubernetes-native discovery, client-side load balancing with Spring Cloud LoadBalancer, and failover strategies for resilient microservices."
tags: [service-discovery, eureka, consul, microservices, load-balancing]
difficulty: intermediate
prerequisites: [spring-boot-fundamentals, microservices-basics, networking-basics]
lastReviewed: "2026-03-25"
---

# Service Discovery

In a microservices architecture, services need to find each other without hard-coded hostnames and ports. Service discovery solves this by maintaining a registry of available service instances and providing lookup mechanisms for clients.

## 1. Service Discovery Patterns

```
┌──────────────────────────────────────────────────────────────┐
│                  Client-Side Discovery                        │
│                                                              │
│  Client ──query──> Registry ──returns──> [instance1:8081,    │
│    │                                      instance2:8082,    │
│    │                                      instance3:8083]    │
│    │                                                         │
│    └──── selects instance (round-robin, random, etc.) ───>   │
│          instance2:8082                                       │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                  Server-Side Discovery                        │
│                                                              │
│  Client ──request──> Load Balancer ──query──> Registry       │
│                          │                                   │
│                          └──routes──> instance2:8082          │
└──────────────────────────────────────────────────────────────┘
```

## 2. Eureka Server

### 2.1 Standalone Eureka Server

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-netflix-eureka-server</artifactId>
</dependency>
```

```java
@SpringBootApplication
@EnableEurekaServer
public class EurekaServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(EurekaServerApplication.class, args);
    }
}
```

```yaml
# application.yml for standalone Eureka
server:
  port: 8761

spring:
  application:
    name: eureka-server

eureka:
  instance:
    hostname: localhost
  client:
    register-with-eureka: false     # don't register itself
    fetch-registry: false           # don't fetch from other Eureka
    service-url:
      defaultZone: http://${eureka.instance.hostname}:${server.port}/eureka/
  server:
    enable-self-preservation: true
    renewal-percent-threshold: 0.85
    eviction-interval-timer-in-ms: 60000
    response-cache-update-interval-ms: 30000
```

### 2.2 Eureka Server Cluster (High Availability)

```yaml
# Eureka Node 1 — eureka-1.yml
server:
  port: 8761

spring:
  application:
    name: eureka-server

eureka:
  instance:
    hostname: eureka-1.internal
    prefer-ip-address: false
  client:
    register-with-eureka: true
    fetch-registry: true
    service-url:
      defaultZone: http://eureka-2.internal:8762/eureka/,http://eureka-3.internal:8763/eureka/
  server:
    enable-self-preservation: true
    wait-time-in-ms-when-sync-empty: 0

---
# Eureka Node 2 — eureka-2.yml
server:
  port: 8762

eureka:
  instance:
    hostname: eureka-2.internal
  client:
    service-url:
      defaultZone: http://eureka-1.internal:8761/eureka/,http://eureka-3.internal:8763/eureka/

---
# Eureka Node 3 — eureka-3.yml
server:
  port: 8763

eureka:
  instance:
    hostname: eureka-3.internal
  client:
    service-url:
      defaultZone: http://eureka-1.internal:8761/eureka/,http://eureka-2.internal:8762/eureka/
```

### 2.3 Self-Preservation Mode

Eureka enters self-preservation when the percentage of heartbeat renewals drops below the threshold (default 85%). In this mode, it stops evicting instances to prevent network partition from wiping the registry.

```java
@Configuration
public class EurekaServerConfig {

    @Bean
    public EurekaServerConfigBean eurekaServerConfig() {
        EurekaServerConfigBean config = new EurekaServerConfigBean();
        config.setEnableSelfPreservation(true);
        config.setRenewalPercentThreshold(0.85);
        config.setRenewalThresholdUpdateIntervalMs(15 * 60 * 1000); // 15 min
        config.setEvictionIntervalTimerInMs(60 * 1000); // 60 seconds
        return config;
    }
}

// Monitoring self-preservation status
@RestController
@RequestMapping("/api/eureka")
public class EurekaMonitorController {

    private final EurekaServerContext serverContext;

    public EurekaMonitorController(EurekaServerContext serverContext) {
        this.serverContext = serverContext;
    }

    @GetMapping("/status")
    public Map<String, Object> getStatus() {
        PeerAwareInstanceRegistry registry = serverContext.getRegistry();
        return Map.of(
                "isSelfPreservationModeEnabled",
                        serverContext.getServerConfig().shouldEnableSelfPreservation(),
                "numberOfRenewsPerMinThreshold",
                        registry.getNumOfRenewsPerMinThreshold(),
                "numberOfRenewsInLastMin",
                        registry.getNumOfRenewsInLastMin(),
                "registeredInstances",
                        registry.getSortedApplications().size()
        );
    }
}
```

## 3. Eureka Client

### 3.1 Client Configuration

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-netflix-eureka-client</artifactId>
</dependency>
```

```yaml
spring:
  application:
    name: order-service

server:
  port: 0     # random port for multiple instances

eureka:
  client:
    service-url:
      defaultZone: http://eureka-1:8761/eureka/,http://eureka-2:8762/eureka/
    registry-fetch-interval-seconds: 15     # how often to fetch registry
    initial-instance-info-replication-interval-seconds: 10
    instance-info-replication-interval-seconds: 30
    healthcheck:
      enabled: true                          # use Spring Boot health checks
  instance:
    prefer-ip-address: true                  # use IP instead of hostname
    lease-renewal-interval-in-seconds: 10    # heartbeat interval
    lease-expiration-duration-in-seconds: 30 # timeout before eviction
    instance-id: ${spring.application.name}:${random.value}
    metadata-map:
      version: 2.1.0
      region: us-east-1
      zone: us-east-1a
```

### 3.2 Custom Health Check

```java
@Component
public class OrderServiceHealthCheckHandler implements HealthCheckHandler {

    private final DataSource dataSource;
    private final KafkaTemplate<String, String> kafkaTemplate;

    public OrderServiceHealthCheckHandler(DataSource dataSource,
                                           KafkaTemplate<String, String> kafkaTemplate) {
        this.dataSource = dataSource;
        this.kafkaTemplate = kafkaTemplate;
    }

    @Override
    public InstanceInfo.InstanceStatus getStatus(InstanceInfo.InstanceStatus currentStatus) {
        // Check database connectivity
        try (Connection conn = dataSource.getConnection()) {
            conn.isValid(2);
        } catch (SQLException e) {
            return InstanceInfo.InstanceStatus.DOWN;
        }

        // Check Kafka connectivity
        try {
            kafkaTemplate.getProducerFactory().createProducer().metrics();
        } catch (Exception e) {
            return InstanceInfo.InstanceStatus.DOWN;
        }

        return InstanceInfo.InstanceStatus.UP;
    }
}
```

### 3.3 Using DiscoveryClient

```java
@Service
public class ServiceLocator {

    private final DiscoveryClient discoveryClient;

    public ServiceLocator(DiscoveryClient discoveryClient) {
        this.discoveryClient = discoveryClient;
    }

    public List<String> getAvailableServices() {
        return discoveryClient.getServices();
    }

    public List<ServiceInstance> getInstances(String serviceId) {
        return discoveryClient.getInstances(serviceId);
    }

    public URI getServiceUri(String serviceId) {
        List<ServiceInstance> instances = discoveryClient.getInstances(serviceId);
        if (instances.isEmpty()) {
            throw new ServiceNotFoundException("No instances for: " + serviceId);
        }
        // Simple random selection
        ServiceInstance instance = instances.get(
                ThreadLocalRandom.current().nextInt(instances.size()));
        return instance.getUri();
    }

    public Map<String, List<ServiceInstanceInfo>> getAllServiceInstances() {
        Map<String, List<ServiceInstanceInfo>> result = new LinkedHashMap<>();
        for (String serviceId : discoveryClient.getServices()) {
            List<ServiceInstanceInfo> instances = discoveryClient.getInstances(serviceId)
                    .stream()
                    .map(si -> new ServiceInstanceInfo(
                            si.getServiceId(),
                            si.getHost(),
                            si.getPort(),
                            si.getUri().toString(),
                            si.getMetadata()))
                    .toList();
            result.put(serviceId, instances);
        }
        return result;
    }
}
```

## 4. Spring Cloud LoadBalancer

Spring Cloud LoadBalancer is the client-side load balancing solution that replaced Netflix Ribbon.

### 4.1 Basic Configuration

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-loadbalancer</artifactId>
</dependency>
```

```java
@Configuration
public class LoadBalancerConfig {

    // Load-balanced RestClient
    @Bean
    public RestClient loadBalancedRestClient(RestClient.Builder builder) {
        return builder
                .baseUrl("http://order-service")  // service name, not hostname
                .build();
    }

    @Bean
    @LoadBalanced
    public RestTemplate loadBalancedRestTemplate() {
        return new RestTemplate();
    }

    // Load-balanced WebClient
    @Bean
    @LoadBalanced
    public WebClient.Builder loadBalancedWebClientBuilder() {
        return WebClient.builder();
    }
}

@Service
public class OrderServiceClient {

    private final RestTemplate restTemplate;
    private final WebClient webClient;

    public OrderServiceClient(@Qualifier("loadBalancedRestTemplate") RestTemplate restTemplate,
                               @LoadBalanced WebClient.Builder webClientBuilder) {
        this.restTemplate = restTemplate;
        this.webClient = webClientBuilder
                .baseUrl("http://order-service")
                .build();
    }

    public Order getOrder(Long orderId) {
        // Uses service discovery + load balancing automatically
        return restTemplate.getForObject(
                "http://order-service/api/orders/{id}",
                Order.class, orderId);
    }

    public Mono<Order> getOrderReactive(Long orderId) {
        return webClient.get()
                .uri("/api/orders/{id}", orderId)
                .retrieve()
                .bodyToMono(Order.class);
    }
}
```

### 4.2 Custom Load Balancer Strategy

```java
// Round-robin is the default. Here is a custom zone-aware strategy:
public class ZoneAwareLoadBalancer implements ReactorServiceInstanceLoadBalancer {

    private final String serviceId;
    private final ObjectProvider<ServiceInstanceListSupplier> supplierProvider;
    private final String preferredZone;
    private final AtomicInteger position = new AtomicInteger(0);

    public ZoneAwareLoadBalancer(String serviceId,
                                  ObjectProvider<ServiceInstanceListSupplier> supplierProvider,
                                  String preferredZone) {
        this.serviceId = serviceId;
        this.supplierProvider = supplierProvider;
        this.preferredZone = preferredZone;
    }

    @Override
    public Mono<Response<ServiceInstance>> choose(Request request) {
        return supplierProvider.getIfAvailable().get(request)
                .next()
                .map(instances -> {
                    if (instances.isEmpty()) {
                        return new EmptyResponse();
                    }

                    // Prefer instances in the same zone
                    List<ServiceInstance> sameZone = instances.stream()
                            .filter(i -> preferredZone.equals(
                                    i.getMetadata().get("zone")))
                            .toList();

                    List<ServiceInstance> candidates =
                            sameZone.isEmpty() ? instances : sameZone;

                    int pos = position.getAndIncrement() & Integer.MAX_VALUE;
                    ServiceInstance chosen = candidates.get(pos % candidates.size());
                    return (Response<ServiceInstance>) new DefaultResponse(chosen);
                });
    }
}

// Register custom load balancer
@Configuration
@LoadBalancerClient(name = "order-service",
                     configuration = OrderServiceLBConfig.class)
public class LoadBalancerClientConfig {}

class OrderServiceLBConfig {

    @Bean
    public ReactorServiceInstanceLoadBalancer zoneAwareLB(
            Environment env,
            ObjectProvider<ServiceInstanceListSupplier> supplier) {
        String serviceId = env.getProperty(LoadBalancerClientFactory.PROPERTY_NAME);
        String zone = env.getProperty("eureka.instance.metadata-map.zone", "default");
        return new ZoneAwareLoadBalancer(serviceId, supplier, zone);
    }
}
```

### 4.3 Health-Check Based Instance Filtering

```java
@Configuration
public class HealthCheckLBConfig {

    @Bean
    public ServiceInstanceListSupplier healthCheckSupplier(
            ConfigurableApplicationContext context) {
        return ServiceInstanceListSupplier.builder()
                .withDiscoveryClient()
                .withHealthChecks()              // filter out unhealthy instances
                .withCaching()                   // cache results
                .withRetry()                     // retry on failure
                .build(context);
    }
}
```

```yaml
spring:
  cloud:
    loadbalancer:
      health-check:
        interval: 10s
        initial-delay: 5s
        path:
          default: /actuator/health
          order-service: /actuator/health/readiness
      retry:
        enabled: true
        max-retries-on-same-service-instance: 1
        max-retries-on-next-service-instance: 2
        retry-on-all-operations: false
        retryable-status-codes: 500,502,503
      cache:
        enabled: true
        ttl: 30s
        capacity: 256
```

## 5. Consul Integration

### 5.1 Consul Service Discovery

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-consul-discovery</artifactId>
</dependency>
```

```yaml
spring:
  application:
    name: order-service
  cloud:
    consul:
      host: consul.internal
      port: 8500
      discovery:
        enabled: true
        service-name: ${spring.application.name}
        instance-id: ${spring.application.name}-${random.value}
        prefer-ip-address: true
        health-check-path: /actuator/health
        health-check-interval: 15s
        health-check-critical-timeout: 3m
        tags:
          - version=2.1
          - environment=production
          - region=us-east
        metadata:
          version: "2.1"
          team: "payments"
        register-health-check: true
        deregister: true
        query-passing: true     # only return healthy instances
```

### 5.2 Consul Key-Value Config

```yaml
spring:
  cloud:
    consul:
      config:
        enabled: true
        prefix: config
        default-context: application
        profile-separator: ','
        format: YAML           # YAML | PROPERTIES | KEY_VALUE | FILES
        data-key: data
        watch:
          enabled: true
          delay: 5000          # milliseconds between polls
```

```java
// Consul KV store structure:
// config/application/data        — shared YAML config
// config/order-service/data      — order-service YAML config
// config/order-service,production/data — order-service production config

@Service
public class ConsulConfigWatcher {

    @EventListener
    public void onConfigChange(EnvironmentChangeEvent event) {
        Set<String> changedKeys = event.getKeys();
        if (changedKeys.stream().anyMatch(k -> k.startsWith("order."))) {
            // React to order configuration changes
            refreshOrderConfiguration();
        }
    }

    private void refreshOrderConfiguration() {
        // Rebuild caches, update runtime config, etc.
    }
}
```

## 6. Kubernetes-Native Service Discovery

### 6.1 Spring Cloud Kubernetes Discovery

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-kubernetes-client-all</artifactId>
</dependency>
```

```yaml
spring:
  application:
    name: order-service
  cloud:
    kubernetes:
      discovery:
        enabled: true
        all-namespaces: false
        namespaces:
          - production
          - shared-services
        service-labels:
          app.kubernetes.io/part-of: my-platform
        primary-port-name: http
        metadata:
          add-labels: true
          add-annotations: true
          labels-prefix: ""
          annotations-prefix: ""
      loadbalancer:
        mode: SERVICE           # SERVICE | POD
```

### 6.2 Using Kubernetes Services

```java
@Service
public class KubernetesServiceClient {

    private final DiscoveryClient discoveryClient;
    private final RestClient.Builder restClientBuilder;

    public KubernetesServiceClient(DiscoveryClient discoveryClient,
                                    @LoadBalanced RestClient.Builder restClientBuilder) {
        this.discoveryClient = discoveryClient;
        this.restClientBuilder = restClientBuilder;
    }

    public List<String> listServices() {
        return discoveryClient.getServices();
    }

    public Order getOrder(Long orderId) {
        RestClient client = restClientBuilder
                .baseUrl("http://order-service")  // K8s Service name
                .build();

        return client.get()
                .uri("/api/orders/{id}", orderId)
                .retrieve()
                .body(Order.class);
    }
}
```

## 7. Failover Strategies

### 7.1 Retry with Fallback

```java
@Service
public class ResilientServiceClient {

    private final WebClient.Builder webClientBuilder;
    private final DiscoveryClient discoveryClient;

    public ResilientServiceClient(@LoadBalanced WebClient.Builder webClientBuilder,
                                   DiscoveryClient discoveryClient) {
        this.webClientBuilder = webClientBuilder;
        this.discoveryClient = discoveryClient;
    }

    public Mono<OrderResponse> getOrderWithFallback(Long orderId) {
        return webClientBuilder.build()
                .get()
                .uri("http://order-service/api/orders/{id}", orderId)
                .retrieve()
                .bodyToMono(OrderResponse.class)
                .timeout(Duration.ofSeconds(3))
                .retryWhen(Retry.backoff(3, Duration.ofMillis(200))
                        .filter(this::isRetryable))
                .onErrorResume(this::fallbackResponse);
    }

    private boolean isRetryable(Throwable throwable) {
        if (throwable instanceof WebClientResponseException ex) {
            return ex.getStatusCode().is5xxServerError();
        }
        return throwable instanceof TimeoutException
                || throwable instanceof ConnectException;
    }

    private Mono<OrderResponse> fallbackResponse(Throwable error) {
        return Mono.just(OrderResponse.builder()
                .status("DEGRADED")
                .message("Order service temporarily unavailable")
                .build());
    }
}
```

### 7.2 Instance Caching for Outages

```java
@Component
public class CachingDiscoveryClient {

    private final DiscoveryClient delegate;
    private final Map<String, List<ServiceInstance>> cache = new ConcurrentHashMap<>();
    private final Duration cacheTtl = Duration.ofMinutes(5);
    private final Map<String, Instant> lastUpdated = new ConcurrentHashMap<>();

    public CachingDiscoveryClient(DiscoveryClient delegate) {
        this.delegate = delegate;
    }

    public List<ServiceInstance> getInstances(String serviceId) {
        try {
            List<ServiceInstance> instances = delegate.getInstances(serviceId);
            if (!instances.isEmpty()) {
                cache.put(serviceId, instances);
                lastUpdated.put(serviceId, Instant.now());
                return instances;
            }
        } catch (Exception e) {
            // Discovery client failed, try cache
        }

        List<ServiceInstance> cached = cache.get(serviceId);
        if (cached != null) {
            Instant updated = lastUpdated.get(serviceId);
            if (updated != null && Duration.between(updated, Instant.now())
                    .compareTo(cacheTtl) < 0) {
                return cached;
            }
        }

        throw new ServiceNotFoundException(
                "No instances found for " + serviceId + " (cache expired)");
    }

    @Scheduled(fixedRate = 30000)
    public void refreshCache() {
        for (String serviceId : delegate.getServices()) {
            try {
                List<ServiceInstance> instances = delegate.getInstances(serviceId);
                if (!instances.isEmpty()) {
                    cache.put(serviceId, instances);
                    lastUpdated.put(serviceId, Instant.now());
                }
            } catch (Exception e) {
                // Keep cached value
            }
        }
    }
}
```

### 7.3 Multi-Region Discovery

```java
@Configuration
public class MultiRegionDiscoveryConfig {

    @Bean
    public ServiceInstanceListSupplier multiRegionSupplier(
            ConfigurableApplicationContext context,
            @Value("${app.region}") String currentRegion) {

        return ServiceInstanceListSupplier.builder()
                .withDiscoveryClient()
                .withHealthChecks()
                .with((context2, delegate) ->
                        new RegionAwareSupplier(delegate, currentRegion))
                .withCaching()
                .build(context);
    }
}

class RegionAwareSupplier implements ServiceInstanceListSupplier {

    private final ServiceInstanceListSupplier delegate;
    private final String currentRegion;

    RegionAwareSupplier(ServiceInstanceListSupplier delegate, String currentRegion) {
        this.delegate = delegate;
        this.currentRegion = currentRegion;
    }

    @Override
    public String getServiceId() {
        return delegate.getServiceId();
    }

    @Override
    public Flux<List<ServiceInstance>> get() {
        return delegate.get().map(instances -> {
            // Sort: same-region first, then cross-region
            List<ServiceInstance> sameRegion = instances.stream()
                    .filter(i -> currentRegion.equals(i.getMetadata().get("region")))
                    .toList();

            if (!sameRegion.isEmpty()) {
                return sameRegion; // prefer same region
            }

            return instances; // fallback to any region
        });
    }
}
```

Service discovery is foundational to microservices. Eureka works well for Spring-native ecosystems, Consul adds KV store and multi-datacenter support, and Kubernetes-native discovery leverages the platform's built-in DNS and Service abstraction. Regardless of the registry, always pair discovery with client-side load balancing and health checks to ensure traffic only reaches healthy instances.
