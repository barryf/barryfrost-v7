import type { APIContext } from 'astro';
import { getCollection, render } from 'astro:content';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

export async function GET(context: APIContext) {
  const weeknotes = await getCollection('weeknotes');
  const sorted = weeknotes
    .filter(e => e.data.visibility !== 'unlisted')
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
    .slice(0, 10);

  const container = await AstroContainer.create();
  const items = await Promise.all(
    sorted.map(async (entry) => {
      const { Content } = await render(entry);
      const html = await container.renderToString(Content);
      const url = new URL(`/weeknotes/${entry.id}`, context.site).toString();
      return {
        id: url,
        url,
        title: entry.data.title,
        ...(entry.data.description ? { summary: entry.data.description } : {}),
        content_html: html,
        date_published: entry.data.date.toISOString(),
      };
    }),
  );

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Barry Frost — Weeknotes',
    description: 'Weeknotes from Barry Frost',
    home_page_url: new URL('/weeknotes', context.site).toString(),
    feed_url: new URL('/weeknotes/feed.json', context.site).toString(),
    language: 'en',
    authors: [{
      name: 'Barry Frost',
      url: new URL('/', context.site).toString(),
      avatar: new URL('/barryfrost.jpg', context.site).toString(),
    }],
    items,
  };

  return new Response(JSON.stringify(feed), {
    headers: { 'Content-Type': 'application/feed+json' },
  });
}
