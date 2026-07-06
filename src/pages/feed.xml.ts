import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getFeedItems } from '@/lib/feed-items';

export async function GET(context: APIContext) {
  const items = await getFeedItems(context.site!);

  return rss({
    title: 'Barry Frost',
    description: 'Articles and weeknotes from Barry Frost',
    site: context.site!,
    items: items.map((item) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      description: item.description,
      content: item.contentHtml,
    })),
    trailingSlash: false,
  });
}
