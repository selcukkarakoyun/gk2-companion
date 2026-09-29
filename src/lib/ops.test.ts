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
