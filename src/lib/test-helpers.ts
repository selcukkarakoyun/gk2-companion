import type { AppState, Building, Material } from './types';

export const mat = (id: string, name: string, description = ''): Material => ({ id, name, description });

export const bld = (
  id: string,
  name: string,
  reqs: [string, number][],
  extra: Partial<Building> = {},
): Building => ({
  id,
  name,
  qty: 1,
  built: false,
  requirements: reqs.map(([materialId, amount]) => ({ materialId, amount })),
  ...extra,
});

export const st = (materials: Material[] = [], buildings: Building[] = []): AppState => ({
  version: 1,
  materials,
  buildings,
});

export const idGen = (prefix = 'id') => {
  let n = 0;
  return () => `${prefix}${++n}`;
};
