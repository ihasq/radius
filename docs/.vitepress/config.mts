import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Radius',
  description: 'LLM-native code editing toolkit with LSP integration',

  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap', rel: 'stylesheet' }],
  ],

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'API', link: '/api/' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/quick-start' },
          ]
        },
        {
          text: 'Commands',
          items: [
            { text: 'File Operations', link: '/guide/file-operations' },
            { text: 'Variable Operations', link: '/guide/variable-operations' },
            { text: 'Conflict Resolution', link: '/guide/conflict-resolution' },
            { text: 'Extensions', link: '/guide/extensions' },
          ]
        },
        {
          text: 'Configuration',
          items: [
            { text: 'LSP Servers', link: '/guide/lsp-servers' },
          ]
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'Commands', link: '/api/commands' },
          ]
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/user/radius' }
    ],

    footer: {
      message: 'Released under the MIT License.',
    }
  }
})
