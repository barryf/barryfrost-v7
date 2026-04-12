# barryfrost.com v7

Personal website for Barry Frost. Astro 6 + Tailwind CSS, deployed to Cloudflare Pages.

## Stack
- Astro 6.1 (static output / SSG)
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- Deployed to Cloudflare Pages (static assets, no adapter)

## Commands
- `npm run dev` — local dev server
- `npm run build` — full static build
- `npm run preview` — preview build locally

## Content Sources
Two sources merged into a unified feed:

1. **Local Markdown** — articles (`src/content/articles/`), weeknotes (`src/content/weeknotes/`), pages (`src/content/pages/`)
2. **PDS records** — fetched at build time from bsky.social (DID: `did:plc:j5ksi3y4tdtbp7vpsxsfyask`) via custom Astro content loaders in `src/lib/loaders/`:
   - `app.bsky.feed.post` → Bluesky posts
   - `app.beaconbits.beacon` → Beacon Bits checkins
   - `social.popfeed.feed.review` → PopFeed reviews
   - `buzz.bookhive.book` → BookHive books
   - `social.grain.gallery` + `social.grain.gallery.item` + `social.grain.photo` → Grain photo galleries
   - `site.standard.document` → enriches articles/weeknotes with AT URIs (not feed entries)
   - `site.standard.graph.subscription` → Standard publications for blogroll
   - Blogroll blogs from `src/data/blogroll.json`

## Key Conventions
- MF2 (Microformats 2) classes applied directly in Astro templates — no runtime JS
- Light/dark mode via `prefers-color-scheme` only — no JS toggle
- All images via Astro's `<Image>` component with Cloudflare image service
- Canonical URLs always on barryfrost.com; PDS records are syndication targets
- No SSR — rebuilds trigger via GitHub Actions `repository_dispatch` when PDS changes
