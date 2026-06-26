import rss from '@astrojs/rss';
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
      return {
        title: entry.data.title,
        link: `/weeknotes/${entry.id}`,
        pubDate: entry.data.date,
        description: entry.data.description,
        content: html,
      };
    }),
  );

  return rss({
    title: 'Barry Frost — Weeknotes',
    description: 'Weeknotes from Barry Frost',
    site: context.site!,
    items,
    trailingSlash: false,
  });
}
