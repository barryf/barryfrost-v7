---
title: "Using Tailwind CSS with Microformats 2"
date: 2021-05-29
tags:
  - tailwind
  - css
  - microformats
---

[Tailwind CSS](https://tailwindcss.com/) has utility classes for height using the pattern `h-x` where x is a number, for example `h-4` which maps to a height of 16px.

[Microformats 2](http://microformats.org/wiki/microformats2) (MF2) also uses the `h-` class prefix for top-level objects like `h-entry`.

When a MF2 parser encounters the Tailwind height classes it will incorrectly assume a new `h-` object has been defined.

The solution I use is to specify new height classes in my base Tailwind stylesheet that map to the equivalent Tailwind classes.

```css
.h4 { @apply h-4; }
```

For this example, in the HTML document you would replace `h-4` with `h4`:

```html
<div class="h4">
```

It’s not ideal: when specifying classes for a tag you need to remember to use the alternative. But it does mean you can use MF2 and Tailwind together.
