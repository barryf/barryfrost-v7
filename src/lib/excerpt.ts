/**
 * Plain-text excerpts from Markdown/MDX bodies, for in-page previews of posts other than
 * the one being rendered (the homepage's latest weeknote, the "Previously this week" list).
 * Strips inline markup, collapses whitespace, and truncates on a word boundary.
 *
 * These read the raw source, so an MDX body's ESM imports and JSX must be removed first or
 * they surface as prose. Social descriptions take the better path and read the *rendered*
 * body instead — see lib/social.ts.
 */

/** Drop the ESM import/export block and any JSX/HTML tags an MDX body carries. */
function stripMdx(body: string): string {
  return body
    .replace(/^\s*(?:import|export)\s[^\n]*$/gm, '')
    .replace(/<[^>]+>/g, '');
}

export function truncateBody(body: string, maxLen = 280): string {
  const text = stripMdx(body)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + '…' : text;
}

export function plainExcerpt(body: string, maxLen = 160): string {
  const text = stripMdx(body)
    .replace(/^#+\s+/gm, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen).replace(/\s\S*$/, '') + '…' : text;
}
