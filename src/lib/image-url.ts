type Fit = 'cover' | 'contain' | 'scale-down' | 'crop' | 'pad';

const SITE = import.meta.env.SITE ?? 'https://new.barryfrost.com';

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
