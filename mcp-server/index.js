#!/usr/bin/env node

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

// ---------------------------------------------------------------------------
// JSON logger — all log output goes to stderr so stdout stays clean for MCP
// ---------------------------------------------------------------------------

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || "info"];

function log(level, message, data = {}) {
  if (LOG_LEVELS[level] < CURRENT_LOG_LEVEL) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...data,
  };
  process.stderr.write(JSON.stringify(entry) + "\n");
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, "..", "docs");

// ---------------------------------------------------------------------------
// Cache — built once on startup
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   relPath: string,
 *   title: string,
 *   description: string,
 *   tags: string[],
 *   difficulty: string,
 *   content: string,
 *   section: string,
 *   body: string
 * }} CachedPage
 */

/** @type {CachedPage[]} */
let pageCache = [];

/** Parse YAML-ish frontmatter between --- markers */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const block = match[1];
  const fm = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (!m) continue;
    let [, key, value] = m;
    value = value.replace(/^["']|["']$/g, "").trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      fm[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""));
    } else {
      fm[key] = value;
    }
  }
  return fm;
}

/** Strip frontmatter from markdown, return clean body */
function stripFrontmatter(raw) {
  return raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

/** Recursively collect all .md files under a directory */
function collectMarkdownFiles(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    try {
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (entry.startsWith(".") || entry === "public" || entry === "node_modules") continue;
        collectMarkdownFiles(full, files);
      } else if (entry.endsWith(".md")) {
        files.push(full);
      }
    } catch {
      // permission error or symlink issue — skip
    }
  }
  return files;
}

function buildCache() {
  const t0 = Date.now();
  const files = collectMarkdownFiles(DOCS_DIR);
  pageCache = [];
  for (const filePath of files) {
    try {
      const raw = readFileSync(filePath, "utf-8");
      const fm = parseFrontmatter(raw);
      const relPath = relative(DOCS_DIR, filePath).replace(/\\/g, "/").replace(/\.md$/, "");
      const section = relPath.split("/")[0];

      // skip bare index / 404 / standalone utility pages at root
      if (!relPath.includes("/") && !fm.title) continue;

      const body = stripFrontmatter(raw);

      pageCache.push({
        relPath,
        title: fm.title || basename(relPath),
        description: fm.description || "",
        tags: Array.isArray(fm.tags) ? fm.tags : [],
        difficulty: (fm.difficulty || "").replace(/^["']|["']$/g, ""),
        content: raw,
        body,
        section,
      });
    } catch {
      // unreadable file — skip
    }
  }
  log("info", "Cache built", { pages: pageCache.length, ms: Date.now() - t0 });
}

buildCache();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find a page by exact or partial path match */
function findPage(pagePath) {
  const normalised = pagePath.replace(/^\/|\/$/g, "").replace(/\.md$/, "");
  return (
    pageCache.find((p) => p.relPath === normalised) ||
    pageCache.find((p) => p.relPath.endsWith(normalised)) ||
    null
  );
}

/** Format a page for output */
function formatPage(page) {
  return `# ${page.title}\n\nPath: ${page.relPath}\nSection: ${page.section}\nDifficulty: ${page.difficulty || "N/A"}\nTags: ${page.tags.join(", ") || "none"}\n\n${page.body}`;
}

/** Full-text multi-keyword search with relevance scoring */
function searchPages(query, limit = 10) {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return [];

  const scored = [];
  for (const page of pageCache) {
    const titleLower = page.title.toLowerCase();
    const descLower = page.description.toLowerCase();
    const tagsLower = page.tags.join(" ").toLowerCase();
    const bodyLower = page.body.toLowerCase();

    // every word must appear somewhere
    const haystack = `${titleLower} ${descLower} ${tagsLower} ${bodyLower}`;
    if (!words.every((w) => haystack.includes(w))) continue;

    // relevance scoring: title > description > tags > body
    let score = 0;
    for (const w of words) {
      if (titleLower.includes(w)) score += 10;
      if (descLower.includes(w)) score += 5;
      if (tagsLower.includes(w)) score += 3;
      if (bodyLower.includes(w)) score += 1;
    }

    // extract snippet
    let snippet = "";
    const idx = words.reduce((best, w) => {
      const i = bodyLower.indexOf(w);
      return i !== -1 && (best === -1 || i < best) ? i : best;
    }, -1);
    if (idx !== -1) {
      const start = Math.max(0, idx - 80);
      const end = Math.min(page.body.length, idx + 200);
      snippet =
        (start > 0 ? "..." : "") +
        page.body.slice(start, end).replace(/\n/g, " ").trim() +
        (end < page.body.length ? "..." : "");
    }

    scored.push({ page, score, snippet });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ page, score, snippet }) => ({
    title: page.title,
    description: page.description,
    path: page.relPath,
    section: page.section,
    tags: page.tags,
    difficulty: page.difficulty,
    score,
    snippet,
  }));
}

/** Get unique sections with page counts */
function getSections() {
  const counts = {};
  for (const page of pageCache) {
    counts[page.section] = (counts[page.section] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

/** Get all unique tags with counts */
function getAllTags() {
  const counts = {};
  for (const page of pageCache) {
    for (const tag of page.tags) {
      const t = tag.toLowerCase();
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));
}

/** Extract code blocks from markdown, optionally filtered by language */
function extractCodeBlocks(body, language = null) {
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  const blocks = [];
  let match;
  while ((match = regex.exec(body)) !== null) {
    const lang = match[1] || "text";
    const code = match[2].trim();
    if (!language || lang.toLowerCase() === language.toLowerCase()) {
      blocks.push({ language: lang, code });
    }
  }
  return blocks;
}

/** Parse glossary page into term -> definition map */
function parseGlossary() {
  const glossaryPage = pageCache.find(
    (p) => p.relPath === "glossary" || p.title.toLowerCase() === "glossary"
  );
  if (!glossaryPage) return {};

  const terms = {};
  const regex = /\*\*([^*]+)\*\*\s*(?:—|--|-)\s*([\s\S]*?)(?=\n\n\*\*|\n##|\n---|\Z)/g;
  let match;
  while ((match = regex.exec(glossaryPage.body)) !== null) {
    const term = match[1].trim();
    const definition = match[2].trim().replace(/\n/g, " ");
    terms[term.toLowerCase()] = { term, definition };
  }
  return terms;
}

// Pre-build glossary index
const glossaryIndex = parseGlossary();

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "archon",
  version: "1.0.0",
  description: "Query 1000+ pages of engineering knowledge — system design, algorithms, security, AI/ML, Spring Boot, EDA, and more",
  icon: "https://archon-eight.vercel.app/logo.svg",
});

// ===== TOOL 1: search_archon =====
server.tool(
  "search_archon",
  "Full-text multi-keyword search across 950+ engineering pages. Returns matches ranked by relevance (title > description > tags > body) with snippets.",
  {
    query: z.string().describe("Search query — one or more keywords"),
    limit: z.number().optional().default(10).describe("Max results (default 10, max 50)"),
  },
  async ({ query, limit }) => {
    const capped = Math.min(limit, 50);
    const results = searchPages(query, capped);
    if (results.length === 0) {
      return { content: [{ type: "text", text: `No pages found matching "${query}". Try broader keywords or use list_sections to explore.` }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }
);

// ===== TOOL 2: get_page =====
server.tool(
  "get_page",
  "Get the full markdown content of a specific page by path.",
  {
    path: z.string().describe('Page path, e.g. "system-design/api-design/api-gateway-patterns"'),
  },
  async ({ path: pagePath }) => {
    const page = findPage(pagePath);
    if (!page) {
      return { content: [{ type: "text", text: `Page not found: "${pagePath}". Use search_archon or list_pages to find the correct path.` }] };
    }
    return { content: [{ type: "text", text: formatPage(page) }] };
  }
);

// ===== TOOL 3: list_sections =====
server.tool(
  "list_sections",
  "List all top-level sections in the knowledge base with their page counts.",
  {},
  async () => {
    const sections = getSections();
    return { content: [{ type: "text", text: JSON.stringify(sections, null, 2) }] };
  }
);

// ===== TOOL 4: get_related =====
server.tool(
  "get_related",
  "Find the top 5 pages related to a given page based on shared tags.",
  {
    path: z.string().describe("Page path to find related pages for"),
  },
  async ({ path: pagePath }) => {
    const target = findPage(pagePath);
    if (!target) {
      return { content: [{ type: "text", text: `Page not found: "${pagePath}".` }] };
    }
    if (target.tags.length === 0) {
      return { content: [{ type: "text", text: `Page "${target.title}" has no tags — cannot find related pages.` }] };
    }

    const scored = [];
    for (const page of pageCache) {
      if (page.relPath === target.relPath) continue;
      const shared = page.tags.filter((t) => target.tags.includes(t));
      if (shared.length > 0) {
        scored.push({
          title: page.title,
          path: page.relPath,
          description: page.description,
          section: page.section,
          sharedTags: shared,
          score: shared.length,
        });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 5);

    if (top.length === 0) {
      return { content: [{ type: "text", text: `No related pages found for "${target.title}".` }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(top, null, 2) }] };
  }
);

// ===== TOOL 5: list_pages =====
server.tool(
  "list_pages",
  "List all pages in a given section with title, path, and description.",
  {
    section: z.string().describe('Section name, e.g. "system-design", "eda", "cheat-sheets", "security"'),
  },
  async ({ section }) => {
    const pages = pageCache
      .filter((p) => p.section === section)
      .map((p) => ({
        title: p.title,
        path: p.relPath,
        description: p.description,
        difficulty: p.difficulty,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));

    if (pages.length === 0) {
      const available = getSections().map((s) => s.name).join(", ");
      return { content: [{ type: "text", text: `No section "${section}" found. Available: ${available}` }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(pages, null, 2) }] };
  }
);

// ===== TOOL 6: get_cheat_sheet =====
server.tool(
  "get_cheat_sheet",
  "Get a cheat sheet by topic. Lists available cheat sheets if the topic is not found.",
  {
    topic: z.string().describe('Cheat sheet topic, e.g. "docker", "git", "kubernetes", "python"'),
  },
  async ({ topic }) => {
    const normalised = topic.toLowerCase().replace(/\s+/g, "-");
    let page =
      pageCache.find(
        (p) =>
          p.section === "cheat-sheets" &&
          (p.relPath === `cheat-sheets/${normalised}` ||
            p.relPath === `cheat-sheets/${normalised}/index`)
      ) ||
      pageCache.find(
        (p) => p.section === "cheat-sheets" && p.relPath.includes(normalised)
      ) ||
      pageCache.find(
        (p) =>
          p.title.toLowerCase().includes("cheat") &&
          p.title.toLowerCase().includes(normalised)
      );

    if (!page) {
      const available = pageCache
        .filter((p) => p.section === "cheat-sheets" && !p.relPath.endsWith("/index"))
        .map((p) => p.relPath.replace("cheat-sheets/", ""))
        .sort();
      return {
        content: [
          {
            type: "text",
            text: `No cheat sheet for "${topic}".\n\nAvailable:\n${available.map((a) => `  - ${a}`).join("\n")}`,
          },
        ],
      };
    }
    return { content: [{ type: "text", text: formatPage(page) }] };
  }
);

// ===== TOOL 7: search_by_tag =====
server.tool(
  "search_by_tag",
  "Find all pages with a specific tag.",
  {
    tag: z.string().describe("Tag to search for, e.g. 'redis', 'distributed-systems', 'react'"),
    limit: z.number().optional().default(20).describe("Max results (default 20)"),
  },
  async ({ tag, limit }) => {
    const normalised = tag.toLowerCase();
    const results = pageCache
      .filter((p) => p.tags.some((t) => t.toLowerCase() === normalised))
      .slice(0, limit)
      .map((p) => ({
        title: p.title,
        path: p.relPath,
        section: p.section,
        description: p.description,
      }));

    if (results.length === 0) {
      return { content: [{ type: "text", text: `No pages tagged "${tag}". Use list_all_tags to see available tags.` }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }
);

// ===== TOOL 8: search_by_difficulty =====
server.tool(
  "search_by_difficulty",
  "Find pages by difficulty level.",
  {
    difficulty: z
      .enum(["beginner", "intermediate", "advanced", "expert"])
      .describe("Difficulty level"),
    section: z.string().optional().describe("Optional: limit to a specific section"),
    limit: z.number().optional().default(20).describe("Max results (default 20)"),
  },
  async ({ difficulty, section, limit }) => {
    let results = pageCache.filter((p) => p.difficulty === difficulty);
    if (section) {
      results = results.filter((p) => p.section === section);
    }
    const output = results.slice(0, limit).map((p) => ({
      title: p.title,
      path: p.relPath,
      section: p.section,
      description: p.description,
    }));

    if (output.length === 0) {
      return {
        content: [{ type: "text", text: `No ${difficulty} pages found${section ? ` in section "${section}"` : ""}.` }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
  }
);

// ===== TOOL 9: get_comparison =====
server.tool(
  "get_comparison",
  'Get a comparison page (X vs Y). E.g. "react" and "vue" returns the React vs Vue vs Svelte page.',
  {
    tech1: z.string().describe("First technology"),
    tech2: z.string().describe("Second technology"),
  },
  async ({ tech1, tech2 }) => {
    const t1 = tech1.toLowerCase();
    const t2 = tech2.toLowerCase();
    const page = pageCache.find(
      (p) =>
        p.section === "comparisons" &&
        p.title.toLowerCase().includes(t1) &&
        p.title.toLowerCase().includes(t2)
    ) ||
    pageCache.find(
      (p) =>
        p.section === "comparisons" &&
        (p.relPath.toLowerCase().includes(t1) || p.relPath.toLowerCase().includes(t2))
    );

    if (!page) {
      const available = pageCache
        .filter((p) => p.section === "comparisons" && !p.relPath.endsWith("/index"))
        .map((p) => p.title)
        .sort();
      return {
        content: [
          {
            type: "text",
            text: `No comparison found for "${tech1}" vs "${tech2}".\n\nAvailable comparisons:\n${available.map((a) => `  - ${a}`).join("\n")}`,
          },
        ],
      };
    }
    return { content: [{ type: "text", text: formatPage(page) }] };
  }
);

// ===== TOOL 10: get_interview =====
server.tool(
  "get_interview",
  "Get a system design interview walkthrough by topic.",
  {
    topic: z.string().describe('Interview topic, e.g. "instagram", "uber", "chat-system", "cdn"'),
  },
  async ({ topic }) => {
    const normalised = topic.toLowerCase().replace(/\s+/g, "-");
    const page =
      pageCache.find(
        (p) => p.section === "system-design-interviews" && p.relPath.includes(normalised)
      ) ||
      pageCache.find(
        (p) =>
          p.section === "system-design-interviews" &&
          p.title.toLowerCase().includes(normalised)
      );

    if (!page) {
      const available = pageCache
        .filter((p) => p.section === "system-design-interviews" && !p.relPath.endsWith("/index"))
        .map((p) => `${p.relPath.split("/").pop()} — ${p.title}`)
        .sort();
      return {
        content: [
          {
            type: "text",
            text: `No interview found for "${topic}".\n\nAvailable:\n${available.map((a) => `  - ${a}`).join("\n")}`,
          },
        ],
      };
    }
    return { content: [{ type: "text", text: formatPage(page) }] };
  }
);

// ===== TOOL 11: get_lld =====
server.tool(
  "get_lld",
  "Get a low-level design (LLD) interview problem by topic.",
  {
    topic: z.string().describe('LLD topic, e.g. "parking-lot", "elevator", "chess", "vending-machine"'),
  },
  async ({ topic }) => {
    const normalised = topic.toLowerCase().replace(/\s+/g, "-");
    const page =
      pageCache.find(
        (p) => p.section === "lld-interviews" && p.relPath.includes(normalised)
      ) ||
      pageCache.find(
        (p) =>
          p.section === "lld-interviews" &&
          p.title.toLowerCase().includes(normalised)
      );

    if (!page) {
      const available = pageCache
        .filter((p) => p.section === "lld-interviews" && !p.relPath.endsWith("/index"))
        .map((p) => `${p.relPath.split("/").pop()} — ${p.title}`)
        .sort();
      return {
        content: [
          {
            type: "text",
            text: `No LLD problem found for "${topic}".\n\nAvailable:\n${available.map((a) => `  - ${a}`).join("\n")}`,
          },
        ],
      };
    }
    return { content: [{ type: "text", text: formatPage(page) }] };
  }
);

// ===== TOOL 12: get_war_room =====
server.tool(
  "get_war_room",
  "Get a real incident case study from the War Room.",
  {
    topic: z.string().describe('Incident topic, e.g. "cloudflare", "crowdstrike", "knight-capital", "facebook"'),
  },
  async ({ topic }) => {
    const normalised = topic.toLowerCase().replace(/\s+/g, "-");
    const page =
      pageCache.find(
        (p) => p.section === "war-room" && p.relPath.includes(normalised)
      ) ||
      pageCache.find(
        (p) =>
          p.section === "war-room" &&
          p.title.toLowerCase().includes(normalised)
      );

    if (!page) {
      const available = pageCache
        .filter((p) => p.section === "war-room" && !p.relPath.endsWith("/index"))
        .map((p) => `${p.relPath.split("/").pop()} — ${p.title}`)
        .sort();
      return {
        content: [
          {
            type: "text",
            text: `No war room entry for "${topic}".\n\nAvailable:\n${available.map((a) => `  - ${a}`).join("\n")}`,
          },
        ],
      };
    }
    return { content: [{ type: "text", text: formatPage(page) }] };
  }
);

// ===== TOOL 13: get_checklist =====
server.tool(
  "get_checklist",
  "Get a production readiness checklist by topic.",
  {
    topic: z.string().describe('Checklist topic, e.g. "pre-launch", "security-review", "performance-review", "observability-readiness"'),
  },
  async ({ topic }) => {
    const normalised = topic.toLowerCase().replace(/\s+/g, "-");
    // Check devops/checklists first, then broader search
    const page =
      pageCache.find(
        (p) => p.relPath.includes("checklists") && p.relPath.includes(normalised)
      ) ||
      pageCache.find(
        (p) =>
          p.title.toLowerCase().includes("checklist") &&
          p.title.toLowerCase().includes(normalised)
      ) ||
      pageCache.find(
        (p) =>
          p.tags.includes("checklist") &&
          (p.relPath.includes(normalised) || p.title.toLowerCase().includes(normalised))
      );

    if (!page) {
      const available = pageCache
        .filter(
          (p) =>
            p.relPath.includes("checklist") ||
            p.title.toLowerCase().includes("checklist") ||
            p.tags.includes("checklist")
        )
        .map((p) => `${p.relPath} — ${p.title}`)
        .sort();
      return {
        content: [
          {
            type: "text",
            text: `No checklist for "${topic}".\n\nAvailable:\n${available.map((a) => `  - ${a}`).join("\n")}`,
          },
        ],
      };
    }
    return { content: [{ type: "text", text: formatPage(page) }] };
  }
);

// ===== TOOL 14: get_runbook =====
server.tool(
  "get_runbook",
  "Get an operational runbook or debugging playbook.",
  {
    topic: z.string().describe('Runbook topic, e.g. "memory-leak", "high-error-rate", "pods-restarting", "api-slow"'),
  },
  async ({ topic }) => {
    const normalised = topic.toLowerCase().replace(/\s+/g, "-");
    // Search debugging-playbooks, then runbook-templates, then broader
    const page =
      pageCache.find(
        (p) => p.section === "debugging-playbooks" && p.relPath.includes(normalised)
      ) ||
      pageCache.find(
        (p) => p.relPath.includes("runbook") && p.relPath.includes(normalised)
      ) ||
      pageCache.find(
        (p) =>
          (p.section === "debugging-playbooks" || p.relPath.includes("runbook")) &&
          p.title.toLowerCase().includes(normalised)
      );

    if (!page) {
      const available = [
        ...pageCache
          .filter((p) => p.section === "debugging-playbooks" && !p.relPath.endsWith("/index"))
          .map((p) => `${p.relPath} — ${p.title}`),
        ...pageCache
          .filter((p) => p.relPath.includes("runbook") && !p.relPath.endsWith("/index"))
          .map((p) => `${p.relPath} — ${p.title}`),
      ].sort();
      return {
        content: [
          {
            type: "text",
            text: `No runbook for "${topic}".\n\nAvailable:\n${available.map((a) => `  - ${a}`).join("\n")}`,
          },
        ],
      };
    }
    return { content: [{ type: "text", text: formatPage(page) }] };
  }
);

// ===== TOOL 15: get_learning_path =====
server.tool(
  "get_learning_path",
  "Get a structured learning path for a role or topic.",
  {
    path_name: z.string().describe('Learning path name, e.g. "backend-engineer", "frontend-engineer", "devops-engineer", "ai-ml-engineer"'),
  },
  async ({ path_name }) => {
    const normalised = path_name.toLowerCase().replace(/\s+/g, "-");
    const page =
      pageCache.find(
        (p) => p.section === "learning-paths" && p.relPath.includes(normalised)
      ) ||
      pageCache.find(
        (p) =>
          p.section === "learning-paths" &&
          p.title.toLowerCase().includes(normalised)
      );

    if (!page) {
      const available = pageCache
        .filter((p) => p.section === "learning-paths" && !p.relPath.endsWith("/index"))
        .map((p) => `${p.relPath.split("/").pop()} — ${p.title}`)
        .sort();
      return {
        content: [
          {
            type: "text",
            text: `No learning path for "${path_name}".\n\nAvailable:\n${available.map((a) => `  - ${a}`).join("\n")}`,
          },
        ],
      };
    }
    return { content: [{ type: "text", text: formatPage(page) }] };
  }
);

// ===== TOOL 16: get_glossary_term =====
server.tool(
  "get_glossary_term",
  "Look up an engineering term from the glossary.",
  {
    term: z.string().describe('Term to look up, e.g. "CQRS", "CAP theorem", "idempotency"'),
  },
  async ({ term }) => {
    const normalised = term.toLowerCase();

    // Exact match
    if (glossaryIndex[normalised]) {
      const entry = glossaryIndex[normalised];
      return { content: [{ type: "text", text: `**${entry.term}**: ${entry.definition}` }] };
    }

    // Partial match
    const matches = Object.values(glossaryIndex).filter(
      (e) =>
        e.term.toLowerCase().includes(normalised) ||
        normalised.includes(e.term.toLowerCase())
    );

    if (matches.length > 0) {
      const text = matches
        .slice(0, 10)
        .map((e) => `**${e.term}**: ${e.definition}`)
        .join("\n\n");
      return { content: [{ type: "text", text }] };
    }

    // Fallback: search across all pages
    const results = searchPages(term, 3);
    if (results.length > 0) {
      return {
        content: [
          {
            type: "text",
            text: `Term "${term}" not in glossary, but found in these pages:\n\n${JSON.stringify(results, null, 2)}`,
          },
        ],
      };
    }

    return { content: [{ type: "text", text: `Term "${term}" not found in glossary or knowledge base.` }] };
  }
);

// ===== TOOL 17: get_code_examples =====
server.tool(
  "get_code_examples",
  "Extract all code blocks from a page, optionally filtered by programming language.",
  {
    path: z.string().describe("Page path"),
    language: z.string().optional().describe('Filter by language, e.g. "typescript", "python", "sql"'),
  },
  async ({ path: pagePath, language }) => {
    const page = findPage(pagePath);
    if (!page) {
      return { content: [{ type: "text", text: `Page not found: "${pagePath}".` }] };
    }

    const blocks = extractCodeBlocks(page.body, language || null);
    if (blocks.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No code blocks${language ? ` in "${language}"` : ""} found in "${page.title}".`,
          },
        ],
      };
    }

    const text = blocks
      .map((b, i) => `### Block ${i + 1} (${b.language})\n\`\`\`${b.language}\n${b.code}\n\`\`\``)
      .join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `# Code from: ${page.title}\n\n${blocks.length} block(s)${language ? ` in ${language}` : ""}.\n\n${text}`,
        },
      ],
    };
  }
);

// ===== TOOL 18: random_page =====
server.tool(
  "random_page",
  "Get a random page from the knowledge base. Great for learning something new.",
  {
    section: z.string().optional().describe("Optional: limit to a specific section"),
  },
  async ({ section }) => {
    let pool = pageCache;
    if (section) {
      pool = pageCache.filter((p) => p.section === section);
    }
    // Exclude index pages
    pool = pool.filter((p) => !p.relPath.endsWith("/index") && !p.relPath.endsWith("index"));

    if (pool.length === 0) {
      return { content: [{ type: "text", text: `No pages found${section ? ` in section "${section}"` : ""}.` }] };
    }

    const page = pool[Math.floor(Math.random() * pool.length)];
    return { content: [{ type: "text", text: formatPage(page) }] };
  }
);

// ===== TOOL 19: get_build_guide =====
server.tool(
  "get_build_guide",
  'Get a "build from scratch" tutorial (e.g. build Redis, a load balancer, or a rate limiter from scratch).',
  {
    topic: z.string().describe('Build guide topic, e.g. "redis", "load-balancer", "rate-limiter", "key-value-store"'),
  },
  async ({ topic }) => {
    const normalised = topic.toLowerCase().replace(/\s+/g, "-");
    const page =
      pageCache.find(
        (p) => p.section === "build-from-scratch" && p.relPath.includes(normalised)
      ) ||
      pageCache.find(
        (p) =>
          p.section === "build-from-scratch" &&
          p.title.toLowerCase().includes(normalised)
      );

    if (!page) {
      const available = pageCache
        .filter((p) => p.section === "build-from-scratch" && !p.relPath.endsWith("/index"))
        .map((p) => `${p.relPath.split("/").pop()} — ${p.title}`)
        .sort();
      return {
        content: [
          {
            type: "text",
            text: `No build guide for "${topic}".\n\nAvailable:\n${available.map((a) => `  - ${a}`).join("\n")}`,
          },
        ],
      };
    }
    return { content: [{ type: "text", text: formatPage(page) }] };
  }
);

// ===== TOOL 20: get_eda_guide =====
server.tool(
  "get_eda_guide",
  "Get an Exploratory Data Analysis (EDA) page by topic.",
  {
    topic: z.string().describe('EDA topic, e.g. "missing-data", "outlier-analysis", "pandas-fundamentals", "eda-workflow"'),
  },
  async ({ topic }) => {
    const normalised = topic.toLowerCase().replace(/\s+/g, "-");
    const page =
      pageCache.find(
        (p) => p.section === "eda" && p.relPath.includes(normalised)
      ) ||
      pageCache.find(
        (p) =>
          p.section === "eda" &&
          p.title.toLowerCase().includes(normalised)
      );

    if (!page) {
      const available = pageCache
        .filter((p) => p.section === "eda" && !p.relPath.endsWith("/index"))
        .map((p) => `${p.relPath.replace("eda/", "")} — ${p.title}`)
        .sort();
      return {
        content: [
          {
            type: "text",
            text: `No EDA guide for "${topic}".\n\nAvailable (${available.length}):\n${available.map((a) => `  - ${a}`).join("\n")}`,
          },
        ],
      };
    }
    return { content: [{ type: "text", text: formatPage(page) }] };
  }
);

// ===== TOOL 21: list_all_tags =====
server.tool(
  "list_all_tags",
  "List all unique tags across the knowledge base with their page counts.",
  {},
  async () => {
    const tags = getAllTags();
    return {
      content: [
        {
          type: "text",
          text: `${tags.length} unique tags.\n\n${JSON.stringify(tags, null, 2)}`,
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// MCP Resources
// ---------------------------------------------------------------------------

// Resource template: sections
server.resource(
  "section",
  new ResourceTemplate("archon://sections/{section_name}", { list: undefined }),
  { description: "Browse a section of the knowledge base. Returns all pages in the section." },
  async (uri, { section_name }) => {
    const pages = pageCache
      .filter((p) => p.section === section_name)
      .map((p) => ({
        title: p.title,
        path: p.relPath,
        description: p.description,
        difficulty: p.difficulty,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({ section: section_name, count: pages.length, pages }, null, 2),
        },
      ],
    };
  }
);

// Resource template: cheat sheets
server.resource(
  "cheat-sheet",
  new ResourceTemplate("archon://cheat-sheets/{topic}", { list: undefined }),
  { description: "Read a cheat sheet by topic." },
  async (uri, { topic }) => {
    const normalised = topic.toLowerCase().replace(/\s+/g, "-");
    const page =
      pageCache.find(
        (p) => p.section === "cheat-sheets" && p.relPath.includes(normalised)
      ) ||
      pageCache.find(
        (p) =>
          p.title.toLowerCase().includes("cheat") &&
          p.title.toLowerCase().includes(normalised)
      );

    if (!page) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: `Cheat sheet not found for topic: ${topic}`,
          },
        ],
      };
    }

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: formatPage(page),
        },
      ],
    };
  }
);

// Resource template: learning paths
server.resource(
  "learning-path",
  new ResourceTemplate("archon://learning-paths/{path_name}", { list: undefined }),
  { description: "Read a structured learning path." },
  async (uri, { path_name }) => {
    const normalised = path_name.toLowerCase().replace(/\s+/g, "-");
    const page =
      pageCache.find(
        (p) => p.section === "learning-paths" && p.relPath.includes(normalised)
      ) ||
      pageCache.find(
        (p) =>
          p.section === "learning-paths" &&
          p.title.toLowerCase().includes(normalised)
      );

    if (!page) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: `Learning path not found: ${path_name}`,
          },
        ],
      };
    }

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: formatPage(page),
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// MCP Prompts
// ---------------------------------------------------------------------------

// Prompt: explain-concept
server.prompt(
  "explain-concept",
  "Pull relevant knowledge base pages and create a structured explanation of an engineering concept.",
  {
    topic: z.string().describe("The concept to explain, e.g. 'circuit breaker', 'CQRS', 'raft consensus'"),
    level: z
      .enum(["beginner", "intermediate", "advanced", "expert"])
      .describe("Target audience level"),
  },
  async ({ topic, level }) => {
    const results = searchPages(topic, 5);
    const context = results
      .map((r) => {
        const page = findPage(r.path);
        return page ? `--- PAGE: ${page.title} (${page.relPath}) ---\n${page.body.slice(0, 3000)}` : "";
      })
      .filter(Boolean)
      .join("\n\n");

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are an expert software engineer. Using the knowledge base content below, explain the concept "${topic}" at a ${level} level.\n\nRequirements:\n- Start with a one-paragraph summary\n- Explain how it works with concrete examples\n- Cover common pitfalls and best practices\n- If relevant, mention related concepts\n- Adapt complexity and jargon to the ${level} level\n\n--- KNOWLEDGE BASE CONTEXT ---\n\n${context || `No specific pages found for "${topic}". Use your general knowledge.`}`,
          },
        },
      ],
    };
  }
);

// Prompt: interview-prep
server.prompt(
  "interview-prep",
  "Pull interview-related pages and create a preparation prompt.",
  {
    type: z
      .enum(["system-design", "lld", "behavioral"])
      .describe("Interview type"),
    topic: z.string().describe("Specific topic, e.g. 'design uber', 'parking lot', 'conflict resolution'"),
  },
  async ({ type, topic }) => {
    let pages = [];

    if (type === "system-design") {
      pages = pageCache.filter(
        (p) =>
          p.section === "system-design-interviews" &&
          (p.title.toLowerCase().includes(topic.toLowerCase()) ||
            p.relPath.includes(topic.toLowerCase().replace(/\s+/g, "-")))
      );
    } else if (type === "lld") {
      pages = pageCache.filter(
        (p) =>
          p.section === "lld-interviews" &&
          (p.title.toLowerCase().includes(topic.toLowerCase()) ||
            p.relPath.includes(topic.toLowerCase().replace(/\s+/g, "-")))
      );
    } else {
      pages = pageCache.filter(
        (p) =>
          p.relPath.includes("behavioral") ||
          p.title.toLowerCase().includes("behavioral")
      );
    }

    // Also pull related search results
    const searchResults = searchPages(`${type} ${topic}`, 3);
    for (const r of searchResults) {
      if (!pages.find((p) => p.relPath === r.path)) {
        const p = findPage(r.path);
        if (p) pages.push(p);
      }
    }

    const context = pages
      .slice(0, 5)
      .map((p) => `--- PAGE: ${p.title} (${p.relPath}) ---\n${p.body.slice(0, 4000)}`)
      .join("\n\n");

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are a senior engineering interviewer. Using the knowledge base content below, help me prepare for a ${type} interview on "${topic}".\n\nProvide:\n1. A clear problem statement\n2. Key requirements to clarify\n3. Step-by-step solution approach\n4. Common follow-up questions and how to answer them\n5. Mistakes candidates commonly make\n\n--- KNOWLEDGE BASE CONTEXT ---\n\n${context || `No specific pages found. Use your general knowledge for a ${type} interview on "${topic}".`}`,
          },
        },
      ],
    };
  }
);

// Prompt: debug-issue
server.prompt(
  "debug-issue",
  "Pull debugging playbooks and create a structured debugging prompt.",
  {
    problem: z.string().describe("Description of the problem, e.g. 'API latency spike', 'OOM kills in production', '502 errors'"),
  },
  async ({ problem }) => {
    // Search debugging playbooks + war room
    const playbooks = pageCache.filter(
      (p) =>
        p.section === "debugging-playbooks" &&
        !p.relPath.endsWith("/index")
    );

    // Find most relevant playbook
    const normalised = problem.toLowerCase();
    const relevant = playbooks.filter(
      (p) =>
        p.title.toLowerCase().includes(normalised) ||
        normalised.split(/\s+/).some((w) => p.title.toLowerCase().includes(w))
    );

    // Also search broadly
    const searchResults = searchPages(problem, 5);

    const context = [
      ...relevant.map((p) => `--- PLAYBOOK: ${p.title} ---\n${p.body.slice(0, 4000)}`),
      ...searchResults
        .filter((r) => !relevant.find((p) => p.relPath === r.path))
        .slice(0, 3)
        .map((r) => {
          const p = findPage(r.path);
          return p ? `--- RELATED: ${p.title} ---\n${p.body.slice(0, 2000)}` : "";
        })
        .filter(Boolean),
    ].join("\n\n");

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are an SRE debugging a production issue. The problem: "${problem}"\n\nUsing the playbooks and knowledge base content below, provide:\n1. Immediate triage steps (first 5 minutes)\n2. Diagnostic commands to run\n3. Most likely root causes, ranked by probability\n4. Fix/mitigation for each root cause\n5. Post-incident action items\n\n--- KNOWLEDGE BASE CONTEXT ---\n\n${context || "No specific playbooks found. Use general SRE debugging knowledge."}`,
          },
        },
      ],
    };
  }
);

// Prompt: compare-tech
server.prompt(
  "compare-tech",
  "Pull a comparison page and create a structured technology comparison prompt.",
  {
    tech1: z.string().describe("First technology"),
    tech2: z.string().describe("Second technology"),
  },
  async ({ tech1, tech2 }) => {
    const t1 = tech1.toLowerCase();
    const t2 = tech2.toLowerCase();

    const comparisonPage = pageCache.find(
      (p) =>
        p.section === "comparisons" &&
        p.title.toLowerCase().includes(t1) &&
        p.title.toLowerCase().includes(t2)
    );

    // Also search for individual pages
    const pages1 = searchPages(tech1, 2);
    const pages2 = searchPages(tech2, 2);

    const context = [
      comparisonPage
        ? `--- COMPARISON PAGE: ${comparisonPage.title} ---\n${comparisonPage.body.slice(0, 6000)}`
        : "",
      ...pages1.map((r) => {
        const p = findPage(r.path);
        return p ? `--- ${tech1.toUpperCase()} CONTEXT: ${p.title} ---\n${p.body.slice(0, 2000)}` : "";
      }),
      ...pages2.map((r) => {
        const p = findPage(r.path);
        return p ? `--- ${tech2.toUpperCase()} CONTEXT: ${p.title} ---\n${p.body.slice(0, 2000)}` : "";
      }),
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Compare ${tech1} vs ${tech2} for a senior engineering audience.\n\nUsing the knowledge base content below, provide:\n1. Architecture/design philosophy differences\n2. Performance characteristics\n3. Ecosystem and community\n4. Learning curve\n5. When to use each (concrete scenarios)\n6. Migration considerations\n7. Final recommendation matrix\n\n--- KNOWLEDGE BASE CONTEXT ---\n\n${context || `No comparison page found for ${tech1} vs ${tech2}. Use general knowledge.`}`,
          },
        },
      ],
    };
  }
);

// Prompt: eda-workflow
server.prompt(
  "eda-workflow",
  "Pull EDA workflow and checklist pages to create a guided data analysis prompt.",
  {
    dataset_description: z.string().describe("Brief description of the dataset, e.g. 'e-commerce transactions with 500K rows, columns: user_id, product, price, timestamp, category'"),
  },
  async ({ dataset_description }) => {
    // Pull EDA workflow and checklist
    const workflowPage = pageCache.find((p) => p.relPath === "eda/eda-workflow");
    const checklistPage = pageCache.find((p) => p.relPath === "eda/eda-checklist");
    const missingDataPage = pageCache.find((p) => p.relPath === "eda/missing-data");
    const outlierPage = pageCache.find((p) => p.relPath === "eda/outlier-analysis");
    const distributionsPage = pageCache.find((p) => p.relPath === "eda/understanding-distributions");

    const context = [workflowPage, checklistPage, missingDataPage, outlierPage, distributionsPage]
      .filter(Boolean)
      .map((p) => `--- ${p.title} ---\n${p.body.slice(0, 3000)}`)
      .join("\n\n");

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are a data scientist performing Exploratory Data Analysis. The dataset: "${dataset_description}"\n\nUsing the EDA workflow and checklist from the knowledge base, provide a complete EDA plan:\n\n1. Data profiling steps (shape, types, nulls, duplicates)\n2. Univariate analysis plan for each column type\n3. Bivariate relationships to investigate\n4. Missing data strategy\n5. Outlier detection approach\n6. Feature engineering ideas\n7. Visualizations to create (with recommended chart types)\n8. Statistical tests to run\n9. Key questions to answer\n10. Python/pandas code snippets for each step\n\n--- KNOWLEDGE BASE CONTEXT ---\n\n${context}`,
          },
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Transport — stdio (default) or HTTP/SSE (--http flag)
// ---------------------------------------------------------------------------

const isHttpMode = process.argv.includes("--http");

if (isHttpMode) {
  const PORT = parseInt(process.env.PORT || "3456", 10);

  /** @type {Map<string, SSEServerTransport>} */
  const sessions = new Map();

  const httpServer = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    // Health check
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          pages: pageCache.length,
          sections: getSections().length,
          tags: getAllTags().length,
          tools: 21,
          uptime: process.uptime(),
        })
      );
      return;
    }

    // SSE endpoint
    if (url.pathname === "/sse" && req.method === "GET") {
      const transport = new SSEServerTransport("/messages", res);
      sessions.set(transport.sessionId, transport);
      transport.onclose = () => sessions.delete(transport.sessionId);
      await server.connect(transport);
      log("info", "SSE client connected", { sessionId: transport.sessionId });
      return;
    }

    // Message endpoint
    if (url.pathname === "/messages" && req.method === "POST") {
      const sessionId = url.searchParams.get("sessionId");
      const transport = sessions.get(sessionId);
      if (!transport) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid or missing sessionId" }));
        return;
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      await transport.handlePostMessage(req, res, body);
      return;
    }

    // Fallback
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  httpServer.listen(PORT, () => {
    log("info", "HTTP/SSE server started", {
      port: PORT,
      sse: `http://localhost:${PORT}/sse`,
      health: `http://localhost:${PORT}/health`,
    });
  });
} else {
  // Default: stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("info", "Server running on stdio transport");
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal) {
  log("info", "Shutting down", { signal });
  try {
    await server.close();
  } catch {
    // ignore close errors
  }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (err) => {
  log("error", "Uncaught exception", { error: err.message, stack: err.stack });
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  log("error", "Unhandled rejection", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
