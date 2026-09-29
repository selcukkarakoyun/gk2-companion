import { normalizeName } from './merge';
import type { AppState } from './types';

export function setQty(state: AppState, buildingId: string, qty: number): AppState {
  if (!Number.isInteger(qty)) return state;
  const next = Math.max(1, qty);
  return {
    ...state,
    buildings: state.buildings.map((b) => (b.id === buildingId ? { ...b, qty: next } : b)),
  };
}

export function toggleBuilt(state: AppState, buildingId: string): AppState {
  return {
    ...state,
    buildings: state.buildings.map((b) => (b.id === buildingId ? { ...b, built: !b.built } : b)),
  };
}

export function deleteBuilding(state: AppState, buildingId: string): AppState {
  return { ...state, buildings: state.buildings.filter((b) => b.id !== buildingId) };
}

export type RenameResult = { ok: true; state: AppState } | { ok: false; error: string };

export function renameMaterial(state: AppState, materialId: string, name: string): RenameResult {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return { ok: false, error: 'Ad boş olamaz.' };
  const norm = normalizeName(trimmed);
  if (state.materials.some((m) => m.id !== materialId && normalizeName(m.name) === norm)) {
    return { ok: false, error: `"${trimmed}" adı başka bir malzemede kullanılıyor.` };
  }
  return {
    ok: true,
    state: {
      ...state,
      materials: state.materials.map((m) => (m.id === materialId ? { ...m, name: trimmed } : m)),
    },
  };
}

export function setMaterialIcon(state: AppState, materialId: string, icon: string | null): AppState {
  return {
    ...state,
    materials: state.materials.map((m) => {
      if (m.id !== materialId) return m;
      const { icon: _old, ...rest } = m;
      return icon ? { ...rest, icon } : rest;
    }),
  };
}
