import { cleanPathname } from '@/lib/url';
import { SECTIONS } from '@/lib/sections';

/**
 * Section sub-navs. Two groups of pages each get a right-aligned sub-nav shown on every
 * member page, so the sections cut from the global header stay one-click reachable.
 *
 * - `stream` — the activity/trace sections (icons, reusing content-type logos)
 * - `about` — the me-pages (text only, no service logos)
 *
 * The first entry of each group is the parent hub itself, bolded when active.
 * `slug` (Stream children only) keys the shared `SectionIcon` component.
 */
export interface NavItem {
  href: string;
  label: string;
  /** Icon key for SectionIcon; Stream children only. */
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

export const ABOUT_SECTIONS: NavItem[] = [
  { href: '/about', label: 'About' },
  { href: '/work', label: 'Work' },
  { href: '/uses', label: 'Uses' },
  { href: '/colophon', label: 'Colophon' },
  { href: '/travelblog', label: 'Travelblog' },
  { href: '/follow', label: 'Follow' },
  { href: '/contact', label: 'Contact' },
];

export type SectionGroup = 'stream' | 'about';

const GROUPS: Record<SectionGroup, NavItem[]> = {
  stream: STREAM_SECTIONS,
  about: ABOUT_SECTIONS,
};

/** The hub landing page for each group — the first entry, and the top-nav link. */
export const SECTION_HUB: Record<SectionGroup, string> = {
  stream: '/stream',
  about: '/about',
};

/** Sub-nav items for a group: the children, excluding the hub itself. */
export function sectionNavItems(group: SectionGroup): NavItem[] {
  return GROUPS[group].filter(item => item.href !== SECTION_HUB[group]);
}

/** Match by base-path prefix so children like /books/2 and /films/by-rating still resolve. */
function inGroup(path: string, items: NavItem[]): boolean {
  return items.some(({ href }) => path === href || path.startsWith(`${href}/`));
}

/** Which sub-nav (if any) a page belongs to. Pass a cleaned pathname. */
export function sectionGroupFor(pathname: string): SectionGroup | null {
  const path = cleanPathname(pathname);
  for (const group of Object.keys(GROUPS) as SectionGroup[]) {
    if (inGroup(path, GROUPS[group])) return group;
  }
  return null;
}

/** Is `href` the active section for the current `path` (base-path prefix match)? */
export function isActiveSection(path: string, href: string): boolean {
  return path === href || path.startsWith(`${href}/`);
}
