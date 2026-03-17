---
title: HPA, VPA & KEDA
description: Kubernetes autoscaling — Horizontal Pod Autoscaler with CPU, memory, and custom metrics, Vertical Pod Autoscaler for right-sizing, KEDA for event-driven scaling, scaling behavior tuning, and production autoscaling patterns.
tags:
  - kubernetes
  - autoscaling
  - hpa
  - vpa
  - keda
  - horizontal-pod-autoscaler
  - event-driven
  - infrastructure
difficulty: advanced
prerequisites:
  - infrastructure/kubernetes/deployments-statefulsets
  - devops/monitoring/metrics-design
  - devops/monitoring/prometheus-deep-dive
lastReviewed: "2026-03-17"
---

# HPA, VPA & KEDA

Autoscaling is about matching capacity to demand. Too few pods and your users experience latency. Too many and you waste money. Kubernetes provides three autoscaling mechanisms: HPA (add/remove pods), VPA (resize pods), and KEDA (scale on external events). This page covers each in depth with production-ready configurations.

## Horizontal Pod Autoscaler (HPA)

The HPA automatically scales the number of pod replicas based on observed metrics. It runs as a control loop that periodically (default: 15 seconds) checks metrics and adjusts the replica count.

### How HPA Works

```
┌─────────────────────────────────────────────────────────┐
│                    HPA Control Loop                      │
│                                                          │
│  1. Query metrics (Metrics API / Custom Metrics API)     │
│  2. Calculate desired replicas                           │
│  3. Scale the target (Deployment, StatefulSet, etc.)     │
│                                                          │
│  desiredReplicas = ceil(currentReplicas *                │
│                        currentMetricValue /              │
│                        desiredMetricValue)               │
└─────────────────────────────────────────────────────────┘
         │
         │ metrics query
         ▼
┌─────────────────┐     ┌─────────────────┐
│ metrics-server   │     │ Prometheus       │
│ (CPU/memory)     │     │ Adapter          │
│                  │     │ (custom metrics) │
└─────────────────┘     └─────────────────┘
```

### HPA with CPU Metrics

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-app
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-app

  minReplicas: 3
  maxReplicas: 50

  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70  # Scale when avg CPU > 70% of request

  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30   # Wait 30s before scaling up
      policies:
        - type: Pods
          value: 4                      # Add at most 4 pods per period
          periodSeconds: 60
        - type: Percent
          value: 100                    # Or double the pod count
          periodSeconds: 60
      selectPolicy: Max                 # Use whichever allows more pods

    scaleDown:
      stabilizationWindowSeconds: 300  # Wait 5 min before scaling down
      policies:
        - type: Percent
          value: 10                     # Remove at most 10% per period
          periodSeconds: 60
      selectPolicy: Min                 # Use whichever removes fewer pods
```

### Scaling Calculation Example

```
Current state:
  replicas: 4
  CPU request per pod: 500m
  Actual CPU per pod: 400m, 350m, 380m, 420m
  Average CPU: 387.5m
  Average utilization: 387.5m / 500m = 77.5%
  Target utilization: 70%

Calculation:
  desiredReplicas = ceil(4 * 77.5 / 70) = ceil(4.43) = 5

Result: Scale from 4 to 5 replicas
```

### HPA with Memory Metrics

```yaml
metrics:
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80

  # Or absolute value
  - type: Resource
    resource:
      name: memory
      target:
        type: AverageValue
        averageValue: 500Mi  # Scale when avg memory > 500Mi per pod
```

**Warning:** Memory-based HPA is tricky because memory usage often does not decrease when load decreases (due to garbage collection behavior, caching, etc.). This can lead to scaling up but never scaling down.

### HPA with Custom Metrics

Custom metrics let you scale on application-specific metrics from Prometheus or other monitoring systems.

**Prerequisites:**
1. Install a custom metrics adapter (e.g., `prometheus-adapter`)
2. Configure the adapter to expose your metrics through the Kubernetes Custom Metrics API

```yaml
# prometheus-adapter configuration
rules:
  - seriesQuery: 'http_requests_per_second{namespace!="",pod!=""}'
    resources:
      overrides:
        namespace: {resource: "namespace"}
        pod: {resource: "pod"}
    name:
      matches: "^(.*)$"
      as: "${1}"
    metricsQuery: 'sum(rate(http_requests_total{<<.LabelMatchers>>}[2m])) by (<<.GroupBy>>)'

  - seriesQuery: 'queue_depth{namespace!="",pod!=""}'
    resources:
      overrides:
        namespace: {resource: "namespace"}
        pod: {resource: "pod"}
    name:
      matches: "^(.*)$"
      as: "${1}"
    metricsQuery: 'avg(queue_depth{<<.LabelMatchers>>}) by (<<.GroupBy>>)'
```

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-app
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-app
  minReplicas: 3
  maxReplicas: 50

  metrics:
    # Scale on CPU (safety net)
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70

    # Scale on requests per second per pod
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "100"  # Scale when avg RPS per pod > 100

    # Scale on queue depth (external metric)
    - type: External
      external:
        metric:
          name: queue_depth
          selector:
            matchLabels:
              queue: order-processing
        target:
          type: Value
          value: "50"  # Scale when queue depth > 50
```

### Multiple Metrics

When multiple metrics are specified, the HPA calculates the desired replica count for each metric independently and takes the maximum:

```
Metric 1 (CPU 70%):      desiredReplicas = 5
Metric 2 (RPS 100):      desiredReplicas = 8
Metric 3 (Queue depth):  desiredReplicas = 3

Result: max(5, 8, 3) = 8 replicas
```

### Scaling Behavior Configuration

```yaml
behavior:
  # Scale up: be aggressive (respond to load quickly)
  scaleUp:
    stabilizationWindowSeconds: 0     # Scale up immediately
    policies:
      - type: Pods
        value: 10                      # Add up to 10 pods
        periodSeconds: 60
      - type: Percent
        value: 100                     # Or double the count
        periodSeconds: 60
    selectPolicy: Max                  # Use the more aggressive policy

  # Scale down: be conservative (avoid flapping)
  scaleDown:
    stabilizationWindowSeconds: 300   # Wait 5 minutes
    policies:
      - type: Percent
        value: 10                      # Remove at most 10% of pods
        periodSeconds: 60
    selectPolicy: Min                  # Use the less aggressive policy

  # Disable scale down entirely
  # scaleDown:
  #   selectPolicy: Disabled
```

### HPA Troubleshooting

```bash
# Check HPA status
kubectl get hpa web-app -n production
# NAME      REFERENCE            TARGETS   MINPODS   MAXPODS   REPLICAS   AGE
# web-app   Deployment/web-app   45%/70%   3         50        4          5d

# Detailed HPA status
kubectl describe hpa web-app -n production

# Check if metrics-server is running
kubectl get pods -n kube-system | grep metrics-server

# Check if custom metrics are available
kubectl get --raw "/apis/custom.metrics.k8s.io/v1beta1" | jq .

# Check specific custom metric
kubectl get --raw "/apis/custom.metrics.k8s.io/v1beta1/namespaces/production/pods/*/http_requests_per_second" | jq .
```

**Common issues:**

| Symptom | Cause | Fix |
|---|---|---|
| `<unknown>/70%` in TARGETS | metrics-server not running or pod has no resource requests | Install metrics-server, add resource requests |
| Scales up but never down | stabilizationWindowSeconds too long or memory-based HPA | Adjust behavior or use CPU/custom metrics |
| Flapping (scales up/down rapidly) | stabilizationWindowSeconds too short | Increase to 300-600 seconds for scale-down |
| Not scaling fast enough | maxSurge policies too restrictive | Increase scaleUp policies |

## Vertical Pod Autoscaler (VPA)

VPA automatically adjusts the CPU and memory requests/limits of pods based on actual usage. It solves the "what resource requests should I set?" problem.

### VPA Modes

| Mode | Behavior | Use Case |
|---|---|---|
| `Off` | VPA calculates recommendations but does not apply them | Learning what resources to set |
| `Initial` | VPA sets resources only when pods are created | Safe — does not restart running pods |
| `Auto` | VPA evicts and recreates pods with new resource values | Full automation — causes pod restarts |

### VPA Configuration

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: web-app
  namespace: production
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-app

  updatePolicy:
    updateMode: "Auto"  # Off, Initial, or Auto
    minReplicas: 2       # Never evict if fewer than 2 replicas are ready

  resourcePolicy:
    containerPolicies:
      - containerName: app
        minAllowed:
          cpu: 50m
          memory: 64Mi
        maxAllowed:
          cpu: 2000m
          memory: 4Gi
        controlledResources: ["cpu", "memory"]
        controlledValues: RequestsAndLimits  # or RequestsOnly

      - containerName: sidecar
        mode: "Off"  # Do not autoscale the sidecar
```

### Reading VPA Recommendations

```bash
kubectl describe vpa web-app -n production

# Output includes:
# Recommendation:
#   Container Recommendations:
#     Container Name: app
#     Lower Bound:
#       Cpu:     50m
#       Memory:  128Mi
#     Target:                    ← Use this for resource requests
#       Cpu:     250m
#       Memory:  384Mi
#     Uncapped Target:
#       Cpu:     250m
#       Memory:  384Mi
#     Upper Bound:
#       Cpu:     1000m
#       Memory:  1Gi
```

### VPA + HPA Interaction

**You cannot use VPA and HPA on the same metric.** If HPA scales on CPU and VPA adjusts CPU requests, they fight each other:

```
HPA: "CPU is at 80%, add more pods"
VPA: "CPU requests are too low, increase them"
→ VPA increases requests → utilization drops → HPA removes pods
→ Fewer pods → utilization rises → HPA adds pods
→ Infinite loop
```

**Safe combinations:**

```yaml
# HPA scales on custom metrics, VPA manages resources
# HPA
metrics:
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "100"

# VPA
spec:
  resourcePolicy:
    containerPolicies:
      - containerName: app
        controlledResources: ["cpu", "memory"]  # VPA manages resources
        # HPA does NOT use CPU/memory metrics
```

### Goldilocks (VPA Recommendations Dashboard)

Goldilocks is a tool that creates VPA objects in `Off` mode for all deployments and provides a dashboard showing recommendations:

```bash
# Install Goldilocks
helm install goldilocks fairwinds-stable/goldilocks --namespace goldilocks-system

# Enable for a namespace
kubectl label namespace production goldilocks.fairwinds.com/enabled=true

# Access the dashboard
kubectl port-forward svc/goldilocks-dashboard -n goldilocks-system 8080:80
```

## KEDA (Kubernetes Event-Driven Autoscaling)

KEDA extends Kubernetes autoscaling to scale on external event sources. It can scale deployments to zero (HPA cannot do this) and supports 60+ event sources.

### How KEDA Works

```
┌───────────────────┐     ┌───────────────┐     ┌──────────────┐
│  External Source   │────►│  KEDA Scaler  │────►│  HPA (v2)    │
│  (SQS, Kafka,     │     │  (polls every │     │  (manages    │
│   Redis, Postgres, │     │   30s)        │     │   replicas)  │
│   HTTP, Cron)      │     └───────────────┘     └──────────────┘
└───────────────────┘
```

KEDA creates and manages an HPA behind the scenes. It adds the ability to scale to zero and scale from zero.

### KEDA Installation

```bash
helm repo add kedacore https://kedacore.github.io/charts
helm install keda kedacore/keda --namespace keda --create-namespace
```

### ScaledObject (for Deployments)

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: order-processor
  namespace: production
spec:
  scaleTargetRef:
    name: order-processor  # Deployment name

  minReplicaCount: 0   # Scale to zero when idle
  maxReplicaCount: 50
  cooldownPeriod: 300   # Wait 5 min before scaling to zero
  pollingInterval: 15   # Check metrics every 15 seconds

  # Advanced scaling behavior
  advanced:
    horizontalPodAutoscalerConfig:
      behavior:
        scaleUp:
          stabilizationWindowSeconds: 0
          policies:
            - type: Pods
              value: 10
              periodSeconds: 60
        scaleDown:
          stabilizationWindowSeconds: 300
          policies:
            - type: Percent
              value: 25
              periodSeconds: 60

  triggers:
    # Scale based on AWS SQS queue depth
    - type: aws-sqs-queue
      metadata:
        queueURL: https://sqs.us-east-1.amazonaws.com/123456789/orders
        queueLength: "5"        # Target 5 messages per pod
        awsRegion: us-east-1
        activationQueueLength: "1"  # Scale from 0 when > 1 message
      authenticationRef:
        name: aws-credentials

    # Scale based on Prometheus metric
    - type: prometheus
      metadata:
        serverAddress: http://prometheus.monitoring:9090
        metricName: http_requests_total
        query: sum(rate(http_requests_total{service="order-processor"}[2m]))
        threshold: "100"
        activationThreshold: "5"
```

### ScaledJob (for Jobs)

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledJob
metadata:
  name: email-sender
  namespace: production
spec:
  jobTargetRef:
    parallelism: 1
    completions: 1
    backoffLimit: 3
    template:
      spec:
        containers:
          - name: email-sender
            image: email-sender:v1.0
            env:
              - name: QUEUE_URL
                value: https://sqs.us-east-1.amazonaws.com/123456789/emails
        restartPolicy: Never

  pollingInterval: 10
  maxReplicaCount: 20
  successfulJobsHistoryLimit: 5
  failedJobsHistoryLimit: 3
  scalingStrategy:
    strategy: default  # or custom, accurate

  triggers:
    - type: aws-sqs-queue
      metadata:
        queueURL: https://sqs.us-east-1.amazonaws.com/123456789/emails
        queueLength: "1"
        awsRegion: us-east-1
      authenticationRef:
        name: aws-credentials
```

### KEDA Trigger Authentication

```yaml
# TriggerAuthentication for AWS
apiVersion: keda.sh/v1alpha1
kind: TriggerAuthentication
metadata:
  name: aws-credentials
  namespace: production
spec:
  # Option 1: From a secret
  secretTargetRef:
    - parameter: awsAccessKeyID
      name: aws-credentials
      key: access-key-id
    - parameter: awsSecretAccessKey
      name: aws-credentials
      key: secret-access-key

  # Option 2: From a pod identity (IRSA on EKS)
  # podIdentity:
  #   provider: aws-eks

---
# TriggerAuthentication for Kafka
apiVersion: keda.sh/v1alpha1
kind: TriggerAuthentication
metadata:
  name: kafka-credentials
  namespace: production
spec:
  secretTargetRef:
    - parameter: sasl
      name: kafka-credentials
      key: sasl-mechanism
    - parameter: username
      name: kafka-credentials
      key: username
    - parameter: password
      name: kafka-credentials
      key: password
    - parameter: tls
      name: kafka-credentials
      key: tls-enabled
```

### Common KEDA Scalers

```yaml
# Kafka consumer group lag
triggers:
  - type: kafka
    metadata:
      bootstrapServers: kafka.production:9092
      consumerGroup: order-processor
      topic: orders
      lagThreshold: "10"  # Scale when lag > 10 per partition
      activationLagThreshold: "1"
    authenticationRef:
      name: kafka-credentials

# Redis list length
triggers:
  - type: redis-lists
    metadata:
      address: redis.production:6379
      listName: tasks
      listLength: "5"
      activationListLength: "1"
    authenticationRef:
      name: redis-credentials

# PostgreSQL query result
triggers:
  - type: postgresql
    metadata:
      connectionFromEnv: DATABASE_URL
      query: "SELECT count(*) FROM jobs WHERE status = 'pending'"
      targetQueryValue: "10"
      activationTargetQueryValue: "1"

# HTTP request rate (requires KEDA HTTP Add-on)
triggers:
  - type: prometheus
    metadata:
      serverAddress: http://prometheus.monitoring:9090
      query: sum(rate(http_requests_total{deployment="web-app"}[1m]))
      threshold: "500"
      activationThreshold: "10"

# Cron-based scaling (predictive scaling)
triggers:
  - type: cron
    metadata:
      timezone: America/New_York
      start: "0 8 * * 1-5"    # Mon-Fri 8 AM
      end: "0 18 * * 1-5"     # Mon-Fri 6 PM
      desiredReplicas: "10"   # Business hours capacity

# RabbitMQ queue depth
triggers:
  - type: rabbitmq
    metadata:
      host: amqp://rabbitmq.production:5672
      queueName: orders
      mode: QueueLength
      value: "5"
      activationValue: "1"
```

### Scale-to-Zero Considerations

KEDA can scale to zero, but the first request to a scaled-down service will fail because there are no pods to handle it. Solutions:

```
1. Keep minReplicaCount: 1 for latency-sensitive services
2. Use KEDA HTTP Add-on which queues requests while scaling from zero
3. Use a warm-up period with activationThreshold
4. Implement retry logic in the caller
```

```yaml
# KEDA HTTP Add-on for scale-to-zero HTTP services
apiVersion: http.keda.sh/v1alpha1
kind: HTTPScaledObject
metadata:
  name: web-app
  namespace: production
spec:
  hosts:
    - app.example.com
  targetPendingRequests: 100
  scaleTargetRef:
    deployment: web-app
    service: web-app
    port: 80
  replicas:
    min: 0
    max: 50
  scaledownPeriod: 300
```

## Production Autoscaling Patterns

### Pattern 1: Web API Service

```yaml
# HPA on CPU + custom metric (requests per second)
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-api
  minReplicas: 3
  maxReplicas: 30
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "200"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 15
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 120
```

### Pattern 2: Worker/Consumer Service

```yaml
# KEDA on queue depth — scales to zero when idle
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: order-worker
spec:
  scaleTargetRef:
    name: order-worker
  minReplicaCount: 0
  maxReplicaCount: 50
  cooldownPeriod: 300
  triggers:
    - type: aws-sqs-queue
      metadata:
        queueURL: https://sqs.us-east-1.amazonaws.com/123456789/orders
        queueLength: "5"
        activationQueueLength: "1"
      authenticationRef:
        name: aws-credentials
```

### Pattern 3: Predictive + Reactive Scaling

Combine cron-based scaling (predictive) with metric-based scaling (reactive):

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: web-app
spec:
  scaleTargetRef:
    name: web-app
  minReplicaCount: 3
  maxReplicaCount: 100
  triggers:
    # Predictive: scale up for known traffic patterns
    - type: cron
      metadata:
        timezone: America/New_York
        start: "0 7 * * 1-5"
        end: "0 20 * * 1-5"
        desiredReplicas: "15"

    # Reactive: scale further if actual load exceeds predictions
    - type: prometheus
      metadata:
        serverAddress: http://prometheus.monitoring:9090
        query: sum(rate(http_requests_total{service="web-app"}[2m]))
        threshold: "1000"
```

### Cluster Autoscaler

The Cluster Autoscaler (CA) scales the number of nodes, not pods. It works with HPA/KEDA:

```
Traffic spike
    → HPA/KEDA adds pods
    → Pods stuck in Pending (not enough resources)
    → Cluster Autoscaler adds nodes
    → Pods get scheduled on new nodes

Traffic drops
    → HPA/KEDA removes pods
    → Nodes become underutilized
    → Cluster Autoscaler removes nodes
```

```yaml
# EKS managed node group with autoscaling
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig
metadata:
  name: production
  region: us-east-1
managedNodeGroups:
  - name: general
    instanceType: m6i.xlarge
    minSize: 3
    maxSize: 20
    desiredCapacity: 5
    labels:
      workload-type: general
  - name: compute
    instanceType: c6i.2xlarge
    minSize: 0
    maxSize: 50
    desiredCapacity: 0
    labels:
      workload-type: compute
    taints:
      - key: workload-type
        value: compute
        effect: NoSchedule
```

### Karpenter (Alternative to Cluster Autoscaler)

Karpenter is faster and smarter than the Cluster Autoscaler. It provisions nodes based on pending pod requirements rather than scaling node groups:

```yaml
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: general
spec:
  template:
    spec:
      requirements:
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["on-demand", "spot"]
        - key: node.kubernetes.io/instance-type
          operator: In
          values: ["m6i.xlarge", "m6i.2xlarge", "m5.xlarge", "m5.2xlarge"]
      nodeClassRef:
        name: default
  limits:
    cpu: 1000
    memory: 2000Gi
  disruption:
    consolidationPolicy: WhenUnderutilized
    consolidateAfter: 30s
```

## Autoscaling Checklist

| Item | Status |
|---|---|
| Resource requests set for all containers | Required for HPA CPU/memory |
| metrics-server installed | Required for HPA CPU/memory |
| prometheus-adapter installed | Required for HPA custom metrics |
| VPA in Off mode for initial recommendations | Before setting requests manually |
| HPA stabilization windows tuned | Prevent flapping |
| HPA scale-down policy is conservative | Prevent premature scale-down |
| KEDA cooldownPeriod set for queue scalers | Prevent premature scale-to-zero |
| PodDisruptionBudgets in place | Prevent scaling from killing availability |
| Cluster Autoscaler / Karpenter configured | Ensure nodes scale with pods |
| Alerts on HPA at maxReplicas | Know when you are capacity-constrained |
| Resource quotas per namespace | Prevent one team from consuming all resources |
