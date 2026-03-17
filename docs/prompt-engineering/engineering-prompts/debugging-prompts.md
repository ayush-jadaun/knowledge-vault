---
title: Debugging Prompts
description: 50+ battle-tested prompts for debugging, root cause analysis, performance profiling, memory leak detection, race condition diagnosis, production incident triage, and log analysis.
tags: [debugging, prompts, troubleshooting, root-cause-analysis, performance, memory-leaks, race-conditions, production-incidents]
difficulty: intermediate
prerequisites: [prompt-engineering/engineering-prompts/index]
lastReviewed: "2026-03-17"
---

# Debugging Prompts

Debugging is where engineers spend the most time — and where AI provides the highest leverage. A well-structured debugging prompt gives you a senior engineer's perspective in seconds, surfacing root causes that might take hours of manual investigation.

This collection contains **50+ prompts** organized by debugging scenario. Each prompt includes the full text, usage context, example input, expected output quality, and variations.

---

## General Debugging

### 1. Root Cause Analysis from Stack Trace

**Category:** General Debugging
**When to use:** You have a stack trace and need to identify the root cause quickly.

**Prompt:**
> Act as a senior software engineer with 15 years of debugging experience. I will provide a stack trace from my application. Your job is to:
>
> 1. Identify the root cause of the error — not just the line that threw, but the underlying reason.
> 2. Explain the chain of events that led to the failure.
> 3. Provide a concrete fix with code.
> 4. Suggest a defensive coding change that would prevent this class of error in the future.
>
> Tech stack: [YOUR STACK]
>
> Stack trace:
> ```
> [PASTE STACK TRACE]
> ```

**Example input:** A NullPointerException trace from a Spring Boot application showing a chain through a service layer, repository call, and entity mapping.

**Expected output quality:** The AI should identify that the null originates from a missing database record, not from the line that threw. It should suggest adding an `.orElseThrow()` with a meaningful exception or a null check at the service layer, and recommend a repository-level default or constraint.

**Variations:**
- Add "Also check if this error could be caused by a race condition or timing issue" for concurrent systems
- Add "Assume this is running in a Kubernetes pod with 512MB memory limit" for resource-constrained environments
- Replace "senior software engineer" with "senior [language] developer" for language-specific idioms

---

### 2. Bug Reproduction Strategy

**Category:** General Debugging
**When to use:** You can see a bug in production but cannot reproduce it locally.

**Prompt:**
> I have a bug that occurs in production but I cannot reproduce it locally. Help me create a systematic reproduction strategy.
>
> Bug description: [DESCRIBE THE BUG]
> Production environment: [DESCRIBE ENV — OS, runtime version, config differences]
> Local environment: [DESCRIBE LOCAL ENV]
> Frequency: [How often does it happen? Random? Under load? Time-based?]
> What I have tried: [LIST WHAT YOU HAVE ALREADY DONE]
>
> Provide:
> 1. A ranked list of likely environmental differences causing the discrepancy
> 2. Specific steps to make my local environment match production
> 3. A minimal reproduction script or test case
> 4. Logging/instrumentation I should add to narrow down the cause
> 5. A checklist of things to verify before concluding it is environment-specific

**Example input:** A webhook endpoint that returns 500 in production under moderate load but works perfectly in local testing, running on Node.js 20 with Express.

**Expected output quality:** Should identify connection pooling differences, environment variable mismatches, DNS resolution timing, and suggest adding structured logging with correlation IDs at each middleware stage.

**Variations:**
- Add "The bug only occurs on Mondays" for time-dependent issues
- Add "The bug started after our last deployment" for regression-hunting
- Add "Multiple users report this but our monitoring shows no errors" for silent failures

---

### 3. Error Message Decoder

**Category:** General Debugging
**When to use:** You have a cryptic error message and need a plain-English explanation plus fix.

**Prompt:**
> Explain this error message like I am a competent developer who has never seen this specific error before. Do not oversimplify — I understand programming concepts, I just need context for this particular error.
>
> Error: [PASTE ERROR MESSAGE]
> Context: [What were you doing when it occurred?]
> Tech stack: [LANGUAGE, FRAMEWORK, VERSIONS]
>
> Provide:
> 1. What this error literally means
> 2. The three most common causes, ranked by likelihood
> 3. How to diagnose which cause applies to my case
> 4. A fix for each cause
> 5. How to prevent this error from recurring

**Example input:** `ECONNRESET` error during an HTTP request in Node.js.

**Expected output quality:** Should explain that the remote server closed the connection unexpectedly, list causes (server timeout, load balancer idle timeout, network instability), and provide retry logic with exponential backoff.

**Variations:**
- Add "This error occurs intermittently, roughly 1 in 100 requests" for flaky errors
- Add "This only started happening after upgrading [library] from v2 to v3" for upgrade-related issues

---

### 4. Systematic Debugging Plan

**Category:** General Debugging
**When to use:** You are stuck on a bug and do not know where to look next.

**Prompt:**
> I have been debugging this issue for [TIME] and I am stuck. Act as a debugging mentor and help me create a systematic plan to find the root cause.
>
> What I know:
> - Symptom: [WHAT GOES WRONG]
> - When it happens: [CONDITIONS]
> - What I have checked: [LIST]
> - What I have ruled out: [LIST]
>
> Create a debugging plan that:
> 1. Identifies the assumptions I might be making incorrectly
> 2. Lists the specific hypotheses to test, ordered by likelihood and ease of testing
> 3. For each hypothesis, provides the exact command, log query, or code change to test it
> 4. Defines a clear "this hypothesis is confirmed/rejected" criteria for each test
> 5. Suggests what to do if all hypotheses fail

**Expected output quality:** Should challenge assumptions ("Have you verified the request actually reaches your server?"), provide concrete diagnostic commands, and include a decision tree.

**Variations:**
- Add "This is a distributed system with 5 microservices" for distributed debugging
- Add "I do not have production access, only logs" for restricted-access scenarios

---

### 5. Code Behavior Explanation

**Category:** General Debugging
**When to use:** Code produces unexpected output and you need to understand the execution flow.

**Prompt:**
> Walk through this code step by step, tracking the value of every variable at each line. Identify exactly where the actual behavior diverges from the expected behavior.
>
> Code:
> ```
> [PASTE CODE]
> ```
>
> Expected behavior: [WHAT YOU EXPECT]
> Actual behavior: [WHAT ACTUALLY HAPPENS]
>
> Format your response as a table with columns: Line | Variable | Value | Notes
> After the walkthrough, explain the root cause and provide a fix.

**Expected output quality:** A precise execution trace showing variable mutations, with the exact line where behavior diverges highlighted and explained.

**Variations:**
- Add "Include async/Promise resolution order" for async code
- Add "Track closure scope variables separately" for closure-heavy code
- Add "Show the call stack at each step" for recursive code

---

### 6. "Why Does This Work?" Reverse Debugging

**Category:** General Debugging
**When to use:** A fix works but you do not understand why, and you want to avoid cargo-cult programming.

**Prompt:**
> I fixed a bug by making the following change, but I do not fully understand why it works. Explain the underlying mechanism so I can learn from this rather than just memorizing the fix.
>
> Before (broken):
> ```
> [PASTE BROKEN CODE]
> ```
>
> After (working):
> ```
> [PASTE WORKING CODE]
> ```
>
> Explain:
> 1. What was happening at a low level that caused the bug
> 2. Why the fix addresses the root cause (not just the symptom)
> 3. Whether this fix could introduce any new issues
> 4. The general principle I should learn from this

**Expected output quality:** Should provide a deep technical explanation — not just "you added a null check" but "the database driver returns null for empty result sets because of how the JDBC spec handles zero-row queries, and your ORM does not translate this to an empty array because..."

---

### 7. Diff-Based Bug Detection

**Category:** General Debugging
**When to use:** A feature broke after a code change and you need to find the breaking line in a diff.

**Prompt:**
> This code worked before the following changes were made. A bug was introduced somewhere in this diff. Analyze each change and identify which specific modification introduced the bug and why.
>
> The bug symptom: [DESCRIBE]
>
> Diff:
> ```diff
> [PASTE GIT DIFF]
> ```
>
> For each change in the diff:
> 1. State whether it could cause the reported bug (Yes/No/Maybe)
> 2. If Yes or Maybe, explain the mechanism
> 3. Provide a fix that preserves the intended change while fixing the bug

**Expected output quality:** Should systematically evaluate each hunk of the diff and provide a clear verdict with reasoning.

---

### 8. Third-Party Library Error Diagnosis

**Category:** General Debugging
**When to use:** An error originates from a library you did not write and the documentation does not cover your case.

**Prompt:**
> I am getting an error from a third-party library. I need to understand what is happening inside the library to fix my usage of it.
>
> Library: [NAME AND VERSION]
> Error: [ERROR MESSAGE OR BEHAVIOR]
> My code that triggers it:
> ```
> [PASTE YOUR CODE]
> ```
>
> Based on your knowledge of this library's internals:
> 1. What is the library trying to do when this error occurs?
> 2. What input or state causes the library to reach this error path?
> 3. What should I change in my code to avoid triggering this error?
> 4. Is this a known issue? If so, is there a workaround or version that fixes it?

**Expected output quality:** Should demonstrate understanding of the library's internal architecture and provide a fix that aligns with the library's intended usage patterns.

---

## Performance Debugging

### 9. Slow Function Profiling

**Category:** Performance Debugging
**When to use:** A function is measurably slow and you need to identify the bottleneck within it.

**Prompt:**
> Act as a performance engineer. Analyze this function for performance bottlenecks. Assume it is called [FREQUENCY — e.g., "1000 times per second" or "once per page load"].
>
> ```
> [PASTE FUNCTION]
> ```
>
> Provide:
> 1. Time complexity analysis (Big-O) for the current implementation
> 2. Identify the specific line(s) causing the most performance impact
> 3. Memory allocation analysis — where are unnecessary allocations happening?
> 4. An optimized version of the function with comments explaining each optimization
> 5. Benchmark comparison: estimate the speedup factor
> 6. Any trade-offs introduced by the optimization (readability, memory, correctness edge cases)

**Example input:** A function that searches through a nested array of objects, performing string comparisons at each level.

**Expected output quality:** Should identify O(n*m) nested iteration, suggest indexing or hash map pre-computation, provide the optimized code, and note that the optimization trades memory for speed.

**Variations:**
- Add "This function is hot path in a real-time system with a 16ms frame budget" for latency-critical code
- Add "Memory is more constrained than CPU in this environment" to shift optimization focus

---

### 10. Database Query Optimization

**Category:** Performance Debugging
**When to use:** A database query is slow and you have the EXPLAIN output or query plan.

**Prompt:**
> Analyze this slow database query and its execution plan. Provide specific optimizations that will reduce query time.
>
> Query:
> ```sql
> [PASTE QUERY]
> ```
>
> EXPLAIN ANALYZE output:
> ```
> [PASTE EXPLAIN OUTPUT]
> ```
>
> Table sizes: [APPROXIMATE ROW COUNTS]
> Database: [PostgreSQL 16 / MySQL 8 / etc.]
> Current indexes: [LIST EXISTING INDEXES]
>
> Provide:
> 1. What the query planner is doing and why it is slow
> 2. Which specific operations (seq scan, nested loop, sort) are the bottlenecks
> 3. Index recommendations with exact CREATE INDEX statements
> 4. Query rewrite suggestions (if the query itself can be restructured)
> 5. Any schema changes that would help (denormalization, materialized views, partitioning)
> 6. Expected improvement estimate for each suggestion

**Expected output quality:** Should read the EXPLAIN output accurately, identify sequential scans on large tables, suggest composite indexes that match the query's WHERE and JOIN clauses, and provide the exact DDL.

**Variations:**
- Add "This query runs every 5 seconds as part of a dashboard" for recurring query optimization
- Add "I cannot add new indexes due to write-heavy workload" to constrain solutions
- Add "The table is partitioned by date" for partition-aware optimization

---

### 11. API Response Time Analysis

**Category:** Performance Debugging
**When to use:** An API endpoint is slow and you need to identify which layer is causing the delay.

**Prompt:**
> My API endpoint [METHOD] [PATH] has a p95 response time of [TIME]ms. The acceptable threshold is [TARGET]ms. Help me identify where the time is being spent.
>
> Here is what I know:
> - Total response time: [TIME]ms
> - Database query time (from logs): [TIME]ms
> - External API call time: [TIME]ms or N/A
> - Serialization time: [TIME]ms or unknown
>
> The endpoint handler code:
> ```
> [PASTE HANDLER CODE]
> ```
>
> Provide:
> 1. A waterfall breakdown of where time is likely being spent
> 2. The most impactful optimization (the one change that will reduce the most time)
> 3. A list of all optimizations, ordered by impact
> 4. Instrumentation code I should add to measure each segment precisely
> 5. Caching strategy if applicable (what to cache, TTL, invalidation approach)

**Expected output quality:** Should identify N+1 queries, unnecessary serialization, missing caching layers, and provide concrete instrumentation using OpenTelemetry spans or similar.

---

### 12. Frontend Performance Audit

**Category:** Performance Debugging
**When to use:** A web page is slow to load or interact with, and you have Lighthouse or performance trace data.

**Prompt:**
> Analyze this frontend performance data and provide actionable optimizations, ordered by impact.
>
> Lighthouse scores:
> - Performance: [SCORE]
> - LCP: [TIME]
> - FID/INP: [TIME]
> - CLS: [SCORE]
>
> Bundle size: [SIZE]
> Number of network requests on load: [COUNT]
> Framework: [React/Vue/Svelte/etc.] with [SSR/CSR/SSG]
>
> Key component code (the suspected bottleneck):
> ```
> [PASTE COMPONENT]
> ```
>
> Provide:
> 1. The single biggest performance issue and how to fix it
> 2. Quick wins (fixes that take less than 30 minutes)
> 3. Medium-term improvements (1-2 days of work)
> 4. Strategic changes (architecture-level improvements)
> 5. Specific code changes for the component I shared

**Expected output quality:** Should identify render-blocking resources, unnecessary re-renders, unoptimized images, missing code splitting, and provide specific React.memo / useMemo / dynamic import suggestions.

---

### 13. N+1 Query Detection

**Category:** Performance Debugging
**When to use:** You suspect N+1 queries but need to confirm and fix them.

**Prompt:**
> Analyze this code for N+1 query problems. I am using [ORM — Prisma/Sequelize/TypeORM/SQLAlchemy/etc.] with [DATABASE].
>
> ```
> [PASTE CODE — controller, service, or resolver that fetches data]
> ```
>
> For each N+1 problem found:
> 1. Identify the exact line that triggers additional queries
> 2. Show the SQL queries that are generated (approximate is fine)
> 3. Calculate the total query count for N records
> 4. Provide the fix using the ORM's eager loading / include / join syntax
> 5. Show the optimized SQL that should result from the fix
> 6. If the ORM cannot optimize this, provide a raw query alternative

**Expected output quality:** Should identify lazy-loaded relations being accessed in loops, provide the correct `include` / `relations` / `joinedload` syntax, and show the before/after query count.

---

### 14. Memory-Intensive Operation Optimization

**Category:** Performance Debugging
**When to use:** A function processes large datasets and you need to reduce memory usage.

**Prompt:**
> This function processes [DATA SIZE — e.g., "10 million records" or "2GB file"]. It currently uses too much memory. Optimize it for memory efficiency.
>
> Current implementation:
> ```
> [PASTE CODE]
> ```
>
> Constraints:
> - Available memory: [LIMIT]
> - Acceptable processing time increase: [e.g., "up to 2x slower is acceptable"]
> - Must maintain: [CORRECTNESS REQUIREMENTS]
>
> Provide:
> 1. Memory usage analysis of the current implementation
> 2. An optimized version using streaming/chunking/generators
> 3. Memory usage estimate for the optimized version
> 4. Any correctness considerations (ordering, completeness, idempotency)

**Expected output quality:** Should replace array accumulation with streaming, use generators or async iterators, implement chunked processing, and provide memory estimates for both versions.

---

## Memory Leak Debugging

### 15. Memory Leak Detection from Heap Snapshot

**Category:** Memory Leak Debugging
**When to use:** You have a heap snapshot or memory profile showing growth over time.

**Prompt:**
> My [LANGUAGE] application's memory usage grows from [START] to [END] over [DURATION]. Help me identify the memory leak.
>
> Here is what I know:
> - Heap snapshot comparison shows growth in: [OBJECT TYPES if known]
> - The leak correlates with: [ACTIVITY — requests, background jobs, WebSocket connections, etc.]
> - GC is running but memory is not reclaimed
>
> Relevant code (the area I suspect):
> ```
> [PASTE CODE]
> ```
>
> Provide:
> 1. Analysis of the code for common leak patterns
> 2. The specific object(s) likely being retained and why
> 3. A fix that properly releases the retained memory
> 4. A test to verify the leak is fixed (how to measure before/after)
> 5. Monitoring code to detect if this leak recurs

**Expected output quality:** Should identify event listener accumulation, closure-captured references, cache without eviction, or global state growth. Should provide the fix and a verification strategy.

**Variations:**
- Add "This is a long-running Node.js server" for server-side JS leaks
- Add "This is a React SPA that users keep open for 8+ hours" for client-side leaks
- Add "This is a Worker thread that processes jobs" for worker-based leaks

---

### 16. Event Listener Leak Identification

**Category:** Memory Leak Debugging
**When to use:** You suspect event listeners are accumulating and not being cleaned up.

**Prompt:**
> Audit this code for event listener leaks. Identify every place where an event listener is added and verify that it is properly removed during cleanup/unmount/disconnect.
>
> ```
> [PASTE CODE — component, class, or module]
> ```
>
> For each listener found:
> 1. What event is being listened to and on what target
> 2. Is there a corresponding removal? (Yes/No)
> 3. If No, what cleanup code should be added and where
> 4. Are there any subtle issues (anonymous functions preventing removal, wrong `this` binding)?
> 5. Provide the corrected code with proper cleanup

**Expected output quality:** Should catch anonymous arrow functions passed to addEventListener (which cannot be removed by reference), missing cleanup in useEffect return functions, and listeners on global objects like window or document.

---

### 17. Cache Leak Analysis

**Category:** Memory Leak Debugging
**When to use:** An in-memory cache is growing without bound.

**Prompt:**
> This in-memory cache is growing without bound and eventually causes OOM crashes. Analyze the caching strategy and provide a bounded alternative.
>
> Current cache implementation:
> ```
> [PASTE CODE]
> ```
>
> Usage pattern:
> - Items cached per hour: [ESTIMATE]
> - Cache hit rate: [PERCENTAGE if known]
> - Item size: [AVERAGE SIZE]
> - Required freshness: [HOW STALE CAN DATA BE]
>
> Provide:
> 1. Why the current cache grows without bound
> 2. A bounded replacement using LRU, TTL, or both
> 3. The exact implementation with configurable limits
> 4. Memory usage estimate for the bounded cache
> 5. Monitoring to track cache size, hit rate, and eviction rate

**Expected output quality:** Should identify the missing eviction policy, provide an LRU implementation (or recommend a library like `lru-cache`), configure appropriate TTL and max size, and include monitoring hooks.

---

### 18. Closure-Based Memory Leak

**Category:** Memory Leak Debugging
**When to use:** Memory grows and you suspect closures are retaining references to large objects.

**Prompt:**
> Analyze this code for closure-based memory leaks. Identify any closures that capture references to large objects and prevent their garbage collection.
>
> ```
> [PASTE CODE]
> ```
>
> For each leak found:
> 1. Which closure captures which variable
> 2. What object graph is retained as a result
> 3. How long the closure lives (and therefore how long the objects are retained)
> 4. How to break the reference (nulling, WeakRef, restructuring)
> 5. The corrected code

**Expected output quality:** Should identify closures in callbacks, timers, and event handlers that capture outer-scope variables unnecessarily. Should suggest WeakRef where appropriate and demonstrate nulling patterns.

---

## Race Condition Debugging

### 19. Race Condition Identification

**Category:** Race Condition Debugging
**When to use:** You have intermittent bugs that seem timing-dependent.

**Prompt:**
> Analyze this code for race conditions. Assume it runs in a [concurrent environment — e.g., "multi-threaded Java application", "async Node.js server handling 100 concurrent requests", "React component with multiple rapid state updates"].
>
> ```
> [PASTE CODE]
> ```
>
> For each race condition found:
> 1. Describe the exact sequence of events that triggers the bug
> 2. Explain why it is intermittent (what timing makes it appear/disappear)
> 3. What is the observable symptom (data corruption, crash, wrong result, deadlock)
> 4. Provide a fix using appropriate synchronization primitives
> 5. Explain any performance impact of the fix
> 6. Provide a test that can reliably trigger the race condition

**Expected output quality:** Should describe the interleaving with a timeline diagram, identify shared mutable state, and use appropriate primitives (mutex, semaphore, atomic, channel, lock, queue) for the language/runtime.

**Variations:**
- Add "This accesses a shared database without transactions" for database-level races
- Add "This uses optimistic locking that sometimes fails" for OCC-specific issues
- Add "Multiple instances of this service run behind a load balancer" for distributed races

---

### 20. Async/Await Race Condition

**Category:** Race Condition Debugging
**When to use:** Async code has subtle ordering issues.

**Prompt:**
> This async code has a race condition. The operations complete in an unexpected order under certain conditions. Trace through all possible execution orders and identify the problematic interleaving.
>
> ```
> [PASTE ASYNC CODE]
> ```
>
> Provide:
> 1. All possible execution orders (list them)
> 2. Which order(s) produce correct results
> 3. Which order(s) produce incorrect results and what happens
> 4. A fix that ensures correct ordering without unnecessary serialization
> 5. Whether Promise.all, Promise.allSettled, or sequential await is appropriate here

**Expected output quality:** Should enumerate interleavings clearly, identify the dangerous ones, and provide a solution that is both correct and performant (not just making everything sequential).

---

### 21. Database Race Condition

**Category:** Race Condition Debugging
**When to use:** Multiple processes or requests compete on the same database rows.

**Prompt:**
> Multiple concurrent requests can modify the same database records simultaneously. Analyze this code for database-level race conditions.
>
> Application code:
> ```
> [PASTE CODE — read-modify-write pattern]
> ```
>
> Database: [PostgreSQL / MySQL / MongoDB / etc.]
> Isolation level: [READ COMMITTED / REPEATABLE READ / SERIALIZABLE / unknown]
> Expected concurrency: [REQUESTS PER SECOND on the same record]
>
> Provide:
> 1. The specific race condition scenario (step-by-step with two concurrent transactions)
> 2. What data corruption or incorrect behavior results
> 3. Fix options ranked by implementation effort:
>    a. Application-level fix (optimistic locking, version column)
>    b. Database-level fix (SELECT FOR UPDATE, advisory locks)
>    c. Architecture-level fix (queue, serialization)
> 4. The SQL or code for each fix option
> 5. Performance implications of each fix under the stated concurrency

**Expected output quality:** Should demonstrate the lost-update or phantom-read scenario with a concrete timeline, provide working SQL with proper transaction boundaries, and discuss the throughput trade-offs of pessimistic vs. optimistic locking.

---

### 22. React State Race Condition

**Category:** Race Condition Debugging
**When to use:** A React component shows stale data or incorrect state after rapid interactions.

**Prompt:**
> This React component has a race condition where rapid user interactions cause stale or incorrect state. Analyze the state update logic and fix the race condition.
>
> ```tsx
> [PASTE COMPONENT]
> ```
>
> The bug: [DESCRIBE — e.g., "Clicking the button twice quickly causes the counter to increment by 1 instead of 2" or "Typing quickly in the search box shows results for an old query"]
>
> Provide:
> 1. The exact sequence of renders and state updates that causes the bug
> 2. Whether this is a stale closure, batch update, or async race issue
> 3. The fix (useRef for latest value, functional setState, AbortController, debounce, etc.)
> 4. The corrected component code
> 5. A pattern to follow to avoid this class of bug in future components

**Expected output quality:** Should identify stale closures in useEffect, missing cleanup for aborted fetches, or batching issues with rapid setState calls. Should provide the idiomatic React fix.

---

## Production Incident Debugging

### 23. Production Incident Triage

**Category:** Production Incident Debugging
**When to use:** A production alert has fired and you need to triage quickly.

**Prompt:**
> A production incident is in progress. Help me triage and resolve it systematically.
>
> Alert: [WHAT TRIGGERED THE ALERT]
> Impact: [WHO IS AFFECTED AND HOW]
> Start time: [WHEN DID IT START]
> Recent changes: [ANY DEPLOYMENTS OR CONFIG CHANGES IN THE LAST 24 HOURS]
>
> Current metrics:
> - Error rate: [PERCENTAGE]
> - Response time: [P50, P95, P99]
> - CPU/Memory: [UTILIZATION]
> - Queue depth: [IF APPLICABLE]
>
> Provide:
> 1. Immediate mitigation steps (what to do RIGHT NOW to reduce impact)
> 2. Diagnostic steps to identify root cause (ordered by speed, fastest first)
> 3. Likely root causes ranked by probability given the symptoms
> 4. Rollback decision criteria (when to rollback vs. fix forward)
> 5. Communication template for stakeholders

**Expected output quality:** Should prioritize mitigation over diagnosis, provide specific commands to run (not vague suggestions), and include a decision tree for escalation.

---

### 24. Post-Mortem Root Cause Analysis

**Category:** Production Incident Debugging
**When to use:** After an incident is resolved, you need to write a thorough post-mortem.

**Prompt:**
> Help me write a thorough post-mortem for a production incident. I will provide the timeline and you will help me identify root causes, contributing factors, and action items.
>
> Timeline:
> [PASTE CHRONOLOGICAL EVENT LIST]
>
> Impact:
> - Duration: [TOTAL TIME]
> - Users affected: [COUNT OR PERCENTAGE]
> - Revenue impact: [IF KNOWN]
> - Data loss: [YES/NO, DETAILS]
>
> Resolution: [WHAT FIXED IT]
>
> Generate a post-mortem document with:
> 1. Executive summary (3 sentences max)
> 2. Root cause (distinguish between proximate cause and systemic cause)
> 3. Contributing factors (things that made the incident worse or harder to resolve)
> 4. What went well (things that worked during the response)
> 5. What went poorly (things that slowed down the response)
> 6. Action items with owners, priority (P0/P1/P2), and due dates
> 7. Detection improvements (how to catch this faster next time)
> 8. Prevention improvements (how to prevent this class of incident)

**Expected output quality:** Should distinguish between "the deploy had a bug" (proximate) and "we have no integration tests for this flow" (systemic). Action items should be specific and measurable.

---

### 25. Deployment Rollback Decision

**Category:** Production Incident Debugging
**When to use:** A deployment might be causing issues and you need to decide whether to rollback.

**Prompt:**
> A recent deployment may be causing production issues. Help me decide whether to rollback or fix forward.
>
> Deployment details:
> - Deployed at: [TIME]
> - Changes included: [SUMMARY OF CHANGES]
> - Database migrations: [YES/NO — are they reversible?]
> - Feature flags: [WHAT IS BEHIND FLAGS]
>
> Current symptoms:
> [DESCRIBE WHAT IS HAPPENING]
>
> Metrics comparison (before vs. after deploy):
> [PROVIDE METRICS]
>
> Provide:
> 1. Confidence level that the deployment caused the issue (High/Medium/Low) with reasoning
> 2. Rollback risk assessment (what could go wrong during rollback)
> 3. Fix-forward feasibility (can this be patched quickly?)
> 4. Decision recommendation with clear reasoning
> 5. Step-by-step rollback procedure if that is the recommendation
> 6. Verification steps to confirm the rollback/fix resolved the issue

**Expected output quality:** Should weigh irreversible migrations, data that has been written in the new format, and customer-facing impact against the speed of each option.

---

### 26. Cascading Failure Analysis

**Category:** Production Incident Debugging
**When to use:** One service failure is causing other services to fail.

**Prompt:**
> A cascading failure is propagating through our system. Help me identify the blast radius and containment strategy.
>
> System architecture:
> [DESCRIBE SERVICE DEPENDENCIES — or paste a dependency diagram]
>
> Initial failure:
> - Service: [WHICH SERVICE FAILED FIRST]
> - Failure mode: [TIMEOUT / ERROR / OOM / CRASH]
> - Time: [WHEN]
>
> Current state:
> [WHICH SERVICES ARE NOW AFFECTED AND HOW]
>
> Provide:
> 1. The cascade path — how the failure propagated from service to service
> 2. Immediate containment steps (circuit breakers, feature flags, traffic shedding)
> 3. Which services to restart first (dependency-aware ordering)
> 4. Backpressure and queue drain strategy
> 5. Architectural changes to prevent cascade in the future (bulkheads, timeouts, fallbacks)

**Expected output quality:** Should map the failure propagation, identify the point of maximum leverage for containment, and suggest circuit breaker configurations with specific timeout/threshold values.

---

## Log Analysis

### 27. Log Pattern Analysis

**Category:** Log Analysis
**When to use:** You have a large volume of logs and need to find patterns related to an issue.

**Prompt:**
> Analyze these log entries and identify patterns related to [THE ISSUE]. The logs are from [TIME RANGE] and cover [NUMBER] of events.
>
> Logs:
> ```
> [PASTE REPRESENTATIVE LOG SAMPLE — 50-100 lines]
> ```
>
> I am looking for:
> 1. Correlations between events (what consistently happens before the error?)
> 2. Frequency patterns (is there a time-based pattern?)
> 3. Anomalies (what is unusual compared to normal operation?)
> 4. Missing events (what should appear in the logs but does not?)
> 5. A grep/jq/awk command to extract more data points from the full log file

**Expected output quality:** Should identify temporal patterns, correlate request IDs across log entries, and provide exact regex or jq commands for deeper analysis.

**Variations:**
- Add "These logs are in JSON format" for structured log analysis
- Add "These logs are from multiple services, identified by the service field" for distributed tracing
- Add "I have 50GB of logs and need to query them efficiently" for scale-aware analysis

---

### 28. Error Rate Spike Diagnosis

**Category:** Log Analysis
**When to use:** Error rates jumped suddenly and you need to correlate with a cause.

**Prompt:**
> Our error rate spiked from [BASELINE]% to [CURRENT]% starting at [TIME]. Help me diagnose the cause from these error logs.
>
> Error log sample (from the spike period):
> ```
> [PASTE ERRORS]
> ```
>
> Normal error log sample (from before the spike):
> ```
> [PASTE NORMAL ERRORS]
> ```
>
> Recent events:
> - Deployments: [LIST WITH TIMES]
> - Config changes: [LIST WITH TIMES]
> - Infrastructure changes: [LIST WITH TIMES]
> - External dependency changes: [IF KNOWN]
>
> Provide:
> 1. What is different about the errors during the spike vs. before
> 2. Correlation with the listed recent events
> 3. Whether the errors are from a single root cause or multiple
> 4. The most likely cause with supporting evidence
> 5. Verification steps to confirm the diagnosis

**Expected output quality:** Should compare error signatures, identify new error types that appeared during the spike, and correlate timestamps with deployment or config change times.

---

### 29. Log Query Construction

**Category:** Log Analysis
**When to use:** You need to write complex log queries for tools like Elasticsearch, CloudWatch, Datadog, or Splunk.

**Prompt:**
> I need to query my logs to investigate [ISSUE]. Help me write queries for [LOG PLATFORM — CloudWatch Insights / Elasticsearch / Datadog / Splunk / Loki].
>
> Log format:
> ```
> [SHOW ONE EXAMPLE LOG LINE WITH ALL FIELDS]
> ```
>
> What I need to find:
> 1. [FIRST QUERY DESCRIPTION]
> 2. [SECOND QUERY DESCRIPTION]
> 3. [THIRD QUERY DESCRIPTION]
>
> For each query, provide:
> - The exact query syntax for my platform
> - What the results will look like
> - How to interpret the results
> - A follow-up query to drill deeper based on likely findings

**Expected output quality:** Should provide syntactically correct queries for the specified platform, not generic pseudo-queries.

---

### 30. Distributed Trace Analysis

**Category:** Log Analysis
**When to use:** You have a distributed trace showing a slow or failed request across multiple services.

**Prompt:**
> Analyze this distributed trace for a request that [TOOK TOO LONG / FAILED]. Identify the bottleneck or failure point.
>
> Trace (spans with timing):
> ```
> [PASTE TRACE — service name, operation, duration, status for each span]
> ```
>
> Expected total time: [TARGET]ms
> Actual total time: [ACTUAL]ms
>
> Provide:
> 1. A waterfall diagram (text-based) showing the trace
> 2. Which span is the bottleneck and why
> 3. Whether spans are running sequentially that could run in parallel
> 4. Where retries or timeouts are adding delay
> 5. Optimization recommendations ordered by impact
> 6. What additional instrumentation would help diagnose this faster next time

**Expected output quality:** Should produce a clear visual waterfall, identify the critical path, and suggest concrete optimizations like parallelizing independent service calls or adjusting timeout configurations.

---

## Error Trace Analysis

### 31. Multi-Language Stack Trace Correlation

**Category:** Error Trace Analysis
**When to use:** An error spans multiple services written in different languages.

**Prompt:**
> This error propagates across multiple services written in different languages. Help me trace the error from origin to user impact.
>
> Service A ([LANGUAGE]) error:
> ```
> [PASTE STACK TRACE]
> ```
>
> Service B ([LANGUAGE]) error (triggered by Service A):
> ```
> [PASTE STACK TRACE]
> ```
>
> Service C ([LANGUAGE]) error (user-facing):
> ```
> [PASTE STACK TRACE]
> ```
>
> Provide:
> 1. The originating error (where did this actually start?)
> 2. How the error transformed as it crossed service boundaries
> 3. Whether any service swallowed important context during error propagation
> 4. A fix at the origin that prevents the cascade
> 5. Better error handling at each boundary to preserve diagnostic information

**Expected output quality:** Should trace the error back to its origin, identify where error context was lost (e.g., a service catching an exception and throwing a generic "Internal Error"), and suggest structured error propagation.

---

### 32. Segmentation Fault / Core Dump Analysis

**Category:** Error Trace Analysis
**When to use:** You have a segfault or core dump from a C/C++/Rust/Go application.

**Prompt:**
> My application crashed with a segmentation fault. Help me analyze the core dump information.
>
> Signal: [SIGSEGV / SIGABRT / etc.]
> Backtrace:
> ```
> [PASTE GDB BACKTRACE OR EQUIVALENT]
> ```
>
> Relevant source code near the crash:
> ```
> [PASTE CODE]
> ```
>
> Provide:
> 1. What the program was doing when it crashed (translate the backtrace to plain English)
> 2. The most likely cause of the invalid memory access
> 3. Whether this is a null pointer dereference, use-after-free, buffer overflow, or stack overflow
> 4. A fix for the root cause
> 5. Static analysis flags or compiler options that would catch this at build time

**Expected output quality:** Should correctly interpret the backtrace, identify the faulting instruction, and provide both a fix and preventive measures.

---

### 33. Unhandled Promise Rejection Trace

**Category:** Error Trace Analysis
**When to use:** Node.js unhandled promise rejections that crash the process.

**Prompt:**
> My Node.js application is crashing with unhandled promise rejections. The stack trace is often unhelpful because the rejection happens asynchronously.
>
> Error:
> ```
> [PASTE UNHANDLED REJECTION ERROR]
> ```
>
> Relevant async code:
> ```
> [PASTE CODE]
> ```
>
> Provide:
> 1. Where the unhandled rejection originates (the Promise that was not caught)
> 2. Why the normal try/catch or .catch() is not catching this
> 3. A fix that properly handles the rejection
> 4. A global safety net (process.on unhandledRejection handler) with proper logging
> 5. ESLint or TypeScript rules that would catch missing await/catch at compile time
> 6. How to enable async stack traces for better debugging (--async-stack-traces)

**Expected output quality:** Should identify floating promises (promise-returning calls without await), missing error handlers in Promise.all, and provide both the specific fix and global hardening.

---

### 34. TypeScript Type Error Decoding

**Category:** Error Trace Analysis
**When to use:** TypeScript produces a long, confusing type error and you need to understand what it means.

**Prompt:**
> Decode this TypeScript error message into plain English and tell me how to fix it.
>
> Error:
> ```
> [PASTE THE FULL TYPESCRIPT ERROR]
> ```
>
> My code:
> ```typescript
> [PASTE RELEVANT CODE]
> ```
>
> Type definitions (if relevant):
> ```typescript
> [PASTE TYPE DEFINITIONS]
> ```
>
> Provide:
> 1. What the error is saying in one clear sentence
> 2. The specific type mismatch — what TypeScript expects vs. what it received
> 3. The fix (modified code)
> 4. Whether the fix should be a type assertion, a type guard, a generic constraint, or a redesign
> 5. If I should use `as` or `any`, explain why it is safe in this case or suggest a safer alternative

**Expected output quality:** Should simplify deeply nested generic errors into understandable terms, show the exact line and type relationship that fails, and prefer type-safe fixes over assertions.

---

### 35. OOM Kill Analysis

**Category:** Error Trace Analysis
**When to use:** A process was killed by the OS due to out-of-memory and you need to understand why.

**Prompt:**
> My process was OOM-killed. Help me understand the memory usage pattern and find the leak or misconfiguration.
>
> OOM kill log:
> ```
> [PASTE DMESG / KERNEL LOG / CONTAINER LOG]
> ```
>
> Process details:
> - Language/runtime: [e.g., Node.js 20, JVM 21, Go 1.22]
> - Configured memory limit: [e.g., "-Xmx4g" or container memory limit]
> - Normal memory usage: [BASELINE]
> - Memory at time of kill: [IF KNOWN]
> - Workload at time of kill: [WHAT WAS HAPPENING]
>
> Provide:
> 1. Interpretation of the OOM kill log
> 2. Whether the limit is too low or there is a genuine leak
> 3. If a leak: likely cause based on the runtime and workload
> 4. Diagnostic steps to capture heap dumps before the next OOM
> 5. Tuning recommendations (GC settings, memory limits, swap configuration)

**Expected output quality:** Should interpret the kernel OOM messages correctly, distinguish between under-provisioning and genuine leaks, and provide runtime-specific diagnostic commands.

---

## Advanced Debugging Patterns

### 36. Heisenbug Investigation

**Category:** Advanced Debugging
**When to use:** A bug disappears when you try to observe it (adding logging changes the timing enough to make it go away).

**Prompt:**
> I have a Heisenbug — it disappears when I add logging or use a debugger. This suggests it is timing-sensitive. Help me investigate without changing the timing.
>
> Bug description: [WHAT HAPPENS]
> Frequency: [HOW OFTEN]
> It disappears when I: [ADD LOGGING / ATTACH DEBUGGER / ADD BREAKPOINTS]
>
> Code suspected to be involved:
> ```
> [PASTE CODE]
> ```
>
> Provide:
> 1. Non-intrusive observation techniques (core dumps, ptrace, eBPF, perf, DTrace)
> 2. Timing-neutral logging approaches (ring buffers, post-mortem dumps)
> 3. Code analysis for timing-dependent patterns (cache effects, branch prediction, compiler optimizations)
> 4. A hypothesis for why adding observation changes the behavior
> 5. A test that can reproduce the bug reliably

**Expected output quality:** Should explain why observation changes timing (I/O introduces delays, debugger disables optimizations), suggest non-intrusive tools specific to the platform, and hypothesize about instruction reordering or cache line effects.

---

### 37. Deadlock Detection

**Category:** Advanced Debugging
**When to use:** An application hangs completely and you suspect a deadlock.

**Prompt:**
> My application appears to be deadlocked — it is completely unresponsive but the process is still running (not crashed).
>
> Thread dump / goroutine dump:
> ```
> [PASTE THREAD DUMP]
> ```
>
> Lock/mutex usage in the code:
> ```
> [PASTE RELEVANT CODE]
> ```
>
> Provide:
> 1. Identify the deadlock cycle (which threads are waiting for which locks)
> 2. Draw the dependency graph (text-based)
> 3. The specific sequence of events that creates the deadlock
> 4. A fix that breaks the cycle (lock ordering, tryLock with timeout, restructuring)
> 5. A runtime deadlock detector I can add to catch this earlier

**Expected output quality:** Should produce a clear lock dependency graph, identify the cycle, and provide a fix that is both correct and does not simply add a timeout (which masks the problem).

---

### 38. Data Corruption Investigation

**Category:** Advanced Debugging
**When to use:** Data in your database or storage does not match what it should be.

**Prompt:**
> We discovered data corruption in our [DATABASE / STORAGE]. Some records have incorrect values and I need to find out how and when they were corrupted.
>
> Expected data format:
> ```
> [SHOW CORRECT EXAMPLE]
> ```
>
> Corrupted data examples:
> ```
> [SHOW 3-5 CORRUPTED EXAMPLES]
> ```
>
> Patterns I have noticed: [ANY PATTERNS — e.g., "all corrupted records were modified in the last 48 hours"]
>
> Code that writes to this table/collection:
> ```
> [PASTE ALL CODE PATHS THAT MODIFY THIS DATA]
> ```
>
> Provide:
> 1. Analysis of the corruption pattern — what transformation was applied to the data?
> 2. Which code path likely caused the corruption and why
> 3. A query to find ALL corrupted records
> 4. A script to fix the corrupted data (with safety checks and dry-run mode)
> 5. Guards to prevent this corruption from recurring

**Expected output quality:** Should analyze the corruption pattern (character encoding issues, partial writes, race conditions, migration bugs), identify the responsible code path, and provide a safe repair script with dry-run capability.

---

### 39. Flaky Test Investigation

**Category:** Advanced Debugging
**When to use:** A test passes sometimes and fails sometimes with no code changes.

**Prompt:**
> This test is flaky — it passes on some runs and fails on others with no code changes. Help me find and fix the source of non-determinism.
>
> Test code:
> ```
> [PASTE TEST]
> ```
>
> Code under test:
> ```
> [PASTE IMPLEMENTATION]
> ```
>
> Failure rate: approximately [PERCENTAGE]
> Failure message when it fails: [ERROR]
> It seems to fail more often: [ON CI / LOCALLY / UNDER LOAD / ON MONDAYS / RANDOMLY]
>
> Provide:
> 1. All sources of non-determinism in the test and code under test
> 2. The most likely cause of flakiness, ranked by probability
> 3. For each source: how to make it deterministic (mock, seed, freeze time, etc.)
> 4. The fixed test code
> 5. A way to run the test 100 times locally to verify the fix

**Expected output quality:** Should identify time-dependency, random ordering, shared state between tests, network calls, race conditions in async tests, and provide deterministic alternatives for each.

---

### 40. Environment-Specific Bug

**Category:** Advanced Debugging
**When to use:** Code works in one environment but fails in another.

**Prompt:**
> This code works in [ENV A] but fails in [ENV B]. Help me identify the environmental difference causing the failure.
>
> Working environment: [DESCRIBE — OS, runtime version, config, hardware]
> Failing environment: [DESCRIBE — OS, runtime version, config, hardware]
>
> Error in failing environment:
> ```
> [PASTE ERROR]
> ```
>
> Code:
> ```
> [PASTE RELEVANT CODE]
> ```
>
> Provide:
> 1. All environmental differences that could affect this code
> 2. The most likely culprit, ranked
> 3. A diagnostic script that checks for the relevant environmental factors
> 4. A fix that works in both environments
> 5. A CI check that would catch environment-specific failures

**Expected output quality:** Should identify OS path differences (forward slash vs backslash), DNS resolution differences, TLS version differences, locale settings, file system case sensitivity, and more.

---

### 41. Dependency Conflict Resolution

**Category:** Advanced Debugging
**When to use:** Multiple dependencies require different versions of the same transitive dependency.

**Prompt:**
> I have a dependency conflict in my [PACKAGE MANAGER — npm/yarn/pip/Maven/Gradle] project. Help me resolve it without breaking anything.
>
> Error:
> ```
> [PASTE DEPENDENCY ERROR]
> ```
>
> Relevant sections of [package.json / requirements.txt / pom.xml / build.gradle]:
> ```
> [PASTE DEPENDENCY DECLARATIONS]
> ```
>
> Provide:
> 1. What is conflicting and why (draw the dependency tree)
> 2. The safest resolution strategy
> 3. The specific version changes or overrides needed
> 4. How to verify nothing broke after the resolution
> 5. How to prevent this from recurring (lockfile practices, version ranges, renovation)

**Expected output quality:** Should produce a dependency tree showing the conflict, provide exact version pins or overrides, and explain the trade-offs of each approach.

---

### 42. SSL/TLS Connection Debugging

**Category:** Advanced Debugging
**When to use:** HTTPS connections fail with certificate or handshake errors.

**Prompt:**
> My application is failing to establish a TLS connection to [TARGET]. Help me diagnose and fix the issue.
>
> Error:
> ```
> [PASTE SSL/TLS ERROR]
> ```
>
> Environment: [LANGUAGE/RUNTIME, OS, CERTIFICATE SETUP]
> Target: [HOSTNAME:PORT]
>
> Provide:
> 1. What the TLS error specifically means
> 2. Diagnostic commands to run (openssl s_client, curl -v, etc.)
> 3. Common causes ranked by likelihood:
>    - Certificate expiry
>    - Certificate chain issues (missing intermediate)
>    - Hostname mismatch
>    - Self-signed certificate in non-dev environment
>    - TLS version mismatch
>    - Cipher suite incompatibility
> 4. The fix for the most likely cause
> 5. How to configure proper certificate validation (do not just disable it)

**Expected output quality:** Should provide specific openssl and curl commands, identify the exact certificate chain issue, and provide a fix that maintains security (not just `rejectUnauthorized: false`).

---

### 43. Containerization Bug Debugging

**Category:** Advanced Debugging
**When to use:** Something works outside Docker but fails inside a container.

**Prompt:**
> My application works on my host machine but fails when running inside a Docker container. Help me debug the container-specific issue.
>
> Dockerfile:
> ```dockerfile
> [PASTE DOCKERFILE]
> ```
>
> Error when running in container:
> ```
> [PASTE ERROR]
> ```
>
> Works on host: [OS, RUNTIME VERSION]
> Container base image: [IMAGE:TAG]
>
> Provide:
> 1. Common containerization issues that match this error:
>    - File path differences
>    - Missing system dependencies
>    - User permission issues (root vs non-root)
>    - Network configuration (DNS, localhost vs container networking)
>    - Environment variable differences
>    - Filesystem differences (case sensitivity, /tmp, /dev)
> 2. The most likely cause given the error
> 3. Dockerfile fixes
> 4. Docker run flags that might be needed
> 5. A diagnostic docker run command to inspect the container state

**Expected output quality:** Should identify the specific container difference (Alpine vs Debian library differences, missing locale, wrong user permissions) and provide the Dockerfile fix.

---

### 44. Timezone and Locale Bug

**Category:** Advanced Debugging
**When to use:** Date/time or string handling produces different results in different environments or for different users.

**Prompt:**
> My application handles dates/times or strings incorrectly for some users or in some environments. The issue appears to be timezone or locale related.
>
> Expected behavior: [WHAT SHOULD HAPPEN]
> Actual behavior: [WHAT HAPPENS INSTEAD]
> It works correctly for: [WHICH USERS/ENVIRONMENTS]
> It fails for: [WHICH USERS/ENVIRONMENTS]
>
> Code:
> ```
> [PASTE DATE/TIME OR STRING HANDLING CODE]
> ```
>
> Provide:
> 1. The timezone/locale assumption in the code that is incorrect
> 2. Why it works in some environments (they happen to match the assumption)
> 3. The correct approach using timezone-aware / locale-aware methods
> 4. Fixed code that works regardless of server or user timezone/locale
> 5. Test cases covering different timezones and locales
> 6. Common timezone pitfalls to check for in the rest of the codebase

**Expected output quality:** Should identify implicit timezone assumptions (new Date() uses server timezone, not user timezone), missing UTC conversions, locale-dependent string comparisons, and provide a robust fix.

---

### 45. WebSocket Connection Debugging

**Category:** Advanced Debugging
**When to use:** WebSocket connections drop, fail to establish, or behave inconsistently.

**Prompt:**
> My WebSocket connection is [DROPPING / FAILING TO ESTABLISH / SENDING DUPLICATE MESSAGES / LOSING MESSAGES]. Help me debug the issue.
>
> Client code:
> ```
> [PASTE CLIENT WS CODE]
> ```
>
> Server code:
> ```
> [PASTE SERVER WS CODE]
> ```
>
> Environment:
> - Server: [FRAMEWORK, WS LIBRARY]
> - Client: [BROWSER / NODE / MOBILE]
> - Infrastructure: [DIRECT / BEHIND NGINX / BEHIND LOAD BALANCER / BEHIND CDN]
>
> Symptoms:
> [DETAILED DESCRIPTION]
>
> Provide:
> 1. The most likely cause given the infrastructure setup
> 2. Whether the issue is at the application, proxy, or network layer
> 3. Proxy/load balancer configuration changes needed (timeout, upgrade headers)
> 4. Application-level fixes (heartbeat, reconnection logic, message buffering)
> 5. A robust reconnection strategy with exponential backoff

**Expected output quality:** Should identify proxy timeout misconfigurations, missing Connection: Upgrade headers, load balancer sticky session requirements, and provide both infrastructure config and application code fixes.

---

### 46. GraphQL Error Debugging

**Category:** Advanced Debugging
**When to use:** GraphQL queries return unexpected errors, null fields, or wrong data.

**Prompt:**
> My GraphQL [QUERY / MUTATION / SUBSCRIPTION] is returning [UNEXPECTED ERROR / NULL FOR NON-NULL FIELD / WRONG DATA]. Help me debug it.
>
> Query:
> ```graphql
> [PASTE QUERY]
> ```
>
> Schema (relevant types):
> ```graphql
> [PASTE SCHEMA TYPES]
> ```
>
> Resolver code:
> ```
> [PASTE RESOLVER]
> ```
>
> Response:
> ```json
> [PASTE RESPONSE]
> ```
>
> Provide:
> 1. Whether the error is in the query, schema, or resolver
> 2. The specific field/resolver causing the issue
> 3. The fix with corrected code
> 4. Whether the schema nullability is correct (should the field be nullable?)
> 5. Error handling best practices for this resolver

**Expected output quality:** Should trace through the GraphQL resolution process, identify field-level resolver errors, and suggest both the fix and schema improvements.

---

### 47. Authentication/Authorization Bug

**Category:** Advanced Debugging
**When to use:** Users are incorrectly authenticated or authorized (or denied when they should be allowed).

**Prompt:**
> Users are experiencing [AUTHENTICATION / AUTHORIZATION] issues. Some users who should have access are being denied, or vice versa.
>
> Auth system: [JWT / SESSION / OAuth / SAML]
> Permission model: [RBAC / ABAC / ACL]
>
> The token/session data:
> ```json
> [PASTE DECODED TOKEN OR SESSION DATA — REDACT SECRETS]
> ```
>
> The middleware/guard code:
> ```
> [PASTE AUTH MIDDLEWARE]
> ```
>
> The specific failure:
> - User role: [ROLE]
> - Attempting to access: [RESOURCE/ENDPOINT]
> - Expected: [ALLOWED / DENIED]
> - Actual: [ALLOWED / DENIED]
>
> Provide:
> 1. The specific check that is passing/failing incorrectly
> 2. Whether the issue is in token generation, token validation, or permission evaluation
> 3. The fix
> 4. Edge cases in the auth logic that could cause similar issues
> 5. Test cases for the auth middleware covering all roles and edge cases

**Expected output quality:** Should trace through the auth decision tree, identify the specific condition that evaluates incorrectly (string vs. number comparison, case sensitivity, array vs. string role check), and provide comprehensive test cases.

---

### 48. CORS Error Resolution

**Category:** Advanced Debugging
**When to use:** Browser requests fail with CORS errors.

**Prompt:**
> My frontend application at [ORIGIN] is getting CORS errors when making requests to my API at [API ORIGIN].
>
> Error message:
> ```
> [PASTE BROWSER CONSOLE ERROR]
> ```
>
> Current CORS configuration:
> ```
> [PASTE CORS MIDDLEWARE/CONFIG]
> ```
>
> The request that fails:
> - Method: [GET/POST/PUT/DELETE/PATCH]
> - Headers: [LIST CUSTOM HEADERS]
> - Content-Type: [TYPE]
> - Credentials: [YES/NO — cookies, Authorization header]
>
> Provide:
> 1. Why CORS is blocking this specific request (not a generic explanation — the specific reason)
> 2. Whether the issue is with the preflight (OPTIONS) or the actual request
> 3. The exact CORS configuration needed (origin, methods, headers, credentials)
> 4. The server code fix
> 5. Common CORS mistakes to avoid (wildcard with credentials, missing preflight handler)

**Expected output quality:** Should identify the specific CORS violation (missing header in Access-Control-Allow-Headers, wildcard origin with credentials, missing OPTIONS handler), not just provide a generic "allow everything" config.

---

### 49. Infinite Loop / Infinite Recursion Detection

**Category:** Advanced Debugging
**When to use:** An application hangs or crashes due to an infinite loop or stack overflow from infinite recursion.

**Prompt:**
> My application [HANGS / CRASHES WITH STACK OVERFLOW]. I suspect an infinite loop or infinite recursion. Help me find it.
>
> Code:
> ```
> [PASTE CODE]
> ```
>
> Symptoms:
> - CPU usage: [e.g., "pegged at 100%"]
> - Stack trace (if available):
> ```
> [PASTE STACK TRACE]
> ```
>
> Provide:
> 1. The exact loop or recursion that does not terminate
> 2. The missing or incorrect termination condition
> 3. The specific input or state that triggers the infinite case
> 4. A fix with proper termination conditions and guards
> 5. A safeguard (max iteration count, max recursion depth) to prevent hangs even if another path triggers this

**Expected output quality:** Should identify the exact cycle, show the input that causes it, and provide both a correct termination condition and a defensive depth/iteration guard.

---

### 50. Configuration Debugging

**Category:** Advanced Debugging
**When to use:** An application behaves differently than expected and you suspect a misconfiguration.

**Prompt:**
> My application is not behaving as expected and I suspect it is a configuration issue. The configuration is loaded from [SOURCES — env vars, config files, CLI args, defaults].
>
> Expected behavior: [WHAT SHOULD HAPPEN]
> Actual behavior: [WHAT HAPPENS]
>
> Configuration sources:
> ```
> [PASTE .env, config.yaml, or config object]
> ```
>
> Configuration loading code:
> ```
> [PASTE CONFIG LOADING LOGIC]
> ```
>
> Provide:
> 1. What configuration value is likely wrong or missing
> 2. The precedence order of configuration sources and whether a lower-priority source is overriding a higher-priority one
> 3. Environment variable name mismatches (typos, case sensitivity, prefix issues)
> 4. Default value issues (a default that was meant for development leaking into production)
> 5. A diagnostic that prints the effective configuration with the source of each value
> 6. A validation step that fails fast on startup if required configuration is missing

**Expected output quality:** Should identify the specific misconfiguration, trace which source provided the wrong value, and suggest config validation using a library like Zod or Joi.

---

### 51. Regex Debugging

**Category:** Advanced Debugging
**When to use:** A regular expression does not match what you expect, or matches too much.

**Prompt:**
> This regex is not working as expected. Help me debug it and fix it.
>
> Regex: `[PASTE REGEX]`
> Flags: [g, i, m, s, u, etc.]
> Language: [JavaScript / Python / Go / Java / etc.]
>
> Test cases:
> | Input | Expected Match | Actual Match |
> |-------|---------------|--------------|
> | [INPUT1] | [EXPECTED1] | [ACTUAL1] |
> | [INPUT2] | [EXPECTED2] | [ACTUAL2] |
> | [INPUT3] | [EXPECTED3] | [ACTUAL3] |
>
> Provide:
> 1. A step-by-step breakdown of what the regex currently matches and why
> 2. The specific part of the regex that causes the mismatch
> 3. The corrected regex
> 4. An explanation of the corrected regex in plain English
> 5. Additional test cases I should verify against
> 6. Whether the regex is at risk of catastrophic backtracking (ReDoS)

**Expected output quality:** Should break down the regex token by token, identify greedy vs. lazy quantifier issues, character class mistakes, and provide the fix with a ReDoS safety assessment.

---

### 52. Build System Debugging

**Category:** Advanced Debugging
**When to use:** Builds fail, produce wrong output, or take too long.

**Prompt:**
> My build is [FAILING / PRODUCING WRONG OUTPUT / EXTREMELY SLOW]. Help me debug the build configuration.
>
> Build tool: [webpack / Vite / esbuild / tsc / Gradle / Make / Bazel / etc.]
> Build config:
> ```
> [PASTE BUILD CONFIG]
> ```
>
> Error or issue:
> ```
> [PASTE BUILD OUTPUT]
> ```
>
> Provide:
> 1. The root cause of the build issue
> 2. The specific configuration entry that is wrong
> 3. The fix with corrected configuration
> 4. How to verify the fix (what the correct build output looks like)
> 5. Build optimization suggestions if the config has performance issues

**Expected output quality:** Should understand the build tool's configuration format, identify the specific misconfigured entry, and provide a working fix with build performance tips.

---

### 53. Network Request Debugging

**Category:** Advanced Debugging
**When to use:** HTTP requests return unexpected responses, timeout, or fail silently.

**Prompt:**
> My HTTP request to [URL] is [TIMING OUT / RETURNING WRONG STATUS / RETURNING UNEXPECTED BODY / FAILING SILENTLY].
>
> Request code:
> ```
> [PASTE REQUEST CODE]
> ```
>
> Expected response: [STATUS CODE, BODY SHAPE]
> Actual response: [WHAT YOU GET]
>
> curl equivalent (if you have tested with curl):
> ```
> [PASTE CURL COMMAND AND RESULT]
> ```
>
> Provide:
> 1. Diagnostic steps to isolate whether the issue is in the client code, server, or network
> 2. Common causes for this type of failure
> 3. A curl command that replicates the exact request from my code (headers, body, method)
> 4. The fix based on the most likely cause
> 5. Retry and error handling improvements for robustness

**Expected output quality:** Should identify header mismatches, content-type issues, redirect handling differences, and provide a diagnostic curl command that exactly matches the programmatic request.

---

### 54. Git Merge Conflict Resolution

**Category:** Advanced Debugging
**When to use:** You have merge conflicts and are not sure which version is correct.

**Prompt:**
> I have a merge conflict and I need help understanding what both sides changed and which version to keep (or how to combine them).
>
> Conflict:
> ```
> [PASTE THE CONFLICT MARKERS AND SURROUNDING CODE]
> ```
>
> Context:
> - My branch is implementing: [WHAT YOUR BRANCH DOES]
> - The other branch (main/target) changed: [WHAT THE OTHER SIDE CHANGED]
>
> Provide:
> 1. What each side changed and why (interpret the intent from the code)
> 2. Whether the changes conflict semantically or just textually
> 3. The correct resolution that preserves both sides' intent
> 4. The merged code (without conflict markers)
> 5. Any tests I should run after resolving to verify correctness

**Expected output quality:** Should understand the semantic intent of both sides, not just do a line-by-line comparison, and produce a merged version that satisfies both requirements.

---

### 55. Encoding and Character Set Debugging

**Category:** Advanced Debugging
**When to use:** Text appears garbled, mojibake, or special characters are lost.

**Prompt:**
> Text in my application is being corrupted — characters appear garbled or are replaced with question marks or rectangles.
>
> Expected text: [WHAT IT SHOULD LOOK LIKE]
> Actual text: [WHAT IT LOOKS LIKE — paste the garbled version]
>
> The text passes through these systems:
> 1. [SOURCE — e.g., user input in browser]
> 2. [TRANSPORT — e.g., HTTP POST with application/json]
> 3. [STORAGE — e.g., PostgreSQL with specific encoding]
> 4. [RETRIEVAL — e.g., API response to frontend]
>
> Provide:
> 1. At which stage the encoding corruption is happening
> 2. The specific encoding mismatch (e.g., UTF-8 data decoded as Latin-1)
> 3. How to verify which encoding is being used at each stage
> 4. The fix at the correct layer
> 5. How to prevent encoding issues in the pipeline permanently

**Expected output quality:** Should identify the encoding mismatch from the mojibake pattern, trace it to the specific stage, and provide fixes at the database, application, and transport layers.

---

> *"The best debugging prompt does not just describe the bug — it provides the stack trace, the code, the environment, and what you have already tried. Give the AI enough context to be your smartest colleague, not your most frustrating one."*
