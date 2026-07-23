import { getCollection } from 'astro:content';
import { DID, HANDLE, pdslsUrl } from '@/lib/pds';
import { weeknoteUrl } from '@/lib/urls';
import { plainExcerpt } from '@/lib/excerpt';

export type TimelineType =
  | 'article'
  | 'weeknote'
  | 'post'
  | 'checkin'
  | 'film'
  | 'book'
  | 'photo'
  | 'subscription';

export interface TimelineItem {
  type: TimelineType;
  /** Human label for the item's kind, e.g. "Article", "Post", "Check-in". */
  typeLabel: string;
  /** Non-link text shown before the title (e.g. a weeknote emoji, "Replied"). */
  titlePrefix?: string;
  /** Always non-empty; posts use a truncated text lead in place of a title. */
  title: string;
  /** Secondary detail line, plain text. */
  summary?: string;
  /** Rating out of 10, when the item has one — rendered as stars on the page. */
  rating?: number;
  /** Canonical link — absolute. Local paths are absolutised against `site`. */
  url: string;
  /** Whether the canonical copy lives on this site (no rel=noopener needed). */
  local: boolean;
  date: Date;
  /** Stable feed id (= url). */
  id: string;
}

/** How many items the unified timeline shows / feeds carry. */
const LIMIT = 50;

/** Truncate plain text (e.g. a Bluesky post) on a word boundary. */
function truncateText(text: string, maxLen = 140): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > maxLen
    ? collapsed.slice(0, maxLen).replace(/\s\S*$/, '') + '…'
    : collapsed;
}

function toStars(rating: number): string {
  const stars = rating / 2;
  const full = Math.floor(stars);
  const half = stars % 1 >= 0.5;
  return '★'.repeat(full) + (half ? '½' : '');
}

/**
 * Build the unified activity log: the most recent items across every content
 * collection except music, interleaved by date, newest first, capped at 50.
 * Each item summarises its source and links to the canonical copy — articles and
 * weeknotes on this site, everything else on its source platform.
 *
 * Data-only (no component rendering) so both the page and the RSS/JSON endpoints
 * can share it.
 */
export async function getTimelineItems(site: URL): Promise<TimelineItem[]> {
  const [
    articles,
    weeknotes,
    posts,
    checkIns,
    films,
    books,
    photos,
    subscriptions,
  ] = await Promise.all([
    getCollection('articles'),
    getCollection('weeknotes'),
    getCollection('blueskyPosts'),
    getCollection('check-ins'),
    getCollection('films'),
    getCollection('books'),
    getCollection('photos'),
    getCollection('standardSubscriptions'),
  ]);

  const absolute = (path: string) => new URL(path, site).href;

  const items: TimelineItem[] = [];

  for (const entry of articles) {
    if (entry.data.visibility === 'unlisted') continue;
    const url = absolute(`/articles/${entry.id}`);
    items.push({
      type: 'article',
      typeLabel: 'Article',
      title: entry.data.title,
      summary: entry.data.description ?? plainExcerpt(entry.body ?? ''),
      url,
      local: true,
      date: entry.data.date,
      id: url,
    });
  }

  for (const entry of weeknotes) {
    if (entry.data.visibility === 'unlisted') continue;
    const url = absolute(weeknoteUrl(entry.id));
    items.push({
      type: 'weeknote',
      typeLabel: 'Weeknote',
      titlePrefix: entry.data.emoji ? `${entry.data.emoji} ` : undefined,
      title: entry.data.title,
      summary: entry.data.description ?? plainExcerpt(entry.body ?? ''),
      url,
      local: true,
      date: entry.data.date,
      id: url,
    });
  }

  for (const entry of posts) {
    const url = `https://bsky.app/profile/${HANDLE}/post/${entry.id}`;
    items.push({
      type: 'post',
      typeLabel: 'Post',
      titlePrefix: entry.data.reply ? 'Replied ' : undefined,
      title: truncateText(entry.data.text) || 'Post',
      url,
      local: false,
      date: new Date(entry.data.createdAt),
      id: url,
    });
  }

  for (const entry of checkIns) {
    const { data } = entry;
    const mapUrl = data.latitude && data.longitude
      ? `https://www.openstreetmap.org/?mlat=${data.latitude}&mlon=${data.longitude}&zoom=17`
      : undefined;
    const url = data.sourceUrl ?? mapUrl ?? (data.uri ? pdslsUrl(data.uri) : absolute('/check-ins'));
    const place = [data.venueLocality, data.venueRegion].filter(Boolean).join(', ');
    items.push({
      type: 'checkin',
      typeLabel: 'Check-in',
      titlePrefix: 'Checked in at',
      title: data.venueName,
      summary: data.comment || place || undefined,
      url,
      local: false,
      date: new Date(data.createdAt),
      id: url,
    });
  }

  for (const entry of films) {
    const { data } = entry;
    const url = `https://popfeed.social/review/at:/${DID}/social.popfeed.feed.review/${entry.id}`;
    items.push({
      type: 'film',
      typeLabel: 'Film',
      titlePrefix: 'Watched',
      title: data.title,
      summary: data.rating !== undefined ? toStars(data.rating) : undefined,
      rating: data.rating,
      url,
      local: false,
      date: new Date(data.createdAt),
      id: url,
    });
  }

  for (const entry of books) {
    const { data } = entry;
    const url = data.hiveId
      ? `https://bookhive.buzz/books/${data.hiveId}`
      : pdslsUrl(data.uri);
    const isReading = data.status === 'buzz.bookhive.defs#reading';
    items.push({
      type: 'book',
      typeLabel: 'Book',
      titlePrefix: isReading ? 'Started' : 'Finished',
      title: data.title,
      summary: `by ${data.authors}`,
      url,
      local: false,
      date: new Date(data.createdAt),
      id: url,
    });
  }

  for (const entry of photos) {
    const { data } = entry;
    const url = `https://grain.social/profile/${DID}/gallery/${data.galleryRkey}`;
    items.push({
      type: 'photo',
      typeLabel: 'Photos',
      title: data.title,
      summary: `${data.photoCount} ${data.photoCount === 1 ? 'photo' : 'photos'}`,
      url,
      local: false,
      date: new Date(data.createdAt),
      id: url,
    });
  }

  for (const entry of subscriptions) {
    const { data } = entry;
    // No usable date → can't be timeline-ordered; skip rather than break the build.
    if (!data.createdAt) continue;
    items.push({
      type: 'subscription',
      typeLabel: 'Subscription',
      titlePrefix: 'Subscribed to ',
      title: data.name,
      summary: data.description || undefined,
      url: data.siteUrl,
      local: false,
      date: new Date(data.createdAt),
      id: data.siteUrl,
    });
  }

  return items
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, LIMIT);
}
