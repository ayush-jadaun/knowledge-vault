---
title: "OSI Model & TCP/IP Stack"
description: "The 7-layer OSI model and 4-layer TCP/IP stack — what each layer does, where your code lives, and why the abstraction matters when things break."
tags: [networking, osi, tcp-ip, layers, protocols, fundamentals]
difficulty: "beginner"
prerequisites: []
lastReviewed: "2026-06-12"
---

# OSI Model & TCP/IP Stack

Every networking conversation eventually references "layers." The OSI model is the map that makes those conversations possible. It divides the problem of network communication into seven discrete layers, each responsible for a specific concern, each building on the one below.

You'll never implement most of these layers. But when you're debugging a TLS handshake failure, a TCP timeout, or a routing issue, knowing which layer the problem lives in tells you exactly where to look.

---

## The 7 Layers

```
┌─────────────────────────────────────────────┐
│  7 │ Application  │ HTTP, DNS, SMTP, gRPC   │
│  6 │ Presentation │ TLS, compression, JSON  │
│  5 │ Session      │ TCP sessions, WebSocket │
│  4 │ Transport    │ TCP, UDP, QUIC          │
│  3 │ Network      │ IP, ICMP, routing       │
│  2 │ Data Link    │ Ethernet, MAC, ARP      │
│  1 │ Physical     │ Cables, WiFi, fiber     │
└─────────────────────────────────────────────┘
```

| Layer | Name | What It Does | Examples |
|-------|------|-------------|---------|
| 7 | Application | User-facing protocols | HTTP, HTTPS, DNS, SMTP, FTP, SSH |
| 6 | Presentation | Data encoding, encryption, compression | TLS/SSL, gzip, JSON, XML, protobuf |
| 5 | Session | Managing connections, session state | TCP sessions, RPC, WebSocket handshake |
| 4 | Transport | End-to-end delivery, ports, reliability | TCP, UDP, QUIC, SCTP |
| 3 | Network | Logical addressing, routing between networks | IPv4, IPv6, ICMP, BGP, OSPF |
| 2 | Data Link | Node-to-node delivery on the same network | Ethernet, WiFi (802.11), ARP, MAC addresses |
| 1 | Physical | Raw bit transmission over a medium | Cables, fiber, radio waves, voltage |

---

## The Real TCP/IP Stack (4 Layers)

The OSI model is a conceptual framework. The internet actually uses the TCP/IP stack, which collapses OSI layers 5–7 into one:

```
OSI                          TCP/IP
┌──────────────┐             ┌──────────────────┐
│ Application  │             │                  │
│ Presentation │  ────────►  │   Application    │  HTTP, DNS, SMTP
│ Session      │             │                  │
├──────────────┤             ├──────────────────┤
│ Transport    │  ────────►  │    Transport     │  TCP, UDP
├──────────────┤             ├──────────────────┤
│ Network      │  ────────►  │    Internet      │  IP, ICMP
├──────────────┤             ├──────────────────┤
│ Data Link    │  ────────►  │  Network Access  │  Ethernet, WiFi
│ Physical     │             │                  │
└──────────────┘             └──────────────────┘
```

---

## Encapsulation: How Data Actually Travels

Each layer wraps the data from the layer above with its own header (and sometimes trailer). This is called **encapsulation**.

```
Application: | HTTP Data                              |
Transport:   | TCP Header  | HTTP Data               |
Network:     | IP Header   | TCP Header | HTTP Data  |
Data Link:   | ETH Header  | IP | TCP | HTTP | ETH Trailer |
```

When the packet arrives at the destination, each layer strips its header and passes the payload up. This is **decapsulation**.

**Why this matters:** When Wireshark captures a packet, you're seeing all these layers stacked. When you read a firewall rule, you're operating at Layer 3 (IP) or Layer 4 (TCP/UDP). When you configure a load balancer, you're choosing between L4 (TCP) and L7 (HTTP) — which determines what the load balancer can see and route on.

---

## What Each Layer Looks Like in Practice

### Layer 7 — Application
This is where your code lives. When you call `fetch('https://api.example.com/users')`, you're operating at Layer 7. The HTTP protocol defines method, path, headers, and body. DNS resolves the hostname before the request even goes out.

### Layer 6 — Presentation
TLS lives conceptually here — it handles encryption, certificates, and key exchange. In practice, TLS sits between L4 and L7 in the TCP/IP stack. gzip compression also lives here.

### Layer 5 — Session
Managing the lifecycle of a connection. TCP's three-way handshake establishes a session. WebSocket upgrades an HTTP session to a persistent bidirectional session.

### Layer 4 — Transport
TCP and UDP. Your application specifies a **port number** here — TCP port 443 for HTTPS, port 5432 for PostgreSQL, port 6379 for Redis. This layer handles:
- Multiplexing (multiple connections to the same server via different ports)
- Reliability (TCP) vs speed (UDP)
- Flow control and congestion control (TCP)

### Layer 3 — Network
IP addresses live here. Routing decisions happen here — which path does a packet take to reach `1.2.3.4`? Routers operate at L3. ICMP (ping, traceroute) is L3.

### Layer 2 — Data Link
MAC addresses live here. Within a local network (LAN), packets are addressed by MAC address, not IP. ARP (Address Resolution Protocol) maps IP addresses to MAC addresses. Switches operate at L2.

### Layer 1 — Physical
Bits on wire. Ethernet cables (Cat6), fiber optic, WiFi radio waves. You almost never interact with this layer directly unless you're a network engineer.

---

## Where Common Technologies Live

| Technology | OSI Layer | Why |
|-----------|-----------|-----|
| HTTP/HTTPS | 7 | Application protocol |
| TLS/SSL | 6/4 (between) | Encryption wrapper |
| TCP | 4 | Reliable transport |
| UDP | 4 | Unreliable transport |
| IP | 3 | Logical addressing |
| ICMP (ping) | 3 | Network diagnostics |
| Ethernet | 2 | LAN addressing |
| ARP | 2/3 | IP-to-MAC resolution |
| WiFi 802.11 | 1/2 | Wireless physical |
| Firewall | 3/4 | IP + port filtering |
| Load Balancer L4 | 4 | TCP-level routing |
| Load Balancer L7 | 7 | HTTP-level routing |
| VPN | 3 | Tunnels L3 packets |
| Docker networking | 2/3 | Virtual Ethernet + IP |
| Kubernetes CNI | 3 | Pod IP routing |

---

## The "Layer" Shorthand in Practice

When engineers say "this is a Layer 4 problem" they mean TCP/UDP — ports, connections, timeouts. "Layer 7" means HTTP — headers, paths, bodies. This shorthand is used constantly:

- **L4 load balancer**: routes by IP + port, doesn't inspect HTTP
- **L7 load balancer (reverse proxy)**: routes by Host header, URL path, cookies — full HTTP visibility
- **L3 firewall**: blocks by IP address / CIDR range
- **L4 firewall**: blocks by IP + port combination
- **L7 WAF (Web Application Firewall)**: inspects HTTP bodies, blocks XSS/SQLi

---

## Debugging With Layers

When something is broken, identify the layer:

```
Can't reach the server?
  → ping (L3) — is IP reachable?
  → telnet host 443 (L4) — is TCP port open?
  → curl -v (L7) — is HTTP responding?

Slow responses?
  → traceroute (L3) — where is the latency added?
  → tcpdump (L2/L3/L4) — what does the packet exchange look like?
  → netstat -an (L4) — how many TCP connections? Any in TIME_WAIT?

TLS errors?
  → openssl s_client -connect host:443 — certificate chain, handshake
```

Each tool operates at a specific layer. Using the right tool for the right layer cuts debugging time dramatically.
