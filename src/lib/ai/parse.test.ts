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
