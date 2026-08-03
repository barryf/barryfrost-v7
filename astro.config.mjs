import { readFileSync, readdirSync } from 'node:fs';
import { defineConfig, fontProviders } from 'astro/config';
import { loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// Allow a local tunnel host (e.g. Cloudflare Tunnel) to reach the dev server
// during external microformats validation. Configured via .env so the
// hostname stays out of the committed config.
const { DEV_ALLOWED_HOST } = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');

// Unlisted posts are link-only by design; a sitemap would leak them.
function unlistedPaths(dir, prefix) {
  return readdirSync(dir)
    .filter((f) => /\.(md|mdx)$/.test(f))
    .filter((f) => /^visibility:\s*unlisted/m.test(readFileSync(`${dir}/${f}`, 'utf8')))
    .map((f) => `${prefix}${f.replace(/\.(md|mdx)$/, '')}`);
}
const excluded = new Set([
  ...unlistedPaths('src/content/articles', '/articles/'),
  ...unlistedPaths('src/content/weeknotes', '/weeknotes/week-'),
  '/search', '/404',
]);

export default defineConfig({
  site: 'https://barryfrost.com',
  output: 'static',
  build: {
    format: 'file',
  },
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => !excluded.has(new URL(page).pathname.replace(/\.html$/, '')),
      serialize(item) {
        item.url = item.url.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
        return item;
      },
    }),
  ],
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Work Sans',
      cssVariable: '--font-work-sans',
      weights: [400, 600],
      styles: ['normal', 'italic'],
    },
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  compressHTML: false,
  devToolbar: {
    enabled: false
  },
  server: DEV_ALLOWED_HOST ? { allowedHosts: [DEV_ALLOWED_HOST] } : {},
});
