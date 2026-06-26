---
featured: true
title: "Micropublish: IndieAuth updates and supported properties feature"
date: 2020-12-14
tags:
  - micropublish
  - indieauth
  - indieweb
---

Yesterday I pushed a new release of [Micropublish](https://micropublish.net) to include recent updates for clients to the [IndieAuth specification](https://indieauth.spec.indieweb.org/), as summarised in [Aaron Parecki](https://aaronparecki.com)'s [IndieAuth 2020 write-up](https://aaronparecki.com/2020/12/03/1/indieauth-2020).

The two biggest IndieAuth changes are the use of a OAuth 2.0 PKCE (Proof Key for Code Exchange) to secure authorisation and confirming the auth server if the original `me` value differs from that returned from the token endpoint. See the [GitHub issue](https://github.com/barryf/micropublish/issues/54) for more.

Additionally, Micropublish now has experimental support for [queries for supported properties, for a supported post-type](https://github.com/barryf/micropublish/issues/51).

Thanks to [Jamie Tanna](https://www.jvt.me) and [David Shanske](https://david.shanske.com/) for their help debugging and testing.
