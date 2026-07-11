# barryfrost.com v7

The seventh iteration of [Barry Frost's](https://barryfrost.com) personal website — a statically generated, IndieWeb-compliant site built with [Astro 7](https://astro.build) and [Tailwind CSS v4](https://tailwindcss.com), deployed to Cloudflare.

Live URL: `https://barryfrost.com`

See `PLAN.md` for the full architecture reference.

## What this is

A personal website that brings together several streams of content — long-form articles, weeknotes, Bluesky posts, check-ins, films watched, books read, and photo galleries. The homepage is a curated view with dedicated list pages for each content type. Everything is rendered to static HTML at build time and served from the edge.

There is no database, no CMS, and no server-side rendering. Rebuilds are triggered automatically when changes are detected on an [AT Protocol](https://atproto.com) PDS, or on push to `main`.

## Concepts

### Local Markdown is canonical

Articles, weeknotes, slash pages, and the archived 2000–2001 travelblog all live as Markdown files under `src/content/`. These are the source of truth — the site builds from them directly and they are versioned in git alongside the code.

### PDS records as syndication targets

Other content types — Bluesky posts, check-ins, films, books, photos — are authored on third-party services that store records on an [AT Protocol PDS](https://atproto.com/guides/glossary#personal-data-server-pds). At build time, custom Astro content loaders in `src/lib/loaders/` fetch these records and populate the site's content collections.

This inverts the usual POSSE model: rather than the site publishing out to silos, it pulls in from open, user-owned data stores. The PDS becomes the system of record for content that originates elsewhere; the site becomes a unified, owned view of it.

### Curated homepage, per-type list pages

The homepage is hand-curated — it shows a latest weeknote, recent photos, the most recent Bluesky post, featured articles, and recent check-ins. Each content type also has its own paginated list page (`/articles`, `/posts`, `/films`, `/photos`, etc.).

### IndieWeb & Microformats 2

Every page is marked up with [Microformats 2](https://microformats.org/wiki/microformats2) classes (`h-feed`, `h-entry`, `h-card`, `dt-published`, `u-url`, `e-content`, `p-checkin`, etc.) so that IndieWeb parsers like XRay, Monocle, and pin13 classify posts correctly via [Post-Type Discovery](https://indieweb.org/Post_Type_Discovery). MF2 classes are applied as static attributes directly in Astro templates — no runtime JS is needed.

### Minimal JavaScript

The only page that ships JS is `/check-ins`, which dynamically loads Leaflet and Leaflet.markercluster from a CDN to render a clustered map. Every other page is pure HTML and CSS, including dark mode (`prefers-color-scheme` only — no toggle, no flash).

### Build-time images via R2

PDS records reference image blobs by CID. At build time these are fetched, resized with `sharp`, and stored content-addressed as webp in an R2 bucket served from `images.barryfrost.com`. No runtime resizing occurs.

### Static, no SSR

`output: 'static'`, `build.format: 'file'` — everything compiles to flat `.html` files. Updates happen by rebuilding and redeploying via Cloudflare Workers Builds, which triggers on push to `main` or via a deploy hook from a PDS poller worker.

## Stack

- **Astro 7** — static site generator with content collections and custom loaders
- **Tailwind CSS v4** — via `@tailwindcss/vite`, plus `@tailwindcss/typography` for prose; Work Sans as the primary font
- **`@astrojs/rss`** — RSS and JSON Feed generation for articles and weeknotes
- **Cloudflare Workers** — static asset hosting, PDS poller
- **Pagefind** — static full-text search, indexed after build

## Commands

```sh
npm run dev          # local dev server
npm run build        # full static build
npm run preview      # preview the build locally

npm run new:article  -- --title "Some Title"
npm run new:weeknote -- --topic "Sofa"
```

The scaffolding scripts create a stub Markdown file on a new branch, commit it, push, and open a draft PR — usable from the local CLI or via the `scaffold.yml` workflow for authoring from any device.

## Layout

```
src/
  content/          # local Markdown (articles, weeknotes, pages, travelblog)
  lib/
    loaders/        # AT Protocol content loaders (one per collection)
    feed.ts         # paginateItems helper
    pds.ts          # PDS fetch helpers
    image-store.ts  # build-time R2/sharp image pipeline
  components/
    posts/          # per-type card components (ArticleCard, FilmCard, ...)
    icons/          # BlueskyIcon, PdslsIcon, RSSIcon, ...
    Divider.astro
    SiteFooter.astro
  layouts/          # Base, FilmFeed, Post
  pages/            # routes
  styles/global.css
cloudflare/
  pds-poller/       # cron poller — triggers rebuilds on PDS changes
scripts/            # scaffolding & one-off import scripts
```

## Licence

Code is licensed under [MIT](./LICENSE). My words and original images are licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
