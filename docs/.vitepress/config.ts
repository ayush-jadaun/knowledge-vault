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

    lastUpdated: true,
    cleanUrls: true,

    markdown: {
      math: true,
      lineNumbers: true,
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
          ],
        },
        { text: 'Glossary', link: '/glossary' },
      ],

      sidebar,

      socialLinks: [
        { icon: 'github', link: 'https://github.com' },
      ],

      search: {
        provider: 'local',
        options: {
          detailedView: true,
          miniSearch: {
            searchOptions: {
              fuzzy: 0.2,
              prefix: true,
              boost: {
                title: 4,
                text: 2,
                titles: 3,
              },
            },
          },
        },
      },

      editLink: {
        pattern: 'https://github.com/:repo/edit/main/docs/:path',
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
      theme: 'neutral',
    },

    mermaidPlugin: {
      class: 'mermaid',
    },

    vite: {
      optimizeDeps: {
        include: ['mermaid'],
      },
    },
  })
)
