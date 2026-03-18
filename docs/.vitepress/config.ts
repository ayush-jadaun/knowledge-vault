import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { sidebar } from './sidebar'

export default withMermaid(
  defineConfig({
    title: 'Knowledge Vault',
    description: 'The most comprehensive engineering knowledge base — from first principles to research-level depth',
    lang: 'en-US',

    head: [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
      ['meta', { name: 'theme-color', content: '#5f67ee' }],
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:title', content: 'Knowledge Vault' }],
      ['meta', { property: 'og:description', content: 'The most comprehensive engineering knowledge base — from first principles to research-level depth' }],
    ],

    ignoreDeadLinks: true,
    lastUpdated: false,
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
            { text: 'DevOps', link: '/devops/' },
          ],
        },
        {
          text: 'Engineering',
          items: [
            { text: 'Performance', link: '/performance/' },
            { text: 'Data Engineering', link: '/data-engineering/' },
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
            { text: 'System Design Interviews', link: '/system-design-interviews/' },
            { text: 'Learning Paths', link: '/learning-paths/' },
          ],
        },
        { text: 'Tech Radar', link: '/technology-radar' },
        { text: 'Tags', link: '/tags' },
      ],

      sidebar,

      socialLinks: [
        { icon: 'github', link: 'https://github.com/ayush-jadaun/knowledge-vault' },
      ],

      search: {
        provider: 'local',
      },

      editLink: {
        pattern: 'https://github.com/ayush-jadaun/knowledge-vault/edit/main/docs/:path',
        text: 'Edit this page on GitHub',
      },

      footer: {
        message: 'Engineering knowledge from first principles to research-level depth.',
        copyright: 'Built with VitePress',
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
