import { defineConfig, fontProviders } from 'astro/config';
import { loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';

// Allow a local tunnel host (e.g. Cloudflare Tunnel) to reach the dev server
// during external microformats validation. Configured via .env so the
// hostname stays out of the committed config.
const { DEV_ALLOWED_HOST } = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');

export default defineConfig({
  site: 'https://new.barryfrost.com',
  output: 'static',
  build: {
    format: 'file',
  },
  integrations: [mdx()],
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
