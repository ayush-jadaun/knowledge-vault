---
title: "Deployment Strategies"
description: "Complete guide to deploying Spring Boot applications — JAR vs WAR packaging, embedded server tuning, Kubernetes manifests and Helm charts, health and readiness probes, graceful shutdown, rolling updates, blue-green deployments, and production configuration"
tags: [spring-boot, deployment, kubernetes, production, devops]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Deployment Strategies

Building a Spring Boot application is one thing; deploying it reliably to production is another. The deployment strategy determines how your application handles traffic during updates, how fast it recovers from failures, and whether your users experience downtime during releases. Spring Boot's embedded server model (a self-contained JAR with Tomcat/Netty/Undertow inside) simplifies deployment enormously, but production readiness requires careful configuration of health checks, graceful shutdown, resource limits, and update strategies.

## JAR vs WAR

### Executable JAR (Recommended)

The default and preferred packaging. The JAR contains the application, all dependencies, and an embedded web server:

```xml
<packaging>jar</packaging>

<build>
    <plugins>
        <plugin>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-maven-plugin</artifactId>
        </plugin>
    </plugins>
</build>
```

```bash
# Build
./mvnw clean package -DskipTests

# Run
java -jar target/myapp-1.0.0.jar

# Run with profile and JVM options
java -Xmx512m -Xms256m \
     -Dspring.profiles.active=prod \
     -jar target/myapp-1.0.0.jar
```

**Advantages:** Self-contained, no external server needed, consistent behavior across environments, easy to containerize.

### WAR (Legacy Deployment)

Only needed when deploying to an existing Tomcat/WildFly server:

```xml
<packaging>war</packaging>

<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-tomcat</artifactId>
        <scope>provided</scope>
    </dependency>
</dependencies>
```

```java
public class MyApplication extends SpringBootServletInitializer {

    @Override
    protected SpringApplicationBuilder configure(SpringApplicationBuilder builder) {
        return builder.sources(MyApplication.class);
    }

    public static void main(String[] args) {
        SpringApplication.run(MyApplication.class, args);
    }
}
```

## Embedded Server Tuning

### Tomcat (Default)

```yaml
server:
  port: 8080
  tomcat:
    threads:
      max: 200            # Maximum worker threads
      min-spare: 20       # Minimum idle threads
    max-connections: 10000  # Maximum connections
    accept-count: 100      # Queue for connections when all threads busy
    connection-timeout: 20s
    max-http-form-post-size: 10MB
    max-swallow-size: 10MB

  # Compression
  compression:
    enabled: true
    mime-types: application/json,application/xml,text/html,text/plain
    min-response-size: 1024

  # SSL
  ssl:
    enabled: true
    key-store: classpath:keystore.p12
    key-store-password: ${SSL_KEYSTORE_PASSWORD}
    key-store-type: PKCS12
    protocol: TLS

  # HTTP/2
  http2:
    enabled: true

  # Access log
  tomcat:
    accesslog:
      enabled: true
      pattern: "%h %l %u %t \"%r\" %s %b %D"
      directory: /var/log/myapp
      prefix: access
      suffix: .log
      rotate: true
      max-days: 30
```

### Thread Pool Sizing

```
Rule of thumb for I/O-bound applications:
  threads = CPU_cores * (1 + wait_time / compute_time)

Example: 4 cores, requests spend 80% waiting on DB/API:
  threads = 4 * (1 + 80/20) = 4 * 5 = 20 threads minimum

For most web applications:
  50-200 threads is reasonable
  More threads = more memory (1MB stack per thread)
```

## Health and Readiness Probes

### Actuator Configuration

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  endpoint:
    health:
      show-details: when_authorized
      show-components: when_authorized
      probes:
        enabled: true    # Enable /health/liveness and /health/readiness
  health:
    db:
      enabled: true
    diskSpace:
      enabled: true
    redis:
      enabled: true
```

### Custom Health Indicators

```java
@Component
public class ExternalApiHealthIndicator implements HealthIndicator {

    private final WebClient healthClient;

    @Override
    public Health health() {
        try {
            ResponseEntity<Void> response = healthClient.get()
                    .uri("/health")
                    .retrieve()
                    .toBodilessEntity()
                    .block(Duration.ofSeconds(3));

            if (response != null && response.getStatusCode().is2xxSuccessful()) {
                return Health.up()
                        .withDetail("status", "reachable")
                        .build();
            }
            return Health.down()
                    .withDetail("status", "unhealthy response")
                    .build();
        } catch (Exception e) {
            return Health.down()
                    .withDetail("error", e.getMessage())
                    .build();
        }
    }
}
```

### Readiness vs Liveness

```
Liveness:  "Is this instance alive?"
           If NO → Kubernetes restarts the pod
           Check: /actuator/health/liveness

Readiness: "Can this instance serve traffic?"
           If NO → Kubernetes removes from load balancer
           Check: /actuator/health/readiness

Example: App starts, DB connection pool initializes
  Liveness:  UP (process is running)
  Readiness: DOWN (can't serve requests yet)
  → Kubernetes does NOT restart, but does NOT send traffic
```

```java
@Component
public class WarmupReadinessIndicator implements HealthIndicator,
        ApplicationListener<ApplicationReadyEvent> {

    private volatile boolean ready = false;

    @Override
    public void onApplicationEvent(ApplicationReadyEvent event) {
        // Run warmup tasks
        cacheService.warmup();
        ready = true;
    }

    @Override
    public Health health() {
        if (ready) {
            return Health.up().build();
        }
        return Health.down().withDetail("reason", "warming up").build();
    }
}
```

## Graceful Shutdown

When Kubernetes sends a SIGTERM (during rolling updates), the application should finish in-flight requests before stopping:

```yaml
server:
  shutdown: graceful

spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s   # Max wait for in-flight requests
```

The shutdown sequence:

```
1. SIGTERM received
2. Application stops accepting NEW connections (readiness → DOWN)
3. In-flight requests continue processing (up to 30s)
4. After all requests complete (or timeout), Spring context closes
5. @PreDestroy methods run (cleanup)
6. Process exits
```

```java
@Component
public class ShutdownHooks {

    @PreDestroy
    public void onShutdown() {
        log.info("Application shutting down — cleaning up resources");

        // Close external connections gracefully
        messageBroker.close();

        // Flush pending metrics
        meterRegistry.close();

        // Deregister from service discovery
        serviceRegistry.deregister();

        log.info("Cleanup complete");
    }
}
```

## Kubernetes Deployment

### Deployment Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  labels:
    app: myapp
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  template:
    metadata:
      labels:
        app: myapp
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8080"
        prometheus.io/path: "/actuator/prometheus"
    spec:
      terminationGracePeriodSeconds: 45  # > shutdown-phase timeout
      containers:
        - name: myapp
          image: myregistry/myapp:1.0.0
          ports:
            - containerPort: 8080
              name: http

          # Resource limits
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 1000m
              memory: 512Mi

          # Environment variables
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: "prod,k8s"
            - name: JAVA_TOOL_OPTIONS
              value: "-Xmx384m -Xms256m -XX:+UseG1GC -XX:MaxGCPauseMillis=200"
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: myapp-secrets
                  key: db-password

          # Health checks
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: http
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3

          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: http
            initialDelaySeconds: 15
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3

          startupProbe:
            httpGet:
              path: /actuator/health/liveness
              port: http
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 30    # 10 + 30*5 = 160s max startup

          # Volume mounts
          volumeMounts:
            - name: config
              mountPath: /config
              readOnly: true

      volumes:
        - name: config
          configMap:
            name: myapp-config
```

### Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  selector:
    app: myapp
  ports:
    - port: 80
      targetPort: http
      protocol: TCP
  type: ClusterIP
```

### ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: myapp-config
data:
  application-k8s.yml: |
    spring:
      datasource:
        url: jdbc:postgresql://postgres-service:5432/mydb
      redis:
        host: redis-service
    logging:
      level:
        com.example: INFO
```

### Secrets

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: myapp-secrets
type: Opaque
stringData:
  db-password: "your-secure-password"
  jwt-secret: "your-jwt-secret"
```

## Helm Chart Structure

```
myapp-chart/
├── Chart.yaml
├── values.yaml
├── templates/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── ingress.yaml
│   ├── hpa.yaml
│   └── _helpers.tpl
```

### values.yaml

```yaml
replicaCount: 3

image:
  repository: myregistry/myapp
  tag: "1.0.0"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 80

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: api.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: api-tls
      hosts:
        - api.example.com

resources:
  requests:
    cpu: 250m
    memory: 256Mi
  limits:
    cpu: 1000m
    memory: 512Mi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

spring:
  profile: prod
  javaOpts: "-Xmx384m -Xms256m"
```

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

## Rolling Updates

The default Kubernetes update strategy. Old pods are gradually replaced with new ones:

```
Rolling update (maxUnavailable=1, maxSurge=1):
──────────────────────────────────────────────

Step 1: [v1] [v1] [v1]        ← 3 replicas running v1
Step 2: [v1] [v1] [v1] [v2]   ← 1 new pod (surge), starting up
Step 3: [v1] [v1] [v2] [v2]   ← v2 ready, 1 old pod terminating
Step 4: [v1] [v2] [v2] [v2]   ← continue replacing
Step 5: [v2] [v2] [v2]        ← all updated, zero downtime
```

### Blue-Green Deployment

Deploy new version alongside old version, switch traffic atomically:

```yaml
# Blue deployment (current)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-blue
  labels:
    app: myapp
    version: blue
spec:
  replicas: 3
  # ...

# Green deployment (new)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-green
  labels:
    app: myapp
    version: green
spec:
  replicas: 3
  # ...

# Service — switch by changing selector
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  selector:
    app: myapp
    version: green   # Switch from "blue" to "green"
```

## JVM Memory Configuration for Containers

Containers have memory limits. The JVM must respect them:

```bash
# Java 17+ automatically detects container limits
# These flags fine-tune behavior:
JAVA_TOOL_OPTIONS="\
  -XX:+UseContainerSupport \
  -XX:MaxRAMPercentage=75.0 \
  -XX:InitialRAMPercentage=50.0 \
  -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=200 \
  -XX:+HeapDumpOnOutOfMemoryError \
  -XX:HeapDumpPath=/tmp/heap-dump.hprof"
```

| Container Memory Limit | MaxRAMPercentage=75% | Actual Heap |
|------------------------|---------------------|-------------|
| 256Mi | 75% = 192MB | ~192MB heap |
| 512Mi | 75% = 384MB | ~384MB heap |
| 1Gi | 75% = 768MB | ~768MB heap |

Leave 25% for non-heap memory (metaspace, threads, native memory, direct buffers).

## Production Configuration Checklist

| Category | Setting | Recommendation |
|----------|---------|---------------|
| Server | `server.shutdown` | `graceful` |
| Server | `spring.lifecycle.timeout-per-shutdown-phase` | `30s` |
| Probes | Liveness probe | `/actuator/health/liveness` |
| Probes | Readiness probe | `/actuator/health/readiness` |
| Probes | Startup probe | For slow-starting apps |
| Resources | CPU request | Baseline CPU (e.g., 250m) |
| Resources | Memory limit | JVM heap + 25% overhead |
| Logging | Structured JSON | For log aggregation |
| Metrics | Prometheus endpoint | `/actuator/prometheus` |
| Security | Actuator access | Restrict to internal network |
| Config | Secrets | Kubernetes Secrets, not env vars in manifests |
| Scaling | HPA | CPU and memory-based |
| Updates | Rolling update | `maxUnavailable: 1, maxSurge: 1` |

Deployment is where engineering meets operations. A well-configured deployment with health probes, graceful shutdown, and rolling updates means zero-downtime releases. A poorly configured one means 3 AM pages, dropped connections, and angry users. Get the probes right, tune the resource limits, configure graceful shutdown, and your deployments become boring — which is exactly what production deployments should be.
