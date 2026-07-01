/** Bound on concurrent per-record processing (PDS/AppView lookups, image calls) in loaders. */
export const RECORD_CONCURRENCY = 32;

/**
 * mapLimit
 *
 * Like Promise.all(items.map(fn)), but bounds concurrency to `limit`
 * in-flight calls at a time instead of firing all of them at once.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
