// Archon MCP — Remote Edge Function with all 21 tools + resources + prompts
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

function getPages(idx) { return Array.isArray(idx) ? idx : idx.pages || [] }

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

function findPage(pages, path) {
  const clean = (path || '').replace(/^\//, '').replace(/\.md$/, '')
  return pages.find(x => x.path === clean || x.path?.endsWith(clean) || x.path?.includes(clean))
}

function filterBySection(pages, section) {
  const s = section.replace(/^\//, '').replace(/\/$/, '')
  return pages.filter(x => x.path?.startsWith(s + '/') || x.path?.startsWith(s))
}

// ===== ALL 21 TOOLS =====
const TOOLS = {
  search_archon: (a, p) => ({ results: search(p, a.query, a.limit || 10) }),
  get_page: (a, p) => { const pg = findPage(p, a.path); return pg ? { title: pg.title, path: pg.path, description: pg.description, tags: pg.tags, content: pg.content } : { error: 'Not found: ' + a.path } },
  list_sections: (_, p) => { const s = {}; p.forEach(x => { const k = (x.path || '').split('/')[0]; s[k] = (s[k] || 0) + 1 }); return { sections: s, total: p.length } },
  list_pages: (a, p) => { const f = filterBySection(p, a.section); return { section: a.section, pages: f.map(x => ({ title: x.title, path: x.path, description: x.description })), total: f.length } },
  get_related: (a, p) => { const pg = findPage(p, a.path); if (!pg) return { error: 'Not found' }; const ts = new Set(pg.tags || []); return { page: pg.title, related: p.filter(x => x.path !== pg.path).map(x => ({ title: x.title, path: x.path, shared: (x.tags || []).filter(t => ts.has(t)).length })).filter(x => x.shared > 0).sort((a, b) => b.shared - a.shared).slice(0, 5) } },
  random_page: (_, p) => { const pg = p[Math.floor(Math.random() * p.length)]; return { title: pg.title, path: pg.path, description: pg.description, tags: pg.tags } },
  list_all_tags: (_, p) => { const t = {}; p.forEach(x => (x.tags || []).forEach(tag => { t[tag] = (t[tag] || 0) + 1 })); return { tags: Object.fromEntries(Object.entries(t).sort((a, b) => b[1] - a[1])), total: Object.keys(t).length } },
  search_by_tag: (a, p) => ({ pages: p.filter(x => (x.tags || []).includes(a.tag)).map(x => ({ title: x.title, path: x.path, description: x.description })) }),
  search_by_difficulty: (a, p) => ({ pages: p.filter(x => x.difficulty === a.difficulty).map(x => ({ title: x.title, path: x.path, description: x.description })) }),
  get_comparison: (a, p) => { const pg = p.find(x => x.path?.startsWith('comparisons/') && x.path?.includes(a.query.toLowerCase().replace(/\s+/g, '-'))); return pg ? { title: pg.title, path: pg.path, content: pg.content } : { error: 'Comparison not found. Available: ' + p.filter(x => x.path?.startsWith('comparisons/')).map(x => x.title).join(', ') } },
  get_interview: (a, p) => { const pg = p.find(x => x.path?.startsWith('system-design-interviews/') && (x.path?.includes(a.topic.toLowerCase().replace(/\s+/g, '-')) || x.title?.toLowerCase().includes(a.topic.toLowerCase()))); return pg ? { title: pg.title, path: pg.path, content: pg.content } : { error: 'Interview not found for: ' + a.topic } },
  get_lld: (a, p) => { const pg = p.find(x => x.path?.startsWith('lld-interviews/') && (x.path?.includes(a.topic.toLowerCase().replace(/\s+/g, '-')) || x.title?.toLowerCase().includes(a.topic.toLowerCase()))); return pg ? { title: pg.title, path: pg.path, content: pg.content } : { error: 'LLD not found for: ' + a.topic } },
  get_war_room: (a, p) => { const pg = p.find(x => x.path?.startsWith('war-room/') && (x.path?.includes(a.query.toLowerCase().replace(/\s+/g, '-')) || x.title?.toLowerCase().includes(a.query.toLowerCase()))); return pg ? { title: pg.title, path: pg.path, content: pg.content } : { error: 'Incident not found. Available: ' + p.filter(x => x.path?.startsWith('war-room/') && x.path !== 'war-room/').map(x => x.title).join(', ') } },
  get_checklist: (a, p) => { const pg = p.find(x => x.path?.includes('checklist') && x.path?.includes(a.topic.toLowerCase().replace(/\s+/g, '-'))); return pg ? { title: pg.title, path: pg.path, content: pg.content } : { error: 'Checklist not found for: ' + a.topic } },
  get_runbook: (a, p) => { const pg = p.find(x => x.path?.startsWith('devops/runbooks/') && x.path?.includes(a.topic.toLowerCase().replace(/\s+/g, '-'))); return pg ? { title: pg.title, path: pg.path, content: pg.content } : { error: 'Runbook not found for: ' + a.topic } },
  get_learning_path: (a, p) => { const pg = p.find(x => x.path?.startsWith('learning-paths/') && x.path?.includes(a.path.toLowerCase().replace(/\s+/g, '-'))); return pg ? { title: pg.title, path: pg.path, content: pg.content } : { error: 'Learning path not found for: ' + a.path } },
  get_glossary_term: (a, p) => { const pg = p.find(x => x.path === 'glossary'); if (!pg) return { error: 'Glossary not found' }; const term = a.term.toLowerCase(); const lines = pg.content.split('\n'); const match = lines.find(l => l.toLowerCase().includes(`**${term}**`) || l.toLowerCase().startsWith(`- **${term}`)); return match ? { term: a.term, definition: match.replace(/^-\s*/, '') } : { error: `Term "${a.term}" not in glossary` } },
  get_code_examples: (a, p) => { const pg = findPage(p, a.path); if (!pg) return { error: 'Not found' }; const blocks = []; const re = /```(\w*)\n([\s\S]*?)```/g; let m; while ((m = re.exec(pg.content)) !== null) { if (!a.language || m[1] === a.language) blocks.push({ language: m[1] || 'text', code: m[2].trim() }) } return { page: pg.title, blocks: blocks.length, examples: blocks.slice(0, 20) } },
  get_build_guide: (a, p) => { const pg = p.find(x => x.path?.startsWith('build-from-scratch/') && x.path?.includes(a.topic.toLowerCase().replace(/\s+/g, '-'))); return pg ? { title: pg.title, path: pg.path, content: pg.content } : { error: 'Build guide not found. Available: ' + p.filter(x => x.path?.startsWith('build-from-scratch/') && x.path !== 'build-from-scratch/').map(x => x.title).join(', ') } },
  get_eda_guide: (a, p) => { const pg = p.find(x => x.path?.startsWith('eda/') && (x.path?.includes(a.topic.toLowerCase().replace(/\s+/g, '-')) || x.title?.toLowerCase().includes(a.topic.toLowerCase()))); return pg ? { title: pg.title, path: pg.path, content: pg.content } : { error: 'EDA guide not found for: ' + a.topic } },
}

// ===== TOOL DEFINITIONS =====
const TOOL_LIST = [
  { name: 'search_archon', description: 'Full-text search across 1000+ engineering pages with relevance scoring', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search query' }, limit: { type: 'number', description: 'Max results (default 10)' } }, required: ['query'] }, annotations: { readOnly: true, openWorld: false } },
  { name: 'get_page', description: 'Get full markdown content of any page by its path', inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Page path e.g. system-design/databases/postgres-internals' } }, required: ['path'] }, annotations: { readOnly: true, openWorld: false } },
  { name: 'list_sections', description: 'List all top-level sections with page counts', inputSchema: { type: 'object', properties: {} }, annotations: { readOnly: true, openWorld: false } },
  { name: 'list_pages', description: 'List all pages in a section with titles and descriptions', inputSchema: { type: 'object', properties: { section: { type: 'string', description: 'Section name e.g. spring-boot, eda, security' } }, required: ['section'] }, annotations: { readOnly: true, openWorld: false } },
  { name: 'get_related', description: 'Find top 5 related pages by shared tags', inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Page path to find related pages for' } }, required: ['path'] }, annotations: { readOnly: true, openWorld: false } },
  { name: 'random_page', description: 'Get a random page for discovery and learning', inputSchema: { type: 'object', properties: {} }, annotations: { readOnly: true, openWorld: false } },
  { name: 'list_all_tags', description: 'List all unique tags with page counts, sorted by frequency', inputSchema: { type: 'object', properties: {} }, annotations: { readOnly: true, openWorld: false } },
  { name: 'search_by_tag', description: 'Find all pages with a specific tag', inputSchema: { type: 'object', properties: { tag: { type: 'string', description: 'Tag to search for e.g. kubernetes, redis, react' } }, required: ['tag'] }, annotations: { readOnly: true, openWorld: false } },
  { name: 'search_by_difficulty', description: 'Find all pages at a difficulty level', inputSchema: { type: 'object', properties: { difficulty: { type: 'string', description: 'beginner, intermediate, advanced, or expert' } }, required: ['difficulty'] }, annotations: { readOnly: true, openWorld: false } },
  { name: 'get_comparison', description: 'Get a head-to-head technology comparison page', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Comparison to find e.g. react-vs-vue, kafka-vs-rabbitmq' } }, required: ['query'] }, annotations: { readOnly: true, openWorld: false } },
  { name: 'get_interview', description: 'Get a system design interview walkthrough', inputSchema: { type: 'object', properties: { topic: { type: 'string', description: 'Interview topic e.g. instagram, uber, chatgpt' } }, required: ['topic'] }, annotations: { readOnly: true, openWorld: false } },
  { name: 'get_lld', description: 'Get a low-level design interview problem', inputSchema: { type: 'object', properties: { topic: { type: 'string', description: 'LLD topic e.g. parking-lot, elevator, chess' } }, required: ['topic'] }, annotations: { readOnly: true, openWorld: false } },
  { name: 'get_war_room', description: 'Get a real production incident case study', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Incident to find e.g. github, cloudflare, facebook' } }, required: ['query'] }, annotations: { readOnly: true, openWorld: false } },
  { name: 'get_checklist', description: 'Get a production readiness checklist', inputSchema: { type: 'object', properties: { topic: { type: 'string', description: 'Checklist type e.g. pre-launch, security, performance' } }, required: ['topic'] }, annotations: { readOnly: true, openWorld: false } },
  { name: 'get_runbook', description: 'Get an operational runbook', inputSchema: { type: 'object', properties: { topic: { type: 'string', description: 'Runbook topic e.g. database-failover, ddos, certificate' } }, required: ['topic'] }, annotations: { readOnly: true, openWorld: false } },
  { name: 'get_learning_path', description: 'Get a structured learning path', inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Path name e.g. backend-engineer, ai-ml-engineer, platform-engineer' } }, required: ['path'] }, annotations: { readOnly: true, openWorld: false } },
  { name: 'get_glossary_term', description: 'Look up an engineering term from the glossary', inputSchema: { type: 'object', properties: { term: { type: 'string', description: 'Term to look up e.g. CQRS, CAP theorem, eBPF' } }, required: ['term'] }, annotations: { readOnly: true, openWorld: false } },
  { name: 'get_code_examples', description: 'Extract code blocks from a page, optionally filtered by language', inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Page path' }, language: { type: 'string', description: 'Filter by language e.g. python, typescript, java' } }, required: ['path'] }, annotations: { readOnly: true, openWorld: false } },
  { name: 'get_build_guide', description: 'Get a build-from-scratch tutorial', inputSchema: { type: 'object', properties: { topic: { type: 'string', description: 'What to build e.g. redis, rate-limiter, load-balancer' } }, required: ['topic'] }, annotations: { readOnly: true, openWorld: false } },
  { name: 'get_eda_guide', description: 'Get an EDA (Exploratory Data Analysis) guide', inputSchema: { type: 'object', properties: { topic: { type: 'string', description: 'EDA topic e.g. missing-data, outliers, matplotlib, correlation' } }, required: ['topic'] }, annotations: { readOnly: true, openWorld: false } },
]

// ===== RESOURCES =====
const RESOURCES = [
  { uri: 'archon://sections', name: 'All Sections', description: 'List of all Archon sections', mimeType: 'application/json' },
  { uri: 'archon://cheat-sheets', name: 'Cheat Sheets', description: 'All available cheat sheets', mimeType: 'application/json' },
  { uri: 'archon://learning-paths', name: 'Learning Paths', description: 'All learning paths', mimeType: 'application/json' },
]

// ===== PROMPTS =====
const PROMPTS = [
  { name: 'explain-concept', description: 'Explain an engineering concept using Archon pages', arguments: [{ name: 'topic', description: 'Topic to explain', required: true }, { name: 'level', description: 'beginner, intermediate, or advanced', required: false }] },
  { name: 'interview-prep', description: 'Prepare for an interview using Archon content', arguments: [{ name: 'type', description: 'system-design, lld, or behavioral', required: true }, { name: 'topic', description: 'Specific topic', required: false }] },
  { name: 'debug-issue', description: 'Get debugging guidance from Archon playbooks', arguments: [{ name: 'problem', description: 'Describe the problem', required: true }] },
  { name: 'compare-tech', description: 'Compare technologies using Archon comparisons', arguments: [{ name: 'tech1', description: 'First technology', required: true }, { name: 'tech2', description: 'Second technology', required: true }] },
  { name: 'eda-workflow', description: 'Get EDA guidance from Archon', arguments: [{ name: 'dataset', description: 'Describe your dataset', required: true }] },
]

// ===== JSON-RPC HANDLER =====
async function handleRPC(body) {
  const { method, params, id } = body

  if (method === 'initialize') {
    return { jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      serverInfo: {
        name: 'archon-mcp',
        displayName: 'Archon — Engineering Knowledge Base',
        version: '1.0.1',
        description: 'Query 1000+ pages of engineering knowledge. System design, algorithms, security, AI/ML, Spring Boot, EDA, cybersecurity, and more.',
        icon: `${SITE_URL}/logo.svg`,
        homepage: `${SITE_URL}`,
      },
      capabilities: { tools: {}, resources: {}, prompts: {} }
    } }
  }

  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOL_LIST } }

  if (method === 'resources/list') return { jsonrpc: '2.0', id, result: { resources: RESOURCES } }

  if (method === 'resources/read') {
    const pages = getPages(await loadIndex())
    const uri = params.uri
    if (uri === 'archon://sections') {
      const s = {}; pages.forEach(x => { const k = (x.path || '').split('/')[0]; s[k] = (s[k] || 0) + 1 })
      return { jsonrpc: '2.0', id, result: { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(s, null, 2) }] } }
    }
    if (uri === 'archon://cheat-sheets') {
      const cs = pages.filter(x => x.path?.startsWith('cheat-sheets/')).map(x => ({ title: x.title, path: x.path }))
      return { jsonrpc: '2.0', id, result: { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(cs, null, 2) }] } }
    }
    if (uri === 'archon://learning-paths') {
      const lp = pages.filter(x => x.path?.startsWith('learning-paths/')).map(x => ({ title: x.title, path: x.path }))
      return { jsonrpc: '2.0', id, result: { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(lp, null, 2) }] } }
    }
    return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown resource: ${uri}` } }
  }

  if (method === 'prompts/list') return { jsonrpc: '2.0', id, result: { prompts: PROMPTS } }

  if (method === 'prompts/get') {
    const pages = getPages(await loadIndex())
    const { name, arguments: args } = params
    const prompt = PROMPTS.find(p => p.name === name)
    if (!prompt) return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown prompt: ${name}` } }

    let context = ''
    if (name === 'explain-concept') {
      const results = search(pages, args.topic, 3)
      context = results.map(r => `## ${r.title}\n${r.snippet}`).join('\n\n')
      return { jsonrpc: '2.0', id, result: { messages: [{ role: 'user', content: { type: 'text', text: `Using this Archon knowledge base context:\n\n${context}\n\nExplain "${args.topic}" at a ${args.level || 'intermediate'} level.` } }] } }
    }
    if (name === 'interview-prep') {
      const section = args.type === 'lld' ? 'lld-interviews' : args.type === 'behavioral' ? 'learning-paths' : 'system-design-interviews'
      const results = filterBySection(pages, section).slice(0, 5)
      context = results.map(r => `- [${r.title}](${r.path})`).join('\n')
      return { jsonrpc: '2.0', id, result: { messages: [{ role: 'user', content: { type: 'text', text: `Available ${args.type} interview resources from Archon:\n\n${context}\n\nHelp me prepare for a ${args.type} interview${args.topic ? ' on ' + args.topic : ''}.` } }] } }
    }
    if (name === 'debug-issue') {
      const results = search(pages, args.problem + ' debugging playbook', 3)
      context = results.map(r => `## ${r.title}\n${r.snippet}`).join('\n\n')
      return { jsonrpc: '2.0', id, result: { messages: [{ role: 'user', content: { type: 'text', text: `Relevant Archon debugging guides:\n\n${context}\n\nHelp me debug: ${args.problem}` } }] } }
    }
    if (name === 'compare-tech') {
      const q = `${args.tech1}-vs-${args.tech2}`
      const pg = pages.find(x => x.path?.startsWith('comparisons/') && (x.path?.includes(q) || x.path?.includes(`${args.tech2}-vs-${args.tech1}`)))
      context = pg ? pg.content.slice(0, 3000) : 'No direct comparison found.'
      return { jsonrpc: '2.0', id, result: { messages: [{ role: 'user', content: { type: 'text', text: `Archon comparison:\n\n${context}\n\nCompare ${args.tech1} vs ${args.tech2}.` } }] } }
    }
    if (name === 'eda-workflow') {
      const workflow = pages.find(x => x.path === 'eda/eda-workflow')
      const checklist = pages.find(x => x.path === 'eda/eda-checklist')
      context = (workflow?.content || '').slice(0, 2000) + '\n\n' + (checklist?.content || '').slice(0, 1000)
      return { jsonrpc: '2.0', id, result: { messages: [{ role: 'user', content: { type: 'text', text: `Archon EDA workflow:\n\n${context}\n\nGuide me through EDA for this dataset: ${args.dataset}` } }] } }
    }
    return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown prompt: ${name}` } }
  }

  if (method === 'tools/call') {
    const h = TOOLS[params.name]
    if (!h) return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${params.name}` } }
    const pages = getPages(await loadIndex())
    const result = h(params.arguments || {}, pages)
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } }
  }

  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } }
}

// ===== EDGE FUNCTION HANDLER =====
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, mcp-session-id' } })

  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', 'Access-Control-Expose-Headers': 'mcp-session-id' }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
  if (!checkRate(ip)) return new Response(JSON.stringify({ error: 'Rate limited. 60 req/min.' }), { status: 429, headers })

  if (req.method === 'GET') return new Response(JSON.stringify({ name: 'archon-mcp', version: '1.0.1', description: 'Query 1000+ pages of engineering knowledge', tools: TOOL_LIST.length, resources: RESOURCES.length, prompts: PROMPTS.length, icon: `${SITE_URL}/logo.svg`, docs: `${SITE_URL}/mcp` }), { headers })

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
