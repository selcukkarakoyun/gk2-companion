export type Material = { id: string; name: string; description: string };
export type Requirement = { materialId: string; amount: number };
export type Building = {
  id: string;
  name: string;
  qty: number;
  built: boolean;
  requirements: Requirement[];
};
export type AppState = { version: 1; materials: Material[]; buildings: Building[] };
export type Settings = { apiKey: string; model: string };
export type Tab = 'buildings' | 'total' | 'settings';

export type ScannedRequirement = {
  materialId: string | null;
  suggestedName: string | null;
  description: string | null;
  amount: number;
};
export type ScannedBuilding = { name: string; requirements: ScannedRequirement[] };
export type ScanResult = { buildings: ScannedBuilding[] };

export type ReviewNewMaterial = { key: string; name: string; description: string; mapTo: string | null };
export type ReviewRequirement = {
  key: string;
  materialId: string | null;
  newKey: string | null;
  amount: number;
};
export type ReviewBuilding = { key: string; name: string; include: boolean; requirements: ReviewRequirement[] };
export type ReviewDraft = { buildings: ReviewBuilding[]; newMaterials: ReviewNewMaterial[] };
