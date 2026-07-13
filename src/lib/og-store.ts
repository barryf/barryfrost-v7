/**
 * og-store.ts
 *
 * Build-time social-card materialiser, mirroring image-store.ts. A card is a
 * pure function of its inputs + the template version, so it is content-addressed
 * and stored in R2 under og/{hash}.png — cron redeploys re-render nothing unless
 * a card's content changes.
 *
 *   Prod + R2 configured → HEAD the key; reuse if present, else render + upload.
 *   Dev / no creds        → return the local endpoint path (rendered on request
 *                           by src/pages/og/**), so previews and credential-less
 *                           PR builds still work.
 *
 * Bump OG_TEMPLATE_VERSION to invalidate every card after a design change.
 */

import { createHash } from 'node:crypto';
import type { CollectionEntry } from 'astro:content';
import {
  IMAGES_BASE_URL, IS_PROD, R2_CONFIGURED,
  getAwsClient, r2Exists, r2Put, acquireSlot, releaseSlot,
} from '@/lib/r2';
import { formatDate } from '@/lib/dates';
import { renderCard } from '@/lib/og/render';
import { weeknoteCard, articleCard, defaultCard } from '@/lib/og/cards';

const OG_TEMPLATE_VERSION = 'v1';

export const OG_TAGLINE = 'Personal website of Barry Frost';

export type CardData =
  | { kind: 'weeknote'; emoji?: string; title: string; date: string }
  | { kind: 'article'; title: string; section?: string; date: string }
  | { kind: 'default' };

function buildNode(data: CardData) {
  switch (data.kind) {
    case 'weeknote': return weeknoteCard(data);
    case 'article':  return articleCard(data);
    case 'default':  return defaultCard({ tagline: OG_TAGLINE });
  }
}

/** Render a card to a PNG buffer (used by the endpoints and the materialiser). */
export function ogCardBuffer(data: CardData): Promise<Buffer> {
  return renderCard(buildNode(data));
}

// Entry → CardData, shared by the page (which hashes it) and the endpoint (which
// renders it) so the two can never drift.
export function weeknoteCardData(entry: CollectionEntry<'weeknotes'>): CardData {
  return { kind: 'weeknote', emoji: entry.data.emoji, title: entry.data.title, date: formatDate(entry.data.date) };
}

export function articleCardData(entry: CollectionEntry<'articles'>): CardData {
  return { kind: 'article', title: entry.data.title, date: formatDate(entry.data.date) };
}

function cardKey(data: CardData): string {
  const hash = createHash('sha256').update(OG_TEMPLATE_VERSION + JSON.stringify(data)).digest('hex').slice(0, 16);
  return `og/${hash}.png`;
}

async function materialise(key: string, data: CardData, localPath: string): Promise<string> {
  await acquireSlot();
  try {
    const aws = await getAwsClient();
    if (await r2Exists(aws, key)) return `${IMAGES_BASE_URL}/${key}`;
    const png = await ogCardBuffer(data);
    await r2Put(aws, key, png, 'image/png');
    return `${IMAGES_BASE_URL}/${key}`;
  } catch (err) {
    console.warn(`[og-store] materialise error for ${key}, falling back to ${localPath}:`, err);
    return localPath;
  } finally {
    releaseSlot();
  }
}

// Dedupe identical cards across pages (notably the default card, rendered on
// every non-article/weeknote page) to a single HEAD/PUT per build.
const cache = new Map<string, Promise<string>>();

/**
 * Return the URL for a card's image. `localPath` is the dev/no-creds fallback
 * served by the local endpoint (e.g. `/og/weeknotes/{slug}.png`).
 */
export function ogCardUrl(data: CardData, localPath: string): Promise<string> {
  if (!IS_PROD || !R2_CONFIGURED) return Promise.resolve(localPath);
  const key = cardKey(data);
  let p = cache.get(key);
  if (!p) { p = materialise(key, data, localPath); cache.set(key, p); }
  return p;
}
