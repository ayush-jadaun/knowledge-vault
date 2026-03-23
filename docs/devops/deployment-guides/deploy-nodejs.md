---
title: "Deploy Node.js to Production"
description: "Complete guide to deploying Node.js applications to production — Docker containerization, health checks, deployment to AWS ECS, GCP Cloud Run, Railway, Fly.io, and Render, PM2 vs Docker vs Kubernetes, environment variables, secrets management, logging, and monitoring setup"
tags: [deployment, nodejs, docker, cloud-run, production]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-20"
---

# Deploy Node.js to Production

Deploying a Node.js application to production is not `node server.js` on a VPS. A production deployment must handle process management, graceful shutdowns, health checks, logging, secret management, horizontal scaling, and zero-downtime updates. This page covers the complete deployment lifecycle — from building a Docker image to running it on every major platform — with production-tested configurations and operational checklists.

## Docker Containerization

Docker is the universal deployment artifact for Node.js. Regardless of which platform you deploy to, you build a Docker image first.

### Production Dockerfile

```dockerfile
# syntax=docker/dockerfile:1

# ---- Base ----
FROM node:20-alpine AS base
WORKDIR /app

# Security: run as non-root user
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

# ---- Dependencies ----
FROM base AS deps
# Copy only package files for better layer caching
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && \
    pnpm install --frozen-lockfile --prod

# ---- Build ----
FROM base AS build
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && \
    pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# ---- Production ----
FROM base AS production
ENV NODE_ENV=production

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
# Copy built application
COPY --from=build /app/dist ./dist
COPY package.json ./

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start
CMD ["node", "dist/server.js"]
```

### Multi-Stage Build Breakdown

```mermaid
graph TD
    BASE["base<br/>node:20-alpine<br/>(~50MB)"] --> DEPS["deps<br/>Install prod dependencies"]
    BASE --> BUILD["build<br/>Install all deps + compile"]

    DEPS --> PROD["production<br/>Final image (~80MB)"]
    BUILD --> PROD

    subgraph Layers["Final Image Contains"]
        L1["Alpine Linux base"]
        L2["Node.js runtime"]
        L3["Production node_modules only"]
        L4["Compiled application (dist/)"]
    end

    PROD --> Layers

    style BASE fill:#4f46e5,color:#fff
    style PROD fill:#059669,color:#fff
```

### .dockerignore

```
node_modules
npm-debug.log
.git
.gitignore
.env
.env.*
Dockerfile
docker-compose*.yml
.dockerignore
README.md
docs/
tests/
coverage/
.nyc_output/
.vscode/
.idea/
```

::: warning Never Include node_modules
Never copy `node_modules` from the host into the container. Dependencies must be installed inside the container to match the container's OS and architecture (Alpine Linux, not macOS/Windows).
:::

### Docker Compose for Local Development

```yaml
# docker-compose.yml
services:
  app:
    build:
      context: .
      target: production
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://postgres:password@db:5432/myapp
      - REDIS_URL=redis://cache:6379
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: myapp
      POSTGRES_PASSWORD: password
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 5

  cache:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  pgdata:
```

## Health Checks

Every production Node.js application needs health check endpoints. Load balancers, container orchestrators, and platform health systems all rely on them.

```typescript
// src/health.ts
import type { FastifyInstance } from 'fastify';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: Record<string, {
    status: 'pass' | 'fail';
    latency_ms: number;
    message?: string;
  }>;
}

export async function healthRoutes(app: FastifyInstance) {
  // Liveness probe — is the process running?
  app.get('/health/live', async () => {
    return { status: 'ok' };
  });

  // Readiness probe — can the process handle requests?
  app.get('/health/ready', async (request, reply) => {
    const checks: HealthStatus['checks'] = {};

    // Check database
    const dbStart = Date.now();
    try {
      await app.db.query('SELECT 1');
      checks.database = { status: 'pass', latency_ms: Date.now() - dbStart };
    } catch (err) {
      checks.database = {
        status: 'fail',
        latency_ms: Date.now() - dbStart,
        message: err.message,
      };
    }

    // Check Redis
    const redisStart = Date.now();
    try {
      await app.redis.ping();
      checks.redis = { status: 'pass', latency_ms: Date.now() - redisStart };
    } catch (err) {
      checks.redis = {
        status: 'fail',
        latency_ms: Date.now() - redisStart,
        message: err.message,
      };
    }

    const allPassing = Object.values(checks).every(c => c.status === 'pass');

    const health: HealthStatus = {
      status: allPassing ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks,
    };

    reply.code(allPassing ? 200 : 503).send(health);
  });
}
```

### Health Check Configuration by Platform

| Platform | Liveness | Readiness | Configuration |
|----------|----------|-----------|---------------|
| Docker | `HEALTHCHECK` in Dockerfile | Same | Dockerfile instruction |
| Kubernetes | `livenessProbe` | `readinessProbe` | Pod spec |
| Cloud Run | Automatic (TCP) | Startup probe | Service config |
| ECS | ALB health check | Container health check | Task definition |
| Railway | Automatic | `/health` endpoint | Service settings |

## Graceful Shutdown

When a container is stopped, it receives `SIGTERM`. The process must stop accepting new connections, finish in-flight requests, close database connections, and exit cleanly.

```typescript
// src/server.ts
import Fastify from 'fastify';

const app = Fastify({ logger: true });

// Register routes, plugins, etc.
await app.register(healthRoutes);
await app.register(databasePlugin);
await app.register(apiRoutes);

// Start server
await app.listen({ port: 3000, host: '0.0.0.0' });

// Graceful shutdown
async function shutdown(signal: string) {
  app.log.info(`Received ${signal}. Starting graceful shutdown...`);

  // Stop accepting new connections and finish in-flight requests
  // Fastify's close() handles this automatically
  try {
    await app.close();
    app.log.info('Server closed. Exiting.');
    process.exit(0);
  } catch (err) {
    app.log.error(err, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Prevent unhandled rejections from crashing silently
process.on('unhandledRejection', (err) => {
  app.log.error(err, 'Unhandled rejection');
  process.exit(1);
});
```

::: danger Always Bind to 0.0.0.0
`app.listen({ port: 3000 })` binds to `127.0.0.1` by default — this works on your machine but is unreachable inside a Docker container. Always specify `host: '0.0.0.0'` to bind to all interfaces.
:::

## Deploy to GCP Cloud Run

Cloud Run is a serverless container platform. You push a Docker image, Cloud Run runs it, and scales from zero to thousands of instances based on traffic.

```bash
# Authenticate and set project
gcloud auth login
gcloud config set project my-project-id

# Build and push image to Google Container Registry
gcloud builds submit --tag gcr.io/my-project-id/myapp

# Deploy to Cloud Run
gcloud run deploy myapp \
  --image gcr.io/my-project-id/myapp \
  --platform managed \
  --region us-central1 \
  --port 3000 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 80 \
  --timeout 30s \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "DATABASE_URL=db-url:latest,JWT_SECRET=jwt-secret:latest" \
  --allow-unauthenticated
```

### Cloud Run Architecture

```mermaid
graph LR
    USER["User Request"] --> LB["Google Load Balancer<br/>(automatic HTTPS)"]
    LB --> CR["Cloud Run Service"]

    subgraph CR["Cloud Run"]
        I1["Instance 1"]
        I2["Instance 2"]
        I3["Instance N"]
    end

    CR --> DB["Cloud SQL<br/>(PostgreSQL)"]
    CR --> REDIS["Memorystore<br/>(Redis)"]

    style LB fill:#4f46e5,color:#fff
    style CR fill:#059669,color:#fff
```

### Cloud Run Configuration

```yaml
# service.yaml — declarative Cloud Run configuration
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: myapp
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "0"
        autoscaling.knative.dev/maxScale: "10"
        run.googleapis.com/cpu-throttling: "false"
    spec:
      containerConcurrency: 80
      timeoutSeconds: 30
      containers:
        - image: gcr.io/my-project-id/myapp
          ports:
            - containerPort: 3000
          resources:
            limits:
              memory: 512Mi
              cpu: "1"
          env:
            - name: NODE_ENV
              value: production
          startupProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 3
```

## Deploy to AWS ECS Fargate

ECS Fargate runs containers without managing servers. You define a task (container spec) and a service (how many tasks to run).

```json
{
  "family": "myapp",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::123456789:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "myapp",
      "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/myapp:latest",
      "portMappings": [
        { "containerPort": 3000, "protocol": "tcp" }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "wget -q --spider http://localhost:3000/health/live || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 15
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/myapp",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:myapp/DATABASE_URL"
        }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "3000" }
      ]
    }
  ]
}
```

## Deploy to Railway

Railway is the simplest platform for fullstack deployments. It auto-detects Node.js, builds from your Dockerfile (or uses Nixpacks), and provides managed databases.

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link
railway login
railway link

# Deploy
railway up

# Add a PostgreSQL database
railway add --plugin postgresql

# Set environment variables
railway variables set JWT_SECRET=your-secret-key
```

Railway detects your `Dockerfile` automatically. If no Dockerfile exists, it uses Nixpacks to build from source.

### Railway Configuration

```toml
# railway.toml
[build]
  builder = "DOCKERFILE"
  dockerfilePath = "Dockerfile"

[deploy]
  healthcheckPath = "/health/live"
  healthcheckTimeout = 30
  restartPolicyType = "ON_FAILURE"
  restartPolicyMaxRetries = 5
```

## Deploy to Fly.io

Fly.io runs containers on edge servers worldwide. Deploy once, run in multiple regions.

```bash
# Install and authenticate
curl -L https://fly.io/install.sh | sh
fly auth login

# Initialize (creates fly.toml)
fly launch

# Deploy
fly deploy

# Scale to multiple regions
fly regions add lax ord ams
fly scale count 3
```

```toml
# fly.toml
app = "myapp"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1

[[services]]
  protocol = "tcp"
  internal_port = 3000

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [[services.http_checks]]
    interval = 15000
    grace_period = "10s"
    method = "get"
    path = "/health/live"
    protocol = "http"
    timeout = 5000
```

## Deploy to Render

Render provides managed infrastructure with a Git-push deployment workflow.

```yaml
# render.yaml (Infrastructure as Code)
services:
  - type: web
    name: myapp
    runtime: docker
    dockerfilePath: ./Dockerfile
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: mydb
          property: connectionString
    healthCheckPath: /health/live
    autoDeploy: true

databases:
  - name: mydb
    databaseName: myapp
    plan: starter
```

## PM2 vs Docker vs Kubernetes

| Feature | PM2 | Docker (single host) | Kubernetes |
|---------|-----|---------------------|------------|
| Process management | Built-in | Docker restart policy | Pod restart policy |
| Clustering | `pm2 start -i max` | Docker Compose replicas | Deployment replicas |
| Zero-downtime deploy | `pm2 reload` | Rolling update | Rolling update |
| Resource limits | OS-level (ulimit) | Container-level | Pod-level (requests/limits) |
| Monitoring | `pm2 monit` | Docker stats | Prometheus + Grafana |
| Complexity | Low | Medium | High |
| Best for | Single VPS | Small to medium | Large scale |

::: tip PM2 Inside Docker?
Do not run PM2 inside Docker. Docker is already your process manager — if the process crashes, Docker restarts the container. PM2 adds unnecessary complexity. Use PM2 only when deploying directly to a VPS without Docker.
:::

## Environment Variables and Secrets

### Never Do This

```bash
# NEVER hardcode secrets
const JWT_SECRET = 'my-super-secret-key';  // hardcoded

# NEVER commit .env files
git add .env  # this exposes secrets in git history forever
```

### Secret Management by Platform

| Platform | Secret Storage | How to Use |
|----------|---------------|-----------|
| **Cloud Run** | GCP Secret Manager | `--set-secrets` flag |
| **ECS** | AWS Secrets Manager / Parameter Store | Task definition `secrets` |
| **Railway** | Built-in variable management | Dashboard or CLI |
| **Fly.io** | `fly secrets set` | Encrypted, injected as env vars |
| **Render** | Dashboard environment groups | Per-service or shared |
| **Kubernetes** | Kubernetes Secrets (+ external-secrets-operator) | Volume mount or env |

```bash
# Example: GCP Secret Manager
echo -n "postgres://user:pass@host/db" | \
  gcloud secrets create db-url --data-file=-

# Reference in Cloud Run deployment
gcloud run deploy myapp --set-secrets "DATABASE_URL=db-url:latest"
```

## Logging Setup

Production Node.js applications must output structured JSON logs to stdout. Every platform collects stdout and routes it to a log aggregation service.

```typescript
import pino from 'pino';

// Production logger configuration
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // In production, output JSON. In dev, use pino-pretty.
  ...(process.env.NODE_ENV === 'production'
    ? {}
    : { transport: { target: 'pino-pretty' } }),
  // Add standard fields
  base: {
    service: 'myapp',
    version: process.env.APP_VERSION || 'unknown',
    environment: process.env.NODE_ENV,
  },
});

// Structured logging
logger.info({ userId: '123', action: 'login' }, 'User logged in');
// {"level":30,"time":1616000000,"service":"myapp","userId":"123","action":"login","msg":"User logged in"}

logger.error({ err, requestId: req.id }, 'Failed to process payment');
// {"level":50,"time":1616000000,"service":"myapp","err":{"type":"PaymentError","message":"...","stack":"..."},"requestId":"abc","msg":"Failed to process payment"}
```

### Log Routing by Platform

```mermaid
graph LR
    APP["Node.js<br/>(stdout JSON)"] --> DOCKER["Container Runtime"]

    DOCKER -->|"Cloud Run"| STACKDRIVER["Cloud Logging<br/>(Stackdriver)"]
    DOCKER -->|"ECS"| CLOUDWATCH["CloudWatch Logs"]
    DOCKER -->|"Railway"| RAILWAY_LOGS["Railway Logs<br/>(built-in)"]
    DOCKER -->|"Fly.io"| FLY_LOGS["fly logs<br/>(built-in)"]
    DOCKER -->|"Self-hosted"| ELK["ELK Stack or<br/>Loki + Grafana"]

    style APP fill:#4f46e5,color:#fff
```

## Monitoring Setup

### Key Metrics to Track

| Metric | Why It Matters | Alert Threshold |
|--------|---------------|-----------------|
| Response time (p95) | User experience | > 500ms |
| Error rate (5xx) | Application health | > 1% |
| CPU utilization | Capacity planning | > 80% sustained |
| Memory utilization | Memory leaks | > 85% |
| Event loop lag | Node.js health | > 100ms |
| Active connections | Load tracking | > 80% of max |

### Prometheus Metrics Example

```typescript
import { collectDefaultMetrics, Counter, Histogram, register } from 'prom-client';

// Collect default Node.js metrics (memory, CPU, event loop)
collectDefaultMetrics();

// Custom metrics
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

// Middleware to track metrics
app.addHook('onResponse', (request, reply, done) => {
  const duration = reply.elapsedTime / 1000; // convert to seconds
  const labels = {
    method: request.method,
    route: request.routeOptions?.url || 'unknown',
    status_code: reply.statusCode.toString(),
  };

  httpRequestDuration.observe(labels, duration);
  httpRequestTotal.inc(labels);
  done();
});

// Expose metrics endpoint
app.get('/metrics', async (request, reply) => {
  reply.header('Content-Type', register.contentType);
  return register.metrics();
});
```

## Production Checklist

Before deploying to production, verify every item:

- [ ] **Docker image builds successfully** — `docker build -t myapp .`
- [ ] **Image runs locally** — `docker run -p 3000:3000 myapp`
- [ ] **Health check endpoint responds** — `curl http://localhost:3000/health/live`
- [ ] **Graceful shutdown works** — `docker stop` exits cleanly within 10s
- [ ] **No hardcoded secrets** — all secrets via environment variables
- [ ] **Structured JSON logging** — `pino` or equivalent writing to stdout
- [ ] **Non-root user** — container runs as non-root (UID 1001+)
- [ ] **Resource limits set** — memory and CPU limits configured
- [ ] **CI/CD pipeline configured** — automated test + deploy on merge to main
- [ ] **Rollback plan documented** — know how to revert to previous version

## Cross-References

- [Node.js Internals](/infrastructure/languages/nodejs-internals) — event loop, V8, and cluster module
- [Fastify Deep Dive](/infrastructure/languages/fastify-deep-dive) — production Fastify configuration
- [Deploy Next.js](/devops/deployment-guides/deploy-nextjs) — Next.js-specific deployment
- [Deployment Strategies](/devops/deployment-strategies/) — blue-green, canary, rolling updates
- [Monitoring](/devops/monitoring/) — observability setup
- [Disaster Recovery](/devops/disaster-recovery/) — backup and restore procedures

## Summary

| Step | Action |
|------|--------|
| 1. Containerize | Multi-stage Dockerfile with non-root user |
| 2. Health checks | `/health/live` (liveness) + `/health/ready` (readiness) |
| 3. Graceful shutdown | Handle `SIGTERM`, close connections, finish in-flight requests |
| 4. Choose platform | Cloud Run (serverless), Railway (simple), ECS (enterprise) |
| 5. Secrets management | Platform secret manager, never in code or git |
| 6. Logging | Structured JSON to stdout, platform collects automatically |
| 7. Monitoring | Prometheus metrics + dashboards + alerts |
| 8. CI/CD | Automated test and deploy pipeline |
| 9. Rollback plan | Know how to revert to previous version in < 5 minutes |
