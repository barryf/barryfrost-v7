# barryfrost.com v7

The seventh iteration of [Barry Frost's](https://barryfrost.com) personal website — a statically generated, IndieWeb-compliant site built with [Astro 6](https://astro.build) and [Tailwind CSS v4](https://tailwindcss.com), deployed to Cloudflare Pages.

Live staging URL: `https://new.barryfrost.com` (v6 still serves `barryfrost.com`).

See `PLAN.md` for the full architecture reference.

## What this is

A personal website that aggregates several streams of content — long-form articles, weeknotes, Bluesky posts, checkins, films watched, books read, and photo galleries — into a single chronological feed. Everything is rendered to static HTML at build time and served from the edge.

There is no database, no CMS, and no server-side rendering. Rebuilds are triggered by GitHub Actions, either on push or in response to changes detected on an [AT Protocol](https://atproto.com) PDS.

## Concepts

### Local Markdown is canonical

Articles, weeknotes, slash pages, and the archived 2000–2001 travelblog all live as Markdown files under `src/content/`. These are the source of truth — the site builds from them directly, and they are versioned in git alongside the code.

### PDS records as syndication targets

Other content types — Bluesky posts, checkins, films, books, photos — are authored on third-party services that store records on an [AT Protocol PDS](https://atproto.com/guides/glossary#personal-data-server-pds). At build time, custom Astro content loaders in `src/lib/loaders/` fetch these records over the AT Protocol and merge them into the site's content collections.

This inverts the usual POSSE model: rather than the site publishing out to silos, it pulls in from open, user-owned data stores. The PDS becomes the system of record for content that originates elsewhere; the site becomes a unified, owned view of it.

### A unified feed

`src/lib/feed.ts` merges every collection — local Markdown plus PDS-derived — into a single `FeedItem[]` sorted by date. The homepage renders this feed, and per-type indexes (`/articles`, `/films`, `/photos`, etc.) filter the same data structure. Adding a new content type is a matter of writing a loader, a card component, and registering it in the feed.

### IndieWeb & Microformats 2

Every page is marked up with [Microformats 2](https://microformats.org/wiki/microformats2) classes (`h-feed`, `h-entry`, `h-card`, `dt-published`, `u-url`, `e-content`, `p-checkin`, etc.) so that IndieWeb parsers like XRay, Monocle, and pin13 classify posts correctly via [Post-Type Discovery](https://indieweb.org/Post_Type_Discovery). MF2 classes are applied as static attributes directly in Astro templates — no runtime JS is needed to expose the semantics.

### Minimal JavaScript

The only page that ships JS is `/checkins`, which dynamically loads Leaflet and Leaflet.markercluster from a CDN to render a clustered map. Every other page is pure HTML and CSS, including dark mode (`prefers-color-scheme` only — no toggle, no flash) and all interactive-looking affordances.

### Build-time image caching

PDS records reference image blobs by CID. The loaders download each blob once, re-encode it as WebP via [`sharp`](https://sharp.pixelplumbing.com), and write it to `public/images/`. The directory is cached between CI runs so blobs are fetched only when new. Images are stored at 2× their CSS display size for retina displays.

### Static, no SSR

`output: 'static'`, `build.format: 'file'` — everything compiles to flat `.html` files. The site has no runtime server. Updates happen by rebuilding:

- **`deploy.yml`** runs on push, manual dispatch, or `repository_dispatch` and deploys the built `dist/` to Cloudflare Pages via Wrangler.
- **`poll-pds.yml`** runs every 15 minutes, checks the latest record CID for each monitored AT Protocol collection, and fires a `repository_dispatch` if anything changed. New Bluesky post → rebuild → redeploy, with no server-side hooks.

## Stack

- **Astro 6** — static site generator with content collections and custom loaders
- **Tailwind CSS v4** — via `@tailwindcss/vite`, plus `@tailwindcss/typography` for prose
- **`@astrojs/rss`** — RSS generation; JSON Feed v1.1 generated alongside
- **`sharp`** — image re-encoding to WebP at build time
- **Cloudflare Pages** — static hosting and edge delivery
- **GitHub Actions** — build, deploy, PDS polling, and content scaffolding

## Commands

```sh
npm run dev          # local dev server
npm run build        # full static build
npm run preview      # preview the build locally

npm run new:article  -- --title "Some Title"
npm run new:weeknote -- --topic "Sofa"
```

The scaffolding scripts create a stub Markdown file on a new branch, commit it, push, and open a draft PR — usable from the local CLI or via the `scaffold.yml` workflow form for authoring from any device.

## Layout

```
src/
  content/          # local Markdown (articles, weeknotes, pages, travelblog)
  lib/
    loaders/        # AT Protocol content loaders (one per collection)
    feed.ts         # unified feed merging
    pds.ts          # PDS fetch helpers
    download-image.ts
  components/
    posts/          # per-type card components (ArticleCard, FilmCard, ...)
  layouts/          # Base, Feed, FilmFeed, Post
  pages/            # routes
  styles/global.css
public/
  images/           # cached PDS image blobs (gitignored, populated at build)
scripts/            # scaffolding & one-off import scripts
```
