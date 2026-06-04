import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://new.barryfrost.com',
  output: 'static',
  build: {
    format: 'file',
  },
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
  compressHTML: false,
  devToolbar: {
    enabled: false
  },
});
