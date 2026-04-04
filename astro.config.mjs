import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://barryfrost.com',
  output: 'static',
  adapter: cloudflare(),
  vite: {
    plugins: [tailwindcss()],
  },
  compressHTML: false,
});
