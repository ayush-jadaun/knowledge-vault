---
title: Services & Ingress
description: Kubernetes networking — ClusterIP, NodePort, LoadBalancer, ExternalName services, headless services, Ingress controllers, Ingress resources, TLS termination, Gateway API, and service mesh integration.
tags:
  - kubernetes
  - services
  - ingress
  - networking
  - load-balancing
  - gateway-api
  - infrastructure
difficulty: intermediate
prerequisites:
  - infrastructure/kubernetes/architecture-internals
  - infrastructure/kubernetes/pod-lifecycle
  - Basic understanding of networking (TCP/IP, DNS, HTTP)
lastReviewed: "2026-03-17"
---

# Services & Ingress

Pods have IP addresses, but those IPs change every time a pod is recreated. You cannot give clients a pod IP and expect it to work tomorrow. Kubernetes Services provide stable networking — a fixed IP and DNS name that routes to the current set of pods. Ingress and the Gateway API provide HTTP routing, TLS termination, and path-based routing at the cluster edge.

## Services

A Service is an abstraction that defines a logical set of pods and a policy for accessing them. The set of pods is determined by a label selector.

### How Services Work Internally

```
Client (another pod)
    │
    │  HTTP request to web-app.production.svc.cluster.local:80
    │
    ▼
┌──────────────┐
│  CoreDNS     │  Resolves to ClusterIP: 10.96.42.17
└──────────────┘
    │
    ▼
┌──────────────┐
│  kube-proxy  │  Programs iptables/IPVS rules on each node
│  (iptables)  │  NATs ClusterIP → random pod IP
└──────────────┘
    │
    ├──► 10.244.1.5:3000  (pod-1)
    ├──► 10.244.2.8:3000  (pod-2)
    └──► 10.244.3.3:3000  (pod-3)
```

kube-proxy runs on every node and watches the API server for Service and Endpoint changes. It maintains iptables rules (or IPVS rules) that perform the actual load balancing.

### kube-proxy Modes

| Mode | How It Works | Pros | Cons |
|---|---|---|---|
| iptables (default) | Creates iptables rules for each Service/Endpoint pair | Simple, reliable, no userspace overhead | O(n) rule evaluation, slow with 10,000+ services |
| IPVS | Uses Linux IPVS (IP Virtual Server) kernel module | O(1) lookup, supports more LB algorithms | More complex, requires IPVS kernel modules |
| nftables (1.29+) | Uses nftables instead of iptables | Better performance than iptables, cleaner rules | Newer, less battle-tested |

### ClusterIP (Default)

ClusterIP creates an internal-only IP address. Only pods within the cluster can reach it.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-app
  namespace: production
spec:
  type: ClusterIP  # Default — can be omitted
  selector:
    app: web-app
  ports:
    - name: http
      port: 80          # Port the Service listens on
      targetPort: 3000  # Port the pods listen on
      protocol: TCP
    - name: metrics
      port: 9090
      targetPort: 9090
```

**DNS resolution:**

```
# Full DNS name
web-app.production.svc.cluster.local

# Within the same namespace
web-app

# From another namespace
web-app.production
```

**When to use:** Internal communication between services. This is what you use 90% of the time.

### NodePort

NodePort opens a specific port on every node in the cluster. Traffic to `<any-node-ip>:<node-port>` is forwarded to the Service.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-app-nodeport
spec:
  type: NodePort
  selector:
    app: web-app
  ports:
    - port: 80
      targetPort: 3000
      nodePort: 30080  # Optional: Kubernetes assigns one from 30000-32767 if omitted
```

```
External client
    │
    │  http://node-1-ip:30080
    │  http://node-2-ip:30080  (any node works)
    │  http://node-3-ip:30080
    │
    ▼
┌──────────────┐
│  kube-proxy  │  Forwards to pod via iptables
└──────────────┘
    │
    └──► pod-1:3000 or pod-2:3000 or pod-3:3000
```

**When to use:** Development, on-premises clusters without cloud load balancers, or when an external load balancer handles routing to nodes.

### LoadBalancer

LoadBalancer provisions a cloud load balancer (AWS NLB/ALB, GCP Load Balancer, Azure Load Balancer) that routes external traffic to the Service.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-app-lb
  annotations:
    # AWS-specific: use NLB instead of Classic LB
    service.beta.kubernetes.io/aws-load-balancer-type: nlb
    service.beta.kubernetes.io/aws-load-balancer-scheme: internet-facing
    service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled: "true"

    # For internal load balancer (not internet-facing)
    # service.beta.kubernetes.io/aws-load-balancer-scheme: internal
spec:
  type: LoadBalancer
  selector:
    app: web-app
  ports:
    - name: http
      port: 80
      targetPort: 3000
    - name: https
      port: 443
      targetPort: 3000

  # Preserve client source IP (default: Cluster, which NATs)
  externalTrafficPolicy: Local
```

**externalTrafficPolicy:**

```
Cluster (default):
  Traffic can land on any node and be forwarded to any pod.
  Source IP is NATted (lost).
  Even load distribution.

Local:
  Traffic only goes to pods on the node it arrived on.
  Source IP is preserved.
  Uneven load distribution if pods are not evenly spread.
  Health checks remove nodes with no local pods.
```

**When to use:** Exposing services to the internet. Each LoadBalancer Service gets its own cloud load balancer (and IP address), which can be expensive. Use Ingress instead if you have multiple HTTP services.

### ExternalName

ExternalName maps a Service to a DNS name. No proxying occurs — it creates a CNAME record.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: database
  namespace: production
spec:
  type: ExternalName
  externalName: mydb.rds.amazonaws.com
```

Pods in the `production` namespace can now connect to `database` and it resolves to `mydb.rds.amazonaws.com`. This is useful for pointing to external services (like RDS) without hardcoding the hostname in your application.

**Limitations:**
- No port remapping
- No health checking
- Does not work with IP addresses (only DNS names)
- TLS certificate validation may fail if the app checks the hostname

### Headless Services

A headless Service has `clusterIP: None`. It does not get a virtual IP. Instead, DNS queries return the IP addresses of all matching pods directly.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres-headless
spec:
  clusterIP: None
  selector:
    app: postgres
  ports:
    - port: 5432
```

```bash
# DNS lookup returns all pod IPs
$ nslookup postgres-headless.production.svc.cluster.local
Name:    postgres-headless.production.svc.cluster.local
Address: 10.244.1.5   # postgres-0
Address: 10.244.2.8   # postgres-1
Address: 10.244.3.3   # postgres-2

# Individual pod DNS (with StatefulSet)
$ nslookup postgres-0.postgres-headless.production.svc.cluster.local
Address: 10.244.1.5
```

**When to use:** StatefulSets (required), client-side load balancing, service discovery where the client needs to know all endpoints.

### Multi-Port Services

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-app
spec:
  selector:
    app: web-app
  ports:
    - name: http      # Name is required when multiple ports are defined
      port: 80
      targetPort: 3000
    - name: https
      port: 443
      targetPort: 3000
    - name: metrics
      port: 9090
      targetPort: 9090
    - name: grpc
      port: 50051
      targetPort: 50051
      appProtocol: kubernetes.io/h2c  # HTTP/2 without TLS
```

### Service Topology and Traffic Routing

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-app
spec:
  selector:
    app: web-app
  ports:
    - port: 80
      targetPort: 3000

  # Internal traffic policy (Kubernetes 1.21+)
  internalTrafficPolicy: Local
  # Cluster (default): route to any pod in the cluster
  # Local: only route to pods on the same node (reduces latency)
```

## Endpoints and EndpointSlices

Services discover pods through Endpoints (legacy) or EndpointSlices (modern, default since 1.21):

```bash
# View endpoints for a service
kubectl get endpoints web-app
# NAME      ENDPOINTS                                      AGE
# web-app   10.244.1.5:3000,10.244.2.8:3000,10.244.3.3:3000   5d

# View EndpointSlices (more detailed)
kubectl get endpointslices -l kubernetes.io/service-name=web-app
```

EndpointSlices are more scalable — each slice holds up to 100 endpoints, versus a single Endpoints object that contains all endpoints. This matters for services with thousands of pods.

### Services Without Selectors

You can create a Service that points to an external IP by manually defining Endpoints:

```yaml
# Service without selector
apiVersion: v1
kind: Service
metadata:
  name: external-database
spec:
  ports:
    - port: 5432

---
# Manual endpoints
apiVersion: v1
kind: Endpoints
metadata:
  name: external-database  # Must match Service name
subsets:
  - addresses:
      - ip: 10.0.1.50
      - ip: 10.0.2.50
    ports:
      - port: 5432
```

This is useful for integrating external services (databases, legacy systems) into the Kubernetes service mesh.

## Ingress

An Ingress is an API object that manages external HTTP/HTTPS access to Services. It provides:
- Host-based routing (different domains → different services)
- Path-based routing (different paths → different services)
- TLS termination
- Load balancing

### Ingress vs LoadBalancer Services

| Aspect | LoadBalancer Service | Ingress |
|---|---|---|
| Protocol | Any (TCP, UDP) | HTTP/HTTPS only |
| Load balancer | One per service | One for many services |
| Routing | IP:port only | Host + path based |
| TLS | Must handle in the app | Terminated at the Ingress |
| Cost | $15-25/month per LB | $15-25/month for one LB total |

For HTTP services, always use Ingress. For TCP/UDP services (databases, message queues), use LoadBalancer or NodePort.

### Ingress Controllers

An Ingress resource does nothing by itself. You need an Ingress controller — a reverse proxy that reads Ingress resources and configures itself accordingly.

| Controller | Type | Best For |
|---|---|---|
| **NGINX Ingress** | Community/F5 | General purpose, most popular |
| **Traefik** | Open source | Automatic Let's Encrypt, Docker integration |
| **HAProxy Ingress** | Open source | High performance, TCP support |
| **AWS ALB Ingress** | Cloud-native | AWS environments, WAF integration |
| **GCE Ingress** | Cloud-native | GCP environments |
| **Istio Gateway** | Service mesh | When using Istio |
| **Contour** | Open source | Envoy-based, Gateway API support |
| **Emissary** | Open source | API gateway features |

### Basic Ingress Resource

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-app
  namespace: production
  annotations:
    # NGINX-specific annotations
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx  # Which Ingress controller to use

  # Default backend (catch-all)
  defaultBackend:
    service:
      name: default-backend
      port:
        number: 80

  # TLS configuration
  tls:
    - hosts:
        - app.example.com
        - api.example.com
      secretName: tls-secret  # Contains tls.crt and tls.key

  # Routing rules
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web-frontend
                port:
                  number: 80

    - host: api.example.com
      http:
        paths:
          - path: /v1
            pathType: Prefix
            backend:
              service:
                name: api-v1
                port:
                  number: 80
          - path: /v2
            pathType: Prefix
            backend:
              service:
                name: api-v2
                port:
                  number: 80
```

### Path Types

```yaml
# Exact: matches the exact path only
- path: /api
  pathType: Exact
  # Matches: /api
  # Does NOT match: /api/, /api/users, /api/v1

# Prefix: matches the path prefix
- path: /api
  pathType: Prefix
  # Matches: /api, /api/, /api/users, /api/v1/users
  # Does NOT match: /apis, /application

# ImplementationSpecific: behavior depends on the Ingress controller
- path: /api
  pathType: ImplementationSpecific
```

### TLS Configuration

```yaml
# Create the TLS secret
# kubectl create secret tls tls-secret \
#   --cert=tls.crt \
#   --key=tls.key \
#   -n production

# Or use cert-manager for automatic certificate management
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-app
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - app.example.com
      secretName: app-tls  # cert-manager creates this automatically
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web-app
                port:
                  number: 80
```

### cert-manager Setup

```yaml
# ClusterIssuer for Let's Encrypt
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            class: nginx
      # Or DNS01 for wildcard certificates
      # - dns01:
      #     route53:
      #       region: us-east-1
      #       hostedZoneID: Z1234567890
```

### NGINX Ingress Advanced Annotations

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api
  annotations:
    # Rate limiting
    nginx.ingress.kubernetes.io/limit-rps: "10"
    nginx.ingress.kubernetes.io/limit-burst-multiplier: "3"
    nginx.ingress.kubernetes.io/limit-connections: "5"

    # Timeouts
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "10"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "60"

    # Request size
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"

    # CORS
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/cors-allow-origin: "https://app.example.com"
    nginx.ingress.kubernetes.io/cors-allow-methods: "GET, POST, PUT, DELETE, OPTIONS"
    nginx.ingress.kubernetes.io/cors-allow-headers: "Authorization, Content-Type"

    # WebSocket support
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"

    # Custom headers
    nginx.ingress.kubernetes.io/configuration-snippet: |
      more_set_headers "X-Request-ID: $req_id";
      more_set_headers "Strict-Transport-Security: max-age=31536000; includeSubDomains";

    # Canary routing
    # nginx.ingress.kubernetes.io/canary: "true"
    # nginx.ingress.kubernetes.io/canary-weight: "10"
    # nginx.ingress.kubernetes.io/canary-by-header: "X-Canary"

    # Authentication
    # nginx.ingress.kubernetes.io/auth-url: "https://auth.example.com/verify"
    # nginx.ingress.kubernetes.io/auth-signin: "https://auth.example.com/login"
spec:
  ingressClassName: nginx
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 80
```

### Canary Deployments with NGINX Ingress

```yaml
# Main Ingress (stable traffic)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-app-stable
spec:
  ingressClassName: nginx
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web-app-stable
                port:
                  number: 80

---
# Canary Ingress (10% of traffic)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-app-canary
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"
spec:
  ingressClassName: nginx
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web-app-canary
                port:
                  number: 80
```

## Gateway API

The Gateway API is the successor to Ingress. It provides a more expressive, extensible, and role-oriented API for routing traffic. It is the future of Kubernetes networking.

### Gateway API vs Ingress

| Aspect | Ingress | Gateway API |
|---|---|---|
| Status | Stable, widely adopted | GA since Kubernetes 1.28 |
| Protocol support | HTTP/HTTPS only | HTTP, HTTPS, TCP, UDP, gRPC, TLS |
| Role model | Single resource (Ingress) | Split: GatewayClass, Gateway, HTTPRoute |
| Traffic splitting | Via annotations (controller-specific) | Native weighted routing |
| Header-based routing | Via annotations (controller-specific) | Native header matching |
| Cross-namespace routing | Limited | Native with ReferenceGrant |
| Extensibility | Annotations (unstructured) | Typed policy attachment |

### Gateway API Resources

```
Infrastructure Provider     Platform Team          Application Team
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│ GatewayClass│         │   Gateway   │         │  HTTPRoute  │
│             │────────►│             │◄────────│             │
│ "Which      │         │ "How to     │         │ "Where to   │
│  controller"│         │  listen"    │         │  route"     │
└─────────────┘         └─────────────┘         └─────────────┘
```

### GatewayClass

```yaml
# Provided by the infrastructure provider (e.g., NGINX, Istio, Envoy Gateway)
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: nginx
spec:
  controllerName: gateway.nginx.org/nginx-gateway-controller
```

### Gateway

```yaml
# Managed by the platform team
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: production-gateway
  namespace: gateway-system
spec:
  gatewayClassName: nginx

  listeners:
    - name: http
      protocol: HTTP
      port: 80
      hostname: "*.example.com"
      allowedRoutes:
        namespaces:
          from: Selector
          selector:
            matchLabels:
              gateway-access: "true"

    - name: https
      protocol: HTTPS
      port: 443
      hostname: "*.example.com"
      tls:
        mode: Terminate
        certificateRefs:
          - name: wildcard-tls
            namespace: gateway-system
      allowedRoutes:
        namespaces:
          from: Selector
          selector:
            matchLabels:
              gateway-access: "true"
```

### HTTPRoute

```yaml
# Managed by application teams
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-app
  namespace: production
spec:
  parentRefs:
    - name: production-gateway
      namespace: gateway-system
      sectionName: https

  hostnames:
    - "app.example.com"

  rules:
    # Route /api/* to the API service
    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: api-service
          port: 80

    # Route everything else to the frontend
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: frontend-service
          port: 80
```

### Traffic Splitting with Gateway API

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-app-canary
  namespace: production
spec:
  parentRefs:
    - name: production-gateway
      namespace: gateway-system

  hostnames:
    - "app.example.com"

  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        # 90% to stable
        - name: web-app-stable
          port: 80
          weight: 90
        # 10% to canary
        - name: web-app-canary
          port: 80
          weight: 10
```

### Header-Based Routing

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-app-header-routing
spec:
  parentRefs:
    - name: production-gateway
      namespace: gateway-system

  hostnames:
    - "app.example.com"

  rules:
    # Route requests with X-Version: canary to canary service
    - matches:
        - headers:
            - name: X-Version
              value: canary
      backendRefs:
        - name: web-app-canary
          port: 80

    # Default route
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: web-app-stable
          port: 80
```

### GRPCRoute

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GRPCRoute
metadata:
  name: grpc-service
  namespace: production
spec:
  parentRefs:
    - name: production-gateway
      namespace: gateway-system

  hostnames:
    - "grpc.example.com"

  rules:
    - matches:
        - method:
            service: myapp.UserService
            method: GetUser
      backendRefs:
        - name: user-service
          port: 50051
    - matches:
        - method:
            service: myapp.OrderService
      backendRefs:
        - name: order-service
          port: 50051
```

### TCPRoute

```yaml
apiVersion: gateway.networking.k8s.io/v1alpha2
kind: TCPRoute
metadata:
  name: postgres-external
  namespace: production
spec:
  parentRefs:
    - name: tcp-gateway
      namespace: gateway-system

  rules:
    - backendRefs:
        - name: postgres
          port: 5432
```

## DNS and Service Discovery

### CoreDNS

CoreDNS is the DNS server in Kubernetes. It resolves Service names to ClusterIPs and pod names to pod IPs.

```
# Service DNS records
<service>.<namespace>.svc.cluster.local          → ClusterIP
<service>.<namespace>.svc.cluster.local          → Pod IPs (headless)

# Pod DNS records (when enabled)
<pod-ip-dashed>.<namespace>.pod.cluster.local    → Pod IP

# SRV records (for port discovery)
_<port-name>._<protocol>.<service>.<namespace>.svc.cluster.local
```

### DNS Debugging

```bash
# Run a DNS debug pod
kubectl run dns-debug --image=nicolaka/netshoot -it --rm -- bash

# Inside the pod:
# Resolve a service
nslookup web-app.production.svc.cluster.local

# Check DNS configuration
cat /etc/resolv.conf
# nameserver 10.96.0.10  (CoreDNS ClusterIP)
# search production.svc.cluster.local svc.cluster.local cluster.local
# options ndots:5

# Test external DNS resolution
nslookup google.com

# Trace DNS resolution
dig +trace web-app.production.svc.cluster.local
```

### ndots and DNS Performance

The default `ndots: 5` means any name with fewer than 5 dots triggers a search through all search domains before falling back to the absolute name. This causes extra DNS queries for external names:

```
Query for "api.example.com" (2 dots, < 5):
  1. api.example.com.production.svc.cluster.local  → NXDOMAIN
  2. api.example.com.svc.cluster.local             → NXDOMAIN
  3. api.example.com.cluster.local                 → NXDOMAIN
  4. api.example.com                               → RESOLVED

That is 4 DNS queries instead of 1.
```

**Fix:** Reduce ndots or use FQDNs with a trailing dot:

```yaml
spec:
  dnsConfig:
    options:
      - name: ndots
        value: "2"  # Reduce from 5 to 2
  # Or use FQDNs in your code:
  # "api.example.com."  ← trailing dot means absolute name, no search
```

## Network Debugging

```bash
# Check if a service has endpoints
kubectl get endpoints web-app -n production

# Check if pods match the service selector
kubectl get pods -l app=web-app -n production

# Test connectivity from a debug pod
kubectl run netshoot --image=nicolaka/netshoot -it --rm -- bash
curl -v http://web-app.production.svc.cluster.local
nc -zv web-app.production 80
traceroute web-app.production

# Check iptables rules (on a node)
iptables -t nat -L KUBE-SERVICES | grep web-app

# Check IPVS rules (if using IPVS mode)
ipvsadm -Ln | grep <clusterIP>
```

### Common Issues

| Symptom | Likely Cause | Diagnosis | Fix |
|---|---|---|---|
| Service unreachable | No matching endpoints | `kubectl get endpoints <svc>` shows empty | Fix selector labels |
| Intermittent timeouts | Pod not ready | Some endpoints point to unhealthy pods | Fix readiness probes |
| DNS resolution fails | CoreDNS not running | `kubectl get pods -n kube-system -l k8s-app=kube-dns` | Restart CoreDNS |
| External DNS slow | ndots:5 causing search | Look at query count in CoreDNS metrics | Reduce ndots |
| Source IP lost | externalTrafficPolicy: Cluster | Service NATs the source IP | Set externalTrafficPolicy: Local |
| WebSocket disconnects | Proxy timeout | Default proxy timeout is 60s | Increase proxy-read-timeout |
