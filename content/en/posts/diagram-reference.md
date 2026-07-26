---
title: "Diagram reference"
date: 2026-07-25T23:30:00+05:00
tags: ["meta"]
translationKey: diagram-reference
draft: true
summary: "The two diagram syntaxes this theme renders. Kept as a draft so it never publishes."
---

Two ways to draw. Both stay a draft — this post exists so `hugo server -D` shows what each
one looks like.

## GoAT — ASCII, rendered at build

Hugo turns a `goat` fenced block into SVG while building. No JavaScript reaches the
reader, and the drawing inherits the page colours.

````markdown
```goat
 .-----------.      .------------.      .----------.
 | attacker  +----->| CDN cache  +----->|  origin  |
 '-----------'      '-----+------'      '----------'
                          |
                          v
                    .-----------.
                    |  victim   |
                    '-----------'
```
````

Renders as:

```goat
 .-----------.      .------------.      .----------.
 | attacker  +----->| CDN cache  +----->|  origin  |
 '-----------'      '-----+------'      '----------'
                          |
                          v
                    .-----------.
                    |  victim   |
                    '-----------'
```

You place every box yourself. That is the trade: no layout engine, no payload.

## Mermaid — real syntax, drawn in the browser

For anything with branching or ordering, mermaid is worth its weight. The bundle is
3.4 MB (0.9 MB over the wire) and loads **only** on pages that contain a `mermaid` block.

````markdown
```mermaid
sequenceDiagram
    participant A as Attacker
    participant C as CDN
    participant O as Origin
    A->>C: GET /en/landing (X-Forwarded-Host: evil)
    C->>O: forwards, header not in cache key
    O-->>C: 200, absolute URLs point at evil
    C-->>A: 200 (now cached)
    Note over C: poisoned entry served to everyone
```
````

Renders as:

```mermaid
sequenceDiagram
    participant A as Attacker
    participant C as CDN
    participant O as Origin
    A->>C: GET /en/landing (X-Forwarded-Host: evil)
    C->>O: forwards, header not in cache key
    O-->>C: 200, absolute URLs point at evil
    C-->>A: 200 (now cached)
    Note over C: poisoned entry served to everyone
```

And a flowchart:

```mermaid
flowchart TD
    A[Find endpoint] --> B{Reflects a header?}
    B -- no --> C[Move on]
    B -- yes --> D{In cache key?}
    D -- yes --> C
    D -- no --> E[Cache poisoning]
    E --> F{Reflected into HTML?}
    F -- yes --> G[Stored XSS]
    F -- no --> H[Redirect / DoS]
```

Mermaid runs with `securityLevel: 'strict'`, so HTML written inside a diagram label is not
rendered. Diagrams redraw when the colour theme is toggled.

## Which to use

| Case | Use |
|---|---|
| A short chain: A → B → C | GoAT |
| Anything you would otherwise draw by hand | GoAT |
| Sequence diagrams | mermaid |
| Decision trees, state machines | mermaid |
| A post that must stay JavaScript-free | GoAT |
