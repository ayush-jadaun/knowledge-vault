---
title: "NGINX Load Balancer Configuration"
description: "Complete production NGINX load balancer configuration guide — upstream blocks, health checks, SSL/TLS termination, rate limiting, caching, WebSocket proxying, HTTP/2, performance tuning, and real-world configuration templates"
tags: [load-balancing, nginx, reverse-proxy, ssl, rate-limiting, caching, websocket, http2, configuration]
difficulty: intermediate
prerequisites: [load-balancing, l4-vs-l7, health-checks]
lastReviewed: "2026-03-17"
---

# NGINX Load Balancer Configuration

NGINX is the world's most deployed reverse proxy and load balancer. Over 30% of all websites use NGINX (or a derivative) as their entry point. It excels as a combined web server, reverse proxy, load balancer, and TLS terminator. This page provides complete, production-ready configurations for every major NGINX load balancing feature — not toy examples with `proxy_pass` to localhost, but real configurations you can adapt to production systems.

All configurations in this page are for **NGINX open-source** (not NGINX Plus) unless explicitly noted. NGINX Plus adds active health checks, session persistence, JWT authentication, and other enterprise features. Most critical capabilities are available in open-source NGINX or through third-party modules.

## NGINX Architecture Overview

Before configuring NGINX as a load balancer, you need to understand its architecture because many tuning decisions depend on it.

```
                          ┌─────────────────────────┐
                          │     Master Process      │
                          │  (reads config, manages │
                          │   workers, binds ports) │
                          └────────┬────────────────┘
                ┌──────────────────┼──────────────────┐
                ▼                  ▼                  ▼
         ┌────────────┐   ┌────────────┐   ┌────────────┐
         │  Worker 1  │   │  Worker 2  │   │  Worker N  │
         │  (single   │   │  (single   │   │  (single   │
         │   thread,  │   │   thread,  │   │   thread,  │
         │   event    │   │   event    │   │   event    │
         │   loop)    │   │   loop)    │   │   loop)    │
         └────────────┘   └────────────┘   └────────────┘
```

- **Master process:** Reads configuration, binds to ports, spawns workers. Runs as root (to bind to ports 80/443), then drops privileges.
- **Worker processes:** Handle all client connections. Each worker is single-threaded with an event loop (epoll on Linux, kqueue on BSD). One worker can handle thousands of concurrent connections.
- **Recommendation:** Set `worker_processes auto;` to match the number of CPU cores.

## Complete Production Configuration

Here is a complete, annotated NGINX configuration for a production load balancer:

### Main Context (`nginx.conf`)

```nginx
# === Main Context ===
# Controls worker processes, error logging, and file limits

# One worker per CPU core (auto-detects core count)
worker_processes auto;

# Bind each worker to a specific CPU core (optional, reduces context switching)
# worker_cpu_affinity auto;

# Maximum number of open file descriptors per worker
# Each connection uses at least 2 fds (client + backend)
# Formula: worker_connections * 2 + some buffer
worker_rlimit_nofile 65535;

# PID file location
pid /var/run/nginx.pid;

# Error log — warn level in production (debug/info too verbose)
error_log /var/log/nginx/error.log warn;

# === Events Context ===
events {
    # Maximum simultaneous connections per worker
    # Total max connections = worker_processes * worker_connections
    # For 4 cores: 4 * 16384 = 65536 connections
    worker_connections 16384;

    # Use the most efficient connection processing method
    # epoll on Linux (default on modern NGINX)
    use epoll;

    # Accept as many connections as possible at once
    # Reduces the number of system calls per accept cycle
    multi_accept on;
}

# === HTTP Context ===
http {
    # --- Basic Settings ---
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # Use sendfile for static file serving (zero-copy from disk to socket)
    sendfile on;

    # Send HTTP response headers and the beginning of a file in one packet
    tcp_nopush on;

    # Disable Nagle's algorithm — send small packets immediately
    # Critical for proxying where we want low latency
    tcp_nodelay on;

    # Keep-alive connections to clients
    keepalive_timeout 65;

    # Maximum number of requests per keep-alive connection
    keepalive_requests 1000;

    # Hide NGINX version from response headers (security)
    server_tokens off;

    # Client request limits
    client_max_body_size 50m;          # Max upload size
    client_body_buffer_size 128k;       # Buffer for request body
    client_header_buffer_size 4k;       # Buffer for request headers
    large_client_header_buffers 4 16k;  # Large headers (cookies, tokens)

    # --- Logging ---
    # Structured JSON access log for parsing by log aggregation tools
    log_format json_combined escape=json
        '{'
            '"time_local":"$time_iso8601",'
            '"remote_addr":"$remote_addr",'
            '"request":"$request",'
            '"status":$status,'
            '"body_bytes_sent":$body_bytes_sent,'
            '"request_time":$request_time,'
            '"upstream_response_time":"$upstream_response_time",'
            '"upstream_addr":"$upstream_addr",'
            '"http_referer":"$http_referer",'
            '"http_user_agent":"$http_user_agent",'
            '"request_id":"$request_id"'
        '}';

    access_log /var/log/nginx/access.log json_combined buffer=64k flush=5s;

    # --- Compression ---
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 4;            # 4 is the sweet spot (good compression, low CPU)
    gzip_min_length 1000;         # Don't compress tiny responses
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml
        application/xml+rss
        application/wasm
        image/svg+xml;

    # --- Security Headers ---
    # Applied to all responses
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # --- Request ID ---
    # Generate unique request ID for distributed tracing
    # Uses the client's X-Request-ID if provided, otherwise generates one
    map $http_x_request_id $request_id {
        default   $http_x_request_id;
        ""        $request_id;
    }

    # --- Include additional configs ---
    include /etc/nginx/conf.d/*.conf;
}
```

### Upstream Configuration

```nginx
# === Upstream Blocks ===
# Define backend server pools

# --- API Backend Pool ---
upstream api_backends {
    # Load balancing algorithm
    # Options: (default round-robin), least_conn, ip_hash, hash
    least_conn;

    # Keep-alive connections to backends (critical for performance)
    # NGINX maintains a pool of persistent connections to each backend
    # This avoids the overhead of TCP handshake + TLS for every request
    keepalive 64;              # Keep 64 idle connections per worker
    keepalive_requests 1000;   # Max requests per keepalive connection
    keepalive_timeout 60s;     # Close idle connections after 60 seconds

    # Backend servers with health check parameters
    # max_fails: consecutive failures before marking server as unavailable
    # fail_timeout: duration to mark server unavailable after max_fails
    #              AND the window for counting failures
    server 10.0.1.1:8080 weight=5 max_fails=3 fail_timeout=30s;
    server 10.0.1.2:8080 weight=5 max_fails=3 fail_timeout=30s;
    server 10.0.1.3:8080 weight=3 max_fails=3 fail_timeout=30s;

    # Backup server — only receives traffic when all primary servers are down
    server 10.0.1.4:8080 backup;

    # Mark a server as permanently unavailable (for maintenance)
    # server 10.0.1.5:8080 down;
}

# --- WebSocket Backend Pool ---
upstream websocket_backends {
    # IP hash for WebSocket connections (same client → same server)
    ip_hash;

    server 10.0.2.1:3000 max_fails=2 fail_timeout=10s;
    server 10.0.2.2:3000 max_fails=2 fail_timeout=10s;
    server 10.0.2.3:3000 max_fails=2 fail_timeout=10s;
}

# --- Static Assets Backend Pool ---
upstream static_backends {
    server 10.0.3.1:8080;
    server 10.0.3.2:8080;

    keepalive 32;
}

# --- gRPC Backend Pool ---
upstream grpc_backends {
    # Round-robin for gRPC (NGINX handles HTTP/2 per-stream)
    server 10.0.4.1:50051;
    server 10.0.4.2:50051;
    server 10.0.4.3:50051;

    keepalive 64;
}
```

### Server Block: HTTPS with Full Load Balancing

```nginx
# === Redirect HTTP to HTTPS ===
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    # ACME challenge for Let's Encrypt
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redirect all other HTTP requests to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

# === Main HTTPS Server ===
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.example.com;

    # --- TLS Configuration ---
    # Modern TLS configuration (TLS 1.2 and 1.3 only)
    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;  # Let client choose (modern best practice)

    # TLS session resumption (reduces handshake overhead for returning clients)
    ssl_session_cache shared:SSL:10m;   # 10MB shared cache (~40,000 sessions)
    ssl_session_timeout 1d;              # Sessions valid for 1 day
    ssl_session_tickets off;             # Disable session tickets (forward secrecy)

    # OCSP stapling (verify certificate without contacting CA)
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/nginx/ssl/chain.pem;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    # HSTS — force HTTPS for 2 years, include subdomains, preload
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # --- Rate Limiting ---
    # Define rate limit zones (in http context, but shown here for clarity)
    # limit_req_zone $binary_remote_addr zone=api_rate:10m rate=100r/s;
    # limit_req_zone $binary_remote_addr zone=login_rate:10m rate=5r/s;

    # --- API Proxying ---
    location /api/ {
        # Rate limiting
        limit_req zone=api_rate burst=200 nodelay;
        limit_req_status 429;

        # Proxy to API backend pool
        proxy_pass http://api_backends;

        # --- Proxy Headers ---
        # Forward original client information to backends
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;

        # Keep-alive to backends (must match upstream keepalive)
        proxy_http_version 1.1;
        proxy_set_header Connection "";

        # --- Timeouts ---
        proxy_connect_timeout 5s;    # Time to establish connection to backend
        proxy_send_timeout 30s;      # Time to send request body to backend
        proxy_read_timeout 60s;      # Time to receive response from backend

        # --- Buffering ---
        proxy_buffering on;
        proxy_buffer_size 4k;           # Buffer for response headers
        proxy_buffers 8 16k;            # Buffers for response body
        proxy_busy_buffers_size 32k;    # Max size while sending to client

        # --- Error Handling ---
        # Retry on specific errors (safe for idempotent requests)
        proxy_next_upstream error timeout http_502 http_503 http_504;
        proxy_next_upstream_tries 2;     # Max retry attempts
        proxy_next_upstream_timeout 10s; # Total time for retries
    }

    # --- Login with stricter rate limiting ---
    location /api/auth/login {
        limit_req zone=login_rate burst=10 nodelay;
        limit_req_status 429;

        proxy_pass http://api_backends;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    # --- WebSocket Proxying ---
    location /ws {
        proxy_pass http://websocket_backends;

        # WebSocket requires HTTP/1.1 and the Upgrade headers
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # WebSocket connections are long-lived — increase timeouts
        proxy_read_timeout 3600s;    # 1 hour
        proxy_send_timeout 3600s;
    }

    # --- gRPC Proxying ---
    location /grpc/ {
        # gRPC requires grpc_pass (not proxy_pass)
        grpc_pass grpc://grpc_backends;

        # gRPC timeouts
        grpc_read_timeout 60s;
        grpc_send_timeout 60s;

        # Error handling — retry on connection errors
        error_page 502 = /error502grpc;
    }

    # gRPC error handling
    location = /error502grpc {
        internal;
        default_type application/grpc;
        add_header grpc-status 14;    # UNAVAILABLE
        add_header grpc-message "Backend unavailable";
        return 204;
    }

    # --- Static Assets with Caching ---
    location /static/ {
        proxy_pass http://static_backends;

        # Cache static assets at the NGINX level
        proxy_cache static_cache;
        proxy_cache_valid 200 1h;          # Cache 200 responses for 1 hour
        proxy_cache_valid 404 5m;          # Cache 404 responses for 5 minutes
        proxy_cache_use_stale error timeout updating;  # Serve stale on error
        proxy_cache_lock on;               # Only one request populates cache
        proxy_cache_lock_timeout 5s;

        # Add cache status header for debugging
        add_header X-Cache-Status $upstream_cache_status;

        # Browser caching
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # --- Health Check Endpoint (local, not proxied) ---
    location /nginx-health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # --- Stub Status for Monitoring ---
    location /nginx_status {
        stub_status;
        allow 10.0.0.0/8;       # Only internal network
        allow 172.16.0.0/12;
        deny all;
    }

    # --- Default: 404 ---
    location / {
        return 404 '{"error": "not_found"}';
        add_header Content-Type application/json;
    }
}
```

### Cache Configuration

```nginx
# In http context — define proxy cache zones
proxy_cache_path /var/cache/nginx/static
    levels=1:2
    keys_zone=static_cache:10m      # 10MB for keys (can store ~80,000 keys)
    max_size=1g                      # Max disk usage: 1GB
    inactive=60m                     # Remove entries not accessed for 60 minutes
    use_temp_path=off;               # Write directly to cache dir (faster)
```

### Rate Limiting Configuration

```nginx
# In http context — define rate limit zones
# $binary_remote_addr uses 4 bytes (IPv4) or 16 bytes (IPv6) per entry
# 10m zone = ~160,000 IPv4 addresses

# General API rate limit: 100 requests/second per client IP
limit_req_zone $binary_remote_addr zone=api_rate:10m rate=100r/s;

# Login rate limit: 5 requests/second per client IP
limit_req_zone $binary_remote_addr zone=login_rate:10m rate=5r/s;

# Rate limit by API key (from header)
map $http_x_api_key $api_key {
    default $http_x_api_key;
    ""      $binary_remote_addr;
}
limit_req_zone $api_key zone=api_key_rate:20m rate=1000r/s;

# Custom error response for rate-limited requests
limit_req_status 429;
```

## L4 (Stream) Load Balancing

NGINX can also operate as a Layer 4 load balancer using the `stream` module. This is useful for TCP/UDP protocols (databases, message queues, custom protocols).

```nginx
# In main context (same level as http)
stream {
    # --- Logging for stream connections ---
    log_format stream_log '$remote_addr [$time_local] '
                          '$protocol $status $bytes_sent $bytes_received '
                          '$session_time "$upstream_addr" '
                          '"$upstream_bytes_sent" "$upstream_bytes_received"'
                          '"$upstream_connect_time"';

    access_log /var/log/nginx/stream.log stream_log buffer=32k flush=5s;

    # --- PostgreSQL Load Balancing ---
    upstream postgresql_backends {
        least_conn;
        server 10.0.5.1:5432 max_fails=2 fail_timeout=30s;
        server 10.0.5.2:5432 max_fails=2 fail_timeout=30s;
        server 10.0.5.3:5432 max_fails=2 fail_timeout=30s;
    }

    server {
        listen 5432;
        proxy_pass postgresql_backends;
        proxy_connect_timeout 5s;
        proxy_timeout 3600s;           # Long timeout for DB connections
    }

    # --- Redis Load Balancing ---
    upstream redis_backends {
        # Hash by client IP — same client always hits same Redis
        hash $remote_addr consistent;
        server 10.0.6.1:6379;
        server 10.0.6.2:6379;
        server 10.0.6.3:6379;
    }

    server {
        listen 6379;
        proxy_pass redis_backends;
        proxy_connect_timeout 2s;
        proxy_timeout 300s;
    }

    # --- TLS Passthrough (SNI-based routing) ---
    # Route based on TLS SNI without terminating TLS
    map $ssl_preread_server_name $backend_pool {
        api.example.com     api_tls_backends;
        admin.example.com   admin_tls_backends;
        default             api_tls_backends;
    }

    upstream api_tls_backends {
        server 10.0.7.1:443;
        server 10.0.7.2:443;
    }

    upstream admin_tls_backends {
        server 10.0.8.1:443;
        server 10.0.8.2:443;
    }

    server {
        listen 443;
        ssl_preread on;                    # Read SNI without decrypting
        proxy_pass $backend_pool;
        proxy_connect_timeout 5s;
    }
}
```

## Performance Tuning

### Connection Limits and Backlog

```nginx
# Worker connections: each proxied request uses 2 connections
# (1 client-to-NGINX + 1 NGINX-to-backend)
# So 16384 worker_connections = ~8192 concurrent proxied requests per worker
events {
    worker_connections 16384;
}

# Increase the listen backlog (pending connections queue)
server {
    listen 443 ssl http2 backlog=4096;
    # Default is 511 — increase for high-traffic servers
}
```

**Linux kernel tuning** (equally important):

```bash
# /etc/sysctl.conf

# Increase maximum number of open files
fs.file-max = 1000000

# Increase TCP connection backlog
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535

# Increase the range of ephemeral ports
net.ipv4.ip_local_port_range = 1024 65535

# Enable TCP reuse for TIME_WAIT connections
net.ipv4.tcp_tw_reuse = 1

# Reduce TIME_WAIT duration
net.ipv4.tcp_fin_timeout = 15

# Increase socket buffer sizes
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
```

### Upstream Keep-Alive Tuning

Keep-alive connections to backends are one of the most impactful performance settings. Without them, NGINX establishes a new TCP connection (and potentially TLS handshake) for every request to a backend.

```
Without keepalive:
  Request 1: TCP handshake (1ms) → TLS handshake (5ms) → Request (50ms) = 56ms
  Request 2: TCP handshake (1ms) → TLS handshake (5ms) → Request (50ms) = 56ms
  Total: 112ms

With keepalive:
  Request 1: TCP handshake (1ms) → TLS handshake (5ms) → Request (50ms) = 56ms
  Request 2: Reuse connection → Request (50ms) = 50ms
  Total: 106ms (saves 6ms per subsequent request)
```

For high-throughput services, the savings add up enormously. At 10,000 requests/second, saving 6ms of TCP+TLS per request saves 60 seconds of connection establishment overhead per second.

```nginx
upstream api_backends {
    server 10.0.1.1:8080;
    server 10.0.1.2:8080;

    # Keep 128 idle connections per worker to each upstream group
    keepalive 128;

    # Max requests per keepalive connection before closing
    # Set high to maximize reuse, but not infinite (connection hygiene)
    keepalive_requests 10000;

    # Close idle keepalive connections after this duration
    keepalive_timeout 60s;
}

location /api/ {
    proxy_pass http://api_backends;

    # CRITICAL: must be HTTP/1.1 for keepalive (HTTP/1.0 uses Connection: close)
    proxy_http_version 1.1;

    # CRITICAL: clear Connection header (so it doesn't send "Connection: close")
    proxy_set_header Connection "";
}
```

## Graceful Reload (Zero-Downtime Config Updates)

NGINX supports graceful configuration reloading without dropping any connections:

```bash
# Test configuration syntax before reloading
nginx -t

# Graceful reload — zero-downtime
nginx -s reload
```

What happens during reload:
1. Master process reads new configuration and validates it
2. Master spawns new worker processes with the new configuration
3. New workers start accepting new connections
4. Master signals old workers to stop accepting new connections
5. Old workers finish processing in-flight requests
6. Old workers exit after all connections close (or after `worker_shutdown_timeout`)

```nginx
# Maximum time to wait for old workers to finish
# Set this to slightly longer than your longest expected request
worker_shutdown_timeout 60s;
```

## Monitoring and Observability

### Stub Status Module

```nginx
location /nginx_status {
    stub_status;
    allow 10.0.0.0/8;
    deny all;
}
```

Output:

```
Active connections: 291
server accepts handled requests
 16630948 16630948 31070465
Reading: 6 Writing: 179 Waiting: 106
```

- **Active connections:** Currently open connections (client + backend)
- **accepts:** Total accepted connections
- **handled:** Total handled connections (should equal accepts; if less, worker_connections limit was hit)
- **requests:** Total HTTP requests (higher than connections due to keepalive)
- **Reading:** Connections where NGINX is reading the request
- **Writing:** Connections where NGINX is sending a response
- **Waiting:** Idle keepalive connections

### Prometheus Integration

Use the `nginx-prometheus-exporter` or `nginx-vts-module` for Prometheus metrics:

```bash
# nginx-prometheus-exporter (external process)
nginx-prometheus-exporter -nginx.scrape-uri=http://127.0.0.1/nginx_status

# Exposes metrics at :9113/metrics:
# nginx_connections_active
# nginx_connections_reading
# nginx_connections_writing
# nginx_connections_waiting
# nginx_http_requests_total
# nginx_up
```

### Upstream Response Time Logging

The JSON log format defined earlier includes `$upstream_response_time`, which records the time between NGINX connecting to the backend and receiving the complete response. This is essential for identifying slow backends.

```
# Parse logs to find slow requests
# jq is your best friend for JSON logs
cat /var/log/nginx/access.log | \
  jq -r 'select(.upstream_response_time | tonumber > 1.0) | [.time_local, .request, .upstream_response_time, .upstream_addr] | @tsv'
```

## Common Pitfalls

### 1. Forgetting `proxy_http_version 1.1` for Keep-Alive

```nginx
# WRONG — defaults to HTTP/1.0, which closes connection after each request
location /api/ {
    proxy_pass http://api_backends;
}

# CORRECT — HTTP/1.1 enables keepalive to backends
location /api/ {
    proxy_pass http://api_backends;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
}
```

### 2. DNS Caching for Upstream Hostnames

When using hostnames in upstream blocks, NGINX resolves them at startup and caches the IPs forever. It does NOT re-resolve on DNS TTL expiry.

```nginx
# PROBLEM: DNS resolved once at startup, never again
upstream api {
    server api-service.internal:8080;
}

# SOLUTION: Use a variable to force re-resolution
# (requires the resolver directive)
resolver 10.0.0.2 valid=30s;

server {
    location /api/ {
        set $backend "api-service.internal:8080";
        proxy_pass http://$backend;
    }
}
```

### 3. Not Setting `proxy_next_upstream` Carefully

```nginx
# DANGEROUS for non-idempotent requests (POST, PUT, DELETE)
proxy_next_upstream error timeout http_502 http_503 http_504;

# SAFE — only retry on connection errors, not after response started
proxy_next_upstream error timeout;
proxy_next_upstream_tries 2;

# BEST — disable retry for non-idempotent methods
location /api/ {
    proxy_pass http://api_backends;

    # Only retry GET and HEAD
    if ($request_method !~ ^(GET|HEAD)$) {
        proxy_next_upstream off;
    }
}
```

### 4. Not Limiting the Number of Connections to Backends

Without limits, NGINX can overwhelm backends by opening too many connections during traffic spikes:

```nginx
upstream api_backends {
    server 10.0.1.1:8080 max_conns=200;   # Max 200 connections to this server
    server 10.0.1.2:8080 max_conns=200;

    # Queue requests when max_conns is reached (NGINX Plus only)
    # queue 100 timeout=30s;

    keepalive 64;
}
```

### 5. WebSocket Timeout

WebSocket connections are idle most of the time (waiting for messages). The default `proxy_read_timeout` of 60 seconds will close idle WebSocket connections:

```nginx
location /ws {
    proxy_pass http://websocket_backends;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";

    # WebSocket-appropriate timeouts
    proxy_read_timeout 86400s;   # 24 hours (or configure ping/pong)
    proxy_send_timeout 86400s;
}
```

A better approach is to use WebSocket ping/pong frames to keep the connection alive and use a shorter timeout (e.g., 300 seconds). If no ping/pong is received within 300 seconds, the connection is probably dead.

## Quick Reference: NGINX Directives for Load Balancing

| Directive | Context | Purpose | Default |
|-----------|---------|---------|---------|
| `upstream` | http, stream | Define backend server pool | — |
| `server` (in upstream) | upstream | Define a backend server | — |
| `weight` | upstream server | Relative traffic share | 1 |
| `max_fails` | upstream server | Failures before marking down | 1 |
| `fail_timeout` | upstream server | Down duration + failure window | 10s |
| `max_conns` | upstream server | Max connections to server | 0 (unlimited) |
| `backup` | upstream server | Only used when primaries are down | — |
| `down` | upstream server | Permanently mark as unavailable | — |
| `keepalive` | upstream | Idle keepalive connections per worker | — (disabled) |
| `least_conn` | upstream | Use least-connections algorithm | — |
| `ip_hash` | upstream | Use IP-based affinity | — |
| `hash` | upstream | Use custom key hash | — |
| `proxy_pass` | location | Forward requests to upstream | — |
| `proxy_next_upstream` | location | Retry conditions | error timeout |
| `proxy_connect_timeout` | location | Backend connection timeout | 60s |
| `proxy_read_timeout` | location | Backend response timeout | 60s |
| `proxy_send_timeout` | location | Backend request send timeout | 60s |
