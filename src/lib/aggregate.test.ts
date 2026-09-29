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
