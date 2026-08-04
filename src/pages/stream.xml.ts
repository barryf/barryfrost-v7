import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getTimelineItems, timelineFeedTitle } from '@/lib/timeline';
import { rssChannelImage } from '@/lib/feed';

const TITLE = 'Barry Frost — Stream';

export async function GET(context: APIContext) {
  const items = await getTimelineItems(context.site!);

  return rss({
    title: TITLE,
    description: 'A timeline of recent activity across the site and elsewhere, by Barry Frost',
    site: context.site!,
    customData: rssChannelImage(TITLE, context.site!),
    items: items.map((item) => ({
      title: timelineFeedTitle(item),
      link: item.url,
      pubDate: item.date,
      description: item.summary,
    })),
    trailingSlash: false,
  });
}
