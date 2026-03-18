# Knowledge Vault

The most comprehensive engineering knowledge base ever assembled — from first principles to research-level depth.

**470+ pages | 350,000+ lines | 30 system design interviews | 8 cheat sheets | 5 learning paths**

[Live Site](https://knowledge-vault-five.vercel.app) · [System Design Interviews](https://knowledge-vault-five.vercel.app/system-design-interviews/) · [Cheat Sheets](https://knowledge-vault-five.vercel.app/cheat-sheets/)

---

## What's Inside

| Section | Pages | What You'll Learn |
|---------|-------|-------------------|
| **System Design** | 65+ | Distributed systems, databases, caching, message queues, consensus, load balancing, networking |
| **Architecture Patterns** | 35+ | Microservices, event-driven, CQRS, hexagonal, clean architecture, DDD |
| **Infrastructure** | 55+ | Terraform, Kubernetes, Docker, AWS, GCP, CI/CD, multi-region |
| **Security** | 40+ | OWASP Top 10, authentication, encryption, secrets management, zero trust, API security |
| **DevOps** | 30+ | Monitoring, logging, alerting, deployment strategies, incident response, chaos engineering |
| **Performance** | 25+ | Profiling, optimization, caching strategies, database tuning, edge computing |
| **Data Engineering** | 20+ | Stream processing, data modeling, pipeline patterns, CDC, orchestration |
| **Prompt Engineering** | 20+ | 500+ prompts for engineering, product, UI, and architecture |
| **UI & Design Systems** | 35+ | Typography, color tokens, spacing, accessibility, dark mode, animations |
| **Production Blueprints** | 40+ | Billing engine, notification service, realtime pipeline, rate limiter, job queue, A/B testing |
| **System Design Interviews** | 30 | Instagram, Uber, YouTube, WhatsApp, Netflix, Spotify, and 24 more — full walkthroughs |
| **Learning Paths** | 5 | Backend, DevOps, Frontend, Security, System Design Interview |
| **Cheat Sheets** | 8 | Docker, Kubernetes, Git, SQL, TypeScript, Linux, Redis, Terraform |

## Every Page Includes

- **Why it exists** — the problem it solves, historical context
- **First principles** — fundamental concepts from scratch
- **Architecture diagrams** — Mermaid diagrams for every system
- **Production code** — TypeScript/Go, not pseudocode
- **Edge cases & failure modes** — what goes wrong and how to handle it
- **Performance characteristics** — Big-O, benchmarks, real numbers
- **Mathematical foundations** — proofs and formal models (KaTeX)
- **Real-world war stories** — production incidents and lessons learned
- **Decision frameworks** — when to use, when not to, comparison tables

## Tech Stack

- **VitePress** — static site generator
- **Mermaid** — architecture diagrams
- **KaTeX** — mathematical formulas
- **Pagefind** — full-text search
- **Vercel** — deployment
- **GitHub Actions** — CI/CD with incremental build detection

## Local Development

```bash
# Install dependencies
npm install

# Start dev server (instant hot reload)
npm run docs:dev

# Full build (requires ~16GB RAM)
npm run docs:build

# Preview production build
npm run docs:preview
```

## Contributing

Found an error? Want to improve a page? PRs welcome.

1. Fork the repo
2. Edit any `.md` file in `docs/`
3. Submit a PR

Every page has an "Edit this page on GitHub" link at the bottom.

## License

MIT
