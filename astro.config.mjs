import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://barryfrost.com',
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
  compressHTML: false,
});
