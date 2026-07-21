import type { APIContext } from 'astro';
import { getTimelineItems } from '@/lib/timeline';

export async function GET(context: APIContext) {
  const items = await getTimelineItems(context.site!);

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Barry Frost — Log',
    description: 'A timeline of recent activity across the site and elsewhere, by Barry Frost',
    home_page_url: new URL('/log', context.site).toString(),
    feed_url: new URL('/log.json', context.site).toString(),
    language: 'en',
    authors: [{
      name: 'Barry Frost',
      url: new URL('/', context.site).toString(),
      avatar: new URL('/barryfrost.jpg', context.site).toString(),
    }],
    items: items.map((item) => {
      const title = `${item.typeLabel}: ${item.title}`;
      return {
        id: item.id,
        url: item.url,
        title,
        ...(item.summary ? { summary: item.summary } : {}),
        content_text: item.summary ?? item.title,
        date_published: item.date.toISOString(),
      };
    }),
  };

  return new Response(JSON.stringify(feed), {
    headers: { 'Content-Type': 'application/feed+json' },
  });
}
