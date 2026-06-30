/**
 * image-store.ts
 *
 * Build-time image materialiser. Fetches source images, resizes them with
 * sharp, and stores the result in R2 under a content-addressed key.
 *
 * In dev mode (import.meta.env.PROD === false) it short-circuits to live
 * URLs (cdn.barryfrost.com blob proxy / cdn-cgi) so R2 credentials are not
 * required locally.
 *
 * Key scheme:
 *   PDS blobs  → blob/{cid}/{w}x{h}-{fit}-q{q}.webp
 *   Remote URLs → ext/{sha256hex(url)}/{w}x{h}-{fit}-q{q}.webp
 */

import { createHash } from 'node:crypto';
import { blobImage, transformImage } from '@/lib/image-url';
import { DID, PDS_HOST } from '@/lib/pds';

type Fit = 'cover' | 'contain' | 'scale-down' | 'crop' | 'pad';

interface ImageOpts {
  width?: number;
  height?: number;
  fit?: Fit;
  quality?: number;
}

// ── R2 config (read once at module level) ────────────────────────────────────
// Use process.env for secrets — CI sets them as real environment variables,
// which are reliably available here but may not propagate through Vite's
// import.meta.env treatment during static builds.

const R2_ACCOUNT_ID        = process.env.R2_ACCOUNT_ID;
const R2_BUCKET            = process.env.R2_BUCKET;
const R2_ACCESS_KEY_ID     = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const IMAGES_BASE_URL      = process.env.IMAGES_BASE_URL ?? 'https://images.barryfrost.com';

const IS_PROD = import.meta.env.PROD === true;
const R2_CONFIGURED = !!(R2_ACCOUNT_ID && R2_BUCKET && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);

// Only import sharp + aws4fetch in Node (build). They are not available in the
// Worker/browser runtime. Dynamic import keeps the module tree-shakeable for
// client bundles that accidentally reference this file.
let _sharp: typeof import('sharp') | undefined;
let _AwsClient: (typeof import('aws4fetch'))['AwsClient'] | undefined;

async function getSharp() {
  if (!_sharp) _sharp = (await import('sharp')).default;
  return _sharp;
}

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
  if (_active < CONCURRENCY) {
    _active++;
    return Promise.resolve();
  }
  return new Promise(resolve => _queue.push(resolve));
}

function releaseSlot() {
  const next = _queue.shift();
  if (next) {
    next();
  } else {
    _active--;
  }
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
  return `blob/${cid}/${dimSegment(opts)}.webp`;
}

function remoteKey(url: string, opts: ImageOpts): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
  return `ext/${hash}/${dimSegment(opts)}.webp`;
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
  body: Uint8Array,
): Promise<void> {
  await aws.fetch(r2Endpoint(key), {
    method: 'PUT',
    body,
    headers: {
      'content-type': 'image/webp',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}

// ── resize helper ────────────────────────────────────────────────────────────

async function resizeToWebp(srcBytes: ArrayBuffer, opts: ImageOpts): Promise<Uint8Array> {
  const sharp = await getSharp();
  let pipeline = sharp(new Uint8Array(srcBytes));
  if (opts.width || opts.height) {
    pipeline = pipeline.resize(opts.width ?? null, opts.height ?? null, {
      fit: (opts.fit ?? 'cover') as import('sharp').FitEnum[keyof import('sharp').FitEnum],
      withoutEnlargement: true,
    });
  }
  return pipeline.webp({ quality: opts.quality ?? 85 }).toBuffer();
}

// ── core materialise function ────────────────────────────────────────────────

async function materialise(
  key: string,
  fetchSource: () => Promise<ArrayBuffer>,
  opts: ImageOpts,
): Promise<string> {
  await acquireSlot();
  try {
    const aws = await getAwsClient();
    if (await r2Exists(aws, key)) {
      return `${IMAGES_BASE_URL}/${key}`;
    }
    const srcBytes = await fetchSource();
    const webpBytes = await resizeToWebp(srcBytes, opts);
    await r2Put(aws, key, webpBytes);
    return `${IMAGES_BASE_URL}/${key}`;
  } finally {
    releaseSlot();
  }
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * Return a URL for a resized WebP of a PDS blob.
 *
 * In dev / when R2 is not configured: returns the live cdn.barryfrost.com URL.
 * In prod with R2: materialises to R2 on first call, subsequent calls skip.
 */
export async function pdsImage(cid: string, opts: ImageOpts = {}): Promise<string> {
  if (!IS_PROD || !R2_CONFIGURED) {
    return blobImage(cid, opts);
  }
  const key = blobKey(cid, opts);
  return materialise(key, async () => {
    const blobUrl = `https://${PDS_HOST}/xrpc/com.atproto.sync.getBlob?did=${DID}&cid=${encodeURIComponent(cid)}`;
    const res = await fetch(blobUrl);
    if (!res.ok) throw new Error(`Failed to fetch PDS blob ${cid}: ${res.status}`);
    return res.arrayBuffer();
  }, opts);
}

/**
 * Return a URL for a resized WebP of an external (remote) image.
 *
 * In dev / when R2 is not configured: returns the live /cdn-cgi/image/ URL.
 * In prod with R2: materialises to R2 on first call, subsequent calls skip.
 */
export async function remoteImage(url: string, opts: ImageOpts = {}): Promise<string> {
  if (!IS_PROD || !R2_CONFIGURED) {
    return transformImage(url, opts);
  }
  const key = remoteKey(url, opts);
  return materialise(key, async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch remote image ${url}: ${res.status}`);
    return res.arrayBuffer();
  }, opts);
}
