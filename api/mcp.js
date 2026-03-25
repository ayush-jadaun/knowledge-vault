// Archon MCP — Remote endpoint via Vercel Serverless
// Handles MCP Streamable HTTP transport
// URL: https://archon-eight.vercel.app/api/mcp

const SITE_URL = 'https://archon-eight.vercel.app'

// Rate limiting (in-memory, per Vercel instance)
const rateLimits = new Map()
const RATE_LIMIT = 60 // requests per minute
const RATE_WINDOW = 60 * 1000

function checkRateLimit(ip) {
  const now = Date.now()
  const key = ip || 'unknown'
  const entry = rateLimits.get(key)
  if (!entry || now - entry.start > RATE_WINDOW) {
    rateLimits.set(key, { start: now, count: 1 })
    return { allowed: true, remaining: RATE_LIMIT - 1 }
  }
  entry.count++
  if (entry.count > RATE_LIMIT) {
    return { allowed: false, remaining: 0 }
  }
  return { allowed: true, remaining: RATE_LIMIT - entry.count }
}

// Lightweight in-memory cache
let indexCache = null
let indexLoadedAt = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function loadIndex() {
  const now = Date.now()
  if (indexCache && now - indexLoadedAt < CACHE_TTL) return indexCache
  try {
    const res = await fetch(`${SITE_URL}/ai-context.json`)
    if (!res.ok) throw new Error(`Failed to fetch index: ${res.status}`)
    indexCache = await res.json()
    indexLoadedAt = now
    return indexCache
  } catch {
    if (indexCache) return indexCache // stale cache better than nothing
    throw new Error('Cannot load Archon index')
  }
}

function searchPages(pages, query, limit = 10) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const scored = pages.map(p => {
    let score = 0
    const title = (p.title || '').toLowerCase()
    const desc = (p.description || '').toLowerCase()
    const tags = (p.tags || []).join(' ').toLowerCase()
    const content = (p.content || '').toLowerCase().slice(0, 2000)
    for (const t of terms) {
      if (title.includes(t)) score += 10
      if (desc.includes(t)) score += 5
      if (tags.includes(t)) score += 3
      if (content.includes(t)) score += 1
    }
    return { ...p, score }
  }).filter(r => r.score > 0)
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map(({ score, content, ...rest }) => ({
    ...rest,
    score,
    snippet: (content || '').slice(0, 200)
  }))
}

// Tool handlers
const TOOLS = {
  search_archon: async (args, pages) => {
    const results = searchPages(pages, args.query, args.limit || 10)
    return { results, total: results.length }
  },
  get_page: async (args, pages) => {
    const path = args.path.replace(/^\//, '').replace(/\.md$/, '')
    const page = pages.find(p => p.path === path || p.path?.endsWith(path))
    if (!page) return { error: `Page not found: ${args.path}` }
    return { title: page.title, path: page.path, content: page.content }
  },
  list_sections: async (_, pages) => {
    const sections = {}
    pages.forEach(p => {
      const section = (p.path || '').split('/')[0] || 'root'
      sections[section] = (sections[section] || 0) + 1
    })
    return { sections, total: pages.length }
  },
  list_pages: async (args, pages) => {
    const section = args.section.replace(/^\//, '').replace(/\/$/, '')
    const filtered = pages.filter(p => p.path?.startsWith(section + '/'))
    return {
      section,
      pages: filtered.map(p => ({ title: p.title, path: p.path, description: p.description })),
      total: filtered.length
    }
  },
  get_related: async (args, pages) => {
    const path = args.path.replace(/^\//, '').replace(/\.md$/, '')
    const page = pages.find(p => p.path === path || p.path?.endsWith(path))
    if (!page) return { error: `Page not found: ${args.path}` }
    const pageTags = new Set(page.tags || [])
    const related = pages
      .filter(p => p.path !== page.path)
      .map(p => {
        const shared = (p.tags || []).filter(t => pageTags.has(t))
        return { ...p, sharedTags: shared.length }
      })
      .filter(r => r.sharedTags > 0)
      .sort((a, b) => b.sharedTags - a.sharedTags)
      .slice(0, 5)
    return { page: page.title, related: related.map(r => ({ title: r.title, path: r.path, sharedTags: r.sharedTags })) }
  },
  random_page: async (_, pages) => {
    const page = pages[Math.floor(Math.random() * pages.length)]
    return { title: page.title, path: page.path, description: page.description }
  },
  list_all_tags: async (_, pages) => {
    const tags = {}
    pages.forEach(p => (p.tags || []).forEach(t => { tags[t] = (tags[t] || 0) + 1 }))
    const sorted = Object.entries(tags).sort((a, b) => b[1] - a[1])
    return { tags: Object.fromEntries(sorted), total: sorted.length }
  }
}

// JSON-RPC handler
async function handleRPC(body) {
  const { method, params, id } = body

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'archon-mcp', version: '1.0.0' },
        capabilities: { tools: {} }
      }
    }
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0', id,
      result: {
        tools: [
          { name: 'search_archon', description: 'Search across 1000+ engineering pages', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } },
          { name: 'get_page', description: 'Get full content of a page by path', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
          { name: 'list_sections', description: 'List all sections with page counts', inputSchema: { type: 'object', properties: {} } },
          { name: 'list_pages', description: 'List pages in a section', inputSchema: { type: 'object', properties: { section: { type: 'string' } }, required: ['section'] } },
          { name: 'get_related', description: 'Find related pages by shared tags', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
          { name: 'random_page', description: 'Get a random page', inputSchema: { type: 'object', properties: {} } },
          { name: 'list_all_tags', description: 'List all tags with counts', inputSchema: { type: 'object', properties: {} } },
        ]
      }
    }
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params
    const handler = TOOLS[name]
    if (!handler) {
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } }
    }
    try {
      const pages = await loadIndex()
      const result = await handler(args || {}, Array.isArray(pages) ? pages : pages.pages || [])
      return {
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }
    } catch (err) {
      return { jsonrpc: '2.0', id, error: { code: -32000, message: err.message } }
    }
  }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress
  const rateCheck = checkRateLimit(ip)
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT)
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining)
  if (!rateCheck.allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded. 60 requests per minute.' })
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      name: 'archon-mcp',
      version: '1.0.0',
      description: 'Archon MCP Server — query 1000+ pages of engineering knowledge',
      tools: Object.keys(TOOLS).length,
      docs: 'https://archon-eight.vercel.app/mcp'
    })
  }

  if (req.method === 'POST') {
    try {
      const body = req.body
      const result = await handleRPC(body)
      return res.status(200).json(result)
    } catch (err) {
      return res.status(500).json({ jsonrpc: '2.0', error: { code: -32000, message: err.message } })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
