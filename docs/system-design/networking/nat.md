---
title: "NAT — Network Address Translation"
description: "How NAT works, why the internet needs it, SNAT vs DNAT, connection tracking, port forwarding, CGNAT, and why NAT breaks peer-to-peer — with implications for Docker, Kubernetes, and cloud networking."
tags: [networking, nat, snat, dnat, ipv4, docker, kubernetes, firewall]
difficulty: "intermediate"
prerequisites: [system-design/networking/ip-addressing-subnetting, system-design/networking/tcp-ip-deep-dive]
lastReviewed: "2026-06-12"
---

# NAT — Network Address Translation

IPv4 only has 4.3 billion addresses. There are 8 billion people. NAT is the hack that made the internet scale past that limit — and it's now embedded in every home router, cloud VPC, Docker network, and Kubernetes cluster you'll ever work with.

Understanding NAT is essential for debugging "why can't this container reach the internet," "why does this port-forwarding not work," and "why does WebRTC require STUN servers."

---

## The Core Idea

NAT rewrites IP addresses (and sometimes ports) in packet headers as they pass through a router.

```
Private network         NAT Router          Internet
192.168.1.10 ──────►  rewrites src IP  ──────► 1.2.3.4 (server)
                       192.168.1.10
                       becomes
                       203.0.113.5 (public IP)
```

The server at `1.2.3.4` sees the request as coming from `203.0.113.5`, not `192.168.1.10`. The entire private network hides behind one public IP.

---

## SNAT — Source NAT (Masquerade)

**SNAT** rewrites the *source* IP of outbound packets. This is what home routers and cloud NAT gateways do.

```
OUTBOUND (private → internet):
  Original:  src=192.168.1.10:54321, dst=1.2.3.4:443
  After NAT: src=203.0.113.5:54321,  dst=1.2.3.4:443

INBOUND (internet → private):
  Original:  src=1.2.3.4:443, dst=203.0.113.5:54321
  After NAT: src=1.2.3.4:443, dst=192.168.1.10:54321  ← reversed by conntrack
```

The router maintains a **connection tracking table** (conntrack) to know how to reverse the translation on reply packets:

```
conntrack table:
192.168.1.10:54321  ←→  203.0.113.5:54321  ←→  1.2.3.4:443
192.168.1.11:12345  ←→  203.0.113.5:12345  ←→  8.8.8.8:53
192.168.1.12:43210  ←→  203.0.113.5:43210  ←→  1.2.3.4:443
```

When the reply arrives at `203.0.113.5`, the router looks up the destination port in conntrack and knows which internal host to forward to.

---

## DNAT — Destination NAT (Port Forwarding)

**DNAT** rewrites the *destination* IP (and often port) of inbound packets. This is port forwarding — making an internal service reachable from the internet.

```
Internet → router (203.0.113.5:8080) → internal server (192.168.1.100:80)

Rule: DNAT destination 203.0.113.5:8080 → 192.168.1.100:80

INBOUND:
  Original:  src=5.6.7.8:4444, dst=203.0.113.5:8080
  After DNAT: src=5.6.7.8:4444, dst=192.168.1.100:80

OUTBOUND reply:
  Original:  src=192.168.1.100:80, dst=5.6.7.8:4444
  After SNAT: src=203.0.113.5:8080, dst=5.6.7.8:4444
```

Load balancers at L4 (like AWS NLB or HAProxy in TCP mode) are essentially DNAT — they rewrite the destination to one of the backend servers.

---

## Connection Tracking

NAT requires **stateful** packet inspection. The router must remember active connections to reverse NAT on replies.

```
conntrack entry lifecycle:
1. SYN packet: new entry created (state: SYN_SENT)
2. SYN-ACK: entry updated (state: ESTABLISHED)
3. FIN: entry being torn down (state: TIME_WAIT)
4. Timeout: entry removed (typically 30s-120s after close)
```

**Conntrack table limits:** Production servers doing lots of NAT can exhaust the conntrack table (`nf_conntrack: table full, dropping packet`). The default limit is 65,536 entries on many Linux systems. Tune with `net.netfilter.nf_conntrack_max`.

**UDP conntrack:** UDP is stateless, so conntrack uses a timeout (typically 30s). This is why UDP-based services behind NAT may see connection drops on idle links — the NAT entry expires and the router doesn't know where to send the reply.

---

## CGNAT — Carrier-Grade NAT

ISPs ran out of IPv4 addresses too. CGNAT (RFC 6598) adds another layer of NAT between the ISP and customers.

```
Your device (100.64.x.x) → ISP CGNAT → ISP public IP → internet
```

CGNAT uses the `100.64.0.0/10` range (shared address space). Consequences:
- Your "public" IP is actually a shared ISP IP with thousands of customers
- Port forwarding to your home server is impossible
- P2P applications (BitTorrent, gaming, WebRTC) struggle — NAT traversal required
- Logs that say "user at IP X.X.X.X" may mean thousands of users

---

## NAT in Docker

Docker's default bridge network (`docker0`) uses NAT heavily:

```
Container (172.17.0.2) → docker0 bridge → iptables MASQUERADE → eth0 (host IP) → internet
```

**Port publishing (`-p 8080:80`):**
```
iptables -t nat -A DOCKER -p tcp --dport 8080 -j DNAT --to-destination 172.17.0.2:80
```

When you run `docker run -p 8080:80 nginx`, Docker adds DNAT rules that forward `host:8080` → `container:80`.

**Container-to-container:** On the same bridge, no NAT — they communicate directly via bridge IP. Different bridges or hosts require NAT or overlay networking.

---

## NAT in Kubernetes

Kubernetes has NAT at multiple levels:

**Pod-to-Service (kube-proxy):**
```
Pod → ClusterIP:443 → iptables DNAT → Pod running the service
```
`kube-proxy` writes iptables/IPVS rules that DNAT ClusterIP addresses to actual pod IPs.

**NodePort:**
```
External → Node:30080 → iptables DNAT → Pod:80
```

**LoadBalancer (cloud):**
```
External LB IP → Cloud LB → Node:NodePort → iptables DNAT → Pod
```

**Connection tracking scale:** Large Kubernetes clusters hit iptables/conntrack limits. This is one reason eBPF-based CNIs (Cilium) and IPVS mode were developed — to avoid conntrack for high-throughput traffic.

---

## NAT Traversal: The Problem

NAT fundamentally breaks peer-to-peer connectivity. A client behind NAT cannot receive inbound connections — the NAT router doesn't know which internal host to forward to without an existing conntrack entry.

**Solutions:**

**STUN (Session Traversal Utilities for NAT):**
A client connects to a public STUN server to discover its public IP:port as seen from outside the NAT. Uses this to share its "reflexive address" with peers.

**TURN (Traversal Using Relays around NAT):**
When STUN fails (symmetric NAT), a relay server forwards all traffic. Fallback for WebRTC.

**ICE (Interactive Connectivity Establishment):**
WebRTC's framework that tries: direct connection → STUN → TURN in order. This is why WebRTC works even when both users are behind NAT.

**Hole Punching:**
Both peers simultaneously send packets to each other's NAT-translated address. The packets create conntrack entries on both NAT routers, allowing subsequent packets through. Works with full-cone and restricted NAT; fails with symmetric NAT.

---

## Why NAT Is Considered a Hack

NAT violates the end-to-end principle of the internet:
- Any host should be able to directly communicate with any other host
- NAT breaks this — behind NAT, you can only initiate connections, not receive them (without setup)
- Some protocols (FTP, SIP, H.323) embed IP addresses in the payload — NAT breaks them unless the router does deep packet inspection to rewrite those too (Application Layer Gateways)

IPv6 was supposed to eliminate NAT by giving every device a globally unique public IP. In practice, NAT has become so deeply embedded in network security models (it implicitly acts as a firewall) that many IPv6 deployments still use NAT or network-level firewalls that have the same effect.

---

## Quick Reference

| Type | Rewrites | Direction | Example |
|------|---------|-----------|---------|
| SNAT / Masquerade | Source IP | Outbound | Home router, cloud NAT gateway |
| DNAT / Port Forward | Destination IP:port | Inbound | Port forwarding, load balancer |
| Full NAT | Both | Both | Firewalls doing stateful inspection |
| CGNAT | Source IP (at ISP) | Outbound | ISP sharing IPs across customers |

```bash
# View NAT rules on Linux
iptables -t nat -L -n -v

# View conntrack table
conntrack -L
cat /proc/net/nf_conntrack

# Check conntrack table size
sysctl net.netfilter.nf_conntrack_max
sysctl net.netfilter.nf_conntrack_count
```
