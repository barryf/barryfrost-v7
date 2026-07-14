/**
 * r2.ts
 *
 * Shared build-time R2 primitives: config detection, a signed S3 client
 * (aws4fetch), a concurrency limiter, and HEAD/PUT helpers. Used by
 * image-store.ts (resized content images).
 *
 * In dev (PROD !== true) or when credentials are absent, R2_CONFIGURED is
 * false and callers fall back to a non-R2 path.
 */

// ── R2 config ────────────────────────────────────────────────────────────────

const R2_ACCOUNT_ID        = process.env.R2_ACCOUNT_ID;
const R2_BUCKET            = process.env.R2_BUCKET;
const R2_ACCESS_KEY_ID     = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

export const IMAGES_BASE_URL = process.env.IMAGES_BASE_URL ?? 'https://images.barryfrost.com';
export const IS_PROD = import.meta.env.PROD === true;
export const R2_CONFIGURED = !!(R2_ACCOUNT_ID && R2_BUCKET && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);

let _AwsClient: (typeof import('aws4fetch'))['AwsClient'] | undefined;

export type Aws = InstanceType<typeof import('aws4fetch')['AwsClient']>;

export async function getAwsClient(): Promise<Aws> {
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

export function acquireSlot(): Promise<void> {
  if (_active < CONCURRENCY) { _active++; return Promise.resolve(); }
  return new Promise(resolve => _queue.push(resolve));
}

export function releaseSlot() {
  const next = _queue.shift();
  if (next) { next(); } else { _active--; }
}

// ── R2 operations ────────────────────────────────────────────────────────────

export function r2Endpoint(key: string): string {
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`;
}

export async function r2Exists(aws: Aws, key: string): Promise<boolean> {
  try {
    const res = await aws.fetch(r2Endpoint(key), { method: 'HEAD' });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function r2Put(aws: Aws, key: string, body: Buffer, contentType: string): Promise<void> {
  await aws.fetch(r2Endpoint(key), {
    method: 'PUT',
    // Node's Buffer is a Uint8Array, but its type doesn't line up with the DOM BodyInit union.
    body: new Uint8Array(body),
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
