import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { unified } from '@astrojs/markdown-remark';
import { visit } from 'unist-util-visit';

// Supports ![alt](src){.class1 .class2} syntax in Markdown
function rehypeImageAttr() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const img = node.children[i];
        const text = node.children[i + 1];
        if (
          img?.type === 'element' && img.tagName === 'img' &&
          text?.type === 'text'
        ) {
          const match = text.value.match(/^\{([^}]*)\}/);
          if (!match) continue;
          const classes = match[1].trim().split(/\s+/)
            .filter(t => t.startsWith('.'))
            .map(t => t.slice(1));
          if (classes.length) {
            img.properties.className = [
              ...(img.properties.className ?? []),
              ...classes,
            ];
          }
          text.value = text.value.slice(match[0].length);
          if (!text.value) node.children.splice(i + 1, 1);
        }
      }
    });
  };
}

export default defineConfig({
  site: 'https://new.barryfrost.com',
  output: 'static',
  build: {
    format: 'file',
  },
  vite: {
    plugins: [tailwindcss()],
  },
  compressHTML: false,
  markdown: {
    processor: unified({ rehypePlugins: [rehypeImageAttr] }),
  },
  devToolbar: {
    enabled: false
  },
});
