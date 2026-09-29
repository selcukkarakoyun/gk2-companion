import type { Box } from './types';

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
