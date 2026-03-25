#!/usr/bin/env node
// Build lightweight MCP index — titles, descriptions, tags, paths only
// Used by the npm package for fast startup (500KB vs 50MB full index)

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const DOCS_DIR = join(process.cwd(), 'docs')
const OUTPUT = join(process.cwd(), 'docs', 'public', 'mcp-index.json')

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const block = match[1]
  const fm = {}
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^(\w[\w-]*):\s*(.*)/)
    if (!m) continue
    let [, key, val] = m
    val = val.replace(/^["']|["']$/g, '').trim()
    if (val.startsWith('[')) {
      try { fm[key] = JSON.parse(val) } catch { fm[key] = val.replace(/[\[\]]/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '')) }
    } else {
      fm[key] = val
    }
  }
  return fm
}

function walkDir(dir) {
  const results = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry.startsWith('.') || entry === 'public' || entry === 'node_modules') continue
      results.push(...walkDir(full))
    } else if (entry.endsWith('.md')) {
      results.push(full)
    }
  }
  return results
}

const files = walkDir(DOCS_DIR)
const index = []

for (const file of files) {
  const raw = readFileSync(file, 'utf8')
  const fm = parseFrontmatter(raw)
  const relPath = relative(DOCS_DIR, file).replace(/\\/g, '/').replace(/\.md$/, '').replace(/\/index$/, '/')

  // Skip utility pages
  if (['tags', 'graph', 'compare', 'bookmarks', '404', 'sample-verified'].includes(relPath)) continue

  // Get first paragraph as snippet
  const bodyStart = raw.indexOf('---', 4)
  const body = bodyStart > -1 ? raw.slice(bodyStart + 3).trim() : ''
  const firstPara = body.split(/\n\n/)[1] || body.split(/\n\n/)[0] || ''
  const snippet = firstPara.replace(/^#+\s.*\n?/, '').replace(/[#*`\[\]]/g, '').trim().slice(0, 200)

  index.push({
    path: relPath,
    title: fm.title || relPath.split('/').pop(),
    description: fm.description || '',
    tags: fm.tags || [],
    difficulty: fm.difficulty || '',
    snippet
  })
}

writeFileSync(OUTPUT, JSON.stringify(index, null, 0))
console.log(`MCP index: ${index.length} pages → ${(readFileSync(OUTPUT).length / 1024).toFixed(0)}KB`)
