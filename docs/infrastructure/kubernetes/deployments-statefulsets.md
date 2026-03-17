---
title: Deployments & StatefulSets
description: Kubernetes workload controllers — Deployments with rolling updates and rollback, StatefulSets for stateful applications, DaemonSets for node-level agents, Jobs and CronJobs for batch processing, and ReplicaSets internals.
tags:
  - kubernetes
  - deployments
  - statefulsets
  - daemonsets
  - jobs
  - cronjobs
  - rolling-updates
  - infrastructure
difficulty: intermediate
prerequisites:
  - infrastructure/kubernetes/pod-lifecycle
  - infrastructure/kubernetes/architecture-internals
lastReviewed: "2026-03-17"
---

# Deployments & StatefulSets

Pods are ephemeral — they can be killed, evicted, or rescheduled at any time. You never create pods directly in production. Instead, you use workload controllers that manage pods for you: Deployments for stateless applications, StatefulSets for stateful applications, DaemonSets for node-level agents, and Jobs for batch processing.

## Deployments

A Deployment is the most common workload controller. It manages a set of identical pods, handles rolling updates, and supports rollback.

### How Deployments Work

A Deployment does not manage pods directly. It manages ReplicaSets, which manage pods:

```
Deployment
    │
    ├── ReplicaSet (revision 3, current) ── Pod, Pod, Pod
    ├── ReplicaSet (revision 2, old)     ── (0 pods, scaled down)
    └── ReplicaSet (revision 1, old)     ── (0 pods, scaled down)
```

When you update a Deployment, it creates a new ReplicaSet and gradually scales it up while scaling down the old ReplicaSet:

```
Time 0:  RS-old (3 pods)    RS-new (0 pods)
Time 1:  RS-old (3 pods)    RS-new (1 pod)     ← new pod starts
Time 2:  RS-old (2 pods)    RS-new (1 pod)     ← old pod terminates
Time 3:  RS-old (2 pods)    RS-new (2 pods)    ← new pod starts
Time 4:  RS-old (1 pod)     RS-new (2 pods)    ← old pod terminates
Time 5:  RS-old (1 pod)     RS-new (3 pods)    ← new pod starts
Time 6:  RS-old (0 pods)    RS-new (3 pods)    ← old pod terminates (done)
```

### Complete Deployment Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
  namespace: production
  labels:
    app: web-app
    team: platform
  annotations:
    deployment.kubernetes.io/revision: "1"
spec:
  replicas: 3
  revisionHistoryLimit: 10  # Keep 10 old ReplicaSets for rollback

  # How the Deployment selects pods to manage
  selector:
    matchLabels:
      app: web-app

  # Rolling update strategy
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # Allow 1 extra pod during update (4 total)
      maxUnavailable: 0     # Never have fewer than 3 ready pods

  # Minimum time a pod must be ready before the rollout continues
  minReadySeconds: 10

  # How long to wait for a rollout to progress before considering it failed
  progressDeadlineSeconds: 600  # 10 minutes

  template:
    metadata:
      labels:
        app: web-app
        version: v1.2.3
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9090"
    spec:
      serviceAccountName: web-app
      terminationGracePeriodSeconds: 60

      containers:
        - name: app
          image: my-app:v1.2.3
          ports:
            - containerPort: 3000
              name: http
          readinessProbe:
            httpGet:
              path: /ready
              port: http
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /healthz
              port: http
            initialDelaySeconds: 15
            periodSeconds: 10
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              memory: 512Mi
          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh", "-c", "sleep 5"]
```

### Rolling Update Strategies

The `maxSurge` and `maxUnavailable` settings control the speed and safety of a rolling update:

```
maxSurge: 1, maxUnavailable: 0 (safest, slowest)
────────────────────────────────────────────
Always have at least 3 ready pods.
At most 4 pods exist at any time.
No capacity loss during deployment.
Use for: Production services where you cannot afford reduced capacity.

maxSurge: 0, maxUnavailable: 1 (no extra resources needed)
────────────────────────────────────────────
Always have at most 3 pods total.
At least 2 pods are ready at any time.
Saves resources but reduces capacity during deployment.
Use for: Resource-constrained clusters.

maxSurge: 25%, maxUnavailable: 25% (Kubernetes default, balanced)
────────────────────────────────────────────
For 10 replicas: at most 13 pods exist, at least 8 are ready.
Good balance of speed and safety.
Use for: Most production services with sufficient headroom.

maxSurge: 100%, maxUnavailable: 0 (fastest, most resources)
────────────────────────────────────────────
Creates all new pods before terminating old ones (blue-green style).
Requires double the resources temporarily.
Use for: When deployment speed matters and resources are available.
```

### Rollback

Kubernetes keeps old ReplicaSets (controlled by `revisionHistoryLimit`) so you can roll back:

```bash
# View rollout history
kubectl rollout history deployment/web-app

# View a specific revision
kubectl rollout history deployment/web-app --revision=3

# Roll back to the previous version
kubectl rollout undo deployment/web-app

# Roll back to a specific revision
kubectl rollout undo deployment/web-app --to-revision=2

# Check rollout status
kubectl rollout status deployment/web-app

# Pause a rollout (useful for canary-style manual checks)
kubectl rollout pause deployment/web-app

# Resume a paused rollout
kubectl rollout resume deployment/web-app
```

### Deployment Conditions

Monitor deployment status through conditions:

```yaml
status:
  conditions:
    - type: Available
      status: "True"
      reason: MinimumReplicasAvailable
    - type: Progressing
      status: "True"
      reason: NewReplicaSetAvailable
```

**Progressing becomes False** when the deployment is stuck — usually because new pods fail readiness probes. After `progressDeadlineSeconds` (default 600s), the deployment reports failure but does NOT automatically roll back. You must intervene:

```bash
# Check why the rollout is stuck
kubectl describe deployment web-app
kubectl get pods -l app=web-app
kubectl logs deployment/web-app --previous  # Logs from crashed containers

# Roll back if needed
kubectl rollout undo deployment/web-app
```

### Recreate Strategy

The `Recreate` strategy kills all existing pods before creating new ones. This causes downtime but is necessary for workloads that cannot tolerate two versions running simultaneously:

```yaml
spec:
  strategy:
    type: Recreate  # All old pods die before new pods start
```

**Use cases for Recreate:**
- Applications with exclusive locks on shared resources (databases, file locks)
- Applications that cannot handle two versions running simultaneously
- Development/staging environments where downtime is acceptable

## StatefulSets

StatefulSets are for applications that need one or more of: stable network identity, stable persistent storage, ordered deployment and scaling.

### StatefulSet vs Deployment

| Feature | Deployment | StatefulSet |
|---|---|---|
| Pod names | Random hash (`web-app-7d8b9c-x2k4m`) | Ordered index (`postgres-0`, `postgres-1`) |
| Pod creation | All pods created simultaneously | Pods created one at a time, in order |
| Pod deletion | Any pod can be deleted | Pods deleted in reverse order |
| Persistent storage | All pods share the same PVC (or use `emptyDir`) | Each pod gets its own PVC |
| Network identity | Pods are interchangeable | Each pod has a stable DNS name |
| Update strategy | Rolling update across all pods | Rolling update in reverse order |
| Scaling | Scale up/down any number at once | Scale up/down one at a time |

### Complete StatefulSet Manifest

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: production
spec:
  serviceName: postgres-headless  # Required: headless service for DNS
  replicas: 3
  podManagementPolicy: OrderedReady  # or Parallel

  # Pods are updated in reverse order (2, 1, 0)
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1  # Kubernetes 1.24+
      # partition: 0  # Only update pods with ordinal >= partition

  selector:
    matchLabels:
      app: postgres

  # Each pod gets its own PVC from this template
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: gp3-encrypted
        resources:
          requests:
            storage: 100Gi

  template:
    metadata:
      labels:
        app: postgres
    spec:
      terminationGracePeriodSeconds: 120

      # Anti-affinity: spread replicas across nodes
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector:
                matchExpressions:
                  - key: app
                    operator: In
                    values: ["postgres"]
              topologyKey: kubernetes.io/hostname

      containers:
        - name: postgres
          image: postgres:16.2
          ports:
            - containerPort: 5432
              name: postgres
          env:
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-credentials
                  key: password
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
          readinessProbe:
            exec:
              command:
                - /bin/sh
                - -c
                - pg_isready -U postgres -h localhost
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            exec:
              command:
                - /bin/sh
                - -c
                - pg_isready -U postgres -h localhost
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 5
          resources:
            requests:
              cpu: 500m
              memory: 1Gi
            limits:
              memory: 2Gi

---
# Headless service for StatefulSet DNS
apiVersion: v1
kind: Service
metadata:
  name: postgres-headless
  namespace: production
spec:
  clusterIP: None  # Headless — no load balancing, DNS resolves to pod IPs
  selector:
    app: postgres
  ports:
    - port: 5432
      targetPort: postgres
```

### StatefulSet DNS

With a headless service, each pod gets a stable DNS name:

```
Pod name:    postgres-0
DNS name:    postgres-0.postgres-headless.production.svc.cluster.local
Short form:  postgres-0.postgres-headless

Pod name:    postgres-1
DNS name:    postgres-1.postgres-headless.production.svc.cluster.local

Pod name:    postgres-2
DNS name:    postgres-2.postgres-headless.production.svc.cluster.local
```

This is critical for StatefulSet applications. A PostgreSQL replica can be configured to replicate from `postgres-0.postgres-headless` (the primary), and this DNS name is stable even if the pod is rescheduled to a different node.

### Volume Claim Templates

Each pod gets its own PersistentVolumeClaim:

```
postgres-0  →  data-postgres-0  →  PersistentVolume (100Gi on node-1)
postgres-1  →  data-postgres-1  →  PersistentVolume (100Gi on node-2)
postgres-2  →  data-postgres-2  →  PersistentVolume (100Gi on node-3)
```

**Critical behavior:** When a StatefulSet is deleted or scaled down, the PVCs are NOT deleted. This is intentional — you do not want to lose data when scaling down. You must delete PVCs manually:

```bash
# Scaling down from 3 to 1 does NOT delete data-postgres-1 and data-postgres-2
kubectl scale statefulset postgres --replicas=1

# PVCs are still there
kubectl get pvc
# NAME               STATUS   VOLUME     CAPACITY
# data-postgres-0    Bound    pv-abc     100Gi
# data-postgres-1    Bound    pv-def     100Gi  ← Still exists
# data-postgres-2    Bound    pv-ghi     100Gi  ← Still exists

# If you scale back up, the old PVCs are reattached
kubectl scale statefulset postgres --replicas=3
# postgres-1 gets data-postgres-1 back (with all its data)
```

### Partitioned Rolling Updates

The `partition` field lets you do canary updates on StatefulSets:

```yaml
updateStrategy:
  type: RollingUpdate
  rollingUpdate:
    partition: 2  # Only update pods with ordinal >= 2
```

```
With partition: 2 and replicas: 3:
  postgres-0  →  old image (not updated)
  postgres-1  →  old image (not updated)
  postgres-2  →  new image (updated)

Change partition to 1:
  postgres-0  →  old image (not updated)
  postgres-1  →  new image (updated)
  postgres-2  →  new image (updated)

Change partition to 0:
  postgres-0  →  new image (updated)
  postgres-1  →  new image (updated)
  postgres-2  →  new image (updated)
```

### Pod Management Policies

```yaml
# OrderedReady (default): pods created/deleted one at a time, in order
podManagementPolicy: OrderedReady
# postgres-0 must be Running and Ready before postgres-1 starts

# Parallel: all pods created/deleted simultaneously
podManagementPolicy: Parallel
# All pods start at the same time (useful when order does not matter)
```

## DaemonSets

A DaemonSet ensures that a copy of a pod runs on every node (or a subset of nodes). When a new node is added to the cluster, the DaemonSet pod is automatically scheduled on it. When a node is removed, the pod is garbage collected.

### Use Cases

- **Log collection**: Fluent Bit, Filebeat, Fluentd
- **Monitoring**: Node Exporter, Datadog agent, cAdvisor
- **Networking**: CNI plugins, kube-proxy, Cilium
- **Storage**: CSI node drivers
- **Security**: Falco, Sysdig

### Complete DaemonSet Manifest

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluent-bit
  namespace: logging
  labels:
    app: fluent-bit
spec:
  selector:
    matchLabels:
      app: fluent-bit

  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1  # Update one node at a time
      maxSurge: 0        # Do not create extra pods

  template:
    metadata:
      labels:
        app: fluent-bit
    spec:
      serviceAccountName: fluent-bit
      tolerations:
        # Run on all nodes, including control plane
        - operator: Exists

      # Node selector to target specific nodes
      # nodeSelector:
      #   kubernetes.io/os: linux

      containers:
        - name: fluent-bit
          image: fluent/fluent-bit:2.2
          ports:
            - containerPort: 2020
              name: metrics
          volumeMounts:
            - name: varlog
              mountPath: /var/log
              readOnly: true
            - name: containers
              mountPath: /var/lib/docker/containers
              readOnly: true
            - name: config
              mountPath: /fluent-bit/etc
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 256Mi
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 2020
            periodSeconds: 10

      volumes:
        - name: varlog
          hostPath:
            path: /var/log
        - name: containers
          hostPath:
            path: /var/lib/docker/containers
        - name: config
          configMap:
            name: fluent-bit-config

      # Run on the host network (needed for some monitoring agents)
      # hostNetwork: true
      # dnsPolicy: ClusterFirstWithHostNet
```

### Running on Specific Nodes

```yaml
# Run only on nodes with a specific label
spec:
  template:
    spec:
      nodeSelector:
        node-type: gpu

# Run only on nodes with SSDs
spec:
  template:
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: storage-type
                    operator: In
                    values: ["ssd"]
```

## Jobs and CronJobs

### Jobs

A Job creates one or more pods and ensures a specified number of them successfully terminate. Jobs are for batch processing, data pipelines, and one-off tasks.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: data-migration
  namespace: production
spec:
  # How many pods must successfully complete
  completions: 1

  # How many pods can run in parallel
  parallelism: 1

  # How many times a pod can fail before the Job is marked as failed
  backoffLimit: 3

  # How long the Job can run before being terminated
  activeDeadlineSeconds: 3600  # 1 hour

  # Automatically delete the Job after completion
  ttlSecondsAfterFinished: 86400  # 24 hours

  # Retry policy for individual pod failures (Kubernetes 1.25+)
  backoffLimitPerIndex: 1  # For indexed jobs

  template:
    spec:
      restartPolicy: OnFailure  # or Never

      containers:
        - name: migration
          image: my-app:v1.2.3
          command: ["node", "scripts/migrate.js"]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: url
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              memory: 1Gi
```

### Job Patterns

```yaml
# Pattern 1: Single completion (default)
# Run one pod, succeed once
completions: 1
parallelism: 1

# Pattern 2: Fixed completion count
# Run 10 work items, 3 at a time
completions: 10
parallelism: 3

# Pattern 3: Work queue (external coordination)
# Run pods until they all succeed — pods coordinate via a work queue
completions: null  # Omit completions
parallelism: 5

# Pattern 4: Indexed Job (Kubernetes 1.21+)
# Each pod gets a unique index (0, 1, 2, ...) in the JOB_COMPLETION_INDEX env var
completionMode: Indexed
completions: 10
parallelism: 5
```

### CronJobs

CronJobs create Jobs on a time-based schedule:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: database-backup
  namespace: production
spec:
  schedule: "0 2 * * *"  # 2:00 AM daily
  timeZone: "America/New_York"  # Kubernetes 1.27+

  # What to do if a Job is still running when the next schedule fires
  concurrencyPolicy: Forbid  # Skip if previous Job is still running
  # Allow    — run concurrent Jobs (default)
  # Forbid   — skip if previous Job is still running
  # Replace  — kill previous Job and start new one

  # How many successful/failed Jobs to keep
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 5

  # Deadline for starting the Job after its scheduled time
  startingDeadlineSeconds: 300  # If not started within 5 min, skip

  # Suspend the CronJob (stop scheduling new Jobs)
  suspend: false

  jobTemplate:
    spec:
      backoffLimit: 2
      activeDeadlineSeconds: 7200  # 2 hours max
      ttlSecondsAfterFinished: 86400
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: backup
              image: postgres:16.2
              command:
                - /bin/sh
                - -c
                - |
                  pg_dump -h postgres-primary -U postgres -Fc mydb \
                    > /backup/mydb-$(date +%Y%m%d-%H%M%S).dump
                  aws s3 cp /backup/*.dump s3://backups/postgres/
              env:
                - name: PGPASSWORD
                  valueFrom:
                    secretKeyRef:
                      name: postgres-credentials
                      key: password
              volumeMounts:
                - name: backup
                  mountPath: /backup
              resources:
                requests:
                  cpu: 200m
                  memory: 256Mi
                limits:
                  memory: 512Mi
          volumes:
            - name: backup
              emptyDir:
                sizeLimit: 10Gi
```

### CronJob Schedule Syntax

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6, Sunday = 0)
│ │ │ │ │
* * * * *

Examples:
"0 * * * *"      → Every hour at minute 0
"*/15 * * * *"   → Every 15 minutes
"0 2 * * *"      → Daily at 2:00 AM
"0 2 * * 1"      → Every Monday at 2:00 AM
"0 0 1 * *"      → First day of every month at midnight
"0 2 * * 1-5"    → Weekdays at 2:00 AM
```

## Workload Controller Decision Matrix

```
┌─────────────────────────────────────────────────┐
│ What kind of workload do you have?              │
└───────────────────┬─────────────────────────────┘
                    │
        ┌───────────┼──────────┬──────────────┐
        ▼           ▼          ▼              ▼
   Stateless    Stateful    Every Node    Batch/Cron
   service      service     needs one     processing
        │           │          │              │
        ▼           ▼          ▼              ▼
   Deployment  StatefulSet  DaemonSet    Job/CronJob
```

| Question | Yes → Use | No → |
|---|---|---|
| Does each instance need a stable identity? | StatefulSet | Continue |
| Does each instance need its own storage? | StatefulSet | Continue |
| Must instances start/stop in a specific order? | StatefulSet | Continue |
| Must a copy run on every node? | DaemonSet | Continue |
| Is this a one-time or scheduled task? | Job / CronJob | Deployment |

## Advanced Deployment Patterns

### Blue-Green with Deployments

Kubernetes does not have native blue-green support, but you can implement it with two Deployments and a Service:

```yaml
# Blue deployment (current production)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app-blue
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web-app
      version: blue
  template:
    metadata:
      labels:
        app: web-app
        version: blue
    spec:
      containers:
        - name: app
          image: my-app:v1.0.0

---
# Green deployment (new version)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app-green
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web-app
      version: green
  template:
    metadata:
      labels:
        app: web-app
        version: green
    spec:
      containers:
        - name: app
          image: my-app:v2.0.0

---
# Service points to blue — switch to green by changing selector
apiVersion: v1
kind: Service
metadata:
  name: web-app
spec:
  selector:
    app: web-app
    version: blue  # Change to "green" to switch
  ports:
    - port: 80
      targetPort: 3000
```

### Canary with Deployments

```yaml
# Stable deployment (95% of traffic)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app-stable
spec:
  replicas: 19  # 19 out of 20 pods = ~95%
  selector:
    matchLabels:
      app: web-app
      track: stable
  template:
    metadata:
      labels:
        app: web-app
        track: stable
    spec:
      containers:
        - name: app
          image: my-app:v1.0.0

---
# Canary deployment (5% of traffic)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app-canary
spec:
  replicas: 1   # 1 out of 20 pods = ~5%
  selector:
    matchLabels:
      app: web-app
      track: canary
  template:
    metadata:
      labels:
        app: web-app
        track: canary
    spec:
      containers:
        - name: app
          image: my-app:v2.0.0

---
# Service selects BOTH — traffic split by pod ratio
apiVersion: v1
kind: Service
metadata:
  name: web-app
spec:
  selector:
    app: web-app  # Matches both stable and canary pods
  ports:
    - port: 80
      targetPort: 3000
```

This is a rough approach. For precise traffic splitting, use an Ingress controller (Nginx, Traefik) or service mesh (Istio, Linkerd) with weighted routing.

## Scaling Operations

```bash
# Manual scaling
kubectl scale deployment web-app --replicas=5

# Scale based on a condition
kubectl scale deployment web-app --replicas=10 --current-replicas=5

# Scale to zero (useful for cost savings in non-prod)
kubectl scale deployment web-app --replicas=0

# Scale a StatefulSet (respects ordered pod management)
kubectl scale statefulset postgres --replicas=5
```

### Horizontal Pod Autoscaler (Quick Reference)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-app
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-app
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
        - type: Pods
          value: 4
          periodSeconds: 60
```

See [HPA, VPA & KEDA](./hpa-vpa-keda) for deep coverage of autoscaling.

## Debugging Workload Controllers

```bash
# Deployment not progressing
kubectl describe deployment web-app
kubectl rollout status deployment web-app
kubectl get rs -l app=web-app  # Check ReplicaSets

# StatefulSet pods not starting
kubectl describe statefulset postgres
kubectl get pods -l app=postgres -o wide
kubectl get pvc -l app=postgres  # Check volume claims

# Job failing
kubectl describe job data-migration
kubectl get pods -l job-name=data-migration
kubectl logs job/data-migration

# CronJob not firing
kubectl describe cronjob database-backup
kubectl get jobs -l job-name=database-backup
```

### Common Issues

| Symptom | Workload | Likely Cause | Fix |
|---|---|---|---|
| Pods stuck in Pending | Any | Insufficient resources or no matching nodes | Check `kubectl describe pod` events |
| Deployment stuck at old version | Deployment | New pods failing readiness probes | Check probe endpoints, check logs |
| StatefulSet pod not starting | StatefulSet | PVC not binding (wrong storage class) | Check PVC status and storage class |
| Job keeps restarting | Job | Exit code != 0 | Check logs, fix application error |
| CronJob creates no Jobs | CronJob | Schedule syntax wrong or `suspend: true` | Validate cron expression, check suspend flag |
| Old ReplicaSets accumulating | Deployment | `revisionHistoryLimit` too high | Set to 5-10 (default is 10) |
