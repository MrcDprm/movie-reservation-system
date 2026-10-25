# Seans

[English](README.md) | **Türkçe**

Sessiz sinema klasikleri gösteren iki salonlu küçük bir sinema için bilet sitesi. Ziyaretçi canlı koltuk haritasından koltuğunu seçer, Stripe ile öder (test modu) ve her koltuk için bir QR bileti e-postayla alır. Görevli biletleri kapıda telefon kamerasıyla okutur; yönetici filmleri, seansları ve satışları yönetir.

**Canlı demo:** [seans.miracdeprem.com](https://seans.miracdeprem.com)

![Koltuk seçimi: satılmış, ayrılmış ve benim koltuklarımı gösteren canlı harita ve ayırma geri sayımı](docs/screenshot-seats.png)

## Özellikler

- **Program:** iki salon, günde üç seans, önümüzdeki iki hafta. Her gün çalışan bir iş yeni günleri kendisi ekler, program hiç bitmez.
- **Tipografik afişler:** her filmin iki renk ve adından oluşan kendi afişi var; resim dosyası yok.
- **Canlı koltuk haritası:**
  - Salonun verisinden çizilir; koridorlar ve tekerlekli sandalye yerleri dahil.
  - Birkaç saniyede bir yenilenir, başkasının aldığı koltuk kendiliğinden görünür.
  - Her koltuk gerçek bir düğmedir; klavye ve ekran okuyucuyla kullanılabilir.
- **Çift satış olmadan koltuk ayırma:**
  - Seçilen koltuklar ödeme yapılırken 10 dakika ayrılır.
  - Bir koltuğun sadece bir rezervasyona ait olabileceğini veritabanının kendisi garanti eder. Aynı anda aynı koltuğa tıklayan iki kişiden yalnızca biri alır; bunu bir test doğrular.
  - Süresi dolan ayırma kendiliğinden serbest kalır.
- **Stripe Checkout ile ödeme (test modu, Türk lirası):**
  - Rezervasyonu tarayıcı değil, sadece Stripe'ın imzalı webhook'u onaylar.
  - Ayırma süresi dolduktan sonra gelen ödeme otomatik olarak iade edilir.
- **QR biletler:**
  - Her koltuk için bir bilet; hem hesapta hem de QR kodları ekli bir onay e-postasında.
  - Her kod HMAC ile imzalıdır; sahte ya da değiştirilmiş bilet reddedilir.
- **Görevli için kapı kontrolü:**
  - Telefon kamerası QR kodu okur, ekran büyük renklerle cevap verir: girebilir, zaten kullanıldı (ve ne zamandan beri), geçersiz, ödenmemiş, erken ya da seans bitti.
  - İki kapı aynı bileti aynı anda okutsa bile bilet sadece bir kez kullanılabilir.
- **Yönetim paneli:**
  - Filmler: ekleme, düzenleme ve silme; canlı afiş önizlemesiyle. Okunmayan renk çiftleri reddedilir.
  - Seanslar: istenen saate seans eklenir; sunucu aynı salondaki çakışmaları 20 dakikalık temizlik arasıyla birlikte reddeder.
  - Satışlar: seans ve hafta bazında satılan bilet, doluluk ve gelir.
  - Bileti satılmış seans ve film silinemez.
- **Hesaplar:** e-posta doğrulamalı kayıt, giriş, çıkış ve şifre sıfırlama.
- **Türkçe ve İngilizce**, [portfolyo sitemle](https://www.miracdeprem.com) uyumlu koyu ve açık tema, telefonda da düzgün çalışan tasarım.

## Ekran Görüntüleri

| Program | Telefonda bilet | Kapı kontrolü |
|---|---|---|
| ![Tarih seçici ve film kartlarıyla program](docs/screenshot-program.png) | ![Her koltuk için QR kodlu bilet sayfası](docs/screenshot-ticket.png) | ![C4 koltuğu için "Girebilir" diyen kapı sayfası](docs/screenshot-door.png) |

| Yönetim: seanslar ve satışlar | Yönetim: film ekleme |
|---|---|
| ![Haftalık satış özeti ve seans listesi](docs/screenshot-admin.png) | ![Canlı afiş önizlemeli film formu](docs/screenshot-film-form.png) |

## Kullanılan Teknolojiler

- **Arayüz:** React, React Router, TanStack Query, Tailwind CSS, Vite
- **Sunucu:** Node.js ve Express, Vercel sunucusuz fonksiyonu olarak
- **Veritabanı:** [Neon](https://neon.tech) üzerinde PostgreSQL, Prisma ORM ile
- **Ödeme:** [Stripe](https://stripe.com) Checkout ve webhook'lar (test modu)
- **E-posta:** [Resend](https://resend.com)
- **QR kod:** çizmek için `qrcode`, kameradan okumak için `jsQR`
- **Doğrulama:** her istekte zod
- **Testler:** `node --test` ve supertest; ayrı bir test veritabanında 73 test
- **Yayın:** Vercel; günlük cron işi ve sıkı bir Content Security Policy ile

## Kurulum ve Çalıştırma

Denemenin en kolay yolu [canlı demo](https://seans.miracdeprem.com). Ödeme sayfası Stripe test modunda: kart numarası `4242 4242 4242 4242`, ileri bir tarih ve herhangi bir CVC kullan.

Yerelde çalıştırmak için Node.js 22.18 ya da daha yenisi ve ücretsiz bir [Neon](https://neon.tech) PostgreSQL veritabanı gerekir.

```bash
git clone https://github.com/MrcDprm/movie-reservation-system.git
cd movie-reservation-system
npm install
cp .env.example .env        # Neon'dan DATABASE_URL ve DIRECT_URL'yi yaz
npm run db:deploy           # tabloları oluşturur
npm run db:seed             # salonlar, filmler ve iki haftalık seanslar
npm run dev
```

Sonra `http://localhost:5173` adresini aç.

- **E-posta:** Resend anahtarı yoksa e-postalar (doğrulama bağlantısıyla birlikte) terminale yazılır.
- **Ödeme:** `.env` dosyasına bir Stripe test anahtarı (`sk_test_...`) ekle. Ardından webhook'ları Stripe CLI ile yönlendir: `stripe listen --forward-to localhost:3001/api/stripe/webhook`.
- **Görevli ve yönetici rolleri:** var olan bir hesaba rol vermek için `npm run set-role -- sen@example.com ADMIN` (ya da `STAFF`). Bunun için bilerek bir web sayfası yok.

### Testler

Testler gerçek veriye hiç dokunmamak için ayrı bir veritabanı kullanır. İkinci bir Neon dalı (branch) oluştur, adreslerini `.env.test` dosyasına yaz, sonra:

```bash
npm run db:deploy:test
npm test
```

Test yardımcısı, `.env.test` ile `.env` aynı veritabanını gösteriyorsa çalışmayı reddeder.

### Proje yapısı

```
api/index.js              Express uygulaması, Vercel fonksiyonu olarak
server/app.js             Ara katmanlar, güvenlik başlıkları, rotalar
server/auth/              Kayıt, e-posta doğrulama, giriş, oturumlar, şifre sıfırlama
server/booking/           Program, koltuk haritası, ayırma, Stripe ödeme ve webhook
server/tickets.js         İmzalı QR kodlar ve kapı kontrolü
server/admin/             Yönetici için filmler, seanslar ve satışlar
server/programme.js       Seansların günlük tamamlanması ve süresi dolan kayıtların temizliği
server/cron.js            Günlük işin uç noktası
server/rateLimit.js       PostgreSQL üzerinde rate limiting
prisma/                   Veritabanı şeması, migration'lar ve demo verisi
web/src/pages/            Program, film, koltuk, hesap, bilet, kapı ve yönetim sayfaları
web/src/components/       Sayfa düzeni, afiş, koltuk haritası, form parçaları
tests/                    Birim ve API testleri
```

### Güvenlik

- **Şifreler:** scrypt ile hash'lenir. Zayıf ve yaygın şifreler, ad ya da e-posta içeren şifreler reddedilir.
- **Oturumlar:** HttpOnly, Secure ve SameSite bir çerezde tutulur. Çerezdeki anahtar veritabanında sadece hash'i olarak saklanır.
- **İstekler:** başka sitelerden gelen API istekleri reddedilir.
- **E-posta doğrulama ve şifre sıfırlama:** bağlantılar tek kullanımlıktır ve süresi dolar.
- **Hesap gizliliği:** kayıt ve "şifremi unuttum", e-posta kayıtlı olsa da olmasa da aynı cevabı verir; hangi adreslerin hesabı olduğu öğrenilemez.
- **Rate limiting:** giriş, kayıt ve e-posta gönderimi IP adresine ve e-postaya göre; ayırma, ödeme ve kapı okutma hesaba göre sınırlanır.
- **Girdi:** her istek gövdesi zod ile kontrol edilir ve sadece beklenen alanlar kaydedilir.
- **Veritabanı:** sorgular Prisma üzerinden gider, yani her zaman parametrelidir.
- **Stripe webhook'ları:** Stripe'ın imzasıyla doğrulanır.
- **Hatalar:** mesajlar kısa kodlardır; tarayıcıya stack trace gitmez.
- **Content Security Policy:** satır içi script yok, dış kaynaktan script yok, başka sitede çerçeve içinde açılamaz.

## Öğrendiklerim

- **Yarışı veritabanına çözdürmek.** İki kişi aynı koltuğa aynı milisaniyede tıklayabilir. "Boş mu?" diye bakıp sonra kaydetmek yerine (seans, koltuk) ikilisine benzersizlik kısıtı koydum; ikinci rezervasyonu veritabanının kendisi reddediyor. Kapıda biletin tek kullanımlık olması da aynı fikir: "giriş saatini sadece hâlâ boşsa yaz" işlemi yalnızca bir kez başarılı olabiliyor.
- **Tarayıcıya değil webhook'a güvenmek.** Stripe'ın geri döndüğü sayfa hiçbir şey kanıtlamaz; onu herkes açabilir. Rezervasyon sadece imzalı webhook gelince ödenmiş sayılıyor. Webhook yoldayken bilet sayfası bekleyip birkaç saniyede bir yeniden soruyor. Kötü zamanlamayı da ele almam gerekti: ayırma süresi dolduktan sonra gelen ödeme otomatik iade ediliyor.
- **İmzalı QR kodlar.** QR, biletin kimliğini ve kısa bir HMAC imzasını taşıyor. Kapı, her bilet için ayrıca bir gizli bilgi saklamadan gerçek bileti uydurma olandan ayırabiliyor.
- **Oturumu doğru yönetmek.** Oturum JavaScript'in okuyamadığı HttpOnly bir çerezde duruyor; veritabanında sadece hash'i var, yani sızan bir veritabanıyla giriş yapılamaz. Şifre değişince diğer bütün cihazlardaki oturumlar kapanıyor.
- **Gerçek bir programda saat dilimleri.** Seanslar UTC olarak saklanıyor ve ziyaretçinin bilgisayarı ne derse desin hep İstanbul saatiyle gösteriliyor. Yönetici formu saati "+03:00" ile gönderiyor; yurt dışından eklenen seans da doğru saate düşüyor.
- **Çakışma kontrolü.** Seans eklemek, filmi uzatmak ve günlük tamamlama aynı kuralı kullanıyor: film artı 20 dakikalık ara, aynı salondaki bir sonraki filme taşmamalı.
- **Gerçek bir veritabanında test etmek.** API testleri ayrı bir Neon dalında çalışıyor. Bir yardımcı fonksiyon, ana veritabanına dokunacaksa çalışmayı reddediyor.
- **Tarayıcıda kamera okumak.** iPhone'larda web sayfaları için hazır barkod okuyucu yok. Bu yüzden kapı sayfası kamera görüntüsünü saniyede birkaç kez bir canvas'a çizip jsQR ile çözüyor. Bunu, bilet gösteren sahte bir kamerayla test ettim.

## Katkılar

- Bütün filmler kamu malıdır (public domain). Özetler bu proje için yazıldı; afişler kopyalanmadı, üretiliyor.
- Yazı tipleri: [Fraunces](https://fonts.google.com/specimen/Fraunces) ve [Manrope](https://fonts.google.com/specimen/Manrope) (SIL Open Font License), sitenin kendisinden sunuluyor.

## Lisans

[MIT](LICENSE)
