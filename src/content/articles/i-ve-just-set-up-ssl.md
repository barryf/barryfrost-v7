---
title: "Using camo for SSL image proxying"
date: 2015-01-14
visibility: unlisted
tags:
  - moof
  - ssl
  - https
  - proxy
---

I've just set up SSL image proxying on my website through [camo](https://github.com/atmos/camo) to make sure any external non-https images are served via https. Camo is a simple HTTP proxy that also encrypts URLs with HMAC to prevent someone piggy-backing off your service.

Currently running nicely through Heroku using their wildcard SSL herokuapp.com certificate. My first time using a ["Deploy to Heroku" button](https://blog.heroku.com/archives/2014/8/7/heroku-button) which made this ridiculously easy to get set up.

I now wrap external (http) image URLs on here with `camo_image()`:

    # from https://github.com/atmos/camo/blob/master/test/proxy_test.rb

    def hexenc(image_url)
      image_url.to_enum(:each_byte).map { |byte| "%02x" % byte }.join
    end

    def camo_image(image_url)
      hexdigest = OpenSSL::HMAC.hexdigest(OpenSSL::Digest::Digest.new("sha1"), CAMO_KEY, image_url)
      encoded_image_url = hexenc(image_url)
      "#{CAMO_URL}/#{hexdigest}/#{encoded_image_url}"
    end

[You can see it in action here](https://barryfrost.com/2015/01/11-124917).
