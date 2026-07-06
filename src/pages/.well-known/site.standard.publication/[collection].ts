// Standard.site publication verification endpoints:
//   /.well-known/site.standard.publication/articles
//   /.well-known/site.standard.publication/weeknotes
// Each returns the publication's at:// URI as plain text, generated from the single
// PUBLICATIONS config so there's nothing to keep in sync by hand. Empty until the
// publication records are created and their URIs pasted into src/lib/standard-site.ts.
import type { APIRoute, GetStaticPaths } from 'astro';
import { PUBLICATIONS } from '@/lib/standard-site';

type Key = keyof typeof PUBLICATIONS;

export const getStaticPaths: GetStaticPaths = () =>
  (Object.keys(PUBLICATIONS) as Key[]).map((collection) => ({ params: { collection } }));

export const GET: APIRoute = ({ params }) => {
  const pub = PUBLICATIONS[params.collection as Key];
  return new Response(pub?.uri ?? '', {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
