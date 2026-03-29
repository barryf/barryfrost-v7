# barryfrost.com v7 — Design Spec

## Context

Barry's personal website (barryfrost.com) is being rebuilt from scratch. The current site uses a custom static site generator (Vibrancy). v7 moves to Astro 6 with Tailwind CSS, deployed to Cloudflare Workers. The key design challenge is merging two content sources — local Markdown and atproto PDS records — into a unified, IndieWeb-friendly site with Microformats 2 markup.

## Content Sources

### Local Markdown (in repo)

| Collection | Directory | URL pattern | Notes |
|---|---|---|---|
| Articles | `src/content/articles/` | `/2026/03/my-article` | Long-form posts, date in frontmatter |
| Weeknotes | `src/content/weeknotes/` | `/weeknotes/123-example` | Weekly reflections, `week` number in frontmatter |
| Slash pages | `src/content/pages/` | `/about`, `/colophon` | Not date-bound, updated over time |

Weeknotes are distinguished from articles by the `week-NNN` slug pattern (used during backfill migration) and a `weeknotes` category.

Articles and weeknotes are also published as `site.standard.document` records to the PDS (via sequoia.pub, separate process). Canonical URLs remain on barryfrost.com.

### PDS Records (fetched at build time)

- **PDS host:** bsky.social
- **DID:** `did:plc:j5ksi3y4tdtbp7vpsxsfyask`
- **Auth:** None required (all public)

| Collection | Lexicon | URL pattern |
|---|---|---|
| Bluesky posts | `app.bsky.feed.post` | `/app.bsky.feed.post/[rkey]` |
| Checkins | `app.beaconbits.beacon` | `/app.beaconbits.beacon/[rkey]` |
| Reviews | `social.popfeed.feed.review` | `/social.popfeed.feed.review/[rkey]` |
| Documents | `site.standard.document` | Not rendered as pages — used to enrich articles/weeknotes with AT Protocol URIs for syndication links |

Each PDS collection (except documents) gets individual detail pages with full content and embeds, plus paginated list pages.

## Data Fetching

### Astro 6 Custom Content Loaders

Each PDS collection gets a custom content loader defined in `src/content.config.ts`. This gives us typed collections, Zod schema validation, and the standard `getCollection()` API — same DX as local Markdown.

### PDS Fetch Helper (`src/lib/pds.ts`)

A single async generator function handles the `com.atproto.repo.listRecords` XRPC endpoint with cursor-based pagination:

```typescript
async function* fetchAllRecords(collection: string, did: string, host: string)
```

Returns up to 100 records per page, follows cursors until exhausted. With ~100 Bluesky posts and single-digit counts for other collections, this is 2-3 HTTP requests per collection.

### Loader Pattern (`src/lib/loaders/`)

Each loader (bluesky.ts, checkins.ts, reviews.ts, documents.ts):

1. Calls `fetchAllRecords()` for its collection
2. Maps each AT Protocol record to a normalised entry via `store.set()`
3. Uses the record CID (already a content hash) for incremental build support

### Collection Schemas

Defined in `src/content.config.ts` with Zod:

- **articles**: title, date, description, slug
- **weeknotes**: title, date, week (number), description, slug
- **pages**: title, description
- **blueskyPosts**: text, createdAt, facets, embed (optional)
- **checkins**: venueName, venueCategory, location, createdAt
- **reviews**: title, rating, creativeWorkType, posterUrl, createdAt
- **documents**: site, title, path, publishedAt, description, tags

## Page Generation

Fully static (SSG). No SSR — the site rebuilds when PDS content changes.

### Routes

| Route | Source | Notes |
|---|---|---|
| `/` | Unified feed page 1 | Brief header/nav + paginated feed |
| `/page/[page]` | Unified feed pages 2+ | |
| `/[year]/[month]/` | Monthly archive | All post types for that month |
| `/[year]/[month]/[slug]` | Articles | Year/month from frontmatter date |
| `/weeknotes/[slug]` | Weeknotes | Slug = `123-example` |
| `/weeknotes/` (+pagination) | Weeknotes list | |
| `/[slug]` | Slash pages | Single-segment, no collision with year routes |
| `/app.bsky.feed.post/[rkey]` | Bluesky detail | Full post + embeds |
| `/app.bsky.feed.post/` (+pagination) | Bluesky list | |
| `/app.beaconbits.beacon/[rkey]` | Checkin detail | |
| `/app.beaconbits.beacon/` (+pagination) | Checkin list | |
| `/social.popfeed.feed.review/[rkey]` | Review detail | |
| `/social.popfeed.feed.review/` (+pagination) | Review list | |

### Bluesky Rich Text Rendering

A utility function converts Bluesky facets to HTML:

1. Sort facets by `byteStart`
2. Walk UTF-8 byte positions
3. Wrap each facet range in appropriate HTML (`<a>` for links/mentions, etc.)

### Embed Rendering

The `BlueskyPost` component inspects `embed.$type` and delegates to sub-components:

- `ExternalEmbed.astro` — link cards (title, description, thumbnail)
- `ImageEmbed.astro` — image grid with alt text

Image blob URLs: `https://cdn.bsky.app/img/feed_thumbnail/plain/{did}/{cid}@jpeg`

## Unified Feed

### Feed Helper (`src/lib/feed.ts`)

`getUnifiedFeed()` merges all content types into a common shape:

```typescript
interface FeedItem {
  type: 'article' | 'weeknote' | 'bluesky' | 'checkin' | 'review';
  date: Date;
  url: string;
  title?: string;
  summary?: string;
  data: any;  // Original entry data for type-specific rendering
}
```

Steps:
1. Fetch all collections via `getCollection()`
2. Normalise each entry to `FeedItem`
3. Sort by date descending
4. Support filtering by type and by year/month

### Pagination

- 20 items per page
- Numbered pages: `/`, `/page/2`, `/page/3`
- Each per-type list and monthly archive also paginated
- `Pagination.astro` component with prev/next and page numbers

### Homepage

The homepage (`/`) is feed page 1, preceded by:

- Brief intro/blurb about Barry
- Navigation links to per-type feeds and slash pages

## Microformats 2

MF2 classes applied directly in Astro component templates — no runtime JS or post-processing.

### Feed Pages

```html
<div class="h-feed">
  <span class="p-name hidden">Barry Frost</span>
  <!-- Feed entries -->
</div>
```

### Post Entries

```html
<article class="h-entry">
  <h2 class="p-name"><a class="u-url" href={url}>{title}</a></h2>
  <time class="dt-published" datetime={iso}>{formatted}</time>
  <div class="e-content">{content}</div>
  <a class="u-syndication" href={atUri} rel="syndication">Bluesky</a>
</article>
```

### MF2 Post Type Mapping

| Source | MF2 type | Key properties |
|---|---|---|
| Article | h-entry (article) | p-name, e-content, dt-published |
| Weeknote | h-entry (article) | p-name, e-content, dt-published, p-category="weeknotes" |
| Bluesky post | h-entry (note) | p-content (no p-name), dt-published, u-syndication |
| Checkin | h-entry with checkin | p-checkin (h-card for venue), dt-published |
| Review | h-entry with review | p-name, p-rating, dt-published |

### Syndication Links

The `documents` collection provides AT Protocol URIs for articles/weeknotes. Matched by the document's `path` field to the article/weeknote URL path. Rendered as `u-syndication` links.

## Visual Design

- Clean, minimal, text-focused — similar aesthetic to current site
- Tailwind CSS with auto light/dark mode via `prefers-color-scheme` media strategy
- No JS toggle needed — follows system preference
- Mobile-first responsive layout

## Images

- Astro's `<Image>` component with Cloudflare adapter's image service
- Remote patterns allowed for `cdn.bsky.app` (Bluesky embeds) and review poster CDNs
- Auto-optimised (format conversion, resizing) on Cloudflare; Sharp fallback in dev
- No build-time image downloading

## Redirects

1. **Old weeknote URLs:** `/YYYY/MM/week-NNN-slug` → `/weeknotes/NNN-slug` via Astro redirects config
2. **Legacy posts:** All other old URLs → `archive.barryfrost.com/*` via `_redirects` file for Cloudflare

## Build & Deploy

### Stack

- Astro 6.1 (static output)
- Tailwind CSS (via `@tailwindcss/vite`)
- `@astrojs/cloudflare` adapter
- Cloudflare Workers + Assets

### GitHub Actions

**Deploy workflow** (`.github/workflows/deploy.yml`):
- Triggers on: push to main, workflow_dispatch, repository_dispatch (pds-update)
- Steps: checkout, setup Node 22, npm ci, npm run build, wrangler deploy

**PDS polling workflow** (`.github/workflows/poll-pds.yml`):
- Runs every 15 minutes via cron
- For each monitored collection, fetches the most recent record CID
- Compares against stored values in `.github/last-seen-cids.json`
- If any CID changed, fires `repository_dispatch` with type `pds-update`

## Backfill

One-time migration script to bring across existing articles from the current site:

1. Identify all existing Markdown posts
2. Posts with `week-NNN` slug pattern → `src/content/weeknotes/NNN-slug.md` with `week: NNN` in frontmatter
3. All others → `src/content/articles/` with appropriate frontmatter
4. Generate redirect rules for old weeknote URLs

## Verification

- `npm run dev` — local dev server, check all page types render
- Verify PDS records load: check list pages for Bluesky, checkins, reviews
- Verify Bluesky post rendering: rich text facets, image embeds, link cards
- Verify unified feed: chronological order, mixed types, pagination works
- Verify MF2: parse pages with a MF2 parser (e.g. php.microformats.io or pin13.net)
- Verify redirects: old weeknote URLs redirect correctly
- Verify light/dark mode toggle follows system preference
- `npm run build` — full static build succeeds
- Deploy to Cloudflare Workers and test production URLs
