# Pre-launch fixes — task list

Findings from a full pre-launch review (2026-07-07). Each task is self-contained:
it names the files, the exact change, and how to verify. Work through them top to
bottom unless stated otherwise.

## Workflow (read first)

- **One task = one commit.** Complete a task, verify it, tick its checkbox here,
  and include the TASKS.md tick in the same commit. Commit message: short imperative
  summary, e.g. `Fix reflected XSS on /search`.
- **Never `git push`** unless Barry explicitly asks.
- **Verify before committing.** For template/CSS changes, check the rendered page
  with `npm run dev`. Search only works after `npm run build && npm run preview`.
  A full `npm run build` fetches live PDS data over the network — that's normal.
- **If you change `package.json` dependencies**, regenerate `package-lock.json`
  with **npm 10.9.2** (CI's version), not a newer local npm. e.g.
  `npx -y npm@10.9.2 install --package-lock-only`.
- **Preserve Microformats2 classes** (`h-entry`, `u-url`, `p-name`, `dt-published`,
  `e-content`, …) exactly when editing cards/layouts — they're load-bearing for
  IndieWeb parsers. Never add Tailwind `h-*`/`p-*` utility classes to elements
  (they collide with MF2); use `size-*`/spacing alternatives.
- **Design conventions:** spacing not borders; gray palette; no runtime JS except
  the check-ins map; dark mode via `prefers-color-scheme` only.
- Do **not** start Phase G (launch day) — those tasks run only when v7 replaces
  v6 at the apex domain.

---

## Phase A — Security

### - [x] A1. Fix reflected XSS on /search

**File:** `src/pages/search.astro`

The inline script inserts the user-supplied query into `innerHTML` unescaped:

```js
resultsEl.innerHTML = '<p class="...">No results for “' + query + '”.</p>';
```

A crafted URL like `/search?q=<img src=x onerror=alert(1)>` executes script.

**Fix:** add an escape helper inside the IIFE and use it wherever `query` is
interpolated into HTML:

```js
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

Then: `'No results for “' + escapeHtml(query) + '”.</p>'`. Audit the rest of the
script: `hit.meta.title` and `hit.url` come from Pagefind indexing our own pages
(lower risk) but escape `title` too for defence in depth. Leave `hit.excerpt`
as-is — Pagefind emits sanitised `<mark>` markup there. The
`encodeURIComponent(query)` in the text-fragment link is already safe.

**Verify:** `npm run build && npm run preview`, then open
`/search?q=<img src=x onerror=alert(1)>` — the query must render as literal text,
no broken image / no alert. A normal search must still work.

### - [x] A2. Harden rich-text link rendering (facet URLs)

**File:** `src/lib/richtext.ts`

Two problems:

1. `escapeAttr` replaces `"` **before** `&`, so quotes become `&amp;quot;` and
   legitimate `&` in URLs get double-handled. Delete `escapeAttr` entirely and
   use the existing `escapeHtml` for attribute values too (it escapes all four
   characters in the correct order).
2. Link facet URIs are emitted into `href` with no scheme check. Quoted posts
   (`BlueskyQuote.astro`) render **other people's** facets through this function,
   so a quoted post containing a `javascript:` link facet becomes stored XSS.

**Fix:** add a scheme guard and fall back to plain text when it fails:

```ts
function isSafeUrl(uri: string): boolean {
  try {
    const { protocol } = new URL(uri);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}
```

In the link branch require `feature.uri && isSafeUrl(feature.uri)`, otherwise
emit `facetText` with no anchor. For the mention branch, keep the DID in the
path but pass it through `encodeURIComponent`; for the tag branch use
`encodeURIComponent(feature.tag!)` (tags can contain spaces/`#`). Replace all
`escapeAttr` call sites with `escapeHtml`.

**Verify:** `npm run dev`, open `/posts` and the homepage Latest Post — links,
mentions, and hashtags in posts and quoted posts must still render and resolve
correctly (spot-check a few hrefs in devtools).

### - [x] A3. Escape venue data in the check-ins map popups

**File:** `src/components/CheckInMap.astro`

`marker.bindPopup(...)` builds HTML by string concatenation from `venueName` /
`venueCategory`. It's Barry's own check-in data (low risk) but a venue name
containing `<`, `&`, or quotes breaks the popup.

**Fix:** add the same `escapeHtml` helper inside the inline script and wrap
`c.venueName` and `c.venueCategory` (and `c.url` via attribute-escaping) when
building the popup string.

**Verify:** `npm run dev`, open `/check-ins`, click a few markers — popups render
with working venue links.

### - [x] A4. Add `public/_headers` — security + caching headers

**New file:** `public/_headers` (Cloudflare Workers static assets applies this
file; same format as Pages). Contents:

```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/pagefind/*
  Cache-Control: public, max-age=3600
```

Notes: `/_astro/*` filenames are content-hashed → safe to mark immutable. The
Pagefind bundle includes the un-hashed `pagefind.js`, so only a short max-age
there. Do **not** add a CSP in this task (inline scripts make it fiddly — see H2).

**Verify:** `npm run build`, confirm `dist/_headers` exists. Then
`npx wrangler dev` and `curl -I http://localhost:8787/` and
`curl -I http://localhost:8787/_astro/<any-file>` — headers must be present.
If wrangler dev doesn't apply them locally, note that in the commit message and
verify on the next PR preview deployment instead.

### - [x] A5. Add a LICENSE file

**New file:** `LICENSE` at repo root. `README.md` already links `./LICENSE` and
states the code is MIT-licensed, but the file doesn't exist.

Standard MIT licence text, copyright line: `Copyright (c) 2026 Barry Frost`.
(Words/images are separately CC BY-SA 4.0 via the footer — the LICENSE file
covers code only, which matches the README's wording. No README change needed.)

**Verify:** file exists; README link resolves.

---

## Phase B — Self-host Leaflet (removes unpkg supply-chain risk + 5 external requests)

### - [x] B1. Bundle Leaflet + markercluster instead of loading from unpkg

**Files:** `src/components/CheckInMap.astro`, `package.json`, `package-lock.json`

Currently `CheckInMap.astro` injects `<script src="https://unpkg.com/...">` tags
with no SRI. Replace with npm packages bundled by Astro/Vite.

Steps:

1. `npm install leaflet@1.9.4 leaflet.markercluster@1.5.3`, then regenerate the
   lockfile with npm 10.9.2 (see Workflow).
2. In `CheckInMap.astro`, replace the `is:inline define:vars` script with:
   - A JSON data island for the check-in data (define:vars doesn't work in
     bundled scripts):
     ```astro
     <script type="application/json" id="check-in-data" set:html={JSON.stringify(checkIns).replace(/</g, '\\u003c')} />
     ```
   - A normal `<script>` (no `is:inline`) that Astro bundles:
     ```js
     import L from 'leaflet';
     import 'leaflet/dist/leaflet.css';
     import 'leaflet.markercluster';
     import 'leaflet.markercluster/dist/MarkerCluster.css';
     import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
     import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
     import markerIcon from 'leaflet/dist/images/marker-icon.png';
     import markerShadow from 'leaflet/dist/images/marker-shadow.png';

     L.Icon.Default.mergeOptions({
       iconRetinaUrl: markerIcon2x.src,
       iconUrl: markerIcon.src,
       shadowUrl: markerShadow.src,
     });

     const checkIns = JSON.parse(document.getElementById('check-in-data').textContent);
     ```
     then the existing `initMap()` body (drop the `loadCSS`/`loadScript` helpers
     entirely; call `initMap()` directly). **Gotcha:** the default marker icon
     paths break under bundling unless `L.Icon.Default` is configured as above.
     If `markerIcon.src` is undefined (import returns a plain URL string in this
     Astro version), use the import value directly instead of `.src` — check at
     runtime in dev.
3. Keep the CARTO tile URLs as-is (they're images, not script).
4. Keep the A3 popup escaping.

**Verify:** `npm run dev` → `/check-ins`: map renders with correct marker icons,
clustering works, popups open, fullscreen toggle + Escape work, dark-mode tiles
appear when the OS theme is dark (`npx wrangler dev` not needed). Then
`npm run build` must succeed. Confirm no `unpkg.com` references remain:
`grep -rn unpkg src/`.

Also update the two docs that describe the CDN approach: `CLAUDE.md` (Key
Conventions bullet about Leaflet CDN) and `PLAN.md` ("Minimal JS" bullet).

---

## Phase C — Accessibility

### - [x] C1. Label the search inputs

**Files:** `src/components/SiteFooter.astro`, `src/pages/search.astro`

Both search inputs rely on `placeholder` only. Add `aria-label="Search"` to each
`<input type="search">`. (A visible `<label>` isn't wanted in the compact footer;
aria-label is the right tool. Don't add a submit button — Enter submits.)

**Verify:** `npm run dev`, inspect both inputs — accessible name present in
devtools accessibility pane.

### - [x] C2. Accessible names for image-only links

**Files:** `src/components/posts/CheckInCard.astro`, `src/components/posts/BlueskyCard.astro`

- CheckInCard multi-photo grid: each `<a>` wraps an `alt=""` image → the link has
  no accessible name. Add `aria-label={`Photo ${i + 1} at ${data.venueName}`}` to
  the anchor. Keep `alt=""` on the img (decorative; the label lives on the link).
- BlueskyCard image thumbnails: when the post author provided no alt text,
  `alt={alts[i] ?? ''}` leaves the link nameless. Add to the anchor:
  `aria-label={alts[i] || 'Post image'}`.

Do **not** change any MF2 classes (`u-photo` stays on the imgs).

**Verify:** `npm run dev` → `/check-ins` and `/posts`; inspect the links'
accessible names. Confirm MF2 unchanged by eyeballing the class attributes.

### - [ ] C3. Contrast fixes

**Files:** `src/styles/global.css`, plus a find/replace across `src/`

1. Hover colour: `amber-600` on white is ~3.2:1. In `global.css` change the
   hover rule to amber-700 in light mode, keeping amber-600 in dark (where it
   passes):
   ```css
   .underline:hover, .prose a:hover {
     @apply text-amber-700 dark:text-amber-600;
   }
   ```
   (Replace the existing `@apply text-amber-600;` hover rule.)
2. Small secondary text in dark mode: `dark:text-gray-500` on black is ~4.3:1,
   just under AA, and it's mostly used at `text-sm`. Find/replace
   `dark:text-gray-500` → `dark:text-gray-400` across `src/`
   (`grep -rln 'dark:text-gray-500' src/`). This slightly lightens secondary
   text in dark mode — that's the intended change.

**Verify:** `npm run dev` with OS dark mode (or devtools emulation): dates/meta
text visibly lighter but layout unchanged; hover links in light mode are a
darker amber.

### - [ ] C4. Skip-to-content link

**File:** `src/layouts/Base.astro`

Add as the first element inside `<body>`:

```astro
<a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-white focus:dark:bg-black focus:px-3 focus:py-1 focus:underline">Skip to content</a>
```

and change `<main>` to `<main id="main">`.

**Verify:** `npm run dev`, load any page, press Tab once — the skip link appears;
Enter jumps focus to main content.

---

## Phase D — Performance

### - [ ] D1. Stop marking all 8 homepage photos as high priority

**File:** `src/pages/index.astro` (Recent Photos section)

All 8 thumbnails currently get `loading="eager" fetchpriority="high"`, which
dilutes prioritisation — most are offscreen in the horizontal scroll row.
Change so only the first two images (`i < 2`) get
`loading="eager" fetchpriority="high"`; the rest get `loading="lazy"` and no
fetchpriority attribute.

**Verify:** `npm run dev`, view homepage source — first two photo `<img>` tags
eager/high, remainder lazy.

### - [ ] D2 (optional, larger). Width/height on BlueskyCard images

**Files:** `src/lib/image-store.ts`, `src/lib/loaders/bluesky.ts`,
`src/components/posts/BlueskyCard.astro`, `src/content.config.ts`

BlueskyCard thumbnails have no dimensions (fixed 6rem CSS height, auto width) →
horizontal layout shift as they load. Proper fix: capture intrinsic dimensions
at build time.

Sketch: add an image-store variant that returns `{ url, width, height }` (sharp
already decodes the image inside `materialise`; return
`await sharp(webpBuf).metadata()` dimensions, and for the dev/fallback path
return undefined dims). In the bluesky loader store `imageDims: {w,h}[]`
alongside `imageUrls`; extend the zod schema; in BlueskyCard emit
`width`/`height` attributes (keep the `h-24 w-auto` CSS).

Skip this task if it balloons — it touches the shared image pipeline. Do it
last, in its own commit, and run a full `npm run build` to confirm all loaders
still pass.

---

## Phase E — SEO / discovery

### - [ ] E1. Sitemap + robots.txt

**Files:** `astro.config.mjs`, `package.json`, new `public/robots.txt`

1. `npm install @astrojs/sitemap` (regenerate lockfile with npm 10.9.2).
2. Add to `integrations: [mdx(), sitemap({ ... })]` with two customisations:
   - **Exclude unlisted posts** (they're link-only by design; a sitemap would
     leak them). In the config file, scan frontmatter at config-load time:
     ```js
     import { readFileSync, readdirSync } from 'node:fs';
     function unlistedPaths(dir, prefix) {
       return readdirSync(dir)
         .filter((f) => /\.(md|mdx)$/.test(f))
         .filter((f) => /^visibility:\s*unlisted/m.test(readFileSync(`${dir}/${f}`, 'utf8')))
         .map((f) => `${prefix}/${f.replace(/\.(md|mdx)$/, '')}`);
     }
     const excluded = new Set([
       ...unlistedPaths('src/content/articles', '/articles'),
       ...unlistedPaths('src/content/weeknotes', '/weeknotes'),
       '/search', '/404',
     ]);
     ```
     then `filter: (page) => !excluded.has(new URL(page).pathname.replace(/\.html$/, ''))`.
   - **Strip `.html`** (because `build.format: 'file'` gives pages `.html` URLs
     but the site serves and canonicalises extensionless paths):
     ```js
     serialize(item) {
       item.url = item.url.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
       return item;
     }
     ```
3. `public/robots.txt`:
   ```
   User-agent: *
   Allow: /

   Sitemap: https://barryfrost.com/sitemap-index.xml
   ```
   (Final domain on purpose — launch is imminent and robots.txt is static.)

**Verify:** `npm run build`; check `dist/sitemap-index.xml` + `dist/sitemap-0.xml`
exist; spot-check entries have no `.html` suffix; confirm no unlisted slug
appears (`grep -c unlisted src/content/articles/*.md src/content/weeknotes/*.md`
to find candidates first — if none are unlisted, note that and move on).

### - [ ] E2. og:image and og:type=article

**Files:** `src/components/BaseHead.astro`, `src/layouts/Post.astro`,
`src/layouts/Base.astro`

1. In `BaseHead.astro` add a default share image and Twitter card meta
   (barryfrost.jpg is 192×192 — small but valid; better than nothing):
   ```astro
   <meta property="og:image" content={new URL('/barryfrost.jpg', Astro.site)} />
   <meta name="twitter:card" content="summary" />
   ```
2. Add an optional prop `publishedDate?: Date`. When present emit
   `og:type` = `article` plus
   `<meta property="article:published_time" content={publishedDate.toISOString()} />`;
   otherwise keep `og:type` = `website`.
3. Thread the prop through: `Base.astro` accepts optional `publishedDate` and
   passes it to `BaseHead`; `Post.astro` passes its `date` prop to `Base`.

**Verify:** `npm run dev`; view source of an article page (og:type article +
published_time + og:image) and the homepage (og:type website + og:image).

---

## Phase F — Behavioural bugs

### - [ ] F1. Fix “Last updated” on /now (mtime is wrong in CI)

**File:** `src/pages/now.astro`

`statSync(nowMdPath).mtime` returns the **clone time** on Cloudflare Workers
Builds (fresh checkout every build), and the site rebuilds hourly — so /now
always claims it was just updated. Use git history with fallbacks:

```ts
import { execSync } from 'node:child_process';

let lastUpdated = statSync(nowMdPath).mtime; // fallback: local dev / no git
try {
  const iso = execSync('git log -1 --format=%cI -- src/content/pages/now.md', { encoding: 'utf8' }).trim();
  const d = new Date(iso);
  if (iso && !Number.isNaN(d.getTime())) lastUpdated = d;
} catch { /* keep fallback */ }
```

**Gotcha:** if CI uses a shallow clone, `git log -- <file>` can return empty —
the empty/NaN guard above handles that by keeping the mtime fallback.

**Verify:** `npm run dev` → `/now` shows the date of the last commit that touched
`now.md` (check with `git log -1 --format=%cI -- src/content/pages/now.md`).

### - [ ] F2. Keep unlisted weeknotes out of prev/next and “Previously this week”

**File:** `src/pages/weeknotes/[slug].astro`

`getStaticPaths` builds prev/next/onThisDay from **all** weeknotes, so an
`visibility: unlisted` weeknote gets linked from its neighbours, defeating
unlisting. Fix inside `getStaticPaths`:

- Keep generating a page for **every** entry (unlisted pages must still exist).
- Build a second array `listed = sorted.filter(e => e.data.visibility !== 'unlisted')`.
- Compute `prev`/`next` from the entry's neighbours **in `listed`** (find the
  nearest listed entry with a lower/higher week number).
- Compute `onThisDay` from `listed` too.

**Verify:** if any weeknote currently has `visibility: unlisted`
(`grep -l 'visibility: unlisted' src/content/weeknotes/*.md`), `npm run dev` and
check its neighbours' prev/next skip it. If none exist, temporarily mark one
unlisted in dev to test, then revert the content change before committing.

---

## Phase G — Docs and dead code

### - [ ] G1. Fix stale docs (PLAN.md, README.md, _redirects comment)

- `PLAN.md` — "Adding a New PDS Content Type" step 5 references
  `cloudflare/pds-poller/src/index.ts`, `DIGEST_COLLECTIONS`/`HEAD_COLLECTIONS`,
  and a `PRETTY` map. The poller was replaced by `cloudflare/pds-firehose`.
  Rewrite step 5: *add the collection NSID to `WATCHED_COLLECTIONS` and a label
  to `COLLECTION_NOUNS` in `cloudflare/pds-firehose/src/index.ts`*.
- `PLAN.md` — Deployment section says the deploy command runs
  `scripts/notify-pushover.ts`; it's now `scripts/release.ts` (build → deploy →
  Standard.site publish → Pushover, with failure notifications). Update the
  paragraph. Add `NOTIFY_SECRET` to the required build env vars list.
- `README.md` — Layout section shows `cloudflare/pds-poller/ # cron worker`;
  change to `pds-firehose/ # Jetstream listener — triggers rebuilds on PDS changes`.
  Stack section says "PDS polling cron" → "PDS firehose listener". Component list
  shows `BlueskyIcon.astro` at `components/` root → icons now live in
  `components/icons/`. The "Static, no SSR" paragraph says "deploy hook from a
  PDS polling worker" → firehose worker.
- `public/_redirects` — header comment says "Cloudflare Pages allows…"; reword to
  Cloudflare Workers static assets (same limits/format).

**Verify:** re-read each edited section for internal consistency; `grep -rn
pds-poller PLAN.md README.md` returns nothing.

### - [ ] G2. Remove dead code

- `src/pages/work.astro` — delete the commented-out Projects section
  (lines ~108–129), remove `getProjects` from the import and the `Promise.all`
  (and the unused `projects` variable). Also remove the "projects" mention from
  the page's intro sentence and from `PLAN.md`'s `/work` URL-table row if it
  no longer applies.
- `src/layouts/Feed.astro` — remove `description: string;` from the Props
  interface (it's never read; the description arrives via named slot).
- `src/components/posts/FilmCard.astro` — the `<time>` element is the only card
  missing the hover `title` attribute, and `formatDateTitle` is imported but
  unused. Add `title={formatDateTitle(date)}` to the `<time>` element (matching
  BookCard/CheckInCard).

**Verify:** `npm run dev` → `/work` and `/films` render correctly; films date
shows full date on hover.

### - [ ] G3. Fix hardcoded staging link in content

**File:** `src/content/weeknotes/242-gardens.md` line ~14 links to
`https://new.barryfrost.com/weeknotes/237-fumes`. Change to relative:
`/weeknotes/237-fumes`.

**Verify:** `npm run dev` → `/weeknotes/242-gardens` link resolves locally.

---

## Phase H — LAUNCH DAY ONLY (do not run before Barry says v7 is taking over barryfrost.com)

### - [ ] H1. Flip the canonical domain

**File:** `astro.config.mjs` — change `site` from `https://new.barryfrost.com`
to `https://barryfrost.com`.

This drives canonical URLs, og:url, RSS/JSON feed URLs, the sitemap, and the
h-card author URLs. After changing, `grep -rn 'new\.barryfrost' src/ public/
astro.config.mjs` should return only the explanatory comment in
`src/lib/standard-site.ts` (update that comment too). Note the Standard.site
launch sequence in PLAN.md ("Launch (Standard.site)") is a separate, manual,
run-once process — do not start it as part of this task.

**Verify:** `npm run build`; check `dist/index.html` canonical/og:url and
`dist/feed.xml` item URLs all use `https://barryfrost.com`.

### - [ ] H2 (optional hardening, post-launch). Content-Security-Policy

Only after B1 (self-hosted Leaflet) is deployed and stable. Add to the `/*`
block in `public/_headers` a CSP along the lines of:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://images.barryfrost.com https://*.basemaps.cartocdn.com data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'
```

**Gotchas to check first:** `/search` and `/check-ins` use inline `<script
is:inline>` — if any inline scripts remain after B1, either add hashes
(`'sha256-…'`) or defer this task. Also confirm at that time whether any images
are still served from fallback source URLs (`bsky.social`, external hosts) —
in production with R2 configured they shouldn't be, but if the build logged
`[image-store]` fallbacks, add those hosts to `img-src` or fix the fallbacks.
Test every page type on the preview deployment with devtools console open
(CSP violations log there) before promoting.

---

## Task order summary

A1 → A2 → A3 → A4 → A5 → B1 → C1 → C2 → C3 → C4 → D1 → E1 → E2 → F1 → F2 →
G1 → G2 → G3, then D2 if wanted. H1/H2 wait for launch day.
