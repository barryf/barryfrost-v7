---
title: "Micropublish v2.3.0"
date: 2020-10-12
categories:
  - micropublish
---

I've pushed a biggish update to [Micropublish](https://micropublish.net) to bring it to [v2.3.0](https://github.com/barryf/micropublish/releases/tag/v2.3.0). It includes some of the stable and experimental [Micropub extensions](https://indieweb.org/Micropub-extensions) discussed in the IndieWeb [pop-up session](https://indieweb.org/2020/Pop-ups/Micropub) I joined earlier this year.

### Added

- [Filter syndication targets by post-type, specify checked as appropriate](https://github.com/barryf/micropublish/issues/45)
- [Raw content instead of HTML for Articles](https://github.com/barryf/micropublish/issues/42)
- [Support `visibility` property](https://github.com/barryf/micropublish/issues/36)
- [Support `post-status` property](https://github.com/barryf/micropublish/issues/35)
- [Add granular scopes to login/auth](https://github.com/barryf/micropublish/issues/33)

### Changed

- [Make JSON the default post creation method](https://github.com/barryf/micropublish/issues/41)
- [Bump kramdown from 2.1.0 to 2.3.0](https://github.com/barryf/micropublish/issues/39)
- Only show edit, delete or undelete controls if scope allows
- Added `draft` scope to login form
- Force `post-status` to `draft` when using (only) draft scope
