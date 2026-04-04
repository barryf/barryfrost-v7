# barryfrost.com v7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a statically-generated personal website that merges local Markdown content with atproto PDS records into a unified, IndieWeb-friendly site with Microformats 2 markup.

**Architecture:** Astro 6 static site with two content sources — local Markdown (articles, weeknotes, slash pages) and atproto PDS records (Bluesky posts, checkins, reviews) fetched at build time via custom content loaders. All content merges into a unified chronological feed with paginated list pages. Deployed to Cloudflare Workers via GitHub Actions.

**Tech Stack:** Astro 6.1, Tailwind CSS 4, TypeScript, @astrojs/cloudflare adapter, GitHub Actions, Wrangler

**Spec:** `docs/superpowers/specs/2026-03-29-barryfrost-v7-design.md`

---

## File Structure

```
astro.config.mjs                    — Astro config: Cloudflare adapter, Tailwind, image remotePatterns, redirects
package.json                        — Dependencies and scripts
tsconfig.json                       — TypeScript config extending Astro's strictest preset
wrangler.jsonc                      — Cloudflare Workers deployment config
src/
  content.config.ts                 — All 8 content collections: articles, weeknotes, pages + 5 PDS loaders
  content/
    articles/                       — Markdown article files (backfilled + new); support categories + visibility frontmatter
    weeknotes/                      — Markdown weeknote files (backfilled + new); support emoji + categories + visibility frontmatter
    pages/                          — Markdown slash pages (about, colophon, etc.)
  lib/
    pds.ts                          — AT Protocol XRPC fetch helper with cursor pagination
    loaders/
      bluesky.ts                    — Custom loader for app.bsky.feed.post (filters Week N posts; resolves reply handles)
      checkins.ts                   — Custom loader for app.beaconbits.beacon
      reviews.ts                    — Custom loader for social.popfeed.feed.review
      documents.ts                  — Custom loader for site.standard.document
      books.ts                      — Custom loader for buzz.bookhive.book
    feed.ts                         — Unified feed: merge, normalise, sort, filter, paginate; filterByCategory, getCategories helpers
    richtext.ts                     — Bluesky facets → HTML converter (links styled with underline class)
    dates.ts                        — Date formatting helpers
    weeknotes.ts                    — plainExcerpt(), weeknoteLabel() helpers for weeknote detail pages
  components/
    BaseHead.astro                  — <head>: meta, OG tags, fonts, CSS
    Header.astro                    — Site header with nav
    Footer.astro                    — Site footer with h-card
    Pagination.astro                — 5-page window pagination with prev/next
    FeedEntry.astro                 — Dispatcher: renders the right card by post type
    posts/
      ArticleCard.astro             — Article list item (h-entry)
      WeeknoteCard.astro            — Weeknote list item (h-entry); shows emoji prefix
      BlueskyCard.astro             — Bluesky post list item (h-entry); shows reply context
      CheckinCard.astro             — Checkin list item (h-entry)
      ReviewCard.astro              — Review list item (h-entry); star rating display; retina poster image
      BookCard.astro                — Book list item (h-entry); retina cover image + bookhive link
    embeds/                         — (removed; no Bluesky detail pages)
  layouts/
    Base.astro                      — HTML shell: doctype, head, body, dark mode
    Post.astro                      — Single post wrapper with h-entry markup; emoji, categories (linked to /categories/), syndication, named nav slot
    Feed.astro                      — List page wrapper with h-feed markup
  pages/
    index.astro                     — Homepage: header + feed page 1
    page/[page].astro               — Feed pages 2+
    [...slug].astro                 — Slash pages (/about, /colophon)
    [year]/[month]/index.astro      — Monthly archive
    [year]/[month]/[slug].astro     — Article detail pages (passes categories to Post layout)
    weeknotes/
      index.astro                   — Weeknotes list page 1
      page/[page].astro             — Weeknotes list pages 2+
      [slug].astro                  — Weeknote detail page (prev/next nav + "on this day" section)
    app.bsky.feed.post/
      index.astro                   — Bluesky list page 1
      page/[page].astro             — Bluesky list pages 2+
    app.beaconbits.beacon/
      index.astro                   — Checkins list page 1
      page/[page].astro             — Checkins list pages 2+
    social.popfeed.feed.review/
      index.astro                   — Reviews list page 1
      page/[page].astro             — Reviews list pages 2+
    categories/[category]/
      index.astro                   — Category feed page 1 (e.g. /categories/holiday)
      page/[page].astro             — Category feed pages 2+
    feed.xml.ts                     — RSS feed: articles + weeknotes only
  styles/
    global.css                      — Tailwind directives + prose customisation
  assets/                           — Favicon, local images
public/
  _redirects                        — Cloudflare redirects for legacy URLs → archive.barryfrost.com
.github/
  workflows/
    deploy.yml                      — Build + deploy to Cloudflare Workers
    poll-pds.yml                    — Poll PDS every 15 mins, trigger rebuild
  last-seen-cids.json               — Cached CIDs for PDS polling
scripts/
  backfill.ts                       — One-time migration script for existing articles
```

---

## Task 1: Scaffold Astro Project

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `wrangler.jsonc`, `src/styles/global.css`

- [ ] **Step 1: Initialise the project**

```bash
cd /Users/barryf/Code/barryfrost-v7
npm create astro@latest . -- --template minimal --no-install --no-git --typescript strictest
```

Accept defaults. This creates the minimal Astro skeleton.

- [ ] **Step 2: Install dependencies**

```bash
npm install @astrojs/cloudflare @tailwindcss/vite tailwindcss
```

- [ ] **Step 3: Configure Astro**

Replace `astro.config.mjs` with:

```javascript
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://barryfrost.com',
  output: 'static',
  adapter: cloudflare(),
  vite: {
    plugins: [tailwindcss()],
  },
  image: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.bsky.app' },
      { protocol: 'https', hostname: 'image.tmdb.org' },
    ],
  },
});
```

- [ ] **Step 4: Create global CSS**

Create `src/styles/global.css`:

```css
@import 'tailwindcss';
```

- [ ] **Step 5: Create Wrangler config**

Create `wrangler.jsonc`:

```jsonc
{
  "name": "barryfrost-v7",
  "compatibility_date": "2026-03-29",
  "assets": {
    "directory": "./dist"
  }
}
```

- [ ] **Step 6: Create a minimal homepage to verify the build**

Replace `src/pages/index.astro` with:

```astro
---
import '../styles/global.css';
---
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Barry Frost</title>
  </head>
  <body class="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
    <h1 class="text-2xl font-bold p-8">Barry Frost</h1>
  </body>
</html>
```

- [ ] **Step 7: Verify the build works**

```bash
npm run dev
```

Expected: Dev server starts, page renders with "Barry Frost" heading. Light/dark mode responds to system preference.

- [ ] **Step 8: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffold Astro 6 project with Tailwind and Cloudflare adapter"
```

---

## Task 2: Base Layouts and Components

**Files:**
- Create: `src/layouts/Base.astro`, `src/components/BaseHead.astro`, `src/components/Header.astro`, `src/components/Footer.astro`
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Create BaseHead component**

Create `src/components/BaseHead.astro`:

```astro
---
interface Props {
  title: string;
  description?: string;
}

const { title, description = 'Personal website of Barry Frost' } = Astro.props;
const canonicalURL = new URL(Astro.url.pathname, Astro.site);
---
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="canonical" href={canonicalURL} />
<meta name="generator" content={Astro.generator} />
<title>{title}</title>
<meta name="description" content={description} />
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:url" content={canonicalURL} />
<meta property="og:type" content="website" />
```

- [ ] **Step 2: Create Header component**

Create `src/components/Header.astro`:

```astro
---
const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/weeknotes/', label: 'Weeknotes' },
  { href: '/app.bsky.feed.post/', label: 'Posts' },
  { href: '/app.beaconbits.beacon/', label: 'Checkins' },
  { href: '/social.popfeed.feed.review/', label: 'Reviews' },
  { href: '/about', label: 'About' },
];
---
<header class="max-w-2xl mx-auto px-4 py-6">
  <nav class="flex flex-wrap items-center gap-x-6 gap-y-2">
    <a href="/" class="text-lg font-bold">Barry Frost</a>
    {navLinks.slice(1).map(link => (
      <a href={link.href} class="text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100">
        {link.label}
      </a>
    ))}
  </nav>
</header>
```

- [ ] **Step 3: Create Footer component**

Create `src/components/Footer.astro`:

```astro
<footer class="max-w-2xl mx-auto px-4 py-8 mt-12 border-t border-neutral-200 dark:border-neutral-800">
  <div class="h-card text-sm text-neutral-500 dark:text-neutral-400">
    <p>
      <a class="p-name u-url" href="https://barryfrost.com" rel="me">Barry Frost</a>
      · <span class="p-locality">Hertfordshire</span>, <span class="p-country-name">UK</span>
    </p>
  </div>
</footer>
```

- [ ] **Step 4: Create Base layout**

Create `src/layouts/Base.astro`:

```astro
---
import BaseHead from '../components/BaseHead.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import '../styles/global.css';

interface Props {
  title: string;
  description?: string;
}

const { title, description } = Astro.props;
---
<html lang="en-GB">
  <head>
    <BaseHead title={title} description={description} />
  </head>
  <body class="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 antialiased">
    <Header />
    <main class="max-w-2xl mx-auto px-4">
      <slot />
    </main>
    <Footer />
  </body>
</html>
```

- [ ] **Step 5: Update homepage to use Base layout**

Replace `src/pages/index.astro` with:

```astro
---
import Base from '../layouts/Base.astro';
---
<Base title="Barry Frost">
  <p class="text-lg mb-8">Software engineer based in Hertfordshire, UK. Building web things.</p>
</Base>
```

- [ ] **Step 6: Verify layout renders**

```bash
npm run dev
```

Expected: Page renders with header nav, intro text, footer with h-card. Check dark mode works.

- [ ] **Step 7: Commit**

```bash
git add src/layouts/ src/components/ src/pages/index.astro
git commit -m "feat: add base layout with header, footer and navigation"
```

---

## Task 3: Local Content Collections (Articles, Weeknotes, Slash Pages)

**Files:**
- Create: `src/content.config.ts`, `src/content/articles/2026-03-example-article.md`, `src/content/weeknotes/239-scoot.md`, `src/content/pages/about.md`

- [ ] **Step 1: Create content config with local collections**

Create `src/content.config.ts`:

```typescript
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: 'src/content/articles' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
  }),
});

const weeknotes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: 'src/content/weeknotes' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    week: z.number(),
    description: z.string().optional(),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: 'src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

export const collections = { articles, weeknotes, pages };
```

- [ ] **Step 2: Create sample article**

Create `src/content/articles/2026-03-example-article.md`:

```markdown
---
title: An Example Article
date: 2026-03-15
description: A sample article to test the build.
---

This is a sample article to verify the content collection works.
```

- [ ] **Step 3: Create sample weeknote**

Create `src/content/weeknotes/239-scoot.md`:

```markdown
---
title: "Week 239 - Scoot"
date: 2026-03-23
week: 239
description: A week of scooting around.
---

This is a sample weeknote to verify the content collection works.
```

- [ ] **Step 4: Create about page**

Create `src/content/pages/about.md`:

```markdown
---
title: About
description: About Barry Frost.
---

I'm Barry, a software engineer based in Hertfordshire, UK.
```

- [ ] **Step 5: Verify collections load**

```bash
npm run dev
```

Expected: Dev server starts without errors. No pages use the collections yet, but they should parse without schema validation errors. Check terminal output for any warnings.

- [ ] **Step 6: Commit**

```bash
git add src/content.config.ts src/content/
git commit -m "feat: add content collections for articles, weeknotes and pages"
```

---

## Task 4: PDS Fetch Helper and Content Loaders

**Files:**
- Create: `src/lib/pds.ts`, `src/lib/loaders/bluesky.ts`, `src/lib/loaders/checkins.ts`, `src/lib/loaders/reviews.ts`, `src/lib/loaders/documents.ts`
- Modify: `src/content.config.ts`

- [ ] **Step 1: Create PDS fetch helper**

Create `src/lib/pds.ts`:

```typescript
export const DID = 'did:plc:j5ksi3y4tdtbp7vpsxsfyask';
export const PDS_HOST = 'bsky.social';

interface ListRecordsResponse {
  records: {
    uri: string;
    cid: string;
    value: Record<string, unknown>;
  }[];
  cursor?: string;
}

export async function* fetchAllRecords(
  collection: string,
  did: string = DID,
  host: string = PDS_HOST,
): AsyncGenerator<{ uri: string; cid: string; value: Record<string, unknown> }> {
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({
      repo: did,
      collection,
      limit: '100',
    });
    if (cursor) params.set('cursor', cursor);

    const url = `https://${host}/xrpc/com.atproto.repo.listRecords?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`PDS fetch failed: ${res.status} ${res.statusText} for ${collection}`);
    }

    const data: ListRecordsResponse = await res.json();
    for (const record of data.records) {
      yield record;
    }
    cursor = data.cursor;
  } while (cursor);
}

export function rkeyFromUri(uri: string): string {
  return uri.split('/').pop()!;
}
```

- [ ] **Step 2: Create Bluesky loader**

Create `src/lib/loaders/bluesky.ts`:

```typescript
import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, DID, PDS_HOST } from '../pds';

export function blueskyLoader(): Loader {
  return {
    name: 'bluesky-loader',
    async load({ store, logger, generateDigest }) {
      logger.info('Fetching Bluesky posts');
      store.clear();

      for await (const record of fetchAllRecords('app.bsky.feed.post', DID, PDS_HOST)) {
        const value = record.value as Record<string, unknown>;
        const rkey = rkeyFromUri(record.uri);

        store.set({
          id: rkey,
          data: {
            text: value.text as string,
            createdAt: value.createdAt as string,
            facets: (value.facets as unknown[]) ?? [],
            embed: value.embed ?? null,
            uri: record.uri,
          },
          digest: generateDigest(record.cid),
        });
      }
    },
  };
}
```

- [ ] **Step 3: Create checkins loader**

Create `src/lib/loaders/checkins.ts`:

```typescript
import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, DID, PDS_HOST } from '../pds';

export function checkinsLoader(): Loader {
  return {
    name: 'checkins-loader',
    async load({ store, logger, generateDigest }) {
      logger.info('Fetching checkins');
      store.clear();

      for await (const record of fetchAllRecords('app.beaconbits.beacon', DID, PDS_HOST)) {
        const value = record.value as Record<string, unknown>;
        const rkey = rkeyFromUri(record.uri);
        const location = value.location as { latitude: string; longitude: string } | undefined;

        store.set({
          id: rkey,
          data: {
            venueName: value.venueName as string,
            venueCategory: value.venueCategory as string | undefined,
            venueAddress: value.venueAddress as string | undefined,
            venueUri: value.venueUri as string | undefined,
            latitude: location?.latitude,
            longitude: location?.longitude,
            rating: value.rating as number | undefined,
            createdAt: value.createdAt as string,
            uri: record.uri,
          },
          digest: generateDigest(record.cid),
        });
      }
    },
  };
}
```

- [ ] **Step 4: Create reviews loader**

Create `src/lib/loaders/reviews.ts`:

```typescript
import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, DID, PDS_HOST } from '../pds';

export function reviewsLoader(): Loader {
  return {
    name: 'reviews-loader',
    async load({ store, logger, generateDigest }) {
      logger.info('Fetching reviews');
      store.clear();

      for await (const record of fetchAllRecords('social.popfeed.feed.review', DID, PDS_HOST)) {
        const value = record.value as Record<string, unknown>;
        const rkey = rkeyFromUri(record.uri);
        const identifiers = value.identifiers as { imdbId?: string; tmdbId?: string } | undefined;

        store.set({
          id: rkey,
          data: {
            title: value.title as string,
            creativeWorkType: value.creativeWorkType as string,
            rating: value.rating as number | undefined,
            genres: (value.genres as string[]) ?? [],
            posterUrl: value.posterUrl as string | undefined,
            backdropUrl: value.backdropUrl as string | undefined,
            mainCredit: value.mainCredit as string | undefined,
            mainCreditRole: value.mainCreditRole as string | undefined,
            releaseDate: value.releaseDate as string | undefined,
            text: (value.text as string) || '',
            facets: (value.facets as unknown[]) ?? [],
            imdbId: identifiers?.imdbId,
            tmdbId: identifiers?.tmdbId,
            createdAt: value.createdAt as string,
            uri: record.uri,
          },
          digest: generateDigest(record.cid),
        });
      }
    },
  };
}
```

- [ ] **Step 5: Create documents loader**

Create `src/lib/loaders/documents.ts`:

```typescript
import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, DID, PDS_HOST } from '../pds';

export function documentsLoader(): Loader {
  return {
    name: 'documents-loader',
    async load({ store, logger, generateDigest }) {
      logger.info('Fetching standard.site documents');
      store.clear();

      for await (const record of fetchAllRecords('site.standard.document', DID, PDS_HOST)) {
        const value = record.value as Record<string, unknown>;
        const rkey = rkeyFromUri(record.uri);

        store.set({
          id: rkey,
          data: {
            title: value.title as string | undefined,
            path: value.path as string | undefined,
            publishedAt: value.publishedAt as string | undefined,
            description: value.description as string | undefined,
            tags: (value.tags as string[]) ?? [],
            uri: record.uri,
            createdAt: value.createdAt as string | undefined,
          },
          digest: generateDigest(record.cid),
        });
      }
    },
  };
}
```

- [ ] **Step 6: Add PDS collections to content config**

Replace `src/content.config.ts` with:

```typescript
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { blueskyLoader } from './lib/loaders/bluesky';
import { checkinsLoader } from './lib/loaders/checkins';
import { reviewsLoader } from './lib/loaders/reviews';
import { documentsLoader } from './lib/loaders/documents';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: 'src/content/articles' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
  }),
});

const weeknotes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: 'src/content/weeknotes' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    week: z.number(),
    description: z.string().optional(),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: 'src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

const blueskyPosts = defineCollection({
  loader: blueskyLoader(),
  schema: z.object({
    text: z.string(),
    createdAt: z.string(),
    facets: z.array(z.unknown()),
    embed: z.unknown().nullable(),
    uri: z.string(),
  }),
});

const checkins = defineCollection({
  loader: checkinsLoader(),
  schema: z.object({
    venueName: z.string(),
    venueCategory: z.string().optional(),
    venueAddress: z.string().optional(),
    venueUri: z.string().optional(),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    rating: z.number().optional(),
    createdAt: z.string(),
    uri: z.string(),
  }),
});

const reviews = defineCollection({
  loader: reviewsLoader(),
  schema: z.object({
    title: z.string(),
    creativeWorkType: z.string(),
    rating: z.number().optional(),
    genres: z.array(z.string()),
    posterUrl: z.string().optional(),
    backdropUrl: z.string().optional(),
    mainCredit: z.string().optional(),
    mainCreditRole: z.string().optional(),
    releaseDate: z.string().optional(),
    text: z.string(),
    facets: z.array(z.unknown()),
    imdbId: z.string().optional(),
    tmdbId: z.string().optional(),
    createdAt: z.string(),
    uri: z.string(),
  }),
});

const documents = defineCollection({
  loader: documentsLoader(),
  schema: z.object({
    title: z.string().optional(),
    path: z.string().optional(),
    publishedAt: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()),
    uri: z.string(),
    createdAt: z.string().optional(),
  }),
});

export const collections = {
  articles,
  weeknotes,
  pages,
  blueskyPosts,
  checkins,
  reviews,
  documents,
};
```

- [ ] **Step 7: Verify PDS loaders work**

```bash
npm run build
```

Expected: Build succeeds. Terminal output should include logs like "Fetching Bluesky posts", "Fetching checkins", "Fetching reviews", "Fetching standard.site documents". No schema validation errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/ src/content.config.ts
git commit -m "feat: add PDS fetch helper and content loaders for Bluesky, checkins, reviews and documents"
```

---

## Task 5: Date and Rich Text Helpers

**Files:**
- Create: `src/lib/dates.ts`, `src/lib/richtext.ts`

- [ ] **Step 1: Create date formatting helpers**

Create `src/lib/dates.ts`:

```typescript
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

export function toISODate(date: Date): string {
  return date.toISOString();
}

export function yearMonth(date: Date): { year: string; month: string } {
  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, '0'),
  };
}
```

- [ ] **Step 2: Create Bluesky rich text renderer**

Create `src/lib/richtext.ts`:

Bluesky facets use byte offsets into the UTF-8 encoded text. We need to convert byte positions to string positions, then wrap facet ranges in HTML.

```typescript
interface Facet {
  index: { byteStart: number; byteEnd: number };
  features: { $type: string; uri?: string; did?: string; tag?: string }[];
}

export function renderRichText(text: string, facets: Facet[]): string {
  if (!facets || facets.length === 0) {
    return escapeHtml(text);
  }

  const encoder = new TextEncoder();
  const encoded = encoder.encode(text);
  const decoder = new TextDecoder();

  // Sort facets by byteStart ascending
  const sorted = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart);

  let html = '';
  let lastByte = 0;

  for (const facet of sorted) {
    const { byteStart, byteEnd } = facet.index;

    // Text before this facet
    if (byteStart > lastByte) {
      html += escapeHtml(decoder.decode(encoded.slice(lastByte, byteStart)));
    }

    const facetText = escapeHtml(decoder.decode(encoded.slice(byteStart, byteEnd)));
    const feature = facet.features[0];

    if (feature?.$type === 'app.bsky.richtext.facet#link') {
      html += `<a href="${escapeAttr(feature.uri!)}" rel="nofollow noopener" target="_blank">${facetText}</a>`;
    } else if (feature?.$type === 'app.bsky.richtext.facet#mention') {
      html += `<a href="https://bsky.app/profile/${escapeAttr(feature.did!)}">${facetText}</a>`;
    } else if (feature?.$type === 'app.bsky.richtext.facet#tag') {
      html += `<a href="https://bsky.app/hashtag/${escapeAttr(feature.tag!)}">${facetText}</a>`;
    } else {
      html += facetText;
    }

    lastByte = byteEnd;
  }

  // Remaining text after last facet
  if (lastByte < encoded.length) {
    html += escapeHtml(decoder.decode(encoded.slice(lastByte)));
  }

  return html;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/&/g, '&amp;');
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/dates.ts src/lib/richtext.ts
git commit -m "feat: add date formatting and Bluesky rich text rendering helpers"
```

---

## Task 6: Unified Feed Helper

**Files:**
- Create: `src/lib/feed.ts`

- [ ] **Step 1: Create the unified feed module**

Create `src/lib/feed.ts`:

```typescript
import { getCollection } from 'astro:content';
import { yearMonth } from './dates';

export interface FeedItem {
  type: 'article' | 'weeknote' | 'bluesky' | 'checkin' | 'review';
  date: Date;
  url: string;
  title?: string;
  summary?: string;
  id: string;
  data: Record<string, unknown>;
}

export const PAGE_SIZE = 20;

export async function getUnifiedFeed(): Promise<FeedItem[]> {
  const [articles, weeknotes, blueskyPosts, checkinEntries, reviewEntries] = await Promise.all([
    getCollection('articles'),
    getCollection('weeknotes'),
    getCollection('blueskyPosts'),
    getCollection('checkins'),
    getCollection('reviews'),
  ]);

  const items: FeedItem[] = [];

  for (const entry of articles) {
    const { year, month } = yearMonth(entry.data.date);
    items.push({
      type: 'article',
      date: entry.data.date,
      url: `/${year}/${month}/${entry.id}`,
      title: entry.data.title,
      summary: entry.data.description,
      id: `article:${entry.id}`,
      data: entry.data as unknown as Record<string, unknown>,
    });
  }

  for (const entry of weeknotes) {
    items.push({
      type: 'weeknote',
      date: entry.data.date,
      url: `/weeknotes/${entry.id}`,
      title: entry.data.title,
      summary: entry.data.description,
      id: `weeknote:${entry.id}`,
      data: entry.data as unknown as Record<string, unknown>,
    });
  }

  for (const entry of blueskyPosts) {
    items.push({
      type: 'bluesky',
      date: new Date(entry.data.createdAt),
      url: `/app.bsky.feed.post/${entry.id}`,
      summary: entry.data.text.slice(0, 200),
      id: `bluesky:${entry.id}`,
      data: entry.data as unknown as Record<string, unknown>,
    });
  }

  for (const entry of checkinEntries) {
    items.push({
      type: 'checkin',
      date: new Date(entry.data.createdAt),
      url: `/app.beaconbits.beacon/${entry.id}`,
      title: entry.data.venueName,
      summary: entry.data.venueAddress,
      id: `checkin:${entry.id}`,
      data: entry.data as unknown as Record<string, unknown>,
    });
  }

  for (const entry of reviewEntries) {
    items.push({
      type: 'review',
      date: new Date(entry.data.createdAt),
      url: `/social.popfeed.feed.review/${entry.id}`,
      title: entry.data.title,
      summary: entry.data.text || `${entry.data.creativeWorkType} — ${entry.data.rating}/10`,
      id: `review:${entry.id}`,
      data: entry.data as unknown as Record<string, unknown>,
    });
  }

  items.sort((a, b) => b.date.getTime() - a.date.getTime());
  return items;
}

export function paginateItems<T>(items: T[], pageSize: number = PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  return Array.from({ length: pageCount }, (_, i) => ({
    page: i + 1,
    items: items.slice(i * pageSize, (i + 1) * pageSize),
    totalPages: pageCount,
  }));
}

export function filterByMonth(items: FeedItem[], year: string, month: string): FeedItem[] {
  return items.filter((item) => {
    const ym = yearMonth(item.date);
    return ym.year === year && ym.month === month;
  });
}

export function getMonths(items: FeedItem[]): { year: string; month: string }[] {
  const seen = new Set<string>();
  const months: { year: string; month: string }[] = [];
  for (const item of items) {
    const ym = yearMonth(item.date);
    const key = `${ym.year}-${ym.month}`;
    if (!seen.has(key)) {
      seen.add(key);
      months.push(ym);
    }
  }
  return months;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/feed.ts
git commit -m "feat: add unified feed helper with pagination and month filtering"
```

---

## Task 7: Feed Card Components

**Files:**
- Create: `src/components/FeedEntry.astro`, `src/components/posts/ArticleCard.astro`, `src/components/posts/WeeknoteCard.astro`, `src/components/posts/BlueskyCard.astro`, `src/components/posts/CheckinCard.astro`, `src/components/posts/ReviewCard.astro`, `src/components/Pagination.astro`

- [ ] **Step 1: Create ArticleCard**

Create `src/components/posts/ArticleCard.astro`:

```astro
---
import { formatDate, toISODate } from '../../lib/dates';
import type { FeedItem } from '../../lib/feed';

interface Props {
  item: FeedItem;
}

const { item } = Astro.props;
---
<article class="h-entry">
  <h2 class="text-lg font-semibold">
    <a class="p-name u-url" href={item.url}>{item.title}</a>
  </h2>
  <time class="dt-published text-sm text-neutral-500 dark:text-neutral-400" datetime={toISODate(item.date)}>
    {formatDate(item.date)}
  </time>
  {item.summary && <p class="p-summary mt-1 text-neutral-700 dark:text-neutral-300">{item.summary}</p>}
  <data class="p-category hidden" value="article" />
</article>
```

- [ ] **Step 2: Create WeeknoteCard**

Create `src/components/posts/WeeknoteCard.astro`:

```astro
---
import { formatDate, toISODate } from '../../lib/dates';
import type { FeedItem } from '../../lib/feed';

interface Props {
  item: FeedItem;
}

const { item } = Astro.props;
---
<article class="h-entry">
  <h2 class="text-lg font-semibold">
    <a class="p-name u-url" href={item.url}>{item.title}</a>
  </h2>
  <time class="dt-published text-sm text-neutral-500 dark:text-neutral-400" datetime={toISODate(item.date)}>
    {formatDate(item.date)}
  </time>
  {item.summary && <p class="p-summary mt-1 text-neutral-700 dark:text-neutral-300">{item.summary}</p>}
  <data class="p-category hidden" value="weeknotes" />
</article>
```

- [ ] **Step 3: Create BlueskyCard**

Create `src/components/posts/BlueskyCard.astro`:

```astro
---
import { formatDate, toISODate } from '../../lib/dates';
import { renderRichText } from '../../lib/richtext';
import type { FeedItem } from '../../lib/feed';

interface Props {
  item: FeedItem;
}

const { item } = Astro.props;
const data = item.data as { text: string; facets: unknown[]; uri: string };
const html = renderRichText(data.text, data.facets as any);
---
<article class="h-entry">
  <div class="p-content" set:html={html} />
  <div class="mt-1 flex items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400">
    <time class="dt-published" datetime={toISODate(item.date)}>{formatDate(item.date)}</time>
    <a class="u-url" href={item.url}>permalink</a>
    <a class="u-syndication" href={`https://bsky.app/profile/barryfrost.com/post/${item.url.split('/').pop()}`} rel="syndication">Bluesky</a>
  </div>
</article>
```

- [ ] **Step 4: Create CheckinCard**

Create `src/components/posts/CheckinCard.astro`:

```astro
---
import { formatDate, toISODate } from '../../lib/dates';
import type { FeedItem } from '../../lib/feed';

interface Props {
  item: FeedItem;
}

const { item } = Astro.props;
const data = item.data as { venueName: string; venueCategory?: string; venueAddress?: string; rating?: number };
---
<article class="h-entry">
  <div>
    <a class="u-url" href={item.url}>
      <span class="p-name font-semibold">{data.venueName}</span>
    </a>
    {data.venueCategory && <span class="text-sm text-neutral-500 dark:text-neutral-400"> · {data.venueCategory}</span>}
  </div>
  {data.venueAddress && <p class="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5">{data.venueAddress}</p>}
  <div class="mt-1 flex items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400">
    <time class="dt-published" datetime={toISODate(item.date)}>{formatDate(item.date)}</time>
    {data.rating && <span>{'★'.repeat(data.rating)}</span>}
  </div>
</article>
```

- [ ] **Step 5: Create ReviewCard**

Create `src/components/posts/ReviewCard.astro`:

```astro
---
import { formatDate, toISODate } from '../../lib/dates';
import type { FeedItem } from '../../lib/feed';

interface Props {
  item: FeedItem;
}

const { item } = Astro.props;
const data = item.data as { title: string; creativeWorkType: string; rating?: number; mainCredit?: string; posterUrl?: string };
---
<article class="h-entry flex gap-4">
  {data.posterUrl && (
    <img
      src={data.posterUrl}
      alt={`Poster for ${data.title}`}
      class="w-16 h-24 object-cover rounded"
      loading="lazy"
    />
  )}
  <div>
    <h2 class="font-semibold">
      <a class="p-name u-url" href={item.url}>{data.title}</a>
    </h2>
    <p class="text-sm text-neutral-600 dark:text-neutral-400">
      {data.creativeWorkType}{data.mainCredit && ` · ${data.mainCredit}`}
    </p>
    <div class="mt-1 flex items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400">
      <time class="dt-published" datetime={toISODate(item.date)}>{formatDate(item.date)}</time>
      {data.rating !== undefined && <span class="p-rating">{data.rating}/10</span>}
    </div>
  </div>
</article>
```

- [ ] **Step 6: Create FeedEntry dispatcher**

Create `src/components/FeedEntry.astro`:

```astro
---
import type { FeedItem } from '../lib/feed';
import ArticleCard from './posts/ArticleCard.astro';
import WeeknoteCard from './posts/WeeknoteCard.astro';
import BlueskyCard from './posts/BlueskyCard.astro';
import CheckinCard from './posts/CheckinCard.astro';
import ReviewCard from './posts/ReviewCard.astro';

interface Props {
  item: FeedItem;
}

const { item } = Astro.props;

const components = {
  article: ArticleCard,
  weeknote: WeeknoteCard,
  bluesky: BlueskyCard,
  checkin: CheckinCard,
  review: ReviewCard,
};

const Component = components[item.type];
---
<div class="py-4 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
  <Component item={item} />
</div>
```

- [ ] **Step 7: Create Pagination component**

Create `src/components/Pagination.astro`:

```astro
---
interface Props {
  currentPage: number;
  totalPages: number;
  basePath?: string;
}

const { currentPage, totalPages, basePath = '' } = Astro.props;

function pageUrl(page: number): string {
  if (page === 1) return basePath ? `${basePath}/` : '/';
  return basePath ? `${basePath}/page/${page}/` : `/page/${page}/`;
}
---
{totalPages > 1 && (
  <nav class="flex items-center justify-center gap-2 py-8 text-sm" aria-label="Pagination">
    {currentPage > 1 && (
      <a href={pageUrl(currentPage - 1)} class="px-3 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800">
        Previous
      </a>
    )}
    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
      page === currentPage ? (
        <span class="px-3 py-1 rounded bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-medium">{page}</span>
      ) : (
        <a href={pageUrl(page)} class="px-3 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800">{page}</a>
      )
    ))}
    {currentPage < totalPages && (
      <a href={pageUrl(currentPage + 1)} class="px-3 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800">
        Next
      </a>
    )}
  </nav>
)}
```

- [ ] **Step 8: Commit**

```bash
git add src/components/
git commit -m "feat: add feed card components and pagination"
```

---

## Task 8: Homepage and Feed Pages

**Files:**
- Create: `src/layouts/Feed.astro`, `src/pages/page/[page].astro`
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Create Feed layout**

Create `src/layouts/Feed.astro`:

```astro
---
import Base from './Base.astro';
import FeedEntry from '../components/FeedEntry.astro';
import Pagination from '../components/Pagination.astro';
import type { FeedItem } from '../lib/feed';

interface Props {
  title: string;
  description?: string;
  items: FeedItem[];
  currentPage: number;
  totalPages: number;
  basePath?: string;
}

const { title, description, items, currentPage, totalPages, basePath } = Astro.props;
---
<Base title={title} description={description}>
  <slot name="header" />
  <div class="h-feed">
    <span class="p-name hidden">{title}</span>
    {items.map(item => <FeedEntry item={item} />)}
  </div>
  <Pagination currentPage={currentPage} totalPages={totalPages} basePath={basePath} />
</Base>
```

- [ ] **Step 2: Update homepage**

Replace `src/pages/index.astro` with:

```astro
---
import Feed from '../layouts/Feed.astro';
import { getUnifiedFeed, paginateItems, PAGE_SIZE } from '../lib/feed';

const allItems = await getUnifiedFeed();
const pages = paginateItems(allItems);
const { items, totalPages } = pages[0] ?? { items: [], totalPages: 1 };
---
<Feed title="Barry Frost" items={items} currentPage={1} totalPages={totalPages}>
  <div slot="header" class="mb-8">
    <p class="text-lg">Software engineer based in Hertfordshire, UK. Building web things.</p>
  </div>
</Feed>
```

- [ ] **Step 3: Create paginated feed pages**

Create `src/pages/page/[page].astro`:

```astro
---
import Feed from '../../layouts/Feed.astro';
import { getUnifiedFeed, paginateItems } from '../../lib/feed';

export async function getStaticPaths() {
  const allItems = await getUnifiedFeed();
  const pages = paginateItems(allItems);
  // Skip page 1 (that's the homepage)
  return pages.slice(1).map(({ page, items, totalPages }) => ({
    params: { page: String(page) },
    props: { items, currentPage: page, totalPages },
  }));
}

const { items, currentPage, totalPages } = Astro.props;
---
<Feed title={`Barry Frost — Page ${currentPage}`} items={items} currentPage={currentPage} totalPages={totalPages} />
```

- [ ] **Step 4: Verify feed renders**

```bash
npm run dev
```

Expected: Homepage shows the intro text followed by a chronological feed of all post types (articles, weeknotes, Bluesky posts, checkins, reviews). Pagination appears at the bottom if there are more than 20 items.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/Feed.astro src/pages/index.astro src/pages/page/
git commit -m "feat: add homepage with unified feed and pagination"
```

---

## Task 9: Article and Weeknote Detail Pages

**Files:**
- Create: `src/layouts/Post.astro`, `src/pages/[year]/[month]/[slug].astro`, `src/pages/weeknotes/[slug].astro`

- [ ] **Step 1: Create Post layout**

Create `src/layouts/Post.astro`:

```astro
---
import { getCollection } from 'astro:content';
import Base from './Base.astro';
import { formatDate, toISODate } from '../lib/dates';

interface Props {
  title: string;
  date: Date;
  description?: string;
  category?: string;
}

const { title, date, description, category } = Astro.props;

// Find matching document in PDS for syndication link
const currentPath = Astro.url.pathname.replace(/\/$/, '');
const documents = await getCollection('documents');
const matchingDoc = documents.find(doc => doc.data.path === currentPath);
---
<Base title={title} description={description}>
  <article class="h-entry">
    <header class="mb-8">
      <h1 class="p-name text-2xl font-bold">{title}</h1>
      <time class="dt-published text-sm text-neutral-500 dark:text-neutral-400" datetime={toISODate(date)}>
        {formatDate(date)}
      </time>
      {category && <data class="p-category hidden" value={category} />}
    </header>
    <div class="e-content prose dark:prose-invert max-w-none">
      <slot />
    </div>
    {matchingDoc && (
      <footer class="mt-8 text-sm text-neutral-500 dark:text-neutral-400">
        <a class="u-syndication" href={matchingDoc.data.uri} rel="syndication">View on AT Protocol</a>
      </footer>
    )}
  </article>
</Base>
```

- [ ] **Step 2: Create article detail page**

Create `src/pages/[year]/[month]/[slug].astro`:

```astro
---
import { getCollection, render } from 'astro:content';
import Post from '../../../layouts/Post.astro';
import { yearMonth } from '../../../lib/dates';

export async function getStaticPaths() {
  const articles = await getCollection('articles');
  return articles.map((entry) => {
    const { year, month } = yearMonth(entry.data.date);
    return {
      params: { year, month, slug: entry.id },
      props: { entry },
    };
  });
}

const { entry } = Astro.props;
const { Content } = await render(entry);
---
<Post title={entry.data.title} date={entry.data.date} description={entry.data.description}>
  <Content />
</Post>
```

- [ ] **Step 3: Create weeknote detail page**

Create `src/pages/weeknotes/[slug].astro`:

```astro
---
import { getCollection, render } from 'astro:content';
import Post from '../../layouts/Post.astro';

export async function getStaticPaths() {
  const weeknotes = await getCollection('weeknotes');
  return weeknotes.map((entry) => ({
    params: { slug: entry.id },
    props: { entry },
  }));
}

const { entry } = Astro.props;
const { Content } = await render(entry);
---
<Post title={entry.data.title} date={entry.data.date} description={entry.data.description} category="weeknotes">
  <Content />
</Post>
```

- [ ] **Step 4: Verify article and weeknote pages render**

```bash
npm run dev
```

Expected: Navigate to `/2026/03/2026-03-example-article` and `/weeknotes/239-scoot`. Both should render with title, date, and content. The weeknote should have a hidden `p-category` of "weeknotes".

- [ ] **Step 5: Commit**

```bash
git add src/layouts/Post.astro src/pages/weeknotes/ src/pages/\[year\]/
git commit -m "feat: add article and weeknote detail pages"
```

---

## Task 10: Slash Pages and Per-Type List Pages

**Files:**
- Create: `src/pages/[...slug].astro`, `src/pages/weeknotes/index.astro`, `src/pages/weeknotes/page/[page].astro`, `src/pages/app.bsky.feed.post/index.astro`, `src/pages/app.bsky.feed.post/page/[page].astro`, `src/pages/app.beaconbits.beacon/index.astro`, `src/pages/app.beaconbits.beacon/page/[page].astro`, `src/pages/social.popfeed.feed.review/index.astro`, `src/pages/social.popfeed.feed.review/page/[page].astro`

- [ ] **Step 1: Create slash pages route**

Create `src/pages/[...slug].astro`:

```astro
---
import { getCollection, render } from 'astro:content';
import Base from '../layouts/Base.astro';

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  return pages.map((entry) => ({
    params: { slug: entry.id },
    props: { entry },
  }));
}

const { entry } = Astro.props;
const { Content } = await render(entry);
---
<Base title={entry.data.title} description={entry.data.description}>
  <article>
    <h1 class="text-2xl font-bold mb-8">{entry.data.title}</h1>
    <div class="prose dark:prose-invert max-w-none">
      <Content />
    </div>
  </article>
</Base>
```

- [ ] **Step 2: Create weeknotes list pages**

Create `src/pages/weeknotes/index.astro`:

```astro
---
import Feed from '../../layouts/Feed.astro';
import { getUnifiedFeed, paginateItems } from '../../lib/feed';

const allItems = (await getUnifiedFeed()).filter(i => i.type === 'weeknote');
const pages = paginateItems(allItems);
const { items, totalPages } = pages[0] ?? { items: [], totalPages: 1 };
---
<Feed title="Weeknotes" items={items} currentPage={1} totalPages={totalPages} basePath="/weeknotes" />
```

Create `src/pages/weeknotes/page/[page].astro`:

```astro
---
import Feed from '../../../layouts/Feed.astro';
import { getUnifiedFeed, paginateItems } from '../../../lib/feed';

export async function getStaticPaths() {
  const allItems = (await getUnifiedFeed()).filter(i => i.type === 'weeknote');
  const pages = paginateItems(allItems);
  return pages.slice(1).map(({ page, items, totalPages }) => ({
    params: { page: String(page) },
    props: { items, currentPage: page, totalPages },
  }));
}

const { items, currentPage, totalPages } = Astro.props;
---
<Feed title={`Weeknotes — Page ${currentPage}`} items={items} currentPage={currentPage} totalPages={totalPages} basePath="/weeknotes" />
```

- [ ] **Step 3: Create Bluesky list pages**

Create `src/pages/app.bsky.feed.post/index.astro`:

```astro
---
import Feed from '../../layouts/Feed.astro';
import { getUnifiedFeed, paginateItems } from '../../lib/feed';

const allItems = (await getUnifiedFeed()).filter(i => i.type === 'bluesky');
const pages = paginateItems(allItems);
const { items, totalPages } = pages[0] ?? { items: [], totalPages: 1 };
---
<Feed title="Posts" items={items} currentPage={1} totalPages={totalPages} basePath="/app.bsky.feed.post" />
```

Create `src/pages/app.bsky.feed.post/page/[page].astro`:

```astro
---
import Feed from '../../../layouts/Feed.astro';
import { getUnifiedFeed, paginateItems } from '../../../lib/feed';

export async function getStaticPaths() {
  const allItems = (await getUnifiedFeed()).filter(i => i.type === 'bluesky');
  const pages = paginateItems(allItems);
  return pages.slice(1).map(({ page, items, totalPages }) => ({
    params: { page: String(page) },
    props: { items, currentPage: page, totalPages },
  }));
}

const { items, currentPage, totalPages } = Astro.props;
---
<Feed title={`Posts — Page ${currentPage}`} items={items} currentPage={currentPage} totalPages={totalPages} basePath="/app.bsky.feed.post" />
```

- [ ] **Step 4: Create checkins list pages**

Create `src/pages/app.beaconbits.beacon/index.astro`:

```astro
---
import Feed from '../../layouts/Feed.astro';
import { getUnifiedFeed, paginateItems } from '../../lib/feed';

const allItems = (await getUnifiedFeed()).filter(i => i.type === 'checkin');
const pages = paginateItems(allItems);
const { items, totalPages } = pages[0] ?? { items: [], totalPages: 1 };
---
<Feed title="Checkins" items={items} currentPage={1} totalPages={totalPages} basePath="/app.beaconbits.beacon" />
```

Create `src/pages/app.beaconbits.beacon/page/[page].astro`:

```astro
---
import Feed from '../../../layouts/Feed.astro';
import { getUnifiedFeed, paginateItems } from '../../../lib/feed';

export async function getStaticPaths() {
  const allItems = (await getUnifiedFeed()).filter(i => i.type === 'checkin');
  const pages = paginateItems(allItems);
  return pages.slice(1).map(({ page, items, totalPages }) => ({
    params: { page: String(page) },
    props: { items, currentPage: page, totalPages },
  }));
}

const { items, currentPage, totalPages } = Astro.props;
---
<Feed title={`Checkins — Page ${currentPage}`} items={items} currentPage={currentPage} totalPages={totalPages} basePath="/app.beaconbits.beacon" />
```

- [ ] **Step 5: Create reviews list pages**

Create `src/pages/social.popfeed.feed.review/index.astro`:

```astro
---
import Feed from '../../layouts/Feed.astro';
import { getUnifiedFeed, paginateItems } from '../../lib/feed';

const allItems = (await getUnifiedFeed()).filter(i => i.type === 'review');
const pages = paginateItems(allItems);
const { items, totalPages } = pages[0] ?? { items: [], totalPages: 1 };
---
<Feed title="Reviews" items={items} currentPage={1} totalPages={totalPages} basePath="/social.popfeed.feed.review" />
```

Create `src/pages/social.popfeed.feed.review/page/[page].astro`:

```astro
---
import Feed from '../../../layouts/Feed.astro';
import { getUnifiedFeed, paginateItems } from '../../../lib/feed';

export async function getStaticPaths() {
  const allItems = (await getUnifiedFeed()).filter(i => i.type === 'review');
  const pages = paginateItems(allItems);
  return pages.slice(1).map(({ page, items, totalPages }) => ({
    params: { page: String(page) },
    props: { items, currentPage: page, totalPages },
  }));
}

const { items, currentPage, totalPages } = Astro.props;
---
<Feed title={`Reviews — Page ${currentPage}`} items={items} currentPage={currentPage} totalPages={totalPages} basePath="/social.popfeed.feed.review" />
```

- [ ] **Step 6: Verify all list pages render**

```bash
npm run dev
```

Expected: Visit `/about`, `/weeknotes/`, `/app.bsky.feed.post/`, `/app.beaconbits.beacon/`, `/social.popfeed.feed.review/` — all should render paginated lists of the correct type.

- [ ] **Step 7: Commit**

```bash
git add src/pages/
git commit -m "feat: add slash pages and per-type list pages with pagination"
```

---

## Task 11: PDS Record Detail Pages

**Files:**
- Create: `src/pages/app.bsky.feed.post/[rkey].astro`, `src/pages/app.beaconbits.beacon/[rkey].astro`, `src/pages/social.popfeed.feed.review/[rkey].astro`, `src/components/embeds/ExternalEmbed.astro`, `src/components/embeds/ImageEmbed.astro`

- [ ] **Step 1: Create embed components**

Create `src/components/embeds/ExternalEmbed.astro`:

```astro
---
interface Props {
  uri: string;
  title: string;
  description?: string;
  thumb?: string;
}

const { uri, title, description, thumb } = Astro.props;
---
<a href={uri} class="block mt-3 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden hover:bg-neutral-50 dark:hover:bg-neutral-800" rel="nofollow noopener" target="_blank">
  {thumb && (
    <img src={thumb} alt="" class="w-full h-40 object-cover" loading="lazy" />
  )}
  <div class="p-3">
    <p class="font-medium text-sm">{title}</p>
    {description && <p class="text-sm text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2">{description}</p>}
    <p class="text-xs text-neutral-400 dark:text-neutral-500 mt-1">{new URL(uri).hostname}</p>
  </div>
</a>
```

Create `src/components/embeds/ImageEmbed.astro`:

```astro
---
interface ImageData {
  alt?: string;
  fullsize?: string;
  thumb?: string;
  aspectRatio?: { width: number; height: number };
}

interface Props {
  images: ImageData[];
}

const { images } = Astro.props;
const gridClass = images.length === 1 ? 'grid-cols-1' : 'grid-cols-2';
---
<div class={`grid ${gridClass} gap-2 mt-3`}>
  {images.map(img => (
    <a href={img.fullsize ?? img.thumb} target="_blank">
      <img
        src={img.thumb}
        alt={img.alt ?? ''}
        class="w-full rounded-lg object-cover"
        loading="lazy"
        style={img.aspectRatio ? `aspect-ratio: ${img.aspectRatio.width}/${img.aspectRatio.height}` : undefined}
      />
    </a>
  ))}
</div>
```

- [ ] **Step 2: Create Bluesky post detail page**

Create `src/pages/app.bsky.feed.post/[rkey].astro`:

```astro
---
import { getCollection } from 'astro:content';
import Base from '../../layouts/Base.astro';
import ExternalEmbed from '../../components/embeds/ExternalEmbed.astro';
import ImageEmbed from '../../components/embeds/ImageEmbed.astro';
import { renderRichText } from '../../lib/richtext';
import { formatDate, toISODate } from '../../lib/dates';

export async function getStaticPaths() {
  const posts = await getCollection('blueskyPosts');
  return posts.map((entry) => ({
    params: { rkey: entry.id },
    props: { entry },
  }));
}

const { entry } = Astro.props;
const { text, facets, embed, createdAt, uri } = entry.data;
const date = new Date(createdAt);
const html = renderRichText(text, facets as any);

const bskyUrl = `https://bsky.app/profile/barryfrost.com/post/${entry.id}`;

// Parse embed type
const embedType = (embed as any)?.$type as string | undefined;
const embedExternal = embedType === 'app.bsky.embed.external' ? (embed as any).external : null;
const embedImages = embedType === 'app.bsky.embed.images' ? (embed as any).images : null;
---
<Base title={text.slice(0, 60)} description={text.slice(0, 160)}>
  <article class="h-entry">
    <div class="p-content text-lg" set:html={html} />

    {embedExternal && (
      <ExternalEmbed
        uri={embedExternal.uri}
        title={embedExternal.title}
        description={embedExternal.description}
        thumb={embedExternal.thumb}
      />
    )}

    {embedImages && (
      <ImageEmbed images={embedImages} />
    )}

    <div class="mt-4 flex items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400">
      <time class="dt-published" datetime={toISODate(date)}>{formatDate(date)}</time>
      <a class="u-syndication" href={bskyUrl} rel="syndication">View on Bluesky</a>
    </div>
  </article>
</Base>
```

- [ ] **Step 3: Create checkin detail page**

Create `src/pages/app.beaconbits.beacon/[rkey].astro`:

```astro
---
import { getCollection } from 'astro:content';
import Base from '../../layouts/Base.astro';
import { formatDate, toISODate } from '../../lib/dates';

export async function getStaticPaths() {
  const entries = await getCollection('checkins');
  return entries.map((entry) => ({
    params: { rkey: entry.id },
    props: { entry },
  }));
}

const { entry } = Astro.props;
const { venueName, venueCategory, venueAddress, latitude, longitude, rating, createdAt } = entry.data;
const date = new Date(createdAt);
const hasLocation = latitude && longitude;
---
<Base title={venueName} description={`Checked in at ${venueName}`}>
  <article class="h-entry">
    <header class="mb-6">
      <h1 class="p-name text-2xl font-bold">{venueName}</h1>
      {venueCategory && <p class="text-neutral-600 dark:text-neutral-400 mt-1">{venueCategory}</p>}
    </header>

    {venueAddress && <p class="text-neutral-700 dark:text-neutral-300 mb-4">{venueAddress}</p>}

    {hasLocation && (
      <p class="mb-4">
        <a
          href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`}
          class="text-blue-600 dark:text-blue-400 underline"
          target="_blank"
          rel="noopener"
        >
          View on map
        </a>
      </p>
    )}

    {rating !== undefined && <p class="mb-4 text-lg">{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</p>}

    <div class="text-sm text-neutral-500 dark:text-neutral-400">
      <time class="dt-published" datetime={toISODate(date)}>{formatDate(date)}</time>
    </div>
  </article>
</Base>
```

- [ ] **Step 4: Create review detail page**

Create `src/pages/social.popfeed.feed.review/[rkey].astro`:

```astro
---
import { getCollection } from 'astro:content';
import Base from '../../layouts/Base.astro';
import { renderRichText } from '../../lib/richtext';
import { formatDate, toISODate } from '../../lib/dates';

export async function getStaticPaths() {
  const entries = await getCollection('reviews');
  return entries.map((entry) => ({
    params: { rkey: entry.id },
    props: { entry },
  }));
}

const { entry } = Astro.props;
const { title, creativeWorkType, rating, genres, posterUrl, mainCredit, mainCreditRole, releaseDate, text, facets, createdAt } = entry.data;
const date = new Date(createdAt);
const reviewHtml = text ? renderRichText(text, facets as any) : '';
---
<Base title={title} description={`Review of ${title}`}>
  <article class="h-entry">
    <div class="flex gap-6 mb-6">
      {posterUrl && (
        <img
          src={posterUrl}
          alt={`Poster for ${title}`}
          class="w-32 rounded-lg shadow"
          loading="lazy"
        />
      )}
      <div>
        <h1 class="p-name text-2xl font-bold">{title}</h1>
        <p class="text-neutral-600 dark:text-neutral-400 mt-1">
          {creativeWorkType}
          {mainCredit && ` · ${mainCredit}`}
          {mainCreditRole && ` (${mainCreditRole})`}
        </p>
        {genres.length > 0 && (
          <p class="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{genres.join(', ')}</p>
        )}
        {rating !== undefined && (
          <p class="mt-2 text-lg font-semibold">
            <span class="p-rating">{rating}</span>/10
          </p>
        )}
      </div>
    </div>

    {reviewHtml && <div class="e-content prose dark:prose-invert max-w-none" set:html={reviewHtml} />}

    <div class="mt-6 text-sm text-neutral-500 dark:text-neutral-400">
      <time class="dt-published" datetime={toISODate(date)}>Reviewed {formatDate(date)}</time>
    </div>
  </article>
</Base>
```

- [ ] **Step 5: Verify PDS detail pages render**

```bash
npm run dev
```

Expected: Navigate from feed items to their detail pages. Bluesky posts show rich text with links. Checkins show venue name, address, map link. Reviews show poster, title, rating, genres.

- [ ] **Step 6: Commit**

```bash
git add src/pages/app.bsky.feed.post/ src/pages/app.beaconbits.beacon/ src/pages/social.popfeed.feed.review/ src/components/embeds/
git commit -m "feat: add PDS record detail pages with embeds"
```

---

## Task 12: Monthly Archive Pages

**Files:**
- Create: `src/pages/[year]/[month]/index.astro`

- [ ] **Step 1: Create monthly archive page**

Create `src/pages/[year]/[month]/index.astro`:

```astro
---
import Feed from '../../../layouts/Feed.astro';
import { getUnifiedFeed, filterByMonth, paginateItems, getMonths } from '../../../lib/feed';
import { formatMonthYear } from '../../../lib/dates';

export async function getStaticPaths() {
  const allItems = await getUnifiedFeed();
  const months = getMonths(allItems);

  return months.map(({ year, month }) => {
    const items = filterByMonth(allItems, year, month);
    return {
      params: { year, month },
      props: { items, year, month },
    };
  });
}

const { items, year, month } = Astro.props;
const displayDate = formatMonthYear(new Date(Number(year), Number(month) - 1));
---
<Feed title={displayDate} items={items} currentPage={1} totalPages={1} />
```

- [ ] **Step 2: Verify monthly archives render**

```bash
npm run dev
```

Expected: Navigate to `/2026/03/` — shows all posts from March 2026, including articles, weeknotes, and PDS records.

- [ ] **Step 3: Commit**

```bash
git add src/pages/\[year\]/\[month\]/index.astro
git commit -m "feat: add monthly archive pages"
```

---

## Task 13: Redirects

**Files:**
- Create: `public/_redirects`
- Modify: `astro.config.mjs`

- [ ] **Step 1: Create Cloudflare _redirects file for legacy URLs**

Create `public/_redirects`:

```
# Legacy posts redirect to archive
# Add specific legacy URLs here as needed, e.g.:
# /2015/01/old-post https://archive.barryfrost.com/2015/01/old-post 301
```

This file will be populated with specific legacy URLs during the backfill process. Cloudflare Workers serves this automatically from the `public/` directory.

- [ ] **Step 2: Add weeknote redirects to Astro config**

Update `astro.config.mjs` — add the `redirects` property. Note: Astro's built-in redirects don't support pattern matching with dynamic segments. We'll handle old weeknote URL redirects in the `_redirects` file instead, generated during backfill.

The `_redirects` file approach is simpler for both legacy and weeknote redirects. No changes needed to `astro.config.mjs` at this stage.

- [ ] **Step 3: Commit**

```bash
git add public/_redirects
git commit -m "feat: add Cloudflare redirects file for legacy URLs"
```

---

## Task 14: GitHub Actions

**Files:**
- Create: `.github/workflows/deploy.yml`, `.github/workflows/poll-pds.yml`, `.github/last-seen-cids.json`

- [ ] **Step 1: Create deploy workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:
  repository_dispatch:
    types: [pds-update]

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

- [ ] **Step 2: Create PDS polling workflow**

Create `.github/workflows/poll-pds.yml`:

```yaml
name: Poll PDS

on:
  schedule:
    - cron: '*/15 * * * *'
  workflow_dispatch:

jobs:
  check-pds:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Check for new PDS records
        id: check
        run: |
          DID="did:plc:j5ksi3y4tdtbp7vpsxsfyask"
          HOST="bsky.social"
          CHANGED=false

          for COLLECTION in app.bsky.feed.post app.beaconbits.beacon social.popfeed.feed.review site.standard.document; do
            LATEST=$(curl -sf "https://${HOST}/xrpc/com.atproto.repo.listRecords?repo=${DID}&collection=${COLLECTION}&limit=1" | jq -r '.records[0].cid // "none"')
            CACHED=$(jq -r ".\"${COLLECTION}\" // \"\"" .github/last-seen-cids.json)

            if [ "$LATEST" != "$CACHED" ] && [ "$LATEST" != "none" ]; then
              CHANGED=true
              # Update the cached CID
              jq --arg col "$COLLECTION" --arg cid "$LATEST" '.[$col] = $cid' .github/last-seen-cids.json > tmp.json && mv tmp.json .github/last-seen-cids.json
            fi
          done

          echo "changed=$CHANGED" >> "$GITHUB_OUTPUT"

      - name: Commit updated CIDs
        if: steps.check.outputs.changed == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add .github/last-seen-cids.json
          git commit -m "chore: update last-seen PDS CIDs"
          git push

      - name: Trigger rebuild
        if: steps.check.outputs.changed == 'true'
        run: |
          gh api repos/${{ github.repository }}/dispatches \
            -f event_type=pds-update
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 3: Create initial CIDs cache file**

Create `.github/last-seen-cids.json`:

```json
{
  "app.bsky.feed.post": "",
  "app.beaconbits.beacon": "",
  "social.popfeed.feed.review": "",
  "site.standard.document": ""
}
```

- [ ] **Step 4: Commit**

```bash
git add .github/
git commit -m "feat: add GitHub Actions for deploy and PDS polling"
```

---

## Task 15: Backfill Migration Script

**Files:**
- Create: `scripts/backfill.ts`

This task creates a script to fetch existing posts from the current barryfrost.com site and split them into articles and weeknotes. The script should be run once locally.

- [ ] **Step 1: Create backfill script**

Create `scripts/backfill.ts`:

```typescript
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

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const FEED_URL = 'https://barryfrost.com/feed';
const ARTICLES_DIR = join(process.cwd(), 'src/content/articles');
const WEEKNOTES_DIR = join(process.cwd(), 'src/content/weeknotes');
const REDIRECTS_FILE = join(process.cwd(), 'public/_redirects');

// This is a skeleton — the actual implementation will need to:
// 1. Parse the RSS feed to get all post URLs and metadata
// 2. Fetch each post page and extract the content
// 3. Convert HTML content to Markdown (may need a dependency like turndown)
// 4. Identify weeknotes by the week-NNN slug pattern
// 5. Write Markdown files with appropriate frontmatter
// 6. Generate redirect rules for old weeknote URLs

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
      const urlParts = new URL(post.url).pathname;
      redirectLines.push(`${urlParts} /weeknotes/${weeknote.slug} 301`);
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
    ? require('fs').readFileSync(REDIRECTS_FILE, 'utf-8')
    : '';
  writeFileSync(REDIRECTS_FILE, existingRedirects + '\n' + redirectLines.join('\n') + '\n');
  console.log(`\nWrote ${redirectLines.length - 1} redirect rules to ${REDIRECTS_FILE}`);
  console.log('Done!');
}

main().catch(console.error);
```

Note: This script provides the structure. The HTML-to-Markdown conversion will likely need refinement during the actual backfill — the RSS feed contains HTML in `<description>`, which may need a library like `turndown` to convert cleanly. We'll handle that during execution.

- [ ] **Step 2: Commit**

```bash
git add scripts/
git commit -m "feat: add backfill migration script skeleton"
```

---

## Task 16: Full Build Verification

**Files:** None created — this is a verification task.

- [ ] **Step 1: Run a full static build**

```bash
npm run build
```

Expected: Build succeeds. Output shows pages generated for all routes — homepage, feed pages, articles, weeknotes, slash pages, Bluesky posts, checkins, reviews, monthly archives.

- [ ] **Step 2: Preview the built site**

```bash
npx wrangler dev
```

Expected: Local Wrangler preview serves the static site. Navigate through:
- `/` — homepage with feed
- `/weeknotes/239-scoot` — weeknote detail
- `/2026/03/2026-03-example-article` — article detail
- `/about` — slash page
- `/app.bsky.feed.post/` — Bluesky post list
- `/app.beaconbits.beacon/` — checkin list
- `/social.popfeed.feed.review/` — review list
- Click into individual PDS record detail pages
- `/2026/03/` — monthly archive
- Verify dark mode by toggling system preference
- Verify MF2 markup in page source (h-feed, h-entry, p-name, dt-published, u-syndication)

- [ ] **Step 3: Fix any issues found during verification**

Address any rendering, routing, or build issues. This step may involve iterating on components and re-building.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during full build verification"
```

---

## Verification Checklist

After all tasks are complete, verify end-to-end:

- [ ] `npm run build` succeeds with no errors
- [ ] All page types render: articles, weeknotes, slash pages, Bluesky posts, checkins, reviews
- [ ] Unified feed on homepage shows all post types in chronological order
- [ ] Pagination works: page numbers, prev/next links, correct items per page
- [ ] Per-type list pages filter correctly
- [ ] Monthly archives show the right posts
- [ ] Bluesky rich text renders links, mentions, tags correctly
- [ ] Embeds render (link cards, images) on Bluesky detail pages
- [ ] MF2 markup present: h-feed, h-entry, p-name, p-content, dt-published, u-syndication, p-category
- [ ] Light/dark mode follows system preference
- [ ] Footer contains h-card
- [ ] Redirects file is present in build output
- [ ] GitHub Actions workflows are syntactically valid
