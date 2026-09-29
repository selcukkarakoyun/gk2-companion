# GK2 Companion — Tasarım Spec'i

Tarih: 2026-09-29

## 1. Amaç

Graveyard Keeper 2'de inşa menüsü tarif sabitlemeyi desteklemiyor. Oyuncu hangi yapı için hangi malzemeden kaç tane gerektiğini aklında tutmak zorunda. GK2 Companion, inşa menüsünün ekran görüntüsünü veya telefonla çekilmiş fotoğrafını AI ile okuyup yapıları ve gereken malzemeleri kalıcı bir listede tutan, tek kullanıcılı bir PWA'dır.

**Başarı ölçütü:** kullanıcı inşa menüsünü çekip gönderir, AI çıktısını kısa bir incelemeyle onaylar, sonra "Toplam" sekmesinde hangi malzemeden toplam kaç tane toplaması gerektiğini görür.

## 2. Kapsam

### Kapsam içi
- Görselden yapı + malzeme + miktar çıkarma (AI, DeepSeek).
- Telefon kamerasıyla çekme veya galeriden/dosyadan görsel seçme.
- AI'a göndermeden önce basit görsel düzenleme: döndürme (90° adımlarla) ve yakınlaştırma/kaydırma (istenen bölgeyi kadraja alma).
- Tarama sonrası düzenlenebilir inceleme ekranı.
- Yapı listesi: adet (+/−), "yapıldı" işareti, silme.
- Toplam malzeme ekranı (yapılmamış yapılar × adet).
- Malzeme sözlüğü: AI öneri isim verir, kullanıcı yeniden adlandırır, isim kalıcı olur.
- Ayarlar: API anahtarı, model adı, veri dışa/içe aktarma.
- PWA (ana ekrana eklenebilir, liste çevrimdışı görüntülenir).
- Responsive arayüz; masaüstünde 800px genişliğinde ortalanmış container.
- Arayüz dili: Türkçe.

### Kapsam dışı (bilinçli)
- Envanterdeki "sahip olunan" sayı (görselde `21/4` içindeki `21`). Sadece gereken miktar (`/4` kısmı) alınır.
- Yapıların haç bonusu (`+3` vb.).
- Malzeme ikon görsellerini kırpıp saklama/gösterme.
- Cihazlar arası otomatik senkron, hesap sistemi, sunucu.
- DeepSeek dışında sağlayıcılar (mimari sonradan eklemeye izin verecek şekilde ayrı katmanda tutulur, ama şimdi yazılmaz).
- Malzeme silme/birleştirme ekranı.

## 3. Mimari

Tamamen **statik site**. Backend yok. Tarayıcı doğrudan `https://api.deepseek.com/chat/completions` adresine istek atar (CORS ön kontrolü curl ile doğrulandı: gelen `Origin` yansıtılıyor, `authorization` ve `content-type` başlıklarına izin var).

- Teknoloji: **Svelte 5 + Vite + TypeScript**, `vite-plugin-pwa`.
- Veri ve API anahtarı yalnızca kullanıcının tarayıcısında (`localStorage`) durur.
- Görseller hiçbir yerde saklanmaz; yalnızca AI isteğinin gövdesinde gider.
- Hosting: statik dosya barındırma (Cloudflare Pages veya GitHub Pages, uygulama bittiğinde seçilir).

### Dosya yapısı (öneri)

```
src/
  lib/
    types.ts            # Material, Building, AppState, ScanResult tipleri
    storage.ts          # localStorage okuma/yazma, şema sürümü, dışa/içe aktarma
    state.svelte.ts     # reaktif uygulama durumu + eylemler
    aggregate.ts        # toplam malzeme hesabı (saf fonksiyon)
    merge.ts            # tarama sonucunu duruma birleştirme, yapı eşleştirme (saf)
    image.ts            # görsel yükleme (EXIF yönü uygulanmış), döndürme/kadraj hesabı, küçültme (canvas -> JPEG)
    ai/
      provider.ts       # ScanProvider arayüzü
      deepseek.ts       # DeepSeek uygulaması
      prompt.ts         # sistem/kullanıcı istemi oluşturma
      validate.ts       # AI JSON çıktısını doğrulama (saf)
  components/
    Tabs.svelte
    BuildingsView.svelte
    BuildingCard.svelte
    TotalView.svelte
    SettingsView.svelte
    ScanButton.svelte
    ImageEditor.svelte
    ReviewScreen.svelte
  App.svelte
  main.ts
```

`aggregate.ts`, `merge.ts`, `validate.ts` saf fonksiyonlardır, birim testleriyle doğrulanır. AI çağrısı `ScanProvider` arayüzünün arkasındadır; testlerde sahte uygulama kullanılır.

## 4. Veri modeli

```ts
type Material = {
  id: string;          // sabit, değişmez (uuid)
  name: string;        // kullanıcı tarafından değiştirilebilir
  description: string; // AI'ın verdiği görsel tarif, eşleştirme için; kullanıcı düzenlemez
};

type Requirement = { materialId: string; amount: number }; // amount: tamsayı >= 1

type Building = {
  id: string;
  name: string;
  qty: number;         // >= 1, varsayılan 1
  built: boolean;      // varsayılan false
  requirements: Requirement[];
};

type AppState = { version: 1; materials: Material[]; buildings: Building[] };
type Settings = { apiKey: string; model: string }; // model varsayılanı "deepseek-flash"
```

- Durum tek bir `localStorage` anahtarında, ayarlar ayrı bir anahtarda saklanır.
- Yükleme sırasında şema sürümü kontrol edilir; bozuk/eksik veri varsa boş durumla başlanır ve kullanıcıya bildirilir, ham veri üzerine yazılmaz.
- **Dışa aktarma** yalnızca `AppState`'i içerir, **API anahtarı asla dışa aktarılmaz**. İçe aktarma onaydan sonra mevcut durumu değiştirir; dosya doğrulanır.

## 5. Tarama akışı

1. **Görsel alma.** İki ayrı buton: kamera (`<input type="file" accept="image/*" capture="environment">`) ve galeri/dosya (`accept="image/*"`). `getUserMedia` kullanılmaz.
2. **Düzenleme.** Seçilen/çekilen görsel (kamera ve galeri için aynı) `ImageEditor`'da açılır:
   - Görsel yüklenirken EXIF yönü uygulanır (`createImageBitmap(file, { imageOrientation: "from-image" })`), telefon fotoğrafları yan/ters görünmez.
   - **Döndür:** sola/sağa 90° butonları.
   - **Yakınlaştır/kaydır:** dokunmatikte iki parmakla sıkıştır ve sürükle; masaüstünde fare tekerleği ve sürükleme; ayrıca yakınlaştırma çubuğu. Görsel kadraj alanını her zaman kaplar (kenarlarda boşluk kalmaz), minimum yakınlaştırma = tamamı görünür.
   - **"Sıfırla"** ve **"Devam"**. Devam, kadrajdaki (döndürülmüş + yakınlaştırılmış) bölgeyi tuval üzerine çizip AI'a gidecek görseli üretir. Düzenleme yapılmadan "Devam" basılırsa görselin tamamı gider. **"İptal"** akışı bitirir, hiçbir istek atılmaz.
   - Düzenleme yalnızca kadraj/döndürme; renk, parlaklık vb. yok.
3. **Küçültme.** Kadrajdan çıkan görselin uzun kenarı en fazla 1600px'e indirilir, JPEG kalite 0.85, base64 data URL.
4. **AI isteği.** OpenAI uyumlu Chat Completions, `model` ayarlardan gelir. Mesaj: sistem istemi + kullanıcı mesajı (metin: bilinen malzeme sözlüğü JSON'u; `image_url`: data URL). Görseller yalnızca `user` mesajında olabilir.
5. **Doğrulama.** Yanıt JSON'a ayrıştırılır (kod çiti varsa temizlenir), şemaya karşı doğrulanır. Geçersizse **bir kez** otomatik tekrar denenir, yine geçersizse hata gösterilir.
6. **İnceleme ekranı.** Kullanıcı düzeltir, onaylar. İptal ederse hiçbir şey kaydedilmez.
7. **Birleştirme.** Onaylanan sonuç duruma yazılır (bkz. §6).

### AI çıktı sözleşmesi

```json
{
  "buildings": [
    {
      "name": "İç Mekân Bankı I",
      "requirements": [
        { "materialId": "m_abc" , "suggestedName": null, "description": null, "amount": 2 },
        { "materialId": null, "suggestedName": "Çivi", "description": "altın renkli, üç çivi demeti", "amount": 6 }
      ]
    }
  ]
}
```

Kurallar (istem ve doğrulamada):
- Bilinen bir malzemeyle eşleşirse `materialId` dolu, `suggestedName`/`description` null.
- Bilinmeyen ikon için `materialId` null; `suggestedName` (Türkçe, kısa) ve `description` (ikonun görsel tarifi, örn. renk/şekil) zorunlu.
- `amount` yalnızca **ikinci sayı**dır (`sahip/gereken` biçiminde gereken). Sahip olunan sayı yok sayılır.
- Görselde yapı yoksa `buildings: []`.
- Yapı adları görselde okunduğu gibi, Roman rakamları dahil aynen yazılır.
- `materialId` sözlükte yoksa doğrulama bunu "yeni malzeme" gibi ele alır (AI id uydurduysa `suggestedName` yoksa satır hatalıdır ve incelemede işaretlenir).

İstemde JSON çıktısı zorunlu kılınır; DeepSeek'in `response_format: { type: "json_object" }` desteği görsel isteklerle birlikte uygulama sırasında denenir, kabul edilmezse yalnızca istem + sağlam ayrıştırma kullanılır.

## 6. Birleştirme kuralları (`merge.ts`)

**Malzeme:**
- `materialId` dolu: mevcut malzeme kullanılır. Adı ve tarifi **asla** AI tarafından değiştirilmez.
- `materialId` null: yeni `Material` oluşturulur (`suggestedName`, `description`), **ya da** kullanıcı inceleme ekranında mevcut bir malzemeyi seçtiyse o kullanılır (kopya oluşmaz).

**Yapı eşleştirme:** ad normalize edilir (`trim`, boşlukları tek boşluğa indirme, `toLocaleLowerCase('tr')`); eşit normalize ada sahip yapı varsa **güncellenir**, yoksa eklenir.
- Güncellemede `requirements` taranan değerlerle **değiştirilir**; `qty` ve `built` korunur.
- Yeni yapı `qty = 1`, `built = false` ile başlar.
- İnceleme ekranı her yapı için "yeni" / "mevcut kayıt güncellenecek" rozetini gösterir.

**Toplam (`aggregate.ts`):** `built === false` olan yapılar için `Σ (amount × qty)`, malzeme bazında. Sadece toplamı > 0 olan malzemeler listelenir. Her malzeme için katkıda bulunan yapılar da döndürülür (Toplam ekranında açılır detay için).

## 7. Ekranlar

Tek sütun, mobilde altta / masaüstünde container üstünde 3 sekme. Masaüstünde içerik `max-width: 800px`, ortalı. Görsel yön: koyu tema, oyunun mezarlık/kilise havasına uygun; ayrıntı uygulama aşamasında (frontend tasarım becerileriyle) netleştirilir.

### Yapılar (ana ekran)
- Üstte belirgin **"Tara"** (kamera) ve **"Galeriden seç"** butonları.
- Yapı kartı: ad, malzeme etiketleri (`Tahta ×4`), adet kontrolü **− n +** (en az 1), "yapıldı" onay kutusu, sil (onaylı).
- Yapıldı olanlar soluk görünür ve listenin altına iner.

### Toplam
- Malzeme başına toplam miktar; bir malzemeye dokununca hangi yapılar için ne kadar gerektiği açılır.
- Malzeme adı düzenlenebilir (düzenle simgesi → satır içi metin alanı). Boş isim kabul edilmez.

### Ayarlar
- API anahtarı (`type=password`, göster/gizle), model adı (varsayılan `deepseek-flash`).
- Bilgi notu: anahtar yalnızca bu cihazda saklanır.
- Verileri dışa aktar / içe aktar (JSON).

### Görsel düzenleme ekranı (tam ekran)
- Ortada kadraj alanı, altta: sola döndür, sağa döndür, yakınlaştırma çubuğu, Sıfırla; en altta İptal ve Devam.
- Mobilde tam ekran, masaüstünde 800px container içinde.

### İnceleme ekranı (tam ekran/modal)
- Her yapı için: düzenlenebilir ad, "yeni"/"güncellenecek" rozeti, yapıyı hariç tutma.
- Her malzeme satırı için: malzeme adı (mevcut/yeni), düzenlenebilir miktar, satırı silme.
- Yeni malzeme satırında: önerilen isim alanı + **"mevcut malzemeyi seç"** açılır menüsü.
- Yapılar/satırlar sonradan silinebilir; **"Listeye ekle"** ve **"İptal"**.

## 8. Hata durumları

Tüm mesajlar Türkçe, tarama hatalarında "Tekrar dene" butonu.

| Durum | Davranış |
|---|---|
| API anahtarı yok | "Ayarlardan API anahtarı gir" + Ayarlar'a bağlantı; istek atılmaz |
| 401 | "API anahtarı geçersiz" |
| 402 | "Bakiye yetersiz" |
| 429 | "Çok fazla istek, biraz bekle" |
| Ağ/CORS hatası | "Bağlantı kurulamadı" |
| Geçersiz JSON | Bir kez otomatik tekrar, sonra "AI cevabı okunamadı" |
| `buildings: []` | "Yapı bulunamadı, daha net çek" |
| Görsel açılamıyor (bozuk/desteklenmeyen dosya) | "Görsel açılamadı, başka bir görsel dene" |
| Çevrimdışı | Tara butonları devre dışı; liste, toplam, ayarlar çalışır |
| Bozuk kayıtlı veri | Boş durumla başla, kullanıcıya bildir, ham veriye dokunma |

## 9. PWA

- `vite-plugin-pwa`, `registerType: autoUpdate`, `display: standalone`, uygulama kabuğu önbelleğe alınır.
- 192px ve 512px (maskable dahil) ikonlar.
- AI istekleri önbelleğe alınmaz.

## 10. Güvenlik notları

- API anahtarı `localStorage`'da düz metin durur; siteye üçüncü taraf script yüklenmez, anahtar loglanmaz, dışa aktarmaya girmez.
- Anahtar yalnızca `api.deepseek.com`'a gönderilir.
- Site yalnızca tek kullanıcılı; anahtar başkasına ait olmadığı sürece risk kabul edilebilir düzeydedir ve kullanıcıya ayarlarda belirtilir.

## 11. Test stratejisi

- **Vitest, saf mantık:** `aggregate` (adet çarpımı, yapıldı hariç tutma), `merge` (yapı eşleştirme, `qty`/`built` korunması, isim ezilmemesi, kopya malzeme oluşmaması), `validate` (geçerli/geçersiz/eksik alanlı AI çıktıları, kod çitli JSON), Türkçe normalize (`İ`/`ı`).
- **Vitest, görsel matematiği (`image.ts`):** döndürme sonrası boyutlar, kadraj sınırlama (görsel kadrajı her zaman kaplar), kadrajdan kaynak dikdörtgen hesabı, 1600px küçültme oranı. Canvas çizimi elle doğrulanır.
- **Sahte `ScanProvider`** ile tarama akışı entegrasyon testi (inceleme → birleştirme).
- **Elle doğrulama:** kullanıcının verdiği örnek ekran görüntüsü (5 yapı: Basit Sandık, Kiliseyi Geliştir I, İç Mekân Bankı I, Günah Çıkarma Kabini I, Kilise Sunağı I) gerçek anahtarla taranır; miktarlar `sahip/gereken` içindeki gereken sayılarla karşılaştırılır. Aynı görselin ikinci kez taranması yeni kayıt açmamalı, mevcut kayıtları güncellemeli.
- Düzenleme: telefonda çekilen dikey/yatay fotoğrafın doğru yönde açıldığı, iki parmakla yakınlaştırmanın, döndürmenin ve "Devam" sonrası gönderilen görselin kadrajla aynı olduğu elle doğrulanır.
- Mobil (dokunma, kamera girişi) ve masaüstü (800px container) düzenleri tarayıcıda elle kontrol edilir.

## 12. Açık doğrulama maddeleri

- `deepseek-flash` ile görsel isteğinde `response_format: json_object` kabul ediliyor mu (uygulama sırasında denenir).
- Pikselli küçük rakamlarda (6/8/3) okuma doğruluğu ve telefon fotoğrafının (ekran moirésı) etkisi; gerekirse istem iyileştirilir. İnceleme ekranı bu riske karşı zorunlu adımdır.
