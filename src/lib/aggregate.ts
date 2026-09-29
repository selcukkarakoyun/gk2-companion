import { normalizeName } from './merge';
import type { AppState, Material } from './types';

export type MaterialTotal = {
  material: Material;
  total: number;
  byArea: { area: string; amount: number }[];
  sources: { buildingId: string; buildingName: string; area: string; amount: number }[];
};

function byAreaOf(sources: MaterialTotal['sources']): MaterialTotal['byArea'] {
  const map = new Map<string, { area: string; amount: number }>();
  for (const s of sources) {
    const key = normalizeName(s.area);
    const hit = map.get(key);
    if (hit) hit.amount += s.amount;
    else map.set(key, { area: s.area, amount: s.amount });
  }
  return [...map.values()].sort((a, b) => a.area.localeCompare(b.area, 'tr'));
}

export function aggregate(state: AppState): MaterialTotal[] {
  const byId = new Map(state.materials.map((m) => [m.id, m]));
  const totals = new Map<string, MaterialTotal>();

  for (const b of state.buildings) {
    if (b.built) continue;
    for (const r of b.requirements) {
      const material = byId.get(r.materialId);
      if (!material) continue;
      const amount = r.amount * b.qty;
      if (amount <= 0) continue;
      let t = totals.get(material.id);
      if (!t) {
        t = { material, total: 0, byArea: [], sources: [] };
        totals.set(material.id, t);
      }
      t.total += amount;
      t.sources.push({ buildingId: b.id, buildingName: b.name, area: b.area, amount });
    }
  }

  const rows = [...totals.values()];
  for (const t of rows) t.byArea = byAreaOf(t.sources);
  return rows.sort(
    (a, b) => b.total - a.total || a.material.name.localeCompare(b.material.name, 'tr'),
  );
}
