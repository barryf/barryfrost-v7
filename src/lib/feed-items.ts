import { getCollection, render, type CollectionEntry } from 'astro:content';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

export interface FeedItem {
  title: string;
  link: string;
  id: string;
  url: string;
  pubDate: Date;
  description?: string;
  contentHtml: string;
}

type FeedEntry =
  | { section: 'articles'; entry: CollectionEntry<'articles'> }
  | { section: 'weeknotes'; entry: CollectionEntry<'weeknotes'> };

/**
 * Rewrite root-relative `src`/`href`/`srcset` URLs to absolute against `site` so that
 * feed readers (which have no base URL) can resolve build-optimised images under
 * `/_astro/…` and internal links. Already-absolute and protocol-relative URLs are left
 * untouched.
 */
function absolutiseUrls(html: string, site: URL): string {
  const toAbsolute = (path: string) => new URL(path, site).href;

  return html
    // src="/…" and href="/…" (root-relative, but not protocol-relative "//")
    .replace(
      /(\b(?:src|href)=")(\/(?!\/)[^"]*)"/g,
      (_m, prefix, path) => `${prefix}${toAbsolute(path)}"`,
    )
    // srcset="/a 1x, /b 2x" — rewrite each candidate's URL
    .replace(/(\bsrcset=")([^"]*)"/g, (_m, prefix, value) => {
      const rewritten = value
        .split(',')
        .map((candidate: string) => {
          const trimmed = candidate.trim();
          if (!trimmed) return trimmed;
          const [urlPart, ...descriptor] = trimmed.split(/\s+/);
          const abs = urlPart.startsWith('/') && !urlPart.startsWith('//')
            ? toAbsolute(urlPart)
            : urlPart;
          return [abs, ...descriptor].join(' ');
        })
        .filter(Boolean)
        .join(', ');
      return `${prefix}${rewritten}"`;
    });
}

/**
 * Build the consolidated feed items: articles and weeknotes interleaved by date,
 * newest first, limited to the 10 most recent. Content is rendered to HTML with all
 * URLs made absolute against `site`.
 */
export async function getFeedItems(site: URL): Promise<FeedItem[]> {
  const [articles, weeknotes] = await Promise.all([
    getCollection('articles'),
    getCollection('weeknotes'),
  ]);

  const combined: FeedEntry[] = [
    ...articles.map((entry) => ({ section: 'articles' as const, entry })),
    ...weeknotes.map((entry) => ({ section: 'weeknotes' as const, entry })),
  ];

  const sorted = combined
    .filter(({ entry }) => entry.data.visibility !== 'unlisted')
    .sort((a, b) => b.entry.data.date.getTime() - a.entry.data.date.getTime())
    .slice(0, 10);

  const container = await AstroContainer.create();

  return Promise.all(
    sorted.map(async ({ section, entry }) => {
      const { Content } = await render(entry);
      const html = await container.renderToString(Content);
      const url = new URL(`/${section}/${entry.id}`, site).href;
      return {
        title: entry.data.title,
        link: url,
        id: url,
        url,
        pubDate: entry.data.date,
        description: entry.data.description,
        contentHtml: absolutiseUrls(html, site),
      };
    }),
  );
}
