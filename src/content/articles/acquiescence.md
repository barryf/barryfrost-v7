---
title: "Acquiescence: a basic IndieAuth server"
date: 2017-05-24
syndication:
  - https://twitter.com/barryf/status/867477079180414976
  - https://news.indieweb.org/en/barryfrost.com/2017/05/acquiescence
---

<div><a href="https://indieweb.org/IndieAuth">IndieAuth</a> is a method for using your own domain name to sign in to other sites and tools. It’s one of the key parts of <a href="https://micropub.net">Micropub</a>, the (newly) <a href="https://www.w3.org/blog/news/archives/6326">W3C recommended</a> standard for posting to your site. <a href="https://indieauth.com/">IndieAuth.com</a> is the original and one of the very few public implementations of an IndieAuth server that you can use, but recently I’ve been having <a href="https://github.com/aaronpk/IndieAuth.com/issues/148">problems</a> getting it to work with my site’s SSL setup.<br><br>So I decided this was a good opportunity to try building my own IndieAuth <a href="https://indieweb.org/authorization-endpoint">authorization</a> and <a href="https://indieweb.org/token-endpoint">token</a> endpoints using the detailed documentation in the <a href="https://indieweb.org">IndieWeb wiki</a>.<br><br>And <a href="https://github.com/barryf/acquiescence">Acquiescence</a> is the result. It’s very simple (~160 lines of Ruby) and allows me to use my GitHub account to authenticate, authorise and grant scoped access to third-party tools like <a href="https://micropublish.net">Micropublish</a>. I’m now using it for this site’s domain.<br><br>I’ve used my favourite stack of Ruby, Sinatra and Heroku for hosting, plus Redis to store the auths/tokens. The source code is available at <a href="https://github.com/barryf/acquiescence">https://github.com/barryf/acquiescence</a> if you want to poke around.</div>
