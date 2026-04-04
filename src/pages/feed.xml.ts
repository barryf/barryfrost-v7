import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getUnifiedFeed } from '../lib/feed';

export async function GET(context: APIContext) {
  const allItems = await getUnifiedFeed();
  const items = allItems.filter(i => i.type === 'article' || i.type === 'weeknote');

  return rss({
    title: 'Barry Frost',
    description: 'Articles and weeknotes from Barry Frost',
    site: context.site!,
    items: items.map(item => ({
      title: item.title ?? '',
      link: item.url,
      pubDate: item.date,
      description: item.summary,
    })),
  });
}
