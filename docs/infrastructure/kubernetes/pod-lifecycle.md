---
title: Pod Lifecycle
description: Deep dive into Kubernetes pod lifecycle — pod phases, init containers, sidecar containers, liveness/readiness/startup probes, graceful shutdown with preStop hooks, SIGTERM handling, pod disruption budgets, and pod priority and preemption.
tags:
  - kubernetes
  - pods
  - lifecycle
  - probes
  - init-containers
  - graceful-shutdown
  - infrastructure
difficulty: intermediate
prerequisites:
  - infrastructure/kubernetes/architecture-internals
  - infrastructure/docker/internals
lastReviewed: "2026-03-17"
---

# Pod Lifecycle

A pod is the smallest deployable unit in Kubernetes. Understanding the pod lifecycle is not optional — it determines whether your application handles deployments gracefully, responds to health checks correctly, and shuts down without dropping requests. Every outage that starts with "we deployed and then everything went down" can be traced back to a misunderstanding of pod lifecycle.

## Pod Phases

Every pod has a `status.phase` field that describes where it is in its lifecycle. There are exactly five phases:

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Pending  │────►│ Running  │────►│Succeeded │
└──────────┘     └──────────┘     └──────────┘
     │                │
     │                │           ┌──────────┐
     │                └──────────►│  Failed  │
     │                            └──────────┘
     │
     │           ┌──────────┐
     └──────────►│ Unknown  │
                 └──────────┘
```

### Pending

The pod has been accepted by the Kubernetes API server and stored in etcd, but one or more containers have not been created yet. This includes time spent waiting for the pod to be scheduled to a node and time spent pulling container images.

**Common reasons a pod stays in Pending:**

| Reason | Diagnosis | Fix |
|---|---|---|
| Insufficient resources | `kubectl describe pod` shows `FailedScheduling` with `Insufficient cpu` or `Insufficient memory` | Add nodes, reduce resource requests, or remove low-priority pods |
| No matching node selectors | `kubectl describe pod` shows `FailedScheduling` with `didn't match Pod's node affinity/selector` | Fix node selectors or add labels to nodes |
| PersistentVolumeClaim not bound | `kubectl describe pod` shows `unbound immediate PersistentVolumeClaims` | Create the PV or fix the storage class |
| Image pull in progress | `kubectl describe pod` shows `Pulling image` | Wait, or check image name and registry credentials |
| Taints and tolerations | `kubectl describe pod` shows `node(s) had untolerable taint` | Add tolerations to the pod spec |

### Running

At least one container is running, or is in the process of starting or restarting. A pod in Running phase does not mean the application is ready to serve traffic — that is determined by readiness probes.

### Succeeded

All containers in the pod have terminated successfully (exit code 0) and will not be restarted. This is the normal terminal state for Jobs and CronJobs.

### Failed

All containers have terminated, and at least one container terminated with a non-zero exit code or was terminated by the system.

### Unknown

The state of the pod cannot be determined. This usually means the kubelet on the node running the pod has stopped reporting to the API server. Causes include network issues or node failure.

## Container States

Within a running pod, each container has its own state:

```yaml
# kubectl get pod my-pod -o jsonpath='{.status.containerStatuses[*].state}'
containerStatuses:
  - name: app
    state:
      running:
        startedAt: "2026-03-17T10:00:00Z"
  - name: sidecar
    state:
      waiting:
        reason: CrashLoopBackOff
        message: "back-off 5m0s restarting failed container"
```

### Waiting

The container is not running. It is performing operations required before it can start, like pulling the image or applying secrets. The `reason` field tells you why.

### Running

The container is executing without issues. The `startedAt` field tells you when it started.

### Terminated

The container ran to completion or failed. The `exitCode`, `reason`, `startedAt`, and `finishedAt` fields provide details.

## Init Containers

Init containers run before app containers start. They run sequentially — each must succeed before the next starts. If an init container fails, Kubernetes restarts the pod (subject to `restartPolicy`).

### Use Cases

- **Wait for dependencies**: Check that a database or service is available before starting the app
- **Run migrations**: Execute database migrations before the app starts
- **Fetch configuration**: Download config from a remote source
- **Set permissions**: Change file ownership or permissions on shared volumes

### Configuration

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web-app
spec:
  initContainers:
    # Init container 1: Wait for database
    - name: wait-for-db
      image: busybox:1.36
      command:
        - sh
        - -c
        - |
          until nc -z postgres-service 5432; do
            echo "Waiting for PostgreSQL..."
            sleep 2
          done
          echo "PostgreSQL is available"
      resources:
        requests:
          cpu: 10m
          memory: 16Mi
        limits:
          cpu: 50m
          memory: 32Mi

    # Init container 2: Run migrations
    - name: run-migrations
      image: my-app:v1.2.3
      command: ["node", "migrate.js"]
      env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: connection-string
      resources:
        requests:
          cpu: 100m
          memory: 128Mi
        limits:
          cpu: 500m
          memory: 256Mi

    # Init container 3: Fetch remote config
    - name: fetch-config
      image: curlimages/curl:8.5.0
      command:
        - sh
        - -c
        - |
          curl -sSL https://config.internal/app/config.json \
            -o /shared/config.json
      volumeMounts:
        - name: config-volume
          mountPath: /shared
      resources:
        requests:
          cpu: 10m
          memory: 16Mi
        limits:
          cpu: 50m
          memory: 32Mi

  containers:
    - name: app
      image: my-app:v1.2.3
      ports:
        - containerPort: 3000
      volumeMounts:
        - name: config-volume
          mountPath: /app/config
          readOnly: true

  volumes:
    - name: config-volume
      emptyDir: {}
```

### Init Container Execution Order

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  wait-for-db    │────►│ run-migrations  │────►│  fetch-config   │
│  (sequential)   │     │  (sequential)   │     │  (sequential)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │  app container  │
                                                │  (starts now)   │
                                                └─────────────────┘
```

**Key behaviors:**

- Init containers do not support `lifecycle`, `livenessProbe`, `readinessProbe`, or `startupProbe`
- Init containers share the pod's volumes (that is how they pass data to app containers)
- If a pod is restarted, all init containers run again
- Init container images are pulled before app container images
- Resource limits for init containers are handled specially: the effective resource limit is the maximum of all init container limits (since they run sequentially, not concurrently)

## Sidecar Containers

Sidecar containers run alongside the main application container for the entire lifetime of the pod. In Kubernetes 1.28+, native sidecar containers are supported as init containers with `restartPolicy: Always`.

### Native Sidecar Containers (Kubernetes 1.28+)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-with-sidecar
spec:
  initContainers:
    # Native sidecar — starts before app containers,
    # runs for the lifetime of the pod
    - name: log-forwarder
      image: fluent/fluent-bit:2.2
      restartPolicy: Always  # This makes it a sidecar
      volumeMounts:
        - name: log-volume
          mountPath: /var/log/app
      resources:
        requests:
          cpu: 50m
          memory: 64Mi
        limits:
          cpu: 200m
          memory: 128Mi

    - name: envoy-proxy
      image: envoyproxy/envoy:v1.28
      restartPolicy: Always
      ports:
        - containerPort: 9901
          name: envoy-admin
      volumeMounts:
        - name: envoy-config
          mountPath: /etc/envoy
      resources:
        requests:
          cpu: 100m
          memory: 128Mi
        limits:
          cpu: 500m
          memory: 256Mi

  containers:
    - name: app
      image: my-app:v1.2.3
      ports:
        - containerPort: 3000
      volumeMounts:
        - name: log-volume
          mountPath: /var/log/app

  volumes:
    - name: log-volume
      emptyDir: {}
    - name: envoy-config
      configMap:
        name: envoy-config
```

### Common Sidecar Patterns

| Pattern | Sidecar | Purpose |
|---|---|---|
| Service mesh | Envoy, Linkerd-proxy | Handle mTLS, retries, circuit breaking |
| Log forwarding | Fluent Bit, Filebeat | Ship logs to aggregation system |
| Metrics collection | Prometheus exporter | Expose app metrics in Prometheus format |
| Config reload | Config watcher | Watch for config changes and reload app |
| Auth proxy | OAuth2 Proxy | Handle authentication before requests reach app |
| Database proxy | Cloud SQL Proxy, PgBouncer | Connection pooling, auth, TLS termination |

### Sidecar Startup and Shutdown Order

With native sidecars:

```
Startup:
  1. Init containers run sequentially
  2. Sidecar containers (restartPolicy: Always) start in order
  3. App containers start after all sidecars are running

Shutdown:
  1. App containers receive SIGTERM
  2. App containers terminate (or are killed after terminationGracePeriodSeconds)
  3. Sidecar containers receive SIGTERM (in reverse order)
  4. Sidecar containers terminate
```

This solves the classic problem where an Envoy sidecar shuts down before the application, causing the application's outbound requests to fail during shutdown.

## Health Probes

Kubernetes uses three types of probes to determine the health of a container. Getting probes wrong is the single most common cause of unnecessary restarts, traffic blackholes, and deployment failures.

### Liveness Probe

**Purpose:** Detect if the container is deadlocked or in an unrecoverable state. If the liveness probe fails, Kubernetes kills the container and restarts it.

**When to use:** When your application can get into a broken state that a restart would fix (deadlocks, corrupted in-memory state, infinite loops).

**When NOT to use:** Do not set a liveness probe that checks downstream dependencies. If your database is down, restarting your application will not fix it — and you will create a restart storm.

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 3000
  initialDelaySeconds: 15    # Wait 15s after container starts
  periodSeconds: 10          # Check every 10s
  timeoutSeconds: 5          # Probe times out after 5s
  failureThreshold: 3        # Kill after 3 consecutive failures
  successThreshold: 1        # 1 success to be considered alive
```

**Implementation in your application:**

```typescript
// This endpoint should ONLY check if the process itself is healthy
// Do NOT check database connectivity here
app.get('/healthz', (req, res) => {
  // Check for deadlock indicators
  const memUsage = process.memoryUsage();
  const heapUsedPercent = memUsage.heapUsed / memUsage.heapTotal;

  if (heapUsedPercent > 0.95) {
    // Memory is critically high — probably leaking
    res.status(503).json({ status: 'unhealthy', reason: 'memory_pressure' });
    return;
  }

  // Check event loop lag
  if (eventLoopLag > 5000) {
    res.status(503).json({ status: 'unhealthy', reason: 'event_loop_blocked' });
    return;
  }

  res.status(200).json({ status: 'healthy' });
});
```

### Readiness Probe

**Purpose:** Determine if the container is ready to accept traffic. If the readiness probe fails, Kubernetes removes the pod from all Service endpoints. The pod is not restarted — it just stops receiving traffic.

**When to use:** Always. Every production pod should have a readiness probe.

```yaml
readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  initialDelaySeconds: 5     # Wait 5s after container starts
  periodSeconds: 5           # Check every 5s
  timeoutSeconds: 3          # Probe times out after 3s
  failureThreshold: 3        # Remove from service after 3 failures
  successThreshold: 2        # Need 2 successes to be considered ready
```

**Implementation:**

```typescript
// Readiness SHOULD check downstream dependencies
app.get('/ready', async (req, res) => {
  const checks: Record<string, boolean> = {};

  // Check database
  try {
    await db.query('SELECT 1');
    checks.database = true;
  } catch {
    checks.database = false;
  }

  // Check Redis
  try {
    await redis.ping();
    checks.redis = true;
  } catch {
    checks.redis = false;
  }

  // Check if the app has loaded required data
  checks.warmupComplete = appState.isWarmedUp;

  const isReady = Object.values(checks).every(Boolean);
  const status = isReady ? 200 : 503;

  res.status(status).json({
    status: isReady ? 'ready' : 'not_ready',
    checks,
  });
});
```

### Startup Probe

**Purpose:** Determine if the container has finished starting up. While the startup probe is running, liveness and readiness probes are disabled. This protects slow-starting containers from being killed by the liveness probe before they finish initializing.

**When to use:** When your application takes a long time to start (loading ML models, warming caches, running migrations).

```yaml
startupProbe:
  httpGet:
    path: /healthz
    port: 3000
  initialDelaySeconds: 0
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 60       # 60 * 5s = 5 minutes to start
  successThreshold: 1
```

### Probe Types

```yaml
# HTTP GET probe
httpGet:
  path: /healthz
  port: 3000
  httpHeaders:
    - name: X-Health-Check
      value: "kubernetes"

# TCP socket probe — just checks if the port is open
tcpSocket:
  port: 3000

# gRPC probe (Kubernetes 1.24+)
grpc:
  port: 50051
  service: health.v1.Health

# Exec probe — runs a command inside the container
exec:
  command:
    - /bin/sh
    - -c
    - pg_isready -U postgres -h localhost
```

### Probe Decision Matrix

```
                    ┌─────────────────────────────────┐
                    │ Does your app take >30s to start?│
                    └──────────┬──────────────────────┘
                          yes  │  no
                    ┌──────────▼──┐
                    │ Add startup │
                    │ probe       │
                    └─────────────┘

                    ┌─────────────────────────────────┐
                    │ Can your app get into a state    │
                    │ that only a restart can fix?     │
                    └──────────┬──────────────────────┘
                          yes  │  no
                    ┌──────────▼──────┐
                    │ Add liveness    │  Skip liveness — readiness is enough
                    │ probe           │
                    └─────────────────┘

                    ┌─────────────────────────────────┐
                    │ Does your app serve traffic?     │
                    └──────────┬──────────────────────┘
                          yes  │
                    ┌──────────▼──────┐
                    │ Add readiness   │  Always add readiness
                    │ probe           │
                    └─────────────────┘
```

### Common Probe Mistakes

| Mistake | What Happens | Fix |
|---|---|---|
| Liveness probe checks database | Database goes down, all pods restart, no pods can reconnect, cascading failure | Only check internal process health in liveness probe |
| Readiness and liveness share the same endpoint | If the endpoint checks dependencies and they fail, pods restart instead of just dropping from service | Use separate endpoints: `/healthz` for liveness, `/ready` for readiness |
| initialDelaySeconds too low | Pod gets killed before it finishes starting | Use a startup probe instead |
| timeoutSeconds too low | Brief CPU spikes cause probe failures | Set to at least 3-5 seconds |
| failureThreshold of 1 | One slow response and the pod is killed/removed | Use at least 3 |

## Graceful Shutdown

When Kubernetes decides to terminate a pod (during a deployment, scale-down, or node drain), the following sequence occurs:

```
1. Pod is set to "Terminating" state
2. Pod is removed from Service endpoints (no new traffic)
3. PreStop hook runs (if configured)
4. SIGTERM is sent to the main container process (PID 1)
5. terminationGracePeriodSeconds countdown starts (default: 30s)
6. Application handles SIGTERM and shuts down
7. If still running after grace period, SIGKILL is sent
```

### The Critical Race Condition

Steps 2 and 3 happen **concurrently**, not sequentially. This means:

```
Time 0s: Pod marked Terminating
         ├── Endpoint controller removes pod from Service (async)
         └── PreStop hook starts / SIGTERM sent (async)

Time 0-2s: kube-proxy / ingress controller may still have old endpoints
           Your app may receive traffic AFTER getting SIGTERM
```

The fix: Add a preStop hook with a short sleep so the app keeps running while endpoints propagate:

```yaml
lifecycle:
  preStop:
    exec:
      command:
        - /bin/sh
        - -c
        - "sleep 5"
```

### SIGTERM Handling in Node.js

```typescript
import { Server } from 'http';

const server: Server = app.listen(3000);

// Track active connections for graceful close
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  isShuttingDown = true;

  // Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed');
  });

  // Close database connections
  try {
    await db.end();
    console.log('Database connections closed');
  } catch (error) {
    console.error('Error closing database:', error);
  }

  // Close Redis connections
  try {
    await redis.quit();
    console.log('Redis connections closed');
  } catch (error) {
    console.error('Error closing Redis:', error);
  }

  // Finish processing in-flight messages
  try {
    await messageQueue.drain();
    console.log('Message queue drained');
  } catch (error) {
    console.error('Error draining message queue:', error);
  }

  console.log('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Middleware to reject new requests during shutdown
app.use((req, res, next) => {
  if (isShuttingDown) {
    res.setHeader('Connection', 'close');
    res.status(503).json({ error: 'Server is shutting down' });
    return;
  }
  next();
});
```

### Complete Pod Spec with Graceful Shutdown

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web-app
spec:
  terminationGracePeriodSeconds: 60  # Give the app 60s to shut down
  containers:
    - name: app
      image: my-app:v1.2.3
      ports:
        - containerPort: 3000
      lifecycle:
        preStop:
          exec:
            command:
              - /bin/sh
              - -c
              - "sleep 5"  # Wait for endpoint removal to propagate
      readinessProbe:
        httpGet:
          path: /ready
          port: 3000
        periodSeconds: 5
        failureThreshold: 3
      livenessProbe:
        httpGet:
          path: /healthz
          port: 3000
        initialDelaySeconds: 15
        periodSeconds: 10
        failureThreshold: 3
      resources:
        requests:
          cpu: 100m
          memory: 128Mi
        limits:
          cpu: 500m
          memory: 512Mi
```

### PID 1 Problem

The container's entrypoint process runs as PID 1. Signals (like SIGTERM) are only delivered to PID 1. If your application is not PID 1, it will never receive SIGTERM and will be killed after the grace period.

**Problem: Shell wrapper prevents signal delivery:**

```dockerfile
# BAD — /bin/sh is PID 1, your app never gets SIGTERM
CMD /bin/sh -c "node server.js"

# GOOD — node is PID 1
CMD ["node", "server.js"]

# ALSO GOOD — use exec to replace the shell process
CMD ["/bin/sh", "-c", "exec node server.js"]
```

**Alternative: Use `tini` as an init process:**

```dockerfile
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
```

`tini` properly forwards signals and reaps zombie processes.

## Pod Disruption Budgets

A PodDisruptionBudget (PDB) limits how many pods from a set can be voluntarily disrupted at a time. "Voluntary disruption" includes node drains (for upgrades), cluster autoscaler scale-down, and manual `kubectl delete`.

### Why You Need PDBs

Without a PDB, when a cluster administrator runs `kubectl drain node-1`, Kubernetes evicts all pods from that node simultaneously. If all your replicas happen to be on that node, your service goes down.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web-app-pdb
  namespace: production
spec:
  # Option 1: Minimum available (at least 2 pods must always be running)
  minAvailable: 2

  # Option 2: Maximum unavailable (at most 1 pod can be down at a time)
  # maxUnavailable: 1

  # Option 3: Percentage
  # minAvailable: "50%"
  # maxUnavailable: "25%"

  selector:
    matchLabels:
      app: web-app
```

### PDB Strategy by Workload Type

| Workload | Replicas | PDB Setting | Rationale |
|---|---|---|---|
| Stateless API | 3 | `maxUnavailable: 1` | Always have at least 2 pods for redundancy |
| Stateless API | 10 | `maxUnavailable: "25%"` | Allow draining multiple nodes simultaneously |
| Database (StatefulSet) | 3 | `maxUnavailable: 1` | Never disrupt more than one replica at a time |
| Single-replica service | 1 | `minAvailable: 1` | Prevent voluntary disruption entirely |
| Batch job | N/A | No PDB needed | Jobs are retried automatically |

### PDB Interactions with Node Drain

```
kubectl drain node-1 --ignore-daemonsets --delete-emptydir-data
    │
    ▼
For each pod on node-1:
    │
    ├── Is there a PDB?
    │   ├── Yes: Check if disruption is allowed
    │   │   ├── Allowed: Evict the pod
    │   │   └── Not allowed: Wait (retry with backoff)
    │   │       └── If timeout (--timeout flag): drain fails
    │   └── No: Evict immediately
    │
    ├── Is it a DaemonSet pod?
    │   └── Skip (--ignore-daemonsets)
    │
    └── Is it a static pod?
        └── Skip (managed by kubelet, not API server)
```

### Unhealthy Pod Eviction Policy

Kubernetes 1.26+ introduced `unhealthyPodEvictionPolicy`:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web-app-pdb
spec:
  maxUnavailable: 1
  unhealthyPodEvictionPolicy: AlwaysAllow  # or IfHealthy (default)
  selector:
    matchLabels:
      app: web-app
```

- `IfHealthy` (default): Unhealthy pods count against the budget. This can block drains if pods are in CrashLoopBackOff.
- `AlwaysAllow`: Unhealthy pods can always be evicted regardless of the budget. This is usually what you want.

## Pod Priority and Preemption

When a cluster does not have enough resources to schedule a pod, Kubernetes can evict lower-priority pods to make room for higher-priority ones.

### Priority Classes

```yaml
# Critical system pods — never evict
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: system-critical
value: 1000000
globalDefault: false
preemptionPolicy: PreemptLowerPriority
description: "For critical system services like monitoring and logging"

---
# Production workloads
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: production-high
value: 100000
globalDefault: false
preemptionPolicy: PreemptLowerPriority
description: "For production services serving user traffic"

---
# Production background jobs
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: production-low
value: 50000
globalDefault: false
preemptionPolicy: PreemptLowerPriority
description: "For production background processing"

---
# Development and staging
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: development
value: 1000
globalDefault: true   # Default for all pods without explicit priority
preemptionPolicy: Never  # Development pods never preempt others
description: "For development and staging workloads"
```

### Using Priority Classes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
spec:
  replicas: 3
  template:
    spec:
      priorityClassName: production-high  # Use the priority class
      containers:
        - name: app
          image: payment-service:v1.2.3
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
```

## Resource Requests and Limits

Resource requests and limits control how much CPU and memory a container can use and directly affect scheduling, quality of service, and pod eviction.

### Requests vs Limits

```yaml
resources:
  requests:
    cpu: 100m       # Guaranteed: scheduler reserves this on the node
    memory: 128Mi   # Guaranteed: scheduler reserves this on the node
  limits:
    cpu: 500m       # Maximum: container is throttled above this
    memory: 512Mi   # Maximum: container is OOMKilled above this
```

**Key differences:**

| Aspect | Request | Limit |
|---|---|---|
| Scheduling | Used by scheduler to find a node | Not used for scheduling |
| CPU enforcement | Guaranteed minimum | Throttled above limit |
| Memory enforcement | Guaranteed minimum | OOMKilled above limit |
| Overcommit | Requests can be overcommitted per node | Limits can be exceeded (CPU) or killed (memory) |

### Quality of Service (QoS) Classes

Kubernetes assigns a QoS class to each pod based on its resource configuration:

```yaml
# Guaranteed: requests == limits for all containers
# Last to be evicted
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 500m
    memory: 512Mi

# Burstable: requests < limits (or only requests set)
# Evicted after BestEffort
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi

# BestEffort: no requests or limits set
# First to be evicted
resources: {}
```

### Eviction Order Under Memory Pressure

```
1. BestEffort pods (no resource requests/limits)
2. Burstable pods exceeding their requests
3. Burstable pods within their requests
4. Guaranteed pods (only evicted if system-critical processes need memory)
```

### Resource Setting Guidelines

```yaml
# CPU: Start with a low request and a higher limit
# CPU is compressible — throttling is annoying but not fatal
resources:
  requests:
    cpu: 100m     # 0.1 vCPU
  limits:
    cpu: 1000m    # 1 vCPU — 10x burst headroom

# Memory: Set request close to limit
# Memory is NOT compressible — exceeding limit = OOMKilled
resources:
  requests:
    memory: 256Mi
  limits:
    memory: 384Mi  # Only 1.5x headroom — avoid OOMKill surprises

# The "no CPU limit" approach (increasingly common)
# Let pods burst freely — only set memory limits
resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    memory: 384Mi
    # No CPU limit — let it burst
```

## Pod Topology Spread Constraints

Control how pods are distributed across failure domains (nodes, zones, regions):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
spec:
  replicas: 6
  template:
    spec:
      topologySpreadConstraints:
        # Spread across availability zones
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: web-app

        # Also spread across nodes within each zone
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
              app: web-app

      containers:
        - name: app
          image: my-app:v1.2.3
```

**`maxSkew`**: The maximum difference in pod count between any two topology domains. A skew of 1 means zones can differ by at most 1 pod.

**`whenUnsatisfiable`**:
- `DoNotSchedule`: Strict — pod stays Pending if constraint cannot be met
- `ScheduleAnyway`: Soft — scheduler tries its best but will schedule anyway

## Ephemeral Containers

Ephemeral containers are temporary containers that run in an existing pod for debugging. They are useful when the pod image does not contain debugging tools (as it should not in production).

```bash
# Add a debug container to a running pod
kubectl debug -it pod/web-app-7d8b9c6f5-x2k4m \
  --image=nicolaka/netshoot:latest \
  --target=app \
  -- /bin/bash

# Inside the ephemeral container, you can:
# - Inspect the network namespace (shared with the target container)
# - Run tcpdump, curl, dig, nslookup
# - Inspect the filesystem (if shareProcessNamespace is enabled)
# - Trace system calls with strace
```

```yaml
# Enable process namespace sharing for better debugging
apiVersion: v1
kind: Pod
metadata:
  name: web-app
spec:
  shareProcessNamespace: true  # Ephemeral containers can see app processes
  containers:
    - name: app
      image: my-app:v1.2.3
```

## Complete Production Pod Template

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: production-app
  labels:
    app: web-app
    version: v1.2.3
    team: platform
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "9090"
    prometheus.io/path: "/metrics"
spec:
  # Scheduling
  priorityClassName: production-high
  terminationGracePeriodSeconds: 60
  serviceAccountName: web-app
  automountServiceAccountToken: false

  # Security
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
    seccompProfile:
      type: RuntimeDefault

  # Topology spread
  topologySpreadConstraints:
    - maxSkew: 1
      topologyKey: topology.kubernetes.io/zone
      whenUnsatisfiable: DoNotSchedule
      labelSelector:
        matchLabels:
          app: web-app

  # Init containers
  initContainers:
    - name: wait-for-db
      image: busybox:1.36
      command: ["sh", "-c", "until nc -z postgres 5432; do sleep 2; done"]
      resources:
        requests:
          cpu: 10m
          memory: 16Mi
        limits:
          memory: 32Mi

  # Sidecar containers (Kubernetes 1.28+)
  # initContainers:
  #   - name: envoy
  #     image: envoyproxy/envoy:v1.28
  #     restartPolicy: Always

  # App container
  containers:
    - name: app
      image: my-app:v1.2.3
      ports:
        - containerPort: 3000
          name: http
        - containerPort: 9090
          name: metrics

      # Environment
      env:
        - name: NODE_ENV
          value: "production"
        - name: POD_NAME
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: POD_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
      envFrom:
        - configMapRef:
            name: app-config
        - secretRef:
            name: app-secrets

      # Probes
      startupProbe:
        httpGet:
          path: /healthz
          port: http
        periodSeconds: 5
        failureThreshold: 60
      readinessProbe:
        httpGet:
          path: /ready
          port: http
        periodSeconds: 5
        failureThreshold: 3
        successThreshold: 2
      livenessProbe:
        httpGet:
          path: /healthz
          port: http
        periodSeconds: 10
        failureThreshold: 3

      # Lifecycle
      lifecycle:
        preStop:
          exec:
            command: ["/bin/sh", "-c", "sleep 5"]

      # Resources
      resources:
        requests:
          cpu: 100m
          memory: 256Mi
        limits:
          memory: 512Mi

      # Security
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop:
            - ALL

      # Volume mounts
      volumeMounts:
        - name: tmp
          mountPath: /tmp
        - name: app-config
          mountPath: /app/config
          readOnly: true

  volumes:
    - name: tmp
      emptyDir:
        sizeLimit: 100Mi
    - name: app-config
      configMap:
        name: app-config
```

This template includes every production consideration covered in this page: proper probes, graceful shutdown, security context, resource management, topology spread, and observability annotations. Use it as a starting point and remove what does not apply to your specific workload.
