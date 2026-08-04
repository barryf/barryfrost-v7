import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getFeedItems } from '@/lib/feed-items';
import { rssChannelImage } from '@/lib/feed';

const TITLE = 'Barry Frost';

export async function GET(context: APIContext) {
  const items = await getFeedItems(context.site!);

  return rss({
    title: TITLE,
    description: 'Articles and weeknotes from Barry Frost',
    site: context.site!,
    customData: rssChannelImage(TITLE, context.site!),
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
