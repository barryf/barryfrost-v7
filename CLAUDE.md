# barryfrost.com v7

Personal website for Barry Frost. Astro 6 + Tailwind CSS, deployed to Cloudflare Pages.
See `PLAN.md` for full architecture, URL structure, and content type details.

Live staging URL: `https://new.barryfrost.com` (v6 still serves `barryfrost.com`). Point XRay, feed readers, and other external checks at the staging URL.

## Commands
- `npm run dev` — local dev server
- `npm run build` — full static build
- `npm run preview` — preview build locally

## Key Conventions
- Local Markdown is canonical; PDS records are syndication targets
- MF2 classes applied directly in Astro templates — no runtime JS except `/check-ins` (Leaflet map)
- Light/dark mode via `prefers-color-scheme` only — no JS toggle
- Images resized at build time with sharp and stored content-addressed in R2 (`src/lib/image-store.ts`); dev mode and PRs without R2 credentials use direct source URLs
- No SSR — rebuilds trigger via GitHub Actions `repository_dispatch` when PDS changes

## Script conventions
When writing Python scripts for one-off tasks, always create them in `scripts/` rather than /tmp. Name them descriptively. This keeps them reviewable and version-controlled.
