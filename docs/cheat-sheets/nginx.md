---
title: "Nginx Cheat Sheet"
description: "Quick reference for Nginx server blocks, reverse proxy, SSL/TLS, rate limiting, caching, and common recipes"
tags: [nginx, cheat-sheet, reference, web-server, reverse-proxy]
difficulty: beginner
prerequisites: []
lastReviewed: "2026-03-20"
---

# Nginx Cheat Sheet

Quick reference for Nginx server blocks, locations, reverse proxy, SSL/TLS configuration, rate limiting, caching, and common recipes.

---

## Commands

| Command | Description |
|---------|-------------|
| `nginx` | Start Nginx |
| `nginx -s stop` | Fast shutdown |
| `nginx -s quit` | Graceful shutdown |
| `nginx -s reload` | Reload configuration |
| `nginx -s reopen` | Reopen log files |
| `nginx -t` | Test configuration |
| `nginx -T` | Test and dump full config |
| `nginx -V` | Show version and build options |
| `systemctl status nginx` | Check service status |
| `systemctl restart nginx` | Restart service |

::: tip
Always run `nginx -t` before `nginx -s reload` to catch syntax errors.
:::

---

## Server Blocks

### Basic Server Block

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    root /var/www/example;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

### Multiple Sites

```nginx
# /etc/nginx/sites-available/site-a.conf
server {
    listen 80;
    server_name a.example.com;
    root /var/www/site-a;
}

# /etc/nginx/sites-available/site-b.conf
server {
    listen 80;
    server_name b.example.com;
    root /var/www/site-b;
}
```

### Default / Catch-All Server

```nginx
server {
    listen 80 default_server;
    server_name _;
    return 444;                  # Close connection (no response)
}
```

---

## Location Blocks

### Location Match Priority

| Modifier | Type | Example | Priority |
|----------|------|---------|----------|
| `=` | Exact match | `= /favicon.ico` | 1 (highest) |
| `^~` | Prefix (no regex after) | `^~ /static/` | 2 |
| `~` | Regex (case-sensitive) | `~ \.php$` | 3 |
| `~*` | Regex (case-insensitive) | `~* \.(jpg\|png)$` | 3 |
| (none) | Prefix | `/api/` | 4 (lowest) |

### Location Examples

```nginx
# Exact match
location = /health {
    return 200 "ok\n";
    add_header Content-Type text/plain;
}

# Prefix match
location /api/ {
    proxy_pass http://backend;
}

# Regex match (images)
location ~* \.(jpg|jpeg|png|gif|svg|webp)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}

# Static files (stop searching after match)
location ^~ /static/ {
    alias /var/www/static/;
    expires max;
}

# Named location (internal redirect)
location @fallback {
    proxy_pass http://backend;
}

location / {
    try_files $uri $uri/ @fallback;
}
```

---

## Reverse Proxy

### Basic Reverse Proxy

```nginx
server {
    listen 80;
    server_name app.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Upstream (Load Balancing)

```nginx
upstream backend {
    least_conn;                  # Load balancing method
    server 10.0.0.1:3000 weight=3;
    server 10.0.0.2:3000;
    server 10.0.0.3:3000 backup;
    keepalive 32;                # Connection pool
}

server {
    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}
```

### Load Balancing Methods

| Directive | Description |
|-----------|-------------|
| (default) | Round robin |
| `least_conn` | Fewest active connections |
| `ip_hash` | Sticky sessions by client IP |
| `hash $request_uri` | Hash-based (consistent) |
| `random two least_conn` | Random pick, prefer least conn |

### WebSocket Proxy

```nginx
location /ws/ {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
}
```

### Proxy Timeouts

```nginx
location /api/ {
    proxy_pass http://backend;
    proxy_connect_timeout 5s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;
    proxy_next_upstream error timeout http_502 http_503;
    proxy_next_upstream_tries 2;
}
```

---

## SSL/TLS Configuration

### HTTPS Server

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    # Modern TLS configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # OCSP stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;

    # Session caching
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
}
```

### HTTP to HTTPS Redirect

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    return 301 https://example.com$request_uri;
}
```

### Let's Encrypt with Certbot

```bash
# Install
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d example.com -d www.example.com

# Auto-renewal test
sudo certbot renew --dry-run

# Renewal cron (usually auto-configured)
# 0 0,12 * * * certbot renew --quiet
```

---

## Rate Limiting

```nginx
# Define rate limit zone (in http block)
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;

server {
    # Apply rate limit
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        limit_req_status 429;
        proxy_pass http://backend;
    }

    # Strict rate limit for login
    location /auth/login {
        limit_req zone=login burst=5;
        limit_req_status 429;
        proxy_pass http://backend;
    }
}
```

### Connection Limiting

```nginx
# Define connection limit zone
limit_conn_zone $binary_remote_addr zone=addr:10m;

server {
    location /download/ {
        limit_conn addr 5;           # Max 5 concurrent per IP
        limit_rate 500k;             # Throttle to 500KB/s
        limit_rate_after 10m;        # Full speed for first 10MB
    }
}
```

---

## Caching

### Proxy Cache

```nginx
# Define cache zone (in http block)
proxy_cache_path /var/cache/nginx
    levels=1:2
    keys_zone=app_cache:10m
    max_size=1g
    inactive=60m
    use_temp_path=off;

server {
    location / {
        proxy_pass http://backend;
        proxy_cache app_cache;
        proxy_cache_valid 200 10m;
        proxy_cache_valid 404 1m;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503;
        proxy_cache_lock on;

        add_header X-Cache-Status $upstream_cache_status;
    }

    # Bypass cache
    location /api/ {
        proxy_pass http://backend;
        proxy_cache app_cache;
        proxy_cache_bypass $http_cache_control;
        proxy_no_cache $arg_nocache;
    }
}
```

### Static File Caching (Browser)

```nginx
location ~* \.(css|js|woff2|woff|ttf)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    access_log off;
}

location ~* \.(jpg|jpeg|png|gif|svg|webp|ico)$ {
    expires 30d;
    add_header Cache-Control "public";
    access_log off;
}

location ~* \.(html)$ {
    expires 1h;
    add_header Cache-Control "public, must-revalidate";
}
```

---

## Security Headers

```nginx
# Add to server or http block
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

# Hide Nginx version
server_tokens off;
```

---

## Common Recipes

### Redirect www to non-www

```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name www.example.com;
    return 301 https://example.com$request_uri;
}
```

### Trailing Slash Redirect

```nginx
# Add trailing slash
rewrite ^([^.\?]*[^/])$ $1/ permanent;

# Remove trailing slash
rewrite ^/(.*)/$ /$1 permanent;
```

### CORS Headers

```nginx
location /api/ {
    # Simple CORS
    add_header Access-Control-Allow-Origin "https://app.example.com" always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
    add_header Access-Control-Max-Age 86400 always;

    # Handle preflight
    if ($request_method = OPTIONS) {
        return 204;
    }

    proxy_pass http://backend;
}
```

### Custom Error Pages

```nginx
server {
    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;

    location = /404.html {
        root /var/www/errors;
        internal;
    }

    location = /50x.html {
        root /var/www/errors;
        internal;
    }
}
```

### Basic Auth

```bash
# Create password file
sudo apt install apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd admin
```

```nginx
location /admin/ {
    auth_basic "Restricted";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://backend;
}
```

### IP Allowlist / Denylist

```nginx
location /admin/ {
    allow 10.0.0.0/8;
    allow 192.168.1.0/24;
    deny all;
    proxy_pass http://backend;
}
```

### Gzip Compression

```nginx
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 4;
gzip_min_length 256;
gzip_types
    text/plain
    text/css
    text/xml
    text/javascript
    application/json
    application/javascript
    application/xml
    application/rss+xml
    image/svg+xml;
```

### SPA (Single Page Application)

```nginx
server {
    listen 80;
    server_name app.example.com;
    root /var/www/app/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## Logging

```nginx
# Custom log format
log_format main '$remote_addr - $remote_user [$time_local] '
                '"$request" $status $body_bytes_sent '
                '"$http_referer" "$http_user_agent" '
                '$request_time $upstream_response_time';

# JSON log format
log_format json escape=json '{'
    '"time":"$time_iso8601",'
    '"remote_addr":"$remote_addr",'
    '"method":"$request_method",'
    '"uri":"$request_uri",'
    '"status":$status,'
    '"body_bytes_sent":$body_bytes_sent,'
    '"request_time":$request_time,'
    '"upstream_time":"$upstream_response_time"'
'}';

server {
    access_log /var/log/nginx/access.log json;
    error_log /var/log/nginx/error.log warn;

    # Disable logging for health checks
    location = /health {
        access_log off;
        return 200 "ok\n";
    }
}
```

---

## Common Variables

| Variable | Description |
|----------|-------------|
| `$host` | Request Host header |
| `$remote_addr` | Client IP address |
| `$request_uri` | Full original URI with args |
| `$uri` | Normalized URI (no args) |
| `$args` | Query string |
| `$scheme` | `http` or `https` |
| `$request_method` | `GET`, `POST`, etc. |
| `$status` | Response status code |
| `$request_time` | Request processing time (seconds) |
| `$upstream_response_time` | Backend response time |
| `$upstream_cache_status` | `HIT`, `MISS`, `BYPASS`, etc. |
| `$http_<header>` | Any request header (lowercase, `-` to `_`) |

---

## When to Use X vs Y

| Decision | Choice A | Choice B | Use A When | Use B When |
|----------|----------|----------|------------|------------|
| `root` vs `alias` | `root` | `alias` | URI path maps to filesystem | URI prefix differs from path |
| `return` vs `rewrite` | `return` | `rewrite` | Simple redirect (faster) | Pattern-based URL transform |
| `proxy_pass` trailing `/` | With `/` | Without `/` | Strip location prefix | Keep full URI path |
| Load balancing | `least_conn` | `ip_hash` | Uniform distribution | Session persistence |
| Rate limit | `nodelay` | (default) | Reject excess immediately | Queue excess requests |
| Cache | Proxy cache | Browser cache | Dynamic content, reduce backend load | Static assets |
