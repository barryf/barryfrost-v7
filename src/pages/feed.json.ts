import type { APIContext } from 'astro';
import { getFeedItems } from '@/lib/feed-items';

export async function GET(context: APIContext) {
  const items = await getFeedItems(context.site!);

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Barry Frost',
    description: 'Articles and weeknotes from Barry Frost',
    home_page_url: new URL('/', context.site).toString(),
    feed_url: new URL('/feed.json', context.site).toString(),
    language: 'en',
    authors: [{
      name: 'Barry Frost',
      url: new URL('/', context.site).toString(),
      avatar: new URL('/barryfrost.jpg', context.site).toString(),
    }],
    items: items.map((item) => ({
      id: item.id,
      url: item.url,
      title: item.title,
      ...(item.description ? { summary: item.description } : {}),
      content_html: item.contentHtml,
      date_published: item.pubDate.toISOString(),
    })),
  };

  return new Response(JSON.stringify(feed), {
    headers: { 'Content-Type': 'application/feed+json' },
  });
}
