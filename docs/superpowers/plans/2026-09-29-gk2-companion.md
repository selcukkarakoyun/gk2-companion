# GK2 Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Graveyard Keeper 2 inşa menüsü görselini AI ile okuyup yapıları ve gereken malzemeleri kalıcı bir listede tutan, telefonda ve masaüstünde çalışan, sunucusuz bir PWA yapmak.

**Architecture:** Statik Svelte 5 + Vite + TypeScript uygulaması. Tüm iş mantığı (toplam hesabı, birleştirme, doğrulama, görsel matematiği, AI çıktısı ayrıştırma) saf TS modüllerinde, Vitest ile test edilir. Tarayıcı doğrudan `https://api.deepseek.com/chat/completions` adresine istek atar. Durum ve API anahtarı `localStorage`'da durur. Arayüz bu modüllerin üstünde ince bir Svelte katmanıdır.

**Tech Stack:** Svelte 5 (runes), Vite 8, TypeScript, Vitest 5, vite-plugin-pwa, @vite-pwa/assets-generator, Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-09-29-gk2-companion-design.md`

## Global Constraints

- Arayüz dili Türkçe; kod, tip ve dosya adları İngilizce.
- Masaüstünde içerik `max-width: 800px`, ortalı; mobilde tek sütun, altta sekme çubuğu.
- Model varsayılanı `deepseek-flash`; uç nokta `https://api.deepseek.com/chat/completions`; görsel yalnızca `user` mesajında, base64 `data:image/jpeg` URL olarak gönderilir.
- Görsel AI'a gitmeden önce uzun kenarı en fazla 1600px, JPEG kalite 0.85.
- Sadece **gereken** miktar (`sahip/gereken` içindeki ikinci sayı) alınır; sahip olunan sayı ve haç bonusu saklanmaz.
- `qty` >= 1 tamsayı, `amount` >= 1 tamsayı.
- API anahtarı yalnızca `localStorage`'da; dışa aktarma dosyasına asla girmez; loglanmaz; üçüncü taraf script yüklenmez.
- Görseller hiçbir yerde saklanmaz.
- Uygulama adı "GK2 Companion", `lang="tr"`.
- Commit mesajları `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` satırıyla biter.

## Review Focus

Spec'in ima ettiği ama açıkça söylemediği, kullanıcıyı en çok yakacak durumlar. Her satırın testi sahibi olan task'ta:

1. **İlk taramada aynı yeni malzeme birçok yapıda geçer** (Çivi 4 yapıda). Tek malzeme oluşmalı, 4 kopya değil. → Task 3 (`scanToDraft`, `applyDraft`), Task 14 (e2e: `materials.length === 4`).
2. **Aynı görseli tekrar taramak** (AI bu sefer id vermez, sadece isim önerir; `İ/ı` büyük-küçük harf farkları). Yeni yapı/malzeme açılmamalı, `qty` ve `built` korunmalı. → Task 3, Task 14.
3. **AI çıktısı bozuk/gevşek:** kod çitli JSON, çevresinde düz yazı, miktar `"4"` string'i, miktar 0/negatif/kesirli, `description` eksik, boş yapı adı, uydurma `materialId`. → Task 5, Task 3.
4. **Malzemeyi yeniden adlandırma çakışması:** boş isim veya başka malzemenin adı (harf farkı dahil). Reddedilmeli, mevcut isim korunmalı. → Task 4.
5. **Bozuk `localStorage` / bozuk içe aktarma dosyası:** uygulama çökmemeli, ham veri yedeklenmeli, geçersiz dosya mevcut listeyi silmemeli; dışa aktarma API anahtarı içermemeli. → Task 6.

---

## File Structure

```
index.html
package.json, tsconfig.json, svelte.config.js, vite.config.ts, playwright.config.ts
pwa-assets.config.ts
public/icon.svg                      # PWA kaynak ikonu (png'ler `npm run icons` ile üretilir)
e2e/flow.spec.ts
src/
  main.ts, app.css, vite-env.d.ts, App.svelte
  lib/
    types.ts            # tüm ortak tipler
    test-helpers.ts     # test yardımcıları (mat, bld, st, idGen)
    aggregate.ts        # toplam malzeme hesabı
    merge.ts            # normalizeName, scanToDraft, validateDraft, applyDraft
    ops.ts              # setQty, toggleBuilt, deleteBuilding, renameMaterial
    storage.ts          # KV, validateState, load/save, export/import, settings
    image-math.ts       # saf görsel matematiği (döndürme/kadraj/zoom)
    image.ts            # DOM: loadImage, drawCrop, renderToDataUrl
    state.svelte.ts     # reaktif AppStore
    ai/
      provider.ts       # ScanProvider, ScanError
      parse.ts          # AI cevabını ayrıştırma/doğrulama (spec'teki validate.ts)
      prompt.ts         # sistem istemi + mesaj oluşturma
      deepseek.ts       # DeepSeek uygulaması
  components/
    Tabs.svelte, ScanButton.svelte, BuildingsView.svelte, BuildingCard.svelte,
    TotalView.svelte, SettingsView.svelte, ImageEditor.svelte,
    ReviewScreen.svelte, ScanFlow.svelte
```

Spec'e göre farklar: `image.ts` iki dosyaya bölündü (`image-math.ts` saf/test edilebilir, `image.ts` DOM); `validate.ts` `ai/parse.ts` oldu; state işlemleri `ops.ts`'e ve tarama akışının orkestrasyonu `ScanFlow.svelte`'e çıkarıldı. Davranış spec'tekiyle aynı.

---

### Task 1: Proje iskeleti ve araç zinciri

**Files:**
- Create: `package.json`, `tsconfig.json`, `svelte.config.js`, `vite.config.ts`, `index.html`, `.gitignore`
- Create: `src/main.ts`, `src/vite-env.d.ts`, `src/App.svelte`, `src/app.css`

**Interfaces:**
- Produces: `npm run dev|build|check|test` komutları; `src/app.css` global sınıflarının ilk hali (Task 10'da genişler).

- [ ] **Step 1: git ve paketleri kur**

Run (proje kökü `/home/neo/Documents/Claude Projects/GK2 Companion`):
```bash
git init
npm init -y
npm install -D vite@^8 svelte@^5 @sveltejs/vite-plugin-svelte@^7 typescript@^5 svelte-check vitest@^5 vite-plugin-pwa @vite-pwa/assets-generator @playwright/test
```
Expected: kurulum hatasız biter. Peer bağımlılık uyarısı çıkarsa `npm ls` ile çakışmayı çöz (vite 8 + plugin-svelte 7 + vitest 5 uyumlu olmalı).

- [ ] **Step 2: `package.json`'ı düzenle**

`npm init` çıktısında `"main"` satırını sil, `"type": "module"` ekle, `scripts` bölümünü şununla değiştir:
```json
{
  "name": "gk2-companion",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-check --tsconfig ./tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "icons": "pwa-assets-generator"
  }
}
```
(`devDependencies` npm tarafından yazılmış haliyle kalır.)

- [ ] **Step 3: yapılandırma dosyalarını yaz**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.svelte", "vite.config.ts"]
}
```

`svelte.config.js`:
```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
};
```

`vite.config.ts` (PWA Task 13'te eklenir):
```ts
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [svelte()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

`index.html`:
```html
<!doctype html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#14110f" />
    <title>GK2 Companion</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`.gitignore`:
```
node_modules
dist
dev-dist
test-results
playwright-report
.DS_Store
```

`src/vite-env.d.ts`:
```ts
/// <reference types="svelte" />
/// <reference types="vite/client" />
```

`src/main.ts`:
```ts
import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
```

`src/App.svelte` (geçici):
```svelte
<h1>GK2 Companion</h1>
```

`src/app.css` (geçici):
```css
:root {
  color-scheme: dark;
}
body {
  margin: 0;
  background: #14110f;
  color: #e8dfd0;
  font-family: system-ui, sans-serif;
}
```

- [ ] **Step 4: araç zincirini doğrula**

Run: `npm run check && npm run build`
Expected: `svelte-check found 0 errors`, build `dist/` üretir.

Run: `npm test`
Expected: "No test files found" hatası **normal** (henüz test yok). Vitest 5 bunu hata sayarsa `vitest run --passWithNoTests` ile bir kez çalıştırıp çıkışın 0 olduğunu gör; script'i değiştirme.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: Svelte 5 + Vite + Vitest iskeleti" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tipler ve toplam hesabı (`aggregate`)

**Files:**
- Create: `src/lib/types.ts`, `src/lib/test-helpers.ts`, `src/lib/aggregate.ts`
- Test: `src/lib/aggregate.test.ts`

**Interfaces:**
- Produces (`types.ts`, tüm sonraki task'lar bunları kullanır):
```ts
export type Material = { id: string; name: string; description: string };
export type Requirement = { materialId: string; amount: number };
export type Building = { id: string; name: string; qty: number; built: boolean; requirements: Requirement[] };
export type AppState = { version: 1; materials: Material[]; buildings: Building[] };
export type Settings = { apiKey: string; model: string };
export type Tab = 'buildings' | 'total' | 'settings';

export type ScannedRequirement = { materialId: string | null; suggestedName: string | null; description: string | null; amount: number };
export type ScannedBuilding = { name: string; requirements: ScannedRequirement[] };
export type ScanResult = { buildings: ScannedBuilding[] };

export type ReviewNewMaterial = { key: string; name: string; description: string; mapTo: string | null };
export type ReviewRequirement = { key: string; materialId: string | null; newKey: string | null; amount: number };
export type ReviewBuilding = { key: string; name: string; include: boolean; requirements: ReviewRequirement[] };
export type ReviewDraft = { buildings: ReviewBuilding[]; newMaterials: ReviewNewMaterial[] };
```
- Produces (`test-helpers.ts`): `mat(id, name, description?)`, `bld(id, name, reqs: [materialId, amount][], extra?)`, `st(materials?, buildings?)`, `idGen(prefix?)`.
- Produces (`aggregate.ts`): `aggregate(state: AppState): MaterialTotal[]`, `type MaterialTotal = { material: Material; total: number; sources: { buildingId: string; buildingName: string; amount: number }[] }`.

- [ ] **Step 1: tipleri ve test yardımcılarını yaz**

`src/lib/types.ts`: yukarıdaki "Produces" bloğundaki tüm tipleri aynen yaz.

`src/lib/test-helpers.ts`:
```ts
import type { AppState, Building, Material } from './types';

export const mat = (id: string, name: string, description = ''): Material => ({ id, name, description });

export const bld = (
  id: string,
  name: string,
  reqs: [string, number][],
  extra: Partial<Building> = {},
): Building => ({
  id,
  name,
  qty: 1,
  built: false,
  requirements: reqs.map(([materialId, amount]) => ({ materialId, amount })),
  ...extra,
});

export const st = (materials: Material[] = [], buildings: Building[] = []): AppState => ({
  version: 1,
  materials,
  buildings,
});

export const idGen = (prefix = 'id') => {
  let n = 0;
  return () => `${prefix}${++n}`;
};
```

- [ ] **Step 2: başarısız testi yaz**

`src/lib/aggregate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { aggregate } from './aggregate';
import { bld, mat, st } from './test-helpers';

const tahta = mat('t', 'Tahta');
const civi = mat('c', 'Çivi');

describe('aggregate', () => {
  it('boş durumda boş liste döner', () => {
    expect(aggregate(st())).toEqual([]);
  });

  it('miktarı adetle çarpar', () => {
    const s = st([tahta], [bld('b1', 'Sandık', [['t', 4]], { qty: 3 })]);
    const [row] = aggregate(s);
    expect(row.total).toBe(12);
    expect(row.sources).toEqual([{ buildingId: 'b1', buildingName: 'Sandık', amount: 12 }]);
  });

  it('yapıldı işaretli yapıları saymaz', () => {
    const s = st([tahta], [
      bld('b1', 'A', [['t', 4]], { built: true }),
      bld('b2', 'B', [['t', 2]]),
    ]);
    expect(aggregate(s)[0].total).toBe(2);
  });

  it('yapılar arası toplar ve kaynakları listeler', () => {
    const s = st([tahta, civi], [
      bld('b1', 'A', [['t', 4], ['c', 4]]),
      bld('b2', 'B', [['t', 2]]),
    ]);
    const rows = aggregate(s);
    const t = rows.find((r) => r.material.id === 't')!;
    expect(t.total).toBe(6);
    expect(t.sources.map((x) => x.buildingId)).toEqual(['b1', 'b2']);
  });

  it('tanımsız malzemeyi atlar', () => {
    const s = st([tahta], [bld('b1', 'A', [['yok', 4], ['t', 1]])]);
    expect(aggregate(s).map((r) => r.material.id)).toEqual(['t']);
  });

  it('toplamı büyükten küçüğe, eşitlikte Türkçe alfabetik sıralar', () => {
    const s = st(
      [mat('a', 'Çivi'), mat('b', 'Taş'), mat('c', 'Tahta')],
      [bld('b1', 'A', [['a', 5], ['b', 5], ['c', 9]])],
    );
    expect(aggregate(s).map((r) => r.material.name)).toEqual(['Tahta', 'Çivi', 'Taş']);
  });

  it('tamamı yapılmış listede boş döner', () => {
    const s = st([tahta], [bld('b1', 'A', [['t', 4]], { built: true })]);
    expect(aggregate(s)).toEqual([]);
  });
});
```

- [ ] **Step 3: testin başarısız olduğunu gör**

Run: `npx vitest run src/lib/aggregate.test.ts`
Expected: FAIL, `Cannot find module './aggregate'`.

- [ ] **Step 4: uygula**

`src/lib/aggregate.ts`:
```ts
import type { AppState, Material } from './types';

export type MaterialTotal = {
  material: Material;
  total: number;
  sources: { buildingId: string; buildingName: string; amount: number }[];
};

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
        t = { material, total: 0, sources: [] };
        totals.set(material.id, t);
      }
      t.total += amount;
      t.sources.push({ buildingId: b.id, buildingName: b.name, amount });
    }
  }

  return [...totals.values()].sort(
    (a, b) => b.total - a.total || a.material.name.localeCompare(b.material.name, 'tr'),
  );
}
```

- [ ] **Step 5: testin geçtiğini gör**

Run: `npx vitest run src/lib/aggregate.test.ts`
Expected: 7 test PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib
git commit -m "feat: tipler ve toplam malzeme hesabı" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Birleştirme (`merge.ts`)

**Files:**
- Create: `src/lib/merge.ts`
- Test: `src/lib/merge.test.ts`

**Interfaces:**
- Consumes: `types.ts`, `test-helpers.ts`.
- Produces:
```ts
export function normalizeName(s: string): string;
export function scanToDraft(scan: ScanResult, state: AppState): ReviewDraft;
export function validateDraft(draft: ReviewDraft, state: AppState): string | null; // Türkçe hata mesajı veya null
export function applyDraft(state: AppState, draft: ReviewDraft, newId: () => string): AppState; // saf, girdiyi değiştirmez
```

- [ ] **Step 1: başarısız testleri yaz**

`src/lib/merge.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyDraft, normalizeName, scanToDraft, validateDraft } from './merge';
import { bld, idGen, mat, st } from './test-helpers';
import type { ReviewDraft, ScanResult } from './types';

const scan = (buildings: ScanResult['buildings']): ScanResult => ({ buildings });
const nr = (suggestedName: string, amount: number, description = 'desc') => ({
  materialId: null,
  suggestedName,
  description,
  amount,
});
const kr = (materialId: string, amount: number) => ({
  materialId,
  suggestedName: null,
  description: null,
  amount,
});

describe('normalizeName', () => {
  it('boşlukları ve Türkçe büyük/küçük harfi eşitler', () => {
    expect(normalizeName('İç Mekân Bankı I')).toBe(normalizeName('  iç   MEKÂN bankı ı '));
    expect(normalizeName('ÇİVİ')).toBe('çivi');
  });
});

describe('scanToDraft', () => {
  it('bilinen id ile eşleşen satırı mevcut malzemeye bağlar', () => {
    const d = scanToDraft(scan([{ name: 'A', requirements: [kr('m1', 2)] }]), st([mat('m1', 'Tahta')]));
    expect(d.newMaterials).toEqual([]);
    expect(d.buildings[0].requirements[0]).toMatchObject({ materialId: 'm1', newKey: null, amount: 2 });
  });

  it('aynı önerilen isim birçok yapıda tek yeni malzeme olur', () => {
    const d = scanToDraft(
      scan([
        { name: 'A', requirements: [nr('Çivi', 4)] },
        { name: 'B', requirements: [nr('çivi', 6)] },
        { name: 'C', requirements: [nr('ÇİVİ', 8)] },
      ]),
      st(),
    );
    expect(d.newMaterials).toHaveLength(1);
    const keys = d.buildings.flatMap((b) => b.requirements.map((r) => r.newKey));
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe(d.newMaterials[0].key);
  });

  it('farklı isimler ayrı yeni malzeme olur', () => {
    const d = scanToDraft(scan([{ name: 'A', requirements: [nr('Tahta', 1), nr('Kereste', 2)] }]), st());
    expect(d.newMaterials.map((m) => m.name)).toEqual(['Tahta', 'Kereste']);
  });

  it('uydurma id yeni malzeme sayılır; adı yoksa boş bırakılır ve ayrı tutulur', () => {
    const ghost = { materialId: 'ghost', suggestedName: null, description: null, amount: 1 };
    const d = scanToDraft(scan([{ name: 'A', requirements: [ghost, { ...ghost, materialId: 'ghost2' }] }]), st());
    expect(d.newMaterials).toHaveLength(2);
    expect(d.newMaterials.every((m) => m.name === '')).toBe(true);
    expect(d.buildings[0].requirements.every((r) => r.materialId === null)).toBe(true);
  });

  it('önerilen isim mevcut bir malzemeyle aynıysa otomatik eşleştirir', () => {
    const d = scanToDraft(scan([{ name: 'A', requirements: [nr('tahta', 1)] }]), st([mat('m1', 'Tahta')]));
    expect(d.newMaterials[0].mapTo).toBe('m1');
  });
});

const draftOf = (over: Partial<ReviewDraft> & { buildings: ReviewDraft['buildings'] }): ReviewDraft => ({
  newMaterials: [],
  ...over,
});
const row = (o: Partial<ReviewDraft['buildings'][0]['requirements'][0]> = {}) => ({
  key: 'r',
  materialId: 'm1' as string | null,
  newKey: null as string | null,
  amount: 1,
  ...o,
});
const b = (o: Partial<ReviewDraft['buildings'][0]> = {}) => ({
  key: 'b',
  name: 'A',
  include: true,
  requirements: [row()],
  ...o,
});
const base = st([mat('m1', 'Tahta')]);

describe('validateDraft', () => {
  it('geçerli taslak için null döner', () => {
    expect(validateDraft(draftOf({ buildings: [b()] }), base)).toBeNull();
  });
  it('hiç yapı seçilmemişse hata verir', () => {
    expect(validateDraft(draftOf({ buildings: [b({ include: false })] }), base)).not.toBeNull();
    expect(validateDraft(draftOf({ buildings: [] }), base)).not.toBeNull();
  });
  it('boş yapı adını reddeder', () => {
    expect(validateDraft(draftOf({ buildings: [b({ name: '  ' })] }), base)).toMatch(/Adı boş/);
  });
  it('malzemesiz yapıyı reddeder', () => {
    expect(validateDraft(draftOf({ buildings: [b({ requirements: [] })] }), base)).toMatch(/malzeme yok/);
  });
  it.each([0, -1, 1.5, Number.NaN])('geçersiz miktarı reddeder (%s)', (amount) => {
    expect(validateDraft(draftOf({ buildings: [b({ requirements: [row({ amount })] })] }), base)).toMatch(/miktar/);
  });
  it('tanımsız mevcut malzeme id\'sini reddeder', () => {
    const d = draftOf({ buildings: [b({ requirements: [row({ materialId: 'yok' })] })] });
    expect(validateDraft(d, base)).not.toBeNull();
  });
  it('seçilmemiş malzeme satırını reddeder', () => {
    const d = draftOf({ buildings: [b({ requirements: [row({ materialId: null, newKey: null })] })] });
    expect(validateDraft(d, base)).not.toBeNull();
  });
  it('boş adlı yeni malzemeyi reddeder, eşlenmişse kabul eder', () => {
    const rows = [row({ materialId: null, newKey: 'n1' })];
    const nm = { key: 'n1', name: '', description: '', mapTo: null as string | null };
    expect(validateDraft(draftOf({ buildings: [b({ requirements: rows })], newMaterials: [nm] }), base)).toMatch(/boş/);
    expect(validateDraft(draftOf({ buildings: [b({ requirements: rows })], newMaterials: [{ ...nm, mapTo: 'm1' }] }), base)).toBeNull();
  });
  it('yeni malzeme adı mevcut malzemeyle çakışırsa reddeder', () => {
    const rows = [row({ materialId: null, newKey: 'n1' })];
    const nm = { key: 'n1', name: 'TAHTA', description: '', mapTo: null };
    expect(validateDraft(draftOf({ buildings: [b({ requirements: rows })], newMaterials: [nm] }), base)).toMatch(/zaten var/);
  });
  it('iki yeni malzeme aynı adı taşırsa reddeder', () => {
    const rows = [row({ key: 'r1', materialId: null, newKey: 'n1' }), row({ key: 'r2', materialId: null, newKey: 'n2' })];
    const nms = [
      { key: 'n1', name: 'Çivi', description: '', mapTo: null },
      { key: 'n2', name: 'çivi', description: '', mapTo: null },
    ];
    expect(validateDraft(draftOf({ buildings: [b({ requirements: rows })], newMaterials: nms }), base)).toMatch(/iki kez/);
  });
  it('hariç tutulan yapının hatalarını yok sayar', () => {
    const bad = b({ key: 'x', include: false, name: '', requirements: [] });
    expect(validateDraft(draftOf({ buildings: [b(), bad] }), base)).toBeNull();
  });
});

describe('applyDraft', () => {
  it('Çivi 4 yapıda geçse de tek malzeme oluşturur', () => {
    const s0 = st();
    const sc = scan(
      ['A', 'B', 'C', 'D'].map((name, i) => ({ name, requirements: [nr('Çivi', i + 1)] })),
    );
    const s1 = applyDraft(s0, scanToDraft(sc, s0), idGen());
    expect(s1.materials).toHaveLength(1);
    expect(s1.materials[0]).toMatchObject({ name: 'Çivi', description: 'desc' });
    expect(s1.buildings).toHaveLength(4);
    expect(new Set(s1.buildings.flatMap((x) => x.requirements.map((r) => r.materialId))).size).toBe(1);
    expect(s1.buildings.every((x) => x.qty === 1 && x.built === false)).toBe(true);
  });

  it('aynı yapıyı tekrar taramak kayıt açmaz; qty ve built korunur, gereksinimler değişir', () => {
    const s1 = applyDraft(st(), scanToDraft(scan([{ name: 'A', requirements: [nr('Çivi', 4)] }]), st()), idGen());
    const civi = s1.materials[0].id;
    const edited = { ...s1, buildings: s1.buildings.map((x) => ({ ...x, qty: 3, built: true })) };
    const s2 = applyDraft(edited, scanToDraft(scan([{ name: ' a ', requirements: [kr(civi, 9)] }]), edited), idGen('z'));
    expect(s2.buildings).toHaveLength(1);
    expect(s2.buildings[0]).toMatchObject({ name: 'A', qty: 3, built: true, requirements: [{ materialId: civi, amount: 9 }] });
    expect(s2.materials).toHaveLength(1);
  });

  it('id vermeyen AI ile yeniden taramada isimle eşleştirir, kopya malzeme açmaz', () => {
    const s1 = applyDraft(st(), scanToDraft(scan([{ name: 'İç Mekân Bankı I', requirements: [nr('Çivi', 6)] }]), st()), idGen());
    const s2 = applyDraft(s1, scanToDraft(scan([{ name: 'İÇ MEKÂN BANKI I', requirements: [nr('çivi', 6)] }]), s1), idGen('z'));
    expect(s2.materials).toHaveLength(1);
    expect(s2.buildings).toHaveLength(1);
  });

  it('mapTo ile mevcut malzemeyi kullanır', () => {
    const s0 = st([mat('m1', 'Tahta')]);
    const d = scanToDraft(scan([{ name: 'A', requirements: [nr('Kereste', 2)] }]), s0);
    d.newMaterials[0].mapTo = 'm1';
    const s1 = applyDraft(s0, d, idGen());
    expect(s1.materials).toHaveLength(1);
    expect(s1.buildings[0].requirements).toEqual([{ materialId: 'm1', amount: 2 }]);
  });

  it('hariç tutulan yapıyı ve yalnızca onun kullandığı yeni malzemeyi eklemez', () => {
    const s0 = st();
    const d = scanToDraft(scan([{ name: 'A', requirements: [nr('Çivi', 1)] }, { name: 'B', requirements: [nr('Taş', 1)] }]), s0);
    d.buildings[1].include = false;
    const s1 = applyDraft(s0, d, idGen());
    expect(s1.buildings.map((x) => x.name)).toEqual(['A']);
    expect(s1.materials.map((m) => m.name)).toEqual(['Çivi']);
  });

  it('aynı malzemeye giden satırları toplar', () => {
    const s0 = st([mat('m1', 'Tahta')]);
    const d = scanToDraft(scan([{ name: 'A', requirements: [kr('m1', 2), kr('m1', 3)] }]), s0);
    const s1 = applyDraft(s0, d, idGen());
    expect(s1.buildings[0].requirements).toEqual([{ materialId: 'm1', amount: 5 }]);
  });

  it('girdi durumunu değiştirmez', () => {
    const s0 = st([mat('m1', 'Tahta')], [bld('b1', 'A', [['m1', 1]])]);
    const copy = JSON.parse(JSON.stringify(s0));
    applyDraft(s0, scanToDraft(scan([{ name: 'A', requirements: [kr('m1', 9)] }, { name: 'B', requirements: [nr('Taş', 1)] }]), s0), idGen());
    expect(s0).toEqual(copy);
  });
});
```

- [ ] **Step 2: testin başarısız olduğunu gör**

Run: `npx vitest run src/lib/merge.test.ts`
Expected: FAIL, `Cannot find module './merge'`.

- [ ] **Step 3: uygula**

`src/lib/merge.ts`:
```ts
import type {
  AppState,
  Building,
  Material,
  Requirement,
  ReviewBuilding,
  ReviewDraft,
  ReviewNewMaterial,
  ScanResult,
} from './types';

export function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');
}

export function scanToDraft(scan: ScanResult, state: AppState): ReviewDraft {
  const known = new Set(state.materials.map((m) => m.id));
  const existingByName = new Map(state.materials.map((m) => [normalizeName(m.name), m.id]));
  const newByName = new Map<string, ReviewNewMaterial>();
  const newMaterials: ReviewNewMaterial[] = [];
  let n = 0;
  const key = (prefix: string) => `${prefix}${++n}`;

  const buildings: ReviewBuilding[] = scan.buildings.map((sb) => ({
    key: key('b'),
    name: sb.name,
    include: true,
    requirements: sb.requirements.map((sr) => {
      if (sr.materialId && known.has(sr.materialId)) {
        return { key: key('r'), materialId: sr.materialId, newKey: null, amount: sr.amount };
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
        };
        newMaterials.push(nm);
        if (norm) newByName.set(norm, nm);
      }
      return { key: key('r'), materialId: null, newKey: nm.key, amount: sr.amount };
    }),
  }));

  return { buildings, newMaterials };
}

export function validateDraft(draft: ReviewDraft, state: AppState): string | null {
  const included = draft.buildings.filter((b) => b.include);
  if (included.length === 0) return 'Eklenecek yapı yok.';

  const knownIds = new Set(state.materials.map((m) => m.id));
  const usedNew = new Set<string>();
  for (const b of included) {
    const label = b.name.trim();
    if (!label) return 'Adı boş bir yapı var.';
    if (b.requirements.length === 0) return `"${label}" için malzeme yok.`;
    for (const r of b.requirements) {
      if (!Number.isInteger(r.amount) || r.amount < 1) return `"${label}" içinde geçersiz miktar var.`;
      if (r.materialId) {
        if (!knownIds.has(r.materialId)) return `"${label}" içinde tanımsız malzeme var.`;
      } else if (r.newKey) {
        usedNew.add(r.newKey);
      } else {
        return `"${label}" içinde malzemesi seçilmemiş satır var.`;
      }
    }
  }

  const existingNames = new Set(state.materials.map((m) => normalizeName(m.name)));
  const seen = new Set<string>();
  for (const nm of draft.newMaterials) {
    if (!usedNew.has(nm.key) || nm.mapTo) continue;
    const norm = normalizeName(nm.name);
    if (!norm) return 'Adı boş bir yeni malzeme var.';
    if (existingNames.has(norm)) return `"${nm.name.trim()}" zaten var, mevcut malzemeyle eşleştir.`;
    if (seen.has(norm)) return `"${nm.name.trim()}" iki kez yeni malzeme olarak eklenmiş.`;
    seen.add(norm);
  }
  return null;
}

export function applyDraft(state: AppState, draft: ReviewDraft, newId: () => string): AppState {
  const materials: Material[] = state.materials.map((m) => ({ ...m }));
  const buildings: Building[] = state.buildings.map((b) => ({
    ...b,
    requirements: b.requirements.map((r) => ({ ...r })),
  }));
  const newMaterialByKey = new Map(draft.newMaterials.map((nm) => [nm.key, nm]));
  const resolved = new Map<string, string>();

  const resolveNew = (key: string): string => {
    const hit = resolved.get(key);
    if (hit) return hit;
    const nm = newMaterialByKey.get(key);
    if (!nm) throw new Error(`Bilinmeyen yeni malzeme: ${key}`);
    let id: string;
    if (nm.mapTo) {
      id = nm.mapTo;
    } else {
      id = newId();
      materials.push({ id, name: nm.name.trim(), description: nm.description.trim() });
    }
    resolved.set(key, id);
    return id;
  };

  for (const rb of draft.buildings) {
    if (!rb.include) continue;
    const merged = new Map<string, number>();
    for (const r of rb.requirements) {
      const materialId = r.materialId ?? resolveNew(r.newKey as string);
      merged.set(materialId, (merged.get(materialId) ?? 0) + r.amount);
    }
    const requirements: Requirement[] = [...merged].map(([materialId, amount]) => ({ materialId, amount }));
    const norm = normalizeName(rb.name);
    const existing = buildings.find((b) => normalizeName(b.name) === norm);
    if (existing) {
      existing.requirements = requirements;
    } else {
      buildings.push({
        id: newId(),
        name: rb.name.trim().replace(/\s+/g, ' '),
        qty: 1,
        built: false,
        requirements,
      });
    }
  }

  return { version: 1, materials, buildings };
}
```

- [ ] **Step 4: testlerin geçtiğini gör**

Run: `npx vitest run src/lib/merge.test.ts`
Expected: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib
git commit -m "feat: tarama sonucunu duruma birleştirme" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Durum işlemleri (`ops.ts`)

**Files:**
- Create: `src/lib/ops.ts`
- Test: `src/lib/ops.test.ts`

**Interfaces:**
- Consumes: `normalizeName` (`merge.ts`), `types.ts`, `test-helpers.ts`.
- Produces:
```ts
export function setQty(state: AppState, buildingId: string, qty: number): AppState; // qty < 1 -> 1; tamsayı değilse state aynen döner
export function toggleBuilt(state: AppState, buildingId: string): AppState;
export function deleteBuilding(state: AppState, buildingId: string): AppState;
export type RenameResult = { ok: true; state: AppState } | { ok: false; error: string };
export function renameMaterial(state: AppState, materialId: string, name: string): RenameResult;
```

- [ ] **Step 1: başarısız testleri yaz**

`src/lib/ops.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { deleteBuilding, renameMaterial, setQty, toggleBuilt } from './ops';
import { bld, mat, st } from './test-helpers';

const s = st([mat('m1', 'Tahta'), mat('m2', 'Çivi')], [bld('b1', 'A', [['m1', 1]]), bld('b2', 'B', [['m2', 1]])]);

describe('setQty', () => {
  it('adedi ayarlar', () => {
    expect(setQty(s, 'b1', 3).buildings[0].qty).toBe(3);
  });
  it('1 altına düşürmez', () => {
    expect(setQty(s, 'b1', 0).buildings[0].qty).toBe(1);
    expect(setQty(s, 'b1', -4).buildings[0].qty).toBe(1);
  });
  it('tamsayı olmayan değerde durumu değiştirmez', () => {
    expect(setQty(s, 'b1', Number.NaN)).toBe(s);
    expect(setQty(s, 'b1', 2.5)).toBe(s);
  });
  it('diğer yapıya dokunmaz ve girdiyi değiştirmez', () => {
    const out = setQty(s, 'b1', 5);
    expect(out.buildings[1]).toBe(s.buildings[1]);
    expect(s.buildings[0].qty).toBe(1);
  });
});

describe('toggleBuilt / deleteBuilding', () => {
  it('yapıldı durumunu tersler', () => {
    const on = toggleBuilt(s, 'b1');
    expect(on.buildings[0].built).toBe(true);
    expect(toggleBuilt(on, 'b1').buildings[0].built).toBe(false);
  });
  it('yapıyı siler', () => {
    expect(deleteBuilding(s, 'b1').buildings.map((b) => b.id)).toEqual(['b2']);
  });
});

describe('renameMaterial', () => {
  it('yeniden adlandırır, boşlukları toparlar', () => {
    const r = renameMaterial(s, 'm1', '  Kalın   Tahta ');
    expect(r.ok && r.state.materials[0].name).toBe('Kalın Tahta');
  });
  it('boş adı reddeder', () => {
    expect(renameMaterial(s, 'm1', '   ')).toEqual({ ok: false, error: 'Ad boş olamaz.' });
  });
  it('başka malzemenin adını (harf farkıyla) reddeder', () => {
    const r = renameMaterial(s, 'm1', 'ÇİVİ');
    expect(r.ok).toBe(false);
  });
  it('kendi adına (harf farkıyla) izin verir', () => {
    const r = renameMaterial(s, 'm1', 'TAHTA');
    expect(r.ok && r.state.materials[0].name).toBe('TAHTA');
  });
});
```

- [ ] **Step 2: testin başarısız olduğunu gör**

Run: `npx vitest run src/lib/ops.test.ts`
Expected: FAIL, `Cannot find module './ops'`.

- [ ] **Step 3: uygula**

`src/lib/ops.ts`:
```ts
import { normalizeName } from './merge';
import type { AppState } from './types';

export function setQty(state: AppState, buildingId: string, qty: number): AppState {
  if (!Number.isInteger(qty)) return state;
  const next = Math.max(1, qty);
  return {
    ...state,
    buildings: state.buildings.map((b) => (b.id === buildingId ? { ...b, qty: next } : b)),
  };
}

export function toggleBuilt(state: AppState, buildingId: string): AppState {
  return {
    ...state,
    buildings: state.buildings.map((b) => (b.id === buildingId ? { ...b, built: !b.built } : b)),
  };
}

export function deleteBuilding(state: AppState, buildingId: string): AppState {
  return { ...state, buildings: state.buildings.filter((b) => b.id !== buildingId) };
}

export type RenameResult = { ok: true; state: AppState } | { ok: false; error: string };

export function renameMaterial(state: AppState, materialId: string, name: string): RenameResult {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return { ok: false, error: 'Ad boş olamaz.' };
  const norm = normalizeName(trimmed);
  if (state.materials.some((m) => m.id !== materialId && normalizeName(m.name) === norm)) {
    return { ok: false, error: `"${trimmed}" adı başka bir malzemede kullanılıyor.` };
  }
  return {
    ok: true,
    state: {
      ...state,
      materials: state.materials.map((m) => (m.id === materialId ? { ...m, name: trimmed } : m)),
    },
  };
}
```

- [ ] **Step 4: testlerin geçtiğini gör**

Run: `npx vitest run src/lib/ops.test.ts`
Expected: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib
git commit -m "feat: adet, yapıldı, silme ve malzeme yeniden adlandırma işlemleri" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: AI cevabı ayrıştırma (`ai/parse.ts`)

**Files:**
- Create: `src/lib/ai/parse.ts`
- Test: `src/lib/ai/parse.test.ts`

**Interfaces:**
- Consumes: `ScanResult` (`types.ts`).
- Produces:
```ts
export class ScanFormatError extends Error {}
export function parseScanResponse(text: string): ScanResult; // ScanFormatError fırlatır
```

- [ ] **Step 1: başarısız testleri yaz**

`src/lib/ai/parse.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ScanFormatError, parseScanResponse } from './parse';

const good = {
  buildings: [
    {
      name: 'İç Mekân Bankı I',
      requirements: [
        { materialId: 'm_abc', suggestedName: null, description: null, amount: 2 },
        { materialId: null, suggestedName: 'Çivi', description: 'gold nails', amount: 6 },
      ],
    },
  ],
};

describe('parseScanResponse', () => {
  it('geçerli JSON\'u ayrıştırır', () => {
    expect(parseScanResponse(JSON.stringify(good))).toEqual(good);
  });

  it('kod çitli JSON\'u ayrıştırır', () => {
    expect(parseScanResponse('```json\n' + JSON.stringify(good) + '\n```')).toEqual(good);
  });

  it('çevresinde düz yazı olan JSON\'u ayrıştırır', () => {
    expect(parseScanResponse('İşte sonuç: ' + JSON.stringify(good) + ' umarım yardımcı olur')).toEqual(good);
  });

  it('boş yapı listesini kabul eder', () => {
    expect(parseScanResponse('{"buildings":[]}')).toEqual({ buildings: [] });
  });

  it('string miktarı sayıya çevirir', () => {
    const r = parseScanResponse('{"buildings":[{"name":"A","requirements":[{"materialId":"m","amount":"4"}]}]}');
    expect(r.buildings[0].requirements[0].amount).toBe(4);
  });

  it('eksik description/suggestedName alanlarını null yapar ve metinleri kırpar', () => {
    const r = parseScanResponse(
      '{"buildings":[{"name":"  A  ","requirements":[{"materialId":null,"suggestedName":" Taş ","amount":3}]}]}',
    );
    expect(r.buildings[0].name).toBe('A');
    expect(r.buildings[0].requirements[0]).toEqual({
      materialId: null,
      suggestedName: 'Taş',
      description: null,
      amount: 3,
    });
  });

  it('"null" metnini null sayar', () => {
    const r = parseScanResponse(
      '{"buildings":[{"name":"A","requirements":[{"materialId":"null","suggestedName":"Taş","description":"x","amount":1}]}]}',
    );
    expect(r.buildings[0].requirements[0].materialId).toBeNull();
  });

  it.each([0, -2, 1.5, '0', 'dört', null])('geçersiz miktarı reddeder (%s)', (amount) => {
    const text = JSON.stringify({ buildings: [{ name: 'A', requirements: [{ materialId: 'm', amount }] }] });
    expect(() => parseScanResponse(text)).toThrow(ScanFormatError);
  });

  it('id ve isim ikisi de yoksa reddeder', () => {
    const text = JSON.stringify({ buildings: [{ name: 'A', requirements: [{ materialId: null, amount: 1 }] }] });
    expect(() => parseScanResponse(text)).toThrow(ScanFormatError);
  });

  it('boş yapı adını reddeder', () => {
    const text = JSON.stringify({ buildings: [{ name: ' ', requirements: [] }] });
    expect(() => parseScanResponse(text)).toThrow(ScanFormatError);
  });

  it.each(['', 'sadece yazı', '{bozuk', '{"buildings": "yok"}', '[]', '{"x":1}'])('geçersiz cevabı reddeder (%s)', (text) => {
    expect(() => parseScanResponse(text)).toThrow(ScanFormatError);
  });
});
```

- [ ] **Step 2: testin başarısız olduğunu gör**

Run: `npx vitest run src/lib/ai/parse.test.ts`
Expected: FAIL, `Cannot find module './parse'`.

- [ ] **Step 3: uygula**

`src/lib/ai/parse.ts`:
```ts
import type { ScanResult, ScannedBuilding, ScannedRequirement } from '../types';

export class ScanFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScanFormatError';
  }
}

function extractJson(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) throw new ScanFormatError('JSON bulunamadı.');
  return t.slice(start, end + 1);
}

function optString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.toLowerCase() === 'null' || t.toLowerCase() === 'undefined') return null;
  return t;
}

function toAmount(v: unknown): number {
  const n = typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
    throw new ScanFormatError(`Geçersiz miktar: ${JSON.stringify(v)}`);
  }
  return n;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function parseRequirement(raw: unknown): ScannedRequirement {
  if (!isObj(raw)) throw new ScanFormatError('Malzeme satırı nesne değil.');
  const materialId = optString(raw.materialId);
  const suggestedName = optString(raw.suggestedName);
  if (!materialId && !suggestedName) throw new ScanFormatError('Malzeme id\'si veya adı yok.');
  return { materialId, suggestedName, description: optString(raw.description), amount: toAmount(raw.amount) };
}

function parseBuilding(raw: unknown): ScannedBuilding {
  if (!isObj(raw)) throw new ScanFormatError('Yapı nesne değil.');
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) throw new ScanFormatError('Yapı adı boş.');
  if (!Array.isArray(raw.requirements)) throw new ScanFormatError('"requirements" dizisi yok.');
  return { name, requirements: raw.requirements.map(parseRequirement) };
}

export function parseScanResponse(text: string): ScanResult {
  let raw: unknown;
  try {
    raw = JSON.parse(extractJson(text));
  } catch (e) {
    if (e instanceof ScanFormatError) throw e;
    throw new ScanFormatError('JSON ayrıştırılamadı.');
  }
  if (!isObj(raw) || !Array.isArray(raw.buildings)) throw new ScanFormatError('"buildings" dizisi yok.');
  return { buildings: raw.buildings.map(parseBuilding) };
}
```

- [ ] **Step 4: testlerin geçtiğini gör**

Run: `npx vitest run src/lib/ai/parse.test.ts`
Expected: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib
git commit -m "feat: AI cevabını ayrıştırma ve doğrulama" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Saklama (`storage.ts`)

**Files:**
- Create: `src/lib/storage.ts`
- Test: `src/lib/storage.test.ts`

**Interfaces:**
- Consumes: `AppState`, `Settings` (`types.ts`).
- Produces:
```ts
export const STATE_KEY = 'gk2c.state';
export const STATE_BACKUP_KEY = 'gk2c.state.corrupt-backup';
export const SETTINGS_KEY = 'gk2c.settings';
export const DEFAULT_MODEL = 'deepseek-flash';
export interface KV { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function emptyState(): AppState;
export function validateState(raw: unknown): AppState | null;
export function loadState(kv: KV): { state: AppState; corrupt: boolean };
export function saveState(kv: KV, state: AppState): boolean; // yazma başarılıysa true
export function loadSettings(kv: KV): Settings;
export function saveSettings(kv: KV, settings: Settings): boolean;
export function exportState(state: AppState): string;   // API anahtarı içermez
export function parseImport(text: string): AppState;     // Error('Dosya geçerli bir GK2 Companion yedeği değil.') fırlatır
```

- [ ] **Step 1: başarısız testleri yaz**

`src/lib/storage.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL, SETTINGS_KEY, STATE_BACKUP_KEY, STATE_KEY, emptyState, exportState,
  loadSettings, loadState, parseImport, saveSettings, saveState, validateState, type KV,
} from './storage';
import { bld, mat, st } from './test-helpers';

const memory = (init: Record<string, string> = {}): KV & { data: Map<string, string> } => {
  const data = new Map(Object.entries(init));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

const sample = st([mat('m1', 'Tahta', 'plank')], [bld('b1', 'A', [['m1', 4]], { qty: 2 })]);

describe('loadState / saveState', () => {
  it('kayıt yoksa boş durum döner', () => {
    expect(loadState(memory())).toEqual({ state: emptyState(), corrupt: false });
  });
  it('kaydedip geri yükler', () => {
    const kv = memory();
    expect(saveState(kv, sample)).toBe(true);
    expect(loadState(kv)).toEqual({ state: sample, corrupt: false });
  });
  it('bozuk JSON\'u yedekler ve boş durumla başlar', () => {
    const kv = memory({ [STATE_KEY]: '{bozuk' });
    const r = loadState(kv);
    expect(r).toEqual({ state: emptyState(), corrupt: true });
    expect(kv.data.get(STATE_BACKUP_KEY)).toBe('{bozuk');
  });
  it('şekli geçersiz veriyi bozuk sayar', () => {
    const kv = memory({ [STATE_KEY]: JSON.stringify({ version: 2, materials: [], buildings: [] }) });
    expect(loadState(kv).corrupt).toBe(true);
  });
  it('okuma hata verirse (private mod) çökmeden boş durum döner', () => {
    const kv: KV = { getItem: () => { throw new Error('denied'); }, setItem: () => {} };
    expect(loadState(kv)).toEqual({ state: emptyState(), corrupt: false });
  });
  it('yazma hata verirse false döner', () => {
    const kv: KV = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(saveState(kv, sample)).toBe(false);
  });
});

describe('validateState', () => {
  it('geçerli durumu kabul eder', () => {
    expect(validateState(JSON.parse(JSON.stringify(sample)))).toEqual(sample);
  });
  it.each([
    ['null', null],
    ['dizi', []],
    ['qty 0', { version: 1, materials: [mat('m1', 'T')], buildings: [bld('b', 'A', [['m1', 1]], { qty: 0 })] }],
    ['built string', { version: 1, materials: [mat('m1', 'T')], buildings: [{ ...bld('b', 'A', [['m1', 1]]), built: 'evet' }] }],
    ['amount 0', { version: 1, materials: [mat('m1', 'T')], buildings: [bld('b', 'A', [['m1', 0]])] }],
    ['var olmayan malzeme', { version: 1, materials: [], buildings: [bld('b', 'A', [['m1', 1]])] }],
    ['tekrarlı malzeme id', { version: 1, materials: [mat('m1', 'T'), mat('m1', 'U')], buildings: [] }],
  ])('geçersiz durumu reddeder: %s', (_name, raw) => {
    expect(validateState(raw)).toBeNull();
  });
});

describe('dışa/içe aktarma', () => {
  it('yedek yalnızca durumu içerir, API anahtarı içermez', () => {
    const kv = memory();
    saveSettings(kv, { apiKey: 'sk-gizli', model: 'x' });
    const text = exportState(sample);
    expect(text).not.toContain('sk-gizli');
    expect(text).not.toContain('apiKey');
    expect(parseImport(text)).toEqual(sample);
  });
  it.each(['', 'düz yazı', '{"version":1}', '{"version":1,"materials":"x","buildings":[]}'])(
    'geçersiz dosyada hata fırlatır: %s',
    (text) => {
      expect(() => parseImport(text)).toThrow('Dosya geçerli bir GK2 Companion yedeği değil.');
    },
  );
});

describe('ayarlar', () => {
  it('varsayılanları döner', () => {
    expect(loadSettings(memory())).toEqual({ apiKey: '', model: DEFAULT_MODEL });
  });
  it('kaydedip geri yükler', () => {
    const kv = memory();
    saveSettings(kv, { apiKey: 'k', model: 'm' });
    expect(loadSettings(kv)).toEqual({ apiKey: 'k', model: 'm' });
  });
  it('bozuk ayar kaydında varsayılana düşer', () => {
    expect(loadSettings(memory({ [SETTINGS_KEY]: '{bozuk' }))).toEqual({ apiKey: '', model: DEFAULT_MODEL });
  });
  it('boş model adını varsayılanla değiştirir', () => {
    const kv = memory({ [SETTINGS_KEY]: JSON.stringify({ apiKey: 'k', model: '  ' }) });
    expect(loadSettings(kv).model).toBe(DEFAULT_MODEL);
  });
});
```

- [ ] **Step 2: testin başarısız olduğunu gör**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: FAIL, `Cannot find module './storage'`.

- [ ] **Step 3: uygula**

`src/lib/storage.ts`:
```ts
import type { AppState, Building, Material, Requirement, Settings } from './types';

export const STATE_KEY = 'gk2c.state';
export const STATE_BACKUP_KEY = 'gk2c.state.corrupt-backup';
export const SETTINGS_KEY = 'gk2c.settings';
export const DEFAULT_MODEL = 'deepseek-flash';

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const emptyState = (): AppState => ({ version: 1, materials: [], buildings: [] });

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function validateState(raw: unknown): AppState | null {
  if (!isObj(raw) || raw.version !== 1 || !Array.isArray(raw.materials) || !Array.isArray(raw.buildings)) {
    return null;
  }
  const materials: Material[] = [];
  const ids = new Set<string>();
  for (const m of raw.materials) {
    if (!isObj(m) || typeof m.id !== 'string' || !m.id || typeof m.name !== 'string' || ids.has(m.id)) {
      return null;
    }
    ids.add(m.id);
    materials.push({ id: m.id, name: m.name, description: typeof m.description === 'string' ? m.description : '' });
  }
  const buildings: Building[] = [];
  for (const b of raw.buildings) {
    if (!isObj(b) || typeof b.id !== 'string' || typeof b.name !== 'string' || !Array.isArray(b.requirements)) {
      return null;
    }
    if (!Number.isInteger(b.qty) || (b.qty as number) < 1 || typeof b.built !== 'boolean') return null;
    const requirements: Requirement[] = [];
    for (const r of b.requirements) {
      if (
        !isObj(r) ||
        typeof r.materialId !== 'string' ||
        !ids.has(r.materialId) ||
        !Number.isInteger(r.amount) ||
        (r.amount as number) < 1
      ) {
        return null;
      }
      requirements.push({ materialId: r.materialId, amount: r.amount as number });
    }
    buildings.push({ id: b.id, name: b.name, qty: b.qty as number, built: b.built, requirements });
  }
  return { version: 1, materials, buildings };
}

export function loadState(kv: KV): { state: AppState; corrupt: boolean } {
  let raw: string | null;
  try {
    raw = kv.getItem(STATE_KEY);
  } catch {
    return { state: emptyState(), corrupt: false };
  }
  if (raw === null) return { state: emptyState(), corrupt: false };
  try {
    const valid = validateState(JSON.parse(raw));
    if (valid) return { state: valid, corrupt: false };
  } catch {
    // bozuk JSON: aşağıda yedeklenir
  }
  try {
    kv.setItem(STATE_BACKUP_KEY, raw);
  } catch {
    // yedek yazılamadı; yine de çalışmaya devam et
  }
  return { state: emptyState(), corrupt: true };
}

export function saveState(kv: KV, state: AppState): boolean {
  try {
    kv.setItem(STATE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(kv: KV): Settings {
  const fallback: Settings = { apiKey: '', model: DEFAULT_MODEL };
  try {
    const raw = kv.getItem(SETTINGS_KEY);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!isObj(parsed)) return fallback;
    const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey : '';
    const model = typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : DEFAULT_MODEL;
    return { apiKey, model };
  } catch {
    return fallback;
  }
}

export function saveSettings(kv: KV, settings: Settings): boolean {
  try {
    kv.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function exportState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function parseImport(text: string): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Dosya geçerli bir GK2 Companion yedeği değil.');
  }
  const valid = validateState(parsed);
  if (!valid) throw new Error('Dosya geçerli bir GK2 Companion yedeği değil.');
  return valid;
}
```

- [ ] **Step 4: testlerin geçtiğini gör**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib
git commit -m "feat: localStorage saklama, dışa/içe aktarma ve ayarlar" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Görsel matematiği (`image-math.ts`)

**Files:**
- Create: `src/lib/image-math.ts`
- Test: `src/lib/image-math.test.ts`

**Interfaces:**
- Produces:
```ts
export type Rotation = 0 | 90 | 180 | 270;
export type View = { zoom: number; cx: number; cy: number }; // cx, cy: döndürülmüş görsel pikselinde kadraj merkezi
export type Rect = { x: number; y: number; w: number; h: number };
export const MAX_ZOOM = 5;
export const MAX_OUTPUT_SIDE = 1600;
export function rotatedSize(w: number, h: number, rot: Rotation): { w: number; h: number };
export function rotate(rot: Rotation, dir: 1 | -1): Rotation;
export function initialView(rw: number, rh: number): View;
export function clampView(view: View, rw: number, rh: number): View;
export function cropRect(view: View, rw: number, rh: number): Rect;
export function zoomAt(view: View, newZoom: number, fx: number, fy: number, rw: number, rh: number): View; // fx, fy: kadraj içinde 0..1
export function panBy(view: View, dxFrac: number, dyFrac: number, rw: number, rh: number): View; // dxFrac: kadraj genişliğinin oranı
export function outputSize(cropW: number, cropH: number, maxSide?: number): { w: number; h: number };
export function rotationTransform(rot: Rotation, w: number, h: number): { tx: number; ty: number; angle: number };
```
Kadraj (frame) her zaman döndürülmüş görselle aynı en-boy oranındadır. `zoom = 1` tüm görseli gösterir.

- [ ] **Step 1: başarısız testleri yaz**

`src/lib/image-math.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM, clampView, cropRect, initialView, outputSize, panBy, rotate, rotatedSize,
  rotationTransform, zoomAt, type Rotation,
} from './image-math';

describe('rotatedSize / rotate', () => {
  it('90 ve 270 derecede en ile boyu değiştirir', () => {
    expect(rotatedSize(400, 200, 0)).toEqual({ w: 400, h: 200 });
    expect(rotatedSize(400, 200, 90)).toEqual({ w: 200, h: 400 });
    expect(rotatedSize(400, 200, 180)).toEqual({ w: 400, h: 200 });
    expect(rotatedSize(400, 200, 270)).toEqual({ w: 200, h: 400 });
  });
  it('döndürme 0-360 arasında sarar', () => {
    expect(rotate(0, -1)).toBe(270);
    expect(rotate(270, 1)).toBe(0);
    expect(rotate(90, 1)).toBe(180);
  });
});

describe('cropRect / clampView', () => {
  it('zoom 1 tüm görseli gösterir', () => {
    expect(cropRect(initialView(400, 200), 400, 200)).toEqual({ x: 0, y: 0, w: 400, h: 200 });
  });
  it('zoom 2 merkezde yarı boyutlu kadraj verir', () => {
    expect(cropRect({ zoom: 2, cx: 200, cy: 100 }, 400, 200)).toEqual({ x: 100, y: 50, w: 200, h: 100 });
  });
  it('zoomu 1..MAX_ZOOM arasına sıkıştırır', () => {
    expect(clampView({ zoom: 0.2, cx: 0, cy: 0 }, 400, 200).zoom).toBe(1);
    expect(clampView({ zoom: 99, cx: 200, cy: 100 }, 400, 200).zoom).toBe(MAX_ZOOM);
  });
  it('zoom 1\'de merkezi ortaya sabitler', () => {
    const v = clampView({ zoom: 1, cx: 10, cy: 10 }, 400, 200);
    expect([v.cx, v.cy]).toEqual([200, 100]);
  });
  it('kadrajı görselin dışına taşırmaz', () => {
    const v = clampView({ zoom: 2, cx: -50, cy: 999 }, 400, 200);
    const r = cropRect(v, 400, 200);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y + r.h).toBeLessThanOrEqual(200);
  });
});

describe('zoomAt', () => {
  it('odak noktasının altındaki görsel noktayı sabit tutar', () => {
    const start = { zoom: 2, cx: 150, cy: 80 };
    const fx = 0.8, fy = 0.3;
    const before = cropRect(start, 400, 200);
    const px = before.x + fx * before.w, py = before.y + fy * before.h;
    const next = zoomAt(start, 3, fx, fy, 400, 200);
    const after = cropRect(next, 400, 200);
    expect(after.x + fx * after.w).toBeCloseTo(px);
    expect(after.y + fy * after.h).toBeCloseTo(py);
    expect(next.zoom).toBe(3);
  });
  it('zoom 1\'e dönünce yeniden ortalar', () => {
    const v = zoomAt({ zoom: 3, cx: 300, cy: 40 }, 1, 0.5, 0.5, 400, 200);
    expect(v).toEqual({ zoom: 1, cx: 200, cy: 100 });
  });
});

describe('panBy', () => {
  it('parmağı sağa sürükleyince kadraj sola kayar', () => {
    const v = panBy({ zoom: 2, cx: 200, cy: 100 }, 0.25, 0, 400, 200);
    expect(v.cx).toBe(150);
  });
  it('kenarda durur', () => {
    const v = panBy({ zoom: 2, cx: 200, cy: 100 }, -10, 10, 400, 200);
    expect(v.cx).toBe(300);
    expect(v.cy).toBe(50);
  });
});

describe('outputSize', () => {
  it('uzun kenarı 1600\'e indirir, oranı korur', () => {
    expect(outputSize(4000, 3000)).toEqual({ w: 1600, h: 1200 });
    expect(outputSize(3000, 4000)).toEqual({ w: 1200, h: 1600 });
  });
  it('küçük görseli büyütmez', () => {
    expect(outputSize(800, 600)).toEqual({ w: 800, h: 600 });
  });
  it('en az 1 piksel döner', () => {
    expect(outputSize(0.2, 0.1).w).toBeGreaterThanOrEqual(1);
  });
});

describe('rotationTransform', () => {
  it.each([0, 90, 180, 270] as Rotation[])('%s derecede görsel köşeleri döndürülmüş alanın içine düşer', (rot) => {
    const W = 400, H = 200;
    const { w: rw, h: rh } = rotatedSize(W, H, rot);
    const { tx, ty, angle } = rotationTransform(rot, W, H);
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const X = tx + x * Math.cos(angle) - y * Math.sin(angle);
      const Y = ty + x * Math.sin(angle) + y * Math.cos(angle);
      expect(X).toBeGreaterThanOrEqual(-1e-9);
      expect(X).toBeLessThanOrEqual(rw + 1e-9);
      expect(Y).toBeGreaterThanOrEqual(-1e-9);
      expect(Y).toBeLessThanOrEqual(rh + 1e-9);
    }
  });
  it('90 derecede sol üst köşe sağ üste gider', () => {
    const { tx, ty, angle } = rotationTransform(90, 400, 200);
    const X = tx + 0 * Math.cos(angle) - 0 * Math.sin(angle);
    const Y = ty + 0 * Math.sin(angle) + 0 * Math.cos(angle);
    expect([Math.round(X), Math.round(Y)]).toEqual([200, 0]);
  });
});
```

- [ ] **Step 2: testin başarısız olduğunu gör**

Run: `npx vitest run src/lib/image-math.test.ts`
Expected: FAIL, `Cannot find module './image-math'`.

- [ ] **Step 3: uygula**

`src/lib/image-math.ts`:
```ts
export type Rotation = 0 | 90 | 180 | 270;
export type View = { zoom: number; cx: number; cy: number };
export type Rect = { x: number; y: number; w: number; h: number };

export const MAX_ZOOM = 5;
export const MAX_OUTPUT_SIDE = 1600;

export function rotatedSize(w: number, h: number, rot: Rotation): { w: number; h: number } {
  return rot === 90 || rot === 270 ? { w: h, h: w } : { w, h };
}

export function rotate(rot: Rotation, dir: 1 | -1): Rotation {
  return ((rot + dir * 90 + 360) % 360) as Rotation;
}

export function initialView(rw: number, rh: number): View {
  return { zoom: 1, cx: rw / 2, cy: rh / 2 };
}

export function clampView(view: View, rw: number, rh: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, view.zoom));
  const halfW = rw / zoom / 2;
  const halfH = rh / zoom / 2;
  return {
    zoom,
    cx: Math.min(rw - halfW, Math.max(halfW, view.cx)),
    cy: Math.min(rh - halfH, Math.max(halfH, view.cy)),
  };
}

export function cropRect(view: View, rw: number, rh: number): Rect {
  const w = rw / view.zoom;
  const h = rh / view.zoom;
  return { x: view.cx - w / 2, y: view.cy - h / 2, w, h };
}

export function zoomAt(view: View, newZoom: number, fx: number, fy: number, rw: number, rh: number): View {
  const oldW = rw / view.zoom;
  const oldH = rh / view.zoom;
  const px = view.cx + (fx - 0.5) * oldW;
  const py = view.cy + (fy - 0.5) * oldH;
  const zoom = Math.min(MAX_ZOOM, Math.max(1, newZoom));
  const newW = rw / zoom;
  const newH = rh / zoom;
  return clampView({ zoom, cx: px - (fx - 0.5) * newW, cy: py - (fy - 0.5) * newH }, rw, rh);
}

export function panBy(view: View, dxFrac: number, dyFrac: number, rw: number, rh: number): View {
  const w = rw / view.zoom;
  const h = rh / view.zoom;
  return clampView({ ...view, cx: view.cx - dxFrac * w, cy: view.cy - dyFrac * h }, rw, rh);
}

export function outputSize(cropW: number, cropH: number, maxSide = MAX_OUTPUT_SIDE): { w: number; h: number } {
  const scale = Math.min(1, maxSide / Math.max(cropW, cropH));
  return { w: Math.max(1, Math.round(cropW * scale)), h: Math.max(1, Math.round(cropH * scale)) };
}

/** Canvas 2D: `ctx.translate(tx, ty); ctx.rotate(angle); ctx.drawImage(img, 0, 0)` görseli döndürülmüş uzaya çizer. */
export function rotationTransform(rot: Rotation, w: number, h: number): { tx: number; ty: number; angle: number } {
  switch (rot) {
    case 90:
      return { tx: h, ty: 0, angle: Math.PI / 2 };
    case 180:
      return { tx: w, ty: h, angle: Math.PI };
    case 270:
      return { tx: 0, ty: w, angle: -Math.PI / 2 };
    default:
      return { tx: 0, ty: 0, angle: 0 };
  }
}
```

- [ ] **Step 4: testlerin geçtiğini gör**

Run: `npx vitest run src/lib/image-math.test.ts`
Expected: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib
git commit -m "feat: görsel döndürme, kadraj ve zoom matematiği" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: AI istemi ve DeepSeek sağlayıcısı

**Files:**
- Create: `src/lib/ai/provider.ts`, `src/lib/ai/prompt.ts`, `src/lib/ai/deepseek.ts`
- Test: `src/lib/ai/prompt.test.ts`, `src/lib/ai/deepseek.test.ts`

**Interfaces:**
- Consumes: `parseScanResponse`, `ScanFormatError` (`parse.ts`); `Material`, `ScanResult` (`types.ts`).
- Produces (`provider.ts`):
```ts
export type ScanErrorCode = 'no-key' | 'auth' | 'balance' | 'rate-limit' | 'bad-request' | 'network' | 'server' | 'format';
export class ScanError extends Error { readonly code: ScanErrorCode; constructor(code: ScanErrorCode) }
export type ScanInput = { imageDataUrl: string; knownMaterials: Pick<Material, 'id' | 'name' | 'description'>[]; signal?: AbortSignal };
export interface ScanProvider { scan(input: ScanInput): Promise<ScanResult> }
```
- Produces (`prompt.ts`): `SYSTEM_PROMPT: string`, `buildMessages(imageDataUrl, knownMaterials): ChatMessage[]`.
- Produces (`deepseek.ts`): `createDeepSeekProvider(cfg: { apiKey: string; model: string; fetchImpl?: typeof fetch }): ScanProvider`.

- [ ] **Step 1: `provider.ts`'i yaz** (test gerektirmeyen sabit tanımlar; `ScanError` `deepseek.test.ts` içinde sınanır)

`src/lib/ai/provider.ts`:
```ts
import type { Material, ScanResult } from '../types';

export type ScanErrorCode =
  | 'no-key'
  | 'auth'
  | 'balance'
  | 'rate-limit'
  | 'bad-request'
  | 'network'
  | 'server'
  | 'format';

const MESSAGES: Record<ScanErrorCode, string> = {
  'no-key': 'Ayarlardan API anahtarı gir.',
  auth: 'API anahtarı geçersiz.',
  balance: 'Bakiye yetersiz.',
  'rate-limit': 'Çok fazla istek, biraz bekle.',
  'bad-request': 'İstek reddedildi. Model adı veya görsel geçersiz olabilir.',
  network: 'Bağlantı kurulamadı.',
  server: 'DeepSeek sunucusu hata verdi, tekrar dene.',
  format: 'AI cevabı okunamadı.',
};

export class ScanError extends Error {
  readonly code: ScanErrorCode;
  constructor(code: ScanErrorCode) {
    super(MESSAGES[code]);
    this.name = 'ScanError';
    this.code = code;
  }
}

export type ScanInput = {
  imageDataUrl: string;
  knownMaterials: Pick<Material, 'id' | 'name' | 'description'>[];
  signal?: AbortSignal;
};

export interface ScanProvider {
  scan(input: ScanInput): Promise<ScanResult>;
}
```

- [ ] **Step 2: başarısız istem testini yaz**

`src/lib/ai/prompt.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT, buildMessages } from './prompt';

describe('buildMessages', () => {
  const url = 'data:image/jpeg;base64,AAAA';
  const known = [{ id: 'm1', name: 'Tahta', description: 'light plank' }];

  it('sistem mesajı düz metindir ve görsel içermez', () => {
    const [sys] = buildMessages(url, known);
    expect(sys).toEqual({ role: 'system', content: SYSTEM_PROMPT });
  });

  it('görsel yalnızca user mesajında image_url olarak gider', () => {
    const [, user] = buildMessages(url, known);
    expect(user.role).toBe('user');
    const parts = user.content as { type: string; image_url?: { url: string } }[];
    expect(parts.find((p) => p.type === 'image_url')?.image_url?.url).toBe(url);
  });

  it('bilinen malzemeleri JSON olarak metne koyar', () => {
    const [, user] = buildMessages(url, known);
    const text = (user.content as { type: string; text?: string }[]).find((p) => p.type === 'text')!.text!;
    expect(text).toContain(JSON.stringify(known));
  });

  it('bilinen malzeme yoksa boş dizi gönderir', () => {
    const [, user] = buildMessages(url, []);
    const text = (user.content as { type: string; text?: string }[]).find((p) => p.type === 'text')!.text!;
    expect(text).toContain('[]');
  });

  it('istem, sayının slash sonrasını ve boş sonucu tarif eder', () => {
    expect(SYSTEM_PROMPT).toMatch(/AFTER the slash/);
    expect(SYSTEM_PROMPT).toContain('{"buildings":[]}');
  });
});
```

- [ ] **Step 3: testin başarısız olduğunu gör**

Run: `npx vitest run src/lib/ai/prompt.test.ts`
Expected: FAIL, `Cannot find module './prompt'`.

- [ ] **Step 4: `prompt.ts`'i uygula**

`src/lib/ai/prompt.ts`:
```ts
import type { Material } from '../types';

export const SYSTEM_PROMPT = `You read screenshots or photos of the construction menu in the video game "Graveyard Keeper 2". The game UI is in Turkish.

Each row of the menu is one buildable item. A row has an icon, the item's name, and on the right one or more material icons. Each material icon has a counter such as "0/4" or "21/6".

The counter format is "owned/required". Only the number AFTER the slash is the required amount. Ignore the number before the slash. Ignore small bonus values shown under a name (for example a cross icon with "+3").

Materials are shown as icons only, without names. You are given a list of already known materials (id, name, visual description). For each material icon in a row:
- If the icon clearly matches a known material, return its "materialId" and set "suggestedName" and "description" to null.
- Otherwise set "materialId" to null, give a short Turkish "suggestedName" (for example "Tahta", "Çivi", "Taş", "Kütük") and a short English "description" of how the icon looks (color and shape) so that it can be recognized again later. Icons that look different need different names even if they are the same kind of thing (for example a light plank and a dark plank).

Building names must be copied exactly as shown in the image, including Roman numerals such as "I" or "II". Keep the order of rows and of material icons.

Respond with ONLY a JSON object, no prose and no code fences, in exactly this shape:
{"buildings":[{"name":"<building name>","requirements":[{"materialId":"<known id or null>","suggestedName":"<name or null>","description":"<description or null>","amount":<integer >= 1>}]}]}

If the image contains no construction menu rows, respond with {"buildings":[]}.`;

type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export type ChatMessage = { role: 'system' | 'user'; content: string | ContentPart[] };

export function buildMessages(
  imageDataUrl: string,
  knownMaterials: Pick<Material, 'id' | 'name' | 'description'>[],
): ChatMessage[] {
  const known = JSON.stringify(knownMaterials.map(({ id, name, description }) => ({ id, name, description })));
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: `Known materials: ${known}\n\nRead the image and return the JSON.` },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ];
}
```

- [ ] **Step 5: testin geçtiğini gör**

Run: `npx vitest run src/lib/ai/prompt.test.ts`
Expected: 5 test PASS.

- [ ] **Step 6: başarısız DeepSeek testlerini yaz**

`src/lib/ai/deepseek.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createDeepSeekProvider } from './deepseek';
import { ScanError } from './provider';

const GOOD = { buildings: [{ name: 'A', requirements: [{ materialId: 'm1', suggestedName: null, description: null, amount: 2 }] }] };
const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const ok = (content: string) => respond(200, { choices: [{ message: { content } }] });
const input = { imageDataUrl: 'data:image/jpeg;base64,AAAA', knownMaterials: [{ id: 'm1', name: 'Tahta', description: 'plank' }] };
const make = (fetchImpl: typeof fetch, apiKey = 'k') => createDeepSeekProvider({ apiKey, model: 'deepseek-flash', fetchImpl });
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof ScanError ? e.code : `other:${String(e)}`;
  }
  return 'no-error';
};

describe('createDeepSeekProvider', () => {
  it('doğru uç noktaya, başlıklarla ve doğru gövdeyle istek atar', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(JSON.stringify(GOOD)));
    const result = await make(fetchImpl as unknown as typeof fetch).scan(input);
    expect(result).toEqual(GOOD);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer k');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('deepseek-flash');
    expect(body.messages[0].role).toBe('system');
    expect(typeof body.messages[0].content).toBe('string');
    expect(body.messages[1].content.some((p: { type: string }) => p.type === 'image_url')).toBe(true);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('API anahtarı yoksa istek atmadan no-key verir', async () => {
    const fetchImpl = vi.fn();
    expect(await code(make(fetchImpl as unknown as typeof fetch, '  ').scan(input))).toBe('no-key');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'auth'],
    [402, 'balance'],
    [429, 'rate-limit'],
    [500, 'server'],
    [503, 'server'],
    [404, 'bad-request'],
  ])('%s durumunu %s koduna çevirir', async (status, expected) => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(status, { error: {} }));
    expect(await code(make(fetchImpl as unknown as typeof fetch).scan(input))).toBe(expected);
  });

  it('ağ hatasını network koduna çevirir', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await code(make(fetchImpl as unknown as typeof fetch).scan(input))).toBe('network');
  });

  it('iptali (AbortError) olduğu gibi yukarı fırlatır', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    const fetchImpl = vi.fn().mockRejectedValue(abort);
    await expect(make(fetchImpl as unknown as typeof fetch).scan(input)).rejects.toBe(abort);
  });

  it('400 gelirse response_format olmadan bir kez daha dener', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(respond(400, { error: { message: 'response_format unsupported' } }))
      .mockResolvedValueOnce(ok(JSON.stringify(GOOD)));
    expect(await make(fetchImpl as unknown as typeof fetch).scan(input)).toEqual(GOOD);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).response_format).toBeUndefined();
  });

  it('iki 400 üst üste gelirse bad-request verir', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(400, { error: {} }));
    expect(await code(make(fetchImpl as unknown as typeof fetch).scan(input))).toBe('bad-request');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('geçersiz JSON gelirse bir kez otomatik tekrar dener', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok('bu JSON değil'))
      .mockResolvedValueOnce(ok(JSON.stringify(GOOD)));
    expect(await make(fetchImpl as unknown as typeof fetch).scan(input)).toEqual(GOOD);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('iki kez geçersiz JSON gelirse format hatası verir', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok('yine JSON değil'));
    expect(await code(make(fetchImpl as unknown as typeof fetch).scan(input))).toBe('format');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('boş içerik ve eksik choices alanını format hatası sayar', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(200, { choices: [] }));
    expect(await code(make(fetchImpl as unknown as typeof fetch).scan(input))).toBe('format');
  });

  it('gövde JSON değilse format hatası verir', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }));
    expect(await code(make(fetchImpl as unknown as typeof fetch).scan(input))).toBe('format');
  });
});
```

- [ ] **Step 7: testin başarısız olduğunu gör**

Run: `npx vitest run src/lib/ai/deepseek.test.ts`
Expected: FAIL, `Cannot find module './deepseek'`.

- [ ] **Step 8: `deepseek.ts`'i uygula**

`src/lib/ai/deepseek.ts`:
```ts
import { ScanFormatError, parseScanResponse } from './parse';
import { buildMessages, type ChatMessage } from './prompt';
import { ScanError, type ScanInput, type ScanProvider } from './provider';

const ENDPOINT = 'https://api.deepseek.com/chat/completions';

export type DeepSeekConfig = { apiKey: string; model: string; fetchImpl?: typeof fetch };

function statusError(status: number): ScanError {
  if (status === 401) return new ScanError('auth');
  if (status === 402) return new ScanError('balance');
  if (status === 429) return new ScanError('rate-limit');
  if (status >= 500) return new ScanError('server');
  return new ScanError('bad-request');
}

export function createDeepSeekProvider(cfg: DeepSeekConfig): ScanProvider {
  const doFetch: typeof fetch = cfg.fetchImpl ?? ((...args) => fetch(...args));

  async function post(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    try {
      return await doFetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey.trim()}` },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      throw new ScanError('network');
    }
  }

  async function complete(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    const base = { model: cfg.model, messages, temperature: 0, stream: false };
    let res = await post({ ...base, response_format: { type: 'json_object' } }, signal);
    if (res.status === 400) res = await post(base, signal);
    if (!res.ok) throw statusError(res.status);
    let data: { choices?: { message?: { content?: unknown } }[] };
    try {
      data = await res.json();
    } catch {
      throw new ScanError('format');
    }
    const content = data.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : '';
  }

  return {
    async scan({ imageDataUrl, knownMaterials, signal }: ScanInput) {
      if (!cfg.apiKey.trim()) throw new ScanError('no-key');
      const messages = buildMessages(imageDataUrl, knownMaterials);
      for (let attempt = 0; attempt < 2; attempt++) {
        const content = await complete(messages, signal);
        try {
          return parseScanResponse(content);
        } catch (e) {
          if (!(e instanceof ScanFormatError)) throw e;
        }
      }
      throw new ScanError('format');
    },
  };
}
```

- [ ] **Step 9: testlerin geçtiğini gör**

Run: `npx vitest run src/lib/ai`
Expected: `parse`, `prompt`, `deepseek` testlerinin hepsi PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/ai
git commit -m "feat: DeepSeek görsel tarama sağlayıcısı ve istem" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Reaktif durum (`state.svelte.ts`) ve DOM görsel yardımcıları (`image.ts`)

**Files:**
- Create: `src/lib/state.svelte.ts`, `src/lib/image.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `ops.ts`, `merge.applyDraft`, `storage.ts`, `image-math.ts`, `types.ts`.
- Produces (`state.svelte.ts`): `export const store` (`AppStore` örneği):
```ts
store.state: AppState              // $state
store.settings: Settings           // $state
store.corrupt: boolean             // $state
store.saveFailed: boolean          // $state
store.online: boolean              // $state
store.init(): void                 // main.ts'te mount'tan önce çağrılır
store.setQty(buildingId: string, qty: number): void
store.toggleBuilt(buildingId: string): void
store.deleteBuilding(buildingId: string): void
store.renameMaterial(materialId: string, name: string): string | null   // hata mesajı veya null
store.applyScan(draft: ReviewDraft): void
store.setSettings(patch: Partial<Settings>): void
store.exportJson(): string
store.replaceState(next: AppState): void
store.dismissCorrupt(): void
```
- Produces (`image.ts`):
```ts
export function loadImage(file: Blob): Promise<ImageBitmap>;           // Error('Görsel açılamadı, başka bir görsel dene.')
export function drawCrop(ctx: CanvasRenderingContext2D, bitmap: ImageBitmap, rot: Rotation, view: View, outW: number, outH: number): void;
export function renderToDataUrl(bitmap: ImageBitmap, rot: Rotation, view: View): string;   // uzun kenar <= 1600, JPEG 0.85
```

Bu dosyalar tarayıcı/Svelte çalışma zamanına bağlı olduğundan birim testi yoktur; doğrulama `svelte-check` (tip) ve Task 14 e2e testiyle yapılır.

- [ ] **Step 1: `image.ts`'i yaz**

`src/lib/image.ts`:
```ts
import {
  MAX_OUTPUT_SIDE,
  cropRect,
  outputSize,
  rotatedSize,
  rotationTransform,
  type Rotation,
  type View,
} from './image-math';

export async function loadImage(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Görsel açılamadı, başka bir görsel dene.');
  }
}

export function drawCrop(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  rot: Rotation,
  view: View,
  outW: number,
  outH: number,
): void {
  const { w: rw, h: rh } = rotatedSize(bitmap.width, bitmap.height, rot);
  const crop = cropRect(view, rw, rh);
  const t = rotationTransform(rot, bitmap.width, bitmap.height);
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, outW, outH);
  ctx.scale(outW / crop.w, outH / crop.h);
  ctx.translate(-crop.x, -crop.y);
  ctx.translate(t.tx, t.ty);
  ctx.rotate(t.angle);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0);
  ctx.restore();
}

export function renderToDataUrl(bitmap: ImageBitmap, rot: Rotation, view: View): string {
  const { w: rw, h: rh } = rotatedSize(bitmap.width, bitmap.height, rot);
  const crop = cropRect(view, rw, rh);
  const { w, h } = outputSize(crop.w, crop.h, MAX_OUTPUT_SIDE);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas kullanılamıyor.');
  drawCrop(ctx, bitmap, rot, view, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}
```

- [ ] **Step 2: `state.svelte.ts`'i yaz**

`src/lib/state.svelte.ts`:
```ts
import { applyDraft } from './merge';
import * as ops from './ops';
import {
  DEFAULT_MODEL,
  emptyState,
  exportState,
  loadSettings,
  loadState,
  saveSettings,
  saveState,
} from './storage';
import type { AppState, ReviewDraft, Settings } from './types';

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

class AppStore {
  state = $state<AppState>(emptyState());
  settings = $state<Settings>({ apiKey: '', model: DEFAULT_MODEL });
  corrupt = $state(false);
  saveFailed = $state(false);
  online = $state(true);

  init(): void {
    const loaded = loadState(localStorage);
    this.state = loaded.state;
    this.corrupt = loaded.corrupt;
    this.settings = loadSettings(localStorage);
    this.online = navigator.onLine;
    window.addEventListener('online', () => (this.online = true));
    window.addEventListener('offline', () => (this.online = false));
  }

  private commit(next: AppState): void {
    this.state = next;
    this.saveFailed = !saveState(localStorage, $state.snapshot(this.state));
  }

  setQty(buildingId: string, qty: number): void {
    this.commit(ops.setQty(this.state, buildingId, qty));
  }

  toggleBuilt(buildingId: string): void {
    this.commit(ops.toggleBuilt(this.state, buildingId));
  }

  deleteBuilding(buildingId: string): void {
    this.commit(ops.deleteBuilding(this.state, buildingId));
  }

  renameMaterial(materialId: string, name: string): string | null {
    const result = ops.renameMaterial(this.state, materialId, name);
    if (!result.ok) return result.error;
    this.commit(result.state);
    return null;
  }

  applyScan(draft: ReviewDraft): void {
    this.commit(applyDraft(this.state, draft, newId));
  }

  setSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    saveSettings(localStorage, $state.snapshot(this.settings));
  }

  exportJson(): string {
    return exportState($state.snapshot(this.state));
  }

  replaceState(next: AppState): void {
    this.commit(next);
  }

  dismissCorrupt(): void {
    this.corrupt = false;
  }
}

export const store = new AppStore();
```

- [ ] **Step 3: `main.ts`'te başlat**

`src/main.ts`:
```ts
import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { store } from './lib/state.svelte';

store.init();
mount(App, { target: document.getElementById('app')! });
```

- [ ] **Step 4: tip kontrolü**

Run: `npm run check`
Expected: 0 hata (uyarılar not edilir, hata olmamalı). `AppStore` içinde `$state.snapshot` tip hatası verirse `.svelte.ts` uzantısının doğru olduğundan emin ol.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: reaktif uygulama durumu ve canvas görsel yardımcıları" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Uygulama kabuğu, Yapılar, Toplam ve Ayarlar ekranları

**Files:**
- Modify: `src/app.css`, `src/App.svelte`, `src/lib/types.ts` (zaten `Tab` var)
- Create: `src/components/Tabs.svelte`, `ScanButton.svelte`, `BuildingsView.svelte`, `BuildingCard.svelte`, `TotalView.svelte`, `SettingsView.svelte`

**Interfaces:**
- Consumes: `store` (Task 9), `aggregate` (Task 2), `parseImport` (Task 6), `Tab`, `Building`.
- Produces: `ScanButton` prop `onfile: (file: File) => void`; `BuildingsView` prop `onscan: (file: File) => void`; `App.svelte` içinde `scanFile` durumu (Task 12'de `ScanFlow` buna bağlanır).
- Erişilebilir adlar (e2e testi bunlara güvenir): sekme düğmeleri "Yapılar" / "Toplam" / "Ayarlar"; kart düğmeleri "Adedi azalt" / "Adedi artır"; yapı kartı `article.building`; toplam satırı `data-testid="total-row"`.

- [ ] **Step 1: global stiller**

`src/app.css` (tamamını değiştir):
```css
:root {
  --bg: #14110f;
  --panel: #201b17;
  --panel-2: #2a231d;
  --line: #3a3128;
  --text: #e8dfd0;
  --muted: #a29583;
  --accent: #c9a24b;
  --accent-ink: #1a1408;
  --danger: #d0664d;
  --ok: #7ea36a;
  color-scheme: dark;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.4;
}

* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); }
body { min-height: 100dvh; -webkit-tap-highlight-color: transparent; }
h1, h2, h3 { font-family: Georgia, 'Times New Roman', serif; font-weight: 600; margin: 0; }
h1 { font-size: 1.5rem; }
h2 { font-size: 1.15rem; }
h3 { font-size: 1.05rem; }
p { margin: 0; }
ul { list-style: none; margin: 0; padding: 0; }

button, input, select { font: inherit; color: inherit; }
button {
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.55rem 0.9rem;
  min-height: 44px;
  cursor: pointer;
}
button:hover:not(:disabled) { border-color: var(--accent); }
button:disabled { opacity: 0.45; cursor: not-allowed; }
button.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); font-weight: 600; }
button.danger { color: var(--danger); }
button.icon { min-width: 44px; padding: 0.4rem; }

input[type='text'], input[type='password'], input[type='number'], select {
  width: 100%;
  min-height: 44px;
  padding: 0.55rem 0.7rem;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 8px;
}
input[type='checkbox'] { width: 1.15rem; height: 1.15rem; accent-color: var(--accent); }
input:focus-visible, select:focus-visible, button:focus-visible, summary:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.container { width: 100%; max-width: 800px; margin: 0 auto; padding: 0 16px; }
.shell > header { padding: 16px 0 8px; }
.shell > main { padding: 8px 0 96px; display: grid; gap: 12px; }
@media (min-width: 720px) { .shell > main { padding-bottom: 48px; } }

.card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px; display: grid; gap: 10px; }
.row { display: flex; gap: 10px; align-items: center; }
.row.between { justify-content: space-between; }
.row.wrap { flex-wrap: wrap; }
.muted { color: var(--muted); font-size: 0.9rem; }
.notice { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: var(--panel); }
.notice.warn { border-color: var(--danger); }
.notice.error { border-color: var(--danger); color: var(--danger); }
.notice.ok { border-color: var(--ok); color: var(--ok); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { background: var(--bg); border: 1px solid var(--line); border-radius: 999px; padding: 2px 10px; font-size: 0.9rem; }
.badge { font-size: 0.75rem; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); }
.badge.new { border-color: var(--ok); color: var(--ok); }
.badge.update { border-color: var(--accent); color: var(--accent); }
.field { display: grid; gap: 6px; }
.field > label, .field > .label { font-size: 0.9rem; color: var(--muted); }
.check { display: flex; align-items: center; gap: 8px; min-height: 44px; }
.stepper { display: inline-flex; align-items: center; gap: 8px; }
.stepper output { min-width: 2ch; text-align: center; font-weight: 600; }

.overlay { position: fixed; inset: 0; z-index: 50; background: var(--bg); overflow: auto; overscroll-behavior: contain; }
.overlay-inner { max-width: 800px; margin: 0 auto; padding: 16px; display: grid; gap: 12px; }
.center { text-align: center; padding: 32px 0; }
.spinner { width: 36px; height: 36px; margin: 0 auto 12px; border: 4px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 3s; } }
```

- [ ] **Step 2: sekmeler**

`src/components/Tabs.svelte`:
```svelte
<script lang="ts">
  import type { Tab } from '../lib/types';

  let { tab = $bindable() }: { tab: Tab } = $props();

  const items: { id: Tab; label: string }[] = [
    { id: 'buildings', label: 'Yapılar' },
    { id: 'total', label: 'Toplam' },
    { id: 'settings', label: 'Ayarlar' },
  ];
</script>

<nav aria-label="Ana menü">
  {#each items as item (item.id)}
    <button
      class:active={tab === item.id}
      aria-current={tab === item.id ? 'page' : undefined}
      onclick={() => (tab = item.id)}
    >
      {item.label}
    </button>
  {/each}
</nav>

<style>
  nav {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 10;
    display: flex;
    background: var(--panel);
    border-top: 1px solid var(--line);
    padding-bottom: env(safe-area-inset-bottom);
  }
  nav button {
    flex: 1;
    min-height: 56px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--muted);
  }
  nav button.active {
    color: var(--accent);
    box-shadow: inset 0 3px 0 var(--accent);
  }
  @media (min-width: 720px) {
    nav {
      position: static;
      border: 0;
      border-bottom: 1px solid var(--line);
      background: transparent;
      padding-bottom: 0;
    }
    nav button { min-height: 48px; }
    nav button.active { box-shadow: inset 0 -3px 0 var(--accent); }
  }
</style>
```

- [ ] **Step 3: tarama butonları**

`src/components/ScanButton.svelte`:
```svelte
<script lang="ts">
  let { disabled = false, onfile }: { disabled?: boolean; onfile: (file: File) => void } = $props();

  let cameraInput = $state<HTMLInputElement>();
  let galleryInput = $state<HTMLInputElement>();

  function picked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) onfile(file);
  }
</script>

<div class="row wrap">
  <button class="primary" {disabled} onclick={() => cameraInput?.click()}>Tara (kamera)</button>
  <button {disabled} onclick={() => galleryInput?.click()}>Galeriden seç</button>
  <input bind:this={cameraInput} type="file" accept="image/*" capture="environment" hidden onchange={picked} />
  <input bind:this={galleryInput} type="file" accept="image/*" hidden onchange={picked} />
</div>
```

- [ ] **Step 4: yapı kartı ve yapılar ekranı**

`src/components/BuildingCard.svelte`:
```svelte
<script lang="ts">
  import { store } from '../lib/state.svelte';
  import type { Building } from '../lib/types';

  let { building }: { building: Building } = $props();

  const nameOf = (id: string) => store.state.materials.find((m) => m.id === id)?.name ?? '?';

  function remove() {
    if (confirm(`"${building.name}" silinsin mi?`)) store.deleteBuilding(building.id);
  }
</script>

<article class="card building" class:done={building.built}>
  <header class="row between">
    <h3>{building.name}</h3>
    <button class="danger" onclick={remove}>Sil</button>
  </header>
  <ul class="chips">
    {#each building.requirements as r (r.materialId)}
      <li class="chip">
        {nameOf(r.materialId)} ×{r.amount}{building.qty > 1 ? ` (${r.amount * building.qty})` : ''}
      </li>
    {/each}
  </ul>
  <footer class="row between wrap">
    <div class="stepper">
      <button
        class="icon"
        aria-label="Adedi azalt"
        disabled={building.qty <= 1}
        onclick={() => store.setQty(building.id, building.qty - 1)}>−</button
      >
      <output aria-label="Adet">{building.qty}</output>
      <button class="icon" aria-label="Adedi artır" onclick={() => store.setQty(building.id, building.qty + 1)}>+</button>
    </div>
    <label class="check">
      <input type="checkbox" checked={building.built} onchange={() => store.toggleBuilt(building.id)} />
      Yapıldı
    </label>
  </footer>
</article>

<style>
  .done { opacity: 0.55; }
</style>
```

`src/components/BuildingsView.svelte`:
```svelte
<script lang="ts">
  import { store } from '../lib/state.svelte';
  import BuildingCard from './BuildingCard.svelte';
  import ScanButton from './ScanButton.svelte';

  let { onscan }: { onscan: (file: File) => void } = $props();

  const pending = $derived(store.state.buildings.filter((b) => !b.built));
  const done = $derived(store.state.buildings.filter((b) => b.built));
</script>

<section class="card">
  <h2>İnşa menüsünü tara</h2>
  <ScanButton disabled={!store.online} onfile={onscan} />
  {#if !store.online}
    <p class="muted">Çevrimdışısın, tarama için internet gerekir.</p>
  {/if}
</section>

{#if store.state.buildings.length === 0}
  <p class="muted center">Henüz yapı yok. İnşa menüsünün ekran görüntüsünü veya fotoğrafını tara.</p>
{/if}

{#each pending as building (building.id)}
  <BuildingCard {building} />
{/each}

{#if done.length > 0}
  <h2>Yapıldı</h2>
  {#each done as building (building.id)}
    <BuildingCard {building} />
  {/each}
{/if}
```

- [ ] **Step 5: toplam ekranı**

`src/components/TotalView.svelte`:
```svelte
<script lang="ts">
  import { aggregate } from '../lib/aggregate';
  import { store } from '../lib/state.svelte';

  const totals = $derived(aggregate(store.state));

  let editingId = $state<string | null>(null);
  let draftName = $state('');
  let error = $state<string | null>(null);

  function startEdit(id: string, name: string) {
    editingId = id;
    draftName = name;
    error = null;
  }
  function commit() {
    if (editingId === null) return;
    const err = store.renameMaterial(editingId, draftName);
    if (err) {
      error = err;
      return;
    }
    editingId = null;
  }
  function cancel() {
    editingId = null;
    error = null;
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') cancel();
  }
</script>

{#if totals.length === 0}
  <p class="muted center">Toplanacak malzeme yok. Yapılmamış yapı ekleyince burada görünür.</p>
{:else}
  <ul class="card">
    {#each totals as t (t.material.id)}
      <li data-testid="total-row" class="total-row">
        {#if editingId === t.material.id}
          <div class="field">
            <div class="row">
              <input type="text" bind:value={draftName} {onkeydown} aria-label="Malzeme adı" />
              <button class="primary" onclick={commit}>Kaydet</button>
              <button onclick={cancel}>Vazgeç</button>
            </div>
            {#if error}<p class="notice error">{error}</p>{/if}
          </div>
        {:else}
          <div class="row between">
            <details>
              <summary>
                <span class="name">{t.material.name}</span>
                <strong class="total">{t.total}</strong>
              </summary>
              <ul class="sources">
                {#each t.sources as s (s.buildingId)}
                  <li class="muted">{s.buildingName}: {s.amount}</li>
                {/each}
              </ul>
            </details>
            <button class="icon" aria-label="{t.material.name} adını düzenle" onclick={() => startEdit(t.material.id, t.material.name)}>Düzenle</button>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .total-row { padding: 6px 0; border-bottom: 1px solid var(--line); }
  .total-row:last-child { border-bottom: 0; }
  details { flex: 1; min-width: 0; }
  summary { display: flex; justify-content: space-between; gap: 12px; cursor: pointer; min-height: 44px; align-items: center; }
  .total { font-size: 1.2rem; color: var(--accent); }
  .sources { padding: 0 0 8px 12px; display: grid; gap: 2px; }
</style>
```

- [ ] **Step 6: ayarlar ekranı**

`src/components/SettingsView.svelte`:
```svelte
<script lang="ts">
  import { store } from '../lib/state.svelte';
  import { parseImport } from '../lib/storage';

  let showKey = $state(false);
  let message = $state<{ kind: 'ok' | 'error'; text: string } | null>(null);

  function exportFile() {
    const blob = new Blob([store.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gk2-companion-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const parsed = parseImport(await file.text());
      if (!confirm('Mevcut liste, içe aktarılan dosyayla değiştirilecek. Devam edilsin mi?')) return;
      store.replaceState(parsed);
      message = { kind: 'ok', text: 'Veriler içe aktarıldı.' };
    } catch (err) {
      message = { kind: 'error', text: err instanceof Error ? err.message : 'İçe aktarılamadı.' };
    }
  }
</script>

<section class="card">
  <h2>Yapay zeka</h2>
  <div class="field">
    <label for="apikey">DeepSeek API anahtarı</label>
    <div class="row">
      <input
        id="apikey"
        type={showKey ? 'text' : 'password'}
        autocomplete="off"
        spellcheck="false"
        value={store.settings.apiKey}
        oninput={(e) => store.setSettings({ apiKey: e.currentTarget.value })}
      />
      <button onclick={() => (showKey = !showKey)}>{showKey ? 'Gizle' : 'Göster'}</button>
    </div>
    <p class="muted">Anahtar yalnızca bu cihazda saklanır ve sadece api.deepseek.com'a gönderilir.</p>
  </div>
  <div class="field">
    <label for="model">Model adı</label>
    <input
      id="model"
      type="text"
      autocomplete="off"
      spellcheck="false"
      value={store.settings.model}
      oninput={(e) => store.setSettings({ model: e.currentTarget.value })}
    />
  </div>
</section>

<section class="card">
  <h2>Veriler</h2>
  <p class="muted">Yedek dosyası yapıları ve malzemeleri içerir; API anahtarını içermez.</p>
  <div class="row wrap">
    <button onclick={exportFile}>Dışa aktar (JSON)</button>
    <label class="import">
      <span class="btn">İçe aktar (JSON)</span>
      <input type="file" accept="application/json,.json" hidden onchange={importFile} />
    </label>
  </div>
  {#if message}<p class="notice {message.kind}">{message.text}</p>{/if}
</section>

<style>
  .import { cursor: pointer; }
  .btn {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0.55rem 0.9rem;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  .import:hover .btn { border-color: var(--accent); }
</style>
```

- [ ] **Step 7: uygulama kabuğu**

`src/App.svelte`:
```svelte
<script lang="ts">
  import BuildingsView from './components/BuildingsView.svelte';
  import SettingsView from './components/SettingsView.svelte';
  import Tabs from './components/Tabs.svelte';
  import TotalView from './components/TotalView.svelte';
  import { store } from './lib/state.svelte';
  import type { Tab } from './lib/types';

  let tab = $state<Tab>('buildings');
  let scanFile = $state<File | null>(null);
</script>

<div class="container shell">
  <header><h1>GK2 Companion</h1></header>
  <Tabs bind:tab />
  <main>
    {#if store.corrupt}
      <div class="notice warn">
        Kayıtlı veri okunamadı, boş listeyle başlandı. Eski veri tarayıcıda yedeklendi.
        <button onclick={() => store.dismissCorrupt()}>Tamam</button>
      </div>
    {/if}
    {#if store.saveFailed}
      <div class="notice error">Veri kaydedilemedi (depolama dolu veya kapalı). Değişiklikler kaybolabilir.</div>
    {/if}

    {#if tab === 'buildings'}
      <BuildingsView onscan={(file) => (scanFile = file)} />
    {:else if tab === 'total'}
      <TotalView />
    {:else}
      <SettingsView />
    {/if}
  </main>
</div>
```
(`ScanFlow` Task 12'de buraya eklenir; `scanFile` şimdilik kullanılmıyor, `svelte-check` uyarısı önemsizdir.)

- [ ] **Step 8: doğrula**

Run: `npm run check && npm run build`
Expected: 0 hata, build başarılı.

Run: `npm run dev` ve tarayıcıda `http://localhost:5173` aç. Kontrol: üç sekme geçişi çalışıyor; mobil genişlikte (DevTools 390px) sekmeler altta, masaüstünde (≥720px) içerik 800px'i geçmiyor ve sekmeler başlığın altında; Ayarlar'da anahtar göster/gizle çalışıyor; sayfa yenilenince ayarlar korunuyor. Sunucuyu kapat.

- [ ] **Step 9: Commit**

```bash
git add src
git commit -m "feat: uygulama kabuğu, yapı listesi, toplam ve ayarlar ekranları" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Görsel düzenleyici (`ImageEditor.svelte`)

**Files:**
- Create: `src/components/ImageEditor.svelte`

**Interfaces:**
- Consumes: `drawCrop`, `renderToDataUrl` (`image.ts`); `image-math.ts`.
- Produces: `ImageEditor` props `{ bitmap: ImageBitmap; oncancel: () => void; oncontinue: (dataUrl: string) => void }`. Düğme adları (e2e): "Sola döndür", "Sağa döndür", "Sıfırla", "İptal", "Devam". Kadraj `data-testid="frame"`.

- [ ] **Step 1: bileşeni yaz**

`src/components/ImageEditor.svelte`:
```svelte
<script lang="ts">
  import { drawCrop, renderToDataUrl } from '../lib/image';
  import {
    MAX_ZOOM,
    initialView,
    panBy,
    rotate,
    rotatedSize,
    zoomAt,
    type Rotation,
    type View,
  } from '../lib/image-math';

  let {
    bitmap,
    oncancel,
    oncontinue,
  }: { bitmap: ImageBitmap; oncancel: () => void; oncontinue: (dataUrl: string) => void } = $props();

  const PREVIEW_W = 1000;

  let rot = $state<Rotation>(0);
  const size = $derived(rotatedSize(bitmap.width, bitmap.height, rot));
  let view = $state<View>({ zoom: 1, cx: 0, cy: 0 });
  let canvas = $state<HTMLCanvasElement>();
  let error = $state<string | null>(null);

  function resetView() {
    view = initialView(size.w, size.h);
  }
  resetView();

  function turn(dir: 1 | -1) {
    rot = rotate(rot, dir);
    resetView();
  }

  $effect(() => {
    if (!canvas) return;
    const w = PREVIEW_W;
    const h = Math.max(1, Math.round((PREVIEW_W * size.h) / size.w));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) drawCrop(ctx, bitmap, rot, view, w, h);
  });

  const pointers = new Map<number, { x: number; y: number }>();
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  function onpointerdown(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  function onpointermove(e: PointerEvent) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before = [...pointers.values()];
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const after = [...pointers.values()];
    if (before.length === 1) {
      view = panBy(view, (e.clientX - prev.x) / rect.width, (e.clientY - prev.y) / rect.height, size.w, size.h);
    } else if (before.length === 2) {
      const d0 = dist(before[0], before[1]);
      const d1 = dist(after[0], after[1]);
      const mx = (after[0].x + after[1].x) / 2;
      const my = (after[0].y + after[1].y) / 2;
      if (d0 > 0) {
        view = zoomAt(view, (view.zoom * d1) / d0, (mx - rect.left) / rect.width, (my - rect.top) / rect.height, size.w, size.h);
      }
    }
  }
  function onpointerup(e: PointerEvent) {
    pointers.delete(e.pointerId);
  }
  function onwheel(e: WheelEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    view = zoomAt(view, view.zoom * factor, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height, size.w, size.h);
  }

  function proceed() {
    error = null;
    try {
      oncontinue(renderToDataUrl(bitmap, rot, view));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Görsel hazırlanamadı.';
    }
  }
</script>

<section class="editor">
  <h2>Görseli düzenle</h2>
  <p class="muted">İki parmakla yakınlaştır, sürükleyerek kaydır. Sadece menü satırlarını kadraja al.</p>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="frame"
    data-testid="frame"
    style:--ar={size.w / size.h}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
    {onwheel}
  >
    <canvas bind:this={canvas}></canvas>
  </div>

  <div class="tools">
    <div class="row wrap">
      <button onclick={() => turn(-1)}>Sola döndür</button>
      <button onclick={() => turn(1)}>Sağa döndür</button>
      <button onclick={resetView}>Sıfırla</button>
    </div>
    <div class="field">
      <label for="zoom">Yakınlaştırma</label>
      <input
        id="zoom"
        type="range"
        min="1"
        max={MAX_ZOOM}
        step="0.05"
        value={view.zoom}
        oninput={(e) => (view = zoomAt(view, Number(e.currentTarget.value), 0.5, 0.5, size.w, size.h))}
      />
    </div>
  </div>

  {#if error}<p class="notice error">{error}</p>{/if}

  <div class="row between">
    <button onclick={oncancel}>İptal</button>
    <button class="primary" onclick={proceed}>Devam</button>
  </div>
</section>

<style>
  .editor { display: grid; gap: 12px; }
  .frame {
    touch-action: none;
    width: min(100%, calc(60dvh * var(--ar)));
    aspect-ratio: var(--ar);
    margin: 0 auto;
    background: #000;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    cursor: grab;
  }
  canvas { display: block; width: 100%; height: 100%; }
  .tools { display: grid; gap: 10px; }
</style>
```

- [ ] **Step 2: tip kontrolü**

Run: `npm run check`
Expected: 0 hata. (`a11y` uyarısı için `svelte-ignore` satırı bırakıldı; başka uyarı çıkarsa mesajı okuyup gerekirse aynı şekilde yorumla bastır, davranışı değiştirme.)

- [ ] **Step 3: Commit** (elle doğrulama Task 12'de ScanFlow bağlandıktan sonra yapılır)

```bash
git add src
git commit -m "feat: görsel düzenleyici (döndürme, yakınlaştırma, kaydırma)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: İnceleme ekranı ve tarama akışı (`ReviewScreen`, `ScanFlow`)

**Files:**
- Create: `src/components/ReviewScreen.svelte`, `src/components/ScanFlow.svelte`
- Modify: `src/App.svelte`

**Interfaces:**
- Consumes: `validateDraft`, `normalizeName`, `scanToDraft` (`merge.ts`); `createDeepSeekProvider`, `ScanError`; `loadImage`; `store`; `ImageEditor`.
- Produces: `ReviewScreen` props `{ draft: ReviewDraft (bindable); appState: AppState; onconfirm: () => void; oncancel: () => void }`; `ScanFlow` props `{ file: File; onclose: () => void; onopensettings: () => void }`.
- e2e sözleşmesi: `data-testid="review-building"` (her yapı bölümü), `data-testid="review-new-material"` (her yeni malzeme satırı); rozet metinleri "Yeni" ve "Mevcut kayıt güncellenecek"; düğmeler "Listeye ekle", "İptal".

- [ ] **Step 1: `ReviewScreen.svelte`**

```svelte
<script lang="ts">
  import { normalizeName, validateDraft } from '../lib/merge';
  import type { AppState, ReviewBuilding, ReviewDraft, ReviewNewMaterial, ReviewRequirement } from '../lib/types';

  let {
    draft = $bindable(),
    appState,
    onconfirm,
    oncancel,
  }: { draft: ReviewDraft; appState: AppState; onconfirm: () => void; oncancel: () => void } = $props();

  const error = $derived(validateDraft(draft, appState));

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
    return n !== '' && appState.buildings.some((b) => normalizeName(b.name) === n);
  };
  const newLabel = (nm: ReviewNewMaterial) => nm.name.trim() || '(adsız yeni malzeme)';
  const rowValue = (r: ReviewRequirement) => (r.materialId ? `m:${r.materialId}` : `n:${r.newKey}`);

  function setRowMaterial(r: ReviewRequirement, value: string) {
    if (value.startsWith('m:')) {
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
</script>

<section class="review">
  <h2>Sonucu kontrol et</h2>
  <p class="muted">
    Küçük pikselli rakamlarda hata olabilir. Adları ve miktarları düzelt, gerekmeyen satırları çıkar.
  </p>

  {#if visibleNew.length > 0}
    <div class="card">
      <h3>Yeni malzemeler</h3>
      <p class="muted">AI ikon adı bilmez, kendi önerisini yazdı. Adı değiştirebilir veya mevcut bir malzemeyle eşleştirebilirsin.</p>
      {#each visibleNew as nm (nm.key)}
        <div class="field new-material" data-testid="review-new-material">
          <div class="row wrap">
            <input type="text" aria-label="Yeni malzeme adı" bind:value={nm.name} disabled={nm.mapTo !== null} />
            <select
              aria-label="{newLabel(nm)} için mevcut malzeme"
              value={nm.mapTo ?? ''}
              onchange={(e) => (nm.mapTo = e.currentTarget.value || null)}
            >
              <option value="">Yeni malzeme olarak ekle</option>
              {#each appState.materials as m (m.id)}
                <option value={m.id}>Eşleştir: {m.name}</option>
              {/each}
            </select>
          </div>
          {#if nm.description}<p class="muted">İkon tarifi: {nm.description}</p>{/if}
        </div>
      {/each}
    </div>
  {/if}

  {#each draft.buildings as b (b.key)}
    <div class="card" data-testid="review-building" class:excluded={!b.include}>
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
</section>

<style>
  .review { display: grid; gap: 12px; }
  .excluded { opacity: 0.55; }
  .row > input[type='text'] { flex: 1; min-width: 10ch; }
  .row > select { flex: 1; min-width: 10ch; }
  .amount { width: 6rem !important; flex: 0 0 auto; }
  .req { padding-left: 4px; }
  .actions { position: sticky; bottom: 0; background: var(--bg); padding: 8px 0; }
</style>
```

- [ ] **Step 2: `ScanFlow.svelte`**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createDeepSeekProvider } from '../lib/ai/deepseek';
  import { ScanError } from '../lib/ai/provider';
  import { loadImage } from '../lib/image';
  import { scanToDraft } from '../lib/merge';
  import { store } from '../lib/state.svelte';
  import { DEFAULT_MODEL } from '../lib/storage';
  import type { ReviewDraft } from '../lib/types';
  import ImageEditor from './ImageEditor.svelte';
  import ReviewScreen from './ReviewScreen.svelte';

  let { file, onclose, onopensettings }: { file: File; onclose: () => void; onopensettings: () => void } = $props();

  type Step =
    | { kind: 'loading' }
    | { kind: 'edit' }
    | { kind: 'scanning' }
    | { kind: 'empty' }
    | { kind: 'error'; message: string; code: string | null }
    | { kind: 'review' };

  let step = $state<Step>({ kind: 'loading' });
  let draft = $state<ReviewDraft>({ buildings: [], newMaterials: [] });
  let bitmap = $state.raw<ImageBitmap | null>(null);
  let imageDataUrl = '';
  let controller: AbortController | null = null;

  onMount(() => {
    loadImage(file)
      .then((b) => {
        bitmap = b;
        step = { kind: 'edit' };
      })
      .catch((err: unknown) => {
        step = { kind: 'error', message: err instanceof Error ? err.message : 'Görsel açılamadı.', code: null };
      });
    return () => {
      controller?.abort();
      bitmap?.close();
    };
  });

  async function runScan() {
    if (!store.settings.apiKey.trim()) {
      step = { kind: 'error', message: 'Ayarlardan API anahtarı gir.', code: 'no-key' };
      return;
    }
    step = { kind: 'scanning' };
    controller = new AbortController();
    try {
      const provider = createDeepSeekProvider({
        apiKey: store.settings.apiKey,
        model: store.settings.model.trim() || DEFAULT_MODEL,
      });
      const result = await provider.scan({
        imageDataUrl,
        knownMaterials: $state.snapshot(store.state.materials),
        signal: controller.signal,
      });
      if (result.buildings.length === 0) {
        step = { kind: 'empty' };
        return;
      }
      draft = scanToDraft(result, $state.snapshot(store.state));
      step = { kind: 'review' };
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      step = {
        kind: 'error',
        message: e instanceof ScanError ? e.message : 'Beklenmeyen bir hata oluştu.',
        code: e instanceof ScanError ? e.code : null,
      };
    }
  }

  function onContinue(dataUrl: string) {
    imageDataUrl = dataUrl;
    void runScan();
  }

  function cancelScanning() {
    controller?.abort();
    onclose();
  }

  function confirm() {
    store.applyScan($state.snapshot(draft));
    onclose();
  }
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label="Tarama">
  <div class="overlay-inner">
    {#if step.kind === 'loading'}
      <p class="center">Görsel açılıyor…</p>
    {:else if step.kind === 'edit' && bitmap}
      <ImageEditor {bitmap} oncancel={onclose} oncontinue={onContinue} />
    {:else if step.kind === 'scanning'}
      <div class="center" role="status">
        <div class="spinner"></div>
        <p>Yapay zeka görseli okuyor…</p>
      </div>
      <button onclick={cancelScanning}>Vazgeç</button>
    {:else if step.kind === 'empty'}
      <p class="notice">Yapı bulunamadı, daha net çek.</p>
      <div class="row wrap">
        <button class="primary" onclick={() => (step = { kind: 'edit' })}>Görseli düzenle</button>
        <button onclick={onclose}>Kapat</button>
      </div>
    {:else if step.kind === 'error'}
      <p class="notice error" role="alert">{step.message}</p>
      <div class="row wrap">
        {#if step.code === 'no-key' || step.code === 'auth'}
          <button class="primary" onclick={onopensettings}>Ayarlara git</button>
        {:else if imageDataUrl}
          <button class="primary" onclick={runScan}>Tekrar dene</button>
        {/if}
        {#if bitmap}<button onclick={() => (step = { kind: 'edit' })}>Görseli düzenle</button>{/if}
        <button onclick={onclose}>Kapat</button>
      </div>
    {:else if step.kind === 'review'}
      <ReviewScreen bind:draft appState={store.state} onconfirm={confirm} oncancel={onclose} />
    {/if}
  </div>
</div>
```

- [ ] **Step 3: `App.svelte`'e bağla**

`src/App.svelte` içinde import listesine `import ScanFlow from './components/ScanFlow.svelte';` ekle; `</div>` kapanışından sonra (dosyanın sonuna) şunu ekle:
```svelte
{#if scanFile}
  <ScanFlow
    file={scanFile}
    onclose={() => (scanFile = null)}
    onopensettings={() => {
      scanFile = null;
      tab = 'settings';
    }}
  />
{/if}
```

- [ ] **Step 4: doğrula**

Run: `npm run check && npm run build`
Expected: 0 hata, build başarılı.

Elle kontrol (`npm run dev`, gerçek anahtar yoksa Ayarlar'a rastgele bir anahtar yaz): `docs/samples/insa-menusu-1.png`'yi "Galeriden seç" ile yükle → düzenleyici açılır; döndür/yakınlaştır/sıfırla çalışır; "Devam" → "Yapay zeka görseli okuyor…" → sahte anahtarla "API anahtarı geçersiz." ve "Ayarlara git" görünür. Anahtarı silip tekrar dene: "Ayarlardan API anahtarı gir.".

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: tarama akışı ve inceleme ekranı" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: PWA

**Files:**
- Create: `public/icon.svg`, `pwa-assets.config.ts`
- Modify: `vite.config.ts`, `index.html`, `src/main.ts`, `src/vite-env.d.ts`, `tsconfig.json`
- Generated: `public/favicon.ico`, `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`

**Interfaces:**
- Produces: kurulabilir PWA (`dist/manifest.webmanifest`, `dist/sw.js`).

- [ ] **Step 1: kaynak ikon**

`public/icon.svg` (mezar taşı + haç, koyu zemin):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#14110f"/>
  <path d="M156 400V232a100 100 0 0 1 200 0v168z" fill="#2a231d" stroke="#c9a24b" stroke-width="14" stroke-linejoin="round"/>
  <path d="M256 190v120M212 232h88" stroke="#c9a24b" stroke-width="18" stroke-linecap="round"/>
  <path d="M120 400h272" stroke="#c9a24b" stroke-width="14" stroke-linecap="round"/>
</svg>
```

`pwa-assets.config.ts`:
```ts
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/icon.svg'],
});
```

- [ ] **Step 2: ikonları üret**

Run: `npm run icons`
Expected: `public/` altında `favicon.ico`, `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png` oluşur. (`sharp` kurulamazsa hata mesajını oku; ikonlar başka bir araçla bu adlarla üretilebilir, sonraki adımlar sadece dosya adlarına bağlıdır.)

- [ ] **Step 3: Vite yapılandırması**

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'GK2 Companion',
        short_name: 'GK2',
        description: 'Graveyard Keeper 2 inşa malzemesi takipçisi',
        lang: 'tr',
        display: 'standalone',
        background_color: '#14110f',
        theme_color: '#14110f',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

`index.html` `<head>` içine, `<title>`'dan önce ekle:
```html
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" href="/icon.svg" sizes="any" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
```

`src/vite-env.d.ts`:
```ts
/// <reference types="svelte" />
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
```

`src/main.ts` (üst kısma import, `mount`'tan sonra kayıt):
```ts
import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import './app.css';
import App from './App.svelte';
import { store } from './lib/state.svelte';

store.init();
mount(App, { target: document.getElementById('app')! });
registerSW({ immediate: true });
```

`tsconfig.json` `include` dizisine `"pwa-assets.config.ts"` ekle.

- [ ] **Step 4: doğrula**

Run: `npm run check && npm run build`
Expected: 0 hata; `dist/manifest.webmanifest` ve `dist/sw.js` var.

Run: `npm run preview -- --port 4173 &` ardından
`curl -s http://localhost:4173/manifest.webmanifest | head -c 400` ve `curl -sI http://localhost:4173/sw.js | head -1`
Expected: manifest içinde `"name":"GK2 Companion"` ve `"lang":"tr"`; `sw.js` için `HTTP/1.1 200`. Sonra `kill %1` (preview sürecini kapat).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: PWA (manifest, service worker, ikonlar)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Uçtan uca (e2e) test

**Files:**
- Create: `playwright.config.ts`, `e2e/flow.spec.ts`
- Modify: `tsconfig.json` (`include`'a `playwright.config.ts`, `e2e/**/*.ts`)

**Interfaces:**
- Consumes: Task 10-12'deki erişilebilir adlar ve `data-testid` değerleri; `docs/samples/insa-menusu-1.png`.
- DeepSeek isteği `page.route` ile sahte cevaba çevrilir (gerçek anahtar/ağ gerekmez).

- [ ] **Step 1: Playwright'ı kur**

Run: `npx playwright install chromium`
Expected: Chromium iner. İnmezse (sistem bağımlılığı/ağ) durup nedenini raporla; e2e adımları atlanır ve Task 15'teki elle doğrulama kontrol listesi tam uygulanır.

- [ ] **Step 2: yapılandırma**

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
  },
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
```
`tsconfig.json` `include` dizisine `"playwright.config.ts"` ve `"e2e/**/*.ts"` ekle.

- [ ] **Step 3: testi yaz**

`e2e/flow.spec.ts`:
```ts
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const SAMPLE = path.resolve('docs/samples/insa-menusu-1.png');

const req = (suggestedName: string, description: string) => (amount: number) => ({
  materialId: null,
  suggestedName,
  description,
  amount,
});
const TAHTA = req('Tahta', 'light brown plank');
const CIVI = req('Çivi', 'gold nails');
const KERESTE = req('Kereste', 'dark rough plank');
const TAS = req('Taş', 'grey stone block');

const SCAN = {
  buildings: [
    { name: 'Basit Sandık', requirements: [TAHTA(4), CIVI(4)] },
    { name: 'Kiliseyi Geliştir I', requirements: [KERESTE(8), TAS(6)] },
    { name: 'İç Mekân Bankı I', requirements: [TAHTA(2), CIVI(6)] },
    { name: 'Günah Çıkarma Kabini I', requirements: [TAHTA(6), CIVI(8)] },
    { name: 'Kilise Sunağı I', requirements: [TAHTA(4), CIVI(6), TAS(3)] },
  ],
};

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'POST',
};

test.beforeEach(async ({ page }) => {
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
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(SCAN) } }] }),
    });
  });
});

async function scanSample(page: Page) {
  await page.locator('input[type=file]:not([capture])').first().setInputFiles(SAMPLE);
  await page.getByRole('button', { name: 'Devam' }).click();
  await expect(page.getByTestId('review-building')).toHaveCount(5);
}

async function expectTotal(page: Page, name: string, total: number) {
  await expect(page.getByTestId('total-row').filter({ hasText: name })).toContainText(String(total));
}

test('tara, incele, listele, adedi artır, tekrar tara, yenile', async ({ page }) => {
  await page.goto('/');

  // 1. tarama: 5 yeni yapı, 4 yeni malzeme (Çivi tek malzeme)
  await scanSample(page);
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

  // 2. tarama (aynı görsel): kopya açılmaz, adet korunur
  await page.getByRole('button', { name: 'Yapılar' }).click();
  await scanSample(page);
  await expect(page.getByText('Mevcut kayıt güncellenecek')).toHaveCount(5);
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  await expect(page.locator('article.building')).toHaveCount(5);
  await page.getByRole('button', { name: 'Toplam' }).click();
  await expectTotal(page, 'Tahta', 20);
  const materialCount = await page.evaluate(() => JSON.parse(localStorage.getItem('gk2c.state')!).materials.length);
  expect(materialCount).toBe(4);

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
  await page.locator('input[type=file]:not([capture])').first().setInputFiles(SAMPLE);
  await page.getByRole('button', { name: 'Devam' }).click();
  await expect(page.getByText('Ayarlardan API anahtarı gir.')).toBeVisible();
  await page.getByRole('button', { name: 'Ayarlara git' }).click();
  await expect(page.getByLabel('DeepSeek API anahtarı')).toBeVisible();
});
```

- [ ] **Step 4: testleri çalıştır**

Run: `npm run e2e`
Expected: her iki projede (`desktop`, `mobile`) 3 test PASS. Hata çıkarsa **önce** ilgili bileşeni düzelt (test sözleşmesi Task 10-12'deki erişilebilir adlardır), testi gevşetme. Sık nedenler: `getByText('Yeni', { exact: true })` başka bir "Yeni" metniyle çakışırsa rozeti `.badge.new` seçicisine çevir; mobil projede sabit alt sekme çubuğu tıklamayı engellerse `page.getByRole(...).click()` öncesinde `scrollIntoViewIfNeeded()` ekle.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: tarama akışı için uçtan uca testler" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 15: README ve gerçek API ile elle doğrulama

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: her şey.

- [ ] **Step 1: `README.md`**

```markdown
# GK2 Companion

Graveyard Keeper 2 inşa menüsünü (ekran görüntüsü veya telefon fotoğrafı) yapay zeka ile okuyup hangi yapı için hangi malzemeden kaç tane gerektiğini listeleyen PWA.

## Kullanım

1. Ayarlar sekmesine DeepSeek API anahtarını gir (model: `deepseek-flash`).
2. Yapılar sekmesinde **Tara (kamera)** veya **Galeriden seç**.
3. Görseli döndür/yakınlaştır, **Devam**.
4. AI sonucunu kontrol et, düzelt, **Listeye ekle**.
5. Toplam sekmesinde gereken toplam malzemeyi gör. Yapı bitince "Yapıldı" işaretle.

Veriler ve API anahtarı yalnızca bu cihazın tarayıcısında saklanır. Ayarlar > Dışa aktar ile yedek alınabilir (anahtar yedeğe girmez).

## Geliştirme

    npm install
    npm run dev        # geliştirme sunucusu
    npm test           # birim testleri
    npm run e2e        # uçtan uca testler (Playwright)
    npm run check      # tip kontrolü
    npm run build      # dist/ üretir
    npm run icons      # public/icon.svg'den PWA ikonlarını üretir

## Yayınlama (statik)

- **Cloudflare Pages:** build komutu `npm run build`, çıktı klasörü `dist`.
- **GitHub Pages:** `BASE_PATH=/depo-adi/ npm run build`, `dist/` klasörünü yayınla.

Telefonda siteyi açıp tarayıcı menüsünden "Ana ekrana ekle" ile kur. Kamera özelliği HTTPS gerektirir (yayınlanan siteler HTTPS'tir).
```

- [ ] **Step 2: tüm otomatik kontrolleri çalıştır**

Run: `npm test && npm run check && npm run build`
Expected: tüm testler PASS, 0 tip hatası, build başarılı.

- [ ] **Step 3: gerçek anahtarla elle doğrulama (kullanıcıdan anahtar iste)**

Kullanıcıdan DeepSeek API anahtarını **kendisinin** girmesini iste (anahtarı sohbete yazmasına gerek yok). `npm run dev` ile:
- [ ] `docs/samples/insa-menusu-1.png` taranır; inceleme ekranında 5 yapı ve doğru miktarlar var (Basit Sandık 4/4, Kiliseyi Geliştir I 8/6, İç Mekân Bankı I 2/6, Günah Çıkarma Kabini I 6/8, Kilise Sunağı I 4/6/3). Sahip olunan sayılar (`21` vb.) miktar olarak alınmamış.
- [ ] Açık renkli ve koyu tahta iki ayrı malzeme olarak önerilmiş.
- [ ] "Listeye ekle" sonrası Toplam: Tahta 16, Çivi 24, Taş 9, (koyu tahta) 8.
- [ ] Aynı görsel ikinci kez taranınca 5 yapı "Mevcut kayıt güncellenecek", yeni malzeme açılmıyor (bilinen malzemeler AI'a gönderiliyor).
- [ ] Bir malzemeyi yeniden adlandır, ardından tekrar tara: yeni ad korunuyor.
- [ ] `response_format` davranışı: tarayıcı ağ sekmesinde ilk isteğin 200 döndüğüne veya 400 sonrası ikinci isteğin 200 döndüğüne bak; sonucu spec §12'deki açık maddeye not düş.
- [ ] Telefon (aynı ağdan `npm run dev -- --host` veya yayınlanmış site): kamera açılıyor, dikey çekilen fotoğraf doğru yönde geliyor, iki parmakla yakınlaştırma ve döndürme çalışıyor, sekmeler altta.
- [ ] Yayınlanmış sitede "Ana ekrana ekle" sunuluyor; uçak modunda liste ve toplam açılıyor, "Tara" devre dışı.

Bulgular (özellikle rakam okuma doğruluğu ve `response_format`) `docs/superpowers/specs/2026-09-29-gk2-companion-design.md` §12'ye kısa bir "Sonuç" notu olarak eklenir. Okuma doğruluğu yetersizse `src/lib/ai/prompt.ts` içindeki `SYSTEM_PROMPT` iyileştirilir ve `prompt.test.ts` güncellenir.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: README ve doğrulama notları" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
