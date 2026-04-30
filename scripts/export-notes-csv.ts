/**
 * Export v6 note posts to a CSV for review before Bluesky import.
 *
 * Outputs scripts/notes-to-import.csv with columns:
 *   slug, published, status, length, content
 *
 * Status codes:
 *   N — skip (deleted, private, draft, already on Bluesky, or embeds a tweet URL)
 *   ? — needs manual review (has photo attachment, or text > 300 graphemes)
 *   Y — ready to import
 *
 * Usage:
 *   npx tsx scripts/export-notes-csv.ts
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const POSTS_DIR = join(process.cwd(), '../content/posts');
const OUT_FILE = join(process.cwd(), 'scripts/notes-to-import.csv');
const BSKY_MAX = 300;

interface MF2Post {
  'post-type': string[];
  properties: {
    published?: string[];
    content?: (string | { value?: string; html?: string })[];
    syndication?: string[];
    photo?: unknown[];
    deleted?: unknown[];
    'post-status'?: string[];
    visibility?: string[];
  };
}

function extractContent(raw: MF2Post['properties']['content']): string {
  if (!raw?.length) return '';
  const c = raw[0];
  if (typeof c === 'string') return c;
  return c?.value ?? c?.html ?? '';
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normaliseNewlines(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// Strip markdown link syntax [text](url) → text, so rendered length is accurate
function stripMarkdownLinks(s: string): string {
  return s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function graphemeCount(s: string): number {
  const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
  return [...seg.segment(s)].length;
}

function hasTweetEmbed(text: string): boolean {
  return /twitter\.com\/.+\/status\//.test(text);
}

function csvField(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}

function determineStatus(post: MF2Post, rendered: string): string {
  const p = post.properties;

  // Rule 1: deleted / private / draft
  if (p.deleted?.length) return 'N';
  if (p.visibility?.[0] === 'private') return 'N';
  if (p['post-status']?.[0] === 'draft') return 'N';

  // Rule 2: already on Bluesky
  const syn = p.syndication ?? [];
  if (syn.some((s) => s.includes('bsky.app') || s.includes('staging.bsky.app'))) return 'N';

  // Rule 3: embeds a tweet
  if (hasTweetEmbed(rendered)) return 'N';

  // Rule 4: has photo attachment
  if (p.photo?.length) return '?';

  // Rule 5: too long
  if (graphemeCount(rendered) > BSKY_MAX) return '?';

  return 'Y';
}

const years = readdirSync(POSTS_DIR).filter((d) => /^\d{4}$/.test(d)).sort();

const rows: string[] = [];
rows.push(['slug', 'published', 'status', 'length', 'content'].map(csvField).join(','));

let total = 0;
let countY = 0;
let countN = 0;
let countQ = 0;

for (const year of years) {
  const yearDir = join(POSTS_DIR, year);
  const months = readdirSync(yearDir).filter((d) => /^\d{2}$/.test(d)).sort();
  for (const month of months) {
    const monthDir = join(yearDir, month);
    const files = readdirSync(monthDir).filter((f) => f.endsWith('.json')).sort();
    for (const file of files) {
      const slug = `${year}/${month}/${file.replace(/\.json$/, '')}`;
      let post: MF2Post;
      try {
        post = JSON.parse(readFileSync(join(monthDir, file), 'utf-8')) as MF2Post;
      } catch {
        continue;
      }
      if (post['post-type']?.[0] !== 'note') continue;

      const rawContent = extractContent(post.properties.content);
      const decoded = decodeEntities(normaliseNewlines(rawContent));
      const rendered = stripMarkdownLinks(decoded);
      const len = graphemeCount(rendered);
      const status = determineStatus(post, rendered);
      const published = post.properties.published?.[0] ?? '';

      rows.push([slug, published, status, String(len), rawContent].map(csvField).join(','));
      total++;
      if (status === 'Y') countY++;
      else if (status === 'N') countN++;
      else countQ++;
    }
  }
}

writeFileSync(OUT_FILE, rows.join('\n') + '\n', 'utf-8');

console.log(`Written ${OUT_FILE}`);
console.log(`  ${total} notes total: ${countY} Y, ${countN} N, ${countQ} ?`);
