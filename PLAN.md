# barryfrost.com v7

Personal website for Barry Frost — statically generated, IndieWeb-compliant, deployed to Cloudflare Pages.

## Stack

- **Astro 6** — static output (`output: 'static'`), `build.format: 'file'`
- **Tailwind CSS v4** — via `@tailwindcss/vite` plugin, `@tailwindcss/typography` for prose
- **`@astrojs/rss`** — RSS feed generation
- No SSR adapter; pure static build

## Content Sources

Two sources are merged into a single unified feed at build time:

### 1. Local Markdown (`src/content/`)
| Collection | Path | Notes |
|---|---|---|
| `articles` | `src/content/articles/` | Long-form posts |
| `weeknotes` | `src/content/weeknotes/` | Weekly notes, published Sundays |
| `pages` | `src/content/pages/` | Slash pages (about, colophon, etc.) |
| `travelblog` | `src/content/travelblog/` | Archived travel blog (2000–2001) |

### 2. AT Protocol PDS Records
Fetched at build time from `bsky.social` for DID `did:plc:j5ksi3y4tdtbp7vpsxsfyask` via custom Astro content loaders in `src/lib/loaders/`.

| Collection | Loader | Feed type |
|---|---|---|
| `app.bsky.feed.post` | `bluesky.ts` | `bluesky` |
| `app.beaconbits.beacon` | `checkins.ts` | `checkin` |
| `social.popfeed.feed.review` | `films.ts` | `film` |
| `buzz.bookhive.book` | `books.ts` | `book` |
| `social.grain.gallery` + `.gallery.item` + `.photo` | `photos.ts` | `photo` |
| `site.standard.document` | `documents.ts` | (enrichment only — not feed entries) |
| `site.standard.graph.subscription` | `subscriptions.ts` | (blogroll only) |

The `documents` collection maps AT URIs to local articles/weeknotes for MF2 syndication links — it does not produce duplicate feed entries.

Blogroll blogs come from `src/data/blogroll.json` (static JSON).

### Loader pattern
Each PDS loader implements `Loader` from `astro/loaders`:
- `store.clear()` at the start (full refresh each build)
- Iterates `fetchAllRecords(collection, DID, PDS_HOST)` from `src/lib/pds.ts`
- Downloads and caches image blobs via `downloadImage()` from `src/lib/download-image.ts` — saves to `public/images/{subdir}/`, skips if already exists, converts to WebP at 2× dimensions. Accepts an optional `fit` parameter (`'cover'` default, or `'inside'` to preserve aspect ratio — used by the Bluesky loader for embedded images)
- Stores entries with `generateDigest(record.cid)` for change detection

## Unified Feed

`src/lib/feed.ts` exports `getUnifiedFeed()` which merges all collections into `FeedItem[]` sorted by date descending.

```ts
interface FeedItem {
  type: 'article' | 'weeknote' | 'bluesky' | 'checkin' | 'film' | 'book' | 'photo';
  date: Date;
  url: string;
  title?: string;
  summary?: string;
  emoji?: string;
  id: string;
  data: Record<string, unknown>;
}
```

Default page size is 20. `paginateItems(items, pageSize?)` splits any array into `{ page, items, totalPages }[]`. The films pages override this to 40.

## URL Structure

| URL | Content |
|---|---|
| `/` | Unified feed, page 1 |
| `/page/2` | Unified feed, subsequent pages |
| `/articles` | Articles feed |
| `/articles/{slug}` | Individual article |
| `/weeknotes` | Weeknotes index: featured latest entry (no bottom border) + 3-column grid of the rest with `font-mono` week numbers (no pagination) |
| `/weeknotes/{slug}` | Individual weeknote with "Previous years this week" aside (increased spacing, larger year label) |
| `/work` | CV page — career, education, projects, skills, languages from `id.sifa.profile.*` PDS records |
| `/posts` | Bluesky posts feed |
| `/checkins` | Checkins feed |
| `/films` | Films feed — two-column grid (single column on narrow viewports), sorted by watched date; 40 per page |
| `/films/by-rating` | Films feed sorted by rating descending |
| `/photos` | Photos feed |
| `/books` | Books feed |
| `/blogroll` | Curated blogs + Standard publications |
| `/{year}/{month}/` | Monthly archive (all types) — h1 shows full month name; prev/next month nav below items |
| `/tags/{tag}` | Tag filter |
| `/{slug}` | Slash pages (about, colophon, etc.) |
| `/travelblog/{num}` | Travel blog entries |
| `/feed.xml` | RSS feed (articles + weeknotes, latest 10, full content) |

Most type-specific feeds have `/page/{n}` pagination. The weeknotes index is an exception — it shows all entries on a single page with a featured latest entry. Tags come from the `tags` frontmatter array on articles/weeknotes.

Type-specific feed pages (articles, photos, checkins, books, films) suppress the left type-icon gutter via `showIcon={false}` on `Feed` (or by using `FilmFeed` directly). The mixed homepage and posts feed retain the icon. Type-specific index pages include an intro paragraph; on `FilmFeed` this is baked into the layout (shown only on page 1).

## Layouts & Components

- `Base.astro` — HTML shell, `max-w-2xl mx-auto px-4`, dark mode via `prefers-color-scheme`
- `Feed.astro` — wraps `FeedEntry` list + `Pagination`, accepts `basePath` for paginated routes and `showIcon` (default `true`) to suppress the left type-icon gutter on type-specific pages. The `slot="header"` renders inside `h-feed` *after* the `<h1>`, so pages can inject intro text, maps, or subsections (e.g. a "Reading" section before the "Read" list on `/books`) that sit between the title and the feed items. The `slot="footer"` renders after `Pagination` (used by the month archive for prev/next navigation).
- `FilmFeed.astro` — dedicated layout for `/films` and `/films/by-rating`: renders `FilmCard` directly in a responsive two-column grid (`grid-cols-1 sm:grid-cols-2`), shows an intro paragraph on page 1, and provides a date/rating sort toggle.
- `Post.astro` — individual article/weeknote with prose styles
- `FeedEntry.astro` — dispatches to per-type card components by `item.type`, optionally rendering a `TypeIcon` in a left gutter (suppressed when `showIcon={false}`). For Bluesky reply posts (where `item.data.reply` is set) the gutter shows the Heroicons `arrow-uturn-left` icon instead of the TypeIcon.
- `TypeIcon.astro` — inline Heroicons (outline, 24px) keyed by `FeedItem.type`
- Card components in `src/components/posts/`: `ArticleCard`, `WeeknoteCard`, `BlueskyCard`, `CheckinCard`, `FilmCard`, `BookCard`, `PhotoCard`
  - All external-service cards except `FilmCard` render a styled service pill next to the date that links to the item on the originating service (Bluesky, Bookhive, Beaconbits, Grain)
  - External-service card title links include a Heroicons micro `arrow-top-right-on-square` icon (16px, filled, `inline size-3.5 ml-1 align-middle`) to signal navigation away from the site
  - `ArticleCard` shows tags as visible linked pills (linking to `/tags/{tag}`) below the title/summary, with the date rendered after the tags in `text-xs`
  - All card timestamp/metadata rows use `text-xs`
  - `BlueskyCard` renders up to 4 embedded images below the post text at fixed 96px height preserving aspect ratio; each image has `mb-1` bottom margin
  - `PhotoCard` renders up to 3 gallery thumbnails in a row and the total photo count

## Date Formatting

`src/lib/dates.ts` exports two display formatters:
- `formatDate(date)` — "22 April 2026" (full month name). Used only for dates displayed *under* weeknote titles (`WeeknoteCard`, `Post.astro`).
- `formatDateShort(date)` — "22 Apr 2026" (abbreviated month). Used everywhere else: all card timestamps (including `ArticleCard`), `now.astro`, travelblog nav, weeknotes index.

## Styling

Tailwind v4 with a custom warm neutral palette and orange accent (`--color-accent: #f76902`) defined in `src/styles/global.css`. Unclassed `<a>` tags default to the accent colour. Dark mode is CSS-only via `prefers-color-scheme` — no JS toggle.

## Microformats 2 (MF2)

Applied as static classes directly in Astro templates so IndieWeb parsers (XRay, Monocle, pin13) classify posts correctly via [Post-Type Discovery](https://indieweb.org/Post_Type_Discovery). No runtime JS required.

- **Feed** (`src/layouts/Feed.astro`): `h-feed` + `p-name` + hidden `h-card p-author` containing `u-photo` (`/barryfrost.jpg`, 192×192), `p-name`, `u-url` — parsers attach this author to every child entry
- **All cards**: `h-entry` with `dt-published`, `u-url`, optional `p-category` entries from `categories` frontmatter
- **ArticleCard / WeeknoteCard**: `p-name`, `p-summary`; article tags are emitted as `p-category` on visible `<a>` elements (text content = tag value); weeknotes also emit an implicit `p-category="weeknotes"`
- **BlueskyCard**: `e-content` for rich text, `u-in-reply-to` on reply link, `u-photo` on each embedded image
- **CheckinCard**: nested `p-checkin h-card` with `p-name`, `p-latitude`, `p-longitude`, `p-street-address`; `p-rating` (hidden) when present; hidden `u-url` as a direct child of `h-entry` (visible click target is the venue name) so parsers attribute the Beaconbits URL to the entry rather than the venue h-card
- **FilmCard**: nested `p-item h-cite` with `u-photo` (poster) and hidden `p-name u-url`; numeric `p-rating` exposed via `<data value=...>` alongside star glyphs
- **BookCard**: nested `p-read-of h-cite` with `u-photo` (cover), hidden `p-name u-url`, `p-author`
- **PhotoCard**: `u-photo` on each gallery thumbnail, `p-location` on address, `p-name u-url` on title

Image `src` attributes use `new URL(path, Astro.url).href` — `Astro.url` reflects the current host, so images resolve against `localhost` in dev and `https://new.barryfrost.com` in production builds. Non-image absolute URLs (canonical, og:url, h-card `u-url`, RSS) use `Astro.site` / `context.site`.

## RSS Feed

`/feed.xml` — articles + weeknotes only, latest 10, full HTML content rendered via `AstroContainer`. `trailingSlash: false` is passed to `@astrojs/rss` so item `<link>` / `<guid>` URLs match the site's no-trailing-slash convention.

## Canonical URLs

`BaseHead.astro` normalises `Astro.url.pathname` before building the canonical/og:url: `/index.html` → `/`, and strips the `.html` suffix on other paths (required because `build.format: 'file'`).

## Deployment

**GitHub Actions → Cloudflare Pages**

Two workflows:

### `deploy.yml`
Triggers on: push to `main`, `workflow_dispatch`, `repository_dispatch` (type: `pds-update`)
1. `npm ci`
2. Cache `public/images/` between runs (avoids re-downloading blobs)
3. `npm run build`
4. `wrangler pages deploy dist --project-name barryfrost-v7`
5. Pushover notification — normal-priority on success, high-priority on failure, linking to the workflow run

### `poll-pds.yml`
Runs every 15 minutes via cron. For each monitored collection, fetches the latest record CID and compares to `.github/last-seen-cids.json`. If any CID changed, commits the updated JSON and fires a `repository_dispatch` to trigger a rebuild.

Monitored collections: `app.bsky.feed.post`, `app.beaconbits.beacon`, `social.popfeed.feed.review`, `buzz.bookhive.book`, `site.standard.document`, `site.standard.graph.subscription`, `social.grain.gallery`, `social.grain.gallery.item`, `social.grain.photo`

Required secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PUSHOVER_TOKEN`, `PUSHOVER_USER`

## Key Conventions

- **Minimal JS** — the `/checkins` page loads Leaflet + Leaflet.markercluster via dynamic `createElement` (CDN) for the cluster map, with a fullscreen toggle button (expand/collapse icons, Escape key support); all other pages are JS-free
- **No runtime JS elsewhere** — MF2, dark mode, and layout are pure HTML/CSS
- **Local Markdown is canonical** — PDS documents are syndication targets, not the source of truth
- **Images cached at build time** — blobs downloaded once to `public/images/`, persisted in CI cache
- **`visibility: unlisted`** frontmatter hides articles/weeknotes from feeds (but pages still generate)
- **`build.format: 'file'`** — generates `about.html` not `about/index.html`
- **`compressHTML: false`** — keeps HTML readable

## Adding a New PDS Content Type

1. Create `src/lib/loaders/{type}.ts` — implement `Loader`, use `fetchAllRecords`, optionally `downloadImage`
2. Add collection to `src/content.config.ts` with a Zod schema
3. Add `'{type}'` to `FeedItem.type` union in `src/lib/feed.ts`
4. Fetch collection in `getUnifiedFeed()` and map to `FeedItem`
5. Create `src/components/posts/{Type}Card.astro`
6. Register in `src/components/FeedEntry.astro` components map (and add a service pill to the card's date row)
7. Add an entry to `src/components/TypeIcon.astro` (label + Heroicon path) for the left-gutter icon
8. Add collection NSID to the `poll-pds.yml` monitored list

## Ideas / Backlog

- `/uses`, `/defaults`, `/pay`, `/contact` slash pages
- Gigs attended
- Script to backfill historical checkins/films/notes as PDS records (or /data/*.json)
