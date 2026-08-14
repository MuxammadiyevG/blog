# NFO uslubidagi bug bounty blog — dizayn spetsifikatsiyasi

Sana: 2026-07-26
Muallif: M1kr0
Holat: amalga oshirilgan (14-bo'limdagi chetlanishlar bilan)

## 1. Maqsad

Bug bounty writeup va metodologiya postlari uchun shaxsiy blog. Kontent uch turdan iborat:
redaktsiya qilingan (redacted) writeup'lar, metodologiya/fikr postlari, va o'z asboblari
haqidagi texnik postlar.

Blog ikki vazifani bajaradi: topilgan buglarni ommaga ko'rsatadigan portfolio, va yozish
orqali o'z metodologiyasini aniqlashtiradigan vosita.

Vizual janr — scene-release `.nfo` fayli estetikasi. Ilhom manbai
[blog.xyris.mov](https://blog.xyris.mov/), lekin nusxa emas: o'z rang tizimi, o'z ASCII
logotipi, o'z layout tafsilotlari.

## 2. Qabul qilingan qarorlar

| Mavzu | Qaror | Sabab |
|---|---|---|
| Generator | Hugo | Bitta binary, tez build, markdown, tayyor tema ishlatilmaydi |
| Tema | Noldan yoziladi | Butun CSS nazorat ostida bo'lishi kerak |
| Kontent | `content/posts/*.md`, git'da | Yagona manba, versiyalanadi |
| Brauzer redaktori | ~~Sveltia CMS~~ | **Bekor qilindi, 17-bo'limga qara** |
| Auth | ~~GitHub OAuth + Worker~~ | **Bekor qilindi — redaktor yo'q, auth ham kerak emas** |
| Hosting | Cloudflare Pages | Bepul, git'ga ulanadi, Worker bilan bitta panel |
| Rang | Yorug' + qorong'i, almashtirgich bilan | Yorug' = ko'k blueprint, qorong'i = amber CRT |
| Shrift | IBM Plex Mono, o'z serverimizdan | Tashqi so'rov yo'q, tezroq |
| ASCII art | Qo'lda yoziladi | `assets/ascii/hero.txt` |

## 3. Identifikatsiya

Bosh sahifadagi info blok:

```
Handle .......... [ M1kr0 ]
Focus ........... [ Bug Bounty, Recon, Web ]
Posts ........... [ 001 ]
Mirror .......... [ github.com/MuxammadiyevG ]
```

- GitHub: `MuxammadiyevG`
- X (twitter): `GMuxammadi46746`
- `Posts` qiymati shablon tomonidan hisoblanadi, qo'lda yozilmaydi

## 4. Arxitektura

> Kontent yo'li 16.1-bo'limda o'zgargan: `content/en/posts/`, `content/uz/posts/`.

```
GitHub repo (MuxammadiyevG/blog)
├── content/posts/*.md      yagona kontent manbai
├── layouts/                Hugo shablonlar
├── assets/ascii/*.txt      hero art, ajratgich
├── static/
│   ├── admin/              Sveltia CMS
│   └── fonts/              IBM Plex Mono woff2
└── hugo.toml

Ikki yozish yo'li, bitta natija:

  terminal │ hugo new posts/x.md → tahrir → git push ─┐
           │                                          ├─→ repo commit
  brauzer  │ /admin → forma → Publish ────────────────┘
                                                         │
                                            Cloudflare Pages webhook
                                                         │
                                                 hugo --minify
                                                         │
                                                    deploy ~25s
```

Ikkala yo'l ham bir xil `.md` faylni yozadi. Alohida ma'lumotlar bazasi yo'q, sinxronlash
muammosi yo'q.

## 5. Kontent modeli

> Frontmatter'ga `translationKey` qo'shilgan, 16.1-bo'limga qara.

Frontmatter — qo'lda to'ldiriladigan maydonlar:

```yaml
---
title: "Cache Poisoning to Stored XSS"
date: 2026-07-26
tags: ["bug bounty", "writeup"]
draft: false
summary: ""          # bo'sh bo'lsa matnning birinchi qismidan olinadi
id: 3                # ixtiyoriy, 5.1-bo'limga qarang
---
```

Shablon avtomatik hisoblaydi: post raqami, o'qish vaqti, tartib, teg sahifalari, RSS.

`draft: true` — saytda ko'rinmaydi, lokal `hugo server -D` da ko'rinadi.

### 5.1 Post raqami

Odatiy holat: raqam sanaga qarab hisoblanadi. Eng eski post `#0001`, keyingisi `#0002` va
hokazo. Ro'yxatda teskari tartibda chiqadi — yangi post tepada.

Cheklov: agar o'rtadagi post o'chirilsa, undan keyingi raqamlar bittaga siljiydi. Doimiy
raqam kerak bo'lsa frontmatter'ga `id:` yoziladi — u hisoblangan qiymatni bosib o'tadi.

Qabul qilingan yechim: odatiy holatda hisoblanadi, `id:` — ixtiyoriy zaxira.

## 6. Brauzer redaktori va kirish

> **Bu bo'lim endi amalda emas.** Sveltia CMS 2026-07-27 da olib tashlandi, 17-bo'limga
> qara. Bo'lim tarix uchun qoldirilgan: qaror qanday olinganini va nima uchun
> qaytarilganini ko'rsatadi.

Sveltia CMS `static/admin/` da joylashadi, GitHub'ni backend sifatida ishlatadi.

```
static/admin/
├── index.html      CMS skriptini yuklaydi
└── config.yml      backend va maydonlar ta'rifi
```

`config.yml` da: `backend.name: github`, `repo: MuxammadiyevG/blog`,
`branch: main`, `base_url: <worker-url>`.

Repo nomi `blog` deb olindi. Boshqa nom xohlasang, u faqat shu bitta joyda va Cloudflare
Pages ulanishida o'zgaradi.

CMS'dagi post formasi 5-bo'limdagi frontmatter maydonlariga aynan mos keladi:
title (matn), date (sana), tags (ro'yxat), draft (belgi), summary (matn), body (markdown).

### 6.1 OAuth oqimi

`sveltia-cms-auth` Cloudflare Worker OAuth almashinuvini bajaradi. Worker uchun kerak:

| O'zgaruvchi | Qiymat |
|---|---|
| `GITHUB_CLIENT_ID` | GitHub OAuth App'dan |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App'dan, Worker secret sifatida |
| `ALLOWED_DOMAINS` | blog domeni |

### 6.2 Xavfsizlik

**Client secret.** `GITHUB_CLIENT_SECRET` faqat Cloudflare Worker secret'ida saqlanadi.
Repo'ga, `config.yml` ga, hech qanday commit'ga tushmaydi. `.env` fayllari `.gitignore` da.

**Ruxsat kengligi.** Klassik GitHub OAuth App ruxsatni bitta repo bilan chekay olmaydi.
Mavjud variantlar:

- `public_repo` — akkauntning barcha **ochiq** repolariga yozish huquqi
- `repo` — yopiq repolar ham qo'shiladi

Blog repo'si ochiq bo'lgani uchun `public_repo` tanlandi. Qabul qilingan xavf: token
o'g'irlansa, hujumchi shu akkauntning boshqa ochiq repolariga ham yoza oladi. Yopiq
repolar ta'sirlanmaydi.

Agar keyinchalik bu xavf qabul qilib bo'lmas darajada ko'rinsa, muqobil yo'l — GitHub App
(bitta repo bilan cheklanadi, lekin sozlash murakkabroq). Bu spec doirasidan tashqarida.

**`/admin` sahifasi.** Static fayl, ya'ni hamma uchun ochiq va uni yashirib bo'lmaydi. Bu
kutilgan holat: sahifa faqat forma, yozish huquqi GitHub OAuth'dan keladi. Repo'ga write
ruxsati bo'lmagan foydalanuvchi kirsa, hech narsa saqlay olmaydi.

**Writeup kontenti.** Bu sayt uchun texnik emas, tartib masalasi: har bir writeup chiqarishdan
oldin program'ning disclosure siyosati tekshiriladi. Ko'p program yozma ruxsatsiz nashrni
ta'qiqlaydi, redaktsiya qilingan bo'lsa ham.

## 7. Vizual tizim

### 7.1 Rang

Bitta CSS o'zgaruvchilar to'plami, ikki qiymat jamlanmasi. Shablonlarda rang qattiq
yozilmaydi — faqat `var(--ink)` ko'rinishida.

```css
:root {                      /* yorug' — blueprint */
  --bg: ...; --sheet: ...; --ink: ...; --ink-2: ...;
  --muted: ...; --dim: ...; --link: ...; --code: ...; --tag: ...;
  /* + kod uchun --syn-* to'plami */
}
:root[data-theme="dark"] {   /* qorong'i — amber CRT */
  /* xuddi shu nomlar, boshqa qiymatlar */
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* qorong'i qiymatlar takrorlanadi */ }
}
```

Aniq qiymatlar `assets/css/style.css` boshida — yagona manba shu. Bu yerda takrorlanmaydi,
chunki bir nechta qiymat AA kontrastiga yetish uchun sozlangan va ikki nusxa bir-biridan
uzoqlashib ketardi. O'zgartirganda `node docs/contrast-check.js` ni qayta ishga tush.

Tartib: tizim sozlamasi odatiy holat. Foydalanuvchi tugmani bossa, tanlov `localStorage`
ga yoziladi va tizim sozlamasini bosib o'tadi.

Kontrast talabi: asosiy matn (`--ink` / `--sheet`) ikkala temada ham WCAG AA (4.5:1) dan
past bo'lmasligi kerak. So'nik matn (`--muted`) uchun 4.5:1 maqsad, minimum 3:1.

### 7.2 Tema almashtirgich va miltillash

Tema tanlovi `localStorage` da, uni o'qish JS talab qiladi. Oddiy skript qo'yilsa sahifa
avval yorug' chiziladi, keyin qorong'iga sakraydi.

Yechim: `<head>` ichida, CSS'dan **oldin** turadigan kichik inline skript `data-theme`
atributini `<html>` elementiga darrov qo'yadi. Tashqi fayl emas, `defer` emas, `async` emas.

Almashtirgich navigatsiya qatorining o'ng chetida: `[◐]`.

### 7.3 Tipografika

IBM Plex Mono. `woff2` fayllari `static/fonts/` da — Google Fonts CDN ishlatilmaydi.
Sabablar: tashqi so'rov yo'q, sahifa tezroq ochiladi, tashrif buyuruvchi IP manzili uchinchi
tomonga ketmaydi.

Og'irliklar: 400 (asosiy matn), 600 (info blok), 700 (sarlavhalar).

Ilhom manbaidan farq: u yerda butun matn `font-weight: 700`. NFO janriga mos, lekin 12
daqiqalik writeup o'qishga og'ir. Bu yerda faqat sarlavha va info blok qalin qoladi.

Asosiy o'lcham: 15px, satr balandligi 1.6.

### 7.4 Kod bloklari

Writeup'ning katta qismi kod, HTTP so'rov va terminal chiqishi bo'ladi. Hugo'ning Chroma
highlighter'i ishlatiladi, rang sxemasi ikkala temaga alohida moslanadi.

Uzun satr (masalan bir qatorli `curl`) sahifani emas, faqat kod blokining o'zini gorizontal
skroll qiladi: `overflow-x: auto`.

### 7.5 Layout

Markazlashgan "sheet" — qog'oz varag'i effekti, ko'p qatlamli soya bilan. Maksimal kenglik
1050px, post matni 620-680px (o'qish uchun qulay satr uzunligi).

Elementlar: nuqtali leader'li info jadval (`Handle .......... [ M1kr0 ]`), qavsli
navigatsiya (`[home] [posts]`), ASCII ajratgich chiziqlar.

## 8. Shablonlar

```
layouts/
├── _default/
│   ├── baseof.html      umumiy ramka: head, sheet, footer
│   ├── list.html        /posts/ — releases ro'yxati
│   ├── single.html      post sahifasi
│   └── terms.html       /tags/
├── index.html           bosh sahifa: art + info + nav + so'nggi postlar
├── 404.html
└── partials/
    ├── head.html        meta, OG teg, tema skripti
    ├── nav.html         [home] [posts] [tags] [x]  [◐]
    ├── hero-art.html    assets/ascii/hero.txt o'qiydi
    ├── post-card.html   #0003 · KATEGORIYA · 4 min · sana
    ├── rule.html        ASCII ajratgich
    └── footer.html
```

Post kartasi tarkibi: raqam, kategoriya (birinchi tegdan), o'qish vaqti, sana, sarlavha,
qisqacha mazmun, teglar.

## 9. ASCII art

`assets/ascii/hero.txt` — qo'lda yoziladi yoki topiladi. Bu shrift emas, matndan yasalgan
surat: juda kichik `font-size` (~2.2px) va mos `line-height` bilan chiziladi.

Ajratgich chiziq: `assets/ascii/rule.txt`, xuddi shu usul.

Mobil (`max-width: 640px`): hero art va ajratgich yashiriladi — 2.2px o'lchamdagi matn
telefonda o'qilmaydi va faqat joy egallaydi.

## 10. Responsiv xatti-harakat

640px dan pastda:
- ASCII art va ajratgichlar yashiriladi
- Info jadval nuqtali leader'siz, ikki ustunli grid ko'rinishida
- Sheet chetidagi bo'shliq kamayadi
- Post kartasi meta qatori o'raladi

Hech qanday holatda sahifaning o'zi gorizontal skroll bo'lmaydi. Skroll faqat kod bloki va
jadval ichida.

## 11. Deploy

Cloudflare Pages GitHub repo'ga ulanadi.

| Sozlama | Qiymat |
|---|---|
| Build buyrug'i | `hugo --minify` |
| Chiqish katalogi | `public` |
| `HUGO_VERSION` | muhit o'zgaruvchisi sifatida qat'iy belgilanadi |

Boshlang'ich manzil: `<nom>.pages.dev`. O'z domeni keyinroq ulanadi — bu spec doirasida
domen tanlanmaydi.

Har `main` branch'ga commit avtomatik deploy'ni ishga tushiradi. Pull request'lar preview
deploy oladi.

## 12. Doiradan tashqarida (YAGNI)

> Ko'p tillilik bu ro'yxatdan chiqarildi, 16-bo'limga qara.

Quyidagilar ataylab qilinmaydi:

- Izohlar tizimi
- Analitika / tracking
- Qidiruv (post soni oz ekan, `Ctrl+F` yetarli)
- Ko'p tillilik
- Newsletter / obuna formasi
- Ma'lumotlar bazasi yoki server tomoni logikasi

Bularning har biri keyin, real ehtiyoj paydo bo'lganda ko'rib chiqiladi.

## 13. Muvaffaqiyat mezonlari (avvalgi holat)

1. `hugo new posts/x.md` → tahrir → `git push` — 30 soniya ichida saytda
2. `/admin` orqali brauzerdan post yozib nashr qilish ishlaydi, terminal ochmasdan
3. Ikkala yo'l ham bir xil faylni yozadi, ziddiyat yo'q
4. Tema almashtirilganda miltillash yo'q, tanlov qayta yuklashdan keyin saqlanadi
5. Ikkala temada asosiy matn kontrasti WCAG AA dan past emas
6. Mobil'da sahifa gorizontal skroll bo'lmaydi
7. Bosh sahifa tashqi so'rovsiz ochiladi (shrift ham o'z serverimizdan)
8. Yangi post qo'shilganda ro'yxat, teg sahifalari, RSS va post soni avtomatik yangilanadi

## 14. Implementatsiya chetlanishlari

Quruvchi paytida spec'dan farq qilgan qarorlar va sabablari.

**Shrift og'irligi 450 emas, 400.** IBM Plex Mono o'zgaruvchan (variable) shrift emas,
faqat 100/200/.../700 statik og'irliklari bor. 450 mavjud emas, shuning uchun asosiy matn
400 da. Ilhom manbaidan farq (u yerda hamma narsa 700) baribir saqlangan.

**ASCII art ikki o'lchamli.** Spec'da hero art doim 2.2px deb yozilgan edi — bu faqat
suratdan aylantirilgan katta art uchun to'g'ri. Qo'lda chizilgan banner bunday o'lchamda
ko'rinmaydi. `heroArtScale` parametri qo'shildi: `block` (9px, hozirgi) va `image`
(2.2px). Ajratgich chiziq ham 2.4px o'rniga 11px da.

**Mobil'da hero art yashirilmaydi.** Spec 640px dan pastda artni yashirishni aytgan edi.
Bu `image` rejimi uchun to'g'ri va shunday qolgan, lekin `block` banner telefonda ham
o'qiladi — u 7px ga kichraytiriladi, yashirilmaydi.

**`timeZone` sozlamasi qo'shildi.** Spec'da yo'q edi. Usiz Hugo yalang'och sanani UTC deb
o'qiydi, natijada kechqurun yozilgan post kelajakdagi sanaga tushib qoladi va saytda
umuman chiqmaydi. `hugo.toml` da `timeZone = "Asia/Tashkent"`. Bu quruvchi paytida real
muammo bo'ldi: birinchi build'da hamma post yo'qoldi.

**Sveltia CMS lokal saqlandi.** Odatiy o'rnatish skriptni CDN'dan yuklaydi. Bu skript
brauzerda GitHub tokenini ushlaydi, ya'ni buzilgan CDN buzilgan repo demakdir. Bundle
`static/admin/sveltia-cms.js` ga nusxalandi, versiya va sha256 `VERSION.txt` da.

**Yorug' temada izoh rangi o'zgartirildi.** `--syn-com` `#5f7086` dan `#586880` ga —
avvalgisi kod fonida 4.30:1 berardi, WCAG AA 4.5:1 dan past.

## 15. Tekshiruv natijalari

| Mezon | Holat | Dalil |
|---|---|---|
| Terminal orqali post | o'tdi | `hugo new` + build, post saytda chiqdi |
| Brauzer orqali post | qisman | CMS va config joyida; OAuth Worker deploy qilinmagani uchun uchidan uchiga sinovdan o'tmagan |
| Ikki yo'l bir manbaga yozadi | o'tdi | CMS `content/posts` ga sozlangan, format bir xil |
| Tema miltillashi yo'q | o'tdi | tema skripti `<head>` ichida, CSS'dan oldin, sinxron |
| WCAG AA kontrast | o'tdi | `docs/contrast-check.js` — 28 juftlik, 0 xato |
| Mobil'da gorizontal skroll yo'q | o'tdi | 390/768/1280 px da `scrollWidth == clientWidth` |
| Tashqi so'rovsiz ochiladi | o'tdi | build chiqishida tashqi domen havolasi yo'q |
| Ro'yxat/teg/RSS avtomatik | o'tdi | 15 sahifa, teg sahifalari va RSS generatsiya qilindi |

Ochiq qolgan yagona nuqta — CMS'ning uchidan uchiga sinovi. U GitHub OAuth App va
Cloudflare Worker deploy qilinishini talab qiladi, ikkalasi ham foydalanuvchi
akkauntlarida bajariladi.

## 16. Kengaytma: ko'p tillilik va chizmalar (2026-07-26)

12-bo'limda ko'p tillilik ataylab doiradan tashqarida deb yozilgan edi. Bu qaror
o'zgartirildi.

### 16.1 Til modeli

Tanlangan model — **to'liq tarjima**: har post ikki tilda yozilishi mo'ljallangan.
Muqobil model (har post bitta tilda, tarjimasiz) taklif qilingan va rad etilgan.

Muhim yumshatuvchi tafsilot: Hugo tarjimani majburlamaydi. Tarjimasi yo'q post
bemalol mavjud bo'la oladi — bunday postda til tugmasi faol emas, `title` atributida
"tarjima yo'q" deb turadi. Ya'ni model maqsad sifatida to'liq tarjima, texnik jihatdan
esa yarim tarjima qilingan sayt ham buzilmaydi.

| Element | Qaror |
|---|---|
| Asosiy til | ingliz, prefikssiz (`/`) |
| Ikkinchi til | o'zbek, `/uz/` ostida |
| Kontent | `content/en/`, `content/uz/` (til bo'yicha `contentDir`) |
| Bog'lash | `translationKey` frontmatter maydoni |
| Interfeys | `i18n/en.toml`, `i18n/uz.toml` |
| Tilga bog'liq sozlama | `[languages.<til>.params]` |

`translationKey` fayl nomi bo'yicha bog'lashdan afzal ko'rildi: aks holda o'zbekcha
slug inglizcha nomga majbur bo'lardi (`/uz/posts/cache-poisoning/`). Endi har til o'z
tabiiy manzilini oladi.

### 16.2 Release raqami tillar aro

Release — maqola, tarjima emas. Shuning uchun raqam `translationKey` bo'yicha
guruhlanadi va guruh eng erta sanasiga qarab tartiblanadi: inglizcha va o'zbekcha
versiya bitta `#0004` raqamini bo'lishadi.

Tenglik holati `translationKey` bilan hal qilinadi, shuning uchun tartib build'dan
build'ga o'zgarmaydi.

### 16.3 Chizmalar

Ikki sintaksis, ikki xil narx:

| | GoAT | Mermaid |
|---|---|---|
| Qayerda render bo'ladi | build paytida | brauzerda |
| JavaScript | yo'q | 3.4 MB (0.9 MB gzip) |
| Qachon yuklanadi | — | faqat `mermaid` bloki bor sahifada |
| Layout | qo'lda | avtomatik |
| Tema | `currentColor` orqali avtomatik | CSS o'zgaruvchilaridan o'qiladi |

Shartli yuklash `.Page.Store` orqali: render hook bayroq qo'yadi, `baseof.html` `main`
blokidan **keyin** uni tekshiradi. Chizmasiz postlar JavaScript'siz qoladi.

Mermaid `securityLevel: 'strict'` bilan ishga tushadi — yorliq ichidagi HTML
bajarilmaydi. Bu shu domenda CMS tokeni turgani uchun majburiy shart. Tema
almashtirilganda chizmalar qayta chiziladi, chunki mermaid ranglarni SVG ichiga
yozib qo'yadi.


## 17. Brauzer redaktoridan voz kechish (2026-07-27)

Sveltia CMS va u bilan bog'liq hamma narsa olib tashlandi: `static/admin/` (1.9 MB
bundle, `config.yml`, `index.html`), OAuth App, Cloudflare Worker.

### 17.1 Nima uchun

Redaktor GitHub tokenini brauzerda, saytning o'z origin'ida saqlardi
(`localStorage` + IndexedDB — bundle tekshirilib tasdiqlangan). Natijada zanjir:

```
blog domenida XSS  →  token o'qiladi  →  repo'ga commit  →  Pages avtomatik build
                                                        →  jonli sayt hujumchida
```

Bitta yozish yo'li (`git push`) qolgach, bu zanjirning boshlanish nuqtasi yo'qoladi:
saqlanadigan token yo'q, `/admin` sahifasi yo'q, audit qilinmagan 1.9 MB kod yo'q,
deploy qilinadigan Worker yo'q.

### 17.2 Ko'rib chiqilgan muqobillar

| Variant | Nega tanlanmadi |
|---|---|
| Sveltia + fine-grained PAT | Worker'siz ishlaydi va ruxsat bitta repo bilan cheklanadi (Sveltia'da "Sign In Using Access Token" rejimi bor). Lekin token baribir brauzerda, 1.9 MB kod baribir audit qilinmagan |
| O'z panelimiz (~10 KB) + PAT | Kod kichik va o'qilgan bo'lardi, lekin token muammosi qolardi va yozib chiqish + qo'llab-quvvatlash kerak |
| Sveltia + OAuth Worker | Eng keng ruxsat (`public_repo` — barcha ochiq repolar) va eng ko'p harakatlanuvchi qism |

### 17.3 Natija

12-bo'limdagi "doiradan tashqarida" ro'yxatiga brauzer redaktori qo'shildi.

5-bo'limdagi kontent modeli o'zgarmadi. 4-bo'limdagi "ikki yozish yo'li" bitta bo'ldi:

```
markdown fayl  →  git push  →  Cloudflare Pages webhook  →  hugo --minify  →  deploy
```

Keyin kerak bo'lsa qaytarish qiyin emas — 17.2 dagi birinchi variant eng arzon yo'l.


## 18. Xavfsizlik qattiqlashtirish (2026-07-27)

17-bo'limda redaktor olib tashlangach ikkita band ochiq qolgan edi. Ikkalasi ham yopildi.

### 18.1 Xom HTML o'chirildi

`markup.goldmark.renderer.unsafe`: `true` → `false`.

Boshlang'ich qurishda `true` qo'yilgan edi — markdown moslashuvchan bo'lsin degan niyatda.
Bug bounty blogi uchun bu noto'g'ri sozlama: postlar payload bilan to'la bo'ladi va kod
bloki tashqarisida qolgan bitta xom HTML o'z domenida bajarilardi.

### 18.2 CSP va sarlavhalar

`static/_headers` qo'shildi. Buning uchun barcha inline skriptlar tashqi faylga
ko'chirildi (`assets/js/theme-init.js`, `theme-toggle.js`, `mermaid-init.js`) va
shablonlardagi `style=""` atributlari CSS klasslariga almashtirildi.

Natijada `script-src 'self'` — na `'unsafe-inline'`, na `'unsafe-eval'`. Har skript SRI
hash bilan yuklanadi.

`style-src` da `'unsafe-inline'` qoldi. Sabab o'lchangan: chizmali sahifada 187 ta
`style-src-attr` va 6 ta `style-src-elem` buzilishi, hammasi mermaid SVG'si va GoAT'ning
`style="font-size:1em"` atributlaridan. Bu generatsiya qilingan kod, o'zgartirib
bo'lmaydi.

Qabul qilingan ayirboshlash: skript uchun qat'iy siyosat (XSS bajarilishini to'sadi),
uslub uchun bo'sh siyosat (CSS inyeksiyasi orqali ma'lumot chiqarishga yo'l qoladi, lekin
buning uchun avval inyeksiya nuqtasi kerak, skript esa baribir ishlamaydi).

Mermaid'dan voz kechilsa `style-src` ham `'self'` ga qaytariladi.

### 18.3 Tekshiruv

Brauzerda `securitypolicyviolation` hodisasini tinglab o'lchandi, CSP haqiqiy sarlavha
sifatida berilgan holda:

| Sahifa | Buzilish |
|---|---|
| Bosh sahifa (en) | 0 |
| Bosh sahifa (uz) | 0 |
| Formatlash namunasi | 0 |
| Chizmalar sahifasi | 0 |


## 19. Ko'p temali rejim (2026-07-27)

Ikki tema (yorug'/qorong'i almashtirgich) oltitaga kengaytirildi.

| Tema | Turi | Tavsif |
|---|---|---|
| `blueprint` | yorug' | ko'k siyoh, oq qog'oz — avvalgi yorug' tema |
| `amber` | qorong'i | amber CRT — avvalgi qorong'i tema |
| `neon` | qorong'i | siyon va ko'k, qora-ko'k fon |
| `phosphor` | qorong'i | klassik yashil terminal |
| `paper` | yorug' | issiq sepia, jigarrang siyoh |
| `mono` | qorong'i | rangsiz, faqat och-to'qlik |

### 19.1 Tanlov mantiqi

```
:root                          blueprint (yorug' odatiy)
@media dark + [data-theme] yo'q   amber
:root[data-theme="X"]          aniq tanlov, doim g'olib
```

`auto` tanlansa `data-theme` atributi olib tashlanadi va `localStorage` tozalanadi —
sayt tizim sozlamasiga qaytadi.

### 19.2 Interfeys

Tugma o'rniga `<details>` menyusi. Sababi: oltita tema o'rtasida bitta tugma bilan
aylanib yurish noqulay. `<details>` JavaScriptsiz ochiladi, ya'ni skript yuklanmasa ham
ro'yxat ko'rinadi; skript faqat tanlovni yozadi va faol elementni belgilaydi.

### 19.3 Eski qiymatlarni ko'chirish

Avvalgi versiyada `data-theme` qiymatlari `light` va `dark` edi. `theme-init.js` ularni
`blueprint` va `amber` ga ko'chiradi va `localStorage` ni yangilaydi, shuning uchun eski
tanlov yo'qolmaydi.

### 19.4 Kontrast tekshiruvi qayta yozildi

`docs/contrast-check.js` endi palitralarni qo'lda takrorlamaydi — `assets/css/style.css`
faylini o'qib, `:root` va har `[data-theme]` blokidan o'zgaruvchilarni chiqarib oladi.
Shuning uchun skript va sayt bir-biridan uzoqlashib keta olmaydi.

Natija: **6 tema × 19 juftlik = 114 tekshiruv, 0 xato.** Ikkita tema qurish paytida
yiqilgan edi (`neon` va `mono` ning ajratgich chizig'i juda so'nik), tuzatildi.

### 19.5 Tekshiruv

| Nima | Natija |
|---|---|
| Oltala tema render bo'ladi | ha, skrinshot bilan |
| Menyu ochiladi, faol tema belgilanadi | ha |
| Tanlash: atribut + localStorage | `neon=neon stored=neon` |
| `auto`: atribut o'chadi, xotira tozalanadi | `auto=(none) storedAuto=null` |
| Keyingi yuklashda saqlanadi | `data-theme="paper"` |
| Eski `dark` qiymati ko'chadi | `data-theme="amber"` |
| CSP buzilishi | 0 (uch sahifada) |
