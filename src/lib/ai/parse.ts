import type { Box, ScanResult, ScannedBuilding, ScannedRequirement } from '../types';

export class ScanFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScanFormatError';
  }
}

function extractJson(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) throw new ScanFormatError('JSON bulunamadı.');
  return t.slice(start, end + 1);
}

function optString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.toLowerCase() === 'null' || t.toLowerCase() === 'undefined') return null;
  return t;
}

/** Geçersiz miktar NaN olur: cevabın geri kalanı korunur, inceleme ekranı düzeltilene kadar onayı engeller. */
function toAmount(v: unknown): number {
  let n: unknown = v;
  if (typeof v === 'string') {
    // "21/4" (sahip/gereken) gelirse yalnızca gereken kısmı al.
    const m = v.match(/^\s*(?:\d+\s*\/\s*)?(\d+)\s*$/);
    n = m ? Number(m[1]) : Number.NaN;
  }
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 ? n : Number.NaN;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function parseBox(v: unknown): Box | null {
  if (!isObj(v)) return null;
  const { x, y, w, h } = v;
  if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const bx = clamp01(x as number);
  const by = clamp01(y as number);
  const bw = Math.min(w as number, 1 - bx);
  const bh = Math.min(h as number, 1 - by);
  if (bw < 0.005 || bh < 0.005) return null;
  return { x: bx, y: by, w: bw, h: bh };
}

function parseRequirement(raw: unknown): ScannedRequirement {
  if (!isObj(raw)) throw new ScanFormatError('Malzeme satırı nesne değil.');
  return {
    materialId: optString(raw.materialId),
    suggestedName: optString(raw.suggestedName),
    description: optString(raw.description),
    amount: toAmount(raw.amount),
    box: parseBox(raw.box),
  };
}

function parseBuilding(raw: unknown): ScannedBuilding {
  if (!isObj(raw)) throw new ScanFormatError('Yapı nesne değil.');
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const requirements = Array.isArray(raw.requirements) ? raw.requirements.map(parseRequirement) : [];
  return { name, requirements };
}

export function parseScanResponse(text: string): ScanResult {
  let raw: unknown;
  try {
    raw = JSON.parse(extractJson(text));
  } catch (e) {
    if (e instanceof ScanFormatError) throw e;
    throw new ScanFormatError('JSON ayrıştırılamadı.');
  }
  if (!isObj(raw) || !Array.isArray(raw.buildings)) throw new ScanFormatError('"buildings" dizisi yok.');
  return { area: optString(raw.area), buildings: raw.buildings.map(parseBuilding) };
}
