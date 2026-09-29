# Alan Kırılımı ve Malzeme İkonları Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (Bu proje için kullanıcı kararı: her zaman **executing-plans / Native**.)

**Goal:** Taramalara alan (Bahçe, Avlu) bilgisi eklemek, Toplam ekranında malzeme başına alan kırılımını göstermek ve her malzemenin ikonunu görselden kesip saklamak/göstermek/AI'a referans olarak vermek.

**Architecture:** Mevcut saf mantık katmanı (types, aggregate, merge, storage, parse, prompt, image-math) genişletilir; veri sürümü 2'ye çıkar ve v1 otomatik taşınır. AI cevabına `area` ve her malzeme için `box` (ikon konumu, 0–1 oranı) eklenir. Kırpma gönderilen görselden canvas ile yapılır; yanlışsa `IconCropper` ile elle düzeltilir. UI katmanı bunların üstünde ince kalır.

**Tech Stack:** Svelte 5 (runes), Vite, TypeScript, Vitest, Playwright (mevcut).

**Spec:** `docs/superpowers/specs/2026-09-29-alan-ve-ikon-design.md` (temel: `2026-09-29-gk2-companion-design.md`)

## Global Constraints

- Arayüz dili Türkçe; kod ve dosya adları İngilizce. Mevcut oyun teması (`app.css` sınıfları: `window`, `titlebar`, `panel-row`, `slot`, `divider`, `notice`…) kullanılır.
- Veri sürümü **2**. `Building.area` boş olmayan metin (kırpılmış, tek boşluk). `Material.icon` yoksa veya `data:image/png;base64,` ile başlar.
- Alan/yapı karşılaştırması `normalizeName` (Türkçe büyük/küçük harf duyarsız, boşluk sadeleştirme). **Yapı kimliği = alan + yapı adı.**
- Eski (v1) veri kaybolmaz: yükleme ve içe aktarmada yapılar `area: "Genel"` ile v2'ye taşınır. v1/v2 dışı sürüm bozuk sayılır (mevcut yedekleme davranışı).
- `Box` = `{x, y, w, h}`, gönderilen görselin 0–1 oranı; geçersizse `null`, taramayı bozmaz.
- İkon: en çok 64px (uzun kenar) PNG data URL, `imageSmoothingEnabled = false`, ekranda `image-rendering: pixelated`.
- Malzemesiz yapılar taslağa girmez; hepsi malzemesizse tarama "Yapı bulunamadı" adımına düşer.
- API anahtarı davranışı değişmez (yalnızca `localStorage`, dışa aktarmaya girmez, yalnızca api.deepseek.com'a gider).
- Görsel/erişilebilir adlar ve test kimlikleri korunur (`article.building`, `total-row`, `review-building`, `review-new-material`, düğme adları).
- Commit mesajları `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` satırıyla biter.
- **Not:** Task 1'de tipler değişir; `npm run check` Task 9'a kadar kırmızı olabilir. Task 1–8'in doğrulaması `npx vitest run <dosya>` iledir; **Task 9 sonunda `npm run check` 0 hata vermelidir**.

## Review Focus

Spec'in ima ettiği, testlerin tek başına yakalamayabileceği durumlar (her birinin testi ilgili task'ta):

1. **v1 verisi göçte kaybolmamalı/bozulmamalı**; v1 yedek dosyası içe aktarılabilmeli; bilinmeyen sürüm yine yedeklenip boş başlamalı. → Task 2, Task 10 (e2e göç).
2. **Aynı yapı adı iki alanda ayrı kayıt olmalı; aynı alan farklı yazımla (büyük/küçük harf, boşluk) tekrar taranınca kopya açılmamalı.** → Task 7, Task 10.
3. **Bozuk `box` (NaN, negatif, >1, metin, sıfır alan) çökertmemeli**; kırpma hatası ikonsuz devam ettirmeli. → Task 3, Task 5, Task 7.
4. **Alan kırılımı doğru olmalı:** yapıldı olanlar hariç, adetle çarpım, aynı alanın yapıları toplanır, harf farkı aynı alan sayılır. → Task 1, Task 10.
5. **Tüm yapıları malzemesiz olan tarama** boş inceleme ekranı açmamalı ("Yapı bulunamadı"). Ayrıca içe aktarılan dosyadaki geçersiz `icon` değeri render'ı bozmamalı (reddedilir). → Task 2, Task 10.

---

## File Structure

```
src/lib/
  types.ts           # Box, Material.icon, Building.area, v2, ReviewDraft genişlemesi
  test-helpers.ts    # st() v2, bld() area varsayılanı "Genel"
  aggregate.ts       # byArea, sources.area
  storage.ts         # v2, göç, area/icon doğrulama
  areas.ts           # (yeni) listAreas, groupByArea
  merge.ts           # area, malzemesiz atlama, attachIcons, applyDraft ikon/alan
  image-math.ts      # boxToRect, iconSize, boxFromPoints
  image.ts           # bitmapFromDataUrl, cropToIcon (DOM)
  ai/parse.ts        # area, box
  ai/prompt.ts       # area/box istemi, referans ikon görselleri
  ai/provider.ts     # ScanInput.knownMaterials.icon
src/components/
  IconCropper.svelte # (yeni) elle kırpma penceresi
  BuildingCard.svelte, BuildingsView.svelte, TotalView.svelte
  ReviewScreen.svelte, ScanFlow.svelte
src/app.css          # .slot-icon, .areas, .cropper
e2e/flow.spec.ts     # güncellenir + yeni testler
```

---

### Task 1: Tipler, test yardımcıları ve alan kırılımı (`aggregate`)

**Files:**
- Modify: `src/lib/types.ts`, `src/lib/test-helpers.ts`, `src/lib/aggregate.ts`
- Test: `src/lib/aggregate.test.ts`

**Interfaces:**
- Produces (`types.ts`): aşağıdaki tam tip bloğu; sonraki tüm task'lar bunu kullanır.
- Produces (`aggregate.ts`): `MaterialTotal = { material: Material; total: number; byArea: { area: string; amount: number }[]; sources: { buildingId: string; buildingName: string; area: string; amount: number }[] }`.
- Produces (`test-helpers.ts`): `st()` artık `version: 2` döner; `bld(id, name, reqs, extra?)` varsayılan `area: 'Genel'` verir (`extra` ile ezilir).

- [ ] **Step 1: tipleri güncelle**

`src/lib/types.ts` içindeki ilgili tipleri şu hâle getir (diğerleri — `Requirement`, `Settings`, `Tab`, `ScannedBuilding`, `ReviewBuilding` — aynı kalır):

```ts
export type Box = { x: number; y: number; w: number; h: number };

export type Material = { id: string; name: string; description: string; icon?: string };
export type Building = {
  id: string;
  area: string;
  name: string;
  qty: number;
  built: boolean;
  requirements: Requirement[];
};
export type AppState = { version: 2; materials: Material[]; buildings: Building[] };

export type ScannedRequirement = {
  materialId: string | null;
  suggestedName: string | null;
  description: string | null;
  amount: number;
  box: Box | null;
};
export type ScanResult = { area: string | null; buildings: ScannedBuilding[] };

export type ReviewNewMaterial = {
  key: string;
  name: string;
  description: string;
  mapTo: string | null;
  icon: string | null;
  box: Box | null;
};
export type ReviewRequirement = {
  key: string;
  materialId: string | null;
  newKey: string | null;
  amount: number;
  box: Box | null;
};
export type ReviewIconFill = { materialId: string; icon: string | null; box: Box | null; accept: boolean };
export type ReviewDraft = {
  area: string;
  skippedEmpty: number;
  buildings: ReviewBuilding[];
  newMaterials: ReviewNewMaterial[];
  iconFills: ReviewIconFill[];
};
```

`src/lib/test-helpers.ts`'te `bld` içine `area: 'Genel'` ekle (spread'ten önce, `extra` ezebilsin) ve `st`'yi `version: 2` yap:

```ts
export const bld = (
  id: string,
  name: string,
  reqs: [string, number][],
  extra: Partial<Building> = {},
): Building => ({
  id,
  area: 'Genel',
  name,
  qty: 1,
  built: false,
  requirements: reqs.map(([materialId, amount]) => ({ materialId, amount })),
  ...extra,
});

export const st = (materials: Material[] = [], buildings: Building[] = []): AppState => ({
  version: 2,
  materials,
  buildings,
});
```

- [ ] **Step 2: başarısız testleri yaz**

`src/lib/aggregate.test.ts`'te "miktarı adetle çarpar" testindeki beklentiyi değiştir:
```ts
expect(row.sources).toEqual([{ buildingId: 'b1', buildingName: 'Sandık', area: 'Genel', amount: 12 }]);
```
ve dosyanın sonundaki `describe` içine ekle:
```ts
  it('alan kırılımı: aynı alanı toplar, yapıldı olanı hariç tutar, adetle çarpar', () => {
    const s = st([civi], [
      bld('b1', 'A', [['c', 4]], { area: 'Bahçe', qty: 2 }),
      bld('b2', 'B', [['c', 6]], { area: 'Avlu' }),
      bld('b3', 'C', [['c', 10]], { area: 'Bahçe' }),
      bld('b4', 'D', [['c', 99]], { area: 'Bahçe', built: true }),
    ]);
    const [row] = aggregate(s);
    expect(row.total).toBe(24);
    expect(row.byArea).toEqual([
      { area: 'Avlu', amount: 6 },
      { area: 'Bahçe', amount: 18 },
    ]);
  });

  it('alan kırılımı Türkçe alfabetik sıralanır, harf farkı aynı alan sayılır', () => {
    const s = st([civi], [
      bld('b1', 'A', [['c', 1]], { area: 'Çarşı' }),
      bld('b2', 'B', [['c', 2]], { area: 'avlu' }),
      bld('b3', 'C', [['c', 3]], { area: 'AVLU' }),
      bld('b4', 'D', [['c', 1]], { area: 'Zindan' }),
    ]);
    expect(aggregate(s)[0].byArea).toEqual([
      { area: 'avlu', amount: 5 },
      { area: 'Çarşı', amount: 1 },
      { area: 'Zindan', amount: 1 },
    ]);
  });
```

- [ ] **Step 3: testin başarısız olduğunu gör**

Run: `npx vitest run src/lib/aggregate.test.ts`
Expected: FAIL (`byArea` tanımsız / `sources` beklentisi uyuşmuyor).

- [ ] **Step 4: uygula**

`src/lib/aggregate.ts` (tamamı):
```ts
import { normalizeName } from './merge';
import type { AppState, Material } from './types';

export type MaterialTotal = {
  material: Material;
  total: number;
  byArea: { area: string; amount: number }[];
  sources: { buildingId: string; buildingName: string; area: string; amount: number }[];
};

function byAreaOf(sources: MaterialTotal['sources']): MaterialTotal['byArea'] {
  const map = new Map<string, { area: string; amount: number }>();
  for (const s of sources) {
    const key = normalizeName(s.area);
    const hit = map.get(key);
    if (hit) hit.amount += s.amount;
    else map.set(key, { area: s.area, amount: s.amount });
  }
  return [...map.values()].sort((a, b) => a.area.localeCompare(b.area, 'tr'));
}

export function aggregate(state: AppState): MaterialTotal[] {
  const byId = new Map(state.materials.map((m) => [m.id, m]));
  const totals = new Map<string, MaterialTotal>();

  for (const b of state.buildings) {
    if (b.built) continue;
    for (const r of b.requirements) {
      const material = byId.get(r.materialId);
      if (!material) continue;
      const amount = r.amount * b.qty;
      if (amount <= 0) continue;
      let t = totals.get(material.id);
      if (!t) {
        t = { material, total: 0, byArea: [], sources: [] };
        totals.set(material.id, t);
      }
      t.total += amount;
      t.sources.push({ buildingId: b.id, buildingName: b.name, area: b.area, amount });
    }
  }

  const rows = [...totals.values()];
  for (const t of rows) t.byArea = byAreaOf(t.sources);
  return rows.sort(
    (a, b) => b.total - a.total || a.material.name.localeCompare(b.material.name, 'tr'),
  );
}
```

- [ ] **Step 5: testin geçtiğini gör**

Run: `npx vitest run src/lib/aggregate.test.ts`
Expected: tüm testler PASS. (Diğer test dosyaları bu task'ta kırılabilir; sıradaki task'larda düzelir.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/test-helpers.ts src/lib/aggregate.ts src/lib/aggregate.test.ts
git commit -m "feat: v2 tipleri ve toplamda alan kırılımı" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Saklama sürümü 2 ve v1 → v2 göçü (`storage.ts`)

**Files:**
- Modify: `src/lib/storage.ts`
- Test: `src/lib/storage.test.ts`

**Interfaces:**
- Consumes: `AppState`, `Building`, `Material` (`types.ts`).
- Produces: `DEFAULT_AREA = 'Genel'`; `emptyState()` v2 döner; `validateState(raw)` sürüm 1 **veya** 2 kabul eder ve daima v2 `AppState` döner (v1: `area = 'Genel'`, ikon yok); v2'de `area` boş olmayan metin (kırpılıp tek boşluğa indirilir), `icon` yoksa veya `data:image/png;base64,` ile başlar, aksi hâlde `null`. `loadState`/`parseImport`/`exportState` bunu kullanır (imzalar değişmez).

- [ ] **Step 1: başarısız testleri yaz**

`src/lib/storage.test.ts` içinde:

(a) `"şekli geçersiz veriyi bozuk sayar"` testinde `version: 2` → `version: 3` yap.

(b) Dosyanın sonuna ekle:
```ts
const V1 = {
  version: 1,
  materials: [{ id: 'm1', name: 'Tahta', description: 'plank' }],
  buildings: [{ id: 'b1', name: 'A', qty: 2, built: false, requirements: [{ materialId: 'm1', amount: 4 }] }],
};
const V1_AS_V2 = {
  version: 2,
  materials: [{ id: 'm1', name: 'Tahta', description: 'plank' }],
  buildings: [{ id: 'b1', area: 'Genel', name: 'A', qty: 2, built: false, requirements: [{ materialId: 'm1', amount: 4 }] }],
};
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('sürüm 1 → 2 göçü', () => {
  it('v1 verisini Genel alanıyla v2 yapar', () => {
    expect(validateState(V1)).toEqual(V1_AS_V2);
  });
  it('loadState v1 kaydını bozuk saymaz, göç eder', () => {
    const kv = memory({ [STATE_KEY]: JSON.stringify(V1) });
    expect(loadState(kv)).toEqual({ state: V1_AS_V2, corrupt: false });
  });
  it('v1 yedek dosyası içe aktarılabilir', () => {
    expect(parseImport(JSON.stringify(V1))).toEqual(V1_AS_V2);
  });
  it('dışa aktarma v2 yazar', () => {
    expect(JSON.parse(exportState(sample)).version).toBe(2);
  });
});

describe('v2 alan ve ikon doğrulaması', () => {
  const withBuilding = (b: Record<string, unknown>) => ({
    version: 2,
    materials: [{ id: 'm1', name: 'T', description: '' }],
    buildings: [{ id: 'b1', name: 'A', qty: 1, built: false, requirements: [], ...b }],
  });
  it.each([['boş', ''], ['boşluk', '   '], ['sayı', 5], ['yok', undefined]])('geçersiz alanı reddeder: %s', (_n, area) => {
    expect(validateState(withBuilding({ area }))).toBeNull();
  });
  it('alanı kırpar ve boşlukları sadeleştirir', () => {
    expect(validateState(withBuilding({ area: '  Yeni   Alan ' }))!.buildings[0].area).toBe('Yeni Alan');
  });
  it('png data URL ikonu korur', () => {
    const raw = { version: 2, materials: [{ id: 'm1', name: 'T', description: '', icon: PNG }], buildings: [] };
    expect(validateState(raw)!.materials[0].icon).toBe(PNG);
  });
  it.each(['http://x/y.png', 'data:image/jpeg;base64,AAAA', 5, ''])('geçersiz ikonu reddeder: %s', (icon) => {
    const raw = { version: 2, materials: [{ id: 'm1', name: 'T', description: '', icon }], buildings: [] };
    expect(validateState(raw)).toBeNull();
  });
});
```

- [ ] **Step 2: testin başarısız olduğunu gör**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: FAIL (göç ve `area`/`icon` testleri).

- [ ] **Step 3: uygula**

`src/lib/storage.ts` içinde:

- `DEFAULT_MODEL` satırının altına ekle: `export const DEFAULT_AREA = 'Genel';`
- `emptyState`'i `version: 2` yap.
- `validateState`'i şununla değiştir:
```ts
const PNG_PREFIX = 'data:image/png;base64,';
const cleanArea = (s: string) => s.trim().replace(/\s+/g, ' ');

export function validateState(raw: unknown): AppState | null {
  if (!isObj(raw) || (raw.version !== 1 && raw.version !== 2)) return null;
  if (!Array.isArray(raw.materials) || !Array.isArray(raw.buildings)) return null;
  const v2 = raw.version === 2;

  const materials: Material[] = [];
  const ids = new Set<string>();
  for (const m of raw.materials) {
    if (!isObj(m) || typeof m.id !== 'string' || !m.id || typeof m.name !== 'string' || ids.has(m.id)) {
      return null;
    }
    let icon: string | undefined;
    if (v2 && m.icon !== undefined) {
      if (typeof m.icon !== 'string' || !m.icon.startsWith(PNG_PREFIX)) return null;
      icon = m.icon;
    }
    ids.add(m.id);
    materials.push({
      id: m.id,
      name: m.name,
      description: typeof m.description === 'string' ? m.description : '',
      ...(icon ? { icon } : {}),
    });
  }

  const buildings: Building[] = [];
  const buildingIds = new Set<string>();
  for (const b of raw.buildings) {
    if (!isObj(b) || typeof b.id !== 'string' || typeof b.name !== 'string' || !Array.isArray(b.requirements)) {
      return null;
    }
    if (!Number.isInteger(b.qty) || (b.qty as number) < 1 || typeof b.built !== 'boolean') return null;
    let area = DEFAULT_AREA;
    if (v2) {
      if (typeof b.area !== 'string' || !cleanArea(b.area)) return null;
      area = cleanArea(b.area);
    }
    // Arayüz yapıları id ile, malzeme satırlarını materialId ile anahtarlar; yinelenen anahtar çizimi çökertir.
    if (buildingIds.has(b.id)) return null;
    buildingIds.add(b.id);
    const requirements: Requirement[] = [];
    const usedMaterials = new Set<string>();
    for (const r of b.requirements) {
      if (
        !isObj(r) ||
        typeof r.materialId !== 'string' ||
        !ids.has(r.materialId) ||
        usedMaterials.has(r.materialId) ||
        !Number.isInteger(r.amount) ||
        (r.amount as number) < 1
      ) {
        return null;
      }
      usedMaterials.add(r.materialId);
      requirements.push({ materialId: r.materialId, amount: r.amount as number });
    }
    buildings.push({ id: b.id, area, name: b.name, qty: b.qty as number, built: b.built, requirements });
  }
  return { version: 2, materials, buildings };
}
```
(`loadState`, `saveState`, `parseImport`, `exportState` aynı kalır; hepsi `validateState`'i kullanır.)

- [ ] **Step 4: testlerin geçtiğini gör**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat: saklama sürümü 2, v1 göçü, alan ve ikon doğrulaması" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: AI cevabında `area` ve `box` ayrıştırma (`ai/parse.ts`)

**Files:**
- Modify: `src/lib/ai/parse.ts`
- Test: `src/lib/ai/parse.test.ts`

**Interfaces:**
- Consumes: `Box`, `ScanResult`, `ScannedRequirement` (`types.ts`).
- Produces: `parseScanResponse(text): ScanResult` artık `{ area: string | null, buildings }` döner; her satırda `box: Box | null`. Geçersiz `box`/eksik `area` **hata değil** `null` olur.

- [ ] **Step 1: başarısız testleri yaz**

`src/lib/ai/parse.test.ts` içinde:

(a) Üstteki `good` sabitini şununla değiştir:
```ts
const good = {
  area: 'Bahçe',
  buildings: [
    {
      name: 'İç Mekân Bankı I',
      requirements: [
        { materialId: 'm_abc', suggestedName: null, description: null, amount: 2, box: null },
        { materialId: null, suggestedName: 'Çivi', description: 'gold nails', amount: 6, box: { x: 0.1, y: 0.2, w: 0.05, h: 0.06 } },
      ],
    },
  ],
};
```
(b) `"boş yapı listesini kabul eder"` beklentisini `{ area: null, buildings: [] }` yap.
(c) `"eksik description/suggestedName alanlarını null yapar ve metinleri kırpar"` testinde beklenen satır nesnesine `box: null` ekle.
(d) Dosyanın sonuna ekle:
```ts
describe('area ve box', () => {
  const one = (extra: Record<string, unknown>) =>
    parseScanResponse(JSON.stringify({ buildings: [{ name: 'A', requirements: [{ materialId: 'm', amount: 1, ...extra }] }] }));

  it('area değerini kırpar; yoksa veya boşsa null yapar', () => {
    expect(parseScanResponse('{"area":"  Avlu ","buildings":[]}').area).toBe('Avlu');
    expect(parseScanResponse('{"buildings":[]}').area).toBeNull();
    expect(parseScanResponse('{"area":"  ","buildings":[]}').area).toBeNull();
    expect(parseScanResponse('{"area":"null","buildings":[]}').area).toBeNull();
  });
  it('geçerli box değerini korur', () => {
    expect(one({ box: { x: 0.5, y: 0.25, w: 0.1, h: 0.2 } }).buildings[0].requirements[0].box).toEqual({ x: 0.5, y: 0.25, w: 0.1, h: 0.2 });
  });
  it('box eksikse null', () => {
    expect(one({}).buildings[0].requirements[0].box).toBeNull();
  });
  it('aralık dışı box değerini 0–1 içine sıkıştırır', () => {
    const b = one({ box: { x: -0.2, y: 0.9, w: 0.5, h: 0.5 } }).buildings[0].requirements[0].box!;
    expect(b.x).toBe(0);
    expect(b.y).toBe(0.9);
    expect(b.w).toBe(0.5);
    expect(b.h).toBeCloseTo(0.1);
  });
  it.each([
    ['metin', { x: 'a', y: 0, w: 0.1, h: 0.1 }],
    ['NaN benzeri null', { x: null, y: 0, w: 0.1, h: 0.1 }],
    ['negatif genişlik', { x: 0.1, y: 0.1, w: -0.2, h: 0.1 }],
    ['sıfır alan', { x: 0.1, y: 0.1, w: 0, h: 0.1 }],
    ['tamamen dışarıda', { x: 1.5, y: 0.1, w: 0.1, h: 0.1 }],
    ['nesne değil', 'kutu'],
  ])('geçersiz box (%s) null olur, tarama bozulmaz', (_n, box) => {
    const r = one({ box });
    expect(r.buildings[0].requirements[0].box).toBeNull();
    expect(r.buildings[0].requirements[0].amount).toBe(1);
  });
});
```

- [ ] **Step 2: testin başarısız olduğunu gör**

Run: `npx vitest run src/lib/ai/parse.test.ts`
Expected: FAIL (`area`/`box` yok).

- [ ] **Step 3: uygula**

`src/lib/ai/parse.ts`:
- import satırını `import type { Box, ScanResult, ScannedBuilding, ScannedRequirement } from '../types';` yap.
- `toAmount`'tan sonra ekle:
```ts
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function parseBox(v: unknown): Box | null {
  if (!isObj(v)) return null;
  const { x, y, w, h } = v;
  if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const bx = clamp01(x as number);
  const by = clamp01(y as number);
  const bw = Math.min(w as number, 1 - bx);
  const bh = Math.min(h as number, 1 - by);
  if (bw < 0.005 || bh < 0.005) return null;
  return { x: bx, y: by, w: bw, h: bh };
}
```
(`isObj` bu satırdan önce tanımlı olmalı; dosyada `toAmount`'tan sonra zaten tanımlı, sırayı `isObj` önce olacak şekilde düzenle.)
- `parseRequirement`'ın döndürdüğü nesneye `box: parseBox(raw.box),` ekle.
- `parseScanResponse`'ın dönüşünü şununla değiştir:
```ts
  return { area: optString(raw.area), buildings: raw.buildings.map(parseBuilding) };
```

- [ ] **Step 4: testlerin geçtiğini gör**

Run: `npx vitest run src/lib/ai/parse.test.ts`
Expected: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/parse.ts src/lib/ai/parse.test.ts
git commit -m "feat: AI cevabında alan ve ikon kutusu ayrıştırma" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: İstem ve referans ikon görselleri (`ai/prompt.ts`, `ai/provider.ts`)

**Files:**
- Modify: `src/lib/ai/prompt.ts`, `src/lib/ai/provider.ts`
- Test: `src/lib/ai/prompt.test.ts`

**Interfaces:**
- Consumes: `Material` (`types.ts`).
- Produces: `ScanInput.knownMaterials: Pick<Material, 'id' | 'name' | 'description' | 'icon'>[]`; `buildMessages(imageDataUrl, knownMaterials)`: kullanıcı mesajı sırası **(1)** bilinen malzeme JSON metni, **(2)** ikonu olan her malzeme için `Reference icon for known material id="…" name="…":` metni + `image_url` (ikon), **(3)** "Now read this screenshot" metni + taranacak görsel `image_url` (**son parça**).

- [ ] **Step 1: başarısız testleri yaz**

`src/lib/ai/prompt.test.ts` dosyasını tamamen şununla değiştir:
```ts
import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT, buildMessages } from './prompt';

type Part = { type: string; text?: string; image_url?: { url: string } };
const parts = (msg: { content: unknown }) => msg.content as Part[];

describe('buildMessages', () => {
  const url = 'data:image/jpeg;base64,AAAA';
  const known = [{ id: 'm1', name: 'Tahta', description: 'light plank' }];

  it('sistem mesajı düz metindir ve görsel içermez', () => {
    const [sys] = buildMessages(url, known);
    expect(sys).toEqual({ role: 'system', content: SYSTEM_PROMPT });
  });

  it('taranacak görsel user mesajının son parçasıdır', () => {
    const [, user] = buildMessages(url, known);
    expect(user.role).toBe('user');
    const p = parts(user);
    expect(p[p.length - 1]).toEqual({ type: 'image_url', image_url: { url } });
  });

  it('bilinen malzemeleri JSON olarak metne koyar (ikon verisi JSON\'a girmez)', () => {
    const withIcon = [{ id: 'm1', name: 'Tahta', description: 'light plank', icon: 'data:image/png;base64,ICON' }];
    const [, user] = buildMessages(url, withIcon);
    const text = parts(user)[0].text!;
    expect(text).toContain(JSON.stringify([{ id: 'm1', name: 'Tahta', description: 'light plank' }]));
    expect(text).not.toContain('ICON');
  });

  it('bilinen malzeme yoksa boş dizi gönderir ve referans görsel eklemez', () => {
    const [, user] = buildMessages(url, []);
    expect(parts(user)[0].text).toContain('[]');
    expect(parts(user).filter((x) => x.type === 'image_url')).toHaveLength(1);
  });

  it('ikonu olan bilinen malzemeyi etiketli referans görsel olarak ekler; ikonsuzu eklemez', () => {
    const list = [
      { id: 'm1', name: 'Tahta', description: 'plank', icon: 'data:image/png;base64,ONE' },
      { id: 'm2', name: 'Çivi', description: 'nails' },
      { id: 'm3', name: 'Taş', description: 'stone', icon: 'data:image/png;base64,THREE' },
    ];
    const p = parts(buildMessages(url, list)[1]);
    const images = p.filter((x) => x.type === 'image_url').map((x) => x.image_url!.url);
    expect(images).toEqual(['data:image/png;base64,ONE', 'data:image/png;base64,THREE', url]);
    const labels = p.filter((x) => x.type === 'text').map((x) => x.text);
    expect(labels).toContain('Reference icon for known material id="m1" name="Tahta":');
    expect(labels).toContain('Reference icon for known material id="m3" name="Taş":');
    expect(labels.join('\n')).not.toContain('id="m2"');
    const iconIdx = p.findIndex((x) => x.image_url?.url.endsWith('ONE'));
    expect(p[iconIdx - 1].text).toContain('id="m1"');
  });

  it('istem sayının slash sonrasını, alanı, kutuyu ve boş sonucu tarif eder', () => {
    expect(SYSTEM_PROMPT).toMatch(/AFTER the slash/);
    expect(SYSTEM_PROMPT).toMatch(/"area"/);
    expect(SYSTEM_PROMPT).toMatch(/"box"/);
    expect(SYSTEM_PROMPT).toMatch(/reference icon/i);
    expect(SYSTEM_PROMPT).toContain('"buildings":[]');
  });
});
```

- [ ] **Step 2: testin başarısız olduğunu gör**

Run: `npx vitest run src/lib/ai/prompt.test.ts`
Expected: FAIL.

- [ ] **Step 3: uygula**

`src/lib/ai/provider.ts` içinde `ScanInput.knownMaterials` tipini `Pick<Material, 'id' | 'name' | 'description' | 'icon'>[]` yap.

`src/lib/ai/prompt.ts`:
- `SYSTEM_PROMPT`'u şununla değiştir:
```ts
export const SYSTEM_PROMPT = `You read screenshots or photos of the construction menu in the video game "Graveyard Keeper 2". The game UI is in Turkish.

The window title bar (top of the menu) shows the AREA name, for example "Bahçe" or "Avlu". Return it as "area" exactly as written, or null if you cannot read it.

Each row of the menu is one buildable item. A row has an icon, the item's name, and on the right zero or more material icons. Each material icon has a counter such as "0/4" or "21/6".

The counter format is "owned/required". Only the number AFTER the slash is the required amount. Ignore the number before the slash. Ignore small bonus values shown under a name (for example a cross icon with "+3"). A row with no material icons gets an empty "requirements" list.

Materials are shown as icons only, without names. You are given a list of already known materials (id, name, visual description). Some of them also come with a reference icon image, sent as separate labeled images before the screenshot. Match icons visually: if a material icon in the screenshot looks the same as a reference icon, return that material's "materialId" and set "suggestedName" and "description" to null. For known materials without a reference image use the description. Otherwise set "materialId" to null, give a short Turkish "suggestedName" (for example "Tahta", "Çivi", "Taş", "Kütük") and a short English "description" of how the icon looks (color and shape) so that it can be recognized again later. Icons that look different need different names even if they are the same kind of thing (for example a light plank and a dark plank).

For every material icon also return "box": the position of the icon picture itself (not the counter text under it) inside the SCREENSHOT image (the last image you receive), as fractions of the image width and height. "x" and "y" are the top-left corner, "w" and "h" are the size, all between 0 and 1. If you cannot locate the icon return null.

Building names must be copied exactly as shown in the image, including Roman numerals such as "I" or "II". Keep the order of rows and of material icons.

Respond with ONLY a JSON object, no prose and no code fences, in exactly this shape:
{"area":"<area name or null>","buildings":[{"name":"<building name>","requirements":[{"materialId":"<known id or null>","suggestedName":"<name or null>","description":"<description or null>","amount":<integer >= 1>,"box":{"x":0.0,"y":0.0,"w":0.0,"h":0.0}}]}]}

If the image contains no construction menu rows, respond with {"area":null,"buildings":[]}.`;
```
- `buildMessages`'i şununla değiştir:
```ts
type KnownMaterial = Pick<Material, 'id' | 'name' | 'description' | 'icon'>;

export function buildMessages(imageDataUrl: string, knownMaterials: KnownMaterial[]): ChatMessage[] {
  const known = JSON.stringify(knownMaterials.map(({ id, name, description }) => ({ id, name, description })));
  const references = knownMaterials
    .filter((m) => m.icon)
    .flatMap((m): ContentPart[] => [
      { type: 'text', text: `Reference icon for known material id="${m.id}" name="${m.name}":` },
      { type: 'image_url', image_url: { url: m.icon as string } },
    ]);
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: `Known materials: ${known}` },
        ...references,
        { type: 'text', text: 'Now read this screenshot and return the JSON.' },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ];
}
```
(Dosyanın başındaki `import type { Material }` kalır; eski `buildMessages` imzasını sil.)

- [ ] **Step 4: testlerin geçtiğini gör**

Run: `npx vitest run src/lib/ai`
Expected: `parse`, `prompt`, `deepseek` testlerinin hepsi PASS. (`deepseek.test.ts` `buildMessages` çıktısına `body.messages[1].content.some(image_url)` ile baktığı için değişmeden geçer.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai
git commit -m "feat: istemde alan, ikon kutusu ve referans ikon görselleri" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Kırpma matematiği (`image-math.ts`)

**Files:**
- Modify: `src/lib/image-math.ts`
- Test: `src/lib/image-math.test.ts`

**Interfaces:**
- Consumes: `Box` (`types.ts`), mevcut `Rect`.
- Produces:
```ts
export const ICON_MAX = 64;
export function boxToRect(box: Box, imgW: number, imgH: number): Rect;      // piksel, görsel içinde, en az 1x1
export function iconSize(w: number, h: number, max?: number): { w: number; h: number }; // büyütmez
export function boxFromPoints(ax: number, ay: number, bx: number, by: number): Box;     // 0–1'e sıkıştırır, sırayı düzeltir
```

- [ ] **Step 1: başarısız testleri yaz**

`src/lib/image-math.test.ts` içindeki import'a `ICON_MAX, boxFromPoints, boxToRect, iconSize` ekle ve dosyanın sonuna:
```ts
describe('boxToRect', () => {
  it('oranı piksele çevirir', () => {
    expect(boxToRect({ x: 0.5, y: 0.25, w: 0.1, h: 0.2 }, 200, 100)).toEqual({ x: 100, y: 25, w: 20, h: 20 });
  });
  it('görselin dışına taşmaz', () => {
    const r = boxToRect({ x: 0.95, y: 0.95, w: 0.5, h: 0.5 }, 200, 100);
    expect(r.x + r.w).toBeLessThanOrEqual(200);
    expect(r.y + r.h).toBeLessThanOrEqual(100);
  });
  it('çok küçük kutuyu en az 1x1 yapar', () => {
    const r = boxToRect({ x: 0.5, y: 0.5, w: 0.0001, h: 0.0001 }, 200, 100);
    expect(r.w).toBeGreaterThanOrEqual(1);
    expect(r.h).toBeGreaterThanOrEqual(1);
  });
  it('en sağ alt köşedeki kutuda bile geçerli dikdörtgen verir', () => {
    const r = boxToRect({ x: 1, y: 1, w: 0.1, h: 0.1 }, 200, 100);
    expect(r.x).toBeLessThanOrEqual(199);
    expect(r.y).toBeLessThanOrEqual(99);
    expect(r.w).toBeGreaterThanOrEqual(1);
  });
});

describe('iconSize', () => {
  it('uzun kenarı ICON_MAX değerine indirir, oranı korur', () => {
    expect(iconSize(128, 64)).toEqual({ w: ICON_MAX, h: 32 });
  });
  it('küçük kırpmayı büyütmez', () => {
    expect(iconSize(40, 30)).toEqual({ w: 40, h: 30 });
  });
});

describe('boxFromPoints', () => {
  it('ters sürüklemede sırayı düzeltir', () => {
    expect(boxFromPoints(0.6, 0.5, 0.2, 0.1)).toEqual({ x: 0.2, y: 0.1, w: 0.4, h: 0.4 });
  });
  it('0–1 dışını sıkıştırır', () => {
    const b = boxFromPoints(-0.5, 0.5, 2, 0.9);
    expect(b.x).toBe(0);
    expect(b.w).toBe(1);
  });
});
```

- [ ] **Step 2: testin başarısız olduğunu gör**

Run: `npx vitest run src/lib/image-math.test.ts`
Expected: FAIL (fonksiyonlar tanımsız).

- [ ] **Step 3: uygula**

`src/lib/image-math.ts` üstüne `import type { Box } from './types';` ekle, sonuna:
```ts
export const ICON_MAX = 64;

export function boxToRect(box: Box, imgW: number, imgH: number): Rect {
  const x = Math.min(Math.max(0, Math.round(box.x * imgW)), imgW - 1);
  const y = Math.min(Math.max(0, Math.round(box.y * imgH)), imgH - 1);
  const w = Math.max(1, Math.min(Math.round(box.w * imgW), imgW - x));
  const h = Math.max(1, Math.min(Math.round(box.h * imgH), imgH - y));
  return { x, y, w, h };
}

export function iconSize(w: number, h: number, max = ICON_MAX): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

export function boxFromPoints(ax: number, ay: number, bx: number, by: number): Box {
  const c = (n: number) => Math.min(1, Math.max(0, n));
  const x0 = c(Math.min(ax, bx));
  const y0 = c(Math.min(ay, by));
  const x1 = c(Math.max(ax, bx));
  const y1 = c(Math.max(ay, by));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
```

- [ ] **Step 4: testlerin geçtiğini gör**

Run: `npx vitest run src/lib/image-math.test.ts`
Expected: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/image-math.ts src/lib/image-math.test.ts
git commit -m "feat: ikon kırpma matematiği" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Alan yardımcıları (`areas.ts`)

**Files:**
- Create: `src/lib/areas.ts`
- Test: `src/lib/areas.test.ts`

**Interfaces:**
- Consumes: `normalizeName` (`merge.ts`), `AppState`, `Building`.
- Produces:
```ts
export function listAreas(state: AppState): string[];                                    // tekil (normalize), ilk yazım, Türkçe alfabetik
export function groupByArea(buildings: Building[]): { area: string; buildings: Building[] }[]; // alanlar alfabetik; grupta yapılmamışlar önce, sonra yapılmışlar (sıra korunur)
```

- [ ] **Step 1: başarısız testi yaz**

`src/lib/areas.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { groupByArea, listAreas } from './areas';
import { bld, st } from './test-helpers';

describe('listAreas', () => {
  it('boş durumda boş liste', () => {
    expect(listAreas(st())).toEqual([]);
  });
  it('harf farkını tek alan sayar, ilk yazımı korur, Türkçe alfabetik sıralar', () => {
    const s = st([], [
      bld('1', 'A', [], { area: 'Zindan' }),
      bld('2', 'B', [], { area: 'avlu' }),
      bld('3', 'C', [], { area: 'AVLU' }),
      bld('4', 'D', [], { area: 'Çarşı' }),
    ]);
    expect(listAreas(s)).toEqual(['avlu', 'Çarşı', 'Zindan']);
  });
});

describe('groupByArea', () => {
  it('alanlara böler, yapılmamışları önce koyar, sırayı korur', () => {
    const list = [
      bld('1', 'A', [], { area: 'Bahçe', built: true }),
      bld('2', 'B', [], { area: 'Avlu' }),
      bld('3', 'C', [], { area: 'Bahçe' }),
      bld('4', 'D', [], { area: 'bahçe' }),
    ];
    const g = groupByArea(list);
    expect(g.map((x) => x.area)).toEqual(['Avlu', 'Bahçe']);
    expect(g[1].buildings.map((b) => b.id)).toEqual(['3', '4', '1']);
  });
  it('boş listede boş döner', () => {
    expect(groupByArea([])).toEqual([]);
  });
});
```

- [ ] **Step 2: testin başarısız olduğunu gör**

Run: `npx vitest run src/lib/areas.test.ts`
Expected: FAIL (`Cannot find module './areas'`).

- [ ] **Step 3: uygula**

`src/lib/areas.ts`:
```ts
import { normalizeName } from './merge';
import type { AppState, Building } from './types';

export function listAreas(state: AppState): string[] {
  const seen = new Map<string, string>();
  for (const b of state.buildings) {
    const key = normalizeName(b.area);
    if (!seen.has(key)) seen.set(key, b.area);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'tr'));
}

export function groupByArea(buildings: Building[]): { area: string; buildings: Building[] }[] {
  const groups = new Map<string, { area: string; buildings: Building[] }>();
  for (const b of buildings) {
    const key = normalizeName(b.area);
    let g = groups.get(key);
    if (!g) {
      g = { area: b.area, buildings: [] };
      groups.set(key, g);
    }
    g.buildings.push(b);
  }
  return [...groups.values()]
    .sort((a, b) => a.area.localeCompare(b.area, 'tr'))
    .map((g) => ({
      area: g.area,
      buildings: [...g.buildings.filter((b) => !b.built), ...g.buildings.filter((b) => b.built)],
    }));
}
```

- [ ] **Step 4: testin geçtiğini gör**

Run: `npx vitest run src/lib/areas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/areas.ts src/lib/areas.test.ts
git commit -m "feat: alan listeleme ve gruplama yardımcıları" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Birleştirme: alan, malzemesiz atlama, ikonlar (`merge.ts`)

**Files:**
- Modify: `src/lib/merge.ts`
- Test: `src/lib/merge.test.ts`

**Interfaces:**
- Consumes: yeni tipler (Task 1), `Box`.
- Produces:
```ts
export function normalizeName(s: string): string;                                  // değişmez
export function scanToDraft(scan: ScanResult, state: AppState): ReviewDraft;       // area, skippedEmpty, satırlara box, boş iconFills
export function attachIcons(draft: ReviewDraft, state: AppState, crop: (box: Box) => string): void; // taslağı yerinde değiştirir
export function newMaterialForRow(draft: ReviewDraft, rowKey: string): void;      // yeni malzeme: icon/box da null
export function validateDraft(draft: ReviewDraft, state: AppState): string | null; // boş alan → 'Alan adı boş.'
export function applyDraft(state: AppState, draft: ReviewDraft, newId: () => string): AppState; // v2
```

- [ ] **Step 1: mevcut testleri yeni tiplere uyarla ve yenilerini yaz**

`src/lib/merge.test.ts` içinde:

(a) İmport satırını `import { applyDraft, attachIcons, newMaterialForRow, normalizeName, scanToDraft, validateDraft } from './merge';` ve `import type { Box, ReviewDraft, ScanResult } from './types';` yap.

(b) Yardımcıları değiştir:
```ts
const scan = (buildings: ScanResult['buildings'], area: string | null = 'Bahçe'): ScanResult => ({ area, buildings });
const nr = (suggestedName: string, amount: number, description = 'desc', box: Box | null = null) => ({
  materialId: null,
  suggestedName,
  description,
  amount,
  box,
});
const kr = (materialId: string, amount: number, box: Box | null = null) => ({
  materialId,
  suggestedName: null,
  description: null,
  amount,
  box,
});
```
ve `"uydurma id yeni malzeme sayılır"` testindeki `ghost` nesnesine `box: null` ekle.

(c) `draftOf` ve `row` yardımcılarını değiştir:
```ts
const draftOf = (over: Partial<ReviewDraft> & { buildings: ReviewDraft['buildings'] }): ReviewDraft => ({
  area: 'Bahçe',
  skippedEmpty: 0,
  newMaterials: [],
  iconFills: [],
  ...over,
});
const row = (o: Partial<ReviewDraft['buildings'][0]['requirements'][0]> = {}) => ({
  key: 'r',
  materialId: 'm1' as string | null,
  newKey: null as string | null,
  amount: 1,
  box: null as Box | null,
  ...o,
});
```
`validateDraft` testlerindeki `newMaterials` nesne sabitlerine (`nm`, `nms`) `icon: null, box: null` ekle (üç yerde: "boş adlı…", "yeni malzeme adı mevcut…", "iki yeni malzeme…").

(d) `describe('applyDraft'…)`'in **altına** ekle:
```ts
const BOX: Box = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
const cropStub = (b: Box) => `icon:${b.x}`;

describe('scanToDraft: alan ve malzemesiz satırlar', () => {
  const s0 = st([mat('m1', 'Tahta')], [bld('b1', 'A', [['m1', 1]], { area: 'Bahçe' })]);
  it('alanı taslağa taşır; mevcut alanın yazımını kullanır; boşluğu sadeleştirir; yoksa boş bırakır', () => {
    expect(scanToDraft(scan([], '  bahçe '), s0).area).toBe('Bahçe');
    expect(scanToDraft(scan([], ' Yeni   Alan '), s0).area).toBe('Yeni Alan');
    expect(scanToDraft(scan([], null), s0).area).toBe('');
  });
  it('malzemesiz yapıları atlar ve sayar', () => {
    const d = scanToDraft(scan([{ name: 'Bahçe Tarhı', requirements: [] }, { name: 'A', requirements: [nr('Çivi', 1)] }]), st());
    expect(d.buildings.map((b) => b.name)).toEqual(['A']);
    expect(d.skippedEmpty).toBe(1);
  });
  it('tüm yapılar malzemesizse taslakta yapı kalmaz', () => {
    const d = scanToDraft(scan([{ name: 'X', requirements: [] }]), st());
    expect(d.buildings).toEqual([]);
    expect(d.skippedEmpty).toBe(1);
  });
  it('box değerini satıra taşır', () => {
    const d = scanToDraft(scan([{ name: 'A', requirements: [nr('Çivi', 1, 'd', BOX)] }]), st());
    expect(d.buildings[0].requirements[0].box).toEqual(BOX);
    expect(d.newMaterials[0]).toMatchObject({ icon: null, box: null });
    expect(d.iconFills).toEqual([]);
  });
});

describe('validateDraft: alan', () => {
  it('boş alanı reddeder', () => {
    expect(validateDraft(draftOf({ area: '  ', buildings: [b()] }), base)).toBe('Alan adı boş.');
  });
});

describe('attachIcons', () => {
  it('yeni malzeme için ilk geçerli kutudan ikon üretir', () => {
    const s0 = st();
    const d = scanToDraft(scan([{ name: 'A', requirements: [nr('Çivi', 1, 'd', null), nr('Çivi', 2, 'd', BOX)] }]), s0);
    attachIcons(d, s0, cropStub);
    expect(d.newMaterials[0].icon).toBe('icon:0.1');
    expect(d.newMaterials[0].box).toEqual(BOX);
  });
  it('kırpma hata verirse ikon null kalır, çökmez', () => {
    const s0 = st();
    const d = scanToDraft(scan([{ name: 'A', requirements: [nr('Çivi', 1, 'd', BOX)] }]), s0);
    attachIcons(d, s0, () => {
      throw new Error('canvas yok');
    });
    expect(d.newMaterials[0].icon).toBeNull();
  });
  it('kutusu olmayan yeni malzeme ikonsuz kalır', () => {
    const s0 = st();
    const d = scanToDraft(scan([{ name: 'A', requirements: [nr('Çivi', 1)] }]), s0);
    attachIcons(d, s0, cropStub);
    expect(d.newMaterials[0].icon).toBeNull();
  });
  it('ikonu olmayan mevcut malzeme için öneri (iconFills) oluşturur, ikonu olana dokunmaz', () => {
    const s0 = st([mat('m1', 'Tahta'), { ...mat('m2', 'Çivi'), icon: 'data:image/png;base64,X' }]);
    const d = scanToDraft(scan([{ name: 'A', requirements: [kr('m1', 1, BOX), kr('m2', 1, BOX)] }]), s0);
    attachIcons(d, s0, cropStub);
    expect(d.iconFills).toEqual([{ materialId: 'm1', icon: 'icon:0.1', box: BOX, accept: true }]);
  });
  it('mapTo ile ikonsuz mevcut malzemeye eşlenen yeni malzeme de öneri üretir', () => {
    const s0 = st([mat('m1', 'Tahta')]);
    const d = scanToDraft(scan([{ name: 'A', requirements: [nr('tahta', 1, 'd', BOX)] }]), s0);
    attachIcons(d, s0, cropStub);
    expect(d.iconFills.map((f) => f.materialId)).toEqual(['m1']);
  });
  it('kırpma başarısızsa öneri kabul edilmemiş gelir', () => {
    const s0 = st([mat('m1', 'Tahta')]);
    const d = scanToDraft(scan([{ name: 'A', requirements: [kr('m1', 1, BOX)] }]), s0);
    attachIcons(d, s0, () => {
      throw new Error('x');
    });
    expect(d.iconFills).toEqual([{ materialId: 'm1', icon: null, box: BOX, accept: false }]);
  });
  it('aynı malzeme için tek öneri', () => {
    const s0 = st([mat('m1', 'Tahta')]);
    const d = scanToDraft(scan([{ name: 'A', requirements: [kr('m1', 1, BOX)] }, { name: 'B', requirements: [kr('m1', 1, BOX)] }]), s0);
    attachIcons(d, s0, cropStub);
    expect(d.iconFills).toHaveLength(1);
  });
});

describe('applyDraft: alan ve ikon', () => {
  it('yeni yapıları taslağın alanıyla ekler', () => {
    const s0 = st();
    const s1 = applyDraft(s0, scanToDraft(scan([{ name: 'A', requirements: [nr('Çivi', 1)] }], 'Avlu'), s0), idGen());
    expect(s1.buildings[0].area).toBe('Avlu');
  });
  it('aynı yapı adı farklı alanda ayrı kayıt olur', () => {
    const s0 = st();
    const s1 = applyDraft(s0, scanToDraft(scan([{ name: 'Basit Sandık', requirements: [nr('Çivi', 1)] }], 'Bahçe'), s0), idGen());
    const s2 = applyDraft(s1, scanToDraft(scan([{ name: 'Basit Sandık', requirements: [nr('Çivi', 2)] }], 'Avlu'), s1), idGen('z'));
    expect(s2.buildings.map((b) => b.area).sort()).toEqual(['Avlu', 'Bahçe']);
    expect(s2.materials).toHaveLength(1);
  });
  it('aynı alan farklı yazımla (harf, boşluk) tekrar taranınca kopya açmaz; qty ve built korunur', () => {
    const s0 = st();
    const s1 = applyDraft(s0, scanToDraft(scan([{ name: 'A', requirements: [nr('Çivi', 1)] }], 'Bahçe'), s0), idGen());
    const edited = { ...s1, buildings: s1.buildings.map((x) => ({ ...x, qty: 3, built: true })) };
    const d = scanToDraft(scan([{ name: 'a', requirements: [nr('çivi', 5)] }], '  BAHÇE '), edited);
    const s2 = applyDraft(edited, d, idGen('z'));
    expect(s2.buildings).toHaveLength(1);
    expect(s2.buildings[0]).toMatchObject({ area: 'Bahçe', qty: 3, built: true });
    expect(s2.buildings[0].requirements[0].amount).toBe(5);
  });
  it('yeni malzemeyi ikonuyla ekler; ikon yoksa alan hiç yazılmaz', () => {
    const s0 = st();
    const d = scanToDraft(scan([{ name: 'A', requirements: [nr('Çivi', 1, 'd', BOX), nr('Taş', 1)] }]), s0);
    attachIcons(d, s0, () => 'data:image/png;base64,ICON');
    const s1 = applyDraft(s0, d, idGen());
    expect(s1.materials.find((m) => m.name === 'Çivi')!.icon).toBe('data:image/png;base64,ICON');
    expect('icon' in s1.materials.find((m) => m.name === 'Taş')!).toBe(false);
  });
  it('kabul edilen öneri yalnızca ikonu olmayan malzemeye yazılır', () => {
    const s0 = st([mat('m1', 'Tahta'), { ...mat('m2', 'Çivi'), icon: 'data:image/png;base64,OLD' }]);
    const d = scanToDraft(scan([{ name: 'A', requirements: [kr('m1', 1, BOX)] }]), s0);
    attachIcons(d, s0, () => 'data:image/png;base64,NEW');
    d.iconFills.push({ materialId: 'm2', icon: 'data:image/png;base64,EVIL', box: BOX, accept: true });
    const s1 = applyDraft(s0, d, idGen());
    expect(s1.materials.find((m) => m.id === 'm1')!.icon).toBe('data:image/png;base64,NEW');
    expect(s1.materials.find((m) => m.id === 'm2')!.icon).toBe('data:image/png;base64,OLD');
  });
  it('kabul edilmeyen öneri yazılmaz', () => {
    const s0 = st([mat('m1', 'Tahta')]);
    const d = scanToDraft(scan([{ name: 'A', requirements: [kr('m1', 1, BOX)] }]), s0);
    attachIcons(d, s0, () => 'data:image/png;base64,NEW');
    d.iconFills[0].accept = false;
    expect(applyDraft(s0, d, idGen()).materials[0].icon).toBeUndefined();
  });
  it('sonuç v2 durumudur', () => {
    const s0 = st();
    expect(applyDraft(s0, scanToDraft(scan([{ name: 'A', requirements: [nr('Çivi', 1)] }]), s0), idGen()).version).toBe(2);
  });
});
```

(e) Mevcut `applyDraft` testlerinin beklentileri (v1 sabitleri) `st()` ve `bld` yardımcıları üzerinden zaten v2/`Genel` olur; ek düzenleme gerekmez.

- [ ] **Step 2: testin başarısız olduğunu gör**

Run: `npx vitest run src/lib/merge.test.ts`
Expected: FAIL (`attachIcons` yok; `area`/`skippedEmpty` yok).

- [ ] **Step 3: uygula**

`src/lib/merge.ts`:

- Import'a `Box` ekle: `import type { AppState, Box, Building, Material, Requirement, ReviewBuilding, ReviewDraft, ReviewNewMaterial, ReviewRequirement, ScanResult } from './types';`
- `normalizeName`'den sonra ekle:
```ts
const cleanArea = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Mevcut bir alanla (normalize) eşleşiyorsa onun yazımını, yoksa temizlenmiş adı döner. */
function resolveArea(area: string | null | undefined, state: AppState): string {
  const cleaned = cleanArea(area ?? '');
  if (!cleaned) return '';
  const n = normalizeName(cleaned);
  return state.buildings.find((b) => normalizeName(b.area) === n)?.area ?? cleaned;
}
```
- `scanToDraft`'ı şununla değiştir (gövdedeki `key` yardımcısı ve isim eşleme mantığı aynı kalır; değişenler: `keptBuildings`, `box`, yeni alanlar):
```ts
export function scanToDraft(scan: ScanResult, state: AppState): ReviewDraft {
  const known = new Set(state.materials.map((m) => m.id));
  const existingByName = new Map(state.materials.map((m) => [normalizeName(m.name), m.id]));
  const newByName = new Map<string, ReviewNewMaterial>();
  const newMaterials: ReviewNewMaterial[] = [];
  let n = 0;
  const key = (prefix: string) => `${prefix}${++n}`;

  const kept = scan.buildings.filter((sb) => sb.requirements.length > 0);

  const buildings: ReviewBuilding[] = kept.map((sb) => ({
    key: key('b'),
    name: sb.name,
    include: true,
    requirements: sb.requirements.map((sr) => {
      if (sr.materialId && known.has(sr.materialId)) {
        return { key: key('r'), materialId: sr.materialId, newKey: null, amount: sr.amount, box: sr.box };
      }
      const name = (sr.suggestedName ?? '').trim();
      const norm = normalizeName(name);
      let nm = norm ? newByName.get(norm) : undefined;
      if (!nm) {
        nm = {
          key: key('n'),
          name,
          description: (sr.description ?? '').trim(),
          mapTo: (norm && existingByName.get(norm)) || null,
          icon: null,
          box: null,
        };
        newMaterials.push(nm);
        if (norm) newByName.set(norm, nm);
      }
      return { key: key('r'), materialId: null, newKey: nm.key, amount: sr.amount, box: sr.box };
    }),
  }));

  return {
    area: resolveArea(scan.area, state),
    skippedEmpty: scan.buildings.length - kept.length,
    buildings,
    newMaterials,
    iconFills: [],
  };
}
```
- `newMaterialForRow` içindeki `draft.newMaterials.push({ key, name: '', description: '', mapTo: null })` satırına `icon: null, box: null` ekle.
- `attachIcons`'ı `newMaterialForRow`'dan sonra ekle:
```ts
/** Kutulardan ikon önerileri üretir. Kırpma hatası ikonu null bırakır, çökertmez. */
export function attachIcons(draft: ReviewDraft, state: AppState, crop: (box: Box) => string): void {
  const rows: ReviewRequirement[] = draft.buildings.flatMap((b) => b.requirements);
  const safeCrop = (box: Box): string | null => {
    try {
      return crop(box);
    } catch {
      return null;
    }
  };

  for (const nm of draft.newMaterials) {
    const box = rows.find((r) => r.newKey === nm.key && r.box)?.box ?? null;
    if (box) {
      nm.box = box;
      nm.icon = safeCrop(box);
    }
  }

  const known = new Set(state.materials.map((m) => m.id));
  const hasIcon = new Set(state.materials.filter((m) => m.icon).map((m) => m.id));
  const seen = new Set(draft.iconFills.map((f) => f.materialId));
  const addFill = (materialId: string, box: Box | null) => {
    if (!box || !known.has(materialId) || hasIcon.has(materialId) || seen.has(materialId)) return;
    seen.add(materialId);
    const icon = safeCrop(box);
    draft.iconFills.push({ materialId, icon, box, accept: icon !== null });
  };
  for (const r of rows) if (r.materialId) addFill(r.materialId, r.box);
  for (const nm of draft.newMaterials) if (nm.mapTo) addFill(nm.mapTo, nm.box);
}
```
- `validateDraft`'ın başına (ilk satır olarak) ekle: `if (!draft.area.trim()) return 'Alan adı boş.';` — ancak "Eklenecek yapı yok." testi boş alanla beklenmediği için sıra: önce `included.length === 0` kontrolü, sonra alan kontrolü. Yani `if (included.length === 0) return 'Eklenecek yapı yok.';` satırından **sonra** `if (!draft.area.trim()) return 'Alan adı boş.';` koy.
- `applyDraft`'ta:
  - `const areaName = resolveArea(draft.area, state);` ekle (buildings kopyalarından önce).
  - Yeni malzeme ekleyen satırı `materials.push({ id, name: nm.name.trim(), description: nm.description.trim(), ...(nm.icon ? { icon: nm.icon } : {}) });` yap.
  - Yapı eşleştirmesini `const existing = buildings.find((b) => normalizeName(b.area) === normalizeName(areaName) && normalizeName(b.name) === norm);` yap.
  - Yeni yapı `buildings.push({ id: newId(), area: areaName, name: rb.name.trim().replace(/\s+/g, ' '), qty: 1, built: false, requirements });` yap.
  - Döngüden sonra, `return` öncesi ekle:
```ts
  for (const fill of draft.iconFills) {
    if (!fill.accept || !fill.icon) continue;
    const target = materials.find((m) => m.id === fill.materialId);
    if (target && !target.icon) target.icon = fill.icon;
  }
```
  - Dönüşü `return { version: 2, materials, buildings };` yap.

- [ ] **Step 4: testlerin geçtiğini gör**

Run: `npx vitest run src/lib/merge.test.ts`
Expected: tüm testler PASS.

- [ ] **Step 5: Tüm birim testlerini çalıştır**

Run: `npx vitest run`
Expected: tüm test dosyaları PASS (`ops.test.ts`, `deepseek.test.ts` dahil). Kırmızı varsa nedenini bul ve düzelt.

- [ ] **Step 6: Commit**

```bash
git add src/lib/merge.ts src/lib/merge.test.ts
git commit -m "feat: birleştirmede alan, malzemesiz atlama ve ikon önerileri" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Kırpma (DOM) yardımcıları, ikonlu arayüz, alan grupları ve toplam kırılımı

**Files:**
- Modify: `src/lib/image.ts`, `src/app.css`, `src/components/BuildingCard.svelte`, `src/components/BuildingsView.svelte`, `src/components/TotalView.svelte`

**Interfaces:**
- Consumes: `boxToRect`, `iconSize` (Task 5), `groupByArea` (Task 6), `MaterialTotal.byArea` (Task 1).
- Produces (`image.ts`): `bitmapFromDataUrl(dataUrl: string): Promise<ImageBitmap>`, `cropToIcon(bitmap: ImageBitmap, box: Box): string` (PNG data URL).
- Produces (CSS): `.slot-icon`, `.areas`.

DOM/Svelte dosyaları birim testsizdir; doğrulama Task 9 sonundaki `npm run check` ve Task 10 e2e ile yapılır.

- [ ] **Step 1: `image.ts`'e kırpma yardımcılarını ekle**

`src/lib/image.ts` içinde import'ları şöyle genişlet ve sonuna fonksiyonları ekle:
```ts
import {
  MAX_OUTPUT_SIDE,
  boxToRect,
  cropRect,
  iconSize,
  outputSize,
  rotatedSize,
  rotationTransform,
  type Rotation,
  type View,
} from './image-math';
import type { Box } from './types';
```
```ts
export async function bitmapFromDataUrl(dataUrl: string): Promise<ImageBitmap> {
  const blob = await (await fetch(dataUrl)).blob();
  return createImageBitmap(blob);
}

export function cropToIcon(bitmap: ImageBitmap, box: Box): string {
  const r = boxToRect(box, bitmap.width, bitmap.height);
  const { w, h } = iconSize(r.w, r.h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas kullanılamıyor.');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}
```

- [ ] **Step 2: CSS**

`src/app.css` sonuna ekle:
```css
/* ---------- ikonlar ve alan kırılımı ---------- */
.slot-icon {
  width: 40px;
  height: 40px;
  flex: none;
  object-fit: contain;
  image-rendering: pixelated;
}
.slot .slot-icon { margin-bottom: 2px; }
.slot-icon.big { width: 56px; height: 56px; }
.areas { display: grid; gap: 2px; padding: 2px 0 0 4px; }
.areas li { font-size: 1.15rem; color: var(--text); }
.areas li::before { content: '– '; color: var(--muted); }
```

- [ ] **Step 3: `BuildingCard.svelte`**

`<script>` bölümüne ekle: `const materialOf = (id: string) => store.state.materials.find((m) => m.id === id);` ve eski `nameOf`'u sil. `<ul class="slots">` bloğunu şununla değiştir:
```svelte
  <ul class="slots">
    {#each building.requirements as r (r.materialId)}
      {@const m = materialOf(r.materialId)}
      <li class="slot">
        {#if m?.icon}<img class="slot-icon" src={m.icon} alt="" />{/if}
        <span class="slot-name">{m?.name ?? '?'}</span>
        <span class="slot-count">
          ×{r.amount}{#if building.qty > 1}<small>= {r.amount * building.qty}</small>{/if}
        </span>
      </li>
    {/each}
  </ul>
```

- [ ] **Step 4: `BuildingsView.svelte`**

`<script>`'te `pending`/`done` türevlerini kaldırıp şunu koy: `import { groupByArea } from '../lib/areas';` ve `const groups = $derived(groupByArea(store.state.buildings));`. `window-body` içindeki liste kısmını (boş durum mesajından sonrasını) şununla değiştir:
```svelte
    {#each groups as group (group.area)}
      <h2 class="divider">{group.area}</h2>
      {#each group.buildings as building (building.id)}
        <BuildingCard {building} />
      {/each}
    {/each}
```
(Boş durum mesajı ve tarama paneli aynı kalır.)

- [ ] **Step 5: `TotalView.svelte`**

`{#each totals as t …}` içindeki `{:else}` (düzenleme dışı) dalını şununla değiştir:
```svelte
              <div class="row between">
                <div class="grow">
                  <details>
                    <summary>
                      {#if t.material.icon}<img class="slot-icon" src={t.material.icon} alt="" />{/if}
                      <span class="name name-gold">{t.material.name}</span>
                      <span class="slot big"><span class="slot-count">{t.total}</span></span>
                    </summary>
                    <ul class="sources">
                      {#each t.sources as s (s.buildingId)}
                        <li class="muted">{s.area} · {s.buildingName}: {s.amount}</li>
                      {/each}
                    </ul>
                  </details>
                  <ul class="areas">
                    {#each t.byArea as a (a.area)}
                      <li>{a.area} = {a.amount}</li>
                    {/each}
                  </ul>
                </div>
                <button
                  class="icon edit"
                  aria-label="{t.material.name} adını düzenle"
                  onclick={() => startEdit(t.material.id, t.material.name)}>Düzenle</button
                >
              </div>
```
`<style>` bloğunda `details { flex: 1; min-width: 0; }` satırını `.grow { flex: 1; min-width: 0; }` ile değiştir, `summary` kuralına `.name { flex: 1; }` ekle:
```css
  .grow { flex: 1; min-width: 0; }
  summary .name { flex: 1; }
```

- [ ] **Step 6: Commit** (tip kontrolü Task 9 sonunda)

```bash
git add src/lib/image.ts src/app.css src/components/BuildingCard.svelte src/components/BuildingsView.svelte src/components/TotalView.svelte
git commit -m "feat: ikonlu malzeme yuvaları, alan grupları ve toplamda alan kırılımı" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Elle kırpma penceresi, inceleme ekranı ve tarama akışı bağlantısı

**Files:**
- Create: `src/components/IconCropper.svelte`
- Modify: `src/components/ReviewScreen.svelte`, `src/components/ScanFlow.svelte`, `src/app.css`

**Interfaces:**
- Consumes: `boxFromPoints` (Task 5), `attachIcons`, `scanToDraft` (Task 7), `bitmapFromDataUrl`, `cropToIcon` (Task 8), `listAreas` (Task 6).
- Produces: `IconCropper` props `{ image: string; box: Box | null; onapply: (box: Box) => void; oncancel: () => void }` (`role="dialog"`, `aria-label="İkonu kırp"`, düğmeler "Uygula"/"İptal", `data-testid="crop-frame"`); `ReviewScreen` yeni props `image: string | null`, `crop: ((box: Box) => string) | null`.

- [ ] **Step 1: `IconCropper.svelte`**

```svelte
<script lang="ts">
  import { boxFromPoints } from '../lib/image-math';
  import type { Box } from '../lib/types';

  let {
    image,
    box,
    onapply,
    oncancel,
  }: { image: string; box: Box | null; onapply: (box: Box) => void; oncancel: () => void } = $props();

  let current = $state<Box | null>(box);
  let frame = $state<HTMLDivElement>();
  let start: { x: number; y: number } | null = null;

  const valid = $derived(current !== null && current.w >= 0.01 && current.h >= 0.01);

  function point(e: PointerEvent) {
    const r = frame!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }
  function onpointerdown(e: PointerEvent) {
    frame!.setPointerCapture(e.pointerId);
    start = point(e);
  }
  function onpointermove(e: PointerEvent) {
    if (!start) return;
    const p = point(e);
    current = boxFromPoints(start.x, start.y, p.x, p.y);
  }
  function onpointerup() {
    start = null;
  }
</script>

<div class="overlay cropper" role="dialog" aria-modal="true" aria-label="İkonu kırp">
  <div class="overlay-inner">
    <section class="window">
      <header class="titlebar"><h2>İkonu kırp</h2></header>
      <div class="window-body">
        <p class="muted">İkonun üzerine sürükleyerek bir dikdörtgen çiz.</p>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="crop-frame"
          data-testid="crop-frame"
          bind:this={frame}
          {onpointerdown}
          {onpointermove}
          {onpointerup}
          onpointercancel={onpointerup}
        >
          <img src={image} alt="Taranan görsel" draggable="false" />
          {#if current}
            <div
              class="crop-box"
              style:left="{current.x * 100}%"
              style:top="{current.y * 100}%"
              style:width="{current.w * 100}%"
              style:height="{current.h * 100}%"
            ></div>
          {/if}
        </div>
        <div class="row between">
          <button onclick={oncancel}>İptal</button>
          <button class="primary" disabled={!valid} onclick={() => current && onapply(current)}>Uygula</button>
        </div>
      </div>
    </section>
  </div>
</div>

<style>
  .crop-frame {
    position: relative;
    touch-action: none;
    cursor: crosshair;
    line-height: 0;
    overflow: hidden;
    border: 3px solid;
    border-color: #080a12 var(--panel-line) var(--panel-line) #080a12;
    border-radius: 3px;
    background: #000;
  }
  .crop-frame img { width: 100%; height: auto; display: block; user-select: none; }
  .crop-box {
    position: absolute;
    border: 2px solid var(--gold);
    background: rgba(234, 200, 110, 0.18);
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
    pointer-events: none;
  }
</style>
```
`src/app.css` sonuna: `.cropper { z-index: 60; }`.

- [ ] **Step 2: `ReviewScreen.svelte` (tamamı)**

```svelte
<script lang="ts">
  import { listAreas } from '../lib/areas';
  import { newMaterialForRow, normalizeName, validateDraft } from '../lib/merge';
  import type {
    AppState,
    Box,
    ReviewBuilding,
    ReviewDraft,
    ReviewNewMaterial,
    ReviewRequirement,
  } from '../lib/types';
  import IconCropper from './IconCropper.svelte';

  let {
    draft = $bindable(),
    appState,
    image,
    crop,
    onconfirm,
    oncancel,
  }: {
    draft: ReviewDraft;
    appState: AppState;
    image: string | null;
    crop: ((box: Box) => string) | null;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  const error = $derived(validateDraft(draft, appState));
  const areas = $derived(listAreas(appState));

  const usedNewKeys = $derived(
    new Set(
      draft.buildings
        .filter((b) => b.include)
        .flatMap((b) => b.requirements.map((r) => r.newKey))
        .filter((k): k is string => k !== null),
    ),
  );
  const visibleNew = $derived(draft.newMaterials.filter((nm) => usedNewKeys.has(nm.key)));

  const buildingExists = (name: string) => {
    const n = normalizeName(name);
    const a = normalizeName(draft.area);
    return n !== '' && appState.buildings.some((b) => normalizeName(b.name) === n && normalizeName(b.area) === a);
  };
  const newLabel = (nm: ReviewNewMaterial) => nm.name.trim() || '(adsız yeni malzeme)';
  const rowValue = (r: ReviewRequirement) => (r.materialId ? `m:${r.materialId}` : `n:${r.newKey}`);
  const materialName = (id: string) => appState.materials.find((m) => m.id === id)?.name ?? '?';

  function setRowMaterial(r: ReviewRequirement, value: string) {
    if (value === 'new') {
      newMaterialForRow(draft, r.key);
    } else if (value.startsWith('m:')) {
      r.materialId = value.slice(2);
      r.newKey = null;
    } else {
      r.materialId = null;
      r.newKey = value.slice(2);
    }
  }
  function removeRow(b: ReviewBuilding, r: ReviewRequirement) {
    b.requirements = b.requirements.filter((x) => x.key !== r.key);
  }

  type CropTarget = { kind: 'new'; key: string } | { kind: 'fill'; materialId: string };
  let cropTarget = $state<CropTarget | null>(null);
  let cropError = $state<string | null>(null);

  const targetBox = $derived.by((): Box | null => {
    const t = cropTarget;
    if (!t) return null;
    if (t.kind === 'new') return draft.newMaterials.find((n) => n.key === t.key)?.box ?? null;
    return draft.iconFills.find((f) => f.materialId === t.materialId)?.box ?? null;
  });

  function applyCrop(box: Box) {
    const t = cropTarget;
    cropTarget = null;
    if (!t || !crop) return;
    let icon: string;
    try {
      icon = crop(box);
    } catch {
      cropError = 'Kırpma yapılamadı.';
      return;
    }
    cropError = null;
    if (t.kind === 'new') {
      const nm = draft.newMaterials.find((n) => n.key === t.key);
      if (nm) {
        nm.box = box;
        nm.icon = icon;
      }
    } else {
      const f = draft.iconFills.find((x) => x.materialId === t.materialId);
      if (f) {
        f.box = box;
        f.icon = icon;
        f.accept = true;
      }
    }
  }
</script>

<section class="window review">
  <header class="titlebar"><h2>Sonucu kontrol et</h2></header>
  <div class="window-body">
    <p class="muted">
      Küçük pikselli rakamlarda hata olabilir. Adları ve miktarları düzelt, gerekmeyen satırları çıkar.
    </p>

    <div class="panel-row">
      <div class="field">
        <label for="area">Alan</label>
        <input id="area" type="text" list="area-list" autocomplete="off" bind:value={draft.area} />
        <datalist id="area-list">
          {#each areas as a (a)}<option value={a}></option>{/each}
        </datalist>
      </div>
      {#if draft.skippedEmpty > 0}
        <p class="muted">{draft.skippedEmpty} malzemesiz yapı atlandı.</p>
      {/if}
    </div>

    {#if cropError}<p class="notice error" role="alert">{cropError}</p>{/if}

    {#if visibleNew.length > 0}
      <div class="panel-row">
        <h3 class="name-gold">Yeni malzemeler</h3>
        <p class="muted">AI ikon adı bilmez, kendi önerisini yazdı. Adı değiştirebilir veya mevcut bir malzemeyle eşleştirebilirsin.</p>
        {#each visibleNew as nm (nm.key)}
          <div class="field new-material" data-testid="review-new-material">
            <div class="row wrap">
              {#if nm.icon}<img class="slot-icon big" src={nm.icon} alt="{nm.name} ikonu" />{/if}
              <input type="text" aria-label="Yeni malzeme adı" bind:value={nm.name} disabled={nm.mapTo !== null} />
              <select
                aria-label="{newLabel(nm)} için mevcut malzeme"
                value={nm.mapTo ?? ''}
                onchange={(e) => (nm.mapTo = e.currentTarget.value || null)}
              >
                <option value="">Yeni malzeme</option>
                {#each appState.materials as m (m.id)}
                  <option value={m.id}>Eşleştir: {m.name}</option>
                {/each}
              </select>
            </div>
            {#if nm.description}<p class="muted">İkon tarifi: {nm.description}</p>{/if}
            {#if image && crop}
              <div class="row">
                <button onclick={() => (cropTarget = { kind: 'new', key: nm.key })}>Kırpmayı düzelt</button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    {#if draft.iconFills.length > 0}
      <div class="panel-row" data-testid="icon-fills">
        <h3 class="name-gold">İkon önerileri</h3>
        <p class="muted">Bu malzemelerin henüz ikonu yok. Taramadan kesilen ikonu kaydedebilirsin.</p>
        {#each draft.iconFills as f (f.materialId)}
          <div class="row wrap">
            {#if f.icon}<img class="slot-icon big" src={f.icon} alt="{materialName(f.materialId)} ikon önerisi" />{/if}
            <span class="name-gold">{materialName(f.materialId)}</span>
            <label class="check">
              <input type="checkbox" bind:checked={f.accept} disabled={!f.icon} />
              İkonu kaydet
            </label>
            {#if image && crop}
              <button onclick={() => (cropTarget = { kind: 'fill', materialId: f.materialId })}>Kırpmayı düzelt</button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    {#each draft.buildings as b (b.key)}
      <div class={['panel-row', { excluded: !b.include }]} data-testid="review-building">
        <div class="row wrap">
          <label class="check">
            <input type="checkbox" bind:checked={b.include} aria-label="Yapıyı ekle" />
          </label>
          <input type="text" aria-label="Yapı adı" bind:value={b.name} />
          {#if buildingExists(b.name)}
            <span class="badge update">Mevcut kayıt güncellenecek</span>
          {:else}
            <span class="badge new">Yeni</span>
          {/if}
        </div>
        {#if b.include}
          {#each b.requirements as r (r.key)}
            <div class="row wrap req">
              <select aria-label="Malzeme" value={rowValue(r)} onchange={(e) => setRowMaterial(r, e.currentTarget.value)}>
                <optgroup label="Mevcut malzemeler">
                  {#each appState.materials as m (m.id)}
                    <option value={`m:${m.id}`}>{m.name}</option>
                  {/each}
                </optgroup>
                {#if visibleNew.length > 0}
                  <optgroup label="Yeni malzemeler">
                    {#each visibleNew as nm (nm.key)}
                      <option value={`n:${nm.key}`}>{newLabel(nm)}</option>
                    {/each}
                  </optgroup>
                {/if}
                <option value="new">+ Yeni malzeme</option>
              </select>
              <input class="amount" type="number" min="1" step="1" aria-label="Miktar" bind:value={r.amount} />
              <button class="danger" aria-label="Satırı sil" onclick={() => removeRow(b, r)}>Sil</button>
            </div>
          {/each}
        {/if}
      </div>
    {/each}

    {#if error}<p class="notice error" role="alert">{error}</p>{/if}

    <div class="row between actions">
      <button onclick={oncancel}>İptal</button>
      <button class="primary" disabled={error !== null} onclick={onconfirm}>Listeye ekle</button>
    </div>
  </div>
</section>

{#if cropTarget && image}
  <IconCropper {image} box={targetBox} onapply={applyCrop} oncancel={() => (cropTarget = null)} />
{/if}

<style>
  .excluded { opacity: 0.55; }
  .row > input[type='text'] { flex: 1; min-width: 10ch; }
  .row > select { flex: 1; min-width: 10ch; }
  .amount { width: 6rem !important; flex: 0 0 auto; }
  .req { padding-left: 4px; }
  .actions {
    position: sticky;
    bottom: 0;
    margin: 0 -10px -10px;
    padding: 10px;
    background: var(--panel);
    border-top: 2px solid var(--panel-line);
  }
</style>
```

- [ ] **Step 3: `ScanFlow.svelte`**

- Import'ları güncelle: `import { bitmapFromDataUrl, cropToIcon, loadImage } from '../lib/image';`, `import { attachIcons, scanToDraft } from '../lib/merge';`, `import type { Box, ReviewDraft } from '../lib/types';`.
- `let bitmap = …` satırının altına ekle: `let cropBitmap = $state.raw<ImageBitmap | null>(null);`
- `onMount` cleanup'ında `bitmap?.close();` yanına `cropBitmap?.close();` ekle.
- `runScan` içindeki `if (result.buildings.length === 0) {…}` bloğunu ve `draft = scanToDraft(...)`/`step = review` satırlarını şununla değiştir:
```ts
      const snapshot = $state.snapshot(store.state);
      const next = scanToDraft(result, snapshot);
      if (next.buildings.length === 0) {
        step = { kind: 'empty' };
        return;
      }
      cropBitmap?.close();
      try {
        cropBitmap = await bitmapFromDataUrl(imageDataUrl);
      } catch {
        cropBitmap = null;
      }
      attachIcons(next, snapshot, cropFn);
      draft = next;
      step = { kind: 'review' };
```
- `runScan`'ın üstüne ekle:
```ts
  function cropFn(box: Box): string {
    if (!cropBitmap) throw new Error('Görsel yok');
    return cropToIcon(cropBitmap, box);
  }
```
- `<ReviewScreen …>` satırını şununla değiştir:
```svelte
      <ReviewScreen
        bind:draft
        appState={store.state}
        image={cropBitmap ? imageDataUrl : null}
        crop={cropBitmap ? cropFn : null}
        onconfirm={confirmDraft}
        oncancel={onclose}
      />
```
- `let draft = $state<ReviewDraft>({ buildings: [], newMaterials: [] });` başlangıcını `{ area: '', skippedEmpty: 0, buildings: [], newMaterials: [], iconFills: [] }` yap.

- [ ] **Step 4: tip kontrolü ve tüm birim testleri**

Run: `npm run check`
Expected: **0 hata, 0 uyarı**. Hata varsa (özellikle `store.state` v2 tipleri, `state.svelte.ts`, `ops.ts`) düzelt.

Run: `npx vitest run`
Expected: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: elle kırpma penceresi, alan alanı ve ikon önerileri inceleme ekranında" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Uçtan uca testler (`e2e/flow.spec.ts`)

**Files:**
- Modify: `e2e/flow.spec.ts` (tamamı)

**Interfaces:**
- Consumes: Task 8–9'daki arayüz: `article.building`, `total-row`, `review-building`, `review-new-material`, `icon-fills`, "Kırpmayı düzelt", dialog `İkonu kırp`, "Uygula", `Alan` alanı, alan başlıkları (`h2.divider`), Toplam'da `Bahçe = 16` biçimli satırlar.

- [ ] **Step 1: testleri yaz (önce başarısız görülecek: uygulama tarafı hazır, fixture değişikliği ve yeni beklentiler)**

`e2e/flow.spec.ts` dosyasının tamamını şununla değiştir:
```ts
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const SAMPLE = path.resolve('docs/samples/insa-menusu-1.png');
const BOX = { x: 0.78, y: 0.05, w: 0.07, h: 0.14 };

const req = (suggestedName: string, description: string) => (amount: number) => ({
  materialId: null,
  suggestedName,
  description,
  amount,
  box: BOX,
});
const TAHTA = req('Tahta', 'light brown plank');
const CIVI = req('Çivi', 'gold nails');
const KERESTE = req('Kereste', 'dark rough plank');
const TAS = req('Taş', 'grey stone block');

const BAHCE = {
  area: 'Bahçe',
  buildings: [
    { name: 'Basit Sandık', requirements: [TAHTA(4), CIVI(4)] },
    { name: 'Kiliseyi Geliştir I', requirements: [KERESTE(8), TAS(6)] },
    { name: 'İç Mekân Bankı I', requirements: [TAHTA(2), CIVI(6)] },
    { name: 'Günah Çıkarma Kabini I', requirements: [TAHTA(6), CIVI(8)] },
    { name: 'Kilise Sunağı I', requirements: [TAHTA(4), CIVI(6), TAS(3)] },
  ],
};
const AVLU = {
  area: 'Avlu',
  buildings: [
    { name: 'Marangoz Tezgâhı I', requirements: [TAHTA(8), CIVI(4)] },
    { name: 'Taş Ustası Tezgâhı', requirements: [TAHTA(2), CIVI(2)] },
  ],
};

let current: unknown = BAHCE;

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'POST',
};

test.beforeEach(async ({ page }) => {
  current = BAHCE;
  await page.addInitScript(() => {
    if (!localStorage.getItem('gk2c.settings')) {
      localStorage.setItem('gk2c.settings', JSON.stringify({ apiKey: 'test-key', model: 'deepseek-flash' }));
    }
  });
  await page.route('https://api.deepseek.com/chat/completions', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(current) } }] }),
    });
  });
});

async function pickSample(page: Page) {
  await page.locator('input[type=file]:not([capture])').first().setInputFiles(SAMPLE);
  await page.getByRole('button', { name: 'Devam' }).click();
}

async function scanSample(page: Page, buildings = 5) {
  await pickSample(page);
  await expect(page.getByTestId('review-building')).toHaveCount(buildings);
}

async function expectTotal(page: Page, name: string, total: number) {
  await expect(page.getByTestId('total-row').filter({ hasText: name })).toContainText(String(total));
}

const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('gk2c.state')!));

test('tara, incele, listele, adedi artır, tekrar tara, yenile', async ({ page }) => {
  await page.goto('/');

  // 1. tarama: 5 yeni yapı, 4 yeni malzeme (Çivi tek malzeme), alan Bahçe
  await scanSample(page);
  await expect(page.getByLabel('Alan', { exact: true })).toHaveValue('Bahçe');
  await expect(page.getByTestId('review-new-material')).toHaveCount(4);
  await expect(page.getByText('Yeni', { exact: true })).toHaveCount(5);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  await expect(page.locator('article.building')).toHaveCount(5);

  await page.getByRole('button', { name: 'Toplam' }).click();
  await expect(page.getByTestId('total-row')).toHaveCount(4);
  await expectTotal(page, 'Tahta', 16);
  await expectTotal(page, 'Çivi', 24);
  await expectTotal(page, 'Kereste', 8);
  await expectTotal(page, 'Taş', 9);

  // adet artır
  await page.getByRole('button', { name: 'Yapılar' }).click();
  await page.locator('article.building', { hasText: 'Basit Sandık' }).getByRole('button', { name: 'Adedi artır' }).click();
  await page.getByRole('button', { name: 'Toplam' }).click();
  await expectTotal(page, 'Tahta', 20);
  await expectTotal(page, 'Çivi', 28);

  // 2. tarama (aynı görsel, aynı alan): kopya açılmaz, adet korunur
  await page.getByRole('button', { name: 'Yapılar' }).click();
  await scanSample(page);
  await expect(page.getByText('Mevcut kayıt güncellenecek')).toHaveCount(5);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  await expect(page.locator('article.building')).toHaveCount(5);
  await page.getByRole('button', { name: 'Toplam' }).click();
  await expectTotal(page, 'Tahta', 20);
  expect((await stateOf(page)).materials).toHaveLength(4);

  // yenileme: veri kalıcı
  await page.reload();
  await expect(page.locator('article.building')).toHaveCount(5);
});

test('malzemeyi yeniden adlandırma çakışmada reddedilir, geçerli isim kalır', async ({ page }) => {
  await page.goto('/');
  await scanSample(page);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  await page.getByRole('button', { name: 'Toplam' }).click();

  await page.getByRole('button', { name: 'Tahta adını düzenle' }).click();
  await page.getByLabel('Malzeme adı').fill('ÇİVİ');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('başka bir malzemede kullanılıyor')).toBeVisible();

  await page.getByLabel('Malzeme adı').fill('Kalın Tahta');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expectTotal(page, 'Kalın Tahta', 16);
});

test('API anahtarı yokken tarama Ayarlar yönlendirmesi gösterir', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gk2c.settings', JSON.stringify({ apiKey: '', model: 'deepseek-flash' })));
  await page.goto('/');
  await pickSample(page);
  await expect(page.getByText('Ayarlardan API anahtarı gir.')).toBeVisible();
  await page.getByRole('button', { name: 'Ayarlara git' }).click();
  await expect(page.getByLabel('DeepSeek API anahtarı')).toBeVisible();
});

test('inceleme ekranında satırı yeni malzemeye çevirmek ayrı malzeme oluşturur', async ({ page }) => {
  await page.goto('/');
  await scanSample(page);
  const card = page.getByTestId('review-building').first();
  await card.getByLabel('Malzeme', { exact: true }).first().selectOption({ label: '+ Yeni malzeme' });
  await expect(page.getByRole('alert')).toContainText('boş');
  await expect(page.getByRole('button', { name: 'Listeye ekle' })).toBeDisabled();
  await page.getByLabel('Yeni malzeme adı').last().fill('Kalın Tahta');
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  expect((await stateOf(page)).materials).toHaveLength(5);
});

test('iki alan taranınca Toplam alan kırılımı gösterir, Yapılar alanlara göre gruplanır', async ({ page }) => {
  await page.goto('/');
  await scanSample(page, 5);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();

  current = AVLU;
  await scanSample(page, 2);
  await expect(page.getByLabel('Alan', { exact: true })).toHaveValue('Avlu');
  await page.getByRole('button', { name: 'Listeye ekle' }).click();

  await expect(page.getByRole('heading', { name: 'Bahçe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Avlu' })).toBeVisible();

  await page.getByRole('button', { name: 'Toplam' }).click();
  const tahta = page.getByTestId('total-row').filter({ hasText: 'Tahta' });
  await expect(tahta).toContainText('26');
  await expect(tahta).toContainText('Bahçe = 16');
  await expect(tahta).toContainText('Avlu = 10');
  const civi = page.getByTestId('total-row').filter({ hasText: 'Çivi' });
  await expect(civi).toContainText('30');
  await expect(civi).toContainText('Bahçe = 24');
  await expect(civi).toContainText('Avlu = 6');
  expect((await stateOf(page)).materials).toHaveLength(4);
});

test('aynı yapı adı iki alanda ayrı kayıt olur', async ({ page }) => {
  await page.goto('/');
  current = { area: 'Bahçe', buildings: [{ name: 'Basit Sandık', requirements: [TAHTA(4)] }] };
  await scanSample(page, 1);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  current = { area: 'Avlu', buildings: [{ name: 'Basit Sandık', requirements: [TAHTA(9)] }] };
  await scanSample(page, 1);
  await expect(page.getByText('Yeni', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  await expect(page.locator('article.building', { hasText: 'Basit Sandık' })).toHaveCount(2);
});

test('ikon önizlemesi çıkar, elle kırpma ikonu değiştirir, listede ve toplamda ikon görünür', async ({ page }) => {
  await page.goto('/');
  await scanSample(page);
  const icon = page.getByAltText('Tahta ikonu');
  await expect(icon).toBeVisible();
  const before = await icon.getAttribute('src');
  expect(before).toMatch(/^data:image\/png;base64,/);

  await page.getByRole('button', { name: 'Kırpmayı düzelt' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'İkonu kırp' });
  await expect(dialog).toBeVisible();
  const frame = dialog.getByTestId('crop-frame');
  const box = (await frame.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5, { steps: 4 });
  await page.mouse.up();
  await dialog.getByRole('button', { name: 'Uygula' }).click();
  await expect(dialog).toBeHidden();
  expect(await page.getByAltText('Tahta ikonu').getAttribute('src')).not.toBe(before);

  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  await expect(page.locator('article.building .slot-icon').first()).toBeVisible();
  await page.getByRole('button', { name: 'Toplam' }).click();
  await expect(page.getByTestId('total-row').first().locator('.slot-icon')).toBeVisible();
  const materials = (await stateOf(page)).materials as { icon?: string }[];
  expect(materials.every((m) => m.icon?.startsWith('data:image/png;base64,'))).toBe(true);
});

test('bozuk kutu ikonsuz devam ettirir; tarama çalışır', async ({ page }) => {
  await page.goto('/');
  current = {
    area: 'Bahçe',
    buildings: [
      {
        name: 'A',
        requirements: [{ materialId: null, suggestedName: 'Tahta', description: 'p', amount: 2, box: { x: 'a', y: -1, w: 0, h: 9 } }],
      },
    ],
  };
  await scanSample(page, 1);
  await expect(page.getByAltText('Tahta ikonu')).toHaveCount(0);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  await expect(page.locator('article.building')).toHaveCount(1);
});

test('tüm yapılar malzemesizse "Yapı bulunamadı" gösterilir', async ({ page }) => {
  await page.goto('/');
  current = { area: 'Bahçe', buildings: [{ name: 'Bahçe Tarhı', requirements: [] }] };
  await pickSample(page);
  await expect(page.getByText('Yapı bulunamadı, daha net çek.')).toBeVisible();
  await expect(page.getByTestId('review-building')).toHaveCount(0);
});

test('malzemesiz yapı atlanır ve not gösterilir', async ({ page }) => {
  await page.goto('/');
  current = {
    area: 'Bahçe',
    buildings: [{ name: 'Bahçe Tarhı', requirements: [] }, { name: 'Basit Sandık', requirements: [TAHTA(4)] }],
  };
  await scanSample(page, 1);
  await expect(page.getByText('1 malzemesiz yapı atlandı.')).toBeVisible();
});

test('alan okunamazsa onay kapalı, doldurunca açılır', async ({ page }) => {
  await page.goto('/');
  current = { area: null, buildings: [{ name: 'Basit Sandık', requirements: [TAHTA(4)] }] };
  await scanSample(page, 1);
  await expect(page.getByRole('button', { name: 'Listeye ekle' })).toBeDisabled();
  await page.getByLabel('Alan', { exact: true }).fill('Avlu');
  await expect(page.getByRole('button', { name: 'Listeye ekle' })).toBeEnabled();
});

test('v1 verisi Genel alanına taşınır; ikonsuz malzeme için ikon önerisi kabul edilir', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('gk2c.state')) {
      localStorage.setItem(
        'gk2c.state',
        JSON.stringify({
          version: 1,
          materials: [{ id: 'm1', name: 'Tahta', description: 'plank' }],
          buildings: [{ id: 'b1', name: 'Eski Yapı', qty: 1, built: false, requirements: [{ materialId: 'm1', amount: 3 }] }],
        }),
      );
    }
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Genel' })).toBeVisible();
  await expect(page.locator('article.building', { hasText: 'Eski Yapı' })).toHaveCount(1);

  current = { area: 'Bahçe', buildings: [{ name: 'Basit Sandık', requirements: [TAHTA(4)] }] };
  await scanSample(page, 1);
  const fills = page.getByTestId('icon-fills');
  await expect(fills).toBeVisible();
  await expect(fills.getByRole('checkbox')).toBeChecked();
  await page.getByRole('button', { name: 'Listeye ekle' }).click();

  const state = await stateOf(page);
  expect(state.version).toBe(2);
  expect(state.materials).toHaveLength(1);
  expect(state.materials[0].icon).toMatch(/^data:image\/png;base64,/);
  expect(state.buildings.find((b: { name: string }) => b.name === 'Eski Yapı').area).toBe('Genel');
  expect(state.buildings.find((b: { name: string }) => b.name === 'Basit Sandık').area).toBe('Bahçe');
});

test('geçersiz ikonlu kayıt bozuk sayılır ve uygulama açılır', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'gk2c.state',
      JSON.stringify({ version: 2, materials: [{ id: 'm1', name: 'T', description: '', icon: 'javascript:alert(1)' }], buildings: [] }),
    );
  });
  await page.goto('/');
  await expect(page.getByText('Kayıtlı veri okunamadı')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'GK2 Companion' })).toBeVisible();
});
```

- [ ] **Step 2: testleri çalıştır**

Run: `npm run e2e`
Expected: her iki projede (`desktop`, `mobile`) tüm testler PASS. Hata çıkarsa **önce** uygulamayı düzelt (sözleşme Task 8–9'daki adlar/`data-testid` değerleridir); yalnızca testin yanlış varsayım yaptığı kanıtlanırsa testi düzelt ve nedenini ledger'a `Ruling:` olarak yaz. Sık nedenler: `getByText('Yeni', { exact: true })` başka bir "Yeni" ile çakışırsa `.badge.new` seçicisine geç; mobilde sabit alt sekme çubuğu tıklamayı engellerse `scrollIntoViewIfNeeded()` ekle.

- [ ] **Step 3: kırmızıyı doğrula (kanıt)**

Bir beklentiyi geçici bozarak testlerin başarısız olabildiğini gör: `e2e/flow.spec.ts`'te `'Bahçe = 16'` → `'Bahçe = 17'` yap, `npx playwright test --project=desktop -g "iki alan taranınca"` çalıştır (FAIL beklenir), sonra geri al.

- [ ] **Step 4: Commit**

```bash
git add e2e/flow.spec.ts
git commit -m "test: alan kırılımı, ikon kırpma ve v1 göçü için uçtan uca testler" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Bütünsel doğrulama ve belgeler

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README'ye özellikleri ekle**

`README.md` "Kullanım" bölümünün 4. maddesinden sonra ekle:
```markdown
   - Alan (Bahçe, Avlu vb.) pencere başlığından okunur; yanlışsa inceleme ekranında düzeltirsin.
   - Her malzemenin ikonu görselden kesilir ve saklanır; yanlışsa "Kırpmayı düzelt" ile elle kesersin. Kayıtlı ikonlar sonraki taramalarda AI'a referans olarak gönderilir.
5. Toplam sekmesinde her malzemenin alanlara göre kırılımını gör (ör. Çivi = 30: Avlu = 12, Bahçe = 18).
```
(Sonraki "Toplam sekmesinde…" maddesini birleştirip numaraları düzelt.)

- [ ] **Step 2: tüm otomatik kontroller**

Run: `npm test && npm run check && npm run build && npm run e2e`
Expected: tüm testler PASS, 0 tip hatası, build başarılı, e2e PASS (masaüstü ve mobil).

- [ ] **Step 3: görsel kontrol (ekran görüntüsü)**

Geçici bir Playwright betiğiyle (kalıcı dosya bırakma) iki alanlı taramadan sonra Yapılar ve Toplam ekranlarının masaüstü + mobil ekran görüntüsünü al ve ikon karolarının, alan başlıklarının ve `Bahçe = 16` satırlarının okunur ve taşmasız göründüğünü gözle doğrula. Sorun varsa `app.css` içinde düzelt (küçük ayar).

- [ ] **Step 4: gerçek API ile elle doğrulama notu (kullanıcı anahtarı gerekir)**

Bu adım uygulayıcı tarafından yapılamaz; final mesajında **açık madde** olarak bildirilir: `docs/samples/` içindeki Bahçe ve Avlu görselleriyle gerçek DeepSeek taraması — `area` okuma, `box` doğruluğu, referans ikonlarla eşleştirme kalitesi, istek boyutu/maliyeti. Bulgular spec §10'a not düşülür; `box` yetersizse `SYSTEM_PROMPT`'taki `box` tarifi iyileştirilir ve `prompt.test.ts` güncellenir.

- [ ] **Step 5: Commit**

```bash
git add README.md src
git commit -m "docs: alan ve ikon özelliklerini README'ye ekle" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
