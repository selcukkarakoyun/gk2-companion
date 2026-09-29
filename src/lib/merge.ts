import type {
  AppState,
  Building,
  Material,
  Requirement,
  ReviewBuilding,
  ReviewDraft,
  ReviewNewMaterial,
  ScanResult,
} from './types';

export function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');
}

export function scanToDraft(scan: ScanResult, state: AppState): ReviewDraft {
  const known = new Set(state.materials.map((m) => m.id));
  const existingByName = new Map(state.materials.map((m) => [normalizeName(m.name), m.id]));
  const newByName = new Map<string, ReviewNewMaterial>();
  const newMaterials: ReviewNewMaterial[] = [];
  let n = 0;
  const key = (prefix: string) => `${prefix}${++n}`;

  const buildings: ReviewBuilding[] = scan.buildings.map((sb) => ({
    key: key('b'),
    name: sb.name,
    include: true,
    requirements: sb.requirements.map((sr) => {
      if (sr.materialId && known.has(sr.materialId)) {
        return { key: key('r'), materialId: sr.materialId, newKey: null, amount: sr.amount };
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
        };
        newMaterials.push(nm);
        if (norm) newByName.set(norm, nm);
      }
      return { key: key('r'), materialId: null, newKey: nm.key, amount: sr.amount };
    }),
  }));

  return { buildings, newMaterials };
}

/** Satırı, adı boş (kullanıcının dolduracağı) yeni bir malzemeye bağlar. Bilinmeyen satırda taslağa dokunmaz. */
export function newMaterialForRow(draft: ReviewDraft, rowKey: string): void {
  const row = draft.buildings.flatMap((b) => b.requirements).find((r) => r.key === rowKey);
  if (!row) return;
  const taken = new Set(draft.newMaterials.map((m) => m.key));
  let i = draft.newMaterials.length + 1;
  while (taken.has(`u${i}`)) i++;
  const key = `u${i}`;
  draft.newMaterials.push({ key, name: '', description: '', mapTo: null });
  row.materialId = null;
  row.newKey = key;
}

export function validateDraft(draft: ReviewDraft, state: AppState): string | null {
  const included = draft.buildings.filter((b) => b.include);
  if (included.length === 0) return 'Eklenecek yapı yok.';

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
      materials.push({ id, name: nm.name.trim(), description: nm.description.trim() });
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
    const norm = normalizeName(rb.name);
    const existing = buildings.find((b) => normalizeName(b.name) === norm);
    if (existing) {
      existing.requirements = requirements;
    } else {
      buildings.push({
        id: newId(),
        name: rb.name.trim().replace(/\s+/g, ' '),
        qty: 1,
        built: false,
        requirements,
      });
    }
  }

  return { version: 1, materials, buildings };
}
