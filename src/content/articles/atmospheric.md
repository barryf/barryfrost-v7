---
title: My Atmospheric personal website
description: Introducing my new website and its atproto-centric approach.
date: 2026-08-03
featured: true
tags:
  - atproto
  - indieweb
  - personal
---

When I post on [Bluesky](https://bsky.app/profile/barryfrost.com), upload photos to [Grain](https://grain.social/profile/barryfrost.com), finish reading a book on [BookHive](https://bookhive.buzz/profile/barryfrost.com), listen to an album with [Rocksky](https://rocksky.app/profile/barryfrost.com) or rate a film on [Popfeed](https://popfeed.social/profile/did:plc:j5ksi3y4tdtbp7vpsxsfyask), within a minute this activity also appears on my website.

None of these services know my website exists. I haven't written integrations or used their APIs. They all store my data in the same place: my [Personal Data Server](https://atproto.wiki/en/wiki/reference/core-architecture/pds) (PDS) to which I've given them permission to write using [AT Protocol](https://atproto.com).

My website polls my PDS every minute, and if there's been a change made by one of the services it's watching, it fetches collections from the PDS and rebuilds its pages directly from the records.

*My website's back-end is my PDS.*

## Version 7

This is my first personal website rebuild in five years. My last was a (deliberately) over-engineered Serverless platform that ran only on AWS. This time, I wanted a [static website](https://strapi.io/blog/what-is-a-static-website) for greater end-user performance, to reduce server costs, and to make it easily portable to another static host.

For the front-end, I'm using [Astro](https://astro.build), my PDS for the back-end, [Cloudflare Workers](https://www.cloudflare.com/products/workers/) to host, and a number of other technologies described in more detail in the [colophon](/colophon).

## IndieWeb

Building with atproto means a change from using [Micropub](https://micropub.net) to maintain content. The previous [POSSE](https://indieweb.org/POSSE) approach meant I owned my data, but I then needed to maintain endpoints for posting, and create integrations to syndicate copies elsewhere. Even though I built my own [Micropub client](https://micropublish.net), posting always felt clunky and added friction. Instead, someone else's polished atproto app is now the interface.

My website is still [IndieWeb](https://indieweb.org): I use Microformats 2 markup, including `h-feed`, `h-card`, `h-entry` and `rel=me`. And my identity, *barryfrost.com*, is the same, as is my philosophy of owning my data, but I've removed the steps required to syndicate to other websites.

## Exceptions

One design decision I flip-flopped on was how to handle long-form writing. I strongly considered using [Leaflet](https://leaflet.pub), [Offprint](https://offprint.app) or [Pckt](https://pckt.blog) - the main atproto long-form services - so that all content would be sourced in the PDS, but I wanted more control over layout, performance and URLs. Instead, I write [articles](/articles) and [weeknotes](/weeknotes) in Markdown and publish [Standard Site](https://standard.site) records back to my PDS.

For check-ins I wanted to continue using [Foursquare Swarm](https://swarmapp.com) on my phone. There are atproto check-in services, but none are compatible with Swarm, so I decided to define my own [custom lexicon](https://pdsls.dev/at://did:plc:j5ksi3y4tdtbp7vpsxsfyask/com.atproto.lexicon.schema/com.barryfrost.checkin). This is one of the strengths of the protocol: it's easy to just add what's missing.

## AI

As part of this rebuild, I wanted to practise using AI for coding. Apart from tweaking layouts and text, I've deliberately used [Claude Code](https://claude.com/product/claude-code) to write all the code. I've fired off sub-agents, asked Opus to orchestrate Sonnets, built full features on the iPhone app, and I've come away impressed. And by reviewing the code, I've improved my knowledge of TypeScript.

Unlike the build, however, I've not used AI for the design. I experimented with [Claude Design](https://claude.com/product/design), but the outputs felt too manufactured, and not like something I would create. The design I've settled on is more me.

## Next

I've lowered the bar for posting on my website. What used to require conscious effort is now automatic. This does mean I'm relying on a handful of reasonably new services, but the records are mine, and if a service shuts down (or makes breaking changes) I can migrate elsewhere.

There's more that I want to do. I want to set up my own PDS - I'm currently using Bluesky's. I'm considering whether replies and bookmarks belong on these pages. And I want to explore whether [Webmention](https://webmention.net) fits.

In the atproto community, services built on the protocol are called *Atmospheric*, which I'm happy to say, now includes *barryfrost.com*.
