---
title: "About Archon"
description: "Why Archon exists, who built it, and what makes it different from every other engineering reference on the internet."
---

<style>
.about-hero {
  padding: 3rem 0 2rem;
  border-bottom: 1px solid var(--vp-c-divider);
  margin-bottom: 3rem;
}
.about-hero h1 {
  font-size: 2.8rem;
  font-weight: 800;
  line-height: 1.1;
  background: linear-gradient(135deg, #5f67ee, #42d392);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 1rem;
}
.about-hero .subtitle {
  font-size: 1.2rem;
  color: var(--vp-c-text-2);
  max-width: 600px;
  line-height: 1.7;
}
.creator-card {
  display: flex;
  gap: 2rem;
  align-items: flex-start;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 2rem;
  margin: 2.5rem 0;
}
.creator-card .avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, #5f67ee, #42d392);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  flex-shrink: 0;
}
.creator-card .bio h3 {
  margin: 0 0 0.25rem;
  font-size: 1.2rem;
  font-weight: 700;
}
.creator-card .bio .role {
  color: var(--vp-c-brand-1);
  font-size: 0.9rem;
  font-weight: 500;
  margin-bottom: 0.75rem;
}
.creator-card .bio p {
  color: var(--vp-c-text-2);
  font-size: 0.95rem;
  line-height: 1.6;
  margin: 0;
}
.stat-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1rem;
  margin: 2.5rem 0;
}
.stat-item {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 1.25rem;
  text-align: center;
}
.stat-item .number {
  font-size: 1.8rem;
  font-weight: 800;
  background: linear-gradient(135deg, #5f67ee, #42d392);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
  margin-bottom: 0.4rem;
}
.stat-item .label {
  font-size: 0.8rem;
  color: var(--vp-c-text-3);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.links-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin: 2rem 0;
}
.links-row a {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  transition: border-color 0.2s, background 0.2s;
}
.links-row a:hover {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-elv);
}
@media (max-width: 640px) {
  .creator-card { flex-direction: column; }
  .about-hero h1 { font-size: 2rem; }
}
</style>

<div class="about-hero">
<h1>The Axe Before the Tree</h1>
<p class="subtitle">Archon is an engineering knowledge base built because every other reference on the internet is either too shallow to matter or too scattered to use.</p>
</div>

## Why This Exists

I got tired of the same loop: Google a concept, land on a Medium post that skims the surface, click through to the official docs that assume you already know everything, open six browser tabs, lose the thread, give up.

The problem isn't a lack of information. It's that engineering knowledge lives in a thousand disconnected places — blog posts, RFC documents, conference talks, Stack Overflow threads, books that are 70% padding. None of it connects. None of it goes deep enough to actually change how you think.

So I built Archon: one place that goes all the way down on every topic. Not definitions — understanding. Not "what it is" — "why it works this way, what breaks if you get it wrong, and what the real tradeoffs are."

The name is from the Greek for *ruler* or *leader of the assembly*. The idea: this is where the knowledge is governed, structured, and made usable.

## What Archon Is and Isn't

**What it is:** A curated, synthesized, opinionated reference for engineers who want to actually understand what they're working with. Content draws on official documentation, research papers, postmortems, engineering blogs from companies like Cloudflare, Netflix, Stripe, and Google, and real production experience.

**What it isn't:** Original research. I didn't invent consistent hashing or write the Raft paper. Archon's value is synthesis — taking the best explanations across dozens of sources, filling the gaps between them, and presenting a coherent map of the territory.

Every page cites its influences, whether that's the original RFC, the engineering blog post that explained it best, or the production postmortem that revealed what the theory misses.

<div class="creator-card">
  <div class="avatar">A</div>
  <div class="bio">
    <h3>Ayush Jadaun</h3>
    <div class="role">Fellow coder · believes knowledge should be free for all</div>
    <p>I built Archon because I needed it. A fellow coder who believes knowledge should be free and deep — not gated, not shallow, not scattered across a hundred tabs. I curate, structure, and write for this site — but the underlying knowledge belongs to the engineering community at large.</p>
  </div>
</div>

<div class="links-row">
  <a href="https://github.com/ayush-jadaun" target="_blank" rel="noopener">⎇ GitHub</a>
  <a href="https://github.com/ayush-jadaun/knowledge-vault" target="_blank" rel="noopener">★ Star the repo</a>
  <a href="/changelog">What's New</a>
  <a href="/start-here">Start Here</a>
</div>

## The Numbers

<div class="stat-row">
  <div class="stat-item"><div class="number">1195+</div><div class="label">Pages</div></div>
  <div class="stat-item"><div class="number">40+</div><div class="label">Interview walkthroughs</div></div>
  <div class="stat-item"><div class="number">500+</div><div class="label">Prompts</div></div>
  <div class="stat-item"><div class="number">30+</div><div class="label">Topics</div></div>
  <div class="stat-item"><div class="number">0</div><div class="label">Paywalls</div></div>
</div>

## The Philosophy

**Depth over breadth, always.** If a page can't tell you something you couldn't get from the first paragraph of a Wikipedia article, it shouldn't exist. Every page on Archon earns its place by going somewhere the surface-level explanations don't.

**Respect the reader's intelligence.** No "great question!" No unnecessary caveats. No explaining what a for-loop is before explaining distributed consensus. You're an engineer. You can handle the real explanation.

**Free, forever.** There's no premium tier, no email gate, no "unlock the full content" wall. Engineering knowledge that helps you build better systems shouldn't be rationed.

**Open source.** The entire vault is on GitHub. Found a mistake? See a gap? Disagree with an explanation? Open a PR. Good engineering is collaborative — so is this.

## What Gets Built Next

The backlog includes a proper CAG-powered chatbot that can answer questions using the full vault as context, reading time estimates on every page, a contributor system so domain experts can submit deep-dives, and a proper mobile experience.

The goal has always been the same: make the best engineering reference on the internet. We're not there yet. Getting closer every week.

---

*"Give me six hours to chop down a tree and I'll spend four sharpening the axe."*

This is the axe.

---

**Found something wrong or missing?** [Open an issue](https://github.com/ayush-jadaun/knowledge-vault/issues) or [edit on GitHub](https://github.com/ayush-jadaun/knowledge-vault/edit/main/docs/about.md).
