import remarkMath from 'remark-math';

import rehypeKatex from 'rehype-katex';

import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Quantitative_Finance_Joyeb',
  tagline: 'Welcome to my Quantitative Finance Journey',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  markdown: {
    format: 'detect',
  },

  url: 'https://joyebkashyeb.com.np',
  baseUrl: '/',

  organizationName: 'Kashyeb57',
  projectName: 'Quantitative-Finance_Joyeb',
  trailingSlash: false,

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex],
          sidebarPath: './sidebars.js',
          editUrl:
            'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          editUrl:
            'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/docusaurus-social-card.jpg',
      colorMode: {
        respectPrefersColorScheme: true,
      },
      docs: {
        sidebar: {
          hideable: true,
          autoCollapseCategories: false,
        },
      },
      navbar: {
        title: 'My Site',
        logo: {
          alt: 'My Site Logo',
          src: 'img/logo.svg',
        },
        items: [
          {to: '/tutorial', label: 'Tutorial', position: 'left'},
          {to: '/roadmap', label: 'Roadmap', position: 'left'},
          {to: '/books', label: 'Books', position: 'left'},
          {to: '/resources', label: 'Resources', position: 'left'},
          {to: '/projects', label: 'Projects', position: 'left'},
          {to: '/scope', label: 'Scope', position: 'left'},
          {to: '/tools', label: 'Tools', position: 'left'},
          {to: '/terminal', label: 'Terminal', position: 'left'},
          {
            href: 'https://github.com/Kashyeb57/Quantitative-Finance_Joyeb',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [],
        copyright: `© ${new Date().getFullYear()} Joyeb Kashyeb — Quantitative Finance Journey`,
      },
      prism: {
        theme: prismThemes.oneLight,
        darkTheme: prismThemes.oneDark,
        additionalLanguages: ['python', 'bash', 'json'],
      },
    }),

  stylesheets: [
    {
      href: 'https://cdn.jsdelivr.net/npm/katex@0.13.24/dist/katex.min.css',
      type: 'text/css',
      crossorigin: 'anonymous',
    },
  ],
};

export default config;
