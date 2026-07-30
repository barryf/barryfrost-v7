---
title: Colophon
description: How this website is made.
---

This is my personal website, version 7, built on top of [atproto](https://atproto.com). I wrote about why I took this approach, in [My Atmospheric personal website](/articles/atmospheric).

## Data

The AT Protocol is an open protocol for building decentralised social websites and applications. A key concept is the [Personal Data Server](https://atproto.wiki/en/wiki/reference/core-architecture/pds) (PDS) where applications store your data in a server you control[^1]. Your data is freely accessible and owned by you.

My PDS is this website's back-end. The following services store data in my PDS using their own [lexicons](https://atproto.com/guides/lexicon): predefined record types designed for interoperability. Here are the records they store visualised by [PDSls](https://pdsls.dev):

- [Bluesky](https://pdsls.dev/at://did:plc:j5ksi3y4tdtbp7vpsxsfyask/app.bsky.feed.post) - notes, replies and simple photos.
- [Grain](https://pdsls.dev/at://did:plc:j5ksi3y4tdtbp7vpsxsfyask/social.grain.gallery) - photo galleries.
- [BookHive](https://pdsls.dev/at://did:plc:j5ksi3y4tdtbp7vpsxsfyask/buzz.bookhive.book) - books I'm reading and those I've finished.
- [Popfeed](https://pdsls.dev/at://did:plc:j5ksi3y4tdtbp7vpsxsfyask/social.popfeed.feed.review) - films I've watched and reviewed.
- [Rocksky](https://pdsls.dev/at://did:plc:j5ksi3y4tdtbp7vpsxsfyask/app.rocksky.scrobble) - songs and albums I've scrobbled.
- [Sifa](https://pdsls.dev/at://did:plc:j5ksi3y4tdtbp7vpsxsfyask/id.sifa.profile.self) - my professional work profile.
- [Standard Site](https://pdsls.dev/at://did:plc:j5ksi3y4tdtbp7vpsxsfyask/site.standard.graph.subscription) - subscriptions to publications.

Check-ins use a [custom lexicon](https://pdsls.dev/at://did:plc:j5ksi3y4tdtbp7vpsxsfyask/com.atproto.lexicon.schema/com.barryfrost.checkin) for my [Foursquare Swarm](https://swarmapp.com) data. A small service running on [Val Town](https://val.town) polls for new check-ins via the [Foursquare API](https://foursquare.com/developer/) and creates matching records in my PDS.

Articles are (currently) the exception. I wanted control over layout, performance and URLs, and I write all articles and weeknotes in Markdown. Copies are published as [Standard Site](https://standard.site) records on my PDS for reading services to use. My 2000-2001 [Travelblog](/travelblog) is also here, written in Markdown with one file per month.

My atproto handle and identity is `barryfrost.com` which maps to my [DID](https://atproto.com/specs/did): `did:plc:j5ksi3y4tdtbp7vpsxsfyask`.

## Build

[Astro 7](https://astro.build/blog/astro-7/) is the website generator, outputting static HTML without dynamic pages or a database. Data is fetched from my PDS at build time using content loaders working in parallel, along with Markdown files for articles and weeknotes.

[Cloudflare Workers](https://www.cloudflare.com/products/workers/) builds and hosts. For code and article changes, an on-demand rebuild is triggered via any push to the [GitHub repo](https://github.com/barryf/barryfrost-v7). But for updates in my PDS, a small Worker polls the API every minute via [cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/), and fires a deploy hook if there has been a change in its watched collections. There is also a belt-and-braces hourly rebuild.

Disclosure: [Claude](https://claude.com/product/claude-code) writes the Worker and Astro code that I review and deploy.

Images aren't served from my PDS or hot-linked from an external origin[^2]. Any full-size photos, film posters, Bluesky images, and so on, are resized at build time using [sharp](https://npmx.dev/package/sharp), stored in a [Cloudflare R2](https://www.cloudflare.com/products/r2/) bucket in webp format using a content-addressable key filename. Images are processed just once, and served via Cloudflare's CDN.

[Pagefind](https://pagefind.app) is used for static full-text search. At build time, pages built as HTML by Astro are then processed and indexed, ready for the client-side [search](/search) page.

Even with the hourly rebuilds, image transformations and storage, everything fits comfortably within Cloudflare's free tier.

## Front-end

[Performance is a feature](https://blog.codinghorror.com/performance-is-a-feature/), and I've tried to optimise download speed. Pages are static and delivered by Cloudflare's global CDN. There is very little JavaScript: [Leaflet.js](https://leafletjs.com) for maps, Pagefind on the search page, and [Umami](https://umami.is)[^3] for analytics. Fonts are [self-hosted](https://docs.astro.build/en/guides/fonts/)[^4] and preloaded. Images are pre-sized and optimised in efficient webp format, and pages preconnect to the images host.

Content on pages, articles, and weeknotes is authored in [Markdown](https://daringfireball.net/projects/markdown/), and [MDX](https://mdxjs.com) to use components like icons. Templates include [Microformats 2](https://microformats.io) markup - `h-feed`, `h-card` and `h-entry` - with relevant classes for [Post-Type Discovery](https://www.w3.org/TR/post-type-discovery/). There are `rel=me` links to my profiles on GitHub, Mastodon and Bluesky.

I've split content into two channels that you can [follow](/follow): one for just my writing (articles and weeknotes) at `/feed.*`, or a firehose/everything feed at `/stream.*`. Feeds are available as [MF2](https://microformats.io), [RSS](https://aboutfeeds.com), and [JSON Feed](https://www.jsonfeed.org).

Articles and weeknotes are published as Standard Site [documents](https://standard.site/docs/lexicons/document/) in separate [publications](https://standard.site/docs/lexicons/publication/) with `<link>` tags for discovery.

[Cool URIs don't change](https://www.w3.org/Provider/Style/URI). Content from my previous website is 301-redirected to its new home. Any legacy URLs for content I no longer maintain, like bookmarks, are redirected to a static copy at *archive.barryfrost.com*.

With accessibility in mind, there is screen-reader friendly markup throughout, a skip link, machine-readable `<time>` values with every relative date, high-contrast AAA styles, and a dark mode that needs no JavaScript.

No cookies are used. For security, headers define [HSTS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security), `nosniff`, a `Referrer-Policy`, and a `Permissions-Policy` denying camera, microphone, geolocation and payment.

## Design

This website is deliberately lo-fi. It uses spacing, not lines, to separate sections. Colour is used sparingly.

[Tailwind 4](https://tailwindcss.com) is used for styles.

I discovered [Work Sans](https://weiweihuanghuang.github.io/Work-Sans/) and love its slightly-wide, [Grotesque](https://fonts.ilovetypography.com/category/grotesque) look. It's used for all non-code text, with body-sized headings that use the semi-bold weight for emphasis. [ui-monospace](https://www.w3.org/TR/css-fonts-4/#ui-monospace-def) is the default for code.

The [Asterism](https://en.wikipedia.org/wiki/Asterism_(typography)) (⁂) symbol is used as a [dinkus](https://en.wikipedia.org/wiki/Dinkus) for section breaks instead of horizontal rules. It's a traditional typographic ornament, which I think complements Work Sans nicely. It's also a fun nod towards [federation](https://symbol.fediverse.info/en) and the social web.

Icons are SVGs sourced from [atmologos](https://tangled.org/cozylittle.house/atmologos) for the atproto services, and [Heroicons](https://heroicons.com) for generic symbols.

An inverted dark scheme is used when specified by the operating system via `prefers-color-scheme`.

## Next

There are currently no comments, no Webmentions and no likes. These are future improvements I'm considering.

## Source

The website source code is [available on GitHub](https://github.com/barryf/barryfrost-v7) under the [MIT&nbsp;licence](https://opensource.org/license/mit).

All content and original images are licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

<div class="py-4 italic">Last updated: <time datetime="2026-08-04">4 August 2026</time>.</div>

[^1]: I'm using Bluesky's shared PDS today, but my [DID](https://atproto.com/specs/did) and data are fully portable.
[^2]: With two small exceptions: [Blogroll](/blogroll) favicons fall back to *google.com/s2/favicons* when a subscription has no avatar, and the [check-ins](/check-ins) map pulls tile images from [CARTO](https://carto.com).
[^3]: [Umami](https://umami.is) is a cookieless, privacy-respecting analytics service, but it's worth pointing out that anonymous usage data is sent to its cloud service.
[^4]: Astro downloads Work Sans from [Google Fonts](https://fonts.google.com) at build time, so there's no runtime request to Google. This is as much for privacy as for performance.
