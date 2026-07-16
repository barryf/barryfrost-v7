import { getCollection, type CollectionEntry, type CollectionKey } from 'astro:content';

export const PAGE_SIZE = 20;

const byCreatedAtDesc = (a: any, b: any) =>
  new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime();

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
