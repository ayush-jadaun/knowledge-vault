---
title: "Verify a Page"
description: "How to become a verified reviewer for Archon — review content, cite sources, earn your badge"
---

# Become a Verified Reviewer

Every page in Archon is AI-generated and marked as **Unverified** by default. We need engineers like you to review pages, verify the information, cite sources, and earn your name on the page permanently.

## Why Verify?

- Your **name, GitHub, and LinkedIn** appear on every page you verify
- Build credibility in the engineering community
- Help thousands of engineers trust what they're reading
- It's open source contribution that actually matters

## How to Verify a Page

### Step 1: Pick a page

Look for the yellow **"Unverified — AI-generated content"** badge at the top of any page. That page needs you.

Start with topics you know deeply — don't verify pages outside your expertise.

### Step 2: Review the content

Check each section against your knowledge and authoritative sources:

| Section | What to check |
|---------|--------------|
| **Why it exists** | Is the historical context accurate? |
| **First principles** | Are the fundamental concepts correct? |
| **Core mechanics** | Do the diagrams and explanations match how it actually works? |
| **Implementation** | Does the TypeScript code compile? Would it work in production? |
| **Edge cases** | Are the failure modes real? Any missing ones? |
| **Performance** | Are the Big-O values and benchmarks realistic? |
| **Math foundations** | Are the formulas and proofs correct? |
| **War stories** | Do the incidents described match known real-world events? |
| **Decision frameworks** | Are the "when to use / when not to" recommendations sound? |

### Step 3: Cite your sources

For each major claim you verify, note the authoritative source. Good sources include:

- **Official documentation** (e.g., PostgreSQL docs, AWS docs, RFC specifications)
- **Published papers** (e.g., the Raft paper, Dynamo paper, Google's Bigtable paper)
- **Books** (e.g., DDIA by Martin Kleppmann, SRE Book by Google)
- **Conference talks** (e.g., Strange Loop, QCon, KubeCon recordings)
- **Production blog posts** (e.g., Netflix Tech Blog, Uber Engineering, Stripe Engineering)

### Step 4: Submit your verification

Fork the repo, then edit the page's frontmatter to add your verification:

```yaml
---
title: "Page Title"
description: "..."
tags: [...]
difficulty: "advanced"
verified: true
verifiedBy: "Your Name"
verifiedDate: "2026-03-20"
verifierGithub: "your-github-username"
verifierLinkedin: "your-linkedin-username"
sources:
  - "PostgreSQL Documentation — https://www.postgresql.org/docs/"
  - "Designing Data-Intensive Applications, Martin Kleppmann, Chapter 7"
  - "The Raft Consensus Algorithm — https://raft.github.io/raft.pdf"
---
```

Then submit a Pull Request with:
- **Title**: `verify: [page-name]`
- **Description**: List what you checked, what you confirmed, and any corrections you made
- **Sources**: The authoritative references you used

### Step 5: Get your badge

Once your PR is merged, your name and profiles appear on the page permanently:

> **Verified by Your Name** · 2026-03-20 · [GitHub] [LinkedIn]

## Verification Standards

### Do verify:
- Technical accuracy of concepts and explanations
- Code correctness (does it compile? would it work?)
- Numbers and benchmarks (are they in the right ballpark?)
- Best practice recommendations

### Don't verify:
- Pages outside your area of expertise
- Without citing at least one authoritative source
- By just skimming — read the full page

### If you find errors:

Fix them in your PR. Common issues to look for:
- Outdated API references or deprecated features
- Incorrect Big-O complexity
- Code that wouldn't compile or has bugs
- Missing edge cases or failure modes
- Misleading "when to use" recommendations

## Recognition

Top reviewers will be featured on the [changelog](/changelog) and the homepage. The more pages you verify, the more visible your contribution becomes.

## Get Started

1. [Browse pages by tag](/tags) to find topics you're expert in
2. Look for the yellow "Unverified" badge
3. Fork the repo: [github.com/ayush-jadaun/knowledge-vault](https://github.com/ayush-jadaun/knowledge-vault)
4. Review, verify, cite, submit PR

Every verified page makes Archon more trustworthy. Your expertise matters.
