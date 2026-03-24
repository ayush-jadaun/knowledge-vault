# Archon

> *"Give me six hours to chop down a tree and I'll spend four sharpening the axe."* — This is the axe.

The holy grail of engineering knowledge. 950+ sacred texts, from first principles to production mastery.

**950+ pages | 800K+ lines | 48 system design interviews | 23 cheat sheets | 11 learning paths | 69 EDA pages | AI chatbot**

[Live Site](https://knowledge-vault-five.vercel.app) · [Start Here](https://knowledge-vault-five.vercel.app/start-here) · [System Design Interviews](https://knowledge-vault-five.vercel.app/system-design-interviews/) · [Cheat Sheets](https://knowledge-vault-five.vercel.app/cheat-sheets/)

---

## What's Inside

| Section | Pages | What awaits |
|---------|-------|------------|
| **System Design** | 80+ | Distributed systems, databases, caching, message queues, consensus, networking, API design, concurrency, search |
| **System Design Interviews** | 40 | Instagram, Uber, YouTube, Slack, Zoom, Google Docs, GitHub, Reddit, Airbnb, and 31 more |
| **Algorithms & Data Structures** | 10 | Arrays, trees, graphs, DP, sorting, heaps, hash tables, backtracking |
| **Architecture Patterns** | 50+ | Microservices, event-driven, CQRS, DDD, SOLID, FP, design patterns, cloud-native, multi-tenancy |
| **Infrastructure** | 70+ | Terraform, K8s, Docker, AWS, GCP, CI/CD, Nginx, service mesh, observability, Linux internals, storage, FinOps |
| **Security** | 55+ | OWASP, auth, encryption, secrets, zero trust, API security, compliance (GDPR, SOC 2, PCI), authorization (Zanzibar, OPA) |
| **DevOps** | 45+ | Monitoring, logging, alerting, deployment, incident response, SRE, Git, engineering practices, disaster recovery |
| **AI/ML Engineering** | 7 | LLM integration, RAG, vector databases, embeddings, AI agents, ML pipelines |
| **Frontend Engineering** | 10 | Web performance, browser rendering, SSR/SSG, state management, React internals, WebAssembly |
| **Testing** | 8 | Unit, integration, E2E, contract, property-based, TDD/BDD, test architecture |
| **Performance** | 30+ | Profiling, optimization, caching, database tuning, edge computing, load testing, compilers |
| **Data Engineering** | 25+ | Stream processing, data modeling, pipelines, CDC, lakehouse, medallion architecture |
| **Production Blueprints** | 50+ | Auth, billing, notifications, rate limiter, job queue, search, chat, payments, feature flags, and more |
| **Prompt Engineering** | 20+ | 500+ prompts for engineering, product, UI, and architecture |
| **UI & Design Systems** | 35+ | Typography, color tokens, spacing, accessibility, dark mode, animations |
| **Learning Paths** | 9 | Backend, DevOps, Frontend, Security, Interview, Data, AI/ML, Platform, Full-Stack |
| **Cheat Sheets** | 19 | Docker, K8s, Git, SQL, TS, Linux, Redis, Terraform, Python, Go, Rust, Bash, Nginx, PromQL, AWS CLI, kubectl, Helm, GraphQL, Regex |

## Features

- **AI Chatbot** — Ask anything, get answers with page citations (Gemini 2.5 Flash)
- **Knowledge Graph** — Interactive visual map of all 950+ topics
- **Compare Mode** — Side-by-side technology comparison (24 technologies)
- **Pagefind Search** — Full-text search across all pages
- **Keyboard Shortcuts** — Press `?` to see all
- **Bookmarks** — Save pages for later
- **Reading Progress** — Track completion per learning path
- **Focus Mode** — Distraction-free reading
- **Verification System** — Community-verified pages with reviewer badges
- **PWA** — Installable, works offline

## Tech Stack

- **VitePress** — Static site generator
- **Mermaid** — Architecture diagrams
- **KaTeX** — Mathematical formulas
- **Pagefind** — Full-text search (post-build)
- **Gemini 2.5 Flash** — AI chatbot
- **Vercel** — Deployment
- **GitHub Actions** — CI/CD

## Local Development

```bash
# Clone the repo
git clone https://github.com/ayush-jadaun/knowledge-vault.git
cd knowledge-vault

# Install dependencies
npm install

# Start dev server (instant hot reload)
npm run docs:dev

# Open http://localhost:5173
```

### Full Build (for production)

```bash
# Requires ~16GB RAM
npm run docs:build

# Preview the production build
npm run docs:preview
```

### Deploy to Vercel

#### Option 1: GitHub Actions (automatic)

Every push to `main` triggers a build + deploy via GitHub Actions.

**Required GitHub Secrets:**

| Secret | Where to get it |
|--------|----------------|
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) — create a new token |
| `VERCEL_ORG_ID` | Run `vercel link` locally → check `.vercel/project.json` → `orgId` |
| `VERCEL_PROJECT_ID` | Same file → `projectId` |

**Required Vercel Environment Variable:**

| Variable | Where to get it |
|----------|----------------|
| `GEMINI_API_KEY` | [ai.google.dev](https://ai.google.dev) — create a free API key |

Set this in **Vercel Dashboard → Project → Settings → Environment Variables**.

#### Option 2: Manual deploy

```bash
# Build + deploy in one command
npm run deploy
```

### Project Structure

```
docs/                          # All content pages
  .vitepress/
    config.ts                  # VitePress config (nav, sidebar, head)
    sidebar.ts                 # Sidebar structure (957 lines)
    theme/
      style.css                # Custom theme CSS
      components/              # Vue components
        AskAI.vue              # AI chatbot widget
        KnowledgeGraph.vue     # Interactive graph visualization
        CompareMode.vue        # Technology comparison
        SearchButton.vue       # Pagefind search modal
        RelatedPages.vue       # Auto-related pages
        ReadingTime.vue        # Reading time indicator
        Feedback.vue           # "Was this helpful?" widget
        Bookmarks.vue          # Bookmark toggle
        EnhancedUX.vue         # Scroll progress, focus mode, notes
        KeyboardShortcuts.vue  # Keyboard shortcut modal
        VerificationBadge.vue  # Verified/unverified badge
        DifficultyBadges.vue   # Sidebar difficulty dots
        SidebarScroll.vue      # Sidebar + outline tracking
        CodePlayground.vue     # StackBlitz "Run" buttons
  public/
    logo.svg                   # Archon logo
    manifest.json              # PWA manifest
    sw.js                      # Service worker
    feed.xml                   # RSS feed
    ai-context.json            # AI chatbot context index
api/
  chat.js                      # Vercel Edge Function for AI chat
scripts/
  generate-tags.mjs            # Build-time tag index generator
  generate-rss.mjs             # RSS feed generator
  build-context.mjs            # AI context builder
```

## Contributing

Found an error? Want to improve a page?

1. Fork the repo
2. Edit any `.md` file in `docs/`
3. Submit a PR

### Verify a Page

All pages are AI-generated and marked as **Unverified**. Help verify them:

1. Pick a page you're expert in
2. Review the content against authoritative sources
3. Add verification frontmatter + submit PR
4. Your name, GitHub avatar, and LinkedIn appear on the page permanently

Read the full [Verification Guide](https://knowledge-vault-five.vercel.app/verify).

## License

MIT

---

> *"What I cannot create, I do not understand."* — Richard Feynman
