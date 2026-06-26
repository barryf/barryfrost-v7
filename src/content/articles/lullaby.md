---
featured: true
title: "Making a looping lullaby box"
date: 2017-12-29
tags:
  - baby
  - music
  - ffmpeg
syndication:
  - https://twitter.com/barryf/status/946706289018785793
  - https://medium.com/@barryf/making-a-looping-lullaby-box-311673d1d692
---

My wife and I are expecting our second baby in the new year. Our first, now a toddler, loved his [Ewan The Dream Sheep](https://www.sweetdreamers.co.uk/product/ewan-the-dream-sheep/) at night, especially its gentle harp lullaby music, but the short duration (20 minutes) meant we were frequently restarting the music to help him fully drift off.

I wanted a better solution this time around with a song that lasts for hours. All the off-the-shelf baby products I found were similarly limited. I looked through several cheap Bluetooth speakers, but I didn't want to have to leave my phone connected all day/night long. The [Anker SoundCore Mini](https://www.anker.com/uk/products/variant/SoundCore-Mini-Bluetooth-Speaker/A3101111), however, also accepts a microSD card so can be left to play independently. I ordered one from Amazon for a very reasonable £16.99 and a SanDisk 16Gb microSD card (with SD adapter to go in my Mac) for £6.50. 

Next I needed a lullaby track lasting for at least 12 hours, thinking optimistically that the baby may sleep that long. Ignoring all the spammy-looking "free download MP3 baby lullaby" links on Google, I decided to make my own. 

I first paid for and downloaded a gentle piano recording of [Brahm's Lullaby from iTunes](https://itunes.apple.com/gb/album/brahms-lullaby/1065946325?i=1065946793) on my Mac. I converted the M4A/AAC file to an MP3 in iTunes (File > Convert > Create MP3 Version) -- the SoundCore doesn't play AAC files -- and then copied the MP3 file to my desktop as `lullaby.mp3`.

This created a single song lasting 150 seconds, but I needed this to loop. So I installed [ffmpeg](http://ffmpeg.org) to process and convert the audio. I specified the LAME MP3 library to create a final MP3 file.

    $ brew install ffmpeg --with-libmp3lame

The ~150s track played 300 times would result in approximately 12.5 hours of music. The following command specifies 300 loops, takes an input of the original lullaby and uses the LAME library at the same 190kbit/s quality of the original (`qscale:a 2`). 

    $ ffmpeg -stream_loop 300 -i lullaby.mp3 -codec:a libmp3lame -qscale:a 2 lullaby-loop.mp3

After a few minutes of processing I had a large (~1Gb) file ready to transfer via the SD card adapter to the microSD card and the SoundCore speaker. One extra I needed to add was a USB-A charger to power the speaker, but I had one spare lying around so that wasn't an issue. It all works beautifully. 

Now let's see if this all pays off and the little monkey sleeps when they arrive!
