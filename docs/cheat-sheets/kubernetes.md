---
title: "Kubernetes Cheat Sheet"
description: "Quick reference for kubectl commands, resource types, debugging pods, and common YAML"
tags: [cheat-sheet, kubernetes, k8s]
difficulty: "intermediate"
lastReviewed: "2026-03-18"
---

# Kubernetes Cheat Sheet

Quick reference for kubectl commands, Kubernetes resource types, debugging, and common YAML patterns.

**Deep dive**: [Kubernetes Section](/infrastructure/kubernetes/) | [K8s Production Checklist](/infrastructure/kubernetes/production-checklist)

---

## kubectl Basics

### Context & Config

| Command | Description |
|---------|-------------|
| `kubectl config get-contexts` | List all contexts |
| `kubectl config current-context` | Show current context |
| `kubectl config use-context ctx` | Switch context |
| `kubectl config set-context --current --namespace=ns` | Set default namespace |
| `kubectl cluster-info` | Cluster endpoint info |
| `kubectl api-resources` | List all resource types |
| `kubectl api-versions` | List API versions |

### Get Resources

| Command | Description |
|---------|-------------|
| `kubectl get pods` | List pods in current namespace |
| `kubectl get pods -A` | List pods in all namespaces |
| `kubectl get pods -o wide` | Pods with node and IP info |
| `kubectl get pods -o yaml` | Full YAML output |
| `kubectl get pods -l app=web` | Filter by label |
| `kubectl get pods --field-selector status.phase=Running` | Filter by field |
| `kubectl get pods --sort-by=.metadata.creationTimestamp` | Sort by creation time |
| `kubectl get all` | All resources in namespace |
| `kubectl get events --sort-by=.lastTimestamp` | Events sorted by time |

### Create & Apply

| Command | Description |
|---------|-------------|
| `kubectl apply -f manifest.yaml` | Create or update from file |
| `kubectl apply -f ./dir/` | Apply all files in directory |
| `kubectl apply -k ./kustomize/` | Apply with Kustomize |
| `kubectl create ns my-namespace` | Create namespace |
| `kubectl create secret generic s --from-literal=k=v` | Create secret from literal |
| `kubectl create secret generic s --from-file=./key.pem` | Create secret from file |
| `kubectl create configmap cm --from-literal=k=v` | Create configmap |

### Edit & Delete

| Command | Description |
|---------|-------------|
| `kubectl edit deployment app` | Edit resource in editor |
| `kubectl delete -f manifest.yaml` | Delete from file |
| `kubectl delete pod pod-name` | Delete specific pod |
| `kubectl delete pods -l app=web` | Delete pods by label |
| `kubectl delete ns my-namespace` | Delete namespace and everything in it |

### Describe & Logs

| Command | Description |
|---------|-------------|
| `kubectl describe pod pod-name` | Detailed pod info with events |
| `kubectl describe node node-name` | Node capacity and allocations |
| `kubectl logs pod-name` | Pod logs |
| `kubectl logs pod-name -c container` | Specific container logs |
| `kubectl logs pod-name --previous` | Previous container logs (after crash) |
| `kubectl logs -f pod-name` | Follow logs |
| `kubectl logs -l app=web --all-containers` | Logs from all pods with label |

### Exec & Port-Forward

| Command | Description |
|---------|-------------|
| `kubectl exec -it pod-name -- sh` | Shell into pod |
| `kubectl exec pod-name -- cmd` | Run command in pod |
| `kubectl port-forward pod-name 8080:3000` | Forward local port to pod |
| `kubectl port-forward svc/service 8080:80` | Forward local port to service |
| `kubectl cp pod-name:/path ./local` | Copy from pod |

### Scaling & Rollouts

| Command | Description |
|---------|-------------|
| `kubectl scale deployment app --replicas=5` | Scale deployment |
| `kubectl autoscale deployment app --min=2 --max=10 --cpu-percent=80` | Create HPA |
| `kubectl rollout status deployment app` | Watch rollout progress |
| `kubectl rollout history deployment app` | Rollout history |
| `kubectl rollout undo deployment app` | Rollback to previous |
| `kubectl rollout undo deployment app --to-revision=2` | Rollback to specific revision |
| `kubectl rollout restart deployment app` | Rolling restart |

---

## Resource Types Quick Reference

| Resource | Short | Purpose |
|----------|-------|---------|
| Pod | po | Smallest deployable unit |
| Deployment | deploy | Declarative pod management with rollouts |
| StatefulSet | sts | Stateful workloads with stable identity |
| DaemonSet | ds | One pod per node |
| Job | job | Run to completion |
| CronJob | cj | Scheduled jobs |
| Service | svc | Network endpoint for pods |
| Ingress | ing | HTTP routing and TLS termination |
| ConfigMap | cm | Non-sensitive configuration |
| Secret | secret | Sensitive configuration |
| PersistentVolumeClaim | pvc | Storage request |
| Namespace | ns | Resource isolation |
| ServiceAccount | sa | Pod identity |
| Role | role | Namespace-scoped permissions |
| ClusterRole | clusterrole | Cluster-scoped permissions |
| NetworkPolicy | netpol | Network traffic rules |
| HorizontalPodAutoscaler | hpa | Auto-scale by metrics |

---

## Common YAML Templates

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  labels:
    app: app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: app
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: app
    spec:
      containers:
        - name: app
          image: app:1.0.0
          ports:
            - containerPort: 3000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: url
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 20
```

### Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: app
spec:
  selector:
    app: app
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP
```

### Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - app.example.com
      secretName: app-tls
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: app
                port:
                  number: 80
```

### CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: cleanup
spec:
  schedule: "0 2 * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: cleanup
              image: app:1.0.0
              command: ["node", "scripts/cleanup.js"]
```

### HPA

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: app
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: app
  minReplicas: 2
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
```

### NetworkPolicy

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: app-policy
spec:
  podSelector:
    matchLabels:
      app: app
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
      ports:
        - port: 3000
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: database
      ports:
        - port: 5432
```

---

## Debugging Pods

### Pod Status Meanings

| Status | Meaning | Action |
|--------|---------|--------|
| `Pending` | Waiting for scheduling | Check node resources, taints, PVC binding |
| `ContainerCreating` | Pulling image or mounting volumes | Check image name, pull secrets, PVC |
| `Running` | All containers started | Check readiness probe if not receiving traffic |
| `CrashLoopBackOff` | Container crashing repeatedly | Check logs: `kubectl logs pod --previous` |
| `ImagePullBackOff` | Cannot pull image | Check image name, registry credentials |
| `OOMKilled` | Out of memory | Increase memory limit |
| `Evicted` | Node under resource pressure | Check node resources, set resource requests |
| `Terminating` | Being deleted | Check finalizers if stuck |

### Debug Flowchart

```
Pod not running?
 |
 +-- Status: Pending
 |    +-- kubectl describe pod -> check Events
 |    +-- No nodes available? Check resources, taints, affinity
 |    +-- PVC pending? Check StorageClass, PV availability
 |
 +-- Status: CrashLoopBackOff
 |    +-- kubectl logs pod --previous
 |    +-- Exit code 1? Application error
 |    +-- Exit code 137? OOMKilled - increase memory
 |    +-- Exit code 0? Check restartPolicy
 |
 +-- Status: ImagePullBackOff
      +-- Image name correct?
      +-- Tag exists in registry?
      +-- imagePullSecrets configured?
```

### Debugging Commands

```bash
# Check why pod is pending
kubectl describe pod pod-name | grep -A 20 Events

# Check node resources
kubectl describe node node-name | grep -A 5 "Allocated resources"

# DNS debugging
kubectl run debug --image=busybox --rm -it -- nslookup service-name

# Network debugging
kubectl run debug --image=nicolaka/netshoot --rm -it -- bash

# Check if endpoint exists
kubectl get endpoints service-name

# Check resource usage
kubectl top pods
kubectl top nodes
```

---

## Resource Requests & Limits

### Guidelines

| Resource | Request | Limit |
|----------|---------|-------|
| CPU | Set to average usage | 2-5x request or no limit |
| Memory | Set to working set size | 1.5-2x request |

### CPU Units

| Value | Meaning |
|-------|---------|
| `1` | 1 vCPU core |
| `500m` | 0.5 vCPU core |
| `100m` | 0.1 vCPU core |

### Memory Units

| Value | Meaning |
|-------|---------|
| `128Mi` | 128 mebibytes |
| `1Gi` | 1 gibibyte |
| `512M` | 512 megabytes (base 10) |

---

## Service Types

| Type | Access | Use Case |
|------|--------|----------|
| `ClusterIP` | Internal only | Service-to-service communication |
| `NodePort` | External via node IP:port | Development, simple access |
| `LoadBalancer` | External via cloud LB | Production external services |
| `ExternalName` | DNS CNAME alias | Access external services |

---

## Label Selectors

```bash
# Equality-based
kubectl get pods -l app=web
kubectl get pods -l app=web,tier=frontend
kubectl get pods -l 'app!=web'

# Set-based
kubectl get pods -l 'app in (web, api)'
kubectl get pods -l 'app notin (db)'
kubectl get pods -l 'tier'
kubectl get pods -l '!tier'
```

---

## When to Use X vs Y

| Decision | Choice A | Choice B | Use A When | Use B When |
|----------|----------|----------|------------|------------|
| Workload | Deployment | StatefulSet | Stateless apps | Databases, need stable identity |
| Workload | Deployment | DaemonSet | N replicas on scheduler's choice | One pod per node (agents, logs) |
| Config | ConfigMap | Secret | Non-sensitive configuration | Passwords, keys, tokens |
| Service | ClusterIP | LoadBalancer | Internal communication | External traffic |
| Scaling | HPA | VPA | Scale horizontally (add pods) | Scale vertically (bigger pods) |
| Networking | Ingress | Service LoadBalancer | HTTP routing, multiple hosts | TCP/UDP, single service |
| Package | Helm | Kustomize | Complex apps, conditional logic | Overlays, patch-based config |

---

## Useful Aliases

```bash
alias k='kubectl'
alias kgp='kubectl get pods'
alias kgs='kubectl get svc'
alias kgd='kubectl get deployments'
alias kgi='kubectl get ingress'
alias kga='kubectl get all'
alias kdp='kubectl describe pod'
alias kl='kubectl logs'
alias klf='kubectl logs -f'
alias ke='kubectl exec -it'
alias kaf='kubectl apply -f'
alias kdf='kubectl delete -f'
alias kctx='kubectl config use-context'
alias kns='kubectl config set-context --current --namespace'
```
