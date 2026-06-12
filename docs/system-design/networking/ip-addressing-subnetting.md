---
title: "IP Addressing & Subnetting"
description: "IPv4 and IPv6 addressing, CIDR notation, subnet masks, private vs public IPs, and the math behind subnetting — essential for cloud, Kubernetes, and Docker networking."
tags: [networking, ip, subnetting, cidr, ipv4, ipv6, nat]
difficulty: "beginner"
prerequisites: [system-design/networking/osi-model]
lastReviewed: "2026-06-12"
---

# IP Addressing & Subnetting

Every device on a network has an IP address. Understanding how addresses are structured, allocated, and subdivided is the foundation for understanding cloud VPCs, Kubernetes pod networking, Docker bridge networks, security groups, and firewall rules.

---

## IPv4 Addresses

An IPv4 address is 32 bits, written as four decimal octets separated by dots:

```
192.168.1.100
│   │   │ │
│   │   │ └─ 100 = 01100100
│   │   └─── 1   = 00000001
│   └─────── 168 = 10101000
└─────────── 192 = 11000000
```

32 bits = 2³² = **4,294,967,296** total addresses. The internet ran out of them in 2011 (IPv4 exhaustion). NAT and IPv6 are the responses.

---

## CIDR Notation

**CIDR** (Classless Inter-Domain Routing) is how IP ranges are written. The number after the slash is the **prefix length** — how many bits are fixed (the "network" part). The remaining bits are for hosts.

```
192.168.1.0/24

Network bits: 24 (192.168.1)
Host bits: 32 - 24 = 8
Usable hosts: 2⁸ - 2 = 254 (subtract network + broadcast address)
Range: 192.168.1.0 → 192.168.1.255
```

### CIDR Quick Reference

| CIDR | Subnet Mask | # Hosts | Common Use |
|------|-------------|---------|------------|
| /32 | 255.255.255.255 | 1 | Single host, firewall rule |
| /31 | 255.255.255.254 | 2 | Point-to-point links |
| /30 | 255.255.255.252 | 2 usable | Small subnets |
| /28 | 255.255.255.240 | 14 | Small team subnet |
| /24 | 255.255.255.0 | 254 | Standard LAN |
| /22 | 255.255.252.0 | 1022 | Medium VPC subnet |
| /20 | 255.255.240.0 | 4094 | Large subnet |
| /16 | 255.255.0.0 | 65,534 | VPC CIDR block |
| /8 | 255.0.0.0 | 16M | Large ISP block |
| /0 | 0.0.0.0 | All | Default route (everything) |

### Calculating Subnets

```
Given: 10.0.0.0/24 — split into 4 equal subnets

Each subnet needs: /26 (borrows 2 bits, 2² = 4 subnets)
Hosts per subnet: 2⁶ - 2 = 62

10.0.0.0/26   → 10.0.0.0   - 10.0.0.63
10.0.0.64/26  → 10.0.0.64  - 10.0.0.127
10.0.0.128/26 → 10.0.0.128 - 10.0.0.191
10.0.0.192/26 → 10.0.0.192 - 10.0.0.255
```

**The trick:** prefix bits are network identity, remaining bits are host addresses. Adding 1 to the prefix halves the number of hosts and doubles the number of subnets.

---

## Private vs Public IP Ranges

Not all IP addresses are routable on the public internet. RFC 1918 reserves three private ranges:

| Range | CIDR | # Addresses | Common Use |
|-------|------|-------------|------------|
| `10.0.0.0` – `10.255.255.255` | 10.0.0.0/8 | 16M | AWS VPCs, large corporate |
| `172.16.0.0` – `172.31.255.255` | 172.16.0.0/12 | 1M | Docker bridge default |
| `192.168.0.0` – `192.168.255.255` | 192.168.0.0/16 | 65K | Home routers, small networks |

**Rule:** Private IPs are never forwarded by internet routers. They only work within a local network or VPN tunnel.

**Special addresses:**
- `127.0.0.0/8` — Loopback (localhost). `127.0.0.1` is your own machine.
- `0.0.0.0` — Means "any/all addresses" in server bind contexts
- `255.255.255.255` — Broadcast to entire subnet
- `169.254.0.0/16` — Link-local (APIPA). Assigned automatically when DHCP fails.

---

## Subnet Masks

A subnet mask in dotted-decimal notation is just CIDR prefix bits expressed differently:

```
/24 → 255.255.255.0   (24 ones: 11111111.11111111.11111111.00000000)
/16 → 255.255.0.0     (16 ones: 11111111.11111111.00000000.00000000)
/8  → 255.0.0.0       (8 ones:  11111111.00000000.00000000.00000000)
```

To find the network address of a host: **bitwise AND** the IP with the subnet mask.

```
Host:    192.168.1.100 = 11000000.10101000.00000001.01100100
Mask:    255.255.255.0 = 11111111.11111111.11111111.00000000
Network: 192.168.1.0   = 11000000.10101000.00000001.00000000
```

---

## IPv6

IPv6 addresses are 128 bits, written as 8 groups of 4 hex digits:

```
2001:0db8:85a3:0000:0000:8a2e:0370:7334
```

Shorthand rules:
- Leading zeros in a group can be dropped: `0db8` → `db8`
- One consecutive sequence of all-zero groups can be replaced with `::`: `2001:db8::8a2e:370:7334`

**IPv6 space:** 2¹²⁸ = 3.4 × 10³⁸ addresses. Enough to give every grain of sand on Earth its own /48 subnet.

### IPv6 Special Addresses

| Address | Meaning |
|---------|---------|
| `::1` | Loopback (equivalent to 127.0.0.1) |
| `fe80::/10` | Link-local (auto-configured, not routable) |
| `2001:db8::/32` | Documentation/examples (not routed) |
| `fc00::/7` | Unique local (equivalent to RFC 1918) |
| `2000::/3` | Global unicast (publicly routable) |

### Dual Stack

Most production systems run **dual stack** — both IPv4 and IPv6 simultaneously. A server listening on `::` (IPv6 any) typically also accepts IPv4 connections via IPv4-mapped addresses (`::ffff:192.168.1.1`).

---

## How Routers Use IP Addresses

Routers maintain a **routing table** — a list of CIDR prefixes and the next hop for each.

```
Destination        Gateway         Interface
0.0.0.0/0          192.168.1.1     eth0      ← default route
10.0.0.0/8         10.0.0.1        eth1      ← corporate network
192.168.1.0/24     0.0.0.0         eth0      ← directly connected
```

**Longest prefix match**: when multiple routes match a destination, the most specific (longest prefix) wins.

```
Packet to 10.0.1.50:
  Matches 0.0.0.0/0   (length 0)
  Matches 10.0.0.0/8  (length 8)  ← wins
```

---

## CIDR in Cloud & Kubernetes

### AWS VPC
```
VPC:             10.0.0.0/16  (65,534 addresses)
  Public subnet: 10.0.1.0/24  (254 hosts — has internet gateway)
  Private subnet: 10.0.2.0/24 (254 hosts — no direct internet)
  DB subnet:     10.0.3.0/24  (254 hosts — only from private subnet)
```

### Kubernetes
```
Node CIDR:    10.0.0.0/16  (nodes get IPs from here)
Pod CIDR:     10.244.0.0/16 (each pod gets its own IP)
Service CIDR: 10.96.0.0/12 (cluster-internal service IPs)
```

Each Kubernetes node typically gets a /24 from the pod CIDR, giving it 254 pod IP addresses.

### Security Groups / Firewall Rules
CIDR notation is everywhere in firewall rules:
```
Allow inbound 0.0.0.0/0 on port 443   (anyone can reach HTTPS)
Allow inbound 10.0.0.0/8 on port 5432 (only internal can reach Postgres)
Allow inbound 52.1.2.3/32 on port 22  (only this specific IP can SSH)
```

---

## Useful Commands

```bash
# Show your IP addresses and CIDR
ip addr show
ifconfig  # older alternative

# Show routing table
ip route show
route -n  # older alternative

# Check if an IP is in a subnet
# 192.168.1.50 in 192.168.1.0/24?
ipcalc 192.168.1.0/24

# Inspect a CIDR range
nmap -sL 192.168.1.0/24  # list all addresses (no scanning)
```
