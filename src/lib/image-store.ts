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
 *   PDS blobs   → blob/{w}x{h}-{fit}-q{q}/{cid}.webp
 *   Remote URLs → ext/{w}x{h}-{fit}-q{q}/{sha256hex(url)[0..15]}.webp
 */

import { createHash } from 'node:crypto';
import { DID, PDS_HOST } from '@/lib/pds';
import {
  IMAGES_BASE_URL, IS_PROD, R2_CONFIGURED,
  getAwsClient, r2Exists, r2Put, acquireSlot, releaseSlot,
} from '@/lib/r2';

type Fit = 'cover' | 'contain' | 'scale-down' | 'crop' | 'pad';

interface ImageOpts {
  width?: number;
  height?: number;
  fit?: Fit;
  quality?: number;
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
  return `blob/${dimSegment(opts)}/${cid}.webp`;
}

function remoteKey(url: string, opts: ImageOpts): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
  return `ext/${dimSegment(opts)}/${hash}.webp`;
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
