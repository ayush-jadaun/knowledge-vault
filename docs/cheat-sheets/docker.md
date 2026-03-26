---
title: "Docker Cheat Sheet"
description: "Quick reference for Docker commands, Dockerfile patterns, Compose, and debugging"
tags: [cheat-sheet, docker, containers]
difficulty: "intermediate"
lastReviewed: "2026-03-18"
---

# Docker Cheat Sheet

Quick reference for Docker commands, Dockerfile best practices, Docker Compose patterns, and container debugging.

**Deep dive**: [Docker Section](/infrastructure/docker/) | [Docker Security](/infrastructure/docker/security-hardening)

---

## Container Lifecycle

| Command | Description |
|---------|-------------|
| `docker run -d --name app img` | Run container in background |
| `docker run -it img /bin/sh` | Run container interactively |
| `docker run --rm img` | Run and auto-remove on exit |
| `docker run -p 8080:3000 img` | Map host port 8080 to container 3000 |
| `docker run -v /host:/cont img` | Bind mount host directory |
| `docker run --env-file .env img` | Load environment variables from file |
| `docker start container` | Start a stopped container |
| `docker stop container` | Graceful stop (SIGTERM, then SIGKILL) |
| `docker kill container` | Immediate stop (SIGKILL) |
| `docker restart container` | Stop and start |
| `docker rm container` | Remove stopped container |
| `docker rm -f container` | Force remove running container |

## Image Management

| Command | Description |
|---------|-------------|
| `docker build -t name:tag .` | Build image from Dockerfile |
| `docker build -f Dockerfile.prod .` | Build from specific Dockerfile |
| `docker build --no-cache .` | Build without layer cache |
| `docker images` | List local images |
| `docker image prune` | Remove dangling images |
| `docker image prune -a` | Remove all unused images |
| `docker tag img:v1 registry/img:v1` | Tag image for registry |
| `docker push registry/img:v1` | Push to registry |
| `docker pull img:tag` | Pull from registry |
| `docker save img > img.tar` | Export image to tarball |
| `docker load < img.tar` | Import image from tarball |
| `docker history img` | Show image layer history |

## Container Inspection

| Command | Description |
|---------|-------------|
| `docker ps` | List running containers |
| `docker ps -a` | List all containers |
| `docker logs container` | View container logs |
| `docker logs -f container` | Follow container logs |
| `docker logs --tail 100 container` | Last 100 log lines |
| `docker inspect container` | Full container JSON metadata |
| `docker stats` | Live resource usage |
| `docker top container` | Running processes in container |
| `docker diff container` | Filesystem changes since start |
| `docker port container` | Port mappings |

## Exec & Copy

| Command | Description |
|---------|-------------|
| `docker exec -it container sh` | Shell into running container |
| `docker exec container cmd` | Run command in container |
| `docker cp container:/path ./local` | Copy from container to host |
| `docker cp ./local container:/path` | Copy from host to container |

---

## Dockerfile Patterns

### Production Node.js Dockerfile

```dockerfile
# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Stage 2: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup -g 1001 -S app && \
    adduser -S app -u 1001
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER app
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### Production Go Dockerfile

```dockerfile
FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /server ./cmd/server

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
```

### Key Dockerfile Instructions

| Instruction | Purpose | Example |
|-------------|---------|---------|
| `FROM` | Base image | `FROM node:20-alpine` |
| `WORKDIR` | Set working directory | `WORKDIR /app` |
| `COPY` | Copy files (respects .dockerignore) | `COPY . .` |
| `ADD` | Copy + extract archives + URLs | `ADD app.tar.gz /app` |
| `RUN` | Execute command during build | `RUN npm ci` |
| `CMD` | Default command (overridable) | `CMD ["node", "app.js"]` |
| `ENTRYPOINT` | Fixed command (args appended) | `ENTRYPOINT ["/server"]` |
| `ENV` | Set environment variable | `ENV NODE_ENV=production` |
| `ARG` | Build-time variable | `ARG VERSION=latest` |
| `EXPOSE` | Document port (does not publish) | `EXPOSE 3000` |
| `VOLUME` | Create mount point | `VOLUME /data` |
| `USER` | Set runtime user | `USER app` |
| `HEALTHCHECK` | Container health check | See below |

### Healthcheck

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
```

---

## Layer Optimization

**Order matters** -- put rarely-changing layers first:

```dockerfile
# 1. System deps (rarely change)
RUN apk add --no-cache curl

# 2. App deps (change sometimes)
COPY package.json package-lock.json ./
RUN npm ci

# 3. App code (changes often)
COPY . .
RUN npm run build
```

**Reduce layers** -- combine related RUN commands:

```dockerfile
# Bad: 3 layers
RUN apt-get update
RUN apt-get install -y curl
RUN rm -rf /var/lib/apt/lists/*

# Good: 1 layer
RUN apt-get update && \
    apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/*
```

---

## Docker Compose

### Basic Compose File

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://user:pass@db:5432/mydb
      - REDIS_URL=redis://cache:6379
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
    volumes:
      - .:/app
      - /app/node_modules

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: mydb
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
      interval: 5s
      timeout: 5s
      retries: 5

  cache:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

### Compose Commands

| Command | Description |
|---------|-------------|
| `docker compose up` | Start all services |
| `docker compose up -d` | Start in background |
| `docker compose up --build` | Rebuild and start |
| `docker compose down` | Stop and remove |
| `docker compose down -v` | Stop, remove, and delete volumes |
| `docker compose logs -f app` | Follow logs for one service |
| `docker compose exec app sh` | Shell into service |
| `docker compose ps` | List service status |
| `docker compose restart app` | Restart one service |
| `docker compose pull` | Pull latest images |
| `docker compose config` | Validate and view merged config |

---

## Networking

| Command | Description |
|---------|-------------|
| `docker network ls` | List networks |
| `docker network create mynet` | Create network |
| `docker network inspect mynet` | Inspect network details |
| `docker network connect mynet container` | Connect container to network |
| `docker network disconnect mynet container` | Disconnect from network |

### Network Types

| Type | Use Case |
|------|----------|
| `bridge` | Default. Containers on same host communicate via DNS |
| `host` | Container shares host network. No port mapping needed |
| `none` | No networking. Complete isolation |
| `overlay` | Multi-host networking (Swarm) |

---

## Volumes

| Command | Description |
|---------|-------------|
| `docker volume ls` | List volumes |
| `docker volume create myvol` | Create named volume |
| `docker volume inspect myvol` | Volume details |
| `docker volume rm myvol` | Delete volume |
| `docker volume prune` | Remove unused volumes |

### Volume Types

```bash
# Named volume (Docker manages storage)
docker run -v myvol:/data img

# Bind mount (host path)
docker run -v /host/path:/container/path img

# tmpfs mount (in-memory, Linux only)
docker run --tmpfs /tmp img

# Read-only mount
docker run -v /host/path:/data:ro img
```

---

## Debugging Containers

### Container Will Not Start

```bash
# Check logs
docker logs container

# Inspect exit code
docker inspect container --format='Exit: .State.ExitCode'

# Run interactively to debug
docker run -it --entrypoint sh img

# Check resource limits
docker stats container
```

### Container Is Slow

```bash
# Check resource usage
docker stats container

# Check process list
docker top container

# Profile with strace (if available)
docker exec container strace -p 1 -c
```

### Networking Issues

```bash
# Check container IP
docker inspect container | grep '"IPAddress"'

# Test DNS resolution
docker exec container nslookup other-service

# Test connectivity
docker exec container wget -qO- http://other-service:3000/health

# Check port bindings
docker port container
```

### Disk Space Issues

```bash
# Check Docker disk usage
docker system df

# Detailed breakdown
docker system df -v

# Clean everything unused
docker system prune -a --volumes
```

---

## Security Quick Reference

| Practice | Command / Pattern |
|----------|------------------|
| Run as non-root | `USER 1001` in Dockerfile |
| Read-only filesystem | `docker run --read-only img` |
| Drop capabilities | `docker run --cap-drop ALL img` |
| No new privileges | `docker run --security-opt no-new-privileges img` |
| Resource limits | `docker run -m 512m --cpus 1 img` |
| Scan for vulnerabilities | `docker scout cves img` |
| Use minimal base image | `FROM alpine` or `FROM scratch` |
| Pin image digests | `FROM node@sha256:abc123...` |

---

## When to Use X vs Y

| Decision | Choice A | Choice B | Use A When | Use B When |
|----------|----------|----------|------------|------------|
| Base image | `alpine` | `debian-slim` | Size matters, no glibc deps | Need glibc, broad package support |
| Base image | `node:alpine` | `scratch` | Need runtime (Node, Python) | Compiled binary (Go, Rust) |
| Mount type | Named volume | Bind mount | Persistent data (DB, uploads) | Development hot-reload |
| CMD format | Exec form `["cmd"]` | Shell form `cmd` | Production (signal handling) | Need shell expansion |
| Multi-stage | Yes | No | Production images | Simple dev Dockerfiles |
| Compose | Yes | No | Multi-container local dev | Single container, CI/CD |

---

## .dockerignore Template

```
node_modules
.git
.gitignore
.env*
*.md
dist
coverage
.vscode
.idea
docker-compose*.yml
Dockerfile*
.dockerignore
```

---

::: details Test Yourself
1. **What flag auto-removes a container when it exits?**
   `docker run --rm`

2. **How do you map host port 8080 to container port 3000?**
   `docker run -p 8080:3000 img`

3. **What command shows live resource usage of running containers?**
   `docker stats`

4. **How do you build an image without using the layer cache?**
   `docker build --no-cache .`

5. **What command gets a shell into an already-running container?**
   `docker exec -it container sh`

6. **What Dockerfile instruction sets the default command that can be overridden at runtime?**
   `CMD`

7. **How do you stop and remove all containers, networks, and volumes created by Compose?**
   `docker compose down -v`

8. **What command scans an image for known vulnerabilities?**
   `docker scout cves img`

9. **How do you copy a file from a container to the host?**
   `docker cp container:/path ./local`

10. **What is the purpose of `EXPOSE` in a Dockerfile?**
    It documents the port the container listens on but does NOT actually publish it.
:::

::: danger Common Gotchas
- **Running as root inside containers.** Always add a `USER` instruction in production Dockerfiles -- running as root means a container escape grants root on the host.
- **Using `latest` tag in production.** The `latest` tag is mutable and can change without warning. Pin image versions or use digests (`node@sha256:...`).
- **Forgetting `.dockerignore`.** Without it, `COPY . .` sends your entire directory (including `node_modules`, `.git`, `.env`) to the build context, bloating images and leaking secrets.
- **Putting `COPY . .` before `RUN npm install`.** This busts the dependency cache on every code change. Copy `package.json` and lock file first, install, then copy the rest.
:::

## One-Liner Summary

Docker packages your app and its dependencies into an isolated, portable container that runs the same everywhere -- master the Dockerfile layer cache and multi-stage builds to keep images small and builds fast.
