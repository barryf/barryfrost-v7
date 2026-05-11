type Fit = 'cover' | 'contain' | 'scale-down' | 'crop' | 'pad';

const SITE = import.meta.env.SITE ?? 'https://new.barryfrost.com';
const CDN = 'https://cdn.barryfrost.com';

export function transformImage(
  source: string,
  opts: { width?: number; height?: number; fit?: Fit; quality?: number } = {},
): string {
  const params = Object.entries({ ...opts, format: 'auto' })
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  return `${SITE}/cdn-cgi/image/${params}/${source}`;
}

export function blobImage(
  cid: string,
  opts: { width?: number; height?: number; fit?: Fit; quality?: number } = {},
): string {
  const params = new URLSearchParams({ cid });
  if (opts.width != null) params.set('w', String(opts.width));
  if (opts.height != null) params.set('h', String(opts.height));
  if (opts.fit != null) params.set('fit', opts.fit);
  if (opts.quality != null) params.set('q', String(opts.quality));
  return `${CDN}/blob?${params.toString()}`;
}
