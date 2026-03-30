# barryfrost.com v7

Personal website for Barry Frost. Astro 6 + Tailwind CSS, deployed to Cloudflare Workers.

## Stack
- Astro 6.1 (static output / SSG)
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- `@astrojs/cloudflare` adapter

## Commands
- `npm run dev` — local dev server
- `npm run build` — full static build
- `npm run preview` — preview build locally

## Content Sources
Two sources merged into a unified feed:

1. **Local Markdown** — articles (`src/content/articles/`), weeknotes (`src/content/weeknotes/`), pages (`src/content/pages/`)
2. **PDS records** — fetched at build time from bsky.social (DID: `did:plc:j5ksi3y4tdtbp7vpsxsfyask`) via custom Astro content loaders

## Key Conventions
- MF2 (Microformats 2) classes applied directly in Astro templates — no runtime JS
- Light/dark mode via `prefers-color-scheme` only — no JS toggle
- All images via Astro's `<Image>` component with Cloudflare image service
- Canonical URLs always on barryfrost.com; PDS records are syndication targets
- No SSR — rebuilds trigger via GitHub Actions `repository_dispatch` when PDS changes
