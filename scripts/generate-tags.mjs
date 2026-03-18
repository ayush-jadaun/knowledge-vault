#!/usr/bin/env node
/**
 * Extracts tags and metadata from all markdown files
 * and writes a JSON index for the RelatedPages and TagBrowse components.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, relative, extname } from 'path'

const DOCS_DIR = join(process.cwd(), 'docs')
const OUTPUT = join(DOCS_DIR, '.vitepress', 'theme', 'data', 'tags.json')

function walk(dir) {
  const results = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry === '.vitepress' || entry === 'node_modules' || entry === 'code') continue
      results.push(...walk(full))
    } else if (extname(entry) === '.md') {
      results.push(full)
    }
  }
  return results
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const fm = {}
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value = line.slice(colonIdx + 1).trim()
    // Parse array values like [tag1, tag2, tag3]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''))
    }
    // Remove surrounding quotes
    if (typeof value === 'string') {
      value = value.replace(/^["']|["']$/g, '')
    }
    fm[key] = value
  }
  return fm
}

const files = walk(DOCS_DIR)
const pages = []
const tagMap = {}

for (const file of files) {
  const content = readFileSync(file, 'utf8')
  const fm = parseFrontmatter(content)
  if (!fm.title) continue

  const relPath = '/' + relative(DOCS_DIR, file)
    .replace(/\\/g, '/')
    .replace(/\/index\.md$/, '/')
    .replace(/\.md$/, '')

  const page = {
    title: fm.title,
    description: fm.description || '',
    tags: Array.isArray(fm.tags) ? fm.tags : [],
    difficulty: fm.difficulty || '',
    path: relPath,
  }

  pages.push(page)

  for (const tag of page.tags) {
    if (!tagMap[tag]) tagMap[tag] = []
    tagMap[tag].push({
      title: page.title,
      path: page.path,
      difficulty: page.difficulty,
    })
  }
}

// Sort tags by count descending
const sortedTags = Object.entries(tagMap)
  .sort((a, b) => b[1].length - a[1].length)
  .reduce((acc, [k, v]) => { acc[k] = v; return acc }, {})

const output = {
  pages,
  tags: sortedTags,
  totalPages: pages.length,
  totalTags: Object.keys(sortedTags).length,
  generated: new Date().toISOString(),
}

// Ensure output directory exists
import { mkdirSync } from 'fs'
mkdirSync(join(DOCS_DIR, '.vitepress', 'theme', 'data'), { recursive: true })

writeFileSync(OUTPUT, JSON.stringify(output, null, 2))
console.log(`Generated tag index: ${pages.length} pages, ${Object.keys(sortedTags).length} unique tags`)
