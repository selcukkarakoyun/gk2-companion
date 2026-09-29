import { describe, expect, it } from 'vitest';
import { ScanFormatError, parseScanResponse } from './parse';

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

describe('parseScanResponse', () => {
  it("geçerli JSON'u ayrıştırır", () => {
    expect(parseScanResponse(JSON.stringify(good))).toEqual(good);
  });

  it("kod çitli JSON'u ayrıştırır", () => {
    expect(parseScanResponse('```json\n' + JSON.stringify(good) + '\n```')).toEqual(good);
  });

  it("çevresinde düz yazı olan JSON'u ayrıştırır", () => {
    expect(parseScanResponse('İşte sonuç: ' + JSON.stringify(good) + ' umarım yardımcı olur')).toEqual(good);
  });

  it('boş yapı listesini kabul eder', () => {
    expect(parseScanResponse('{"buildings":[]}')).toEqual({ area: null, buildings: [] });
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
      box: null,
    });
  });

  it('"null" metnini null sayar', () => {
    const r = parseScanResponse(
      '{"buildings":[{"name":"A","requirements":[{"materialId":"null","suggestedName":"Taş","description":"x","amount":1}]}]}',
    );
    expect(r.buildings[0].requirements[0].materialId).toBeNull();
  });

  it.each([0, -2, 1.5, '0', 'dört', null])('geçersiz miktar tüm cevabı atmaz, NaN olur (%s)', (amount) => {
    const text = JSON.stringify({
      buildings: [
        { name: 'A', requirements: [{ materialId: 'm', amount }, { materialId: 'm2', amount: 3 }] },
        { name: 'B', requirements: [{ materialId: 'm', amount: 1 }] },
      ],
    });
    const r = parseScanResponse(text);
    expect(r.buildings).toHaveLength(2);
    expect(r.buildings[0].requirements[0].amount).toBeNaN();
    expect(r.buildings[0].requirements[1].amount).toBe(3);
  });

  it.each([['21/4', 4], ['0/6', 6], [' 21 / 8 ', 8]])('sahip/gereken biçimini (%s) gereken sayıya çevirir', (amount, expected) => {
    const r = parseScanResponse(JSON.stringify({ buildings: [{ name: 'A', requirements: [{ materialId: 'm', amount }] }] }));
    expect(r.buildings[0].requirements[0].amount).toBe(expected);
  });

  it('id ve isim ikisi de yoksa satırı korur', () => {
    const text = JSON.stringify({ buildings: [{ name: 'A', requirements: [{ materialId: null, amount: 1 }] }] });
    expect(parseScanResponse(text).buildings[0].requirements[0]).toEqual({
      materialId: null,
      suggestedName: null,
      description: null,
      amount: 1,
      box: null,
    });
  });

  it('boş yapı adını korur (inceleme ekranında düzeltilir)', () => {
    const r = parseScanResponse(JSON.stringify({ buildings: [{ name: ' ', requirements: [] }] }));
    expect(r.buildings[0].name).toBe('');
  });

  it('requirements eksikse boş dizi sayar', () => {
    const r = parseScanResponse('{"buildings":[{"name":"A"}]}');
    expect(r.buildings[0].requirements).toEqual([]);
  });

  it('yapı nesne değilse hâlâ reddeder', () => {
    expect(() => parseScanResponse('{"buildings":["A"]}')).toThrow(ScanFormatError);
  });

  it.each(['', 'sadece yazı', '{bozuk', '{"buildings": "yok"}', '[]', '{"x":1}'])('geçersiz cevabı reddeder (%s)', (text) => {
    expect(() => parseScanResponse(text)).toThrow(ScanFormatError);
  });
});

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
