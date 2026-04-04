---
title: "Introducing Webhook Mentions"
date: 2016-07-28
categories:
  - indieweb
  - webmention
  - github
  - jekyll
syndication:
  - https://twitter.com/barryf/status/758767801523904513
---

Webhook Mentions is a very simple Ruby app I've built that sends [Webmentions](http://webmention.net) to any links in new/updated posts in a [Jekyll](https://jekyllrb.com)-powered [GitHub Pages](https://pages.github.com) site marked up with [Microformats 2 h-entry markup](http://microformats.org/wiki/microformats2#h-entry).

It's intended to wait quietly in the background and is triggered via a webhook that's fired when you push to your GitHub Pages blog.

Full instructions and source code are on the [webhook-mentions](https://github.com/barryf/webhook-mentions) GitHub repository.

It was inspired in part by [Pelle Wessman](http://voxpelli.com)'s [webpage-micropub-to-github](http://github.com/voxpelli/webpage-micropub-to-github) project that acts as a [Micropub](http://micropub.net) gateway for your GitHub Pages blog. I wanted to provide a way for those with static blogs to use another key [IndieWeb](https://indieweb.org) technology.

It was my first time using the incredibly easy-to-use [Heroku Button](https://blog.heroku.com/heroku-button) which makes it simple to set up your own instance of a little app like this. Recommended.
