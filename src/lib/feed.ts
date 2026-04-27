import { getCollection } from 'astro:content';
import { yearMonth } from './dates';
import { DID } from './pds';


export interface FeedItem {
  type: 'article' | 'weeknote' | 'bluesky' | 'checkin' | 'film' | 'book' | 'photo';
  date: Date;
  url: string;
  title?: string;
  summary?: string;
  emoji?: string;
  id: string;
  data: Record<string, unknown>;
}

export const PAGE_SIZE = 20;

export async function getUnifiedFeed(): Promise<FeedItem[]> {
  const [articles, weeknotes, blueskyPosts, checkinEntries, filmEntries, bookEntries, photoEntries] = await Promise.all([
    getCollection('articles'),
    getCollection('weeknotes'),
    getCollection('blueskyPosts'),
    getCollection('checkins'),
    getCollection('films'),
    getCollection('books'),
    getCollection('photos'),
  ]);

  const items: FeedItem[] = [];

  for (const entry of articles.filter(e => e.data.visibility !== 'unlisted')) {
    items.push({
      type: 'article',
      date: entry.data.date,
      url: `/articles/${entry.id}`,
      title: entry.data.title,
      summary: entry.data.description,
      id: `article:${entry.id}`,
      data: entry.data as unknown as Record<string, unknown>,
    });
  }

  for (const entry of weeknotes.filter(e => e.data.visibility !== 'unlisted')) {
    items.push({
      type: 'weeknote',
      date: entry.data.date,
      url: `/weeknotes/${entry.id}`,
      title: entry.data.title,
      summary: entry.data.description,
      emoji: entry.data.emoji,
      id: `weeknote:${entry.id}`,
      data: entry.data as unknown as Record<string, unknown>,
    });
  }

  for (const entry of blueskyPosts) {
    items.push({
      type: 'bluesky',
      date: new Date(entry.data.createdAt),
      url: `https://bsky.app/profile/${DID}/post/${entry.id}`,
      summary: entry.data.text.slice(0, 200),
      id: `bluesky:${entry.id}`,
      data: entry.data as unknown as Record<string, unknown>,
    });
  }

  for (const entry of checkinEntries) {
    const data = entry.data;
    const url = data.latitude && data.longitude
      ? `https://www.openstreetmap.org/?mlat=${data.latitude}&mlon=${data.longitude}&zoom=17`
      : '';
    items.push({
      type: 'checkin',
      date: new Date(data.createdAt),
      url,
      title: data.venueName,
      summary: data.venueAddress,
      id: `checkin:${entry.id}`,
      data: data as unknown as Record<string, unknown>,
    });
  }

  for (const entry of filmEntries) {
    items.push({
      type: 'film',
      date: new Date(entry.data.createdAt),
      url: `https://popfeed.social/review/at:/${DID}/social.popfeed.feed.review/${entry.id}`,
      title: entry.data.title,
      summary: entry.data.text || `${entry.data.creativeWorkType} — ${entry.data.rating}/10`,
      id: `film:${entry.id}`,
      data: entry.data as unknown as Record<string, unknown>,
    });
  }

  for (const entry of bookEntries.filter(e => e.data.status === 'buzz.bookhive.defs#finished')) {
    const date = new Date(entry.data.finishedAt ?? entry.data.createdAt);
    items.push({
      type: 'book',
      date,
      url: `https://bookhive.buzz/books/${entry.data.hiveId}`,
      title: entry.data.title,
      summary: entry.data.authors,
      id: `book:${entry.id}`,
      data: entry.data as unknown as Record<string, unknown>,
    });
  }

  for (const entry of photoEntries) {
    items.push({
      type: 'photo',
      date: new Date(entry.data.createdAt),
      url: `https://grain.social/profile/${DID}/gallery/${entry.data.galleryRkey}`,
      title: entry.data.title,
      summary: entry.data.address,
      id: `photo:${entry.id}`,
      data: entry.data as unknown as Record<string, unknown>,
    });
  }

  items.sort((a, b) => b.date.getTime() - a.date.getTime());
  return items;
}

export function paginateItems<T>(items: T[], pageSize: number = PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  return Array.from({ length: pageCount }, (_, i) => ({
    page: i + 1,
    items: items.slice(i * pageSize, (i + 1) * pageSize),
    totalPages: pageCount,
  }));
}

export function filterByMonth(items: FeedItem[], year: string, month: string): FeedItem[] {
  return items.filter((item) => {
    const ym = yearMonth(item.date);
    return ym.year === year && ym.month === month;
  });
}

export function filterByTag(items: FeedItem[], tag: string): FeedItem[] {
  return items.filter((item) => {
    const tags = item.data.tags as string[] | undefined;
    return Array.isArray(tags) && tags.includes(tag);
  });
}

export function getTags(items: FeedItem[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const tags = item.data.tags as string[] | undefined;
    if (Array.isArray(tags)) {
      for (const tag of tags) seen.add(tag);
    }
  }
  return [...seen].sort();
}

export function getMonths(items: FeedItem[]): { year: string; month: string }[] {
  const seen = new Set<string>();
  const months: { year: string; month: string }[] = [];
  for (const item of items) {
    const ym = yearMonth(item.date);
    const key = `${ym.year}-${ym.month}`;
    if (!seen.has(key)) {
      seen.add(key);
      months.push(ym);
    }
  }
  return months;
}
