import { SECTIONS } from '@/lib/sections';

/**
 * The trace sections, listed as a directory on the homepage.
 * `slug` keys the shared `SectionIcon` component.
 */
export interface NavItem {
  href: string;
  label: string;
  /** Icon key for SectionIcon. */
  slug?: string;
  /** One-line description for the homepage directory. */
  description?: string;
}

export const STREAM_SECTIONS: NavItem[] = [
  { href: '/stream', label: 'Stream' },
  { href: '/posts', label: 'Posts', slug: 'posts', description: SECTIONS.posts.description },
  { href: '/photos', label: 'Photos', slug: 'photos', description: SECTIONS.photos.description },
  { href: '/check-ins', label: 'Check-ins', slug: 'check-ins', description: SECTIONS['check-ins'].description },
  { href: '/books', label: 'Books', slug: 'books', description: SECTIONS.books.description },
  { href: '/films', label: 'Films', slug: 'films', description: SECTIONS.films.description },
  { href: '/music', label: 'Music', slug: 'music', description: 'Album and artist charts, and recently played tracks I’ve scrobbled to Rocksky.' },
  { href: '/blogroll', label: 'Blogroll', slug: 'blogroll', description: 'The blogs and publications I read and subscribe to.' },
];

/**
 * Is `href` the page we're on? Exact match only — no section membership — except that
 * a paginated listing (`/books/2`) counts as its own first page.
 */
export function isCurrentPage(path: string, href: string): boolean {
  if (path === href) return true;
  return path.startsWith(`${href}/`) && /^\d+$/.test(path.slice(href.length + 1));
}
