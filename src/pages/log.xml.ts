import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getTimelineItems } from '@/lib/timeline';

export async function GET(context: APIContext) {
  const items = await getTimelineItems(context.site!);

  return rss({
    title: 'Barry Frost — Log',
    description: 'A timeline of recent activity across the site and elsewhere, by Barry Frost',
    site: context.site!,
    items: items.map((item) => ({
      title: `${item.typeLabel}: ${item.title}`,
      link: item.url,
      pubDate: item.date,
      description: item.summary,
    })),
    trailingSlash: false,
  });
}
