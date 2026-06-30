/**
 * image-store.ts
 *
 * Build-time image materialiser. Delegates resizing to the existing Cloudflare
 * endpoints (blob proxy + /cdn-cgi/image/), then stores the result in R2
 * under a content-addressed key. No native modules required.
 *
 * In dev mode (PROD !== true) or when R2 credentials are absent it
 * short-circuits to the live CF URLs so local iteration works without creds.
 *
 * Key scheme:
 *   PDS blobs   → blob/{cid}/{w}x{h}-{fit}-q{q}
 *   Remote URLs → ext/{sha256hex(url)[0..15]}/{w}x{h}-{fit}-q{q}
 */

import { createHash } from 'node:crypto';
import { blobImage, transformImage } from '@/lib/image-url';

type Fit = 'cover' | 'contain' | 'scale-down' | 'crop' | 'pad';

interface ImageOpts {
  width?: number;
  height?: number;
  fit?: Fit;
  quality?: number;
}

// ── R2 config ────────────────────────────────────────────────────────────────

const R2_ACCOUNT_ID        = process.env.R2_ACCOUNT_ID;
const R2_BUCKET            = process.env.R2_BUCKET;
const R2_ACCESS_KEY_ID     = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const IMAGES_BASE_URL      = process.env.IMAGES_BASE_URL ?? 'https://images.barryfrost.com';

const IS_PROD = import.meta.env.PROD === true;
const R2_CONFIGURED = !!(R2_ACCOUNT_ID && R2_BUCKET && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);

let _AwsClient: (typeof import('aws4fetch'))['AwsClient'] | undefined;

async function getAwsClient(): Promise<InstanceType<typeof import('aws4fetch')['AwsClient']>> {
  if (!_AwsClient) {
    _AwsClient = (await import('aws4fetch')).AwsClient;
  }
  return new _AwsClient({
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
    service: 's3',
    region: 'auto',
  });
}

// ── concurrency limiter ──────────────────────────────────────────────────────

const CONCURRENCY = 8;
let _active = 0;
const _queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (_active < CONCURRENCY) { _active++; return Promise.resolve(); }
  return new Promise(resolve => _queue.push(resolve));
}

function releaseSlot() {
  const next = _queue.shift();
  if (next) { next(); } else { _active--; }
}

// ── key helpers ──────────────────────────────────────────────────────────────

function dimSegment(opts: ImageOpts): string {
  const w = opts.width ?? 0;
  const h = opts.height ?? 0;
  const fit = opts.fit ?? 'cover';
  const q = opts.quality ?? 85;
  return `${w}x${h}-${fit}-q${q}`;
}

function blobKey(cid: string, opts: ImageOpts): string {
  return `blob/${cid}/${dimSegment(opts)}`;
}

function remoteKey(url: string, opts: ImageOpts): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
  return `ext/${hash}/${dimSegment(opts)}`;
}

function r2Endpoint(key: string): string {
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`;
}

// ── R2 operations ────────────────────────────────────────────────────────────

async function r2Exists(aws: Awaited<ReturnType<typeof getAwsClient>>, key: string): Promise<boolean> {
  try {
    const res = await aws.fetch(r2Endpoint(key), { method: 'HEAD' });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function r2Put(
  aws: Awaited<ReturnType<typeof getAwsClient>>,
  key: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<void> {
  await aws.fetch(r2Endpoint(key), {
    method: 'PUT',
    body,
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}

// ── core materialise function ────────────────────────────────────────────────

async function materialise(key: string, cfUrl: string, directUrl?: string): Promise<string> {
  await acquireSlot();
  try {
    const aws = await getAwsClient();
    if (await r2Exists(aws, key)) {
      return `${IMAGES_BASE_URL}/${key}`;
    }
    // Try CF endpoint first (handles resize + webp conversion).
    let res = await fetch(cfUrl, { headers: { Accept: 'image/webp,image/*' } });
    // If CF endpoint fails (e.g. source domain not on Image Resizing allowlist),
    // fall back to fetching the source URL directly — no resize, but still R2-cached.
    if (!res.ok && directUrl) {
      res = await fetch(directUrl);
    }
    if (!res.ok) {
      console.warn(`[image-store] fetch failed ${res.status}, falling back to CF URL: ${cfUrl}`);
      return cfUrl;
    }
    const contentType = res.headers.get('content-type') ?? 'image/webp';
    const bytes = await res.arrayBuffer();
    await r2Put(aws, key, bytes, contentType);
    return `${IMAGES_BASE_URL}/${key}`;
  } catch (err) {
    console.warn(`[image-store] materialise error for ${key}, falling back to CF URL:`, err);
    return cfUrl;
  } finally {
    releaseSlot();
  }
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * Return a URL for a resized image of a PDS blob.
 * Dev/no-creds: live cdn.barryfrost.com URL. Prod: materialise to R2 once.
 */
export async function pdsImage(cid: string, opts: ImageOpts = {}): Promise<string> {
  const cfUrl = blobImage(cid, opts);
  if (!IS_PROD || !R2_CONFIGURED) return cfUrl;
  return materialise(blobKey(cid, opts), cfUrl);
}

/**
 * Return a URL for a resized image of an external URL.
 * Dev/no-creds: live /cdn-cgi/image/ URL. Prod: materialise to R2 once.
 */
export async function remoteImage(url: string, opts: ImageOpts = {}): Promise<string> {
  const cfUrl = transformImage(url, opts);
  if (!IS_PROD || !R2_CONFIGURED) return cfUrl;
  // Pass url as direct fallback: if cdn-cgi/image returns 403 (source domain not
  // on CF Image Resizing allowlist), we fetch the original and store it unresized.
  return materialise(remoteKey(url, opts), cfUrl, url);
}
