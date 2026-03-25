<p align="center">
  <img src="https://archon-eight.vercel.app/logo.svg" width="80" height="80" alt="Archon Logo">
</p>

# Archon MCP Server

MCP (Model Context Protocol) server for **[Archon](https://archon-eight.vercel.app)** — a 1,000+ page engineering knowledge base covering system design, algorithms, security, AI/ML, Spring Boot, EDA, DevOps, and more. Query the knowledge base directly from Claude Code, Cursor, or any MCP client.

**21 tools** | **3 resource templates** | **5 prompts** | **[Live Docs](https://archon-eight.vercel.app/mcp)**

## Installation

```bash
cd mcp-server
npm install
```

### Global install (npm)

```bash
npm install -g .
archon-mcp          # stdio mode
archon-mcp --http   # HTTP/SSE mode
```

## Running

### Stdio mode (default)

Used by Claude Code, Cursor, Claude Desktop, and other local MCP clients.

```bash
npm start
# or
node index.js
```

### HTTP/SSE mode

For remote access, browser-based clients, or shared servers.

```bash
node index.js --http
# Starts on http://localhost:3456
# Override port: PORT=8080 node index.js --http
```

### Environment variables

| Variable    | Default | Description             |
|-------------|---------|-------------------------|
| `PORT`      | 3456    | HTTP/SSE server port    |
| `LOG_LEVEL` | info    | debug, info, warn, error |

## Adding to MCP Clients

### Claude Code

```bash
claude mcp add archon -- node /path/to/knowledge-vault/mcp-server/index.js
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "archon": {
      "command": "node",
      "args": ["/path/to/knowledge-vault/mcp-server/index.js"]
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "archon": {
      "command": "node",
      "args": ["/path/to/knowledge-vault/mcp-server/index.js"]
    }
  }
}
```

### Remote / SSE clients

Start in HTTP mode (`node index.js --http`), then connect to:
- SSE endpoint: `http://localhost:3456/sse`
- Health check: `http://localhost:3456/health`

---

## Tools (21)

### 1. `search_archon`

Full-text multi-keyword search with relevance scoring (title > description > tags > body).

| Parameter | Type   | Default | Description            |
|-----------|--------|---------|------------------------|
| `query`   | string | --      | One or more keywords   |
| `limit`   | number | 10      | Max results (max 50)   |

```
search_archon({ query: "circuit breaker retry", limit: 5 })
```

### 2. `get_page`

Get the full markdown content of a page by its path.

| Parameter | Type   | Description                         |
|-----------|--------|-------------------------------------|
| `path`    | string | Page path (without `.md` extension) |

```
get_page({ path: "system-design/api-design/api-gateway-patterns" })
```

### 3. `list_sections`

List all top-level sections with their page counts. No parameters.

### 4. `get_related`

Find the top 5 pages related to a given page based on shared tags.

| Parameter | Type   | Description              |
|-----------|--------|--------------------------|
| `path`    | string | Page path to find related pages for |

```
get_related({ path: "ai-ml-engineering/ai-agents" })
```

### 5. `list_pages`

List all pages in a section with title, path, description, and difficulty.

| Parameter | Type   | Description                        |
|-----------|--------|------------------------------------|
| `section` | string | Section name (e.g. "eda", "devops") |

```
list_pages({ section: "cheat-sheets" })
```

### 6. `get_cheat_sheet`

Get a cheat sheet by topic name. Lists available cheat sheets if not found.

| Parameter | Type   | Description                              |
|-----------|--------|------------------------------------------|
| `topic`   | string | Topic (e.g. "docker", "kubernetes") |

```
get_cheat_sheet({ topic: "docker" })
```

### 7. `search_by_tag`

Find all pages with a specific tag.

| Parameter | Type   | Default | Description                     |
|-----------|--------|---------|---------------------------------|
| `tag`     | string | --      | Tag name (e.g. "redis", "react") |
| `limit`   | number | 20      | Max results                     |

```
search_by_tag({ tag: "distributed-systems" })
```

### 8. `search_by_difficulty`

Find pages by difficulty level, optionally filtered by section.

| Parameter    | Type   | Default | Description                                    |
|--------------|--------|---------|------------------------------------------------|
| `difficulty` | enum   | --      | beginner, intermediate, advanced, expert        |
| `section`    | string | --      | Optional: limit to a section                    |
| `limit`      | number | 20      | Max results                                    |

```
search_by_difficulty({ difficulty: "beginner", section: "system-design" })
```

### 9. `get_comparison`

Get a comparison page (X vs Y). Matches by technology names.

| Parameter | Type   | Description        |
|-----------|--------|--------------------|
| `tech1`   | string | First technology   |
| `tech2`   | string | Second technology  |

```
get_comparison({ tech1: "react", tech2: "vue" })
```

### 10. `get_interview`

Get a system design interview walkthrough.

| Parameter | Type   | Description                                      |
|-----------|--------|--------------------------------------------------|
| `topic`   | string | Topic (e.g. "instagram", "uber", "chat-system") |

```
get_interview({ topic: "instagram" })
```

### 11. `get_lld`

Get a low-level design interview problem.

| Parameter | Type   | Description                                        |
|-----------|--------|----------------------------------------------------|
| `topic`   | string | Topic (e.g. "parking-lot", "elevator", "chess") |

```
get_lld({ topic: "parking-lot" })
```

### 12. `get_war_room`

Get a real incident case study from the War Room.

| Parameter | Type   | Description                                             |
|-----------|--------|---------------------------------------------------------|
| `topic`   | string | Incident (e.g. "cloudflare", "crowdstrike", "knight-capital") |

```
get_war_room({ topic: "cloudflare" })
```

### 13. `get_checklist`

Get a production readiness checklist.

| Parameter | Type   | Description                                                  |
|-----------|--------|--------------------------------------------------------------|
| `topic`   | string | Topic (e.g. "pre-launch", "security-review", "observability-readiness") |

```
get_checklist({ topic: "pre-launch" })
```

### 14. `get_runbook`

Get an operational runbook or debugging playbook.

| Parameter | Type   | Description                                           |
|-----------|--------|-------------------------------------------------------|
| `topic`   | string | Topic (e.g. "memory-leak", "high-error-rate", "api-slow") |

```
get_runbook({ topic: "memory-leak" })
```

### 15. `get_learning_path`

Get a structured learning path for a role or topic.

| Parameter   | Type   | Description                                                     |
|-------------|--------|-----------------------------------------------------------------|
| `path_name` | string | Path name (e.g. "backend-engineer", "frontend-engineer", "devops-engineer") |

```
get_learning_path({ path_name: "backend-engineer" })
```

### 16. `get_glossary_term`

Look up an engineering term from the glossary. Falls back to search if not found.

| Parameter | Type   | Description                               |
|-----------|--------|-------------------------------------------|
| `term`    | string | Term (e.g. "CQRS", "CAP theorem", "idempotency") |

```
get_glossary_term({ term: "CQRS" })
```

### 17. `get_code_examples`

Extract all code blocks from a page, optionally filtered by programming language.

| Parameter  | Type   | Description                                  |
|------------|--------|----------------------------------------------|
| `path`     | string | Page path                                    |
| `language` | string | Optional: filter by language (e.g. "typescript") |

```
get_code_examples({ path: "build-from-scratch/redis", language: "typescript" })
```

### 18. `random_page`

Get a random page. Great for learning something new.

| Parameter | Type   | Description                        |
|-----------|--------|------------------------------------|
| `section` | string | Optional: limit to a section       |

```
random_page({ section: "war-room" })
```

### 19. `get_build_guide`

Get a "build from scratch" tutorial.

| Parameter | Type   | Description                                         |
|-----------|--------|-----------------------------------------------------|
| `topic`   | string | Topic (e.g. "redis", "load-balancer", "rate-limiter") |

```
get_build_guide({ topic: "redis" })
```

### 20. `get_eda_guide`

Get an Exploratory Data Analysis (EDA) page.

| Parameter | Type   | Description                                              |
|-----------|--------|----------------------------------------------------------|
| `topic`   | string | Topic (e.g. "missing-data", "outlier-analysis", "pandas-fundamentals") |

```
get_eda_guide({ topic: "missing-data" })
```

### 21. `list_all_tags`

List all unique tags across the knowledge base with counts. No parameters.

---

## Resources

MCP Resources expose knowledge base content as browsable URIs.

| URI Pattern                            | Description                          |
|----------------------------------------|--------------------------------------|
| `archon://sections/{section_name}`     | All pages in a section (JSON)        |
| `archon://cheat-sheets/{topic}`        | Cheat sheet content (Markdown)       |
| `archon://learning-paths/{path_name}`  | Learning path content (Markdown)     |

### Examples

```
archon://sections/system-design
archon://cheat-sheets/docker
archon://learning-paths/backend-engineer
```

---

## Prompts

MCP Prompts generate structured prompts with relevant knowledge base context.

### `explain-concept`

Pulls relevant pages and creates a structured explanation.

| Argument | Type | Description                        |
|----------|------|------------------------------------|
| `topic`  | string | Concept to explain                |
| `level`  | enum   | beginner, intermediate, advanced, expert |

### `interview-prep`

Pulls interview pages and creates a preparation guide.

| Argument | Type | Description                        |
|----------|------|------------------------------------|
| `type`   | enum   | system-design, lld, behavioral   |
| `topic`  | string | Specific topic                    |

### `debug-issue`

Pulls debugging playbooks and creates a structured debugging guide.

| Argument  | Type | Description                        |
|-----------|------|------------------------------------|
| `problem` | string | Description of the problem       |

### `compare-tech`

Pulls comparison pages and creates a structured comparison.

| Argument | Type | Description        |
|----------|------|--------------------|
| `tech1`  | string | First technology  |
| `tech2`  | string | Second technology |

### `eda-workflow`

Pulls EDA workflow + checklist and creates a guided analysis plan.

| Argument              | Type | Description                    |
|-----------------------|------|--------------------------------|
| `dataset_description` | string | Brief description of dataset |

---

## Architecture

- **Startup**: All markdown files under `docs/` are read, frontmatter is parsed with regex, and everything is cached in memory
- **Search**: Case-insensitive multi-word matching with relevance scoring (title 10pts > description 5pts > tags 3pts > body 1pt)
- **Transport**: stdio by default; HTTP/SSE on port 3456 with `--http` flag
- **Logging**: Structured JSON to stderr (never pollutes stdout/MCP transport)
- **Shutdown**: Graceful handling of SIGINT/SIGTERM with connection cleanup

## Smithery

This server includes a `smithery.yaml` for publishing to the [Smithery](https://smithery.ai) MCP registry.
