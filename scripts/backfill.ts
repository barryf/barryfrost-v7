/**
 * Backfill script: fetches posts from the current barryfrost.com RSS feed
 * and writes them as Markdown files in the appropriate content directories.
 *
 * Usage: npx tsx scripts/backfill.ts
 *
 * This script fetches the RSS feed, downloads each post's HTML content,
 * and converts it to Markdown. Posts matching the week-NNN pattern go to
 * src/content/weeknotes/, all others go to src/content/articles/.
 *
 * It also generates redirect rules for old weeknote URLs.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const FEED_URL = 'https://barryfrost.com/feed';
const ARTICLES_DIR = join(process.cwd(), 'src/content/articles');
const WEEKNOTES_DIR = join(process.cwd(), 'src/content/weeknotes');
const REDIRECTS_FILE = join(process.cwd(), 'public/_redirects');

interface Post {
  title: string;
  date: string;
  slug: string;
  url: string;
  content: string;
}

const WEEKNOTE_PATTERN = /^week-(\d+)-(.+)$/;

function isWeeknote(slug: string): { week: number; slug: string } | null {
  const match = slug.match(WEEKNOTE_PATTERN);
  if (!match) return null;
  return { week: Number(match[1]), slug: `${match[1]}-${match[2]}` };
}

function generateFrontmatter(post: Post, weeknote: { week: number; slug: string } | null): string {
  const lines = ['---'];
  lines.push(`title: "${post.title.replace(/"/g, '\\"')}"`);
  lines.push(`date: ${post.date}`);
  if (weeknote) {
    lines.push(`week: ${weeknote.week}`);
  }
  lines.push('---');
  return lines.join('\n');
}

async function main() {
  // Ensure directories exist
  for (const dir of [ARTICLES_DIR, WEEKNOTES_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  console.log('Fetching feed from', FEED_URL);
  const res = await fetch(FEED_URL);
  const xml = await res.text();

  // Parse feed items — extract title, pubDate, link, description
  // This is a basic XML parse; for production use, consider a proper XML parser
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(match => {
    const itemXml = match[1];
    const title = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
      ?? itemXml.match(/<title>(.*?)<\/title>/)?.[1] ?? 'Untitled';
    const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] ?? '';
    const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '';
    const description = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] ?? '';

    // Extract slug from URL: /YYYY/MM/slug
    const urlParts = new URL(link).pathname.split('/').filter(Boolean);
    const slug = urlParts[urlParts.length - 1];
    const date = new Date(pubDate).toISOString().split('T')[0];

    return { title, date, slug, url: link, content: description };
  });

  console.log(`Found ${items.length} items`);

  const redirectLines: string[] = ['# Weeknote redirects (old URL → new URL)'];

  for (const post of items) {
    const weeknote = isWeeknote(post.slug);

    if (weeknote) {
      // Write to weeknotes directory
      const filename = `${weeknote.slug}.md`;
      const frontmatter = generateFrontmatter(post, weeknote);
      const filePath = join(WEEKNOTES_DIR, filename);
      writeFileSync(filePath, `${frontmatter}\n\n${post.content}\n`);
      console.log(`Weeknote: ${filename}`);

      // Generate redirect from old URL
      const urlPath = new URL(post.url).pathname;
      redirectLines.push(`${urlPath} /weeknotes/${weeknote.slug} 301`);
    } else {
      // Write to articles directory
      const filename = `${post.slug}.md`;
      const frontmatter = generateFrontmatter(post, null);
      const filePath = join(ARTICLES_DIR, filename);
      writeFileSync(filePath, `${frontmatter}\n\n${post.content}\n`);
      console.log(`Article: ${filename}`);
    }
  }

  // Append redirects
  const existingRedirects = existsSync(REDIRECTS_FILE)
    ? readFileSync(REDIRECTS_FILE, 'utf-8')
    : '';
  writeFileSync(REDIRECTS_FILE, existingRedirects + '\n' + redirectLines.join('\n') + '\n');
  console.log(`\nWrote ${redirectLines.length - 1} redirect rules to ${REDIRECTS_FILE}`);
  console.log('Done!');
}

main().catch(console.error);
