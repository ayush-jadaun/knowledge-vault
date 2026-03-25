// Archon MCP — Remote Edge Function endpoint
// URL: https://archon-eight.vercel.app/api/mcp

export const config = { runtime: 'edge' }

const SITE_URL = 'https://archon-eight.vercel.app'
const RATE_LIMIT = 60
const RATE_WINDOW = 60000
const rateLimits = new Map()

function checkRate(ip) {
  const now = Date.now()
  const e = rateLimits.get(ip)
  if (!e || now - e.s > RATE_WINDOW) { rateLimits.set(ip, { s: now, c: 1 }); return true }
  return ++e.c <= RATE_LIMIT
}

let cache = null
let cacheAt = 0

async function loadIndex() {
  if (cache && Date.now() - cacheAt < 300000) return cache
  const r = await fetch(`${SITE_URL}/ai-context.json`)
  if (!r.ok) { if (cache) return cache; throw new Error('Cannot load index') }
  cache = await r.json()
  cacheAt = Date.now()
  return cache
}

function search(pages, q, limit = 10) {
  const terms = q.toLowerCase().split(/\s+/)
  return pages.map(p => {
    let s = 0
    const t = (p.title || '').toLowerCase(), d = (p.description || '').toLowerCase()
    const tags = (p.tags || []).join(' ').toLowerCase(), b = (p.content || '').toLowerCase().slice(0, 2000)
    for (const w of terms) { if (t.includes(w)) s += 10; if (d.includes(w)) s += 5; if (tags.includes(w)) s += 3; if (b.includes(w)) s += 1 }
    return { ...p, score: s }
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit)
    .map(({ content, ...r }) => ({ ...r, snippet: (content || '').slice(0, 200) }))
}

const TOOLS = {
  search_archon: (a, p) => ({ results: search(p, a.query, a.limit || 10) }),
  get_page: (a, p) => { const pg = p.find(x => x.path === a.path || x.path?.endsWith(a.path)); return pg ? { title: pg.title, path: pg.path, content: pg.content } : { error: 'Not found' } },
  list_sections: (_, p) => { const s = {}; p.forEach(x => { const k = (x.path || '').split('/')[0]; s[k] = (s[k] || 0) + 1 }); return { sections: s, total: p.length } },
  list_pages: (a, p) => { const f = p.filter(x => x.path?.startsWith(a.section)); return { pages: f.map(x => ({ title: x.title, path: x.path, description: x.description })), total: f.length } },
  get_related: (a, p) => { const pg = p.find(x => x.path?.endsWith(a.path)); if (!pg) return { error: 'Not found' }; const ts = new Set(pg.tags || []); return { related: p.filter(x => x.path !== pg.path).map(x => ({ ...x, shared: (x.tags || []).filter(t => ts.has(t)).length })).filter(x => x.shared > 0).sort((a, b) => b.shared - a.shared).slice(0, 5).map(({ content, ...r }) => r) } },
  random_page: (_, p) => { const pg = p[Math.floor(Math.random() * p.length)]; return { title: pg.title, path: pg.path, description: pg.description } },
  list_all_tags: (_, p) => { const t = {}; p.forEach(x => (x.tags || []).forEach(tag => { t[tag] = (t[tag] || 0) + 1 })); return { tags: t } },
}

const TOOL_LIST = [
  { name: 'search_archon', description: 'Search 1000+ engineering pages', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } },
  { name: 'get_page', description: 'Get full page content by path', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'list_sections', description: 'List all sections with page counts', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_pages', description: 'List pages in a section', inputSchema: { type: 'object', properties: { section: { type: 'string' } }, required: ['section'] } },
  { name: 'get_related', description: 'Find related pages', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'random_page', description: 'Get a random page', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_all_tags', description: 'List all tags', inputSchema: { type: 'object', properties: {} } },
]

async function handleRPC(body) {
  const { method, params, id } = body
  if (method === 'initialize') return { jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', serverInfo: { name: 'archon-mcp', version: '1.0.0' }, capabilities: { tools: {} } } }
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOL_LIST } }
  if (method === 'tools/call') {
    const h = TOOLS[params.name]
    if (!h) return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${params.name}` } }
    const pages = await loadIndex()
    const arr = Array.isArray(pages) ? pages : pages.pages || []
    const result = h(params.arguments || {}, arr)
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } }
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } })

  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
  if (!checkRate(ip)) return new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429, headers })

  if (req.method === 'GET') return new Response(JSON.stringify({ name: 'archon-mcp', version: '1.0.0', tools: TOOL_LIST.length, docs: `${SITE_URL}/mcp` }), { headers })

  if (req.method === 'POST') {
    try {
      const body = await req.json()
      const result = await handleRPC(body)
      return new Response(JSON.stringify(result), { headers })
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers })
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
}
