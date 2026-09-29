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
  it("tanımsız mevcut malzeme id'sini reddeder", () => {
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
