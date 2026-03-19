---
layout: home
title: Archon
titleTemplate: Engineering Knowledge from First Principles to Research-Level Depth

hero:
  name: Archon
  text: Engineering Mastery
  tagline: 470+ deep-dive pages. 30 system design interviews. 8 cheat sheets. From first principles to research-level depth.
  actions:
    - theme: brand
      text: Start Here
      link: /start-here
    - theme: alt
      text: System Design Interviews
      link: /system-design-interviews/
    - theme: alt
      text: Cheat Sheets
      link: /cheat-sheets/

features:
  - icon: 🏗️
    title: System Design
    details: Distributed systems, databases, caching, message queues, consensus, load balancing, networking — CAP theorem to Raft walkthroughs.
    link: /system-design/
    linkText: 65+ pages

  - icon: 💼
    title: System Design Interviews
    details: 30 exhaustive walkthroughs — Instagram, Uber, YouTube, WhatsApp, Netflix, Spotify, and more. Full estimation math and production code.
    link: /system-design-interviews/
    linkText: 30 interviews

  - icon: 🧱
    title: Architecture Patterns
    details: Microservices, event-driven, CQRS, hexagonal, clean architecture, and DDD — TypeScript implementations and migration strategies.
    link: /architecture-patterns/
    linkText: 35+ pages

  - icon: ☁️
    title: Infrastructure
    details: Terraform, Kubernetes, Docker, AWS, GCP, CI/CD, multi-region — production-ready configs, not pseudocode.
    link: /infrastructure/
    linkText: 55+ pages

  - icon: 🔒
    title: Security
    details: OWASP Top 10 with vulnerable AND fixed code, JWT, OAuth2/OIDC, encryption, secrets management, zero-trust, API security.
    link: /security/
    linkText: 40+ pages

  - icon: 🔧
    title: DevOps
    details: Prometheus + Grafana dashboards, structured logging, incident response runbooks, deployment strategies, chaos engineering.
    link: /devops/
    linkText: 30+ pages

  - icon: ⚡
    title: Performance
    details: V8 internals, event loop deep dive, memory leak detection, query optimization with EXPLAIN ANALYZE, caching, edge computing.
    link: /performance/
    linkText: 25+ pages

  - icon: 🔄
    title: Data Engineering
    details: Stream processing, windowing, watermarks, CDC, data modeling (star schema, data vault), pipeline orchestration.
    link: /data-engineering/
    linkText: 20+ pages

  - icon: 📋
    title: Production Blueprints
    details: Complete systems — billing engine, notification service, realtime pipeline, rate limiter, job queue, A/B testing, analytics.
    link: /production-blueprints/
    linkText: 40+ pages

  - icon: 🤖
    title: Prompt Engineering
    details: 500+ battle-tested prompts for engineering, product, UI, and architecture — with usage context and example outputs.
    link: /prompt-engineering/
    linkText: 500+ prompts

  - icon: 🎨
    title: UI & Design Systems
    details: Typography, color tokens, spacing, accessibility, dark mode, animations — with production React/CSS code.
    link: /ui-design-systems/
    linkText: 35+ pages

  - icon: 🗺️
    title: Learning Paths & Cheat Sheets
    details: 5 guided paths (Backend, DevOps, Frontend, Security, Interview Prep) + 8 cheat sheets (Docker, K8s, Git, SQL, TS, Linux, Redis, Terraform).
    link: /learning-paths/
    linkText: Start a path
---

<div class="home-stats">
  <div class="stat-item">
    <div class="stat-number">470+</div>
    <div class="stat-label">Deep-dive pages</div>
  </div>
  <div class="stat-item">
    <div class="stat-number">350K+</div>
    <div class="stat-label">Lines of content</div>
  </div>
  <div class="stat-item">
    <div class="stat-number">30</div>
    <div class="stat-label">Interview walkthroughs</div>
  </div>
  <div class="stat-item">
    <div class="stat-number">500+</div>
    <div class="stat-label">Ready-to-use prompts</div>
  </div>
</div>

<div class="home-sections">

### Quick Start

| Path | Best for | Time |
|------|----------|------|
| [Backend Engineer](/learning-paths/backend-engineer) | Backend devs wanting depth | ~40 hours |
| [System Design Interview](/learning-paths/system-design-interview) | Interview prep | ~30 hours |
| [DevOps Engineer](/learning-paths/devops-engineer) | DevOps / SRE | ~35 hours |
| [Frontend Engineer](/learning-paths/frontend-engineer) | Frontend wanting systems knowledge | ~25 hours |
| [Security Engineer](/learning-paths/security-engineer) | Security-focused devs | ~20 hours |

### Quick References

[Docker Cheat Sheet](/cheat-sheets/docker) ·
[Kubernetes Cheat Sheet](/cheat-sheets/kubernetes) ·
[Git Cheat Sheet](/cheat-sheets/git) ·
[SQL Cheat Sheet](/cheat-sheets/sql) ·
[TypeScript Cheat Sheet](/cheat-sheets/typescript) ·
[Linux Cheat Sheet](/cheat-sheets/linux) ·
[Redis Cheat Sheet](/cheat-sheets/redis) ·
[Terraform Cheat Sheet](/cheat-sheets/terraform)

### More Resources

[Technology Radar](/technology-radar) · [Browse by Tag](/tags) · [Glossary](/glossary)

</div>

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #5f67ee 30%, #42d392);
}

.home-stats {
  display: flex;
  justify-content: center;
  gap: 48px;
  padding: 48px 24px;
  margin: 0 auto;
  max-width: 900px;
}

.stat-item {
  text-align: center;
}

.stat-number {
  font-size: 2.5rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  background: linear-gradient(120deg, #5f67ee, #42d392);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: 1.2;
}

.stat-label {
  font-size: 14px;
  color: var(--vp-c-text-2);
  margin-top: 4px;
  font-weight: 500;
}

.home-sections {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 24px 64px;
}

.home-sections h3 {
  font-size: 1.25rem;
  font-weight: 700;
  margin-top: 40px;
  margin-bottom: 16px;
  color: var(--vp-c-text-1);
}

.home-sections table {
  width: 100%;
  margin-bottom: 32px;
}

.home-sections a {
  color: var(--vp-c-brand-1);
  text-decoration: none;
  font-weight: 500;
}

.home-sections a:hover {
  text-decoration: underline;
}

@media (max-width: 640px) {
  .home-stats {
    flex-wrap: wrap;
    gap: 24px;
  }

  .stat-item {
    flex: 0 0 40%;
  }

  .stat-number {
    font-size: 2rem;
  }
}
</style>
