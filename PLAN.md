# barryfrost.com v7

Personal website for Barry Frost — statically generated, IndieWeb-compliant, deployed to Cloudflare Pages.

## Stack

- **Astro 6** — static output (`output: 'static'`), `build.format: 'file'`
- **`@astrojs/mdx`** — MDX support; `.md` and `.mdx` files coexist in all content collections
- **Tailwind CSS v4** — via `@tailwindcss/vite` plugin, `@tailwindcss/typography` for prose
- **`@astrojs/rss`** — RSS feed generation
- No SSR adapter; pure static build

## Content Sources

Two sources are merged into a single unified feed at build time:

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

| Collection | Loader | Feed type |
|---|---|---|
| `app.bsky.feed.post` | `bluesky.ts` | `bluesky` |
| `app.beaconbits.beacon` + `com.barryfrost.checkin` | `checkins.ts` | `checkin` |
| `social.popfeed.feed.review` | `films.ts` | `film` |
| `buzz.bookhive.book` | `books.ts` | `book` |
| `social.grain.gallery` + `.gallery.item` + `.photo` | `photos.ts` | `photo` |
| `app.rocksky.album` | `albums.ts` | (Now page "Listening" only — not feed entries) |
| `site.standard.document` | `documents.ts` | (enrichment only — not feed entries) |
| `site.standard.graph.subscription` | `subscriptions.ts` | (blogroll only) |

The `documents` collection maps AT URIs to local articles/weeknotes for MF2 syndication links — it does not produce duplicate feed entries.

Blogroll blogs come from `src/data/blogroll.json` (static JSON).

### Loader pattern
Each PDS loader implements `Loader` from `astro/loaders`:
- `store.clear()` at the start (full refresh each build)
- Iterates `fetchAllRecords(collection, DID, PDS_HOST)` from `src/lib/pds.ts`
- Builds image URLs via `transformImage(sourceUrl, opts)` from `src/lib/image-url.ts` — returns a Cloudflare Image Transformations URL (`https://new.barryfrost.com/cdn-cgi/image/{params}/{sourceUrl}`). Source blobs stay in the PDS; CF fetches, transforms, and edge-caches on first request. Pass dimensions at 2× the CSS display size for retina (e.g. `width: 192` for a 96px display slot). Accepts `fit: 'cover'` (default) or `fit: 'contain'` to preserve aspect ratio. Blogroll favicons bypass this and use the Google Favicons API URL directly.
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
| `/archives/{year}/{month}/` | Monthly archive (all types) — h1 shows full month name; checkins map (if month has checkins with coordinates) below title; prev/next month nav below items |
| `/tags/{tag}` | Tag filter |
| `/{slug}` | Slash pages (about, colophon, etc.) |
| `/travelblog/{num}` | Travel blog entries |
| `/feed.xml` | RSS feed (articles + weeknotes, latest 10, full content) |
| `/feed.json` | JSON Feed v1.1 (same content as RSS) |

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
  - All external-service cards except `FilmCard` render a styled service pill next to the date that links to the item on the originating service (Bluesky, Bookhive, Beaconbits, Grain). `CheckinCard` shows the Beaconbits pill only for `beaconbits`-source entries; Foursquare/Swarm entries sourced via `com.barryfrost.checkin` have no pill.
  - External-service card title links include a Heroicons micro `arrow-top-right-on-square` icon (16px, filled, `inline size-3.5 ml-1 align-middle`) to signal navigation away from the site
  - `ArticleCard` shows tags as visible linked pills (linking to `/tags/{tag}`) below the title/summary, with the date rendered after the tags in `text-xs`
  - All card timestamp/metadata rows use `text-xs`
  - `BlueskyCard` renders up to 4 embedded images below the post text at fixed 96px height preserving aspect ratio; each image has `mb-1` bottom margin. Quote posts (`app.bsky.embed.record` / `app.bsky.embed.recordWithMedia`) are rendered via `BlueskyQuote.astro` — a left-bordered blockquote showing the quoted author's display name and handle, and the quoted post text with rich-text facets. Hydration calls `public.api.bsky.app/xrpc/app.bsky.feed.getPosts` at build time; unavailable/deleted quotes show a placeholder.
  - `PhotoCard` — single-photo galleries use a side-by-side layout on `sm`+ (120px square thumbnail left, title/description/date right); stacked on narrow viewports. Multi-photo galleries render all thumbnails in a horizontally scrollable (`overflow-x-auto`) flex row of 120px square thumbnails above the title. Each thumbnail links to a locally hosted full-size WebP (max 2000×2000, `inside` fit, preserving aspect ratio). `description` (from `social.grain.gallery`) renders as `p-summary` below the title when present.

## Date Formatting

`src/lib/dates.ts` exports two display formatters:
- `formatDate(date)` — "22 April 2026" (full month name). Used for dates displayed *under* weeknote titles (`WeeknoteCard`, `Post.astro`) and travelblog entry dates (`[num].astro`).
- `formatDateShort(date)` — "22 Apr 2026" (abbreviated month). Used everywhere else: all card timestamps (including `ArticleCard`), `now.astro`, travelblog nav, weeknotes index.

## Styling

Tailwind v4 with default palette. `src/styles/global.css` imports `@tailwindcss/typography` and sources `../content/**/*.{md,mdx}` so Tailwind scans all content files for utility classes. Dark mode is CSS-only via `prefers-color-scheme` — no JS toggle. Custom colour theme and accent link styles have been removed pending a redesign.

### Images in content

Use `<Image />` from `astro:assets` in `.mdx` files to apply Tailwind classes to images — it auto-infers dimensions, converts to WebP, and adds `loading="lazy"` / `decoding="async"`:

```mdx
import { Image } from 'astro:assets';
import myPhoto from '../../assets/photo.jpg';

<Image src={myPhoto} alt="..." class="float-right ml-8 rounded" />
```

## Search

Static search via [Pagefind](https://pagefind.app). After `astro build`, the build script runs `pagefind --site dist` which indexes the built HTML and emits a self-contained bundle into `dist/pagefind/`. The bundle ships automatically with the rest of `dist/` when Wrangler deploys.

**Scope:** Only pages with `data-pagefind-body` are indexed — articles, weeknotes, travelblog entries, and slash pages (`/about`, `/work`, `/now`, etc.). Feed-only content types (notes, checkins, photos, films, books) have no individual URL and are excluded. All listing/feed/tag/archive/paginated routes are excluded by omission. Navigation elements within indexed pages (`data-pagefind-ignore`) are also excluded: the hidden MF2 author h-card, the AT Protocol syndication footer, and the weeknote prev/next nav and "Previous years" aside.

**UI:** A plain `<form action="/search">` in the header (no JS) navigates to `/search?q=…`. The `/search` page (`src/pages/search.astro`) reads the query from the URL, runs Pagefind, and renders results. Typing on the search page updates the URL via `history.replaceState` so the back button restores results. Each result link appends `#:~:text=<query>` so the browser natively scrolls to and highlights the matched text on the destination page. URLs have the `.html` suffix stripped to match the site's canonical URL convention (`build.format: 'file'`).

The search bundle is not present during `npm run dev` — the page shows a dev-mode message instead. Test search with `npm run build && npm run preview`.

## Microformats 2 (MF2)

Applied as static classes directly in Astro templates so IndieWeb parsers (XRay, Monocle, pin13) classify posts correctly via [Post-Type Discovery](https://indieweb.org/Post_Type_Discovery). No runtime JS required.

- **Feed** (`src/layouts/Feed.astro`): `h-feed` + `p-name` + hidden `h-card p-author` containing `u-photo` (`/barryfrost.jpg`, 192×192), `p-name`, `u-url` — parsers attach this author to every child entry
- **All cards**: `h-entry` with `dt-published`, `u-url`, optional `p-category` entries from `categories` frontmatter
- **ArticleCard / WeeknoteCard**: `p-name`, `p-summary`; article tags are emitted as `p-category` on visible `<a>` elements (text content = tag value); weeknotes also emit an implicit `p-category="weeknotes"`
- **BlueskyCard**: `e-content` for rich text, `u-in-reply-to` on reply link, `u-photo` on each embedded image
- **CheckinCard**: nested `p-checkin h-card` with `p-name`, `p-latitude`, `p-longitude`, `p-street-address`; `p-rating` (hidden) when present; hidden `u-url` as a direct child of `h-entry` so parsers attribute the OSM URL to the entry rather than the venue h-card. For `com.barryfrost.checkin` records with photos: a single photo uses a side-by-side layout (photo left, text right, mirrors PhotoCard) with a link to the full-size 720×720 WebP; multiple photos render as a 2-column grid above the text, each also linked to their full-size image.
- **FilmCard**: nested `p-item h-cite` with `u-photo` (poster) and hidden `p-name u-url`; numeric `p-rating` exposed via `<data value=...>` alongside star glyphs
- **BookCard**: nested `p-read-of h-cite` with `u-photo` (cover), hidden `p-name u-url`, `p-author`
- **PhotoCard**: `u-photo` on each gallery thumbnail (each wrapped in an `<a>` linking to the full-size image), `p-location` on address, `p-name u-url` on title

Image `src` attributes use `new URL(path, Astro.url).href` — `Astro.url` reflects the current host, so images resolve against `localhost` in dev and `https://new.barryfrost.com` in production builds. Non-image absolute URLs (canonical, og:url, h-card `u-url`, RSS) use `Astro.site` / `context.site`.

## Feeds

`/feed.xml` — RSS feed; articles + weeknotes only, latest 10, full HTML content rendered via `AstroContainer`. `trailingSlash: false` is passed to `@astrojs/rss` so item `<link>` / `<guid>` URLs match the site's no-trailing-slash convention.

`/feed.json` — JSON Feed v1.1; same content and query as RSS. Top-level `authors` block includes name, URL, and avatar. Items include `id`, `url`, `title`, `content_html`, `date_published` (RFC 3339), and `summary` when present. Served with `Content-Type: application/feed+json`.

Both feeds are advertised via `<link rel="alternate">` in `BaseHead.astro`.

## Favicon & Icons

All icon files in `public/` are derived from `public/barryfrost.jpg` (192×192 portrait):

| File | Size | Purpose |
|---|---|---|
| `favicon.ico` | 32×32 | Legacy browsers |
| `favicon.svg` | — | Modern browsers (SVG wrapper around 32×32 PNG) |
| `apple-touch-icon.png` | 180×180 | iOS home screen |
| `icon-192.png` | 192×192 | Android / PWA |
| `icon-512.png` | 512×512 | Android PWA splash (upscaled) |
| `site.webmanifest` | — | PWA metadata (name, icons, theme colour) |

`BaseHead.astro` links all four via `<link rel="icon">`, `<link rel="apple-touch-icon">`, and `<link rel="manifest">`.

## Canonical URLs

`BaseHead.astro` normalises `Astro.url.pathname` before building the canonical/og:url: `/index.html` → `/`, and strips the `.html` suffix on other paths (required because `build.format: 'file'`).

## Deployment

**Cloudflare Workers Static Assets + Workers Builds**

The site is a Cloudflare Worker serving static assets (`wrangler.toml` at repo root, `[assets] directory = "./dist"`). Builds and deploys are handled by Cloudflare Workers Builds (connected to the GitHub repo), replacing the old GitHub Actions workflows.

### Build
Workers Builds triggers on push to `main` and on PRs (auto-generates preview URLs and posts them as PR comments). Build command: `npm run build`. Deploy command: `npx wrangler deploy`.

`npm run build` runs `astro build` followed by `scripts/notify-pushover.ts` — a short script that POSTs a success notification to the Pushover API. It exits silently if `PUSHOVER_TOKEN`/`PUSHOVER_USER` are not set, so local builds are unaffected.

Required build environment variables (set as encrypted vars in CF Workers Builds settings): `PUSHOVER_TOKEN`, `PUSHOVER_USER`

### PDS polling — `cloudflare/pds-poller`
A Cloudflare Worker (`name: pds-poller`) with a cron trigger (`*/15 * * * *`) that reliably fires every 15 minutes. For each monitored collection it fetches the latest record CID from the PDS and compares it against the previously seen CID stored in Workers KV (`binding: CIDS`). If any CID changed, it updates KV and POSTs to the Workers Builds deploy hook to trigger a rebuild.

Monitored collections: `app.bsky.feed.post`, `app.beaconbits.beacon`, `com.barryfrost.checkin`, `social.popfeed.feed.review`, `buzz.bookhive.book`, `site.standard.document`, `site.standard.graph.subscription`, `social.grain.gallery`, `social.grain.gallery.item`, `social.grain.photo`

Required secrets (set via `wrangler secret put`): `DEPLOY_HOOK`

### `scaffold.yml`
Manual `workflow_dispatch` form for creating a new article or weeknote stub from any device. Inputs: `kind` (article/weeknote), `title_or_topic`, `emoji`, `tags`, `date`. Runs `scripts/new-article.ts` or `scripts/new-weeknote.ts --no-git`, then uses `peter-evans/create-pull-request` to open a draft PR. The PR triggers a Workers Builds preview deployment automatically.

Required secrets: `GH_PAT` (PAT with `repo` scope — PRs created with `GITHUB_TOKEN` do not fire `pull_request` events)

### Blob proxy — `cloudflare/blob-proxy`
A Cloudflare Worker (`name: blob-proxy`) served at `cdn.barryfrost.com` that proxies and transforms PDS image blobs. It exists because PDS blobs are served with `cache-control: private`, which prevents Cloudflare from caching transformed results through the URL-based `/cdn-cgi/image/` path.

URL contract: `https://cdn.barryfrost.com/blob?cid=<cid>&w=<width>&h=<height>&fit=<fit>&q=<quality>`

- Hardcoded to the main DID (`did:plc:j5ksi3y4tdtbp7vpsxsfyask`). Third-party DIDs (subscriptions) still use the `/cdn-cgi/image/` path via `transformImage()`.
- Transforms via `fetch(blobUrl, { cf: { image: { width, height, fit, quality, format } } })` — uses the zone's existing Cloudflare Image Transformations, no extra binding required.
- Auto-negotiates output format from the `Accept` header (AVIF > WebP > JPEG).
- Returns `cache-control: public, max-age=31536000, immutable` — safe because CIDs are content-addressed.
- Uses `caches.default` (Workers Cache API) to store responses at the edge; cache hits bypass PDS fetch and image transformation entirely.
- Passthrough mode (no `w`/`h` params): proxies the original blob with rewritten immutable headers.
- DNS: `cdn.barryfrost.com` — a proxied Cloudflare record pointing to the worker via route `cdn.barryfrost.com/*`.
- Deployed manually: `cd cloudflare/blob-proxy && npm run deploy`.

Frontend helper: `blobImage(cid, opts)` in `src/lib/image-url.ts` generates `cdn.barryfrost.com/blob?...` URLs. Used by checkins, photos, bluesky, and books loaders. Films and subscriptions continue to use `transformImage()` (external/third-party URLs).

### Image Transformations
Cloudflare Image Transformations is enabled on the zone. Used by subscriptions (third-party DIDs via `transformImage`) and films (TMDB posters via `transformImage`). Main-DID blob images now go through the `blob-proxy` worker instead.

Allowed source origins for `/cdn-cgi/image/`:

| Origin | Path prefix |
|---|---|
| `bsky.social` | `/xrpc/com.atproto.sync.getBlob` |
| `cdn.bsky.app` | `/img/` |
| `*.host.bsky.network` | `/xrpc/com.atproto.sync.getBlob` |
| `image.tmdb.org` | _(none)_ |
| `i.scdn.co` | _(none)_ — Spotify album art for Rocksky covers |

Blogroll favicons (`www.google.com/s2/favicons`) are served directly and do not go through CF Image Transformations.

## Key Conventions

- **Minimal JS** — the `/checkins` page and monthly archive pages (when the month contains checkins with coordinates) load Leaflet + Leaflet.markercluster via dynamic `createElement` (CDN) for the cluster map, with a fullscreen toggle button (expand/collapse icons, Escape key support); all other pages are JS-free
- **No runtime JS elsewhere** — MF2, dark mode, and layout are pure HTML/CSS
- **Local Markdown is canonical** — PDS documents are syndication targets, not the source of truth
- **Images served on demand** — source blobs stay in the PDS; Cloudflare Image Transformations fetches, resizes, converts to WebP, and edge-caches on first request. No `public/images/` directory; build time is ~15s rather than ~90s
- **`@/` import alias** — `tsconfig.json` maps `@/*` → `src/*`; all internal imports use `@/layouts/...`, `@/lib/...`, etc. rather than relative `../../` paths
- **`visibility: unlisted`** frontmatter hides articles/weeknotes from feeds (but pages still generate)
- **`build.format: 'file'`** — generates `about.html` not `about/index.html`
- **`compressHTML: false`** — keeps HTML readable

## Authoring New Content

Scaffolding scripts create a correctly-formatted stub, branch, commit, and draft PR in one step.

### Local CLI

```sh
npm run new:article -- --title "Some Title" [--tags "foo,bar"] [--date YYYY-MM-DD]
npm run new:weeknote -- --topic "Sofa" [--emoji "🛋️"] [--tags "foo,bar"] [--date YYYY-MM-DD]
```

Both commands: verify the working tree is clean on `main`, create a `content/...` branch, write the stub, commit, push, and open a draft PR via `gh`. The existing `preview.yml` then deploys a Cloudflare preview.

### Shared implementation

| Module | Responsibility |
|---|---|
| `scripts/lib/scaffold.ts` | Pure helpers: `slugify`, `escapeYaml`, `nextWeekNumber`, frontmatter renderers, `writeStub` |
| `scripts/new-article.ts` | Article CLI — slug from title, writes `src/content/articles/{slug}.md` |
| `scripts/new-weeknote.ts` | Weeknote CLI — week = `max(existing) + 1`, writes `src/content/weeknotes/{N}-{slug}.md` |

Both CLIs accept `--no-git` (or detect `CI=true`) to skip all git/gh operations — used by `scaffold.yml`.

### Weeknote conventions

- Week numbers are sequential integers starting at 1 (not ISO weeks).
- Filename: `{N}-{slugified-topic}.md` — e.g. `244-sofa.md`.
- Required frontmatter: `title`, `date`, `week` (unquoted integer). `emoji` is optional but conventional.
- Title format: `"Week {N} - {Topic}"` (en-dash hyphen with surrounding spaces).

## Adding a New PDS Content Type

1. Create `src/lib/loaders/{type}.ts` — implement `Loader`, use `fetchAllRecords`, build image URLs with `transformImage()` from `src/lib/image-url.ts`
2. Add collection to `src/content.config.ts` with a Zod schema
3. Add `'{type}'` to `FeedItem.type` union in `src/lib/feed.ts`
4. Fetch collection in `getUnifiedFeed()` and map to `FeedItem`
5. Create `src/components/posts/{Type}Card.astro`
6. Register in `src/components/FeedEntry.astro` components map (and add a service pill to the card's date row)
7. Add an entry to `src/components/TypeIcon.astro` (label + Heroicon path) for the left-gutter icon
8. Add collection NSID to the `COLLECTIONS` array in `cloudflare/pds-poller/src/index.ts` and the `PRETTY` label map

## One-off Import Scripts

| Script | Purpose |
|---|---|
| `scripts/backfill.ts` | Convert v6 JSON posts (articles/weeknotes) → local Markdown |
| `scripts/import-grain-photos.ts` | Import v6 `post-type: photo` posts to grain.social as PDS records (`social.grain.gallery` + `.photo` + `.gallery.item`). Downloads from original URLs (Cloudinary, S3, etc.), re-encodes JPEG under grain's 1 MB blob limit. Reads `BSKY_HANDLE` + `BSKY_APP_PASSWORD` from env. Tracks progress in `scripts/imported-grain-photos.json` (gitignored) for idempotent re-runs. `--dry-run`, `--limit N`, `--slug YYYY/MM/slug` flags. Run via `npm run import:grain`. |
| `scripts/export-notes-csv.ts` | Export all v6 `post-type: note` records (~1,637) to `scripts/notes-to-import.csv` for manual review before Bluesky import. Status column: `Y` (import), `N` (skip — already on Bluesky, deleted/private/draft, or embeds a tweet URL), `?` (needs review — has photo or >300 graphemes). Also includes a `length` column (grapheme count of rendered text). Run: `npx tsx scripts/export-notes-csv.ts`. |
| `scripts/import-notes-bsky.ts` | Import approved notes from `notes-to-import.csv` (rows with `status=Y`) to PDS as `app.bsky.feed.post` records. Uses `putRecord` with a TID rkey derived from the original `published` date so posts appear in the correct position on the Bluesky profile timeline. Builds richtext facets for markdown links and bare URLs (`#link`) and hashtags (`#tag`); @-mentions left as plain text. Decodes HTML entities from the mf2 source. Tracks progress in `scripts/imported-notes-bsky.json` (gitignored). `--dry-run`, `--limit N`, `--csv path` flags. |
| `scripts/delete-imported-notes-bsky.ts` | Delete all records previously imported by `import-notes-bsky.ts`, then clear `imported-notes-bsky.json` so the importer can re-run from scratch. Used to fix posts imported with wrong (current-time) TIDs. `--dry-run` flag. |

## Ideas / Backlog

- `/uses`, `/defaults`, `/pay`, `/contact` slash pages
- Gigs attended
