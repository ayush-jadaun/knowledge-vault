---
title: "kubectl Advanced Cheat Sheet"
description: "Advanced kubectl patterns — JSONPath queries, custom columns, debugging, resource management, rollouts, and power-user techniques"
tags: [kubernetes, kubectl, cheat-sheet, reference, devops]
difficulty: intermediate
prerequisites: [kubernetes-basics]
lastReviewed: "2026-03-20"
---

# kubectl Advanced Cheat Sheet

Power-user reference for kubectl. Covers JSONPath queries, custom output, debugging workflows, resource management, and rollout strategies.

**Basics**: [Kubernetes Cheat Sheet](/cheat-sheets/kubernetes) | **Deep dive**: [Kubernetes Production Checklist](/infrastructure/kubernetes/production-checklist)

---

## JSONPath Queries

kubectl supports JSONPath expressions with `-o jsonpath='{...}'`.

### Syntax Basics

| Expression | Description |
|-----------|-------------|
| `{.metadata.name}` | Single field |
| `{.items[*].metadata.name}` | Array field from all items |
| `{.items[0].metadata.name}` | First item only |
| `{.items[?(@.status.phase=="Running")].metadata.name}` | Filter by condition |
| `{range .items[*]}{.metadata.name}{"\t"}{.status.phase}{"\n"}{end}` | Range loop with formatting |

### Practical Examples

```bash
# Get all pod IPs
kubectl get pods -o jsonpath='{.items[*].status.podIP}'

# Pod name and node, tab-separated
kubectl get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.nodeName}{"\n"}{end}'

# Get all container images running in a namespace
kubectl get pods -o jsonpath='{.items[*].spec.containers[*].image}' | tr ' ' '\n' | sort -u

# Get all nodes and their allocatable CPU
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.allocatable.cpu}{"\n"}{end}'

# Get pods in CrashLoopBackOff
kubectl get pods -o jsonpath='{.items[?(@.status.containerStatuses[0].state.waiting.reason=="CrashLoopBackOff")].metadata.name}'

# Get all PVCs and their bound PV names
kubectl get pvc -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.volumeName}{"\t"}{.status.phase}{"\n"}{end}'
```

---

## Custom Columns

More readable than JSONPath for tabular output.

```bash
# Basic custom columns
kubectl get pods -o custom-columns=NAME:.metadata.name,STATUS:.status.phase,IP:.status.podIP,NODE:.spec.nodeName

# With restarts count
kubectl get pods -o custom-columns=\
NAME:.metadata.name,\
READY:.status.containerStatuses[0].ready,\
RESTARTS:.status.containerStatuses[0].restartCount,\
AGE:.metadata.creationTimestamp

# Node resource summary
kubectl get nodes -o custom-columns=\
NAME:.metadata.name,\
CPU:.status.allocatable.cpu,\
MEMORY:.status.allocatable.memory,\
PODS:.status.allocatable.pods

# Service endpoints
kubectl get endpoints -o custom-columns=\
SERVICE:.metadata.name,\
ENDPOINTS:.subsets[*].addresses[*].ip
```

::: tip
Save custom column definitions to a file and reuse with `-o custom-columns-file=columns.txt`.
:::

---

## Debugging Pods

### Interactive Debug Containers

```bash
# Ephemeral debug container (K8s 1.23+)
kubectl debug -it pod-name --image=busybox --target=app-container

# Debug with full networking tools
kubectl debug -it pod-name --image=nicolaka/netshoot --target=app-container

# Debug by copying the pod (non-destructive)
kubectl debug pod-name -it --copy-to=debug-pod --container=debug --image=busybox

# Debug a node
kubectl debug node/node-name -it --image=busybox
```

### Diagnosing Pod Issues

```bash
# Full event history for a pod
kubectl describe pod pod-name | grep -A 20 Events

# Check why a pod is pending
kubectl get pod pod-name -o jsonpath='{.status.conditions[?(@.type=="PodScheduled")]}'

# Check OOMKilled
kubectl get pod pod-name -o jsonpath='{.status.containerStatuses[*].lastState.terminated.reason}'

# Get previous container logs (after crash)
kubectl logs pod-name --previous

# Get logs from all containers in a pod
kubectl logs pod-name --all-containers

# Stream logs with timestamps
kubectl logs -f pod-name --timestamps

# Get logs from the last hour
kubectl logs pod-name --since=1h

# Get logs matching a pattern
kubectl logs pod-name | grep -i error
```

### Network Debugging

```bash
# Port-forward to a pod
kubectl port-forward pod/pod-name 8080:80

# Port-forward to a service
kubectl port-forward svc/my-service 8080:80

# Port-forward to a deployment (picks a pod)
kubectl port-forward deploy/my-app 8080:80

# Check DNS resolution from inside a pod
kubectl exec -it pod-name -- nslookup my-service.default.svc.cluster.local

# Test connectivity between pods
kubectl exec -it pod-name -- wget -qO- http://other-service:8080/health

# Check network policies affecting a pod
kubectl get networkpolicy -o wide
```

---

## Resource Management

### Resource Quotas & Limits

```bash
# View resource usage per pod
kubectl top pods --sort-by=cpu
kubectl top pods --sort-by=memory

# View resource usage per node
kubectl top nodes

# View resource requests and limits
kubectl get pods -o custom-columns=\
NAME:.metadata.name,\
CPU_REQ:.spec.containers[0].resources.requests.cpu,\
CPU_LIM:.spec.containers[0].resources.limits.cpu,\
MEM_REQ:.spec.containers[0].resources.requests.memory,\
MEM_LIM:.spec.containers[0].resources.limits.memory

# Check quota usage in namespace
kubectl describe resourcequota -n my-namespace

# Check limit ranges
kubectl describe limitrange -n my-namespace
```

### Labeling & Annotations

```bash
# Add label
kubectl label pod pod-name env=production

# Overwrite existing label
kubectl label pod pod-name env=staging --overwrite

# Remove label
kubectl label pod pod-name env-

# Add label to all pods
kubectl label pods --all release=v2

# Annotate a resource
kubectl annotate deployment my-app description="Main API"

# Filter by label
kubectl get pods -l 'env in (production,staging)'
kubectl get pods -l 'app=web,version!=v1'
```

---

## Rollouts & Deployments

### Rollout Management

| Command | Description |
|---------|-------------|
| `kubectl rollout status deploy/my-app` | Watch rollout progress |
| `kubectl rollout history deploy/my-app` | View rollout history |
| `kubectl rollout history deploy/my-app --revision=3` | Details of a specific revision |
| `kubectl rollout undo deploy/my-app` | Rollback to previous revision |
| `kubectl rollout undo deploy/my-app --to-revision=2` | Rollback to specific revision |
| `kubectl rollout pause deploy/my-app` | Pause a rollout |
| `kubectl rollout resume deploy/my-app` | Resume a paused rollout |
| `kubectl rollout restart deploy/my-app` | Restart all pods (rolling) |

### Scaling

```bash
# Scale deployment
kubectl scale deploy/my-app --replicas=5

# Autoscale (HPA)
kubectl autoscale deploy/my-app --min=2 --max=10 --cpu-percent=70

# Check HPA status
kubectl get hpa

# Describe HPA for details
kubectl describe hpa my-app
```

### Canary with Labels

```bash
# Deploy canary alongside stable
kubectl set image deploy/my-app-canary app=myimg:v2

# Shift traffic by adjusting replicas
kubectl scale deploy/my-app-stable --replicas=9
kubectl scale deploy/my-app-canary --replicas=1

# Both behind same Service via shared label selector
# Service selects: app=my-app (both deployments have this label)
```

---

## Bulk Operations

```bash
# Delete all evicted pods
kubectl get pods --field-selector=status.phase=Failed -o name | xargs kubectl delete

# Delete all completed jobs
kubectl delete jobs --field-selector status.successful=1

# Restart all deployments in a namespace
kubectl rollout restart deploy -n my-namespace

# Get all images across all namespaces
kubectl get pods -A -o jsonpath='{range .items[*]}{.spec.containers[*].image}{"\n"}{end}' | sort -u

# Export all resources in a namespace (backup)
kubectl get all -n my-namespace -o yaml > namespace-backup.yaml

# Drain a node for maintenance
kubectl drain node-name --ignore-daemonsets --delete-emptydir-data

# Uncordon node after maintenance
kubectl uncordon node-name

# Cordon node (no new pods, existing stay)
kubectl cordon node-name
```

---

## Patch Operations

```bash
# Strategic merge patch (adds/merges)
kubectl patch deploy my-app -p '{"spec":{"template":{"spec":{"containers":[{"name":"app","resources":{"limits":{"memory":"512Mi"}}}]}}}}'

# JSON merge patch
kubectl patch deploy my-app --type=merge -p '{"spec":{"replicas":3}}'

# JSON patch (precise operations)
kubectl patch deploy my-app --type=json -p='[{"op":"replace","path":"/spec/replicas","value":5}]'

# Patch to add a sidecar
kubectl patch deploy my-app --type=json -p='[{"op":"add","path":"/spec/template/spec/containers/-","value":{"name":"sidecar","image":"envoyproxy/envoy:latest"}}]'
```

---

## Context & Namespace Shortcuts

```bash
# Install kubectx/kubens for fast switching
# Switch context
kubectx staging

# Switch namespace
kubens kube-system

# Create alias for frequently used namespace
alias kp='kubectl -n production'
alias ks='kubectl -n staging'

# Set default namespace for current context
kubectl config set-context --current --namespace=production
```

---

## RBAC Debugging

```bash
# Check if you can perform an action
kubectl auth can-i create deployments
kubectl auth can-i delete pods --namespace production

# Check what a service account can do
kubectl auth can-i --list --as=system:serviceaccount:default:my-sa

# Check who can perform an action
kubectl auth who-can create pods -n production

# View cluster roles
kubectl get clusterroles | grep -v system:

# View role bindings
kubectl get rolebindings -n my-namespace -o wide
```

::: warning
`kubectl auth can-i` checks RBAC permissions but does not account for admission controllers, which may still deny the request.
:::

---

## Useful Aliases

```bash
# Add to ~/.bashrc or ~/.zshrc
alias k='kubectl'
alias kgp='kubectl get pods'
alias kgs='kubectl get svc'
alias kgd='kubectl get deploy'
alias kgn='kubectl get nodes'
alias kdp='kubectl describe pod'
alias kl='kubectl logs'
alias klf='kubectl logs -f'
alias kex='kubectl exec -it'
alias kaf='kubectl apply -f'
alias kdf='kubectl delete -f'

# Completion
source <(kubectl completion bash)  # bash
source <(kubectl completion zsh)   # zsh
complete -o default -F __start_kubectl k  # alias completion
```

---

---

::: details Test Yourself
1. **What JSONPath expression filters pods in CrashLoopBackOff?**
   `{.items[?(@.status.containerStatuses[0].state.waiting.reason=="CrashLoopBackOff")].metadata.name}`

2. **How do you launch an ephemeral debug container attached to an existing pod?**
   `kubectl debug -it pod-name --image=busybox --target=app-container`

3. **What command checks if your service account can create deployments?**
   `kubectl auth can-i create deployments`

4. **How do you view resource requests and limits for all pods with custom columns?**
   `kubectl get pods -o custom-columns=NAME:.metadata.name,CPU_REQ:.spec.containers[0].resources.requests.cpu,...`

5. **What command drains a node for maintenance?**
   `kubectl drain node-name --ignore-daemonsets --delete-emptydir-data`

6. **How do you delete all evicted/failed pods in one command?**
   `kubectl get pods --field-selector=status.phase=Failed -o name | xargs kubectl delete`

7. **What patch type allows precise JSON operations like add/replace/remove?**
   `--type=json` (JSON Patch)

8. **How do you see the details of a specific rollout revision?**
   `kubectl rollout history deploy/my-app --revision=3`

9. **What command checks what the last OOMKilled reason was for a pod?**
   `kubectl get pod pod-name -o jsonpath='{.status.containerStatuses[*].lastState.terminated.reason}'`

10. **How do you make the `k` alias work with kubectl tab completion?**
    `complete -o default -F __start_kubectl k`
:::

::: danger Common Gotchas
- **`kubectl auth can-i` does not check admission controllers.** RBAC may allow an action, but a webhook admission controller can still deny it. Do not rely solely on `can-i` for security auditing.
- **`kubectl drain` without `--ignore-daemonsets` fails immediately.** DaemonSet pods cannot be evicted, so the drain command hangs. Always include this flag.
- **Strategic merge patch does not delete fields.** To remove a field, you need a JSON patch with `{"op": "remove", "path": "/spec/..."}`.
- **`kubectl delete pod` without understanding restarts.** If a Deployment manages the pod, Kubernetes immediately creates a replacement. Delete the Deployment or scale to 0 instead.
:::

## One-Liner Summary

Advanced kubectl is about JSONPath queries, ephemeral debug containers, custom columns, and bulk operations -- master these to debug and manage production Kubernetes clusters efficiently.

*Last updated: 2026-03-20*
