# Build speed plan

The Cloudflare Workers Build of 2026-10-15 19:37 took **2m19s**. This plan breaks that down
from the build log and lists the fixes in order of payoff.

## Where the time goes

| Phase | Time | Share | Log evidence |
|---|---:|---:|---|
| Init + clone | 8s | 6% | 19:37:43 → 19:37:51 |
| Restore dependency + output caches | 19s | 14% | 19:37:51 → 19:38:10 |
| `npm clean-install` | 13s | 9% | 19:38:10 → 19:38:23 |
| wrangler / tsx start-up | 3s | 2% | 19:38:24 → 19:38:27 |
| Astro config + **content sync** | 15s | 11% | 19:38:27 → 19:38:42 ("Synced content", "Generated 13.62s") |
| Vite bundles | 3s | 2% | 19:38:42 → 19:38:45 |
| Render 476 pages | 10s | 7% | "Completed in 10.19s" |
| Images (all cache hits), sitemap, Pagefind | 2s | 1% | |
| Asset upload + deploy | 8s | 6% | 19:38:57 → 19:39:05 |
| **Standard.site publish** | **54s** | **39%** | 19:39:05 → 19:39:59 |
| Pending summary + cache upload | 3s | 2% | |

The biggest cost is the Standard.site publish step (54s). The PDS reads are not the main
problem: listing every watched collection in parallel took about 1.5s when measured from the
sandbox (table below). Most of the 13s content sync is work done for each image.

### PDS listing, measured

`listRecords` for each collection, all fetched in parallel from bsky.social:

| Collection | Records | Pages | Time |
|---|---:|---:|---:|
| com.barryfrost.checkin | 1,381 | 15 | 1.47s |
| app.bsky.feed.post | 1,442 | 16 | 1.41s |
| app.rocksky.scrobble | 519 | 7 | 1.26s |
| site.standard.document | 291 | 4 | 0.92s |
| social.popfeed.feed.review | 222 | 4 | 0.80s |
| everything else | <110 each | 2–3 | <0.7s |

Caching the PDS content between builds would save about 1.5s at most.

## Fixes, in order of payoff

### 1. Standard.site publish: 54s → ~3s

`scripts/publish-standard-site.ts` runs a sequential `getRecord` for each of the 291 posts,
at about 170ms per post. 284 of the 291 posts are skipped anyway.

- Fetch the existing records once with `fetchAllRecords(DOCUMENT_COLLECTION)` and look them
  up by rkey in a `Map`. That's 4 requests (about 0.9s measured) instead of 291.
- Run the remaining per-entry work through `mapLimit` (around 8 at a time). Most entries
  skip without any network call. The few with relative images still fetch their live page
  in `withResolvedImages`.
- Keep `assertNoDuplicateRkeys` and the sequential Bluesky `createRecord` for new weeknotes
  unchanged. Only the reads and `putRecord` writes need to run in parallel.

This build also re-wrote 7 records: 4 articles and weeknotes 166, 261 and 266. The articles
with known body images (eyes-lasered, witness-the-fitness, remote-working, bbc-radio) are
ones whose body images resolve to `/_astro/*` hashes, and today's Astro upgrade probably
changed those hashes. Check that the next build skips them. If they're re-written on every
build, the content signature isn't stable and each one costs a `putRecord`.

### 2. Images in the content sync: ~13s → ~2–3s (estimate, to be confirmed)

In production, every `pdsImage`/`remoteImage` call runs `r2Exists`, a signed `HEAD` request
to R2, before it can return a URL. The concurrency limit is 24 (`src/lib/r2.ts`). On a
typical build these images are all already in R2, yet each still costs a round trip. Call
sites:

- check-ins: 2 images per photo
- Bluesky posts: 2 per image, plus external thumbnails
- Grain photos: 2 per photo
- scrobbles: 519 records
- films: 222 records
- books, blogroll, subscriptions

That adds up to thousands of HEAD requests per build.

- At the start of the build, list the bucket once with `ListObjectsV2` for the `blob/` and
  `ext/` prefixes (1,000 keys per page) and keep the keys in a `Set`. `materialise` then
  checks the set and only falls back to fetch/resize/`PUT` for keys that are missing. The
  keys are content-addressed, so a key in the list is always valid.
- Add new keys to the set after each `PUT`, so the same image requested twice in one build
  doesn't get uploaded twice.

I couldn't measure this from the sandbox because it has no R2 credentials. To confirm, add
`--timings` to the build script (see 6) and compare `content sync` before and after.

### 3. Dependency install: 32s → ~10–15s (needs a Cloudflare experiment)

Cloudflare spends 19s restoring the cached `node_modules`. `npm clean-install` then deletes
`node_modules` and reinstalls all 347 packages (13s). Only the npm cache in that restore is
any use. Options, best first:

- **Keep the restored `node_modules`.** Check the Workers Builds docs for a way to skip the
  automatic install (Pages has `SKIP_DEPENDENCY_INSTALL`). If it exists, run
  `npm install --prefer-offline --no-audit --no-fund` at the start of `npm run deploy`. When
  the lockfile hasn't changed, that's close to a no-op.
- **Or turn off the dependency cache** and let `npm ci` download fresh. This saves the 19s
  restore but makes the install slower. Time it before committing to it.
- Either way, approve the three postinstall scripts the log warns about (`esbuild`, `sharp`,
  `workerd`) with `npm approve-scripts`. If those scripts are being blocked, a future npm
  version will turn the warnings into a failed build.

### 4. Log noise: about 1,000 "Entry standardDocuments → … was not found" warnings

`src/lib/syndication.ts` calls `getEntry('standardDocuments', rkey)` for every post. The
loader only stores records that have a `bskyPostRef`, so Astro logs a warning for each post
without one. Every page that lists posts repeats that warning for each post it lists:
`/stream`, `/stream.json` and `/stream.xml` each print the whole set. Build the map once with
`getCollection('standardDocuments')` and look entries up in it. This mostly cleans up the
log, though writing a thousand log lines through Cloudflare's logger isn't free either.

### 5. Page rendering: 10s, smaller wins

- `/work` takes 479ms here (905ms locally), about 100 times the median page. Profile it.
- The 70 `/check-ins/N` pages take 20–70ms each, about 2.5s in total. Each probably filters
  or sorts the whole collection. Do that once at module level and slice it for each page.
- The Bluesky loader makes one AppView `getPosts` call per quoted post, and the reply-handle
  cache misses when several records share the same parent DID at the same time. Batch the
  quote lookups (25 URIs per call) and store the in-flight promise in the cache so concurrent
  lookups share it. This takes calls out of the content sync rather than out of rendering.

### 6. Measure in CI

Change the build script to `astro build --timings` for a few weeks. The report adds about
30 lines and shows each change's effect on Cloudflare's machines, not just locally.

## Not recommended (yet)

**PDS snapshot via the pds-poller Worker.** The poller already diffs the watched collections
every minute. It could also write the raw records to R2, and the loaders would then read one
object instead of listing the PDS. The measured saving is about 1.5s, and it would add a
second source of truth to keep consistent. Revisit only if `content sync` is still slow
after fix 2.

**Incremental loaders.** Use the persisted content-layer store to skip records whose `cid`
digest hasn't changed, instead of calling `store.clear()` and rebuilding. This only helps if
Cloudflare's output cache reliably keeps Astro's cache directory between builds. Fix 2 gets
most of the same benefit without depending on that.

## Also worth deciding

The hourly safety-net cron in the pds-poller runs a full 2m19s build 24 times a day, on top
of the builds triggered by content changes. Fixes 1–3 make each one cheaper. Running it every
6 hours instead of hourly would still recover from a failed on-demand build within the day.

## Expected result

| | Before | After 1–3 |
|---|---:|---:|
| Standard.site publish | 54s | ~3s |
| Content sync | 13s | ~3s |
| Dependencies | 32s | ~15s |
| Everything else | 40s | ~40s |
| **Total** | **2m19s** | **~1m** |
