# barryfrost.com v7

Personal website for Barry Frost — statically generated, IndieWeb-compliant, deployed to Cloudflare Workers.

## Stack

- **Astro 7** — static output (`output: 'static'`), `build.format: 'file'`; Rust-based compiler (`@astrojs/compiler-rs`), Vite 8 bundler
- **`@astrojs/mdx`** — MDX support; `.md` and `.mdx` files coexist in all content collections
- **Tailwind CSS v4** — via `@tailwindcss/vite` plugin, `@tailwindcss/typography` for prose
- **`@astrojs/rss`** — RSS feed generation
- No SSR adapter; pure static build

## Content Sources

### 1. Local Markdown/MDX (`src/content/`)
| Collection | Path | Notes |
|---|---|---|
| `articles` | `src/content/articles/` | Long-form posts; `.md` or `.mdx` |
| `weeknotes` | `src/content/weeknotes/` | Weekly notes, published Sundays; `.md` or `.mdx` |
| `pages` | `src/content/pages/` | Slash pages (about, colophon, etc.); `.md` or `.mdx` |
| `travelblog` | `src/content/travelblog/` | Archived travel blog entries (2000–2001), one per day; `.md` or `.mdx` |
| `travelblogMonths` | `src/content/travelblog-months/` | One file per month (`YYYY-MM.md`); frontmatter `countries` (array) + optional `intro` line. Drives the country list and blurb on each month page and the index |

Content files are plain `.md` by default. Use `.mdx` when a file needs Astro components — e.g. `<Image />` from `astro:assets` for images that require Tailwind utility classes.

### 2. AT Protocol PDS Records
Fetched at build time from `bsky.social` for DID `did:plc:j5ksi3y4tdtbp7vpsxsfyask` via custom Astro content loaders in `src/lib/loaders/`.

| Collection | Loader | Used in |
|---|---|---|
| `app.bsky.feed.post` | `bluesky.ts` | `/posts`, homepage latest post |
| `app.beaconbits.beacon` + `com.barryfrost.checkin` | `check-ins.ts` | `/check-ins`, homepage recent check-ins |
| `social.popfeed.feed.review` | `films.ts` | `/films` |
| `buzz.bookhive.book` | `books.ts` | `/books` |
| `social.grain.gallery` + `.gallery.item` + `.photo` | `photos.ts` | `/photos`, homepage recent photos |
| `app.rocksky.album` | `albums.ts` | `/now` page "Listening" section only |
| `app.rocksky.scrobble` | `scrobbles.ts` | `/music` — Top Albums, Top Artists, Recently Played |
| `site.standard.graph.subscription` | `subscriptions.ts` | `/blogroll` only |

> **Note on `com.barryfrost.checkin`:** The site route and code use `check-in` (hyphenated), but the AT Protocol NSID cannot follow suit — the spec only allows `[a-zA-Z0-9]` in NSID name segments (no hyphens). The NSID is therefore intentionally kept as `com.barryfrost.checkin`.

Blogroll blogs come from `src/data/blogroll.json` (static JSON).

### Loader pattern
Each PDS loader implements `Loader` from `astro/loaders`:
- `store.clear()` at the start (full refresh each build)
- Iterates `fetchAllRecords(collection, DID, PDS_HOST)` from `src/lib/pds.ts`
- All PDS/atproto reads go through `fetchWithRetry` in `src/lib/pds.ts`, which retries transient failures (429/500/502/503/504 and network errors) with exponential backoff before giving up. `bsky.social`'s shared PDS intermittently 500s on valid requests, and without retries a single blip aborts the whole build.
- Materialises images at build time via `pdsImage(cid, opts)` / `remoteImage(url, opts)` from `src/lib/image-store.ts` — fetches the source directly (PDS `getBlob` or remote URL), resizes with `sharp`, and stores as webp in R2. Returns an `images.barryfrost.com` URL on success, or the direct source URL on error/dev. Pass dimensions at 2× the CSS display size for retina (e.g. `width: 192` for a 96px display slot). Accepts `fit: 'cover'` (default) or `fit: 'contain'` to preserve aspect ratio.
- Stores entries with `generateDigest(record.cid)` for change detection

## Homepage

The homepage (`src/pages/index.astro`) is a curated view, not a unified feed. Sections rendered in order:

1. **Intro** — short bio (h-card with name/location lives in the sitewide `SiteHeader`)
2. **Latest Weeknote** — title + emoji, truncated excerpt, link to all weeknotes
3. **Recent Photos** — 8 most recent photo galleries in a scrollable flex row
4. **Latest Post** — most recent non-reply Bluesky post with text, relative date, Bluesky icon link, pdsls icon link
5. **Featured Articles** — articles with `featured: true` frontmatter, sorted by date
6. **Recent Check-ins** — 5 most recent check-ins as a compact list
7. **Recent Media** — links to `/books`, `/films`, and `/music`

Each section is separated by the `Divider` component (`❉ ❉ ❉`). Sections are omitted if no data is available.

## Pagination

`src/lib/feed.ts` exports:
- `paginateItems(items, pageSize?)` — splits any array into `{ page, items, totalPages }[]`. Default page size is 20; articles pages override to 10, films pages override to 40.
- `getFeedPages(collection, opts?)` — fetches a collection, optionally filters and sorts (default: `createdAt` desc), then paginates. Shared by all feed index and paginated routes.

Paginated pages show `Title (Page N)` in both the h1 and the browser window title. The `Pagination` component shows all page numbers (no window/cap).

## URL Structure

| URL | Content |
|---|---|
| `/` | Curated homepage |
| `/articles` | Articles list |
| `/articles/{slug}` | Individual article |
| `/articles/feed.xml` | RSS feed (articles, latest 10, full content) |
| `/articles/feed.json` | JSON Feed v1.1 (same as RSS) |
| `/weeknotes` | Weeknotes grid — all entries, sorted by week number descending |
| `/weeknotes/{slug}` | Individual weeknote with "Previously this week" aside and prev/next nav |
| `/weeknotes/feed.xml` | RSS feed (weeknotes, latest 10, full content) |
| `/weeknotes/feed.json` | JSON Feed v1.1 (same as RSS) |
| `/posts` | Bluesky posts list |
| `/check-ins` | Check-ins list with Leaflet cluster map |
| `/films` | Films grid, sorted by watched date; 40 per page |
| `/films/by-rating` | Films grid sorted by rating descending |
| `/photos` | Photo galleries list |
| `/books` | Books — "Reading" and "Read" sections; two-column at lg |
| `/music` | Music — Top Albums grid, Top Artists ranked list with bars, Recently Played tracks; all aggregated at build time from scrobbles |
| `/now` | Now page |
| `/work` | CV — career, education, projects, skills from PDS records |
| `/blogroll` | "Websites" (blogs followed via Readwise Reader) + "Publications" (Standard.site subscriptions via Standard Reader) |
| `/search` | Pagefind search |
| `/{slug}` | Slash pages (about, colophon, etc.) |
| `/travelblog` | Archived 2000–2001 travel blog — index listing each month with its countries and a one-line summary |
| `/travelblog/{YYYY-MM}` | A month of entries grouped onto one page (e.g. `/travelblog/2001-08`), each dated entry deep-linkable via `#entry-{num}`; countries shown with flag emoji; prev/next month nav |

All type-specific list pages have `/page/{n}` pagination except `/weeknotes` (all on one page) and `/books` (Reading/Read split, first page only; Read continues to `/books/page/{n}`).

Removed from v6: `/page/{n}` (unified feed), `/archives/`, `/tags/`, `/feed.xml`, `/feed.json`.

## Layouts & Components

- `Base.astro` — HTML shell, `max-w-2xl mx-auto px-4`, dark mode via `prefers-color-scheme`; renders `<header><SiteHeader /></header>`, `<main><slot /></main>`, and `<footer><SiteFooter /></footer>` on every page.
- `SiteHeader.astro` — sitewide header: `h-card` (name, hidden `u-photo`/`p-locality`/`p-country-name`) plus a top nav linking to Posts, Weeknotes, Articles, Check-ins, Photos, Books, Films, Music, with the current section bolded. On the homepage the name renders as an `h1`; elsewhere it's a link back to `/`.
- `Feed.astro` — shared feed layout used by all list/paginated pages. Renders the `h-feed` wrapper, hidden `h-card p-author` MF2 author block, heading (with `(Page N)` suffix), optional named `description` slot, default slot for item content, and `<Pagination>` (suppressed via `paginate={false}` for books). Props: `title`, `currentPage?`, `totalPages`, `basePath`, `paginate?`.
- `FilmFeed.astro` — extends `Feed.astro` for `/films` and `/films/by-rating`: adds date/rating sort toggle and renders `FilmCard` in a responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`)
- `Post.astro` — individual article/weeknote with prose styles; "Posted in [Section] [relative date]" footer (omits "on" when displaying relative text); uses `Divider` above footer
- `Divider.astro` — `⁂` separator; `my-8 text-xl`
- `SiteFooter.astro` — footer nav (About, Colophon, Uses, Blogroll, Follow, Contact) + inline search form that submits to `/search`, plus a copyright/license line (CC BY-SA 4.0) and link to the GitHub source repo; rendered on every page
Icon components in `src/components/icons/`:
- `BlueskyIcon.astro` — monochrome Bluesky butterfly SVG, `currentColor`, `-translate-y-px` to align with text baseline
- `PdslsIcon.astro` — pdsls.dev graph SVG; links to the underlying PDS record on pdsls.dev
- `GrainIcon.astro` — grain.social logo; used in the `/photos` feed description and wherever grain.social links appear
- `BookHiveIcon.astro` — bookhive.buzz logo; used in the `/books` feed description and homepage Recent Media link
- `PopfeedIcon.astro` — popfeed.social logo; used in the `/films` feed description and homepage Recent Media link
- `RockskyIcon.astro` — rocksky music note icon; used in the homepage Recent Media link
- `RSSIcon.astro`, `JSONFeedIcon.astro`, `MF2Icon.astro`, `StandardSiteIcon.astro` — feed format icons; used on `/follow`
- `SifaIcon.astro` — sifa.id logo; used on `/follow` for the work profile link

All icons accept an optional `class` prop to override the default sizing/alignment.

Card components in `src/components/posts/`:
- `ArticleCard` — title link, relative date with `title` attr
- `BlueskyCard` — rich text, embedded image thumbnails (each links to a larger version), quote posts via `BlueskyQuote`, relative date, Bluesky icon link, pdsls icon link
- `CheckInCard` — venue name/category/address (name links to OpenStreetMap when lat/lon available), optional photo(s), relative date, pdsls icon link, optional Beaconbits link
- `FilmCard` — clickable poster linking to Popfeed, title, star rating, relative date, pdsls icon link
- `BookCard` — clickable cover linking to BookHive, title, authors, "Started/Finished [relative date]", pdsls icon link
- `PhotoCard` — horizontally scrollable thumbnails (multi) or side-by-side (single), title link to Grain gallery, relative date, pdsls icon link

All `<time>` elements use `formatRelativeDate` for display with `title={formatDateTitle(date)}` for the full date on hover and `datetime={toISODate(date)}` for machine readability.

## Date Formatting

`src/lib/dates.ts` exports:
- `formatRelativeDate(date)` — always returns `formatDateShort`. Used everywhere dates are displayed.
- `formatDate(date)` — "22 April 2026". Used in `title` attributes and travelblog nav links.
- `formatDateTitle(date)` — for `title` attributes: short date for date-only values; `YYYY-MM-DD HH:MM:SS±HH:MM` for timestamped values, using Europe/London timezone.
- `formatDateShort(date)` — "22 Apr 2026". Used as the `formatRelativeDate` return value and travelblog nav links.
- `toISODate(date)` — ISO 8601 string for `datetime` attributes. Date-only values (midnight UTC) emit `YYYY-MM-DD`; timestamped values emit local Europe/London datetime with offset.
- `formatMonthYear(date)` — "October 2000" (UTC). `monthKey(date)` — the `YYYY-MM` bucket a date falls in. `formatMonthKey("2000-10")` — "October 2000" from a key. `formatEntryDay(date)` — "Sat 14 Oct" for within-month travelblog entry headings. All UTC-based, used by the travelblog month pages.

## Styling

Tailwind v4 with default palette. Work Sans as the primary font, self-hosted via Astro's Fonts API (downloaded from Google at build time; no runtime CDN request). `src/styles/global.css`:
- Imports `@tailwindcss/typography` and sources `../content/**/*.{md,mdx}`
- Sets `--font-sans` to `var(--font-work-sans)` (the CSS variable injected by `<Font cssVariable="--font-work-sans" />` from `astro:assets`)
- Base `font-size: 16px` / `line-height: 26px`; `sm:` bumps to `18px` / `28px`
- `p`, `blockquote`, `.prose p`, `.prose ul` capped at `max-w-140`
- `.prose a` / `.underline` — `text-underline-offset: 15%`; hover colour `text-amber-600`
- `.prose h2` — `font-size: inherit`, bold, `mb-4`, no top margin
- `.prose h3` — `font-size: inherit`, normal weight, italic, `mb-4`, no top margin
- `.prose h4` — `font-size: inherit`, normal weight, `mb-4`, no top margin

Dark mode is CSS-only via `prefers-color-scheme` — no JS toggle. Gray scale used throughout (`text-gray-*`) rather than `neutral`.

### Images in content

Use `<Image />` from `astro:assets` in `.mdx` files to apply Tailwind classes to images:

```mdx
import { Image } from 'astro:assets';
import myPhoto from '../../assets/photo.jpg';

<Image src={myPhoto} alt="..." class="float-right ml-8 rounded" />
```

## Search

Static search via [Pagefind](https://pagefind.app). After `astro build`, `pagefind --site dist` indexes the built HTML and emits a self-contained bundle into `dist/pagefind/`.

**Scope:** Only pages with `data-pagefind-body`. Indexed content types:
- Articles (`/articles/{slug}`) — individual pages via `Post.astro`
- Weeknotes (`/weeknotes/{slug}`) — individual pages via `Post.astro`
- Travelblog months (`/travelblog/{YYYY-MM}`) — one indexed page per month
- Slash pages (about, colophon, etc.) via `[...slug].astro`
- Static pages: `/now`, `/work`, `/music`
- Bluesky posts and photo galleries — indexed per card on feed/paginated pages (`data-pagefind-body` on each `BlueskyCard`/`PhotoCard` `<article>`); search results link to the feed page
- Books — indexed per card (`data-pagefind-body` on `BookCard`), covering both the Reading and Read lists
- Films — indexed via `FilmFeed.astro` on the by-date view only (`data-pagefind-body` gated to `sort === 'date'`); the `/films/by-rating` view is skipped to avoid indexing every film twice
- `/blogroll` — page content wrapped in `data-pagefind-body`
- Check-ins — indexed per card (`data-pagefind-body` on `CheckInCard`), so venues/places visited are searchable; the Leaflet map is separate from the indexed card list

Homepage, listing/index pages, `/search`, and `/404` are excluded — curated/utility pages that would only duplicate content already indexed elsewhere.

**UI:** A compact `<form action="/search" method="get">` in `SiteFooter.astro` submits to `/search?q=…`. The `/search` page reads the query from the URL on load, runs Pagefind, and renders results. Each result link appends `#:~:text=<query>` for native browser text highlighting.

The search bundle is not present during `npm run dev`. Test with `npm run build && npm run preview`.

## Microformats 2 (MF2)

Applied as static classes directly in Astro templates. No runtime JS required.

- **Feed pages**: `h-feed` + `p-name` + hidden `h-card p-author` containing `u-photo`, `p-name`, `u-url`
- **All cards**: `h-entry` with `dt-published`, `u-url`
- **ArticleCard**: `p-name`, `p-summary`; tags as `p-category`
- **BlueskyCard**: `e-content` for rich text, `u-in-reply-to` on reply link, `u-photo` on embedded images
- **CheckInCard**: nested `p-checkin h-card` with `p-name`, `p-latitude`, `p-longitude`, `p-street-address`; `p-rating` (hidden) when present
- **FilmCard**: nested `p-item h-cite` with `u-photo` (poster) and hidden `p-name u-url`; numeric `p-rating` via `<data value=...>`
- **BookCard**: nested `p-read-of h-cite` with `u-photo` (cover), hidden `p-name u-url`, `p-author`
- **PhotoCard**: `u-photo` on each thumbnail, `p-name u-url` on title

## Feeds

Per-type RSS and JSON feeds for articles and weeknotes:

| URL | Content |
|---|---|
| `/articles/feed.xml` | RSS — articles, latest 10, full HTML content |
| `/articles/feed.json` | JSON Feed v1.1 — same content |
| `/weeknotes/feed.xml` | RSS — weeknotes, latest 10, full HTML content |
| `/weeknotes/feed.json` | JSON Feed v1.1 — same content |

All feeds render full content via `AstroContainer`. `trailingSlash: false` passed to `@astrojs/rss`. Advertised via `<link rel="alternate">` in `BaseHead.astro`.

## Favicon & Icons

All icon files in `public/` are derived from `public/barryfrost.jpg` (192×192 portrait):

| File | Size | Purpose |
|---|---|---|
| `favicon.ico` | 32×32 | Legacy browsers |
| `favicon.svg` | — | Modern browsers |
| `apple-touch-icon.png` | 180×180 | iOS home screen |
| `icon-192.png` | 192×192 | Android / PWA |
| `icon-512.png` | 512×512 | Android PWA splash |
| `site.webmanifest` | — | PWA metadata |

## Canonical URLs

`BaseHead.astro` normalises `Astro.url.pathname` before building canonical/og:url: `/index.html` → `/`, strips `.html` suffix on other paths (required because `build.format: 'file'`).

## Deployment

**Cloudflare Workers Static Assets + Workers Builds**

The site is a Cloudflare Worker serving static assets (`wrangler.toml` at repo root, `[assets] directory = "./dist"`). Workers Builds triggers on push to `main` and on PRs (preview URLs posted as PR comments).

Build command: `npm run build` (`astro build` + `pagefind`). Deploy command: `npm run deploy` (`npx wrangler deploy` followed by `scripts/notify-pushover.ts`).

The notification runs at the end of the deploy phase — after `wrangler deploy` returns, so it fires once the new version is actually live rather than at the end of the build. `scripts/notify-pushover.ts` POSTs a success notification to Pushover and exits silently if tokens are not set; the `&&` chain means a failed deploy sends no notification.

Required build env vars (set in CF Workers Builds): `PUSHOVER_TOKEN`, `PUSHOVER_USER`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `IMAGES_BASE_URL`

### PDS firehose listener — `cloudflare/pds-firehose`
A Cloudflare Worker that reacts to PDS changes in real time (seconds, not the old 15-minute poll) by listening to the atproto firehose over a websocket.

**Jetstream, not the raw firehose.** [Jetstream](https://github.com/bluesky-social/jetstream) is Bluesky's JSON-simplified view of `com.atproto.sync.subscribeRepos` — no CBOR/CAR decoding, and it filters **server-side** by DID and collection, so we only receive Barry's watched commits. Endpoint: `wss://jetstream2.us-east.bsky.network/subscribe?wantedDids=<DID>&wantedCollections=…`.

**A Durable Object holds the connection.** Regular Workers are request-scoped and can't keep a long-lived socket. The `JetstreamListener` Durable Object opens an outbound websocket to Jetstream. Because outbound sockets don't hibernate and only pin a DO for ~15 minutes, a recurring **alarm heartbeat** (`HEARTBEAT_MS = 60s`) reconnects after the ceiling or any eviction; a `*/5 * * * *` cron does a liveness ping to (re)instantiate the DO and heal a permanently-failed alarm (it does **not** poll the PDS).

**Reliability (DO-only, cursor replay).** No fallback poll. The last event's `time_us` is persisted as a Jetstream `cursor`; on reconnect it replays from `cursor − 5s` for gapless recovery. Cursors are time-based, so any of the four public instances is interchangeable on failover.

**One commit → one debounced rebuild.** Every commit in a watched collection warrants a rebuild (Jetstream reports create/update/delete directly — no digest/head-CID tiers). A ~10s debounce coalesces a burst (e.g. one article syndicating to several collections) into a single POST to the deploy hook; a `MAX_WAIT_MS = 60s` cap ensures sustained writes still rebuild. The deploy-pending flag is persisted so an eviction mid-debounce still fires on the next wake.

**Hourly fallback rebuild.** A second `0 * * * *` cron POSTs the deploy hook unconditionally, direct from the top-level `scheduled()` handler (bypassing the DO). This is belt-and-braces: if an on-demand build fails for a reason the deploy hook can't see (e.g. the PDS is unreachable at build time), no new commit will re-trigger it, so the hourly cron rebuilds within the hour. Distinguished from the liveness ping via `event.cron`.

Watched collections (`WATCHED_COLLECTIONS`): `app.bsky.feed.post`, `app.beaconbits.beacon`, `com.barryfrost.checkin`, `social.popfeed.feed.review`, `buzz.bookhive.book`, `site.standard.document`, `site.standard.graph.subscription`, `social.grain.gallery`, `social.grain.gallery.item`, `social.grain.photo`, `app.rocksky.album`

Required secrets: `DEPLOY_HOOK` (same Workers Builds deploy-hook URL as before).

### `scaffold.yml`
Manual `workflow_dispatch` for creating article/weeknote stubs. Inputs: `kind`, `title_or_topic`, `emoji`, `tags`, `date`. Runs `scripts/new-article.ts` or `scripts/new-weeknote.ts --no-git`, opens a draft PR via `peter-evans/create-pull-request`.

Required secrets: `GH_PAT`

### Image pipeline — R2 + sharp

Images are pre-generated **at build time** and served from an R2 bucket at `images.barryfrost.com`. No runtime resizing occurs.

`src/lib/image-store.ts` exposes two async helpers used by all loaders:
- `pdsImage(cid, opts)` — fetches blob from `bsky.social` via `com.atproto.sync.getBlob`
- `remoteImage(url, opts)` — fetches from the URL directly

Both functions:
1. Compute a content-addressed R2 key: `blob/{cid}/{w}x{h}-{fit}-q{q}` or `ext/{sha256(url)[0:16]}/{w}x{h}-{fit}-q{q}`
2. HEAD-check R2 — return `images.barryfrost.com/{key}` immediately if present (incrementality)
3. Otherwise fetch source → resize with `sharp` → encode as webp → PUT to R2 → return URL
4. On error or in dev (no R2 creds): return the direct source URL

R2 bucket `barryfrost-images` with custom domain `images.barryfrost.com`. `sharp@0.34.5` is available as Astro's transitive optional dependency and must **not** be added as a direct dep (macOS-generated lockfiles omit Linux platform binaries, breaking `npm ci` on CF's build runners).

#### Build-time concurrency

Every loader processes its records with bounded concurrency instead of a sequential `for await` loop, so `image-store.ts`'s R2/sharp work and per-record PDS/AppView lookups actually run in parallel:
- `src/lib/concurrency.ts` — `mapLimit(items, limit, fn)` helper and the shared `RECORD_CONCURRENCY` (32) constant, used by every loader in `src/lib/loaders/`
- `image-store.ts`'s own `CONCURRENCY` (24) separately bounds the R2/sharp work specifically, regardless of how many records are in flight above it

This took "Syncing content" from 90s+ down to ~7s. The pattern for a loader: collect records from `fetchAllRecords` into an array first (cheap, no images involved), then `mapLimit(records, RECORD_CONCURRENCY, async (record) => {...})` over the per-record body (image fetch + any other network calls + `store.set`) — decoupling PDS pagination from per-record work.

### Why `pds-firehose` is separate

`pds-firehose` lives in `cloudflare/` as a standalone wrangler project. The main app is `output: 'static'` with no SSR adapter — `src/pages/*.ts` endpoints are pre-rendered at build time. Folding it in would require `@astrojs/cloudflare` + SSR, and it needs its own Durable Object + cron handler. It runs on the Workers Free plan (the DO uses the SQLite storage backend, required on Free); the always-on outbound socket can't hibernate, so it consumes ~10,800 of the 13,000 GB-s/day free DO duration allowance.

## Key Conventions

- **Minimal JS** — `/check-ins` loads Leaflet + Leaflet.markercluster (CDN) for the cluster map with fullscreen toggle; all other pages are JS-free
- **No runtime JS elsewhere** — MF2, dark mode, and layout are pure HTML/CSS
- **Local Markdown is canonical** — PDS documents are syndication targets, not source of truth
- **Images pre-generated at build time** — fetched from source (PDS `getBlob` / remote URL), resized with `sharp`, stored as webp in R2 (`images.barryfrost.com`); served statically with no runtime resizing. Dev/error fallback uses direct source URLs.
- **`@/` import alias** — `tsconfig.json` maps `@/*` → `src/*`
- **`visibility: unlisted`** frontmatter hides articles/weeknotes from feeds (pages still generate)
- **`build.format: 'file'`** — generates `about.html` not `about/index.html`
- **`compressHTML: false`** — keeps HTML readable
- **`featured: true`** frontmatter on articles — surfaces them on the homepage

## Authoring New Content

### Local CLI

```sh
npm run new:article -- --title "Some Title" [--tags "foo,bar"] [--date YYYY-MM-DD]
npm run new:weeknote -- --topic "Sofa" [--emoji "🛋️"] [--tags "foo,bar"] [--date YYYY-MM-DD]
```

Both commands: verify working tree is clean on `main`, create a `content/...` branch, write the stub, commit, push, open a draft PR via `gh`.

### Shared implementation

| Module | Responsibility |
|---|---|
| `scripts/lib/scaffold.ts` | Pure helpers: `slugify`, `escapeYaml`, `nextWeekNumber`, frontmatter renderers, `writeStub` |
| `scripts/new-article.ts` | Article CLI — slug from title, writes `src/content/articles/{slug}.md` |
| `scripts/new-weeknote.ts` | Weeknote CLI — week = `max(existing) + 1`, writes `src/content/weeknotes/{N}-{slug}.md` |

Both CLIs accept `--no-git` (or `CI=true`) to skip git/gh operations — used by `scaffold.yml`.

### Weeknote conventions

- Week numbers are sequential integers starting at 1 (not ISO weeks)
- Filename: `{N}-{slugified-topic}.md` — e.g. `244-sofa.md`
- Required frontmatter: `title`, `date`, `week` (unquoted integer). `emoji` optional but conventional
- Title format: `"Week {N} - {Topic}"` (hyphen with surrounding spaces)

## Adding a New PDS Content Type

1. Create `src/lib/loaders/{type}.ts` — implement `Loader`, use `fetchAllRecords`, materialise images with `pdsImage(cid, opts)` or `remoteImage(url, opts)` from `src/lib/image-store.ts`
2. Add collection to `src/content.config.ts` with a Zod schema
3. Create `src/components/posts/{Type}Card.astro`
4. Add an index page (`src/pages/{type}/index.astro`) and paginated page (`src/pages/{type}/page/[page].astro`) using `getFeedPages` and the `Feed.astro` layout
5. Add collection NSID to `DIGEST_COLLECTIONS` (small) or `HEAD_COLLECTIONS` (large) in `cloudflare/pds-poller/src/index.ts`, and add a label to the `PRETTY` map
6. Link from the homepage or footer as appropriate

## One-off Import Scripts

| Script | Purpose |
|---|---|
| `scripts/backfill.ts` | Convert v6 JSON posts (articles/weeknotes) → local Markdown |
| `scripts/import-grain-photos.ts` | Import v6 photo posts to grain.social as PDS records |
| `scripts/export-notes-csv.ts` | Export all v6 `post-type: note` records to CSV for review before Bluesky import |
| `scripts/import-notes-bsky.ts` | Import approved notes from CSV to PDS as `app.bsky.feed.post` records |
| `scripts/delete-imported-notes-bsky.ts` | Delete all records previously imported by `import-notes-bsky.ts` |
