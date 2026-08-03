// Shared helpers for publishing articles/weeknotes as Standard.site documents.
//
// Reads local Markdown (the canonical source), turns each post into a
// `site.standard.document` record — embedding the full body as `at.markpub.markdown`
// content plus a plaintext `textContent`/`description` — and provides the AT Protocol
// write primitives used by the publish/backfill scripts. No third-party AT client:
// every record is hand-built JSON over com.atproto.repo.* XRPC.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname, relative } from 'path';
import sharp from 'sharp';
import {
  PUBLICATIONS,
  DID,
  DOCUMENT_COLLECTION,
  PUBLICATION_COLLECTION,
  documentUri,
} from '../../src/lib/standard-site.js';

export { PUBLICATIONS, DID, DOCUMENT_COLLECTION, PUBLICATION_COLLECTION, documentUri };

export const DESCRIPTION_MAX_CHARS = 280;
export const BSKY_MAX_GRAPHEMES = 300;
export const COVER_MAX_BLOB_BYTES = 1_000_000;

export type CollectionName = keyof typeof PUBLICATIONS;

export interface Frontmatter {
  title?: string;
  date?: string;
  week?: number;
  emoji?: string;
  tags?: string[];
  visibility?: string;
  syndication?: string[];
  standardRkey?: string;
}

export interface Entry {
  collection: CollectionName;
  /** Slug = Astro content id = path under the collection dir without extension. */
  slug: string;
  filePath: string;
  data: Frontmatter;
  body: string;
}

// ─── Frontmatter parsing ────────────────────────────────────────────────────────
// A deliberately small parser for the frontmatter shapes this repo authors (scalars,
// simple `- item` lists). Avoids pulling in a YAML dependency for our own controlled data.

const SCALAR_KEYS = new Set(['title', 'date', 'week', 'emoji', 'visibility', 'standardRkey']);
const LIST_KEYS = new Set(['tags', 'syndication']);

function unquote(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return t;
}

export function parseFrontmatter(raw: string): { data: Frontmatter; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { data: {}, body: raw };

  const [, fmBlock, body] = match;
  const data: Frontmatter = {};
  const lines = fmBlock.split(/\r?\n/);
  let currentList: string[] | null = null;
  let currentListKey: string | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    const listItem = /^\s+-\s+(.*)$/.exec(line);
    if (listItem && currentList) {
      currentList.push(unquote(listItem[1]));
      continue;
    }
    const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    const value = rawValue.trim();
    if (LIST_KEYS.has(key) && value === '') {
      currentList = [];
      currentListKey = key;
      (data as Record<string, unknown>)[key] = currentList;
      continue;
    }
    currentList = null;
    currentListKey = null;
    if (!SCALAR_KEYS.has(key)) continue;
    if (key === 'week') data.week = parseInt(value, 10);
    else (data as Record<string, string>)[key] = unquote(value);
  }
  void currentListKey;
  return { data, body };
}

// ─── Content extraction ─────────────────────────────────────────────────────────

/** Raw markdown for the at.markpub.markdown content field: strip MDX-only artifacts
 *  (import/export lines, bare self-closing component tags) so consumers get clean GFM. */
export function cleanMarkdown(body: string): string {
  return body
    .split(/\r?\n/)
    .filter((l) => !/^\s*(import|export)\s.+from\s+['"].+['"];?\s*$/.test(l))
    .join('\n')
    .replace(/<([A-Z][A-Za-z0-9]*)\b[^>]*\/>/g, '') // <Divider />, <Foo ... />
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Flatten markdown to readable plaintext for textContent (paragraph breaks kept). */
export function toPlaintext(body: string): string {
  return cleanMarkdown(body)
    .replace(/```[\s\S]*?```/g, ' ')          // fenced code blocks
    .replace(/`([^`]+)`/g, '$1')               // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')      // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')  // links → link text
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')        // headings
    .replace(/^\s{0,3}>\s?/gm, '')             // blockquotes
    .replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, '') // list markers
    .replace(/(\*\*|__|\*|_|~~)/g, '')         // emphasis
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map((l) => l.trim()).join('\n')
    .trim();
}

/** Hard truncation of the first N characters — never a generated summary. */
export function truncateDescription(plaintext: string, max = DESCRIPTION_MAX_CHARS): string {
  const collapsed = plaintext.replace(/\s+/g, ' ').trim();
  return collapsed.length <= max ? collapsed : collapsed.slice(0, max).trimEnd();
}

/** Weeknotes prepend the emoji to the title; articles use the title as-is. */
export function documentTitle(entry: Entry): string {
  if (entry.collection === 'weeknotes' && entry.data.emoji) {
    return `${entry.data.emoji} ${entry.data.title ?? ''}`.trim();
  }
  return entry.data.title ?? '';
}

/** Path under the publication URL. Weeknote slugs are numeric, so they carry a
 * `week-` prefix to stay distinct from /section/N pagination URLs. */
export function documentPath(entry: Entry): string {
  return entry.collection === 'weeknotes' ? `/week-${entry.slug}` : `/${entry.slug}`;
}

export function canonicalUrl(entry: Entry): string {
  return `${PUBLICATIONS[entry.collection].url}${documentPath(entry)}`;
}

// ─── Reading local content ──────────────────────────────────────────────────────

function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else if (['.md', '.mdx'].includes(extname(name))) out.push(full);
  }
  return out;
}

export function readEntries(collection: CollectionName, contentRoot = 'src/content'): Entry[] {
  const dir = join(process.cwd(), contentRoot, collection);
  return walk(dir).map((filePath) => {
    const raw = readFileSync(filePath, 'utf-8');
    const { data, body } = parseFrontmatter(raw);
    const slug = relative(dir, filePath).replace(/\.(md|mdx)$/, '');
    return { collection, slug, filePath, data, body };
  });
}

export function isPublishable(entry: Entry): boolean {
  return entry.data.visibility !== 'unlisted';
}

// ─── Record builders ────────────────────────────────────────────────────────────

export interface StrongRef { uri: string; cid: string }

/** Result of com.atproto.repo.uploadBlob — embeddable directly as a lexicon `blob` value. */
export interface BlobRef {
  $type: 'blob';
  ref: { $link: string };
  mimeType: string;
  size: number;
}

export interface DocumentRecord {
  $type: 'site.standard.document';
  site: string;
  title: string;
  path: string;
  publishedAt: string;
  tags?: string[];
  description?: string;
  textContent?: string;
  content: {
    $type: 'at.markpub.markdown';
    flavor: 'gfm';
    text: { $type: 'at.markpub.text'; markdown: string };
  };
  coverImage?: BlobRef;
  bskyPostRef?: StrongRef;
  updatedAt?: string;
}

export function buildDocumentRecord(
  entry: Entry, bskyPostRef?: StrongRef, coverImage?: BlobRef,
): DocumentRecord {
  const pub = PUBLICATIONS[entry.collection];
  const plaintext = toPlaintext(entry.body);
  const markdown = cleanMarkdown(entry.body);
  const record: DocumentRecord = {
    $type: 'site.standard.document',
    site: pub.uri,
    title: documentTitle(entry),
    path: documentPath(entry),
    publishedAt: new Date(entry.data.date ?? Date.now()).toISOString(),
    content: {
      $type: 'at.markpub.markdown',
      flavor: 'gfm',
      text: { $type: 'at.markpub.text', markdown },
    },
  };
  if (plaintext) {
    record.textContent = plaintext;
    record.description = truncateDescription(plaintext);
  }
  if (entry.data.tags?.length) record.tags = entry.data.tags;
  if (coverImage) record.coverImage = coverImage;
  if (bskyPostRef) record.bskyPostRef = bskyPostRef;
  return record;
}

/** Fields that determine whether a re-put is needed (excludes bskyPostRef/coverImage/updatedAt
 *  — these are resolved once and stick, so they must not force a re-put on every run).
 *  Accepts either a freshly-built record or a raw record fetched from the PDS. */
export function documentContentSignature(r: DocumentRecord | Record<string, unknown>): string {
  const content = r.content as { text?: { markdown?: string } } | undefined;
  return JSON.stringify({
    site: r.site ?? '',
    title: r.title ?? '',
    path: r.path ?? '',
    publishedAt: r.publishedAt ?? '',
    tags: (r.tags as string[] | undefined) ?? [],
    description: r.description ?? '',
    textContent: r.textContent ?? '',
    markdown: content?.text?.markdown ?? '',
  });
}

export interface BlueskyPost {
  $type: 'app.bsky.feed.post';
  text: string;
  createdAt: string;
  langs: string[];
  embed: {
    $type: 'app.bsky.embed.external';
    external: {
      uri: string; title: string; description: string; thumb?: unknown;
      associatedRefs?: StrongRef[];
    };
  };
}

export function blueskyPostText(entry: Entry): string {
  const base = entry.collection === 'weeknotes' && entry.data.emoji
    ? `${entry.data.emoji} ${entry.data.title ?? ''}`.trim()
    : entry.data.title ?? '';
  return [...base].length > BSKY_MAX_GRAPHEMES
    ? [...base].slice(0, BSKY_MAX_GRAPHEMES - 1).join('') + '…'
    : base;
}

/** `associatedRefs` points Bluesky straight at this post's Standard Site records so the
 *  enhanced link card is built from them rather than from a crawl of the page. Bluesky
 *  snapshots the records at index time (their "puppy problem"), so a ref going stale after
 *  a later putRecord is expected and harmless. Order is document then publication. */
export function buildBlueskyPost(
  entry: Entry, thumb?: unknown, associatedRefs?: StrongRef[],
): BlueskyPost {
  const plaintext = toPlaintext(entry.body);
  return {
    $type: 'app.bsky.feed.post',
    text: blueskyPostText(entry),
    createdAt: new Date().toISOString(),
    langs: ['en'],
    embed: {
      $type: 'app.bsky.embed.external',
      external: {
        uri: canonicalUrl(entry),
        title: documentTitle(entry),
        description: truncateDescription(plaintext),
        ...(thumb ? { thumb } : {}),
        ...(associatedRefs?.length ? { associatedRefs } : {}),
      },
    },
  };
}

/** Strong ref for a publication record, read from the PDS (the config holds only the URI).
 *  Memoised per collection — every entry in a run shares one lookup. */
const publicationRefCache = new Map<CollectionName, StrongRef | null>();

export async function getPublicationRef(
  session: Session, collection: CollectionName,
): Promise<StrongRef | null> {
  if (publicationRefCache.has(collection)) return publicationRefCache.get(collection)!;
  const uri = PUBLICATIONS[collection].uri;
  const rkey = uri.split('/').pop();
  let ref: StrongRef | null = null;
  if (rkey) {
    const rec = await getRecord(session, PUBLICATION_COLLECTION, rkey);
    if (rec) ref = { uri: rec.uri, cid: rec.cid };
    else console.warn(`[associatedRefs] publication record not found for ${collection}: ${uri}`);
  }
  publicationRefCache.set(collection, ref);
  return ref;
}

// ─── AT Protocol client (com.atproto.repo.* over XRPC) ──────────────────────────

export interface Session { pds: string; jwt: string; did: string }

export function loadDotEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(join(process.cwd(), '.env'), 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env — rely on process.env */ }
  return out;
}

async function resolvePds(handle: string): Promise<string> {
  const res = await fetch(`https://bsky.social/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(handle)}`);
  if (!res.ok) throw new Error(`describeRepo failed: ${res.status}`);
  const data = await res.json() as { didDoc?: { service?: { serviceEndpoint?: string }[] } };
  const endpoint = data.didDoc?.service?.[0]?.serviceEndpoint;
  if (!endpoint) throw new Error('Could not resolve PDS endpoint');
  return endpoint;
}

export async function createSession(): Promise<Session> {
  const env = { ...loadDotEnv(), ...process.env } as Record<string, string>;
  const handle = env.BSKY_HANDLE;
  const password = env.BSKY_APP_PASSWORD;
  if (!handle || !password) {
    throw new Error('BSKY_HANDLE and BSKY_APP_PASSWORD must be set (env or .env)');
  }
  const pds = await resolvePds(handle);
  const res = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: handle, password }),
  });
  if (!res.ok) throw new Error(`createSession failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { accessJwt: string; did: string };
  return { pds, jwt: data.accessJwt, did: data.did };
}

/** Fetch a record, or null on 404. */
export async function getRecord(
  session: Session, collection: string, rkey: string,
): Promise<{ uri: string; cid: string; value: Record<string, unknown> } | null> {
  const params = new URLSearchParams({ repo: session.did, collection, rkey });
  const res = await fetch(`${session.pds}/xrpc/com.atproto.repo.getRecord?${params}`, {
    headers: { Authorization: `Bearer ${session.jwt}` },
  });
  if (res.status === 400 || res.status === 404) return null;
  if (!res.ok) throw new Error(`getRecord(${collection}/${rkey}) failed: ${res.status} ${await res.text()}`);
  return await res.json() as { uri: string; cid: string; value: Record<string, unknown> };
}

export async function putRecord(
  session: Session, collection: string, rkey: string, record: Record<string, unknown>,
): Promise<StrongRef> {
  const res = await fetch(`${session.pds}/xrpc/com.atproto.repo.putRecord`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo: session.did, collection, rkey, record }),
  });
  if (!res.ok) throw new Error(`putRecord(${collection}/${rkey}) failed: ${res.status} ${await res.text()}`);
  return await res.json() as StrongRef;
}

export async function createRecord(
  session: Session, collection: string, record: Record<string, unknown>, rkey?: string,
): Promise<StrongRef> {
  const body: Record<string, unknown> = { repo: session.did, collection, record };
  if (rkey) body.rkey = rkey;
  const res = await fetch(`${session.pds}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createRecord(${collection}) failed: ${res.status} ${await res.text()}`);
  return await res.json() as StrongRef;
}

export async function uploadBlob(session: Session, bytes: Buffer, mimeType: string): Promise<BlobRef> {
  const res = await fetch(`${session.pds}/xrpc/com.atproto.repo.uploadBlob`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.jwt}`, 'Content-Type': mimeType },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) throw new Error(`uploadBlob failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { blob: BlobRef };
  return data.blob;
}

/** Resolve a bsky.app post URL (…/profile/<handle-or-did>/post/<rkey>) to a strong ref. */
export async function resolveBskyPostRef(session: Session, url: string): Promise<StrongRef | null> {
  const m = /\/post\/([a-z0-9]+)\/?$/i.exec(url);
  if (!m) return null;
  const existing = await getRecord(session, 'app.bsky.feed.post', m[1]);
  return existing ? { uri: existing.uri, cid: existing.cid } : null;
}

// ─── Cover image (site.standard.document coverImage) ────────────────────────────
//
// Mirrors the web's OG image rule (src/lib/social.ts: first body image, or none) without
// re-implementing Astro rendering here. The publish script runs standalone via tsx, after
// `wrangler deploy` (see scripts/release.ts), so the simplest correct source is the already-
// rendered live page's own <meta property="og:image">.

/** Downscale/recompress to fit under the 1MB blob limit, mirroring
 *  scripts/import-grain-photos.ts's encodePhoto ladder. Returns null if it never fits. */
export async function encodeCoverUnder1MB(srcBytes: Buffer): Promise<Buffer | null> {
  const attempt = async (maxEdge?: number): Promise<Buffer | null> => {
    for (const quality of [90, 80, 70, 60]) {
      let pipeline = sharp(srcBytes).rotate().jpeg({ quality, mozjpeg: true });
      if (maxEdge) {
        pipeline = sharp(srcBytes).rotate()
          .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality, mozjpeg: true });
      }
      const out = await pipeline.toBuffer();
      if (out.length <= COVER_MAX_BLOB_BYTES) return out;
    }
    return null;
  };
  return (await attempt()) ?? (await attempt(2400)) ?? (await attempt(1800))
    ?? (await attempt(1400)) ?? (await attempt(1000));
}

/** Extract a <meta property="og:image" content="…"> (or reversed attribute order) URL from
 *  rendered HTML. */
export function extractOgImage(html: string): string | undefined {
  const re = /<meta\s+(?:property="og:image"\s+content="([^"]+)"|content="([^"]+)"\s+property="og:image")/i;
  const m = re.exec(html);
  return m?.[1] ?? m?.[2];
}

/** Read-only peek at a post's live page for its og:image URL (absolute), or undefined if the
 *  page isn't up yet or the post has no body image. Safe to call in --dry-run: no writes. */
export async function fetchOgImageUrl(entry: Entry): Promise<string | undefined> {
  const pageUrl = canonicalUrl(entry);
  try {
    const pageRes = await fetch(pageUrl);
    if (!pageRes.ok) {
      console.warn(`[coverImage] page fetch failed ${pageRes.status}: ${pageUrl}`);
      return undefined;
    }
    const ogImage = extractOgImage(await pageRes.text());
    return ogImage ? new URL(ogImage, pageUrl).toString() : undefined;
  } catch (err) {
    console.warn(`[coverImage] error fetching page for ${pageUrl}:`, err);
    return undefined;
  }
}

/** Fetch a post's og:image (the post's first body image, per the web's rule) and upload it as
 *  a Standard Site coverImage blob. Returns null — never throws — on any failure: no live
 *  page, no og:image (post has no body image), fetch/encode error. Performs a real PDS write
 *  (uploadBlob) — do not call this under --dry-run; use fetchOgImageUrl to preview instead. */
export async function resolveCoverImage(session: Session, entry: Entry): Promise<BlobRef | null> {
  const ogImageUrl = await fetchOgImageUrl(entry);
  if (!ogImageUrl) return null;
  try {
    const imgRes = await fetch(ogImageUrl);
    if (!imgRes.ok) {
      console.warn(`[coverImage] image fetch failed ${imgRes.status}: ${ogImageUrl}`);
      return null;
    }
    const srcBytes = Buffer.from(await imgRes.arrayBuffer());
    const encoded = await encodeCoverUnder1MB(srcBytes);
    if (!encoded) {
      console.warn(`[coverImage] could not encode under 1MB: ${ogImageUrl}`);
      return null;
    }
    return await uploadBlob(session, encoded, 'image/jpeg');
  } catch (err) {
    console.warn(`[coverImage] error resolving cover from ${ogImageUrl}:`, err);
    return null;
  }
}
