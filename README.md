# Archon

> *"Give me six hours to chop down a tree and I'll spend four sharpening the axe."* — This is the axe.

The holy grail of engineering knowledge. 470+ sacred texts, from first principles to production mastery.

**470+ pages | 350K+ lines | 30 system design interviews | 8 cheat sheets | 5 learning paths | AI chatbot**

[Live Site](https://knowledge-vault-five.vercel.app) · [Start Here](https://knowledge-vault-five.vercel.app/start-here) · [System Design Interviews](https://knowledge-vault-five.vercel.app/system-design-interviews/) · [Cheat Sheets](https://knowledge-vault-five.vercel.app/cheat-sheets/)

---

## What's Inside

| Section | Pages | What awaits |
|---------|-------|------------|
| **System Design** | 65+ | Distributed systems, databases, caching, message queues, consensus, load balancing, networking |
| **System Design Interviews** | 30 | Instagram, Uber, YouTube, WhatsApp, Netflix, Spotify — full walkthroughs |
| **Architecture Patterns** | 35+ | Microservices, event-driven, CQRS, hexagonal, clean architecture, DDD |
| **Infrastructure** | 55+ | Terraform, Kubernetes, Docker, AWS, GCP, CI/CD, multi-region |
| **Security** | 40+ | OWASP Top 10, authentication, encryption, secrets management, zero trust |
| **DevOps** | 30+ | Monitoring, logging, alerting, deployment strategies, incident response |
| **Performance** | 25+ | Profiling, optimization, caching strategies, database tuning, edge computing |
| **Data Engineering** | 20+ | Stream processing, data modeling, pipeline patterns, CDC, orchestration |
| **Production Blueprints** | 40+ | Billing engine, notification service, rate limiter, job queue, A/B testing |
| **Prompt Engineering** | 20+ | 500+ prompts for engineering, product, UI, and architecture |
| **UI & Design Systems** | 35+ | Typography, color tokens, spacing, accessibility, dark mode, animations |
| **Learning Paths** | 5 | Backend, DevOps, Frontend, Security, System Design Interview |
| **Cheat Sheets** | 8 | Docker, Kubernetes, Git, SQL, TypeScript, Linux, Redis, Terraform |

## Features

- **AI Chatbot** — Ask anything, get answers with page citations (Gemini 2.5 Flash)
- **Knowledge Graph** — Interactive visual map of all 470+ topics
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
