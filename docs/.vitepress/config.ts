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

      // Search handled by Pagefind (runs post-build, much faster)

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
      themeVariables: {
        primaryColor: '#5f67ee',
        primaryTextColor: '#fff',
        primaryBorderColor: '#747bff',
        lineColor: '#929aff',
        secondaryColor: '#2d2d3f',
        tertiaryColor: '#1e1e2e',
        nodeTextColor: '#e0e0e0',
        mainBkg: '#2d2d3f',
        nodeBorder: '#747bff',
        clusterBkg: '#1e1e2e',
        clusterBorder: '#444',
        titleColor: '#e0e0e0',
        edgeLabelBackground: '#1e1e2e',
      },
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
