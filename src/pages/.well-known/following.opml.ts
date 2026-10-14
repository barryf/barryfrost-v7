// FollowSpec (https://followspec.org): the blogroll as an OPML 2.0 subscription list at
// /.well-known/following.opml. Feed URLs come from the `feed` field in
// src/data/blogroll.json (fill it with scripts/discover-blogroll-feeds.ts); entries
// without one are left out, since a subscription list outline needs an xmlUrl.
// Content-Type and CORS headers for the deployed file are set in public/_headers —
// the Response headers here only apply under `astro dev`.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { PROFILE } from '@/lib/profile';

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const GET: APIRoute = async () => {
  const blogs = (await getCollection('blogroll'))
    .map((b) => b.data)
    .sort((a, b) => a.name.localeCompare(b.name));

  const outlines = blogs.flatMap(({ name, url, feed }) => {
    if (!feed) {
      console.warn(`[following.opml] No feed for ${name} (${url}) — run scripts/discover-blogroll-feeds.ts`);
      return [];
    }
    // OPML uses type="rss" for any feed format, Atom and JSON Feed included.
    return [
      `    <outline type="rss" text="${xml(name)}" title="${xml(name)}" xmlUrl="${xml(feed)}" htmlUrl="${xml(url)}"/>`,
    ];
  });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${xml(PROFILE.name)}’s blogroll</title>
    <ownerName>${xml(PROFILE.name)}</ownerName>
    <ownerId>${xml(PROFILE.url)}</ownerId>
    <docs>https://opml.org/spec2.opml</docs>
  </head>
  <body>
${outlines.join('\n')}
  </body>
</opml>
`;

  return new Response(body, {
    headers: {
      'content-type': 'text/x-opml; charset=utf-8',
      'access-control-allow-origin': '*',
    },
  });
};
