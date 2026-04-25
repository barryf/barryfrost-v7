import type { APIContext } from 'astro';
import { getCollection, render } from 'astro:content';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

export async function GET(context: APIContext) {
  const [articles, weeknotes] = await Promise.all([
    getCollection('articles'),
    getCollection('weeknotes'),
  ]);

  const allEntries = [
    ...articles.filter(e => e.data.visibility !== 'unlisted').map(e => ({
      entry: e,
      date: e.data.date,
      title: e.data.title,
      path: `/articles/${e.id}`,
      description: e.data.description,
    })),
    ...weeknotes.filter(e => e.data.visibility !== 'unlisted').map(e => ({
      entry: e,
      date: e.data.date,
      title: e.data.title,
      path: `/weeknotes/${e.id}`,
      description: e.data.description,
    })),
  ];

  allEntries.sort((a, b) => b.date.getTime() - a.date.getTime());
  const latest = allEntries.slice(0, 10);

  const container = await AstroContainer.create();
  const items = await Promise.all(
    latest.map(async (item) => {
      const { Content } = await render(item.entry);
      const html = await container.renderToString(Content);
      const url = new URL(item.path, context.site).toString();
      return {
        id: url,
        url,
        title: item.title,
        ...(item.description ? { summary: item.description } : {}),
        content_html: html,
        date_published: item.date.toISOString(),
      };
    }),
  );

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
    items,
  };

  return new Response(JSON.stringify(feed), {
    headers: { 'Content-Type': 'application/feed+json' },
  });
}
