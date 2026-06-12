---
title: "UDP — User Datagram Protocol"
description: "How UDP works, why it's faster than TCP, when to use it, packet loss handling, and how modern protocols (QUIC, DNS, video streaming, gaming) are built on it."
tags: [networking, udp, transport-layer, protocol, quic, dns, streaming]
difficulty: "beginner"
prerequisites: [system-design/networking/osi-model, system-design/networking/tcp-ip-deep-dive]
lastReviewed: "2026-06-12"
---

# UDP — User Datagram Protocol

UDP is TCP's stripped-down sibling. Where TCP provides reliability, ordering, and flow control, UDP provides exactly one thing: a way to send a datagram to a destination. No handshake. No acknowledgment. No retransmission. No guarantees.

This isn't a design flaw — it's a feature. UDP's simplicity makes it the foundation of DNS, video streaming, online gaming, VoIP, and HTTP/3 (QUIC).

---

## The UDP Header

UDP has an 8-byte header — one of the smallest in networking:

```
 0      7 8     15 16    23 24    31
┌────────┬─────────┬────────┬────────┐
│  Source Port     │  Dest Port      │
├─────────────────┬─────────────────┤
│  Length          │  Checksum       │
├─────────────────┴─────────────────┤
│  Data (payload)                    │
└───────────────────────────────────┘
```

That's it. Four fields:
- **Source port** — sender's port (for replies)
- **Destination port** — which process to deliver to
- **Length** — total datagram size including header
- **Checksum** — optional integrity check (mandatory in IPv6)

Compare to TCP's 20-byte minimum header with sequence numbers, ACK numbers, flags, window size, and options.

---

## TCP vs UDP

| Feature | TCP | UDP |
|---------|-----|-----|
| Connection setup | 3-way handshake | None |
| Reliability | ACKs + retransmission | None |
| Ordering | Sequence numbers | None |
| Flow control | Yes (window size) | None |
| Congestion control | Yes (AIMD, slow start) | None |
| Header size | 20+ bytes | 8 bytes |
| Latency | Higher (handshake + ACKs) | Lower |
| Use cases | HTTP, databases, SSH, SMTP | DNS, video, gaming, QUIC |

---

## What "Unreliable" Actually Means

UDP datagrams can be:
- **Lost** — dropped by a congested router, no notification to sender
- **Duplicated** — same datagram delivered twice (rare but possible)
- **Reordered** — arrive in different order than sent
- **Corrupted** — checksum catches this; corrupt packets are dropped silently

The application is responsible for handling all of these if it needs reliability.

---

## Why UDP is Faster

**No connection overhead:** TCP requires a 3-way handshake before any data is sent (1.5 RTT minimum). UDP sends the first datagram immediately.

```
TCP:  Client → SYN → Server
      Client ← SYN-ACK ← Server
      Client → ACK + Data → Server
      (1.5 RTT before server receives data)

UDP:  Client → Data → Server
      (0 RTT — data sent immediately)
```

**No head-of-line blocking:** If a TCP packet is lost, all subsequent packets in the stream wait until the lost packet is retransmitted. With UDP (and QUIC), individual streams are independent.

**No congestion control overhead:** TCP backs off when it detects congestion. UDP sends at whatever rate the application requests (for better or worse).

---

## When to Use UDP

**Use UDP when:**
- Latency matters more than reliability (real-time audio/video, gaming)
- You have your own reliability mechanism (QUIC, application-level ACKs)
- Old data is useless (stock ticks, game state — sending a retransmission of a 50ms-old position update is worse than skipping it)
- Multicast or broadcast is needed (TCP is point-to-point only)
- Small, single-datagram request-response (DNS)

**Use TCP when:**
- All data must arrive and be processed in order (file transfers, databases, web pages)
- You need the established security properties of TLS over TCP
- The protocol assumes reliable delivery

---

## Real-World UDP Applications

### DNS
Every DNS query is a UDP datagram. Port 53. The request and response fit in a single datagram (<512 bytes by default). No connection needed — just send a query, get a response.

DNS falls back to TCP when the response is larger than 512 bytes (e.g., DNSSEC-signed responses, many records).

```
DNS Query (UDP):
  Client → [Query: what is the IP of google.com?] → DNS Server (port 53)
  Client ← [Answer: 142.250.80.46]
```

### Video Streaming (RTP)
Real-time Transport Protocol (RTP) is built on UDP. Live video/audio streams can absorb some packet loss (a dropped frame) but cannot absorb retransmission delay (a retransmitted frame 200ms late is useless for a live stream).

Modern adaptive bitrate streaming (HLS, DASH) actually uses HTTP/TCP for VOD — it's not real-time, so the bufferability of TCP is fine. Only truly live, low-latency streams use UDP-based protocols.

### Online Gaming
Game state updates (positions, actions) are sent via UDP. If a position update is lost, the next one (arriving 50ms later) is more accurate anyway. Retransmitting stale position data would cause worse artifacts than dropping it.

Critical events (player deaths, item pickups) that require reliability use TCP or application-level acknowledgment over UDP.

### VoIP (SIP, RTP)
Voice calls over IP use RTP/UDP. A 20ms audio packet is useless if it arrives 200ms late. Packet loss manifests as a brief click or silence — acceptable. Delayed retransmission manifests as stuttering — not acceptable.

### QUIC / HTTP/3
QUIC is a transport protocol built entirely on UDP. It implements its own reliability, ordering, flow control, and congestion control at the application layer — but without TCP's head-of-line blocking problem. Multiple HTTP/3 streams are independent; a lost packet only blocks the one stream that contains it.

QUIC also builds TLS 1.3 into the handshake — achieving connection establishment + encryption in 1 RTT (or 0-RTT for resumed connections). TCP+TLS requires 3 RTTs minimum.

---

## Implementing Reliability Over UDP

If you need some reliability without full TCP overhead, you can build it yourself:

**ACK + timeout + retransmit:**
```python
# Pseudo-code
def send_with_ack(socket, data, dest):
    seq = next_sequence_number()
    while True:
        socket.sendto(packet(seq, data), dest)
        try:
            ack = socket.recvfrom(timeout=100ms)
            if ack.seq == seq:
                break
        except TimeoutError:
            continue  # retransmit
```

**Sequence numbers for ordering:**
Assign monotonically increasing sequence numbers. Receiver buffers out-of-order packets and delivers in order.

**Selective ACK:**
Instead of ACKing every packet, periodically send "I have up to packet N, plus packets M and P." Sender only retransmits missing packets.

This is essentially what QUIC implements — connection-oriented semantics over UDP, without TCP's kernel-level implementation.

---

## UDP Socket Programming

```python
import socket

# Server
server = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
server.bind(('0.0.0.0', 5005))
while True:
    data, addr = server.recvfrom(65535)
    print(f"Received {data} from {addr}")
    server.sendto(b"pong", addr)

# Client
client = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
client.sendto(b"ping", ('127.0.0.1', 5005))
data, addr = client.recvfrom(65535)
```

No `accept()`, no `connect()` (for servers). Send and receive datagrams directly.

---

## UDP Pitfalls

**Amplification attacks:** UDP is commonly used for DDoS amplification. A small spoofed UDP request can trigger a large response (DNS amplification, NTP monlist, memcached). Always validate sources; rate-limit UDP services.

**Fragmentation:** UDP datagrams larger than the MTU (1500 bytes for Ethernet) get fragmented at the IP layer. Fragments can be lost independently. Prefer UDP payloads under ~1400 bytes (leaving room for IP and UDP headers).

**Firewall/NAT timeouts:** Unlike TCP, UDP has no FIN. NAT tables expire UDP entries after ~30s of inactivity (vs 60-300s for TCP). Long-lived UDP sessions need keepalive packets.

**"Connected" UDP sockets:** You can call `connect()` on a UDP socket. It doesn't establish a connection — it just sets the default destination for `send()` and filters incoming datagrams to only those from that address. Useful for simplifying code, not for connection semantics.
