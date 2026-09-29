import { normalizeName } from './merge';
import type { AppState, Building } from './types';

export function listAreas(state: AppState): string[] {
  const seen = new Map<string, string>();
  for (const b of state.buildings) {
    const key = normalizeName(b.area);
    if (!seen.has(key)) seen.set(key, b.area);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'tr'));
}

export function groupByArea(buildings: Building[]): { area: string; buildings: Building[] }[] {
  const groups = new Map<string, { area: string; buildings: Building[] }>();
  for (const b of buildings) {
    const key = normalizeName(b.area);
    let g = groups.get(key);
    if (!g) {
      g = { area: b.area, buildings: [] };
      groups.set(key, g);
    }
    g.buildings.push(b);
  }
  return [...groups.values()]
    .sort((a, b) => a.area.localeCompare(b.area, 'tr'))
    .map((g) => ({
      area: g.area,
      buildings: [...g.buildings.filter((b) => !b.built), ...g.buildings.filter((b) => b.built)],
    }));
}
