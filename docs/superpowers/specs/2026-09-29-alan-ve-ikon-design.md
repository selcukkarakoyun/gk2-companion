# Alan kırılımı ve malzeme ikonları — Tasarım Spec'i

Tarih: 2026-09-29
Temel spec: `2026-09-29-gk2-companion-design.md` (bu belge onun üzerine ekler; çelişen yerde bu belge geçerlidir)

## 1. Amaç

Oyunda inşa menüsü birden çok **alan** için var ("Bahçe", "Avlu"; pencere başlığında yazar). Kullanıcı, toplam malzeme ihtiyacını **hangi alana ne kadar gittiği** ile birlikte görmek istiyor. Ayrıca malzeme adları birbirine benzediği için her malzemenin **ikonunu** görselden kesip uygulamada göstermek ve AI'ın malzemeleri ikona bakarak tanımasını sağlamak istiyor.

**Başarı ölçütü:** Bahçe ve Avlu menüleri taranınca Toplam ekranı her malzeme için şunu gösterir:

```
Çivi = 30
 - Avlu = 12
 - Bahçe = 18
```

ve her malzemenin yanında görselden kesilmiş ikonu vardır.

## 2. Kapsam

### Kapsam içi
- Her taramanın bir **alanı** vardır; AI pencere başlığından okur, kullanıcı inceleme ekranında düzeltir.
- Toplam ekranında malzeme başına alan kırılımı.
- Yapılar sekmesinde alanlara göre gruplama.
- Malzeme başına **ikon**: AI ikonun görseldeki konumunu (`box`) verir, uygulama keser ve saklar.
- İnceleme ekranında ikon önizlemesi ve **elle kırpma** (yedek).
- AI isteğine bilinen ikonların **referans görsel** olarak eklenmesi.
- Malzemesiz satırların taslağa alınmaması.
- Veri sürümü 2 ve otomatik taşıma (v1 → v2).

### Kapsam dışı
- Penceredeki sekme bilgisi (Avlu'daki kategori sekmeleri) saklanmaz.
- Sayaç rengi (kırmızı/sarı) kullanılmaz; yalnızca gereken miktar (ikinci sayı).
- Bir malzemenin mevcut ikonunun kendiliğinden değiştirilmesi.
- Alanları yeniden adlandırma/birleştirme ekranı (yanlış alan, inceleme ekranında düzeltilir).

## 3. Veri modeli (sürüm 2)

```ts
type Material = { id: string; name: string; description: string; icon?: string }; // icon: PNG data URL
type Building = { id: string; area: string; name: string; qty: number; built: boolean; requirements: Requirement[] };
type AppState = { version: 2; materials: Material[]; buildings: Building[] };
type Box = { x: number; y: number; w: number; h: number }; // gönderilen görselin 0–1 oranı
```

- **Alan adı** kırpılır, boşluklar tek boşluğa indirilir; boş olamaz. Karşılaştırma `normalizeName` ile (Türkçe büyük/küçük harf duyarsız).
- **Yapı kimliği = alan + yapı adı** (normalize edilmiş). Aynı yapı adı iki alanda ayrı kayıttır.
- **İkon** en çok 64px (uzun kenar) PNG data URL. Dosya boyutu ~3KB; `localStorage` sınırı içinde yüzlerce malzeme sığar. Depolama dolarsa mevcut "kaydedilemedi" bildirimi çalışır.
- **Göç (v1 → v2):** yükleme ve içe aktarmada sürüm 1 verisi otomatik v2'ye çevrilir: her yapının `area` değeri **"Genel"**, ikonlar boş. Sürüm 1 veya 2 dışındaki veri bozuk sayılır (mevcut yedekleme davranışı). Doğrulama kuralları (yinelenen kimlik yok, malzeme başvurusu geçerli) aynen geçerli; yeni alan/ikon kuralları: `area` boş olmayan metin, `icon` yoksa veya `data:image/png;base64,` ile başlayan metin.
- Dışa aktarma v2 yazar ve ikonları içerir.

## 4. AI sözleşmesi

Yanıt:

```json
{
  "area": "Bahçe",
  "buildings": [
    {
      "name": "Bahçe Geliştirme I",
      "requirements": [
        { "materialId": null, "suggestedName": "Çivi", "description": "gold nails", "amount": 18,
          "box": { "x": 0.61, "y": 0.42, "w": 0.04, "h": 0.07 } }
      ]
    }
  ]
}
```

- `area`: pencere başlığındaki metin; okunamazsa `null`.
- `box`: malzeme ikonunun (yuva içindeki resim, sayaç metni hariç) gönderilen görseldeki konumu, sol üst köşe + genişlik/yükseklik, 0–1 oranı.
- Ayrıştırma gevşektir (mevcut ilke): `area` yoksa `null`; `box` sayısal olmayan, aralık dışı veya sıfır alanlıysa `null` (0–1'e sıkıştırılır); geçersiz `box` taramayı bozmaz.
- **İstek:** kullanıcı mesajı şu sırayla kurulur: (1) bilinen malzemelerin JSON listesi (id, ad, tarif), (2) ikonu olan her bilinen malzeme için `Known material id="…" name="…":` metni + ikon görseli (`image_url`), (3) taranacak görsel. İstem metni, ikonu olan malzemeleri **ikona bakarak** eşleştirmesini, `area` ve `box` alanlarını ve `box`'ın yalnızca ikonu kapsaması gerektiğini söyler.
- Malzemesiz satırlar (`requirements: []`) taslağa alınmaz.

## 5. Taslak ve birleştirme kuralları

`ReviewDraft` şunlarla genişler:

```ts
type ReviewDraft = {
  area: string;                       // düzenlenebilir
  skippedEmpty: number;               // malzemesiz atlanan yapı sayısı
  buildings: ReviewBuilding[];
  newMaterials: ReviewNewMaterial[];  // + icon: string | null, box: Box | null
  iconFills: ReviewIconFill[];        // { materialId, icon, box, accept }
};
type ReviewRequirement = { …mevcut alanlar; box: Box | null };
```

- `scanToDraft`: `scan.area` mevcut bir alanla (normalize) eşleşiyorsa mevcut yazımı kullanır; malzemesiz yapıları atlar ve sayar.
- `attachIcons(draft, state, crop)` (saf; `crop: (box) => string` verilir):
  - Her yeni malzeme için, onu kullanan ilk geçerli `box`'tan ikon üretir.
  - İkonu olmayan mevcut malzemeler için (doğrudan eşleşen veya `mapTo` ile eşlenen) ilk geçerli `box`'tan `iconFills` önerisi oluşturur (`accept: true`).
  - İkonu olan malzemeye dokunmaz.
- `validateDraft`: `area` boşsa hata ("Alan adı boş."). Malzemesiz yapı kuralı kalkar (taslakta zaten yok).
- `applyDraft`: yeni malzemeleri `icon` ile ekler; kabul edilen `iconFills` malzemenin ikonunu **yalnızca ikonu yoksa** yazar; yapılar `area` ile eşleştirilir (yapı kimliği = alan + ad); mevcut kayıtta `qty`/`built` korunur, gereksinimler değişir. Aynı taramada aynı yapı iki kez gelirse mevcut kural (ikincisi birincinin üzerine yazar) geçerli.

## 6. Kırpma

- Düzenleyiciden çıkan görsel (JPEG data URL) taramanın sonuna kadar tutulur ve bir kez `ImageBitmap`'e çözülür; tüm kırpmalar bundan yapılır.
- Saf yardımcılar (`image-math.ts`): `boxToRect(box, imgW, imgH)` (sınırlar içine sıkıştırır, en az 1px), `iconSize(w, h, max = 64)` (küçük kırpmayı büyütmez).
- DOM yardımcısı (`image.ts`): `cropToIcon(bitmap, box): string` (PNG data URL, `imageSmoothingEnabled = false`).
- **Elle kırpma (`IconCropper`):** modal; gönderilen görsel gösterilir, mevcut `box` dikdörtgen olarak çizilir; parmakla/fareyle sürükleyerek yeni dikdörtgen çizilir; "Uygula" (en az %1 genişlik/yükseklik) ve "İptal". Uygulanınca `box` ve `icon` güncellenir.

## 7. Ekranlar

- **Malzeme yuvası:** ikon (40px, `image-rendering: pixelated`), altında sayaç, ad küçük ve soluk. İkon yoksa yalnızca ad.
- **Yapılar:** alan başlıkları (`divider`) altında gruplu; her grupta yapılmamışlar, sonra soluk "yapıldı" olanlar. Alanlar Türkçe alfabetik.
- **Toplam:** malzeme satırında ikon, ad, toplam; altında **alan kırılımı her zaman görünür** ("Avlu = 12", "Bahçe = 18", alanlar alfabetik); dokununca yapı bazlı detay açılır (mevcut). Yalnızca tek alan varsa da kırılım gösterilir.
- **İnceleme ekranı:** en üstte **Alan** alanı (metin + mevcut alanlardan öneri listesi); "N malzemesiz yapı atlandı" notu; yeni malzeme satırında ikon önizlemesi ve "Kırpmayı düzelt"; "İkonu olmayan malzemeler" bölümü (önizleme, kabul onay kutusu, "Kırpmayı düzelt").
- Tema ve bileşen dili mevcut oyun temasıyla aynı.

## 8. Hata durumları

| Durum | Davranış |
|---|---|
| `area` okunamadı | Alan alanı boş; doldurulana kadar "Listeye ekle" kapalı |
| `box` yok/geçersiz | İkon önerisi yok; "Kırpmayı düzelt" ile elle kesilebilir; kesilmezse malzeme ikonsuz eklenir |
| Kırpma başarısız (canvas) | Önizleme yok, hata metni; malzeme ikonsuz eklenebilir |
| Depolama dolu | Mevcut "kaydedilemedi" bildirimi |
| v1 verisi | Sessizce v2'ye taşınır ("Genel" alanı) |

## 9. Test stratejisi

- **Vitest (saf mantık):** `aggregate` alan kırılımı (çok alan, yapıldı hariç, adetle çarpım); `merge` (alan+ad eşleştirme, aynı ad farklı alan = ayrı kayıt, malzemesiz atlama, `attachIcons`, `iconFills` yalnızca ikonsuz malzemeye, `applyDraft` ikon yazma kuralları, alan yazımı korunması); `storage` (v1→v2 göç, geçersiz `area`/`icon`, içe aktarma v1 ve v2); `parse` (`area`, `box` geçerli/geçersiz/aralık dışı); `prompt` (ikonlu bilinen malzemeler referans görsel olarak, ikonsuzlar yalnızca JSON'da, görsel sırası); `image-math` (`boxToRect`, `iconSize`).
- **E2E (Playwright, sahte AI cevabı):** iki farklı alan taranır → Toplam kırılımı doğru; sahte `box` ile ikon önizlemesi ve listede ikon görünür; "Kırpmayı düzelt" ile elle kırpma ikonu değiştirir; v1 verisi yüklenince "Genel" alanında açılır.
- **Elle doğrulama (anahtar gerekir):** verilen iki ekran görüntüsüyle (Bahçe, Avlu) alan adı okuma ve `box` doğruluğu; referans ikonlarla eşleştirme kalitesi.

## 10. Riskler / açık maddeler

- DeepSeek'in `box` koordinat doğruluğu ölçülmedi. Elle kırpma bu yüzden zorunlu yedek. Sonuca göre istem (`box` tarifi) ayarlanır.
- Referans ikon görselleri isteği büyütür (görsel başına en çok 1024 token; 64px ikonlar çok daha az). Çok malzemede maliyet artabilir; ölçülüp gerekirse ikonlar tek bir birleşik görsele toplanır.
- Sürüm 1 verisi için ikonlar ancak yeni taramalarda öneri olarak gelir (toplu edinme yok).
