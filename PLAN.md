# barryfrost.com v7

Personal website for Barry Frost — statically generated, IndieWeb-compliant, deployed to Cloudflare Workers.

## Stack

- **Astro 7.1** — static output (`output: 'static'`), `build.format: 'file'`; Rust-based compiler (`@astrojs/compiler-rs`), Vite 8 bundler
- **`@astrojs/mdx`** — MDX support; `.md` and `.mdx` files coexist in all content collections
- **Tailwind CSS v4** — via `@tailwindcss/vite` plugin, `@tailwindcss/typography` for prose
- **`@astrojs/rss`** — RSS feed generation
- **`@astrojs/sitemap`** — sitemap generation; `astro.config.mjs` filters out `visibility: unlisted` articles/weeknotes (scanned from frontmatter at config load) plus `/search` and `/404`, and rewrites `.html` suffixes out of the emitted URLs
- No SSR adapter; pure static build

## Content Sources

### 1. Local Markdown/MDX (`src/content/`)
| Collection | Path | Notes |
|---|---|---|
| `articles` | `src/content/articles/` | Long-form posts; `.md` or `.mdx` |
| `weeknotes` | `src/content/weeknotes/` | Weekly notes, published Sundays; `.md` or `.mdx` |
| `pages` | `src/content/pages/` | Slash pages (about, colophon, etc.); `.md` or `.mdx` |
| `travelblog` | `src/content/travelblog/` | Archived travel blog (2000–2001), **one `.mdx` file per month** (`YYYY-MM.mdx`). Frontmatter: `countries` (ISO 3166-1 alpha-2 codes) + optional `intro` line; body holds that month's posts under `###` date headings with a `<Divider />` between entries (imported at the top of each file) |

Content files are plain `.md` by default. Use `.mdx` when a file needs Astro components — e.g. `<Image />` from `astro:assets` for images that require Tailwind utility classes.

### 2. AT Protocol PDS Records
Fetched at build time from `bsky.social` for DID `did:plc:j5ksi3y4tdtbp7vpsxsfyask` via custom Astro content loaders in `src/lib/loaders/`.

| Collection | Loader | Used in |
|---|---|---|
| `app.bsky.feed.post` | `bluesky.ts` | `/posts`, homepage latest post |
| `com.barryfrost.checkin` | `check-ins.ts` | `/check-ins`, homepage recent check-ins |
| `social.popfeed.feed.review` | `films.ts` | `/films` |
| `buzz.bookhive.book` | `books.ts` | `/books` |
| `social.grain.gallery` + `.gallery.item` + `.photo` | `photos.ts` | `/photos`, homepage recent photos |
| `app.rocksky.scrobble` | `scrobbles.ts` | `/music` — Top Albums, Top Artists, Recently Played |
| `site.standard.graph.subscription` | `subscriptions.ts` | `/blogroll` only |

> **Note on `com.barryfrost.checkin`:** The site route and code use `check-in` (hyphenated), but the AT Protocol NSID cannot follow suit — the spec only allows `[a-zA-Z0-9]` in NSID name segments (no hyphens). The NSID is therefore intentionally kept as `com.barryfrost.checkin`.
>
> This repo is the canonical home of the `com.barryfrost.checkin` lexicon doc: `lexicons/com/barryfrost/checkin.json`, published to the PDS as a `com.atproto.lexicon.schema` record via `npm run publish:lexicon` (the fsq2pds importer repo no longer keeps a copy). Records carry an optional `comment` field (the Swarm "shout" user comment); `check-ins.ts` exposes it in loader data, but no card/template renders it yet.

Blogroll blogs come from `src/data/blogroll.json` (static JSON), passed through `blogrollLoader()` so favicons/avatars are materialised into R2 like any other image.

`/work` is the exception to the table: it reads `id.sifa.profile.{self,position,education,project,skill,language}` records straight from the PDS via `src/lib/sifa.ts` (same `fetchAllRecords` helper) at page render, with no content collection and no loader.

### Loader pattern
Each PDS loader implements `Loader` from `astro/loaders`:
- `store.clear()` at the start (full refresh each build)
- Iterates `fetchAllRecords(collection, DID, PDS_HOST)` from `src/lib/pds.ts`
- All PDS/atproto reads go through `fetchWithRetry` in `src/lib/pds.ts`, which retries transient failures (429/500/502/503/504 and network errors) with exponential backoff before giving up. `bsky.social`'s shared PDS intermittently 500s on valid requests, and without retries a single blip aborts the whole build.
- Materialises images at build time via `pdsImage(cid, opts)` / `remoteImage(url, opts)` from `src/lib/image-store.ts` — fetches the source directly (PDS `getBlob` or remote URL), resizes with `sharp`, and stores as webp in R2. Returns an `images.barryfrost.com` URL on success, or the direct source URL on error/dev. Pass dimensions at 2× the CSS display size for retina (e.g. `width: 192` for a 96px display slot). Accepts `fit: 'cover'` (default) or `fit: 'contain'` to preserve aspect ratio.
- Stores entries with `generateDigest(record.cid)` for change detection

## Homepage

The homepage (`src/pages/index.astro`) is a curated view, not a unified feed. Sections rendered in order:

1. **Intro** — short bio (h-card with name/location lives in the sitewide `SiteHeader`) plus a line on how the site is built (atproto/PDS)
2. **Latest Weeknote** — emoji + title, truncated excerpt, link to all weeknotes. As on `/stream` and `/weeknotes`, the emoji sits outside the link and outside `p-name` — only the title is linked
3. **Recent Photos** — 8 most recent photo galleries in a scrollable flex row
4. **Featured Articles** — articles with `featured: true` frontmatter, sorted by date
5. **Latest Post** — most recent non-reply Bluesky post, rendered with the shared `BlueskyCard` (so images, quotes, and external embeds appear as on `/posts`); passed `indexable={false}` to keep the post out of the Pagefind index, since it is already indexed on `/posts`
6. **Recent Check-ins** — 5 most recent check-ins as a compact list
7. **Stream directory** — closing index of the seven Stream sections (Posts, Photos, Check-ins, Books, Films, Music, Blogroll) as icon + link + one-line description, under a lead-in linking to `/stream`. Driven by `STREAM_SECTIONS` in `src/lib/nav.ts` (parent entry skipped) + `SectionIcon`; gives Books/Films/Music/Blogroll their only homepage presence. Navigation, so it sits outside the `h-feed` wrapper

Each section is separated by the `Divider` component (`⁂`). Sections are omitted if no data is available.

## Pagination

Each paginated section is a single rest-param route (`src/pages/{type}/[...page].astro`) using Astro's built-in `paginate()` from `getStaticPaths` and the standard `Page` prop: page 1 renders at the bare section URL (`/posts`), page N at `/posts/{n}`. Default page size is 20 (`PAGE_SIZE` in `src/lib/feed.ts`); articles use 10, films 40.

`src/lib/feed.ts` exports `getFeedEntries(collection, opts?)` — fetches a collection, optionally filters and sorts (default: `createdAt` desc). Slicing into pages belongs to `paginate()`.

Paginated pages show `Title (Page N)` in both the h1 and the browser window title. The `Pagination` component shows all page numbers (no window/cap). Page-1-only content (section intros, the check-ins map, the books Reading column) is gated on `page.currentPage === 1` — note that slotted content can't be wrapped in a conditional (Astro extracts slots at compile time), so intros are hidden via `Feed.astro`'s `showDescription` prop instead.

## URL Structure

| URL | Content |
|---|---|
| `/` | Curated homepage |
| `/stream` | Unified activity timeline — 50 most recent items across all collections (except music), summarised, each linking to its canonical copy; MF2 `h-feed`. Labelled "Stream" in nav; `/log*` 301-redirect here |
| `/stream.xml` | RSS for the timeline (summaries only) |
| `/stream.json` | JSON Feed v1.1 for the timeline (summaries only) |
| `/articles` | Articles list |
| `/articles/{slug}` | Individual article |
| `/weeknotes` | Weeknotes grid — all entries, sorted by week number descending |
| `/weeknotes/week-{N}` | Individual weeknote with "Previously this week" aside and prev/next nav, shown in a right-hand column on wide viewports |
| `/feed.xml` | Unified RSS feed (articles + weeknotes, latest 10, full content) |
| `/feed.json` | Unified JSON Feed v1.1 (same as RSS) |
| `/posts` | Bluesky posts list |
| `/check-ins` | Check-ins list with Leaflet cluster map |
| `/films` | Films grid, sorted by watched date; 40 per page |
| `/films/by-rating` | Films grid sorted by rating descending |
| `/photos` | Photo galleries list |
| `/books` | Books — "Reading" and "Read" sections; two-column at lg |
| `/music` | Music — Top Albums grid, Top Artists ranked list with bars, Recently Played tracks; all aggregated at build time from scrobbles |
| `/work` | CV — career, education, skills from PDS records |
| `/blogroll` | "Websites" (blogs followed via Readwise Reader) + "Publications" (Standard.site subscriptions via Standard Reader) |
| `/search` | Pagefind search |
| `/{slug}` | Slash pages (about, colophon, etc.) |
| `/travelblog` | Archived 2000–2001 travel blog — horizontal photo strip, then an index listing each month with its countries and a one-line summary |
| `/travelblog/{YYYY-MM}` | A month's posts on one page (e.g. `/travelblog/2001-08`), under `###` date headings; countries shown as flag + name; prev/next month nav. Heading is `Travelblog - {month}`, the first part linking back to `/travelblog` — the only route back now that Travelblog is absent from the sitewide nav; only the month carries `p-name` |

All type-specific list pages have `/{type}/{n}` pagination except `/weeknotes` (all on one page). `/books` splits Reading/Read on page 1; Read continues to `/books/{n}`. Weeknote permalinks carry a `week-` prefix (`weeknoteUrl()` in `src/lib/urls.ts`) so their numeric IDs don't collide with the `/{type}/{n}` pattern.

Removed from v6: `/page/{n}` (unified paginated feed), `/archives/`, `/tags/`.

`public/_redirects` covers the v6 URLs that outlived their pages. v6 still serves `/archives`
and `/all`, so both 301 to `/`; `/feed` joins `/rss`, `/rss.xml` and `/index.xml` pointing at
`/feed.xml`. v6's tag pages live at `/categories/{tag}` — the two with a real v7 home are
mapped explicitly (`/categories/travelblog`, `/categories/weeknotes`) and the rest fall
through to `/categories/* → /search?q=:splat`, which carries the tag over as a search term
rather than dropping the visitor on a bare page. The `/20*` wildcard sends every dated v6
permalink not individually redirected above it to `archive.barryfrost.com`.

Static rules must precede wildcards in the file. The current set is ~290 static and 2 dynamic,
well inside Cloudflare's 2,000 static / 100 dynamic limits.

## Layouts & Components

- `Base.astro` — HTML shell, full-bleed `m-4 sm:m-8` body (no centred max-width; reading columns are capped per-element via `max-w-140` in `global.css`), dark mode via `prefers-color-scheme`; `lang="en-GB"`. Renders a visually-hidden "Skip to content" link (revealed on focus), then `<header><SiteHeader /></header>`, `<main id="main"><slot /></main>`, and `<footer><SiteFooter /></footer>` on every page.
- `SiteHeader.astro` — sitewide header, and the site's only navigation layer. Two `<nav>` rows, both `text-sm`: the first is the `h-card` (name, hidden `u-photo`/`p-locality`/`p-country-name`), a `⁂`, then About, Articles, Weeknotes; the second is the trace sections — Stream, Posts, Photos, Check-ins, Books, Films, Music, Work. On the homepage the name renders as an `h1`; elsewhere it's a link back to `/`. Every link has two states only: **bold, not a link** on the page you're on, plain underlined link everywhere else — no section highlighting, so `/articles/atmospheric` bolds nothing. `isCurrentPage()` in `src/lib/nav.ts` does the match: exact, plus a trailing all-digits segment so paginated listings (`/books/2`) still bold their own item. Travelblog is reachable only from the `/travelblog/{month}` heading and the sitemap.
- `SectionHeading.astro` — shared page-heading row used by `Feed.astro` and every standalone section host (`music`, `blogroll`, `work`, `[...slug]`). Renders the `<h1>` (default slot appends e.g. the `(Page N)` suffix) inside a wrapper whose margin the caller sets via `class`.
- `SectionIcon.astro` — maps a Stream section slug to its service icon (Posts→Bluesky, Photos→Grain, Check-ins→CheckIn, Books→BookHive, Films→Popfeed, Music→Rocksky, Blogroll→StandardSite); used only by the homepage Stream directory.
- `Feed.astro` — shared feed layout used by all list/paginated pages. Renders the `h-feed` wrapper, hidden `h-card p-author` MF2 author block, heading (with `(Page N)` suffix), optional named `description` slot, default slot for item content, and `<Pagination>` (suppressed via `paginate={false}` for books page 1). Props: `title`, `currentPage?`, `totalPages`, `basePath`, `paginate?`, `showDescription?` (set false on pages 2+ to hide the intro slot, since slots can't be conditionally passed).
- `FilmFeed.astro` — extends `Feed.astro` for `/films` and `/films/by-rating`: adds date/rating sort toggle and renders `FilmCard` in a responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`)
- `Post.astro` — individual article/weeknote with prose styles; "Posted in [Section] on [relative date]" (or "Posted on [relative date]") footer, followed by `Syndication` links when the post has `syndication` frontmatter. Optional `navAside` prop (set by weeknotes) moves the named `nav` slot into a right-hand column at `lg` and above; below that the columns collapse and the slot stacks under the body in source order. The columns align on `items-baseline` so the smaller aside text shares a baseline with the body's first line
- `Syndication.astro` — renders a post's `syndication` frontmatter URLs as icon + label links (`u-syndication`, `rel="syndication"`), prefixed with "and also on", after the timestamp in `Post.astro`. `serviceFor(url)` maps a URL's host to a known service (Bluesky, Mastodon, X/Twitter, Medium, LinkedIn, IndieNews) and its icon; an unrecognised host falls back to a bare hostname label with no icon
- `Divider.astro` — `⁂` separator; `my-8 text-xl`
- `SiteFooter.astro` — `Divider`, then a wrapping row holding the search form (submits to `/search`) and the secondary links — Colophon, Blogroll, Follow, Contact — followed by a copyright/licence line (CC BY 4.0) with a link to the GitHub source repo; rendered on every page. Links use the same two states as the header, via the same `isCurrentPage()`
Icon components in `src/components/icons/`:
- `ArticleIcon.astro`, `WeeknoteIcon.astro`, `CheckInIcon.astro` — document-text, calendar and map-pin glyphs (Heroicons 16/solid) used as `/stream` timeline node icons and, for check-ins, in `SectionIcon`; the content types with no service logo of their own
- `BlueskyIcon.astro` — monochrome Bluesky butterfly SVG, `currentColor`, `-translate-y-px` to align with text baseline
- `PdslsIcon.astro` — pdsls.dev graph SVG; links to the underlying PDS record on pdsls.dev
- `GrainIcon.astro` — grain.social logo; used in the `/photos` feed description and wherever grain.social links appear
- `BookHiveIcon.astro` — bookhive.buzz logo; used in the `/books` feed description, `SectionIcon`, and homepage Stream directory
- `PopfeedIcon.astro` — popfeed.social logo; used in the `/films` feed description, `SectionIcon`, and homepage Stream directory
- `RockskyIcon.astro` — rocksky music note icon; used in `SectionIcon` and the homepage Stream directory
- `RSSIcon.astro`, `JSONFeedIcon.astro`, `MF2Icon.astro`, `StandardSiteIcon.astro` — feed format icons; used on `/follow`
- `SifaIcon.astro` — sifa.id logo; used on `/follow` for the work profile link
- `MastodonIcon.astro`, `XIcon.astro`, `MediumIcon.astro`, `LinkedInIcon.astro`, `IndieNewsIcon.astro` — syndication-target logos used by `Syndication.astro` (Bluesky reuses `BlueskyIcon.astro`)

All icons accept an optional `class` prop to override the default sizing/alignment.

`StarRating.astro` renders a rating out of 10 as SVG stars (two rating points per star) — one filled star per whole star plus a trailing half-filled star, with no empty-star padding. The half is the outlined star path overlaid with a filled copy clipped by `clip-path: inset(0 50% 0 0)`; a CSS clip rather than an SVG `<clipPath>` so multiple ratings on one page can't collide on element ids. Used by `FilmCard` and `/stream`. The `/stream` RSS and JSON feeds keep a plain-text `★★★½` summary (`toStars` in `src/lib/timeline.ts`), since SVG isn't usable there.

The star glyph itself (Heroicons 24/outline) lives once as `STAR_PATH` in `src/lib/icons.ts`, shared by `StarRating` and the featured-article marker `StarIcon` so the two can't drift apart. `StarIcon` fills it solid; `StarRating` varies the fill per slot.

Card components in `src/components/posts/`:
- `ArticleCard` — title link, relative date with `title` attr, capitalised ("Today"/"Yesterday") because the date starts its own line
- `BlueskyCard` — rich text, embedded image thumbnails (each links to a larger version), external embed thumbnails (e.g. GIFs) linking to the source URL with alt from the embed's description, quote posts via `BlueskyQuote`, relative date, Bluesky icon link, pdsls icon link. An `indexable` prop (default `true`) gates the `data-pagefind-body` attribute so the card can be reused off the canonical `/posts` list (e.g. the homepage) without duplicate search indexing
- `CheckInCard` — venue name/category/address (name links to OpenStreetMap when lat/lon available), optional photo(s), relative date, pdsls icon link
- `FilmCard` — clickable poster linking to Popfeed, title, star rating, relative date, pdsls icon link
- `BookCard` — clickable cover linking to BookHive, title, authors, "Started/Finished [relative date]", pdsls icon link
- `PhotoCard` — horizontally scrollable thumbnails (multi) or side-by-side (single), title link to Grain gallery, relative date, pdsls icon link

All visible `<time>` elements use `formatDateRelative` for display, with `title={formatDateTitle(date)}` for the full date on hover and `datetime={toISODate(date)}` for machine readability. Hidden microformat-only `<time>` tags (e.g. the homepage photo/article/check-in lists) keep the absolute `formatDateShort` value.

## Date Formatting

`src/lib/dates.ts` exports:
- `formatDateRelative(date, now?)` — relative time ("today", "yesterday", "3 days ago", "5 hours ago") for dates within 14 days; falls back to `formatDateShort` beyond that. All-day (midnight-UTC) dates compare by whole Europe/London calendar days; timestamped dates resolve down to the second. Computed at build time — safe because the site rebuilds at least hourly. Used for every visible displayed date.
- `formatDate(date)` — "22 April 2026" (Europe/London). Used only inside `formatDateTitle`.
- `formatDateTitle(date)` — for `title` attributes: "22 April 2026" for date-only (or midnight-UTC) values; "22 April 2026 13:45:12 (GMT+1)" for timestamped values, using Europe/London time and offset.
- `formatDateShort(date)` — "22 Apr 2026". Used as the `formatDateRelative` fallback beyond the 14-day cutoff and for the hidden microformat-only `<time>` tags.
- `toISODate(date)` — ISO 8601 string for `datetime` attributes. Date-only values (midnight UTC) emit `YYYY-MM-DD`; timestamped values emit local Europe/London datetime with offset.
- `formatMonthYear(date)` — "October 2000" (UTC). `formatMonthKey("2000-10")` — "October 2000" from a travelblog month key. Both UTC-based, used by the travelblog month pages.
- Travelblog country flags/names are derived from ISO codes in `src/lib/flags.ts` (`countryFlag`, `countryName` via regional-indicator symbols + `Intl.DisplayNames`).

## Styling

Tailwind v4 with default palette. Work Sans as the primary font, self-hosted via Astro's Fonts API (downloaded from Google at build time; no runtime CDN request). `src/styles/global.css`:
- Imports `@tailwindcss/typography` and sources `../content/**/*.{md,mdx}`
- Sets `--font-sans` to `var(--font-work-sans)` (the CSS variable injected by `<Font cssVariable="--font-work-sans" preload />` from `astro:assets`; weights 400/600, normal + italic) and `--font-mono` to `ui-monospace, monospace` — the system monospace face, so code needs no font download
- Base `font-size: 16px` / `line-height: 26px`; `sm:` bumps to `18px` / `28px`
- `p`, `blockquote`, `.prose p`, `.prose ul`, `.timeline li` capped at `max-w-140`
- `.prose > :first-child > :first-child` — `margin-top: 0`. Typography only zeroes the top margin on `.prose > :first-child`, so a body opening with a list still leaks its first `li`'s margin upwards. That collapses away in normal flow but is contained once the column becomes a flex item (the weeknotes aside layout), which would otherwise drop the body a few pixels at that breakpoint
- `.prose a` / `.underline` — `text-underline-offset: 15%`; hover colour `text-amber-700 dark:text-amber-600`
- `.prose code::before` / `::after` — emptied, so inline code isn't wrapped in Typography's backticks
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

Omit `width`/`height` where possible — Astro then serves the image at its intrinsic size and
CSS scales it down, which stays sharp on retina. **If you do set an explicit `width`, set it to
the CSS display size and add `densities={[2, 3]}`**, otherwise Astro emits a single image at
that width with no `srcset` and it upscales (and blurs) on any DPR > 1. The `w-*` class and the
`width` prop must agree: `class="w-30"` is 120px, so `width={120} densities={[2, 3]}`. Note this
is the opposite convention to `image-store.ts`, where you pass 2× the display size yourself.

`Caption.astro` renders a small muted line (`text-xs text-gray-600 dark:text-gray-400 -mt-5 mb-8`) directly under an `<Image />` for a photo caption — used in the travelblog archive.

## Search

Static search via [Pagefind](https://pagefind.app). After `astro build`, `pagefind --site dist` indexes the built HTML and emits a self-contained bundle into `dist/pagefind/`.

**Scope:** Only pages with `data-pagefind-body`. Indexed content types:
- Articles (`/articles/{slug}`) — individual pages via `Post.astro`
- Weeknotes (`/weeknotes/{N}`) — individual pages via `Post.astro`
- Travelblog months (`/travelblog/{YYYY-MM}`) — one indexed page per month
- Slash pages (about, colophon, etc.) via `[...slug].astro`
- Static pages: `/work`, `/music`
- Bluesky posts and photo galleries — indexed per card on feed/paginated pages (`data-pagefind-body` on each `BlueskyCard`/`PhotoCard` `<article>`); search results link to the feed page. The homepage's Latest Post reuses `BlueskyCard` with `indexable={false}`, which omits `data-pagefind-body` entirely — note the attribute must be *absent* (not `="false"`, which Pagefind still treats as a body marker), so the card renders it as `{indexable ? '' : undefined}`
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
- **Article/weeknote pages** (`Post.astro`): `h-entry` with a hidden `u-url` anchor carrying the
  canonical URL. That anchor is deliberately **empty** — `u-url` reads the `href`, and it sits
  inside `data-pagefind-body`, so any text would be indexed and show up in the search excerpt of
  every post. Its href goes through `cleanPathname()` so it matches `rel=canonical` exactly
- **Stream page** (`/stream`): a vertical-line timeline grouped into Europe/London calendar days (continuous line via an absolutely-positioned rule). Day headings show a **day-granular relative date** (`formatDateRelativeDays` — "Today"/"Yesterday"/"N days ago", never hours; absolute short date beyond the 14-day cutoff), capitalised; grouping stays keyed on the absolute calendar day so the relative label can't split a day. Each item is an `h-entry` (`<li>`) whose node on the line is a circular badge holding the type's icon (`ring` matched to the page background so it masks the line); the text label is replaced by that icon. An optional non-link `titlePrefix` renders before the `u-url` link — the weeknote emoji (kept out of `p-name`) and `"Replied: "` on reply posts. MF2: hidden `p-author` `AuthorCard`, `u-url` on the canonical link, `dt-published` (visible clock time for timestamped items, `sr-only` for all-day), and a `p-name` (titled items) or `p-summary` (posts) lead plus an optional detail line — `p-rating` stars via `StarRating` for items carrying a `rating`, otherwise the plain-text `p-summary`. Type→icon: article→`ArticleIcon`, weeknote→`WeeknoteIcon`, post→`BlueskyIcon`, checkin→`CheckInIcon`, film→`PopfeedIcon`, book→`BookHiveIcon`, photo→`GrainIcon`, subscription→`StandardSiteIcon`
- **ArticleCard**: `p-name`, `p-summary`; tags as `p-category`
- **BlueskyCard**: `e-content` for rich text, `u-in-reply-to` on reply link, `u-photo` on embedded images
- **CheckInCard**: nested `p-checkin h-card` with `p-name`, `p-latitude`, `p-longitude`, `p-street-address`; `p-rating` (hidden) when present
- **FilmCard**: nested `p-item h-cite` with `u-photo` (poster) and hidden `p-name u-url`; numeric `p-rating` via `<data value=...>` wrapping the `StarRating` stars
- **BookCard**: nested `p-read-of h-cite` with `u-photo` (cover), hidden `p-name u-url`, `p-author`
- **PhotoCard**: `u-photo` on each thumbnail, `p-name u-url` on title

`BaseHead.astro` also emits IndieWeb discovery `<link>` tags in `<head>`: `rel="me"` (GitHub, Mastodon), `rel="me atproto"`, plus `webmention`, `microsub`, `authorization_endpoint` and `token_endpoint` for IndieAuth.

## Feeds

A single unified RSS feed and JSON feed carry both articles and weeknotes, interleaved by date. One feed URL (matching v6) means existing subscribers keep receiving posts when v7 takes over the apex domain.

| URL | Content |
|---|---|
| `/feed.xml` | RSS — articles + weeknotes, latest 10, full HTML content |
| `/feed.json` | JSON Feed v1.1 — same content |

`src/lib/feed-items.ts` (`getFeedItems`) is the shared source of truth: it merges both collections, filters `visibility: unlisted`, sorts by date descending, takes the latest 10, renders full content via `AstroContainer`, and **rewrites root-relative `src`/`href`/`srcset` URLs to absolute** so images (`astro:assets` `<Image>` and Markdown `![]()` both emit `/_astro/…` paths) resolve in feed readers. `trailingSlash: false` passed to `@astrojs/rss`. Advertised via `<link rel="alternate">` in `BaseHead.astro`; `/rss`, `/rss.xml`, `/index.xml`, `/feed` redirect to `/feed.xml` in `public/_redirects`.

### Stream (unified timeline)

Separate from the blog feed above: a broader **activity log** spanning every collection except music.

| URL | Content |
|---|---|
| `/stream` | HTML timeline — 50 most recent items, MF2 `h-feed` |
| `/stream.xml` | RSS — same items, summaries only |
| `/stream.json` | JSON Feed v1.1 — same items, summaries only |

`src/lib/timeline.ts` (`getTimelineItems(site)`) is the shared source of truth for all three: it merges `articles`, `weeknotes`, `blueskyPosts` (replies included), `check-ins`, `films`, `books`, `photos` and `standardSubscriptions`, filters `visibility: unlisted` (articles/weeknotes), normalises each to a `TimelineItem` (type, label, title, summary, canonical `url`, `local` flag, `date`), sorts by date descending and takes the latest 50. Canonical URLs reuse the per-type patterns from the card components (articles/weeknotes local and absolutised against `site`; posts→Bluesky, check-ins→OSM, films→Popfeed, books→BookHive, photos→Grain, subscriptions→the publication's site). Items carry **summaries, not full content** — readers click through to the canonical copy. Music (`scrobbles`) is deliberately excluded as too noisy. The page/feeds live at `/stream*` (the header labels it "Stream"); the route slug stays distinct from the frozen `/feed.*` blog feeds, and `/log*` 301-redirect here (renamed from the earlier "Log"). Advertised via a second pair of `<link rel="alternate">` tags in `BaseHead.astro`.

> Subscriptions have no date in their own schema; the `site.standard.graph.subscription` record's `createdAt` is surfaced through `subscriptions.ts` + `standardSubscriptions` schema so they can be timeline-ordered (any lacking it are skipped).

## Favicon & Icons

All icon files in `public/` are derived from `src/assets/me.jpg` (512×512 portrait) by `scripts/generate-icons.ts` — run `npx tsx scripts/generate-icons.ts` after changing the source photo:

| File | Size | Purpose |
|---|---|---|
| `favicon.ico` | 32×32 | Legacy browsers |
| `favicon.svg` | 32×32 PNG in an SVG wrapper | Modern browsers |
| `apple-touch-icon.png` | 180×180 | iOS home screen |
| `icon-192.png` | 192×192 | Android / PWA |
| `icon-512.png` | 512×512 | Android PWA splash |
| `barryfrost.jpg` | 192×192 | `u-photo` (header, author card) and JSON feed avatar |
| `site.webmanifest` | — | PWA metadata |

## Canonical URLs

`BaseHead.astro` normalises `Astro.url.pathname` before building canonical/og:url: `/index.html` → `/`, strips `.html` suffix on other paths (required because `build.format: 'file'`).

`cleanPathname()` (`src/lib/url.ts`) is that normaliser, and **anything emitting a post's own
absolute URL must go through it** — not just the `<head>`. `Post.astro`'s MF2 `u-url` is the
other caller: it previously built its href from the raw `Astro.url.pathname`, so every article
and weeknote advertised a `.html` URL to microformats consumers while `rel=canonical` said
otherwise, and XRay duly reported the `.html` form as the post's identity. Since webmention.io,
Bridgy and IndieNews all key off `u-url`, the two must agree.

## Response headers

`public/_headers` is served by Cloudflare Workers static assets (`astro preview` ignores it —
use the "Workers Preview" entry in `.claude/launch.json`, which runs `wrangler dev`, to see it
applied). It sets `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS, a
long immutable `Cache-Control` for `/_astro/*`, and a Content-Security-Policy.

The CSP is `default-src 'none'` with four deliberate loosenings, each documented in the file
itself: `'unsafe-inline'` for scripts (`/search` and `/check-ins` ship inline scripts, and
hashes can't be regenerated into a static file per build), `'wasm-unsafe-eval'` (Pagefind's
index is WebAssembly), `'unsafe-inline'` for styles (Astro inlines critical CSS; Leaflet sets
inline style attributes at runtime), and a broad `img-src https:` — `image-store.ts` falls back
to the direct source URL whenever R2 materialisation fails, and that origin may be any PDS,
AppView or CDN, so an allowlist would break images unpredictably.

The allowlisted hosts are all analytics: `cloud.umami.is` / `gateway.umami.is`, plus
`static.cloudflareinsights.com` and `cloudflareinsights.com` for Cloudflare Web Analytics.
That last pair is easy to miss when reasoning about the policy, because nothing in this repo
requests it — Cloudflare injects the beacon into the response at the edge, so the CSP has to
admit a script the markup never mentions.

## Deployment

**Cloudflare Workers Static Assets + Workers Builds**

The site is a Cloudflare Worker serving static assets (`wrangler.toml` at repo root, `[assets] directory = "./dist"`). Workers Builds triggers on push to `main` and on PRs (preview URLs posted as PR comments).

Build command: `npm run build` (`astro build` + `pagefind`). Deploy command: `npm run deploy` (`tsx scripts/release.ts`), a single build → deploy → Standard.site publish → Pushover orchestrator, so a failure in either the Astro build or `wrangler deploy` is caught and reported — the old `build && deploy && notify` chain went silent on a build failure.

`wrangler` is a pinned devDependency so `npx wrangler` resolves it from the restored dependencies cache rather than downloading it (~12s) on every build, and the version stays fixed rather than silently tracking the latest `4.x`.

`release.ts` runs `wrangler deploy`, then (gated behind `PUBLISH_STANDARD_SITE`) syndicates articles/weeknotes to Standard.site, then pulls a content summary from the pds-poller Worker and only sends a Pushover notification if there is one — so hourly-cron and code-push rebuilds with no content changes stay silent. On any failure it always notifies (high priority) and exits non-zero so Cloudflare marks the build failed.

`wrangler.toml` also declares `[build] command = "npm run build"`. wrangler runs this before both `deploy` and `versions upload`, so **PR-preview builds** (whose deploy command is a bare `npx wrangler versions upload`) produce `./dist` too — without it the preview upload fails with "assets.directory … does not exist". This `[build]` hook is the single source of the build for both paths: `release.ts` does *not* build explicitly before `wrangler deploy` (doing so built the whole site twice, ~2x deploy time), it relies on the hook firing during deploy just as previews do.

Required build env vars (set in CF Workers Builds): `PUSHOVER_TOKEN`, `PUSHOVER_USER`, `NOTIFY_SECRET`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `IMAGES_BASE_URL`

### PDS poller — `cloudflare/pds-poller`
A Cloudflare Worker that detects PDS changes by polling every 60 seconds, driven by a `* * * * *` cron trigger.

**Why polling, not a websocket.** The prior design (`pds-firehose`) held a Jetstream websocket open from a Durable Object. A single-DID filtered Jetstream subscription has no heartbeat, so a silently-dead socket was indistinguishable from a quiet repo, and commits made while the socket was deaf were never delivered (reconnects are live-only). This failed repeatedly — a post once sat undetected for 15+ minutes despite the status endpoint reporting `connected: true`. Heuristic watchdogs shrank but couldn't close the window. A poll makes every failure mode a visible HTTP error that self-heals on the next cycle, at the cost of a worst-case detection latency of ~60–70s (still well inside the ~2-minute goal).

**A minute cron drives the poll — no DO alarms.** The `* * * * *` trigger calls `stub.fetch('/poll')` on a singleton `PdsPoller` Durable Object (`idFromName('singleton')`) every minute; the schedule is externally guaranteed by Cloudflare, so there's no self-perpetuating alarm chain or liveness ping to maintain. The DO still holds the state (per-collection record maps, pending notification summary) rather than KV, because DO storage gives atomic single-threaded read-modify-write, which the `/pending-notification` drain relies on — a plain scheduled Worker writing to KV could race a build's GET and drop or duplicate a notification.

**A repo-rev gate keeps the common case to one request.** Each cycle first calls `com.atproto.sync.getLatestCommit?did=<DID>` and compares the returned `rev` against the stored value. The rev changes on *any* commit to the repo — including collections we don't watch (likes, follows, reposts) and the build's own `site.standard.document` writes — so a rev change doesn't by itself mean a watched collection changed; it just means it's worth checking. Most minutes the rev is unchanged and the whole poll costs one subrequest. If the rev check itself fails, the poll fails open (scans anyway) rather than going blind.

**`getLatestCommit` needs the real PDS host, not the entryway.** `bsky.social` (used everywhere else as `PDS_HOST`, per `src/lib/pds.ts`) proxies `com.atproto.repo.*` reads like `listRecords` unauthenticated, but returns 401 (`AuthMissing`) on `com.atproto.sync.getLatestCommit` for a repo that's migrated to its own PDS shard — ours resolves to `porcini.us-east.host.bsky.network`. The same call works unauthenticated sent directly to that shard. `resolvePdsHost()` looks it up once via `https://plc.directory/<DID>` (the `AtprotoPersonalDataServer` service endpoint) and caches the host in DO storage; if a cached host starts rejecting the call, the cache is dropped so the next cycle re-resolves.

**Full per-collection maps, not just the newest record.** When the rev has moved, every watched collection is fully paginated (`com.atproto.repo.listRecords`, 100/page) into a `rkey → cid` map, which is diffed against the stored map for that collection: a new key is `New`, a matching key with a different cid is `Updated`, and a missing key is `Removed`. Diffing the *whole* collection — not just comparing the newest record — is what catches an edit or delete of an older record; an earlier version of this design compared only `records[0]` and missed those. The first poll after a (re)deploy has no stored baseline, so it scans once and persists it without deploying — otherwise deploying the Worker would fire a spurious rebuild.

**One changed collection → one deploy.** Changes landing in the same minute (e.g. one article syndicating to several collections) coalesce naturally into a single deploy-hook POST, since they're all diffed and deployed within the same `/poll` invocation — no debounce timers needed. A `deployPending` flag is persisted so a deploy-hook network failure retries on the next cycle; it's cleared once the hook returns *any* HTTP response (retrying a non-2xx forever would loop).

**Hourly fallback rebuild.** A second `0 * * * *` cron POSTs the deploy hook unconditionally, direct from the top-level `scheduled()` handler (bypassing the DO). This is belt-and-braces for a build that failed for a reason the deploy hook can't see (e.g. the PDS unreachable at build time) — the full-map diff above means there's no longer a detection blind spot for it to paper over. Distinguished from the minute poll via `event.cron`.

**Load.** Most minutes: one `getLatestCommit` call (~1.4k/day). On the minutes the rev has moved, a full paginated scan of the eight watched collections — the two largest (`app.bsky.feed.post`, `com.barryfrost.checkin`) are ~1,300–1,400 records each, so a scan is ~30 `listRecords` calls total. Rev-changing writes are infrequent for a personal site, and even a scan every few minutes stays well under `bsky.social`'s per-IP limit of 3,000 requests per 5 minutes.

Watched collections (`WATCHED_COLLECTIONS`): `app.bsky.feed.post`, `com.barryfrost.checkin`, `social.popfeed.feed.review`, `buzz.bookhive.book`, `site.standard.graph.subscription`, `social.grain.gallery`, `social.grain.gallery.item`, `social.grain.photo`. `site.standard.document` is deliberately **not** watched — the build writes those records itself (`scripts/publish-standard-site.ts`), so watching them would loop.

Required secrets: `DEPLOY_HOOK` (same Workers Builds deploy-hook URL as before), `NOTIFY_SECRET` (gates `/pending-notification`).

### `check.yml`
Runs `astro sync` then `npm run check` (`tsc` via `astro check`) on **every push, every branch**. It is the only thing in the pipeline that checks types — `astro build` strips them with esbuild, `tsx` runs the scripts, wrangler bundles the Worker.

It **reports, it does not gate**: Workers Builds starts on the same push in parallel and never reads the Actions result, so a failure is a red X on the commit, not a blocked deploy. Gating inside the build isn't an option — a build can't tell a code push from a pds-poller content rebuild (same commit, no trigger reason exposed), so it would gate every content deploy too. Content deploys never run this job at all, which is correct: they can't introduce a type error.

`astro sync` is a separate step because it runs the loaders against the PDS and other upstream APIs — keeping it separate means a network failure upstream reads as a sync failure rather than a phantom type error.

### `scaffold.yml`
Manual `workflow_dispatch` for creating article/weeknote stubs. Inputs: `kind`, `title_or_topic`, `emoji`, `tags`, `date`. Runs `scripts/new-article.ts` or `scripts/new-weeknote.ts --no-git`, opens a draft PR via `peter-evans/create-pull-request`.

Required secrets: `GH_PAT`

### Image pipeline — R2 + sharp

Images are pre-generated **at build time** and served from an R2 bucket at `images.barryfrost.com`. No runtime resizing occurs.

`src/lib/image-store.ts` exposes two async helpers used by all loaders (the shared R2 primitives — signed client, HEAD/PUT, concurrency limiter, config detection — live in `src/lib/r2.ts`):
- `pdsImage(cid, opts)` — fetches blob from `bsky.social` via `com.atproto.sync.getBlob`
- `remoteImage(url, opts)` — fetches from the URL directly

Both functions:
1. Compute a content-addressed R2 key: `blob/{w}x{h}-{fit}-q{q}/{cid}.webp` or `ext/{w}x{h}-{fit}-q{q}/{sha256(url)[0:16]}.webp`
2. HEAD-check R2 — return `images.barryfrost.com/{key}` immediately if present (incrementality)
3. Otherwise fetch source → resize with `sharp` → encode as webp → PUT to R2 → return URL
4. On error or in dev (no R2 creds): return the direct source URL

R2 bucket `barryfrost-images` with custom domain `images.barryfrost.com`. `sharp@0.34.5` is available as Astro's transitive optional dependency and must **not** be added as a direct dep (macOS-generated lockfiles omit Linux platform binaries, breaking `npm ci` on CF's build runners).

#### Build-time concurrency

Every loader processes its records with bounded concurrency instead of a sequential `for await` loop, so `image-store.ts`'s R2/sharp work and per-record PDS/AppView lookups actually run in parallel:
- `src/lib/concurrency.ts` — `mapLimit(items, limit, fn)` helper and the shared `RECORD_CONCURRENCY` (32) constant, used by every loader in `src/lib/loaders/`
- the shared R2 concurrency limiter (`CONCURRENCY` 24, in `src/lib/r2.ts`) separately bounds the R2/sharp work specifically, regardless of how many records are in flight above it

This took "Syncing content" from 90s+ down to ~7s. The pattern for a loader: collect records from `fetchAllRecords` into an array first (cheap, no images involved), then `mapLimit(records, RECORD_CONCURRENCY, async (record) => {...})` over the per-record body (image fetch + any other network calls + `store.set`) — decoupling PDS pagination from per-record work.

### Head metadata — plain OpenGraph, no generated cards

No social images are generated. A share image appears only when the post itself contains
one; every other page gets a text-only preview. `BaseHead.astro` is pure template — it makes
no network or R2 calls.

- **Title and description are set on the layout tag** in `src/pages/`, and threaded down
  through `Base`/`Post`/`Feed` to `BaseHead`. `Feed` takes a plain-text `description` prop
  for the `<head>`; that is *separate* from its `description` **slot**, which is the rich
  visible intro copy (links, icon components) shown on the page. Feed sections keep their
  title + description together in `src/lib/sections.ts`, used by the section's
  `[...page].astro` route.
- **Articles and weeknotes** derive both from their rendered body via `socialMeta(entry)` in
  `src/lib/social.ts`: the body is rendered to HTML through the shared Astro container in
  `src/lib/container.ts`, then `stripHtml` + `truncate` give a 200-char description, and the
  first `<img>` gives `og:image` with its `alt`/`width`/`height`. Frontmatter `description`
  overrides the excerpt when set.
- `src/lib/container.ts` holds the one `experimental_AstroContainer` used to render bodies to
  HTML strings at build time, shared with `feed-items.ts`. It **must** register the MDX
  renderer (`loadRenderers([getContainerRenderer()])`) or any `.mdx` body throws
  `NoMatchingRenderer` — MDX compiles to JSX, which a bare container cannot render.
- Rendering the body — rather than regexing the Markdown source — is what makes `.md` and
  `.mdx` behave identically (both compile to plain `<img>`, and an MDX body's `import` block
  never leaks into the description), and it is the only way to learn an image's final
  content-hashed `/_astro/…` URL.
- `BaseHead.astro` always emits `og:site_name`, `og:title`, `og:description`, `og:url` and
  `og:type` (`article` + `article:published_time` when a `publishedDate` is passed, else
  `website`). `og:image` (+ `:alt`/`:width`/`:height`) and `twitter:card=summary_large_image`
  are emitted **only** when a post has a body image. Bluesky ignores `twitter:card` and
  always renders a large 1.91:1 card, so `og:image` + `og:description` are what matter.
- `src/lib/excerpt.ts` still serves in-page previews of *other* posts (the homepage's latest
  weeknote, the "Previously this week" list), where rendering each related body would be
  wasteful. It reads raw source, so it strips MDX imports and JSX itself.

### Why `pds-poller` is separate

`pds-poller` lives in `cloudflare/` as a standalone wrangler project. The main app is `output: 'static'` with no SSR adapter — `src/pages/*.ts` endpoints are pre-rendered at build time. Folding it in would require `@astrojs/cloudflare` + SSR, and it needs its own Durable Object + cron handler. It runs on the Workers Free plan (the DO uses the SQLite storage backend, required on Free); unlike the old always-on websocket, the DO here is only awake ~1–2s per minute to run a poll cycle, so DO duration usage is a few hundred GB-s/day rather than the ~10,800 of the 13,000 GB-s/day free allowance the always-open socket consumed.

## Key Conventions

- **Minimal JS** — two pages ship script of their own: `/check-ins` bundles Leaflet + Leaflet.markercluster via npm for the cluster map with fullscreen toggle (tiles from CARTO basemaps over OpenStreetMap data, light/dark variant chosen from `prefers-color-scheme`), and `/search` lazy-loads the Pagefind bundle. Every other page is JS-free apart from the sitewide analytics tag below
- **Umami analytics** — `BaseHead.astro` emits a `defer`red `cloud.umami.is/script.js` tag on every page, gated on `!import.meta.env.DEV` so it never loads in dev; events go to `gateway.umami.is`. The only third-party script the site's *own* markup requests
- **Two further third-party requests the markup doesn't ask for** — Cloudflare Web Analytics is injected at the edge (a beacon from `static.cloudflareinsights.com` reporting to `cloudflareinsights.com/cdn-cgi/rum`), and `/blogroll` hot-links `www.google.com/s2/favicons` for any blog whose favicon failed to materialise into R2. Both must be allowed in the CSP; disabling Web Analytics in the Cloudflare dashboard would remove the first
- **No runtime JS elsewhere** — MF2, dark mode, and layout are pure HTML/CSS
- **Local Markdown is canonical** — PDS documents are syndication targets, not source of truth
- **Images pre-generated at build time** — fetched from source (PDS `getBlob` / remote URL), resized with `sharp`, stored as webp in R2 (`images.barryfrost.com`); served statically with no runtime resizing. Dev/error fallback uses direct source URLs.
- **`@/` import alias** — `tsconfig.json` maps `@/*` → `src/*`
- **`visibility: unlisted`** frontmatter hides articles/weeknotes from feeds (pages still generate)
- **`build.format: 'file'`** — generates `about.html` not `about/index.html`
- **`compressHTML: false`** — keeps HTML readable
- **`featured: true`** frontmatter on articles — surfaces them on the homepage
- **`syndication`** frontmatter (array of URLs) on articles/weeknotes — the POSSE targets a post was cross-posted to; rendered as icon + label links after the timestamp on the post page (`Syndication.astro`)

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
| `scripts/new-weeknote.ts` | Weeknote CLI — week = `max(existing) + 1`, writes `src/content/weeknotes/{N}.md` |

Both CLIs accept `--no-git` (or `CI=true`) to skip git/gh operations — used by `scaffold.yml`.

### Weeknote conventions

- Week numbers are sequential integers starting at 1 (not ISO weeks)
- Filename: `{N}.md` — e.g. `244.md`; URL is `/weeknotes/week-{N}` (no title slug; the `week-` prefix keeps numeric IDs distinct from `/{type}/{n}` pagination URLs)
- Required frontmatter: `title`, `date`, `week` (unquoted integer). `emoji` optional but conventional
- Title format: `"Week {N} - {Topic}"` (hyphen with surrounding spaces), always quoted. Weeks
  1–46 originally used a colon (`"Week 25: Hibernation"`); all 257 now follow the hyphen form
- Bodies are a mix of CRLF and LF line endings. Anything rewriting these files in bulk must
  preserve them byte-for-byte (in Python, open with `newline=""`) or it will produce a diff
  touching every line of 227 files instead of the lines it meant to change

## Adding a New PDS Content Type

1. Create `src/lib/loaders/{type}.ts` — implement `Loader`, use `fetchAllRecords`, materialise images with `pdsImage(cid, opts)` or `remoteImage(url, opts)` from `src/lib/image-store.ts`
2. Add collection to `src/content.config.ts` with a Zod schema
3. Create `src/components/posts/{Type}Card.astro`
4. Add a paginated route (`src/pages/{type}/[...page].astro`) using `paginate()` with `getFeedEntries` and the `Feed.astro` layout
5. Add the collection NSID to `WATCHED_COLLECTIONS` and a label to `COLLECTION_NOUNS` in `cloudflare/pds-poller/src/index.ts`
6. Link from the homepage or footer as appropriate

## One-off Import Scripts

| Script | Purpose |
|---|---|
| `scripts/backfill.ts` | Convert v6 JSON posts (articles/weeknotes) → local Markdown |
| `scripts/import-grain-photos.ts` | Import v6 photo posts to grain.social as PDS records |
| `scripts/export-notes-csv.ts` | Export all v6 `post-type: note` records to CSV for review before Bluesky import |
| `scripts/import-notes-bsky.ts` | Import approved notes from CSV to PDS as `app.bsky.feed.post` records |
| `scripts/delete-imported-notes-bsky.ts` | Delete all records previously imported by `import-notes-bsky.ts` |
| `scripts/create-standard-publications.ts` | Upsert the two `site.standard.publication` records — name, description, theme, icon (`npm run standard:pubs`) |
| `scripts/assign-standard-rkeys.ts` | One-time: write `standardRkey` TIDs into article/weeknote frontmatter (`npm run standard:rkeys`) |
| `scripts/publish-standard-site.ts` | Upsert `site.standard.document` records + Bluesky card posts (`npm run publish:standard`) |
| `scripts/publish-lexicon.ts` | Upsert the canonical `com.barryfrost.checkin` lexicon doc to the PDS (`npm run publish:lexicon`) |
| `scripts/normalise-weeknote-titles.py` | One-time: rewrite `Week {N}: {Topic}` frontmatter titles to the `Week {N} - {Topic}` convention (weeks 1–46). Dry-run by default, `--apply` to write |

## Standard.site Publishing

Articles and weeknotes are syndicated to the AT Protocol long-form ecosystem
([Standard.site](https://standard.site)) as `site.standard.document` records grouped under
two `site.standard.publication` records (Articles at `/articles`, Weeknotes at `/weeknotes`).
Document `path`s mirror the site's URLs (`documentPath()` in `scripts/lib/standard-site.ts`),
so weeknotes use `/week-{N}`. Local Markdown stays canonical; the PDS records are syndication
targets.

- **Content**: full body embedded via the community `at.markpub.markdown` lexicon, plus a
  plaintext `textContent`; `description` is a hard truncation of the first 280 chars (never
  generated). Weeknote titles are prefixed with the emoji.
- **Config**: `src/lib/standard-site.ts` holds the DID + publication AT-URIs (single source
  of truth). The `/.well-known/site.standard.publication/{articles,weeknotes}` endpoints and
  the per-page verification `<link>` tags derive from it.
- **Verification tags**: document pages carry both `<link rel="site.standard.document">` and
  `<link rel="site.standard.publication">`; the publication root pages (`/articles`,
  `/weeknotes`) carry the publication tag alone. Bluesky requires the tag on publication home
  pages too — without it, it renders no enhanced link card for *any* post in that publication.
  `/articles/{n}` deliberately omits it, since only page 1 is the publication root.
- **Publication icon**: both publications share the site's existing 512x512 PWA icon
  (`public/icon-512.png`), uploaded once per run as the `icon` blob. Without it Bluesky has no
  avatar for the link card and falls back to the theme colours and the publication's initial.
- **Identity/idempotency**: each post carries a stable TID `standardRkey` in frontmatter;
  the publisher is `putRecord`-idempotent and treats the existing record's `bskyPostRef` as
  the "already posted to Bluesky" guard, so re-runs never double-post.
- **Bluesky**: first publish of a doc creates a companion post with a rich link card back to
  the page; its strong-ref is stored in `bskyPostRef`. The post's `app.bsky.embed.external`
  carries `associatedRefs` (document + publication strong refs) so Bluesky builds the card
  straight from the records instead of crawling the page. Those are strong refs, so a new post
  writes the document record **twice** — once to mint the ref, once to store `bskyPostRef`.
  The ref going stale on that second write is expected: Bluesky snapshots records at index
  time, so an already-embedded card never reflects later edits (their "puppy problem").
- **Cover image**: mirrors the web's OG rule (a post's first body image, or none) — the
  publisher fetches the post's own live page and lifts its rendered `og:image` (rather than
  re-parsing Markdown, which can't resolve MDX `<Image>`/content-hashed asset URLs the way
  Astro's renderer does), re-encodes it under the PDS's 1MB blob limit, and attaches it as
  `coverImage`. Resolved once per doc and then sticky, like `bskyPostRef`; runs in both
  incremental and `--backfill` modes since it's a harmless enrichment. The Bluesky card itself
  still has no thumbnail — that scope was deliberately left for later.
- **CI**: `scripts/release.ts` runs the publisher after a successful deploy, gated behind the
  `PUBLISH_STANDARD_SITE` env var (unset on staging → no-op).

### Launch (Standard.site) — run once, in order, after v7 replaces v6 at `barryfrost.com`

Publications intentionally use canonical `barryfrost.com` URLs, and verification only
resolves once v7 serves that domain — so do **not** start this on staging.

1. `npm run standard:pubs` — creates the two publication records. Paste the printed AT-URIs
   into `PUBLICATIONS.articles.uri` / `PUBLICATIONS.weeknotes.uri` in `src/lib/standard-site.ts`.
   Once those URIs are set the script updates the records in place under their original rkeys
   (so `.well-known` values stay correct), making it the source of truth for publication name,
   description, theme and icon — re-run it after editing any of those.
2. `npm run standard:rkeys` — writes `standardRkey`s into all publishable (non-`unlisted`)
   article/weeknote frontmatter. Review `git diff` and commit.
3. Deploy, so `barryfrost.com` serves the `.well-known` files and per-page `<link>` tags.
4. `npm run publish:standard -- --backfill` — publishes all documents. `--backfill` creates
   **no** new Bluesky posts; it reuses an existing `bsky.app` URL from each file's
   `syndication` frontmatter as `bskyPostRef` where present.
5. Set `PUBLISH_STANDARD_SITE=1` in the production Cloudflare Workers Build env. From then on,
   new/changed posts publish automatically on deploy and get a fresh Bluesky card post on
   first publish.

Validate a few records at [isitstandard.site](https://isitstandard.site) and
[site-validator.fly.dev](https://site-validator.fly.dev).
