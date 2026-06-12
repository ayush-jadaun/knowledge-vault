---
title: "Paxos"
description: "The consensus algorithm that underlies distributed systems theory — single-decree Paxos, Multi-Paxos, roles, phases, why it works, and why Raft replaced it in practice."
tags: [distributed-systems, consensus, paxos, algorithms, fault-tolerance]
difficulty: "advanced"
prerequisites: [system-design/distributed-systems/flp-impossibility, system-design/distributed-systems/distributed-transactions]
lastReviewed: "2026-06-12"
---

# Paxos

Paxos is the consensus algorithm. Published by Leslie Lamport in 1989 (circulated as a manuscript; finally published in 1998), it was the dominant solution to distributed consensus for 20+ years. Google Chubby, Apache Zookeeper (ZAB is Paxos-derived), and Google Spanner all build on Paxos or direct derivatives.

Understanding Paxos matters not because you'll implement it (use Raft instead), but because it reveals *why* consensus is hard and what the minimum requirements for solving it are.

---

## The Problem

Multiple nodes must agree on a single value. Requirements:
- **Safety** — at most one value is ever chosen
- **Liveness** — some value is eventually chosen (assuming enough nodes are up)
- **Validity** — only a proposed value can be chosen

This is [consensus](/system-design/distributed-systems/flp-impossibility) — and FLP proves it's impossible in a fully asynchronous system. Paxos sidesteps FLP by assuming partial synchrony (messages eventually arrive).

---

## Roles

Every node can play any or all roles simultaneously.

| Role | Responsibility |
|------|---------------|
| **Proposer** | Proposes a value; drives the protocol forward |
| **Acceptor** | Votes on proposals; remembers what it has accepted |
| **Learner** | Learns the chosen value once consensus is reached |

In practice: every node is a proposer, acceptor, and learner. One node is typically the **distinguished proposer** (leader) to avoid dueling proposers.

---

## Single-Decree Paxos (The Classic)

Reaches agreement on **one value, one time**. Two phases:

### Phase 1: Prepare / Promise

```
Proposer → Acceptors: Prepare(n)
Acceptors → Proposer: Promise(n, accepted_value_if_any)
```

1. Proposer chooses a proposal number `n` (must be unique and higher than any it's used before)
2. Sends `Prepare(n)` to a majority of acceptors
3. Each acceptor that receives `Prepare(n)`:
   - If `n` > any promise it has already made: promises not to accept any proposal numbered < `n`, responds with the highest-numbered proposal it has already accepted (if any)
   - Otherwise: ignores or rejects

### Phase 2: Accept / Accepted

```
Proposer → Acceptors: Accept(n, v)
Acceptors → Proposer: Accepted(n, v)
```

4. If proposer receives promises from a majority:
   - If any acceptor returned an already-accepted value, the proposer **must** use the value with the highest proposal number
   - Otherwise, proposer can use its own value `v`
5. Proposer sends `Accept(n, v)` to a majority
6. Each acceptor that receives `Accept(n, v)`:
   - If it hasn't promised to ignore proposals < `n`: accepts and sends `Accepted(n, v)` to learner(s)
   - Otherwise: ignores

7. When a learner hears `Accepted(n, v)` from a majority: value `v` is **chosen**

---

## Why It Works

The magic is in the constraint: **if a value has already been chosen, no future round can choose a different value.**

Here's why: If `v` was chosen in round `n`, that means a majority `Q1` accepted it. Any future proposer in round `m > n` must get promises from a majority `Q2`. Since any two majorities overlap (quorum intersection), at least one node in `Q2` was also in `Q1`. That node will report `(n, v)` in its promise, forcing the new proposer to propose `v` again.

```
Round n: Majority Q1 accepts (n, v) → v is chosen
Round m: New proposer contacts majority Q2
         Q1 ∩ Q2 ≠ ∅ → at least one node reports (n, v)
         Proposer must use v → safety preserved ✓
```

---

## Multi-Paxos

Single-decree Paxos agrees on one value. Real systems need a replicated log — an ordered sequence of commands. Multi-Paxos runs Paxos instances for each log slot.

**Optimization:** Phase 1 is expensive (two round trips). If the same leader runs consecutive instances, Phase 1 can be skipped for subsequent slots (the leader's promises from the first round cover all future rounds until it steps down).

```
First log entry:   Phase1 + Phase2  (two round trips)
Subsequent entries: Phase2 only     (one round trip)
```

This is how Google Chubby and ZooKeeper achieve decent performance despite the theoretical overhead.

---

## The Dueling Proposers Problem

What if two proposers compete simultaneously?

```
Proposer A: Prepare(n=1)     → accepted
Proposer B: Prepare(n=2)     → accepted (invalidates A's promise)
Proposer A: Accept(n=1, vA)  → rejected (promised n≥2)
Proposer A: Prepare(n=3)     → accepted (invalidates B's promise)
Proposer B: Accept(n=2, vB)  → rejected
...forever
```

Two proposers can livelock, each invalidating the other's promises. Paxos can live-lock indefinitely — it violates liveness.

**Solution:** Elect a distinguished proposer (leader). Only the leader runs Phase 1. If the leader fails, elect a new one. This is the same approach Raft formalizes.

---

## Paxos vs Raft

| | Paxos | Raft |
|---|---|---|
| **Log replication** | Multi-Paxos (add-on) | Built-in |
| **Leader election** | External mechanism | Built-in, well-specified |
| **Log matching** | Possible gaps, complex reconciliation | Strict ordering, no gaps |
| **Understandability** | Notoriously difficult | Designed for understandability |
| **Implementation** | Hard to get right | Hard but much better-specified |
| **Performance** | Comparable | Comparable |

Lamport himself called Paxos hard to understand and implement correctly. A 2014 Stanford paper showed that even engineers who thought they understood Paxos often implemented it incorrectly. Raft was designed explicitly to be easier to understand — and it succeeded.

**Use Raft for new implementations.** Use Paxos knowledge to understand ZooKeeper, Chubby, and Spanner internals.

---

## Variants

**Byzantine Paxos (BFT Paxos):** Handles Byzantine (malicious) failures, not just crash-stop. Requires 3f+1 nodes to tolerate f failures. Used in blockchain and high-security systems.

**Fast Paxos:** Allows clients to send values directly to acceptors in the common case, reducing latency by one round trip. Falls back to classic Paxos on conflict.

**Cheap Paxos:** Reduces the number of full participants needed for fault tolerance using auxiliary replicas.

**Flexible Paxos (FPaxos):** Generalizes quorum requirements — Phase 1 and Phase 2 quorums don't both need to be majorities, as long as they overlap. Enables latency/fault-tolerance trade-offs.

---

## Real-World Usage

**Google Chubby:** Distributed lock service. Uses Multi-Paxos for its replicated log. Powers Bigtable tablet server election and GFS master election.

**Apache Zookeeper (ZAB):** ZooKeeper Atomic Broadcast is a Paxos variant optimized for primary-backup replication. Powers Kafka's controller election, HBase master election, and countless other systems.

**Google Spanner:** Uses Paxos groups for each tablet (data shard). Combines Paxos with TrueTime (GPS/atomic clock-based) to achieve external consistency across globally distributed data.

**etcd:** Uses Raft (Paxos successor), but understanding Paxos explains why etcd is designed the way it is.

---

## The Paxos Complexity Problem

Lamport's original paper described Paxos as a solution to the consensus problem. What it didn't describe was:

- How to handle leader election
- How to handle log gaps and holes
- How to handle leader changes mid-stream
- How to perform log compaction
- How to handle Byzantine failures

Each of these requires additional algorithms. Real Paxos implementations are 10-20x more complex than the algorithm itself. This is why Raft, which addresses all of these in a single coherent design, became the practical consensus algorithm of choice.

---

## Summary

Paxos proves that consensus is achievable despite failures. It does so with elegant minimalism: two phases, three roles, one quorum intersection invariant. Everything else in distributed consensus theory is either a simplification (Raft), an extension (Multi-Paxos), or a generalization (Flexible Paxos) of this core idea.

| Property | Guarantee |
|----------|-----------|
| **Safety** | Only one value ever chosen |
| **Liveness** | Progress if a majority of acceptors are reachable (no dueling proposers) |
| **Fault tolerance** | Tolerates f failures with 2f+1 acceptors |
| **Message complexity** | O(n) per round (n = number of acceptors) |
