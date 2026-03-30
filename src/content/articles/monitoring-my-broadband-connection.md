---
title: "Monitoring my broadband connection"
date: 2013-11-09
---

My home internet connection quality seems to yoyo from day to day. Our area is yet to receive so-called "superfast" broadband and I'm stuck with somewhere between 0.5-2Mbit/s depending on contention. Frustrating.

I wanted to keep an eye on the speed I was paying for so hacked together the following system to help me track the connection speed each hour. If you want to do the same, here's what you need to do.

First install [Matt Martz](https://github.com/sivel)'s Python command line interface for [speedtest.net](http://speedtest.net), [speedtest-cli](https://github.com/sivel/speedtest-cli):

	$ easy_install speedtest-cli

Next create a file called `speedtest.rb` in your `~/bin` directory:

	system('speedtest-cli --simple > /tmp/speedtest.out')
	result = File.read('/tmp/speedtest.out')
	matches = result.match(/Download: ([0-9\.]*)/)
	speed = matches[1]
	puts Time.now.strftime('%Y-%m-%d %H:%M,') + speed

This script outputs the current time and speed ready for you to append to a file. You'll want to run this every hour via cron so add this to your user's crontab:

	$ crontab -e
	
    0 * * * * ruby ~/bin/speedtest.rb >> ~/Documents/speedtest.csv

You can then open the `speedtest.csv` file from your `~/Documents` directory in Excel, Numbers or some other charting application. Even better would be to automate the charting with [Munin](http://munin-monitoring.org) or [RRDtool](http://oss.oetiker.ch/rrdtool/).
