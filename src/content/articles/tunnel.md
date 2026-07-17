---
featured: true
title: "Creating a tunnel to localhost with Cloudflare"
date: 2023-03-11
tags:
  - til
  - tunnel
  - localhost
  - dev
syndication:
  - https://mastodon.social/@barryf/110004888458182990
---

I found this handy tip via @wesbos. You can create a temporary tunnel to localhost on your machine using [Cloudflare](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/local/).

Even better, if you use Cloudflare for a domain's DNS, you can set up a permanent, named tunnel with a subdomain. Here's how it works:

```sh
$ cloudflared tunnel login
$ cloudflared tunnel create local
$ cloudflared tunnel route dns local http://local.yourdomain.com
$ cloudflared tunnel run --url http://localhost:9999 local
```

I've previously used [ngrok](https://ngrok.com) for free temporary URLs when developing against external APIs, but to create permanent tunnels was a paid feature. This is a nice, free alternative through a service I'm already using.
