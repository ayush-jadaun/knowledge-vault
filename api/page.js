// Archon — On-demand page content Edge Function
// GET /api/page?path=system-design/databases/postgres-internals

export const config = { runtime: 'edge' }

const SITE_URL = 'https://archon-eight.vercel.app'
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

export default async function handler(req) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=3600' }

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers })

  const url = new URL(req.url)
  const path = url.searchParams.get('path')
  if (!path) return new Response(JSON.stringify({ error: 'Missing ?path=' }), { status: 400, headers })

  const clean = path.replace(/\.\./g, '').replace(/^\//, '').replace(/\.md$/, '')
  if (!clean) return new Response(JSON.stringify({ error: 'Invalid path' }), { status: 400, headers })

  try {
    const pages = await loadIndex()
    const arr = Array.isArray(pages) ? pages : pages.pages || []
    const page = arr.find(p => p.path === clean || p.path?.endsWith(clean))
    if (!page) return new Response(JSON.stringify({ error: `Not found: ${clean}` }), { status: 404, headers })

    return new Response(JSON.stringify({
      path: page.path, title: page.title, description: page.description,
      tags: page.tags, difficulty: page.difficulty, content: page.content,
      url: `${SITE_URL}/${clean}`
    }), { headers })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers })
  }
}
