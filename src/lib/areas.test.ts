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
