#!/usr/bin/env node
/**
 * Generates an RSS feed from the changelog and recent pages.
 */
import { writeFileSync } from 'fs'

const SITE_URL = 'https://knowledge-vault-five.vercel.app'
const now = new Date().toUTCString()

const items = [
  {
    title: '30 System Design Interview Walkthroughs',
    link: '/system-design-interviews/',
    description: 'Exhaustive walkthroughs for Instagram, Uber, YouTube, WhatsApp, Netflix, Spotify, and 24 more — with estimation math, architecture diagrams, and production code.',
    date: 'Wed, 18 Mar 2026 00:00:00 GMT',
  },
  {
    title: '5 Learning Paths Added',
    link: '/learning-paths/',
    description: 'Guided routes for Backend Engineer, DevOps Engineer, Frontend Engineer, Security Engineer, and System Design Interview Prep.',
    date: 'Wed, 18 Mar 2026 00:00:00 GMT',
  },
  {
    title: '8 Cheat Sheets',
    link: '/cheat-sheets/',
    description: 'Quick reference cards for Docker, Kubernetes, Git, SQL, TypeScript, Linux, Redis, and Terraform.',
    date: 'Wed, 18 Mar 2026 00:00:00 GMT',
  },
  {
    title: 'Technology Radar',
    link: '/technology-radar',
    description: '29 technologies categorized by Adopt, Trial, Assess, and Hold — with reasoning for each placement.',
    date: 'Wed, 18 Mar 2026 00:00:00 GMT',
  },
  {
    title: '470+ Pages of Engineering Knowledge',
    link: '/',
    description: 'The Archon now contains 470+ deep-dive pages covering system design, architecture, infrastructure, security, DevOps, performance, data engineering, and more.',
    date: 'Tue, 17 Mar 2026 00:00:00 GMT',
  },
]

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Archon</title>
    <link>${SITE_URL}</link>
    <description>Engineering knowledge from first principles to research-level depth</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
${items.map(item => `    <item>
      <title>${item.title}</title>
      <link>${SITE_URL}${item.link}</link>
      <guid>${SITE_URL}${item.link}</guid>
      <description>${item.description}</description>
      <pubDate>${item.date}</pubDate>
    </item>`).join('\n')}
  </channel>
</rss>`

writeFileSync('docs/public/feed.xml', rss)
console.log('Generated RSS feed with', items.length, 'items')
