import { getCollection, type CollectionEntry, type CollectionKey } from 'astro:content';

const PAGE_SIZE = 20;

export function paginateItems<T>(items: T[], pageSize: number = PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  return Array.from({ length: pageCount }, (_, i) => ({
    page: i + 1,
    items: items.slice(i * pageSize, (i + 1) * pageSize),
    totalPages: pageCount,
  }));
}

const byCreatedAtDesc = (a: any, b: any) =>
  new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime();

export async function getFeedPages<C extends CollectionKey>(
  collection: C,
  opts?: {
    filter?: (e: CollectionEntry<C>) => boolean;
    sort?: (a: CollectionEntry<C>, b: CollectionEntry<C>) => number;
    pageSize?: number;
  },
) {
  const entries = (await getCollection(collection)) as CollectionEntry<C>[];
  const filtered = opts?.filter ? entries.filter(opts.filter) : entries;
  const sorted = [...filtered].sort(opts?.sort ?? byCreatedAtDesc);
  return paginateItems(sorted, opts?.pageSize);
}
