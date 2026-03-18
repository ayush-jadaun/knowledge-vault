---
title: "A/B Testing System Overview"
description: "Production A/B testing infrastructure: assignment, tracking, analysis pipeline, and statistical rigor"
tags: [ab-testing, experimentation, statistics, feature-flags, product-analytics]
difficulty: "intermediate"
prerequisites: []
lastReviewed: "2026-03-18"
---

# A/B Testing System

## Why A/B Testing Infrastructure Matters

Product intuition is wrong more often than it's right. Dozens of studies at major tech companies have found that only 10–30% of A/B tests show statistically significant improvement. Building features based on intuition has roughly 70% chance of neutral or negative impact.

Proper A/B testing infrastructure solves three problems:
1. **Bias elimination** — without random assignment, selection effects confound results (users who see a new feature may be the users most likely to convert regardless)
2. **Statistical rigor** — without power analysis and significance testing, you'll see false positives and stop tests too early
3. **Scale** — running 5 simultaneous experiments manually is manageable; running 50 requires automation

The major tech companies (Netflix, Airbnb, Microsoft, Booking.com) run thousands of experiments simultaneously. Their infrastructure investments — statistical frameworks, assignment services, automated analysis — are what makes this possible.

## Architecture Overview

```mermaid
flowchart TB
    subgraph Clients["Client Layer"]
        Web[Web App]
        Mobile[Mobile App]
        API[API Consumer]
    end

    subgraph Assignment["Assignment Service"]
        AS[Assignment API]
        FS[Feature Flag Store]
        HR[Hash Router]
    end

    subgraph Tracking["Event Tracking"]
        EL[Event Logger]
        KF[Kafka / Event Bus]
    end

    subgraph Analysis["Analysis Pipeline"]
        CH[ClickHouse / Data Warehouse]
        AP[Analysis Service]
        DB[Results Dashboard]
    end

    subgraph Config["Experiment Config"]
        EC[Experiment Manager]
        MG[Mutual Exclusion Groups]
    end

    Web & Mobile & API -->|getVariant(userId, expId)| AS
    AS <--> FS
    AS --> HR
    HR -->|variant assignment| Web & Mobile & API

    Web & Mobile & API -->|trackEvent(userId, event)| EL
    EL --> KF
    KF --> CH
    CH --> AP
    AP --> DB

    EC -->|config| FS
    EC -->|exclusion rules| MG
    MG -->|check conflicts| AS
```

## Core Concepts

### Experiment Structure

```typescript
interface Experiment {
  id: string;
  name: string;
  description: string;
  hypothesis: string;            // "Changing button color increases CTR"
  primaryMetric: string;         // "click_through_rate"
  guardrailMetrics: string[];    // ["page_load_time", "error_rate"]
  variants: Variant[];
  targeting: TargetingRules;
  exclusionGroups: string[];     // Mutual exclusion with other experiments
  startDate: string;
  endDate?: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'archived';
  minSampleSize: number;         // Calculated from power analysis
  confidenceLevel: number;       // 0.95 = 95% confidence
}

interface Variant {
  id: string;
  name: string;           // "control", "treatment-a", "treatment-b"
  weight: number;         // Traffic allocation 0–1 (must sum to 1.0)
  config: Record<string, unknown>;  // Feature configuration
}

interface TargetingRules {
  userAttributes?: Record<string, unknown>;
  percentage?: number;    // % of eligible users to include
  countries?: string[];
  deviceTypes?: string[];
  accountAgeMinDays?: number;
}
```

### Assignment Guarantee: Sticky and Deterministic

The most critical property of assignment: **the same user must always see the same variant**. If user A sees the control on Monday and the treatment on Tuesday, their behavior data is contaminated.

Assignment is deterministic using hash functions — no state storage required for basic assignment:

```
variant = hash(userId + experimentId) mod 100 → bucket → variant
```

Details in [Assignment Algorithms](./assignment-algorithms).

## Section Contents

| Page | Topics |
|------|--------|
| [Architecture](./architecture) | Assignment service, tracking pipeline, analysis infrastructure |
| [Statistical Significance](./statistical-significance) | p-values, confidence intervals, power analysis, sequential testing |
| [Feature Flag Integration](./feature-flag-integration) | Targeting rules, mutual exclusion, holdout groups |
| [Assignment Algorithms](./assignment-algorithms) | MurmurHash, bucketing, sticky assignment, namespace isolation |
| [Analysis Pipeline](./analysis-pipeline) | Metric computation, guardrail metrics, CUPED variance reduction |

## Common Pitfalls

### 1. Peeking at Results

The most common mistake: checking significance multiple times and stopping when $p < 0.05$. This inflates false positive rate dramatically.

$$P(\text{at least one false positive} | \text{check every day for 10 days}) \approx 1 - (1 - 0.05)^{10} \approx 40\%$$

Solution: pre-commit to a sample size, don't peek, or use sequential testing (SPRT).

### 2. Multiple Testing Problem

Running 20 metrics simultaneously means you'll likely see at least one $p < 0.05$ by chance alone. Apply Bonferroni correction:

$$\alpha_{adjusted} = \frac{\alpha}{m}$$

where $m$ is the number of metrics tested.

### 3. Network Effects (SUTVA Violation)

The **Stable Unit Treatment Value Assumption (SUTVA)** requires that one user's treatment doesn't affect another user's outcome. This is violated when:
- Social features: user A sees a new notification, which affects user B
- Marketplace dynamics: showing A a lower price reduces inventory seen by B
- Caching: treatment user's data is cached and served to control user

Solution: cluster randomization (randomize by household, company, or geographic area).

### 4. Novelty Effect

New features often show a spike in engagement from novelty alone, which fades after 1–2 weeks. Running tests for too short introduces this bias.

Mitigation: run tests for at least 2 weeks, use "time since first exposure" as a covariate.

## Quick Start

```typescript
// Client-side usage
import { ExperimentClient } from './ab-testing';

const client = new ExperimentClient({
  assignmentUrl: 'https://assignments.example.com',
  trackingUrl: 'https://events.example.com',
});

// Get variant assignment
const variant = await client.getVariant('checkout-flow-v2', userId);
// Returns: 'control' | 'single-page' | 'multi-step'

// Use variant in UI
if (variant === 'single-page') {
  return <SinglePageCheckout />;
}
return <MultiStepCheckout />;

// Track conversion event
client.track({
  userId,
  event: 'purchase_completed',
  properties: { amount: 99.99, currency: 'USD' },
});
```

::: tip
Track the exposure event (`experiment_viewed`) separately from conversion events. This allows computing conversion rates correctly even for users who saw the experiment but never converted.
:::
