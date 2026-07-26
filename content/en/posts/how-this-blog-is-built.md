---
title: "How this blog is built"
date: 2026-07-25T22:30:00+05:00
tags: ["meta", "tooling"]
translationKey: how-this-blog-is-built
draft: false
summary: "Hugo, a hand-written theme, and two ways to publish a post."
---

Static site, no server, no database. Here is the whole thing.

## The stack

| Layer | Choice |
|---|---|
| Generator | Hugo |
| Theme | hand-written, no third-party theme |
| Content | markdown in git |
| Browser editor | Sveltia CMS at `/admin` |
| Auth | GitHub OAuth via a Cloudflare Worker |
| Hosting | Cloudflare Pages |

## Two ways to publish

From the terminal:

```bash
hugo new posts/some-writeup.md
$EDITOR content/posts/some-writeup.md
git commit -am "post: some writeup" && git push
```

Or from `/admin` in a browser — fill the form, hit publish. Both paths commit the same
markdown file to the same repository, so there is no second source of truth to keep in
sync.

Everything else is computed by the templates: the release number, reading time, tag pages,
the RSS feed, and the post count in the header.

## Why not something dynamic

A blog that renders on every request needs a server, a database, patches, and backups —
and it gives me one more thing with a login form to worry about. A static site has none of
that. The build output is plain HTML.

## Fonts

IBM Plex Mono, served from this domain rather than a font CDN. One less third party
watching who reads this.
