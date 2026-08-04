import { getCollection, type CollectionEntry, type CollectionKey } from 'astro:content';

export const PAGE_SIZE = 20;

const byCreatedAtDesc = (a: any, b: any) =>
  new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime();

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Channel-level `<image>` for an RSS feed, matching the avatar the JSON feeds advertise.
 * Per the RSS spec the image's title and link must repeat the channel's own values, so
 * the link drops its trailing slash the way `rss({ trailingSlash: false })` does.
 * Returned as raw XML for `rss()`'s `customData`.
 */
export function rssChannelImage(channelTitle: string, site: URL): string {
  const home = new URL('/', site).href.replace(/\/$/, '');
  return [
    '<image>',
    `<url>${escapeXml(new URL('/barryfrost.jpg', site).href)}</url>`,
    `<title>${escapeXml(channelTitle)}</title>`,
    `<link>${escapeXml(home)}</link>`,
    '</image>',
  ].join('');
}

export async function getFeedEntries<C extends CollectionKey>(
  collection: C,
  opts?: {
    filter?: (e: CollectionEntry<C>) => boolean;
    sort?: (a: CollectionEntry<C>, b: CollectionEntry<C>) => number;
  },
) {
  const entries = (await getCollection(collection)) as CollectionEntry<C>[];
  const filtered = opts?.filter ? entries.filter(opts.filter) : entries;
  return [...filtered].sort(opts?.sort ?? byCreatedAtDesc);
}
