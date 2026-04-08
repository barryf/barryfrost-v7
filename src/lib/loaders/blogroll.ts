import type { Loader } from 'astro/loaders';
import blogsData from '../../data/blogroll.json';
import { downloadImage } from '../download-image';

export function blogrollLoader(): Loader {
  return {
    name: 'blogroll-loader',
    async load({ store, logger, generateDigest }) {
      logger.info('Fetching blogroll favicons');
      store.clear();

      for (const blog of blogsData) {
        const hostname = new URL(blog.url).hostname;
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=96`;
        const avatarUrl = await downloadImage(faviconUrl, 'blogroll', `${hostname}.png`, 48, 48);

        store.set({
          id: hostname,
          data: { name: blog.name, url: blog.url, hostname, avatarUrl },
          digest: generateDigest(blog.url),
        });
      }
    },
  };
}
