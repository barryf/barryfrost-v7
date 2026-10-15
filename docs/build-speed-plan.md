# Build speed plan

The Cloudflare Workers Build took **2m16s** from clone to finish on 2026-10-15 (19:37). After
the fixes below it takes **41s** (20:12 build). This file records where the time went, what
changed, and what's left.

Cloudflare's own "Initializing build environment" step comes before the clone and isn't
counted here. It varies between 2s and 38s, and nothing in the repo affects it.

## Results

| Phase | Before | After | Change |
|---|---:|---:|---|
| Dependencies (cache restore + `npm ci`) | 32s | 11s | None. This step varies by itself (see below) |
| Content sync | 13s | 4s | Fix 2 |
| Rest of the Astro build | 14s | 7s | Fix 4, plus run-to-run variation |
| Pagefind + deploy | 10s | 8s | — |
| Standard.site publish | 54s | 3s | Fixes 1 and 1b |
| **Clone → done** | **2m16s** | **41s** | |

## Done

### 1. Standard.site publish: one listing instead of 291 lookups

`scripts/publish-standard-site.ts` called `getRecord` for each of the 291 posts in turn,
about 170ms each. It now lists the collection once (`listRecordsByRkey`, 4 requests) and
looks records up by rkey.

### 1b. Standard.site publish: two cover-image bugs

Fix 1 alone left the step at about 80s. Two bugs in the cover-image handling were the cause:

- Every post without a `coverImage` fetched its live page on each run to look for an
  `og:image`. 284 posts have no body image and never get a cover. `mayHaveBodyImage` now
  rules those out from the Markdown source.
- The check for a newly attached cover also fired when a cover was already on the record,
  so the 7 posts with covers were re-written on every build. Now only a cover gained in
  this run counts as a change.

### 2. Content sync: list R2 once instead of a HEAD per image

`materialise` sent a signed HEAD to R2 for every image before returning its URL: thousands
of requests per build across all the loaders. `r2KnownKeys` lists the `blob/` and `ext/`
prefixes once per build and checks keys against that list. If the listing fails, the code
goes back to a HEAD per image, so a listing problem makes the build slower but doesn't
break it. Listing the PDS itself was never the bottleneck: all collections together take
about 1.5s.

### 4. "standardDocuments … was not found" warnings

About 720 warnings per build came from `getEntry` being called for posts with no
`bskyPostRef`. `src/lib/syndication.ts` now reads the collection into a map once per build.
The built HTML is unchanged.

## Not worth doing

### Dependency install (was fix 3)

The original premise was wrong. Cloudflare's dependency cache holds npm's download cache
(`~/.npm`), not `node_modules`, so `npm ci` isn't throwing a restored `node_modules` away.
It builds a fresh one from cached downloads in about 7s. `SKIP_DEPENDENCY_INSTALL` exists,
but with no previous `node_modules` to reuse, an install would still have to run.

Install timings, measured locally with a warm cache:

| Install | Time |
|---|---:|
| `npm ci` | 9.1s |
| `npm ci --no-audit --no-fund` | 8.7s |
| Without the type-checking tools (`--omit=dev`, after moving wrangler, tsx and pagefind to `dependencies`) | 7.9s |

Most of the 545MB `node_modules` is wrangler, workerd and miniflare (about 160MB), and
pagefind and sharp's image libraries add about 90MB more. The build needs all of them. The
rest of this step is Cloudflare restoring its cache, which took between 2s and 19s across
builds and isn't under our control.

### PDS snapshot via the pds-poller Worker

Snapshotting the PDS content would save at most the ~1.5s of PDS listing. Not worth a
second source of truth.

## Remaining options

- **`/work`** takes about 1.1s to render, far longer than any other page (the median is
  about 2ms). It's the largest single item left in the Astro build.
- **The hourly safety-net rebuild** in pds-poller runs the full build 24 times a day. Each
  build is now cheap, but running every 6 hours would still recover from a failed build
  within the day. This is about cost, not speed.
- **`astro build --timings`** gives a per-phase breakdown when the build needs looking at
  again.
