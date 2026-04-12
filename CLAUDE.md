# barryfrost.com v7

Personal website for Barry Frost. Astro 6 + Tailwind CSS, deployed to Cloudflare Pages.
See `PLAN.md` for full architecture, URL structure, and content type details.

## Commands
- `npm run dev` — local dev server
- `npm run build` — full static build
- `npm run preview` — preview build locally

## Key Conventions
- Local Markdown is canonical; PDS records are syndication targets
- MF2 classes applied directly in Astro templates — no runtime JS
- Light/dark mode via `prefers-color-scheme` only — no JS toggle
- Images downloaded at build time to `public/images/`, cached in CI
- No SSR — rebuilds trigger via GitHub Actions `repository_dispatch` when PDS changes
