# barryfrost-v7

I want to build a new version of my personal website (barryfrost.com) for my content and information about me. I want a statically-generated mobile-friendly website that considers performance, standards, accessibilty and the IndieWeb principles. It should clearly be my personal website - see the current iteration at https://barryfrost.com for inspiration.

There should be multiple types of post:

1. Articles in Markdown, with a publish date, published occasionally
2. Weeknotes in Markdown, published every Sunday (or a day or two later if I forget)
3. Slash pages that may be updated but are not date-bound (e.g. /about)
4. Posts created from selected records in my atproto PDS

More detail on 4 - I want to display lists of posts from selected types of record stored in my atproto PDS. For example, it should display my Bluesky posts, BookHive books I've read, Beacon Bits (or Drop Anchor) checkins, KipClip bookmarks, etc. I will define which types I want to ingest.

* List pages of posts from my PDS should be the primary navigation for content.
* Because I intend to publish my articles and weeknotes as standard.site documents, they should also appear in the feed on my website and link to the canonical URLs also on my website.
* We should distinguish between feed posts for articles and weeknotes by a "weeknotes" category for weeknotes.
* Lists of feed posts should be created split by post type and separately by month+year.
* Lists should be paginated if necessary.

## Homepage

* Blurb about me
* Links to feed pages for articles, weeknotes and the atproto post lists.
* Links to slash pages for about, follow, contact, archive
* The title of the most recent article
* The 10 most recent weeknotes' titles

## Other requirements

* Statically generate pages using Astro (latest stable version)
* Build with GitHub Actions, host on Cloudflare Workers
* Style with Tailwind. I want auto light mode and dark mode.
* Redirect legacy posts/pages to archive.barryfrost.com/* (I have created a _redirects file for this)
* Mark up posts with Microformats 2 (MF2)
  * `h-feed` for feeds, `h-entry` for posts
  * `syndication` to link to syndicated copies on Bluesky or elsewhere
  * atproto posts should map to MF2 post types and use relevant properties
* Use Cloudflare Images in Astro to generate optimised/resized images
* Publish articles and weeknotes as standard.site records to my PDS (probably via sequoia.pub)
* GitHub Action should be scheduled to periodically check for a newer/updated record in my PDS compared to the last item seen and then trigger a rebuild.

## URL design

- Articles: /2026/03/my-article
- Weeknotes: /weeknotes/123-example
- Slash pages: /colophon
- Posts from PDS (type/rkey): /app.bsky.feed.post/3mgezmuywgk2b

## Backfill

I want to bring across the articles from my existing website and split them into articles and weeknotes posts as described above. Currently they are mixed together.

Eventually I also want to write a script to create records in my PDS for selected checkins, reviews, possibly notes, etc. from the archive. This will be a separate project/script and out of scope for launch.

## Agents

* Ask clarifying questions before making decisions on our approach.
* Always keep this plan updated as decisions are made.
* It's fine to restructure/rewrite the plan to make it more readable.
* Use git and make incremental, regular commits as we go along.
* Keep dependencies minimal and prefer local solutions - confirm before adding any dependency.

## Ideas

* Instead of having articles/weeknotes as posts, create them as standard.site documents, e.g. [1](https://pdsls.dev/at://did:plc:ia2zdnhjaokf5lazhxrmj6eu/site.standard.document/3mbxqm3nrp22x)
  * Create new repo for Markdown files with a GitHub Action to publish/update on push
* Use data in my sifa.id to generate a /work page
* Use profile data from bsky for my avatar, description, (name?)
* Use bsky follows and standard.site subs to create a /following page
* ~~Add travelblog: reverse order, one post at a time. Explanation page then each post /travelblog/1~~ ✓ Done — 83 posts imported from 2000-10-14 to 2001-11-07, collection at /travelblog/1–83
*