import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { sidebar } from './sidebar'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pkg = require('../../package.json')

export default withMermaid(
  defineConfig({
    title: 'Archon',
    description: 'The holy grail of engineering knowledge — 1195+ sacred texts from first principles to production mastery',
    lang: 'en-US',

    head: [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
      ['meta', { name: 'theme-color', content: '#5f67ee' }],
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:site_name', content: 'Archon' }],
      ['meta', { property: 'og:image', content: 'https://archon-eight.vercel.app/og-image.svg' }],
      ['meta', { property: 'og:image:width', content: '1200' }],
      ['meta', { property: 'og:image:height', content: '630' }],
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['meta', { name: 'twitter:image', content: 'https://archon-eight.vercel.app/og-image.svg' }],
      ['meta', { name: 'author', content: 'Ayush Jadaun' }],
      ['meta', { name: 'keywords', content: 'system design, engineering, architecture, kubernetes, docker, aws, security, devops, performance, data engineering, algorithms, LangChain, LangGraph, RAG, EDA, exploratory data analysis, cybersecurity, pentesting, React, Node.js, PostgreSQL, machine learning, AI engineering, interview prep, cheat sheets' }],
      ['link', { rel: 'canonical', href: 'https://archon-eight.vercel.app' }],
      ['link', { rel: 'manifest', href: '/manifest.json' }],
      ['link', { rel: 'alternate', type: 'application/rss+xml', title: 'Archon RSS', href: '/feed.xml' }],
      ['script', {}, `if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')`],
      ['script', { type: 'application/ld+json' }, JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "Archon",
        "description": "The holy grail of engineering knowledge — 1140+ deep dives from first principles to production mastery",
        "url": "https://archon-eight.vercel.app",
        "potentialAction": {
          "@type": "SearchAction",
          "target": "https://archon-eight.vercel.app/?q={search_term_string}",
          "query-input": "required name=search_term_string"
        },
        "author": {
          "@type": "Person",
          "name": "Ayush Jadaun",
          "url": "https://github.com/ayush-jadaun"
        },
        "publisher": {
          "@type": "Organization",
          "name": "Archon",
          "logo": {
            "@type": "ImageObject",
            "url": "https://archon-eight.vercel.app/logo.svg"
          }
        }
      })],
    ],

    sitemap: {
      hostname: 'https://archon-eight.vercel.app',
    },

    transformPageData(pageData) {
      // Dynamic OG tags per page
      const title = pageData.frontmatter.title || pageData.title
      const description = pageData.frontmatter.description || 'Engineering knowledge from first principles to research-level depth'

      const url = `https://archon-eight.vercel.app/${pageData.relativePath.replace(/index\.md$/, '').replace(/\.md$/, '')}`
      const tags = pageData.frontmatter.tags || []
      const difficulty = pageData.frontmatter.difficulty || ''

      pageData.frontmatter.head ??= []
      pageData.frontmatter.head.push(
        ['meta', { property: 'og:title', content: `${title} | Archon` }],
        ['meta', { property: 'og:description', content: description }],
        ['meta', { property: 'og:url', content: url }],
        ['meta', { name: 'description', content: description }],
        ['meta', { name: 'twitter:title', content: `${title} | Archon` }],
        ['meta', { name: 'twitter:description', content: description }],
        ['link', { rel: 'canonical', href: url }],
      )

      // Per-page JSON-LD structured data
      if (title && pageData.relativePath !== 'index.md') {
        pageData.frontmatter.head.push(
          ['script', { type: 'application/ld+json' }, JSON.stringify({
            "@context": "https://schema.org",
            "@type": "TechArticle",
            "headline": title,
            "description": description,
            "url": url,
            "author": { "@type": "Person", "name": "Ayush Jadaun" },
            "publisher": { "@type": "Organization", "name": "Archon" },
            "keywords": tags.join(', '),
            "proficiencyLevel": difficulty === 'beginner' ? 'Beginner' : difficulty === 'expert' ? 'Expert' : 'Intermediate',
          })]
        )
      }
    },

    ignoreDeadLinks: true,
    lastUpdated: true,
    cleanUrls: true,

    markdown: {
      math: true,
      lineNumbers: false,
      image: {
        lazyLoading: true,
      },
      container: {
        tipLabel: 'TIP',
        warningLabel: 'WARNING',
        dangerLabel: 'DANGER',
        infoLabel: 'INFO',
        detailsLabel: 'Details',
      },
    },

    themeConfig: {
      logo: '/logo.svg',

      nav: [
        { text: 'Start Here', link: '/start-here' },
        {
          text: 'Foundations',
          items: [
            { text: 'System Design', link: '/system-design/' },
            { text: 'Architecture', link: '/architecture-patterns/' },
            { text: 'Networking', link: '/system-design/networking/' },
          ],
        },
        {
          text: 'Infrastructure',
          items: [
            { text: 'Infrastructure', link: '/infrastructure/' },
            { text: 'Security', link: '/security/' },
            { text: 'Cybersecurity', link: '/cybersecurity/' },
            { text: 'DevOps', link: '/devops/' },
          ],
        },
        {
          text: 'Engineering',
          items: [
            { text: 'Frontend Engineering', link: '/frontend-engineering/' },
            { text: 'Mobile Engineering', link: '/mobile-engineering/' },
            { text: 'Performance', link: '/performance/' },
            { text: 'Data Engineering', link: '/data-engineering/' },
            { text: 'Testing', link: '/testing/' },
            { text: 'AI/ML Engineering', link: '/ai-ml-engineering/' },
            { text: 'Exploratory Data Analysis', link: '/eda/' },
            { text: 'Data Pipeline', link: '/data-pipeline/' },
            { text: 'Machine Learning', link: '/machine-learning/' },
            { text: 'Deep Learning', link: '/deep-learning/' },
            { text: 'Spring Boot', link: '/spring-boot/' },
          ],
        },
        {
          text: 'Real World',
          items: [
            { text: 'War Room', link: '/war-room/' },
            { text: 'Company Architecture', link: '/company-architecture/' },
            { text: 'Build From Scratch', link: '/build-from-scratch/' },
            { text: 'Debugging Playbooks', link: '/debugging-playbooks/' },
            { text: 'Comparisons', link: '/comparisons/' },
          ],
        },
        {
          text: 'Resources',
          items: [
            { text: 'Prompts', link: '/prompt-engineering/' },
            { text: 'UI & Design', link: '/ui-design-systems/' },
            { text: 'Blueprints', link: '/production-blueprints/' },
            { text: 'Cheat Sheets', link: '/cheat-sheets/' },
          ],
        },
        {
          text: 'Interview Prep',
          items: [
            { text: 'Algorithms & Data Structures', link: '/algorithms/' },
            { text: 'System Design Interviews', link: '/system-design-interviews/' },
            { text: 'Low-Level Design Interviews', link: '/lld-interviews/' },
            { text: 'Learning Paths', link: '/learning-paths/' },
          ],
        },
        { text: 'Tech Radar', link: '/technology-radar' },
        { text: 'Explore', items: [
          { text: 'Knowledge Graph', link: '/graph' },
          { text: 'Compare Technologies', link: '/compare' },
          { text: 'Browse by Tag', link: '/tags' },
          { text: 'MCP Server', link: '/mcp' },
          { text: "What's New", link: '/changelog' },
        ]},
      ],

      sidebar,

      socialLinks: [
        { icon: 'github', link: 'https://github.com/ayush-jadaun/knowledge-vault' },
      ],

      // Search: Pagefind runs post-build (no memory impact)

      editLink: {
        pattern: 'https://github.com/ayush-jadaun/knowledge-vault/edit/main/docs/:path',
        text: 'Edit this page on GitHub',
      },

      footer: {
        message: '"What I cannot create, I do not understand." — Richard Feynman',
        copyright: "Archon — The Engineer's Sacred Texts",
      },

      outline: {
        level: [2, 4],
        label: 'On this page',
      },

      lastUpdated: {
        text: 'Last updated',
        formatOptions: {
          dateStyle: 'medium',
          timeStyle: 'short',
        },
      },

      docFooter: {
        prev: 'Previous',
        next: 'Next',
      },
    },

    mermaid: {
      theme: 'dark',
      themeCSS: `
        * { color: #cdd6f4 !important; }
        rect, polygon, circle, ellipse, path.node { fill: #313244 !important; stroke: #585b70 !important; }
        .cluster rect { fill: #1e1e2e !important; stroke: #585b70 !important; }
        text, tspan, .nodeLabel, .label, .edgeLabel { fill: #cdd6f4 !important; color: #cdd6f4 !important; }
        .edgePath path { stroke: #a6adc8 !important; }
        marker path { fill: #a6adc8 !important; }
        .actor { fill: #313244 !important; stroke: #585b70 !important; }
        line { stroke: #585b70 !important; }
      `,
      maxTextSize: 500000,
    },

    mermaidPlugin: {
      class: 'mermaid',
    },

    vite: {
      define: {
        __BUILD_DATE__: JSON.stringify(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })),
        __APP_VERSION__: JSON.stringify(pkg.version),
      },
      optimizeDeps: {
        include: ['mermaid'],
      },
      server: {
        allowedHosts: true,
      },
      build: {
        sourcemap: false,
        chunkSizeWarningLimit: 5000,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('mermaid')) return 'mermaid'
              if (id.includes('mathjax') || id.includes('tex-svg') || id.includes('tex-chtml')) return 'mathjax'
            },
          },
        },
      },
    },
  })
)
