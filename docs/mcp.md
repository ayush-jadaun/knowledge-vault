---
title: "Archon MCP Server"
description: "Query 1,000+ pages of engineering knowledge directly from Claude, Cursor, or any MCP client"
tags: [mcp, api, tools, ai, integration]
difficulty: beginner
prerequisites: []
lastReviewed: "2026-03-25"
---

# Archon MCP Server

Archon is available as an **MCP (Model Context Protocol) server** — meaning you can query all 1,000+ pages of engineering knowledge directly from Claude Code, Cursor, Claude Desktop, or any MCP-compatible client.

No browser needed. Just ask your AI assistant about system design, algorithms, security, Spring Boot, EDA, or any other topic — and it pulls answers directly from Archon.

## Quick Start

### Option 1: Remote (no install needed)

```bash
claude mcp add archon --transport http https://archon-eight.vercel.app/api/mcp
```

Works instantly. No npm, no cloning, no setup. The server runs on Vercel and queries all 1,000+ pages remotely.

**Test it:** [https://archon-eight.vercel.app/api/mcp](https://archon-eight.vercel.app/api/mcp)

### Option 2: npm package

```bash
claude mcp add archon -- npx archon-mcp-server
```

### Option 3: Local (clone the repo)

```bash
git clone https://github.com/ayush-jadaun/knowledge-vault.git
cd knowledge-vault/mcp-server && npm install
claude mcp add archon -- node index.js
```

### Cursor

Add to your `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "archon": {
      "command": "npx",
      "args": ["archon-mcp"]
    }
  }
}
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "archon": {
      "command": "npx",
      "args": ["archon-mcp"]
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `search_archon` | Full-text search across all 1,000+ pages with relevance scoring |
| `get_page` | Get the full content of any page by path |
| `list_sections` | Browse all sections with page counts |
| `get_related` | Find top 5 related pages by shared tags |
| `list_pages` | List all pages in a section |
| `get_cheat_sheet` | Quick access to any of the 23 cheat sheets |
| `search_by_tag` | Find all pages with a specific tag |
| `search_by_difficulty` | Filter pages by beginner/intermediate/advanced |
| `get_comparison` | Get a head-to-head technology comparison |
| `get_interview` | Get a system design interview walkthrough |
| `get_lld` | Get a low-level design problem |
| `get_war_room` | Get a real production incident case study |
| `get_checklist` | Get a production readiness checklist |
| `get_runbook` | Get an operational runbook |
| `get_learning_path` | Get a structured learning path |
| `get_glossary_term` | Look up any engineering term |
| `get_code_examples` | Extract all code blocks from a page |
| `random_page` | Get a random page for discovery |
| `get_build_guide` | Get a "build from scratch" tutorial |
| `get_eda_guide` | Get an EDA guide by topic |
| `list_all_tags` | List all unique tags with counts |

## MCP Resources

Browse Archon content as MCP resources:

- `archon://sections/{section}` — Browse pages in a section
- `archon://cheat-sheets/{topic}` — Access any cheat sheet
- `archon://learning-paths/{path}` — Follow a learning path

## MCP Prompts

Pre-built prompt templates:

| Prompt | Description |
|--------|-------------|
| `explain-concept` | Explain any engineering concept at your level |
| `interview-prep` | Prepare for system design, LLD, or behavioral interviews |
| `debug-issue` | Get a debugging playbook for your problem |
| `compare-tech` | Compare two technologies side by side |
| `eda-workflow` | Get guided EDA workflow for your dataset |

## Example Usage

Once connected, just ask naturally:

- *"Search Archon for circuit breaker patterns"*
- *"Get the PostgreSQL internals page from Archon"*
- *"What does Archon say about Kafka vs RabbitMQ?"*
- *"Show me the GitHub 2018 outage war room page"*
- *"Get the pre-launch checklist from Archon"*

## Source Code

The MCP server source is in the [`mcp-server/`](https://github.com/ayush-jadaun/knowledge-vault/tree/main/mcp-server) directory of the Archon repository.

- **21 tools** for querying knowledge
- **3 resource templates** for browsing content
- **5 prompt templates** for guided interactions
- **stdio + HTTP** transport support
- **npm publishable** as `archon-mcp`
