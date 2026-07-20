import remarkMath from 'remark-math';

import rehypeKatex from 'rehype-katex';

import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Joyeb Kashyeb',
  tagline: 'Math, markets & machine learning — a quantitative finance journey.',
  favicon: 'img/favicon.svg',

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

  // Owner-only visitor beacon → Cloudflare Worker at /_a/collect.
  // No-ops until the Worker in ./analytics is deployed; never breaks the site.
  clientModules: ['./src/clientModules/analytics.js'],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex],
          sidebarPath: './sidebars.js',
          // "Edit this page" opens the GitHub editor on this repo —
          // the one-click, no-code way to fix or extend any note.
          editUrl:
            'https://github.com/Kashyeb57/Quantitative-Finance_Joyeb/edit/main/',
          showLastUpdateTime: true,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/social-card.png',
      metadata: [
        {
          name: 'description',
          content:
            'Quantitative finance notes by Joyeb Kashyeb — interactive lessons on mathematics, probability, statistics, finance, economics, machine learning and Python, with runnable code and hands-on pricing labs.',
        },
        {
          name: 'keywords',
          content:
            'quantitative finance, quant, derivatives, black-scholes, probability, statistics, python, machine learning, Joyeb Kashyeb',
        },
        {name: 'twitter:card', content: 'summary_large_image'},
        {name: 'author', content: 'Joyeb Kashyeb'},
      ],
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
        title: 'Joyeb Kashyeb',
        hideOnScroll: true,
        logo: {
          alt: 'Joyeb Kashyeb — Quant Finance',
          src: 'img/logo.svg',
        },
        items: [
          {to: '/tutorial', label: 'Learn', position: 'left'},
          {to: '/roadmap', label: 'Roadmap', position: 'left'},
          {to: '/notebook', label: 'Notebook', position: 'left'},
          {to: '/terminal', label: 'Terminal', position: 'left'},
          {
            label: 'Library',
            position: 'left',
            items: [
              {to: '/books', label: '📚 Books'},
              {to: '/resources', label: '🔗 Resources'},
              {to: '/projects', label: '🛠️ Projects'},
              {to: '/tools', label: '⚙️ Tools'},
              {to: '/scope', label: '🎯 Scope'},
            ],
          },
          {to: '/about', label: 'About', position: 'right'},
          {to: '/admin', label: 'Publish', position: 'right'},
          {
            href: 'https://github.com/Kashyeb57/Quantitative-Finance_Joyeb',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Learn',
            items: [
              {label: 'Start here', to: '/docs/Introduction_and_Goals/overview'},
              {label: 'Tutorial hub', to: '/tutorial'},
              {label: 'Roadmap', to: '/roadmap'},
              {label: 'Derivatives lab', to: '/docs/Finance/derivatives'},
            ],
          },
          {
            title: 'Explore',
            items: [
              {label: 'Market terminal', to: '/terminal'},
              {label: 'Projects', to: '/projects'},
              {label: 'Books', to: '/books'},
              {label: 'Resources', to: '/resources'},
            ],
          },
          {
            title: 'Site',
            items: [
              {label: 'About', to: '/about'},
              {label: 'Publish (owner)', to: '/admin'},
              {
                label: 'GitHub',
                href: 'https://github.com/Kashyeb57/Quantitative-Finance_Joyeb',
              },
            ],
          },
        ],
        copyright: `© ${new Date().getFullYear()} Joyeb Kashyeb · Quantitative finance`,
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
    {
      href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap',
      type: 'text/css',
    },
  ],
};

export default config;
