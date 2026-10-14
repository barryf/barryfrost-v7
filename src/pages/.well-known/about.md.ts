// AboutSpec (https://aboutspec.org): the /about page's Markdown source, served verbatim at
// /.well-known/about.md. Its `summary` front matter is the spec's one-line bio; the other
// keys are the site's own and readers ignore them. Keep the page plain Markdown (raw HTML
// is fine; MDX components are not) so it stays servable as-is.
// Content-Type and CORS headers for the deployed file are set in public/_headers —
// the Response headers here only apply under `astro dev`.
import type { APIRoute } from 'astro';
import { readFileSync } from 'node:fs';

const SOURCE = 'src/content/pages/about.md';

export const GET: APIRoute = () => {
  const markdown = readFileSync(SOURCE, 'utf8');
  // Readers render the raw file on other origins, where a site-relative link or image
  // would resolve against the reader rather than barryfrost.com — so the page uses
  // absolute URLs throughout, and a relative one fails the build.
  const relative = markdown.match(/\]\(\/[^)]*\)|\b(?:src|href)="\/[^"]*"/);
  if (relative) {
    throw new Error(`${SOURCE} must use absolute URLs for /.well-known/about.md: ${relative[0]}`);
  }
  return new Response(markdown, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'access-control-allow-origin': '*',
    },
  });
};
