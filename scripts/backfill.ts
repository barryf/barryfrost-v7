/**
 * Backfill script: reads posts from local JSON files (MF2 h-entry format)
 * and writes them as Markdown files in the appropriate content directories.
 *
 * Usage: npx tsx scripts/backfill.ts
 *
 * Source: ../content/posts/YYYY/MM/slug.json
 * Output: src/content/articles/slug.md or src/content/weeknotes/NNN-title.md
 *
 * Only processes post-type "article". Weeknotes are identified by
 * "weeknotes" in the category array.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const POSTS_DIR = join(process.cwd(), '../content/posts');
const ARTICLES_DIR = join(process.cwd(), 'src/content/articles');
const WEEKNOTES_DIR = join(process.cwd(), 'src/content/weeknotes');
const REDIRECTS_FILE = join(process.cwd(), 'public/_redirects');

const WEEKNOTE_SLUG_PATTERN = /^week-(\d+)-(.+)$/;
const WEEKNOTE_OLD_SLUG_PATTERN = /^weeknotes-(\d+)$/;

interface MF2Post {
  type: string[];
  'post-type': string[];
  properties: {
    name?: string[];
    published?: string[];
    content?: string[];
    category?: string[];
    syndication?: string[];
    updated?: string[];
  };
}

function escapeYaml(str: string): string {
  if (/[:"#\[\]{}&*!|>%@`]/.test(str) || str.startsWith("'") || str.startsWith('"')) {
    return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return `"${str}"`;
}

function processPost(filePath: string, year: string, month: string, slug: string) {
  const raw = readFileSync(filePath, 'utf-8');
  const post: MF2Post = JSON.parse(raw);

  // Only process articles
  const postType = post['post-type']?.[0];
  if (postType !== 'article') return null;

  const props = post.properties;
  const title = props.name?.[0] ?? 'Untitled';
  const published = props.published?.[0] ?? '';
  const rawContent = props.content?.[0] ?? '';
  const content = typeof rawContent === 'string'
    ? rawContent
    : (rawContent as { value?: string; html?: string }).value
      ?? (rawContent as { html?: string }).html
      ?? '';
  const categories = props.category ?? [];
  const syndication = props.syndication ?? [];
  const date = published ? new Date(published).toISOString().split('T')[0] : `${year}-${month}-01`;

  const isWeeknote = categories.includes('weeknotes');
  const weekMatch = slug.match(WEEKNOTE_SLUG_PATTERN);
  const oldWeekMatch = slug.match(WEEKNOTE_OLD_SLUG_PATTERN);

  // Derive weeknote slug from old weeknotes-NNN format using the title
  // e.g. "Week 1: Starting" -> "1-starting"
  let oldWeekSlug: string | null = null;
  if (oldWeekMatch) {
    const weekNum = Number(oldWeekMatch[1]);
    const titleSlug = title
      .replace(/^Week \d+:\s*/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    oldWeekSlug = `${weekNum}-${titleSlug}`;
  }

  // Build frontmatter
  const lines = ['---'];
  lines.push(`title: ${escapeYaml(title)}`);
  lines.push(`date: ${date}`);

  if (isWeeknote && (weekMatch || oldWeekSlug)) {
    const weekNum = weekMatch ? Number(weekMatch[1]) : Number(oldWeekMatch![1]);
    lines.push(`week: ${weekNum}`);
  }

  if (syndication.length > 0) {
    lines.push('syndication:');
    for (const url of syndication) {
      lines.push(`  - ${url}`);
    }
  }

  lines.push('---');

  const frontmatter = lines.join('\n');

  if (isWeeknote && (weekMatch || oldWeekSlug)) {
    // Weeknote: write to weeknotes dir with NNN-title slug
    const weeknoteSlug = weekMatch ? `${weekMatch[1]}-${weekMatch[2]}` : oldWeekSlug!;
    const filename = `${weeknoteSlug}.md`;
    const outPath = join(WEEKNOTES_DIR, filename);
    writeFileSync(outPath, `${frontmatter}\n\n${content.trim()}\n`);

    // Return redirect info: old URL -> new URL
    return {
      type: 'weeknote' as const,
      filename,
      redirect: { from: `/${year}/${month}/${slug}`, to: `/weeknotes/${weeknoteSlug}` },
    };
  } else if (!isWeeknote) {
    // Article: write to articles dir
    const filename = `${slug}.md`;
    const outPath = join(ARTICLES_DIR, filename);
    writeFileSync(outPath, `${frontmatter}\n\n${content.trim()}\n`);

    return { type: 'article' as const, filename, redirect: null };
  }

  return null;
}

function main() {
  // Ensure output directories exist
  for (const dir of [ARTICLES_DIR, WEEKNOTES_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  let articleCount = 0;
  let weeknoteCount = 0;
  const redirectLines: string[] = ['# Weeknote redirects (old URL → new URL)'];

  // Walk year/month/slug.json
  const years = readdirSync(POSTS_DIR).filter((d: string) => /^\d{4}$/.test(d)).sort();

  for (const year of years) {
    const yearDir = join(POSTS_DIR, year);
    const months = readdirSync(yearDir).filter((d: string) => /^\d{2}$/.test(d)).sort();

    for (const month of months) {
      const monthDir = join(yearDir, month);
      const files = readdirSync(monthDir).filter((f: string) => f.endsWith('.json'));

      for (const file of files) {
        const slug = file.replace(/\.json$/, '');
        const filePath = join(monthDir, file);

        try {
          const result = processPost(filePath, year, month, slug);
          if (!result) continue;

          if (result.type === 'weeknote') {
            weeknoteCount++;
            console.log(`Weeknote: ${result.filename}`);
            if (result.redirect) {
              redirectLines.push(`${result.redirect.from} ${result.redirect.to} 301`);
            }
          } else {
            articleCount++;
            console.log(`Article: ${result.filename}`);
          }
        } catch (err) {
          console.error(`Error processing ${filePath}:`, err);
        }
      }
    }
  }

  // Write redirects
  const existingRedirects = existsSync(REDIRECTS_FILE)
    ? readFileSync(REDIRECTS_FILE, 'utf-8')
    : '';
  writeFileSync(REDIRECTS_FILE, existingRedirects + '\n' + redirectLines.join('\n') + '\n');

  console.log(`\nDone! ${articleCount} articles, ${weeknoteCount} weeknotes`);
  console.log(`${redirectLines.length - 1} redirect rules written to ${REDIRECTS_FILE}`);
}

main();
