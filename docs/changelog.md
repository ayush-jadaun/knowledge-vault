---
title: "Changelog"
description: "What's new in Archon — recent additions and updates"
---

# Changelog

## March 2026

### March 25, 2026 — System Design Mastery

+52 pages. System design section restructured from 90 to 140+ pages.

#### System Design Fundamentals (12 pages)
- How the Internet Works, Client-Server, Scaling Fundamentals, Zero to Million Users, System Design Characteristics, Estimation Practice, Building Blocks Overview, Proxies, Redundancy & Replication, SQL vs NoSQL Decision, How to Read Architecture, System Design Glossary

#### System Design Patterns (12 pages)
- Scalability, Availability, Consistency patterns, Data Partitioning, Communication, ID Generation, Blob Storage, Distributed Logging, Notification Patterns, Search Patterns, Event vs Request Driven, Microservices vs Monolith

#### Interview Mastery (10 pages)
- Framework, Tradeoffs, Mistakes, Templates, Practice Questions, Mock Interview Walkthrough

#### Advanced Architecture (12 pages)
- Database Per Service, CQRS Decision, Serverless, Edge, Multi-Region, Cost of Scale, Anti-Patterns, DDIA Summary, Real-World Architectures, Security in Design, Observability in Design, Design Scenarios

#### LLD Practice (6 pages)
- 30 practice problems (easy/medium/hard), Design Scenarios, Architecture Review Exercises, Decision Log Template

---

### March 25, 2026 — Machine Learning & Deep Learning

**+56 pages. Archon reaches 1,091 pages.**

#### Machine Learning (30 pages)
- **Foundations** (5) — Math for ML (linear algebra, calculus, probability with code), ML workflow, Python ecosystem, data preparation
- **Supervised Learning** (8) — Linear regression (OLS, gradient descent from scratch), logistic regression (MLE derivation), decision trees (CART/Gini/entropy), random forests (bagging, OOB), gradient boosting (XGBoost/LightGBM/CatBoost internals), SVM (kernel trick, Lagrangian), KNN, naive bayes — all with from-scratch NumPy + scikit-learn + real datasets
- **Unsupervised Learning** (5) — Clustering (K-Means/DBSCAN/GMM), dimensionality reduction (PCA/t-SNE/UMAP from scratch), anomaly detection (Isolation Forest), association rules (Apriori), topic modeling (LDA/BERTopic)
- **Evaluation & Selection** (4) — All metrics with math, cross-validation (7 methods), hyperparameter tuning (Optuna), model selection (bias-variance proof)
- **Advanced** (5) — Feature engineering, ensemble methods (stacking from scratch), time series ML (ARIMA), recommendation systems (SVD/ALS from scratch on MovieLens), SHAP/LIME interpretability
- **Reference** (3) — 50-item checklist, algorithm selection flowchart, scikit-learn cheat sheet

#### Deep Learning (25 pages)
- **Foundations** (3) — Neural network basics (backprop derivation from scratch), PyTorch fundamentals, training techniques (BatchNorm, dropout, LR scheduling math)
- **Architectures** (6) — CNN (LeNet→ResNet→EfficientNet), RNN/LSTM (gate equations), Transformers (full attention math from "Attention is All You Need"), VAE (ELBO derivation), GANs (minimax, WGAN), Graph Neural Networks (message passing, PyG)
- **NLP** (4) — Tokenization (BPE from scratch), language models (scaling laws), BERT family (fine-tuning CoLA+NER), text generation (top-k/top-p/temperature math, RLHF)
- **Computer Vision** (3) — Image classification (ViT, transfer learning), object detection (YOLO, DETR), segmentation (U-Net from scratch, SAM)
- **Advanced** (5) — Transfer learning (few-shot, zero-shot CLIP), model optimization (quantization INT8, pruning, distillation), diffusion models (DDPM, Stable Diffusion), reinforcement learning (DQN, PPO, CartPole), multimodal models (CLIP contrastive learning)
- **Reference** (3) — DL checklist, architecture selection guide, 30 must-read papers
- **Learning Path** — 16-week ML + DL study plan

Every page: full KaTeX math derivations + from-scratch NumPy/PyTorch code + library code + real dataset end-to-end example.

---

### March 25, 2026 — Spring Boot, Data Pipeline & MCP Server

**Archon crosses 1,000 pages. MCP server goes live.**

#### Spring Boot (55 pages)
- **Fundamentals** — Core concepts, REST API, exception handling, auto-configuration
- **Data Access** — Spring Data JPA, Hibernate tuning, Flyway/Liquibase migrations, QueryDSL, multi-datasource
- **Security** — Spring Security, JWT auth, OAuth2/OIDC, advanced security (@PreAuthorize, RBAC, audit logging)
- **Cloud & Microservices** — Spring Cloud Gateway, Config Server, Eureka, Resilience4j, distributed tracing
- **Messaging** — Spring Kafka, Spring Integration (Enterprise Integration Patterns)
- **Web & API** — WebSocket/STOMP, GraphQL, gRPC, API versioning, OpenAPI/Swagger, file uploads
- **Batch & Integration** — Spring Batch deep dive, Spring Integration, event-driven architecture
- **Advanced** — Spring WebFlux/Reactor, Spring Modulith, State Machine, AOT/GraalVM native image, virtual threads (Project Loom), Spring AI (LLM integration)
- **Operations** — Actuator, Micrometer observability, Docker, Kubernetes deployment, caching, logging
- **Reference** — Best practices, anti-patterns, migration guide (Boot 2→3), cheat sheet

#### Data Pipeline (25 pages)
- **Collection** — Web scraping (Scrapy), API ingestion, database extraction (CDC/Debezium), file formats (CSV/Parquet/Avro)
- **Preprocessing** — Pipeline architecture, type inference, string/numerical/categorical/datetime/text/image preprocessing, deduplication, advanced imputation (KNN/MICE/MissForest)
- **Orchestration** — Airflow DAGs, Prefect flows, pipeline design patterns, monitoring & alerting
- **Validation** — Great Expectations, Pandera schemas, data contracts
- **Projects** — E-commerce pipeline, real estate pipeline, IoT streaming pipeline

#### MCP Server
- **21 tools** — search, get_page, list_sections, get_related, list_pages, get_cheat_sheet, search_by_tag, search_by_difficulty, get_comparison, get_interview, get_lld, get_war_room, get_checklist, get_runbook, get_learning_path, get_glossary_term, get_code_examples, random_page, get_build_guide, get_eda_guide, list_all_tags
- **3 MCP resource templates** — sections, cheat sheets, learning paths
- **5 MCP prompts** — explain-concept, interview-prep, debug-issue, compare-tech, eda-workflow
- **Remote endpoint** — `https://archon-eight.vercel.app/api/mcp`
- **npm publishable** as `archon-mcp-server`
- **Rate limiting** — 60 requests/minute
- **Smithery config** for marketplace listing

---

### March 24, 2026 — The EDA Expansion

**+69 EDA pages. Archon reaches 950+ pages.**

#### Exploratory Data Analysis (69 pages)
- **EDA Mindset** (5) — Philosophy, asking right questions, 10-step workflow, 30+ common mistakes, domain-specific EDA
- **Data Understanding** (6) — Data types, shapes, collection, profiling, distributions, scale
- **Data Cleaning** (7) — Missing data (MCAR/MAR/MNAR), outliers, text cleaning, datetime hell, categories, validation, 20 edge cases
- **Univariate Analysis** (4) — Numerical, categorical, temporal, text
- **Bivariate & Multivariate** (5) — Num-num, cat-num, cat-cat, multivariate, correlation traps (Simpson's paradox)
- **Feature Engineering** (6) — Transformations, encoding (12 strategies), creation, datetime, text, scaling
- **Special Situations** (5) — Imbalanced data, multicollinearity, high cardinality, large datasets (Dask/Polars), small datasets
- **Libraries** (8) — NumPy, pandas (2), matplotlib, seaborn, plotly, scipy, polars
- **Streamlit** (3) — Basics, full interactive EDA app (300+ lines), automated EDA tools
- **Real-World Projects** (5) — Titanic, e-commerce (RFM/cohort), financial (stocks/risk), healthcare (survival), NLP (sentiment/topics)
- **Reference** (4) — 60-item checklist, chart decision tree, statistical test selector, pandas cheat sheet
- **Advanced** (11) — Geospatial EDA, image/audio EDA, data leakage, sampling strategies, post-modeling EDA, SHAP/LIME explainability, reproducibility, communicating findings, statistical power, relational data, data drift, ethics & bias

---

### March 20, 2026 — The Mega Expansion (Part 2)

**+200 more pages. Archon reaches 850+ pages.**

#### Wave 2 New Sections
- **War Room** (12 pages) — Real production incidents: GitHub, Cloudflare, Knight Capital, AWS S3, Facebook, GitLab, Stripe, Discord, Twitter, Netflix, CrowdStrike
- **Security Exploits** (12 pages) — XZ Backdoor, Log4Shell, SolarWinds, Heartbleed, Spectre/Meltdown, Dirty Pipe, container escapes, advanced injection/XSS, cloud misconfigs, crypto attacks
- **Cybersecurity Path** (22 pages) — Complete security engineer training: networking, pentesting, Linux security, network attacks, reverse engineering, crypto hacking, cloud pentesting, OSINT, forensics, secure coding, tools, Active Directory, red/blue team, Web3 security, mobile security, bug bounty, malware analysis, certifications
- **Deep Auth System** (12 pages) — Enterprise auth architecture, token strategies (DPoP, macaroons), OAuth 2.1 flows, session management, account sharing prevention, enterprise SSO (SAML/SCIM), passkeys/WebAuthn, MFA deep dive, auth providers comparison, advanced rate limiting, device trust/risk engine, auth attacks & defenses
- **LLD Interview Problems** (12 pages) — Parking lot, elevator, chess, library, snake & ladders, vending machine, ATM, movie booking, hotel, file system, tic-tac-toe
- **Debugging Playbooks** (7 pages) — "API is slow", "memory leak", "database CPU 100%", "pods restarting", "intermittent 502s", "error rate spiked"
- **Production Checklists** (5 pages) — Pre-launch (90 items), security review, performance review, observability readiness
- **Runbook Collection** (5 pages) — Database failover, service degradation, certificate rotation, DDoS response
- **Mobile Engineering** (6 pages) — React Native, Flutter, mobile performance, push notifications, offline-first
- **Build From Scratch** (5 pages) — Build Redis, rate limiter, key-value store, load balancer from scratch
- **Company Architecture** (5 pages) — How Uber, Figma, Shopify, Discord actually built their systems
- **Migrations** (4 pages) — Zero-downtime database migrations, monolith→microservices, cloud migration
- **Background Jobs** (4 pages) — Temporal, BullMQ vs Celery vs Sidekiq comparison, job patterns
- **Geospatial** (2 pages) — Spatial indexing (geohash, S2, H3, PostGIS), geofencing
- **Real-Time Analytics** (2 pages) — ClickHouse vs Druid vs Pinot, stream-to-OLAP
- **AI Infrastructure** (3 pages) — GPU K8s, model serving (vLLM, Triton), AI infra overview

#### Wave 2 New Pages in Existing Sections
- **AI/ML** (18 new) — LangChain (2000+ line mega guide), LangGraph (2200+ line mega guide), LangSmith, LlamaIndex, Vercel AI SDK, fine-tuning (LoRA/QLoRA), AI guardrails, AI in production, multimodal AI, prompt caching, advanced prompt engineering, data annotation, Claude API, OpenAI API, Hugging Face, CrewAI/AutoGen, AI testing
- **System Design Interviews** (8 new, 48 total) — ChatGPT, Copilot, Recommendation Engine, Fraud Detection, Search Ranking, Content Moderation, Twitter Search, Typeahead, Live Streaming
- **Algorithms** (8 new) — JS interview (50+ questions), React interview, Node.js interview, probability, statistics/A/B testing, greedy, bit manipulation, string algorithms, advanced DS, system design math
- **Schema Design** (4 new) — E-commerce, social media, SaaS multi-tenant, chat schemas
- **Infrastructure** — Deno/Bun, TypeScript patterns, Python data tools, Python async, API gateway, storage systems
- **Security** — Supply chain security, cryptography for engineers
- **DevOps** — Feature flags, open source, tech debt, postmortem template, technical leadership, hiring, RFC template, design doc template, observability tools, release engineering, debugging in production
- **Performance** — Benchmarks reference, continuous profiling, compilers/interpreters, load testing
- **Frontend** — Data visualization, i18n, WCAG compliance
- **Cheat Sheets** (6 new, 22 total) — SQL advanced, Docker Compose, LLM APIs, terminal productivity, HTTP clients
- **Learning Paths** (2 new) — Engineering resources, behavioral interviews
- **Production Blueprints** — Email service, scheduler service, webhook infrastructure, file processing
- **API Design** — gRPC deep dive, event-driven APIs, API gateway patterns, GraphQL advanced

#### Infrastructure
- CI Node heap bumped to **24GB** with **1GB semi-space** for 850+ pages

---

### March 20, 2026 — The Mega Expansion (Part 1)

**+179 new pages in a single session. Archon goes from 470 to 650+ pages.**

#### New Sections
- **Algorithms & Data Structures** (10 pages) — arrays, linked lists, trees, graphs, dynamic programming, sorting, heaps, hash tables, backtracking
- **AI/ML Engineering** (7 pages) — LLM integration, RAG architecture, vector databases, embeddings, AI agents, ML pipelines
- **Testing** (8 pages) — unit, integration, E2E, contract, property-based, TDD/BDD, test architecture
- **Frontend Engineering** (7 pages) — web performance, browser rendering, SSR/SSG/ISR, state management, micro-frontends, bundle optimization, React internals, WebAssembly
- **SOLID Principles** (6 pages) — SRP, OCP, LSP, ISP, DIP with TypeScript/Go/Python examples
- **Functional Programming** (4 pages) — core concepts, monads/functors, FP in TypeScript
- **Concurrency & Parallelism** (4 pages) — lock-free data structures, actor model, real-time systems
- **SRE** (5 pages) — error budgets, toil reduction, capacity planning, SLI/SLO/SLA
- **Compliance** (5 pages) — GDPR engineering, SOC 2, PCI DSS, audit logging
- **Authorization** (4 pages) — RBAC/ABAC/ReBAC, Google Zanzibar, OPA & Cedar
- **Multi-Tenancy** (3 pages) — database strategies, noisy neighbor
- **Platform Engineering** (3 pages) — Backstage, developer experience, DORA metrics
- **FinOps** (3 pages) — cost optimization playbook, cost allocation & tagging
- **Data Lakehouse** (4 pages) — Delta Lake/Iceberg/Hudi, medallion architecture, query engines

#### New Pages in Existing Sections
- **System Design** — rate limiting, circuit breaker, bloom filters, distributed locking, leader election, queueing theory, search engineering, GraphQL vs REST, concurrency
- **Databases** — DynamoDB, Cassandra, Elasticsearch, ClickHouse internals
- **API Design** (7 pages) — REST best practices, versioning, OpenAPI/Swagger, pagination, webhooks, API security patterns, GraphQL advanced
- **Infrastructure** — Nginx deep dive, service mesh, observability, Node.js internals, Go concurrency, Rust for backend, TypeScript advanced, Linux internals (4 pages), eBPF
- **Networking** — QUIC protocol, WebRTC, MQTT
- **Kubernetes** — CRDs & operators, admission webhooks, CNI plugins, GitOps (ArgoCD & Flux)
- **Message Queues** — Kafka Streams, Kafka Connect
- **Event-Driven** — transactional outbox, idempotent consumers
- **DevOps** — Git internals, branching strategies, monorepo management, technical writing, code review, ADRs, on-call handbook, release engineering, debugging in production, disaster recovery
- **Performance** — load testing deep dive, compiler/interpreter basics
- **Frontend** — i18n & l10n
- **Storage Systems** — block/file/object storage, distributed file systems (HDFS, Ceph, MinIO)

#### 10 New System Design Interviews (40 total)
- Design GitHub, Slack, Zoom, Reddit, Airbnb, LinkedIn Feed, Google Docs, Leaderboard, Ad Platform, CDN

#### 6 New Production Blueprints (14 total)
- Search service, feature flag service, chat service, file storage, audit log, config service, payment engineering (ledger + reconciliation)

#### 4 New Learning Paths (9 total)
- Data Engineer, AI/ML Engineer, Platform Engineer, Full-Stack Engineer

#### 11 New Cheat Sheets (19 total)
- Python, Go, Rust, Bash, Nginx, PromQL, AWS CLI, kubectl advanced, Helm, GraphQL, Regex

#### Infrastructure
- Bumped CI Node heap to **20GB** with **512MB semi-space** for GC optimization
- Bumped CI swap to **16GB** with expanded disk cleanup
- Updated nav with new Engineering sections (Testing, AI/ML, Frontend)

---

### March 19, 2026 — The Archon Update
- **Rebranded** from Knowledge Vault to **Archon**
- Added **AI Chatbot** (Oracle of Archon) — Pagefind retrieval + Gemini 2.5 Flash with page citations
- Added **Interactive Knowledge Graph** — visual map of all 470+ topics with radial cluster layout
- Added **Compare Mode** — side-by-side tech comparison with 24 technologies
- Added **Keyboard Shortcuts** — press `?` to see all shortcuts
- Added **Bookmarks** system — save pages, view at `/bookmarks`
- Added **Verification System** — verified/unverified badges with GitHub avatar + LinkedIn chip
- Added **Start Here** roadmap — guided paths for interviews, backend, devops, security
- Added **Reading Time** indicator on every page
- Added **Reading Progress** tracker per learning path
- Added **Reading Streak** — tracks daily visits
- Added **"Was this helpful?"** feedback widget
- Added **Focus Mode** — distraction-free reading (full width, Esc to exit)
- Added **Font Size Controls** — A-/A+ buttons
- Added **Quick Notes** — per-page notepad saved in localStorage
- Added **Scroll Progress Bar** — gradient bar at top of page
- Added **Back to Top** ring — circular progress indicator
- Added **Copy Heading Links** — click any heading to copy URL
- Added **Code Copy Toast** — "Copied!" feedback on code blocks
- Added **Difficulty Badges** — colored dots in sidebar with legend
- Added **SEO + Open Graph** meta tags for social sharing
- Added **PWA support** — install as an app for offline reading
- Added **RSS feed** at `/feed.xml`
- Added **Changelog** page (you're reading it)
- Added **Verification Guide** at `/verify`
- Fixed **cross-references** in all 16 prompt engineering pages
- Fixed **mobile responsiveness** — mermaid diagrams, tables, code blocks
- Fixed **outline tracking** — "On this page" highlights current heading
- Cinematic homepage with Lincoln quote and Feynman footer
- New **Archon logo** — hexagonal vault with anime-style keystone

### March 18, 2026
- Added **30 System Design Interview** walkthroughs (Instagram, Uber, YouTube, WhatsApp, Netflix, Spotify, and 24 more)
- Added **5 Learning Paths** (Backend, DevOps, Frontend, Security, Interview Prep)
- Added **8 Cheat Sheets** (Docker, K8s, Git, SQL, TypeScript, Linux, Redis, Terraform)
- Added **Technology Radar** with 29 technologies
- Added **Related Pages** component — auto-shows related content at bottom of every page
- Added **Tag Browse** page — explore all 1,240 tags with difficulty filter
- Added **Interactive Code** — "Run" button on TypeScript code blocks (opens in StackBlitz)
- Switched to **Pagefind** search (post-build, no memory impact)
- Fixed **&#123;&#123; &#125;&#125;** Vue template syntax errors across 32 files
- Fixed **GitHub repo links** in navbar and edit links
- Improved **sidebar** — all sections expanded by default, auto-scroll to active page

### March 17, 2026
- Initial release — **187 pages** across System Design, Architecture, Infrastructure, Security, DevOps, Performance, and Data Engineering
- Added **147 new pages** in one session (System Design networking, Architecture patterns, K8s, Docker, AWS, GCP, CI/CD, Multi-region, Security, DevOps, Performance, Data Engineering, Prompt Engineering)
- Total reached **334 pages**

### March 16, 2026
- Project created with VitePress
- Initial scaffolding — System Design, Databases, Caching, Consensus, Architecture, Security, DevOps, Infrastructure, Performance sections
