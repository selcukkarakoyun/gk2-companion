import type { ScanResult, ScannedBuilding, ScannedRequirement } from '../types';

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

function toAmount(v: unknown): number {
  const n = typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
    throw new ScanFormatError(`Geçersiz miktar: ${JSON.stringify(v)}`);
  }
  return n;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function parseRequirement(raw: unknown): ScannedRequirement {
  if (!isObj(raw)) throw new ScanFormatError('Malzeme satırı nesne değil.');
  const materialId = optString(raw.materialId);
  const suggestedName = optString(raw.suggestedName);
  if (!materialId && !suggestedName) throw new ScanFormatError("Malzeme id'si veya adı yok.");
  return { materialId, suggestedName, description: optString(raw.description), amount: toAmount(raw.amount) };
}

function parseBuilding(raw: unknown): ScannedBuilding {
  if (!isObj(raw)) throw new ScanFormatError('Yapı nesne değil.');
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) throw new ScanFormatError('Yapı adı boş.');
  if (!Array.isArray(raw.requirements)) throw new ScanFormatError('"requirements" dizisi yok.');
  return { name, requirements: raw.requirements.map(parseRequirement) };
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
  return { buildings: raw.buildings.map(parseBuilding) };
}
