import type { AppState, Material } from './types';

export type MaterialTotal = {
  material: Material;
  total: number;
  sources: { buildingId: string; buildingName: string; amount: number }[];
};

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
        t = { material, total: 0, sources: [] };
        totals.set(material.id, t);
      }
      t.total += amount;
      t.sources.push({ buildingId: b.id, buildingName: b.name, amount });
    }
  }

  return [...totals.values()].sort(
    (a, b) => b.total - a.total || a.material.name.localeCompare(b.material.name, 'tr'),
  );
}
