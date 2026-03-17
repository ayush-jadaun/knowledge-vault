---
title: Engineering Prompts
description: Battle-tested prompts for debugging, code generation, refactoring, testing, and architecture review — designed for professional software engineers working with LLMs daily.
tags: [prompt-engineering, software-engineering, debugging, code-generation, refactoring, testing, architecture-review]
difficulty: beginner
prerequisites: [prompt-engineering/index]
lastReviewed: "2026-03-17"
---

# Engineering Prompts

This section contains **175+ prompts** purpose-built for software engineering workflows. Every prompt has been tested against real codebases, across multiple LLMs, and refined until it consistently produces outputs that a senior engineer would accept without major revision.

## Who This Is For

You write code for a living. You have opinions about error handling. You know what a flaky test feels like at 2 AM. These prompts are written by engineers who share that context — they assume you already know how to code and want the AI to operate at your level.

## How These Prompts Are Organized

Each prompt entry follows a consistent structure:

```
### Prompt Title
**Category:** Where it fits in your workflow
**When to use:** The specific situation that calls for this prompt
**Prompt:**
> The actual text you send to the AI

**Example input:** What you would paste alongside the prompt
**Expected output quality:** What a good response looks like
**Variations:** Alternative phrasings for different contexts
```

## The Five Subcategories

### Debugging Prompts — 50+ prompts

The largest section, because debugging is where most engineering time goes. Covers:
- General debugging and root cause analysis
- Performance profiling and optimization
- Memory leak identification
- Race condition diagnosis
- Production incident triage
- Log and error trace analysis

Use these when you have a bug and need a second pair of eyes that has seen every Stack Overflow answer ever written.

**[Go to Debugging Prompts →](./debugging-prompts)**

### Architecture Review Prompts — 50+ prompts

For evaluating existing systems or reviewing proposed designs. Covers:
- System design evaluation
- Scalability analysis
- Security posture review
- API design assessment
- Database schema review
- Infrastructure and deployment review
- Code-level architecture review

Use these when you need a thorough review that goes beyond "looks good to me."

**[Go to Architecture Review Prompts →](./architecture-review-prompts)**

### Code Generation Prompts — 50+ prompts

For generating production-quality code, not toy examples. Covers:
- API endpoint generation (Express, Fastify, NestJS)
- Database migration and schema generation (Prisma, Drizzle, raw SQL)
- Validation schema generation (Zod, Yup, Joi)
- React component generation
- Test generation (unit, integration, e2e)
- Boilerplate and scaffolding
- TypeScript type generation
- Documentation generation

Use these when you know exactly what you want and need the AI to write it correctly on the first try.

**[Go to Code Generation Prompts →](./code-generation-prompts)**

### Refactoring Prompts — 25+ prompts

For improving existing code without changing behavior. Covers:
- Method and class extraction
- Conditional simplification
- Duplication removal
- Naming improvements
- Complexity reduction
- Design pattern application

Use these when the code works but makes you wince every time you open the file.

**[Go to Refactoring Prompts →](./refactoring-prompts)**

### Testing Prompts — 25+ prompts

For generating tests and improving test strategy. Covers:
- Unit test generation
- Integration test design
- Edge case identification
- Test data generation
- Test strategy and coverage review

Use these when you need to go from 40% test coverage to 90% without writing every test by hand.

**[Go to Testing Prompts →](./testing-prompts)**

## Prompt Selection Guide

Not sure which prompt to use? Start here:

| Situation | Start With |
|---|---|
| Something is broken and I do not know why | Debugging Prompts |
| I need to write new code quickly | Code Generation Prompts |
| The code works but is ugly or fragile | Refactoring Prompts |
| I need to review a PR or design doc | Architecture Review Prompts |
| I need more tests or better tests | Testing Prompts |
| A production alert just fired | Debugging > Production Incident Prompts |
| I am designing a new system | Architecture Review > System Design |
| I need to generate types from an API | Code Generation > TypeScript Types |

## Tips for Engineering Prompts

### Always Include Your Tech Stack

The difference between a generic answer and a usable one is context. Always state:
- Language and version (TypeScript 5.3, Python 3.12, Go 1.22)
- Framework (Next.js 14, FastAPI, Gin)
- Database (PostgreSQL 16, MongoDB 7, Redis 7)
- Runtime (Node 20, Bun 1.1, Deno 2)

### Paste Real Code, Not Descriptions

Instead of: "I have a function that fetches users and filters them"
Do: Paste the actual function. The AI catches bugs in code, not in your summary of code.

### Specify Output Constraints

- "Return only the modified function, not the entire file"
- "Include error handling for network failures and invalid input"
- "Use async/await, not callbacks or .then() chains"
- "Follow the existing code style — semicolons, single quotes, 2-space indent"

### Chain Prompts for Complex Work

For a large feature, do not ask the AI to write everything at once. Instead:
1. Generate the database schema first
2. Generate the API route using the schema from step 1
3. Generate the validation layer referencing the route from step 2
4. Generate the tests using all of the above as context

Each step produces better output because it has focused context.

## Quality Expectations

Every prompt in this section has been evaluated against these criteria:
- **Correctness:** The output compiles/runs without modification in 90%+ of cases
- **Completeness:** Edge cases, error handling, and types are included
- **Style:** Output follows conventional patterns for the given framework
- **Teachability:** The AI explains its reasoning when asked

If a prompt consistently underperforms against these criteria, it is either revised or removed.

## Version History

| Date | Change |
|------|--------|
| 2026-03-17 | Initial release with 175+ prompts across 5 categories |

---

> *"A great engineering prompt does not just describe what you want — it describes the constraints, the context, and the quality bar. The AI fills in the rest."*
