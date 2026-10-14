// AboutSpec (https://aboutspec.org): the /about page's Markdown source, served verbatim at
// /.well-known/about.md. Its `summary` front matter is the spec's one-line bio; the other
// keys are the site's own and readers ignore them. Links and images stay site-relative, as
// in the spec's own example — readers resolve them against the site's URL. Keep the page
// plain Markdown (raw HTML is fine; MDX components are not) so it stays servable as-is.
// Content-Type and CORS headers for the deployed file are set in public/_headers —
// the Response headers here only apply under `astro dev`.
import type { APIRoute } from 'astro';
import { readFileSync } from 'node:fs';

export const GET: APIRoute = () =>
  new Response(readFileSync('src/content/pages/about.md', 'utf8'), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'access-control-allow-origin': '*',
    },
  });
