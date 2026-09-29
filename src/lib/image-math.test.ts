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
  it("zoom 1'de merkezi ortaya sabitler", () => {
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
  it("zoom 1'e dönünce yeniden ortalar", () => {
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
  it("uzun kenarı 1600'e indirir, oranı korur", () => {
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
