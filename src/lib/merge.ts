import type {
  AppState,
  Box,
  Building,
  Material,
  Requirement,
  ReviewBuilding,
  ReviewDraft,
  ReviewNewMaterial,
  ReviewRequirement,
  ScanResult,
} from './types';
import { DEFAULT_AREA, PNG_PREFIX } from './storage';

export function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');
}

/** Taslakta dahil edilen satırların (doğrudan veya mapTo ile) kullandığı mevcut malzeme kimlikleri. */
export function usedMaterialIds(draft: ReviewDraft): Set<string> {
  const ids = new Set<string>();
  const newByKey = new Map(draft.newMaterials.map((n) => [n.key, n]));
  for (const b of draft.buildings) {
    if (!b.include) continue;
    for (const r of b.requirements) {
      if (r.materialId) ids.add(r.materialId);
      else if (r.newKey) {
        const nm = newByKey.get(r.newKey);
        if (nm?.mapTo) ids.add(nm.mapTo);
      }
    }
  }
  return ids;
}

/** Önce tam alan+ad eşleşmesi; yoksa (v1 göçünden kalan) "Genel" alanındaki aynı adlı yapı. */
export function findBuilding(buildings: Building[], area: string, name: string): Building | undefined {
  const n = normalizeName(name);
  const a = normalizeName(area);
  const exact = buildings.find((b) => normalizeName(b.area) === a && normalizeName(b.name) === n);
  if (exact) return exact;
  const g = normalizeName(DEFAULT_AREA);
  if (a === g) return undefined;
  return buildings.find((b) => normalizeName(b.area) === g && normalizeName(b.name) === n);
}

const cleanArea = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Mevcut bir alanla (normalize) eşleşiyorsa onun yazımını, yoksa temizlenmiş adı döner. */
function resolveArea(area: string | null | undefined, state: AppState): string {
  const cleaned = cleanArea(area ?? '');
  if (!cleaned) return '';
  const n = normalizeName(cleaned);
  return state.buildings.find((b) => normalizeName(b.area) === n)?.area ?? cleaned;
}

export function scanToDraft(scan: ScanResult, state: AppState): ReviewDraft {
  const known = new Set(state.materials.map((m) => m.id));
  const existingByName = new Map(state.materials.map((m) => [normalizeName(m.name), m.id]));
  const newByName = new Map<string, ReviewNewMaterial>();
  const newMaterials: ReviewNewMaterial[] = [];
  let n = 0;
  const key = (prefix: string) => `${prefix}${++n}`;

  const kept = scan.buildings.filter((sb) => sb.requirements.length > 0);

  const buildings: ReviewBuilding[] = kept.map((sb) => ({
    key: key('b'),
    name: sb.name,
    include: true,
    requirements: sb.requirements.map((sr) => {
      if (sr.materialId && known.has(sr.materialId)) {
        return { key: key('r'), materialId: sr.materialId, newKey: null, amount: sr.amount, box: sr.box };
      }
      const name = (sr.suggestedName ?? '').trim();
      const norm = normalizeName(name);
      let nm = norm ? newByName.get(norm) : undefined;
      if (!nm) {
        nm = {
          key: key('n'),
          name,
          description: (sr.description ?? '').trim(),
          mapTo: (norm && existingByName.get(norm)) || null,
          icon: null,
          box: null,
        };
        newMaterials.push(nm);
        if (norm) newByName.set(norm, nm);
      }
      return { key: key('r'), materialId: null, newKey: nm.key, amount: sr.amount, box: sr.box };
    }),
  }));

  return {
    area: resolveArea(scan.area, state),
    skippedEmpty: scan.buildings.length - kept.length,
    buildings,
    newMaterials,
    iconFills: [],
  };
}

/** Satırı, adı boş (kullanıcının dolduracağı) yeni bir malzemeye bağlar. Bilinmeyen satırda taslağa dokunmaz. */
export function newMaterialForRow(draft: ReviewDraft, rowKey: string): void {
  const row = draft.buildings.flatMap((b) => b.requirements).find((r) => r.key === rowKey);
  if (!row) return;
  const taken = new Set(draft.newMaterials.map((m) => m.key));
  let i = draft.newMaterials.length + 1;
  while (taken.has(`u${i}`)) i++;
  const key = `u${i}`;
  draft.newMaterials.push({ key, name: '', description: '', mapTo: null, icon: null, box: null });
  row.materialId = null;
  row.newKey = key;
}

/** Kutulardan ikon önerileri üretir. Kırpma hatası ikonu null bırakır, çökertmez. */
export function attachIcons(draft: ReviewDraft, state: AppState, crop: (box: Box) => string): void {
  const rows: ReviewRequirement[] = draft.buildings.flatMap((b) => b.requirements);
  const safeCrop = (box: Box): string | null => {
    try {
      return crop(box);
    } catch {
      return null;
    }
  };

  for (const nm of draft.newMaterials) {
    const box = rows.find((r) => r.newKey === nm.key && r.box)?.box ?? null;
    if (box) {
      nm.box = box;
      nm.icon = safeCrop(box);
    }
  }

  const known = new Set(state.materials.map((m) => m.id));
  const hasIcon = new Set(state.materials.filter((m) => m.icon).map((m) => m.id));
  const seen = new Set(draft.iconFills.map((f) => f.materialId));
  const addFill = (materialId: string, box: Box | null) => {
    if (!box || !known.has(materialId) || hasIcon.has(materialId) || seen.has(materialId)) return;
    seen.add(materialId);
    const icon = safeCrop(box);
    draft.iconFills.push({ materialId, icon, box, accept: icon !== null });
  };
  for (const r of rows) if (r.materialId) addFill(r.materialId, r.box);
  for (const nm of draft.newMaterials) if (nm.mapTo) addFill(nm.mapTo, nm.box);
}

export function validateDraft(draft: ReviewDraft, state: AppState): string | null {
  const included = draft.buildings.filter((b) => b.include);
  if (included.length === 0) return 'Eklenecek yapı yok.';
  if (!draft.area.trim()) return 'Alan adı boş.';

  const knownIds = new Set(state.materials.map((m) => m.id));
  const usedNew = new Set<string>();
  for (const b of included) {
    const label = b.name.trim();
    if (!label) return 'Adı boş bir yapı var.';
    if (b.requirements.length === 0) return `"${label}" için malzeme yok.`;
    for (const r of b.requirements) {
      if (!Number.isInteger(r.amount) || r.amount < 1) return `"${label}" içinde geçersiz miktar var.`;
      if (r.materialId) {
        if (!knownIds.has(r.materialId)) return `"${label}" içinde tanımsız malzeme var.`;
      } else if (r.newKey) {
        usedNew.add(r.newKey);
      } else {
        return `"${label}" içinde malzemesi seçilmemiş satır var.`;
      }
    }
  }

  const existingNames = new Set(state.materials.map((m) => normalizeName(m.name)));
  const seen = new Set<string>();
  for (const nm of draft.newMaterials) {
    if (!usedNew.has(nm.key) || nm.mapTo) continue;
    const norm = normalizeName(nm.name);
    if (!norm) return 'Adı boş bir yeni malzeme var.';
    if (existingNames.has(norm)) return `"${nm.name.trim()}" zaten var, mevcut malzemeyle eşleştir.`;
    if (seen.has(norm)) return `"${nm.name.trim()}" iki kez yeni malzeme olarak eklenmiş.`;
    seen.add(norm);
  }
  return null;
}

export function applyDraft(state: AppState, draft: ReviewDraft, newId: () => string): AppState {
  const areaName = resolveArea(draft.area, state);
  const materials: Material[] = state.materials.map((m) => ({ ...m }));
  const buildings: Building[] = state.buildings.map((b) => ({
    ...b,
    requirements: b.requirements.map((r) => ({ ...r })),
  }));
  const newMaterialByKey = new Map(draft.newMaterials.map((nm) => [nm.key, nm]));
  const resolved = new Map<string, string>();

  const resolveNew = (key: string): string => {
    const hit = resolved.get(key);
    if (hit) return hit;
    const nm = newMaterialByKey.get(key);
    if (!nm) throw new Error(`Bilinmeyen yeni malzeme: ${key}`);
    let id: string;
    if (nm.mapTo) {
      id = nm.mapTo;
    } else {
      id = newId();
      materials.push({
        id,
        name: nm.name.trim(),
        description: nm.description.trim(),
        ...(nm.icon && nm.icon.startsWith(PNG_PREFIX) ? { icon: nm.icon } : {}),
      });
    }
    resolved.set(key, id);
    return id;
  };

  for (const rb of draft.buildings) {
    if (!rb.include) continue;
    const merged = new Map<string, number>();
    for (const r of rb.requirements) {
      const materialId = r.materialId ?? resolveNew(r.newKey as string);
      merged.set(materialId, (merged.get(materialId) ?? 0) + r.amount);
    }
    const requirements: Requirement[] = [...merged].map(([materialId, amount]) => ({ materialId, amount }));
    const existing = findBuilding(buildings, areaName, rb.name);
    if (existing) {
      existing.requirements = requirements;
      existing.area = areaName;
    } else {
      buildings.push({
        id: newId(),
        area: areaName,
        name: rb.name.trim().replace(/\s+/g, ' '),
        qty: 1,
        built: false,
        requirements,
      });
    }
  }

  const used = usedMaterialIds(draft);
  for (const fill of draft.iconFills) {
    if (!used.has(fill.materialId)) continue;
    if (!fill.accept || !fill.icon || !fill.icon.startsWith(PNG_PREFIX)) continue;
    const target = materials.find((m) => m.id === fill.materialId);
    if (target && !target.icon) target.icon = fill.icon;
  }

  return { version: 2, materials, buildings };
}
