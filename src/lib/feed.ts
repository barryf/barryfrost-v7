import { getCollection } from 'astro:content';
import { yearMonth } from './dates';

export interface FeedItem {
  type: 'article' | 'weeknote' | 'bluesky' | 'checkin' | 'review';
  date: Date;
  url: string;
  title?: string;
  summary?: string;
  id: string;
  data: Record<string, unknown>;
}

export const PAGE_SIZE = 20;

export async function getUnifiedFeed(): Promise<FeedItem[]> {
  const [articles, weeknotes, blueskyPosts, checkinEntries, reviewEntries] = await Promise.all([
    getCollection('articles'),
    getCollection('weeknotes'),
    getCollection('blueskyPosts'),
    getCollection('checkins'),
    getCollection('reviews'),
  ]);

  const items: FeedItem[] = [];

  for (const entry of articles) {
    const { year, month } = yearMonth(entry.data.date);
    items.push({
      type: 'article',
      date: entry.data.date,
      url: `/${year}/${month}/${entry.id}`,
      title: entry.data.title,
      summary: entry.data.description,
      id: `article:${entry.id}`,
      data: entry.data as unknown as Record<string, unknown>,
    });
  }

  for (const entry of weeknotes) {
    items.push({
      type: 'weeknote',
      date: entry.data.date,
      url: `/weeknotes/${entry.id}`,
      title: entry.data.title,
      summary: entry.data.description,
      id: `weeknote:${entry.id}`,
      data: entry.data as unknown as Record<string, unknown>,
    });
  }

  for (const entry of blueskyPosts) {
    items.push({
      type: 'bluesky',
      date: new Date(entry.data.createdAt),
      url: `/app.bsky.feed.post/${entry.id}`,
      summary: entry.data.text.slice(0, 200),
      id: `bluesky:${entry.id}`,
      data: entry.data as unknown as Record<string, unknown>,
    });
  }

  for (const entry of checkinEntries) {
    items.push({
      type: 'checkin',
      date: new Date(entry.data.createdAt),
      url: `/app.beaconbits.beacon/${entry.id}`,
      title: entry.data.venueName,
      summary: entry.data.venueAddress,
      id: `checkin:${entry.id}`,
      data: entry.data as unknown as Record<string, unknown>,
    });
  }

  for (const entry of reviewEntries) {
    items.push({
      type: 'review',
      date: new Date(entry.data.createdAt),
      url: `/social.popfeed.feed.review/${entry.id}`,
      title: entry.data.title,
      summary: entry.data.text || `${entry.data.creativeWorkType} — ${entry.data.rating}/10`,
      id: `review:${entry.id}`,
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
