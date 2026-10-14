// Fills in the `feed` URL for each entry in src/data/blogroll.json by reading the
// site's <link rel="alternate"> feed autodiscovery tags. The feed URLs feed
// /.well-known/following.opml (FollowSpec). Entries that already have a `feed` are
// left alone, so hand-corrected URLs survive a re-run.
//
//   npx tsx scripts/discover-blogroll-feeds.ts           # fill missing feeds
//   npx tsx scripts/discover-blogroll-feeds.ts --force   # rediscover every feed
//
// Review the diff before committing: a site may advertise several feeds, and the
// first RSS/Atom one isn't always the one you read.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'src/data/blogroll.json';
const FEED_TYPES = ['application/rss+xml', 'application/atom+xml', 'application/feed+json'];

interface Blog {
  name: string;
  url: string;
  avatar?: string;
  feed?: string;
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

async function discover(siteUrl: string): Promise<string | undefined> {
  const res = await fetch(siteUrl, { headers: { 'User-Agent': 'barryfrost.com feed discovery' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const links = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(([tag]) => tag)
    .filter((tag) => (attr(tag, 'rel') ?? '').toLowerCase().split(/\s+/).includes('alternate'))
    .filter((tag) => FEED_TYPES.includes((attr(tag, 'type') ?? '').toLowerCase()))
    .filter((tag) => attr(tag, 'href'));
  // Prefer RSS/Atom over JSON Feed — OPML readers handle XML feeds universally.
  links.sort((a, b) => FEED_TYPES.indexOf(attr(a, 'type')!.toLowerCase()) - FEED_TYPES.indexOf(attr(b, 'type')!.toLowerCase()));
  const href = links[0] && attr(links[0], 'href');
  return href ? new URL(href.replace(/&amp;/g, '&'), res.url).href : undefined;
}

const force = process.argv.includes('--force');
const blogs = JSON.parse(readFileSync(FILE, 'utf8')) as Blog[];

for (const blog of blogs) {
  if (blog.feed && !force) continue;
  try {
    const feed = await discover(blog.url);
    if (feed) {
      blog.feed = feed;
      console.log(`✓ ${blog.name}: ${feed}`);
    } else {
      console.warn(`✗ ${blog.name}: no feed advertised at ${blog.url}`);
    }
  } catch (err) {
    console.warn(`✗ ${blog.name}: ${(err as Error).message}`);
  }
}

writeFileSync(FILE, JSON.stringify(blogs, null, 2) + '\n');
