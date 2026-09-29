# GK2 Companion

Graveyard Keeper 2 inşa menüsünü (ekran görüntüsü veya telefon fotoğrafı) yapay zeka ile okuyup hangi yapı için hangi malzemeden kaç tane gerektiğini listeleyen PWA.

## Kullanım

1. Ayarlar sekmesine DeepSeek API anahtarını gir (model: `deepseek-flash`).
2. Yapılar sekmesinde **Tara (kamera)** veya **Galeriden seç**.
3. Görseli döndür/yakınlaştır, **Devam**.
4. AI sonucunu kontrol et, düzelt, **Listeye ekle**.
   - Alan (Bahçe, Avlu vb.) pencere başlığından okunur; yanlışsa inceleme ekranında düzeltirsin.
   - Her malzemenin ikonu görselden kesilip saklanır; yanlışsa **Kırpmayı düzelt** ile elle kesersin. Kayıtlı ikonlar sonraki taramalarda AI'a referans olarak gönderilir.
5. Toplam sekmesinde gereken toplam malzemeyi ve alanlara göre kırılımını gör (ör. Çivi = 30: Avlu = 12, Bahçe = 18). Yapı bitince "Yapıldı" işaretle.

Veriler ve API anahtarı yalnızca bu cihazın tarayıcısında saklanır. Ayarlar > Dışa aktar ile yedek alınabilir (anahtar yedeğe girmez).

## Geliştirme

    npm install
    npm run dev        # geliştirme sunucusu
    npm test           # birim testleri
    npm run e2e        # uçtan uca testler (Playwright; ilk seferde `npx playwright install chromium`)
    npm run check      # tip kontrolü
    npm run build      # dist/ üretir
    npm run icons      # public/icon.svg'den PWA ikonlarını üretir

## Yayınlama (statik)

- **Cloudflare Pages:** build komutu `npm run build`, çıktı klasörü `dist`.
- **GitHub Pages:** `BASE_PATH=/depo-adi/ npm run build`, `dist/` klasörünü yayınla.

Telefonda siteyi açıp tarayıcı menüsünden "Ana ekrana ekle" ile kur. Kamera özelliği HTTPS gerektirir (yayınlanan siteler HTTPS'tir).
