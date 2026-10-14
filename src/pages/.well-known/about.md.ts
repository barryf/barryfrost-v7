// AboutSpec (https://aboutspec.org): the /about page as Markdown at /.well-known/about.md.
// Content-Type and CORS headers for the deployed file are set in public/_headers —
// the Response headers here only apply under `astro dev`.
import type { APIRoute } from 'astro';
import { aboutMarkdown } from '@/lib/about-markdown';

export const GET: APIRoute = () =>
  new Response(aboutMarkdown(), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'access-control-allow-origin': '*',
    },
  });
