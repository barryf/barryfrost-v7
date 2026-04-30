/**
 * Import approved notes from CSV to PDS as Bluesky posts.
 *
 * Reads scripts/notes-to-import.csv (or --csv <path>) and creates
 * app.bsky.feed.post records for every row with status "Y",
 * preserving the original published timestamp as createdAt.
 *
 * Links and hashtags are wired up as richtext facets. @-mentions are
 * left as plain text since they target Twitter handles.
 *
 * Usage:
 *   npx tsx scripts/import-notes-bsky.ts [--dry-run] [--limit N] [--csv path]
 *
 * Env vars required (live mode):
 *   BSKY_HANDLE        e.g. barryfrost.com
 *   BSKY_APP_PASSWORD  an app password from bsky.app settings
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// ─── Config ───────────────────────────────────────────────────────────────────

const DEFAULT_CSV = join(process.cwd(), 'scripts/notes-to-import.csv');
const IMPORTED_FILE = join(process.cwd(), 'scripts/imported-notes-bsky.json');
const PDS_REGISTRY_HOST = 'bsky.social';
const WRITE_DELAY_MS = 250;
const BSKY_MAX = 300;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Facet {
  index: { byteStart: number; byteEnd: number };
  features: ({ $type: 'app.bsky.richtext.facet#link'; uri: string }
    | { $type: 'app.bsky.richtext.facet#tag'; tag: string })[];
}

interface ImportedMap {
  [slug: string]: { uri: string };
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function graphemeCount(s: string): number {
  const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
  return [...seg.segment(s)].length;
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCsv(raw: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  let headers: string[] = [];
  let i = 0;

  function parseField(): string {
    if (raw[i] === '"') {
      i++; // skip opening quote
      let val = '';
      while (i < raw.length) {
        if (raw[i] === '"') {
          if (raw[i + 1] === '"') {
            val += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          val += raw[i++];
        }
      }
      return val;
    }
    // unquoted field (shouldn't occur in our CSV but handle gracefully)
    let val = '';
    while (i < raw.length && raw[i] !== ',' && raw[i] !== '\n' && raw[i] !== '\r') {
      val += raw[i++];
    }
    return val;
  }

  function parseLine(): string[] | null {
    if (i >= raw.length) return null;
    const fields: string[] = [];
    while (true) {
      fields.push(parseField());
      if (i >= raw.length || raw[i] === '\n' || raw[i] === '\r') {
        if (raw[i] === '\r') i++;
        if (raw[i] === '\n') i++;
        break;
      }
      if (raw[i] === ',') i++;
    }
    return fields;
  }

  const h = parseLine();
  if (!h) return rows;
  headers = h;

  while (i < raw.length) {
    const fields = parseLine();
    if (!fields) break;
    if (fields.length === 1 && fields[0] === '') continue; // blank line
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = fields[j] ?? '';
    rows.push(row);
  }

  return rows;
}

// ─── Text rendering + facets ──────────────────────────────────────────────────

const encoder = new TextEncoder();

function byteOffset(text: string, charOffset: number): number {
  return encoder.encode(text.slice(0, charOffset)).length;
}

interface RenderedResult {
  text: string;
  facets: Facet[];
}

function renderText(raw: string): RenderedResult {
  const decoded = decodeEntities(raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));

  // Track claimed byte ranges to avoid double-faceting
  const claimed: [number, number][] = [];

  function claim(start: number, end: number): boolean {
    if (claimed.some(([s, e]) => start < e && end > s)) return false;
    claimed.push([start, end]);
    return true;
  }

  // Step 1: render markdown links [text](url) → text, collecting link facets.
  // Build the plain text first, then re-scan `decoded` to compute label positions
  // in the rendered string (each [text](url) shrinks by url + brackets chars).
  const text = decoded.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');

  const facets: Facet[] = [];

  const mdLinkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  mdLinkRe.lastIndex = 0;
  while ((m = mdLinkRe.exec(decoded)) !== null) {
    const label = m[1];
    const url = m[2];
    // preRendered is everything before this match, with its own md-links collapsed
    const preRendered = decoded.slice(0, m.index).replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
    const labelStart = preRendered.length;
    const labelEnd = labelStart + label.length;
    const byteStart = byteOffset(text, labelStart);
    const byteEnd = byteOffset(text, labelEnd);
    if (/^https?:\/\//.test(url) && claim(byteStart, byteEnd)) {
      facets.push({ index: { byteStart, byteEnd }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }] });
    }
  }

  // Step 2: bare URLs
  const urlRe = /https?:\/\/[^\s<>"')]+[^\s<>"').,!?;:]/g;
  urlRe.lastIndex = 0;
  while ((m = urlRe.exec(text)) !== null) {
    const url = m[0];
    const byteStart = byteOffset(text, m.index);
    const byteEnd = byteOffset(text, m.index + url.length);
    if (claim(byteStart, byteEnd)) {
      facets.push({ index: { byteStart, byteEnd }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }] });
    }
  }

  // Step 3: hashtags (skip if byte range already claimed)
  const tagRe = /(^|[\s\n])(#[\p{L}\p{N}_]+)/gv;
  tagRe.lastIndex = 0;
  while ((m = tagRe.exec(text)) !== null) {
    const prefix = m[1];
    const tag = m[2]; // includes #
    const tagCharStart = m.index + prefix.length;
    const tagCharEnd = tagCharStart + tag.length;
    const byteStart = byteOffset(text, tagCharStart);
    const byteEnd = byteOffset(text, tagCharEnd);
    if (claim(byteStart, byteEnd)) {
      facets.push({ index: { byteStart, byteEnd }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag: tag.slice(1) }] });
    }
  }

  facets.sort((a, b) => a.index.byteStart - b.index.byteStart);

  return { text, facets };
}

// ─── PDS ──────────────────────────────────────────────────────────────────────

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
  return await res.json() as Session;
}

// ─── TID generation ───────────────────────────────────────────────────────────
// AT Protocol TIDs are 13-char base32-sortable-encoded 64-bit values:
//   bits 63–10: microseconds since Unix epoch
//   bits  9–0:  clock ID (used to disambiguate posts at the same timestamp)
// Using historically-dated TIDs as rkeys places backfilled posts in the
// correct position on the Bluesky profile timeline.

const BASE32 = '234567abcdefghijklmnopqrstuvwxyz';
let _lastTidMicros = 0n;
let _clockId = 0;

function genTid(date: Date): string {
  let micros = BigInt(date.getTime()) * 1000n;
  if (micros <= _lastTidMicros) {
    // Same or earlier timestamp — reuse last micros and bump clock ID
    micros = _lastTidMicros;
    _clockId++;
    if (_clockId >= 1024) {
      micros++;
      _clockId = 0;
    }
  } else {
    _clockId = 0;
  }
  _lastTidMicros = micros;

  const tid = (micros << 10n) | BigInt(_clockId);
  let result = '';
  let n = tid;
  for (let i = 0; i < 13; i++) {
    result = BASE32[Number(n & 0x1fn)] + result;
    n >>= 5n;
  }
  return result;
}

// ─── PDS writes ───────────────────────────────────────────────────────────────

async function putRecord(
  pds: string,
  jwt: string,
  did: string,
  collection: string,
  rkey: string,
  record: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(`${pds}/xrpc/com.atproto.repo.putRecord`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo: did, collection, rkey, record }),
  });
  if (!res.ok) throw new Error(`putRecord(${collection}/${rkey}) failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { uri: string };
  return data.uri;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
  const csvIdx = args.indexOf('--csv');
  const csvPath = csvIdx >= 0 ? args[csvIdx + 1] : DEFAULT_CSV;

  const imported: ImportedMap = existsSync(IMPORTED_FILE)
    ? JSON.parse(readFileSync(IMPORTED_FILE, 'utf-8'))
    : {};

  let pds = '';
  let session: Session | null = null;
  if (!dryRun) {
    const env = { ...loadEnv(), ...process.env };
    const handle = env['BSKY_HANDLE'];
    const password = env['BSKY_APP_PASSWORD'];
    if (!handle || !password) {
      console.error('Error: BSKY_HANDLE and BSKY_APP_PASSWORD must be set');
      process.exit(1);
    }
    console.log(`Resolving PDS for ${handle}…`);
    pds = await resolvePds(handle);
    console.log(`PDS: ${pds}`);
    session = await createSession(pds, handle, password);
    console.log(`Authenticated as ${session.did}`);
  }

  const rows = parseCsv(readFileSync(csvPath, 'utf-8'));
  const eligible = rows.filter((r) => r['status'] === 'Y');
  console.log(`${rows.length} rows in CSV; ${eligible.length} with status Y`);

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of eligible) {
    if (processed >= limit) break;

    const slug = row['slug'];
    const published = row['published'];
    const content = row['content'];

    if (imported[slug]) {
      skipped++;
      continue;
    }

    const { text, facets } = renderText(content);

    if (graphemeCount(text) > BSKY_MAX) {
      console.warn(`  skip (too long after render, ${graphemeCount(text)} graphemes): ${slug}`);
      failed++;
      continue;
    }

    const rkey = genTid(new Date(published));

    if (dryRun) {
      console.log(`\n[dry-run] ${published} — ${slug} (rkey: ${rkey})`);
      console.log(`  text (${graphemeCount(text)}): ${text.slice(0, 120)}${text.length > 120 ? '…' : ''}`);
      if (facets.length) console.log(`  facets: ${JSON.stringify(facets)}`);
      processed++;
      continue;
    }

    const record: Record<string, unknown> = {
      $type: 'app.bsky.feed.post',
      text,
      createdAt: published,
      langs: ['en'],
    };
    if (facets.length) record['facets'] = facets;

    try {
      const uri = await putRecord(pds, session!.accessJwt, session!.did, 'app.bsky.feed.post', rkey, record);
      imported[slug] = { uri };
      writeFileSync(IMPORTED_FILE, JSON.stringify(imported, null, 2) + '\n', 'utf-8');
      console.log(`  ✓ ${published.slice(0, 10)} ${slug} → ${uri}`);
      processed++;
    } catch (err) {
      console.error(`  ✗ ${slug}: ${(err as Error).message}`);
      failed++;
    }

    await sleep(WRITE_DELAY_MS);
  }

  console.log(`\nDone. ${processed} imported, ${skipped} already imported, ${failed} failed/skipped.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
