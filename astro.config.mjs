import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://barryfrost.com',
  output: 'static',
  build: {
    format: 'file',
  },
  vite: {
    plugins: [tailwindcss()],
  },
  compressHTML: false,
});
