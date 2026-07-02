---
title: "Acquiescence: a basic IndieAuth server"
date: 2017-05-24
tags:
  - indieweb
  - indieauth
  - acquiescence
syndication:
  - https://twitter.com/barryf/status/867477079180414976
  - https://news.indieweb.org/en/barryfrost.com/2017/05/acquiescence
---

[IndieAuth](https://indieweb.org/IndieAuth) is a method for using your own domain name to sign in to other sites and tools. It's one of the key parts of [Micropub](https://micropub.net), the (newly) [W3C recommended](https://www.w3.org/blog/news/archives/6326) standard for posting to your site. [IndieAuth.com](https://indieauth.com/) is the original and one of the very few public implementations of an IndieAuth server that you can use, but recently I've been having [problems](https://github.com/aaronpk/IndieAuth.com/issues/148) getting it to work with my site's SSL setup.

So I decided this was a good opportunity to try building my own IndieAuth [authorization](https://indieweb.org/authorization-endpoint) and [token](https://indieweb.org/token-endpoint) endpoints using the detailed documentation in the [IndieWeb wiki](https://indieweb.org).

And [Acquiescence](https://github.com/barryf/acquiescence) is the result. It's very simple (~160 lines of Ruby) and allows me to use my GitHub account to authenticate, authorise and grant scoped access to third-party tools like [Micropublish](https://micropublish.net). I'm now using it for this site's domain.

I've used my favourite stack of Ruby, Sinatra and Heroku for hosting, plus Redis to store the auths/tokens. The source code is available at [https://github.com/barryf/acquiescence](https://github.com/barryf/acquiescence) if you want to poke around.