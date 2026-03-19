#!/usr/bin/env node
/**
 * Builds a context index for the AI chatbot.
 * Extracts title, path, and first ~500 words from each page
 * so Gemini can cite specific pages in its answers.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'fs'
import { join, relative, extname } from 'path'

const DOCS_DIR = join(process.cwd(), 'docs')
const OUTPUT = join(DOCS_DIR, 'public', 'ai-context.json')

function walk(dir) {
  const results = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry === '.vitepress' || entry === 'node_modules' || entry === 'public' || entry === 'code') continue
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
    let value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '')
    fm[key] = value
  }
  return fm
}

function stripMarkdown(content) {
  // Remove frontmatter
  content = content.replace(/^---[\s\S]*?---\n/, '')
  // Remove code blocks
  content = content.replace(/```[\s\S]*?```/g, '[code block]')
  // Remove mermaid blocks
  content = content.replace(/```mermaid[\s\S]*?```/g, '[diagram]')
  // Remove HTML/Vue
  content = content.replace(/<[^>]+>/g, '')
  // Remove markdown syntax
  content = content.replace(/#{1,6}\s/g, '')
  content = content.replace(/\*\*([^*]+)\*\*/g, '$1')
  content = content.replace(/\*([^*]+)\*/g, '$1')
  content = content.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  content = content.replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
  // Remove containers
  content = content.replace(/:::\s*\w+.*\n/g, '')
  content = content.replace(/:::\s*\n/g, '')
  // Collapse whitespace
  content = content.replace(/\n{3,}/g, '\n\n')
  return content.trim()
}

const files = walk(DOCS_DIR)
const pages = []

for (const file of files) {
  const raw = readFileSync(file, 'utf8')
  const fm = parseFrontmatter(raw)
  if (!fm.title) continue

  const relPath = '/' + relative(DOCS_DIR, file)
    .replace(/\\/g, '/')
    .replace(/\/index\.md$/, '/')
    .replace(/\.md$/, '')

  const stripped = stripMarkdown(raw)
  // Take first ~800 words for context (enough to understand the page)
  const words = stripped.split(/\s+/)
  const summary = words.slice(0, 800).join(' ')

  pages.push({
    title: fm.title,
    path: relPath,
    description: fm.description || '',
    content: summary,
  })
}

writeFileSync(OUTPUT, JSON.stringify(pages))
console.log(`Built AI context: ${pages.length} pages, ${(Buffer.byteLength(JSON.stringify(pages)) / 1024 / 1024).toFixed(1)}MB`)
