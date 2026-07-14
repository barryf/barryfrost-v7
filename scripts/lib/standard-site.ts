// Shared helpers for publishing articles/weeknotes as Standard.site documents.
//
// Reads local Markdown (the canonical source), turns each post into a
// `site.standard.document` record — embedding the full body as `at.markpub.markdown`
// content plus a plaintext `textContent`/`description` — and provides the AT Protocol
// write primitives used by the publish/backfill scripts. No third-party AT client:
// every record is hand-built JSON over com.atproto.repo.* XRPC.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname, relative } from 'path';
import {
  PUBLICATIONS,
  DID,
  DOCUMENT_COLLECTION,
  documentUri,
} from '../../src/lib/standard-site.js';

export { PUBLICATIONS, DID, DOCUMENT_COLLECTION, documentUri };

export const DESCRIPTION_MAX_CHARS = 280;
export const BSKY_MAX_GRAPHEMES = 300;

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

export function canonicalUrl(entry: Entry): string {
  return `${PUBLICATIONS[entry.collection].url}/${entry.slug}`;
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
  bskyPostRef?: StrongRef;
  updatedAt?: string;
}

export function buildDocumentRecord(entry: Entry, bskyPostRef?: StrongRef): DocumentRecord {
  const pub = PUBLICATIONS[entry.collection];
  const plaintext = toPlaintext(entry.body);
  const markdown = cleanMarkdown(entry.body);
  const record: DocumentRecord = {
    $type: 'site.standard.document',
    site: pub.uri,
    title: documentTitle(entry),
    path: `/${entry.slug}`,
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
  if (bskyPostRef) record.bskyPostRef = bskyPostRef;
  return record;
}

/** Fields that determine whether a re-put is needed (excludes bskyPostRef/updatedAt).
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
    external: { uri: string; title: string; description: string; thumb?: unknown };
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

export function buildBlueskyPost(entry: Entry, thumb?: unknown): BlueskyPost {
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
      },
    },
  };
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

/** Resolve a bsky.app post URL (…/profile/<handle-or-did>/post/<rkey>) to a strong ref. */
export async function resolveBskyPostRef(session: Session, url: string): Promise<StrongRef | null> {
  const m = /\/post\/([a-z0-9]+)\/?$/i.exec(url);
  if (!m) return null;
  const existing = await getRecord(session, 'app.bsky.feed.post', m[1]);
  return existing ? { uri: existing.uri, cid: existing.cid } : null;
}
