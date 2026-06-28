import { defineConfig, fontProviders } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';

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
});
