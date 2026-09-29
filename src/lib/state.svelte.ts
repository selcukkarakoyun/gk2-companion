import { applyDraft } from './merge';
import * as ops from './ops';
import {
  DEFAULT_MODEL,
  emptyState,
  exportState,
  loadSettings,
  loadState,
  saveSettings,
  saveState,
} from './storage';
import type { AppState, ReviewDraft, Settings } from './types';

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

class AppStore {
  state = $state<AppState>(emptyState());
  settings = $state<Settings>({ apiKey: '', model: DEFAULT_MODEL });
  corrupt = $state(false);
  saveFailed = $state(false);
  online = $state(true);

  init(): void {
    const loaded = loadState(localStorage);
    this.state = loaded.state;
    this.corrupt = loaded.corrupt;
    this.settings = loadSettings(localStorage);
    this.online = navigator.onLine;
    window.addEventListener('online', () => (this.online = true));
    window.addEventListener('offline', () => (this.online = false));
  }

  private commit(next: AppState): void {
    this.state = next;
    this.saveFailed = !saveState(localStorage, $state.snapshot(this.state));
  }

  setQty(buildingId: string, qty: number): void {
    this.commit(ops.setQty(this.state, buildingId, qty));
  }

  toggleBuilt(buildingId: string): void {
    this.commit(ops.toggleBuilt(this.state, buildingId));
  }

  deleteBuilding(buildingId: string): void {
    this.commit(ops.deleteBuilding(this.state, buildingId));
  }

  renameMaterial(materialId: string, name: string): string | null {
    const result = ops.renameMaterial(this.state, materialId, name);
    if (!result.ok) return result.error;
    this.commit(result.state);
    return null;
  }

  setMaterialIcon(materialId: string, icon: string | null): void {
    this.commit(ops.setMaterialIcon(this.state, materialId, icon));
  }

  applyScan(draft: ReviewDraft): void {
    this.commit(applyDraft(this.state, draft, newId));
  }

  setSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    saveSettings(localStorage, $state.snapshot(this.settings));
  }

  exportJson(): string {
    return exportState($state.snapshot(this.state));
  }

  replaceState(next: AppState): void {
    this.commit(next);
  }

  dismissCorrupt(): void {
    this.corrupt = false;
  }
}

export const store = new AppStore();
