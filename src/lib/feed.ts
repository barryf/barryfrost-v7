import { getCollection } from 'astro:content';

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

export async function getFeedPages(
  collection: Parameters<typeof getCollection>[0],
  opts?: { filter?: (e: any) => boolean; sort?: (a: any, b: any) => number; pageSize?: number },
) {
  const entries = await getCollection(collection);
  const filtered = opts?.filter ? entries.filter(opts.filter) : entries;
  const sorted = [...filtered].sort(opts?.sort ?? byCreatedAtDesc);
  return paginateItems(sorted, opts?.pageSize);
}
