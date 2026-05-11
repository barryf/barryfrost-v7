type Fit = 'cover' | 'contain' | 'scale-down' | 'crop' | 'pad';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface Env {}

const DID = 'did:plc:j5ksi3y4tdtbp7vpsxsfyask';
const PDS_HOST = 'bsky.social';
const IMMUTABLE = 'public, max-age=31536000, immutable';

function intParam(url: URL, key: string): number | undefined {
  const v = url.searchParams.get(key);
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return isNaN(n) ? undefined : n;
}

export default {
  async fetch(request: Request, _env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/blob') return new Response('Not found', { status: 404 });

    const cid = url.searchParams.get('cid');
    if (!cid) return new Response('cid required', { status: 400 });

    const w = intParam(url, 'w');
    const h = intParam(url, 'h');
    const fit = (url.searchParams.get('fit') ?? 'cover') as Fit;
    const q = intParam(url, 'q') ?? 85;

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    const blobUrl = `https://${PDS_HOST}/xrpc/com.atproto.sync.getBlob?did=${DID}&cid=${cid}`;

    const accept = request.headers.get('accept') ?? '';
    const format = accept.includes('image/avif') ? 'avif'
      : accept.includes('image/webp') ? 'webp'
      : 'jpeg';

    const originResponse = await fetch(blobUrl, w || h ? {
      cf: {
        image: { width: w, height: h, fit, quality: q, format },
      },
    } as RequestInit : undefined);

    if (!originResponse.ok || !originResponse.body) {
      return new Response('PDS error', { status: originResponse.status });
    }

    const headers = new Headers({
      'content-type': originResponse.headers.get('content-type') ?? 'application/octet-stream',
      'cache-control': IMMUTABLE,
      'vary': 'Accept',
    });
    const final = new Response(originResponse.body, { status: 200, headers });

    ctx.waitUntil(cache.put(cacheKey, final.clone()));
    return final;
  },
};
