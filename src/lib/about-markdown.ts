/**
 * Turns the /about page's MDX source into plain Markdown for aboutspec.org's
 * /.well-known/about.md, so the two can't drift apart.
 *
 * The page uses a handful of MDX-only constructs (imports, the <Image> portrait,
 * <Divider />, a raw <div><p> wrapper, and &nbsp; entities), each mapped to Markdown
 * here. Any other component left behind fails the build rather than leaking JSX into
 * about.md — add a mapping for it below.
 */

import { readFileSync } from 'node:fs';
import { PROFILE, SITE_URL } from '@/lib/profile';

const SOURCE = 'src/content/pages/about.mdx';

export function aboutMarkdown(): string {
  const raw = readFileSync(SOURCE, 'utf8');
  const body = raw
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/^import .*;\n/gm, '')
    .replace(/<Image\b[^>]*?\balt="([^"]*)"[^>]*\/>/g, `![$1](${PROFILE.photo})\n\n`)
    .replace(/<Divider\s*\/>/g, '')
    .replace(/<div><p>([\s\S]*?)<\/p><\/div>/g, '$1')
    .replace(/&nbsp;/g, '\u00a0')
    // Readers render this on other origins, so site-relative links must be absolute.
    .replace(/\]\(\//g, `](${SITE_URL}/`)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const leftover = body.match(/<\/?(?:[A-Z]\w*|div|p)\b[^>]*>/);
  if (leftover) {
    throw new Error(`about-markdown: unhandled MDX/HTML in ${SOURCE}: ${leftover[0]}`);
  }

  return `---\nsummary: ${JSON.stringify(PROFILE.summary)}\n---\n\n${body}\n`;
}
