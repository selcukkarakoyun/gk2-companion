import type { AppState, Building, Material, Requirement, Settings } from './types';

export const STATE_KEY = 'gk2c.state';
export const STATE_BACKUP_KEY = 'gk2c.state.corrupt-backup';
export const SETTINGS_KEY = 'gk2c.settings';
export const DEFAULT_MODEL = 'deepseek-flash';
export const DEFAULT_AREA = 'Genel';

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const emptyState = (): AppState => ({ version: 2, materials: [], buildings: [] });

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const PNG_PREFIX = 'data:image/png;base64,';
const cleanArea = (s: string) => s.trim().replace(/\s+/g, ' ');

export function validateState(raw: unknown): AppState | null {
  if (!isObj(raw) || (raw.version !== 1 && raw.version !== 2)) return null;
  if (!Array.isArray(raw.materials) || !Array.isArray(raw.buildings)) return null;
  const v2 = raw.version === 2;

  const materials: Material[] = [];
  const ids = new Set<string>();
  for (const m of raw.materials) {
    if (!isObj(m) || typeof m.id !== 'string' || !m.id || typeof m.name !== 'string' || ids.has(m.id)) {
      return null;
    }
    let icon: string | undefined;
    if (v2 && m.icon !== undefined) {
      if (typeof m.icon !== 'string' || !m.icon.startsWith(PNG_PREFIX)) return null;
      icon = m.icon;
    }
    ids.add(m.id);
    materials.push({
      id: m.id,
      name: m.name,
      description: typeof m.description === 'string' ? m.description : '',
      ...(icon ? { icon } : {}),
    });
  }

  const buildings: Building[] = [];
  const buildingIds = new Set<string>();
  for (const b of raw.buildings) {
    if (!isObj(b) || typeof b.id !== 'string' || typeof b.name !== 'string' || !Array.isArray(b.requirements)) {
      return null;
    }
    if (!Number.isInteger(b.qty) || (b.qty as number) < 1 || typeof b.built !== 'boolean') return null;
    let area = DEFAULT_AREA;
    if (v2) {
      if (typeof b.area !== 'string' || !cleanArea(b.area)) return null;
      area = cleanArea(b.area);
    }
    // Arayüz yapıları id ile, malzeme satırlarını materialId ile anahtarlar; yinelenen anahtar çizimi çökertir.
    if (buildingIds.has(b.id)) return null;
    buildingIds.add(b.id);
    const requirements: Requirement[] = [];
    const usedMaterials = new Set<string>();
    for (const r of b.requirements) {
      if (
        !isObj(r) ||
        typeof r.materialId !== 'string' ||
        !ids.has(r.materialId) ||
        usedMaterials.has(r.materialId) ||
        !Number.isInteger(r.amount) ||
        (r.amount as number) < 1
      ) {
        return null;
      }
      usedMaterials.add(r.materialId);
      requirements.push({ materialId: r.materialId, amount: r.amount as number });
    }
    buildings.push({ id: b.id, area, name: b.name, qty: b.qty as number, built: b.built, requirements });
  }
  return { version: 2, materials, buildings };
}

export function loadState(kv: KV): { state: AppState; corrupt: boolean } {
  let raw: string | null;
  try {
    raw = kv.getItem(STATE_KEY);
  } catch {
    return { state: emptyState(), corrupt: false };
  }
  if (raw === null) return { state: emptyState(), corrupt: false };
  try {
    const valid = validateState(JSON.parse(raw));
    if (valid) return { state: valid, corrupt: false };
  } catch {
    // bozuk JSON: aşağıda yedeklenir
  }
  try {
    kv.setItem(STATE_BACKUP_KEY, raw);
  } catch {
    // yedek yazılamadı; yine de çalışmaya devam et
  }
  return { state: emptyState(), corrupt: true };
}

export function saveState(kv: KV, state: AppState): boolean {
  try {
    kv.setItem(STATE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(kv: KV): Settings {
  const fallback: Settings = { apiKey: '', model: DEFAULT_MODEL };
  try {
    const raw = kv.getItem(SETTINGS_KEY);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!isObj(parsed)) return fallback;
    const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey : '';
    const model = typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : DEFAULT_MODEL;
    return { apiKey, model };
  } catch {
    return fallback;
  }
}

export function saveSettings(kv: KV, settings: Settings): boolean {
  try {
    kv.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function exportState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function parseImport(text: string): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Dosya geçerli bir GK2 Companion yedeği değil.');
  }
  const valid = validateState(parsed);
  if (!valid) throw new Error('Dosya geçerli bir GK2 Companion yedeği değil.');
  return valid;
}
