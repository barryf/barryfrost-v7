# barryfrost.com v7

Personal website for Barry Frost — statically generated, IndieWeb-compliant, deployed to Cloudflare Pages.

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
| `travelblog` | `src/content/travelblog/` | Archived travel blog (2000–2001); `.md` or `.mdx` |

Content files are plain `.md` by default. Use `.mdx` when a file needs Astro components — e.g. `<Image />` from `astro:assets` for images that require Tailwind utility classes.

### 2. AT Protocol PDS Records
Fetched at build time from `bsky.social` for DID `did:plc:j5ksi3y4tdtbp7vpsxsfyask` via custom Astro content loaders in `src/lib/loaders/`.

| Collection | Loader | Used in |
|---|---|---|
| `app.bsky.feed.post` | `bluesky.ts` | `/posts`, homepage latest post |
| `app.beaconbits.beacon` + `com.barryfrost.checkin` | `checkins.ts` | `/checkins`, homepage recent check-ins |
| `social.popfeed.feed.review` | `films.ts` | `/films` |
| `buzz.bookhive.book` | `books.ts` | `/books` |
| `social.grain.gallery` + `.gallery.item` + `.photo` | `photos.ts` | `/photos`, homepage recent photos |
| `app.rocksky.album` | `albums.ts` | `/now` page "Listening" section only |
| `site.standard.document` | `documents.ts` | Enrichment only — adds AT Protocol syndication links to articles/weeknotes |
| `site.standard.graph.subscription` | `subscriptions.ts` | `/blogroll` only |

The `documents` collection maps AT URIs to local articles/weeknotes for MF2 syndication links — it does not produce duplicate feed entries.

Blogroll blogs come from `src/data/blogroll.json` (static JSON).

### Loader pattern
Each PDS loader implements `Loader` from `astro/loaders`:
- `store.clear()` at the start (full refresh each build)
- Iterates `fetchAllRecords(collection, DID, PDS_HOST)` from `src/lib/pds.ts`
- Builds image URLs via `transformImage(sourceUrl, opts)` from `src/lib/image-url.ts` — returns a Cloudflare Image Transformations URL (`https://new.barryfrost.com/cdn-cgi/image/{params}/{sourceUrl}`). Source blobs stay in the PDS; CF fetches, transforms, and edge-caches on first request. Pass dimensions at 2× the CSS display size for retina (e.g. `width: 192` for a 96px display slot). Accepts `fit: 'cover'` (default) or `fit: 'contain'` to preserve aspect ratio.
- Stores entries with `generateDigest(record.cid)` for change detection

## Homepage

The homepage (`src/pages/index.astro`) is a curated view, not a unified feed. Sections rendered in order:

1. **Intro** — h-card with name, location, short bio
2. **Latest Weeknote** — title + emoji, truncated excerpt, link to all weeknotes
3. **Recent Photos** — 6 most recent photo galleries in a scrollable flex row
4. **Latest Post** — most recent non-reply Bluesky post with text, relative date, Bluesky icon link
5. **Featured Articles** — articles with `featured: true` frontmatter, sorted by date
6. **Recent Check-ins** — 5 most recent check-ins as a compact list
7. **Recent Media** — links to `/books` and `/films`

Each section is separated by the `Divider` component (`❉ ❉ ❉`). Sections are omitted if no data is available.

## Pagination

`src/lib/feed.ts` exports `paginateItems(items, pageSize?)` which splits any array into `{ page, items, totalPages }[]`. Default page size is 20; films pages override to 40.

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
| `/checkins` | Check-ins list with Leaflet cluster map |
| `/films` | Films grid, sorted by watched date; 40 per page |
| `/films/by-rating` | Films grid sorted by rating descending |
| `/photos` | Photo galleries list |
| `/books` | Books — "Reading" and "Read" sections; two-column at lg |
| `/now` | Now page |
| `/work` | CV — career, education, projects, skills from PDS records |
| `/blogroll` | Curated blogs + Standard publications |
| `/search` | Pagefind search |
| `/{slug}` | Slash pages (about, colophon, etc.) |
| `/travelblog/{num}` | Travel blog entries |

All type-specific list pages have `/page/{n}` pagination except `/weeknotes` (all on one page) and `/books` (Reading/Read split, first page only; Read continues to `/books/page/{n}`).

Removed from v6: `/page/{n}` (unified feed), `/archives/`, `/tags/`, `/feed.xml`, `/feed.json`.

## Layouts & Components

- `Base.astro` — HTML shell, `max-w-2xl mx-auto px-4`, dark mode via `prefers-color-scheme`
- `FilmFeed.astro` — dedicated layout for `/films` and `/films/by-rating`: renders `FilmCard` in a responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`), shows intro paragraph on page 1, date/rating sort toggle, dividers around the feed
- `Post.astro` — individual article/weeknote with prose styles; "Posted in [Section] [relative date]" footer (omits "on" when displaying relative text); uses `Divider` above footer
- `Divider.astro` — `❉ ❉ ❉` separator, `mb-4`
- `SiteFooter.astro` — footer nav (About, Colophon, Blogroll, Follow, Contact) + inline search form that submits to `/search`
- `BlueskyIcon.astro` — monochrome Bluesky butterfly SVG, `currentColor`, `-translate-y-px` to align with text baseline

Card components in `src/components/posts/`:
- `ArticleCard` — title link, relative date with `title` attr
- `BlueskyCard` — rich text, embedded images, quote posts via `BlueskyQuote`, relative date, Bluesky icon link
- `CheckinCard` — venue name/category/address, optional photo(s), relative date, Beaconbits link
- `FilmCard` — poster, title, star rating, relative date
- `BookCard` — cover, title, authors, "Started/Finished [relative date]"
- `PhotoCard` — horizontally scrollable thumbnails (multi) or side-by-side (single), title, relative date

All `<time>` elements use `formatRelativeDate` for display (e.g. "3 days ago", "Yesterday") with `title={formatDate(date)}` for the full date on hover and `datetime={toISODate(date)}` for machine readability.

## Date Formatting

`src/lib/dates.ts` exports:
- `formatRelativeDate(date, now?)` — "Today" / "Yesterday" / "N days ago" for ≤13 days; falls back to `formatDateShort` for older dates. Used everywhere dates are displayed.
- `formatDate(date)` — "22 April 2026". Used in `title` attributes and travelblog nav links.
- `formatDateShort(date)` — "22 Apr 2026". Used as the `formatRelativeDate` fallback and travelblog nav links.
- `toISODate(date)` — ISO 8601 string for `datetime` attributes.

## Styling

Tailwind v4 with default palette. Work Sans as the primary font (via Google Fonts, declared in `@theme`). `src/styles/global.css`:
- Imports `@tailwindcss/typography` and sources `../content/**/*.{md,mdx}`
- Sets `--font-sans` to Work Sans
- Base `font-size: 16px` / `line-height: 26px`; `sm:` bumps to `18px` / `28px`
- `p`, `blockquote`, `.prose` capped at `max-w-140`
- `.prose a` / `.underline` — `text-underline-offset: 15%`; hover colour `text-amber-600`
- `.prose h2` — `font-size: inherit`, bold, `mb-4`, no top margin
- `.prose h3` — `font-size: inherit`, normal weight, `mb-4`, no top margin

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

**Scope:** Only pages with `data-pagefind-body` — articles, weeknotes, travelblog entries, and slash pages. Feed-only content types and all listing/paginated routes are excluded by omission.

**UI:** A compact `<form action="/search" method="get">` in `SiteFooter.astro` submits to `/search?q=…`. The `/search` page reads the query from the URL on load, runs Pagefind, and renders results. Each result link appends `#:~:text=<query>` for native browser text highlighting.

The search bundle is not present during `npm run dev`. Test with `npm run build && npm run preview`.

## Microformats 2 (MF2)

Applied as static classes directly in Astro templates. No runtime JS required.

- **Feed pages**: `h-feed` + `p-name` + hidden `h-card p-author` containing `u-photo`, `p-name`, `u-url`
- **All cards**: `h-entry` with `dt-published`, `u-url`
- **ArticleCard**: `p-name`, `p-summary`; tags as `p-category`
- **BlueskyCard**: `e-content` for rich text, `u-in-reply-to` on reply link, `u-photo` on embedded images
- **CheckinCard**: nested `p-checkin h-card` with `p-name`, `p-latitude`, `p-longitude`, `p-street-address`; `p-rating` (hidden) when present
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

Build command: `npm run build`. Deploy command: `npx wrangler deploy`.

`npm run build` runs `astro build` followed by `scripts/notify-pushover.ts` — POSTs a success notification to Pushover. Exits silently if tokens are not set.

Required build env vars (set in CF Workers Builds): `PUSHOVER_TOKEN`, `PUSHOVER_USER`

### PDS polling — `cloudflare/pds-poller`
A Cloudflare Worker with a cron trigger (`*/15 * * * *`). Fetches the latest record CID from the PDS for each monitored collection, compares against previously seen CID in Workers KV (`binding: CIDS`). If any CID changed, updates KV and POSTs to the Workers Builds deploy hook.

Monitored collections: `app.bsky.feed.post`, `app.beaconbits.beacon`, `com.barryfrost.checkin`, `social.popfeed.feed.review`, `buzz.bookhive.book`, `site.standard.document`, `site.standard.graph.subscription`, `social.grain.gallery`, `social.grain.gallery.item`, `social.grain.photo`

Required secrets: `DEPLOY_HOOK`

### `scaffold.yml`
Manual `workflow_dispatch` for creating article/weeknote stubs. Inputs: `kind`, `title_or_topic`, `emoji`, `tags`, `date`. Runs `scripts/new-article.ts` or `scripts/new-weeknote.ts --no-git`, opens a draft PR via `peter-evans/create-pull-request`.

Required secrets: `GH_PAT`

### Blob proxy — `cloudflare/blob-proxy`
A Cloudflare Worker at `cdn.barryfrost.com` that proxies and transforms PDS image blobs (PDS blobs are `cache-control: private`, preventing CF from caching via `/cdn-cgi/image/`).

URL contract: `https://cdn.barryfrost.com/blob?cid=<cid>&w=<width>&h=<height>&fit=<fit>&q=<quality>`

- Transforms via `fetch(blobUrl, { cf: { image: {...} } })`
- Returns `cache-control: public, max-age=31536000, immutable`
- Uses `caches.default` for edge caching
- Frontend helper: `blobImage(cid, opts)` in `src/lib/image-url.ts`

### Why the workers are separate

Both workers live in `cloudflare/` as standalone wrangler projects. The main app is `output: 'static'` with no SSR adapter — `src/pages/*.ts` endpoints are pre-rendered at build time. Folding either worker in would require `@astrojs/cloudflare` + SSR. `pds-poller` requires a cron handler; `blob-proxy` operates on a different hostname.

## Key Conventions

- **Minimal JS** — `/checkins` loads Leaflet + Leaflet.markercluster (CDN) for the cluster map with fullscreen toggle; all other pages are JS-free
- **No runtime JS elsewhere** — MF2, dark mode, and layout are pure HTML/CSS
- **Local Markdown is canonical** — PDS documents are syndication targets, not source of truth
- **Images served on demand** — source blobs stay in the PDS; Cloudflare Image Transformations fetches, resizes, converts to WebP, and edge-caches on first request
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

1. Create `src/lib/loaders/{type}.ts` — implement `Loader`, use `fetchAllRecords`, build image URLs with `blobImage()` or `transformImage()` from `src/lib/image-url.ts`
2. Add collection to `src/content.config.ts` with a Zod schema
3. Create `src/components/posts/{Type}Card.astro`
4. Add an index page (`src/pages/{type}/index.astro`) and paginated page (`src/pages/{type}/page/[page].astro`) using `paginateItems`
5. Add collection NSID to the `COLLECTIONS` array in `cloudflare/pds-poller/src/index.ts` and the `PRETTY` label map
6. Link from the homepage or footer as appropriate

## One-off Import Scripts

| Script | Purpose |
|---|---|
| `scripts/backfill.ts` | Convert v6 JSON posts (articles/weeknotes) → local Markdown |
| `scripts/import-grain-photos.ts` | Import v6 photo posts to grain.social as PDS records |
| `scripts/export-notes-csv.ts` | Export all v6 `post-type: note` records to CSV for review before Bluesky import |
| `scripts/import-notes-bsky.ts` | Import approved notes from CSV to PDS as `app.bsky.feed.post` records |
| `scripts/delete-imported-notes-bsky.ts` | Delete all records previously imported by `import-notes-bsky.ts` |
