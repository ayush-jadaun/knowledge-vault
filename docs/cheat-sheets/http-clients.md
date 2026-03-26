---
title: "HTTP Client Tools Cheat Sheet"
description: "Comprehensive reference for HTTP client tools — curl flags, httpie syntax, Bruno for team API workflows, wget for downloads, plus common recipes for OAuth, multipart uploads, and WebSocket testing."
tags: [curl, httpie, http, api-testing, cheat-sheet]
difficulty: beginner
prerequisites: []
lastReviewed: "2026-03-20"
---

# HTTP Client Tools Cheat Sheet

Every developer needs to make HTTP requests from the command line — testing APIs, debugging integrations, automating workflows, and diagnosing production issues. This cheat sheet covers the tools you need: curl for precision, httpie for readability, Bruno for team workflows, and wget for downloads.

## curl — The Swiss Army Knife

curl is installed on virtually every Unix system. It is ugly, powerful, and essential.

### Request Methods

| Command | Description |
|---------|-------------|
| `curl https://api.example.com/users` | GET request (default) |
| `curl -X POST https://api.example.com/users` | POST request |
| `curl -X PUT https://api.example.com/users/1` | PUT request |
| `curl -X PATCH https://api.example.com/users/1` | PATCH request |
| `curl -X DELETE https://api.example.com/users/1` | DELETE request |
| `curl -I https://example.com` | HEAD request (headers only) |
| `curl -X OPTIONS https://api.example.com` | OPTIONS request (CORS preflight) |

### Headers

```bash
# Set a single header
curl -H "Content-Type: application/json" https://api.example.com

# Set multiple headers
curl -H "Content-Type: application/json" \
     -H "Authorization: Bearer eyJ..." \
     -H "X-Request-ID: abc123" \
     https://api.example.com/users

# View response headers
curl -i https://example.com          # Response headers + body
curl -I https://example.com          # Response headers only
curl -v https://example.com          # Full verbose (request + response headers)
```

### Sending Data

```bash
# JSON body
curl -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice", "email": "alice@example.com"}'

# JSON from file
curl -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -d @payload.json

# Form data (application/x-www-form-urlencoded)
curl -X POST https://api.example.com/login \
  -d "username=alice&password=secret"

# Multipart form (file upload)
curl -X POST https://api.example.com/upload \
  -F "file=@document.pdf" \
  -F "description=My document"

# Multiple files
curl -X POST https://api.example.com/upload \
  -F "files=@file1.jpg" \
  -F "files=@file2.jpg" \
  -F "metadata={\"album\":\"vacation\"};type=application/json"
```

### Authentication

```bash
# Basic auth
curl -u username:password https://api.example.com/protected

# Bearer token
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9..." \
     https://api.example.com/me

# API key in header
curl -H "X-API-Key: sk_live_abc123" https://api.example.com/data

# API key in query parameter
curl "https://api.example.com/data?api_key=sk_live_abc123"

# Client certificate
curl --cert client.pem --key client-key.pem https://secure.example.com

# Digest auth
curl --digest -u user:pass https://api.example.com/digest-protected
```

### Redirects and Cookies

```bash
# Follow redirects
curl -L https://example.com/redirect

# Follow redirects, limit to 5 hops
curl -L --max-redirs 5 https://example.com/redirect

# Save cookies to file
curl -c cookies.txt https://example.com/login \
  -d "user=alice&pass=secret"

# Send saved cookies
curl -b cookies.txt https://example.com/dashboard

# Save and send cookies (full session)
curl -c cookies.txt -b cookies.txt https://example.com/api
```

### Response Handling

```bash
# Save response to file
curl -o output.json https://api.example.com/data

# Save with remote filename
curl -O https://example.com/files/report.pdf

# Silent mode (no progress bar)
curl -s https://api.example.com/data

# Silent but show errors
curl -sS https://api.example.com/data

# Pretty-print JSON response
curl -s https://api.example.com/data | jq .

# Write response to file and stdout simultaneously
curl -s https://api.example.com/data | tee response.json | jq .
```

### Timing and Debugging

```bash
# Show request/response timing breakdown
curl -s -o /dev/null -w "\
  DNS:        %{time_namelookup}s\n\
  Connect:    %{time_connect}s\n\
  TLS:        %{time_appconnect}s\n\
  TTFB:       %{time_starttransfer}s\n\
  Total:      %{time_total}s\n\
  HTTP Code:  %{http_code}\n\
  Size:       %{size_download} bytes\n" \
  https://api.example.com/health

# Verbose mode (see full request/response)
curl -v https://api.example.com

# Trace to file (even more detail than -v)
curl --trace trace.log https://api.example.com

# Only check HTTP status code
curl -s -o /dev/null -w "%{http_code}" https://api.example.com/health

# Set timeout
curl --connect-timeout 5 --max-time 30 https://slow-api.example.com

# Retry on failure
curl --retry 3 --retry-delay 2 https://flaky-api.example.com
```

### Proxy and Network

```bash
# Use HTTP proxy
curl -x http://proxy:8080 https://api.example.com

# Use SOCKS5 proxy
curl --socks5 localhost:9050 https://api.example.com

# Resolve hostname to specific IP (bypass DNS)
curl --resolve api.example.com:443:10.0.0.1 https://api.example.com

# Use specific network interface
curl --interface eth0 https://api.example.com

# Limit bandwidth
curl --limit-rate 100K https://example.com/large-file.zip -O

# Ignore SSL certificate errors (development only!)
curl -k https://self-signed.example.com
```

::: danger Never Use -k in Production Scripts
`curl -k` disables certificate verification, making connections vulnerable to man-in-the-middle attacks. If you need to trust a custom CA, use `--cacert ca-bundle.pem` instead.
:::

### curl Complete Reference Table

| Flag | Long Form | Description |
|------|-----------|-------------|
| `-X` | `--request` | HTTP method |
| `-H` | `--header` | Add request header |
| `-d` | `--data` | Send data (POST body) |
| `-F` | `--form` | Multipart form data |
| `-u` | `--user` | Basic auth credentials |
| `-o` | `--output` | Write to file |
| `-O` | `--remote-name` | Save with remote filename |
| `-L` | `--location` | Follow redirects |
| `-i` | `--include` | Show response headers |
| `-I` | `--head` | HEAD request |
| `-v` | `--verbose` | Full verbose output |
| `-s` | `--silent` | No progress meter |
| `-S` | `--show-error` | Show error in silent mode |
| `-c` | `--cookie-jar` | Save cookies to file |
| `-b` | `--cookie` | Send cookies from file |
| `-k` | `--insecure` | Skip TLS verification |
| `-w` | `--write-out` | Custom output format |
| | `--connect-timeout` | Connection timeout (seconds) |
| | `--max-time` | Total timeout (seconds) |
| | `--retry` | Number of retries |
| | `--compressed` | Request compressed response |
| `-A` | `--user-agent` | Set User-Agent header |
| `-e` | `--referer` | Set Referer header |

---

## httpie — Human-Friendly HTTP

httpie (`http` command) provides a more readable syntax than curl, with automatic JSON formatting, syntax highlighting, and sensible defaults.

### Installation

```bash
brew install httpie    # macOS
pip install httpie     # pip
sudo apt install httpie # Debian/Ubuntu
```

### Basic Usage

```bash
# GET (default)
http https://api.example.com/users

# POST with JSON (automatic Content-Type: application/json)
http POST https://api.example.com/users name=Alice age:=30 admin:=true
# Note: := for non-string values (numbers, booleans, null)
#        = for string values

# PUT
http PUT https://api.example.com/users/1 name=Alice

# DELETE
http DELETE https://api.example.com/users/1
```

### httpie vs curl Comparison

| Task | curl | httpie |
|------|------|--------|
| **GET** | `curl https://api.example.com` | `http api.example.com` |
| **POST JSON** | `curl -X POST -H "Content-Type: application/json" -d '{"name":"Alice"}' URL` | `http POST URL name=Alice` |
| **Auth** | `curl -H "Authorization: Bearer TOKEN" URL` | `http URL Authorization:"Bearer TOKEN"` |
| **Headers** | `curl -H "Accept: text/plain" URL` | `http URL Accept:text/plain` |
| **Form data** | `curl -d "name=Alice" URL` | `http -f POST URL name=Alice` |
| **Download** | `curl -O URL` | `http -d URL` |
| **Verbose** | `curl -v URL` | `http -v URL` |

### httpie Advanced Features

```bash
# Custom headers (Header:Value)
http api.example.com X-API-Key:abc123 Accept:application/xml

# Query parameters (==)
http api.example.com/search query==react page==1 limit==20

# Send JSON from file
http POST api.example.com/users < user.json

# Bearer auth (built-in)
http -A bearer -a eyJhbGci... api.example.com/me

# Session persistence (like cookies)
http --session=logged-in POST api.example.com/login user=alice pass=secret
http --session=logged-in api.example.com/dashboard  # Cookies sent automatically

# Download with progress bar
http --download https://example.com/file.zip

# Output only headers
http --headers api.example.com

# Output only body
http --body api.example.com

# Offline mode (print the request that would be sent)
http --offline POST api.example.com name=Alice
```

::: tip httpie Is Great for Exploration
Use httpie when you are exploring an API interactively — the colored output and intuitive syntax save time. Use curl when you are writing scripts or need precise control — curl is installed everywhere and has more flags.
:::

---

## Bruno — API Client for Teams

Bruno is an open-source API client that stores collections as files (not in the cloud). Collections can be version-controlled with git — unlike Postman, which stores everything in its cloud.

### Why Bruno Over Postman

| Feature | Bruno | Postman |
|---------|-------|---------|
| **Storage** | Local filesystem (git-friendly) | Postman cloud |
| **Offline** | Fully offline | Limited offline |
| **Version control** | Collections are files — commit to git | Cloud sync only |
| **Pricing** | Free and open source | Free tier limited, paid for teams |
| **Privacy** | Data never leaves your machine | Data on Postman servers |
| **Scripting** | JavaScript (pre/post request) | JavaScript (similar) |
| **Environments** | `.env` files or Bruno environment files | Cloud-synced environments |

### Bruno Collection Structure

```
api-collection/
  bruno.json              # Collection config
  environments/
    development.bru       # Dev environment variables
    production.bru        # Prod environment variables
  users/
    get-users.bru         # GET /users
    create-user.bru       # POST /users
    get-user-by-id.bru    # GET /users/:id
  orders/
    create-order.bru      # POST /orders
    list-orders.bru       # GET /orders
```

### Bruno Request Format (.bru)

```
meta {
  name: Create User
  type: http
  seq: 2
}

post {
  url: {​{baseUrl}}/api/users
  body: json
  auth: bearer
}

auth:bearer {
  token: {​{authToken}}
}

headers {
  Content-Type: application/json
  X-Request-ID: {​{$guid}}
}

body:json {
  {
    "name": "Alice",
    "email": "alice@example.com",
    "role": "admin"
  }
}

script:pre-request {
  const token = await bru.getVar("authToken");
  if (!token) {
    // Auto-login if no token
    const res = await bru.runRequest("auth/login");
    bru.setVar("authToken", res.body.token);
  }
}

tests {
  test("status is 201", () => {
    expect(res.status).to.equal(201);
  });

  test("response has user id", () => {
    expect(res.body.id).to.be.a("string");
    bru.setVar("userId", res.body.id);
  });
}
```

### Running Bruno from CLI

```bash
# Install CLI
npm install -g @usebruno/cli

# Run entire collection
bru run --env development

# Run specific folder
bru run users/ --env development

# Run with custom environment file
bru run --env-file .env.local
```

---

## wget — Downloads and Mirroring

wget excels at downloading files — especially recursive downloads, mirroring websites, and resuming interrupted downloads.

### Basic Downloads

| Command | Description |
|---------|-------------|
| `wget https://example.com/file.zip` | Download a file |
| `wget -O output.zip URL` | Download with custom filename |
| `wget -P /tmp/ URL` | Download to specific directory |
| `wget -c URL` | Resume interrupted download |
| `wget -q URL` | Quiet mode (no progress) |
| `wget -b URL` | Download in background |
| `wget --limit-rate=500k URL` | Limit download speed |

### Multiple Downloads

```bash
# Download list of URLs from file
wget -i urls.txt

# Download multiple files
wget https://example.com/file1.zip https://example.com/file2.zip

# Download with retry
wget --tries=5 --waitretry=10 https://example.com/large-file.zip
```

### Website Mirroring

```bash
# Mirror an entire website
wget --mirror \
     --convert-links \
     --adjust-extension \
     --page-requisites \
     --no-parent \
     https://docs.example.com/

# Explanation:
# --mirror         Recursive download, timestamping, infinite depth
# --convert-links  Convert links for local viewing
# --adjust-extension  Add .html to extensionless files
# --page-requisites   Download CSS, images, etc.
# --no-parent      Do not ascend to parent directory

# Download specific file types
wget -r -A "*.pdf" https://example.com/docs/

# Exclude specific paths
wget --mirror --exclude-directories=/archive https://example.com/
```

### wget vs curl

| Feature | wget | curl |
|---------|------|------|
| **Recursive download** | Built-in (`-r`, `--mirror`) | Not supported |
| **Resume downloads** | `-c` | `-C -` |
| **Background download** | `-b` | Not built-in |
| **Protocol support** | HTTP, HTTPS, FTP | HTTP, HTTPS, FTP, SFTP, SCP, LDAP, MQTT, and many more |
| **API testing** | Basic | Full-featured |
| **Scripting** | Download-focused | General HTTP client |
| **Output control** | Basic | Very flexible (`-w` format) |

---

## Common Recipes

### OAuth 2.0 Token Flow

```bash
# Step 1: Get authorization code (browser)
# User visits:
# https://auth.example.com/authorize?
#   client_id=myapp&
#   redirect_uri=http://localhost:3000/callback&
#   response_type=code&
#   scope=read+write

# Step 2: Exchange code for token
curl -s -X POST https://auth.example.com/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=AUTH_CODE_HERE" \
  -d "client_id=myapp" \
  -d "client_secret=SECRET" \
  -d "redirect_uri=http://localhost:3000/callback" | jq .

# Step 3: Use the access token
curl -s -H "Authorization: Bearer ACCESS_TOKEN" \
  https://api.example.com/me | jq .

# Step 4: Refresh token
curl -s -X POST https://auth.example.com/token \
  -d "grant_type=refresh_token" \
  -d "refresh_token=REFRESH_TOKEN" \
  -d "client_id=myapp" \
  -d "client_secret=SECRET" | jq .
```

### Multipart File Upload with Metadata

```bash
# Upload image with metadata
curl -X POST https://api.example.com/media \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@photo.jpg;type=image/jpeg" \
  -F "title=Vacation Photo" \
  -F "tags=travel,beach" \
  -F "metadata={\"location\":\"Maldives\",\"date\":\"2026-01-15\"};type=application/json"

# Upload multiple files with progress
curl -X POST https://api.example.com/batch-upload \
  -H "Authorization: Bearer TOKEN" \
  -F "files=@report-q1.pdf" \
  -F "files=@report-q2.pdf" \
  -F "files=@report-q3.pdf" \
  --progress-bar
```

### WebSocket Testing

```bash
# websocat — WebSocket client from command line
# Install: cargo install websocat  OR  brew install websocat

# Connect to WebSocket
websocat wss://echo.websocket.org

# Send a message and print responses
echo '{"type":"subscribe","channel":"orders"}' | \
  websocat wss://api.example.com/ws

# WebSocket with auth header
websocat -H "Authorization: Bearer TOKEN" wss://api.example.com/ws

# Using curl for WebSocket (curl 7.86+)
curl --include \
  --no-buffer \
  --header "Connection: Upgrade" \
  --header "Upgrade: websocket" \
  --header "Sec-WebSocket-Version: 13" \
  --header "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  https://echo.websocket.org
```

### Health Check Script

```bash
#!/bin/bash
# health-check.sh — Check multiple endpoints

ENDPOINTS=(
  "https://api.example.com/health"
  "https://web.example.com"
  "https://auth.example.com/health"
  "https://cdn.example.com/status"
)

for url in "${ENDPOINTS[@]}"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url")
  time=$(curl -s -o /dev/null -w "%{time_total}" --max-time 5 "$url")

  if [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
    echo "[OK]   $code  ${time}s  $url"
  else
    echo "[FAIL] $code  ${time}s  $url"
  fi
done
```

### API Response Comparison

```bash
# Compare responses from two environments
diff <(curl -s https://staging-api.example.com/users | jq -S .) \
     <(curl -s https://prod-api.example.com/users | jq -S .)

# Monitor an endpoint continuously
watch -n 5 'curl -s -o /dev/null -w "HTTP %{http_code} in %{time_total}s" https://api.example.com/health'
```

---

## Tool Selection Guide

```mermaid
graph TD
    TASK["What are you doing?"]
    QUICK["Quick API test<br/>or exploration?"]
    SCRIPT["Writing a script<br/>or automation?"]
    TEAM["Team API<br/>workflows?"]
    DOWNLOAD["Downloading files<br/>or mirroring?"]

    TASK --> QUICK -->|"Yes"| HTTPIE["httpie<br/>Best readability"]
    TASK --> SCRIPT -->|"Yes"| CURL["curl<br/>Universal, scriptable"]
    TASK --> TEAM -->|"Yes"| BRUNO["Bruno<br/>Git-friendly collections"]
    TASK --> DOWNLOAD -->|"Yes"| WGET["wget<br/>Recursive, resumable"]

    style HTTPIE fill:#059669,color:#fff
    style CURL fill:#0891b2,color:#fff
    style BRUNO fill:#d97706,color:#fff
    style WGET fill:#7c3aed,color:#fff
```

---

## Related Pages

- [Terminal Productivity](/cheat-sheets/terminal-productivity) — tmux, fzf, ripgrep, jq
- [Bash Cheat Sheet](/cheat-sheets/bash) — Shell scripting
- [Git Cheat Sheet](/cheat-sheets/git) — Version control
- [Docker Cheat Sheet](/cheat-sheets/docker) — Container operations
- [GraphQL Cheat Sheet](/cheat-sheets/graphql) — GraphQL query reference

---

::: details Test Yourself
1. **What curl flag follows HTTP redirects?**
   `-L` or `--location`

2. **How do you send a JSON body with curl?**
   `curl -X POST -H "Content-Type: application/json" -d '{"key":"value"}' URL`

3. **What curl flag shows the full request and response headers?**
   `-v` or `--verbose`

4. **How do you get only the HTTP status code from a curl request?**
   `curl -s -o /dev/null -w "%{http_code}" URL`

5. **What httpie syntax sends a non-string value (number or boolean)?**
   Use `:=` instead of `=`: `age:=30`, `active:=true`

6. **How do you upload a file with curl using multipart form data?**
   `curl -F "file=@document.pdf" URL`

7. **What wget flag resumes an interrupted download?**
   `-c`

8. **How do you save and reuse cookies across curl requests?**
   `-c cookies.txt` to save, `-b cookies.txt` to send.

9. **What is Bruno's key advantage over Postman?**
   Collections are stored as local files (git-friendly) instead of in the cloud.

10. **What curl flag sets a maximum total timeout for the request?**
    `--max-time 30`
:::

::: danger Common Gotchas
- **`curl -k` disables TLS verification.** This makes you vulnerable to man-in-the-middle attacks. Use `--cacert ca-bundle.pem` for custom CAs instead.
- **Forgetting `-s` in scripts.** Without silent mode, curl prints a progress bar that clutters your script output. Use `-sS` for silent with errors.
- **httpie adds `Content-Type: application/json` by default for POST.** If your API expects form data, you must use `-f` flag: `http -f POST URL field=value`.
- **wget `--mirror` without `--no-parent`.** Without it, wget follows links to parent directories and may download the entire site, not just the section you wanted.
:::

## One-Liner Summary

curl is the universal HTTP client for scripting, httpie is the human-friendly alternative for exploration, Bruno is the git-friendly API client for teams, and wget is the champion for recursive downloads.
