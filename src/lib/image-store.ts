/**
 * image-store.ts
 *
 * Build-time image materialiser. Fetches source images directly (PDS getBlob
 * or remote URL), resizes with sharp, and stores webp in R2 under a
 * content-addressed key. No Cloudflare runtime resizers required.
 *
 * In dev mode (PROD !== true) or when R2 credentials are absent it returns the
 * direct source URL so local iteration works without any credentials.
 *
 * On any build-time error (network, sharp, R2) it falls back to the direct
 * source URL — the image renders at original size but the build succeeds.
 *
 * Key scheme:
 *   PDS blobs   → blob/{cid}/{w}x{h}-{fit}-q{q}
 *   Remote URLs → ext/{sha256hex(url)[0..15]}/{w}x{h}-{fit}-q{q}
 */

import { createHash } from 'node:crypto';
import { DID, PDS_HOST } from '@/lib/pds';

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

const CONCURRENCY = 24;
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

// ── sharp fit mapping ────────────────────────────────────────────────────────

type SharpFit = 'cover' | 'contain' | 'inside' | 'outside' | 'fill';

function sharpFit(fit: Fit): SharpFit {
  switch (fit) {
    case 'cover':      return 'cover';
    case 'contain':    return 'contain';
    case 'scale-down': return 'inside';   // inside + withoutEnlargement
    case 'crop':       return 'cover';
    case 'pad':        return 'contain';
  }
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
  body: Buffer,
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

async function materialise(key: string, sourceUrl: string, opts: ImageOpts): Promise<string> {
  await acquireSlot();
  try {
    const aws = await getAwsClient();
    if (await r2Exists(aws, key)) {
      return `${IMAGES_BASE_URL}/${key}`;
    }

    // Fetch the original image directly from its source.
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      console.warn(`[image-store] fetch failed ${res.status}: ${sourceUrl}`);
      return sourceUrl;
    }
    const srcBuf = Buffer.from(await res.arrayBuffer());

    // Resize + encode as webp with sharp.
    const { default: sharp } = await import('sharp');
    const w = opts.width;
    const h = opts.height;
    const fit = sharpFit(opts.fit ?? 'cover');
    const withoutEnlargement = opts.fit === 'scale-down';
    const quality = opts.quality ?? 85;

    const webpBuf = await sharp(srcBuf)
      .resize(w ?? null, h ?? null, { fit, withoutEnlargement })
      .webp({ quality })
      .toBuffer();

    await r2Put(aws, key, webpBuf, 'image/webp');
    return `${IMAGES_BASE_URL}/${key}`;
  } catch (err) {
    console.warn(`[image-store] materialise error for ${key}, falling back to source URL:`, err);
    return sourceUrl;
  } finally {
    releaseSlot();
  }
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * Return a URL for a resized image of a PDS blob.
 * Dev/no-creds: direct getBlob URL (unresized). Prod: materialise to R2.
 */
export async function pdsImage(cid: string, opts: ImageOpts = {}): Promise<string> {
  const sourceUrl = `https://${PDS_HOST}/xrpc/com.atproto.sync.getBlob?did=${DID}&cid=${encodeURIComponent(cid)}`;
  if (!IS_PROD || !R2_CONFIGURED) return sourceUrl;
  return materialise(blobKey(cid, opts), sourceUrl, opts);
}

/**
 * Return a URL for a resized image of an external URL.
 * Dev/no-creds: the URL as-is (unresized). Prod: materialise to R2.
 */
export async function remoteImage(url: string, opts: ImageOpts = {}): Promise<string> {
  if (!IS_PROD || !R2_CONFIGURED) return url;
  return materialise(remoteKey(url, opts), url, opts);
}
