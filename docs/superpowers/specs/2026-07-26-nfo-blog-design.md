# NFO uslubidagi bug bounty blog — dizayn spetsifikatsiyasi

Sana: 2026-07-26
Muallif: M1kr0
Holat: tasdiqlangan, implementatsiya rejasi kutilmoqda

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
| Brauzer redaktori | Sveltia CMS | Decap'ning faol forki, config formati bir xil |
| Auth | GitHub OAuth + Cloudflare Worker | CMS uchun standart yo'l |
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
  --bg:      #c3ccd6;   --sheet:   #f4f7fa;
  --ink:     #0a1830;   --ink-2:   #22304a;
  --muted:   #5a6b84;   --dim:     #8b9ab0;
  --faint:   #b6c1d0;
  --link:    #1a52c4;   --link-hi: #0b3fa8;
  --code:    #b23200;   --tag:     #2f6d4a;
}
:root[data-theme="dark"] {   /* qorong'i — amber CRT */
  --bg:      #0d0b08;   --sheet:   #14110c;
  --ink:     #ffb642;   --ink-2:   #e0a03a;
  --muted:   #9c7a44;   --dim:     #6b5430;
  --faint:   #3d3020;
  --link:    #ff7a1a;   --link-hi: #ffa050;
  --code:    #ff5c3a;   --tag:     #9ccf5a;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* qorong'i qiymatlar takrorlanadi */ }
}
```

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

Og'irliklar: 450 (asosiy matn), 600 (info blok), 700 (sarlavhalar).

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

Quyidagilar ataylab qilinmaydi:

- Izohlar tizimi
- Analitika / tracking
- Qidiruv (post soni oz ekan, `Ctrl+F` yetarli)
- Ko'p tillilik
- Newsletter / obuna formasi
- Ma'lumotlar bazasi yoki server tomoni logikasi

Bularning har biri keyin, real ehtiyoj paydo bo'lganda ko'rib chiqiladi.

## 13. Muvaffaqiyat mezonlari

1. `hugo new posts/x.md` → tahrir → `git push` — 30 soniya ichida saytda
2. `/admin` orqali brauzerdan post yozib nashr qilish ishlaydi, terminal ochmasdan
3. Ikkala yo'l ham bir xil faylni yozadi, ziddiyat yo'q
4. Tema almashtirilganda miltillash yo'q, tanlov qayta yuklashdan keyin saqlanadi
5. Ikkala temada asosiy matn kontrasti WCAG AA dan past emas
6. Mobil'da sahifa gorizontal skroll bo'lmaydi
7. Bosh sahifa tashqi so'rovsiz ochiladi (shrift ham o'z serverimizdan)
8. Yangi post qo'shilganda ro'yxat, teg sahifalari, RSS va post soni avtomatik yangilanadi
