# Vendored fayllar

Sayt hech qanday tashqi so'rov qilmasligi kerak — na shrift CDN'i, na skript CDN'i.
Shuning uchun kerakli fayllar repo ichida saqlanadi, versiyasi va sha256'si bilan.

## IBM Plex Mono

```
static/fonts/plex-mono-400-latin.woff2
static/fonts/plex-mono-400-latin-ext.woff2
static/fonts/plex-mono-600-latin.woff2
static/fonts/plex-mono-600-latin-ext.woff2
static/fonts/plex-mono-700-latin.woff2
static/fonts/plex-mono-700-latin-ext.woff2
```

Manba: Google Fonts CDN'dagi subset qilingan `woff2` fayllar (IBM Plex Mono v20).
Litsenziya: OFL-1.1, matni `static/fonts/LICENSE.txt` da.
Jami hajm: ~88 KB.

`latin` va `latin-ext` subsetlari olingan. Kirill yoki vetnam yozuvi kerak bo'lsa
qo'shimcha fayl kerak bo'ladi.

## mermaid

```
assets/js/mermaid.min.js
```

| | |
|---|---|
| Paket | `mermaid` |
| Versiya | 11.16.0 |
| Manba | https://unpkg.com/mermaid@11.16.0/dist/mermaid.min.js |
| sha256 | `74d7c46dabca328c2294733910a8aa1ed0c37451776e8d5295da38a2b758fb9b` |
| Hajm | 3.4 MB xom, ~0.9 MB gzip bilan |

Faqat ` ```mermaid ` bloki bor sahifada yuklanadi — buni
`layouts/_markup/render-codeblock-mermaid.html` qo'yadigan bayroq hal qiladi,
`layouts/baseof.html` esa uni tekshiradi.

`securityLevel: 'strict'` bilan ishga tushadi, ya'ni chizma yorlig'i ichiga yozilgan HTML
render qilinmaydi.

Yangilash:

```bash
V=<yangi-versiya>
curl -sL -o assets/js/mermaid.min.js "https://unpkg.com/mermaid@$V/dist/mermaid.min.js"
sha256sum assets/js/mermaid.min.js     # keyin shu faylni yangila
```

Yangilashdan oldin release notes'ni o'qi.

## Olib tashlangan

`static/admin/` (Sveltia CMS, 1.9 MB) 2026-07-27 da o'chirildi. Sayt endi brauzer
redaktorisiz — post yozish yo'li faqat markdown fayl va `git push`.

Sabab: redaktor brauzerda GitHub tokenini ushlab turardi, ya'ni saytdagi istalgan XSS
repo'ga yozish huquqiga aylanardi. Bitta yozish yo'li qolgach, bu toifa butunlay yopildi.
