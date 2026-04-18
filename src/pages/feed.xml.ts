import rss from '@astrojs/rss';
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
      type: 'article' as const,
      date: e.data.date,
      title: e.data.title,
      url: `/articles/${e.id}`,
      description: e.data.description,
    })),
    ...weeknotes.filter(e => e.data.visibility !== 'unlisted').map(e => ({
      entry: e,
      type: 'weeknote' as const,
      date: e.data.date,
      title: e.data.title,
      url: `/weeknotes/${e.id}`,
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
      return {
        title: item.title,
        link: item.url,
        pubDate: item.date,
        description: item.description,
        content: html,
      };
    }),
  );

  return rss({
    title: 'Barry Frost',
    description: 'Articles and weeknotes from Barry Frost',
    site: context.site!,
    items,
    trailingSlash: false,
  });
}
