// Archon — On-demand page content endpoint
// GET /api/page?path=system-design/databases/postgres-internals
// Returns full markdown content for a single page

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const path = req.query.path
  if (!path) return res.status(400).json({ error: 'Missing ?path= parameter' })

  // Sanitize — prevent path traversal
  const clean = path.replace(/\.\./g, '').replace(/^\//, '').replace(/\.md$/, '')
  if (!clean || clean.includes('..')) {
    return res.status(400).json({ error: 'Invalid path' })
  }

  try {
    // Try fetching from the static dist
    const url = `https://archon-eight.vercel.app/${clean}.html`
    const response = await fetch(url)

    if (!response.ok) {
      return res.status(404).json({ error: `Page not found: ${clean}` })
    }

    // Return the path info — full content is in the ai-context.json
    // For the npm MCP package, we serve from the full index
    const SITE_URL = 'https://archon-eight.vercel.app'
    const indexRes = await fetch(`${SITE_URL}/ai-context.json`)
    if (!indexRes.ok) {
      return res.status(500).json({ error: 'Cannot load content index' })
    }

    const pages = await indexRes.json()
    const pageList = Array.isArray(pages) ? pages : pages.pages || []
    const page = pageList.find(p => p.path === clean || p.path?.endsWith(clean))

    if (!page) {
      return res.status(404).json({ error: `Page not found in index: ${clean}` })
    }

    return res.status(200).json({
      path: page.path,
      title: page.title,
      description: page.description,
      tags: page.tags,
      difficulty: page.difficulty,
      content: page.content,
      url: `${SITE_URL}/${clean}`
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
