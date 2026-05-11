type Fit = 'cover' | 'contain' | 'scale-down' | 'crop' | 'pad';

interface Env {
  IMAGES: ImagesBinding;
}

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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
    const origin = await fetch(blobUrl);
    if (!origin.ok || !origin.body) {
      return new Response('PDS error', { status: origin.status });
    }

    const accept = request.headers.get('accept') ?? '';
    const format: string = accept.includes('image/avif') ? 'image/avif'
      : accept.includes('image/webp') ? 'image/webp'
      : 'image/jpeg';

    let body: ReadableStream<Uint8Array>;
    let contentType: string;

    if (w || h) {
      const contentTypeHeader = origin.headers.get('content-type') ?? 'image/jpeg';
      const transformed = await env.IMAGES
        .input(origin.body, { contentType: contentTypeHeader })
        .transform({ width: w, height: h, fit })
        .output({ format, quality: q })
        .response();
      body = transformed.body!;
      contentType = transformed.headers.get('content-type') ?? format;
    } else {
      body = origin.body;
      contentType = origin.headers.get('content-type') ?? 'application/octet-stream';
    }

    const headers = new Headers({
      'content-type': contentType,
      'cache-control': IMMUTABLE,
      'vary': 'Accept',
    });
    const final = new Response(body, { status: 200, headers });

    ctx.waitUntil(cache.put(cacheKey, final.clone()));
    return final;
  },
};
