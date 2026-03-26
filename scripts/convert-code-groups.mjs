#!/usr/bin/env node
// Convert consecutive code blocks in different languages to ::: code-group tabs

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const GROUPABLE = new Set(['python', 'typescript', 'javascript', 'go', 'java', 'rust', 'kotlin', 'swift', 'dart', 'ruby', 'php', 'csharp', 'c', 'cpp', 'scala', 'elixir', 'py', 'ts', 'js'])
const SKIP = new Set(['bash', 'shell', 'sh', 'zsh', 'output', 'result', 'text', 'txt', 'sql', 'yaml', 'yml', 'json', 'xml', 'html', 'css', 'ini', 'toml', 'dockerfile', 'mermaid', 'graphql', 'protobuf', 'hcl', 'nginx', 'apache', 'conf', 'env', 'properties', 'groovy', 'gradle', 'make', 'powershell', 'bat', 'cmd', 'rego', 'cedar', 'solidity', 'yara', 'promql', ''])

function walk(dir) {
  const results = []
  for (const f of readdirSync(dir)) {
    const full = join(dir, f)
    if (statSync(full).isDirectory()) {
      if (!f.startsWith('.') && f !== 'node_modules' && f !== 'public' && f !== 'dist') results.push(...walk(full))
    } else if (f.endsWith('.md')) results.push(full)
  }
  return results
}

let totalFiles = 0
let totalGroups = 0

const files = walk('docs')
for (const file of files) {
  let content = readFileSync(file, 'utf8')

  // Skip if already has code-group
  if (content.includes('code-group')) continue

  const lines = content.split('\n')
  let modified = false
  let i = 0
  const newLines = []

  while (i < lines.length) {
    const line = lines[i]

    // Check if this line starts a code block with a groupable language
    const m1 = line.match(/^```(\w+)/)
    if (!m1 || !GROUPABLE.has(m1[1])) {
      newLines.push(line)
      i++
      continue
    }

    // Found a code block with groupable language — collect it
    const lang1 = m1[1]
    const block1Start = i
    i++
    while (i < lines.length && lines[i] !== '```') i++
    const block1End = i // closing ```
    i++ // skip past closing ```

    // Skip blank lines after this block
    let gap = i
    while (gap < lines.length && lines[gap].trim() === '') gap++

    // Check if next non-blank line is another code block with DIFFERENT groupable language
    if (gap >= lines.length) {
      for (let j = block1Start; j < i; j++) newLines.push(lines[j])
      continue
    }

    const m2 = lines[gap].match(/^```(\w+)/)
    if (!m2 || !GROUPABLE.has(m2[1]) || m2[1] === lang1) {
      // Not a group candidate
      for (let j = block1Start; j < i; j++) newLines.push(lines[j])
      continue
    }

    // Found consecutive blocks with different languages — collect all
    const blocks = []
    blocks.push(lines.slice(block1Start, block1End + 1))

    let pos = gap
    while (pos < lines.length) {
      const mN = lines[pos].match(/^```(\w+)/)
      if (!mN || !GROUPABLE.has(mN[1])) break

      const blockStart = pos
      pos++
      while (pos < lines.length && lines[pos] !== '```') pos++
      blocks.push(lines.slice(blockStart, pos + 1))
      pos++ // skip closing ```

      // Skip blanks between blocks
      while (pos < lines.length && lines[pos].trim() === '') pos++
    }

    if (blocks.length >= 2) {
      // Check all blocks have different languages
      const langs = blocks.map(b => b[0].replace('```', ''))
      const uniqueLangs = new Set(langs)

      if (uniqueLangs.size >= 2) {
        newLines.push('::: code-group')
        newLines.push('')
        for (const block of blocks) {
          for (const bline of block) newLines.push(bline)
          newLines.push('')
        }
        newLines.push(':::')
        newLines.push('')
        modified = true
        totalGroups++
        i = pos
        continue
      }
    }

    // Fallback — not enough for a group
    for (let j = block1Start; j < block1End + 1; j++) newLines.push(lines[j])
    // Don't skip — let the loop re-process from i
  }

  if (modified) {
    writeFileSync(file, newLines.join('\n'))
    totalFiles++
  }
}

console.log(`Files modified: ${totalFiles}`)
console.log(`Code groups created: ${totalGroups}`)
