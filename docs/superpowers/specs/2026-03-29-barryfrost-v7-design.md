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

### Visibility

Both articles and weeknotes support an optional `visibility` frontmatter field. Setting `visibility: unlisted` hides the post from all feed pages, lists, and archives — but the individual page is still accessible if someone knows the URL. Useful for draft-like posts not ready for public promotion.

### PDS Records (fetched at build time)

- **PDS host:** bsky.social
- **DID:** `did:plc:j5ksi3y4tdtbp7vpsxsfyask`
- **Auth:** None required (all public)

| Collection | Lexicon | Canonical URL | Notes |
|---|---|---|---|
| Bluesky posts | `app.bsky.feed.post` | `https://bsky.app/profile/{DID}/post/{rkey}` | No individual detail pages |
| Checkins | `app.beaconbits.beacon` | `https://www.beaconbits.app/beacons/{did-short}/{rkey}` | No individual detail pages |
| Reviews | `social.popfeed.feed.review` | `https://popfeed.social/review/at:/{DID}/{collection}/{rkey}` | No individual detail pages |
| Books | `buzz.bookhive.book` | `https://bookhive.buzz/books/{hiveId}` | No individual detail pages |
| Documents | `site.standard.document` | Not rendered as pages | Used to enrich articles/weeknotes with AT Protocol URIs for syndication links |

PDS feed items (Bluesky, checkins, reviews, books) appear in the unified feed but link out to their canonical external pages — no individual detail pages on this site.

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

Each loader (bluesky.ts, checkins.ts, reviews.ts, documents.ts, books.ts):

1. Calls `fetchAllRecords()` for its collection
2. Maps each AT Protocol record to a normalised entry via `store.set()`
3. Uses the record CID (already a content hash) for incremental build support

### Collection Schemas

Defined in `src/content.config.ts` with Zod:

- **articles**: title, date, description, categories (string[]), visibility (optional)
- **weeknotes**: title, date, week (number), description, emoji (optional), categories (optional), visibility (optional)
- **pages**: title, description
- **blueskyPosts**: text, createdAt, facets, embed (nullable), reply (nullable: { parentUri, parentHandle, parentRkey }), uri
- **checkins**: venueName, venueCategory, venueAddress, venueUri, latitude, longitude, rating, createdAt, uri
- **reviews**: title, creativeWorkType, rating, genres, posterUrl, backdropUrl, mainCredit, mainCreditRole, releaseDate, text, facets, imdbId, tmdbId, createdAt, uri
- **books**: title, authors, status, hiveId, hiveBookUri, coverUrl, owned, createdAt, finishedAt, isbn10, isbn13, goodreadsId, uri
- **documents**: title, path, publishedAt, description, tags, uri, createdAt

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
| `/app.bsky.feed.post/` (+pagination) | Bluesky list | No detail pages; items link to bsky.app |
| `/app.beaconbits.beacon/` (+pagination) | Checkin list | No detail pages; items link to beaconbits.app |
| `/social.popfeed.feed.review/` (+pagination) | Review list | No detail pages; items link to popfeed.social |
| `/categories/[category]` (+pagination) | Category pages | Articles and weeknotes with that category; title shown as `#category` |

### Bluesky Rich Text Rendering

A utility function in `src/lib/richtext.ts` converts Bluesky facets to HTML:

1. Sort facets by `byteStart`
2. Walk UTF-8 byte positions
3. Wrap each facet range in `<a class="underline">` for links/mentions

Reply context: when a post has a `reply` field, a "In reply to @handle's post" link is shown above the post content. Handles are resolved at build time via `com.atproto.repo.describeRepo` with an in-memory cache per build.

Bluesky posts beginning with "Week {number}" (weeknote announcements) are filtered out at loader time and not included in the feed.

### Embed Rendering

The `BlueskyCard` component inspects `embed.$type` and delegates to sub-components:

- `ExternalEmbed.astro` — link cards (title, description, thumbnail)
- `ImageEmbed.astro` — image grid with alt text

Image blob URLs: `https://cdn.bsky.app/img/feed_thumbnail/plain/{did}/{cid}@jpeg`

## Unified Feed

### Feed Helper (`src/lib/feed.ts`)

`getUnifiedFeed()` merges all content types into a common shape:

```typescript
interface FeedItem {
  type: 'article' | 'weeknote' | 'bluesky' | 'checkin' | 'review' | 'book';
  date: Date;
  url: string;
  title?: string;
  summary?: string;
  emoji?: string;
  id: string;
  data: Record<string, unknown>;
}
```

Steps:
1. Fetch all collections via `getCollection()`
2. Normalise each entry to `FeedItem`
3. Filter out articles/weeknotes with `visibility: 'unlisted'`
4. Sort by date descending
5. Support filtering by type and by year/month

Books use `finishedAt ?? createdAt` as the feed date.

### Pagination

- 20 items per page
- Numbered pages: `/`, `/page/2`, `/page/3`
- `Pagination.astro` shows a 5-page window centred on the current page (clamped at edges), plus prev/next arrows
- Each per-type list and monthly archive also paginated

### Homepage

The homepage (`/`) is feed page 1, preceded by:

- Brief intro/blurb about Barry
- Navigation links to per-type feeds and slash pages

## Weeknote Enhancements

### Prev/Next Navigation

Weeknote detail pages (`/weeknotes/[slug]`) include prev/next navigation links. Link text is formatted as `{emoji} {title}` (e.g. `← 🚂 Scoot`). Navigation is sorted by sequential `week` number.

### On This Day

Below prev/next navigation, an "On this day" section shows weeknotes from approximately the same week in other years. Matching uses sequential week arithmetic:

```
Math.abs(weekNum - entry.data.week) % 52 === 0
```

This finds entries exactly N years away (where N ≥ 1), working in both directions — past and future. Each "On this day" entry shows the year, emoji, title, and a plain text excerpt of the first ~160 characters of the post body. Helper functions live in `src/lib/weeknotes.ts`.

## Article Categories

Articles have a `categories: string[]` frontmatter field populated during backfill from the original site's category data. Categories display as pill tags below the post date on article detail pages and are marked up with MF2 `p-category`. The hidden `p-category` for type (e.g. "weeknotes") continues to be set via a separate `category` prop.

## Review Star Ratings

Review ratings are stored as a number out of 10. On display, they are converted to a star string using `toStars(rating)`:

- `rating / 2` determines full stars
- A remainder of 1 (odd rating) adds a `½` character
- Example: `7/10` → `★★★½`

The star display has a `title` tooltip showing the original `/10` value.

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
  <a class="u-syndication" href={atUri} rel="syndication">View on AT Protocol</a>
</article>
```

### MF2 Post Type Mapping

| Source | MF2 type | Key properties |
|---|---|---|
| Article | h-entry (article) | p-name, e-content, dt-published, p-category (per category) |
| Weeknote | h-entry (article) | p-name, e-content, dt-published, p-category="weeknotes" |
| Bluesky post | h-entry (note) | p-content (no p-name), dt-published, u-syndication |
| Checkin | h-entry with checkin | p-checkin (h-card for venue), dt-published |
| Review | h-entry with review | p-name, p-rating, dt-published |
| Book | h-entry | p-name, dt-published |

### Syndication Links

The `documents` collection provides AT Protocol URIs for articles/weeknotes. Matched by the document's `path` field to the article/weeknote URL path. Rendered as `u-syndication` links in the Post layout footer.

## Visual Design

- Clean, minimal, text-focused — similar aesthetic to current site
- Tailwind CSS with auto light/dark mode via `prefers-color-scheme` media strategy
- No JS toggle needed — follows system preference
- Mobile-first responsive layout

## Images

- Astro's `<Image>` component with Cloudflare adapter's image service
- Remote patterns allowed for `cdn.bsky.app`, `bsky.social` (Bluesky), and review/book poster CDNs
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
5. Add `emoji` frontmatter to weeknotes from original category data (`emoji-X` category → `emoji: X`)
6. Add `categories` frontmatter to articles from original site data

## Verification

- `npm run dev` — local dev server, check all page types render
- Verify PDS records load: check list pages for Bluesky, checkins, reviews, books
- Verify Bluesky post rendering: rich text links styled as underline, reply context shown, Week N posts filtered
- Verify unified feed: chronological order, mixed types, pagination with 5-page window
- Verify weeknotes: emoji prefix in feed and on post page, prev/next nav, "on this day" section (bidirectional)
- Verify articles: categories displayed as pills on detail page
- Verify reviews: star rating display with /10 tooltip
- Verify visibility: `unlisted` posts hidden from feeds but accessible by direct URL
- Verify MF2: parse pages with a MF2 parser (e.g. php.microformats.io or pin13.net)
- Verify redirects: old weeknote URLs redirect correctly
- Verify light/dark mode toggle follows system preference
- `npm run build` — full static build succeeds
- Deploy to Cloudflare Workers and test production URLs
