---
title: "Announcing Transformative"
date: 2016-11-10
visibility: unlisted
tags:
  - transformative
  - indieweb
  - micropub
  - webmention
syndication:
  - https://twitter.com/barryf/status/796780455425179648
---

**UPDATE: My website now uses newer software. This post is maintained for posterity.**

I'm happy to say this site is now running my new [IndieWeb][] microblogging software, [Transformative][], which I've [open-sourced][transformative] on GitHub.

The main reason behind the rewrite was to support the latest [Micropub][] specification. Sometimes it's easier (and more fun) to try a different approach than battle legacy decisions, especially when it's your own site. Content is now [Microformats2][] end-to-end and stored in a [GitHub repo][content].

Transformative [passes all Micropub tests][mp-ir] in the very handy [Micropub.rocks][mprocks] test suite. I've also contributed a few updates to the [Ruby webmention gem][gem] and this site now also meets a healthy level of compliance with the [Webmention][] spec, including updates and deletes.

Underneath, I've used Ruby and [Sinatra][] again, but I've switched hosting back to [Heroku][] from a VPS, mainly because I didn't want to have to install and configure Postgres or do regular sysadmin chores. Doing so was interesting for a while.

[Cloudflare][] sits in front of Heroku and maintains a free full SSL connection for pages, while S3 serves media securely.

The new site should hopefully have kept 100% of older posts at the same URLs by maintaining the previous URL scheme, or via redirects if needed. No [link rot][cooluris] here.

Next, I want (and need) to update my Micropub client, [Micropublish][], to bring it up-to-date and support editing and deleting of posts.

Send me a webmention (or tweet) and let me know what you think.

[indieweb]: https://indieweb.org
[transformative]: https://github.com/barryf/transformative
[micropub]: https://micropub.net
[webmention]: https://webmention.net
[sinatra]: http://www.sinatrarb.com
[heroku]: https://www.heroku.com
[cloudflare]: https://www.cloudflare.com
[cooluris]: https://www.w3.org/Provider/Style/URI
[micropublish]: https://micropublish.net
[mp-ir]: https://micropub.rocks/implementation-report/server/30/Qr4kVp0CSxFGY9Zfpsfh
[mprocks]: https://micropub.rocks
[gem]: https://github.com/indieweb/mention-client-ruby
[microformats2]: http://microformats.org/wiki/microformats2
[content]: https://github.com/barryf/content
