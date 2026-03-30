---
title: "My serverless, headless, Micropub-powered, personal website"
date: 2021-07-13
syndication:
  - https://twitter.com/barryf/status/1415033757661270018
---

**TL;DR** *This is my new personal [IndieWeb](https://indieweb.org/) website built using serverless AWS services, written in Node.js with the [Architect framework](https://arc.codes/). The backend is a [Micropub](https://micropub.net/) server with a separate frontend that fetches posts using Micropub queries, rendering pages behind a CDN.*

Look, I know it’s a developer cliché for the majority of posts on your blog to be about rewriting your own personal website software, but I find my website is the perfect place to try out new technology and then document what I’ve learned.

So, yes, this is a blog post about my new website. As well as a refreshed design, it’s completely different behind the scenes. The project is called [Vibrancy](https://github.com/barryf/vibrancy). It’s massively over-engineered! But that’s the point: learn, have fun and enjoy slowly hacking away after the kids go to bed.

## Goals

- **Instant updates**. My website has over 10K posts and even the fastest static site generators take ~10 seconds to build and deploy so many files. I want the time between hitting create/update and the page refreshing to be instant.
- **Save money**. My [previous](https://barryfrost.com/2016/11/colophon), low-traffic website cost $16/month on Heroku for a Hobby tier dyno, plus a PostgreSQL database with over 10K rows. I love Heroku, but that’s a bit much for my little website. I wanted my website to cost a few dollars on AWS, after the [always free](https://aws.amazon.com/free/) limits.
- **Use new (to me) technology:**
   - **Serverless**: My website doesn't get much traffic and having an always-on server seemed wasteful. It seemed like a good use-case for trying small, stateless Node.js functions that can be called on-demand without reserving compute.
   - **AWS**: While I’d used EC2 and S3 before, I wanted to experiment with other AWS services like Lambda, API Gateway, DynamoDB, SNS and CloudWatch that complement a serverless approach.
   - **Node.js**: Ruby is a comfortable pair of shoes. I used it for previous versions of this website and it felt like time for a change. Node.js is a well-supported choice for Serverless.

## Framework

I’m using [Architect](https://arc.codes/) for both the backend and frontend apps. I spent some time prototyping with the [Serverless Framework](https://www.serverless.com/), but was left frustrated at its incomplete support for local development. This is where Architect [shines](https://arc.codes/docs/en/guides/get-started/why-architect):

> Architect is an opinionated developer experience (DX) for building database backed web apps with AWS. We remove all the noise and friction to building serverlessly. We prioritize speed with fast local dev, smart configurable defaults and flexible Infrastructure as Code.

At its core is the [app.arc manifest file](https://arc.codes/docs/en/guides/get-started/project-layout) and a file structure based around primitives for HTTP requests, events, queues, scheduled tasks, tables, static files and more. Each maps to an AWS service, for example `tables` corresponds to DynamoDB tables and `queues` to SQS. Architect then provides helpers to simplify working with each service. And by running `arc deploy`, it builds a SAM application that is magically deployed via CloudFormation to AWS.

Architect has been a breath of fresh air and reminds me of how natural Rails felt the first time I tried it. It deserves a proper article.

## Backend

![Backend architecture](https://barryf.s3.eu-west-1.amazonaws.com/vibrancy-backend.png)

*Vibrancy's backend architecture, hosted using AWS.*

### Headless CMS

I like the concept of separating the management of my content from its display by adopting a [headless CMS](https://en.wikipedia.org/wiki/Headless_content_management_system) architecture. In theory, I‘m free to build multiple frontends that all use the same backend. There are plenty of excellent headless CMS options, but I built my own. Why? Well, I wanted to embrace the constraints of managing content exclusively via [Micropub](https://micropub.net/).

By implementing the Micropub server specification, Vibrancy has a mature, well-documented API for creating, updating, deleting, reading and querying posts. There is no admin system. Instead, using a Micropub client like [Micropublish](https://micropublish.net/) or [Quill](https://quill.p3k.io/), I can log in (via [IndieAuth](https://www.w3.org/TR/indieauth/)) and manage my content.

### Media endpoint

Vibrancy offers a [Micropub media endpoint](https://indieweb.org/micropub_media_endpoint): a method to upload images and get a URL for use in posts. [Cloudinary](https://cloudinary.com) is used to upload, store and serve photos. Its ability to dynamically-resize images means I can upload one large file and then request different sizes on the fly, keeping frontend page sizes down. Images are then also uploaded to GitHub.

### Background events

Using Architect’s `event` handlers, the server fires off asynchronous tasks in the background to avoid blocking page requests. Lambda functions are handled using SNS.

- **Syndication**: if specified when I create a post, the backend will [POSSE](https://indieweb.org/POSSE) notes to Twitter and bookmarks to [Pinboard](http://pinboard.in/).
- **Webmentions**: when a post is created or updated, the server will send [webmentions](https://webmentions.net/) to any links using [Telegraph](https://telegraph.p3k.io).
- **Backup**: all posts, webmentions and photos are also stored in a private git repo on GitHub.
- **Contexts**: to display a snippet of the source of any bookmarks, RSVPs, replies, reposts or likes, the server uses [Granary](http://granary.io/) to fetch structured data in Microformats format and falls back to Open Graph metadata.
- **Push**: the server uses [Pushover](https://pushover.net) to send me a push notification whenever a webmention is received.

### Storage

- **DynamoDB**: Content is indexed and stored in AWS’s DynamoDB. It’s a fast, low-latency database and its `tables` are a core primitive in Architect. I’m reasonably happy with it, but found the need to create extra tables a bit dirty when trying to combine filters with pagination. It was worth embracing its differences and learn its constraints to follow the Architect happy path.
- **GitHub**: Content is also stored in a git repository on GitHub as a backup. If needed, I could regenerate the DynamoDB database from the repo. I’ve chosen to make the repo private because it’s possible some posts may be private or start off as drafts.
- **Cloudinary**: As described above, photos are stored in Cloudinary and served from its CDN.

## Frontend

![Frontend architecture](https://barryf.s3.eu-west-1.amazonaws.com/vibrancy-frontend.png)

*Vibrancy’s frontend architecture, hosted using AWS and Cloudflare.*

### Micropub queries

The frontend website doesn’t have a database or any content files of its own. Instead, when a post is requested, a Micropub `source` query is made to the backend and the post is returned in [Microformats 2 JSON](http://microformats.org/wiki/microformats2-json) format.

```json
// Request for https://barryfrost.com/2021/07/a-post
GET https://api.barryfrost.com/micropub?q=source&url=https://barryfrost.com/2021/07/a-post
{
  "type": [
    "h-entry"
  ],
  "properties": {
    "published": [
      "2021-07-01T12:34:56Z"
    ],
    "content": [
      "This is my post. I use *Markdown* to mark up text."
    ]
  }
}
```

The frontend takes this JSON object and renders a page using [Nunjucks](https://mozilla.github.io/nunjucks/) templates. It also converts Markdown to HTML if needed.

Lists of posts are also fetched in the same way, but with additional parameters to filter results:

- `before` takes an integer representing the epoch time of a post’s published timestamp. This method is used to paginate results.
- `limit` is the number of posts to return in the response, defaulted to 20.

Like the backend, the frontend uses the Architect framework.

### Style

This is the first project on which I’ve used [Tailwind CSS](https://tailwindcss.com). Initially it felt like [heresy](https://barryfrost.com/2020/11/i-ve-been-using-tailwindcss-for), but I quickly began to enjoy how fast it was to build solid, responsive layouts without needing to bounce back-and-forth between HTML and CSS files. Tailwind also provides a built-in dark mode with very little configuration.

I’m using inline SVGs for icons instead of an icon font to help further decrease page load times.

### CDN

The frontend is not static. It queries and renders pages on demand. However, posts are cached and served using Cloudflare’s CDN (Content Delivery Network). I use very long `s-maxage` cache headers for posts which mean that requests are less likely to hit the frontend. If a post is updated Vibrancy sends a flush API request to Cloudflare.

## Webmentions

Vibrancy fully supports [webmentions](https://webmentions.net/) for replies, reposts, likes or mentions from another IndieWeb website or service.

- **Receiving**: Vibrancy currently uses [webmention.io](http://webmention.io) to receive webmentions, accepting a Microformats payload using a webhook. Next on my list is [building my own receiver](/2021/05/building-a-webmention-receiver).
- **Sending**: Webmentions are sent via [Telegraph](https://telegraph.p3k.io) using a background event whenever a post is created or updated.
- **Backfeed**: Using the magic of [Bridgy](https://brid.gy/), responses to my syndicated copies (e.g. tweets) are pulled back as webmentions.

## Open source

Vibrancy’s source code is available on GitHub for both the [backend](https://github.com/barryf/vibrancy) and [frontend](https://github.com/barryf/barryfrost) using the [MIT licence](https://opensource.org/licenses/MIT). Feel free to poke around, but I’m still actively developing and improving it and I wouldn’t recommend using Vibrancy for your own site just yet.
