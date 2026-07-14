/**
 * Import v6 photo posts to grain.social as PDS records.
 *
 * Creates one social.grain.gallery + N social.grain.photo + N social.grain.gallery.item
 * per v6 "post-type: photo" post. Single-photo posts become single-item galleries.
 *
 * Usage:
 *   npx tsx scripts/import-grain-photos.ts [--dry-run] [--limit N] [--slug YYYY/MM/slug]
 *
 * Env vars required (live mode):
 *   BSKY_HANDLE        e.g. barryfrost.com
 *   BSKY_APP_PASSWORD  an app password from bsky.app settings
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';

// ─── Config ──────────────────────────────────────────────────────────────────

const POSTS_DIR = join(process.cwd(), '../content/posts');
const IMPORTED_FILE = join(process.cwd(), 'scripts/imported-grain-photos.json');
const PDS_REGISTRY_HOST = 'bsky.social';

const MAX_BLOB_BYTES = 1_000_000;
const WRITE_DELAY_MS = 250;

// ─── Types ────────────────────────────────────────────────────────────────────

type Mf2Photo = string | { alt?: string; value: string };

interface MF2Post {
  'post-type': string[];
  properties: {
    published?: string[];
    content?: (string | { value?: string; html?: string })[];
    category?: string[];
    photo?: Mf2Photo[];
  };
}

interface ImportedEntry {
  galleryUri: string;
  photoUris: string[];
}

interface ImportedMap {
  [slug: string]: ImportedEntry;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return env;
  const raw = readFileSync(envPath, 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    env[key] = val;
  }
  return env;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatMonthYear(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function deriveTitle(content: string | undefined, published: Date): string {
  const src = content?.trim();
  if (!src) return `Photos from ${formatMonthYear(published)}`;
  if (src.length <= 80) return src;
  const cut = src.slice(0, 80);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut) + '…';
}

function extractContent(raw: MF2Post['properties']['content']): string {
  if (!raw?.length) return '';
  const c = raw[0];
  if (typeof c === 'string') return c;
  return c?.value ?? c?.html ?? '';
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function encodedUnder1MB(buffer: Buffer, maxEdge?: number): Promise<Buffer | null> {
  for (const quality of [90, 80, 70, 60]) {
    let pipeline = sharp(buffer).rotate().jpeg({ quality, mozjpeg: true });
    if (maxEdge) {
      pipeline = sharp(buffer).rotate().resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true }).jpeg({ quality, mozjpeg: true });
    }
    const out = await pipeline.toBuffer();
    if (out.length <= MAX_BLOB_BYTES) return out;
  }
  return null;
}

async function encodePhoto(buffer: Buffer): Promise<Buffer | null> {
  // Try at native size first
  let result = await encodedUnder1MB(buffer);
  if (result) return result;
  // Progressively downscale
  for (const maxEdge of [2400, 1800, 1400, 1000]) {
    result = await encodedUnder1MB(buffer, maxEdge);
    if (result) return result;
  }
  return null;
}

// ─── PDS auth ─────────────────────────────────────────────────────────────────

async function resolvePds(handle: string): Promise<string> {
  const res = await fetch(`https://${PDS_REGISTRY_HOST}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(handle)}`);
  if (!res.ok) throw new Error(`describeRepo failed: ${res.status}`);
  const data = await res.json() as { didDoc?: { service?: { serviceEndpoint?: string }[] } };
  const endpoint = data.didDoc?.service?.[0]?.serviceEndpoint;
  if (!endpoint) throw new Error('Could not resolve PDS endpoint');
  return endpoint;
}

interface Session { accessJwt: string; did: string }

async function createSession(pds: string, identifier: string, password: string): Promise<Session> {
  const res = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) throw new Error(`createSession failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as Session;
  return data;
}

async function uploadBlob(pds: string, jwt: string, bytes: Buffer, mimeType: string): Promise<unknown> {
  const res = await fetch(`${pds}/xrpc/com.atproto.repo.uploadBlob`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': mimeType,
    },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) throw new Error(`uploadBlob failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { blob: unknown };
  return data.blob;
}

async function createRecord(
  pds: string,
  jwt: string,
  did: string,
  collection: string,
  record: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(`${pds}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ repo: did, collection, record }),
  });
  if (!res.ok) throw new Error(`createRecord(${collection}) failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { uri: string };
  return data.uri;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
  const slugIdx = args.indexOf('--slug');
  const targetSlug = slugIdx >= 0 ? args[slugIdx + 1] : null;

  // Load imported map
  const imported: ImportedMap = existsSync(IMPORTED_FILE)
    ? JSON.parse(readFileSync(IMPORTED_FILE, 'utf-8'))
    : {};

  // Auth (only needed for live mode)
  let pds = '';
  let session: Session | null = null;
  if (!dryRun) {
    const env = { ...loadEnv(), ...process.env };
    const handle = env['BSKY_HANDLE'];
    const password = env['BSKY_APP_PASSWORD'];
    if (!handle || !password) {
      console.error('Error: BSKY_HANDLE and BSKY_APP_PASSWORD must be set (env or .env file)');
      process.exit(1);
    }
    console.log(`Resolving PDS for ${handle}…`);
    pds = await resolvePds(handle);
    console.log(`PDS: ${pds}`);
    console.log('Authenticating…');
    session = await createSession(pds, handle, password);
    console.log(`Authenticated as ${session.did}`);
  }

  // Walk posts
  const posts: { key: string; filePath: string; year: string; month: string; slug: string }[] = [];
  const years = readdirSync(POSTS_DIR).filter((d: string) => /^\d{4}$/.test(d)).sort();
  for (const year of years) {
    const yearDir = join(POSTS_DIR, year);
    const months = readdirSync(yearDir).filter((d: string) => /^\d{2}$/.test(d)).sort();
    for (const month of months) {
      const monthDir = join(yearDir, month);
      const files = readdirSync(monthDir).filter((f: string) => f.endsWith('.json'));
      for (const file of files) {
        const slug = file.replace(/\.json$/, '');
        const key = `${year}/${month}/${slug}`;
        if (targetSlug && key !== targetSlug) continue;
        const raw = readFileSync(join(monthDir, file), 'utf-8');
        let post: MF2Post;
        try { post = JSON.parse(raw); } catch { continue; }
        if (post['post-type']?.[0] !== 'photo') continue;
        posts.push({ key, filePath: join(monthDir, file), year, month, slug });
      }
    }
  }

  // Sort by published date ascending (oldest first)
  posts.sort((a, b) => {
    const aRaw = JSON.parse(readFileSync(a.filePath, 'utf-8')) as MF2Post;
    const bRaw = JSON.parse(readFileSync(b.filePath, 'utf-8')) as MF2Post;
    const aDate = aRaw.properties.published?.[0] ?? '';
    const bDate = bRaw.properties.published?.[0] ?? '';
    return aDate.localeCompare(bDate);
  });

  let processed = 0;
  let totalPhotos = 0;
  let skippedAlready = 0;
  let failedFetch = 0;
  const failedPosts: string[] = [];

  for (const { key, filePath } of posts) {
    if (imported[key]) {
      console.log(`skip (already imported): ${key}`);
      skippedAlready++;
      continue;
    }
    if (processed >= limit) break;

    const post = JSON.parse(readFileSync(filePath, 'utf-8')) as MF2Post;
    const published = post.properties.published?.[0];
    if (!published) { console.warn(`  skip (no published date): ${key}`); continue; }
    const publishedDate = new Date(published);
    const createdAt = publishedDate.toISOString();

    const rawContent = extractContent(post.properties.content);
    const title = deriveTitle(rawContent, publishedDate);
    const description = rawContent.slice(0, 1000) || undefined;

    const photoEntries: Mf2Photo[] = post.properties.photo ?? [];
    console.log(`\n${createdAt.slice(0, 10)} → "${title}" (${photoEntries.length} photo${photoEntries.length !== 1 ? 's' : ''})  [${key}]`);

    const photoUris: string[] = [];
    const successfulBlobs: { blob: unknown; aspectRatio: { width: number; height: number }; alt?: string }[] = [];

    for (const entry of photoEntries) {
      const photoUrl = typeof entry === 'string' ? entry : entry.value;
      const alt = typeof entry === 'object' ? entry.alt : undefined;
      const host = (() => { try { return new URL(photoUrl).host; } catch { return photoUrl; } })();

      let buffer: Buffer;
      try {
        const response = await fetch(photoUrl);
        if (!response.ok) {
          console.warn(`  ✗ fetch failed (${response.status}): ${photoUrl}`);
          failedFetch++;
          continue;
        }
        buffer = Buffer.from(await response.arrayBuffer());
      } catch (err) {
        console.warn(`  ✗ fetch error: ${photoUrl} — ${(err as Error).message}`);
        failedFetch++;
        continue;
      }

      const encoded = await encodePhoto(buffer);
      if (!encoded) {
        console.warn(`  ✗ could not encode under 1 MB: ${photoUrl}`);
        failedFetch++;
        continue;
      }

      const meta = await sharp(encoded).metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;

      console.log(`  • ${encoded.length.toLocaleString()}B ${width}×${height}${alt ? ` alt="${alt}"` : ''} ← ${host}`);
      totalPhotos++;

      if (!dryRun && session) {
        await sleep(WRITE_DELAY_MS);
        const blob = await uploadBlob(pds, session.accessJwt, encoded, 'image/jpeg');
        successfulBlobs.push({ blob, aspectRatio: { width, height }, alt });
      }
    }

    if (!dryRun && session) {
      if (successfulBlobs.length === 0) {
        console.warn(`  ✗ all photos failed for ${key} — skipping gallery creation`);
        failedPosts.push(key);
        continue;
      }

      // Create social.grain.photo records
      for (const { blob, aspectRatio, alt } of successfulBlobs) {
        await sleep(WRITE_DELAY_MS);
        const photoRecord: Record<string, unknown> = {
          $type: 'social.grain.photo',
          photo: blob,
          aspectRatio,
          createdAt,
        };
        if (alt) photoRecord.alt = alt;
        const photoUri = await createRecord(pds, session.accessJwt, session.did, 'social.grain.photo', photoRecord);
        photoUris.push(photoUri);
        console.log(`  ✓ photo: ${photoUri}`);
      }

      // Create social.grain.gallery
      await sleep(WRITE_DELAY_MS);
      const galleryRecord: Record<string, unknown> = {
        $type: 'social.grain.gallery',
        title,
        createdAt,
      };
      if (description) galleryRecord.description = description;
      const galleryUri = await createRecord(pds, session.accessJwt, session.did, 'social.grain.gallery', galleryRecord);
      console.log(`  ✓ gallery: ${galleryUri}`);

      // Create social.grain.gallery.item records
      for (let i = 0; i < photoUris.length; i++) {
        await sleep(WRITE_DELAY_MS);
        await createRecord(pds, session.accessJwt, session.did, 'social.grain.gallery.item', {
          $type: 'social.grain.gallery.item',
          gallery: galleryUri,
          item: photoUris[i],
          position: i + 1,
          createdAt,
        });
      }
      console.log(`  ✓ ${photoUris.length} gallery item${photoUris.length !== 1 ? 's' : ''}`);

      // Persist progress
      imported[key] = { galleryUri, photoUris };
      writeFileSync(IMPORTED_FILE, JSON.stringify(imported, null, 2) + '\n');
    }

    processed++;
  }

  console.log(`\n─── Summary ──────────────────────────────────────────────────────`);
  console.log(`Posts processed:     ${processed}`);
  console.log(`Photos encoded:      ${totalPhotos}`);
  console.log(`Failed fetches:      ${failedFetch}`);
  console.log(`Already imported:    ${skippedAlready}`);
  if (failedPosts.length) {
    console.log(`Posts with no photos: ${failedPosts.length}`);
    for (const p of failedPosts) console.log(`  ${p}`);
  }
  if (dryRun) console.log(`\n(dry-run — no PDS writes)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
