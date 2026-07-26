---
title: "Formatting reference"
date: 2026-07-25T23:00:00+05:00
tags: ["meta"]
translationKey: formatting-reference
draft: true
summary: "Every markdown element this theme styles. Kept as a draft so it never publishes."
---

This post stays `draft: true` forever. It exists so you can run `hugo server -D` and see
every styled element at once.

## Headings

Level two headings get a `##` prefix in the margin.

### Level three

Level three gets `###`.

## Text

Normal paragraph text with **bold**, *italic*, `inline code`, and a
[link](https://example.com).

> A blockquote. Useful for quoting a vendor response in a writeup.

## Lists

- first item
- second item
- third item, long enough to wrap onto a second line so the hanging indent is visible

1. numbered
2. numbered
3. numbered

## Code

```bash
curl -s -H 'X-Forwarded-Host: evil.example' https://target.example/en/landing | head -20
```

```python
import requests

def probe(url: str) -> int:
    r = requests.get(url, timeout=10, allow_redirects=False)
    return r.status_code  # 200 means the cache kept it
```

```http
GET /en/landing HTTP/1.1
Host: target.example
X-Forwarded-Host: evil.example
```

A very long single line, to confirm the code block scrolls on its own instead of the page:

```bash
ffuf -u https://target.example/FUZZ -w /usr/share/wordlists/raft-large-directories.txt -mc 200,301,302,403 -recursion -recursion-depth 2 -t 60 -o results.json
```

## Table

| Technique | Header | Works when |
|---|---|---|
| Host override | `X-Forwarded-Host` | Cache key excludes the header |
| Port override | `X-Forwarded-Port` | Origin reflects it into absolute URLs |
| Scheme override | `X-Forwarded-Proto` | Redirect target is built from it |

## Rule

---

That is everything.
