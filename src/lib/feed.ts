export const PAGE_SIZE = 50;

export function paginateItems<T>(items: T[], pageSize: number = PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  return Array.from({ length: pageCount }, (_, i) => ({
    page: i + 1,
    items: items.slice(i * pageSize, (i + 1) * pageSize),
    totalPages: pageCount,
  }));
}
