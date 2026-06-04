import type { Loader } from 'astro/loaders';
import blogsData from '@/data/blogroll.json';
import { transformImage } from '@/lib/image-url';

export function blogrollLoader(): Loader {
  return {
    name: 'blogroll-loader',
    async load({ store, logger, generateDigest }) {
      logger.info('Fetching blogroll favicons');
      store.clear();

      for (const blog of blogsData) {
        const hostname = new URL(blog.url).hostname;
        const avatarUrl = 'avatar' in blog && blog.avatar
          ? transformImage(blog.avatar, { width: 96, height: 96, fit: 'cover' })
          : `https://www.google.com/s2/favicons?domain=${hostname}&sz=96`;

        store.set({
          id: hostname,
          data: { name: blog.name, url: blog.url, hostname, avatarUrl },
          digest: generateDigest(blog.url),
        });
      }
    },
  };
}
