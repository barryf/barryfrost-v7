---
title: "How to comment"
date: 2015-01-17
visibility: unlisted
categories:
  - comment
  - transformative
---

You can comment on [any of the posts](/all) on this site using the [IndieWeb comment](http://indiewebcamp.com/comment) method. Here's how it's done.

## Short version

1. Publish a post on your own site with [Microformats 2](http://microformats.org/wiki/microformats2) markup. Use [h-entry](http://microformats.org/wiki/h-entry) for the content and [h-card](http://microformats.org/wiki/h-card) for your profile.
1. Link back to my post with `rel="in-reply-to"`.
1. Send a [Webmention](http://webmention.org) from your post to mine.
1. I'll then parse your comment and display it below my post.

## Longer version

### Write

Publish a post on your own site with [Microformats 2](http://microformats.org/wiki/microformats2) markup. You don't need any special software, just a tool that allows you to enter raw HTML.

    <div class="h-entry">
      <div class="e-content">I agree with you, Barry.</div>
      <div class="p-author h-card">John Smith</div>
    </div>

### Link back

Link back to my post with `rel="in-reply-to"`. This doesn't need to be part of the above h-entry, but should be placed somewhere on your post's permalink page.

    <a href="https://barryfrost.com/2015/01/a-post" rel="in-reply-to">
      A post about something important
    </a>

Instead of a comment you can alternatively indicate that you have **liked** or **reposted** my post by adding a `u-like-of` or `u-repost-of` to your link:

    <a href="https://barryfrost.com/2015/01/a-post" class="u-like-of">
      I liked this
    </a>

    <a href="https://barryfrost.com/2015/01/a-post" class="u-repost-of">
      I reposted this
    </a>

### Webmention

Finally, send a Webmention from your post to mine to let me know you have a comment for me to retrieve.

My Webmention endpoint is: https://barryfrost.com/webmention. Send an HTTP POST to this URL with the following form variables (using your own URLs of course):

- `source=https://example.org/my-reply`
- `target=https://barryfrost.com/2015/01/a-post`

You can use one of [several clients](https://github.com/indieweb) to send your Webmention, but the simplest way to do this is via [curl](http://curl.haxx.se):

    $ curl -i -d "source=YOUR_POST_PERMALINK&target=MY_POST_PERMLINK" \
    https://barryfrost.com/webmention

If your Webmention to me fails for any reason [let me know](/contact) and I'll be more than happy to help you debug.

### Display

If successful, my server will parse your post, fetch your comment and add it below my original post.
