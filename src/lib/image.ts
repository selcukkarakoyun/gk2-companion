import {
  MAX_OUTPUT_SIDE,
  boxToRect,
  cropRect,
  iconSize,
  outputSize,
  rotatedSize,
  rotationTransform,
  type Rotation,
  type View,
} from './image-math';
import type { Box } from './types';

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

export async function bitmapFromDataUrl(dataUrl: string): Promise<ImageBitmap> {
  const blob = await (await fetch(dataUrl)).blob();
  return createImageBitmap(blob);
}

export function cropToIcon(bitmap: ImageBitmap, box: Box): string {
  const r = boxToRect(box, bitmap.width, bitmap.height);
  const { w, h } = iconSize(r.w, r.h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas kullanılamıyor.');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}
