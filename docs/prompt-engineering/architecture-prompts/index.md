---
title: "Architecture Prompts: AI-Assisted System Design and Engineering"
description: "Overview of the architecture prompts collection: system design, scaling, migration, and cost optimization prompt libraries"
tags: [prompt-engineering, architecture, system-design, scaling, migration, cost-optimization]
difficulty: "intermediate"
prerequisites: []
lastReviewed: "2026-03-18"
---

# Architecture Prompts: AI-Assisted System Design and Engineering

## Overview

Architecture decisions are some of the most consequential work engineers do. A poor data model, a flawed distributed systems design, or an ill-considered microservices decomposition can take years to pay down. AI assistants can accelerate architecture work — not by replacing architectural judgment, but by rapidly generating options, stress-testing assumptions, and producing detailed technical specifications for human review.

This section contains four specialized prompt libraries covering the major domains of software architecture work:

## Section Contents

### System Design Prompts
**25+ prompts** for designing complete systems from scratch.

Covers: distributed systems, database design, API design, event-driven architectures, and system design interview preparation. Use these when you need to go from requirements to architecture quickly, or when you want to explore multiple design options before committing.

[Go to System Design Prompts →](./system-design-prompts.md)

### Scaling Prompts
**25+ prompts** for designing scalability into systems and handling growth.

Covers: horizontal scaling strategies, database sharding, caching tiers, CDN architectures, queue-based load leveling, and auto-scaling configurations. Use these when your system is approaching limits or when you need to design for 10x-100x current scale from the start.

[Go to Scaling Prompts →](./scaling-prompts.md)

### Migration Prompts
**25+ prompts** for planning and executing large-scale technical migrations.

Covers: database migrations, monolith-to-microservices, cloud migrations, framework upgrades, and API versioning strategies. Use these when facing a major migration project where the risk of mistakes is high and the need for a structured plan is critical.

[Go to Migration Prompts →](./migration-prompts.md)

### Cost Optimization Prompts
**25+ prompts** for reducing infrastructure and operational costs.

Covers: cloud spend analysis, right-sizing, reserved vs. spot capacity, database query optimization, CDN cost reduction, and FinOps practices. Use these when cloud bills are unexpectedly high or when you need to build a cost-conscious architecture from the start.

[Go to Cost Optimization Prompts →](./cost-optimization-prompts.md)

## How to Use Architecture Prompts Effectively

### Providing the Right Context

Architecture prompts work best when you provide:

1. **Scale requirements**: Current traffic, projected growth, peak vs. average load
2. **Team constraints**: Team size, expertise, existing technology stack
3. **Non-functional requirements**: Latency SLOs, availability targets, compliance requirements
4. **Cost constraints**: Monthly budget, key cost drivers
5. **Existing architecture**: What you currently have, what's working, what's not

### The Architecture Prompt Pattern

Most effective architecture prompts follow this pattern:

```
Context:
- What you're building / what you have
- Current scale / projected scale
- Key constraints (team size, cost, deadline, compliance)

Ask:
- Design [specific system/component]
- Compare [option A] vs [option B]
- Identify risks in [this design]
- Create migration plan for [this change]

Output format:
- Architecture diagram description (for mermaid)
- Component list with responsibilities
- Data flow
- Risk/trade-off analysis
- Implementation sequence
```

### Validating AI Architecture Output

AI-generated architecture should always be validated:

1. **Stress-test assumptions**: Ask the AI to critique its own proposal
2. **Check for known anti-patterns**: Distributed transactions, chatty microservices, N+1 query patterns
3. **Estimate costs**: Use AWS/GCP pricing calculators for proposed infrastructure
4. **Review with your team**: Especially engineers who have implemented similar systems
5. **Prototype before committing**: For novel architecture choices, prototype to validate before full implementation

### Architecture Decision Records

When using these prompts to make architecture decisions, generate an ADR:

```
Generate an Architecture Decision Record (ADR) for:

Decision: [what was decided]
Context: [the situation requiring a decision]
Options considered: [list from prompt exploration]
Decision: [chosen option and rationale]
Consequences: [good and bad consequences of this decision]

Format: MADR (Markdown Architectural Decision Records) format
```

## Prompt Quality Principles

The prompts in this section are designed around these principles:

**Specificity over generality**: "Design a rate limiting system for an API with 10,000 req/s" produces better output than "design rate limiting."

**Trade-off focused**: The best architecture prompts ask for trade-offs, not just recommendations. There is rarely one right answer.

**Iteration friendly**: Start broad, then narrow. Use follow-up prompts to drill into specific components.

**Reality-grounded**: Include your actual constraints — asking for a system with no budget, no team size limits, and no existing technology is an interesting thought experiment but not useful for production work.

## Related Sections

- [UI Prompts](../ui-prompts/) — Component and design system prompts
- [Design System Prompts](../ui-prompts/design-system-prompts.md)
- [Postmortem Framework](../../devops/incident-response/postmortem-framework.md) — For architecture decisions that went wrong
- [Chaos Engineering](../../devops/incident-response/chaos-engineering.md) — For validating your architecture's resilience
