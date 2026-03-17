---
title: "Auth Service — Deployment"
description: "Complete deployment configuration for a production authentication service — Docker multi-stage builds, Kubernetes manifests, health checks, environment variables, TLS termination, CI/CD pipeline with GitHub Actions, and operational runbooks"
tags: [auth, deployment, docker, kubernetes, ci-cd, github-actions, health-checks, tls, production-blueprint]
difficulty: advanced
prerequisites: [production-blueprints/auth-service, production-blueprints/auth-service/architecture]
lastReviewed: "2026-03-17"
---

# Auth Service Deployment

This page covers everything needed to take the auth service from source code to production: Docker images, Kubernetes manifests, health checks, environment configuration, TLS, CI/CD pipelines, and operational procedures. Every manifest is production-ready — no placeholder values that you will forget to replace.

## Docker Setup

### Multi-Stage Dockerfile

The Dockerfile uses a multi-stage build to minimize the final image size. The build stage compiles TypeScript; the production stage contains only the runtime and compiled JavaScript.

```dockerfile
# ============================================================
# Stage 1: Dependencies
# ============================================================
FROM node:20-alpine AS deps

WORKDIR /app

# Install build dependencies for native modules (argon2)
RUN apk add --no-cache python3 make g++ gcc

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies
RUN npm ci --only=production && cp -R node_modules /prod_node_modules

# Install all dependencies (including dev for building)
RUN npm ci

# ============================================================
# Stage 2: Build
# ============================================================
FROM node:20-alpine AS build

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build TypeScript
RUN npm run build

# Run tests (fail the build if tests fail)
RUN npm run test:unit

# ============================================================
# Stage 3: Production
# ============================================================
FROM node:20-alpine AS production

# Security: don't run as root
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy production dependencies and built code
COPY --from=deps /prod_node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./

# Copy migration files
COPY --from=build /app/migrations ./migrations

# Security hardening
RUN apk add --no-cache dumb-init && \
    chown -R appuser:appgroup /app

USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Expose port
EXPOSE 3000

# Use dumb-init to handle PID 1 properly (signal forwarding)
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "--max-old-space-size=512", "--enable-source-maps", "dist/server.js"]
```

### Docker Compose (Local Development)

```yaml
# docker-compose.yml

version: '3.8'

services:
  auth-service:
    build:
      context: .
      target: production
    ports:
      - '3000:3000'
    environment:
      NODE_ENV: development
      PORT: 3000
      DATABASE_HOST: postgres
      DATABASE_PORT: 5432
      DATABASE_NAME: auth_service
      DATABASE_USER: auth_user
      DATABASE_PASSWORD: local_dev_password
      DATABASE_POOL_SIZE: 10
      DATABASE_SSL: 'false'
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_DB: 0
      JWT_PRIVATE_KEY: ${JWT_PRIVATE_KEY}
      JWT_KEY_ID: dev-key-001
      JWT_ISSUER: auth.localhost
      JWT_AUDIENCE: api.localhost
      JWT_ACCESS_TOKEN_TTL: 900
      JWT_REFRESH_TOKEN_TTL: 2592000
      MFA_ENCRYPTION_KEY: ${MFA_ENCRYPTION_KEY}
      MFA_APP_NAME: DevPlatform
      LOG_LEVEL: debug
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - auth-network

  postgres:
    image: postgres:16-alpine
    ports:
      - '5432:5432'
    environment:
      POSTGRES_DB: auth_service
      POSTGRES_USER: auth_user
      POSTGRES_PASSWORD: local_dev_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations/001_initial_schema.up.sql:/docker-entrypoint-initdb.d/001_init.sql
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U auth_user -d auth_service']
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - auth-network

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5
    volumes:
      - redis_data:/data
    networks:
      - auth-network

  # Migration runner (runs once and exits)
  migrate:
    build:
      context: .
      target: build
    command: npm run migrate:up
    environment:
      DATABASE_HOST: postgres
      DATABASE_PORT: 5432
      DATABASE_NAME: auth_service
      DATABASE_USER: auth_user
      DATABASE_PASSWORD: local_dev_password
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - auth-network

volumes:
  postgres_data:
  redis_data:

networks:
  auth-network:
    driver: bridge
```

### .dockerignore

```
node_modules
dist
.git
.github
.env
.env.*
*.md
coverage
.nyc_output
.vscode
.idea
docker-compose*.yml
Dockerfile
.dockerignore
tests
__tests__
*.test.ts
*.spec.ts
```

## Kubernetes Manifests

### Namespace

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: auth-system
  labels:
    app.kubernetes.io/part-of: platform
    app.kubernetes.io/managed-by: kubectl
```

### ConfigMap

Non-sensitive configuration values:

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: auth-service-config
  namespace: auth-system
  labels:
    app: auth-service
    app.kubernetes.io/name: auth-service
    app.kubernetes.io/component: config
data:
  NODE_ENV: "production"
  PORT: "3000"
  HOST: "0.0.0.0"
  LOG_LEVEL: "info"

  # Database (non-sensitive)
  DATABASE_HOST: "postgres-auth-primary.auth-system.svc.cluster.local"
  DATABASE_PORT: "5432"
  DATABASE_NAME: "auth_service"
  DATABASE_POOL_SIZE: "20"
  DATABASE_SSL: "true"

  # Redis (non-sensitive)
  REDIS_HOST: "redis-auth.auth-system.svc.cluster.local"
  REDIS_PORT: "6379"
  REDIS_DB: "0"

  # JWT (non-sensitive)
  JWT_ISSUER: "auth.yourplatform.com"
  JWT_AUDIENCE: "api.yourplatform.com"
  JWT_ACCESS_TOKEN_TTL: "900"
  JWT_REFRESH_TOKEN_TTL: "2592000"
  JWT_KEY_ID: "key-2026-03"

  # MFA
  MFA_APP_NAME: "YourPlatform"

  # Rate Limits
  MAX_SESSIONS_PER_USER: "5"
  ACCOUNT_LOCKOUT_THRESHOLD: "10"
  ACCOUNT_LOCKOUT_DURATION_MINUTES: "30"
```

### Secret

Sensitive configuration values. In production, these should be managed by an external secrets manager (AWS Secrets Manager, HashiCorp Vault, or sealed-secrets).

```yaml
# k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: auth-service-secrets
  namespace: auth-system
  labels:
    app: auth-service
    app.kubernetes.io/name: auth-service
    app.kubernetes.io/component: secrets
  annotations:
    # If using external-secrets-operator:
    # external-secrets.io/provider: aws-secrets-manager
    # external-secrets.io/secret-path: /production/auth-service
type: Opaque
stringData:
  DATABASE_USER: "auth_service_user"
  DATABASE_PASSWORD: "CHANGE_ME_USE_EXTERNAL_SECRETS"
  REDIS_PASSWORD: "CHANGE_ME_USE_EXTERNAL_SECRETS"
  JWT_PRIVATE_KEY: "CHANGE_ME_USE_EXTERNAL_SECRETS"
  MFA_ENCRYPTION_KEY: "CHANGE_ME_USE_EXTERNAL_SECRETS"
  SENDGRID_API_KEY: "CHANGE_ME_USE_EXTERNAL_SECRETS"
  GOOGLE_CLIENT_ID: "CHANGE_ME_USE_EXTERNAL_SECRETS"
  GOOGLE_CLIENT_SECRET: "CHANGE_ME_USE_EXTERNAL_SECRETS"
  GITHUB_CLIENT_ID: "CHANGE_ME_USE_EXTERNAL_SECRETS"
  GITHUB_CLIENT_SECRET: "CHANGE_ME_USE_EXTERNAL_SECRETS"
```

### Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
  namespace: auth-system
  labels:
    app: auth-service
    app.kubernetes.io/name: auth-service
    app.kubernetes.io/component: server
    app.kubernetes.io/version: "1.0.0"
spec:
  replicas: 3
  revisionHistoryLimit: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0     # Zero downtime deployments
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
        app.kubernetes.io/name: auth-service
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: auth-service
      terminationGracePeriodSeconds: 30
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        runAsGroup: 1001
        fsGroup: 1001
        seccompProfile:
          type: RuntimeDefault

      # Anti-affinity: spread pods across nodes
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - key: app
                      operator: In
                      values:
                        - auth-service
                topologyKey: kubernetes.io/hostname

      containers:
        - name: auth-service
          image: ghcr.io/yourorg/auth-service:1.0.0
          imagePullPolicy: IfNotPresent
          ports:
            - name: http
              containerPort: 3000
              protocol: TCP

          envFrom:
            - configMapRef:
                name: auth-service-config
            - secretRef:
                name: auth-service-secrets

          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 1000m
              memory: 512Mi

          # Liveness: is the process healthy?
          livenessProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 10
            periodSeconds: 15
            timeoutSeconds: 5
            failureThreshold: 3

          # Readiness: is the process ready to serve traffic?
          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3

          # Startup: for slow-starting containers
          startupProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 12  # 60 seconds max startup time

          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL

          volumeMounts:
            - name: tmp
              mountPath: /tmp

      volumes:
        - name: tmp
          emptyDir: {}

      imagePullSecrets:
        - name: ghcr-pull-secret
```

### Service

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: auth-service
  namespace: auth-system
  labels:
    app: auth-service
    app.kubernetes.io/name: auth-service
    app.kubernetes.io/component: service
spec:
  type: ClusterIP
  ports:
    - name: http
      port: 80
      targetPort: http
      protocol: TCP
  selector:
    app: auth-service
```

### Ingress

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: auth-service
  namespace: auth-system
  labels:
    app: auth-service
  annotations:
    # TLS
    cert-manager.io/cluster-issuer: letsencrypt-prod

    # nginx ingress controller settings
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"

    # Rate limiting at ingress level
    nginx.ingress.kubernetes.io/limit-rps: "50"
    nginx.ingress.kubernetes.io/limit-burst-multiplier: "5"

    # Security headers
    nginx.ingress.kubernetes.io/configuration-snippet: |
      more_set_headers "X-Frame-Options: DENY";
      more_set_headers "X-Content-Type-Options: nosniff";
      more_set_headers "X-XSS-Protection: 1; mode=block";
      more_set_headers "Referrer-Policy: strict-origin-when-cross-origin";
      more_set_headers "Permissions-Policy: camera=(), microphone=(), geolocation=()";
      more_set_headers "Strict-Transport-Security: max-age=31536000; includeSubDomains; preload";

    # Request body size limit
    nginx.ingress.kubernetes.io/proxy-body-size: "1m"

    # Timeouts
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "5"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "10"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "10"

    # CORS (if needed — typically handled at application level)
    # nginx.ingress.kubernetes.io/enable-cors: "true"
    # nginx.ingress.kubernetes.io/cors-allow-origin: "https://app.yourplatform.com"

spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - auth.yourplatform.com
      secretName: auth-service-tls
  rules:
    - host: auth.yourplatform.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: auth-service
                port:
                  name: http
```

### Horizontal Pod Autoscaler

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: auth-service
  namespace: auth-system
  labels:
    app: auth-service
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: auth-service
  minReplicas: 3
  maxReplicas: 20
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
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "100"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 2
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Pods
          value: 1
          periodSeconds: 120
```

### Pod Disruption Budget

```yaml
# k8s/pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: auth-service
  namespace: auth-system
  labels:
    app: auth-service
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: auth-service
```

### ServiceAccount and RBAC

```yaml
# k8s/rbac.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: auth-service
  namespace: auth-system
  labels:
    app: auth-service

---
# NetworkPolicy: restrict egress to only required services
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: auth-service-netpol
  namespace: auth-system
spec:
  podSelector:
    matchLabels:
      app: auth-service
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
      ports:
        - protocol: TCP
          port: 3000
  egress:
    # PostgreSQL
    - to:
        - podSelector:
            matchLabels:
              app: postgres-auth
      ports:
        - protocol: TCP
          port: 5432
    # Redis
    - to:
        - podSelector:
            matchLabels:
              app: redis-auth
      ports:
        - protocol: TCP
          port: 6379
    # DNS
    - to: []
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
    # HTTPS (for OAuth providers, HIBP API, SendGrid)
    - to: []
      ports:
        - protocol: TCP
          port: 443
```

## Health Check Endpoints

The service exposes three health check endpoints, each with a different purpose:

```typescript
// src/api/routes/health.routes.ts

import { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { Pool } from 'pg';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  const pgPool = fastify.diContainer.resolve<Pool>('pgPool');
  const redis = fastify.diContainer.resolve<Redis>('redis');

  // Liveness: Is the process alive?
  // Should only fail if the process is truly broken (deadlock, OOM)
  fastify.get('/health/live', async (_request, reply) => {
    reply.code(200).send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Readiness: Can the process serve requests?
  // Checks all critical dependencies
  fastify.get('/health/ready', async (_request, reply) => {
    const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

    // PostgreSQL check
    const pgStart = performance.now();
    try {
      await pgPool.query('SELECT 1');
      checks.postgresql = {
        status: 'healthy',
        latencyMs: Math.round(performance.now() - pgStart),
      };
    } catch (error: any) {
      checks.postgresql = {
        status: 'unhealthy',
        latencyMs: Math.round(performance.now() - pgStart),
        error: error.message,
      };
    }

    // Redis check
    const redisStart = performance.now();
    try {
      await redis.ping();
      checks.redis = {
        status: 'healthy',
        latencyMs: Math.round(performance.now() - redisStart),
      };
    } catch (error: any) {
      checks.redis = {
        status: 'unhealthy',
        latencyMs: Math.round(performance.now() - redisStart),
        error: error.message,
      };
    }

    const allHealthy = Object.values(checks).every(c => c.status === 'healthy');
    const statusCode = allHealthy ? 200 : 503;

    reply.code(statusCode).send({
      status: allHealthy ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  // Startup: Has the process finished initialization?
  // Same as readiness, but only checked during startup
  fastify.get('/health/startup', async (_request, reply) => {
    // Verify JWT keys are loaded
    const tokenService = fastify.diContainer.resolve('tokenService');
    const keysLoaded = tokenService.isInitialized();

    if (!keysLoaded) {
      reply.code(503).send({
        status: 'starting',
        message: 'JWT signing keys not yet loaded',
      });
      return;
    }

    reply.code(200).send({ status: 'started' });
  });

  // Metrics endpoint for Prometheus
  fastify.get('/metrics', async (_request, reply) => {
    const metrics = await fastify.diContainer.resolve('metricsCollector').getMetrics();
    reply.header('Content-Type', 'text/plain; version=0.0.4').send(metrics);
  });
}
```

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/auth-service.yml

name: Auth Service CI/CD

on:
  push:
    branches: [main]
    paths:
      - 'services/auth/**'
      - '.github/workflows/auth-service.yml'
  pull_request:
    branches: [main]
    paths:
      - 'services/auth/**'

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${​{ github.repository }​}/auth-service
  K8S_NAMESPACE: auth-system

jobs:
  # --------------------------------------------------------
  # Lint and Type Check
  # --------------------------------------------------------
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: services/auth
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: services/auth/package-lock.json

      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  # --------------------------------------------------------
  # Unit Tests
  # --------------------------------------------------------
  test-unit:
    name: Unit Tests
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: services/auth
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: services/auth/package-lock.json

      - run: npm ci
      - run: npm run test:unit -- --coverage

      - uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: services/auth/coverage/

  # --------------------------------------------------------
  # Integration Tests
  # --------------------------------------------------------
  test-integration:
    name: Integration Tests
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: services/auth
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: auth_test
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_password
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: services/auth/package-lock.json

      - run: npm ci
      - run: npm run migrate:up
        env:
          DATABASE_HOST: localhost
          DATABASE_PORT: 5432
          DATABASE_NAME: auth_test
          DATABASE_USER: test_user
          DATABASE_PASSWORD: test_password

      - run: npm run test:integration
        env:
          DATABASE_HOST: localhost
          DATABASE_PORT: 5432
          DATABASE_NAME: auth_test
          DATABASE_USER: test_user
          DATABASE_PASSWORD: test_password
          REDIS_HOST: localhost
          REDIS_PORT: 6379
          JWT_PRIVATE_KEY: ${​{ secrets.TEST_JWT_PRIVATE_KEY }​}
          JWT_KEY_ID: test-key-001
          MFA_ENCRYPTION_KEY: ${​{ secrets.TEST_MFA_KEY }​}

  # --------------------------------------------------------
  # Security Scan
  # --------------------------------------------------------
  security:
    name: Security Scan
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: services/auth
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: services/auth/package-lock.json

      - run: npm ci
      - run: npm audit --audit-level=high
      - uses: aquasecurity/trivy-action@master
        with:
          scan-type: fs
          scan-ref: services/auth
          severity: HIGH,CRITICAL

  # --------------------------------------------------------
  # Build and Push Docker Image
  # --------------------------------------------------------
  build:
    name: Build & Push Image
    needs: [lint, test-unit, test-integration, security]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image-tag: ${​{ steps.meta.outputs.tags }​}
      image-digest: ${​{ steps.build-push.outputs.digest }​}
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ${​{ env.REGISTRY }​}
          username: ${​{ github.actor }​}
          password: ${​{ secrets.GITHUB_TOKEN }​}

      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${​{ env.REGISTRY }​}/${​{ env.IMAGE_NAME }​}
          tags: |
            type=sha,prefix=
            type=ref,event=branch
            type=semver,pattern={​{version}​}

      - id: build-push
        uses: docker/build-push-action@v5
        with:
          context: services/auth
          push: true
          tags: ${​{ steps.meta.outputs.tags }​}
          labels: ${​{ steps.meta.outputs.labels }​}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          platforms: linux/amd64,linux/arm64

  # --------------------------------------------------------
  # Deploy to Staging
  # --------------------------------------------------------
  deploy-staging:
    name: Deploy to Staging
    needs: [build]
    runs-on: ubuntu-latest
    environment:
      name: staging
      url: https://auth.staging.yourplatform.com
    steps:
      - uses: actions/checkout@v4

      - uses: azure/setup-kubectl@v3

      - uses: azure/k8s-set-context@v3
        with:
          kubeconfig: ${​{ secrets.STAGING_KUBECONFIG }​}

      - name: Deploy to staging
        run: |
          cd services/auth/k8s
          kubectl apply -f namespace.yaml
          kubectl apply -f configmap.yaml
          kubectl apply -f secret.yaml
          kubectl set image deployment/auth-service \
            auth-service=${​{ env.REGISTRY }​}/${​{ env.IMAGE_NAME }​}@${​{ needs.build.outputs.image-digest }​} \
            -n ${​{ env.K8S_NAMESPACE }​}
          kubectl rollout status deployment/auth-service \
            -n ${​{ env.K8S_NAMESPACE }​} \
            --timeout=300s

      - name: Run smoke tests
        run: |
          npm run test:smoke -- --base-url=https://auth.staging.yourplatform.com

  # --------------------------------------------------------
  # Deploy to Production
  # --------------------------------------------------------
  deploy-production:
    name: Deploy to Production
    needs: [deploy-staging]
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://auth.yourplatform.com
    steps:
      - uses: actions/checkout@v4

      - uses: azure/setup-kubectl@v3

      - uses: azure/k8s-set-context@v3
        with:
          kubeconfig: ${​{ secrets.PRODUCTION_KUBECONFIG }​}

      - name: Deploy to production
        run: |
          cd services/auth/k8s
          kubectl set image deployment/auth-service \
            auth-service=${​{ env.REGISTRY }​}/${​{ env.IMAGE_NAME }​}@${​{ needs.build.outputs.image-digest }​} \
            -n ${​{ env.K8S_NAMESPACE }​}
          kubectl rollout status deployment/auth-service \
            -n ${​{ env.K8S_NAMESPACE }​} \
            --timeout=300s

      - name: Verify deployment
        run: |
          # Check health endpoint
          for i in {1..10}; do
            status=$(curl -s -o /dev/null -w "%{http_code}" https://auth.yourplatform.com/health/ready)
            if [ "$status" = "200" ]; then
              echo "Health check passed"
              exit 0
            fi
            echo "Attempt $i: status $status, retrying..."
            sleep 5
          done
          echo "Health check failed after 10 attempts"
          exit 1

      - name: Rollback on failure
        if: failure()
        run: |
          kubectl rollout undo deployment/auth-service -n ${​{ env.K8S_NAMESPACE }​}
          kubectl rollout status deployment/auth-service \
            -n ${​{ env.K8S_NAMESPACE }​} \
            --timeout=300s
```

## Database Migration Pipeline

Migrations run as a Kubernetes Job before the application deployment:

```yaml
# k8s/migration-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: auth-service-migrate
  namespace: auth-system
  labels:
    app: auth-service
    component: migration
spec:
  backoffLimit: 3
  activeDeadlineSeconds: 120
  ttlSecondsAfterFinished: 300
  template:
    spec:
      serviceAccountName: auth-service
      restartPolicy: OnFailure
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
      containers:
        - name: migrate
          image: ghcr.io/yourorg/auth-service:latest
          command: ["node", "dist/migrate.js", "up"]
          envFrom:
            - configMapRef:
                name: auth-service-config
            - secretRef:
                name: auth-service-secrets
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi
```

## Graceful Shutdown

The application handles SIGTERM properly to ensure zero-downtime deployments:

```typescript
// src/server.ts

import Fastify from 'fastify';
import { createAppContainer } from './infrastructure/container';

async function main() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty' }
        : undefined,
    },
    trustProxy: true,
    requestTimeout: 10000,
    bodyLimit: 1048576, // 1 MB
  });

  const container = createAppContainer();
  fastify.decorate('diContainer', container);

  // Register routes
  await fastify.register(import('./api/routes/auth.routes'));
  await fastify.register(import('./api/routes/health.routes'));

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}. Starting graceful shutdown...`);

    // Stop accepting new connections
    await fastify.close();

    // Close database pool
    const pgPool = container.resolve('pgPool');
    await pgPool.end();

    // Close Redis
    const redis = container.resolve('redis');
    await redis.quit();

    fastify.log.info('Graceful shutdown complete.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('unhandledRejection', (reason) => {
    fastify.log.fatal({ reason }, 'Unhandled promise rejection');
    process.exit(1);
  });

  process.on('uncaughtException', (error) => {
    fastify.log.fatal({ error }, 'Uncaught exception');
    process.exit(1);
  });

  // Start server
  try {
    const host = process.env.HOST || '0.0.0.0';
    const port = parseInt(process.env.PORT || '3000', 10);
    await fastify.listen({ host, port });
  } catch (error) {
    fastify.log.fatal(error);
    process.exit(1);
  }
}

main();
```

## Environment Variable Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | Runtime environment |
| `PORT` | No | `3000` | HTTP port |
| `HOST` | No | `0.0.0.0` | Bind address |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `DATABASE_HOST` | Yes | — | PostgreSQL host |
| `DATABASE_PORT` | No | `5432` | PostgreSQL port |
| `DATABASE_NAME` | Yes | — | Database name |
| `DATABASE_USER` | Yes | — | Database user |
| `DATABASE_PASSWORD` | Yes | — | Database password |
| `DATABASE_POOL_SIZE` | No | `20` | Max connections |
| `DATABASE_SSL` | No | `true` | Enable SSL |
| `REDIS_HOST` | Yes | — | Redis host |
| `REDIS_PORT` | No | `6379` | Redis port |
| `REDIS_PASSWORD` | No | — | Redis password |
| `REDIS_DB` | No | `0` | Redis database index |
| `JWT_PRIVATE_KEY` | Yes | — | RSA private key (PEM) |
| `JWT_KEY_ID` | Yes | — | Key ID for JWKS |
| `JWT_ISSUER` | No | `auth.yourplatform.com` | JWT issuer claim |
| `JWT_AUDIENCE` | No | `api.yourplatform.com` | JWT audience claim |
| `JWT_ACCESS_TOKEN_TTL` | No | `900` | Access token lifetime (seconds) |
| `JWT_REFRESH_TOKEN_TTL` | No | `2592000` | Refresh token lifetime (seconds) |
| `MFA_ENCRYPTION_KEY` | Yes | — | AES-256 key (hex) |
| `MFA_APP_NAME` | No | `YourPlatform` | TOTP issuer name |
| `SENDGRID_API_KEY` | No | — | SendGrid API key |
| `EMAIL_FROM` | No | `noreply@yourplatform.com` | Sender email |

---

> *"A deployment pipeline is not just automation — it is your safety net. If you cannot roll back in under 60 seconds, your deployment process is not production-ready."*
