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
  it("bozuk JSON'u yedekler ve boş durumla başlar", () => {
    const kv = memory({ [STATE_KEY]: '{bozuk' });
    const r = loadState(kv);
    expect(r).toEqual({ state: emptyState(), corrupt: true });
    expect(kv.data.get(STATE_BACKUP_KEY)).toBe('{bozuk');
  });
  it('şekli geçersiz veriyi bozuk sayar', () => {
    const kv = memory({ [STATE_KEY]: JSON.stringify({ version: 3, materials: [], buildings: [] }) });
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
    ['tekrarlı yapı id', { version: 1, materials: [mat('m1', 'T')], buildings: [bld('b', 'A', [['m1', 1]]), bld('b', 'B', [['m1', 1]])] }],
    ['aynı malzeme bir yapıda iki satır', { version: 1, materials: [mat('m1', 'T')], buildings: [bld('b', 'A', [['m1', 1], ['m1', 2]])] }],
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
